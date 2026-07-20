(function () {
  "use strict";

  const palettes = [
    { id: "blue", name: "专注蓝", fill: "rgba(73,111,236,.18)", preview: "rgba(73,111,236,.08)", hover: "rgba(73,111,236,.14)", border: "#496fec" },
    { id: "yellow", name: "练习黄", fill: "rgba(244,183,64,.24)", preview: "rgba(244,183,64,.09)", hover: "rgba(244,183,64,.16)", border: "#e2a328" },
    { id: "coral", name: "难点红", fill: "rgba(235,100,91,.2)", preview: "rgba(235,100,91,.08)", hover: "rgba(235,100,91,.14)", border: "#df5e55" },
    { id: "green", name: "完成绿", fill: "rgba(62,166,124,.2)", preview: "rgba(62,166,124,.08)", hover: "rgba(62,166,124,.14)", border: "#32966c" }
  ];
  const measureMap = new Map(SCORE_DATA.measures.map((measure) => [measure.id, measure]));
  const systemMeasures = Array.from({ length: SCORE_DATA.systems }, (_, index) =>
    SCORE_DATA.measures.filter((measure) => measure.system === index + 1)
  );
  const MARKS_KEY = "drum-focus-marks";
  const GROUPS_KEY = "drum-focus-groups-v1";
  const DEFAULT_SIZE_KEY = "drum-focus-default-card-height";
  const TEMPLATE_SIZE_KEY = "drum-focus-template-size-v1";
  const BACKING_RATE_KEY = "drum-focus-backing-rate-v1";
  const BACKING_SEGMENTS_KEY = "drum-focus-backing-segments-v1";
  const BACKING_PLAYER_UI_KEY = "drum-focus-backing-player-ui-v2";
  const VIDEO_SCORE_SCALE_KEY = "drum-focus-video-score-scale-v1";
  const INITIAL_TEMPLATE_WIDTH = 240;
  const INITIAL_TEMPLATE_HEIGHT = 120;
  const VIDEO_LIBRARY = {
    40: [
      { label: "片段 1", src: "video/measure-40-1.mp4", poster: "video/posters/measure-40-1.jpg" },
      { label: "片段 2", src: "video/measure-40-2.mp4", poster: "video/posters/measure-40-2.jpg" }
    ],
    41: [
      { label: "片段 1", src: "video/measure-41-1.mp4", poster: "video/posters/measure-41-1.jpg" },
      { label: "片段 2", src: "video/measure-41-2.mp4", poster: "video/posters/measure-41-2.jpg" }
    ],
    46: [
      { label: "教学演示", src: "video/measure-46.mp4", poster: "video/posters/measure-46.jpg" }
    ],
    48: [
      { label: "片段 1", src: "video/measure-48-1.mp4", poster: "video/posters/measure-48-1.jpg" },
      { label: "片段 2", src: "video/measure-48-2.mp4", poster: "video/posters/measure-48-2.jpg" }
    ]
  };
  let activeColor = "blue";
  let zoom = 100;
  let lineIndex = 0;
  let currentMode = "full";
  const repositoryBackingConfig = window.DRUM_BACKING_CONFIG && typeof window.DRUM_BACKING_CONFIG === "object"
    ? window.DRUM_BACKING_CONFIG
    : { version: 1, revision: "", globalRate: 1, segments: {} };
  const repositoryBackingSegments = repositoryBackingConfig.segments && typeof repositoryBackingConfig.segments === "object"
    ? repositoryBackingConfig.segments
    : {};
  let marks = readStorage(MARKS_KEY, {});
  let groups = readStorage(GROUPS_KEY, []);
  let backingSegments = readStorage(BACKING_SEGMENTS_KEY, null);
  if (!backingSegments || typeof backingSegments !== "object" || Array.isArray(backingSegments)) {
    backingSegments = JSON.parse(JSON.stringify(repositoryBackingSegments));
  }
  let draftRows = null;
  let draftSizes = {};
  const storedTemplate = readStorage(TEMPLATE_SIZE_KEY, { width: INITIAL_TEMPLATE_WIDTH, height: Number(readStorage(DEFAULT_SIZE_KEY, INITIAL_TEMPLATE_HEIGHT)) || INITIAL_TEMPLATE_HEIGHT });
  let templateWidth = Math.max(150, Math.min(420, Number(storedTemplate.width) || INITIAL_TEMPLATE_WIDTH));
  let templateHeight = Math.max(80, Math.min(260, Number(storedTemplate.height) || INITIAL_TEMPLATE_HEIGHT));
  let activeGroupId = null;
  let dirty = false;
  let draggedId = null;
  let pendingLoadGroupId = null;

  const paletteElement = document.getElementById("palette");
  const pageElement = document.getElementById("page");
  const viewportElement = document.querySelector(".viewport");
  const layerElement = document.getElementById("layer");
  const selectedCountElement = document.getElementById("selectedCount");
  const markedStatusElement = document.getElementById("markedStatus");
  const clearElement = document.getElementById("clear");
  const linePaperElement = document.getElementById("linePaper");
  const arrangeBoardElement = document.getElementById("arrangeBoard");
  const groupListElement = document.getElementById("groupList");
  const saveDialog = document.getElementById("saveDialog");
  const unsavedDialog = document.getElementById("unsavedDialog");
  const groupNameInput = document.getElementById("groupName");
  const scoreSourceImage = document.querySelector("#page > img");
  const templateFrame = document.getElementById("templateFrame");
  const templateHandles = document.querySelectorAll(".template-handle");
  const templateSizeValue = document.getElementById("templateSizeValue");
  const videoDialog = document.getElementById("videoDialog");
  const tutorialVideo = document.getElementById("tutorialVideo");
  const videoTitle = document.getElementById("videoTitle");
  const videoClips = document.getElementById("videoClips");
  const videoToast = document.getElementById("videoToast");
  const videoScoreTitle = document.getElementById("videoScoreTitle");
  const videoScoreStage = document.getElementById("videoScoreStage");
  const videoScoreScaleInput = document.getElementById("videoScoreScale");
  const videoScoreScaleValue = document.getElementById("videoScoreScaleValue");
  const backingPlayer = document.getElementById("backingPlayer");
  const backingAudio = document.getElementById("backingAudio");
  const backingDisc = document.getElementById("backingDisc");
  const backingDiscState = document.getElementById("backingDiscState");
  const backingToggle = document.getElementById("backingToggle");
  const backingRate = document.getElementById("backingRate");
  const backingRateValue = document.getElementById("backingRateValue");
  const backingStatus = document.getElementById("backingStatus");
  const backingSettingsButton = document.getElementById("backingSettingsButton");
  const backingSettingsDialog = document.getElementById("backingSettingsDialog");
  const backingSettingsProgress = document.getElementById("backingSettingsProgress");
  const backingSettingsCurrent = document.getElementById("backingSettingsCurrent");
  const backingSettingsDuration = document.getElementById("backingSettingsDuration");
  const backingSettingsEnd = document.getElementById("backingSettingsEnd");
  const backingQuickFill = document.getElementById("backingQuickFill");
  const backingQuickTime = document.getElementById("backingQuickTime");
  const backingQuickDuration = document.getElementById("backingQuickDuration");
  const backingQuickRate = document.getElementById("backingQuickRate");
  const backingInlineProgress = document.getElementById("backingInlineProgress");
  const backingInlineCurrent = document.getElementById("backingInlineCurrent");
  const backingInlineDuration = document.getElementById("backingInlineDuration");
  const backingInlineRate = document.getElementById("backingInlineRate");
  const backingInlineRateValue = document.getElementById("backingInlineRateValue");
  const backingInlineRateOutput = document.getElementById("backingInlineRateOutput");
  const backingSpeedDrawer = document.getElementById("backingSpeedDrawer");
  const backingCollapse = document.getElementById("backingCollapse");
  const backingSegmentSession = document.getElementById("backingSegmentSession");
  const activeBoundaryMarkers = document.querySelectorAll("[data-active-boundary]");
  const relativeBoundaryMarkers = document.querySelectorAll(".backing-inline-progress [data-active-boundary],.backing-seek-rail [data-active-boundary]");
  const editorBoundaryMarkers = document.querySelectorAll("[data-editor-boundary]");
  const backingSeekHud = document.getElementById("backingSeekHud");
  const backingSeekTrack = document.getElementById("backingSeekTrack");
  const backingSeekFill = document.getElementById("backingSeekFill");
  const backingSeekThumb = document.getElementById("backingSeekThumb");
  const backingCurrentTime = document.getElementById("backingCurrentTime");
  const backingDuration = document.getElementById("backingDuration");
  const measureSegmentDialog = document.getElementById("measureSegmentDialog");
  const measureSegmentForm = document.getElementById("measureSegmentForm");
  const measureSegmentTitle = document.getElementById("measureSegmentTitle");
  const segmentStartRange = document.getElementById("segmentStartRange");
  const segmentStartNumber = document.getElementById("segmentStartNumber");
  const segmentEndRange = document.getElementById("segmentEndRange");
  const segmentEndNumber = document.getElementById("segmentEndNumber");
  const segmentToEnd = document.getElementById("segmentToEnd");
  const segmentSummary = document.getElementById("segmentSummary");
  const segmentPlaybackToggle = document.getElementById("segmentPlaybackToggle");
  const segmentPlaybackProgress = document.getElementById("segmentPlaybackProgress");
  const segmentPlaybackCurrent = document.getElementById("segmentPlaybackCurrent");
  const segmentPlaybackDuration = document.getElementById("segmentPlaybackDuration");
  const segmentRate = document.getElementById("segmentRate");
  const segmentRateValue = document.getElementById("segmentRateValue");
  const segmentHoldAction = document.getElementById("segmentHoldAction");
  let backingSeeking = false;
  let backingSeekTarget = null;
  let backingHoldTimer = null;
  let backingHoldStart = null;
  let suppressBackingToggleUntil = 0;
  let activeBackingSegmentId = null;
  let activeBackingSegmentStart = null;
  let activeBackingSegmentEnd = null;
  let editingBackingMeasureId = null;
  let backingProgressFrame = 0;
  let backingPlayerUi = readStorage(BACKING_PLAYER_UI_KEY, { collapsed: false, position: null });
  if (!backingPlayerUi || typeof backingPlayerUi !== "object" || Array.isArray(backingPlayerUi)) backingPlayerUi = { collapsed: false, position: null };
  let activeTutorialClips = [];
  let activeTutorialId = null;
  let activeTutorialClipIndex = -1;
  let videoScoreScale = Number(readStorage(VIDEO_SCORE_SCALE_KEY, 1)) || 1;
  let videoToastTimer = null;

  function readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* Offline storage may be disabled. */ }
  }

  function selectedIds() {
    return SCORE_DATA.measures.filter((measure) => marks[measure.id]).map((measure) => measure.id);
  }

  function paletteFor(id) {
    return palettes.find((palette) => palette.id === id);
  }

  function applyActivePreview() {
    const palette = paletteFor(activeColor) || palettes[0];
    document.documentElement.style.setProperty("--active-preview-fill", palette.preview);
    document.documentElement.style.setProperty("--active-preview-border", palette.border);
  }

  function setMarkedStyle(element, id) {
    const palette = paletteFor(marks[id]);
    element.classList.toggle("marked", Boolean(palette));
    element.style.backgroundColor = palette ? palette.fill : "";
    element.style.borderColor = palette ? palette.border : "";
    element.style.setProperty("--mark-hover-fill", palette ? palette.hover : "transparent");
    element.style.setProperty("--mark-border", palette ? palette.border : "transparent");
    const label = element.querySelector("span");
    const measure = measureMap.get(id);
    if (label && measure) {
      const action = palette ? (marks[id] === activeColor ? "点击取消" : "点击改色") : "点击标记";
      label.textContent = `${measure.label} · ${action}`;
      element.setAttribute("aria-label", `第 ${measure.measureStart} 小节，${action}`);
    }
  }

  function refreshSelectionState() {
    const ids = selectedIds();
    document.querySelectorAll(".measure[data-id],.line-measure[data-id]").forEach((element) =>
      setMarkedStyle(element, element.dataset.id)
    );
    selectedCountElement.textContent = String(ids.length);
    clearElement.hidden = ids.length === 0;
    clearElement.textContent = `清空 ${ids.length} 个标记`;
    markedStatusElement.textContent = ids.length
      ? `已标记：${ids.map((id) => measureMap.get(id).label).join("、")}`
      : "当前没有固定标记";
    writeStorage(MARKS_KEY, marks);
  }

  function toggleMark(id) {
    if (marks[id] === activeColor) delete marks[id];
    else marks[id] = activeColor;
    refreshSelectionState();
  }

  function tutorialClipsFor(id) {
    const measure = measureMap.get(id);
    return measure ? (VIDEO_LIBRARY[measure.measureStart] || []) : [];
  }

  function showVideoToast(message) {
    clearTimeout(videoToastTimer);
    videoToast.textContent = message;
    videoToast.classList.add("show");
    videoToastTimer = setTimeout(() => videoToast.classList.remove("show"), 1500);
  }

  function clampBackingRate(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return Number.NaN;
    return Math.max(0.5, Math.min(2, Math.round(number * 20) / 20));
  }

  function formatBackingTime(value) {
    const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function formatBackingTimeInput(value) {
    const totalTenths = Math.max(0, Math.round((Number(value) || 0) * 10));
    const minutes = Math.floor(totalTenths / 600);
    const seconds = (totalTenths % 600) / 10;
    const formattedSeconds = Number.isInteger(seconds)
      ? String(seconds).padStart(2, "0")
      : seconds.toFixed(1).padStart(4, "0");
    return `${minutes}:${formattedSeconds}`;
  }

  function parseBackingTimeInput(value) {
    const text = String(value || "").trim().replace("：", ":");
    if (!text) return Number.NaN;
    if (!text.includes(":")) return Number(text);
    const parts = text.split(":");
    if (parts.length !== 2) return Number.NaN;
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) return Number.NaN;
    return minutes * 60 + seconds;
  }

  function backingDurationValue() {
    return Number.isFinite(backingAudio.duration) ? backingAudio.duration : 0;
  }

  function clampBackingTime(value, fallback = 0) {
    const duration = backingDurationValue();
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, Math.round(number * 10) / 10));
  }

  function measureForNumber(number) {
    return SCORE_DATA.measures.find((item) => number >= item.measureStart && number <= item.measureEnd);
  }

  function backingSegmentFor(id) {
    const segment = backingSegments[id];
    if (!segment || !Number.isFinite(Number(segment.start))) return null;
    const storedRate = clampBackingRate(segment.rate);
    return {
      start: Math.max(0, Number(segment.start)),
      end: segment.end === null || segment.end === "" || !Number.isFinite(Number(segment.end)) ? null : Math.max(0, Number(segment.end)),
      rate: Number.isFinite(storedRate) ? storedRate : (clampBackingRate(backingAudio.playbackRate) || clampBackingRate(repositoryBackingConfig.globalRate) || 1),
      holdAction: segment.holdAction === "backing" ? "backing" : "video"
    };
  }

  function backingSegmentLabel(segment) {
    if (!segment) return "尚未设置";
    return `${formatBackingTime(segment.start)}–${segment.end === null ? "结尾" : formatBackingTime(segment.end)}`;
  }

  function refreshBackingSegmentIndicators() {
    document.querySelectorAll(".measure[data-id],.line-measure[data-id],.mini-crop[data-backing-id]").forEach((element) => {
      const id = element.dataset.id || element.dataset.backingId;
      element.classList.toggle("has-backing-segment", Boolean(backingSegmentFor(id)));
    });
  }

  function attachMeasureBackingEditor(element, id, cancelSingleClick) {
    element.addEventListener("dblclick", (event) => {
      if (typeof cancelSingleClick === "function") cancelSingleClick();
      event.preventDefault();
      event.stopPropagation();
      openMeasureSegmentEditor(id);
    });
  }

  function syncBoundaryMarkers(markers, start, end, duration) {
    const visible = Number.isFinite(start) && Number.isFinite(end) && duration > 0 && end > start;
    markers.forEach((marker) => {
      const boundary = marker.dataset.activeBoundary || marker.dataset.editorBoundary;
      const value = boundary === "start" ? start : end;
      marker.classList.toggle("visible", visible);
      if (visible) marker.style.left = `${Math.max(0, Math.min(100, value / duration * 100))}%`;
    });
  }

  function syncBackingBoundaryMarkers() {
    const duration = backingDurationValue();
    syncBoundaryMarkers(activeBoundaryMarkers, activeBackingSegmentStart, activeBackingSegmentEnd, duration);
    if (activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart) && Number.isFinite(activeBackingSegmentEnd)) {
      relativeBoundaryMarkers.forEach((marker) => {
        marker.classList.add("visible");
        marker.style.left = marker.dataset.activeBoundary === "start" ? "0%" : "100%";
      });
    }
    if (measureSegmentDialog.open && editingBackingMeasureId) {
      const values = segmentFormValues();
      syncBoundaryMarkers(editorBoundaryMarkers, values.start, values.end === null ? duration : values.end, duration);
    } else {
      syncBoundaryMarkers(editorBoundaryMarkers, Number.NaN, Number.NaN, duration);
    }
  }

  function syncBackingProgress() {
    const duration = backingDurationValue();
    const displayedTime = backingSeeking && Number.isFinite(backingSeekTarget) ? backingSeekTarget : backingAudio.currentTime;
    const fraction = duration ? Math.max(0, Math.min(1, displayedTime / duration)) : 0;
    const segmentTimeline = Boolean(activeBackingSegmentId) && Number.isFinite(activeBackingSegmentStart) && Number.isFinite(activeBackingSegmentEnd) && activeBackingSegmentEnd > activeBackingSegmentStart;
    const timelineStart = segmentTimeline ? activeBackingSegmentStart : 0;
    const timelineDuration = segmentTimeline ? activeBackingSegmentEnd - activeBackingSegmentStart : duration;
    const timelineTime = Math.max(0, Math.min(timelineDuration, displayedTime - timelineStart));
    const timelineFraction = timelineDuration ? timelineTime / timelineDuration : 0;
    backingSeekFill.style.width = `${timelineFraction * 100}%`;
    backingSeekThumb.style.left = `${timelineFraction * 100}%`;
    backingCurrentTime.textContent = formatBackingTime(timelineTime);
    backingDuration.textContent = formatBackingTime(timelineDuration);
    backingQuickFill.style.width = `${fraction * 100}%`;
    backingQuickTime.textContent = formatBackingTime(displayedTime);
    backingQuickDuration.textContent = formatBackingTime(duration);
    backingInlineProgress.max = String(timelineDuration || 100);
    if (!backingInlineProgress.matches(":active")) backingInlineProgress.value = String(timelineTime);
    backingInlineCurrent.textContent = formatBackingTime(timelineTime);
    backingInlineDuration.textContent = formatBackingTime(timelineDuration);
    backingSettingsProgress.max = String(duration || 100);
    if (!backingSettingsProgress.matches(":active")) backingSettingsProgress.value = String(displayedTime);
    backingSettingsCurrent.textContent = formatBackingTime(displayedTime);
    backingSettingsDuration.textContent = formatBackingTime(duration);
    backingSettingsEnd.textContent = formatBackingTime(duration);
    segmentPlaybackProgress.max = String(duration || 100);
    if (!segmentPlaybackProgress.matches(":active")) segmentPlaybackProgress.value = String(displayedTime);
    segmentPlaybackCurrent.textContent = formatBackingTime(displayedTime);
    segmentPlaybackDuration.textContent = formatBackingTime(duration);
    syncBackingBoundaryMarkers();
  }

  function syncBackingPlayer() {
    const rate = clampBackingRate(backingAudio.playbackRate) || 1;
    const playing = !backingAudio.paused && !backingAudio.ended;
    const segmentActive = Boolean(activeBackingSegmentId);
    const reachedSegmentEnd = segmentActive && Number.isFinite(activeBackingSegmentEnd) && backingAudio.currentTime >= activeBackingSegmentEnd - 0.05;
    backingPlayer.classList.toggle("playing", playing);
    backingPlayer.classList.toggle("segment-session-active", segmentActive);
    backingSegmentSession.hidden = !segmentActive;
    backingPlayer.style.setProperty("--disc-speed", `${Math.max(0.65, 2.4 / rate)}s`);
    backingDiscState.textContent = playing ? "点击暂停" : reachedSegmentEnd ? "重新试听" : backingAudio.currentTime > 0 ? "继续播放" : "点击播放";
    backingToggle.textContent = segmentActive ? (playing ? "试听暂停" : "试听开始") : (playing ? "暂停" : "播放");
    const editingActiveSegment = segmentActive && activeBackingSegmentId === editingBackingMeasureId;
    segmentPlaybackToggle.textContent = editingActiveSegment ? (playing ? "暂停片段" : "继续片段") : "播放片段";
    backingDisc.setAttribute("aria-label", playing ? "暂停伴奏" : "播放伴奏");
    backingStatus.textContent = segmentActive
      ? `${playing ? "片段播放中" : reachedSegmentEnd ? "片段已结束" : "片段已暂停"} · ${rate.toFixed(2)}×`
      : `${playing ? "播放中" : backingAudio.currentTime > 0 ? "已暂停" : "准备播放"} · ${rate.toFixed(2)}×`;
    cancelAnimationFrame(backingProgressFrame);
    if (playing) {
      const animateProgress = () => {
        stopBackingSegmentAtBoundary();
        syncBackingProgress();
        if (!backingAudio.paused && !backingAudio.ended) backingProgressFrame = requestAnimationFrame(animateProgress);
      };
      backingProgressFrame = requestAnimationFrame(animateProgress);
    }
    syncBackingProgress();
  }

  function setBackingRate(value, notify = false) {
    const rate = clampBackingRate(value);
    if (!Number.isFinite(rate)) return { ok: false, message: "没有识别到有效的伴奏速率" };
    backingAudio.playbackRate = rate;
    backingAudio.defaultPlaybackRate = rate;
    backingAudio.preservesPitch = true;
    if ("webkitPreservesPitch" in backingAudio) backingAudio.webkitPreservesPitch = true;
    backingRate.value = String(rate);
    backingRateValue.textContent = `${rate.toFixed(2)}×`;
    backingQuickRate.textContent = `${rate.toFixed(2)}×`;
    backingInlineRate.value = String(rate);
    backingInlineRateValue.textContent = `${rate.toFixed(2)}×`;
    backingInlineRateOutput.textContent = `${rate.toFixed(2)}×`;
    writeStorage(BACKING_RATE_KEY, rate);
    syncBackingPlayer();
    if (measureSegmentDialog.open) updateMeasureSegmentSummary();
    if (notify) showVideoToast(`伴奏速率已调整为 ${rate.toFixed(2)} 倍`);
    return { ok: true, message: `伴奏速率已调整为 ${rate.toFixed(2)} 倍` };
  }

  function playBacking() {
    if (activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart) && Number.isFinite(activeBackingSegmentEnd)) {
      if (backingAudio.currentTime < activeBackingSegmentStart || backingAudio.currentTime >= activeBackingSegmentEnd - 0.035) {
        backingAudio.currentTime = activeBackingSegmentStart;
      }
    }
    const request = backingAudio.play();
    if (request) request.catch(() => {
      syncBackingPlayer();
      showVideoToast("浏览器阻止了自动播放，请先点击一次伴奏播放按钮");
    });
    return activeBackingSegmentId
      ? { ok: true, message: `正在继续第 ${measureMap.get(activeBackingSegmentId)?.label || "当前"} 小节试听` }
      : { ok: true, message: `正在以 ${backingAudio.playbackRate.toFixed(2)} 倍速播放伴奏` };
  }

  function pauseBacking() {
    if (backingAudio.paused) return { ok: false, message: "伴奏当前没有播放" };
    backingAudio.pause();
    return activeBackingSegmentId
      ? { ok: true, message: `已暂停第 ${measureMap.get(activeBackingSegmentId)?.label || "当前"} 小节试听` }
      : { ok: true, message: "已暂停伴奏" };
  }

  function seekBacking(seconds) {
    const amount = Number(seconds);
    if (!Number.isFinite(amount) || amount === 0) return { ok: false, message: "没有识别到有效的快进或后退时间" };
    const duration = backingDurationValue();
    if (!duration) return { ok: false, message: "伴奏仍在加载，请稍后再试" };
    const minimum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart) ? activeBackingSegmentStart : 0;
    const maximum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentEnd) ? activeBackingSegmentEnd : duration;
    const target = Math.max(minimum, Math.min(maximum, backingAudio.currentTime + amount));
    if (Math.abs(target - backingAudio.currentTime) < 0.01) {
      const boundary = amount > 0 ? "结尾" : "开头";
      return { ok: false, message: activeBackingSegmentId ? `已经到试听片段${boundary}` : `已经到伴奏${boundary}` };
    }
    backingAudio.currentTime = target;
    syncBackingProgress();
    const action = amount > 0 ? "快进" : "后退";
    const moved = Math.round(Math.abs(amount));
    showVideoToast(`伴奏已${action} ${moved} 秒`);
    const displayedTarget = activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart)
      ? Math.max(0, target - activeBackingSegmentStart)
      : target;
    return {
      ok: true,
      message: activeBackingSegmentId
        ? `试听已${action} ${moved} 秒，片段内 ${formatBackingTime(displayedTarget)}`
        : `伴奏已${action} ${moved} 秒，当前 ${formatBackingTime(displayedTarget)}`
    };
  }

  function toggleBacking() {
    if (backingAudio.paused) playBacking();
    else pauseBacking();
  }

  function setBackingPosition(value, options = {}) {
    const duration = backingDurationValue();
    if (!duration) return false;
    if (options.clearSegment && activeBackingSegmentId) stopBackingSegmentSession({ pause: true, notify: false });
    const minimum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart) ? activeBackingSegmentStart : 0;
    const maximum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentEnd) ? activeBackingSegmentEnd : duration;
    backingAudio.currentTime = Math.max(minimum, Math.min(maximum, Number(value) || 0));
    syncBackingProgress();
    return true;
  }

  function setBackingInlinePosition(value) {
    const offset = Number(value) || 0;
    const actual = activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart)
      ? activeBackingSegmentStart + offset
      : offset;
    return setBackingPosition(actual);
  }

  function stopBackingSegmentSession(options = {}) {
    if (options.pause !== false) backingAudio.pause();
    activeBackingSegmentId = null;
    activeBackingSegmentStart = null;
    activeBackingSegmentEnd = null;
    syncBackingPlayer();
    if (options.notify !== false) showVideoToast("已停止小节试听，恢复普通伴奏模式");
    return { ok: true, message: "已停止小节试听，恢复普通伴奏模式" };
  }

  function saveBackingPlayerUi() {
    writeStorage(BACKING_PLAYER_UI_KEY, backingPlayerUi);
  }

  function clampBackingPlayerPosition(left, top) {
    const rect = backingPlayer.getBoundingClientRect();
    const margin = 8;
    return {
      left: Math.max(margin, Math.min(window.innerWidth - rect.width - margin, Number(left) || margin)),
      top: Math.max(margin, Math.min(window.innerHeight - rect.height - margin, Number(top) || margin))
    };
  }

  function setBackingPlayerPosition(left, top, persist = false) {
    const position = clampBackingPlayerPosition(left, top);
    backingPlayer.style.left = `${position.left}px`;
    backingPlayer.style.top = `${position.top}px`;
    backingPlayer.style.right = "auto";
    backingPlayer.style.bottom = "auto";
    backingPlayer.style.transform = "none";
    if (persist) {
      backingPlayerUi.position = position;
      saveBackingPlayerUi();
    }
  }

  function setBackingPlayerCollapsed(collapsed, persist = true) {
    backingPlayerUi.collapsed = Boolean(collapsed);
    backingPlayer.classList.toggle("collapsed", backingPlayerUi.collapsed);
    backingCollapse.textContent = backingPlayerUi.collapsed ? "+" : "−";
    backingCollapse.title = backingPlayerUi.collapsed ? "展开伴奏播放器" : "最小化伴奏播放器";
    backingCollapse.setAttribute("aria-label", backingCollapse.title);
    if (backingPlayerUi.collapsed) {
      backingSpeedDrawer.classList.remove("open");
      backingInlineRateValue.setAttribute("aria-expanded", "false");
      ["left", "top", "right", "bottom", "transform"].forEach((property) => backingPlayer.style.removeProperty(property));
    } else if (!backingPlayerUi.position) {
      ["left", "top", "right", "bottom", "transform"].forEach((property) => backingPlayer.style.removeProperty(property));
    }
    if (persist) saveBackingPlayerUi();
    const keepInsideViewport = () => {
      if (!backingPlayerUi.collapsed && backingPlayerUi.position) setBackingPlayerPosition(backingPlayerUi.position.left, backingPlayerUi.position.top, true);
    };
    requestAnimationFrame(keepInsideViewport);
    setTimeout(keepInsideViewport, 220);
  }

  function toggleBackingSpeedDrawer(force) {
    const open = typeof force === "boolean" ? force : !backingSpeedDrawer.classList.contains("open");
    backingSpeedDrawer.classList.toggle("open", open);
    backingInlineRateValue.setAttribute("aria-expanded", String(open));
  }

  function openBackingSettings() {
    syncBackingProgress();
    backingSettingsDialog.showModal();
  }

  function normalizedBackingSegments() {
    return Object.fromEntries(Object.keys(backingSegments).flatMap((id) => {
      const segment = backingSegmentFor(id);
      return segment ? [[id, segment]] : [];
    }));
  }

  function exportUnifiedBackingConfig() {
    const exportedAt = new Date().toISOString();
    const payload = {
      version: 1,
      revision: exportedAt.replace(/[-:.TZ]/g, "").slice(0, 14),
      exportedAt,
      globalRate: clampBackingRate(backingAudio.playbackRate) || 1,
      segments: normalizedBackingSegments()
    };
    const source = `(function () {\n  "use strict";\n  window.DRUM_BACKING_CONFIG = ${JSON.stringify(payload, null, 2)};\n})();\n`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "backing-config.js";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showVideoToast("统一配置已导出；替换仓库同名文件后即可跨设备读取");
  }

  function restoreRepositoryBackingConfig() {
    if (!confirm("恢复仓库统一配置会覆盖这台设备尚未导出的伴奏设置，是否继续？")) return;
    if (activeBackingSegmentId) stopBackingSegmentSession({ pause: true, notify: false });
    backingSegments = JSON.parse(JSON.stringify(repositoryBackingSegments));
    try { localStorage.removeItem(BACKING_SEGMENTS_KEY); } catch (error) { /* Storage may be disabled. */ }
    const repositoryRate = clampBackingRate(repositoryBackingConfig.globalRate) || 1;
    setBackingRate(repositoryRate);
    try { localStorage.removeItem(BACKING_RATE_KEY); } catch (error) { /* Storage may be disabled. */ }
    refreshBackingSegmentIndicators();
    const editingId = editingBackingMeasureId;
    if (measureSegmentDialog.open) measureSegmentDialog.close();
    if (editingId) openMeasureSegmentEditor(editingId);
    showVideoToast("已恢复仓库统一配置");
  }

  function segmentFormValues() {
    const duration = backingDurationValue();
    const parsedStart = parseBackingTimeInput(segmentStartNumber.value);
    const parsedEnd = parseBackingTimeInput(segmentEndNumber.value);
    const start = clampBackingTime(parsedStart, Number(segmentStartRange.value) || 0);
    const end = segmentToEnd.checked ? null : clampBackingTime(parsedEnd, Number(segmentEndRange.value) || duration);
    const rate = clampBackingRate(segmentRate.value) || 1;
    const holdAction = segmentHoldAction.value === "backing" ? "backing" : "video";
    return { start, end, rate, holdAction };
  }

  function updateMeasureSegmentSummary() {
    const duration = backingDurationValue();
    const { start, end, rate } = segmentFormValues();
    const effectiveEnd = end === null ? duration : end;
    const sourceLength = Math.max(0, effectiveEnd - start);
    const actualLength = sourceLength / rate;
    segmentSummary.textContent = `原曲区间 ${formatBackingTime(start)}–${end === null ? "结尾" : formatBackingTime(end)} · 当前 ${rate.toFixed(2)}× 预计播放 ${actualLength >= 60 ? formatBackingTime(actualLength) : `${actualLength.toFixed(1)} 秒`}`;
    syncBackingBoundaryMarkers();
  }

  function syncSegmentEndControls() {
    const disabled = segmentToEnd.checked;
    segmentEndRange.disabled = disabled;
    segmentEndNumber.disabled = disabled;
    document.getElementById("useCurrentAsEnd").disabled = disabled;
    updateMeasureSegmentSummary();
  }

  function setSegmentStart(value) {
    const parsed = parseBackingTimeInput(value);
    const start = clampBackingTime(parsed, Number(segmentStartRange.value) || 0);
    segmentStartRange.value = String(start);
    segmentStartNumber.value = formatBackingTimeInput(start);
    updateMeasureSegmentSummary();
  }

  function setSegmentEnd(value) {
    const parsed = parseBackingTimeInput(value);
    const end = clampBackingTime(parsed, Number(segmentEndRange.value) || backingDurationValue());
    segmentEndRange.value = String(end);
    segmentEndNumber.value = formatBackingTimeInput(end);
    updateMeasureSegmentSummary();
  }

  function openMeasureSegmentEditor(id) {
    const measure = measureMap.get(id);
    const duration = backingDurationValue();
    if (!measure) return;
    if (!duration) {
      showVideoToast("伴奏仍在加载，请稍后再设置时间");
      return;
    }
    editingBackingMeasureId = id;
    const segment = backingSegmentFor(id);
    const start = segment ? segment.start : Math.min(backingAudio.currentTime, duration);
    const end = segment?.end ?? duration;
    const rate = segment?.rate ?? (clampBackingRate(backingAudio.playbackRate) || 1);
    measureSegmentTitle.textContent = `第 ${measure.label} 小节 · 伴奏时间`;
    [segmentStartRange, segmentEndRange].forEach((input) => { input.max = String(duration); });
    setSegmentStart(start);
    setSegmentEnd(end);
    segmentRate.value = String(rate);
    segmentRateValue.textContent = `${rate.toFixed(2)}×`;
    segmentHoldAction.value = segment?.holdAction || "video";
    segmentToEnd.checked = !segment || segment.end === null;
    syncSegmentEndControls();
    document.getElementById("deleteMeasureSegment").hidden = !segment;
    measureSegmentDialog.showModal();
    syncBackingPlayer();
  }

  function beginBackingSegmentSession(id, startValue, endValue, rateValue) {
    const duration = backingDurationValue();
    if (!duration) return { ok: false, message: "伴奏仍在加载，请稍后再试" };
    const start = Math.max(0, Math.min(duration, Number(startValue) || 0));
    const end = Math.max(start, Math.min(duration, Number(endValue)));
    if (!Number.isFinite(end) || end <= start) return { ok: false, message: "结束时间需要晚于开始时间" };
    setBackingRate(rateValue);
    activeBackingSegmentId = id;
    activeBackingSegmentStart = start;
    activeBackingSegmentEnd = end;
    backingAudio.currentTime = start;
    playBacking();
    return { ok: true, start, end };
  }

  function playEditingBackingSegment(fromStart = false) {
    if (!editingBackingMeasureId) return;
    const { start, end, rate } = segmentFormValues();
    const effectiveEnd = end === null ? backingDurationValue() : end;
    const isCurrentSession = activeBackingSegmentId === editingBackingMeasureId
      && Math.abs((activeBackingSegmentStart ?? -1) - start) < 0.05
      && Math.abs((activeBackingSegmentEnd ?? -1) - effectiveEnd) < 0.05
      && Math.abs(backingAudio.playbackRate - rate) < 0.01;
    if (!fromStart && isCurrentSession) {
      if (backingAudio.paused) playBacking();
      else pauseBacking();
      return;
    }
    const result = beginBackingSegmentSession(editingBackingMeasureId, start, effectiveEnd, rate);
    showVideoToast(result.ok ? "正在试听当前设置" : result.message);
  }

  function playBackingSegmentById(id) {
    const measure = measureMap.get(id);
    const segment = backingSegmentFor(id);
    const duration = backingDurationValue();
    if (!measure) return { ok: false, message: "没有找到对应的小节" };
    if (!segment) return { ok: false, message: `第 ${measure.label} 小节还没有设置伴奏时间` };
    if (!duration) return { ok: false, message: "伴奏仍在加载，请稍后再试" };
    const start = Math.min(segment.start, duration);
    const end = segment.end === null ? duration : Math.max(start, Math.min(segment.end, duration));
    const result = beginBackingSegmentSession(id, start, end, segment.rate);
    if (!result.ok) return result;
    const range = backingSegmentLabel({ start, end: segment.end === null ? null : end });
    showVideoToast(`第 ${measure.label} 小节伴奏 · ${range}`);
    return { ok: true, message: `正在以 ${segment.rate.toFixed(2)} 倍速播放第 ${measure.label} 小节伴奏，${range}` };
  }

  function voicePlayBackingMeasure(number) {
    const measure = measureForNumber(Number(number));
    if (!measure) return { ok: false, message: `没有找到第 ${number} 小节` };
    return playBackingSegmentById(measure.id);
  }

  function voicePlaySelectedBackingMeasure() {
    const selected = singleVoiceSelection();
    if (!selected.ok) return selected;
    return playBackingSegmentById(selected.id);
  }

  function voiceRestartBackingSegment() {
    if (!activeBackingSegmentId || !Number.isFinite(activeBackingSegmentStart)) {
      return { ok: false, message: "当前没有正在试听的小节" };
    }
    backingAudio.currentTime = activeBackingSegmentStart;
    const result = playBacking();
    syncBackingProgress();
    return result.ok === false
      ? result
      : { ok: true, message: `已从头试听第 ${measureMap.get(activeBackingSegmentId)?.label || "当前"} 小节` };
  }

  function voiceMoveBackingSegment(direction) {
    const configured = SCORE_DATA.measures.filter((measure) => Boolean(backingSegmentFor(measure.id)));
    if (!configured.length) return { ok: false, message: "目前还没有设置任何小节伴奏时间" };
    const selected = selectedIds();
    const anchorId = activeBackingSegmentId || (selected.length === 1 ? selected[0] : null);
    let currentIndex = configured.findIndex((measure) => measure.id === anchorId);
    if (currentIndex < 0) currentIndex = direction > 0 ? -1 : configured.length;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= configured.length) {
      return { ok: false, message: direction > 0 ? "已经是最后一个已设置的试听小节" : "已经是第一个已设置的试听小节" };
    }
    return playBackingSegmentById(configured[nextIndex].id);
  }

  function backingVoiceState() {
    const duration = backingDurationValue();
    const segmentActive = Boolean(activeBackingSegmentId);
    const measure = segmentActive ? measureMap.get(activeBackingSegmentId) : null;
    return {
      playing: !backingAudio.paused && !backingAudio.ended,
      started: backingAudio.currentTime > 0,
      segmentActive,
      segmentId: activeBackingSegmentId,
      segmentLabel: measure?.label || null,
      segmentStart: activeBackingSegmentStart,
      segmentEnd: activeBackingSegmentEnd,
      currentTime: backingAudio.currentTime,
      duration,
      rate: clampBackingRate(backingAudio.playbackRate) || 1
    };
  }

  function voiceDescribeBacking(kind = "all") {
    const state = backingVoiceState();
    if (kind === "rate") return { ok: true, message: `当前伴奏倍速是 ${state.rate.toFixed(2)} 倍` };
    if (kind === "measure") {
      return state.segmentActive
        ? { ok: true, message: `当前正在试听第 ${state.segmentLabel} 小节` }
        : { ok: false, message: "当前不是小节试听状态" };
    }
    if (kind === "position") {
      const current = state.segmentActive ? Math.max(0, state.currentTime - state.segmentStart) : state.currentTime;
      const total = state.segmentActive ? Math.max(0, state.segmentEnd - state.segmentStart) : state.duration;
      return {
        ok: true,
        message: state.segmentActive
          ? `第 ${state.segmentLabel} 小节试听到 ${formatBackingTime(current)}，共 ${formatBackingTime(total)}`
          : `伴奏播放到 ${formatBackingTime(current)}，共 ${formatBackingTime(total)}`
      };
    }
    return {
      ok: true,
      message: state.segmentActive
        ? `第 ${state.segmentLabel} 小节${state.playing ? "正在试听" : "已暂停"}，${state.rate.toFixed(2)} 倍速`
        : `伴奏${state.playing ? "正在播放" : state.started ? "已暂停" : "尚未开始"}，${state.rate.toFixed(2)} 倍速`
    };
  }

  function stopBackingSegmentAtBoundary() {
    if (!activeBackingSegmentId || !Number.isFinite(activeBackingSegmentEnd)) return;
    if (backingAudio.currentTime + 0.035 < activeBackingSegmentEnd) return;
    backingAudio.pause();
    backingAudio.currentTime = activeBackingSegmentEnd;
    syncBackingPlayer();
  }

  function openBackingSeek() {
    const duration = Number.isFinite(backingAudio.duration) ? backingAudio.duration : 0;
    if (!duration || !backingHoldStart) return false;
    const minimum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart) ? activeBackingSegmentStart : 0;
    const maximum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentEnd) ? activeBackingSegmentEnd : duration;
    const timelineDuration = Math.max(0.001, maximum - minimum);
    backingHoldStart.active = true;
    backingHoldStart.startFraction = Math.max(0, Math.min(1, (backingAudio.currentTime - minimum) / timelineDuration));
    backingSeeking = true;
    backingSeekTarget = backingAudio.currentTime;
    backingPlayer.classList.add("seeking");
    backingSeekHud.classList.add("active");
    backingSeekHud.setAttribute("aria-hidden", "false");
    syncBackingProgress();
    return true;
  }

  function closeBackingSeek() {
    backingPlayer.classList.remove("seeking");
    backingSeekHud.classList.remove("active");
    backingSeekHud.setAttribute("aria-hidden", "true");
  }

  function cancelBackingHold() {
    clearTimeout(backingHoldTimer);
    backingHoldTimer = null;
    const captureTarget = backingHoldStart?.captureTarget;
    if (captureTarget?.hasPointerCapture?.(backingHoldStart.pointerId)) {
      try { captureTarget.releasePointerCapture(backingHoldStart.pointerId); } catch (error) { /* Pointer already ended. */ }
    }
    backingPlayer.classList.remove("dragging");
    backingHoldStart = null;
  }

  function startBackingHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (backingPlayerUi.collapsed || event.target.closest("button,input,.backing-speed-drawer")) return;
    cancelBackingHold();
    const rect = backingPlayer.getBoundingClientRect();
    const captureTarget = backingPlayer;
    backingHoldStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, captureTarget, active: false, dragging: false, startFraction: 0, left: rect.left, top: rect.top };
    backingHoldTimer = setTimeout(() => {
      suppressBackingToggleUntil = Date.now() + 800;
      if (!openBackingSeek()) {
        showVideoToast("伴奏仍在加载，请稍后再试");
        cancelBackingHold();
        return;
      }
      try { captureTarget.setPointerCapture?.(event.pointerId); } catch (error) { /* Synthetic/legacy pointers can still use bubbled events. */ }
      backingHoldTimer = null;
      if (navigator.vibrate) navigator.vibrate(35);
    }, 580);
  }

  function moveBackingHold(event) {
    if (!backingHoldStart || event.pointerId !== backingHoldStart.pointerId) return;
    if (backingHoldStart.dragging) {
      event.preventDefault();
      setBackingPlayerPosition(
        backingHoldStart.left + event.clientX - backingHoldStart.x,
        backingHoldStart.top + event.clientY - backingHoldStart.y
      );
      return;
    }
    if (!backingHoldStart.active) {
      if (Math.hypot(event.clientX - backingHoldStart.x, event.clientY - backingHoldStart.y) > 10) {
        clearTimeout(backingHoldTimer);
        backingHoldTimer = null;
        backingHoldStart.dragging = true;
        backingPlayer.classList.add("dragging");
        try { backingPlayer.setPointerCapture?.(event.pointerId); } catch (error) { /* Pointer capture is optional. */ }
        setBackingPlayerPosition(
          backingHoldStart.left + event.clientX - backingHoldStart.x,
          backingHoldStart.top + event.clientY - backingHoldStart.y
        );
      }
      return;
    }
    event.preventDefault();
    const duration = Number.isFinite(backingAudio.duration) ? backingAudio.duration : 0;
    const dragWidth = Math.max(240, backingSeekTrack.getBoundingClientRect().width);
    const fraction = Math.max(0, Math.min(1, backingHoldStart.startFraction + (event.clientX - backingHoldStart.x) / dragWidth));
    const minimum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentStart) ? activeBackingSegmentStart : 0;
    const maximum = activeBackingSegmentId && Number.isFinite(activeBackingSegmentEnd) ? activeBackingSegmentEnd : duration;
    backingSeekTarget = minimum + (maximum - minimum) * fraction;
    syncBackingProgress();
  }

  function endBackingHold(event) {
    if (!backingHoldStart || event.pointerId !== backingHoldStart.pointerId) return;
    const wasActive = backingHoldStart.active;
    const wasDragging = backingHoldStart.dragging;
    if (wasActive) {
      event.preventDefault();
      if (Number.isFinite(backingSeekTarget)) backingAudio.currentTime = backingSeekTarget;
      suppressBackingToggleUntil = Date.now() + 800;
      backingSeeking = false;
      backingSeekTarget = null;
      closeBackingSeek();
    }
    if (wasDragging) {
      event.preventDefault();
      const rect = backingPlayer.getBoundingClientRect();
      backingPlayerUi.position = { left: rect.left, top: rect.top };
      saveBackingPlayerUi();
    }
    cancelBackingHold();
    if (wasActive || wasDragging) syncBackingProgress();
  }

  function handleBackingToggle() {
    if (Date.now() < suppressBackingToggleUntil) return;
    toggleBacking();
  }

  function playTutorialClip(index) {
    const clip = activeTutorialClips[index];
    if (!clip) return;
    activeTutorialClipIndex = index;
    tutorialVideo.pause();
    tutorialVideo.src = clip.src;
    tutorialVideo.poster = clip.poster;
    tutorialVideo.load();
    videoClips.querySelectorAll("button").forEach((button, buttonIndex) =>
      button.classList.toggle("active", buttonIndex === index)
    );
    const playRequest = tutorialVideo.play();
    if (playRequest) playRequest.catch(() => { /* Controls remain available when autoplay is blocked. */ });
  }

  function syncVideoScoreScale(value = videoScoreScale) {
    videoScoreScale = Math.max(0.6, Math.min(1.8, Math.round(Number(value) * 10) / 10));
    videoScoreScaleInput.value = String(videoScoreScale);
    videoScoreScaleValue.textContent = `${Math.round(videoScoreScale * 100)}%`;
    videoScoreStage.style.setProperty("--video-score-scale", videoScoreScale);
    writeStorage(VIDEO_SCORE_SCALE_KEY, videoScoreScale);
  }

  function renderTutorialScore(measure) {
    videoScoreTitle.textContent = `第 ${measure.label} 小节谱面`;
    videoScoreStage.innerHTML = "";
    const canvas = addMeasureCanvas(videoScoreStage, measure);
    canvas.classList.add("video-score-canvas");
    syncVideoScoreScale();
  }

  function openTutorial(id, initialClipIndex = 0) {
    const measure = measureMap.get(id);
    activeTutorialClips = tutorialClipsFor(id);
    if (!measure || !activeTutorialClips.length) {
      showVideoToast(measure ? `第 ${measure.label} 小节还没有教学视频` : "这个小节还没有教学视频");
      return;
    }
    activeTutorialId = id;
    videoTitle.textContent = `第 ${measure.label} 小节 · 教学视频`;
    renderTutorialScore(measure);
    videoClips.innerHTML = "";
    activeTutorialClips.forEach((clip, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = clip.label;
      button.addEventListener("click", () => playTutorialClip(index));
      videoClips.appendChild(button);
    });
    if (!videoDialog.open) videoDialog.showModal();
    playTutorialClip(Math.max(0, Math.min(activeTutorialClips.length - 1, initialClipIndex)));
  }

  function closeTutorial() {
    tutorialVideo.pause();
    tutorialVideo.removeAttribute("src");
    tutorialVideo.removeAttribute("poster");
    tutorialVideo.load();
    activeTutorialClips = [];
    activeTutorialId = null;
    activeTutorialClipIndex = -1;
    if (videoDialog.open) videoDialog.close();
  }

  function tutorialPlaylist() {
    return SCORE_DATA.measures.flatMap((measure) =>
      tutorialClipsFor(measure.id).map((clip, clipIndex) => ({ id: measure.id, measure, clip, clipIndex }))
    );
  }

  function attachTutorialLongPress(element, id) {
    const clips = tutorialClipsFor(id);
    if (clips.length) {
      element.classList.add("has-tutorial");
    }
    element.title = `${element.title ? `${element.title} · ` : ""}长按执行已设置动作（默认教学视频）`;
    let holdTimer = null;
    let suppressClickUntil = 0;
    let startX = 0;
    let startY = 0;
    const practiceCard = element.closest(".practice-card");
    const cancelHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      element.classList.remove("holding-video");
      if (practiceCard) practiceCard.draggable = true;
    };
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".frame-resizer,.card-resize-handle,.card-tools")) return;
      startX = event.clientX;
      startY = event.clientY;
      if (practiceCard) practiceCard.draggable = false;
      element.classList.add("holding-video");
      holdTimer = setTimeout(() => {
        holdTimer = null;
        suppressClickUntil = Date.now() + 1000;
        element.classList.remove("holding-video");
        if (practiceCard) practiceCard.draggable = true;
        const segment = backingSegmentFor(id);
        if (segment?.holdAction === "backing") {
          const result = playBackingSegmentById(id);
          if (!result.ok) showVideoToast(result.message);
        } else {
          openTutorial(id);
        }
      }, 650);
    });
    element.addEventListener("pointermove", (event) => {
      if (holdTimer && Math.hypot(event.clientX - startX, event.clientY - startY) > 8) cancelHold();
    });
    element.addEventListener("pointerup", cancelHold);
    element.addEventListener("pointercancel", cancelHold);
    element.addEventListener("pointerleave", cancelHold);
    element.addEventListener("contextmenu", (event) => event.preventDefault());
    element.addEventListener("click", (event) => {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  function createMeasureButton(measure, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.id = measure.id;
    button.style.left = `${measure.x}%`;
    button.style.width = `${measure.width}%`;
    const range = measure.measureStart === measure.measureEnd
      ? `第 ${measure.measureStart} 小节`
      : `第 ${measure.measureStart} 至 ${measure.measureEnd} 小节（多小节休止）`;
    button.title = `${range}；双击设置伴奏时间`;
    button.setAttribute("aria-label", `${range}，单击标记，双击设置伴奏时间`);
    button.innerHTML = `<span class="measure-label">${measure.label}</span>`;
    let markClickTimer = null;
    button.addEventListener("click", () => {
      clearTimeout(markClickTimer);
      markClickTimer = setTimeout(() => toggleMark(measure.id), 230);
    });
    attachTutorialLongPress(button, measure.id);
    attachMeasureBackingEditor(button, measure.id, () => clearTimeout(markClickTimer));
    button.classList.toggle("has-backing-segment", Boolean(backingSegmentFor(measure.id)));
    setMarkedStyle(button, measure.id);
    return button;
  }

  function buildFullScore() {
    SCORE_DATA.measures.forEach((measure) => {
      const button = createMeasureButton(measure, "measure");
      button.style.top = `${measure.y}%`;
      button.style.height = `${measure.height}%`;
      layerElement.appendChild(button);
    });
  }

  function buildPalette() {
    applyActivePreview();
    palettes.forEach((palette) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip${palette.id === activeColor ? " active" : ""}`;
      button.style.background = palette.border;
      button.title = palette.name;
      button.setAttribute("aria-label", palette.name);
      button.addEventListener("click", () => {
        activeColor = palette.id;
        applyActivePreview();
        document.getElementById("colorName").textContent = palette.name;
        document.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
        button.classList.add("active");
        refreshSelectionState();
      });
      paletteElement.appendChild(button);
    });
  }

  function addCropImage(container, crop) {
    container.style.aspectRatio = `${crop.width * SCORE_DATA.pageWidth} / ${crop.height * SCORE_DATA.pageHeight}`;
    const image = document.createElement("img");
    image.className = "crop-image";
    image.src = "assets/score.png";
    image.alt = "";
    image.draggable = false;
    image.style.width = `${10000 / crop.width}%`;
    image.style.left = `${-crop.x / crop.width * 100}%`;
    image.style.top = `${-crop.y / crop.height * 100}%`;
    container.appendChild(image);
  }

  function addMeasureCanvas(container, measure) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", `第 ${measure.label} 小节谱面`);
    const draw = () => {
      const sourceWidth = scoreSourceImage.naturalWidth;
      const sourceHeight = scoreSourceImage.naturalHeight;
      if (!sourceWidth || !sourceHeight) return;
      const sx = measure.x / 100 * sourceWidth;
      const sy = measure.y / 100 * sourceHeight;
      const sw = measure.width / 100 * sourceWidth;
      const sh = measure.height / 100 * sourceHeight;
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      canvas.getContext("2d").drawImage(scoreSourceImage, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    };
    if (scoreSourceImage.complete) draw();
    else scoreSourceImage.addEventListener("load", draw, { once: true });
    container.appendChild(canvas);
    return canvas;
  }

  function lineLabel(measures) {
    const first = measures[0];
    const last = measures[measures.length - 1];
    return `第 ${first.measureStart}—${last.measureEnd} 小节`;
  }

  function renderLine() {
    const measures = systemMeasures[lineIndex];
    const crop = { x: 0, y: measures[0].y, width: 100, height: measures[0].height };
    linePaperElement.innerHTML = "";
    addCropImage(linePaperElement, crop);
    const overlay = document.createElement("div");
    overlay.className = "line-layer";
    measures.forEach((measure) => {
      const button = createMeasureButton(measure, "line-measure");
      button.innerHTML = `<span>${measure.label}</span>`;
      setMarkedStyle(button, measure.id);
      overlay.appendChild(button);
    });
    linePaperElement.appendChild(overlay);
    document.getElementById("lineTitle").textContent = `第 ${lineIndex + 1} 行`;
    document.getElementById("lineRange").textContent = lineLabel(measures);
    document.getElementById("lineCounter").textContent = `${lineIndex + 1} / ${SCORE_DATA.systems}`;
    document.getElementById("prevLine").disabled = lineIndex === 0;
    document.getElementById("nextLine").disabled = lineIndex === SCORE_DATA.systems - 1;
    document.querySelectorAll("#lineJump button").forEach((button, index) =>
      button.classList.toggle("active", index === lineIndex)
    );
  }

  function buildLineJump() {
    const jump = document.getElementById("lineJump");
    for (let index = 0; index < SCORE_DATA.systems; index += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(index + 1);
      button.title = `第 ${index + 1} 行`;
      button.addEventListener("click", () => { lineIndex = index; renderLine(); });
      jump.appendChild(button);
    }
  }

  function cleanRows(rows) {
    const seen = new Set();
    const clean = [];
    rows.forEach((row) => {
      const valid = row.filter((id) => measureMap.has(id) && !seen.has(id) && seen.add(id));
      while (valid.length > 4) clean.push(valid.splice(0, 4));
      if (valid.length) clean.push(valid);
    });
    return clean;
  }

  function defaultRows() {
    return selectedIds().map((id) => [id]);
  }

  function ensureDraft() {
    if (draftRows === null || (!draftRows.length && !activeGroupId && !dirty && selectedIds().length)) {
      draftRows = defaultRows();
      draftSizes = {};
      activeGroupId = null;
      dirty = draftRows.length > 0;
      renderArrange();
    }
  }

  function markDraftChanged() {
    dirty = true;
    document.getElementById("dirtyBadge").classList.add("show");
    renderArrange();
  }

  function markDraftChangedLive() {
    dirty = true;
    document.getElementById("dirtyBadge").classList.add("show");
  }

  function removeFromRows(rows, id) {
    return rows.map((row) => row.filter((item) => item !== id)).filter((row) => row.length);
  }

  function cascadeRows(rows, startIndex) {
    for (let index = Math.max(0, startIndex); index < rows.length; index += 1) {
      while (rows[index].length > 4) {
        const overflow = rows[index].pop();
        if (!rows[index + 1]) rows[index + 1] = [];
        rows[index + 1].unshift(overflow);
      }
    }
    return rows.filter((row) => row.length);
  }

  function insertRelative(sourceId, targetId, side) {
    if (!sourceId || sourceId === targetId) return;
    let rows = removeFromRows(draftRows, sourceId);
    const rowIndex = rows.findIndex((row) => row.includes(targetId));
    if (rowIndex < 0) return;
    const targetIndex = rows[rowIndex].indexOf(targetId);
    rows[rowIndex].splice(targetIndex + (side === "right" ? 1 : 0), 0, sourceId);
    draftRows = cascadeRows(rows, rowIndex);
    markDraftChanged();
  }

  function moveToOwnRow(id, anchorId) {
    const originalRowIndex = draftRows.findIndex((row) => row.includes(id));
    let rows = removeFromRows(draftRows, id);
    const targetIndex = anchorId === id
      ? Math.min(originalRowIndex, rows.length)
      : anchorId ? rows.findIndex((row) => row.includes(anchorId)) : rows.length;
    rows.splice(targetIndex < 0 ? rows.length : targetIndex, 0, [id]);
    draftRows = cleanRows(rows);
    markDraftChanged();
  }

  function moveOneStep(id, direction) {
    const flat = draftRows.flat();
    const index = flat.indexOf(id);
    const target = flat[index + direction];
    if (!target) return;
    insertRelative(id, target, direction < 0 ? "left" : "right");
  }

  function removeDraftItem(id) {
    draftRows = removeFromRows(draftRows, id);
    delete draftSizes[id];
    markDraftChanged();
  }

  function customSizeFor(id) {
    const value = draftSizes[id];
    if (typeof value === "number") return { height: value };
    return value && typeof value === "object" ? value : {};
  }

  function resetDraftItemSize(id) {
    delete draftSizes[id];
    markDraftChanged();
  }

  function createDropZone(anchorId) {
    const zone = document.createElement("div");
    zone.className = "row-drop";
    zone.textContent = "放开后单独成为一行";
    zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      const sourceId = draggedId;
      draggedId = null;
      arrangeBoardElement.classList.remove("drag-active");
      if (sourceId) moveToOwnRow(sourceId, anchorId);
    });
    return zone;
  }

  function createPracticeCard(id, rowIndex) {
    const measure = measureMap.get(id);
    const card = document.createElement("article");
    card.className = "practice-card";
    card.draggable = true;
    card.dataset.id = id;
    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `<span class="drag-handle" title="拖动调整位置">⠿</span><strong>第 ${measure.label} 小节</strong><small>原谱第 ${measure.system} 行</small><div class="card-tools"><button type="button" class="color-action" data-action="color" title="使用当前颜色标记">●</button><button type="button" data-action="left" title="向前移动">←</button><button type="button" data-action="right" title="向后移动">→</button><button type="button" data-action="row" title="单独成为一行">↵</button><button type="button" class="remove" data-action="remove" title="从组合移除">×</button></div>`;
    const colorButton = head.querySelector('[data-action="color"]');
    colorButton.style.color = (paletteFor(marks[id]) || paletteFor(activeColor)).border;
    colorButton.addEventListener("click", () => { toggleMark(id); renderArrange(); });
    head.querySelector('[data-action="left"]').addEventListener("click", () => moveOneStep(id, -1));
    head.querySelector('[data-action="right"]').addEventListener("click", () => moveOneStep(id, 1));
    head.querySelector('[data-action="row"]').addEventListener("click", () => {
      const nextRow = draftRows[rowIndex + 1];
      moveToOwnRow(id, nextRow ? nextRow[0] : null);
    });
    head.querySelector('[data-action="remove"]').addEventListener("click", () => removeDraftItem(id));
    const crop = document.createElement("div");
    crop.className = "mini-crop";
    crop.dataset.backingId = id;
    crop.classList.toggle("has-backing-segment", Boolean(backingSegmentFor(id)));
    const customSize = customSizeFor(id);
    if (customSize.height) crop.style.setProperty("--card-height", `${customSize.height}px`);
    addMeasureCanvas(crop, measure);
    const resizer = document.createElement("div");
    resizer.className = "frame-resizer";
    resizer.innerHTML = '<button type="button" title="恢复当前模板大小" aria-label="恢复当前模板大小">↺</button>';
    resizer.querySelector("button").addEventListener("click", () => resetDraftItemSize(id));
    resizer.addEventListener("mousedown", (event) => event.stopPropagation());
    crop.appendChild(resizer);
    const palette = paletteFor(marks[id]);
    if (palette) card.style.borderColor = palette.border;
    const leftZone = document.createElement("div");
    leftZone.className = "side-drop-zone left";
    leftZone.textContent = "插到左边";
    const rightZone = document.createElement("div");
    rightZone.className = "side-drop-zone right";
    rightZone.textContent = "插到右边";
    [[leftZone, "left"], [rightZone, "right"]].forEach(([zone, side]) => {
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!draggedId || draggedId === id) return;
        zone.classList.add("drag-hover");
        card.classList.add("zone-active");
      });
      zone.addEventListener("dragleave", () => {
        zone.classList.remove("drag-hover");
        card.classList.remove("zone-active");
      });
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sourceId = draggedId;
        draggedId = null;
        arrangeBoardElement.classList.remove("drag-active");
        zone.classList.remove("drag-hover");
        card.classList.remove("zone-active");
        if (sourceId) insertRelative(sourceId, id, side);
      });
    });
    const cardResizeHandles = ["tl", "tr", "bl", "br"].map((corner) => {
      const handle = document.createElement("i");
      handle.className = `card-resize-handle ${corner}`;
      handle.dataset.corner = corner;
      handle.title = "拖动调整这个小节框的大小";
      return handle;
    });
    let cardResizeStart = null;
    cardResizeHandles.forEach((handle) => {
      const corner = handle.dataset.corner;
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        card.draggable = false;
        card.classList.add("resizing");
        const currentSize = customSizeFor(id);
        cardResizeStart = {
          x: event.clientX,
          y: event.clientY,
          width: currentSize.width || templateWidth,
          height: currentSize.height || templateHeight,
          corner
        };
      });
      handle.addEventListener("pointermove", (event) => {
        if (!cardResizeStart || cardResizeStart.corner !== corner) return;
        const horizontalDirection = corner.includes("l") ? -1 : 1;
        const verticalDirection = corner.includes("t") ? -1 : 1;
        const width = Math.max(120, Math.min(520, Math.round((cardResizeStart.width + (event.clientX - cardResizeStart.x) * horizontalDirection) / 5) * 5));
        const height = Math.max(70, Math.min(320, Math.round((cardResizeStart.height + (event.clientY - cardResizeStart.y) * verticalDirection) / 5) * 5));
        draftSizes[id] = { width, height };
        const slot = card.closest(".measure-slot");
        if (slot) slot.style.setProperty("--slot-width", `${width}px`);
        crop.style.setProperty("--card-height", `${height}px`);
        const rowsElement = arrangeBoardElement.querySelector(".rows");
        if (rowsElement) rowsElement.style.width = `${calculatedRowsWidth()}px`;
        markDraftChangedLive();
      });
      const finishResize = () => {
        if (!cardResizeStart) return;
        cardResizeStart = null;
        card.draggable = true;
        card.classList.remove("resizing");
      };
      handle.addEventListener("pointerup", finishResize);
      handle.addEventListener("pointercancel", finishResize);
    });
    card.append(head, crop, leftZone, rightZone, ...cardResizeHandles);
    attachTutorialLongPress(crop, id);
    attachMeasureBackingEditor(crop, id);
    card.addEventListener("dragstart", () => {
      draggedId = id;
      card.classList.add("dragging");
      arrangeBoardElement.classList.add("drag-active");
    });
    card.addEventListener("dragend", () => {
      draggedId = null;
      card.classList.remove("dragging");
      arrangeBoardElement.classList.remove("drag-active");
      document.querySelectorAll(".zone-active,.drag-hover,.drag-over").forEach((item) => item.classList.remove("zone-active", "drag-hover", "drag-over"));
    });
    return card;
  }

  function renderArrange() {
    if (draftRows === null) return;
    arrangeBoardElement.innerHTML = "";
    document.getElementById("dirtyBadge").classList.toggle("show", dirty);
    const activeGroup = groups.find((group) => group.id === activeGroupId);
    document.getElementById("arrangeTitle").textContent = activeGroup ? activeGroup.name : "当前小节组合";
    document.getElementById("saveGroup").disabled = draftRows.length === 0;
    if (!draftRows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-board";
      empty.innerHTML = `<div><strong>还没有选中的小节</strong><p>先在完整谱面中用颜色标记要练习的小节。</p><button type="button" class="soft-button">返回完整谱面</button></div>`;
      empty.querySelector("button").addEventListener("click", () => setMode("full"));
      arrangeBoardElement.appendChild(empty);
      renderGroups();
      return;
    }
    const rowsElement = document.createElement("div");
    rowsElement.className = "rows";
    rowsElement.style.width = `${calculatedRowsWidth()}px`;
    rowsElement.appendChild(createDropZone(draftRows[0][0]));
    draftRows.forEach((row, rowIndex) => {
      const rowElement = document.createElement("div");
      rowElement.className = "arrange-row";
      for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
        const slot = document.createElement("div");
        slot.className = `measure-slot${row[slotIndex] ? "" : " empty"}`;
        if (row[slotIndex]) {
          const customSize = customSizeFor(row[slotIndex]);
          if (customSize.width) slot.style.setProperty("--slot-width", `${customSize.width}px`);
          slot.appendChild(createPracticeCard(row[slotIndex], rowIndex));
        }
        rowElement.appendChild(slot);
      }
      rowsElement.appendChild(rowElement);
      const nextRow = draftRows[rowIndex + 1];
      rowsElement.appendChild(createDropZone(nextRow ? nextRow[0] : null));
    });
    arrangeBoardElement.appendChild(rowsElement);
    const note = document.createElement("p");
    note.className = "board-note";
    note.textContent = "拖到卡片左半边或右半边决定插入位置；拖到行间空隙可单独成行。";
    arrangeBoardElement.appendChild(note);
    renderGroups();
  }

  function renderGroups() {
    groupListElement.innerHTML = "";
    if (!groups.length) {
      groupListElement.innerHTML = '<div class="group-empty">还没有保存的组合</div>';
      return;
    }
    groups.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach((group) => {
      const item = document.createElement("div");
      item.className = `group-item${group.id === activeGroupId ? " active" : ""}`;
      const count = group.rows.flat().length;
      item.innerHTML = `<strong>${escapeHtml(group.name)}</strong><span>${count} 个小节 · ${group.rows.length} 行</span><div class="group-item-actions"><button type="button" data-load>读取</button><button type="button" class="delete" data-delete>删除</button></div>`;
      item.querySelector("[data-load]").addEventListener("click", () => loadGroup(group.id));
      item.querySelector("[data-delete]").addEventListener("click", () => deleteGroup(group.id));
      groupListElement.appendChild(item);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function loadGroup(id) {
    if (dirty) {
      pendingLoadGroupId = id;
      if (typeof unsavedDialog.showModal === "function") unsavedDialog.showModal();
      else if (confirm("当前组合尚未保存。确定先保存，取消则丢弃并直接读取。")) openSaveDialog();
      else doLoadGroup(id);
      return;
    }
    doLoadGroup(id);
  }

  function doLoadGroup(id) {
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    draftRows = cleanRows(group.rows.map((row) => row.slice()));
    draftSizes = { ...(group.sizes || {}) };
    const savedTemplate = group.template || (group.defaultHeight ? { width: templateWidth, height: group.defaultHeight } : null);
    if (savedTemplate) {
      templateWidth = Math.max(150, Math.min(420, Number(savedTemplate.width) || templateWidth));
      templateHeight = Math.max(80, Math.min(260, Number(savedTemplate.height) || templateHeight));
      writeStorage(TEMPLATE_SIZE_KEY, { width: templateWidth, height: templateHeight });
      syncTemplateControl();
    }
    activeGroupId = group.id;
    dirty = false;
    pendingLoadGroupId = null;
    renderArrange();
  }

  function deleteGroup(id) {
    const group = groups.find((item) => item.id === id);
    if (!group || !confirm(`确定删除练习组合“${group.name}”吗？`)) return;
    groups = groups.filter((item) => item.id !== id);
    if (activeGroupId === id) activeGroupId = null;
    writeStorage(GROUPS_KEY, groups);
    renderArrange();
  }

  function openSaveDialog() {
    const activeGroup = groups.find((group) => group.id === activeGroupId);
    groupNameInput.value = activeGroup ? activeGroup.name : "";
    if (typeof saveDialog.showModal === "function") {
      saveDialog.showModal();
      setTimeout(() => groupNameInput.focus(), 0);
    } else {
      const name = prompt("请输入练习组合名称", groupNameInput.value);
      if (name && saveNamedGroup(name) && pendingLoadGroupId) doLoadGroup(pendingLoadGroupId);
    }
  }

  function saveNamedGroup(rawName) {
    const name = rawName.trim();
    if (!name || !draftRows.length) return false;
    const now = Date.now();
    let group = groups.find((item) => item.id === activeGroupId);
    const sameName = groups.find((item) => item.name === name && item.id !== activeGroupId);
    if (sameName && !confirm(`已经有名为“${name}”的组合，是否覆盖？`)) return false;
    if (sameName) {
      if (group && group.id !== sameName.id) groups = groups.filter((item) => item.id !== group.id);
      group = sameName;
      activeGroupId = sameName.id;
    }
    if (group) {
      group.name = name;
      group.rows = draftRows.map((row) => row.slice());
      group.sizes = savedSizes();
      group.template = { width: templateWidth, height: templateHeight };
      group.defaultHeight = templateHeight;
      group.updatedAt = now;
    } else {
      group = { id: `group-${now}-${Math.random().toString(36).slice(2, 7)}`, name, rows: draftRows.map((row) => row.slice()), sizes: savedSizes(), template: { width: templateWidth, height: templateHeight }, defaultHeight: templateHeight, createdAt: now, updatedAt: now };
      groups.push(group);
      activeGroupId = group.id;
    }
    dirty = false;
    writeStorage(GROUPS_KEY, groups);
    renderArrange();
    return true;
  }

  function savedSizes() {
    const included = new Set(draftRows.flat());
    return Object.fromEntries(Object.entries(draftSizes).filter(([id]) => included.has(id)));
  }

  function calculatedRowsWidth() {
    const templateRowWidth = templateWidth * 4 + 44;
    const widestRow = Math.max(0, ...(draftRows || []).map((row) =>
      row.reduce((sum, id) => sum + (customSizeFor(id).width || templateWidth), 0) + Math.max(0, row.length - 1) * 12 + 8
    ));
    return Math.max(templateRowWidth, widestRow);
  }

  function syncTemplateControl() {
    const previewScale = 0.28;
    arrangeBoardElement.style.setProperty("--template-width", `${templateWidth}px`);
    arrangeBoardElement.style.setProperty("--template-height", `${templateHeight}px`);
    templateFrame.style.width = `${templateWidth * previewScale}px`;
    templateFrame.style.height = `${templateHeight * previewScale}px`;
    templateSizeValue.textContent = `${Math.round(templateWidth)} × ${Math.round(templateHeight)}`;
    const rowsElement = arrangeBoardElement.querySelector(".rows");
    if (rowsElement) rowsElement.style.width = `${calculatedRowsWidth()}px`;
  }

  function flashVoiceTarget(element) {
    if (!element) return;
    element.classList.remove("voice-target");
    void element.offsetWidth;
    element.classList.add("voice-target");
    setTimeout(() => element.classList.remove("voice-target"), 2300);
  }

  function voiceGoToMeasure(number) {
    const measure = SCORE_DATA.measures.find((item) => number >= item.measureStart && number <= item.measureEnd);
    if (!measure) return { ok: false, message: `没有找到第 ${number} 小节` };
    if (currentMode === "arrange") return { ok: false, message: "小节编排界面暂不执行语音指令" };

    // 语音定位是一次独占选择：清除旧标记，只保留当前目标小节。
    marks = { [measure.id]: activeColor };
    refreshSelectionState();

    if (currentMode === "full") {
      const target = layerElement.querySelector(`[data-id="${measure.id}"]`);
      requestAnimationFrame(() => {
        target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        flashVoiceTarget(target);
      });
      return { ok: true, message: `已用当前颜色标记第 ${number} 小节` };
    }

    lineIndex = measure.system - 1;
    renderLine();
    requestAnimationFrame(() => {
      const target = linePaperElement.querySelector(`[data-id="${measure.id}"]`);
      flashVoiceTarget(target);
    });
    return { ok: true, message: `已跳转并标记第 ${number} 小节` };
  }

  function voiceMoveLine(direction) {
    if (currentMode !== "line") return { ok: false, message: "默认谱面只支持“第 xx 小节”" };
    const next = lineIndex + direction;
    if (next < 0 || next >= SCORE_DATA.systems) {
      return { ok: false, message: direction > 0 ? "已经是最后一行" : "已经是第一行" };
    }
    lineIndex = next;
    renderLine();
    return { ok: true, message: direction > 0 ? "已执行：下一行" : "已执行：上一行" };
  }

  function singleVoiceSelection() {
    const ids = selectedIds();
    if (ids.length !== 1) {
      return { ok: false, message: ids.length ? "请只标记一个小节后再执行" : "请先标记一个小节" };
    }
    return { ok: true, id: ids[0], measure: measureMap.get(ids[0]) };
  }

  function voiceMoveMeasure(direction) {
    if (currentMode === "arrange") return { ok: false, message: "小节编排界面暂不执行语音指令" };
    const selected = singleVoiceSelection();
    if (!selected.ok) return selected;
    const currentIndex = SCORE_DATA.measures.findIndex((measure) => measure.id === selected.id);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= SCORE_DATA.measures.length) {
      return { ok: false, message: direction > 0 ? "已经是最后一个小节" : "已经是第一个小节" };
    }
    return voiceGoToMeasure(SCORE_DATA.measures[nextIndex].measureStart);
  }

  function voicePlayTutorial() {
    if (videoDialog.open && tutorialVideo.currentSrc) {
      const playRequest = tutorialVideo.play();
      if (playRequest) playRequest.catch(() => { /* Native controls remain available. */ });
      return { ok: true, message: "教学视频继续播放" };
    }
    const selected = singleVoiceSelection();
    if (!selected.ok) return selected;
    const clips = tutorialClipsFor(selected.id);
    if (!clips.length) return { ok: false, message: `第 ${selected.measure.label} 小节没有教学视频` };
    openTutorial(selected.id);
    return { ok: true, message: `正在播放第 ${selected.measure.label} 小节教学视频` };
  }

  function voicePauseTutorial() {
    if (!videoDialog.open) return { ok: false, message: "当前没有打开的教学视频" };
    if (tutorialVideo.paused) return { ok: true, message: "教学视频已经暂停" };
    tutorialVideo.pause();
    return { ok: true, message: "教学视频已暂停" };
  }

  function voiceMoveTutorial(direction) {
    if (!videoDialog.open || !activeTutorialId) return { ok: false, message: "当前没有打开的教学视频" };
    const playlist = tutorialPlaylist();
    const currentIndex = playlist.findIndex((item) => item.id === activeTutorialId && item.clipIndex === activeTutorialClipIndex);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= playlist.length) {
      return { ok: false, message: direction > 0 ? "已经是最后一个教学视频" : "已经是第一个教学视频" };
    }
    const target = playlist[nextIndex];
    openTutorial(target.id, target.clipIndex);
    return { ok: true, message: `已切换到第 ${target.measure.label} 小节 · ${target.clip.label}` };
  }

  function voiceCloseTutorial() {
    if (!videoDialog.open) return { ok: false, message: "当前没有打开的教学视频" };
    closeTutorial();
    return { ok: true, message: "已关闭教学视频" };
  }

  function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${mode}`));
    if (mode === "line") renderLine();
    if (mode === "arrange") ensureDraft();
    window.dispatchEvent(new CustomEvent("practice-modechange", { detail: { mode } }));
  }

  function voiceSwitchMode(mode) {
    const names = { full: "完整谱面", line: "按行练习", arrange: "小节编排" };
    if (!names[mode]) return { ok: false, message: "没有找到对应的练习界面" };
    if (videoDialog.open) closeTutorial();
    if (currentMode === mode) return { ok: true, message: `当前已经是${names[mode]}界面` };
    setMode(mode);
    return { ok: true, message: `已切换到${names[mode]}界面` };
  }

  window.DrumPracticeVoice = {
    getMode: () => currentMode,
    switchMode: voiceSwitchMode,
    goToMeasure: voiceGoToMeasure,
    nextMeasure: () => voiceMoveMeasure(1),
    prevMeasure: () => voiceMoveMeasure(-1),
    nextLine: () => voiceMoveLine(1),
    prevLine: () => voiceMoveLine(-1),
    playVideo: voicePlayTutorial,
    pauseVideo: voicePauseTutorial,
    closeVideo: voiceCloseTutorial,
    isVideoOpen: () => videoDialog.open,
    nextVideo: () => voiceMoveTutorial(1),
    prevVideo: () => voiceMoveTutorial(-1),
    playBacking,
    pauseBacking,
    setBackingRate,
    seekBacking,
    playBackingMeasure: voicePlayBackingMeasure,
    playSelectedBackingMeasure: voicePlaySelectedBackingMeasure,
    restartBackingSegment: voiceRestartBackingSegment,
    stopBackingSegment: () => activeBackingSegmentId
      ? stopBackingSegmentSession()
      : { ok: false, message: "当前没有正在试听的小节" },
    nextBackingSegment: () => voiceMoveBackingSegment(1),
    prevBackingSegment: () => voiceMoveBackingSegment(-1),
    getBackingState: backingVoiceState,
    describeBacking: voiceDescribeBacking
  };

  function updatePageScale() {
    const viewportStyle = getComputedStyle(viewportElement);
    const horizontalPadding = parseFloat(viewportStyle.paddingLeft) + parseFloat(viewportStyle.paddingRight);
    const availableWidth = Math.max(280, viewportElement.clientWidth - horizontalPadding);
    const baseWidth = window.matchMedia("(max-width: 1100px)").matches ? Math.min(910, availableWidth) : 910;
    pageElement.style.width = `${Math.round(baseWidth * zoom / 100)}px`;
    document.getElementById("zoomText").textContent = `${zoom}%`;
  }

  document.querySelectorAll(".mode-tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  document.getElementById("minus").addEventListener("click", () => {
    zoom = Math.max(70, zoom - 10); updatePageScale();
  });
  document.getElementById("plus").addEventListener("click", () => {
    zoom = Math.min(150, zoom + 10); updatePageScale();
  });
  window.addEventListener("resize", updatePageScale);
  clearElement.addEventListener("click", () => { marks = {}; refreshSelectionState(); });
  document.getElementById("prevLine").addEventListener("click", () => { if (lineIndex > 0) { lineIndex -= 1; renderLine(); } });
  document.getElementById("nextLine").addEventListener("click", () => { if (lineIndex < SCORE_DATA.systems - 1) { lineIndex += 1; renderLine(); } });
  document.getElementById("applyTemplateSize").addEventListener("click", () => {
    if (!Object.keys(draftSizes).length) return;
    draftSizes = {};
    if (draftRows?.length) markDraftChanged();
    else syncTemplateControl();
  });
  document.getElementById("resetInitialSize").addEventListener("click", () => {
    if (!confirm("将模板和所有小节框恢复为初始大小 240 × 120，是否继续？")) return;
    templateWidth = INITIAL_TEMPLATE_WIDTH;
    templateHeight = INITIAL_TEMPLATE_HEIGHT;
    draftSizes = {};
    writeStorage(TEMPLATE_SIZE_KEY, { width: templateWidth, height: templateHeight });
    syncTemplateControl();
    if (draftRows?.length) markDraftChanged();
  });
  document.getElementById("reloadSelection").addEventListener("click", () => {
    if (dirty && draftRows?.length && !confirm("重新载入会覆盖当前尚未保存的排列，是否继续？")) return;
    draftRows = defaultRows(); draftSizes = {}; activeGroupId = null; dirty = draftRows.length > 0; renderArrange();
  });
  let templateResizeStart = null;
  templateHandles.forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      templateResizeStart = { x: event.clientX, y: event.clientY, width: templateWidth, height: templateHeight, corner: handle.dataset.corner };
    });
    handle.addEventListener("pointermove", (event) => {
      if (!templateResizeStart || templateResizeStart.corner !== handle.dataset.corner) return;
      const scale = 0.28;
      const horizontalDirection = templateResizeStart.corner.includes("l") ? -1 : 1;
      const verticalDirection = templateResizeStart.corner.includes("t") ? -1 : 1;
      const nextWidth = templateResizeStart.width + (event.clientX - templateResizeStart.x) / scale * horizontalDirection;
      const nextHeight = templateResizeStart.height + (event.clientY - templateResizeStart.y) / scale * verticalDirection;
      templateWidth = Math.max(150, Math.min(420, Math.round(nextWidth / 5) * 5));
      templateHeight = Math.max(80, Math.min(260, Math.round(nextHeight / 5) * 5));
      syncTemplateControl();
    });
  });
  function finishTemplateResize() {
    if (!templateResizeStart) return;
    templateResizeStart = null;
    writeStorage(TEMPLATE_SIZE_KEY, { width: templateWidth, height: templateHeight });
    if (draftRows?.length) markDraftChanged();
    else syncTemplateControl();
  }
  templateHandles.forEach((handle) => {
    handle.addEventListener("pointerup", finishTemplateResize);
    handle.addEventListener("pointercancel", finishTemplateResize);
  });
  document.getElementById("saveGroup").addEventListener("click", () => { pendingLoadGroupId = null; openSaveDialog(); });
  document.getElementById("cancelSave").addEventListener("click", () => { pendingLoadGroupId = null; saveDialog.close(); });
  saveDialog.addEventListener("cancel", () => { pendingLoadGroupId = null; });
  document.getElementById("saveForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const shouldLoad = pendingLoadGroupId;
    if (saveNamedGroup(groupNameInput.value)) {
      saveDialog.close();
      if (shouldLoad) doLoadGroup(shouldLoad);
    }
  });
  document.getElementById("cancelLoad").addEventListener("click", () => { pendingLoadGroupId = null; unsavedDialog.close(); });
  document.getElementById("discardLoad").addEventListener("click", () => {
    const id = pendingLoadGroupId; unsavedDialog.close(); if (id) doLoadGroup(id);
  });
  document.getElementById("saveThenLoad").addEventListener("click", () => { unsavedDialog.close(); openSaveDialog(); });
  document.getElementById("closeVideo").addEventListener("click", closeTutorial);
  videoDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeTutorial(); });
  videoDialog.addEventListener("click", (event) => { if (event.target === videoDialog) closeTutorial(); });
  backingPlayer.addEventListener("pointerdown", startBackingHold);
  backingPlayer.addEventListener("pointermove", moveBackingHold, { passive: false });
  backingPlayer.addEventListener("pointerup", endBackingHold);
  backingPlayer.addEventListener("pointercancel", endBackingHold);
  backingPlayer.addEventListener("contextmenu", (event) => { if (backingHoldStart?.active) event.preventDefault(); });
  backingDisc.addEventListener("click", handleBackingToggle);
  backingToggle.addEventListener("click", toggleBacking);
  backingInlineProgress.addEventListener("input", () => setBackingInlinePosition(backingInlineProgress.value));
  document.getElementById("backingSlower").addEventListener("click", () => setBackingRate(backingAudio.playbackRate - 0.05, true));
  document.getElementById("backingFaster").addEventListener("click", () => setBackingRate(backingAudio.playbackRate + 0.05, true));
  backingInlineRate.addEventListener("input", () => setBackingRate(backingInlineRate.value));
  backingInlineRate.addEventListener("change", () => showVideoToast(`伴奏速率：${backingAudio.playbackRate.toFixed(2)} 倍`));
  backingInlineRateValue.addEventListener("click", (event) => { event.stopPropagation(); toggleBackingSpeedDrawer(); });
  backingCollapse.addEventListener("click", () => setBackingPlayerCollapsed(!backingPlayerUi.collapsed));
  document.addEventListener("click", (event) => {
    if (!backingSpeedDrawer.contains(event.target) && event.target !== backingInlineRateValue) toggleBackingSpeedDrawer(false);
  });
  window.addEventListener("resize", () => {
    if (!backingPlayerUi.collapsed && backingPlayerUi.position) setBackingPlayerPosition(backingPlayerUi.position.left, backingPlayerUi.position.top, true);
  });
  document.getElementById("stopBackingSegment").addEventListener("click", () => stopBackingSegmentSession());
  backingSettingsButton.addEventListener("click", openBackingSettings);
  document.getElementById("closeBackingSettings").addEventListener("click", () => backingSettingsDialog.close());
  backingSettingsDialog.addEventListener("click", (event) => { if (event.target === backingSettingsDialog) backingSettingsDialog.close(); });
  backingSettingsProgress.addEventListener("input", () => setBackingPosition(backingSettingsProgress.value));
  backingRate.addEventListener("input", () => setBackingRate(backingRate.value));
  backingRate.addEventListener("change", () => showVideoToast(`伴奏速率：${backingAudio.playbackRate.toFixed(2)} 倍`));
  segmentPlaybackToggle.addEventListener("click", () => playEditingBackingSegment(false));
  segmentPlaybackProgress.addEventListener("input", () => setBackingPosition(segmentPlaybackProgress.value, { clearSegment: true }));
  segmentStartRange.addEventListener("input", () => setSegmentStart(segmentStartRange.value));
  segmentStartNumber.addEventListener("change", () => setSegmentStart(segmentStartNumber.value));
  segmentEndRange.addEventListener("input", () => setSegmentEnd(segmentEndRange.value));
  segmentEndNumber.addEventListener("change", () => setSegmentEnd(segmentEndNumber.value));
  segmentToEnd.addEventListener("change", syncSegmentEndControls);
  segmentRate.addEventListener("input", () => {
    const rate = clampBackingRate(segmentRate.value) || 1;
    segmentRateValue.textContent = `${rate.toFixed(2)}×`;
    updateMeasureSegmentSummary();
  });
  document.getElementById("useCurrentAsStart").addEventListener("click", () => setSegmentStart(backingAudio.currentTime));
  document.getElementById("useCurrentAsEnd").addEventListener("click", () => setSegmentEnd(backingAudio.currentTime));
  document.getElementById("closeMeasureSegment").addEventListener("click", () => measureSegmentDialog.close());
  measureSegmentDialog.addEventListener("click", (event) => { if (event.target === measureSegmentDialog) measureSegmentDialog.close(); });
  document.getElementById("exportBackingConfig").addEventListener("click", exportUnifiedBackingConfig);
  document.getElementById("restoreRepositoryConfig").addEventListener("click", restoreRepositoryBackingConfig);
  document.getElementById("previewMeasureSegment").addEventListener("click", () => {
    playEditingBackingSegment(true);
  });
  document.getElementById("deleteMeasureSegment").addEventListener("click", () => {
    if (!editingBackingMeasureId) return;
    delete backingSegments[editingBackingMeasureId];
    writeStorage(BACKING_SEGMENTS_KEY, backingSegments);
    if (activeBackingSegmentId === editingBackingMeasureId) {
      stopBackingSegmentSession({ pause: true, notify: false });
    }
    refreshBackingSegmentIndicators();
    measureSegmentDialog.close();
    showVideoToast("已删除这个小节的伴奏时间");
  });
  measureSegmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!editingBackingMeasureId) return;
    const { start, end, rate, holdAction } = segmentFormValues();
    const effectiveEnd = end === null ? backingDurationValue() : end;
    if (effectiveEnd <= start) { showVideoToast("结束时间需要晚于开始时间"); return; }
    backingSegments[editingBackingMeasureId] = { start, end, rate, holdAction };
    writeStorage(BACKING_SEGMENTS_KEY, backingSegments);
    refreshBackingSegmentIndicators();
    measureSegmentDialog.close();
    showVideoToast("小节伴奏时间已保存");
  });
  videoScoreScaleInput.addEventListener("input", () => syncVideoScoreScale(videoScoreScaleInput.value));
  backingAudio.addEventListener("play", syncBackingPlayer);
  backingAudio.addEventListener("pause", syncBackingPlayer);
  backingAudio.addEventListener("ended", () => {
    if (activeBackingSegmentId && Number.isFinite(activeBackingSegmentEnd)) backingAudio.currentTime = activeBackingSegmentEnd;
    syncBackingPlayer();
  });
  backingAudio.addEventListener("ratechange", syncBackingPlayer);
  backingAudio.addEventListener("loadedmetadata", syncBackingProgress);
  backingAudio.addEventListener("durationchange", syncBackingProgress);
  backingAudio.addEventListener("timeupdate", () => { stopBackingSegmentAtBoundary(); syncBackingProgress(); });
  backingAudio.addEventListener("error", () => {
    backingStatus.textContent = "伴奏加载失败";
    backingPlayer.classList.remove("playing");
  });
  document.addEventListener("keydown", (event) => {
    if (!document.getElementById("view-line").classList.contains("active")) return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) || saveDialog.open || unsavedDialog.open || videoDialog.open || backingSettingsDialog.open || measureSegmentDialog.open || backingHoldStart?.active) return;
    if (event.key === "ArrowLeft" && lineIndex > 0) { event.preventDefault(); lineIndex -= 1; renderLine(); }
    if (event.key === "ArrowRight" && lineIndex < SCORE_DATA.systems - 1) { event.preventDefault(); lineIndex += 1; renderLine(); }
  });

  buildPalette();
  setBackingRate(readStorage(BACKING_RATE_KEY, clampBackingRate(repositoryBackingConfig.globalRate) || 1));
  setBackingPlayerCollapsed(Boolean(backingPlayerUi.collapsed), false);
  if (!backingPlayerUi.collapsed && backingPlayerUi.position) requestAnimationFrame(() => setBackingPlayerPosition(backingPlayerUi.position.left, backingPlayerUi.position.top));
  syncVideoScoreScale(videoScoreScale);
  syncTemplateControl();
  buildFullScore();
  updatePageScale();
  buildLineJump();
  renderLine();
  renderGroups();
  refreshSelectionState();
})();
