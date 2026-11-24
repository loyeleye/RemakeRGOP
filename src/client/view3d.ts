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
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Tile, type Board } from "../engine/board.js";
import { PULL_REACH, PUSH_REACH, gateOpen, mistBanks, platesHeld, quarterOf, MOSS_HP, type GameSnapshot, type Guild } from "../engine/game.js";
import { armSamples, ringWalls, type Ring, type Shrine } from "../engine/maps.js";
import { contourLoops } from "./contour.js";
import { FLAME_COLORS, type Flame } from "../engine/protocol.js";
import { makeCloud, makeCurtain, makeIsland, makeWaterfall } from "./islands.js";
import { ambientParticles, LIGHTS, makeTileProp, themeFor, type PropKind, type Theme } from "./themes.js";

export const GUILD_COLORS: readonly string[] = ["#ffcf5a", "#b07cff", "#4fd6ff", "#6fe07a"];
export const GUILD_NAMES: readonly string[] = ["Dawn", "Dusk", "Tide", "Grove"];

const PITCH = THREE.MathUtils.degToRad(56);
/** Seconds a pull stopped at the bank shows: the broken beam and the wisp's bump. */
const STOP_FX = 0.7;
const FOV = 38;

export interface DrawState {
  shrine: Shrine;
  prev: GameSnapshot | null;
  snap: GameSnapshot;
  t: number;
  me: number;
  flames: Map<number, Flame>;
  /** Story runs: which character model each player wears (rook, lumi, wick, moth, kes). */
  cast?: Map<number, string>;
  hoverWisp: number | null;
  now: number;
  /** Story figures who aren't playing, standing on the island (tile coords) and turning to watch you. */
  watchers?: { cast: string; x: number; y: number }[];
  /** Story run 1 only: a flight of steps leaving the island at this spot (tile coords), heading north. For looks: nobody walks them. */
  steps?: { x: number; y: number };
  /** The free walk on the pond: Lumi's lantern, left by the water (tile coords). Something to find and tap. */
  lantern?: { x: number; y: number };
  /** The walks: time of day on the island (see LIGHTS). */
  light?: string;
  /** The walk on the island (1 to 5): the Willing Girl has ribbons from walk 3, fresh flowers in walk 5. */
  walk?: number;
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
  /** The ending: 0 on the board, 1 lifted off it and tilted up at the sky. */
  lift = 0;
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
    cam.position.set(target.x, Math.sin(pitch) * d + this.lift * d * 0.6, target.z + Math.cos(pitch) * d);
    cam.lookAt(target.x, target.y + this.lift * d * 1.2, target.z);
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
/** Story characters with a model of their own so far. Others wear their guild's robe. */
const CAST_MODELS = ["rook", "lumi", "hesta", "wick", "moth", "nell", "sefa"] as const;
/** Each character's height against Rook's (models come in at one height). Lumi is nine. */
export const CAST_SCALE: Record<string, number> = { lumi: 0.7, nell: 0.76, sefa: 0.6, hesta: 0.95, wick: 1.05, moth: 0.95 };
/** How much a character's own colours light it, so dark skin and cloth read under any island's light. */
const CAST_FLAT = 0.25;
const models: Partial<Record<string, THREE.Object3D>> = {};
/** The cast's animation clips (idle, walk, run, pull, push), by model. */
const clips: Partial<Record<string, THREE.AnimationClip[]>> = {};
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

/** Story buildings, loaded as delivered: already placed (one unit a tile, feet at y=0, door to +X), never normalized. */
const PLACE_MODELS = ["rook-house", "rook-house-big", "fence", "washpost", "bench", "barrel", "woodpile", "flowerbed", "hesta-house", "hesta-chair", "skiff", "landing", "shrine", "kindling-brazier", "falls", "shrine-wall", "shade-tree", "lamp-pedestal", "spout-basin", "willing-girl", "willing-girl-ribbons", "statue-flowers", "lookout-post", "landing-rail", "maudie-house", "moth-house", "mabry-house", "orrin-house", "wick-house", "nell-house", "sefa-house", "path-lamp", "jarek-ladder", "offering-stone", "offering-boat", "offering-mooring"];

export function loadModels() {
  for (const n of PLACE_MODELS) {
    const done = (g: GLTF) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.metalness = 0;
        mat.roughness = 0.9;
        if (mat.map) {
          mat.emissiveMap = mat.map;
          mat.emissive = new THREE.Color("#ffffff");
          mat.emissiveIntensity = 0.15;
        }
      });
      models[n] = g.scene;
      modelWaiters.forEach((f) => f());
    };
    loader.load(`models/${n}.glb`, done, undefined, () => {
      fetch(`models/${n}.glb.txt`)
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((b64) => plainLoader.parse(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)).buffer, "", done))
        .catch(() => {
          /* missing: the block-out stays */
        });
    });
  }
  for (const n of ["dawn", "dusk", "brazier", "monolith", "boulder", ...CAST_MODELS] as string[]) {
    loader.load(
      `models/${n}.glb`,
      (g: GLTF) => {
        clips[n] = g.animations;
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
              clips[n] = g.animations;
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
  col += mix(vec3(1.0, 0.92, 0.75), vec3(0.75, 0.85, 1.0), uStars) * (pow(s, 400.0) * 3.0 + pow(s, 12.0) * mix(0.35, 0.12, uStars));
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
/**
 * A crystal mirror: a tall thin glowing slab standing on its tile's diagonal, "/" (SW to NE)
 * or "\\" (NW to SE) as the map draws it, so you can read which way it turns a wisp.
 */
function makeMirror(x: number, z: number, slash: boolean, colour: string): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = slash ? Math.PI / 4 : -Math.PI / 4;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.5, 0.14),
    new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0 }),
  );
  slab.position.y = 0.85;
  g.add(slab);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  edge.position.y = 1.62;
  g.add(edge);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 6), new THREE.MeshStandardMaterial({ color: "#6a5a80", roughness: 0.8 }));
  base.position.y = 0.09;
  g.add(base);
  return g;
}

/** A vent: a dark cracked ring with an ember core and a plume that rises on eruption. */
function makeVent(x: number, z: number): { g: THREE.Group; plume: THREE.Mesh; core: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  g.position.set(x, 0.03, z);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.6, 14), new THREE.MeshStandardMaterial({ color: "#3a2a24", roughness: 0.95 }));
  rim.rotation.x = -Math.PI / 2;
  g.add(rim);
  const core = new THREE.MeshStandardMaterial({ color: "#ff7a2a", emissive: "#ff5a10", emissiveIntensity: 0.6 });
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), core);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.005;
  g.add(hole);
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: "#ffb060", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  plume.rotation.x = Math.PI;
  plume.position.y = 1.2;
  g.add(plume);
  return { g, plume, core };
}

/** A portcullis: two posts and an iron grille that drops shut or lifts open. */
function makeGate(x: number, z: number, eastWest: boolean): { g: THREE.Group; grille: THREE.Group } {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // The grille spans across the way a walker passes through it.
  if (eastWest) g.rotation.y = Math.PI / 2;
  const stone = new THREE.MeshStandardMaterial({ color: "#8a8178", roughness: 0.9 });
  for (const s of [-0.55, 0.55]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.3), stone);
    post.position.set(s, 1.1, 0);
    g.add(post);
  }
  const grille = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: "#3b3a40", metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.06), iron);
    bar.position.set(-0.4 + i * 0.2, 0.95, 0);
    grille.add(bar);
  }
  for (const h of [0.5, 1.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.06), iron);
    rail.position.y = h;
    grille.add(rail);
  }
  g.add(grille);
  return { g, grille };
}

/** A tuft of moss: a low, lumpy green mound. */
const MOSS_GEO = new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const MOSS_MAT = new THREE.MeshStandardMaterial({ color: "#4f8a3a", roughness: 1, flatShading: true });
function makeMoss(x: number, z: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // Each tuft gets its own material so a torn one can wither on its own.
  const mat = MOSS_MAT.clone();
  const rnd = (k: number) => fract(Math.sin(seed * 31.7 + k * 12.9) * 43758.5);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(MOSS_GEO, mat);
    const s = 0.55 + rnd(i) * 0.4;
    m.scale.set(s, 0.5 + rnd(i + 9) * 0.5, s);
    m.position.set((rnd(i + 3) - 0.5) * 0.5, 0, (rnd(i + 6) - 0.5) * 0.5);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

const MOSS_BIT_GEO = new THREE.BoxGeometry(0.12, 0.06, 0.12);

/** A pressure plate: a worn stone slab with a groove; it lights up while someone stands on it. */
function makePlate(x: number, z: number): { g: THREE.Group; glow: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: "#8d867c", roughness: 0.9 }));
  slab.position.y = 0.04;
  g.add(slab);
  const glow = new THREE.MeshStandardMaterial({ color: "#d9c48a", emissive: "#ffcf5a", emissiveIntensity: 0.1 });
  const inlay = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.3, 16), glow);
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.085;
  g.add(inlay);
  return { g, glow };
}

/** A sun glyph: a gold rune set flat in the floor. */
const GLYPH_GEO = new THREE.RingGeometry(0.12, 0.44, 8);
const GLYPH_MAT = new THREE.MeshStandardMaterial({ color: "#ffd36a", emissive: "#ffb830", emissiveIntensity: 0.9, transparent: true, opacity: 0.95 });
function makeGlyph(x: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(GLYPH_GEO, GLYPH_MAT);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.035, z);
  return m;
}

/** A mist bank: a few soft, overlapping translucent puffs. */
function makeMist(r: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: "#eef2f7", transparent: true, opacity: 0.32, depthWrite: false });
  const geo = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(geo, mat);
    const s = r * (0.55 + (i % 3) * 0.12);
    m.scale.set(s, s * 0.55, s);
    m.position.set(Math.cos(a) * r * 0.45, 0.8 + (i % 2) * 0.4, Math.sin(a) * r * 0.45);
    g.add(m);
  }
  return g;
}

/** A petal bed: a soft pink patch scattered with petals, flat on the floor. */
function makePetals(x: number, z: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0.03, z);
  const rnd = (k: number) => fract(Math.sin(seed * 51.3 + k * 17.7) * 43758.5);
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18), new THREE.MeshStandardMaterial({ color: "#f7b6d2", emissive: "#f48fbf", emissiveIntensity: 0.25, roughness: 0.9, transparent: true, opacity: 0.85 }));
  bed.rotation.x = -Math.PI / 2;
  g.add(bed);
  const petal = new THREE.CircleGeometry(0.09, 5);
  const mat = new THREE.MeshStandardMaterial({ color: "#fff0f6", emissive: "#ffd1e6", emissiveIntensity: 0.3 });
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(petal, mat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = rnd(i) * 6.28;
    p.position.set((rnd(i + 20) - 0.5) * 1.0, 0.01, (rnd(i + 40) - 0.5) * 1.0);
    g.add(p);
  }
  return g;
}

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
      // Rime paints as ice.
      const same = (t: Tile | undefined) => t === kind || (kind === Tile.Ice && t === Tile.Rime);
      if (!same(b.tiles[y * b.width + x])) continue;
      any = true;
      g.beginPath();
      g.arc((x + 0.5) * PX, (y + 0.5) * PX, PX * 0.6, 0, Math.PI * 2);
      g.fill();
      // Join to the right and below so pools are one body, not beads.
      if (same(b.tiles[y * b.width + x + 1]) && x + 1 < b.width) g.fillRect((x + 0.5) * PX, (y + 0.5) * PX - PX * 0.45, PX, PX * 0.9);
      if (y + 1 < b.height && same(b.tiles[(y + 1) * b.width + x])) g.fillRect((x + 0.5) * PX - PX * 0.45, (y + 0.5) * PX, PX * 0.9, PX);
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
  bodyKind: string | null;
  ring: THREE.Mesh;
  lantern: THREE.Sprite;
  beam: THREE.Mesh;
  facing: number;
  guild: Guild;
  /** The story character this player is, if they have a model of their own. */
  cast: string | null;
  /** A stone cast in progress: when it began, its glow on her, and its ring running out over the ground. */
  stoneCast?: { at: number; glow: THREE.Sprite; ring: THREE.Mesh };
}

interface WispRig {
  root: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Sprite;
  light: THREE.PointLight;
  trail: THREE.Points;
  lastX: number;
  lastY: number;
  /** Run 3's earth hold: a ring of stones risen round a wisp held fast. Made when first needed. */
  stones?: THREE.Group;
  /** The stone crust that closes over a held wisp, its glow showing only through the cracks. */
  crust?: THREE.Group;
  /** When it was first seen held (seconds), for the crust closing over it. */
  rootedAt?: number;
  /** The line of earth from the holder's lantern to it. */
  earth?: THREE.Mesh;
}

/** Seconds the earth line takes to reach a wisp before the stone starts closing over it. */
const EARTH_LINE = 0.35;
/** Hesta's stone cast: the fist snaps shut 0.3 s into the 1.2 s clip; the glow holds from there to its end; the ring runs out at `speed` tiles a second to `reach`. */
const STONE_CAST = { snap: 0.3, hold: 0.9, speed: 22, reach: 70 };
/** Seconds after the hold by which the earth line has faded out. */
const EARTH_FADE = 4.5;

/** Stone closing over a wisp: a rough shell, and bright cracks where the light gets out. */
function makeCrust(col: string): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(0.34, 1);
  // Rough it up so it reads as rock, not a ball.
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + Math.sin(i * 12.9898) * 0.09;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#7a6654", roughness: 1, flatShading: true }));
  g.add(shell);
  // A few cracks only: every fifth crease of the shell.
  const edges = new THREE.EdgesGeometry(geo, 25).getAttribute("position");
  const keep: number[] = [];
  for (let i = 0; i < edges.count; i += 2) if ((i / 2) % 5 === 0) keep.push(edges.getX(i), edges.getY(i), edges.getZ(i), edges.getX(i + 1), edges.getY(i + 1), edges.getZ(i + 1));
  const crackGeo = new THREE.BufferGeometry();
  crackGeo.setAttribute("position", new THREE.Float32BufferAttribute(keep, 3));
  const cracks = new THREE.LineSegments(crackGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.4) }));
  cracks.scale.setScalar(1.01);
  g.add(cracks);
  return g;
}

/** A ring of rough stones pushed up out of the ground (the earth hold's mark; placeholder). */
function makeStones(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#7d6a58", roughness: 0.95, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.04, 0), mat);
    st.position.set(Math.cos(a) * 0.42, 0.12 + (i % 2) * 0.06, Math.sin(a) * 0.42);
    st.rotation.set(i, i * 1.3, i * 0.7);
    st.scale.y = 1.4;
    g.add(st);
  }
  return g;
}

/** A solid stone stair about an arch wide, climbing north (toward -z) from where it's placed. */
/** A block-out cottage, w by d tiles: plaster walls, a pitched thatch roof, a door and a lit window on the east side (+x). */
function makeHouse(w: number, d: number, look: { wall?: string; roof?: string; wallH?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const wallH = look.wallH ?? 1.9, roofH = 1.4;
  const plaster = new THREE.MeshStandardMaterial({ color: look.wall ?? "#e6d6b8", roughness: 0.9 });
  const thatch = new THREE.MeshStandardMaterial({ color: look.roof ?? "#9a7444", roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, wallH, d - 0.2), plaster);
  body.position.y = wallH / 2;
  // The roof: a ridge running north-south, overhanging a little.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-w / 2 - 0.25, 0);
  roofShape.lineTo(w / 2 + 0.25, 0);
  roofShape.lineTo(0, roofH);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: d + 0.3, bevelEnabled: false });
  roofGeo.translate(0, 0, -(d + 0.3) / 2);
  const roof = new THREE.Mesh(roofGeo, thatch);
  roof.position.y = wallH;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.7), wood);
  door.position.set(w / 2 - 0.08, 0.6, 0.5);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.55), new THREE.MeshBasicMaterial({ color: "#ffd27a" }));
  win.position.set(w / 2 - 0.08, 1.15, -0.8);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), new THREE.MeshStandardMaterial({ color: "#7d6a5a", roughness: 0.9 }));
  chimney.position.set(-w / 4, wallH + roofH * 0.6, -d / 4);
  for (const m of [body, roof, door, chimney]) (m.castShadow = true), (m.receiveShadow = true);
  g.add(body, roof, door, win, chimney);
  return g;
}

/** Story places on the walking island, as block-outs: w by d tiles, centred. */
/**
 * The bigger places the maps thread has drawn: the model for each, and how it sits on its plot.
 * The shrine's steps face +X as built, turned to face the path to its west; the skiff is moored
 * west of its post.
 */
const PLACE_OF: Record<string, { model: string; rot?: number; dx?: number; y?: number }> = {
  // The horseshoe island's houses (doors on +Z; each island turns them), the Offering stone sunk
  // so about 0.4 shows above the water, the one boat and its mooring.
  "maudie-house": { model: "maudie-house" },
  "moth-house": { model: "moth-house" },
  "mabry-house": { model: "mabry-house" },
  "orrin-house": { model: "orrin-house" },
  "wick-house": { model: "wick-house" },
  // Nell's and Sefa's fronts (the serving hatch, the porch) are on +Z, like the doors of the rest.
  "nell-house": { model: "nell-house" },
  "sefa-house": { model: "sefa-house" },
  offering: { model: "offering-stone", y: -0.6 },
  mooring: { model: "offering-mooring", dx: 0.5 },
  boat: { model: "offering-boat", y: -0.15 },
  "hesta-house": { model: "hesta-house" },
  chair: { model: "hesta-chair" },
  shrine: { model: "shrine", rot: Math.PI },
  stall: { model: "stall" },
  kindling: { model: "kindling-brazier" },
  falls: { model: "falls" },
  skiff: { model: "skiff", dx: -0.7 },
};

/**
 * Window lights (maps thread): each house model's emissive map with its glass lit warm. On at dusk
 * and night, off by day; Arc 3 will keep them off. Swapped on the shared material, so every copy follows.
 */
const WINDOW_LIT: Record<string, string> = {
  "rook-house-big": "rook", "maudie-house": "maudie", "moth-house": "moth", "orrin-house": "orrin", "wick-house": "wick",
  "nell-house": "nell", "sefa-house": "sefa", "mabry-house": "mabry", "hesta-house": "hesta",
};
const litMaps = new Map<string, THREE.Texture>();
/**
 * Which path lamps are out of sorts on each walk, by their order on the island (north to south):
 * guttering ones flicker, dead ones stay dark. Walk 5 has two guttering (story thread, 23 Nov).
 */
const LAMP_ODD: Record<number, { gutter?: number[]; dead?: number[] }> = { 5: { gutter: [3, 10] } };
let lampLitMap: THREE.Texture | null = null;
function lampLit() {
  if (!lampLitMap) {
    lampLitMap = new THREE.TextureLoader().load("models/lit/path-lamp-lit.webp");
    lampLitMap.flipY = false;
    lampLitMap.colorSpace = THREE.SRGBColorSpace;
  }
  return lampLitMap;
}
function setWindows(on: boolean) {
  for (const [model, file] of Object.entries(WINDOW_LIT)) {
    const root = models[model];
    if (!root || root.userData.windows === on) continue;
    root.userData.windows = on;
    let lit = litMaps.get(file);
    if (on && !lit) {
      lit = new THREE.TextureLoader().load(`models/lit/${file}-lit.webp`);
      lit.flipY = false;
      lit.colorSpace = THREE.SRGBColorSpace;
      litMaps.set(file, lit);
    }
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.userData.paint ??= { map: mat.emissiveMap, k: mat.emissiveIntensity };
      mat.emissiveMap = on ? lit! : mat.userData.paint.map;
      mat.emissiveIntensity = on ? 1 : mat.userData.paint.k;
      mat.emissive = new THREE.Color("#ffffff");
      mat.needsUpdate = true;
    });
  }
}

/** Yard props: each its own model, one a tile (the rest are drawn as one block per place). */
const YARD = new Set(["fence", "post", "bench", "barrel", "woodpile", "flowerbed", "shrine-wall", "tree", "lamp", "basin", "statue", "lookout", "rail", "path-lamp", "ladder"]);

function makePlace(kind: string, w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  if (kind === "falls") {
    // A stream over the north rim: a bright channel on the ground, and a sheet of water dropping away.
    const water = new THREE.MeshStandardMaterial({ color: "#7fd0f0", emissive: "#3aa0d0", emissiveIntensity: 0.35, transparent: true, opacity: 0.85, roughness: 0.2 });
    add(new THREE.BoxGeometry(w, 0.06, d + 0.6), water, 0, 0.04, 0.3);
    const sheet = add(new THREE.PlaneGeometry(w * 0.9, 12), water, 0, -6, -d / 2 - 0.6);
    sheet.material = water.clone();
    (sheet.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const mist = glowSprite("#dff4ff", 4, 0.5);
    mist.position.set(0, -1.5, -d / 2 - 1);
    g.add(mist);
  } else if (kind === "skiff") {
    // Rook's skiff, moored just off the rim (west), with a mooring post.
    const hull = std("#6b4a2c");
    const boat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, d + 1.2), hull);
    body.position.y = 0.1;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 4), hull);
    bow.rotation.x = -Math.PI / 2;
    bow.position.set(0, 0.1, -(d + 1.2) / 2 - 0.4);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.6), std("#efe6d0", { side: THREE.DoubleSide }));
    sail.position.set(0, 1.3, 0);
    sail.rotation.y = Math.PI / 2;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2), hull);
    mast.position.y = 1.1;
    boat.add(body, bow, mast, sail);
    boat.position.set(-1.6, -0.2, 0);
    g.add(boat);
    add(new THREE.CylinderGeometry(0.1, 0.12, 1.1), hull, 0, 0.55, 0);
  } else if (kind === "shrine") {
    // A small open shrine: a stone base, four pillars, a pointed roof, a light inside.
    const stone = std("#d8d0c0");
    add(new THREE.BoxGeometry(w, 0.3, d), stone, 0, 0.15, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.14, 0.16, 2.2), stone, sx * (w / 2 - 0.35), 1.4, sz * (d / 2 - 0.35));
    const roof = add(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.4, 4), std("#5a6e8a"), 0, 3.2, 0);
    roof.rotation.y = Math.PI / 4;
    const orb = glowSprite("#ffe0a0", 1.4);
    orb.position.y = 1.3;
    g.add(orb);
  } else if (kind === "stall") {
    // Orrin's stall: a table under an awning.
    const wood = std("#7a5434");
    add(new THREE.BoxGeometry(w, 0.1, d * 0.8), wood, 0, 0.8, 0);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.1, 1.9, 0.1), wood, sx * (w / 2 - 0.1), 0.95, -d * 0.35);
    add(new THREE.BoxGeometry(w + 0.3, 0.06, d + 0.3), std("#c75a4a"), 0, 1.9, 0);
    const pane = add(new THREE.BoxGeometry(0.3, 0.4, 0.05), new THREE.MeshBasicMaterial({ color: "#ffe6a0" }), 0.2, 1.05, 0);
    pane.castShadow = false;
  } else if (kind === "hesta-house") {
    // Her house: grey stone, a dark roof, the door to the south (toward her chair and the brazier). Always shut.
    const house = makeHouse(d, w, { wall: "#b8b2a6", roof: "#6a6474" });
    house.rotation.y = -Math.PI / 2;
    g.add(house);
  } else if (kind.endsWith("-house") && kind !== "hesta-house") {
    g.add(makeHouse(w, d));
  } else if (kind === "offering") {
    add(new THREE.BoxGeometry(w, 1, d * 0.8), std("#9a968c"), 0, 0.5, 0);
  } else if (kind === "mooring") {
    add(new THREE.BoxGeometry(w + 1, 0.15, 1.2), std("#8a6440"), 0.5, 0.4, 0);
  } else if (kind === "boat") {
    add(new THREE.BoxGeometry(w, 0.4, 1.1), std("#efe6d0"), 0, 0.2, 0);
  } else if (kind === "chair") {
    const wood = std("#6a4a30");
    add(new THREE.BoxGeometry(0.6, 0.08, 0.55), wood, 0, 0.5, 0);
    add(new THREE.BoxGeometry(0.6, 0.7, 0.08), wood, 0, 0.85, -0.25);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.5, 0.06), wood, sx * 0.25, 0.25, sz * 0.22);
  } else if (kind === "kindling") {
    // The great brazier of the Kindling ground: a wide stone bowl on a stepped base, and its fire.
    const stone = std("#8a7a6a");
    add(new THREE.CylinderGeometry(w / 2, w / 2 + 0.2, 0.5, 24), stone, 0, 0.25, 0);
    add(new THREE.CylinderGeometry(w / 2 - 0.6, w / 2 - 0.4, 0.5, 24), stone, 0, 0.75, 0);
    add(new THREE.CylinderGeometry(w / 2 - 0.2, w / 2 - 1.1, 0.9, 24, 1, true), std("#5e5048", { side: THREE.DoubleSide }), 0, 1.45, 0);
    const fire = glowSprite("#ff9a3a", w * 0.8, 0.7);
    fire.position.y = 2.2;
    g.add(fire);
    const core = glowSprite("#ffe0a0", w * 0.35, 0.8);
    core.position.y = 2;
    g.add(core);
  }
  return g;
}

/** A small hand lantern standing on the ground: a dark frame round a warm glow, with a ring handle. */
function makeLantern(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: "#3b2a1c", roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 8), frame);
  base.position.y = 0.03;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 8), frame);
  cap.position.y = 0.42;
  const glowMat = new THREE.MeshBasicMaterial({ color: "#ffc76a", transparent: true, opacity: 0.85 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), glowMat);
  glass.position.y = 0.21;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), frame);
  handle.position.y = 0.53;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: "#ffb24a", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(1.1);
  halo.position.y = 0.22;
  const light = new THREE.PointLight("#ffb24a", 1.2, 3.5, 2);
  light.position.y = 0.3;
  for (const m of [base, cap, glass, handle]) m.castShadow = true;
  g.add(base, cap, glass, handle, halo, light);
  g.userData.glow = glowMat;
  return g;
}

function makeSteps(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#c9bda8", roughness: 0.85 });
  const rise = 0.22, run = 0.5, n = 14, w = 1.7;
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * rise;
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, run), mat);
    step.position.set(0, h / 2, -i * run - run / 2);
    g.add(step);
  }
  return g;
}

/** A story character's model, at their height, lit flat-ish: the model's own colours glow a little. */
/** What a cast member is doing, for their animation. */
export type CastMove = "idle" | "walk" | "run" | "pull" | "push" | "snack";

/** One mixer per character: crossfades between its looping clips; push plays once, then back to idle. */
class CastAnim {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: CastMove | null = null;
  private last = 0;
  constructor(root: THREE.Object3D, anims: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of anims) {
      const a = this.mixer.clipAction(c);
      if (c.name === "push") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(c.name, a);
    }
    this.mixer.addEventListener("finished", () => {
      if (this.casting) {
        // Back to whatever she was doing: the next set() crossfades out of the cast.
        this.casting = false;
        this.cur = "cast" as CastMove;
      } else if (this.cur === "push") this.set("idle");
    });
  }
  private casting = false;
  /** A one-shot "cast" clip (Hesta's stone cast), over whatever is playing; false if the model has none. */
  cast() {
    const next = this.actions.get("cast");
    if (!next || this.casting) return !!next;
    const prev = this.cur ? this.actions.get(this.cur) : undefined;
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.reset().play();
    if (prev && prev !== next) next.crossFadeFrom(prev, 0.12, false);
    this.casting = true;
    this.cur = "cast" as CastMove;
    return true;
  }
  has(move: string) {
    return this.actions.has(move);
  }
  /** Ask for a move; a push already playing finishes first. */
  set(move: CastMove) {
    if (this.casting) return;
    if (move === this.cur || (this.cur === "push" && move === "idle")) return;
    const next = this.actions.get(move) ?? this.actions.get("idle");
    if (!next) return;
    const prev = this.cur ? this.actions.get(this.cur) : undefined;
    next.reset().play();
    if (prev && prev !== next) next.crossFadeFrom(prev, move === "push" ? 0.1 : 0.2, false);
    this.cur = move;
  }
  update(nowSec: number) {
    const dt = this.last ? Math.min(0.1, nowSec - this.last) : 0;
    this.last = nowSec;
    this.mixer.update(dt);
  }
}

function castBody(cast: string): THREE.Object3D | null {
  const model = models[cast];
  if (!model) return null;
  // Rigged models need their skeleton cloned with them.
  const body = cloneSkinned(model);
  body.scale.multiplyScalar(1.8 * (CAST_SCALE[cast] ?? 1));
  const anims = clips[cast] ?? [];
  if (anims.length) body.userData.anim = new CastAnim(body, anims);
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mt) => {
      const c = mt.clone() as THREE.MeshStandardMaterial;
      if (c.map) {
        c.emissiveMap = c.map;
        c.emissive = new THREE.Color("#ffffff");
        c.emissiveIntensity = CAST_FLAT;
      }
      return c;
    });
    m.material = Array.isArray(m.material) ? mats : mats[0]!;
  });
  return body;
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
  private vents: { plume: THREE.Mesh; core: THREE.MeshStandardMaterial }[] = [];
  private gates: { grille: THREE.Group; dx: number; dy: number; lift: number }[] = [];
  private gimmicks: Shrine["gimmicks"] = {};
  private plates: { glow: THREE.MeshStandardMaterial; q: string }[] = [];
  private mists: THREE.Group[] = [];
  private mossRigs = new Map<number, THREE.Group>();
  private mossHp = new Map<number, { hp: number; hit: number }>();
  private mossBits: { obj: THREE.Mesh; v: THREE.Vector3; born: number }[] = [];
  private players = new Map<number, PlayerRig>();
  private watchers = new Map<string, THREE.Object3D>();
  /** Story run 1's steps off the island (see DrawState.steps). */
  private steps: THREE.Group | null = null;
  /** The pond's lantern (see DrawState.lantern). */
  private lantern: THREE.Group | null = null;
  private wisps = new Map<number, WispRig>();
  /** Pulls stopped at the bank (the laws of water), by wisp: when, by whom, and the water tile it met. */
  private stopFx = new Map<number, { at: number; player: number; x: number; y: number }>();
  private stopSnap: GameSnapshot | null = null;
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
      // Pushed out with the far islands on a big board, so no puff sits inside the island itself.
      const r = 30 + ((i * 41) % 60) + this.distantPush;
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

  /** A story place's own things: worn paths on the grass, a fence, a wash line between posts, a bench. */
  private addPlace(shrine: Shrine, b: Board) {
    const g = this.shrineGroup;
    // The worn path: soft discs of packed earth, textured in world space so overlaps never show.
    const pathTiles = shrine.paths ?? [];
    if (pathTiles.length) {
      const disc = new THREE.CircleGeometry(0.85, 14);
      const pos = disc.getAttribute("position"), idx = disc.getIndex()!;
      const verts: number[] = [], uvs: number[] = [], index: number[] = [];
      for (const [i, p] of pathTiles.entries()) {
        const cx = this.worldX(b, p.x) + Math.sin(i * 1.7) * 0.15, cz = this.worldZ(b, p.y) + Math.cos(i * 2.3) * 0.15;
        const base = verts.length / 3;
        for (let k = 0; k < pos.count; k++) {
          // The disc lies in x/y; on the ground y becomes -z.
          const x = cx + pos.getX(k), z = cz - pos.getY(k);
          verts.push(x, 0.02, z);
          uvs.push(x / 6, -z / 6);
        }
        for (let k = 0; k < idx.count; k += 3) index.push(base + idx.getX(k), base + idx.getX(k + 1), base + idx.getX(k + 2));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const map = tex(`textures/path-${shrine.id}.webp`, 1);
      const path = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 1, color: "#ffffff", polygonOffset: true, polygonOffsetFactor: -1 }));
      path.receiveShadow = true;
      g.add(path);
    }
    const wood = new THREE.MeshStandardMaterial({ color: "#7a5434", roughness: 0.85 });
    const props = shrine.props ?? [];
    const has = (x: number, y: number, kind: string) => props.some((q) => q.kind === kind && q.x === x && q.y === y);
    const box = (w: number, h: number, d: number, mat: THREE.Material, y = h / 2) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.y = y;
      m.castShadow = true;
      return m;
    };
    const LINE_H = 2.25;
    for (const p of props) {
      const wx = this.worldX(b, p.x), wz = this.worldZ(b, p.y);
      if (p.kind === "fence") {
        // One section a tile, along X; a run north to south turns it. A corner gets both.
        const ew = has(p.x - 1, p.y, "fence") || has(p.x + 1, p.y, "fence");
        const ns = has(p.x, p.y - 1, "fence") || has(p.x, p.y + 1, "fence");
        for (const rot of [...(ew || !ns ? [0] : []), ...(ns ? [Math.PI / 2] : [])]) {
          const f = new THREE.Group();
          f.add(box(0.12, 0.8, 0.12, wood), box(1, 0.08, 0.07, wood, 0.3), box(1, 0.08, 0.07, wood, 0.62));
          this.placeSlot("fence", f, wx, wz, rot);
        }
      } else if (p.kind === "post") {
        // A T-post, crossbar across the line; the lines run east to the next post on this row.
        const t = new THREE.Group();
        t.add(box(0.14, 2.4, 0.14, wood), box(0.1, 0.1, 1.5, wood, 2.3));
        this.placeSlot("washpost", t, wx, wz, Math.PI / 2);
        const other = props.find((q) => q.kind === "post" && q.y === p.y && q.x > p.x);
        if (!other) continue;
        const len = other.x - p.x;
        const cloths = ["#e8d7b0", "#9fc4e8", "#e8a0a0", "#f4f0e6"];
        for (const side of [-1, 1]) {
          const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), new THREE.MeshStandardMaterial({ color: "#eee6d6" }));
          line.rotation.z = Math.PI / 2;
          line.position.set(wx + len / 2, LINE_H, wz + side * 0.66);
          g.add(line);
          for (let k = 1; k < len; k++) {
            if ((k + (side > 0 ? 1 : 0)) % 2) continue;
            const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshStandardMaterial({ color: cloths[(k + side + 4) % cloths.length], side: THREE.DoubleSide, roughness: 1 }));
            cloth.position.set(wx + k, LINE_H - 0.37, wz + side * 0.66);
            cloth.castShadow = true;
            g.add(cloth);
          }
        }
      } else if (p.kind === "bench") {
        if (has(p.x - 1, p.y, "bench")) continue;
        const long = has(p.x + 1, p.y, "bench") ? 2 : 1;
        // The model's back is on -Z, so it faces south: toward the Willing Girl if she's just south
        // of it; otherwise turned round to look north over the water.
        const bench = new THREE.Group();
        bench.add(box(long * 0.95, 0.08, 0.45, wood, 0.45), box(long * 0.95, 0.4, 0.06, wood, 0.7));
        bench.children[1]!.position.z = -0.2;
        const facesStatue = props.some((q) => q.kind === "statue" && q.y > p.y && q.y - p.y <= 5 && Math.abs(q.x - p.x) <= 2);
        this.placeSlot("bench", bench, wx + (long - 1) / 2, wz, shrine.turns?.[`${p.x},${p.y}`] ?? (facesStatue ? 0 : Math.PI));
      } else if (p.kind === "statue") {
        // The Willing Girl, facing south out to the sky. Her ribbons and flowers come with the walks.
        const st = new THREE.Group();
        st.add(box(1.1, 0.9, 1.1, new THREE.MeshStandardMaterial({ color: "#b9b2a4", roughness: 1 })));
        const fig = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.1, 10), new THREE.MeshStandardMaterial({ color: "#c8c0b0", roughness: 1 }));
        fig.position.y = 1.95;
        st.add(fig);
        this.statueSlot = this.placeSlot("willing-girl", st, wx, wz, shrine.turns?.statue ?? 0);
        this.flowers = this.placeSlot("statue-flowers", box(0.5, 0.3, 0.4, new THREE.MeshStandardMaterial({ color: "#e8d27a", roughness: 1 })), wx, wz + 0.85);
        this.flowers.visible = false;
        this.statueWalk = -1;
      } else if (p.kind === "path-lamp") {
        const post = new THREE.Group();
        post.add(box(0.14, 2.4, 0.14, wood, 0), box(0.3, 0.4, 0.3, new THREE.MeshStandardMaterial({ color: "#d9c88a", roughness: 1 }), 2));
        const turn = shrine.turns?.[`${p.x},${p.y}`] ?? 0;
        const slot = this.placeSlot("path-lamp", post, wx, wz, turn);
        // Its glow: a soft light where the lantern hangs (the model's +X), on when the lamp is lit.
        const glow = glowSprite("#ffb65a", 1.5, 0);
        glow.position.set(wx + Math.cos(turn) * 0.42, 2.05, wz - Math.sin(turn) * 0.42);
        g.add(glow);
        // And a small bright flame just over the lantern's cap, so it reads from above (the glass is upright).
        const core = glowSprite("#ffe2a0", 0.55, 0);
        core.position.set(glow.position.x, 2.7, glow.position.z);
        g.add(core);
        this.pathLamps.push({ slot, glow, core, mats: [], state: "off", seed: p.x * 7.3 + p.y * 3.1 });
      } else if (p.kind === "ladder") {
        // Leaning on the lamp post beside it (toward the model's +X).
        const turn = shrine.turns?.[`${p.x},${p.y}`] ?? 0;
        this.placeSlot("jarek-ladder", box(0.5, 2.2, 0.12, wood), wx + Math.cos(turn) * 0.45, wz - Math.sin(turn) * 0.45, turn);
      } else if (p.kind === "lookout") {
        this.placeSlot("lookout-post", box(0.2, 1.9, 0.2, wood), wx, wz);
      } else if (p.kind === "rail") {
        if (has(p.x - 1, p.y, "rail")) continue;
        const two = has(p.x + 1, p.y, "rail");
        this.placeSlot("landing-rail", box(two ? 2 : 1, 1, 0.12, wood), wx + (two ? 0.5 : 0), wz);
      } else if (p.kind === "barrel") {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12), wood);
        m.position.y = 0.45;
        m.castShadow = true;
        this.placeSlot("barrel", m, wx, wz);
      } else if (p.kind === "woodpile") {
        this.placeSlot("woodpile", box(0.9, 0.9, 0.9, wood), wx, wz);
      } else if (p.kind === "shrine-wall") {
        // Two tiles a section, end to end along the run; a north-south run turns them.
        const ns = has(p.x, p.y - 1, "shrine-wall") || has(p.x, p.y + 1, "shrine-wall");
        const run = props.filter((q) => q.kind === "shrine-wall" && (ns ? q.x === p.x : q.y === p.y)).map((q) => (ns ? q.y : q.x));
        const k = (ns ? p.y : p.x) - Math.min(...run);
        if (k % 2) continue;
        const two = has(p.x + (ns ? 0 : 1), p.y + (ns ? 1 : 0), "shrine-wall");
        const stone = new THREE.MeshStandardMaterial({ color: "#c9a878", roughness: 1 });
        this.placeSlot("shrine-wall", box(2, 1.3, 0.8, stone), wx + (!ns && two ? 0.5 : 0), wz + (ns && two ? 0.5 : 0), ns ? Math.PI / 2 : 0);
      } else if (p.kind === "tree") {
        const t = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 8), wood);
        trunk.position.y = 0.8;
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), new THREE.MeshStandardMaterial({ color: "#5f8f45", roughness: 1 }));
        crown.position.y = 2.3;
        t.add(trunk, crown);
        t.traverse((o) => ((o as THREE.Mesh).castShadow = true));
        this.placeSlot("shade-tree", t, wx, wz);
      } else if (p.kind === "lamp") {
        this.placeSlot("lamp-pedestal", box(0.6, 1.3, 0.6, new THREE.MeshStandardMaterial({ color: "#b9b2a4", roughness: 1 })), wx, wz);
      } else if (p.kind === "basin") {
        // Turned so the spout pours toward the path, west.
        this.placeSlot("spout-basin", box(1.1, 0.5, 1.1, new THREE.MeshStandardMaterial({ color: "#a9a296", roughness: 1 })), wx, wz, Math.PI);
      } else if (p.kind === "flowerbed") {
        const bed = new THREE.Group();
        bed.add(box(0.95, 0.35, 0.95, wood), box(0.85, 0.2, 0.85, new THREE.MeshStandardMaterial({ color: "#6f9fd8", roughness: 1 }), 0.45));
        this.placeSlot("flowerbed", bed, wx, wz);
      }
    }
    this.fillHouse();
    // Ground that isn't grass: the landing's planks, the terrace's flags.
    const planks = new THREE.MeshStandardMaterial({ color: "#8a6440", roughness: 0.9 });
    const flags = new THREE.MeshStandardMaterial({ color: "#b9b2a4", roughness: 0.95 });
    // The landing's planks are one place: the maps thread's landing, sunk so its deck is a low step.
    const deck = new THREE.Group();
    const decks = (shrine.ground ?? []).filter((q) => q.kind !== "terrace");
    for (const q of shrine.ground ?? []) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.98, q.kind === "terrace" ? 0.12 : 0.08, 0.98), q.kind === "terrace" ? flags : planks);
      tile.position.set(this.worldX(b, q.x), q.kind === "terrace" ? 0.06 : 0.04, this.worldZ(b, q.y));
      tile.receiveShadow = true;
      (q.kind === "terrace" ? g : deck).add(tile);
    }
    // The great brazier stands on the Kindling ground's flags, not on a square of grass.
    if ((shrine.ground ?? []).some((q) => q.kind === "terrace"))
      for (const p of props) {
        if (p.kind !== "kindling") continue;
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), flags);
        tile.position.set(this.worldX(b, p.x), 0.06, this.worldZ(b, p.y));
        tile.receiveShadow = true;
        g.add(tile);
      }
    if (decks.length) {
      const xs = decks.map((q) => q.x), ys = decks.map((q) => q.y);
      const cx = this.worldX(b, (Math.min(...xs) + Math.max(...xs)) / 2), cz = this.worldZ(b, (Math.min(...ys) + Math.max(...ys)) / 2);
      deck.position.set(-cx, 0, -cz);
      const holder = new THREE.Group();
      holder.add(deck);
      // The maps thread's 5x3 landing, long axis east to west, turned so its lamp stands at the water end.
      this.placeSlot("landing", holder, cx, cz, Math.PI, -1);
      // Its lantern, on the post at the water end, burns with the path lamps (the last of them, for a walk's guttering or dead list).
      const glow = glowSprite("#ffb65a", 1.5, 0), core = glowSprite("#ffe2a0", 0.55, 0);
      glow.position.set(cx - 2.2, 1.95, cz - 1.25);
      core.position.set(cx - 2.2, 2.25, cz - 1.25);
      g.add(glow, core);
      const lit = new THREE.Group();
      lit.userData.filled = true;
      this.pathLamps.push({ slot: lit, glow, core, mats: [], state: "off", seed: 5.5 });
    }
    // The bigger places, one block each (placeholders until the maps thread draws them).
    const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
    for (const p of props) {
      if (YARD.has(p.kind)) continue;
      const bx = boxes.get(p.kind) ?? { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      boxes.set(p.kind, { x0: Math.min(bx.x0, p.x), y0: Math.min(bx.y0, p.y), x1: Math.max(bx.x1, p.x), y1: Math.max(bx.y1, p.y) });
    }
    for (const [kind, bx] of boxes) {
      const w = bx.x1 - bx.x0 + 1, d = bx.y1 - bx.y0 + 1;
      const obj = makePlace(kind, w, d);
      const at = [this.worldX(b, bx.x0 + (w - 1) / 2), this.worldZ(b, bx.y0 + (d - 1) / 2)] as const;
      // Drawn ones: the maps thread's model in a slot, the block-out until it loads.
      if (kind === "kindling") {
        const light = new THREE.PointLight("#ff9a3a", 3, 14, 1.6);
        light.position.set(at[0], 2.5, at[1]);
        g.add(light);
      }
      if (kind === "skiff") {
        // Its mooring post stays on the edge; the boat lies west of it.
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 8), new THREE.MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.9 }));
        post.position.set(at[0] + 0.3, 0.55, at[1]);
        post.castShadow = true;
        g.add(post);
      }
      // A wide falls (the horseshoe's whole north mouth): the lake pours off the lip as one curtain.
      if (kind === "falls" && w > 4) {
        this.addCurtain(props.filter((q) => q.kind === "falls"), b, shrine.coast);
        continue;
      }
      const drawn = PLACE_OF[kind];
      if (drawn) {
        this.placeSlot(drawn.model, obj, at[0] + (drawn.dx ?? 0), at[1], shrine.turns?.[kind] ?? drawn.rot ?? 0, drawn.y ?? 0);
        continue;
      }
      obj.position.set(at[0], 0, at[1]);
      g.add(obj);
    }
    // The guide rope from the mooring out to the Offering stone, just over the water.
    const moor = boxes.get("mooring"), stone = boxes.get("offering");
    if (moor && stone) {
      const a = new THREE.Vector3(this.worldX(b, moor.x1) + 1, 0.35, this.worldZ(b, moor.y0));
      const z = new THREE.Vector3(this.worldX(b, (stone.x0 + stone.x1) / 2), 0.35, this.worldZ(b, stone.y1) + 0.6);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(z), 5), new THREE.MeshStandardMaterial({ color: "#d9c79a", roughness: 1 }));
      rope.position.copy(a).lerp(z, 0.5);
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), z.clone().sub(a).normalize());
      g.add(rope);
    }
    this.fillHouse();
  }

  /**
   * The horseshoe's falls: the lake speeds up, tips over the north rim as white water, and
   * mist boils up from beyond the brink. (The game looks north, so the drop itself is out of
   * sight behind the island: what shows is the water going over.)
   */
  private addCurtain(tiles: { x: number; y: number }[], b: Board, coast: ((dx: number, dy: number) => number) | null) {
    const g = this.shrineGroup;
    const byX = new Map<number, number>();
    for (const t of tiles) byX.set(t.x, Math.min(byX.get(t.x) ?? Infinity, t.y));
    const xs = [...byX.keys()].sort((p, q) => p - q);
    // The lip: just past the island's drawn edge, north of each column (and of both ends).
    const rimZ = (wx: number, wz: number) => {
      let z = wz;
      if (coast) while (coast(wx, z) < 0.5 && wz - z < 4) z -= 0.1;
      else z -= 1;
      return z;
    };
    const from: { x: number; z: number }[] = [], lip: { x: number; z: number }[] = [];
    const cols = [xs[0]! - 0.5, ...xs, xs[xs.length - 1]! + 0.5];
    for (const cx of cols) {
      const x = this.worldX(b, cx), z = this.worldZ(b, byX.get(Math.round(Math.min(Math.max(cx, xs[0]!), xs[xs.length - 1]!)))!);
      from.push({ x, z: z + 1.2 });
      lip.push({ x, z: rimZ(x, z) });
    }
    const fallU = { value: 0 };
    this.timeUniforms.push(fallU);
    const curtain = makeCurtain(from, lip, { x: 0, z: -1 }, fallU);
    curtain.position.y = 0.045;
    curtain.renderOrder = 2;
    g.add(curtain);
    const midX = (lip[0]!.x + lip[lip.length - 1]!.x) / 2;
    const midZ = Math.min(...lip.map((p) => p.z));
    const width = lip[lip.length - 1]!.x - lip[0]!.x;
    // Mist boiling up from beyond the brink: thick low down, thinning as it rises.
    const puffs = Math.max(3, Math.round(width / 3));
    for (let k = 0; k < puffs; k++) {
      const x = midX + ((k + 0.5) / puffs - 0.5) * width * 1.1;
      const low = makeCloud(6.5, "#ffffff", 0.3);
      low.position.set(x, -5.5, midZ - 9.5 - (k % 2) * 0.8);
      const high = makeCloud(5, "#ffffff", 0.12);
      high.position.set(x + 0.8, -1.5 + (k % 3) * 0.6, midZ - 11);
      g.add(low, high);
    }
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
    this.placeSlots = [];
    this.pathLamps = [];
    this.statueSlot = this.flowers = null;
    this.isPlace = !!themeFor(shrine.id).place;
    this.lightKey = "";
    this.propSlots = [];
    this.vents = [];
    this.plates = [];
    this.mists = [];
    this.mossRigs.clear();
    this.mossHp.clear();
    this.mossBits = [];
    this.gates = [];
    this.gimmicks = shrine.gimmicks ?? {};
    // The staff beams hang off the scene, not the rig: without this, a beam held at the end of one
    // board stayed lit, frozen, all through the next (run 4's second stop).
    for (const r of this.players.values()) this.scene.remove(r.root, r.beam);
    this.players.clear();
    for (const r of this.wisps.values()) (this.scene.remove(r.root), r.stones && this.scene.remove(r.stones), r.earth && this.scene.remove(r.earth));
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
      // A place drawn from its own shape (the horseshoe) keeps its cliff tight to the edge, so the
      // falls pour off the rim rather than onto a verge.
      radius: (a) => (shrine.core ? shrine.core.outline(a) + 0.2 : shrine.lobes ? coast(a) + 0.2 : (coast(a) + 2.1) / 0.95),
      ledge: shrine.lobes ? 0 : 2.4, ...(shrine.core ? { lip: 0.012 } : {}), spires: this.low ? 3 : 6, grass: th.grass, soil: th.soil, rock: th.rock,
      segments: this.low ? 128 : 220,
    });
    island.position.set(shrine.core?.x ?? 0, -0.03, shrine.core?.y ?? 0);
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
    // Named islands that must be in view from here (the low one, east of Wick's spur): wide, flat and well below.
    for (const [i, f] of (shrine.far ?? []).entries()) {
      const isl = makeIsland({ rx: f.r, rz: f.r * 0.75, depth: f.r * 1.4, squareness: 2.2, seed: 91 + i, lobes: 0.4, spires: 2, grass: th.grass, soil: th.soil, rock: th.rock, segments: 72, rings: 22 });
      isl.position.set(f.x, -f.drop, f.y);
      for (let t = 0; t < 4; t++) {
        const tree = th.scatter(f.r * 0.22, 40 + t);
        tree.position.set(Math.cos(t * 1.9) * f.r * 0.5, 0, Math.sin(t * 1.9) * f.r * 0.35);
        isl.add(tree);
      }
      g.add(isl);
    }
    // Story places with their own shape: plateaus under the parts that stick out of the main one.
    for (const [i, l] of (shrine.lobes ?? []).entries()) {
      const lobe = makeIsland({
        rx: l.r + 1.2, rz: l.r + 1.2, depth: 6 + l.r * 1.6, squareness: 2, seed: i * 11 + 7, ledge: l.r * 0.2,
        spires: l.r > 5 ? 2 : 0, grass: th.grass, soil: th.soil, rock: th.rock, segments: l.r > 5 ? 72 : 32, rings: 18,
      });
      lobe.position.set(l.x, -0.04 - i * 0.002, l.y);
      g.add(lobe);
    }
    const edge0 = island.userData.outline as (a: number) => { x: number; z: number };
    const edge = (a: number) => ((e) => ({ x: e.x + island.position.x, z: e.z + island.position.z }))(edge0(a));
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
      // A story place keeps its tiers clear of the landing and the falls: off the west, north-east and east rims.
      const a = shrine.lobes ? [3.5, 5.5, 0.2][i]! : a0 + spin;
      const e = edge(a);
      // Sized by the core, not the board: a tentacle island's board is mostly sky.
      const r = (shrine.lobes ? 40 : shrine.arms ? coast(0) + coast(Math.PI / 2) : Math.min(W, H)) * size;
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

    // A place to walk has no parapet and no monoliths: its paths, fence, wash line and bench instead.
    if (th.place) this.addPlace(shrine, b);
    else {
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
    }

    // Rook's house (story islands): a placeholder block-out until the art thread designs it.
    if (shrine.house) {
      const hs = shrine.house;
      this.placeSlot(hs.w >= 8 ? "rook-house-big" : "rook-house", makeHouse(hs.w, hs.h), this.worldX(b, hs.x + (hs.w - 1) / 2), this.worldZ(b, hs.y + (hs.h - 1) / 2));
      this.fillHouse();
    }

    // Tiles. Walls and boulders are props; pools and ice are painted as soft shapes over the
    // floor from a blurred mask of their tiles, so they read as natural pools, not squares.
    const waterU = { value: 0 };
    this.timeUniforms.push(waterU);
    let seed = 1;
    const ringSet = new Set(shrine.rings.flatMap(ringWalls).map((p) => `${p.x},${p.y}`));
    const propAt = new Set((shrine.props ?? []).map((p) => `${p.x},${p.y}`));
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const t = b.tiles[y * W + x];
        const wx = this.worldX(b, x);
        const wz = this.worldZ(b, y);
        seed++;
        if (t === Tile.Wall && ringSet.has(`${x - b.center.x},${y - b.center.y}`)) continue;
        const hs = shrine.house;
        if (hs && x >= hs.x && x < hs.x + hs.w && y >= hs.y && y < hs.y + hs.h) continue;
        if (t === Tile.Wall && propAt.has(`${x},${y}`)) continue;
        if (t === Tile.Wall) this.addProp(th.wall, wx, wz, 2.8, 2.2, seed);
        else if (t === Tile.Rock) {
          // Deflector stones inside the archways can have their own look.
          const court = Math.max(Math.abs(x - b.center.x), Math.abs(y - b.center.y)) <= 4;
          this.addProp(court && th.deflector ? th.deflector : th.boulder, wx, wz, court && th.deflector ? 1.3 : 0.9, 1.05, seed);
        } else if (t === Tile.Bloom) this.shrineGroup.add(makePetals(wx, wz, seed));
        else if (t === Tile.CrystalA || t === Tile.CrystalB) this.shrineGroup.add(makeMirror(wx, wz, t === Tile.CrystalA, th.crystal ?? "#e6c8ff"));
        else if (t === Tile.Vent) {
          const v = makeVent(wx, wz);
          this.shrineGroup.add(v.g);
          this.vents.push(v);
        } else if (t === Tile.Plate) {
          const pl = makePlate(wx, wz);
          this.shrineGroup.add(pl.g);
          this.plates.push({ glow: pl.glow, q: quarterOf(x - b.center.x, y - b.center.y) });
        } else if (t === Tile.Glyph) this.shrineGroup.add(makeGlyph(wx, wz));
        else if (t === Tile.Gate) {
          const dx = x - b.center.x, dy = y - b.center.y;
          const gt = makeGate(wx, wz, Math.abs(dx) >= Math.abs(dy));
          this.shrineGroup.add(gt.g);
          this.gates.push({ grille: gt.grille, dx, dy, lift: 0 });
        }
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
    this.rim.visible = !this.isPlace;
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
  /** Scraps of moss flung up off a tuft that's being torn at. */
  private shedMoss(rig: THREE.Group, time: number, n: number) {
    const mat = ((rig.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const obj = new THREE.Mesh(MOSS_BIT_GEO, mat);
      obj.position.set(rig.position.x, 0.3, rig.position.z);
      this.shrineGroup.add(obj);
      this.mossBits.push({ obj, v: new THREE.Vector3(Math.cos(a) * 0.04, 0.08 + Math.random() * 0.05, Math.sin(a) * 0.04), born: time });
    }
  }

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

  /** Rook's house: the art thread's model once it has loaded, the block-out until then. */
  /** The time of day applied over the island's theme, if any. */
  private lightKey = "";
  /** A place to walk (see Theme.place): no banking rim, no reach square. */
  private isPlace = false;
  /** The Willing Girl's slot, the flowers at her foot, and the walk they were last dressed for. */
  private statueSlot: THREE.Group | null = null;
  private flowers: THREE.Group | null = null;
  private statueWalk = -1;
  /** Ribbons from walk 3 on, fresh flowers in walk 5. */
  private dressStatue(walk: number) {
    if (!this.statueSlot || walk === this.statueWalk) return;
    this.statueWalk = walk;
    const slot = this.placeSlots.find((q) => q.group === this.statueSlot);
    const want = walk >= 3 ? "willing-girl-ribbons" : "willing-girl";
    if (slot && slot.model !== want) {
      slot.model = want;
      slot.group.userData.filled = false;
      this.fillHouse();
    }
    if (this.flowers) this.flowers.visible = walk === 5;
  }
  /** Place models (the house, the yard props): a block-out in each slot until the model loads. */
  private placeSlots: { group: THREE.Group; model: string }[] = [];
  /** Lit windows for this walk's light (dusk and night). */
  private windowsOn = false;
  /**
   * Hesta's stone cast (Ladi): she raises a hand and snaps it shut. At the snap a green-brown glow
   * pulses on her and holds to the end of the move, and a thin ring runs out from her over the
   * ground until it's out of view. One cast for all the wisps she stones together.
   */
  private stoneCast(playerId: number, time: number) {
    const rig = this.players.get(playerId);
    if (!rig || (rig.stoneCast && time - rig.stoneCast.at < 3)) return;
    (rig.body?.userData.anim as CastAnim | undefined)?.cast();
    if (rig.stoneCast) {
      rig.root.remove(rig.stoneCast.glow);
      this.scene.remove(rig.stoneCast.ring);
    }
    const glow = glowSprite("#5f7a1e", 5.2, 0);
    glow.position.y = 1.1;
    rig.root.add(glow);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 128),
      new THREE.MeshBasicMaterial({ color: "#b4c45a", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.09;
    ring.renderOrder = 3;
    this.scene.add(ring);
    rig.stoneCast = { at: time, glow, ring };
  }
  private stepStoneCast(rig: PlayerRig, time: number) {
    const c = rig.stoneCast;
    if (!c) return;
    const t = time - c.at - STONE_CAST.snap;
    // The glow: up fast at the snap, held, then away as her hand comes down.
    const up = Math.min(1, Math.max(0, t / 0.08)), down = Math.min(1, Math.max(0, (t - STONE_CAST.hold) / 0.35));
    c.glow.material.opacity = up * (1 - down);
    c.glow.scale.setScalar(5.2 * (0.75 + 0.25 * up + 0.08 * Math.sin(time * 14)));
    // The ring: from her feet outward at a steady run, thinning as it goes, gone past the edge of any view.
    const r = Math.max(0, t) * STONE_CAST.speed;
    c.ring.visible = t > 0 && r < STONE_CAST.reach;
    c.ring.position.x = rig.root.position.x;
    c.ring.position.z = rig.root.position.z;
    // Kept about a sixth of a tile wide however far out it is.
    const inner = Math.max(0, 1 - 0.16 / Math.max(r, 0.2));
    if (c.ring.visible) {
      c.ring.geometry.dispose();
      c.ring.geometry = new THREE.RingGeometry(inner, 1, 128);
      c.ring.scale.setScalar(Math.max(r, 0.01));
      (c.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.min(1, 1.25 - r / STONE_CAST.reach);
    }
    if (t > STONE_CAST.reach / STONE_CAST.speed + 0.5) {
      rig.root.remove(c.glow);
      this.scene.remove(c.ring);
      delete rig.stoneCast;
    }
  }
  /** The lake path's lamps: each its own lantern, so one can gutter or go dark while the rest burn. */
  private pathLamps: { slot: THREE.Group; glow: THREE.Sprite; core: THREE.Sprite; mats: THREE.MeshStandardMaterial[]; state: "off" | "lit" | "gutter" | "dead"; seed: number }[] = [];
  private lampWalk = 1;
  /** Sets each lamp for this walk and light: off by day, lit at dusk and night, bar the walk's guttering and dead ones. */
  private dressLamps() {
    const odd = LAMP_ODD[this.lampWalk] ?? {};
    this.pathLamps.forEach((l, i) => {
      if (!l.slot.userData.filled) return;
      if (!l.mats.length)
        l.slot.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = (m.material = (m.material as THREE.MeshStandardMaterial).clone());
          mat.userData.paint = { map: mat.emissiveMap, k: mat.emissiveIntensity };
          l.mats.push(mat);
        });
      const state = odd.dead?.includes(i) ? "dead" : !this.windowsOn ? "off" : odd.gutter?.includes(i) ? "gutter" : "lit";
      if (state === l.state) return;
      l.state = state;
      const on = state === "lit" || state === "gutter";
      for (const mat of l.mats) {
        mat.emissiveMap = on ? lampLit() : mat.userData.paint.map;
        mat.emissiveIntensity = on ? 1 : mat.userData.paint.k * (state === "dead" ? 0.5 : 1);
        mat.emissive = new THREE.Color("#ffffff");
        mat.needsUpdate = true;
      }
      l.glow.material.opacity = on ? 0.55 : 0;
      l.core.material.opacity = on ? 0.95 : 0;
    });
  }
  /** A guttering lamp flickers: mostly low, with fits of brightness. */
  private flickerLamps(time: number) {
    for (const l of this.pathLamps) {
      if (l.state !== "gutter") continue;
      const k = 0.25 + 0.75 * Math.max(0, Math.sin(time * 9 + l.seed) * Math.sin(time * 2.3 + l.seed * 2)) ** 0.6;
      for (const mat of l.mats) mat.emissiveIntensity = k;
      l.glow.material.opacity = 0.55 * k;
      l.core.material.opacity = 0.95 * k;
    }
  }
  private fillHouse() {
    setWindows(this.windowsOn);
    queueMicrotask(() => this.dressLamps());
    for (const s of this.placeSlots) {
      const m = models[s.model];
      if (!m || s.group.userData.filled) continue;
      s.group.clear();
      s.group.add(m.clone());
      s.group.userData.filled = true;
    }
  }
  /** A slot for a place model at (x, z), turned `rot`, showing `blockout` until the model is in. */
  private placeSlot(model: string, blockout: THREE.Object3D, x: number, z: number, rot = 0, y = 0) {
    const slot = new THREE.Group();
    slot.add(blockout);
    blockout.position.y -= y;
    slot.position.set(x, y, z);
    slot.rotation.y = rot;
    this.shrineGroup.add(slot);
    this.placeSlots.push({ group: slot, model });
    return slot;
  }

  private refreshProps() {
    this.fillHouse();
    for (const p of this.propSlots) this.fillProp(p.kind, p.group, p.seed);
    this.refreshBrazier();
    for (const r of this.players.values()) this.dressPlayer(r);
  }

  // -------------------------------------------------------------- players and wisps

  private makePlayer(guild: Guild, flame: string, cast: string | null): PlayerRig {
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
    const rig: PlayerRig = { root, body: null, bodyKind: null, ring, lantern, beam, facing: 0, guild, cast };
    // Rook carries no lantern glow: it hides his face.
    lantern.visible = cast !== "rook";
    this.dressPlayer(rig);
    return rig;
  }

  private dressPlayer(rig: PlayerRig) {
    // Tide wears Dusk's robe and Grove wears Dawn's, recoloured below.
    const own = rig.cast && models[rig.cast] ? rig.cast : null;
    const kind: string = own ?? (rig.guild === 0 || rig.guild === 3 ? "dawn" : "dusk");
    if (rig.body && ((rig.body.userData.real && rig.body.userData.kind === kind) || !models[kind])) return;
    if (rig.body) rig.root.remove(rig.body);
    const model = models[kind];
    let body: THREE.Object3D;
    if (model) {
      body = own ? castBody(own)! : model.clone();
      if (!own) body.scale.multiplyScalar(1.8);
      body.userData.real = true;
      body.userData.kind = kind;
      if (own) {
        /* lit flat in castBody */
      } else if (rig.guild >= 2) {
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
    this.flickerLamps(time);
    for (const f of this.floaters) f.obj.position.y = f.y + Math.sin(time * 0.25 * f.drift + f.phase) * 0.8;
    this.brazierLight.intensity = 18 + Math.sin(time * 9) * 3 + Math.sin(time * 23) * 2;
    const { vents, portcullis } = this.gimmicks;
    if (vents) {
      // The plume flares on the eruption tick and fades over the next one; the core glows hotter as it nears.
      const since = (st.snap.tick % vents) + Math.min(1, st.t);
      const flare = Math.max(0, 1 - since / 1.5);
      const warm = (st.snap.tick % vents) / (vents - 1 || 1);
      for (const v of this.vents) {
        (v.plume.material as THREE.MeshBasicMaterial).opacity = flare * 0.75;
        v.plume.scale.set(1, 0.4 + flare * 0.6, 1);
        v.core.emissiveIntensity = 0.4 + warm * 1.4 + flare * 2;
      }
    }
    const held = this.gimmicks.plates ? platesHeld(b, st.snap.players.map((p) => ({ pos: { x: p.x, y: p.y } }))) : null;
    if (held) for (const pl of this.plates) pl.glow.emissiveIntensity += ((held.has(pl.q) ? 1.6 : 0.1) - pl.glow.emissiveIntensity) * 0.2;
    if (portcullis || held)
      for (const gt of this.gates) {
        const open = held ? held.has(quarterOf(gt.dx, gt.dy)) : gateOpen(st.snap.tick, portcullis!, gt.dx, gt.dy);
        const goal = open ? 1.85 : 0;
        gt.lift += (goal - gt.lift) * 0.15;
        gt.grille.position.y = gt.lift;
      }
    if (this.gimmicks.mist) {
      // The banks drift smoothly between ticks.
      const banks = mistBanks(st.snap.tick - 1 + Math.min(1, st.t), b.center);
      while (this.mists.length < banks.length) {
        const m = makeMist(banks[this.mists.length]!.r);
        this.shrineGroup.add(m);
        this.mists.push(m);
      }
      banks.forEach((k, i) => {
        this.mists[i]!.position.set(this.worldX(b, k.x), Math.sin(time * 0.6 + i) * 0.15, this.worldZ(b, k.y));
        this.mists[i]!.rotation.y = time * 0.05 * (i % 2 ? 1 : -1);
      });
    }
    if (st.snap.moss) {
      const seen = new Set<number>();
      for (let k = 0; k < st.snap.moss.length; k += 2) {
        const i = st.snap.moss[k]!, hp = st.snap.moss[k + 1]!;
        seen.add(i);
        let rig = this.mossRigs.get(i);
        if (!rig) {
          rig = makeMoss(this.worldX(b, i % b.width), this.worldZ(b, Math.floor(i / b.width)), i);
          rig.scale.setScalar(0.01);
          this.shrineGroup.add(rig);
          this.mossRigs.set(i, rig);
        }
        // Torn at: it shudders, sheds a few bits, and goes brown and ragged.
        const was = this.mossHp.get(i);
        if (was && hp < was.hp) {
          was.hit = time;
          this.shedMoss(rig, time, 4);
        }
        this.mossHp.set(i, { hp, hit: was && hp < was.hp ? time : was?.hit ?? -99 });
        const torn = 1 - hp / MOSS_HP;
        const mat = (rig.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.color.set("#4f8a3a").lerp(new THREE.Color("#9a8443"), torn);
        // It springs up when it grows, and shrinks as it's torn at.
        const goal = 0.55 + 0.45 * (hp / MOSS_HP);
        rig.scale.setScalar(rig.scale.x + (goal - rig.scale.x) * 0.15);
        const since = time - this.mossHp.get(i)!.hit;
        const shake = since < 0.4 ? Math.sin(since * 60) * 0.12 * (1 - since / 0.4) : 0;
        rig.rotation.z = shake;
        rig.rotation.x = shake * 0.6;
      }
      for (const [i, rig] of this.mossRigs)
        if (!seen.has(i)) {
          // Torn clean away: it bursts into flying scraps.
          if (this.mossHp.get(i)) this.shedMoss(rig, time, 10);
          this.shrineGroup.remove(rig);
          this.mossRigs.delete(i);
          this.mossHp.delete(i);
        }
    }
    for (let k = this.mossBits.length - 1; k >= 0; k--) {
      const bit = this.mossBits[k]!;
      const age = time - bit.born;
      if (age > 0.8 || age < 0) {
        this.shrineGroup.remove(bit.obj);
        this.mossBits.splice(k, 1);
        continue;
      }
      bit.v.y -= 0.012;
      bit.obj.position.add(bit.v);
      bit.obj.scale.setScalar(1 - age / 0.8);
    }
    const lerp = (a: number, z: number) => a + (z - a) * Math.min(1, st.t);

    // The laws of water: a pull that met the water this tick shows for a moment.
    if (st.snap !== this.stopSnap) {
      this.stopSnap = st.snap;
      for (const f of st.snap.stops ?? []) this.stopFx.set(f.wisp, { at: time, player: f.player, x: f.x, y: f.y });
    }
    for (const [id, f] of this.stopFx) if (time - f.at > STOP_FX) this.stopFx.delete(id);

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
      // Held fast in the ground: no bob, sunk low in its ring of stones.
      if (w.rooted && !rig.stones) {
        rig.stones = makeStones();
        this.scene.add(rig.stones);
      }
      if (rig.stones) {
        rig.stones.visible = !!w.rooted && rig.rootedAt !== undefined && time - rig.rootedAt > EARTH_LINE;
        rig.stones.position.set(this.worldX(b, w.x), 0, this.worldZ(b, w.y));
      }
      // The wisp turns from a light into a stone: a crust closes over it in about a second,
      // its glow drops to a third and shows only through the cracks, and it sinks and stops
      // bobbing. Pulled on while held, the stone shudders without moving.
      let stone = 0;
      if (w.rooted) {
        if (rig.rootedAt === undefined) this.stoneCast(w.rooted, time);
        rig.rootedAt ??= time;
        // A line of earth runs from her lantern to it first; the stone starts where it lands.
        const since = time - rig.rootedAt;
        const holder = this.players.get(w.rooted);
        if (holder) {
          if (!rig.earth) {
            rig.earth = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#b07a3c", transparent: true }));
            this.scene.add(rig.earth);
          }
          const from = holder.root.position.clone().add(holder.lantern.position);
          const to = new THREE.Vector3(this.worldX(b, w.x), 0.5, this.worldZ(b, w.y));
          const grow = Math.min(1, since / EARTH_LINE);
          const end = from.clone().lerp(to, grow);
          rig.earth.position.copy(from).lerp(end, 0.5);
          rig.earth.scale.set(1, Math.max(0.001, from.distanceTo(end)), 1);
          rig.earth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(from).normalize());
          // Strong while the stone closes, then gone by EARTH_FADE seconds (Ladi: five at most).
          (rig.earth.material as THREE.MeshBasicMaterial).opacity = since < 1.5 ? 0.95 : Math.max(0, 0.95 * (1 - (since - 1.5) / (EARTH_FADE - 1.5)));
          rig.earth.visible = since < EARTH_FADE;
        }
        stone = Math.min(1, Math.max(0, since - EARTH_LINE) / 1.1);
        stone = stone * stone * (3 - 2 * stone);
        if (!rig.crust) {
          rig.crust = makeCrust(GUILD_COLORS[w.guild]!);
          rig.root.add(rig.crust);
        }
        const tugged = st.snap.players.some((p) => p.beam === w.id);
        const shake = tugged ? 0.035 : stone < 1 ? 0.02 * (1 - stone) : 0;
        rig.crust.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        rig.crust.scale.setScalar(0.4 + 0.6 * stone);
        rig.crust.rotation.y = w.id;
      } else {
        rig.rootedAt = undefined;
        if (rig.earth) rig.earth.visible = false;
      }
      if (rig.crust) rig.crust.visible = !!w.rooted;
      const bob = w.rooted ? -0.3 * stone + Math.sin(time * 2.2 + w.id * 1.7) * 0.12 * (1 - stone) : Math.sin(time * 2.2 + w.id * 1.7) * 0.12;
      const sink = w.rim > 0 ? Math.min(1, w.rim * 0.5 + st.t * 0.5) : 0;
      rig.root.position.set(this.worldX(b, x), 0.75 + bob + sink * 1.4, this.worldZ(b, y));
      // Stopped at the bank: it lurches at the water and bumps back onto land.
      const fx = this.stopFx.get(w.id);
      if (fx) {
        const k = (time - fx.at) / STOP_FX;
        const dx = fx.x - w.x, dz = fx.y - w.y, n = Math.hypot(dx, dz) || 1;
        const lurch = Math.sin(Math.PI * Math.min(1, k * 2)) * 0.28 * (1 - k);
        rig.root.position.x += (dx / n) * lurch;
        rig.root.position.z += (dz / n) * lurch;
      }
      const s = 1 - sink * 0.6;
      const dim = 1 - stone * (2 / 3);
      rig.core.scale.setScalar(s * (st.hoverWisp === w.id ? 1.3 : 1));
      rig.halo.material.opacity = 0.85 * s * dim * dim;
      rig.light.intensity = 6 * s * dim;
      rig.trail.visible = stone < 0.5;
      if (w.rim > 0) rimPulse = Math.max(rimPulse, 1);
      wispPos.set(w.id, rig.root.position.clone());
    }
    for (const [id, rig] of this.wisps) if (!seenW.has(id)) (this.scene.remove(rig.root), rig.stones && this.scene.remove(rig.stones), rig.earth && this.scene.remove(rig.earth), this.wisps.delete(id));
    if (this.rim) (this.rim.material as THREE.LineBasicMaterial).opacity = 0.55 + rimPulse * 0.45 * (0.5 + 0.5 * Math.sin(time * 10));

    // Watchers: story figures standing off the plaza, turning slowly to keep you in view.
    const meNow = st.snap.players.find((p) => p.id === st.me);
    const seenWt = new Set<string>();
    for (const w of st.watchers ?? []) {
      let o = this.watchers.get(w.cast);
      if (!o) {
        const body = castBody(w.cast);
        if (!body) continue;
        o = body;
        this.scene.add(o);
        this.watchers.set(w.cast, o);
      }
      seenWt.add(w.cast);
      const wa = o.userData.anim as CastAnim | undefined;
      if (wa) (wa.set("idle"), wa.update(time));
      const wx = this.worldX(b, w.x), wz = this.worldZ(b, w.y);
      o.position.set(wx, 0, wz);
      if (meNow) {
        const yaw = Math.atan2(this.worldX(b, lerp(meNow.px, meNow.x)) - wx, this.worldZ(b, lerp(meNow.py, meNow.y)) - wz);
        o.rotation.y = lerpAngle(o.rotation.y, yaw, 0.04);
      }
    }
    for (const [k, o] of this.watchers) if (!seenWt.has(k)) (this.scene.remove(o), this.watchers.delete(k));

    // Story run 1: the steps Hesta leaves by, off the north rim and up into the sky. Decoration only.
    if (st.steps && !this.steps) {
      this.steps = makeSteps();
      this.scene.add(this.steps);
    }
    if (this.steps) {
      this.steps.visible = !!st.steps;
      if (st.steps) this.steps.position.set(this.worldX(b, st.steps.x), 0, this.worldZ(b, st.steps.y));
    }

    this.dressStatue(st.walk ?? 1);
    // The walks' time of day, over the island's own look.
    const lk = `${st.shrine.id}~${st.light ?? ""}`;
    if (lk !== this.lightKey) {
      this.lightKey = lk;
      const base = themeFor(st.shrine.id);
      this.applyTheme({ ...base, ...(LIGHTS[st.light ?? ""] ?? {}) });
      this.windowsOn = st.light === "dusk" || st.light === "night";
      setWindows(this.windowsOn);
    }
    this.lampWalk = st.walk ?? 1;
    this.dressLamps();

    // The free walk: Lumi's lantern by the water, glowing a little.
    if (st.lantern && !this.lantern) {
      this.lantern = makeLantern();
      this.scene.add(this.lantern);
    }
    if (this.lantern) {
      this.lantern.visible = !!st.lantern;
      if (st.lantern) {
        this.lantern.position.set(this.worldX(b, st.lantern.x), 0, this.worldZ(b, st.lantern.y));
        const glow = this.lantern.userData.glow as THREE.MeshBasicMaterial;
        glow.opacity = 0.75 + 0.2 * Math.sin(st.now / 420);
      }
    }

    // Lamplighters.
    const seenP = new Set<number>();
    for (const p of st.snap.players) {
      seenP.add(p.id);
      const flame = FLAME_COLORS[st.flames.get(p.id) ?? "amber"];
      let rig = this.players.get(p.id);
      const cast = st.cast?.get(p.id) ?? null;
      if (!rig || rig.guild !== p.guild || rig.cast !== cast) {
        if (rig) (this.scene.remove(rig.root), this.scene.remove(rig.beam));
        rig = this.makePlayer(p.guild, flame, cast);
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
      const anim = rig.body?.userData.anim as CastAnim | undefined;
      if (anim) {
        // Animated cast: the clips do the moving, so no bob.
        // Hesta, two or more ahead and with nothing to do, eats a honey drop from her bag (story thread).
        const lead = (st.snap.scores[p.guild] ?? 0) - Math.max(...st.snap.scores.filter((_, i) => i !== p.guild), 0);
        const snack = rig.cast === "hesta" && lead >= 2 && anim.has("snack");
        anim.set(p.beam !== null ? (p.mode === "push" ? "push" : "pull") : moving ? (p.run ? "run" : "walk") : snack ? "snack" : "idle");
        anim.update(time);
        rig.root.position.set(wx, 0, wz);
      } else rig.root.position.set(wx, moving ? Math.abs(Math.sin(time * 9)) * 0.06 : Math.sin(time * 1.6 + p.id) * 0.03, wz);
      if (rig.body) rig.body.rotation.y = rig.facing;
      this.stepStoneCast(rig, time);
      // Lantern sits up and to the side of the figure, where the staff head is.
      const side = new THREE.Vector3(-0.38, 1.74, 0.07).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.facing);
      rig.lantern.position.copy(side);
      rig.lantern.scale.setScalar(0.9 + Math.sin(time * 7 + p.id) * 0.06);

      const beam = rig.beam;
      let target = p.beam !== null ? wispPos.get(p.beam) : undefined;
      // Stopped at the bank: the beam breaks at the waterline, grey and flickering, short of the wisp.
      const broke = p.beam !== null ? this.stopFx.get(p.beam) : undefined;
      const broken = !!broke && broke.player === p.id && !!target;
      if (broken && target) {
        const edge = new THREE.Vector3(this.worldX(b, broke!.x), target.y, this.worldZ(b, broke!.y));
        target = edge.lerp(target, 0.5);
      }
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
        u.uColor!.value.set(p.slipped || broken ? "#777777" : p.mode === "pull" ? flame : "#ff5a5a");
        if (broken) beam.visible = Math.sin(time * 47) > -0.2;
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
      this.reach.visible = !this.isPlace;
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
  // Watchers: a soft name tag over each one whose model is in, so they can be found on the rim.
  for (const w of st.watchers ?? []) {
    if (!models[w.cast]) continue;
    const p = cam.toScreen(w.x, w.y, 1.75 * (CAST_SCALE[w.cast] ?? 1));
    const fs = Math.max(10, Math.min(13, cam.scale * 0.36));
    g.font = `600 ${fs}px system-ui, sans-serif`;
    g.textAlign = "center";
    const label = w.cast[0]!.toUpperCase() + w.cast.slice(1);
    const tw = g.measureText(label).width + 10;
    g.fillStyle = "rgba(10,6,18,0.45)";
    roundRect(g, p.x - tw / 2, p.y - fs - 4, tw, fs + 8, 6);
    g.fill();
    g.fillStyle = w.cast === "lumi" ? "#ffd36a" : "#9fd8ff";
    g.fillText(label, p.x, p.y);
  }
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
      g.fillStyle = t === Tile.Wall ? "#4a4a55" : t === Tile.Water ? "#3f9fa8" : t === Tile.Rock ? "#888" : t === Tile.CrystalA || t === Tile.CrystalB ? "#e6c8ff" : t === Tile.Rime ? "#cfe8f4" : t === Tile.Moss ? "#4f8a3a" : t === Tile.Glyph ? "#c9a24a" : t === Tile.Brazier ? "#ff9a3a" : "#3b3346";
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
