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
import { PULL_REACH, PUSH_REACH, type GameSnapshot, type Guild } from "../engine/game.js";
import { armSamples, ringWalls, type Ring, type Shrine } from "../engine/maps.js";
import { contourLoops } from "./contour.js";
import { FLAME_COLORS, type Flame } from "../engine/protocol.js";
import { makeCloud, makeIsland, makeWaterfall } from "./islands.js";
import { ambientParticles, makeTileProp, themeFor, type PropKind, type Theme } from "./themes.js";

export const GUILD_COLORS: readonly string[] = ["#ffcf5a", "#b07cff", "#4fd6ff", "#6fe07a"];
export const GUILD_NAMES: readonly string[] = ["Dawn", "Dusk", "Tide", "Grove"];

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
  readonly three = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1300);
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
    this.scale = this.fitScale(board);
  }

  /** Closer than the whole-board view, so the camera should track the player. */
  get zoomedIn() {
    return !!this.board && this.scale > this.fitScale(this.board) * 1.05;
  }

  private fitScale(board: Board) {
    return Math.min(this.w / (board.width + 6), this.h / ((board.height + 4) * 0.95));
  }

  /** Zoomed out past the plaza, the camera tips down toward the horizon to show the island. */
  private get pitch() {
    const b = this.board;
    if (!b) return PITCH;
    const fit = this.fitScale(b);
    const lo = this.minScale(b);
    if (this.scale >= fit || fit <= lo) return PITCH;
    const t = (fit - this.scale) / (fit - lo);
    return PITCH - THREE.MathUtils.degToRad(28) * t * t * (3 - 2 * t);
  }

  private minScale(board: Board) {
    return Math.min(this.w / (board.width + 44), this.h / (board.height + 44));
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
    const pitch = this.pitch;
    cam.position.set(target.x, Math.sin(pitch) * d, target.z + Math.cos(pitch) * d);
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
    const lo = this.minScale(board);
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

/**
 * For locked-down pages: no WebAssembly decoder (those copies are stored uncompressed) and
 * textures read through <img> rather than fetch.
 */
const plainLoader = new GLTFLoader().register((parser) => {
  (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: "plain_textures" };
});

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
        // Hosts that won't serve .glb (the shareable demo page) get it as base64 text instead.
        fetch(`models/${n}.glb.txt`)
          .then((r) => (r.ok ? r.text() : Promise.reject()))
          .then((b64) => {
            const bin = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
            plainLoader.parse(bin.buffer, "", (g: GLTF) => {
              models[n] = normalize(g.scene, n === "monolith");
              modelWaiters.forEach((f) => f());
            });
          })
          .catch(() => {
            /* missing model: the procedural stand-in stays */
          });
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

function tex(path: string, repeat: number, fallback?: string) {
  const t = texLoader.load(path, undefined, undefined, () => {
    if (fallback) texLoader.load(fallback, (img) => {
      t.image = img.image;
      t.needsUpdate = true;
    });
  });
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
uniform vec3 uZenith;
uniform vec3 uSky;
uniform vec3 uHaze;
uniform vec3 uBelow;
uniform float uStars;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uSky, uZenith, smoothstep(0.1, 0.75, h));
  col = mix(uHaze, col, smoothstep(-0.05, 0.22, h));
  // Below the horizon: open sky beneath the cloud sea, deepening straight down.
  vec3 below = mix(uBelow, uHaze, smoothstep(-0.9, -0.1, h));
  col = mix(below, col, smoothstep(-0.25, -0.02, h));
  // The sun (or, at night, a pale moon) and stars.
  vec3 sunDir = normalize(vec3(-0.5, 0.45, -0.75));
  float s = max(0.0, dot(d, sunDir));
  float night = min(uStars, 1.0);
  // By day a hot sun; by night a full moon with a soft halo.
  float disc = mix(pow(s, 400.0) * 3.0, smoothstep(0.9986, 0.9991, s) * 1.7 + pow(s, 90.0) * 0.4, night);
  col += mix(vec3(1.0, 0.92, 0.75), vec3(0.8, 0.88, 1.0), night) * (disc + pow(s, 12.0) * mix(0.35, 0.12, night));
  if (uStars > 0.0) {
    vec3 cell = floor(d * 160.0);
    float star = step(0.9965, hash(cell)) * smoothstep(-0.1, 0.3, h);
    col += vec3(star) * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 1.0) * 40.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uTint;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec2 p = vUv * 10.0 + vec2(uTime * 0.01, uTime * 0.005);
  float n = fbm(p + fbm(p * 0.6));
  float r = length(vUv - 0.5) * 2.0;
  // Bright billowing tops, cool blue-grey in the hollows.
  vec3 col = mix(uTint * vec3(0.62, 0.70, 0.86), uTint, smoothstep(0.35, 0.8, n));
  float alpha = smoothstep(0.42, 0.68, n) * smoothstep(1.0, 0.4, r);
  gl_FragColor = vec4(col, alpha);
}`;

const UV_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const WATER_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform float uIce;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  // The pools' soft outline: a blurred tile mask, its edge roughened with noise.
  vec2 t = vUv * uSize;
  vec2 warp = vec2(noise(t * 0.9 + 3.1), noise(t * 0.9 + 7.7)) - 0.5;
  float m = texture2D(uMask, vUv + warp * 0.7 / uSize).r + (noise(t * 1.7) - 0.5) * 0.14 + (noise(t * 4.3) - 0.5) * 0.05;
  float shore = smoothstep(0.30, 0.40, m);
  float body = smoothstep(0.46, 0.52, m);
  if (shore < 0.01) discard;
  vec3 col;
  if (uIce > 0.5) {
    float streak = noise(vec2(t.x * 0.6 + t.y * 0.9, t.y * 3.0));
    vec3 deep = vec3(0.30, 0.66, 0.90);
    vec3 lit = vec3(0.86, 0.97, 1.0);
    col = mix(deep, lit, smoothstep(0.35, 0.9, streak) * 0.7 + smoothstep(0.52, 0.8, m) * 0.15);
    col = mix(vec3(0.92, 0.97, 1.0), col, body);
    gl_FragColor = vec4(col * 1.05, mix(0.5, 0.92, body) * shore);
    return;
  }
  vec2 p = t * 1.6;
  float w = sin(p.x * 1.3 + uTime * 1.4) * sin(p.y * 1.1 - uTime * 1.1) + sin((p.x + p.y) * 0.7 + uTime);
  vec3 deep = vec3(0.01, 0.13, 0.24);
  vec3 lit = vec3(0.12, 0.56, 0.72);
  // Shallower (lighter) near the edge, deeper in the middle.
  float depth = smoothstep(0.5, 0.85, m);
  col = mix(lit, deep, depth);
  col = mix(col, lit, smoothstep(0.6, 1.9, w) * 0.45);
  // A thin line of foam where the water meets the stone.
  float foam = body * (1.0 - smoothstep(0.52, 0.58, m));
  col = mix(col, vec3(0.92, 0.97, 1.0), foam * 0.7);
  // Outside the water: a dark wet band on the stone.
  vec3 wet = vec3(0.10, 0.10, 0.09);
  gl_FragColor = vec4(mix(wet, col, body), mix(0.35, 0.96, body) * shore);
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

/**
 * A soft mask of every tile of one kind: a disc on each tile, blurred, so neighbouring tiles
 * melt into one rounded pool. The water shader thresholds it into a natural outline.
 */
function poolMask(b: Board, kind: Tile): THREE.Texture | null {
  const PX = 16;
  const c = document.createElement("canvas");
  c.width = b.width * PX;
  c.height = b.height * PX;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff";
  let any = false;
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      if (b.tiles[y * b.width + x] !== kind) continue;
      any = true;
      g.beginPath();
      g.arc((x + 0.5) * PX, (y + 0.5) * PX, PX * 0.6, 0, Math.PI * 2);
      g.fill();
      // Join to the right and below so pools are one body, not beads.
      if (b.tiles[y * b.width + x + 1] === kind && x + 1 < b.width) g.fillRect((x + 0.5) * PX, (y + 0.5) * PX - PX * 0.45, PX, PX * 0.9);
      if (y + 1 < b.height && b.tiles[(y + 1) * b.width + x] === kind) g.fillRect((x + 0.5) * PX - PX * 0.45, (y + 0.5) * PX, PX * 0.9, PX);
    }
  if (!any) return null;
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  const o = out.getContext("2d")!;
  o.filter = `blur(${PX * 0.45}px)`;
  o.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

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
  guild: Guild;
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
  private distantPush = 0;
  private timeUniforms: { value: number }[] = [];
  private players = new Map<number, PlayerRig>();
  private wisps = new Map<number, WispRig>();
  private brazierLight = new THREE.PointLight("#ff9a4a", 60, 30, 1.6);
  private rim: THREE.LineSegments | null = null;
  private reach: THREE.LineLoop;
  private walkMark: THREE.Mesh;
  private brazierSlot = new THREE.Group();
  private propSlots: { kind: PropKind; group: THREE.Group; seed: number }[] = [];
  private low: boolean;
  private floaters: { obj: THREE.Object3D; y: number; phase: number; drift: number }[] = [];
  private skyU = {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() },
    uBelow: { value: new THREE.Color() },
    uStars: { value: 0 },
  };
  private cloudTint = { value: new THREE.Color("#ffffff") };
  private hemi = new THREE.HemisphereLight("#cfe2ff", "#5a6a50", 1.15);
  private sun = new THREE.DirectionalLight("#fff1d6", 3.0);
  private distant = new THREE.Group();
  private theme: Theme = themeFor("");

  constructor(readonly canvas: HTMLCanvasElement, readonly cam: Camera) {
    this.low = cam.compact || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.FogExp2("#9dbde8", 0.0028);
    this.scene.background = new THREE.Color("#8fb4e6");

    // Sky dome.
    this.timeUniforms.push(this.skyU.uTime);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    // The dome travels with the camera, so zooming out over a big island never reaches its edge.
    sky.onBeforeRender = (_r, _s, cam) => sky.position.copy(cam.position);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // Sea of cloud far below.
    const cloudU = { value: 0 };
    this.timeUniforms.push(cloudU);
    const clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: CLOUD_FS, uniforms: { uTime: cloudU, uTint: this.cloudTint }, transparent: true, depthWrite: false, fog: false }),
    );
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.y = -18;
    this.scene.add(clouds);

    // Distant sky islands are built with each shrine, in its palette.
    this.scene.add(this.distant);

    // Light: cool moonlight, warm brazier.
    this.scene.add(this.hemi);
    const moon = this.sun;
    moon.position.set(-16, 26, -22);
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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    modelWaiters.push(() => this.refreshProps());
  }

  /** Sky, fog, light and the distant islands for one island's theme. */
  private applyTheme(th: Theme) {
    this.theme = th;
    const u = this.skyU;
    u.uZenith.value.set(th.sky.zenith);
    u.uSky.value.set(th.sky.sky);
    u.uHaze.value.set(th.sky.haze);
    u.uBelow.value.set(th.sky.below);
    u.uStars.value = th.sky.stars;
    (this.scene.fog as THREE.FogExp2).color.set(th.fog);
    (this.scene.background as THREE.Color).set(th.sky.sky);
    this.cloudTint.value.set(th.clouds);
    this.hemi.color.set(th.hemi[0]);
    this.hemi.groundColor.set(th.hemi[1]);
    this.hemi.intensity = th.hemi[2];
    this.sun.color.set(th.sun[0]);
    this.sun.intensity = th.sun[1];
    this.renderer.toneMappingExposure = th.exposure;
    this.buildDistantIslands(th);
  }

  private buildDistantIslands(th: Theme) {
    this.distant.clear();
    this.floaters = [];
    const fallU = { value: 0 };
    this.timeUniforms.push(fallU);
    const n = this.low ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(i * 4.7) * 0.25;
      const r = 48 + ((i * 37) % 5) * 14 + this.distantPush;
      const size = 3 + ((i * 53) % 7) * 1.4;
      const isl = makeIsland({ rx: size, rz: size * (0.7 + ((i * 17) % 5) * 0.08), depth: size * 2.4, squareness: 2.2, seed: i * 13 + 5, segments: 64, rings: 24, lobes: 0.5, ledge: i % 3 === 0 ? size * 0.3 : 0, spires: this.low ? 1 : 3, grass: th.grass, soil: th.soil, rock: th.rock });
      const y = -6 + ((i * 29) % 9) * 2.2 - (r - 48) * 0.12;
      isl.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      isl.rotation.y = i;
      const trees = 1 + (i % 3);
      for (let t = 0; t < trees; t++) {
        const tree = th.scatter(size * 0.45, i * 7 + t);
        const ta = t * 2.1 + i;
        tree.position.set(Math.cos(ta) * size * 0.45, 0, Math.sin(ta) * size * 0.35);
        isl.add(tree);
      }
      if (i % 2 === 0) {
        const fall = makeWaterfall(size * 0.25, size * 3.5, fallU);
        fall.position.set(0, -0.05, size * 0.7);
        isl.add(fall);
      }
      this.distant.add(isl);
      this.floaters.push({ obj: isl, y, phase: i * 1.3, drift: 0.4 + (i % 3) * 0.2 });
    }
    // Soft cloud puffs drifting between the islands.
    for (let i = 0; i < (this.low ? 10 : 18); i++) {
      const a = (i / 18) * Math.PI * 2 + i;
      const r = 30 + ((i * 41) % 60);
      const c = makeCloud(16 + (i % 4) * 7, th.clouds, th.sky.stars ? 0.25 : 0.45);
      const y = -10 + ((i * 23) % 10);
      c.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      this.distant.add(c);
      this.floaters.push({ obj: c, y, phase: i, drift: 0.2 });
    }
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
    this.shrineId = shrine.id + "~" + shrine.teams;
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
    const th = themeFor(shrine.id);
    // Keep the far islands clear of a big island's edge.
    this.distantPush = Math.max(0, Math.max(W, H) / 2 - 28);
    this.applyTheme(th);

    // The coastline the rules use: tiles past it are open sky. Shrines without one are the
    // old walled rectangle, drawn as a rounded square.
    const hw = W / 2 - 0.5, hh = H / 2 - 0.5;
    const coast =
      shrine.outline ??
      ((a: number) => {
        const c = Math.cos(a), sn = Math.sin(a);
        const n = 10;
        return 1 / Math.pow(Math.pow(Math.abs(c) / hw, n) + Math.pow(Math.abs(sn) / hh, n), 1 / n);
      });
    const ring = (a: number, out: number) => ({ x: Math.cos(a) * (coast(a) + out), z: Math.sin(a) * (coast(a) + out) });

    // The plaza: flagstones laid right up to the island's edge.
    const floorTex = tex(`textures/floor-${th.floor}.webp`, 1 / 6, `textures/floor-${shrine.id}.webp`);
    const floorShape = new THREE.Shape();
    // Tentacle islands: trace the edge from the rules' own coast field instead of a radius.
    const coastField = shrine.arms && shrine.coast ? shrine.coast : null;
    const traced = (out: number) =>
      contourLoops((x, y) => coastField!(x, y) - out, -W / 2 - 3, -H / 2 - 3, W / 2 + 3, H / 2 + 3, 0.5);
    if (coastField) {
      // The longest loop is the outer edge; the rest are the gaps of sky between routes.
      const [outer, ...holes] = traced(0.35);
      (outer ?? []).forEach((p, i) => (i === 0 ? floorShape.moveTo(p.x, -p.y) : floorShape.lineTo(p.x, -p.y)));
      for (const h of holes) {
        const path = new THREE.Path();
        h.forEach((p, i) => (i === 0 ? path.moveTo(p.x, -p.y) : path.lineTo(p.x, -p.y)));
        floorShape.holes.push(path);
      }
    } else
      for (let i = 0; i <= 256; i++) {
        const p = ring((i / 256) * Math.PI * 2, 0.35);
        if (i === 0) floorShape.moveTo(p.x, -p.z);
        else floorShape.lineTo(p.x, -p.z);
      }
    const floor = new THREE.Mesh(
      new THREE.ShapeGeometry(floorShape, 1),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, color: "#ffffff" }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    g.add(floor);
    const wallTex = tex("sprites/wall.png", 3);
    // The island itself follows the coastline, with a grassy verge outside the parapet, then
    // the cliff, a grassy terrace and hanging spires.
    const island = makeIsland({
      rx: 1, rz: 1, depth: 24, squareness: 2, seed: W + H,
      radius: (a) => (coast(a) + 2.1) / 0.95,
      ledge: 2.4, spires: this.low ? 3 : 6, grass: th.grass, soil: th.soil, rock: th.rock,
      segments: this.low ? 128 : 220,
    });
    island.position.y = -0.03;
    g.add(island);
    // Each arm is a chain of overlapping plateaus that shrink toward the tip.
    if (shrine.isle?.arms?.length) {
      const pts = armSamples(shrine.isle);
      const every = this.low ? 6 : 4;
      pts.forEach((p, i) => {
        if (i % every) return;
        const r = p.w + 2.1;
        const lobe = makeIsland({
          rx: r, rz: r, depth: 6 + r * 2, squareness: 2, seed: i * 7 + 3, ledge: r * 0.25,
          spires: i % (every * 3) === 0 ? 1 : 0, grass: th.grass, soil: th.soil, rock: th.rock, segments: 40, rings: 18,
        });
        lobe.position.set(p.x, -0.035 - (i % 7) * 0.002, p.y);
        g.add(lobe);
      });
    }
    const edge = island.userData.outline as (a: number) => { x: number; z: number };
    // Lower tiers: smaller plateaus stepping down from the main one, so the whole thing reads as
    // one broken table of land rather than a single slab.
    const tiers: [number, number, number][] = [[0.9, 0.24, -4.5], [2.6, 0.2, -6.5], [4.3, 0.17, -3.6]];
    const fallU = { value: 0 };
    this.timeUniforms.push(fallU);
    const falls = th.particles !== "embers";
    const tierList: { x: number; y: number; z: number; r: number; group: THREE.Group }[] = [];
    // Each island turns its tiers a different way so no two look alike.
    const spin = [...shrine.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) * 0.37;
    tiers.forEach(([a0, size, ty], i) => {
      const a = a0 + spin;
      const e = edge(a);
      // Sized by the core, not the board: a tentacle island's board is mostly sky.
      const r = (shrine.arms ? coast(0) + coast(Math.PI / 2) : Math.min(W, H)) * size;
      const tier = makeIsland({
        rx: r, rz: r * 0.8, depth: 9 + i * 3, squareness: 2.6, seed: W * 7 + i,
        lobes: 0.45, spires: this.low ? 1 : 2, grass: th.grass, soil: th.soil, rock: th.rock, segments: 72, rings: 28,
      });
      tier.position.set(e.x * 1.02, ty, e.z * 1.02);
      g.add(tier);
      tierList.push({ x: tier.position.x, y: ty, z: tier.position.z, r, group: tier });
      if (!falls) return;
      // Each tier spills a waterfall off its outer edge.
      const te = (tier.userData.outline as typeof edge)(a);
      const fall = makeWaterfall(1.4, 20, fallU);
      fall.position.set(te.x * 0.97, -0.1, te.z * 0.97);
      fall.rotation.y = Math.PI / 2 - a;
      tier.add(fall);
    });
    // Waterfalls pour off the main plateau's terrace too.
    for (const a of falls ? [Math.PI * 1.35, Math.PI * 0.05, Math.PI * 1.85] : []) {
      const e = edge(a);
      const fall = makeWaterfall(1.8, 24, fallU);
      fall.position.set(e.x * 1.15, -2.85, e.z * 1.15);
      fall.rotation.y = Math.PI / 2 - a;
      g.add(fall);
      const mist = makeCloud(8, "#ffffff", 0.35);
      mist.position.set(e.x * 1.05, -22, e.z * 1.05);
      g.add(mist);
    }
    // The island's own set pieces, mostly on the far (north) verge where they frame the view
    // without hiding anyone, and its drifting particles.
    th.decorate({ group: g, ring, tiers: tierList, time: (u) => this.timeUniforms.push(u), low: this.low });
    const amb = ambientParticles(th.particles, Math.max(W, H) * 0.65, this.low, (u) => this.timeUniforms.push(u));
    if (amb) g.add(amb);

    // A low rounded parapet runs round the edge of the flagstones: the limit of play.
    const curbPts: THREE.Vector3[] = [];
    const curbMat = new THREE.MeshStandardMaterial({ map: wallTex, color: "#c9bda8", roughness: 0.85 });
    if (coastField) {
      // One parapet per loop: round the outside and round each gap.
      const [outer, ...holes] = traced(0.45);
      (outer ?? []).forEach((p, i) => i % 2 === 0 && curbPts.push(new THREE.Vector3(p.x, 0.12, p.y)));
      for (const h of holes) {
        const pts = h.filter((_, i) => i % 2 === 0).map((p) => new THREE.Vector3(p.x, 0.12, p.y));
        if (pts.length < 4) continue;
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), pts.length * 2, 0.26, 10, true), curbMat);
        tube.castShadow = tube.receiveShadow = true;
        g.add(tube);
      }
    } else
      for (let i = 0; i < 240; i++) {
        const p = ring((i / 240) * Math.PI * 2, 0.45);
        curbPts.push(new THREE.Vector3(p.x, 0.12, p.z));
      }
    const curb = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curbPts, true), Math.max(480, curbPts.length * 2), 0.26, 14, true),
      new THREE.MeshStandardMaterial({ map: wallTex, color: "#c9bda8", roughness: 0.85 }),
    );
    curb.castShadow = curb.receiveShadow = true;
    g.add(curb);
    // Four tall monoliths stand on the verge for scale.
    for (let k = 0; k < 4; k++) {
      const p = ring(Math.PI / 4 + (k * Math.PI) / 2, 1.2);
      this.addProp(th.wall, p.x, p.z, 4.2, 1.3, k);
    }

    // Tiles. Walls and boulders are props; pools and ice are painted as soft shapes over the
    // floor from a blurred mask of their tiles, so they read as natural pools, not squares.
    const waterU = { value: 0 };
    this.timeUniforms.push(waterU);
    let seed = 1;
    const ringSet = new Set(shrine.rings.flatMap(ringWalls).map((p) => `${p.x},${p.y}`));
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const t = b.tiles[y * W + x];
        const wx = this.worldX(b, x);
        const wz = this.worldZ(b, y);
        seed++;
        if (t === Tile.Wall && ringSet.has(`${x - b.center.x},${y - b.center.y}`)) continue;
        if (t === Tile.Wall) this.addProp(th.wall, wx, wz, 2.8, 2.2, seed);
        else if (t === Tile.Rock) this.addProp(th.boulder, wx, wz, 0.9, 1.05, seed);
      }
    for (const [kind, ice] of [[Tile.Water, 0], [Tile.Ice, 1]] as const) {
      const mask = poolMask(b, kind);
      if (!mask) continue;
      const plane = new THREE.PlaneGeometry(W, H);
      plane.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(
        plane,
        new THREE.ShaderMaterial({
          vertexShader: UV_VS,
          fragmentShader: WATER_FS,
          uniforms: { uTime: waterU, uMask: { value: mask }, uSize: { value: new THREE.Vector2(W, H) }, uIce: { value: ice } },
          transparent: true,
          depthWrite: false,
        }),
      );
      m.position.y = 0.025 + ice * 0.005;
      g.add(m);
    }

    for (const r of shrine.rings) g.add(this.makeArches(b, r, th, wallTex));

    // The brazier dais: stepped stone circles, the brazier model, fire, a pillar of light.
    const c = b.center;
    const cx = this.worldX(b, c.x);
    const cz = this.worldZ(b, c.y);
    const daisMat = new THREE.MeshStandardMaterial({ map: floorTex, color: "#9a8f9c", roughness: 0.85 });
    for (const [r, h] of [[2.4, 0.18], [1.9, 0.36]] as const) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.1, h, 72), daisMat);
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

  /**
   * One ring of archways round the brazier, drawn from the same pillar tiles the engine uses:
   * a pillar on each, a lintel joining neighbours along a side, and an arch over every gap of
   * 1 to 3 tiles between two pillars. A pillar standing alone is drawn taller, as an obelisk.
   */
  private makeArches(b: Board, ring: Ring, th: Theme, wallTex: THREE.Texture) {
    const g = new THREE.Group();
    const R = ring.radius;
    const cx = this.worldX(b, b.center.x), cz = this.worldZ(b, b.center.y);
    const stone = new THREE.MeshStandardMaterial({ map: wallTex, color: th.arch ? new THREE.Color(th.arch) : new THREE.Color(th.rock).lerp(new THREE.Color("#f2ebde"), 0.6), roughness: 0.8 });
    const rune = new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ff9a3a", emissiveIntensity: 1.6 });
    const H = 1.7;
    const walls = new Set(ringWalls(ring).map((p) => `${p.x},${p.y}`));
    const isWall = (x: number, y: number) => walls.has(`${x},${y}`);
    const add = (m: THREE.Mesh) => {
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const pillarGeo = new THREE.BoxGeometry(0.62, 1, 0.62);
    const capGeo = new THREE.BoxGeometry(0.82, 0.18, 0.82);
    const baseGeo = new THREE.BoxGeometry(0.8, 0.2, 0.8);
    for (const key of walls) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      let near = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (isWall(x + ox, y + oy)) near++;
      const lone = near === 0;
      const h = lone ? H * 1.5 : Math.abs(x) === R && Math.abs(y) === R ? H * 1.15 : H;
      const w = lone ? 1.2 : 1;
      const px = cx + x, pz = cz + y;
      const p = add(new THREE.Mesh(pillarGeo, stone));
      p.scale.set(w, h, w);
      p.position.set(px, h / 2, pz);
      add(new THREE.Mesh(baseGeo, stone)).position.set(px, 0.1, pz);
      const cap = add(new THREE.Mesh(capGeo, stone));
      cap.position.set(px, h + 0.09, pz);
      cap.scale.set(w, 1, w);
      if (th.crown && near <= 1) {
        const c = th.crown(x * 7 + y * 3 + 50);
        c.position.set(px, h + 0.55, pz);
        g.add(c);
      } else if (lone) {
        const r = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.22), rune));
        r.position.set(px, h + 0.45, pz);
        r.castShadow = false;
      }
    }
    // Walk each side: lintels between neighbouring pillars, arches over short gaps.
    for (let k = 0; k < 4; k++) {
      const turn = (t: number): [number, number] => {
        let x = t, y = -R;
        for (let i = 0; i < k; i++) [x, y] = [-y, x];
        return [x, y];
      };
      let last: number | null = null;
      for (let t = -R; t <= R; t++) {
        const [x, y] = turn(t);
        if (!isWall(x, y)) continue;
        if (last !== null) {
          const gap = t - last - 1;
          const [x0, y0] = turn(last);
          const mx = cx + (x0 + x) / 2, mz = cz + (y0 + y) / 2;
          const along = x0 !== x;
          if (gap === 0) {
            const lintel = add(new THREE.Mesh(new THREE.BoxGeometry(along ? 1.7 : 0.5, 0.3, along ? 0.5 : 1.7), stone));
            lintel.position.set(mx, H + 0.3, mz);
          } else if (gap <= 3) {
            const span = (gap + 1) / 2;
            const arch = add(new THREE.Mesh(new THREE.TorusGeometry(span, 0.26, 10, 28, Math.PI), stone));
            arch.position.set(mx, H + 0.18, mz);
            arch.scale.set(1, Math.min(1, 1.1 / span + 0.2), 1.6);
            arch.rotation.y = along ? 0 : Math.PI / 2;
            if (gap >= 2) {
              const key = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.2), rune));
              key.position.set(mx, H + 0.18 + span * arch.scale.y, mz);
              key.castShadow = false;
            }
          }
        }
        last = t;
      }
    }
    return g;
  }

  private addProp(kind: PropKind, x: number, z: number, height: number, footprint: number, seed: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData = { height, footprint };
    this.shrineGroup.add(group);
    this.propSlots.push({ kind, group, seed });
    this.fillProp(kind, group, seed);
  }

  private fillProp(kind: PropKind, group: THREE.Group, seed: number) {
    group.clear();
    const { height, footprint } = group.userData as { height: number; footprint: number };
    const rnd = (k: number) => fract(Math.sin(seed * 91.7 + k * 13.1) * 43758.5);
    const proc = makeTileProp(kind, height, seed);
    if (proc) {
      group.add(proc);
      return;
    }
    const model = models[kind as ModelName];
    if (model) {
      const m = model.clone();
      const tint = this.theme.tint;
      if (tint)
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.color.multiply(new THREE.Color(tint));
            mesh.material = mat;
          }
        });
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
      const geo = new THREE.SphereGeometry(0.42, 24, 16);
      geo.scale(1, 0.75, 1);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#77707a", roughness: 1 }));
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

  private makePlayer(guild: Guild, flame: string): PlayerRig {
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
    // Tide wears Dusk's robe and Grove wears Dawn's, recoloured below.
    const kind: ModelName = rig.guild === 0 || rig.guild === 3 ? "dawn" : "dusk";
    if (rig.body && (rig.body.userData.real || !models[kind])) return;
    if (rig.body) rig.root.remove(rig.body);
    const model = models[kind];
    let body: THREE.Object3D;
    if (model) {
      body = model.clone();
      body.scale.multiplyScalar(1.8);
      body.userData.real = true;
      if (rig.guild >= 2) {
        // Re-dye the borrowed robe in this guild's colour.
        const dye = new THREE.Color(GUILD_COLORS[rig.guild]);
        body.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mt) => {
            const c = mt.clone() as THREE.MeshStandardMaterial;
            if (c.color) {
              const hsl = { h: 0, s: 0, l: 0 };
              c.color.getHSL(hsl);
              if (hsl.s > 0.15) c.color.lerp(dye.clone().multiplyScalar(Math.max(0.35, hsl.l * 1.6)), 0.75);
            }
            return c;
          });
          m.material = Array.isArray(m.material) ? mats : mats[0]!;
        });
      }
    } else {
      // Stand-in: a robed cone with a hood.
      body = new THREE.Group();
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.3, 16), new THREE.MeshStandardMaterial({ color: GUILD_COLORS[rig.guild]!, roughness: 0.7 }));
      robe.position.y = 0.65;
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: ["#c79a3a", "#4a2a7a", "#1f6f8a", "#2f7a3a"][rig.guild]! }));
      hood.position.y = 1.3;
      for (const m of [robe, hood]) m.castShadow = true;
      body.add(robe, hood);
    }
    rig.body = body;
    rig.bodyKind = kind;
    rig.root.add(body);
  }

  private makeWisp(guild: Guild): WispRig {
    const col = GUILD_COLORS[guild]!;
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
    if (st.shrine.id + "~" + st.shrine.teams !== this.shrineId) this.buildShrine(st.shrine);
    this.cam.update();
    const time = st.now / 1000;
    for (const u of this.timeUniforms) u.value = time;
    for (const f of this.floaters) f.obj.position.y = f.y + Math.sin(time * 0.25 * f.drift + f.phase) * 0.8;
    this.brazierLight.intensity = 18 + Math.sin(time * 9) * 3 + Math.sin(time * 23) * 2;
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
    g.fillStyle = GUILD_COLORS[pl.guild]!;
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
      if (t === Tile.Edge) continue;
      g.fillStyle = t === Tile.Wall ? "#4a4a55" : t === Tile.Water ? "#3f9fa8" : t === Tile.Rock ? "#888" : t === Tile.Brazier ? "#ff9a3a" : "#3b3346";
      g.fillRect(rect.x + x * k, rect.y + y * k, Math.ceil(k), Math.ceil(k));
    }
  for (const w of st.snap.wisps) {
    g.fillStyle = GUILD_COLORS[w.guild]!;
    g.beginPath();
    g.arc(rect.x + (w.x + 0.5) * k, rect.y + (w.y + 0.5) * k, Math.max(2, k * 0.7), 0, Math.PI * 2);
    g.fill();
  }
  for (const p of st.snap.players) {
    g.fillStyle = p.id === st.me ? "#fff" : GUILD_COLORS[p.guild]!;
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
