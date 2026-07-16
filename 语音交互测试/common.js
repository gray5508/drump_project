(function () {
  "use strict";

  const data = window.SCORE_DATA;
  const systems = Array.from({ length: data.systems }, (_, index) =>
    data.measures.filter((measure) => measure.system === index + 1)
  );
  let lineIndex = 0;
  const strip = document.getElementById("scoreStrip");
  const title = document.getElementById("lineTitle");
  const range = document.getElementById("measureRange");
  const dots = document.getElementById("pageDots");
  const status = document.getElementById("statusText");

  function render(targetMeasure) {
    const measures = systems[lineIndex];
    const y = measures[0].y;
    const height = measures[0].height;
    strip.innerHTML = "";
    strip.style.aspectRatio = `${data.pageWidth} / ${data.pageHeight * height / 100}`;

    const image = new Image();
    image.src = "assets/score.png";
    image.alt = `鼓谱第 ${lineIndex + 1} 行`;
    image.style.top = `${-y / height * 100}%`;
    image.style.height = `${100 / height * 100}%`;
    strip.appendChild(image);

    const layer = document.createElement("div");
    layer.className = "measure-layer";
    measures.forEach((measure) => {
      const box = document.createElement("div");
      const targeted = targetMeasure >= measure.measureStart && targetMeasure <= measure.measureEnd;
      box.className = `measure-box${targeted ? " target" : ""}`;
      box.style.left = `${measure.x}%`;
      box.style.width = `${measure.width}%`;
      box.dataset.measure = measure.measureStart;
      if (targeted) {
        const label = measure.measureStart === measure.measureEnd
          ? `第 ${measure.measureStart} 小节`
          : `第 ${measure.measureStart}—${measure.measureEnd} 小节`;
        box.innerHTML = `<span>${label}</span>`;
        box.setAttribute("aria-label", `${label}，语音跳转目标`);
      }
      layer.appendChild(box);
    });
    strip.appendChild(layer);

    title.textContent = `第 ${lineIndex + 1} / ${systems.length} 行`;
    const first = measures[0];
    const last = measures[measures.length - 1];
    range.textContent = `第 ${first.measureStart}—${last.measureEnd} 小节`;
    [...dots.children].forEach((dot, index) => dot.classList.toggle("active", index === lineIndex));
  }

  function goToLine(next) {
    lineIndex = Math.max(0, Math.min(systems.length - 1, next));
    render();
  }

  function nextPage() {
    if (lineIndex >= systems.length - 1) return false;
    goToLine(lineIndex + 1);
    return true;
  }

  function prevPage() {
    if (lineIndex <= 0) return false;
    goToLine(lineIndex - 1);
    return true;
  }

  function goToMeasure(number) {
    const measure = data.measures.find((item) => number >= item.measureStart && number <= item.measureEnd);
    if (!measure) return false;
    lineIndex = measure.system - 1;
    render(number);
    return true;
  }

  function normalizeSpeechText(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/[，。！？、,.!?]/g, "")
      .replace(/买当劳|麦当牢|买当牢/g, "麦当劳");
  }

  function chineseNumber(raw) {
    const cleaned = raw.replace(/[第小节页\s，。,.]/g, "");
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
    if (/下一(页|行)|往后|向后|翻后/.test(text)) return { type: "next", signature: "next" };
    if (/上一(页|行)|往前|向前|翻前/.test(text)) return { type: "prev", signature: "prev" };
    const match = text.match(/第?([零〇一二两三四五六七八九十百\d]+)(?:个)?小节/);
    if (match) {
      const number = chineseNumber(match[1]);
      return { type: "measure", number, signature: `measure-${number}` };
    }
    return null;
  }

  function execute(value) {
    const command = typeof value === "string" ? parseCommand(value) : value;
    if (!command) {
      setStatus("听清了，但没有匹配到指令", false, "error");
      return false;
    }
    if (command.type === "next") {
      const ok = nextPage();
      setStatus(ok ? "已执行：下一页" : "已经是最后一页", ok, ok ? "success" : "error");
      return ok;
    }
    if (command.type === "prev") {
      const ok = prevPage();
      setStatus(ok ? "已执行：上一页" : "已经是第一页", ok, ok ? "success" : "error");
      return ok;
    }
    const ok = Number.isFinite(command.number) && goToMeasure(command.number);
    setStatus(ok ? `已跳转：第 ${command.number} 小节` : `没有找到第 ${command.number} 小节`, ok, ok ? "success" : "error");
    return ok;
  }

  function setStatus(text, _success, kind) {
    status.textContent = text;
    status.className = kind || "";
  }

  function createWakeGate(options = {}) {
    const wakeWord = options.wakeWord || "麦当劳";
    const activeMs = options.activeMs || 15000;
    const closeMs = options.closeMs || 20000;
    const wakeLabel = document.getElementById("wakeLabel");
    const wakeCountdown = document.getElementById("wakeCountdown");
    const wakeStatus = document.getElementById("wakeStatus");
    let activeUntil = 0;
    let closeAt = 0;
    let lastSignature = "";
    let lastCommandAt = 0;

    function state(now = Date.now()) {
      if (now < activeUntil) return "awake";
      if (now < closeAt) return "grace";
      return "sleeping";
    }

    function updateUi() {
      const now = Date.now();
      const current = state(now);
      wakeStatus.classList.toggle("awake", current === "awake");
      wakeStatus.classList.toggle("grace", current === "grace");
      if (current === "awake") {
        const seconds = Math.max(1, Math.ceil((activeUntil - now) / 1000));
        wakeLabel.textContent = `${wakeWord}已唤醒`;
        wakeCountdown.textContent = `指令窗口 ${seconds}s`;
      } else if (current === "grace") {
        const seconds = Math.max(1, Math.ceil((closeAt - now) / 1000));
        wakeLabel.textContent = "唤醒已过期";
        wakeCountdown.textContent = `${seconds}s 后休眠，可再次说“${wakeWord}”`;
      } else {
        wakeLabel.textContent = `等待“${wakeWord}”`;
        wakeCountdown.textContent = `说“${wakeWord}”后开放 15 秒`;
      }
    }

    function wake() {
      const now = Date.now();
      activeUntil = now + activeMs;
      closeAt = now + closeMs;
      lastSignature = "";
      lastCommandAt = 0;
      setStatus(`“${wakeWord}”已唤醒，请说指令`, true, "success");
      updateUi();
      if (navigator.vibrate) navigator.vibrate(35);
    }

    function process(rawText, isFinal = false) {
      const text = normalizeSpeechText(rawText);
      if (!text) return { text, handled: false };
      const wakeIndex = text.indexOf(wakeWord);
      let commandText = text;
      if (wakeIndex >= 0) {
        wake();
        commandText = text.slice(wakeIndex + wakeWord.length);
        if (!commandText) return { text, handled: true, woke: true };
      } else if (state() !== "awake") {
        if (isFinal) setStatus(`请先说“${wakeWord}”唤醒`, false, "");
        return { text, handled: false };
      }

      const command = parseCommand(commandText);
      if (!command) {
        if (isFinal) setStatus("已唤醒，但没有匹配到指令", false, "error");
        return { text, handled: false };
      }
      const now = Date.now();
      if (command.signature === lastSignature && now - lastCommandAt < 1800) {
        return { text, handled: true, duplicate: true };
      }
      lastSignature = command.signature;
      lastCommandAt = now;
      execute(command);
      return { text, handled: true, command };
    }

    function reset() {
      activeUntil = 0;
      closeAt = 0;
      lastSignature = "";
      lastCommandAt = 0;
      updateUi();
    }

    const ticker = setInterval(updateUi, 250);
    window.addEventListener("pagehide", () => clearInterval(ticker), { once: true });
    updateUi();
    return { process, wake, reset, state, updateUi };
  }

  systems.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.ariaLabel = `第 ${index + 1} 行`;
    dot.addEventListener("click", () => goToLine(index));
    dots.appendChild(dot);
  });
  document.getElementById("prevButton").addEventListener("click", prevPage);
  document.getElementById("nextButton").addEventListener("click", nextPage);
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") prevPage();
    if (event.key === "ArrowRight") nextPage();
  });

  render();
  window.VoicePractice = {
    execute,
    setStatus,
    parseCommand,
    normalizeSpeechText,
    createWakeGate,
    goToMeasure,
    nextPage,
    prevPage
  };
})();
