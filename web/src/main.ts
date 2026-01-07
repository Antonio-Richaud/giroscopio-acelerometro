import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ===========================
// Configuración
// ===========================
const DEFAULT_WS_URL = "ws://192.168.68.108:81";
const MODEL_URL = "/models/nave.glb";

// Umbral de advertencia de actitud (grados)
const LIMITE_ACTITUD_DEG = 75;

// Suavizado (0 = nada, 1 = súper lento). Recomiendo 0.15~0.25
const SMOOTHING = 0.18;

// ===========================
// UI (Vanilla) - se inyecta solita
// ===========================
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("No encuentro #app. Revisa tu index.html.");

app.innerHTML = `
  <div class="fc-root">
    <header class="fc-topbar">
      <div class="fc-title">
        <div class="fc-title__main">Antonio Richaud · Flight Console</div>
        <div class="fc-title__sub">MPU (6050/6500) · ESP32 · WebSocket · Wireframe</div>
      </div>

      <div class="fc-conn">
        <span class="fc-pill" id="wsStatus">WS: desconectado</span>
        <input class="fc-input" id="wsUrl" value="${DEFAULT_WS_URL}" />
        <button class="fc-btn" id="btnConnect">Conectar</button>
        <button class="fc-btn" id="btnCalibrate">Calibrar (cero)</button>
      </div>
    </header>

    <main class="fc-main">
      <section class="fc-panel">
        <div class="fc-panel__title">Telemetría</div>

        <div class="fc-grid">
          <div class="fc-card">
            <div class="fc-card__k">Roll</div>
            <div class="fc-card__v" id="vRoll">—</div>
            <div class="fc-card__u">°</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">Pitch</div>
            <div class="fc-card__v" id="vPitch">—</div>
            <div class="fc-card__u">°</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">Yaw</div>
            <div class="fc-card__v" id="vYaw">—</div>
            <div class="fc-card__u">°</div>
          </div>

          <div class="fc-card">
            <div class="fc-card__k">Ax</div>
            <div class="fc-card__v" id="vAx">—</div>
            <div class="fc-card__u">g</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">Ay</div>
            <div class="fc-card__v" id="vAy">—</div>
            <div class="fc-card__u">g</div>
          </div>
          <div class="fc-card">
            <div class="fc-card__k">Az</div>
            <div class="fc-card__v" id="vAz">—</div>
            <div class="fc-card__u">g</div>
          </div>

          <div class="fc-card fc-card--wide">
            <div class="fc-card__k">Fuerza G total</div>
            <div class="fc-card__v" id="vG">—</div>
            <div class="fc-card__u">g</div>
          </div>

          <div class="fc-card fc-card--wide">
            <div class="fc-card__k">Modelo</div>
            <div class="fc-card__v" id="vModel">Cargando…</div>
            <div class="fc-card__u"></div>
          </div>
        </div>

        <div class="fc-warn" id="warnBox" style="display:none;">
          <div class="fc-warn__t">Advertencia: límite de actitud</div>
          <div class="fc-warn__d">
            Pasaste el umbral de inclinación. No es peligro real, es para avisarte que
            en ángulos extremos las lecturas pueden verse raras (y el yaw deriva sin brújula).
          </div>
        </div>

        <div class="fc-notes">
          <div class="fc-notes__t">Notas rápidas</div>
          <ul>
            <li>Si la nave gira “al revés”, invierte signos en <code>applyAttitude()</code>.</li>
            <li>El yaw deriva (normal sin magnetómetro). Se ve cool, pero no es brújula.</li>
            <li>Calibrar pone el ángulo actual como “cero”. Hazlo con la nave quieta.</li>
          </ul>
        </div>
      </section>

      <section class="fc-view">
        <canvas id="scene"></canvas>
      </section>
    </main>
  </div>
`;

// CSS FULLSCREEN + canvas con altura real
const style = document.createElement("style");
style.textContent = `
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  #app { height: 100vh; }

  .fc-root {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(1200px 800px at 20% 10%, rgba(0,255,170,.08), transparent 50%),
      radial-gradient(1000px 700px at 80% 20%, rgba(0,150,255,.06), transparent 55%),
      #070a0d;
    color: #d7fff2;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    overflow: hidden;
  }

  .fc-topbar {
    flex: 0 0 auto;
    display:flex;
    gap:16px;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(0,255,170,.15);
  }

  .fc-title__main { font-size: 16px; font-weight: 800; letter-spacing: .2px; }
  .fc-title__sub { font-size: 12px; opacity: .75; margin-top: 2px; }

  .fc-conn { display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
  .fc-pill { padding: 6px 10px; border: 1px solid rgba(0,255,170,.25); border-radius: 999px; font-size: 12px; background: rgba(0,0,0,.25); }
  .fc-input { width: 260px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(0,255,170,.25); background: rgba(0,0,0,.30); color: #d7fff2; outline: none; }
  .fc-btn { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(0,255,170,.25); background: rgba(0,0,0,.22); color: #d7fff2; cursor: pointer; }
  .fc-btn:hover { background: rgba(0,255,170,.08); }

  /* CLAVE: min-height:0 para que grid no colapse el canvas */
  .fc-main {
    flex: 1 1 auto;
    min-height: 0;
    display:grid;
    grid-template-columns: 380px 1fr;
    gap: 14px;
    padding: 14px;
  }

  .fc-panel {
    height: 100%;
    min-height: 0;
    overflow: auto;
    border: 1px solid rgba(0,255,170,.15);
    border-radius: 16px;
    padding: 14px;
    background: rgba(0,0,0,.25);
    backdrop-filter: blur(6px);
  }

  .fc-panel__title { font-weight: 800; margin-bottom: 12px; opacity: .95; }
  .fc-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

  .fc-card { position: relative; border: 1px solid rgba(0,255,170,.15); border-radius: 14px; padding: 10px; background: rgba(0,0,0,.25); }
  .fc-card--wide { grid-column: 1 / -1; }
  .fc-card__k { font-size: 12px; opacity: .75; }
  .fc-card__v { font-size: 22px; font-weight: 900; margin-top: 6px; }
  .fc-card__u { position:absolute; right: 10px; bottom: 10px; font-size: 12px; opacity: .6; }

  .fc-warn { margin-top: 12px; border-radius: 14px; padding: 12px; border: 1px solid rgba(255,200,0,.35); background: rgba(255,200,0,.08); }
  .fc-warn__t { font-weight: 900; }
  .fc-warn__d { font-size: 12px; opacity: .85; margin-top: 6px; line-height: 1.35; }

  .fc-notes { margin-top: 12px; font-size: 12px; opacity: .85; }
  .fc-notes__t { font-weight: 800; margin-bottom: 6px; }
  .fc-notes ul { margin: 0; padding-left: 16px; }

  /* CLAVE: la vista llena la columna y el canvas sí tiene altura */
  .fc-view {
    height: 100%;
    min-height: 0;
    display: flex;
    border: 1px solid rgba(0,255,170,.15);
    border-radius: 16px;
    overflow: hidden;
    background: #000;
  }

  #scene {
    flex: 1;
    width: 100%;
    height: 100%;
    display:block;
  }

  @media (max-width: 980px) {
    .fc-main { grid-template-columns: 1fr; }
    .fc-input { width: 100%; }
    .fc-view { min-height: 55vh; }
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
const vModel = document.getElementById("vModel")!;
const warnBox = document.getElementById("warnBox") as HTMLDivElement;

// ===========================
// Three.js Scene
// ===========================
const canvas = document.getElementById("scene") as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.085);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
camera.position.set(0, 0.55, 3.0);
camera.lookAt(0, 0.0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 0.75);
keyLight.position.set(3, 4, 2);
scene.add(keyLight);

// “Estrellas”
const starsGeom = new THREE.BufferGeometry();
const STAR_COUNT = 900;
const starPos = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 25 + Math.random() * 120;
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

// Grupo de nave
const ship = new THREE.Group();
scene.add(ship);
let shipReady = false;

// Wireframe bonito (Edges)
function makeWireframeFromGLTF(root: THREE.Object3D) {
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x66ffdd,
    transparent: true,
    opacity: 0.95,
  });

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Oculta mesh original
    mesh.visible = false;

    const geo = mesh.geometry;
    const edges = new THREE.EdgesGeometry(geo, 15);
    const lines = new THREE.LineSegments(edges, lineMat);

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

    makeWireframeFromGLTF(root);

    // 1) centrar pivot (pre-escala)
    ship.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(ship);
    let size = new THREE.Vector3();
    let center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    ship.position.sub(center);

    // 2) escalar
    ship.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(ship);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const target = 1.55;
    const s = target / (maxDim || 1);
    ship.scale.setScalar(s);

    // 3) re-centrar tras escalar (muy importante)
    ship.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(ship);
    box.getSize(size);
    box.getCenter(center);
    ship.position.sub(center);

    // 4) bajar un poco (ajuste visual)
    ship.position.y -= size.y * 0.12;

    // cámara centrada
    camera.position.set(0, 0.55, 3.0);
    camera.lookAt(0, 0.0, 0);

    shipReady = true;
    vModel.textContent = `Cargado ✅ ${MODEL_URL}`;
  },
  undefined,
  (err) => {
    console.error("Error cargando GLB:", err);
    vModel.textContent = `Error ❌ revisa ${MODEL_URL}`;
  }
);

// Resize robusto (usa tamaño real)
function resize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
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
let wsURL = DEFAULT_WS_URL;
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
  try { ws.close(); } catch {}
  ws = null;
}

function connectWS(url: string) {
  disconnectWS();
  wsURL = url;

  setWSStatus(false, "WS: conectando…");

  ws = new WebSocket(url);

  ws.onopen = () => setWSStatus(true, "WS: conectado ✅");
  ws.onclose = () => setWSStatus(false, "WS: desconectado ❌");
  ws.onerror = () => setWSStatus(false, "WS: error ⚠️");

  ws.onmessage = (ev) => {
    let d: Telemetry | null = null;
    try { d = JSON.parse(String(ev.data)); } catch { return; }
    if (!d) return;

    lastTelemetryAt = performance.now();

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
  sR = 0; sP = 0; sY = 0;

  vRoll.textContent = "0.00";
  vPitch.textContent = "0.00";
  vYaw.textContent = "0.00";
});

// auto-connect
connectWS(DEFAULT_WS_URL);

// ===========================
// Rotación de la nave
// ===========================
function applyAttitude(rollDeg: number, pitchDeg: number, yawDeg: number) {
  if (!shipReady) return;

  // Mapeo típico: pitch -> X, roll -> Z, yaw -> Y
  const pitchRad = THREE.MathUtils.degToRad(pitchDeg);
  const rollRad = THREE.MathUtils.degToRad(rollDeg);
  const yawRad = THREE.MathUtils.degToRad(yawDeg);

  // Si gira raro, prueba invertir signos aquí:
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

  // Si no llegan datos, demo suave
  const now = performance.now();
  const silentFor = now - lastTelemetryAt;
  if (silentFor > 1200) {
    const t = now * 0.001;
    const demoR = Math.sin(t * 0.8) * 12;
    const demoP = Math.sin(t * 0.6) * 8;
    const demoY = Math.sin(t * 0.35) * 18;

    vRoll.textContent = demoR.toFixed(2);
    vPitch.textContent = demoP.toFixed(2);
    vYaw.textContent = demoY.toFixed(2);

    applyAttitude(demoR, demoP, demoY);
  }

  stars.rotation.y += 0.0008;

  renderer.render(scene, camera);
}
animate();
// ===========================