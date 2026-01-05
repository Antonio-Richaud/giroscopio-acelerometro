import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Antonio Richaud · Consola de Vuelo
 * - Carga GLB: /models/nave.glb (public/models/nave.glb)
 * - Render: Edges (líneas limpias) + glow
 * - HUD en español
 * - Telemetría: WebSocket desde ESP32 (JSON)
 */

// ================== SETUP UI ==================
const app = document.querySelector<HTMLDivElement>("#app")!;
document.body.style.margin = "0";
document.body.style.background = "#000";
document.body.style.overflow = "hidden";
app.style.width = "100vw";
app.style.height = "100vh";
app.style.position = "relative";

// HUD
const hud = document.createElement("div");
hud.style.position = "absolute";
hud.style.inset = "0";
hud.style.pointerEvents = "none";
hud.style.fontFamily =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
hud.style.color = "#7CFFB2";
hud.style.textShadow = "0 0 10px rgba(124,255,178,0.35)";
hud.style.padding = "18px";
hud.style.zIndex = "10";
app.appendChild(hud);

hud.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
    <div style="min-width:340px;">
      <div style="font-size:14px; opacity:.85;">Antonio Richaud · Consola de Vuelo</div>
      <div style="font-size:22px; margin-top:6px;">
        Giroscopio + Acelerómetro <span style="opacity:.7;" id="modeVal">(EN VIVO)</span>
      </div>

      <div style="margin-top:14px; padding:12px; border:1px solid rgba(124,255,178,.25); border-radius:14px; background:rgba(10,30,18,.15);">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 18px;">
          <div>
            <div style="font-size:12px; opacity:.75;">Inclinación (Roll)</div>
            <div id="rollVal" style="font-size:20px;">--</div>
          </div>
          <div>
            <div style="font-size:12px; opacity:.75;">Cabeceo (Pitch)</div>
            <div id="pitchVal" style="font-size:20px;">--</div>
          </div>
          <div>
            <div style="font-size:12px; opacity:.75;">Guiñada (Yaw)</div>
            <div id="yawVal" style="font-size:20px;">--</div>
          </div>
          <div>
            <div style="font-size:12px; opacity:.75;">Fuerza G</div>
            <div id="gVal" style="font-size:20px;">--</div>
          </div>
        </div>

        <div style="margin-top:14px;">
          <div style="font-size:12px; opacity:.75;">Aceleración (ax, ay, az)</div>
          <div id="accVal" style="font-size:14px; margin-top:6px; opacity:.95;">--</div>
        </div>
      </div>

      <div style="margin-top:12px; display:grid; gap:10px;">
        <div style="padding:10px; border:1px solid rgba(124,255,178,.20); border-radius:14px; background:rgba(10,30,18,.10);">
          <div style="font-size:12px; opacity:.75;">Empuje (derivado de G)</div>
          <div style="height:10px; margin-top:8px; border:1px solid rgba(124,255,178,.30); border-radius:999px; overflow:hidden;">
            <div id="thrBar" style="height:100%; width:0%; background:rgba(124,255,178,.25);"></div>
          </div>
        </div>

        <div style="padding:10px; border:1px solid rgba(124,255,178,.20); border-radius:14px; background:rgba(10,30,18,.10);">
          <div style="font-size:12px; opacity:.75;">Estabilidad</div>
          <div style="height:10px; margin-top:8px; border:1px solid rgba(124,255,178,.30); border-radius:999px; overflow:hidden;">
            <div id="stbBar" style="height:100%; width:0%; background:rgba(124,255,178,.16);"></div>
          </div>
        </div>
      </div>
    </div>

    <div style="text-align:right; min-width:320px;">
      <div style="padding:12px; border:1px solid rgba(124,255,178,.25); border-radius:14px; background:rgba(10,30,18,.15);">
        <div style="font-size:12px; opacity:.75;">Enlace</div>
        <div id="linkVal" style="font-size:18px;">Conectando…</div>

        <div style="margin-top:12px; font-size:12px; opacity:.75;">FPS</div>
        <div id="fpsVal" style="font-size:18px;">0</div>

        <div style="margin-top:12px; font-size:12px; opacity:.75;">Estado</div>
        <div id="statusVal" style="font-size:14px; opacity:.95;">Inicializando…</div>
      </div>

      <div style="margin-top:12px; padding:12px; border:1px solid rgba(124,255,178,.20); border-radius:14px; background:rgba(10,30,18,.08); text-align:left;">
        <div style="font-size:12px; opacity:.75;">Nota</div>
        <div style="font-size:13px; opacity:.9; margin-top:6px;">
          El yaw puede derivar (MPU6050 sin magnetómetro). Roll/Pitch salen finos.
        </div>
      </div>
    </div>
  </div>

  <div style="position:absolute; left:18px; bottom:18px; right:18px; display:flex; justify-content:space-between; opacity:.65;">
    <div id="wsVal">WebSocket: pendiente</div>
    <div>Control: IMU → Render 3D → HUD</div>
  </div>
`;

// refs HUD
const rollEl = document.getElementById("rollVal")!;
const pitchEl = document.getElementById("pitchVal")!;
const yawEl = document.getElementById("yawVal")!;
const gEl = document.getElementById("gVal")!;
const accEl = document.getElementById("accVal")!;
const thrBar = document.getElementById("thrBar") as HTMLDivElement;
const stbBar = document.getElementById("stbBar") as HTMLDivElement;
const fpsEl = document.getElementById("fpsVal")!;
const statusEl = document.getElementById("statusVal")!;
const wsEl = document.getElementById("wsVal")!;
const linkEl = document.getElementById("linkVal")!;
const modeEl = document.getElementById("modeVal")!;

// ================== THREE SCENE ==================
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 8, 40);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5000);
camera.position.set(0, 1.2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.style.position = "absolute";
renderer.domElement.style.inset = "0";
renderer.domElement.style.zIndex = "0";
app.appendChild(renderer.domElement);

// Grid
const grid = new THREE.GridHelper(80, 160);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.22;
scene.add(grid);

// ================== MODEL → EDGES ==================
const lineMat = new THREE.LineBasicMaterial({
  color: 0x7cffb2,
  transparent: true,
  opacity: 0.95,
});
const glowMat = new THREE.LineBasicMaterial({
  color: 0x7cffb2,
  transparent: true,
  opacity: 0.20,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function convertirAEdges(root: THREE.Object3D) {
  let meshes = 0;

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshes++;
      const mesh = obj as THREE.Mesh;

      const edges = new THREE.EdgesGeometry(mesh.geometry, 18);
      const lines = new THREE.LineSegments(edges, lineMat);
      const glow = new THREE.LineSegments(edges, glowMat);
      glow.scale.setScalar(1.01);

      mesh.add(lines);
      mesh.add(glow);

      // Ocultar sólido sin apagar el nodo (si no, desaparecen los hijos)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
      }
    }
  });

  console.log("Meshes convertidos a edges:", meshes);
}

function encuadrarCamara(obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  obj.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2));
  cameraZ *= 1.7;

  camera.position.set(0, maxDim * 0.35, cameraZ);
  camera.near = cameraZ / 200;
  camera.far = cameraZ * 200;
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0, 0);

  scene.fog = new THREE.Fog(0x000000, camera.position.z * 0.6, camera.position.z * 2.2);
}

let nave: THREE.Object3D | null = null;

const loader = new GLTFLoader();
const MODEL_PATH = "/models/nave.glb";

loader.load(
  MODEL_PATH,
  (gltf) => {
    nave = gltf.scene;
    convertirAEdges(nave);
    scene.add(nave);
    encuadrarCamara(nave);
    statusEl.textContent = "Modelo cargado ✅";
  },
  undefined,
  (err) => {
    console.error("Error cargando GLB:", err);
    statusEl.textContent = "Error: no se pudo cargar el modelo";
  }
);

// ================== TELEMETRÍA (WS) ==================
type Telemetry = {
  r: number; // roll grados
  p: number; // pitch grados
  y: number; // yaw grados
  ax: number; // g
  ay: number; // g
  az: number; // g
  g: number;  // magnitud (g)
};

let telem: Telemetry | null = null;
let lastTelemAt = 0;

// 👇 CAMBIA ESTA IP por la que imprime tu ESP32 en el Serial Monitor
const WS_URL = "ws://192.168.1.77:81";

function conectarWS() {
  wsEl.textContent = "WebSocket: conectando…";
  linkEl.textContent = "Conectando…";
  modeEl.textContent = "(EN VIVO)";

  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    wsEl.textContent = "WebSocket: conectado ✅";
    linkEl.textContent = "EN VIVO";
    statusEl.textContent = "Recibiendo telemetría…";
  };

  ws.onclose = () => {
    telem = null;
    wsEl.textContent = "WebSocket: desconectado ❌ (reintentando…)";
    linkEl.textContent = "Sin enlace";
    statusEl.textContent = "Esperando conexión…";
    setTimeout(conectarWS, 800);
  };

  ws.onerror = () => {
    // onclose hará el retry
  };

  ws.onmessage = (ev) => {
    try {
      telem = JSON.parse(ev.data) as Telemetry;
      lastTelemAt = performance.now();
    } catch {
      // si algún día mandas CSV, aquí lo parseamos
    }
  };
}

conectarWS();

// ================== LOOP ==================
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

let last = performance.now();
let fpsSmooth = 60;

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;

  // FPS
  const fps = 1 / Math.max(dt, 0.00001);
  fpsSmooth = fpsSmooth * 0.9 + fps * 0.1;
  fpsEl.textContent = fpsSmooth.toFixed(0);

  // Si no llega telemetría, lo decimos claro
  const stale = performance.now() - lastTelemAt > 800; // 0.8s sin datos
  if (!telem || stale) {
    statusEl.textContent = "Sin datos… (¿ESP32 encendido / IP correcta?)";
    // Render igual para que no se congele
    renderer.render(scene, camera);
    return;
  }

  // Datos en grados (del ESP32)
  const rollDeg = telem.r;
  const pitchDeg = telem.p;
  const yawDeg = telem.y;

  // Convertir a radianes para Three
  const roll = THREE.MathUtils.degToRad(rollDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const yaw = THREE.MathUtils.degToRad(yawDeg);

  // Aplicar a nave
  if (nave) nave.rotation.set(pitch, yaw, roll);

  // HUD numérico
  rollEl.textContent = `${rollDeg.toFixed(1)}°`;
  pitchEl.textContent = `${pitchDeg.toFixed(1)}°`;
  yawEl.textContent = `${yawDeg.toFixed(1)}°`;

  gEl.textContent = `${telem.g.toFixed(2)} g`;
  accEl.textContent = `${telem.ax.toFixed(2)}, ${telem.ay.toFixed(2)}, ${telem.az.toFixed(2)}`;

  // Barras: empuje (basado en G) + estabilidad (basado en inclinación)
  const empuje = clamp((telem.g - 0.95) * 140, 0, 100);
  const estabilidad = clamp(100 - Math.abs(rollDeg) * 1.1 - Math.abs(pitchDeg) * 0.8, 0, 100);
  thrBar.style.width = `${empuje}%`;
  stbBar.style.width = `${estabilidad}%`;

  // Estado: límites (ajústalos a gusto)
  const LIM_ROLL = 55;
  const LIM_PITCH = 35;

  statusEl.textContent =
    Math.abs(rollDeg) > LIM_ROLL || Math.abs(pitchDeg) > LIM_PITCH
      ? "Advertencia: límite de actitud"
      : "Todo en orden";

  renderer.render(scene, camera);
}

animate();

// ================== RESIZE ==================
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);