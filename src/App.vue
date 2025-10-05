<template>
  <div>
    <!-- Menú flotante -->
    <div class="floating-menu" @click="toggleMenu">
      <span class="material-icons">menu</span>
    </div>

    <div v-if="menuOpen" class="menu-expanded">
      <button @click="setMode('draw')">✏️ Pincel</button>
      <button @click="setMode('eraser')">🧹 Borrador</button>
      <button @click="setMode('hand')">✋ Mano</button>

      <label>Color:</label>
      <input type="color" v-model="color"/>

      <label>Grosor:</label>
      <input type="range" min="1" max="50" v-model="lineWidth"/>

      <button @click="undoAction">↩️ Deshacer</button>
      <button @click="redoAction">↪️ Rehacer</button>

      <button @click="clearCanvas">🧹 Limpiar Todo</button>
      <button @click="saveCanvas">💾 Guardar</button>
    </div>

    <div ref="container" class="canvas-container"
         @mousedown="startHandDrag"
         @mousemove="handDrag"
         @mouseup="stopHandDrag"
         @mouseleave="stopHandDrag"
         @touchstart.prevent="handleTouchStart"
         @touchmove.prevent="handleTouchMove"
         @touchend.prevent="stopDrawing">
      <canvas
        ref="canvas"
        width="3000"
        height="2000"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="stopDrawing"
      ></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { io } from "socket.io-client";

// ✅ Cambia esta URL por la de tu backend en Render
const socket = io(import.meta.env.VITE_BACKEND_URL); // ✅ BIEN


const canvas = ref(null);
const container = ref(null);
let ctx = null;

// Estado general
let drawing = false;
let lastPos = { x: 0, y: 0 };
let mode = ref("draw");

// Parámetros de pincel
const color = ref("#000000");
const lineWidth = ref(4);

// Menú
const menuOpen = ref(false);
const toggleMenu = () => (menuOpen.value = !menuOpen.value);

// Mano
let handDragging = false;
let startX = 0;
let startY = 0;
let offsetX = 0;
let offsetY = 0;

// Fondo
const backgroundColor = ref("#ffffff");

// Historial local
let strokes = [];

// === MONTAJE ===
onMounted(() => {
  ctx = canvas.value.getContext("2d");
  updateCursor();
  drawCanvas();

  // Recibir historial inicial
  socket.on("init", (data) => {
    strokes = data;
    drawCanvas();
  });

  // Dibujos en tiempo real
  socket.on("drawing", (data) => {
    strokes.push(data);
    drawStroke(data);
  });

  // Sincronizar historia (undo/redo)
  socket.on("syncHistory", (data) => {
    strokes = data;
    drawCanvas();
  });

  // Limpiar
  socket.on("clear", () => {
    strokes = [];
    drawCanvas();
  });
});

// === CURSOR ===
function updateCursor() {
  if (!canvas.value) return;
  switch (mode.value) {
    case "draw":
    case "eraser":
      canvas.value.style.cursor = "crosshair";
      break;
    case "hand":
      canvas.value.style.cursor = handDragging ? "grabbing" : "grab";
      break;
    default:
      canvas.value.style.cursor = "default";
  }
}

// === DIBUJO ===
const handleMouseDown = (e) => {
  if (mode.value === "hand") return;
  drawing = true;
  lastPos = getMousePos(e);
};

const handleMouseMove = (e) => {
  if (!drawing) return;
  const pos = getMousePos(e);
  const drawColor = mode.value === "eraser" ? backgroundColor.value : color.value;

  ctx.strokeStyle = drawColor;
  ctx.lineWidth = lineWidth.value;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(lastPos.x, lastPos.y);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.closePath();

  const data = {
    type: "draw",
    x1: lastPos.x,
    y1: lastPos.y,
    x2: pos.x,
    y2: pos.y,
    color: drawColor,
    lineWidth: lineWidth.value,
  };
  strokes.push(data);
  socket.emit("drawing", data);

  lastPos = pos;
};

const stopDrawing = () => {
  drawing = false;
};

// === BOTONES ===
const clearCanvas = () => {
  strokes = [];
  socket.emit("clear");
  drawCanvas();
};

const saveCanvas = () => {
  const link = document.createElement("a");
  link.download = "pizarra.png";
  link.href = canvas.value.toDataURL();
  link.click();
};

const undoAction = () => socket.emit("undo");
const redoAction = () => socket.emit("redo");

// === MANO ===
const startHandDrag = (e) => {
  if (mode.value !== "hand") return;
  handDragging = true;
  updateCursor();
  startX = e.clientX || e.touches?.[0]?.clientX;
  startY = e.clientY || e.touches?.[0]?.clientY;
};

const handDrag = (e) => {
  if (!handDragging) return;
  const clientX = e.clientX || e.touches?.[0]?.clientX;
  const clientY = e.clientY || e.touches?.[0]?.clientY;
  offsetX += clientX - startX;
  offsetY += clientY - startY;
  startX = clientX;
  startY = clientY;
  drawCanvas();
};

const stopHandDrag = () => {
  handDragging = false;
  updateCursor();
};

// === TOUCH ===
const handleTouchStart = (e) => {
  if (mode.value === "hand") startHandDrag(e);
  else handleMouseDown(e.touches[0]);
};
const handleTouchMove = (e) => {
  if (mode.value === "hand") handDrag(e);
  else handleMouseMove(e.touches[0]);
};

// === AUX ===
function getMousePos(e) {
  const rect = canvas.value.getBoundingClientRect();
  return { x: e.clientX - rect.left - offsetX, y: e.clientY - rect.top - offsetY };
}

function drawCanvas() {
  ctx.fillStyle = backgroundColor.value;
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
  strokes.forEach(drawStroke);
}

function drawStroke(s) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.lineWidth;
  ctx.beginPath();
  ctx.moveTo(s.x1 + offsetX, s.y1 + offsetY);
  ctx.lineTo(s.x2 + offsetX, s.y2 + offsetY);
  ctx.stroke();
  ctx.closePath();
}
</script>

<style>
.canvas-container {
  width: 100vw;
  height: 100vh;
  background: #fff;
  position: relative;
  overflow: hidden;
  touch-action: none;
}

canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.floating-menu {
  position: fixed;
  top: 20px;
  left: 20px;
  background: #1e1e1e;
  color: white;
  padding: 10px;
  border-radius: 50%;
  cursor: pointer;
  z-index: 10;
}

.menu-expanded {
  position: fixed;
  top: 70px;
  left: 20px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 10;
}
</style>


