(function () {
  "use strict";

  const button = document.getElementById("listenButton");
  const label = document.getElementById("listenLabel");
  const transcript = document.getElementById("transcript");
  const gate = VoicePractice.createWakeGate({ wakeWord: "小鼓", activeMs: 15000, closeMs: 20000 });
  let socket = null;
  let stream = null;
  let audioContext = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let active = false;
  let sessionReady = false;

  function eventId() {
    return `event_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) {
      binary += String.fromCharCode(...bytes.subarray(index, index + step));
    }
    return btoa(binary);
  }

  function resampleToPcm16(input, inputRate) {
    const ratio = inputRate / 16000;
    const outputLength = Math.max(1, Math.floor(input.length / ratio));
    const output = new Int16Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const start = Math.floor(index * ratio);
      const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
      let sum = 0;
      for (let sample = start; sample < end && sample < input.length; sample += 1) sum += input[sample];
      const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      output[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
    }
    return new Uint8Array(output.buffer);
  }

  function sendSessionUpdate() {
    socket.send(JSON.stringify({
      event_id: eventId(),
      type: "session.update",
      session: {
        input_audio_format: "pcm",
        sample_rate: 16000,
        input_audio_transcription: {
          language: "zh",
          corpus: {
            text: "小鼓。小节。下一行。上一行。下一页。上一页。小鼓下一行。小鼓上一行。第一个小节。第十小节。第四十六小节。"
          }
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.0,
          silence_duration_ms: 320
        }
      }
    }));
  }

  function handleServerEvent(event) {
    if (event.type === "session.created") {
      sendSessionUpdate();
      return;
    }
    if (event.type === "session.updated") {
      sessionReady = true;
      transcript.textContent = "实时监听中，请先说“小鼓”…";
      VoicePractice.setStatus("千问实时流已连接，等待“小鼓”", true, "success");
      return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      transcript.textContent = "听到声音，正在实时识别…";
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.text") {
      const text = event.text || event.transcript || "";
      if (text) {
        const corrected = VoicePractice.normalizeSpeechText(text);
        transcript.textContent = corrected;
        gate.process(corrected, false);
      }
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const text = event.transcript || event.text || "";
      const corrected = VoicePractice.normalizeSpeechText(text);
      transcript.textContent = corrected || "（没有识别到文字）";
      if (corrected) gate.process(corrected, true);
      return;
    }
    if (event.type === "proxy.error" || event.type === "error") {
      const message = event.message || event.error?.message || "千问实时识别发生错误";
      VoicePractice.setStatus(message, false, "error");
    }
  }

  async function startAudio() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (!active || !sessionReady || !socket || socket.readyState !== WebSocket.OPEN) return;
      const floatSamples = event.inputBuffer.getChannelData(0);
      const pcm = resampleToPcm16(floatSamples, audioContext.sampleRate);
      socket.send(JSON.stringify({ event_id: eventId(), type: "input_audio_buffer.append", audio: bytesToBase64(pcm) }));
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }

  async function start() {
    try {
      const health = await fetch("/api/health").then((response) => response.json());
      if (!health.ready) throw new Error(health.error || "本地服务未找到 API Key");
      await startAudio();
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}/ws/realtime`);
      socket.onmessage = (message) => {
        try { handleServerEvent(JSON.parse(message.data)); } catch (_) { /* 忽略非 JSON 消息。 */ }
      };
      socket.onerror = () => VoicePractice.setStatus("千问实时连接失败", false, "error");
      socket.onclose = () => {
        sessionReady = false;
        if (active) VoicePractice.setStatus("实时连接已断开，请停止后重试", false, "error");
      };
      active = true;
      sync();
      transcript.textContent = "正在连接千问实时模型…";
      VoicePractice.setStatus("正在建立实时语音流", true, "success");
    } catch (error) {
      stop();
      VoicePractice.setStatus(error.message || "无法启动实时识别", false, "error");
    }
  }

  function stop() {
    active = false;
    sessionReady = false;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event_id: eventId(), type: "session.finish" }));
      setTimeout(() => socket?.close(), 180);
    } else if (socket) socket.close();
    socket = null;
    if (processor) processor.disconnect();
    if (source) source.disconnect();
    if (silentGain) silentGain.disconnect();
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== "closed") audioContext.close();
    stream = null;
    audioContext = null;
    processor = null;
    source = null;
    silentGain = null;
    sync();
  }

  function sync() {
    button.classList.toggle("listening", active);
    label.textContent = active ? "停止监听" : "开始监听";
  }

  button.addEventListener("click", () => {
    if (active) {
      stop();
      VoicePractice.setStatus("监听已停止", false, "");
    } else start();
  });
})();
