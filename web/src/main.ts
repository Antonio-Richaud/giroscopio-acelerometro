import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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
app.appendChild(hud);

hud.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
    <div style="min-width:340px;">
      <div style="font-size:14px; opacity:.85;">Antonio Richaud · Consola de Vuelo</div>
      <div style="font-size:22px; margin-top:6px;">
        Giroscopio + Acelerómetro <span style="opacity:.7;">(SIM)</span>
      </div>

      <div style="margin-top:14px; padding:12px; border:1px solid rgba(124,255,178,.25); border-radius:14px; background:rgba(10,30,18,.15);">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 18px;">
          <div>
            <div style="font-size:12px; opacity:.75;">Inclinación (Roll)</div>
            <div id="rollVal" style="font-size:20px;">0.0°</div>
          </div>
          <div>
            <div style="font-size:12px; opacity:.75;">Cabeceo (Pitch)</div>
            <div id="pitchVal" style="font-size:20px;">0.0°</div>
          </div>
          <div>
            <div style="font-size:12px; opacity:.75;">Guiñada (Yaw)</div>
            <div id="yawVal" style="font-size:20px;">0.0°</div>
          </div>
          <div>
            <div style="font-size:12px; opacity:.75;">Fuerza G</div>
            <div id="gVal" style="font-size:20px;">1.00 g</div>
          </div>
        </div>

        <div style="margin-top:14px;">
          <div style="font-size:12px; opacity:.75;">Aceleración (ax, ay, az)</div>
          <div id="accVal" style="font-size:14px; margin-top:6px; opacity:.95;">0.00, 0.00, 1.00</div>
        </div>
      </div>

      <div style="margin-top:12px; display:grid; gap:10px;">
        <div style="padding:10px; border:1px solid rgba(124,255,178,.20); border-radius:14px; background:rgba(10,30,18,.10);">
          <div style="font-size:12px; opacity:.75;">Empuje (simulado)</div>
          <div style="height:10px; margin-top:8px; border:1px solid rgba(124,255,178,.30); border-radius:999px; overflow:hidden;">
            <div id="thrBar" style="height:100%; width:35%; background:rgba(124,255,178,.25);"></div>
          </div>
        </div>

        <div style="padding:10px; border:1px solid rgba(124,255,178,.20); border-radius:14px; background:rgba(10,30,18,.10);">
          <div style="font-size:12px; opacity:.75;">Estabilidad</div>
          <div style="height:10px; margin-top:8px; border:1px solid rgba(124,255,178,.30); border-radius:999px; overflow:hidden;">
            <div id="stbBar" style="height:100%; width:80%; background:rgba(124,255,178,.16);"></div>
          </div>
        </div>
      </div>
    </div>

    <div style="text-align:right; min-width:280px;">
      <div style="padding:12px; border:1px solid rgba(124,255,178,.25); border-radius:14px; background:rgba(10,30,18,.15);">
        <div style="font-size:12px; opacity:.75;">Enlace</div>
        <div id="linkVal" style="font-size:18px;">SIMULADO</div>

        <div style="margin-top:12px; font-size:12px; opacity:.75;">FPS</div>
        <div id="fpsVal" style="font-size:18px;">0</div>

        <div style="margin-top:12px; font-size:12px; opacity:.75;">Estado</div>
        <div id="statusVal" style="font-size:14px; opacity:.95;">Todo en orden</div>
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
const thrBar = document.getElementById("thrBar")!;
const stbBar = document.getElementById("stbBar")!;
const fpsEl = document.getElementById("fpsVal")!;
const statusEl = document.getElementById("statusVal")!;
const wsEl = document.getElementById("wsVal")!;

// ================== THREE SCENE ==================
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 8, 40);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5000);
camera.position.set(0, 1.2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;

      const edges = new THREE.EdgesGeometry(mesh.geometry, 18);
      const lines = new THREE.LineSegments(edges, lineMat);
      const glow = new THREE.LineSegments(edges, glowMat);
      glow.scale.setScalar(1.01);

      mesh.add(lines);
      mesh.add(glow);

      // Ocultar sólido sin apagar el nodo
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
      }
    }
  });
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

  // ajusta fog según cámara
  scene.fog = new THREE.Fog(0x000000, camera.position.z * 0.6, camera.position.z * 2.2);
}

let nave: THREE.Object3D | null = null;

// Modelo
const loader = new GLTFLoader();
const MODEL_PATH = "/models/nave.glb";

loader.load(
  MODEL_PATH,
  (gltf) => {
    nave = gltf.scene;
    convertirAEdges(nave);
    scene.add(nave);
    encuadrarCamara(nave);
  },
  undefined,
  (err) => {
    console.error("Error cargando GLB:", err);
    statusEl.textContent = "Error: no se pudo cargar el modelo";
  }
);

// ================== HELPERS ==================
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// ================== LOOP (SIM) ==================
let last = performance.now();
let fpsSmooth = 60;

const t0 = performance.now();
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;

  const fps = 1 / Math.max(dt, 0.00001);
  fpsSmooth = fpsSmooth * 0.9 + fps * 0.1;
  fpsEl.textContent = fpsSmooth.toFixed(0);

  // Telemetría simulada
  const t = (now - t0) / 1000;
  const roll = Math.sin(t * 1.25) * 0.7;
  const pitch = Math.sin(t * 0.95) * 0.35;
  const yaw = Math.sin(t * 0.45) * 0.25;

  const ax = Math.sin(t * 1.7) * 0.18;      // en "g"
  const ay = Math.cos(t * 1.3) * 0.14;      // en "g"
  const az = 1.0 + Math.sin(t * 1.05) * 0.08; // gravedad ~1g

  const g = Math.sqrt(ax * ax + ay * ay + az * az);

  // Aplicar a nave
  if (nave) nave.rotation.set(pitch, yaw, roll);

  // HUD
  rollEl.textContent = `${THREE.MathUtils.radToDeg(roll).toFixed(1)}°`;
  pitchEl.textContent = `${THREE.MathUtils.radToDeg(pitch).toFixed(1)}°`;
  yawEl.textContent = `${THREE.MathUtils.radToDeg(yaw).toFixed(1)}°`;
  gEl.textContent = `${g.toFixed(2)} g`;
  accEl.textContent = `${ax.toFixed(2)}, ${ay.toFixed(2)}, ${az.toFixed(2)}`;

  // barras
  const empuje = clamp((g - 0.95) * 140, 5, 100);
  const estabilidad = clamp(100 - Math.abs(THREE.MathUtils.radToDeg(roll)) * 1.1, 10, 100);
  (thrBar as HTMLDivElement).style.width = `${empuje}%`;
  (stbBar as HTMLDivElement).style.width = `${estabilidad}%`;

  // estado
  statusEl.textContent =
    Math.abs(THREE.MathUtils.radToDeg(roll)) > 40 || Math.abs(THREE.MathUtils.radToDeg(pitch)) > 28
      ? "Advertencia: límite de actitud"
      : "Todo en orden";

  wsEl.textContent = "WebSocket: pendiente (SIM activo)";

  renderer.render(scene, camera);
}

animate();

// Resize
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);