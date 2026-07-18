(function () {
  "use strict";

  const PROXY_ORIGIN = "https://drump-qrealtime-cxfvcbehsz.cn-beijing.fcapp.run";
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const WAKE_ALIASES = ["麦当劳"];
  const button = document.getElementById("listenButton");
  const label = document.getElementById("listenLabel");
  const transcript = document.getElementById("transcript");
  const voiceActivity = document.getElementById("voiceActivity");
  const voiceActivityText = document.getElementById("voiceActivityText");
  const voiceRecognitionResult = document.getElementById("voiceRecognitionResult");
  const gate = VoicePractice.createWakeGate({ wakeWord: "麦当劳", activeMs: 10000, onCommand: handleCommandTriggered });
  let socket = null;
  let stream = null;
  let audioContext = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let recognition = null;
  let recognitionRestartTimer = null;
  let cloudWindowTimer = null;
  let cloudConnectTimer = null;
  let listening = false;
  let phase = "idle";
  let sessionReady = false;
  let cloudAttempt = 0;
  let phraseBoostDisabled = false;
  let recognitionResultTimer = null;

  function hideVoiceRecognitionResult() {
    clearTimeout(recognitionResultTimer);
    recognitionResultTimer = null;
    if (voiceRecognitionResult) voiceRecognitionResult.classList.remove("show");
  }

  function showVoiceRecognitionResult(text) {
    const postWakeText = String(text || "").replace(/麦当劳/g, "").trim();
    if (!postWakeText || !voiceRecognitionResult) return;
    clearTimeout(recognitionResultTimer);
    voiceRecognitionResult.textContent = postWakeText;
    voiceRecognitionResult.classList.remove("show");
    void voiceRecognitionResult.offsetWidth;
    voiceRecognitionResult.classList.add("show");
    recognitionResultTimer = setTimeout(hideVoiceRecognitionResult, 1800);
  }

  function setVoiceActivity(active, message = "可以说语音指令") {
    if (!voiceActivity) return;
    voiceActivity.classList.toggle("active", active);
    voiceActivity.setAttribute("aria-hidden", String(!active));
    if (voiceActivityText && message) voiceActivityText.textContent = message;
    if (!active) {
      voiceActivity.classList.remove("renewed");
      hideVoiceRecognitionResult();
    }
  }

  function pulseVoiceActivity() {
    if (!voiceActivity) return;
    voiceActivity.classList.remove("renewed");
    void voiceActivity.offsetWidth;
    voiceActivity.classList.add("renewed");
  }

  function armCommandWindow() {
    clearTimeout(cloudWindowTimer);
    cloudWindowTimer = setTimeout(() => resumeWakeMode("10秒指令窗口已结束，重新等待“麦当劳”"), 10000);
  }

  function handleCommandTriggered() {
    if (!listening || phase !== "cloud" || !sessionReady) return;
    armCommandWindow();
    if (voiceActivityText) voiceActivityText.textContent = "指令已执行 · 继续聆听 10 秒";
    pulseVoiceActivity();
  }

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
            text: "小节。下一小节。下一节。上一小节。上一节。下一行。上一行。播放视频。播放教学视频。视频。关闭视频。关闭教学视频。播放伴奏。开始伴奏。暂停伴奏。关闭伴奏。伴奏速率零点八。伴奏倍率零点八。伴奏倍速零点八。伴奏速率一点二。伴奏倍率一点二。伴奏倍速一点二。零点八倍速伴奏。一点二倍速伴奏。快进十秒。快进二十秒。后退五秒。后退十秒。第一个小节。第十小节。第四十六小节。"
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
      gate.wake();
      clearTimeout(cloudConnectTimer);
      cloudConnectTimer = null;
      armCommandWindow();
      setVoiceActivity(true, "可以说语音指令 · 10 秒");
      transcript.textContent = "千问已接管，请说练习指令…";
      VoicePractice.setStatus("千问实时识别已连接，本次窗口将在10秒后关闭", true, "success");
      return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      transcript.textContent = "听到指令，正在实时识别…";
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
      if (corrected) {
        showVoiceRecognitionResult(corrected);
        gate.process(corrected, true);
      }
      return;
    }
    if (event.type === "proxy.error" || event.type === "error") {
      const message = event.message || event.error?.message || "千问实时识别发生错误";
      VoicePractice.setStatus(message, false, "error");
    }
  }

  function stopWakeRecognition() {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
    const current = recognition;
    recognition = null;
    if (current) {
      current.onend = null;
      current.onresult = null;
      current.onerror = null;
      try { current.abort(); } catch (_) { /* 已停止。 */ }
    }
  }

  function scheduleWakeRestart() {
    clearTimeout(recognitionRestartTimer);
    if (!listening || phase !== "wake") return;
    recognitionRestartTimer = setTimeout(startWakeRecognition, 350);
  }

  function startWakeRecognition() {
    if (!listening || phase !== "wake") return;
    if (recognition) return;
    if (!SpeechRecognition) {
      stopAll();
      VoicePractice.setStatus("当前浏览器不支持 Web Speech 唤醒，请换用 Chrome 或 Edge 测试", false, "error");
      return;
    }

    const current = new SpeechRecognition();
    recognition = current;
    current.lang = "zh-CN";
    current.continuous = true;
    current.interimResults = true;
    current.maxAlternatives = 3;
    let phraseBoostEnabled = false;
    if (!phraseBoostDisabled && "phrases" in current && typeof window.SpeechRecognitionPhrase === "function") {
      try {
        current.phrases = WAKE_ALIASES.map((phrase) => new window.SpeechRecognitionPhrase(phrase, 7.0));
        phraseBoostEnabled = true;
      } catch (_) { /* 当前实现不接受上下文短语时自动退回普通识别。 */ }
    }
    current.onresult = (event) => {
      const candidates = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        for (let alternative = 0; alternative < event.results[index].length; alternative += 1) {
          const value = VoicePractice.normalizeSpeechText(event.results[index][alternative]?.transcript || "");
          if (value) candidates.push(value);
        }
      }
      const corrected = candidates[0] || "";
      if (!corrected) return;
      transcript.textContent = corrected;
      const heardWakeWord = candidates.some((value) => WAKE_ALIASES.some((phrase) => value.includes(phrase)));
      if (heardWakeWord && listening && phase === "wake") {
        phase = "cloud";
        gate.wake();
        stopWakeRecognition();
        transcript.textContent = "麦当劳已唤醒，正在连接千问…";
        VoicePractice.setStatus("已唤醒，正在切换到千问实时识别", true, "success");
        setVoiceActivity(true, "已唤醒 · 正在连接语音识别");
        if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
        clearTimeout(cloudConnectTimer);
        cloudConnectTimer = setTimeout(() => resumeWakeMode("千问连接超时，已返回“麦当劳”唤醒待机"), 15000);
        startCloudRecognition();
      }
    };
    current.onerror = (event) => {
      if (event.error === "phrases-not-supported") {
        phraseBoostDisabled = true;
        transcript.textContent = "当前电脑浏览器不支持热词接口，正在切换普通唤醒…";
        VoicePractice.setStatus("热词增强不可用，已自动切换普通 Web Speech", true, "success");
        if (recognition === current) recognition = null;
        current.onend = null;
        try { current.abort(); } catch (_) { /* 已由浏览器结束。 */ }
        scheduleWakeRestart();
      } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopAll();
        VoicePractice.setStatus("麦克风或语音识别权限被拒绝", false, "error");
      } else if (!['aborted', 'no-speech'].includes(event.error)) {
        VoicePractice.setStatus(`Web Speech 唤醒暂时不可用：${event.error}`, false, "error");
      }
    };
    current.onend = () => {
      if (recognition === current) recognition = null;
      scheduleWakeRestart();
    };
    try {
      current.start();
      transcript.textContent = "浏览器正在等待“麦当劳”…";
      VoicePractice.setStatus(
        phraseBoostEnabled
          ? "Web Speech 正在等待“麦当劳”（已启用热词增强），尚未连接"
          : "Web Speech 正在等待“麦当劳”（当前浏览器无热词接口），尚未连接",
        true,
        "success"
      );
    } catch (_) {
      scheduleWakeRestart();
    }
  }

  async function startAudio(attempt) {
    const currentStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    if (attempt !== cloudAttempt || !listening || phase !== "cloud") {
      currentStream.getTracks().forEach((track) => track.stop());
      return false;
    }
    stream = currentStream;
    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (!listening || phase !== "cloud" || !sessionReady || !socket || socket.readyState !== WebSocket.OPEN) return;
      const floatSamples = event.inputBuffer.getChannelData(0);
      const pcm = resampleToPcm16(floatSamples, audioContext.sampleRate);
      socket.send(JSON.stringify({ event_id: eventId(), type: "input_audio_buffer.append", audio: bytesToBase64(pcm) }));
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
    return true;
  }

  async function startCloudRecognition() {
    const attempt = ++cloudAttempt;
    try {
      await new Promise((resolve) => setTimeout(resolve, 220));
      const health = await fetch(`${PROXY_ORIGIN}/health`, { cache: "no-store" }).then((response) => response.json());
      if (!health.ready) throw new Error(health.error || "北京语音代理尚未就绪");
      if (attempt !== cloudAttempt || !listening || phase !== "cloud") return;
      const audioStarted = await startAudio(attempt);
      if (!audioStarted || attempt !== cloudAttempt || !listening || phase !== "cloud") return;
      const socketUrl = new URL("/ws/realtime", PROXY_ORIGIN);
      socketUrl.protocol = "wss:";
      const currentSocket = new WebSocket(socketUrl.toString());
      socket = currentSocket;
      currentSocket.onmessage = (message) => {
        if (attempt !== cloudAttempt || socket !== currentSocket || phase !== "cloud") return;
        try { handleServerEvent(JSON.parse(message.data)); } catch (_) { /* 忽略非 JSON 消息。 */ }
      };
      currentSocket.onerror = () => {
        VoicePractice.setStatus("千问实时连接失败，将返回唤醒待机", false, "error");
      };
      currentSocket.onclose = () => {
        sessionReady = false;
        if (socket === currentSocket) socket = null;
        if (listening && phase === "cloud") resumeWakeMode("千问连接已结束，重新等待“麦当劳”");
      };
    } catch (error) {
      if (attempt !== cloudAttempt) return;
      VoicePractice.setStatus(error.message || "无法启动千问实时识别", false, "error");
      if (listening) resumeWakeMode("连接失败，已返回“麦当劳”唤醒待机");
    }
  }

  function closeCloudResources() {
    cloudAttempt += 1;
    sessionReady = false;
    const currentSocket = socket;
    socket = null;
    if (currentSocket) {
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
    }
    if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
      currentSocket.send(JSON.stringify({ event_id: eventId(), type: "session.finish" }));
      setTimeout(() => currentSocket.close(), 180);
    } else if (currentSocket) currentSocket.close();
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }
    if (source) source.disconnect();
    if (silentGain) silentGain.disconnect();
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== "closed") audioContext.close();
    stream = null;
    audioContext = null;
    processor = null;
    source = null;
    silentGain = null;
  }

  function resumeWakeMode(message) {
    clearTimeout(cloudWindowTimer);
    cloudWindowTimer = null;
    clearTimeout(cloudConnectTimer);
    cloudConnectTimer = null;
    closeCloudResources();
    gate.reset();
    setVoiceActivity(false);
    if (!listening) return;
    phase = "wake";
    sync();
    transcript.textContent = "浏览器正在等待“麦当劳”…";
    VoicePractice.setStatus(message, true, "success");
    scheduleWakeRestart();
  }

  function start() {
    if (!SpeechRecognition) {
      VoicePractice.setStatus("当前浏览器不支持 Web Speech 唤醒，请换用 Chrome 或 Edge 测试", false, "error");
      return;
    }
    listening = true;
    phase = "wake";
    gate.reset();
    setVoiceActivity(false);
    sync();
    startWakeRecognition();
  }

  function stopAll() {
    listening = false;
    phase = "idle";
    clearTimeout(cloudWindowTimer);
    cloudWindowTimer = null;
    clearTimeout(cloudConnectTimer);
    cloudConnectTimer = null;
    stopWakeRecognition();
    closeCloudResources();
    gate.reset();
    setVoiceActivity(false);
    transcript.textContent = "等待开始…";
    sync();
  }

  function sync() {
    button.classList.toggle("listening", listening);
    label.textContent = listening ? "停止监听" : "开始监听";
  }

  button.addEventListener("click", () => {
    if (listening) {
      stopAll();
      VoicePractice.setStatus("监听已停止", false, "");
    } else start();
  });
  window.addEventListener("pagehide", stopAll, { once: true });
})();
