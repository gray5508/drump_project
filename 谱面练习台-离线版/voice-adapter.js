(function () {
  "use strict";

  const WAKE_WORD = "麦当劳";
  const stateLabel = document.getElementById("voiceState");
  const transcript = document.getElementById("transcript");
  const MODE_ALIASES = new Map([
    ["完整谱面", "full"], ["完整", "full"], ["默认", "full"], ["默认谱面", "full"], ["总谱", "full"],
    ["按行练习", "line"], ["按行", "line"], ["行练习", "line"], ["单行练习", "line"], ["一行一行练习", "line"],
    ["小节编排", "arrange"], ["小节排列", "arrange"], ["编排", "arrange"], ["选中小节练习", "arrange"]
  ]);
  const COMMAND_ALIASES = new Map([
    ["下一小节", "next-measure"], ["下一节", "next-measure"], ["下一个小节", "next-measure"], ["下一个", "next-measure"],
    ["下一个视频", "next-measure"], ["下一视频", "next-measure"], ["下一片段", "next-measure"], ["下一个片段", "next-measure"],
    ["上一小节", "prev-measure"], ["上一节", "prev-measure"], ["上一个小节", "prev-measure"], ["上一个", "prev-measure"],
    ["上一个视频", "prev-measure"], ["上一视频", "prev-measure"], ["上一片段", "prev-measure"], ["上一个片段", "prev-measure"],
    ["下一行", "next"], ["下一页", "next"], ["往后翻", "next"], ["向后翻", "next"],
    ["上一行", "prev"], ["上一页", "prev"], ["往前翻", "prev"], ["向前翻", "prev"],
    ["暂停伴奏", "pause-backing"], ["停止伴奏", "pause-backing"], ["关闭伴奏", "pause-backing"], ["关掉伴奏", "pause-backing"],
    ["播放伴奏", "play-backing"], ["开始伴奏", "play-backing"], ["打开伴奏", "play-backing"], ["继续伴奏", "play-backing"], ["伴奏", "play-backing"],
    ["暂停视频", "pause-video"], ["视频暂停", "pause-video"], ["停止视频", "pause-video"], ["暂停播放", "pause-video"], ["停止播放", "pause-video"], ["暂停", "pause-video"],
    ["关闭视频", "close-video"], ["关掉视频", "close-video"], ["退出视频", "close-video"], ["关闭教学视频", "close-video"],
    ["播放视频", "play-video"], ["打开视频", "play-video"], ["观看视频", "play-video"], ["播放教学视频", "play-video"], ["继续播放", "play-video"], ["恢复播放", "play-video"], ["继续视频", "play-video"], ["恢复视频", "play-video"], ["视频", "play-video"], ["教学视频", "play-video"], ["播放", "play-video"]
  ]);
  const COMMAND_PATTERNS = [
    { type: "next-measure", pattern: /^(?:切到|切换到?|往后)(?:下一|下一个|一个|一|1个|1)(?:小节|节|视频|片段)$/ },
    { type: "next-measure", pattern: /^(?:切到|切换到?)下一个$/ },
    { type: "prev-measure", pattern: /^(?:切到|切换到?|往前)(?:上一|上一个|一个|一|1个|1)(?:小节|节|视频|片段)$/ },
    { type: "prev-measure", pattern: /^(?:切到|切换到?)上一个$/ },
    { type: "next", pattern: /^(?:翻到?|切到|切换到?)(?:下一行|下一页)$/ },
    { type: "prev", pattern: /^(?:翻到?|切到|切换到?)(?:上一行|上一页)$/ }
  ];

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

  function commandKey(value) {
    return normalizeSpeechText(value)
      .replaceAll(WAKE_WORD, "")
      .replace(/^(?:(?:请帮我|麻烦帮我|帮我|麻烦|请))+/, "")
      .replace(/一下/g, "");
  }

  function parseModeCommand(text) {
    const key = text
      .replace(/^(?:切换到?|切到|打开|进入|返回到?|返回|回到)/, "")
      .replace(/(?:界面|页面|模式)$/, "");
    const mode = MODE_ALIASES.get(key);
    return mode ? { type: "switch-mode", mode, signature: `switch-mode-${mode}` } : null;
  }

  function parseRateCommand(text) {
    const match = text.match(/伴奏(?:速率|速度|倍率|倍速)([零〇一二两三四五六七八九十点\d.]+)/)
      || text.match(/([零〇一二两三四五六七八九十点\d.]+)倍速伴奏/)
      || text.match(/伴奏([零〇一二两三四五六七八九十点\d.]+)倍速/);
    if (!match) return null;
    const rate = spokenRate(match[1]);
    return { type: "backing-rate", rate, signature: `backing-rate-${rate}` };
  }

  function parseSeekCommand(text) {
    const match = text.match(/(快进|前进|后退|快退)([零〇一二两三四五六七八九十\d]+)秒/);
    if (!match) return null;
    const seconds = chineseNumber(match[2]);
    const direction = /快进|前进/.test(match[1]) ? 1 : -1;
    return { type: "seek-backing", seconds: direction * seconds, signature: `seek-backing-${direction * seconds}` };
  }

  function parseMeasureCommand(text) {
    const match = text.match(/第?([零〇一二两三四五六七八九十\d]+)(?:个)?小节/);
    if (!match) return null;
    const number = chineseNumber(match[1]);
    return { type: "measure", number, signature: `measure-${number}` };
  }

  function parseCommand(value) {
    const text = commandKey(value);
    const modeCommand = parseModeCommand(text);
    if (modeCommand) return modeCommand;
    const aliasType = COMMAND_ALIASES.get(text);
    if (aliasType) return { type: aliasType, signature: aliasType };
    const patternRule = COMMAND_PATTERNS.find((rule) => rule.pattern.test(text));
    if (patternRule) return { type: patternRule.type, signature: patternRule.type };
    for (const parser of [parseRateCommand, parseSeekCommand, parseMeasureCommand]) {
      const command = parser(text);
      if (command) return command;
    }
    return null;
  }

  const COMMAND_HANDLERS = new Map([
    ["switch-mode", (command) => window.DrumPracticeVoice.switchMode(command.mode)],
    ["play-backing", () => window.DrumPracticeVoice.playBacking()],
    ["pause-backing", () => window.DrumPracticeVoice.pauseBacking()],
    ["backing-rate", (command) => window.DrumPracticeVoice.setBackingRate(command.rate)],
    ["seek-backing", (command) => window.DrumPracticeVoice.seekBacking(command.seconds)],
    ["pause-video", () => window.DrumPracticeVoice.pauseVideo()],
    ["close-video", () => window.DrumPracticeVoice.closeVideo()],
    ["play-video", () => window.DrumPracticeVoice.playVideo()],
    ["measure", (command) => window.DrumPracticeVoice.goToMeasure(command.number)],
    ["next-measure", () => window.DrumPracticeVoice.isVideoOpen() ? window.DrumPracticeVoice.nextVideo() : window.DrumPracticeVoice.nextMeasure()],
    ["prev-measure", () => window.DrumPracticeVoice.isVideoOpen() ? window.DrumPracticeVoice.prevVideo() : window.DrumPracticeVoice.prevMeasure()],
    ["next", () => window.DrumPracticeVoice.nextLine()],
    ["prev", () => window.DrumPracticeVoice.prevLine()]
  ]);

  function execute(command) {
    const handler = COMMAND_HANDLERS.get(command.type);
    return handler ? handler(command) : { ok: false, message: "暂不支持这个语音指令" };
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
