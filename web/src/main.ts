import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ===========================
// Configuración
// ===========================
const DEFAULT_WS_URL = "ws://192.168.68.108:81";
const MODEL_URL = "/models/nave.glb";

// Umbral de advertencia (grados)
const LIMITE_ACTITUD_DEG = 75;

// Suavizado EMA (0 = nada, 0.15~0.25 recomendado)
const SMOOTHING = 0.18;

// ===========================
// UI
// ===========================
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("No encuentro #app. Revisa tu index.html.");

app.innerHTML = `
  <div class="fc-root">
    <canvas id="scene"></canvas>

    <div class="fc-hud">
      <header class="fc-topbar">
        <div class="fc-brand">
          <div class="fc-brand__title">Antonio Richaud · Flight Console</div>
          <div class="fc-brand__sub">ESP32 + MPU6050 · WebSocket · Telemetría en tiempo real</div>
        </div>

        <div class="fc-conn">
          <span class="fc-pill" id="wsStatus">WS: desconectado</span>
          <input class="fc-input" id="wsUrl" value="${DEFAULT_WS_URL}" />
          <button class="fc-btn" id="btnConnect">Conectar</button>
          <button class="fc-btn fc-btn--ghost" id="btnCalibrate">Calibrar</button>
        </div>
      </header>

      <aside class="fc-panel">
        <div class="fc-panel__title">TELEMETRÍA</div>

        <div class="fc-grid">
          <div class="fc-card">
            <div class="fc-card__k">ROLL</div>
            <div class="fc-card__v" id="vRoll">—</div>
            <div class="fc-card__u">°</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">PITCH</div>
            <div class="fc-card__v" id="vPitch">—</div>
            <div class="fc-card__u">°</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">YAW</div>
            <div class="fc-card__v" id="vYaw">—</div>
            <div class="fc-card__u">°</div>
          </div>

          <div class="fc-card">
            <div class="fc-card__k">AX</div>
            <div class="fc-card__v" id="vAx">—</div>
            <div class="fc-card__u">g</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">AY</div>
            <div class="fc-card__v" id="vAy">—</div>
            <div class="fc-card__u">g</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">AZ</div>
            <div class="fc-card__v" id="vAz">—</div>
            <div class="fc-card__u">g</div>
          </div>

          <div class="fc-card fc-card--wide">
            <div class="fc-card__k">FUERZA G (TOTAL)</div>
            <div class="fc-card__v" id="vG">—</div>
            <div class="fc-card__u">g</div>
          </div>
        </div>

        <div class="fc-warn" id="warnBox" style="display:none;">
          <div class="fc-warn__t">⚠ LÍMITE DE ACTITUD</div>
          <div class="fc-warn__d">
            Estás en ángulos extremos. Se vale, pero el yaw puede derivar (no hay magnetómetro).
          </div>
        </div>

        <div class="fc-footer">
          <div class="fc-footer__line">
            <span class="fc-dot" id="dotData"></span>
            <span id="dataStatus">Esperando datos…</span>
          </div>
          <div class="fc-footer__hint">Tip: calibra con la nave quieta y “nivelada”.</div>
        </div>
      </aside>

      <div class="fc-hudlines"></div>
    </div>
  </div>
`;

// CSS (overridea Vite + HUD futurista + canvas full-screen)
const style = document.createElement("style");
style.textContent = `
  /* OVERRIDE del template Vite (este es el culpable del "no ocupa toda la pantalla") */
  html, body { width: 100%; height: 100%; margin: 0 !important; padding: 0 !important; }
  body { display: block !important; place-items: initial !important; }
  #app {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  :root { color-scheme: dark; }

  .fc-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #030507;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    color: #d7fff2;
  }

  /* Canvas FULLSCREEN real */
  #scene {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  /* HUD overlay */
  .fc-hud {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .fc-topbar, .fc-panel { pointer-events: auto; }

  /* Scanlines / grid suave */
  .fc-hud::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(900px 700px at 20% 10%, rgba(0,255,170,.10), transparent 55%),
      radial-gradient(900px 700px at 80% 20%, rgba(0,160,255,.10), transparent 60%),
      linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px);
    background-size: auto, auto, 42px 42px, 42px 42px;
    opacity: .55;
    mix-blend-mode: screen;
    pointer-events: none;
  }

  .fc-hudlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      rgba(0,255,170,.035),
      rgba(0,255,170,.035) 1px,
      transparent 1px,
      transparent 5px
    );
    opacity: .18;
    animation: scan 5.5s linear infinite;
    pointer-events: none;
  }
  @keyframes scan {
    0% { transform: translateY(0); }
    100% { transform: translateY(10px); }
  }

  /* TOP BAR (flotante) */
  .fc-topbar {
    position: absolute;
    top: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border-radius: 18px;
    border: 1px solid rgba(0,255,170,.22);
    background: rgba(0,0,0,.40);
    backdrop-filter: blur(10px);
    box-shadow: 0 0 0 1px rgba(0,255,170,.08), 0 10px 30px rgba(0,0,0,.45);
  }

  .fc-brand__title {
    font-size: 14px;
    font-weight: 900;
    letter-spacing: .5px;
    text-transform: uppercase;
  }
  .fc-brand__sub {
    margin-top: 3px;
    font-size: 12px;
    opacity: .75;
  }

  .fc-conn {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .fc-pill {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(0,255,170,.28);
    background: rgba(0,0,0,.35);
    font-size: 12px;
    color: #b7ffe9;
  }

  .fc-input {
    width: 270px;
    padding: 9px 10px;
    border-radius: 12px;
    border: 1px solid rgba(0,255,170,.25);
    background: rgba(0,0,0,.35);
    color: #d7fff2;
    outline: none;
  }

  .fc-btn {
    padding: 9px 12px;
    border-radius: 12px;
    border: 1px solid rgba(0,255,170,.30);
    background: rgba(0,255,170,.10);
    color: #d7fff2;
    cursor: pointer;
    font-weight: 800;
    letter-spacing: .3px;
  }
  .fc-btn:hover { background: rgba(0,255,170,.16); }
  .fc-btn--ghost {
    background: rgba(0,0,0,.25);
  }
  .fc-btn--ghost:hover { background: rgba(0,0,0,.35); }

  /* PANEL IZQ flotante */
  .fc-panel {
    position: absolute;
    top: 92px;
    left: 16px;
    width: 360px;
    max-height: calc(100vh - 110px);
    overflow: auto;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid rgba(0,255,170,.18);
    background: rgba(0,0,0,.40);
    backdrop-filter: blur(12px);
    box-shadow: 0 0 0 1px rgba(0,255,170,.08), 0 22px 50px rgba(0,0,0,.55);
  }

  .fc-panel__title {
    font-weight: 900;
    font-size: 12px;
    letter-spacing: 1.8px;
    opacity: .9;
    margin-bottom: 12px;
  }

  .fc-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .fc-card {
    position: relative;
    border-radius: 16px;
    border: 1px solid rgba(0,255,170,.14);
    background: linear-gradient(180deg, rgba(0,255,170,.06), rgba(0,0,0,.25));
    padding: 10px;
    overflow: hidden;
  }

  .fc-card::before {
    content: "";
    position: absolute;
    inset: -40%;
    background: radial-gradient(circle at 30% 30%, rgba(0,255,170,.18), transparent 50%);
    transform: rotate(25deg);
    opacity: .35;
    pointer-events: none;
  }

  .fc-card--wide { grid-column: 1 / -1; }

  .fc-card__k {
    font-size: 11px;
    letter-spacing: 1px;
    opacity: .75;
  }

  .fc-card__v {
    margin-top: 6px;
    font-size: 20px;
    font-weight: 950;
  }

  .fc-card__u {
    position: absolute;
    right: 10px;
    bottom: 10px;
    font-size: 12px;
    opacity: .6;
  }

  .fc-warn {
    margin-top: 12px;
    border-radius: 16px;
    padding: 12px;
    border: 1px solid rgba(255,200,0,.40);
    background: rgba(255,200,0,.08);
  }
  .fc-warn__t { font-weight: 950; letter-spacing: .4px; }
  .fc-warn__d { margin-top: 6px; font-size: 12px; opacity: .85; line-height: 1.35; }

  .fc-footer {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid rgba(0,255,170,.12);
    opacity: .9;
  }
  .fc-footer__line {
    display:flex;
    align-items:center;
    gap: 8px;
    font-size: 12px;
  }
  .fc-footer__hint {
    margin-top: 6px;
    font-size: 11px;
    opacity: .7;
  }

  .fc-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(255,255,255,.25);
    box-shadow: 0 0 0 1px rgba(0,255,170,.25);
  }
  .fc-dot--ok {
    background: rgba(0,255,170,.9);
    box-shadow: 0 0 18px rgba(0,255,170,.5), 0 0 0 1px rgba(0,255,170,.35);
  }

  @media (max-width: 980px) {
    .fc-input { width: 100%; }
    .fc-topbar { left: 10px; right: 10px; top: 10px; }
    .fc-panel { left: 10px; right: 10px; width: auto; }
  }
`;
document.head.appendChild(style);

// ===========================
// UI refs
// ===========================
const elWS = document.getElementById("wsStatus") as HTMLSpanElement;
const elWSUrl = document.getElementById("wsUrl") as HTMLInputElement;
const btnConnect = document.getElementById("btnConnect") as HTMLButtonElement;
const btnCal = document.getElementById("btnCalibrate") as HTMLButtonElement;

const vRoll = document.getElementById("vRoll")!;
const vPitch = document.getElementById("vPitch")!;
const vYaw = document.getElementById("vYaw")!;
const vAx = document.getElementById("vAx")!;
const vAy = document.getElementById("vAy")!;
const vAz = document.getElementById("vAz")!;
const vG = document.getElementById("vG")!;
const warnBox = document.getElementById("warnBox") as HTMLDivElement;

const dotData = document.getElementById("dotData") as HTMLSpanElement;
const dataStatus = document.getElementById("dataStatus") as HTMLSpanElement;

// ===========================
// Three.js
// ===========================
const canvas = document.getElementById("scene") as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.07);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
camera.position.set(0, 0.55, 3.0);
camera.lookAt(0, 0.0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 0.85);
key.position.set(3, 4, 2);
scene.add(key);

// Estrellas
const starsGeom = new THREE.BufferGeometry();
const STAR_COUNT = 1100;
const starPos = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 30 + Math.random() * 140;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.cos(phi) * 0.35;
  starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starsGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(
  starsGeom,
  new THREE.PointsMaterial({ size: 0.02, color: 0x66ffdd })
);
scene.add(stars);

// Grupo nave
const ship = new THREE.Group();
scene.add(ship);
let shipReady = false;

// Wireframe (edges)
function makeWireframe(root: THREE.Object3D) {
  const mat = new THREE.LineBasicMaterial({
    color: 0x66ffdd,
    transparent: true,
    opacity: 0.95,
  });

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.visible = false;
    const edges = new THREE.EdgesGeometry(mesh.geometry, 15);
    const lines = new THREE.LineSegments(edges, mat);

    lines.position.copy(mesh.position);
    lines.rotation.copy(mesh.rotation);
    lines.scale.copy(mesh.scale);

    ship.add(lines);
  });
}

// Cargar GLB
const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => {
    while (ship.children.length) ship.remove(ship.children[0]);

    const root = gltf.scene;
    root.updateMatrixWorld(true);

    makeWireframe(root);

    // Centrar pivot (pre-escala)
    ship.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(ship);
    let size = new THREE.Vector3();
    let center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    ship.position.sub(center);

    // Escalar a tamaño visual
    ship.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(ship);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const target = 1.55;
    const s = target / (maxDim || 1);
    ship.scale.setScalar(s);

    // Re-centrar tras escalar
    ship.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(ship);
    box.getSize(size);
    box.getCenter(center);
    ship.position.sub(center);

    // Bajar nave (ajuste visual)
    ship.position.y -= size.y * 0.12;

    camera.position.set(0, 0.55, 3.0);
    camera.lookAt(0, 0.0, 0);

    shipReady = true;
  },
  undefined,
  (err) => {
    console.error("Error cargando GLB:", err);
  }
);

// Resize: FULLSCREEN real
function resize() {
  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ===========================
// WebSocket / Telemetría
// ===========================
type Telemetry = {
  r: number;
  p: number;
  y: number;
  ax: number;
  ay: number;
  az: number;
  g: number;
};

let ws: WebSocket | null = null;
let lastTelemetryAt = 0;

// offsets de calibración
let zeroR = 0;
let zeroP = 0;
let zeroY = 0;

// suavizado
let sR = 0;
let sP = 0;
let sY = 0;

function setWSStatus(ok: boolean, text: string) {
  elWS.textContent = text;
  elWS.style.borderColor = ok ? "rgba(0,255,170,.55)" : "rgba(255,90,90,.55)";
  elWS.style.color = ok ? "#b7ffe9" : "#ffb0b0";
}

function disconnectWS() {
  if (!ws) return;
  try {
    ws.close();
  } catch {}
  ws = null;
}

function connectWS(url: string) {
  disconnectWS();
  setWSStatus(false, "WS: conectando…");

  ws = new WebSocket(url);

  ws.onopen = () => setWSStatus(true, "WS: conectado ✅");
  ws.onclose = () => setWSStatus(false, "WS: desconectado ❌");
  ws.onerror = () => setWSStatus(false, "WS: error ⚠️");

  ws.onmessage = (ev) => {
    let d: Telemetry | null = null;
    try {
      d = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!d) return;

    lastTelemetryAt = performance.now();

    // estado datos
    dotData.classList.add("fc-dot--ok");
    dataStatus.textContent = "Datos en vivo";

    // aplicar cero
    const r = d.r - zeroR;
    const p = d.p - zeroP;
    const y = d.y - zeroY;

    // suavizado EMA
    sR = lerp(sR, r, 1 - SMOOTHING);
    sP = lerp(sP, p, 1 - SMOOTHING);
    sY = lerp(sY, y, 1 - SMOOTHING);

    // UI
    vRoll.textContent = sR.toFixed(2);
    vPitch.textContent = sP.toFixed(2);
    vYaw.textContent = sY.toFixed(2);

    vAx.textContent = d.ax.toFixed(3);
    vAy.textContent = d.ay.toFixed(3);
    vAz.textContent = d.az.toFixed(3);
    vG.textContent = d.g.toFixed(3);

    // advertencia
    const warn = Math.abs(sR) > LIMITE_ACTITUD_DEG || Math.abs(sP) > LIMITE_ACTITUD_DEG;
    warnBox.style.display = warn ? "block" : "none";

    applyAttitude(sR, sP, sY);
  };
}

btnConnect.addEventListener("click", () => {
  const url = elWSUrl.value.trim();
  if (!url.startsWith("ws://")) {
    setWSStatus(false, "WS: pon ws://… 😅");
    return;
  }
  connectWS(url);
});

btnCal.addEventListener("click", () => {
  // el ángulo actual se vuelve cero
  zeroR += sR;
  zeroP += sP;
  zeroY += sY;

  // reset suave a cero
  sR = 0;
  sP = 0;
  sY = 0;

  vRoll.textContent = "0.00";
  vPitch.textContent = "0.00";
  vYaw.textContent = "0.00";
});

// auto-connect
connectWS(DEFAULT_WS_URL);

// ===========================
// Rotación nave
// ===========================
function applyAttitude(rollDeg: number, pitchDeg: number, yawDeg: number) {
  if (!shipReady) return;

  const pitchRad = THREE.MathUtils.degToRad(pitchDeg);
  const rollRad = THREE.MathUtils.degToRad(rollDeg);
  const yawRad = THREE.MathUtils.degToRad(yawDeg);

  // Mapeo típico: pitch -> X, roll -> Z, yaw -> Y
  ship.rotation.x = pitchRad;
  ship.rotation.z = rollRad;
  ship.rotation.y = yawRad;
}

// ===========================
// Helpers
// ===========================
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ===========================
// Animación
// ===========================
function animate() {
  requestAnimationFrame(animate);

  // Si no llegan datos, modo demo
  const now = performance.now();
  if (now - lastTelemetryAt > 1200) {
    dotData.classList.remove("fc-dot--ok");
    dataStatus.textContent = "Esperando datos…";

    const t = now * 0.001;
    const demoR = Math.sin(t * 0.8) * 12;
    const demoP = Math.sin(t * 0.6) * 8;
    const demoY = Math.sin(t * 0.35) * 18;
    applyAttitude(demoR, demoP, demoY);
  }

  stars.rotation.y += 0.0007;

  renderer.render(scene, camera);
}
animate();