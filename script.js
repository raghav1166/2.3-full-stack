/**
 * SVG freehand drawing tool using pointer events.
 * - Creates <path> elements inside #strokes group
 * - Supports color, stroke width, undo, clear, save-as-png
 * - Uses pointer capture to follow single pointer reliably
 */

const svg = document.getElementById("canvas");
const strokesGroup = document.getElementById("strokes");
const colorPicker = document.getElementById("colorPicker");
const widthRange = document.getElementById("widthRange");
const clearBtn = document.getElementById("clearBtn");
const saveBtn = document.getElementById("saveBtn");
const undoBtn = document.getElementById("undoBtn");

let drawing = false;
let currentPath = null;
let currentPoints = [];
let strokeHistory = []; // store created <path> elements for undo

// Convert pointer coords to SVG coordinates, using getBoundingClientRect + viewBox transform
function getSvgPoint(event) {
  const rect = svg.getBoundingClientRect();
  // viewBox is 0 0 1000 600 in this example
  const vbWidth = 1000;
  const vbHeight = 600;
  const x = ((event.clientX - rect.left) / rect.width) * vbWidth;
  const y = ((event.clientY - rect.top) / rect.height) * vbHeight;
  return { x, y };
}

// Start a new path
function beginStroke(event) {
  // Only left mouse button or pen/touch
  if (event.pointerType === "mouse" && event.button !== 0) return;

  drawing = true;
  svg.setPointerCapture(event.pointerId);

  const p = getSvgPoint(event);
  currentPoints = [p];
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "stroke");
  path.setAttribute("stroke", colorPicker.value);
  path.setAttribute("stroke-width", widthRange.value);
  path.setAttribute("fill", "none");
  path.setAttribute("d", `M ${p.x} ${p.y}`);
  path.style.pointerEvents = "none";

  currentPath = path;
  strokesGroup.appendChild(path);
}

// Add points to current path (we'll build a smooth polyline-style path)
function continueStroke(event) {
  if (!drawing || !currentPath) return;
  const p = getSvgPoint(event);
  currentPoints.push(p);

  // For performance: build path using quadratic bezier smoothing
  if (currentPoints.length < 3) {
    currentPath.setAttribute("d", currentPath.getAttribute("d") + ` L ${p.x} ${p.y}`);
    return;
  }

  // Smooth using midpoints for a nicer curve
  let d = `M ${currentPoints[0].x} ${currentPoints[0].y}`;
  for (let i = 1; i < currentPoints.length - 1; i++) {
    const midX = (currentPoints[i].x + currentPoints[i + 1].x) / 2;
    const midY = (currentPoints[i].y + currentPoints[i + 1].y) / 2;
    d += ` Q ${currentPoints[i].x} ${currentPoints[i].y} ${midX} ${midY}`;
  }
  // add the last point as a line
  const last = currentPoints[currentPoints.length - 1];
  d += ` L ${last.x} ${last.y}`;
  currentPath.setAttribute("d", d);
}

// Finish stroke
function endStroke(event) {
  if (!drawing) return;
  drawing = false;
  try { svg.releasePointerCapture(event.pointerId); } catch (e) {}
  if (!currentPath) return;

  // If path is essentially empty, remove it
  if (currentPoints.length < 2) {
    strokesGroup.removeChild(currentPath);
  } else {
    // ensure final attributes match current controls
    currentPath.setAttribute("stroke", colorPicker.value);
    currentPath.setAttribute("stroke-width", widthRange.value);
    strokeHistory.push(currentPath);
  }
  currentPath = null;
  currentPoints = [];
}

// Undo last stroke
function undoLast() {
  const last = strokeHistory.pop();
  if (last && last.parentNode) last.parentNode.removeChild(last);
}

// Clear all strokes
function clearAll() {
  strokeHistory = [];
  while (strokesGroup.firstChild) strokesGroup.removeChild(strokesGroup.firstChild);
}

// Save as PNG: serialize SVG then draw to canvas and call toDataURL
function saveAsPng() {
  // Clone the svg to avoid modifying original
  const clone = svg.cloneNode(true);

  // Remove pointer-capture rects if any and ensure background rect visible
  // set explicit width/height for the export canvas (use viewBox size)
  const vb = { width: 1000, height: 600 }; // must match the viewBox in index.html
  clone.setAttribute("width", vb.width);
  clone.setAttribute("height", vb.height);

  // Prepare XML
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clone);

  // Add name spaces if missing
  if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)) {
    svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!svgString.match(/^<svg[^>]+"http:\/\/www.w3.org\/1999\/xlink"/)) {
    svgString = svgString.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  // Create image and canvas
  const img = new Image();
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = vb.width;
    canvas.height = vb.height;
    const ctx = canvas.getContext("2d");

    // Optional: white background (otherwise transparent)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    // Trigger download
    const pngUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `drawing_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  img.onerror = (e) => {
    URL.revokeObjectURL(url);
    alert("Could not save image — this may be blocked by browser in some environments.");
  };

  img.src = url;
}

/* === Event wiring === */
svg.addEventListener("pointerdown", (e) => beginStroke(e));
svg.addEventListener("pointermove", (e) => continueStroke(e));
svg.addEventListener("pointerup", (e) => endStroke(e));
svg.addEventListener("pointercancel", (e) => endStroke(e));
svg.addEventListener("pointerleave", (e) => {
  // If user drags outside, still continue tracking until pointerup — but pointerleave means pointer left svg; do not end automatically
});

// Buttons
clearBtn.addEventListener("click", clearAll);
undoBtn.addEventListener("click", undoLast);
saveBtn.addEventListener("click", saveAsPng);

// Optional: keyboard shortcut 'z' for undo (Ctrl/Cmd+Z would normally trigger browser undo)
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undoLast();
  }
});
