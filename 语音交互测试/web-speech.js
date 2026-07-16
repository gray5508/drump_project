(function () {
  "use strict";

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.getElementById("listenButton");
  const label = document.getElementById("listenLabel");
  const transcript = document.getElementById("transcript");
  const gate = VoicePractice.createWakeGate({ wakeWord: "小鼓", activeMs: 15000, closeMs: 20000 });
  let recognition = null;
  let active = false;
  let restarting = false;

  if (!Recognition) {
    button.disabled = true;
    label.textContent = "当前浏览器不支持";
    VoicePractice.setStatus("请使用最新版 Chrome、Edge 或 Safari 打开", false, "error");
    return;
  }

  recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const candidates = Array.from(result).map((item) => item.transcript.trim()).filter(Boolean);
      const text = candidates[0] || "";
      if (result.isFinal) {
        const corrected = VoicePractice.normalizeSpeechText(text);
        transcript.textContent = corrected || "（没有识别到文字）";
        gate.process(corrected, true);
      } else {
        interim += text;
        // 唤醒词、上一页和下一页在中间结果稳定出现时即可执行，减少等待最终断句的延迟。
        gate.process(text, false);
      }
    }
    if (interim) transcript.textContent = VoicePractice.normalizeSpeechText(interim);
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      active = false;
      sync();
      VoicePractice.setStatus("麦克风权限被拒绝", false, "error");
    } else if (event.error !== "no-speech" && event.error !== "aborted") {
      VoicePractice.setStatus(`识别异常：${event.error}`, false, "error");
    }
  };

  recognition.onend = () => {
    if (active && !restarting) {
      restarting = true;
      setTimeout(() => {
        restarting = false;
        try { recognition.start(); } catch (_) { /* 浏览器仍在释放上一轮。 */ }
      }, 180);
    }
  };

  function sync() {
    button.classList.toggle("listening", active);
    label.textContent = active ? "停止监听" : "开始监听";
  }

  button.addEventListener("click", () => {
    active = !active;
    sync();
    if (active) {
      transcript.textContent = "正在听，请先说“小鼓”…";
      VoicePractice.setStatus("监听中，等待唤醒词“小鼓”", true, "success");
      try { recognition.start(); } catch (_) { /* 已经处于监听状态。 */ }
    } else {
      recognition.stop();
      VoicePractice.setStatus("监听已停止", false, "");
    }
  });
})();
