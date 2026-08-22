const STORAGE_KEY = "tiny-tile-studio-state-v1";
const MAX_GRID_SIZE = 128;
const HISTORY_LIMIT = 80;
const DEFAULT_PALETTE = [
  "#ff6f91",
  "#ff9671",
  "#ffc75f",
  "#f9f871",
  "#7bc043",
  "#00c2a8",
  "#0081cf",
  "#5f4b8b",
  "#2f4858",
  "#f4e9d8",
  "#c97b84",
  "#8f5f3f",
];

const elements = {
  canvas: document.querySelector("#pixel-canvas"),
  gridWidth: document.querySelector("#grid-width"),
  gridHeight: document.querySelector("#grid-height"),
  applyGrid: document.querySelector("#apply-grid"),
  zoomLevel: document.querySelector("#zoom-level"),
  zoomValue: document.querySelector("#zoom-value"),
  toolButtons: [...document.querySelectorAll("[data-tool]")],
  undoButton: document.querySelector("#undo-button"),
  redoButton: document.querySelector("#redo-button"),
  colorPicker: document.querySelector("#color-picker"),
  hexInput: document.querySelector("#hex-input"),
  applyHex: document.querySelector("#apply-hex"),
  addPalette: document.querySelector("#add-palette"),
  useTransparent: document.querySelector("#use-transparent"),
  paletteSwatches: document.querySelector("#palette-swatches"),
  selectedColorLabel: document.querySelector("#selected-color-label"),
  selectedColorChip: document.querySelector("#selected-color-chip"),
  fileName: document.querySelector("#file-name"),
  exportScale: document.querySelector("#export-scale"),
  backgroundMode: document.querySelector("#background-mode"),
  backgroundColor: document.querySelector("#background-color"),
  backgroundColorField: document.querySelector("#background-color-field"),
  exportButtons: [...document.querySelectorAll("[data-export-type]")],
  importProjectButton: document.querySelector("#import-project-button"),
  importProjectInput: document.querySelector("#import-project-input"),
  newProject: document.querySelector("#new-project"),
  clearCanvas: document.querySelector("#clear-canvas"),
  toggleGrid: document.querySelector("#toggle-grid"),
  gridStatus: document.querySelector("#grid-status"),
  toolStatus: document.querySelector("#tool-status"),
  pointerStatus: document.querySelector("#pointer-status"),
  statusMessage: document.querySelector("#status-message"),
  presetButtons: [...document.querySelectorAll("[data-preset-size]")],
};

const ctx = elements.canvas.getContext("2d");

const state = {
  width: 16,
  height: 16,
  zoom: 22,
  showGrid: true,
  tool: "brush",
  selectedColor: "#ff6f91",
  palette: [...DEFAULT_PALETTE],
  cells: Array(16 * 16).fill(null),
  history: [],
  future: [],
  pointerDown: false,
  lastCellIndex: null,
  hoverCell: null,
  selection: null,
  selectionDraft: null,
  selectionDrag: null,
  fileName: "tiny-tile-art",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeFileName(value) {
  const cleaned = value.trim().replace(/[^a-z0-9-_]+/gi, "-");
  return cleaned || "tiny-tile-art";
}

function normalizeHex(value) {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  if (/^#[\da-f]{3}$/i.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[\da-f]{6}$/i.test(withHash)) {
    return withHash.toLowerCase();
  }

  return null;
}

function createEmptyCells(width, height) {
  return Array(width * height).fill(null);
}

function getIndex(x, y, width = state.width) {
  return y * width + x;
}

function getCoordinates(index, width = state.width) {
  return {
    x: index % width,
    y: Math.floor(index / width),
  };
}

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function snapshotState() {
  return {
    width: state.width,
    height: state.height,
    cells: state.cells.slice(),
  };
}

function restoreSnapshot(snapshot) {
  state.width = snapshot.width;
  state.height = snapshot.height;
  state.cells = snapshot.cells.slice();
  state.pointerDown = false;
  state.lastCellIndex = null;
  state.hoverCell = null;
  clearSelection();
}

function syncInputsFromState() {
  elements.gridWidth.value = String(state.width);
  elements.gridHeight.value = String(state.height);
  elements.zoomLevel.value = String(state.zoom);
  elements.zoomValue.textContent = `${state.zoom} px`;
  elements.colorPicker.value = state.selectedColor;
  elements.hexInput.value = state.selectedColor;
  elements.fileName.value = state.fileName;
  elements.gridStatus.textContent = `${state.width} x ${state.height}`;
  elements.toolStatus.textContent = toolLabel(state.tool);
  elements.toggleGrid.textContent = state.showGrid ? "Hide Grid" : "Show Grid";
  elements.backgroundColorField.classList.toggle(
    "is-hidden",
    elements.backgroundMode.value !== "custom",
  );
}

function toolLabel(tool) {
  if (tool === "eraser") {
    return "Eraser";
  }

  if (tool === "eyedropper") {
    return "Eyedropper";
  }

  if (tool === "select") {
    return "Select";
  }

  return "Brush";
}

function getCanvasCursor() {
  if (state.selectionDrag) {
    return "grabbing";
  }

  if (state.tool === "eyedropper") {
    return "copy";
  }

  if (state.tool === "select") {
    if (state.hoverCell !== null && state.selection) {
      const { x, y } = getCoordinates(state.hoverCell);

      if (isPointInsideSelection(x, y)) {
        return "grab";
      }
    }

    return "crosshair";
  }

  return "crosshair";
}

function renderSelectedColor() {
  const isTransparent = state.tool === "eraser";
  elements.selectedColorLabel.textContent = isTransparent
    ? "Transparent"
    : state.selectedColor.toUpperCase();
  elements.selectedColorChip.style.setProperty(
    "--swatch-color",
    isTransparent ? "transparent" : state.selectedColor,
  );
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === state.tool);
  });
}

function drawCheckerboard(context, width, height, size) {
  context.fillStyle = "#f8f3ec";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ece3d8";

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const isOffset = ((x / size) + (y / size)) % 2 === 0;

      if (isOffset) {
        context.fillRect(x, y, size, size);
      }
    }
  }
}

function renderCanvas() {
  elements.canvas.width = state.width * state.zoom;
  elements.canvas.height = state.height * state.zoom;
  elements.canvas.style.width = `${state.width * state.zoom}px`;
  elements.canvas.style.height = `${state.height * state.zoom}px`;
  elements.canvas.style.cursor = getCanvasCursor();
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  drawCheckerboard(ctx, elements.canvas.width, elements.canvas.height, Math.max(6, Math.floor(state.zoom / 2)));

  for (let index = 0; index < state.cells.length; index += 1) {
    const color = state.cells[index];

    if (!color) {
      continue;
    }

    const { x, y } = getCoordinates(index);
    ctx.fillStyle = color;
    ctx.fillRect(x * state.zoom, y * state.zoom, state.zoom, state.zoom);
  }

  if (state.selectionDrag?.committed) {
    drawSelectionCells(ctx, state.selectionDrag, state.selectionDrag.targetX, state.selectionDrag.targetY, 0.9);
  }

  if (state.showGrid) {
    ctx.strokeStyle = "rgba(23, 50, 68, 0.18)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= state.width; x += 1) {
      const position = x * state.zoom + 0.5;
      ctx.beginPath();
      ctx.moveTo(position, 0);
      ctx.lineTo(position, elements.canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= state.height; y += 1) {
      const position = y * state.zoom + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, position);
      ctx.lineTo(elements.canvas.width, position);
      ctx.stroke();
    }
  }

  if (state.selectionDraft) {
    drawSelectionFrame(getSelectionBounds(state.selectionDraft), false);
  } else if (state.selectionDrag) {
    drawSelectionFrame(
      {
        x: state.selectionDrag.committed ? state.selectionDrag.targetX : state.selectionDrag.originX,
        y: state.selectionDrag.committed ? state.selectionDrag.targetY : state.selectionDrag.originY,
        width: state.selectionDrag.width,
        height: state.selectionDrag.height,
      },
      true,
    );
  } else if (state.selection) {
    drawSelectionFrame(state.selection, true);
  }

  if (state.hoverCell !== null) {
    const { x, y } = getCoordinates(state.hoverCell);
    ctx.strokeStyle = "rgba(255, 122, 89, 0.9)";
    ctx.lineWidth = Math.max(2, Math.floor(state.zoom / 10));
    ctx.strokeRect(
      x * state.zoom + 1,
      y * state.zoom + 1,
      state.zoom - 2,
      state.zoom - 2,
    );
  }
}

function renderPalette() {
  elements.paletteSwatches.innerHTML = "";

  state.palette.forEach((color, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch-button";
    button.title = color.toUpperCase();
    button.style.setProperty("--swatch-color", color);
    button.classList.toggle(
      "is-active",
      state.tool !== "eraser" && state.selectedColor === color,
    );

    button.addEventListener("click", () => {
      state.selectedColor = color;
      state.tool = "brush";
      renderAll();
      setStatus(`Selected ${color.toUpperCase()}.`);
      persistState();
    });

    button.addEventListener("dblclick", () => {
      if (DEFAULT_PALETTE.includes(color)) {
        setStatus("Starter palette colors stay pinned.");
        return;
      }

      state.palette.splice(index, 1);
      renderPalette();
      persistState();
      setStatus(`Removed ${color.toUpperCase()} from the saved palette.`);
    });

    elements.paletteSwatches.append(button);
  });
}

function renderPointerStatus() {
  if (state.hoverCell === null) {
    elements.pointerStatus.textContent = "Cell --";
    return;
  }

  const { x, y } = getCoordinates(state.hoverCell);
  elements.pointerStatus.textContent = `Cell ${x + 1}, ${y + 1}`;
}

function renderAll() {
  syncInputsFromState();
  renderSelectedColor();
  renderPalette();
  renderPointerStatus();
  renderCanvas();
  elements.undoButton.disabled = state.history.length === 0;
  elements.redoButton.disabled = state.future.length === 0;
}

function persistState() {
  const payload = {
    width: state.width,
    height: state.height,
    zoom: state.zoom,
    showGrid: state.showGrid,
    tool: state.tool,
    selectedColor: state.selectedColor,
    palette: state.palette,
    cells: state.cells,
    fileName: state.fileName,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to persist project locally", error);
  }
}

function restoreState() {
  let saved = null;

  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to access local storage", error);
    setStatus("Local auto-save is unavailable in this browser.");
  }

  if (!saved) {
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    const width = clamp(Number(parsed.width) || 16, 1, MAX_GRID_SIZE);
    const height = clamp(Number(parsed.height) || 16, 1, MAX_GRID_SIZE);
    const cells = Array.isArray(parsed.cells) ? parsed.cells.slice(0, width * height) : [];

    state.width = width;
    state.height = height;
    state.zoom = clamp(Number(parsed.zoom) || 22, 8, 36);
    state.showGrid = parsed.showGrid !== false;
    state.tool = ["brush", "eraser", "eyedropper", "select"].includes(parsed.tool)
      ? parsed.tool
      : "brush";
    state.selectedColor = normalizeHex(parsed.selectedColor || "") || "#ff6f91";
    state.palette = Array.isArray(parsed.palette)
      ? [...new Set(parsed.palette.map((item) => normalizeHex(item || "")).filter(Boolean))]
      : [...DEFAULT_PALETTE];
    state.palette = [...DEFAULT_PALETTE, ...state.palette.filter((color) => !DEFAULT_PALETTE.includes(color))];
    state.fileName = sanitizeFileName(parsed.fileName || "tiny-tile-art");
    state.cells = createEmptyCells(width, height).map((_, index) => {
      const value = cells[index];
      return normalizeHex(value || "") || null;
    });
  } catch (error) {
    console.warn("Unable to restore previous project", error);
    setStatus("Could not restore the previous local draft.");
  }
}

function commitHistorySnapshot() {
  state.history.push(snapshotState());

  if (state.history.length > HISTORY_LIMIT) {
    state.history.shift();
  }

  state.future = [];
}

function clearSelection() {
  state.selection = null;
  state.selectionDraft = null;
  state.selectionDrag = null;
}

function getSelectionBounds(draft) {
  return {
    x: Math.min(draft.startX, draft.endX),
    y: Math.min(draft.startY, draft.endY),
    width: Math.abs(draft.endX - draft.startX) + 1,
    height: Math.abs(draft.endY - draft.startY) + 1,
  };
}

function buildSelection(bounds) {
  const cells = [];

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      cells.push(state.cells[getIndex(bounds.x + x, bounds.y + y)]);
    }
  }

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    cells,
  };
}

function isPointInsideSelection(x, y, selection = state.selection) {
  if (!selection) {
    return false;
  }

  return (
    x >= selection.x
    && x < selection.x + selection.width
    && y >= selection.y
    && y < selection.y + selection.height
  );
}

function drawSelectionCells(context, selection, baseX, baseY, opacity = 1) {
  context.save();
  context.globalAlpha = opacity;

  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      const color = selection.cells[y * selection.width + x];

      if (!color) {
        continue;
      }

      context.fillStyle = color;
      context.fillRect(
        (baseX + x) * state.zoom,
        (baseY + y) * state.zoom,
        state.zoom,
        state.zoom,
      );
    }
  }

  context.restore();
}

function drawSelectionFrame(rect, isCommittedSelection) {
  const x = rect.x * state.zoom;
  const y = rect.y * state.zoom;
  const width = rect.width * state.zoom;
  const height = rect.height * state.zoom;

  ctx.save();
  ctx.fillStyle = isCommittedSelection
    ? "rgba(78, 191, 169, 0.14)"
    : "rgba(255, 122, 89, 0.12)";
  ctx.fillRect(x, y, width, height);
  ctx.setLineDash([Math.max(4, Math.floor(state.zoom / 2)), Math.max(3, Math.floor(state.zoom / 3))]);
  ctx.lineWidth = Math.max(2, Math.floor(state.zoom / 9));
  ctx.strokeStyle = isCommittedSelection
    ? "rgba(24, 87, 80, 0.96)"
    : "rgba(239, 91, 57, 0.96)";
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, width - 6, height - 6);
  ctx.restore();
}

function clearSelectionArea(selection) {
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      state.cells[getIndex(selection.x + x, selection.y + y)] = null;
    }
  }
}

function stampSelection(selection, targetX, targetY) {
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      state.cells[getIndex(targetX + x, targetY + y)] = selection.cells[y * selection.width + x];
    }
  }
}

function clampSelectionTarget(targetX, targetY, selection) {
  return {
    x: clamp(targetX, 0, state.width - selection.width),
    y: clamp(targetY, 0, state.height - selection.height),
  };
}

function applyGridResize(width, height) {
  const nextWidth = clamp(width, 1, MAX_GRID_SIZE);
  const nextHeight = clamp(height, 1, MAX_GRID_SIZE);
  const nextCells = createEmptyCells(nextWidth, nextHeight);

  for (let y = 0; y < Math.min(state.height, nextHeight); y += 1) {
    for (let x = 0; x < Math.min(state.width, nextWidth); x += 1) {
      nextCells[getIndex(x, y, nextWidth)] = state.cells[getIndex(x, y, state.width)];
    }
  }

  state.width = nextWidth;
  state.height = nextHeight;
  state.cells = nextCells;
  state.hoverCell = null;
  clearSelection();
  persistState();
  renderAll();
  setStatus(`Grid resized to ${nextWidth} x ${nextHeight}.`);
}

function setTool(tool) {
  if (tool !== "select") {
    if (state.selectionDrag?.committed) {
      finishSelectionDrag(true);
    }

    clearSelection();
  }

  state.tool = tool;
  renderAll();
  persistState();

  if (tool === "eraser") {
    setStatus("Eraser selected. Painted cells will become transparent.");
    return;
  }

  if (tool === "eyedropper") {
    setStatus("Eyedropper selected. Click any tile to sample its color.");
    return;
  }

  if (tool === "select") {
    setStatus("Selection selected. Drag a box, then drag the box to move it.");
    return;
  }

  setStatus(`Brush selected with ${state.selectedColor.toUpperCase()}.`);
}

function writeCell(index, color) {
  if (state.cells[index] === color) {
    return false;
  }

  state.cells[index] = color;
  return true;
}

function sampleCell(index) {
  const color = state.cells[index];

  if (!color) {
    state.tool = "eraser";
    renderAll();
    persistState();
    setStatus("Picked transparency. You are now on the eraser.");
    return;
  }

  state.selectedColor = color;
  state.tool = "brush";
  renderAll();
  persistState();
  setStatus(`Picked ${color.toUpperCase()} from the grid.`);
}

function paintCell(index, forceErase = false) {
  const color = forceErase || state.tool === "eraser" ? null : state.selectedColor;
  const changed = writeCell(index, color);

  if (changed) {
    renderCanvas();
    persistState();
  }
}

function getCanvasCell(event) {
  const rect = elements.canvas.getBoundingClientRect();
  const relativeX = event.clientX - rect.left;
  const relativeY = event.clientY - rect.top;

  if (relativeX < 0 || relativeY < 0 || relativeX > rect.width || relativeY > rect.height) {
    return null;
  }

  const x = clamp(Math.floor(relativeX / state.zoom), 0, state.width - 1);
  const y = clamp(Math.floor(relativeY / state.zoom), 0, state.height - 1);
  return getIndex(x, y);
}

function handleSelectionStart(event, cellIndex) {
  if (event.button !== 0) {
    return;
  }

  const { x, y } = getCoordinates(cellIndex);
  state.pointerDown = true;
  state.lastCellIndex = cellIndex;
  elements.canvas.setPointerCapture(event.pointerId);

  if (state.selection && isPointInsideSelection(x, y)) {
    state.selectionDraft = null;
    state.selectionDrag = {
      originX: state.selection.x,
      originY: state.selection.y,
      targetX: state.selection.x,
      targetY: state.selection.y,
      width: state.selection.width,
      height: state.selection.height,
      cells: state.selection.cells.slice(),
      offsetX: x - state.selection.x,
      offsetY: y - state.selection.y,
      committed: false,
    };
    renderCanvas();
    setStatus("Drag to move the selected block.");
    return;
  }

  state.selection = null;
  state.selectionDrag = null;
  state.selectionDraft = {
    startX: x,
    startY: y,
    endX: x,
    endY: y,
  };
  renderCanvas();
}

function handleSelectionMove(cellIndex) {
  if (cellIndex === null) {
    renderCanvas();
    return;
  }

  const { x, y } = getCoordinates(cellIndex);

  if (state.selectionDraft) {
    state.selectionDraft.endX = x;
    state.selectionDraft.endY = y;
    renderCanvas();
    return;
  }

  if (!state.selectionDrag) {
    renderCanvas();
    return;
  }

  const nextTarget = clampSelectionTarget(
    x - state.selectionDrag.offsetX,
    y - state.selectionDrag.offsetY,
    state.selectionDrag,
  );

  if (
    !state.selectionDrag.committed
    && (
      nextTarget.x !== state.selectionDrag.originX
      || nextTarget.y !== state.selectionDrag.originY
    )
  ) {
    commitHistorySnapshot();
    clearSelectionArea(state.selection);
    state.selectionDrag.committed = true;
  }

  state.selectionDrag.targetX = nextTarget.x;
  state.selectionDrag.targetY = nextTarget.y;
  renderCanvas();
}

function finishSelectionDrag(cancelMove = false) {
  if (state.selectionDrag?.committed) {
    const targetX = cancelMove ? state.selectionDrag.originX : state.selectionDrag.targetX;
    const targetY = cancelMove ? state.selectionDrag.originY : state.selectionDrag.targetY;

    stampSelection(state.selectionDrag, targetX, targetY);
    state.selection = {
      x: targetX,
      y: targetY,
      width: state.selectionDrag.width,
      height: state.selectionDrag.height,
      cells: state.selectionDrag.cells.slice(),
    };
    persistState();
    renderAll();
    setStatus(
      cancelMove
        ? "Selection move canceled."
        : `Selection moved to ${targetX + 1}, ${targetY + 1}.`,
    );
  } else if (state.selectionDrag) {
    renderCanvas();
    setStatus("Selection ready. Drag inside it to move the block.");
  }

  state.selectionDrag = null;
}

function finishSelectionDraft() {
  const bounds = getSelectionBounds(state.selectionDraft);
  state.selectionDraft = null;
  state.selection = buildSelection(bounds);
  renderAll();
  setStatus(`Selected ${bounds.width} x ${bounds.height}. Drag inside it to move it.`);
}

function handlePaintStart(event) {
  const cellIndex = getCanvasCell(event);

  if (cellIndex === null) {
    return;
  }

  if (state.tool === "select") {
    handleSelectionStart(event, cellIndex);
    return;
  }

  state.pointerDown = true;
  state.lastCellIndex = cellIndex;
  elements.canvas.setPointerCapture(event.pointerId);

  if (event.button === 2) {
    commitHistorySnapshot();
    paintCell(cellIndex, true);
    return;
  }

  if (state.tool === "eyedropper") {
    sampleCell(cellIndex);
    state.pointerDown = false;
    return;
  }

  commitHistorySnapshot();
  paintCell(cellIndex);
}

function handlePaintMove(event) {
  const cellIndex = getCanvasCell(event);
  state.hoverCell = cellIndex;
  renderPointerStatus();

  if (state.tool === "select") {
    if (!state.pointerDown) {
      renderCanvas();
      return;
    }

    handleSelectionMove(cellIndex);
    return;
  }

  if (cellIndex === null) {
    renderCanvas();
    return;
  }

  if (!state.pointerDown) {
    renderCanvas();
    return;
  }

  if (cellIndex === state.lastCellIndex) {
    renderCanvas();
    return;
  }

  state.lastCellIndex = cellIndex;
  const forceErase = event.buttons === 2;
  paintCell(cellIndex, forceErase);
}

function handlePaintEnd(event) {
  if (state.tool === "select") {
    if (state.selectionDraft) {
      finishSelectionDraft();
    } else if (state.selectionDrag) {
      finishSelectionDrag();
    }
  }

  state.pointerDown = false;
  state.lastCellIndex = null;

  if (elements.canvas.hasPointerCapture(event.pointerId)) {
    elements.canvas.releasePointerCapture(event.pointerId);
  }
}

function handlePaintCancel(event) {
  if (state.tool === "select") {
    if (state.selectionDraft) {
      state.selectionDraft = null;
    } else if (state.selectionDrag) {
      finishSelectionDrag(true);
    }
  }

  handlePaintEnd(event);
  state.hoverCell = null;
  renderPointerStatus();
  renderCanvas();
}

function downloadBlob(blob, extension) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${sanitizeFileName(state.fileName)}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function resolveBackgroundColor(requestedFormat) {
  const mode = elements.backgroundMode.value;

  if (mode === "custom") {
    return elements.backgroundColor.value;
  }

  if (mode === "white") {
    return "#ffffff";
  }

  if (requestedFormat === "jpeg") {
    setStatus("JPEG cannot keep transparency, so a white background was used.");
    return "#ffffff";
  }

  return null;
}

function buildRasterCanvas(format) {
  const scale = clamp(Number(elements.exportScale.value) || 4, 1, 64);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = state.width * scale;
  exportCanvas.height = state.height * scale;
  const exportContext = exportCanvas.getContext("2d");
  const backgroundColor = resolveBackgroundColor(format);

  if (backgroundColor) {
    exportContext.fillStyle = backgroundColor;
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  for (let index = 0; index < state.cells.length; index += 1) {
    const color = state.cells[index];

    if (!color) {
      continue;
    }

    const { x, y } = getCoordinates(index);
    exportContext.fillStyle = color;
    exportContext.fillRect(x * scale, y * scale, scale, scale);
  }

  return exportCanvas;
}

function exportRaster(format) {
  const mimeType = {
    png: "image/png",
    webp: "image/webp",
    jpeg: "image/jpeg",
  }[format];

  const canvas = buildRasterCanvas(format);
  canvas.toBlob((blob) => {
    if (!blob) {
      setStatus(`The ${format.toUpperCase()} export failed.`);
      return;
    }

    downloadBlob(blob, format === "jpeg" ? "jpg" : format);
    if (format === "jpeg" && elements.backgroundMode.value === "transparent") {
      setStatus("JPEG exported with a white background.");
      return;
    }

    setStatus(`${format.toUpperCase()} exported.`);
  }, mimeType);
}

function exportSvg() {
  const backgroundColor = resolveBackgroundColor("svg");
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}" shape-rendering="crispEdges">`,
  ];

  if (backgroundColor) {
    parts.push(`<rect width="${state.width}" height="${state.height}" fill="${backgroundColor}" />`);
  }

  state.cells.forEach((color, index) => {
    if (!color) {
      return;
    }

    const { x, y } = getCoordinates(index);
    parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" />`);
  });

  parts.push(`</svg>`);
  downloadBlob(new Blob([parts.join("")], { type: "image/svg+xml;charset=utf-8" }), "svg");
  setStatus("SVG exported.");
}

function exportProject() {
  const payload = {
    app: "Tiny Tile Studio",
    version: 1,
    width: state.width,
    height: state.height,
    zoom: state.zoom,
    showGrid: state.showGrid,
    selectedColor: state.selectedColor,
    palette: state.palette,
    fileName: state.fileName,
    cells: state.cells,
  };

  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    "json",
  );
  setStatus("Project exported.");
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(imageUrl);
        resolve(image);
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error("Unable to decode PNG image."));
      },
      { once: true },
    );
    image.src = imageUrl;
  });
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function importPng(file) {
  try {
    const image = await loadImageFile(file);
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    if (width < 1 || height < 1) {
      setStatus("That PNG does not contain a valid image.");
      return;
    }

    if (width > MAX_GRID_SIZE || height > MAX_GRID_SIZE) {
      setStatus(
        `That PNG is ${width} x ${height}. Images must be ${MAX_GRID_SIZE} x ${MAX_GRID_SIZE} or smaller.`,
      );
      return;
    }

    const importCanvas = document.createElement("canvas");
    importCanvas.width = width;
    importCanvas.height = height;
    const importContext = importCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!importContext) {
      throw new Error("Unable to create an image import canvas.");
    }

    importContext.drawImage(image, 0, 0);
    const pixelData = importContext.getImageData(0, 0, width, height).data;
    const nextCells = createEmptyCells(width, height);
    let semiTransparentPixels = 0;

    for (let index = 0; index < nextCells.length; index += 1) {
      const offset = index * 4;
      const alpha = pixelData[offset + 3];

      if (alpha === 0) {
        continue;
      }

      if (alpha < 255) {
        semiTransparentPixels += 1;
      }

      nextCells[index] = rgbToHex(
        pixelData[offset],
        pixelData[offset + 1],
        pixelData[offset + 2],
      );
    }

    commitHistorySnapshot();
    state.width = width;
    state.height = height;
    state.cells = nextCells;
    state.fileName = sanitizeFileName(file.name.replace(/\.png$/i, ""));
    state.hoverCell = null;
    clearSelection();
    persistState();
    renderAll();

    if (semiTransparentPixels > 0) {
      setStatus(
        `Loaded ${file.name} as a ${width} x ${height} grid. Semi-transparent pixels were imported as solid colors.`,
      );
      return;
    }

    setStatus(`Loaded ${file.name} as a ${width} x ${height} grid.`);
  } catch (error) {
    console.error(error);
    setStatus("That PNG could not be loaded by Tiny Tile Studio.");
  }
}

function importProject(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const width = clamp(Number(parsed.width) || 16, 1, MAX_GRID_SIZE);
      const height = clamp(Number(parsed.height) || 16, 1, MAX_GRID_SIZE);
      const nextCells = createEmptyCells(width, height);

      nextCells.forEach((_, index) => {
        const value = Array.isArray(parsed.cells) ? parsed.cells[index] : null;
        nextCells[index] = normalizeHex(value || "") || null;
      });

      state.width = width;
      state.height = height;
      state.zoom = clamp(Number(parsed.zoom) || state.zoom, 8, 36);
      state.showGrid = parsed.showGrid !== false;
      state.selectedColor = normalizeHex(parsed.selectedColor || "") || state.selectedColor;
      state.palette = Array.isArray(parsed.palette)
        ? [...DEFAULT_PALETTE, ...parsed.palette
            .map((item) => normalizeHex(item || ""))
            .filter((color) => color && !DEFAULT_PALETTE.includes(color))]
        : [...DEFAULT_PALETTE];
      state.fileName = sanitizeFileName(parsed.fileName || state.fileName);
      state.cells = nextCells;
      state.history = [];
      state.future = [];
      state.hoverCell = null;
      clearSelection();
      persistState();
      renderAll();
      setStatus(`Loaded ${file.name}.`);
    } catch (error) {
      console.error(error);
      setStatus("That file could not be loaded as a Tiny Tile Studio project.");
    }
  });

  reader.readAsText(file);
}

function importFile(file) {
  if (!file) {
    return;
  }

  const lowerName = file.name.toLowerCase();

  if (file.type === "image/png" || lowerName.endsWith(".png")) {
    importPng(file);
    return;
  }

  if (file.type === "application/json" || lowerName.endsWith(".json")) {
    importProject(file);
    return;
  }

  setStatus("Choose a PNG image or a Tiny Tile Studio project JSON file.");
}

function clearGrid() {
  if (!window.confirm("Clear every painted tile and leave the grid transparent?")) {
    return;
  }

  commitHistorySnapshot();
  state.cells = createEmptyCells(state.width, state.height);
  clearSelection();
  persistState();
  renderAll();
  setStatus("Grid cleared.");
}

function resetProject() {
  if (!window.confirm("Start a fresh project and remove the current drawing?")) {
    return;
  }

  state.width = 16;
  state.height = 16;
  state.zoom = 22;
  state.showGrid = true;
  state.tool = "brush";
  state.selectedColor = "#ff6f91";
  state.palette = [...DEFAULT_PALETTE];
  state.cells = createEmptyCells(16, 16);
  state.history = [];
  state.future = [];
  state.hoverCell = null;
  clearSelection();
  state.fileName = "tiny-tile-art";
  persistState();
  renderAll();
  setStatus("Fresh project ready.");
}

function undo() {
  if (state.history.length === 0) {
    return;
  }

  state.future.push(snapshotState());
  restoreSnapshot(state.history.pop());
  persistState();
  renderAll();
  setStatus("Undid the last change.");
}

function redo() {
  if (state.future.length === 0) {
    return;
  }

  state.history.push(snapshotState());
  restoreSnapshot(state.future.pop());
  persistState();
  renderAll();
  setStatus("Redid the change.");
}

function handleHexApply() {
  const normalized = normalizeHex(elements.hexInput.value);

  if (!normalized) {
    setStatus("Enter a valid 3-digit or 6-digit hex color.");
    elements.hexInput.value = state.selectedColor;
    return;
  }

  state.selectedColor = normalized;
  state.tool = "brush";
  renderAll();
  persistState();
  setStatus(`Color changed to ${normalized.toUpperCase()}.`);
}

function addCurrentColorToPalette() {
  if (state.palette.includes(state.selectedColor)) {
    setStatus(`${state.selectedColor.toUpperCase()} is already saved in the palette.`);
    return;
  }

  state.palette.push(state.selectedColor);
  renderPalette();
  persistState();
  setStatus(`Saved ${state.selectedColor.toUpperCase()} to the palette.`);
}

function handleExport(type) {
  state.fileName = sanitizeFileName(elements.fileName.value);
  persistState();
  renderAll();

  if (type === "svg") {
    exportSvg();
    return;
  }

  if (type === "json") {
    exportProject();
    return;
  }

  exportRaster(type);
}

function bindEvents() {
  elements.applyGrid.addEventListener("click", () => {
    const width = clamp(Number(elements.gridWidth.value) || state.width, 1, MAX_GRID_SIZE);
    const height = clamp(Number(elements.gridHeight.value) || state.height, 1, MAX_GRID_SIZE);
    commitHistorySnapshot();
    applyGridResize(width, height);
  });

  elements.zoomLevel.addEventListener("input", () => {
    state.zoom = clamp(Number(elements.zoomLevel.value) || 22, 8, 36);
    persistState();
    renderAll();
  });

  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTool(button.dataset.tool);
    });
  });

  elements.undoButton.addEventListener("click", undo);
  elements.redoButton.addEventListener("click", redo);

  elements.colorPicker.addEventListener("input", () => {
    state.selectedColor = elements.colorPicker.value.toLowerCase();
    state.tool = "brush";
    renderAll();
    persistState();
  });

  elements.hexInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleHexApply();
    }
  });
  elements.applyHex.addEventListener("click", handleHexApply);
  elements.addPalette.addEventListener("click", addCurrentColorToPalette);
  elements.useTransparent.addEventListener("click", () => setTool("eraser"));

  elements.backgroundMode.addEventListener("change", () => {
    renderAll();
  });

  elements.exportButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleExport(button.dataset.exportType);
    });
  });

  elements.importProjectButton.addEventListener("click", () => {
    elements.importProjectInput.click();
  });

  elements.importProjectInput.addEventListener("change", (event) => {
    importFile(event.target.files?.[0]);
    event.target.value = "";
  });

  elements.newProject.addEventListener("click", resetProject);
  elements.clearCanvas.addEventListener("click", clearGrid);
  elements.toggleGrid.addEventListener("click", () => {
    state.showGrid = !state.showGrid;
    persistState();
    renderAll();
    setStatus(state.showGrid ? "Grid lines are visible." : "Grid lines are hidden.");
  });

  elements.fileName.addEventListener("change", () => {
    state.fileName = sanitizeFileName(elements.fileName.value);
    persistState();
    renderAll();
  });

  elements.presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const size = clamp(Number(button.dataset.presetSize) || 16, 1, MAX_GRID_SIZE);
      commitHistorySnapshot();
      applyGridResize(size, size);
    });
  });

  elements.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  elements.canvas.addEventListener("pointerdown", handlePaintStart);
  elements.canvas.addEventListener("pointermove", handlePaintMove);
  elements.canvas.addEventListener("pointerup", handlePaintEnd);
  elements.canvas.addEventListener("pointercancel", handlePaintCancel);
  elements.canvas.addEventListener("pointerleave", () => {
    state.hoverCell = null;
    renderPointerStatus();
    renderCanvas();
  });

  window.addEventListener("keydown", (event) => {
    const metaOrCtrl = event.metaKey || event.ctrlKey;

    if (metaOrCtrl && event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }

    if (metaOrCtrl && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }

    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }

    if (event.key.toLowerCase() === "b") {
      setTool("brush");
    } else if (event.key.toLowerCase() === "e") {
      setTool("eraser");
    } else if (event.key.toLowerCase() === "i") {
      setTool("eyedropper");
    } else if (event.key.toLowerCase() === "s") {
      setTool("select");
    } else if (event.key === "Escape" && (state.selection || state.selectionDraft || state.selectionDrag)) {
      if (state.selectionDrag?.committed) {
        finishSelectionDrag(true);
      }

      clearSelection();
      renderAll();
      setStatus("Selection cleared.");
    }
  });
}

restoreState();
bindEvents();
renderAll();
