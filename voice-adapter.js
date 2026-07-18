(function () {
  "use strict";

  const WAKE_WORD = "麦当劳";
  const stateLabel = document.getElementById("voiceState");
  const transcript = document.getElementById("transcript");

  function normalizeSpeechText(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/[，。！？、,!?]/g, "")
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

  function spokenRate(raw) {
    const value = String(raw || "").replace(/倍|速/g, "");
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if (value.includes("点")) {
      const [wholeRaw, decimalRaw = ""] = value.split("点");
      const whole = chineseNumber(wholeRaw || "零");
      const map = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
      const decimal = [...decimalRaw].map((character) => map[character] ?? character).join("");
      if (Number.isFinite(whole) && /^\d+$/.test(decimal)) return Number(`${whole}.${decimal}`);
    }
    return chineseNumber(value);
  }

  function parseCommand(value) {
    const text = normalizeSpeechText(value);
    // Directional commands must be matched before numeric measure commands:
    // “下一小节” and “上一小节” both contain “一小节” and were previously
    // mistaken for “第一小节”.
    if (/下一(个)?(小节|节)|往后(一|1)(个)?(小节|节)/.test(text)) return { type: "next-measure", signature: "next-measure" };
    if (/上一(个)?(小节|节)|往前(一|1)(个)?(小节|节)/.test(text)) return { type: "prev-measure", signature: "prev-measure" };
    const measureMatch = text.match(/第?([零〇一二两三四五六七八九十\d]+)(?:个)?小节/);
    if (measureMatch) {
      const number = chineseNumber(measureMatch[1]);
      return { type: "measure", number, signature: `measure-${number}` };
    }
    const rateMatch = text.match(/伴奏(?:速率|速度|倍率|倍速)([零〇一二两三四五六七八九十点\d.]+)/)
      || text.match(/([零〇一二两三四五六七八九十点\d.]+)倍速伴奏/)
      || text.match(/伴奏([零〇一二两三四五六七八九十点\d.]+)倍速/);
    if (rateMatch) {
      const rate = spokenRate(rateMatch[1]);
      return { type: "backing-rate", rate, signature: `backing-rate-${rate}` };
    }
    const seekMatch = text.match(/(快进|前进|后退|快退)([零〇一二两三四五六七八九十\d]+)秒/);
    if (seekMatch) {
      const seconds = chineseNumber(seekMatch[2]);
      const direction = /快进|前进/.test(seekMatch[1]) ? 1 : -1;
      return { type: "seek-backing", seconds: direction * seconds, signature: `seek-backing-${direction * seconds}` };
    }
    if (/(暂停|停止|关闭|关掉)(一下)?伴奏/.test(text)) return { type: "pause-backing", signature: "pause-backing" };
    if (/(播放|开始|打开)(一下)?伴奏|^伴奏$/.test(text)) return { type: "play-backing", signature: "play-backing" };
    if (/(关闭|关掉|退出)(一下)?(教学)?视频/.test(text)) return { type: "close-video", signature: "close-video" };
    if (/(播放|打开|观看)(一下)?(教学)?视频|^(教学)?视频$/.test(text)) return { type: "play-video", signature: "play-video" };
    if (/下一(页|行)|往后|向后|翻后/.test(text)) return { type: "next", signature: "next" };
    if (/上一(页|行)|往前|向前|翻前/.test(text)) return { type: "prev", signature: "prev" };
    return null;
  }

  function execute(command) {
    const mode = window.DrumPracticeVoice.getMode();
    if (command.type === "play-backing") return window.DrumPracticeVoice.playBacking();
    if (command.type === "pause-backing") return window.DrumPracticeVoice.pauseBacking();
    if (command.type === "backing-rate") return window.DrumPracticeVoice.setBackingRate(command.rate);
    if (command.type === "seek-backing") return window.DrumPracticeVoice.seekBacking(command.seconds);
    if (command.type === "close-video") return window.DrumPracticeVoice.closeVideo();
    if (mode === "arrange") return { ok: false, message: "小节编排界面暂不执行语音指令" };
    if (mode === "full" && ["next", "prev"].includes(command.type)) {
      return { ok: false, message: "完整谱面不执行上一行或下一行" };
    }
    if (command.type === "measure") return window.DrumPracticeVoice.goToMeasure(command.number);
    if (command.type === "next-measure") return window.DrumPracticeVoice.nextMeasure();
    if (command.type === "prev-measure") return window.DrumPracticeVoice.prevMeasure();
    if (command.type === "play-video") return window.DrumPracticeVoice.playVideo();
    if (command.type === "next") return window.DrumPracticeVoice.nextLine();
    return window.DrumPracticeVoice.prevLine();
  }

  function setStatus(message) {
    stateLabel.textContent = message;
  }

  function createWakeGate(options = {}) {
    const activeMs = options.activeMs || 10000;
    let activeUntil = 0;
    let lastSignature = "";
    let lastCommandAt = 0;

    function wake() {
      activeUntil = Date.now() + activeMs;
      lastSignature = "";
      lastCommandAt = 0;
      setStatus("已唤醒，正在连接千问");
    }

    function process(rawText, isFinal = false) {
      const text = normalizeSpeechText(rawText);
      if (!text || Date.now() > activeUntil) return { text, handled: false };
      const command = parseCommand(text);
      if (!command) {
        if (isFinal) setStatus("已听到，但没有匹配到指令");
        return { text, handled: false };
      }
      const now = Date.now();
      if (command.signature === lastSignature && now - lastCommandAt < 1800) {
        return { text, handled: true, duplicate: true };
      }
      lastSignature = command.signature;
      lastCommandAt = now;
      const result = execute(command);
      activeUntil = Date.now() + activeMs;
      if (typeof options.onCommand === "function") options.onCommand(command, result);
      setStatus(result.message);
      return { text, handled: true, command, result };
    }

    function reset() {
      activeUntil = 0;
      lastSignature = "";
      lastCommandAt = 0;
    }

    return { wake, process, reset };
  }

  window.VoicePractice = { normalizeSpeechText, parseCommand, setStatus, createWakeGate };

  window.addEventListener("practice-modechange", (event) => {
    const mode = event.detail?.mode;
    if (mode === "full") transcript.textContent = "完整谱面：支持定位、上下小节、教学视频和伴奏";
    if (mode === "line") transcript.textContent = "按行：支持上下行、上下小节、教学视频和伴奏";
    if (mode === "arrange") transcript.textContent = "小节编排：仍可控制伴奏，其他语音指令暂不执行";
  });
})();
