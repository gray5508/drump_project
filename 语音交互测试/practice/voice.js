(function () {
  "use strict";

  const PROXY_ORIGIN = "https://drump-qrealtime-cxfvcbehsz.cn-beijing.fcapp.run";
  const WAKE_WORD = "麦当劳";
  const WAKE_ALIASES = ["麦当劳"];
  const ACTIVE_MS = 10000;
  const CLOSE_MS = 10000;
  const STARTUP_TIMEOUT_MS = 12000;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const practice = window.DrumPracticeVoice;
  const button = document.getElementById("voiceListenButton");
  const buttonLabel = document.getElementById("voiceListenLabel");
  const stateLabel = document.getElementById("voiceState");
  const transcript = document.getElementById("voiceTranscript");

  let listening = false;
  let phase = "idle";
  let recognition = null;
  let recognitionRestartTimer = null;
  let cloudWindowTimer = null;
  let cloudStartupTimer = null;
  let commandActiveUntil = 0;
  let phraseBoostDisabled = false;
  let cloudEpoch = 0;
  let sessionReady = false;
  let socket = null;
  let stream = null;
  let audioContext = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let lastCommandSignature = "";
  let lastCommandAt = 0;

  function eventId() {
    return `event_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function setVoiceState(message, recognizedText) {
    stateLabel.textContent = message;
    if (recognizedText !== undefined) transcript.textContent = recognizedText;
  }

  function syncButton() {
    button.classList.toggle("listening", listening);
    buttonLabel.textContent = listening ? "停止监听" : "开始监听";
  }

  function resetCommandState() {
    commandActiveUntil = 0;
    lastCommandSignature = "";
    lastCommandAt = 0;
  }

  function normalizeSpeechText(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/[，。！？、,.!?]/g, "")
      .replace(/买当劳|麦当牢|买当牢/g, WAKE_WORD);
  }

  function chineseNumber(raw) {
    const cleaned = raw.replace(/[第小节页行个\s，。,.]/g, "");
    const digit = cleaned.match(/\d{1,3}/);
    if (digit) return Number(digit[0]);
    const map = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (cleaned === "十") return 10;
    if (cleaned.includes("十")) {
      const [left, right] = cleaned.split("十");
      return (left ? map[left] : 1) * 10 + (right ? map[right] : 0);
    }
    return map[cleaned] ?? Number.NaN;
  }

  function parseCommand(value) {
    const text = normalizeSpeechText(value);
    const measureMatch = text.match(/第?([零〇一二两三四五六七八九十\d]+)(?:个)?小节/);
    if (measureMatch) {
      const number = chineseNumber(measureMatch[1]);
      return { type: "measure", number, signature: `measure-${number}` };
    }
    if (/下一(页|行)|往后|向后|翻后/.test(text)) return { type: "next", signature: "next" };
    if (/上一(页|行)|往前|向前|翻前/.test(text)) return { type: "prev", signature: "prev" };
    return null;
  }

  function executeCommand(text) {
    const command = parseCommand(text);
    if (!command) {
      setVoiceState("没有匹配到指令", text || "未识别到文字");
      return;
    }
    if (Date.now() > commandActiveUntil) {
      setVoiceState("指令窗口已过期，等待重新唤醒", text);
      return;
    }
    const now = Date.now();
    if (command.signature === lastCommandSignature && now - lastCommandAt < 1800) return;
    lastCommandSignature = command.signature;
    lastCommandAt = now;

    const mode = practice.getMode();
    let result;
    if (mode === "arrange") {
      result = { ok: false, message: "小节编排界面暂不执行语音指令" };
    } else if (mode === "full" && command.type !== "measure") {
      result = { ok: false, message: "默认谱面只支持“第 xx 小节”" };
    } else if (command.type === "measure") {
      result = practice.goToMeasure(command.number);
    } else if (command.type === "next") {
      result = practice.nextLine();
    } else {
      result = practice.prevLine();
    }
    setVoiceState(result.message, text);
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
      const end = Math.min(input.length, Math.floor((index + 1) * ratio));
      let total = 0;
      for (let cursor = start; cursor < end; cursor += 1) total += input[cursor];
      const sample = Math.max(-1, Math.min(1, total / Math.max(1, end - start)));
      output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return new Uint8Array(output.buffer);
  }

  function sendSessionUpdate(currentSocket) {
    currentSocket.send(JSON.stringify({
      event_id: eventId(),
      type: "session.update",
      session: {
        modalities: ["text"],
        input_audio_format: "pcm16",
        sample_rate: 16000,
        input_audio_transcription: {
          language: "zh",
          corpus: { text: "小节。下一行。上一行。下一页。上一页。第一个小节。第十小节。第四十八小节。" }
        },
        turn_detection: { type: "server_vad", threshold: 0.0, silence_duration_ms: 320 }
      }
    }));
  }

  function handleServerEvent(event, currentSocket) {
    if (event.type === "session.created") {
      sendSessionUpdate(currentSocket);
      return;
    }
    if (event.type === "session.updated") {
      sessionReady = true;
      clearTimeout(cloudStartupTimer);
      cloudStartupTimer = null;
      resetCommandState();
      commandActiveUntil = Date.now() + ACTIVE_MS;
      clearTimeout(cloudWindowTimer);
      cloudWindowTimer = setTimeout(() => resumeWakeMode("10秒结束并已清空，重新等待麦当劳"), CLOSE_MS);
      setVoiceState("千问已连接，请说指令", "10 秒指令窗口已开始");
      return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      setVoiceState("正在识别指令", "听到声音…");
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.text") {
      const text = normalizeSpeechText(event.text || event.transcript || "");
      if (text) transcript.textContent = text;
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const text = normalizeSpeechText(event.transcript || event.text || "");
      executeCommand(text);
      return;
    }
    if (event.type === "proxy.error" || event.type === "error") {
      setVoiceState(event.message || event.error?.message || "千问实时识别发生错误");
    }
  }

  function stopWakeRecognition() {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
    const current = recognition;
    recognition = null;
    if (!current) return;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try { current.abort(); } catch (_) { /* 已停止。 */ }
  }

  function scheduleWakeRestart() {
    clearTimeout(recognitionRestartTimer);
    if (!listening || phase !== "wake") return;
    recognitionRestartTimer = setTimeout(startWakeRecognition, 350);
  }

  function startWakeRecognition() {
    if (!listening || phase !== "wake" || recognition) return;
    if (!SpeechRecognition) {
      stopAll();
      setVoiceState("当前浏览器不支持 Web Speech");
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
        current.phrases = WAKE_ALIASES.map((phrase) => new window.SpeechRecognitionPhrase(phrase, 7));
        phraseBoostEnabled = true;
      } catch (_) { /* 自动使用普通识别。 */ }
    }
    current.onresult = (event) => {
      const candidates = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        for (let alternative = 0; alternative < event.results[index].length; alternative += 1) {
          const value = normalizeSpeechText(event.results[index][alternative]?.transcript || "");
          if (value) candidates.push(value);
        }
      }
      if (candidates[0]) transcript.textContent = candidates[0];
      const woke = candidates.some((value) => WAKE_ALIASES.some((phrase) => value.includes(phrase)));
      if (!woke || !listening || phase !== "wake") return;
      phase = "cloud";
      resetCommandState();
      stopWakeRecognition();
      setVoiceState("已唤醒，正在连接千问", `${WAKE_WORD}已识别`);
      if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
      clearTimeout(cloudStartupTimer);
      cloudStartupTimer = setTimeout(() => resumeWakeMode("连接超时并已清空，重新等待麦当劳", "千问未能在12秒内启动"), STARTUP_TIMEOUT_MS);
      startCloudRecognition();
    };
    current.onerror = (event) => {
      if (event.error === "phrases-not-supported") {
        phraseBoostDisabled = true;
        if (recognition === current) recognition = null;
        current.onresult = null;
        current.onerror = null;
        current.onend = null;
        try { current.abort(); } catch (_) { /* 已结束。 */ }
        setVoiceState("热词接口不可用，已切换普通唤醒");
        scheduleWakeRestart();
      } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopAll();
        setVoiceState("麦克风或语音识别权限被拒绝");
      } else if (!["aborted", "no-speech"].includes(event.error)) {
        setVoiceState(`Web Speech 暂时不可用：${event.error}`);
      }
    };
    current.onend = () => {
      if (recognition === current) recognition = null;
      scheduleWakeRestart();
    };
    try {
      current.start();
      setVoiceState(
        phraseBoostEnabled ? `等待“${WAKE_WORD}”（热词增强）` : `等待“${WAKE_WORD}”`,
        "尚未连接千问"
      );
    } catch (_) {
      if (recognition === current) recognition = null;
      scheduleWakeRestart();
    }
  }

  async function startAudio(epoch) {
    const currentStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    if (epoch !== cloudEpoch || !listening || phase !== "cloud") {
      currentStream.getTracks().forEach((track) => track.stop());
      return false;
    }
    stream = currentStream;
    audioContext = new AudioContextClass();
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (epoch !== cloudEpoch || !listening || phase !== "cloud" || !sessionReady || socket?.readyState !== WebSocket.OPEN) return;
      const pcm = resampleToPcm16(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
      socket.send(JSON.stringify({ event_id: eventId(), type: "input_audio_buffer.append", audio: bytesToBase64(pcm) }));
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
    return true;
  }

  async function startAudioWithRetry(epoch) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (epoch !== cloudEpoch || !listening || phase !== "cloud") return false;
      try {
        setVoiceState("正在切换麦克风", `录音接管 ${attempt}/3`);
        return await startAudio(epoch);
      } catch (error) {
        lastError = error;
        if (["NotAllowedError", "SecurityError"].includes(error?.name)) break;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
    const reason = lastError?.name ? `${lastError.name}：${lastError.message || "录音启动失败"}` : "录音启动失败";
    throw new Error(reason);
  }

  async function startCloudRecognition() {
    const epoch = ++cloudEpoch;
    try {
      await new Promise((resolve) => setTimeout(resolve, 220));
      const health = await fetch(`${PROXY_ORIGIN}/health`, { cache: "no-store" }).then((response) => response.json());
      if (!health.ready) throw new Error(health.error || "北京语音代理尚未就绪");
      if (epoch !== cloudEpoch || !listening || phase !== "cloud") return;
      if (!await startAudioWithRetry(epoch)) return;
      if (epoch !== cloudEpoch || !listening || phase !== "cloud") return;

      const socketUrl = new URL("/ws/realtime", PROXY_ORIGIN);
      socketUrl.protocol = "wss:";
      const currentSocket = new WebSocket(socketUrl.toString());
      socket = currentSocket;
      currentSocket.onmessage = (message) => {
        if (epoch !== cloudEpoch || socket !== currentSocket || phase !== "cloud") return;
        try { handleServerEvent(JSON.parse(message.data), currentSocket); } catch (_) { /* 忽略非 JSON 消息。 */ }
      };
      currentSocket.onerror = () => {
        if (epoch === cloudEpoch) setVoiceState("千问连接失败，将返回唤醒待机");
      };
      currentSocket.onclose = (event) => {
        if (epoch !== cloudEpoch || socket !== currentSocket) return;
        socket = null;
        sessionReady = false;
        if (listening && phase === "cloud") {
          resumeWakeMode("连接提前结束并已清空，重新等待麦当劳", `WebSocket 关闭代码：${event.code}`);
        }
      };
    } catch (error) {
      if (epoch !== cloudEpoch) return;
      if (listening) resumeWakeMode("启动失败并已清空，重新等待麦当劳", error.message || "无法启动千问实时识别");
    }
  }

  function closeCloudResources() {
    cloudEpoch += 1;
    sessionReady = false;
    resetCommandState();
    const currentSocket = socket;
    socket = null;
    if (currentSocket) {
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
    }
    if (currentSocket?.readyState === WebSocket.OPEN) {
      currentSocket.send(JSON.stringify({ event_id: eventId(), type: "session.finish" }));
      setTimeout(() => currentSocket.close(), 180);
    } else if (currentSocket) {
      currentSocket.close();
    }
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
    source = null;
    processor = null;
    silentGain = null;
  }

  function resumeWakeMode(message, detail = "上一轮指令已清空") {
    clearTimeout(cloudWindowTimer);
    cloudWindowTimer = null;
    clearTimeout(cloudStartupTimer);
    cloudStartupTimer = null;
    closeCloudResources();
    if (!listening) return;
    phase = "wake";
    setVoiceState(message, detail);
    scheduleWakeRestart();
  }

  function start() {
    if (!SpeechRecognition || !AudioContextClass) {
      setVoiceState("当前浏览器不支持所需语音接口");
      return;
    }
    resetCommandState();
    listening = true;
    phase = "wake";
    syncButton();
    startWakeRecognition();
  }

  function stopAll() {
    listening = false;
    phase = "idle";
    clearTimeout(cloudWindowTimer);
    cloudWindowTimer = null;
    clearTimeout(cloudStartupTimer);
    cloudStartupTimer = null;
    stopWakeRecognition();
    closeCloudResources();
    syncButton();
  }

  button.addEventListener("click", () => {
    if (listening) {
      stopAll();
      setVoiceState("监听已停止并清空", `唤醒词：${WAKE_WORD}`);
    } else {
      start();
    }
  });

  window.addEventListener("practice-modechange", (event) => {
    if (!listening || phase !== "wake") return;
    const mode = event.detail?.mode;
    if (mode === "full") transcript.textContent = "默认谱面：仅支持第 xx 小节";
    if (mode === "line") transcript.textContent = "按行：支持上一行、下一行和第 xx 小节";
    if (mode === "arrange") transcript.textContent = "小节编排：暂不执行语音指令";
  });
  window.addEventListener("pagehide", stopAll, { once: true });
})();
