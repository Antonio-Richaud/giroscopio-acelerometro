import * as THREE from "three";

/**
 * Consola de vuelo (SIM) - UI en español + nave sci-fi wireframe.
 * Luego conectamos WebSocket y reemplazamos datos simulados por reales (MPU6050).
 */

const app = document.querySelector<HTMLDivElement>("#app")!;
document.body.style.margin = "0";
document.body.style.background = "#000";
document.body.style.overflow = "hidden";
app.style.width = "100vw";
app.style.height = "100vh";
app.style.position = "relative";

// ====== THREE ======
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 1.4, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

// Niebla suave para profundidad (se ve más “sci-fi” aunque sea wireframe)
scene.fog = new THREE.Fog(0x000000, 8, 30);

// Grid futurista
const grid = new THREE.GridHelper(60, 120);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.18;
scene.add(grid);

// Material wireframe
const wireMat = new THREE.MeshBasicMaterial({ wireframe: true });

// ====== NAVE SCI-FI (wireframe) ======
const ship = new THREE.Group();

/**
 * Tips de diseño:
 * - Fuselaje tipo cápsula (cylinder + cones)
 * - Aro central tipo “reactor ring”
 * - Alas inclinadas para darle agresividad
 * - Motores traseros (tubos)
 */

// ====== NAVE (líneas limpias, no “wireframe espagueti”) ======
const colorLineas = 0x7cffb2;

const matLineas = new THREE.LineBasicMaterial({
  color: colorLineas,
  transparent: true,
  opacity: 0.95,
});

const matGlow = new THREE.LineBasicMaterial({
  color: colorLineas,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function agregarBordes(
  geo: THREE.BufferGeometry,
  pos: THREE.Vector3,
  rot: THREE.Euler = new THREE.Euler(0, 0, 0),
  scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
) {
  const edges = new THREE.EdgesGeometry(geo, 18);

  const lineas = new THREE.LineSegments(edges, matLineas);
  lineas.position.copy(pos);
  lineas.rotation.copy(rot);
  lineas.scale.copy(scale);
  ship.add(lineas);

  // Glow fake (solo para que “brille” tantito)
  const glow = new THREE.LineSegments(edges, matGlow);
  glow.position.copy(pos);
  glow.rotation.copy(rot);
  glow.scale.copy(scale).multiplyScalar(1.02);
  ship.add(glow);
}

function construirNave() {
  ship.clear();

  // --- Fuselaje (lathe = cuerpo suave, tipo nave/avión) ---
  // Perfil (radio, longitud). Se “tornea” alrededor del eje.
  const perfil: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -2.2),
    new THREE.Vector2(0.08, -2.05),
    new THREE.Vector2(0.18, -1.6),
    new THREE.Vector2(0.26, -0.8),
    new THREE.Vector2(0.28, 0.0),
    new THREE.Vector2(0.26, 0.9),
    new THREE.Vector2(0.20, 1.6),
    new THREE.Vector2(0.10, 2.05),
    new THREE.Vector2(0.0, 2.25),
  ];

  const fuselajeGeo = new THREE.LatheGeometry(perfil, 28);
  // Lathe crece sobre Y; lo rotamos para que la nave apunte sobre X
  fuselajeGeo.rotateZ(-Math.PI / 2);
  agregarBordes(fuselajeGeo, new THREE.Vector3(0, 0, 0));

  // --- Cabina (simple) ---
  const cabinaGeo = new THREE.SphereGeometry(0.22, 14, 10);
  agregarBordes(
    cabinaGeo,
    new THREE.Vector3(0.9, 0.18, 0),
    new THREE.Euler(0, 0, 0),
    new THREE.Vector3(1.8, 1.0, 1.2)
  );

  // --- Alas (trapezoidales pero sencillas) ---
  const alaGeo = new THREE.BoxGeometry(1.9, 0.05, 0.75);

  // Ala derecha
  agregarBordes(
    alaGeo,
    new THREE.Vector3(-0.2, -0.02, 0.75),
    new THREE.Euler(THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(18), 0)
  );

  // Ala izquierda
  agregarBordes(
    alaGeo,
    new THREE.Vector3(-0.2, -0.02, -0.75),
    new THREE.Euler(THREE.MathUtils.degToRad(-8), THREE.MathUtils.degToRad(18), 0)
  );

  // --- Aleta vertical (cola) ---
  const aletaGeo = new THREE.BoxGeometry(0.65, 0.42, 0.04);
  agregarBordes(aletaGeo, new THREE.Vector3(-1.5, 0.32, 0));

  // --- Motores (dos cilindros atrás) ---
  const motorGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.85, 12, 1, true);
  motorGeo.rotateZ(Math.PI / 2); // eje del cilindro hacia X

  agregarBordes(motorGeo, new THREE.Vector3(-2.05, -0.10, 0.22));
  agregarBordes(motorGeo, new THREE.Vector3(-2.05, -0.10, -0.22));

  // --- Detalle: aro trasero (para que no se vea “tubo pelón”) ---
  const aroGeo = new THREE.TorusGeometry(0.22, 0.03, 10, 18);
  agregarBordes(aroGeo, new THREE.Vector3(-2.45, -0.10, 0), new THREE.Euler(0, Math.PI / 2, 0));
}

construirNave();

scene.add(ship);

// ====== HUD (ESP) ======
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

// UI (todo en español)
hud.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
    <div style="min-width:320px;">
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

      <div style="margin-top:12px; padding:12px; border:1px solid rgba(124,255,178,.20); border-radius:14px; background:rgba(10,30,18,.08);">
        <div style="font-size:12px; opacity:.75;">Nota</div>
        <div style="font-size:13px; opacity:.9; margin-top:6px;">
          El yaw deriva (MPU6050 sin magnetómetro). Roll/Pitch salen finos.
        </div>
      </div>
    </div>
  </div>

  <div style="position:absolute; left:18px; bottom:18px; right:18px; display:flex; justify-content:space-between; opacity:.65;">
    <div>WebSocket: pendiente</div>
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

// ====== RESIZE ======
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

// ====== SIM TELEMETRÍA ======
let last = performance.now();
let fpsSmooth = 60;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;

  const fps = 1 / Math.max(dt, 0.00001);
  fpsSmooth = fpsSmooth * 0.9 + fps * 0.1;
  fpsEl.textContent = fpsSmooth.toFixed(0);

  const t = now / 1000;

  // Ángulos simulados (rad)
  const roll = Math.sin(t * 1.25) * 0.75;
  const pitch = Math.sin(t * 0.95) * 0.38;
  const yaw = Math.sin(t * 0.45) * 0.28;

  // Movimiento nave
  ship.rotation.set(pitch, yaw, roll);

  // Aceleración simulada (g)
  const ax = Math.sin(t * 1.7) * 0.18;
  const ay = Math.cos(t * 1.3) * 0.14;
  const az = 1.0 + Math.sin(t * 1.05) * 0.08;
  const g = Math.sqrt(ax * ax + ay * ay + az * az);

  // HUD
  rollEl.textContent = `${THREE.MathUtils.radToDeg(roll).toFixed(1)}°`;
  pitchEl.textContent = `${THREE.MathUtils.radToDeg(pitch).toFixed(1)}°`;
  yawEl.textContent = `${THREE.MathUtils.radToDeg(yaw).toFixed(1)}°`;
  gEl.textContent = `${g.toFixed(2)} g`;
  accEl.textContent = `${ax.toFixed(2)}, ${ay.toFixed(2)}, ${az.toFixed(2)}`;

  // Barras
  const empuje = clamp((g - 0.95) * 140, 5, 100);
  const estabilidad = clamp(100 - Math.abs(THREE.MathUtils.radToDeg(roll)) * 1.1, 10, 100);
  (thrBar as HTMLDivElement).style.width = `${empuje}%`;
  (stbBar as HTMLDivElement).style.width = `${estabilidad}%`;

  // Estado
  statusEl.textContent =
    Math.abs(THREE.MathUtils.radToDeg(roll)) > 40 || Math.abs(THREE.MathUtils.radToDeg(pitch)) > 28
      ? "Advertencia: límite de actitud"
      : "Todo en orden";

  renderer.render(scene, camera);
}

animate();