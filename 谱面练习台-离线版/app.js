(function () {
  "use strict";

  const palettes = [
    { id: "blue", name: "专注蓝", fill: "rgba(73,111,236,.18)", border: "#496fec" },
    { id: "yellow", name: "练习黄", fill: "rgba(244,183,64,.24)", border: "#e2a328" },
    { id: "coral", name: "难点红", fill: "rgba(235,100,91,.2)", border: "#df5e55" },
    { id: "green", name: "完成绿", fill: "rgba(62,166,124,.2)", border: "#32966c" }
  ];
  const measureMap = new Map(SCORE_DATA.measures.map((measure) => [measure.id, measure]));
  const systemMeasures = Array.from({ length: SCORE_DATA.systems }, (_, index) =>
    SCORE_DATA.measures.filter((measure) => measure.system === index + 1)
  );
  const MARKS_KEY = "drum-focus-marks";
  const GROUPS_KEY = "drum-focus-groups-v1";
  const DEFAULT_SIZE_KEY = "drum-focus-default-card-height";
  const TEMPLATE_SIZE_KEY = "drum-focus-template-size-v1";
  const INITIAL_TEMPLATE_WIDTH = 240;
  const INITIAL_TEMPLATE_HEIGHT = 120;
  let activeColor = "blue";
  let zoom = 100;
  let lineIndex = 0;
  let marks = readStorage(MARKS_KEY, {});
  let groups = readStorage(GROUPS_KEY, []);
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

  function setMarkedStyle(element, id) {
    const palette = paletteFor(marks[id]);
    element.classList.toggle("marked", Boolean(palette));
    element.style.backgroundColor = palette ? palette.fill : "";
    element.style.borderColor = palette ? palette.border : "";
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
    button.title = range;
    button.setAttribute("aria-label", `${range}，单击标记`);
    button.innerHTML = `<span class="measure-label">${measure.label}</span>`;
    button.addEventListener("click", () => toggleMark(measure.id));
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
    palettes.forEach((palette) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip${palette.id === activeColor ? " active" : ""}`;
      button.style.background = palette.border;
      button.title = palette.name;
      button.setAttribute("aria-label", palette.name);
      button.addEventListener("click", () => {
        activeColor = palette.id;
        document.getElementById("colorName").textContent = palette.name;
        document.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
        button.classList.add("active");
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

  function resizeDraftItem(id, axis, delta) {
    const current = customSizeFor(id);
    const base = axis === "width" ? (current.width || templateWidth) : (current.height || templateHeight);
    const minimum = axis === "width" ? 120 : 70;
    const maximum = axis === "width" ? 520 : 320;
    draftSizes[id] = { ...current, [axis]: Math.max(minimum, Math.min(maximum, base + delta)) };
    markDraftChanged();
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
    const customSize = customSizeFor(id);
    if (customSize.height) crop.style.setProperty("--card-height", `${customSize.height}px`);
    addMeasureCanvas(crop, measure);
    const resizer = document.createElement("div");
    resizer.className = "frame-resizer";
    resizer.innerHTML = '<button type="button" title="缩小这个框的宽度">W−</button><button type="button" title="缩小这个框的高度">H−</button><button type="button" title="恢复模板大小">↺</button><button type="button" title="增大这个框的高度">H＋</button><button type="button" title="增大这个框的宽度">W＋</button>';
    const resizeButtons = resizer.querySelectorAll("button");
    resizeButtons[0].addEventListener("click", () => resizeDraftItem(id, "width", -20));
    resizeButtons[1].addEventListener("click", () => resizeDraftItem(id, "height", -20));
    resizeButtons[2].addEventListener("click", () => resetDraftItemSize(id));
    resizeButtons[3].addEventListener("click", () => resizeDraftItem(id, "height", 20));
    resizeButtons[4].addEventListener("click", () => resizeDraftItem(id, "width", 20));
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

  function setMode(mode) {
    document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${mode}`));
    if (mode === "line") renderLine();
    if (mode === "arrange") ensureDraft();
  }

  document.querySelectorAll(".mode-tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  document.getElementById("minus").addEventListener("click", () => {
    zoom = Math.max(70, zoom - 10); pageElement.style.width = `${zoom * 9.1}px`; document.getElementById("zoomText").textContent = `${zoom}%`;
  });
  document.getElementById("plus").addEventListener("click", () => {
    zoom = Math.min(150, zoom + 10); pageElement.style.width = `${zoom * 9.1}px`; document.getElementById("zoomText").textContent = `${zoom}%`;
  });
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
  document.addEventListener("keydown", (event) => {
    if (!document.getElementById("view-line").classList.contains("active")) return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) || saveDialog.open || unsavedDialog.open) return;
    if (event.key === "ArrowLeft" && lineIndex > 0) { event.preventDefault(); lineIndex -= 1; renderLine(); }
    if (event.key === "ArrowRight" && lineIndex < SCORE_DATA.systems - 1) { event.preventDefault(); lineIndex += 1; renderLine(); }
  });

  buildPalette();
  syncTemplateControl();
  buildFullScore();
  buildLineJump();
  renderLine();
  renderGroups();
  refreshSelectionState();
})();
