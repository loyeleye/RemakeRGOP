// The 3D shrine: a floating stone plaza above a sea of cloud at dusk, lit by the brazier's
// fire and the wisps' own glow. Three.js with bloom. Game state comes in as snapshots; this
// file only draws them.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { Tile, type Board } from "../engine/board.js";
import { PULL_REACH, PUSH_REACH, type GameSnapshot } from "../engine/game.js";
import type { Shrine } from "../engine/maps.js";
import { FLAME_COLORS, type Flame } from "../engine/protocol.js";

export const GUILD_COLORS = ["#ffcf5a", "#b07cff"] as const;
export const GUILD_NAMES = ["Dawn", "Dusk"] as const;

const PITCH = THREE.MathUtils.degToRad(56);
const FOV = 38;

export interface DrawState {
  shrine: Shrine;
  prev: GameSnapshot | null;
  snap: GameSnapshot;
  t: number;
  me: number;
  flames: Map<number, Flame>;
  hoverWisp: number | null;
  now: number;
}

// ------------------------------------------------------------------ camera

/**
 * A tilted perspective camera that keeps the old 2D camera's interface: `scale` is roughly
 * pixels per tile at the look-at point, `cx, cy` is the tile it looks at.
 */
export class Camera {
  scale = 30;
  cx = 13;
  cy = 13;
  follow = true;
  w = 1;
  h = 1;
  readonly three = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  board: Board | null = null;

  get compact() {
    return Math.min(this.w, this.h) < 640;
  }

  private get dist() {
    return this.h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * Math.max(1, this.scale));
  }

  fitBoard(board: Board) {
    this.board = board;
    // Fit the whole plaza with a little sky around it.
    this.scale = Math.min(this.w / (board.width + 6), this.h / ((board.height + 4) * 0.95));
  }

  phoneZoom() {
    this.scale = Math.min(this.w, this.h) / 12;
  }

  update() {
    const b = this.board;
    const ox = b ? b.width / 2 : 13;
    const oy = b ? b.height / 2 : 13;
    const target = new THREE.Vector3(this.cx - ox, 0, this.cy - oy);
    const d = this.dist;
    const cam = this.three;
    cam.aspect = this.w / this.h;
    cam.position.set(target.x, Math.sin(PITCH) * d, target.z + Math.cos(PITCH) * d);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Screen pixel to (fractional) tile coordinates on the ground. */
  toTile(sx: number, sy: number) {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.three);
    const hit = new THREE.Vector3();
    const b = this.board;
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return { x: -99, y: -99 };
    return { x: hit.x + (b ? b.width / 2 : 13), y: hit.z + (b ? b.height / 2 : 13) };
  }

  toScreen(tx: number, ty: number, h = 0) {
    const b = this.board;
    const v = new THREE.Vector3(tx - (b ? b.width / 2 : 13), h, ty - (b ? b.height / 2 : 13)).project(this.three);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  clamp(board: Board) {
    this.board = board;
    const lo = Math.min(this.w / (board.width + 10), this.h / (board.height + 10));
    const hi = Math.min(this.w, this.h) / 5;
    this.scale = Math.max(lo, Math.min(hi, this.scale));
    this.cx = Math.max(0, Math.min(board.width, this.cx));
    this.cy = Math.max(0, Math.min(board.height, this.cy));
  }
}

// ------------------------------------------------------------------ assets

type ModelName = "dawn" | "dusk" | "brazier" | "monolith" | "boulder";
const models: Partial<Record<ModelName, THREE.Object3D>> = {};
const modelWaiters: (() => void)[] = [];
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

export function loadModels() {
  for (const n of ["dawn", "dusk", "brazier", "monolith", "boulder"] as ModelName[]) {
    loader.load(
      `models/${n}.glb`,
      (g: GLTF) => {
        models[n] = normalize(g.scene, n === "monolith");
        modelWaiters.forEach((f) => f());
      },
      undefined,
      () => {
        /* missing model: the procedural stand-in stays */
      },
    );
  }
}

/**
 * Image-to-3D reconstructions from a three-quarter view can come out leaning. Stand a tall
 * model up straight: tilt it so the line from the centre of its base to the centre of its top
 * is vertical.
 */
function straighten(o: THREE.Object3D) {
  o.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute("position");
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  });
  if (pts.length < 10) return;
  pts.sort((a, b) => a.y - b.y);
  const k = Math.max(1, Math.floor(pts.length * 0.12));
  const mean = (arr: THREE.Vector3[]) => arr.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(arr.length);
  const axis = mean(pts.slice(-k)).sub(mean(pts.slice(0, k))).normalize();
  o.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0)));
  o.updateMatrixWorld(true);
}

/** Centre a model on x/z, stand it on y=0 and scale it to 1 unit tall. */
function normalize(o: THREE.Object3D, upright = false) {
  if (upright) straighten(o);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  o.position.set(-c.x, -box.min.y, -c.z);
  wrap.add(o);
  wrap.scale.setScalar(1 / size.y);
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      const mesh = m as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      // Pixal3D exports metallic=1; these are painted stone and cloth.
      mat.metalness = 0;
      mat.roughness = 0.85;
      mat.side = THREE.FrontSide;
    }
  });
  wrap.userData.aspect = { w: size.x / size.y, d: size.z / size.y };
  return wrap;
}

function tex(path: string, repeat: number) {
  const t = texLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ shaders

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  float h = vDir.y;
  vec3 top = vec3(0.01, 0.015, 0.05);
  vec3 mid = vec3(0.07, 0.04, 0.14);
  vec3 low = vec3(0.45, 0.20, 0.18);
  vec3 col = mix(mid, top, smoothstep(0.05, 0.6, h));
  col = mix(low, col, smoothstep(-0.02, 0.22, h));
  // Below the horizon: the deep dusk under the cloud sea.
  col = mix(vec3(0.02, 0.015, 0.045), col, smoothstep(-0.35, -0.02, h));
  // Aurora ribbon.
  float a = sin(vDir.x * 6.0 + uTime * 0.07) * 0.5 + sin(vDir.z * 9.0 - uTime * 0.05) * 0.5;
  float band = smoothstep(0.25, 0.0, abs(h - 0.35 - a * 0.08)) * smoothstep(0.1, 0.4, h);
  col += vec3(0.15, 0.55, 0.45) * band * 0.35;
  // Stars.
  vec3 cell = floor(vDir * 220.0);
  float s = step(0.9975, hash(cell)) * smoothstep(0.1, 0.4, h);
  col += s * (0.6 + 0.4 * sin(uTime * 2.0 + hash(cell) * 30.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec2 p = vUv * 9.0 + vec2(uTime * 0.012, uTime * 0.006);
  float n = fbm(p + fbm(p * 0.7));
  float r = length(vUv - 0.5) * 2.0;
  vec3 col = mix(vec3(0.04, 0.03, 0.09), vec3(0.30, 0.18, 0.32), n * n);
  // Firelight from the shrine above, warming the clouds near the centre.
  col += vec3(0.35, 0.14, 0.04) * smoothstep(0.35, 0.0, r) * n;
  float alpha = smoothstep(0.25, 0.75, n) * smoothstep(1.0, 0.3, r);
  gl_FragColor = vec4(col, alpha * 0.8);
}`;

const UV_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const WATER_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
void main() {
  vec2 p = vUv * 40.0;
  float w = sin(p.x * 1.3 + uTime * 1.4) * sin(p.y * 1.1 - uTime * 1.1) + sin((p.x + p.y) * 0.7 + uTime);
  vec3 deep = vec3(0.01, 0.08, 0.13);
  vec3 lit = vec3(0.20, 0.70, 0.80);
  vec3 col = mix(deep, lit, smoothstep(0.6, 1.9, w) * 0.6);
  gl_FragColor = vec4(col, 0.88);
}`;

const PILLAR_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
void main() {
  float fade = pow(vUv.y, 2.5);
  float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float flick = 0.85 + 0.15 * sin(uTime * 3.0 + vUv.y * 20.0);
  gl_FragColor = vec4(uColor * flick, fade * edge * edge * 0.35);
}`;

const BEAM_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform float uDash;
void main() {
  float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float dash = uDash > 0.5 ? step(0.5, fract(vUv.x * 6.0 - uTime * 3.0)) : 1.0;
  float pulse = 0.7 + 0.3 * sin(vUv.x * 30.0 - uTime * 12.0);
  gl_FragColor = vec4(uColor * 2.0 * pulse, core * core * dash);
}`;

const PARTICLE_VS = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uSize;
uniform float uRise;
uniform float uSpread;
varying float vLife;
void main() {
  float life = fract(uTime * 0.35 + aSeed);
  vLife = life;
  vec3 p = position;
  float ang = aSeed * 50.0 + uTime * 0.6;
  p.x += sin(ang) * uSpread * (0.3 + life);
  p.z += cos(ang * 1.3) * uSpread * (0.3 + life);
  p.y += life * uRise;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (1.0 - life) * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uColor, uColor2, vLife) * 1.6, a * (1.0 - vLife) * 0.8);
}`;

function particles(count: number, color: string, color2: string, size: number, rise: number, spread: number, radius: number) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
    seed[i] = Math.random();
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VS,
    fragmentShader: PARTICLE_FS,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uRise: { value: rise },
      uSpread: { value: spread },
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = glowTexture();

function glowSprite(color: string, size: number, opacity = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.setScalar(size);
  return s;
}

// ------------------------------------------------------------------ scene

interface PlayerRig {
  root: THREE.Group;
  body: THREE.Object3D | null;
  bodyKind: ModelName | null;
  ring: THREE.Mesh;
  lantern: THREE.Sprite;
  beam: THREE.Mesh;
  facing: number;
  guild: 0 | 1;
}

interface WispRig {
  root: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Sprite;
  light: THREE.PointLight;
  trail: THREE.Points;
  lastX: number;
  lastY: number;
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private shrineGroup = new THREE.Group();
  private shrineId = "";
  private timeUniforms: { value: number }[] = [];
  private players = new Map<number, PlayerRig>();
  private wisps = new Map<number, WispRig>();
  private brazierLight = new THREE.PointLight("#ff9a4a", 60, 30, 1.6);
  private rim: THREE.LineSegments | null = null;
  private reach: THREE.LineLoop;
  private walkMark: THREE.Mesh;
  private brazierSlot = new THREE.Group();
  private propSlots: { kind: ModelName; group: THREE.Group; seed: number }[] = [];
  private low: boolean;

  constructor(readonly canvas: HTMLCanvasElement, readonly cam: Camera) {
    this.low = cam.compact || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.FogExp2("#120c22", 0.011);
    this.scene.background = new THREE.Color("#07060f");

    // Sky dome.
    const skyU = { value: 0 };
    this.timeUniforms.push(skyU);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uTime: skyU }, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.scene.add(sky);

    // Sea of cloud far below.
    const cloudU = { value: 0 };
    this.timeUniforms.push(cloudU);
    const clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: CLOUD_FS, uniforms: { uTime: cloudU }, transparent: true, depthWrite: false, fog: false }),
    );
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.y = -14;
    this.scene.add(clouds);

    // Distant peaks.
    const peakMat = new THREE.MeshBasicMaterial({ color: "#1a1028", fog: false });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + Math.sin(i * 7.1) * 0.1;
      const r = 120 + (i % 3) * 18;
      const h = 18 + ((i * 37) % 23);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(10 + (i % 4) * 4, h, 5), peakMat);
      peak.position.set(Math.cos(a) * r, -14 + h / 2, Math.sin(a) * r);
      peak.rotation.y = i;
      this.scene.add(peak);
    }

    // Light: cool moonlight, warm brazier.
    this.scene.add(new THREE.HemisphereLight("#9a8ce0", "#2a1a20", 1.1));
    const moon = new THREE.DirectionalLight("#c4ccff", 1.8);
    moon.position.set(-18, 30, -12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = sc.bottom = -20;
    sc.right = sc.top = 20;
    sc.near = 1;
    sc.far = 80;
    moon.shadow.bias = -0.0006;
    this.scene.add(moon);
    this.brazierLight.position.set(0, 2.6, 0);
    this.scene.add(this.brazierLight);

    this.scene.add(this.shrineGroup);

    this.reach = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: "#fff3c4", dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.35 }),
    );
    this.scene.add(this.reach);
    this.walkMark = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 32),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.walkMark.rotation.x = -Math.PI / 2;
    this.scene.add(this.walkMark);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, cam.three));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    modelWaiters.push(() => this.refreshProps());
  }

  resize(w: number, h: number, dpr: number) {
    const ratio = Math.min(dpr, this.low ? 1.5 : 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * (this.low ? 0.5 : 1), h * (this.low ? 0.5 : 1));
  }

  private worldX(b: Board, x: number) {
    return x - b.width / 2 + 0.5;
  }
  private worldZ(b: Board, y: number) {
    return y - b.height / 2 + 0.5;
  }

  // -------------------------------------------------------------- the static shrine

  private buildShrine(shrine: Shrine) {
    this.shrineId = shrine.id;
    this.shrineGroup.clear();
    this.propSlots = [];
    for (const r of this.players.values()) this.scene.remove(r.root);
    this.players.clear();
    for (const r of this.wisps.values()) this.scene.remove(r.root);
    this.wisps.clear();
    const b = shrine.board;
    const W = b.width;
    const H = b.height;
    const g = this.shrineGroup;

    // The plaza: floor texture on top of a thick floating slab of rock.
    const floorTex = tex(`textures/floor-${shrine.id}.webp`, W / 6);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 2, H - 2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, color: "#ffffff" }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    const wallTex = tex("sprites/wall.png", 3);
    const slabMat = new THREE.MeshStandardMaterial({ map: wallTex, color: "#7a6f80", roughness: 1 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 3, H), slabMat);
    slab.position.y = -1.52;
    slab.receiveShadow = true;
    g.add(slab);
    // A jagged underside so it reads as a floating island.
    const under = new THREE.Mesh(new THREE.ConeGeometry(W * 0.62, 14, 9, 4), new THREE.MeshStandardMaterial({ color: "#3a2c3e", roughness: 1, flatShading: true }));
    jitter(under.geometry as THREE.BufferGeometry, 1.4);
    under.rotation.x = Math.PI;
    under.rotation.y = 0.3;
    under.position.y = -10;
    g.add(under);

    // Parapet around the edge.
    const parapetMat = new THREE.MeshStandardMaterial({ map: wallTex, color: "#9a90a8", roughness: 0.9 });
    const addWall = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), parapetMat);
      m.position.set(x, 0.27, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    addWall(0, -H / 2 + 0.5, W, 1);
    addWall(0, H / 2 - 0.5, W, 1);
    addWall(-W / 2 + 0.5, 0, 1, H - 2);
    addWall(W / 2 - 0.5, 0, 1, H - 2);
    // Corner monoliths and edge braziers for scale.
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.addProp("monolith", (cx * (W - 1)) / 2, (cz * (H - 1)) / 2, 4.2, 1.3, cx * 3 + cz);
      const fl = glowSprite("#ff9a4a", 1.6, 0.5);
      fl.position.set((cx * (W - 1)) / 2, 4.6, (cz * (H - 1)) / 2);
      g.add(fl);
    }

    // Tiles.
    const waterU = { value: 0 };
    this.timeUniforms.push(waterU);
    const waterMat = new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: WATER_FS, uniforms: { uTime: waterU }, transparent: true });
    const water: THREE.BufferGeometry[] = [];
    let seed = 1;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const t = b.tiles[y * W + x];
        const wx = this.worldX(b, x);
        const wz = this.worldZ(b, y);
        seed++;
        if (t === Tile.Wall) this.addProp("monolith", wx, wz, 2.8, 2.2, seed);
        else if (t === Tile.Rock) this.addProp("boulder", wx, wz, 0.9, 1.05, seed);
        else if (t === Tile.Water) {
          const p = new THREE.PlaneGeometry(1, 1);
          p.rotateX(-Math.PI / 2);
          p.translate(wx, 0.02, wz);
          // Shared UVs across the pool so ripples flow between tiles.
          const uv = p.getAttribute("uv") as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i)) / W, (y + 1 - uv.getY(i)) / H);
          water.push(p);
          // A sunken rim so pools read as pools.
          const lip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshStandardMaterial({ color: "#1b2a30" }));
          lip.position.set(wx, -0.04, wz);
          g.add(lip);
        }
      }
    if (water.length) {
      const merged = mergeGeometries(water);
      g.add(new THREE.Mesh(merged, waterMat));
    }

    // The brazier dais: stepped stone circles, the brazier model, fire, a pillar of light.
    const c = b.center;
    const cx = this.worldX(b, c.x);
    const cz = this.worldZ(b, c.y);
    const daisMat = new THREE.MeshStandardMaterial({ map: floorTex, color: "#9a8f9c", roughness: 0.85 });
    for (const [r, h] of [[2.4, 0.18], [1.9, 0.36]] as const) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.1, h, 40), daisMat);
      d.position.set(cx, h / 2, cz);
      d.receiveShadow = d.castShadow = true;
      g.add(d);
    }
    this.brazierSlot = new THREE.Group();
    this.brazierSlot.position.set(cx, 0.36, cz);
    g.add(this.brazierSlot);
    this.refreshBrazier();
    const fire = particles(this.low ? 140 : 260, "#ffb347", "#ff3a10", 0.8, 2.4, 0.4, 0.75);
    fire.position.set(cx, 2.3, cz);
    this.timeUniforms.push((fire.material as THREE.ShaderMaterial).uniforms.uTime as { value: number });
    g.add(fire);
    const embers = particles(this.low ? 60 : 140, "#ffb060", "#ff5020", 0.35, 14, 2.2, 1.2);
    embers.position.set(cx, 2.3, cz);
    const eu = (embers.material as THREE.ShaderMaterial).uniforms.uTime as { value: number };
    const slow = { get value() { return eu.value; }, set value(v: number) { eu.value = v * 0.35; } };
    this.timeUniforms.push(slow);
    g.add(embers);
    const fireGlow = glowSprite("#ff7a20", 2.6, 0.3);
    fireGlow.position.set(cx, 3.0, cz);
    g.add(fireGlow);
    const pillarU = { value: 0 };
    this.timeUniforms.push(pillarU);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.8, 26, 24, 1, true),
      new THREE.ShaderMaterial({
        vertexShader: UV_VS,
        fragmentShader: PILLAR_FS,
        uniforms: { uTime: pillarU, uColor: { value: new THREE.Color("#ffb25a") } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    pillar.position.set(cx, 14.5, cz);
    g.add(pillar);
    this.brazierLight.position.set(cx, 4.2, cz);

    // The banking rim: a glowing square of runes 5x5 around the centre.
    const s = 2.5;
    const pts = [
      [-s, -s], [s, -s], [s, -s], [s, s], [s, s], [-s, s], [-s, s], [-s, -s],
    ].map(([px, pz]) => new THREE.Vector3(cx + px!, 0.03, cz + pz!));
    this.rim = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0.8 }),
    );
    g.add(this.rim);
    const rimFill = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ color: "#ff9a3a", transparent: true, opacity: 0.08, depthWrite: false }),
    );
    rimFill.rotation.x = -Math.PI / 2;
    rimFill.position.set(cx, 0.025, cz);
    g.add(rimFill);
  }

  private addProp(kind: ModelName, x: number, z: number, height: number, footprint: number, seed: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData = { height, footprint };
    this.shrineGroup.add(group);
    this.propSlots.push({ kind, group, seed });
    this.fillProp(kind, group, seed);
  }

  private fillProp(kind: ModelName, group: THREE.Group, seed: number) {
    group.clear();
    const { height, footprint } = group.userData as { height: number; footprint: number };
    const rnd = (k: number) => fract(Math.sin(seed * 91.7 + k * 13.1) * 43758.5);
    const model = models[kind];
    if (model) {
      const m = model.clone();
      const a = model.userData.aspect as { w: number; d: number };
      // Scale to the height, but never wider than the footprint.
      const sc = Math.min(height, footprint / Math.max(a.w, a.d, 0.01));
      m.scale.multiplyScalar(sc * (0.9 + rnd(1) * 0.2));
      m.rotation.y = kind === "monolith" ? Math.round(rnd(2) * 4) * (Math.PI / 2) : rnd(2) * Math.PI * 2;
      group.add(m);
    } else if (kind === "monolith") {
      const m = new THREE.Mesh(new THREE.BoxGeometry(footprint * 0.8, height, footprint * 0.8), new THREE.MeshStandardMaterial({ color: "#6c6478", roughness: 0.9 }));
      m.position.y = height / 2;
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    } else if (kind === "boulder") {
      const geo = new THREE.DodecahedronGeometry(0.45, 1);
      jitter(geo, 0.08);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#77707a", roughness: 1, flatShading: true }));
      m.position.y = 0.32;
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    if (kind === "monolith" && height > 3) {
      // The tall corner monoliths carry a rune light.
      const gl = glowSprite("#8fd8ff", 0.9, 0.3);
      gl.position.y = height * 0.6;
      group.add(gl);
    }
  }

  private refreshBrazier() {
    this.brazierSlot.clear();
    const model = models.brazier;
    if (model) {
      const m = model.clone();
      const a = model.userData.aspect as { w: number; d: number };
      m.scale.multiplyScalar(Math.min(2.2, 3.2 / Math.max(a.w, a.d)));
      this.brazierSlot.add(m);
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: "#8d8494", roughness: 0.8 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 1.0, 24), mat);
      base.position.y = 0.5;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.8, 0.7, 32, 1, true), mat);
      bowl.position.y = 1.35;
      (bowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      for (const m of [base, bowl]) {
        m.castShadow = m.receiveShadow = true;
        this.brazierSlot.add(m);
      }
    }
  }

  private refreshProps() {
    for (const p of this.propSlots) this.fillProp(p.kind, p.group, p.seed);
    this.refreshBrazier();
    for (const r of this.players.values()) this.dressPlayer(r);
  }

  // -------------------------------------------------------------- players and wisps

  private makePlayer(guild: 0 | 1, flame: string): PlayerRig {
    const root = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.46, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(flame).multiplyScalar(1.6), transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    root.add(ring);
    const lantern = glowSprite(flame, 0.9);
    root.add(lantern);
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.22),
      new THREE.ShaderMaterial({
        vertexShader: UV_VS,
        fragmentShader: BEAM_FS,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(flame) }, uDash: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    beam.visible = false;
    this.scene.add(beam);
    this.scene.add(root);
    const rig: PlayerRig = { root, body: null, bodyKind: null, ring, lantern, beam, facing: 0, guild };
    this.dressPlayer(rig);
    return rig;
  }

  private dressPlayer(rig: PlayerRig) {
    const kind: ModelName = rig.guild === 0 ? "dawn" : "dusk";
    if (rig.body && (rig.body.userData.real || !models[kind])) return;
    if (rig.body) rig.root.remove(rig.body);
    const model = models[kind];
    let body: THREE.Object3D;
    if (model) {
      body = model.clone();
      body.scale.multiplyScalar(1.8);
      body.userData.real = true;
    } else {
      // Stand-in: a robed cone with a hood.
      body = new THREE.Group();
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.3, 16), new THREE.MeshStandardMaterial({ color: GUILD_COLORS[rig.guild], roughness: 0.7 }));
      robe.position.y = 0.65;
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: rig.guild === 0 ? "#c79a3a" : "#4a2a7a" }));
      hood.position.y = 1.3;
      for (const m of [robe, hood]) m.castShadow = true;
      body.add(robe, hood);
    }
    rig.body = body;
    rig.bodyKind = kind;
    rig.root.add(body);
  }

  private makeWisp(guild: 0 | 1): WispRig {
    const col = GUILD_COLORS[guild];
    const root = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 24, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(3) }),
    );
    root.add(core);
    const halo = glowSprite(col, 1.5, 0.8);
    root.add(halo);
    const light = new THREE.PointLight(col, 6, 6, 1.5);
    root.add(light);
    const trail = particles(this.low ? 24 : 48, col, "#ffffff", 0.32, 0.9, 0.15, 0.15);
    trail.position.y = -0.1;
    root.add(trail);
    this.timeUniforms.push((trail.material as THREE.ShaderMaterial).uniforms.uTime as { value: number });
    this.scene.add(root);
    return { root, core, halo, light, trail, lastX: NaN, lastY: NaN };
  }

  // -------------------------------------------------------------- frame

  render(st: DrawState) {
    const b = st.shrine.board;
    if (st.shrine.id !== this.shrineId) this.buildShrine(st.shrine);
    this.cam.update();
    const time = st.now / 1000;
    for (const u of this.timeUniforms) u.value = time;
    this.brazierLight.intensity = 38 + Math.sin(time * 9) * 4 + Math.sin(time * 23) * 3;
    const lerp = (a: number, z: number) => a + (z - a) * Math.min(1, st.t);

    // Wisps.
    const seenW = new Set<number>();
    const wispPos = new Map<number, THREE.Vector3>();
    let rimPulse = 0;
    for (const w of st.snap.wisps) {
      seenW.add(w.id);
      let rig = this.wisps.get(w.id);
      if (!rig) {
        rig = this.makeWisp(w.guild);
        this.wisps.set(w.id, rig);
      }
      const pw = st.prev?.wisps.find((q) => q.id === w.id);
      const jump = !pw || Math.abs(pw.x - w.x) > 2 || Math.abs(pw.y - w.y) > 2;
      const x = jump ? w.x : lerp(w.px, w.x);
      const y = jump ? w.y : lerp(w.py, w.y);
      const bob = Math.sin(time * 2.2 + w.id * 1.7) * 0.12;
      const sink = w.rim > 0 ? Math.min(1, w.rim * 0.5 + st.t * 0.5) : 0;
      rig.root.position.set(this.worldX(b, x), 0.75 + bob + sink * 1.4, this.worldZ(b, y));
      const s = 1 - sink * 0.6;
      rig.core.scale.setScalar(s * (st.hoverWisp === w.id ? 1.3 : 1));
      rig.halo.material.opacity = 0.85 * s;
      rig.light.intensity = 6 * s;
      if (w.rim > 0) rimPulse = Math.max(rimPulse, 1);
      wispPos.set(w.id, rig.root.position.clone());
    }
    for (const [id, rig] of this.wisps) if (!seenW.has(id)) (this.scene.remove(rig.root), this.wisps.delete(id));
    if (this.rim) (this.rim.material as THREE.LineBasicMaterial).opacity = 0.55 + rimPulse * 0.45 * (0.5 + 0.5 * Math.sin(time * 10));

    // Lamplighters.
    const seenP = new Set<number>();
    for (const p of st.snap.players) {
      seenP.add(p.id);
      const flame = FLAME_COLORS[st.flames.get(p.id) ?? "amber"];
      let rig = this.players.get(p.id);
      if (!rig || rig.guild !== p.guild) {
        if (rig) (this.scene.remove(rig.root), this.scene.remove(rig.beam));
        rig = this.makePlayer(p.guild, flame);
        this.players.set(p.id, rig);
      }
      (rig.ring.material as THREE.MeshBasicMaterial).color.set(flame).multiplyScalar(p.id === st.me ? 2.2 : 1.2);
      rig.lantern.material.color.set(flame).multiplyScalar(2);
      const x = lerp(p.px, p.x);
      const y = lerp(p.py, p.y);
      const wx = this.worldX(b, x);
      const wz = this.worldZ(b, y);
      const moving = p.px !== p.x || p.py !== p.y;
      // Face where we're going, or the wisp we're holding.
      let face = rig.facing;
      if (p.beam !== null && wispPos.get(p.beam)) {
        const t = wispPos.get(p.beam)!;
        face = Math.atan2(t.x - wx, t.z - wz);
      } else if (moving) face = Math.atan2(p.x - p.px, p.y - p.py);
      rig.facing = lerpAngle(rig.facing, face, 0.18);
      rig.root.position.set(wx, moving ? Math.abs(Math.sin(time * 9)) * 0.06 : Math.sin(time * 1.6 + p.id) * 0.03, wz);
      if (rig.body) rig.body.rotation.y = rig.facing;
      // Lantern sits up and to the side of the figure, where the staff head is.
      const side = new THREE.Vector3(-0.38, 1.74, 0.07).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.facing);
      rig.lantern.position.copy(side);
      rig.lantern.scale.setScalar(0.9 + Math.sin(time * 7 + p.id) * 0.06);

      const beam = rig.beam;
      const target = p.beam !== null ? wispPos.get(p.beam) : undefined;
      if (target) {
        const from = rig.root.position.clone().add(side);
        const mid = from.clone().add(target).multiplyScalar(0.5);
        const len = from.distanceTo(target);
        beam.visible = true;
        beam.position.copy(mid);
        beam.scale.set(len, 1, 1);
        // Billboard the ribbon around its own axis toward the camera.
        const dir = target.clone().sub(from).normalize();
        const toCam = this.cam.three.position.clone().sub(mid).normalize();
        const up = new THREE.Vector3().crossVectors(dir, toCam).normalize();
        const normal = new THREE.Vector3().crossVectors(dir, up);
        beam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, normal));
        const u = (beam.material as THREE.ShaderMaterial).uniforms;
        u.uTime!.value = time;
        u.uColor!.value.set(p.slipped ? "#777777" : p.mode === "pull" ? flame : "#ff5a5a");
        u.uDash!.value = p.mode === "push" ? 1 : 0;
      } else beam.visible = false;
    }
    for (const [id, rig] of this.players)
      if (!seenP.has(id)) (this.scene.remove(rig.root), this.scene.remove(rig.beam), this.players.delete(id));

    // My reach square and walk marker.
    const me = st.snap.players.find((p) => p.id === st.me);
    if (me) {
      const r = me.mode === "pull" ? PULL_REACH : PUSH_REACH;
      const mx = lerp(me.px, me.x);
      const my = lerp(me.py, me.y);
      const x0 = Math.max(1, mx - r);
      const y0 = Math.max(1, my - r);
      const x1 = Math.min(b.width - 1, mx + r + 1);
      const y1 = Math.min(b.height - 1, my + r + 1);
      const ox = b.width / 2;
      const oy = b.height / 2;
      const pos = this.reach.geometry.getAttribute("position") as THREE.BufferAttribute;
      pos.setXYZ(0, x0 - ox, 0.05, y0 - oy);
      pos.setXYZ(1, x1 - ox, 0.05, y0 - oy);
      pos.setXYZ(2, x1 - ox, 0.05, y1 - oy);
      pos.setXYZ(3, x0 - ox, 0.05, y1 - oy);
      pos.needsUpdate = true;
      this.reach.computeLineDistances();
      (this.reach.material as THREE.LineDashedMaterial).color.set(me.mode === "pull" ? "#fff3c4" : "#ff9a9a");
      this.reach.visible = true;
      this.walkMark.visible = !!me.walkTo;
      if (me.walkTo) {
        this.walkMark.position.set(this.worldX(b, me.walkTo.x), 0.05, this.worldZ(b, me.walkTo.y));
        this.walkMark.scale.setScalar(1 + Math.sin(time * 6) * 0.1);
      }
    } else {
      this.reach.visible = false;
      this.walkMark.visible = false;
    }

    this.composer.render();
  }
}

// ------------------------------------------------------------------ 2D overlay (names, mini-map)

export function drawOverlay(g: CanvasRenderingContext2D, cam: Camera, st: DrawState) {
  g.clearRect(0, 0, cam.w, cam.h);
  const lerp = (a: number, z: number) => a + (z - a) * Math.min(1, st.t);
  for (const pl of st.snap.players) {
    const x = lerp(pl.px, pl.x) + 0.5;
    const y = lerp(pl.py, pl.y) + 0.5;
    const p = cam.toScreen(x, y, 2.05);
    const fs = Math.max(11, Math.min(14, cam.scale * 0.4));
    g.font = `600 ${fs}px system-ui, sans-serif`;
    g.textAlign = "center";
    const label = pl.name + (pl.id === st.me ? " (you)" : "");
    const tw = g.measureText(label).width + 10;
    g.fillStyle = "rgba(10,6,18,0.55)";
    roundRect(g, p.x - tw / 2, p.y - fs - 4, tw, fs + 8, 6);
    g.fill();
    g.fillStyle = GUILD_COLORS[pl.guild];
    g.fillText(label, p.x, p.y);
  }
}

export function drawMinimap(g: CanvasRenderingContext2D, cam: Camera, st: DrawState, rect: { x: number; y: number; w: number; h: number }) {
  const b = st.shrine.board;
  const k = rect.w / b.width;
  g.save();
  g.globalAlpha = 0.85;
  g.fillStyle = "#1d1b26";
  roundRect(g, rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 8);
  g.fill();
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const t = b.tiles[y * b.width + x];
      g.fillStyle = t === Tile.Wall ? "#4a4a55" : t === Tile.Water ? "#3f9fa8" : t === Tile.Rock ? "#888" : t === Tile.Brazier ? "#ff9a3a" : "#3b3346";
      g.fillRect(rect.x + x * k, rect.y + y * k, Math.ceil(k), Math.ceil(k));
    }
  for (const w of st.snap.wisps) {
    g.fillStyle = GUILD_COLORS[w.guild];
    g.beginPath();
    g.arc(rect.x + (w.x + 0.5) * k, rect.y + (w.y + 0.5) * k, Math.max(2, k * 0.7), 0, Math.PI * 2);
    g.fill();
  }
  for (const p of st.snap.players) {
    g.fillStyle = p.id === st.me ? "#fff" : GUILD_COLORS[p.guild];
    g.fillRect(rect.x + p.x * k, rect.y + p.y * k, Math.max(2, k), Math.max(2, k));
  }
  // Where the camera looks.
  g.strokeStyle = "rgba(255,255,255,0.8)";
  g.lineWidth = 1;
  g.beginPath();
  g.arc(rect.x + cam.cx * k, rect.y + cam.cy * k, 3, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

// ------------------------------------------------------------------ helpers

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fract(n: number) {
  return n - Math.floor(n);
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function jitter(geo: THREE.BufferGeometry, amount: number) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
}

function mergeGeometries(geos: THREE.BufferGeometry[]) {
  let n = 0;
  for (const g of geos) n += g.getAttribute("position").count;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const idx: number[] = [];
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    const u = g.getAttribute("uv") as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, o * 3);
    uv.set(u.array as Float32Array, o * 2);
    for (const i of g.index!.array) idx.push(i + o);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
