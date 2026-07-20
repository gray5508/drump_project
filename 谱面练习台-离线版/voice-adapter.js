(function () {
  "use strict";

  const WAKE_WORD = "麦当劳";
  const stateLabel = document.getElementById("voiceState");
  const transcript = document.getElementById("transcript");
  const helpDialog = document.getElementById("voiceHelpDialog");
  const helpTitle = document.getElementById("voiceHelpTitle");
  const helpContent = document.getElementById("voiceHelpContent");
  const helpButton = document.getElementById("voiceHelpButton");
  const closeHelpButton = document.getElementById("closeVoiceHelp");

  const MODE_ALIASES = new Map([
    ["完整谱面", "full"], ["完整", "full"], ["默认", "full"], ["默认谱面", "full"], ["总谱", "full"],
    ["按行练习", "line"], ["按行", "line"], ["行练习", "line"], ["单行练习", "line"], ["一行一行练习", "line"],
    ["小节编排", "arrange"], ["小节排列", "arrange"], ["编排", "arrange"], ["选中小节练习", "arrange"]
  ]);

  const COMMAND_ALIASES = new Map([
    ["下一小节", "next-measure"], ["下一节", "next-measure"], ["下一个小节", "next-measure"],
    ["上一小节", "prev-measure"], ["上一节", "prev-measure"], ["上一个小节", "prev-measure"],
    ["下一个视频", "next-video"], ["下一视频", "next-video"],
    ["上一个视频", "prev-video"], ["上一视频", "prev-video"],
    ["下一个", "next-context"], ["下一片段", "next-context"], ["下一个片段", "next-context"],
    ["上一个", "prev-context"], ["上一片段", "prev-context"], ["上一个片段", "prev-context"],
    ["下一行", "next"], ["下一页", "next"], ["往后翻", "next"], ["向后翻", "next"],
    ["上一行", "prev"], ["上一页", "prev"], ["往前翻", "prev"], ["向前翻", "prev"],

    ["暂停伴奏", "pause-backing"], ["停止伴奏", "pause-backing"], ["关闭伴奏", "pause-backing"], ["关掉伴奏", "pause-backing"],
    ["播放伴奏", "play-backing"], ["开始伴奏", "play-backing"], ["打开伴奏", "play-backing"], ["继续伴奏", "play-backing"],
    ["暂停试听", "pause-backing"], ["继续试听", "play-backing"],
    ["停止试听", "stop-backing-segment"], ["退出试听", "stop-backing-segment"], ["结束试听", "stop-backing-segment"], ["恢复整首伴奏", "stop-backing-segment"],
    ["重新试听", "restart-backing-segment"], ["从头试听", "restart-backing-segment"], ["重播试听", "restart-backing-segment"], ["回到片段开头", "restart-backing-segment"],
    ["播放当前小节", "play-selected-backing"], ["试听当前小节", "play-selected-backing"], ["当前小节伴奏", "play-selected-backing"],
    ["下一段伴奏", "next-backing-segment"], ["下一个试听小节", "next-backing-segment"], ["下一个伴奏小节", "next-backing-segment"],
    ["上一段伴奏", "prev-backing-segment"], ["上一个试听小节", "prev-backing-segment"], ["上一个伴奏小节", "prev-backing-segment"],
    ["调到原速", "normal-backing-rate"], ["恢复原速", "normal-backing-rate"], ["伴奏原速", "normal-backing-rate"],
    ["当前倍速", "query-backing-rate"], ["伴奏多少倍速", "query-backing-rate"], ["现在多少倍速", "query-backing-rate"],
    ["当前播放到哪里", "query-backing-position"], ["播放到哪里", "query-backing-position"], ["当前进度", "query-backing-position"],
    ["这是第几小节", "query-backing-measure"], ["当前试听小节", "query-backing-measure"], ["试听的是第几小节", "query-backing-measure"],
    ["伴奏状态", "query-backing-status"], ["当前播放状态", "query-backing-status"],

    ["暂停视频", "pause-video"], ["视频暂停", "pause-video"], ["停止视频", "pause-video"],
    ["关闭视频", "close-video"], ["关掉视频", "close-video"], ["退出视频", "close-video"], ["关闭教学视频", "close-video"],
    ["播放视频", "play-video"], ["打开视频", "play-video"], ["观看视频", "play-video"], ["播放教学视频", "play-video"],
    ["继续视频", "play-video"], ["恢复视频", "play-video"], ["教学视频", "play-video"],
    ["暂停", "pause-media"], ["暂停播放", "pause-media"], ["停止播放", "pause-media"],
    ["播放", "play-media"], ["继续播放", "play-media"], ["恢复播放", "play-media"],

    ["试听帮助", "backing-help"], ["伴奏帮助", "backing-help"], ["小节试听帮助", "backing-help"],
    ["语音帮助", "voice-help"], ["指令帮助", "voice-help"], ["打开帮助", "voice-help"],
    ["关闭帮助", "close-help"], ["退出帮助", "close-help"]
  ]);

  const COMMAND_PATTERNS = [
    { type: "next-measure", pattern: /^(?:切到|切换到?|往后)(?:下一|下一个|一个|一|1个|1)(?:小节|节)$/ },
    { type: "prev-measure", pattern: /^(?:切到|切换到?|往前)(?:上一|上一个|一个|一|1个|1)(?:小节|节)$/ },
    { type: "next", pattern: /^(?:翻到?|切到|切换到?)(?:下一行|下一页)$/ },
    { type: "prev", pattern: /^(?:翻到?|切到|切换到?)(?:上一行|上一页)$/ }
  ];

  const HELP_GROUPS = [
    {
      id: "backing",
      title: "伴奏与小节试听",
      commands: [
        ["播放伴奏 / 暂停伴奏", "控制整首伴奏或当前试听片段"],
        ["播放第 26 小节", "按已保存的时间播放对应小节"],
        ["播放当前小节", "播放当前唯一标记小节的伴奏"],
        ["暂停试听 / 继续试听", "保持当前片段范围"],
        ["重新试听 / 从头试听", "回到当前片段开头"],
        ["停止试听 / 退出试听", "退出片段范围，恢复普通伴奏模式"],
        ["下一段伴奏 / 上一段伴奏", "切换到相邻的已配置小节"],
        ["快进 10 秒 / 后退 5 秒", "试听中不会越过片段边界"],
        ["伴奏倍速 0.8 / 调到原速", "调整当前伴奏速度"],
        ["当前倍速 / 当前进度", "询问当前播放状态"]
      ]
    },
    {
      id: "score",
      title: "谱面与界面",
      commands: [
        ["第 48 小节", "跳转并只标记对应小节"],
        ["下一小节 / 上一小节", "移动当前唯一标记"],
        ["下一行 / 上一行", "按行练习界面翻行"],
        ["切换完整谱面", "打开完整谱面界面"],
        ["切换按行练习", "打开按行练习界面"],
        ["切换小节编排", "打开小节编排界面"]
      ]
    },
    {
      id: "video",
      title: "教学视频",
      commands: [
        ["播放视频 / 暂停视频", "控制当前小节教学视频"],
        ["下一个视频 / 上一个视频", "切换教学视频"],
        ["关闭视频", "返回练习界面"]
      ]
    }
  ];

  const HOTWORD_PHRASES = [
    "完整谱面", "按行练习", "小节编排", "下一小节", "上一小节", "下一行", "上一行",
    "播放视频", "暂停视频", "关闭视频", "下一个视频", "上一个视频",
    "播放伴奏", "暂停伴奏", "继续伴奏", "播放当前小节", "试听当前小节",
    "播放第一小节", "播放第十小节", "播放第四十八小节", "播放第四十八小节伴奏",
    "暂停试听", "继续试听", "重新试听", "从头试听", "停止试听", "退出试听",
    "下一段伴奏", "上一段伴奏", "下一个试听小节", "上一个试听小节",
    "伴奏速率零点八", "伴奏倍率零点八", "伴奏倍速一点二", "零点八倍速伴奏", "调到原速",
    "快进十秒", "快进二十秒", "后退五秒", "后退十秒", "回到片段开头",
    "当前倍速", "当前进度", "这是第几小节", "伴奏状态", "试听帮助", "语音帮助", "关闭帮助",
    "第一个小节", "第十小节", "第四十六小节"
  ];

  function normalizeSpeechText(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/[，。！？、,!?]/g, "")
      .replace(/买当劳|麦当牢|买当牢/g, WAKE_WORD);
  }

  function chineseNumber(raw) {
    const cleaned = String(raw || "").replace(/[第小节页行个秒\s，。,.]/g, "");
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

  function parsePlayBackingMeasureCommand(text) {
    const match = text.match(/^(?:播放|开始播放|试听|开始试听)(?:伴奏)?第?([零〇一二两三四五六七八九十\d]+)(?:个)?小节(?:伴奏)?$/);
    if (!match) return null;
    const number = chineseNumber(match[1]);
    return { type: "play-backing-measure", number, signature: `play-backing-measure-${number}` };
  }

  function parseMeasureCommand(text) {
    const match = text.match(/^第?([零〇一二两三四五六七八九十\d]+)(?:个)?小节$/);
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
    for (const parser of [parseRateCommand, parseSeekCommand, parsePlayBackingMeasureCommand, parseMeasureCommand]) {
      const command = parser(text);
      if (command) return command;
    }
    return null;
  }

  function renderHelp(scope = "all") {
    if (!helpContent) return;
    const groups = scope === "backing" ? HELP_GROUPS.filter((group) => group.id === "backing") : HELP_GROUPS;
    helpContent.innerHTML = groups.map((group) => `
      <section class="voice-help-group">
        <h4>${group.title}</h4>
        <div class="voice-help-commands">
          ${group.commands.map(([command, description]) => `<div><strong>${command}</strong><span>${description}</span></div>`).join("")}
        </div>
      </section>
    `).join("");
  }

  function openHelp(scope = "all") {
    if (!helpDialog) return { ok: false, message: "当前页面没有加载语音帮助" };
    helpTitle.textContent = scope === "backing" ? "伴奏与试听语音指令" : "语音指令帮助";
    renderHelp(scope);
    if (!helpDialog.open) helpDialog.showModal();
    return { ok: true, message: scope === "backing" ? "已打开试听帮助" : "已打开语音帮助" };
  }

  function closeHelp() {
    if (!helpDialog?.open) return { ok: false, message: "帮助界面当前没有打开" };
    helpDialog.close();
    return { ok: true, message: "已关闭语音帮助" };
  }

  function backingState() {
    return window.DrumPracticeVoice.getBackingState();
  }

  function playContextMedia() {
    return window.DrumPracticeVoice.isVideoOpen()
      ? window.DrumPracticeVoice.playVideo()
      : window.DrumPracticeVoice.playBacking();
  }

  function pauseContextMedia() {
    return window.DrumPracticeVoice.isVideoOpen()
      ? window.DrumPracticeVoice.pauseVideo()
      : window.DrumPracticeVoice.pauseBacking();
  }

  function moveContext(direction) {
    if (window.DrumPracticeVoice.isVideoOpen()) {
      return direction > 0 ? window.DrumPracticeVoice.nextVideo() : window.DrumPracticeVoice.prevVideo();
    }
    if (backingState().segmentActive) {
      return direction > 0 ? window.DrumPracticeVoice.nextBackingSegment() : window.DrumPracticeVoice.prevBackingSegment();
    }
    return direction > 0 ? window.DrumPracticeVoice.nextMeasure() : window.DrumPracticeVoice.prevMeasure();
  }

  const COMMAND_HANDLERS = new Map([
    ["switch-mode", (command) => window.DrumPracticeVoice.switchMode(command.mode)],
    ["play-media", playContextMedia], ["pause-media", pauseContextMedia],
    ["play-backing", () => window.DrumPracticeVoice.playBacking()],
    ["pause-backing", () => window.DrumPracticeVoice.pauseBacking()],
    ["backing-rate", (command) => window.DrumPracticeVoice.setBackingRate(command.rate)],
    ["normal-backing-rate", () => window.DrumPracticeVoice.setBackingRate(1)],
    ["seek-backing", (command) => window.DrumPracticeVoice.seekBacking(command.seconds)],
    ["play-backing-measure", (command) => window.DrumPracticeVoice.playBackingMeasure(command.number)],
    ["play-selected-backing", () => window.DrumPracticeVoice.playSelectedBackingMeasure()],
    ["restart-backing-segment", () => window.DrumPracticeVoice.restartBackingSegment()],
    ["stop-backing-segment", () => window.DrumPracticeVoice.stopBackingSegment()],
    ["next-backing-segment", () => window.DrumPracticeVoice.nextBackingSegment()],
    ["prev-backing-segment", () => window.DrumPracticeVoice.prevBackingSegment()],
    ["query-backing-rate", () => window.DrumPracticeVoice.describeBacking("rate")],
    ["query-backing-position", () => window.DrumPracticeVoice.describeBacking("position")],
    ["query-backing-measure", () => window.DrumPracticeVoice.describeBacking("measure")],
    ["query-backing-status", () => window.DrumPracticeVoice.describeBacking("all")],
    ["pause-video", () => window.DrumPracticeVoice.pauseVideo()],
    ["close-video", () => window.DrumPracticeVoice.closeVideo()],
    ["play-video", () => window.DrumPracticeVoice.playVideo()],
    ["next-video", () => window.DrumPracticeVoice.nextVideo()],
    ["prev-video", () => window.DrumPracticeVoice.prevVideo()],
    ["measure", (command) => window.DrumPracticeVoice.goToMeasure(command.number)],
    ["next-measure", () => window.DrumPracticeVoice.isVideoOpen() ? window.DrumPracticeVoice.nextVideo() : window.DrumPracticeVoice.nextMeasure()],
    ["prev-measure", () => window.DrumPracticeVoice.isVideoOpen() ? window.DrumPracticeVoice.prevVideo() : window.DrumPracticeVoice.prevMeasure()],
    ["next-context", () => moveContext(1)], ["prev-context", () => moveContext(-1)],
    ["next", () => window.DrumPracticeVoice.nextLine()], ["prev", () => window.DrumPracticeVoice.prevLine()],
    ["backing-help", () => openHelp("backing")], ["voice-help", () => openHelp("all")], ["close-help", closeHelp]
  ]);

  function execute(command) {
    const handler = COMMAND_HANDLERS.get(command.type);
    return handler ? handler(command) : { ok: false, message: "暂不支持这个语音指令" };
  }

  function setStatus(message) {
    if (stateLabel) stateLabel.textContent = message;
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

  if (helpButton) helpButton.addEventListener("click", () => openHelp("all"));
  if (closeHelpButton) closeHelpButton.addEventListener("click", () => helpDialog.close());
  if (helpDialog) helpDialog.addEventListener("click", (event) => { if (event.target === helpDialog) helpDialog.close(); });

  window.VoicePractice = {
    normalizeSpeechText,
    parseCommand,
    setStatus,
    createWakeGate,
    openHelp,
    closeHelp,
    helpGroups: HELP_GROUPS,
    hotwordCorpus: HOTWORD_PHRASES.join("。") + "。"
  };

  window.addEventListener("practice-modechange", (event) => {
    const mode = event.detail?.mode;
    if (mode === "full") transcript.textContent = "完整谱面：支持定位、上下小节、教学视频和伴奏";
    if (mode === "line") transcript.textContent = "按行：支持上下行、上下小节、教学视频和伴奏";
    if (mode === "arrange") transcript.textContent = "小节编排：仍可控制伴奏，其他语音指令暂不执行";
  });
})();
