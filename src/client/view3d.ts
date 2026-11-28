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
import { PULL_REACH, PUSH_REACH, TICK_MS, gateOpen, mistBanks, platesHeld, quarterOf, MOSS_HP, type GameSnapshot, type Guild } from "../engine/game.js";
import { armSamples, ringWalls, type Ring, type Shrine } from "../engine/maps.js";
import { contourLoops } from "./contour.js";
import { FLAME_COLORS, type Flame } from "../engine/protocol.js";
import { makeCloud, makeCurtain, makeIsland, makeWaterfall } from "./islands.js";
import { DYING, crowdSpot, terraceHeight } from "../engine/dying.js";
import { DRESS, dressVerge, quarryPit, sieveGrain, sieveMask, sievePaths, wellLoop } from "./sieve-dress.js";
import { SIEVE } from "../engine/sieve.js";
import { RESCUE_LOOK, RescueFx, type VillagerRig } from "./rescue-dress.js";
import { OffspringFx } from "./offspring-dress.js";
import { dressYard } from "./yard-dress.js";
import { CampFx, dressCamp } from "./camp-dress.js";
import { CAMP } from "../engine/camp.js";
import { OFFSPRING } from "../engine/offspring.js";
import { VILLAGERS, VILLAGER_BASES, tintVillager, type Villager } from "./villagers.js";
import { RematchFx } from "./rematch-dress.js";
import { CoveFx } from "./cove-dress.js";
import { KiteFx } from "./kite-dress.js";
import { TidepoolFx } from "./tidepool-dress.js";
import { drawOptHud } from "./opt-hud.js";
import { SHIP_LOOK, ShipFx } from "./ship-dress.js";
import { SHIP, SHIP_DECK } from "../engine/shiphome.js";
import { RESCUE } from "../engine/rescue.js";
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
  /** Run 9: the player whose name is breaking up in static just now (the shadow has cut her off). */
  staticOn?: number;
  /** Story run 1 only: a flight of steps leaving the island at this spot (tile coords), heading north. For looks: nobody walks them. */
  steps?: { x: number; y: number };
  /** The free walk on the pond: Lumi's lantern, left by the water (tile coords). Something to find and tap. */
  lantern?: { x: number; y: number };
  /** The walks: time of day on the island (see LIGHTS). */
  light?: string;
  /** Runs 6 and 7, the dying brazier (see StoryView.dying). */
  /** Run 8, the Sieve (see StoryView.sieve). */
  sieve?: { warn?: number[]; drain?: number; look?: { x: number; y: number }; pull?: NonNullable<NonNullable<import("../engine/protocol.js").StoryView["sieve"]>["pull"]> };
  dying?: NonNullable<import("../engine/protocol.js").StoryView["dying"]>;
  /** Run 9, the rescue (see StoryView.rescue). */
  rescue?: NonNullable<import("../engine/protocol.js").StoryView["rescue"]>;
  /** The optional runs (see StoryView.opt). */
  opt?: NonNullable<import("../engine/protocol.js").StoryView["opt"]>;
  /** Run 10, the ship home (see StoryView.ship). */
  ship?: NonNullable<import("../engine/protocol.js").StoryView["ship"]>;
  /** Part 2, runs 3 and 4, the offspring fight (see StoryView.fight). */
  fight?: NonNullable<import("../engine/protocol.js").StoryView["fight"]>;
  /** The walk on the island (1 to 5): the Willing Girl has ribbons from walk 3, fresh flowers in walk 5. */
  walk?: number;
  /** A walk's people who face somewhere while they stand (Maudie toward the dock in walk 7). */
  looks?: { id: number; x: number; y: number }[];
  /** Part 2, the camp walk (see StoryView.camp), and where the camera looks (board tiles), so the nightshades move only off camera. */
  camp?: NonNullable<import("../engine/protocol.js").StoryView["camp"]>;
  camAt?: { x: number; y: number };
}

// ------------------------------------------------------------------ camera

/**
 * A tilted perspective camera that keeps the old 2D camera's interface: `scale` is roughly
 * pixels per tile at the look-at point, `cx, cy` is the tile it looks at.
 */
/** The brazier's fire, its parts. */
type FireParts = { fire: THREE.Object3D; embers: THREE.Object3D; glow: THREE.Sprite; pillar: THREE.Mesh } | null;

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

  fitScale(board: Board) {
    const f = board.frame;
    return Math.min(this.w / ((f?.w ?? board.width) + 6), this.h / (((f?.h ?? board.height) + 4) * 0.95));
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
    const f = board.frame;
    return Math.min(this.w / ((f?.w ?? board.width) + 44), this.h / ((f?.h ?? board.height) + 44));
  }

  phoneZoom() {
    this.scale = Math.min(this.w, this.h) / (this.board?.phoneSpan ?? 12);
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
const CAST_MODELS = ["rook", "lumi", "hesta", "wick", "moth", "nell", "sefa", "kes", "maudie", "mabry", "orrin", "solenne", "fen", "outrider", "crew-cook", "crew-lantern", "crew-gate", "crew-lamp"] as const;
/** Each character's height against Rook's (models come in at one height). Lumi is nine. */
export const CAST_SCALE: Record<string, number> = { lumi: 0.7, nell: 0.76, sefa: 0.6, hesta: 0.95, wick: 1.05, moth: 0.95, kes: 0.95, orrin: 1.05, maudie: 0.92, mabry: 0.78, jarek: 1.05, manu: 1.08, garrick: 1.0, hania: 0.92, marit: 0.92, sina: 0.95, ferryman: 1.05, tilda: 0.88, solenne: 1.04, fen: 0.8, outrider: 1.04, "crew-cook": 0.95, "crew-lantern": 1.0, "crew-gate": 1.06, "crew-lamp": 0.97 };
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
const PLACE_MODELS = ["rook-house", "rook-house-big", "fence", "washpost", "bench", "barrel", "woodpile", "flowerbed", "hesta-house", "hesta-chair", "skiff", "landing", "shrine", "kindling-brazier", "falls", "shrine-wall", "shade-tree", "lamp-pedestal", "spout-basin", "willing-girl", "willing-girl-ribbons", "statue-flowers", "lookout-post", "landing-rail", "maudie-house", "moth-house", "mabry-house", "orrin-house", "wick-house", "nell-house", "sefa-house", "path-lamp", "jarek-ladder", "beehive", "garden-plot", "mat-rack", "baskets", "wheelbarrow", "pane-crate", "cargo-crates", "offering-stone", "offering-boat", "offering-mooring", "kes-house", "wind-vane", "bent-tree", "referee-stand", "sieve-well-pit", "sieve-cutters-hut-a", "sieve-cutters-hut-b", "sieve-block-stacks", "sieve-stone-cart", "sieve-hoist", "sieve-tally-table", "ship-hull", "ship-sail", "ship-lamp", "ship-rope-coil", "ship-tiller", "isle-kite-fell", "isle-orchard", "isle-mill", "isle-steps", "low-house-a", "low-house-b", "low-house-c", "rescue-boat", "kes-drop", "cold-brazier"];

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
  for (const n of ["dawn", "dusk", "brazier", "monolith", "boulder", ...CAST_MODELS] as string[]) loadFigure(n);
}

/** A model that is brought to one unit tall, with its clips (the cast, and the props that stand in for anything). */
function loadFigure(n: string) {
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

/** The rest of the village, seen only on Hesta's terrace in runs 6 and 7: asked for when it first shows. */
const CROWD_MODELS = ["jarek", "hania", "manu", "garrick", "marit", "sina"] as const;
let crowdAsked = false;
function loadCrowd() {
  if (crowdAsked) return;
  crowdAsked = true;
  for (const n of CROWD_MODELS) loadFigure(n);
}

/** The ferryman, seen only on the ship home (run 10): asked for when it first opens. */
let ferryAsked = false;
function loadFerryman() {
  if (ferryAsked) return;
  ferryAsked = true;
  loadFigure("ferryman");
}

/** Tilda, the Sieve's keeper, seen only in run 8: asked for when the Sieve is first dressed. */
let tildaAsked = false;
function loadTilda() {
  if (tildaAsked) return;
  tildaAsked = true;
  loadFigure("tilda");
}

/** Run 9's villagers are asked for when that run first opens, not with the page: six models nobody else needs. */
let villagersAsked = false;
function loadVillagers() {
  if (villagersAsked) return;
  villagersAsked = true;
  for (const n of VILLAGER_BASES) loadFigure(n);
}

/**
 * One villager, as a figure of its own: its base's model at its height, lit by its own colours
 * as the cast is, in its skin and outfit colours, with its clips. Null until its model is in.
 */
function villagerRig(v: Villager): VillagerRig | null {
  const model = models[v.base], anims = clips[v.base];
  if (!model || !anims?.length) return null;
  const root = cloneSkinned(model);
  root.scale.multiplyScalar(v.height);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
    const c = (m.material as THREE.MeshStandardMaterial).clone();
    if (c.map) {
      c.emissiveMap = c.map;
      c.emissive = new THREE.Color("#ffffff");
      c.emissiveIntensity = VILLAGERS.flat;
    }
    m.material = c;
  });
  // Last, as the cast thread says: a later clone would drop the colours.
  tintVillager(root, v.skin, v.outfit);
  const mixer = new THREE.AnimationMixer(root), actions = new Map(anims.map((c) => [c.name, mixer.clipAction(c)] as const));
  const mats: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => (o as THREE.Mesh).isMesh && mats.push((o as THREE.Mesh).material as THREE.MeshStandardMaterial));
  let cur = "", last = 0, shade = 1;
  return {
    root,
    shade(k: number) {
      if (Math.abs(k - shade) < 0.004) return;
      shade = k;
      for (const m of mats) m.color.setScalar(k), (m.emissiveIntensity = VILLAGERS.flat * k);
    },
    play(clip: string) {
      const next = actions.get(clip) ?? actions.get("idle");
      if (!next || cur === clip) return;
      const prev = actions.get(cur);
      next.reset().play();
      // Each starts somewhere of its own in the clip, so that no two move together.
      next.time = v.phase * next.getClip().duration;
      if (prev && prev !== next) next.crossFadeFrom(prev, 0.35, false);
      cur = clip;
    },
    update(time: number, still: boolean) {
      const dt = last ? Math.min(0.1, time - last) : 0;
      last = time;
      if (!still) mixer.update(dt);
    },
  };
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

/** The cloud seen far down a quarry pit's shaft: drifting, pale, darker at the shaft's wall. */
const PIT_CLOUD_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
float whash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(whash(i), whash(i + vec2(1, 0)), u.x), mix(whash(i + vec2(0, 1)), whash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float n = wnoise(p * 2.2 + vec2(uTime * 0.03, uTime * 0.012)) * 0.6 + wnoise(p * 5.0 - vec2(uTime * 0.02, 0.0)) * 0.4;
  // Far down and in shadow: mostly dark, the cloud only glimpsed moving.
  vec3 col = mix(vec3(0.09, 0.10, 0.13), vec3(0.40, 0.45, 0.52), n * n);
  col *= 1.0 - 0.7 * smoothstep(0.35, 1.0, r);
  gl_FragColor = vec4(col, 1.0);
}`;

const UV_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** The Sieve's wells: pale cloud drifting far below, and the shaft's far wall in shade. */
const WELL_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
float whash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(whash(i), whash(i + vec2(1, 0)), u.x), mix(whash(i + vec2(0, 1)), whash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  // The far wall shows as a crescent on the side away from the eye; the mouth below it is cloud.
  float inner = length(p - vec2(0.0, -0.3));
  float wall = smoothstep(0.78, 0.84, inner);
  float n = wnoise(p * 2.2 + vec2(uTime * 0.03, uTime * 0.012)) * 0.6 + wnoise(p * 5.0 - vec2(uTime * 0.02, 0.0)) * 0.4;
  vec3 cloud = mix(vec3(0.60, 0.68, 0.78), vec3(0.84, 0.88, 0.92), n);
  // Deeper toward the near side, where the eye looks straight down.
  cloud *= 0.86 + 0.14 * smoothstep(-0.9, 0.6, p.y);
  float depth = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  vec3 chalk = mix(vec3(0.30, 0.32, 0.40), vec3(0.62, 0.61, 0.60), depth);
  vec3 col = mix(cloud, chalk, wall);
  // A thin dark lip where the ground stops.
  col *= 1.0 - 0.35 * smoothstep(0.93, 1.0, r);
  gl_FragColor = vec4(col, 1.0);
}`;

/** Run 4, the dark: the yard's sky and moon light as shares of the day's (enough to make out walls and carts), how far her flood brings it back, and how fast it changes (per second). */
const FIGHT_DARK = { hemi: 0.12, sun: 0.05, flood: 0.45, ease: 4 };

/** The Sieve's light: the sun's and the sky's colour at the start, and each one's strength at the start and at the end; and the cold colours they drain to. */
const SIEVE_LIGHT = { sun: ["#ffd9a0", 2.6, 1.5] as const, sky: ["#fff3e0", 0.95, 1.3] as const };
/** Run 8's pull, second take: the cold colour of its rings and threads. */
const PULL_COLD = "#9cc8f0";
/** The same cold, dark enough to read on the drawn Sieve's pale paving. */
const PULL_DARK = "#1d3350";
const SIEVE_COLD = { sun: new THREE.Color("#e6ecf2"), sky: new THREE.Color("#e9edf0") };

/** The falling law's look (run 8): how high a wisp at full height floats, where the low sun throws its shadow, and how long a fall takes to watch. */
const FALL = { /** Wisps and their shadows are drawn this much bigger under the law, so height reads with the whole island in view. */ big: 1.5, low: 0.32, high: 1.95, sun: [1.15, 0.55] as const, groundSec: 0.9, wellSec: 2.6, wellDrop: 9 };

/**
 * The night the island goes down, on the board: warm firelight in the middle (the brazier's own
 * light), dark ground past `uLit`, and pale cold cloud past `uCloud`, its edge uneven and slowly
 * turning over. The same shader draws the veil a little above the ground, which only has the cloud.
 */
const NIGHT_CLOUD_FS = /* glsl */ `
varying vec2 vUv;
uniform float uLit;
uniform float uDark;
uniform float uCloud;
uniform float uCloudA;
uniform float uVeil;
uniform float uTime;
uniform vec3 uTint;
float chash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(chash(i), chash(i + vec2(1, 0)), u.x), mix(chash(i + vec2(0, 1)), chash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = (vUv - 0.5) * 160.0;
  float r = length(p);
  float n = cnoise(p * 0.33 + vec2(uTime * 0.05, uTime * 0.02)) * 0.7 + cnoise(p * 0.9 - vec2(uTime * 0.07, 0.0)) * 0.3;
  float edge = uCloud + (n - 0.5) * 1.6;
  float cloud = smoothstep(edge - 0.35, edge + 0.9, r);
  float body = cnoise(p * 0.5 + vec2(uTime * 0.03, -uTime * 0.02));
  vec3 pale = mix(vec3(0.50, 0.57, 0.70), vec3(0.80, 0.85, 0.93), body) * uTint;
  // The edge itself is the brightest line of it, so it reads as something coming.
  pale += vec3(0.10, 0.10, 0.10) * (1.0 - smoothstep(0.0, 1.6, abs(r - edge - 0.4))) * uTint;
  float dark = smoothstep(uLit - 1.2, uLit + 1.6, r) * uDark * (1.0 - uVeil);
  float a = mix(dark, mix(uCloudA, uCloudA * 0.62, uVeil), cloud);
  gl_FragColor = vec4(mix(vec3(0.012, 0.016, 0.045), pale, cloud), a);
}`;

/** The crowd's lamps, against their sizes in DYING.crowd; and the ground's lurch: seconds, how far the eye dips (down) or rises (up), and how hard it shakes. */
const CROWD_LAMP = 1.5;
const LURCH = { sec: 0.6, dip: 1.1, rise: 0.7, shake: 0.22 };
/** Run 7's wall of cloud at the rim: how far out it stands and how tall it starts. */
const CLOUD_WALL = { at: 13.6, high: DYING.seven.wallHigh };
/** The cloud is drawn this far outside where it takes a wisp, since its edge is uneven; and how dull it is while the fire is still up (it is the brightest thing on the board by the end). */
const CLOUD_DRAW = { out: 1, dull: 0.62 };

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
  if (uIce > 1.5) {
    // The comet's glass: dark, with an ember glow moving slowly under it.
    float vein = noise(t * 1.4 + vec2(uTime * 0.05, -uTime * 0.04));
    float glow = smoothstep(0.4, 0.8, vein) * (0.55 + 0.25 * sin(uTime * 0.9 + vein * 9.0));
    col = mix(vec3(0.035, 0.03, 0.055), vec3(1.0, 0.42, 0.08), glow * 0.9);
    float sheen = smoothstep(0.75, 0.95, noise(vec2(t.x * 0.5 + t.y * 0.8, t.y * 2.4)));
    col += vec3(0.25, 0.3, 0.45) * sheen * 0.35;
    col = mix(vec3(0.16, 0.1, 0.08), col, body);
    gl_FragColor = vec4(col, mix(0.7, 0.97, body) * shore);
    return;
  }
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

const SHADE_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const SHADE_HARD_GEO = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);

function glowSprite(color: string, size: number, opacity = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.setScalar(size);
  return s;
}

const TMP_COLOR = new THREE.Color();

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
  /** Hesta's snack bubble: the honey drop, bitten away in time with her snack clip. */
  snack?: THREE.Sprite;
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
  /** Run 7: when her helping line was last on it. */
  heldLit?: number;
  /** Run 8: its shadow on the chalk, soft and hard. */
  shade?: [THREE.Mesh, THREE.Mesh];
  /** Run 8: the wisp's glow on pale chalk, a soft warm stain round it (an added glow would vanish on white). */
  aura?: THREE.Sprite;
  /** Run 8's tug: how far its flame leans toward the nearest well (0 to 1), and where core and halo sit unleant. */
  lean?: number;
  base?: [THREE.Vector3, THREE.Vector3];
}

/** Seconds the earth line takes to reach a wisp before the stone starts closing over it. */
const EARTH_LINE = 0.35;
/** The snack bubble against the snack clip's own time (cast thread's timing.json): in at 0.3 s, a bite at each of `bites` (then crumbs, then a sparkle), out over `out`; `size` in tiles. */
/** The storm string: its violet, the light that runs along it, and how long a join flashes (seconds). */
/** every: seconds between sparks down the string (3 ticks); hop: seconds a spark takes over each link; crack: how long a wisp stays lit; jags: bends in a link; leash: past this far from her head wisp, the lantern's own link isn't drawn. */
const STORM = { line: "#7b2ff2", light: "#c9a2ff", flash: 0.45, every: 1.8, hop: 0.15, crack: 0.32, jags: 6, leash: 14 };
/** The moored skiff: bob in tiles (tie is the bow lantern in the model's own space), roll in radians, seconds a bob, rope links and slack, shade strength. */
const MOORING = { bob: 0.06, roll: 0.026, period: 3.6, links: 10, slack: 0.3, shade: 0.4, tie: [1.1, 0.65, -0.05] as const };
const SNACK = { frames: 7, in: 0.3, bites: [1.45, 1.85, 2.25, 2.65, 2.95, 3.1], outFrom: 3.3, outTo: 3.45, size: 3.4 };
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
  "kes-house": { model: "kes-house" },
  // Nell's and Sefa's fronts (the serving hatch, the porch) are on +Z, like the doors of the rest.
  "nell-house": { model: "nell-house" },
  "sefa-house": { model: "sefa-house" },
  offering: { model: "offering-stone", y: -0.6 },
  mooring: { model: "offering-mooring", dx: 0.5 },
  boat: { model: "offering-boat", y: 0.08 },
  "hesta-house": { model: "hesta-house" },
  chair: { model: "hesta-chair" },
  shrine: { model: "shrine", rot: Math.PI },
  stall: { model: "stall" },
  kindling: { model: "kindling-brazier" },
  falls: { model: "falls" },
  skiff: { model: "skiff", dx: -0.9, y: -0.35 },
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
const YARD = new Set(["fence", "post", "bench", "barrel", "woodpile", "flowerbed", "shrine-wall", "tree", "lamp", "basin", "statue", "lookout", "rail", "path-lamp", "ladder", "beehive", "garden-plot", "mat-rack", "baskets", "wheelbarrow", "pane-crate", "cargo-crates", "streamer", "streamer-blue", "wind-vane", "bent-tree", "referee-stand", "cold-brazier", "low-lamp", "low-house", "ship-figure", "yard-solid"]);
/** Yard things drawn from their own model: tiles wide and deep, and the block-out's height. */
const YARD_THINGS: Record<string, [number, number, number]> = {
  beehive: [1, 1, 1], "garden-plot": [3, 2, 0.3], "mat-rack": [2, 1, 1.9], baskets: [1, 1, 0.4], wheelbarrow: [1, 1, 0.7], "pane-crate": [1, 1, 0.7], "cargo-crates": [1, 1, 1.3],
};

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
  /** A one-shot held on its last frame (Rook's knocked, getup), over whatever is playing, until release(); `fade` 0 cuts straight to it. */
  hold(move: string, timeScale = 1, fade = 0.1) {
    const next = this.actions.get(move);
    if (!next) return false;
    const prev = this.held ? this.actions.get(this.held) : this.cur ? this.actions.get(this.cur) : undefined;
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.timeScale = timeScale;
    next.reset().play();
    if (prev && prev !== next) fade > 0 ? next.crossFadeFrom(prev, fade, false) : prev.stop();
    this.held = move;
    return true;
  }
  /** Back from a held one-shot: the next set() crossfades out of it. */
  release() {
    if (!this.held) return;
    this.cur = this.held as CastMove;
    this.held = null;
  }
  private held: string | null = null;
  /** How far into this clip she is, in seconds; null when it isn't the one playing. */
  at(move: string) {
    return this.cur === move && !this.casting ? (this.actions.get(move)?.time ?? null) : null;
  }
  /** A clip to stand in for idle (the boy's cower in the fight), or null for its own. */
  idleAs: string | null = null;
  /** Ask for a move; a push already playing finishes first. */
  set(move: CastMove) {
    if (this.casting || this.held) return;
    if (move === "idle" && this.idleAs && this.actions.has(this.idleAs)) move = this.idleAs as CastMove;
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
  private wispGuild = new Map<number, number>();
  /** Pulls stopped at the bank (the laws of water), by wisp: when, by whom, and the water tile it met. */
  private stopFx = new Map<number, { at: number; player: number; x: number; y: number }>();
  private stopSnap: GameSnapshot | null = null;
  /** The brazier's fire, kept so a flame level (runs 6 and 7) can shrink and grow it. */
  private fireParts: FireParts = null;
  private fireAt = new THREE.Vector3();
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
    // Where the sun stands: high in the north-west, unless the island has its own hour.
    this.sun.position.set(...(th.sunAt ?? ([-16, 26, -22] as [number, number, number])));
    // A low sun throws long shadows: its shadow camera takes in more ground.
    const sc = this.sun.shadow.camera, reach = th.sunAt ? 30 : 20;
    if (sc.right !== reach) (sc.left = sc.bottom = -reach), (sc.right = sc.top = reach), sc.updateProjectionMatrix();
    this.renderer.toneMappingExposure = th.exposure;
    this.dayLight = { hemi: th.hemi[2], sun: th.sun[1], exposure: th.exposure };
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
        // A baby's things (Mele's, on Sefa's line): half size, cream, pale pink and pale blue.
        const small = shrine.smallWash?.includes(`${p.x},${p.y}`) ?? false;
        const cloths = small ? ["#f6efdc", "#f3d3d8", "#d3e4f3"] : ["#e8d7b0", "#9fc4e8", "#e8a0a0", "#f4f0e6"];
        const cw = small ? 0.3 : 0.55, ch = small ? 0.36 : 0.7;
        for (const side of [-1, 1]) {
          const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), new THREE.MeshStandardMaterial({ color: "#eee6d6" }));
          line.rotation.z = Math.PI / 2;
          line.position.set(wx + len / 2, LINE_H, wz + side * 0.66);
          g.add(line);
          // Small things hang closer together.
          for (let k = small ? 0.5 : 1; k < len; k += small ? 0.5 : 1) {
            if (!small && (k + (side > 0 ? 1 : 0)) % 2) continue;
            if (small && (Math.round(k * 2) + (side > 0 ? 1 : 0)) % 3 === 0) continue;
            const cloth = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), new THREE.MeshStandardMaterial({ color: cloths[((small ? Math.round(k * 2) : k) + side + 4) % cloths.length], side: THREE.DoubleSide, roughness: 1 }));
            cloth.position.set(wx + k, LINE_H - ch / 2 - 0.02, wz + side * 0.66);
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
      } else if (p.kind === "streamer" || p.kind === "streamer-blue") {
        // A pole with a long cloth flying east in the wind (a block-out until the maps thread draws one).
        const pole = box(0.1, 3.2, 0.1, wood);
        pole.position.x = wx;
        pole.position.z = wz;
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5, 8, 1), new THREE.MeshStandardMaterial({ color: p.kind === "streamer" ? "#8e5ae0" : "#3f7fe0", emissive: p.kind === "streamer" ? "#3a1f70" : "#16356e", side: THREE.DoubleSide, roughness: 1 }));
        cloth.position.set(wx + 1, 2.95, wz);
        cloth.castShadow = true;
        g.add(pole, cloth);
        this.streamers.push({ cloth, seed: p.x * 1.7 + p.y * 2.3 });
      } else if (p.kind === "wind-vane") {
        this.placeSlot("wind-vane", box(0.2, 3, 0.2, wood), wx, wz);
      } else if (p.kind === "bent-tree") {
        // Blown east: the trunk stands on its tile, the crown streams off to +X.
        this.placeSlot("bent-tree", box(0.3, 3.4, 0.3, wood), wx + 0.8, wz);
      } else if (p.kind === "referee-stand") {
        // Lumi's box, cloth side north to the race; whoever stands on its tile stands on the top step.
        this.placeSlot("referee-stand", box(1.4, 0.68, 1.1, wood), wx, wz);
        this.perch = { x: p.x, y: p.y, h: 0.68 };
      } else if (p.kind === "lookout") {
        this.placeSlot("lookout-post", box(0.2, 1.9, 0.2, wood), wx, wz);
      } else if (p.kind === "rail") {
        if (has(p.x - 1, p.y, "rail")) continue;
        const two = has(p.x + 1, p.y, "rail");
        this.placeSlot("landing-rail", box(two ? 2 : 1, 1, 0.12, wood), wx + (two ? 0.5 : 0), wz);
      } else if (YARD_THINGS[p.kind]) {
        // One model for its whole block of tiles, placed from the top-left one.
        if (has(p.x - 1, p.y, p.kind) || has(p.x, p.y - 1, p.kind)) continue;
        const [w, d, h] = YARD_THINGS[p.kind]!;
        this.placeSlot(p.kind, box(w * 0.9, h, d * 0.8, wood), wx + (w - 1) / 2, wz + (d - 1) / 2, shrine.turns?.[`${p.x},${p.y}`] ?? 0);
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
      // (Kite Fell's runs east: turned the other way, its post at the east end.)
      const lt = shrine.turns?.landing ?? Math.PI, ls = lt === 0 ? -1 : 1;
      this.placeSlot("landing", holder, cx, cz, lt, -1);
      // Its lantern, on the post at the water end, burns with the path lamps (the last of them, for a walk's guttering or dead list).
      const glow = glowSprite("#ffb65a", 1.5, 0), core = glowSprite("#ffe2a0", 0.55, 0);
      glow.position.set(cx - 2.2 * ls, 1.95, cz - 1.25 * ls);
      this.landingPost = new THREE.Vector3(cx - 2.0 * ls, 0.95, cz - 0.72 * ls);
      core.position.set(cx - 2.2 * ls, 2.25, cz - 1.25 * ls);
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
      if (kind === "skiff" && !this.landingPost) {
        // Its mooring post stays on the edge; the boat lies west of it. (At a landing it ties to the lamp post.)
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
        const slot = this.placeSlot(drawn.model, obj, at[0] + (drawn.dx ?? 0), at[1], shrine.turns?.[kind] ?? drawn.rot ?? 0, drawn.y ?? 0);
        slot.userData.place = kind;
        if (kind === "skiff") this.moor(slot, this.landingPost ?? new THREE.Vector3(at[0] + 0.3, 0.9, at[1]));
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
    this.moored = null;
    this.landingPost = null;
    this.streamers = [];
    this.perch = null;
    if (this.storm) {
      this.scene.remove(...this.storm.all);
      this.storm = null;
    }
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
    // (The Cove is played right out to its east end, so nothing drifts over that either.)
    this.distantPush = Math.max(0, Math.max(W, H) / 2 - 28) + (shrine.tidal ? 14 : 0);
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

    // The Sieve is dressed as a worked quarry floor (sieve-dress.ts).
    const dressed = shrine.id === SIEVE.shrine && !!shrine.wells?.length && !!shrine.coast;
    this.sieveDressed = dressed;
    if (dressed) loadTilda();
    // The plaza: flagstones laid right up to the island's edge.
    const floorTex = tex(`textures/floor-${th.floor}.webp`, 1 / (th.floorTiles ?? 6), `textures/floor-${shrine.id}.webp`);
    const floorShape = new THREE.Shape();
    // Tentacle islands: trace the edge from the rules' own coast field instead of a radius.
    const coastField = shrine.arms && shrine.coast ? shrine.coast : null;
    const traced = (out: number) =>
      contourLoops((x, y) => coastField!(x, y) - out, -W / 2 - 6, -H / 2 - 6, W / 2 + 6, H / 2 + 6, 0.5);
    if (coastField) {
      // The longest loop is the outer edge; the rest are the gaps of sky between routes.
      const [outer, ...holes] = traced(0.35);
      (outer ?? []).forEach((p, i) => (i === 0 ? floorShape.moveTo(p.x, -p.y) : floorShape.lineTo(p.x, -p.y)));
      for (const h of holes) {
        const path = new THREE.Path();
        h.forEach((p, i) => (i === 0 ? path.moveTo(p.x, -p.y) : path.lineTo(p.x, -p.y)));
        floorShape.holes.push(path);
      }
      // The Sieve: its wells are holes through the ground.
      if (dressed) for (const [i, w] of (shrine.wells ?? []).entries()) floorShape.holes.push(new THREE.Path(wellLoop(w, i).map((q) => new THREE.Vector2(q.x, -q.z))));
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
    // A ship's deck (run 10) is drawn by ship-dress.ts: no flagstones and no land under it.
    if (shrine.deck) floor.visible = false;
    if (dressed) {
      const S = Math.max(W, H) + 2;
      const { paths, ruts } = sievePaths(shrine.wells!, coast);
      // The maps thread's cut-slab chalk, the worn slabs blended in where the mask says, darkened at the lips and ruts.
      const slab = tex("textures/floor-sieve.webp", 1 / DRESS.slab), worn = tex("textures/floor-sieve-worn.webp", 1 / DRESS.slab);
      const mask = sieveMask({ S, wells: shrine.wells!, coastAt: shrine.coast!, paths, ruts, low: this.low });
      const mat = new THREE.MeshStandardMaterial({ map: slab, bumpMap: sieveGrain(), bumpScale: 0.8, roughness: 0.93, color: "#ffffff" });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uWorn = { value: worn };
        sh.uniforms.uMask = { value: mask };
        sh.uniforms.uS = { value: S };
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\nuniform sampler2D uWorn;\nuniform sampler2D uMask;\nuniform float uS;")
          .replace(
            "#include <map_fragment>",
            `vec4 slabC = texture2D(map, vMapUv);
            vec4 wornC = texture2D(uWorn, vMapUv);
            vec4 mk = texture2D(uMask, vMapUv * ${DRESS.slab.toFixed(1)} / uS + 0.5);
            vec4 tc = mix(slabC, wornC, mk.r);
            tc.rgb *= (1.0 - 0.5 * mk.g) * (1.0 - 0.16 * mk.r) * (0.86 + 0.28 * mk.b);
            diffuseColor *= tc;`,
          );
      };
      floor.material = mat;
    }
    if (shrine.raceOval) {
      // The race ground: shorter, paler grass in an oval round the brazier, on a larger repeat.
      const { rx, ry } = shrine.raceOval;
      const oval = new THREE.Shape();
      oval.absellipse(0, 0, rx + 0.5, ry + 0.5, 0, Math.PI * 2);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(oval, 64), new THREE.MeshStandardMaterial({ map: tex(`textures/floor-${shrine.id}-race.webp`, 1 / 9), color: "#c9cfbb", roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -0.5 }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.014;
      m.receiveShadow = true;
      g.add(m);
    }
    const wallTex = tex("sprites/wall.png", 3);
    // The island itself follows the coastline, with a grassy verge outside the parapet, then
    // the cliff, a grassy terrace and hanging spires.
    const island = makeIsland({
      rx: 1, rz: 1, depth: 24, squareness: 2, seed: W + H,
      // A place drawn from its own shape (the horseshoe) keeps its cliff tight to the edge, so the
      // falls pour off the rim rather than onto a verge.
      radius: (a) => (shrine.core ? shrine.core.outline(a) + 0.2 : dressed ? coast(a) + DRESS.verge : shrine.lobes ? coast(a) + 0.2 : (coast(a) + 2.1) / 0.95),
      ...(dressed ? { holes: shrine.wells!.map((w, i) => wellLoop(w, i)) } : {}),
      ledge: shrine.lobes ? 0 : 2.4, ...(shrine.core ? { lip: 0.012 } : {}), spires: dressed ? 0 : this.low ? 3 : 6, grass: th.grass, soil: th.soil, rock: th.rock,
      segments: this.low ? 128 : 220,
    });
    island.position.set(shrine.core?.x ?? 0, -0.03, shrine.core?.y ?? 0);
    g.add(island);
    if (shrine.deck) island.visible = false;
    if (dressed) this.dressSieveIsland(island, this.low ? 128 : 220);
    // The crew's yard (Part 2, runs 3 and 4): the maps thread's ruin, carts and cage (yard-dress.ts).
    if (shrine.id === OFFSPRING.shrine) {
      const yard = new THREE.Group();
      g.add(yard);
      dressYard(yard);
    }
    // The same yard before the fight, warm (Part 2, the camp walk: camp-dress.ts).
    if (shrine.id === CAMP.shrine) {
      const yard = new THREE.Group();
      g.add(yard);
      dressCamp(yard);
    }
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
    const falls = th.particles !== "embers" && !shrine.landing;
    const tierList: { x: number; y: number; z: number; r: number; group: THREE.Group }[] = [];
    // Each island turns its tiers a different way so no two look alike.
    const spin = [...shrine.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) * 0.37;
    // (The low one has none: it lies in cloud, and a lower step would show through it like a flap.)
    (shrine.landing ? [] : tiers).forEach(([a0, size, ty], i) => {
      // A story place keeps its tiers clear of the landing and the falls: off the west, north-east and east rims.
      const a = shrine.lobes ? (shrine.tierAngles ?? [3.5, 5.5, 0.2])[i]! : a0 + spin;
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

    this.wellRings = [];
    // The Sieve's wells: old chalk pits gone through, each with a kerb of whitewashed stones.
    for (const w of shrine.wells ?? []) {
      const u = { uTime: { value: 0 } };
      this.timeUniforms.push(u.uTime);
      const R = w.r + 0.55;
      if (dressed) {
        // The maps thread's stepped quarry pit (top radius 1, scaled across by r), the procedural one standing in until it loads; the cloud far below.
        const i = this.wellRings.length, cloud = new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: PIT_CLOUD_FS, uniforms: u, fog: false });
        const slot = this.placeSlot("sieve-well-pit", quarryPit({ x: 0, y: 0, r: 1 }, i, cloud, this.low), w.x, w.y, 0, 0.01);
        slot.scale.set(w.r, 1, w.r);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(w.r * DRESS.pitShaft * 1.02, 32).rotateX(-Math.PI / 2), cloud);
        disc.position.set(w.x, DRESS.pitBottom, w.y);
        g.add(disc);
        // A thin outline at the lip, so the pit stays dark inside it (gameplay thread).
        const ring = new THREE.Mesh(new THREE.RingGeometry(w.r * 0.86, w.r * 1.03, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffb53a", transparent: true, opacity: 0, depthWrite: false }));
        ring.position.set(w.x, 0.3, w.y);
        ring.visible = false;
        ring.renderOrder = 2;
        g.add(ring);
        this.wellRings.push(ring);
        continue;
      }
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: WELL_FS, uniforms: u, transparent: true, polygonOffset: true, polygonOffsetFactor: -1 }));
      disc.position.set(w.x, 0.03, w.y);
      g.add(disc);
      // The shimmer in the air over it, before a wisp appears there.
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.35, R * 0.98, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffb53a", transparent: true, opacity: 0, depthWrite: false }));
      ring.position.set(w.x, 0.3, w.y);
      ring.visible = false;
      ring.renderOrder = 2;
      g.add(ring);
      this.wellRings.push(ring);
      const kerbMat = new THREE.MeshStandardMaterial({ color: "#f6f3ea", roughness: 0.95 });
      const n = Math.max(10, Math.round(R * 7));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + w.x;
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2 + 0.06 * ((i * 7) % 3), 0.34), kerbMat);
        st.position.set(w.x + Math.cos(a) * (R + 0.12), 0.1, w.y + Math.sin(a) * (R + 0.12));
        st.rotation.y = -a + Math.PI / 2 + (((i * 13) % 5) - 2) * 0.04;
        st.castShadow = st.receiveShadow = true;
        g.add(st);
      }
    }

    if (dressed) {
      dressVerge(g, coast, this.low, (m, bo, x, z, rot) => void this.placeSlot(m, bo, x, z, rot));
      this.fillHouse();
    }
    // A place to walk has no parapet and no monoliths: its paths, fence, wash line and bench instead.
    if (th.place || th.dressed) this.addPlace(shrine, b);
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
      this.placeSlot(hs.w >= 8 ? "rook-house-big" : "rook-house", makeHouse(hs.w, hs.h), this.worldX(b, hs.x + (hs.w - 1) / 2), this.worldZ(b, hs.y + (hs.h - 1) / 2)).userData.place = "house";
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
        else if (t === Tile.Rock && propAt.has(`${x},${y}`)) continue;
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
          uniforms: { uTime: waterU, uMask: { value: mask }, uSize: { value: new THREE.Vector2(W, H) }, uIce: { value: ice && shrine.glass ? 2 : ice } },
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
    // A landing's slip (run 9) has no brazier: none of this is seen there.
    const hearth: THREE.Object3D[] = [];
    for (const [r, h] of [[2.4, 0.18], [1.9, 0.36]] as const) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.1, h, 72), daisMat);
      d.position.set(cx, h / 2, cz);
      d.receiveShadow = d.castShadow = true;
      g.add(d);
      hearth.push(d);
    }
    this.brazierSlot = new THREE.Group();
    this.brazierSlot.position.set(cx, 0.36, cz);
    g.add(this.brazierSlot);
    this.refreshBrazier();
    const fire = particles(this.low ? 140 : 260, "#ffb347", "#ff3a10", 0.8, 2.4, 0.4, 0.75);
    this.fireAt.set(cx, 0, cz);
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
    this.fireParts = { fire, embers, glow: fireGlow, pillar };
    this.brazierLight.position.set(cx, 4.2, cz);
    if (shrine.landing) for (const o of [...hearth, this.brazierSlot, fire, embers, fireGlow, pillar]) o.visible = false;

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
   * Hesta's snack bubble (Ladi; art and timing from the cast thread): a small bubble by her head
   * with a honey drop in it, which loses a bite each time her hand reaches her mouth, leaves crumbs
   * and a sparkle, and goes. `t` is the snack clip's own time, null when she isn't snacking, and
   * then the bubble drops at once.
   */
  private stepSnack(rig: PlayerRig, t: number | null) {
    if (t === null || t < SNACK.in || t >= SNACK.outTo) {
      if (rig.snack) rig.snack.visible = false;
      return;
    }
    if (!rig.snack) {
      const map = new THREE.TextureLoader().load("sprites/snack-bubble.png");
      map.colorSpace = THREE.SRGBColorSpace;
      map.repeat.set(1 / SNACK.frames, 1);
      rig.snack = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
      // Hung by its tail tip, up and to the right of her head, past the end of her name tag.
      rig.snack.center.set(28 / 256, 1 - 226 / 256);
      rig.snack.position.set(1.7, 2.0, 0);
      rig.snack.renderOrder = 20;
      rig.root.add(rig.snack);
    }
    const b = rig.snack, mat = b.material;
    let frame = 0, since = t - SNACK.in;
    SNACK.bites.forEach((at, i) => {
      if (t >= at) (frame = i + 1), (since = t - at);
    });
    mat.map!.offset.x = frame / SNACK.frames;
    // Pops in with a little overshoot, bumps on each bite, shrinks and fades at the end.
    const pop = Math.min(1, (t - SNACK.in) / 0.18);
    let k = pop < 1 ? 1.12 * Math.sin((pop * Math.PI) / 1.7) / Math.sin(Math.PI / 1.7) : 1;
    if (frame >= 1 && frame <= 4 && since < 0.1) k *= 1.06;
    const out = Math.min(1, Math.max(0, (t - SNACK.outFrom) / (SNACK.outTo - SNACK.outFrom)));
    b.visible = true;
    b.scale.setScalar(SNACK.size * k * (1 - 0.5 * out));
    mat.opacity = 1 - out;
  }
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
      const c = m.clone();
      // The pit wall runs light at the lip to black at the bottom: clamped, so no light band wraps in below (maps thread).
      if (s.model === "sieve-well-pit")
        c.traverse((o) => {
          const t = ((o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined)?.map;
          if (t && t.wrapT !== THREE.ClampToEdgeWrapping) (t.wrapT = THREE.ClampToEdgeWrapping), (t.needsUpdate = true);
        });
      s.group.add(c);
      s.group.userData.filled = true;
    }
  }
  /** A slot for a place model at (x, z), turned `rot`, showing `blockout` until the model is in. */
  /**
   * The storm string (run 5): static, so it reads as Kes's storm light (Ladi). A jagged violet
   * line runs from her lantern to the head wisp and on from wisp to wisp, and every few seconds a
   * spark jumps down it from her lantern, each wisp cracking white-violet as it passes. It sparks
   * whether or not she is pulling; a wisp that joins gets a bigger crack. Looks only, no rule.
   */
  private storm: { links: { segs: THREE.Mesh[]; halo: THREE.Mesh }[]; nodes: { flash: THREE.Sprite; spokes: THREE.Mesh[] }[]; flash: THREE.Sprite; had: number[]; flashAt: number; all: THREE.Object3D[] } | null = null;
  private stepStormString(ids: number[], live: boolean, at: Map<number, THREE.Vector3>, time: number, lantern: THREE.Vector3 | null) {
    if (!ids.length && !lantern && !this.storm) return;
    if (!this.storm) {
      const flash = glowSprite(STORM.light, 3.2, 0);
      this.scene.add(flash);
      this.storm = { links: [], nodes: [], flash, had: [], flashAt: -9, all: [flash] };
    }
    const s = this.storm;
    const up = new THREE.Vector3(0, 1, 0);
    const rnd = (n: number) => {
      const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    const lay = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const dir = b.clone().sub(a), len = dir.length();
      m.visible = len > 0.02;
      if (!m.visible) return;
      m.position.copy(a).lerp(b, 0.5);
      m.scale.set(r, len, r);
      m.quaternion.setFromUnitVectors(up, dir.divideScalar(len));
    };
    // The chain: her lantern, then each strung wisp. A link too long to be hers (she is away across the ground) is left out.
    const pts: (THREE.Vector3 | undefined)[] = [lantern ?? undefined, ...ids.map((id) => at.get(id))];
    // The spark: sets off from the lantern every STORM.every seconds and takes STORM.hop to cross each link.
    const since = time % STORM.every;
    // The jags are redrawn several times a second, so the line crackles.
    const frame = Math.floor(time / 0.09);
    for (let i = 0; i < Math.max(s.nodes.length, pts.length); i++) {
      let n = s.nodes[i];
      const p = pts[i];
      if (!n) {
        const mat = new THREE.MeshBasicMaterial({ color: "#f1e6ff", transparent: true, depthWrite: false, fog: false, toneMapped: false });
        const geo = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
        n = { flash: glowSprite("#e9dcff", 1.6, 0), spokes: Array.from({ length: 4 }, () => new THREE.Mesh(geo, mat.clone())) };
        for (const sp of n.spokes) sp.renderOrder = 7;
        this.scene.add(n.flash, ...n.spokes);
        s.all.push(n.flash, ...n.spokes);
        s.nodes[i] = n;
      }
      // How lit this node is: 1 as the spark arrives, gone a moment after. Nothing strung: only her lantern spits.
      const k = (since - i * STORM.hop) / STORM.crack;
      const lit = p && k >= 0 && k < 1 && (ids.length > 0 || i === 0) ? 1 - k : 0;
      n.flash.visible = lit > 0;
      if (p) n.flash.position.copy(p);
      n.flash.material.opacity = lit;
      n.flash.scale.setScalar((i === 0 ? 1.1 : 1.7) * (0.7 + 0.6 * (1 - lit)));
      n.spokes.forEach((sp, j) => {
        sp.visible = lit > 0 && !!p;
        if (!sp.visible) return;
        const seed = Math.floor(time / STORM.every) * 31 + i * 7 + j;
        const a = rnd(seed) * Math.PI * 2, tilt = (rnd(seed + 0.5) - 0.3) * 1.2, len = (i === 0 ? 0.35 : 0.6) * (0.6 + rnd(seed + 0.9));
        const d = new THREE.Vector3(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt));
        // A bent spoke would be better; a short straight one at a fresh angle each time reads as a spark at this size.
        lay(sp, p!.clone().addScaledVector(d, 0.15), p!.clone().addScaledVector(d, 0.15 + len), 0.025);
        (sp.material as THREE.MeshBasicMaterial).opacity = lit;
      });
    }
    for (let i = 0; i < Math.max(s.links.length, pts.length - 1); i++) {
      let l = s.links[i];
      const a = pts[i], b = pts[i + 1];
      const far = i === 0 && a && b && a.distanceTo(b) > STORM.leash;
      if (!a || !b || far) {
        if (l) (l.halo.visible = false), l.segs.forEach((m) => (m.visible = false));
        continue;
      }
      if (!l) {
        const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
        // A solid violet core (pale ground washes out a line that is only light), in a soft glow.
        const core = new THREE.MeshBasicMaterial({ color: STORM.line, transparent: true, depthWrite: false, fog: false, toneMapped: false });
        const halo = new THREE.MeshBasicMaterial({ color: STORM.light, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        l = { segs: Array.from({ length: STORM.jags }, () => new THREE.Mesh(geo, core)), halo: new THREE.Mesh(geo, halo) };
        // Each link has its own colour, so one can whiten as the spark crosses it.
        const own = core.clone();
        for (const m of l.segs) (m.material = own), (m.renderOrder = 6);
        this.scene.add(l.halo, ...l.segs);
        s.all.push(l.halo, ...l.segs);
        s.links[i] = l;
      }
      // The spark is on this link between leaving node i and reaching node i + 1.
      const k = (since - i * STORM.hop) / STORM.hop;
      const hot = k >= 0 && k < 1.3 ? 1 - Math.max(0, k - 1) / 0.3 : 0;
      // The lantern's link is fainter than the string itself: it shows whose it is, not a fourth wisp.
      const base = i === 0 ? 0.45 : live ? 1 : 0.75;
      const dir = b.clone().sub(a), len = dir.length() || 1;
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const amp = (0.1 + 0.16 * hot) * Math.min(1, len / 2);
      const pt = (j: number) => {
        const t = j / STORM.jags;
        const p = a.clone().lerp(b, t);
        if (j > 0 && j < STORM.jags) p.addScaledVector(side, (rnd(frame * 13 + i * 5 + j) - 0.5) * 2 * amp).setY(p.y + (rnd(frame * 17 + i * 3 + j) - 0.5) * amp);
        return p;
      };
      const mat = l.segs[0]!.material as THREE.MeshBasicMaterial;
      mat.color.set(STORM.line).lerp(new THREE.Color("#f1e6ff"), hot);
      mat.opacity = Math.min(1, base + hot);
      let prev = pt(0);
      l.segs.forEach((m, j) => {
        const next = pt(j + 1);
        lay(m, prev, next, (i === 0 ? 0.035 : live ? 0.075 : 0.05) * (1 + hot * 0.6));
        prev = next;
      });
      lay(l.halo, a, b, i === 0 ? 0.12 : live ? 0.3 : 0.18);
      (l.halo.material as THREE.MeshBasicMaterial).opacity = (i === 0 ? 0.12 : live ? 0.4 : 0.2) + hot * 0.3;
    }
    // A wisp joins: a bigger crack on it.
    const joined = ids.find((id) => !s.had.includes(id));
    if (joined !== undefined && at.get(joined)) {
      s.flashAt = time;
      s.flash.position.copy(at.get(joined)!);
    }
    s.had = [...ids];
    const k = (time - s.flashAt) / STORM.flash;
    s.flash.visible = k >= 0 && k < 1;
    if (s.flash.visible) {
      s.flash.material.opacity = (1 - k) * 0.95;
      s.flash.scale.setScalar(2 + k * 3.4);
    }
  }

  /** Run 8: the shimmer over each well, and the morning's colour draining to grey-white as the supply comes. */
  private wellRings: THREE.Mesh[] = [];
  private sieveOn = false;
  private stepSieve(st: DrawState, time: number) {
    const sv = st.sieve;
    if (!sv) {
      if (this.sieveOn) {
        this.sieveOn = false;
        const th = themeFor(st.shrine.id);
        this.hemi.color.set(th.hemi[0]);
        this.sun.color.set(th.sun[0]);
        this.hemi.intensity = this.dayLight.hemi;
        this.sun.intensity = this.dayLight.sun;
      }
      return;
    }
    this.sieveOn = true;
    // The pull's wind-up: every well's ring closes inward, all at once, and holds small and bright.
    const pull = sv.pull;
    if (pull && !this.pullFx) this.pullFx = { at: time, phase: pull.phase };
    if (pull && this.pullFx && this.pullFx.phase !== pull.phase) {
      this.pullFx = { at: time, phase: pull.phase };
      if (pull.phase === "hold" && pull.loud) this.startSnap(st, pull, time);
    }
    if (!pull) this.pullFx = null;
    this.stepSnap(st, time);
    this.stepTugFx(st, time);
    // The tug: cold rings closing inward over every well, again and again, for the whole of it; gone in the silence after.
    if (this.pullFx && (this.pullFx.phase === "tug" || this.pullFx.phase === "after")) {
      const tug = this.pullFx.phase === "tug", since = time - this.pullFx.at;
      this.wellRings.forEach((r, i) => {
        const m = r.material as THREE.MeshBasicMaterial;
        m.color.set(this.sieveDressed ? PULL_DARK : PULL_COLD);
        r.visible = true;
        const c = (time * 1.4 + i * 0.13) % 1;
        // Closing in on the lip, again and again, brightest as it reaches it.
        m.opacity = tug ? (0.35 + 0.65 * c) * Math.min(1, since / 0.3) : Math.max(0, 0.8 * (1 - since / 0.5));
        r.scale.setScalar(tug ? 2.2 - 1.2 * c * c : 1);
      });
      return this.lightSieve(sv, time);
    }
    if (this.pullFx) {
      const wind = this.pullFx.phase === "wind", k = Math.min(1, (time - this.pullFx.at) / 1.8);
      this.wellRings.forEach((r) => {
        const m = r.material as THREE.MeshBasicMaterial;
        // The second take: a cold colour, not the warm one of wisps and fire.
        m.color.set(pull!.loud ? PULL_COLD : "#ffb53a");
        r.visible = true;
        m.opacity = wind ? 0.35 + 0.5 * k : 0.9 * (1 - Math.min(1, (time - this.pullFx!.at) / 1.6));
        r.scale.setScalar(wind ? 1.9 - 1.3 * k * k : 0.6);
      });
      return this.lightSieve(sv, time);
    }
    this.wellRings.forEach((r, i) => {
      (r.material as THREE.MeshBasicMaterial).color.set("#ffb53a");
      const on = !!sv.warn?.includes(i);
      const m = r.material as THREE.MeshBasicMaterial;
      m.opacity += ((on ? 0.3 + 0.2 * Math.sin(time * 11 + i) : 0) - m.opacity) * 0.15;
      r.visible = m.opacity > 0.01;
      r.scale.setScalar(0.9 + 0.1 * Math.sin(time * 5 + i * 2));
    });
    this.lightSieve(sv, time);
  }
  private pullFx: { at: number; phase: string } | null = null;
  /** The drawn Sieve: its paving is pale, so the tug's rings and dust are drawn dark on it (gameplay thread). */
  private sieveDressed = false;
  /**
   * The tug's dust: streaks of chalk dust skimming the ground into every well, faster as they near
   * it, for the whole of the tug; they settle in the silence after. Sized to read at island view.
   */
  private tugDust: { mesh: THREE.InstancedMesh; p: { x: number; z: number; w: number; v: number }[]; floor: THREE.Vector2[]; wells: THREE.Vector3[]; mouth: number[]; endAt: number } | null = null;
  private stepTugFx(st: DrawState, time: number) {
    const ph = st.sieve?.pull?.phase;
    const on = ph === "tug";
    if (!on && !this.tugDust) return;
    const b = st.shrine.board;
    if (!this.tugDust) {
      const N = this.low ? 120 : 240;
      // A streak, wide at its head (toward the well) and thinning to nothing behind.
      const geo = new THREE.BufferGeometry();
      const hw = this.sieveDressed ? 0.15 : 0.09;
      geo.setAttribute("position", new THREE.Float32BufferAttribute([-hw, 0, 0.5, hw, 0, 0.5, 0, 0, -0.5], 3));
      geo.setIndex([0, 2, 1]);
      const mat = new THREE.MeshBasicMaterial({ color: this.sieveDressed ? "#26364c" : "#eef4fb", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      const floor: THREE.Vector2[] = [];
      for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.tile({ x, y }) === Tile.Floor) floor.push(new THREE.Vector2(this.worldX(b, x), this.worldZ(b, y)));
      const wells = this.wellRings.map((r) => r.getWorldPosition(new THREE.Vector3()));
      const p = Array.from({ length: N }, () => ({ x: 0, z: 0, w: 0, v: 0 }));
      this.tugDust = { mesh, p, floor, wells, mouth: (st.shrine.wells ?? []).map((q) => q.r), endAt: -1 };
      for (const d of p) this.seedDust(d);
    }
    const D = this.tugDust;
    if (!on && D.endAt < 0) D.endAt = time;
    const fade = D.endAt < 0 ? 1 : 1 - (time - D.endAt) / 0.7;
    if (fade <= 0) {
      this.scene.remove(D.mesh);
      D.mesh.dispose();
      this.tugDust = null;
      return;
    }
    const dt = Math.min(0.05, time - (D.mesh.userData.t ?? time));
    D.mesh.userData.t = time;
    (D.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
    D.p.forEach((d, i) => {
      const w = D.wells[d.w]!, R = D.mouth[d.w] ?? 1;
      const dx = w.x - d.x, dz = w.z - d.z, dist = Math.hypot(dx, dz) || 1, out = Math.max(0.05, dist - R);
      // Every streak runs at its own well's mouth, quicker and longer the nearer it gets; slows to nothing once the tug is over.
      const speed = (d.v + 7 / (out + 0.5)) * (D.endAt < 0 ? 1 : fade * 0.3);
      d.x += (dx / dist) * speed * dt;
      d.z += (dz / dist) * speed * dt;
      if (out < 0.15 && D.endAt < 0) this.seedDust(d);
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      sc.set(1.2, 1, Math.min(out + 0.3, 0.9 + Math.min(3.2, speed * 0.32)));
      m.compose(new THREE.Vector3(d.x, 0.06 + (i % 5) * 0.01, d.z), q, sc);
      D.mesh.setMatrixAt(i, m);
    });
    D.mesh.instanceMatrix.needsUpdate = true;
  }
  private seedDust(d: { x: number; z: number; w: number; v: number }) {
    const D = this.tugDust!;
    // Out on the chalk round one of the wells, and drawn to that one.
    for (let tries = 0; tries < 8; tries++) {
      const j = Math.floor(Math.random() * D.wells.length), w = D.wells[j]!, R = D.mouth[j] ?? 1;
      const a = Math.random() * Math.PI * 2, r = R + 1.2 + Math.random() * 6.5;
      d.x = w.x + Math.cos(a) * r;
      d.z = w.z + Math.sin(a) * r;
      d.w = j;
      if (D.floor.some((f) => Math.abs(f.x - d.x) < 0.5 && Math.abs(f.y - d.z) < 0.5)) break;
    }
    d.v = 0.6 + Math.random() * 1.2;
  }
  /** The second take's snap: when it came, a pale streak from each wisp's old spot, and a taut thread from each wisp down its well while everything holds. */
  private snapFx: { at: number; streaks: { m: THREE.Mesh; from: THREE.Vector3; id: number }[]; threads: { line: THREE.Mesh; id: number; well: THREE.Vector3 }[]; endAt: number } | null = null;
  private startSnap(st: DrawState, pull: NonNullable<NonNullable<DrawState["sieve"]>["pull"]>, time: number) {
    this.clearSnap();
    const b = st.shrine.board;
    const wells = this.wellRings.map((r) => r.getWorldPosition(new THREE.Vector3()));
    const streaks = pull.moved.map((m) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.34, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#f4f8ff", transparent: true, opacity: 0.85, depthWrite: false }));
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      return { m: mesh, from: new THREE.Vector3(this.worldX(b, m.x), 0.9, this.worldZ(b, m.y)), id: m.id };
    });
    const threads = st.snap.wisps
      .filter((w) => !w.away)
      .map((w) => {
        const pos = new THREE.Vector3(this.worldX(b, w.x), 0, this.worldZ(b, w.y));
        const i = wells.reduce((best, q, j) => (q.distanceTo(pos) < wells[best]!.distanceTo(pos) ? j : best), 0);
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: "#26405e", transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
        line.renderOrder = 6;
        this.scene.add(line);
        return { line, id: w.id, well: wells[i]!.clone().setY(-2.2) };
      });
    this.snapFx = { at: time, streaks, threads, endAt: -1 };
  }
  private clearSnap() {
    if (!this.snapFx) return;
    for (const s of this.snapFx.streaks) this.scene.remove(s.m);
    for (const t of this.snapFx.threads) this.scene.remove(t.line);
    this.snapFx = null;
  }
  private stepSnap(st: DrawState, time: number) {
    const fx = this.snapFx;
    if (!fx) return;
    const k = time - fx.at;
    if (st.sieve?.pull?.phase !== "hold" && fx.endAt < 0) fx.endAt = time;
    const fade = fx.endAt < 0 ? 1 : 1 - (time - fx.endAt) / 0.8;
    if (fade <= 0 && k > 1.5) return this.clearSnap();
    const place = (m: THREE.Mesh, a: THREE.Vector3, z: THREE.Vector3) => {
      m.position.copy(a).lerp(z, 0.5);
      m.scale.set(1, Math.max(0.001, a.distanceTo(z)), 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), z.clone().sub(a).normalize());
    };
    // The streak: from where it was to where it is, thin at the old spot, fading over a second and a half.
    for (const s of fx.streaks) {
      const rig = this.wisps.get(s.id);
      if (!rig) continue;
      place(s.m, s.from, rig.root.position.clone().setY(Math.max(0.6, rig.root.position.y)));
      (s.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k / 1.5));
      s.m.visible = k < 1.5;
    }
    // The threads: taut, from every wisp down into its well, once it has landed.
    for (const t of fx.threads) {
      const rig = this.wisps.get(t.id);
      if (!rig) continue;
      place(t.line, rig.root.position, t.well);
      (t.line.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, (k - 0.45) / 0.3)) * 0.95 * Math.max(0, fade);
    }
  }
  private lightSieve(sv: NonNullable<DrawState["sieve"]>, time = 0) {
    // Warm morning to a flat grey-white: the sun cools and weakens, the sky's own light makes up the brightness.
    const k = sv.drain ?? 0;
    this.sun.color.set(SIEVE_LIGHT.sun[0]).lerp(SIEVE_COLD.sun, k);
    this.hemi.color.set(SIEVE_LIGHT.sky[0]).lerp(SIEVE_COLD.sky, k);
    // At the snap the chalk dims for a moment.
    const dip = this.snapFx ? Math.max(0, 1 - (time - this.snapFx.at) / 1.1) : 0;
    const dim = 1 - 0.55 * Math.sin(Math.min(1, dip * 3) * Math.PI * 0.5) * dip;
    this.sun.intensity = (SIEVE_LIGHT.sun[1] + (SIEVE_LIGHT.sun[2] - SIEVE_LIGHT.sun[1]) * k) * dim;
    this.hemi.intensity = (SIEVE_LIGHT.sky[1] + (SIEVE_LIGHT.sky[2] - SIEVE_LIGHT.sky[1]) * k) * dim;
  }

  /** Optional run 1, Granny's rematch: the chalk wall by the pool, with the score on it (rematch-dress.ts). */
  private rematchFx: RematchFx | null = null;
  private stepRematch(st: DrawState) {
    const o = st.opt?.id === "o1" ? st.opt : undefined;
    if (!o) {
      this.rematchFx?.dispose();
      this.rematchFx = null;
      return;
    }
    if (!this.rematchFx) this.scene.add((this.rematchFx = new RematchFx()).all);
    this.rematchFx.step(o);
  }

  /** Optional run 2, Lumi's lesson with Kes: the Cove's flats, its tide and its standing stones (cove-dress.ts). The light goes as the run does. */
  private coveFx: CoveFx | null = null;
  private stepCove(st: DrawState, time: number) {
    const o = st.opt?.id === "o2" ? st.opt : undefined;
    if (!o) {
      if (this.coveFx) {
        this.coveFx.dispose();
        this.coveFx = null;
        this.renderer.toneMappingExposure = this.dayLight.exposure;
        this.sun.intensity = this.dayLight.sun;
      }
      return;
    }
    if (!this.coveFx) this.scene.add((this.coveFx = new CoveFx()).all);
    const light = this.coveFx.step(o, time);
    this.renderer.toneMappingExposure = this.dayLight.exposure * light;
    this.sun.intensity = this.dayLight.sun * (0.5 + 0.5 * light);
  }

  /** Optional run 3c, Kes's rematch on the Fell: the wind's course, its streaks and stakes, and the marks by the vanes (kite-dress.ts). */
  private kiteFx: KiteFx | null = null;
  private stepKite(st: DrawState, time: number) {
    const o = st.opt?.id === "o3c" ? st.opt : undefined;
    if (!o) {
      this.kiteFx?.dispose();
      this.kiteFx = null;
      return;
    }
    if (!this.kiteFx) this.scene.add((this.kiteFx = new KiteFx()).all);
    this.kiteFx.step(o, time);
  }

  /** Optional run 3b, Tidepool Steps: the terraces, their kerbs and stairs, the strips' tide and the weirs (tidepool-dress.ts). */
  private tidepoolFx: TidepoolFx | null = null;
  private stepTidepool(st: DrawState, time: number) {
    const o = st.opt?.id === "o3b" ? st.opt : undefined;
    if (!o) {
      this.tidepoolFx?.dispose();
      this.tidepoolFx = null;
      return;
    }
    if (!this.tidepoolFx) this.scene.add((this.tidepoolFx = new TidepoolFx()).all);
    this.tidepoolFx.step(o, time);
  }

  /** Run 9, the rescue: the cloud sea and its wall, the patch, the landing, the boats and the lamps (rescue-dress.ts). */
  private rescueFx: RescueFx | null = null;
  private stepRescue(st: DrawState, time: number) {
    const r = st.rescue;
    if (!r || !st.shrine.landing || st.shrine.deck) {
      if (this.rescueFx) {
        this.rescueFx.dispose();
        this.rescueFx = null;
        for (const rig of this.wisps.values()) rig.root.visible = true;
        for (const rig of this.players.values()) rig.root.visible = rig.lantern.visible = true;
      }
      return;
    }
    if (!this.rescueFx) {
      loadVillagers();
      this.rescueFx = new RescueFx(glowSprite, (n) => models[n], villagerRig);
      this.scene.add(this.rescueFx.all);
    }
    // No fire burns at the slip.
    this.brazierLight.intensity = 0;
    const b = st.shrine.board;
    this.rescueFx.step({ r, t: st.t, time, half: { w: b.width / 2, h: b.height / 2 }, wisps: this.wisps, players: this.players });
  }

  private fightLast = 0;
  /** Part 2, runs 3 and 4: the offspring, her light, the boy's, the shard (offspring-dress.ts, placeholder shapes). */
  private fightFx: OffspringFx | null = null;
  /** The fire the fight put out, so leaving the fight lights that one again and no other. */
  private fightFire: FireParts = null;
  /** Run 4, the dark: how far toward the day's light the yard is (1 day, 0 the dark), eased frame to frame. */
  private fightDay = 1;
  private stepFight(st: DrawState, time: number) {
    const f = st.fight;
    if (!f && this.fightDay < 1) {
      this.fightDay = 1;
      this.hemi.intensity = this.dayLight.hemi;
      this.sun.intensity = this.dayLight.sun;
      this.brazierLight.distance = 30;
    }
    if (!f) {
      if (this.fightFx) {
        this.fightFx.dispose();
        this.fightFx = null;
        if (this.fireParts && this.fireParts === this.fightFire) {
          const p = this.fireParts;
          p.fire.visible = p.embers.visible = p.glow.visible = p.pillar.visible = true;
          p.fire.scale.setScalar(1);
        }
      }
      return;
    }
    if (!this.fightFx) {
      this.fightFx = new OffspringFx(glowSprite);
      this.scene.add(this.fightFx.all);
    }
    // The brazier is dead: it gives light only for what has been banked in it, and with none no fire shows.
    // In the hunt, while it sits on the fire, the fire is smothered: no flame, a low glow.
    this.brazierLight.intensity = f.banked * (f.shut ? 1 : 6);
    this.fightFire = this.fireParts;
    if (this.fireParts) {
      const p = this.fireParts, k = Math.min(1, f.banked / 4), on = f.banked > 0;
      p.fire.visible = p.glow.visible = on && !f.shut;
      p.embers.visible = on;
      p.pillar.visible = false;
      if (on) p.fire.scale.set(0.4 + 0.6 * k, 0.2 + 0.8 * k, 0.4 + 0.6 * k);
    }
    // The dark (OFFSPRING.dark): the yard's own light down to a faint moon, so the walls and carts still
    // read; her wind-up, her hold and the kill fill it again. The fire lights only its own pool.
    const D = FIGHT_DARK, want = f.dark ? (f.dark.flood ? D.flood : 0) : 1, dk = Math.min(1, D.ease * Math.max(0, time - this.fightLast));
    this.fightLast = time;
    if (f.dark || this.fightDay < 1) {
      this.fightDay += (want - this.fightDay) * dk;
      this.hemi.intensity = this.dayLight.hemi * (D.hemi + (1 - D.hemi) * this.fightDay);
      this.sun.intensity = this.dayLight.sun * (D.sun + (1 - D.sun) * this.fightDay);
      const fire = f.dark?.pools.find((p) => p.k === "fire");
      this.brazierLight.distance = f.dark && !f.dark.flood ? (fire ? fire.r * 1.7 : 0.01) : 30;
    }
    const b = st.shrine.board;
    this.fightFx.step({ f, t: st.t, time, half: { w: b.width / 2, h: b.height / 2 }, rook: this.players.get(st.me)?.root ?? null });
  }

  /** Part 2, the camp walk: its lamps, the cooking fire, the nightshades; the brazier is cold. */
  private campFx: CampFx | null = null;
  private stepCamp(st: DrawState, time: number) {
    const c = st.camp;
    if (!c) {
      if (this.campFx) {
        this.campFx.dispose();
        this.campFx = null;
        if (this.fireParts) {
          const p = this.fireParts;
          p.fire.visible = p.embers.visible = p.glow.visible = p.pillar.visible = true;
        }
      }
      return;
    }
    if (!this.campFx) {
      this.campFx = new CampFx(glowSprite);
      this.scene.add(this.campFx.all);
    }
    // The cold brazier: no fire, no light of its own.
    this.brazierLight.intensity = 0;
    if (this.fireParts) {
      const p = this.fireParts;
      p.fire.visible = p.embers.visible = p.glow.visible = p.pillar.visible = false;
    }
    // The boy carries no lamp in the camp either.
    for (const rig of this.players.values()) if (rig.cast === "fen") rig.lantern.visible = false;
    const b = st.shrine.board, half = { w: b.width / 2, h: b.height / 2 };
    this.campFx.step({ c, time, half, camAt: { x: (st.camAt?.x ?? half.w) - half.w, z: (st.camAt?.y ?? half.h) - half.h } });
  }

  /** Run 10, the ship home: the cloud sea, the patch ahead, the hull and its lamp, the hooded figure, home at the end (ship-dress.ts), and the light going from night to grey. */
  private shipFx: ShipFx | null = null;
  private stepShip(st: DrawState, time: number) {
    const r = st.ship;
    if (!r || !st.shrine.deck) {
      if (this.shipFx) {
        this.shipFx.dispose();
        this.shipFx = null;
        this.distant.visible = true;
        this.applyTheme(themeFor(st.shrine.id));
      }
      return;
    }
    if (!this.shipFx) {
      loadFerryman();
      this.shipFx = new ShipFx(glowSprite, (n) => models[n], (n) => castBody(n));
      this.scene.add(this.shipFx.all);
      this.distant.visible = false;
    }
    this.brazierLight.intensity = 0;
    const c = st.shrine.board.center, mine = st.snap.players.find((p) => p.id === st.me);
    const at = new Map(st.snap.wisps.map((w) => [w.id, { x: w.x - c.x, y: w.y - c.y, held: mine?.beam === w.id, away: !!w.away }]));
    this.shipFx.step({ r, t: st.t, time, players: this.players, wisps: this.wisps, at });
    // The second clock, which nobody has to read: night to first light.
    const L = SHIP_LOOK, k = r.light, mix = (a: number, b: number) => a + (b - a) * k;
    this.hemi.color.set(L.hemi[0][0]).lerp(TMP_COLOR.set(L.hemi[1][0]), k);
    this.hemi.intensity = mix(L.hemi[0][1], L.hemi[1][1]);
    this.sun.color.set(L.sun[0][0]).lerp(TMP_COLOR.set(L.sun[1][0]), k);
    this.sun.intensity = mix(L.sun[0][1], L.sun[1][1]);
    this.renderer.toneMappingExposure = mix(L.exposure[0], L.exposure[1]);
    (this.scene.background as THREE.Color).copy(this.shipFx.sea);
    (this.scene.fog as THREE.FogExp2).color.copy(this.shipFx.sea);
    // The eye looks down at the cloud: no stars, and no moon.
    this.skyU.uStars.value = 0;
  }

  /** Run 8: wisps that have just fallen away, watched going: down into the chalk, or down a well getting smaller. */
  private fallFx: { key: string; s: THREE.Sprite; x: number; z: number; well: boolean; at: number }[] = [];
  /** Falls already shown, so one is watched going once however long the room holds on that tick. */
  private fallSeen = new Set<string>();
  private fallTick = -1;
  private stepFalls(st: DrawState, time: number) {
    const b = st.shrine.board;
    // The clock has gone back: a new round, and its falls are new.
    if (st.snap.tick < this.fallTick) this.fallSeen.clear();
    this.fallTick = st.snap.tick;
    for (const f of st.snap.falls ?? []) {
      const key = `${f.tick}:${f.wisp}`;
      if (this.fallSeen.has(key)) continue;
      this.fallSeen.add(key);
      const s = glowSprite("#ffb53a", 1.2, 0.5);
      s.material.blending = THREE.NormalBlending;
      s.material.color.set("#f29a1c");
      // Seen through the ground as it goes: there is nothing to hide it down a well.
      s.material.depthTest = !f.well;
      s.renderOrder = 2;
      this.scene.add(s);
      this.fallFx.push({ key, s, x: this.worldX(b, f.x), z: this.worldZ(b, f.y), well: f.well, at: time });
    }
    this.fallFx = this.fallFx.filter((q) => {
      const k = (time - q.at) / (q.well ? FALL.wellSec : FALL.groundSec);
      if (k >= 1 || k < 0) return this.scene.remove(q.s), false;
      // No flare either way: it only dims.
      if (q.well) {
        q.s.position.set(q.x, FALL.low - FALL.wellDrop * k * k, q.z + 0.6 * k);
        q.s.scale.setScalar(1.2 * (1 - 0.8 * k));
        q.s.material.opacity = 0.95 * (1 - k * k * k);
      } else {
        q.s.position.set(q.x, FALL.low - 0.5 * k, q.z);
        q.s.scale.setScalar(1.2 * (1 - 0.5 * k));
        q.s.material.opacity = 0.8 * (1 - k);
      }
      return true;
    });
  }

  /** The theme's own light levels, which the dying brazier turns down and gives back. */
  private dayLight = { hemi: 1, sun: 1, exposure: 1 };
  /** The island's own glowing things (lanterns, blossom) and how bright each is by rights, so the dark can turn them down. */
  private glowBase = new Map<THREE.MeshStandardMaterial, number>();
  private glowFor: THREE.Object3D | null = null;
  private dimGlows(share: number) {
    const first = this.shrineGroup.children[0] ?? null;
    if (this.glowFor !== first) {
      this.glowFor = first;
      const skip = new Set<THREE.Material>();
      for (const o of this.fireParts ? [this.fireParts.fire, this.fireParts.embers, this.fireParts.pillar] : [])
        o.traverse((m) => m instanceof THREE.Mesh && skip.add(m.material as THREE.Material));
      this.shrineGroup.traverse((m) => {
        const mat = m instanceof THREE.Mesh ? m.material : null;
        if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveIntensity > 0.05 && !skip.has(mat) && !this.glowBase.has(mat)) this.glowBase.set(mat, mat.emissiveIntensity);
      });
    }
    for (const [mat, base] of this.glowBase) mat.emissiveIntensity = base * share;
  }
  /**
   * Runs 6 and 7, the night the island goes down. Three tones: firelight, dark ground, and pale
   * cloud coming in from the rim in steps, each with a lurch of the ground. The village is small
   * figures with lamps, who back in toward the fire ahead of the cloud. At the bottom the cloud is
   * over everything and it is all lit orange from above. After the stills the cloud is thrown back
   * to a wall at the rim, which drops with every bank as the island lifts, and the crowd are the
   * meter: more of them raise their lamps and jump with each lift.
   */
  private dyingFx: {
    all: THREE.Object3D[]; ground: THREE.Mesh; veil: THREE.Mesh; wall: THREE.Mesh;
    u: Record<"uLit" | "uDark" | "uCloud" | "uCloudA" | "uVeil" | "uTime", { value: number }> & { uTint: { value: THREE.Color } };
    crowd: { root: THREE.Group; lamp: THREE.Sprite; x: number; z: number; anim?: CastAnim; kid?: CastAnim; real: boolean }[];
    terrace: THREE.Group; house: THREE.Group;
    dust: THREE.Sprite[]; burst: THREE.PointLight; ember: THREE.Sprite;
    part: string; partAt: number; struckAt: number; lit: number; flame: number; cloud: number; wallH: number; lurch: number; lurchAt: number; lurchUp: boolean; up: number; orangeAt: number; dusk: number; duskAt: number;
  } | null = null;
  /** Where one of the crowd is standing now (tile coordinates), for a bubble over them. */
  crowdAt(who: string): { x: number; y: number } | null {
    const fx = this.dyingFx, b = this.dyingBoard;
    const i = DYING.crowd.findIndex((m) => m.who.toLowerCase() === who || m.carries === who);
    if (!fx || !b || i < 0 || Number.isNaN(fx.crowd[i]!.x)) return null;
    return { x: fx.crowd[i]!.x - this.worldX(b, 0), y: fx.crowd[i]!.z - this.worldZ(b, 0) };
  }
  private dyingBoard: Board | null = null;
  private crowdBody(i: number): { body: THREE.Object3D; real: boolean } {
    const m = DYING.crowd[i]!;
    const cast = m.cast && models[m.cast] ? castBody(m.cast) : null;
    if (cast) return { body: cast, real: true };
    if (m.cast && !models[m.cast]) loadCrowd();
    // No model of their own yet: the plain lamplighter figure, a little different in height from the next.
    const plain = models[i % 2 ? "dawn" : "dusk"];
    if (plain) {
      const body = plain.clone();
      body.scale.multiplyScalar(1.8 * (0.88 + (i % 3) * 0.06));
      return { body, real: !m.cast };
    }
    const body = new THREE.Group();
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 10), new THREE.MeshStandardMaterial({ color: "#4a4660", roughness: 0.8 }));
    robe.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: "#8a6a52" }));
    head.position.y = 1.25;
    body.add(robe, head);
    return { body, real: false };
  }
  private dressCrowd() {
    const fx = this.dyingFx!;
    fx.crowd.forEach((f, i) => {
      if (f.real) return;
      const { body, real } = this.crowdBody(i);
      if (!real && f.root.children.length > 1) return;
      for (const c of [...f.root.children]) if (c !== f.lamp) f.root.remove(c);
      f.root.add(body);
      f.real = real;
      f.anim = body.userData.anim as CastAnim | undefined;
      const carried = DYING.crowd[i]!.carries;
      const kid = carried && models[carried] ? castBody(carried) : null;
      if (kid) {
        // On his shoulders.
        kid.position.y = 1.45;
        kid.scale.multiplyScalar(0.9);
        f.root.add(kid);
        f.kid = kid.userData.anim as CastAnim | undefined;
      }
    });
  }
  /**
   * Hesta's terrace (runs 6 and 7): past the north edge of the Kindling ground and above it, with
   * the steps up to it (drawn only; nobody walks them but Lumi at the end) and her house, of which
   * the island view shows the lower half. The village watch from here. Centred on the brazier.
   */
  private makeTerrace(): { terrace: THREE.Group; house: THREE.Group } {
    const T = DYING.terrace, th = this.theme;
    const g = new THREE.Group();
    const std = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
    // Turf like the island's, greyed: it is night, and nobody is looking at the grass.
    const rock = std(th.rock), turf = std("#" + new THREE.Color(th.grass).lerp(new THREE.Color("#3c3a48"), 0.5).getHexString()), stone = std("#8d867c");
    // The terrace: a bank of rock with turf on top, straight along the edge they stand at and rounded behind, dropping to the field at its south face.
    const sh = new THREE.Shape(), r = 2.2, w = T.half, dp = T.depth;
    sh.moveTo(-w + r, 0);
    sh.lineTo(w - r, 0);
    sh.quadraticCurveTo(w, 0, w, r);
    sh.lineTo(w, dp * 0.45);
    sh.quadraticCurveTo(w, dp, w * 0.45, dp);
    sh.lineTo(-w * 0.45, dp);
    sh.quadraticCurveTo(-w, dp, -w, dp * 0.45);
    sh.lineTo(-w, r);
    sh.quadraticCurveTo(-w, 0, -w + r, 0);
    const deep = T.top + 6;
    const bank = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: deep, bevelEnabled: false, curveSegments: 10 }).rotateX(-Math.PI / 2), [turf, rock]);
    bank.position.set(0, T.top - deep, -T.front);
    // A stone kerb along the edge they stand at, broken at the head of the steps.
    for (const side of [-1, 1]) {
      const len = T.half - T.stepsHalf - 0.2;
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 0.35), stone);
      kerb.position.set(side * (T.stepsHalf + 0.2 + len / 2), T.top + 0.12, -(T.front + 0.18));
      g.add(kerb);
    }
    // The steps, from the field's edge up to the terrace, between two low side walls.
    const run = (T.front - T.stepsFrom) / T.steps, rise = T.top / T.steps;
    for (let i = 0; i < T.steps; i++) {
      const h = rise * (i + 1);
      const step = new THREE.Mesh(new THREE.BoxGeometry(T.stepsHalf * 2, h, run + 0.02), stone);
      step.position.set(0, h / 2, -(T.stepsFrom + run * (i + 0.5)));
      g.add(step);
    }
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.4, T.top + 0.35, T.front - T.stepsFrom), rock);
      cheek.position.set(side * (T.stepsHalf + 0.2), (T.top + 0.35) / 2 - 0.02, -(T.stepsFrom + (T.front - T.stepsFrom) / 2));
      // Sloped with the steps: lower at the field end.
      cheek.geometry.translate(0, 0, 0);
      const pos = cheek.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) if (pos.getY(k) > 0 && pos.getZ(k) > 0) pos.setY(k, pos.getY(k) - T.top);
      cheek.geometry.computeVertexNormals();
      g.add(cheek);
    }
    // A flagged path from the head of the steps round her house (her door is on the far side).
    const path = new THREE.Mesh(new THREE.BoxGeometry(T.stepsHalf * 2, 0.04, T.house - 3.5), stone);
    path.position.set(0, T.top + 0.03, -(T.front + (T.house - 3.5) / 2));
    g.add(bank, path);
    // Her house: grey stone and a dark roof until the drawn one loads, its back to the field.
    const house = new THREE.Group();
    const block = makeHouse(7, 7, { wall: "#b8b2a6", roof: "#6a6474" });
    house.add(block);
    house.position.set(0, T.top, -(T.front + T.house));
    house.rotation.y = Math.PI;
    g.add(house);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    // Her windows and their lamps: warm light on the people and on her wall, so they read in the dark.
    for (const sx of [-1, 1]) {
      const glow = new THREE.PointLight("#ffc98a", 26, 16, 1.6);
      glow.position.set(sx * 4.6, T.top + 2.6, -(T.front + 1.6));
      g.add(glow);
    }
    return { terrace: g, house };
  }
  /** Whatever the island grew where the terrace and its steps now are (rim trees, posts) is put away, once for each time the island is built. */
  private clearTerraceGround(terrace: THREE.Group) {
    const first = this.shrineGroup.children[0], n = this.shrineGroup.children.length;
    if (this.shrineGroup.userData.terraceFor === first && this.shrineGroup.userData.terraceN === n) return;
    this.shrineGroup.userData.terraceFor = first;
    this.shrineGroup.userData.terraceN = n;
    const T = DYING.terrace, at = new THREE.Vector3();
    const walk = (o: THREE.Object3D, depth: number) => {
      for (const c of o.children) {
        c.getWorldPosition(at);
        const x = at.x - terrace.position.x, north = terrace.position.z - at.z;
        const big = (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).geometry.boundingSphere?.radius ?? 0) > 12;
        if (!big && north > T.stepsFrom - 0.6 && Math.abs(x) < (north > T.front - 1.2 ? T.half + 1 : T.stepsHalf + 1.6)) c.visible = false;
        else if (depth < 1 && c.children.length && !(c as THREE.Mesh).isMesh) walk(c, depth + 1);
      }
    };
    walk(this.shrineGroup, 0);
  }
  private stepDying(st: DrawState, time: number) {
    const d = st.dying, flame = st.snap.flame;
    if (!d || flame === undefined) {
      if (this.dyingFx) {
        this.scene.remove(...this.dyingFx.all);
        this.dyingFx = null;
        this.hemi.intensity = this.dayLight.hemi;
        this.sun.intensity = this.dayLight.sun;
        this.renderer.toneMappingExposure = this.dayLight.exposure;
        this.skyU.uStars.value = this.theme.sky.stars;
        this.dimGlows(1);
        if (this.fireParts) {
          const f = this.fireParts;
          f.fire.scale.setScalar(1);
          f.embers.visible = f.pillar.visible = true;
          f.glow.scale.setScalar(2.6);
          f.glow.material.opacity = 0.3;
        }
      }
      return;
    }
    const b = (this.dyingBoard = st.shrine.board);
    const cx = this.worldX(b, b.center.x), cz = this.worldZ(b, b.center.y);
    const after = d.part !== "six" && d.part !== "bottom" && d.part !== "stills";
    if (!this.dyingFx) {
      const u = { uLit: { value: 9 }, uDark: { value: 0.5 }, uCloud: { value: DYING.cloud.start as number }, uCloudA: { value: 0.94 }, uVeil: { value: 0 }, uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } };
      const plane = new THREE.PlaneGeometry(160, 160);
      plane.rotateX(-Math.PI / 2);
      const ground = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: NIGHT_CLOUD_FS, uniforms: u, transparent: true, depthWrite: false }));
      ground.renderOrder = 3;
      // The veil: the same cloud, knee deep, so whatever stands in it is half gone.
      const veil = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: NIGHT_CLOUD_FS, uniforms: { ...u, uVeil: { value: 1 } }, transparent: true, depthWrite: false }));
      veil.renderOrder = 5;
      // Run 7: the cloud's face at the rim, standing as a wall.
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(CLOUD_WALL.at, CLOUD_WALL.at + 0.8, 1, 72, 1, true), new THREE.MeshBasicMaterial({ color: "#aab4cc", transparent: true, opacity: 0.86, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      wall.renderOrder = 5;
      const crowd = DYING.crowd.map((m) => {
        const root = new THREE.Group();
        const lamp = glowSprite(m.c, m.s * CROWD_LAMP, 0.9);
        lamp.material.fog = false;
        lamp.position.set(0.38, 1.0, 0.1);
        // Drawn over the cloud's veil: a lamp is what is seen of someone standing in it.
        lamp.renderOrder = 6;
        root.add(lamp);
        return { root, lamp, x: NaN, z: NaN, real: false };
      });
      const dust = Array.from({ length: 16 }, () => glowSprite("#8a7a70", 3, 0));
      for (const s of dust) (s.material.blending = THREE.NormalBlending), s.material.color.set("#6a5c54"), (s.renderOrder = 6);
      const burst = new THREE.PointLight("#ff9a4a", 0, 120, 1.1);
      // The crater's own warmth, so the glass shows where the fire's light doesn't reach yet.
      const ember = glowSprite("#ff6a1a", 1, 0);
      ember.renderOrder = 4;
      const { terrace, house } = this.makeTerrace();
      terrace.position.set(cx, 0, cz);
      const all = [ground, veil, wall, terrace, ...crowd.map((f) => f.root), ...dust, burst, ember];
      this.scene.add(...all);
      this.dyingFx = { all, ground, veil, wall, u, crowd, terrace, house, dust, burst, ember, part: d.part, partAt: time, struckAt: after ? time - 9 : -99, lit: st.snap.lit ?? 9, flame, cloud: d.cloud ?? CLOUD_WALL.at, wallH: after ? CLOUD_WALL.high : 0, lurch: d.lurch ?? 0, lurchAt: -9, lurchUp: false, up: 0, orangeAt: -1, dusk: 0, duskAt: -1 };
    }
    const fx = this.dyingFx;
    this.dressCrowd();
    // Her house: the drawn one in place of the block-out once it has loaded.
    if (!fx.house.userData.filled && models["hesta-house"]) {
      fx.house.clear();
      fx.house.add(models["hesta-house"]!.clone());
      fx.house.userData.filled = true;
    }
    this.clearTerraceGround(fx.terrace);
    if (fx.part !== d.part) {
      if (d.part === "seven") fx.struckAt = time;
      fx.part = d.part;
      fx.partAt = time;
    }
    if ((d.lurch ?? 0) !== fx.lurch) {
      fx.lurchUp = after;
      fx.lurch = d.lurch ?? 0;
      fx.lurchAt = time;
    }
    // The ground lurches: the eye dips (or, in run 7, rises) and shakes for half a second.
    const lk = (time - fx.lurchAt) / LURCH.sec;
    if (lk >= 0 && lk < 1) {
      const cam = this.cam.three, env = Math.sin(Math.PI * lk) * (1 - lk * 0.5);
      cam.position.y += (fx.lurchUp ? LURCH.rise : -LURCH.dip) * env;
      cam.position.x += Math.sin(time * 71) * LURCH.shake * (1 - lk);
      cam.position.z += Math.sin(time * 53 + 1) * LURCH.shake * 0.6 * (1 - lk);
      cam.rotation.z += Math.sin(time * 37) * 0.012 * (1 - lk) * (fx.lurchUp ? 0.5 : 1);
      cam.updateMatrixWorld();
    }
    // The flame eases, so the fire breathes. The cloud does not: it comes in a step at a time, quickly.
    fx.lit += ((st.snap.lit ?? 0) - fx.lit) * 0.08;
    fx.flame += (flame - fx.flame) * 0.08;
    const k = fx.flame / 100;
    const since = time - fx.struckAt;
    const closed = d.part === "bottom" || d.part === "stills";
    const lift = Math.min(1, (d.lift ?? 0) / DYING.seven.cloudGone);
    const share = Math.min(1, (d.lift ?? 0) / Math.max(1, d.lifts ?? 9));
    // After the stills the cloud is thrown outward off the ground in one ring, to a wall at the rim.
    // At the bottom it closes over Rook too: only the embers and the lamps show through.
    const cloudTo = after ? CLOUD_WALL.at : d.blind ? 1.5 : (d.cloud ?? DYING.cloud.start) + (closed ? 0 : CLOUD_DRAW.out);
    fx.cloud += (cloudTo - fx.cloud) * (after ? 0.12 : 0.2);
    // The wall drops a step with each lift, and is gone, with the cloud round the island, after the sixth.
    fx.wallH += ((after ? CLOUD_WALL.high * (1 - lift) : 0) - fx.wallH) * 0.1;
    if (!d.orange) fx.orangeAt = -1;
    else if (fx.orangeAt < 0) fx.orangeAt = time;
    const orange = d.orange ? Math.min(1, (time - fx.orangeAt) / 0.5) : 0;
    fx.ground.position.set(cx, 0.07, cz);
    fx.veil.position.set(cx, after ? Math.max(0.05, fx.wallH) : closed ? 1.25 : 0.85, cz);
    fx.veil.visible = !after || fx.wallH > 0.08;
    fx.u.uTime.value = time;
    fx.u.uCloud.value = fx.cloud;
    fx.u.uCloudA.value = after ? 0.94 * Math.min(1, fx.wallH / 0.6) : 0.94;
    const pale = after ? 1 : CLOUD_DRAW.dull + (1 - CLOUD_DRAW.dull) * Math.min(1, Math.max(0, 1 - (fx.flame - 10) / (DYING.six.flame - 10)));
    // While the comet comes down on the map, the cloud goes dusky round it so its own light shows.
    if (d.comet === undefined) (fx.dusk = 0), (fx.duskAt = -1);
    else fx.dusk = Math.min(1, (time - (fx.duskAt < 0 ? (fx.duskAt = time) : fx.duskAt)) / 0.6);
    fx.u.uTint.value.setRGB(pale, pale, pale).lerp(new THREE.Color(1.25, 0.72, 0.36), orange).lerp(new THREE.Color(0.22, 0.1, 0.1), fx.dusk);
    // The firelight is the warm tone; the ground past it is dark, but lifted enough to read. The cloud hides things, not the dark.
    fx.u.uLit.value = Math.min(fx.lit, fx.cloud - 2) + (after ? share * 20 : 0);
    fx.u.uDark.value = 0.62 * (1 - share) * (1 - orange * 0.5 * (1 - fx.dusk));
    fx.wall.visible = after && fx.wallH > 0.08;
    fx.wall.position.set(cx, fx.wallH / 2, cz);
    fx.wall.scale.set(1, Math.max(0.01, fx.wallH), 1);
    (fx.wall.material as THREE.MeshBasicMaterial).opacity = 0.86 * Math.min(1, fx.wallH / 0.6);
    // Everything off the ground: night, lifted so the board can be read, and its own light coming back as the island lifts.
    const up = Math.max(0.42 + 0.2 * k, share, orange * 0.7) * (1 - fx.dusk * 0.7);
    this.hemi.intensity = this.dayLight.hemi * up;
    this.sun.intensity = this.dayLight.sun * (0.3 + 0.7 * share);
    this.renderer.toneMappingExposure = this.dayLight.exposure * (0.85 + 0.15 * share) * (1 - fx.dusk * 0.45);
    this.dimGlows(0.4 + 0.6 * share);
    // Under the cloud there are no stars. They come out when the wall is gone.
    this.skyU.uStars.value = this.theme.sky.stars * (after ? Math.max(0.15, 1 - fx.wallH / CLOUD_WALL.high) : 0.15);
    // The fire shows the flame: its height and its brightness. No bar, no number.
    if (this.fireParts) {
      const f = this.fireParts;
      f.fire.scale.set(0.35 + 0.75 * k, 0.12 + 1.15 * k, 0.35 + 0.75 * k);
      f.embers.visible = k > 0.05;
      f.pillar.visible = k > 0.97;
      f.glow.scale.setScalar(0.8 + 3.4 * k);
      f.glow.material.opacity = 0.12 + 0.4 * k;
    }
    const flick = Math.sin(time * 9) * 0.1 + Math.sin(time * 23) * 0.07;
    this.brazierLight.intensity = (4 + 60 * k) * (1 + flick);
    this.brazierLight.distance = Math.max(6, fx.lit * 2.4 + 3);
    // Lit from above, every figure and the fog: something is coming down.
    const sx = this.worldX(b, d.strike.x), sz = this.worldZ(b, d.strike.y);
    fx.burst.position.set(sx + 2, 16 - 6 * orange, sz - 6);
    fx.burst.intensity = orange > 0 ? 500 * orange : since >= 0 && since < 1.6 ? 300 * (1 - since / 1.6) : 0;
    this.stepComet(d, sx, sz, time, fx.burst);
    // The strike on the map: the ground jolts.
    if (d.part === "seven" && fx.struckAt === time && this.cometFx) (fx.lurchAt = time), (fx.lurchUp = false);
    // The village, never on the field (Ladi): up on Hesta's terrace by her house all through, looking down; the meter in run 7; at the end only Lumi comes down the steps, to her father.
    const rook = st.snap.players.find((p) => p.id === st.me);
    const n = DYING.crowd.length;
    fx.up += (share - fx.up) * 0.05;
    fx.crowd.forEach((f, i) => {
      const m = DYING.crowd[i]!;
      let to = crowdSpot(b, i);
      const ox = this.worldX(b, 0), oz = this.worldZ(b, 0);
      if (d.part === "after" && m.who === "Lumi" && rook) {
        // Along the terrace to the head of the steps, down them, and out to him.
        const T = DYING.terrace, mid = b.center.x + 0.5, north = Number.isNaN(f.z) ? 99 : b.center.y + 0.5 - (f.z - oz);
        const onSteps = Math.abs(f.x - ox - mid) < T.stepsHalf - 0.3;
        to = north > T.front - 0.2 && !onSteps ? { x: mid, y: b.center.y + 0.5 - T.front - 0.4 } : north > T.stepsFrom ? { x: mid, y: b.center.y + 0.5 - T.stepsFrom + 0.3 } : { x: rook.x + 1.4, y: rook.y + 0.6 };
      }
      const tx = ox + to.x, tz = oz + to.y;
      if (Number.isNaN(f.x)) (f.x = tx), (f.z = tz);
      const dx = tx - f.x, dz = tz - f.z, far = Math.hypot(dx, dz);
      // They walk, they do not slide: a steady pace, quicker when the cloud jumps.
      const pace = Math.min(far, d.part === "after" ? 0.085 : 0.02 + far * 0.03);
      if (far > 0.001) (f.x += (dx / far) * pace), (f.z += (dz / far) * pace);
      // Raised lamps and jumping spread through the crowd with each lift, a few at a time.
      const order = (i * 5) % n, cheer = Math.max(0, Math.min(1, fx.up * n - order));
      const hop = cheer * Math.abs(Math.sin(time * (5.5 + (i % 3)) + i * 1.3)) * 0.32;
      f.root.position.set(f.x, terraceHeight(b, f.x - ox, f.z - oz) + hop, f.z);
      f.root.visible = !!d.crowd;
      f.lamp.position.y = 1.0 + cheer * (1.15 + 0.12 * Math.sin(time * 7 + i));
      f.lamp.material.opacity = Math.min(1, (m.who === "Lumi" ? 1 : 0.75 + 0.1 * Math.sin(time * 0.9 + i * 1.7)) + cheer * 0.2);
      f.lamp.scale.setScalar(m.s * CROWD_LAMP * (1 + cheer * 0.35));
      // In run 6 they face the fire and him. After, they face her; walking in at the end, the way they are going.
      const face = after ? (far > 0.3 && d.part === "after" ? Math.atan2(dx, dz) : Math.atan2(sx - f.x, sz - f.z)) : Math.atan2(cx - f.x, cz - f.z);
      f.root.rotation.y = lerpAngle(f.root.rotation.y, face, 0.08);
      if (f.anim) (f.anim.set(far > 0.15 ? "walk" : "idle"), f.anim.update(time));
      if (f.kid) (f.kid.set("idle"), f.kid.update(time));
    });
    fx.ember.visible = after;
    fx.ember.position.set(sx, 0.5, sz);
    fx.ember.scale.setScalar(d.strike.r * 3.2);
    fx.ember.material.opacity = after ? (0.24 + 0.05 * Math.sin(time * 1.7)) * (1 - share * 0.6) : 0;
    // The crater smokes: dust rolling out from the strike and thinning.
    fx.dust.forEach((s, i) => {
      const t = since / 4.2;
      s.visible = t >= 0 && t < 1;
      if (!s.visible) return;
      const a = (i / fx.dust.length) * Math.PI * 2 + i * 0.7, r = (1.5 + (i % 4) * 0.9) + t * (3 + (i % 3) * 1.6);
      s.position.set(sx + Math.cos(a) * r, 0.8 + t * (1 + (i % 5) * 0.5), sz + Math.sin(a) * r);
      s.material.opacity = 0.55 * (1 - t) * Math.min(1, t * 8 + 0.4);
      s.scale.setScalar(2.4 + t * 4.5);
    });
  }

  /**
   * Run 6's comet, seen on the map between the pictures (Ladi, 24 Nov): a white-hot head in an
   * orange glow with a long tail, coming down out of the sky onto the terrace, faster and brighter
   * all the way, lighting everything; a hot spot grows on the ground under it. At the strike, a
   * ring of light runs out over the ground and fades (her picture comes up over it).
   */
  private cometFx: { all: THREE.Object3D[]; head: THREE.Sprite; glow: THREE.Sprite; core: THREE.Mesh; tail: THREE.Mesh[]; spot: THREE.Sprite; ring: THREE.Mesh; at: number; hitAt: number; from?: THREE.Vector3 } | null = null;
  private stepComet(d: NonNullable<DrawState["dying"]>, sx: number, sz: number, time: number, light: THREE.PointLight) {
    if (d.comet === undefined && !this.cometFx) return;
    if (!this.cometFx) {
      const head = glowSprite("#fff1d0", 2.4, 1), glow = glowSprite("#ff5a10", 6, 0.85), spot = glowSprite("#ff7a20", 1, 0);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: "#fffaf0", fog: false, toneMapped: false }));
      const tail = [
        [0.0, 0.45, "#ffd890", 0.85],
        [0.0, 1.3, "#ff5a10", 0.4],
      ].map(([r0, r1, c, o]) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r0 as number, r1 as number, 1, 12, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: c as string, transparent: true, opacity: o as number, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        m.renderOrder = 8;
        return m;
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      for (const o of [head, glow, spot]) (o.renderOrder = 9), (o.material.fog = false);
      // It is above the cloud until the last moment: drawn over it.
      for (const o of [head, glow, core, ...tail]) (o.material as THREE.Material).depthTest = false;
      core.renderOrder = 10;
      const all = [head, glow, core, ...tail, spot, ring];
      this.scene.add(...all);
      this.cometFx = { all, head, glow, core, tail, spot, ring, at: time, hitAt: -1 };
    }
    const C = this.cometFx;
    const sec = (DYING.landingShow.comet * TICK_MS) / 1000;
    const k = d.comet !== undefined ? Math.min(1, (time - C.at) / sec) : 1;
    if (d.comet === undefined && C.hitAt < 0) C.hitAt = time;
    // Down out of the north-west sky, a little toward the eye, onto the terrace; quicker as it comes.
    // It comes in at the top left of the screen, high up, whatever the eye's framing.
    if (!C.from) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(-0.82, 0.95), this.cam.three);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -13), new THREE.Vector3());
      C.from = hit ?? new THREE.Vector3(sx - 19, 21, sz - 15);
    }
    const from = C.from, to = new THREE.Vector3(sx, 0.6, sz);
    const e = k * k * (0.35 + 0.65 * k);
    const pos = from.clone().lerp(to, e), dir = to.clone().sub(from).normalize();
    const falling = C.hitAt < 0;
    for (const o of [C.head, C.glow, C.core, ...C.tail]) o.visible = falling;
    if (falling) {
      C.head.position.copy(pos);
      C.glow.position.copy(pos);
      C.core.position.copy(pos);
      C.head.scale.setScalar(2.4 + 1.8 * k + Math.sin(time * 40) * 0.2);
      C.glow.scale.setScalar(6 + 6 * k);
      // The tail streams back up the way it came, longer as it speeds up.
      C.tail.forEach((m, i) => {
        m.position.copy(pos);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        m.scale.set(1 + 0.3 * k, (i ? 16 : 11) * (0.5 + 0.8 * k), 1 + 0.3 * k);
        m.rotation.y += 0;
      });
      light.position.copy(pos);
      light.intensity = 120 + 900 * k * k;
      light.color.set("#ffb070");
    }
    // The hot spot on the ground under it, growing as it comes.
    C.spot.position.set(sx, 0.3, sz);
    C.spot.visible = true;
    const after = falling ? 0 : time - C.hitAt;
    C.spot.scale.setScalar(falling ? 2 + 8 * e : 10 + after * 6);
    C.spot.material.opacity = falling ? 0.25 + 0.75 * e : Math.max(0, 1 - after / 1.5);
    // The strike: a ring of light runs out across the ground.
    C.ring.visible = !falling && after < 1.6;
    if (C.ring.visible) {
      C.ring.position.set(sx, 0.25, sz);
      C.ring.scale.setScalar(1 + after * 16);
      (C.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - after / 1.6);
      light.position.set(sx, 3, sz);
      light.intensity = 3000 * Math.max(0, 1 - after / 1.2);
    }
    if (!falling && after > 2.5) {
      this.scene.remove(...C.all);
      this.cometFx = null;
    }
  }

  /** The moored skiff: what it hangs from, its rope and the shade under it. */
  private moored: { slot: THREE.Group; y: number; post: THREE.Vector3; bow: THREE.Vector3; rope: THREE.Mesh[]; shade: THREE.Mesh; flame?: [THREE.Sprite, THREE.Sprite] } | null = null;
  private landingPost: THREE.Vector3 | null = null;
  /**
   * Moors a skiff (Ladi): a slack rope from its bow to a post, a faint soft shade below it, and
   * a slow bob, so it reads as a boat riding the air and not one stuck in the sky. The bow is
   * the lantern on its bowsprit, where the maps thread's sky skiff ties off.
   */
  private moor(slot: THREE.Group, post: THREE.Vector3) {
    const mat = new THREE.MeshStandardMaterial({ color: "#8a6a3c", roughness: 1 });
    const geo = new THREE.CylinderGeometry(0.04, 0.04, 1, 5);
    const rope = Array.from({ length: MOORING.links }, () => {
      const m = new THREE.Mesh(geo, mat);
      this.shrineGroup.add(m);
      return m;
    });
    const shade = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: GLOW, color: "#27303f", transparent: true, opacity: MOORING.shade, depthWrite: false, fog: false }),
    );
    shade.rotation.x = -Math.PI / 2;
    shade.scale.set(3.6, 3.6, 1);
    shade.position.set(slot.position.x, slot.position.y - 1.4, slot.position.z);
    this.shrineGroup.add(shade);
    this.moored = { slot, y: slot.position.y, post, bow: new THREE.Vector3(MOORING.tie[0], MOORING.tie[1], MOORING.tie[2]), rope, shade };
    // Its bow lantern burns with the path lamps and rides the bob.
    const glow = glowSprite("#ffb65a", 1.3, 0), core = glowSprite("#ffe2a0", 0.5, 0);
    this.shrineGroup.add(glow, core);
    this.moored.flame = [glow, core];
    const lit = new THREE.Group();
    lit.userData.filled = true;
    this.pathLamps.push({ slot: lit, glow, core, mats: [], state: "off", seed: 6.5 });
    this.stepMoored(0);
  }
  /** A tile whoever is on stands raised (the referee stand's top step). */
  private perch: { x: number; y: number; h: number } | null = null;
  private streamers: { cloth: THREE.Mesh; seed: number }[] = [];
  /** Streamers ripple along their length, more toward the free end. */
  private stepStreamers(time: number) {
    for (const s of this.streamers) {
      const pos = s.cloth.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / 1.9 + 0.5;
        pos.setZ(i, Math.sin(time * 6 - u * 7 + s.seed) * 0.22 * u);
      }
      pos.needsUpdate = true;
    }
  }
  private stepMoored(time: number) {
    const m = this.moored;
    if (!m) return;
    const ph = (time * Math.PI * 2) / MOORING.period;
    m.slot.position.y = m.y + Math.sin(ph) * MOORING.bob;
    m.slot.rotation.z = Math.sin(ph + 1.1) * MOORING.roll;
    (m.shade.material as THREE.MeshBasicMaterial).opacity = MOORING.shade * (1 - 0.15 * Math.sin(ph));
    // The rope hangs in a sagging curve from the post to the bow, and its boat end rides the bob.
    this.shrineGroup.updateMatrixWorld(true);
    const a = this.shrineGroup.worldToLocal(m.slot.localToWorld(m.bow.clone()));
    m.flame?.[0].position.copy(a);
    m.flame?.[1].position.copy(a).setY(a.y + 0.2);
    const span = a.distanceTo(m.post), sag = Math.max(0.12, MOORING.slack * span);
    const at = (k: number) => a.clone().lerp(m.post, k).setY(a.y + (m.post.y - a.y) * k - sag * 4 * k * (1 - k));
    const up = new THREE.Vector3(0, 1, 0);
    m.rope.forEach((link, i) => {
      const p = at(i / m.rope.length), q = at((i + 1) / m.rope.length);
      link.position.copy(p).lerp(q, 0.5);
      link.scale.y = p.distanceTo(q);
      link.quaternion.setFromUnitVectors(up, q.sub(p).normalize());
    });
  }

  /**
   * The Sieve's island: the shelf round the chalk (the island's top) in the same slabs, darker and
   * weathered, not walked on; and the maps thread's chalk cliff rock on its sides.
   */
  private dressSieveIsland(island: THREE.Group, seg: number) {
    const [under, ...rest] = island.children as THREE.Mesh[];
    if (under?.isMesh) {
      const pos = under.geometry.getAttribute("position"), uv: number[] = [];
      // Round the island by segment, down it by height: about 6 tiles a repeat.
      for (let k = 0; k < pos.count; k++) uv.push(((k % (seg + 1)) / seg) * 22, pos.getY(k) / 6);
      under.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const m = under.material as THREE.MeshStandardMaterial;
      m.map = tex("textures/rock-sieve-cliff.webp", 1);
      m.needsUpdate = true;
    }
    const top = rest.find((o) => o.isMesh && o.geometry.type === "ShapeGeometry");
    // Rough chalk rock, not cut slabs, so it reads as ground nobody walks on.
    if (top) top.material = new THREE.MeshStandardMaterial({ map: tex("textures/rock-sieve-cliff.webp", 1 / 6), color: "#c9c0aa", roughness: 1 });
  }

  private tapRay = new THREE.Raycaster();
  /**
   * The drawn place under this point of the screen (a house, the shrine, the Kindling brazier...),
   * by its kind on the map ("house" for Rook's), or null. Only the model as drawn counts: the
   * ground and the path beside a house are not the house (Ladi).
   */
  placeAt(sx: number, sy: number): string | null {
    this.tapRay.setFromCamera(new THREE.Vector2((sx / this.cam.w) * 2 - 1, -(sy / this.cam.h) * 2 + 1), this.cam.three);
    // No farther than the ground: a model's footing below the grass is not a place to tap.
    const ray = this.tapRay.ray;
    this.tapRay.far = ray.direction.y < -1e-6 ? -ray.origin.y / ray.direction.y : Infinity;
    const shown = (o: THREE.Object3D | null) => {
      for (; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    let best: { d: number; place: string } | null = null;
    for (const s of this.placeSlots) {
      const place = s.group.userData.place as string | undefined;
      if (!place) continue;
      const hit = this.tapRay.intersectObject(s.group, true).find((h) => (h.object as THREE.Mesh).isMesh && shown(h.object));
      if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, place };
    }
    return best?.place ?? null;
  }

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
    // Rook carries no lantern glow: it hides his face. Nor do the crew of Part 2, who are no lamplighters.
    lantern.visible = cast !== "rook" && cast !== "outrider" && !cast?.startsWith("crew-");
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
    this.stepMoored(time);
    this.stepStreamers(time);
    for (const f of this.floaters) f.obj.position.y = f.y + Math.sin(time * 0.25 * f.drift + f.phase) * 0.8;
    this.brazierLight.intensity = 18 + Math.sin(time * 9) * 3 + Math.sin(time * 23) * 2;
    this.brazierLight.distance = 30;
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
    // Moss Hollow (optional run 3a): the moss is on the wisps, kept by the room; drawn as the same tufts, thicker the more strokes it takes.
    const optMoss = st.opt?.id === "o3a" ? (st.opt.moss ?? []).flatMap((m) => [(b.center.y + m.y) * b.width + b.center.x + m.x, m.hp]) : null;
    const mossList = optMoss ?? st.snap.moss;
    const mossedWisps = optMoss ? new Set(st.snap.wisps.filter((w) => !w.away && optMoss.some((_, k) => k % 2 === 0 && optMoss[k] === w.y * b.width + w.x)).map((w) => w.id)) : null;
    const mossFull = optMoss ? 4 : MOSS_HP;
    if (mossList) {
      const seen = new Set<number>();
      for (let k = 0; k < mossList.length; k += 2) {
        const i = mossList[k]!, hp = mossList[k + 1]!;
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
        const torn = Math.max(0, Math.min(1, 1 - hp / mossFull));
        const mat = (rig.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.color.set(optMoss ? "#3f7a30" : "#4f8a3a").lerp(new THREE.Color("#9a8443"), optMoss ? torn * 0.6 : torn);
        // It springs up when it grows, and shrinks as it's torn at.
        const goal = optMoss ? 1.05 + 0.2 * Math.min(hp, 4) : 0.55 + 0.45 * (hp / MOSS_HP);
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
      // A wisp that has changed hands (run 9: Kes sets hers down for him) is made again in its new colour.
      if (rig && this.wispGuild.get(w.id) !== w.guild) {
        rig.root.removeFromParent();
        rig = undefined;
      }
      if (!rig) {
        rig = this.makeWisp(w.guild);
        this.wisps.set(w.id, rig);
        this.wispGuild.set(w.id, w.guild);
      }
      const pw = st.prev?.wisps.find((q) => q.id === w.id);
      // A wisp that moved too far in one tick to have travelled there (a respawn) is put straight in
      // its new place. On the ship (run 10) a haul brings one in up to five tiles a tick and the wind
      // slides it astern as well, so only one that has just come back from away is put straight there.
      const far = st.ship ? 12 : 2;
      const jump = !pw || !!pw.away !== !!w.away || Math.abs(pw.x - w.x) > far || Math.abs(pw.y - w.y) > far;
      const x = jump ? w.x : lerp(w.px, w.x);
      const y = jump ? w.y : lerp(w.py, w.y);
      // Held fast in the ground: no bob, sunk low in its ring of stones.
      // A helping hold (run 7) keeps the wisp a light: no stone, and her line stays on it.
      const stoned = st.snap.rootLit ? undefined : w.rooted;
      if (stoned && !rig.stones) {
        rig.stones = makeStones();
        this.scene.add(rig.stones);
      }
      if (rig.stones) {
        rig.stones.visible = !!stoned && rig.rootedAt !== undefined && time - rig.rootedAt > EARTH_LINE;
        rig.stones.position.set(this.worldX(b, w.x), 0, this.worldZ(b, w.y));
      }
      // The wisp turns from a light into a stone: a crust closes over it in about a second,
      // its glow drops to a third and shows only through the cracks, and it sinks and stops
      // bobbing. Pulled on while held, the stone shudders without moving.
      let stone = 0;
      if (stoned) {
        if (rig.rootedAt === undefined) this.stoneCast(stoned, time);
        rig.rootedAt ??= time;
        // A line of earth runs from her lantern to it first; the stone starts where it lands.
        const since = time - rig.rootedAt;
        const holder = this.players.get(stoned);
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
      if (rig.crust) rig.crust.visible = !!stoned;
      const bob = stoned ? -0.3 * stone + Math.sin(time * 2.2 + w.id * 1.7) * 0.12 * (1 - stone) : Math.sin(time * 2.2 + w.id * 1.7) * 0.12;
      const sink = w.rim > 0 ? Math.min(1, w.rim * 0.5 + st.t * 0.5) : 0;
      const h = w.h;
      rig.root.position.set(this.worldX(b, x), (h === undefined ? 0.75 : FALL.low + (FALL.high - FALL.low) * h) + bob * (h === undefined ? 1 : 0.5) + sink * 1.4, this.worldZ(b, y));
      if (h !== undefined) {
        if (!rig.shade) {
          const soft = new THREE.Mesh(SHADE_GEO, new THREE.MeshBasicMaterial({ map: GLOW, color: "#1c1a22", transparent: true, depthWrite: false }));
          const hard = new THREE.Mesh(SHADE_HARD_GEO, new THREE.MeshBasicMaterial({ color: "#2a2730", transparent: true, depthWrite: false }));
          soft.renderOrder = hard.renderOrder = 1;
          this.scene.add(soft, hard);
          rig.shade = [soft, hard];
          // On pale chalk a white glow is lost: a deeper amber heart, and a halo that sits on the ground's colour and doesn't add to it.
          (rig.core.material as THREE.MeshBasicMaterial).color.set("#f08a10");
          rig.halo.material.blending = THREE.NormalBlending;
          rig.halo.material.color.set("#ffb53a");
          rig.halo.scale.setScalar(1.15 * FALL.big);
          const aura = glowSprite("#ff9a28", 5.6 * FALL.big, 0);
          aura.material.blending = THREE.NormalBlending;
          aura.material.color.set("#ff7a10");
          aura.renderOrder = 2;
          rig.root.add(aura);
          rig.aura = aura;
        }
        // High: small, faint, thrown well away by the low sun. Low: dark, sharp, right under it. Over a well: none.
        const sx = rig.root.position.x + FALL.sun[0] * h * 1.5, sz = rig.root.position.z + FALL.sun[1] * h * 1.5;
        const over = b.tile({ x: Math.floor(sx - this.worldX(b, 0) + 0.5), y: Math.floor(sz - this.worldZ(b, 0) + 0.5) }) !== Tile.Floor;
        const show = !w.away && !over && sink === 0;
        const [soft, hard] = rig.shade;
        soft.visible = hard.visible = show;
        soft.position.set(sx, 0.045, sz);
        hard.position.set(sx, 0.05, sz);
        soft.scale.setScalar((2.3 - 0.9 * h) * FALL.big);
        (soft.material as THREE.MeshBasicMaterial).opacity = 0.92 - 0.45 * h;
        hard.scale.setScalar((0.95 - 0.4 * h) * FALL.big);
        (hard.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.6 * Math.pow(1 - h, 1.4);
      } else if (rig.shade) rig.shade[0].visible = rig.shade[1].visible = false;
      // Stopped at the bank: it lurches at the water and bumps back onto land.
      const fx = this.stopFx.get(w.id);
      if (fx) {
        const k = (time - fx.at) / STOP_FX;
        const dx = fx.x - w.x, dz = fx.y - w.y, n = Math.hypot(dx, dz) || 1;
        const lurch = Math.sin(Math.PI * Math.min(1, k * 2)) * 0.28 * (1 - k);
        rig.root.position.x += (dx / n) * lurch;
        rig.root.position.z += (dz / n) * lurch;
      }
      if (st.snap.rootLit && w.rooted) {
        const holder = this.players.get(w.rooted);
        if (holder) {
          if (!rig.earth) {
            rig.earth = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#b07a3c", transparent: true }));
            this.scene.add(rig.earth);
          }
          // Both hands: the lines leave her from either side by turns.
          const from = holder.root.position.clone().add(new THREE.Vector3(w.id % 2 ? 0.4 : -0.4, 1.1, 0));
          const end = rig.root.position.clone().setY(0.55);
          rig.earth.position.copy(from).lerp(end, 0.5);
          rig.earth.scale.set(0.8, Math.max(0.001, from.distanceTo(end)), 0.8);
          rig.earth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(from).normalize());
          (rig.earth.material as THREE.MeshBasicMaterial).opacity = 0.8 + 0.12 * Math.sin(time * 3 + w.id);
          rig.earth.visible = true;
          rig.heldLit = time;
        }
      } else if (st.snap.rootLit && rig.earth) {
        // Let go (or the falter): the line gutters out over a moment.
        const k = (time - (rig.heldLit ?? -9)) / 0.5;
        rig.earth.visible = k < 1 && Math.sin(time * 70) > -0.2;
        (rig.earth.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.max(0, 1 - k);
      }
      const s = 1 - sink * 0.6;
      // Outside the light it dims like an ember away from the fire, with a gutter near the end.
      const gone = w.dim ?? 0;
      const dim = (1 - stone * (2 / 3)) * (1 - 0.82 * gone) * (gone > 0.7 ? 0.85 + 0.15 * Math.sin(time * 23 + w.id) : 1);
      // Lower is a little smaller and dimmer; and on the chalk its own light is kept down so its shadow shows.
      // Run 8 (Ladi: the glow back, flickering): full strength at height, and a flicker that is gentle up
      // high and gets faster and more ragged as it sinks, so a tired one looks tired.
      let flick = 1;
      if (h !== undefined) {
        const tired = 1 - h, sp = 5 + 17 * tired, ph = w.id * 2.3;
        const n = Math.sin(time * sp + ph) * 0.5 + Math.sin(time * sp * 2.71 + ph * 1.7) * 0.3 + Math.sin(time * sp * 0.43 + ph * 0.6) * 0.2;
        flick = 1 + (0.07 + 0.33 * tired * tired) * n - (tired > 0.75 && Math.sin(time * 31 + ph) > 0.6 ? 0.35 : 0);
      }
      // Moss Hollow: one under moss glows low through it, so the moss reads and the wisps can still be counted.
      // The offspring fight: a wisp nobody has pulled is asleep, low and breathing slowly.
      const sleeping = !!st.fight?.asleep.includes(w.id), asleep = sleeping ? 0.3 * (0.85 + 0.15 * Math.sin(time * 1.3 + w.id)) : 1;
      const mossed = (mossedWisps?.has(w.id) ? 0.4 : 1) * asleep;
      const low = (h === undefined ? 1 : flick) * mossed;
      rig.core.scale.setScalar(s * (st.hoverWisp === w.id ? 1.3 : 1) * (sleeping ? 0.5 : 1) * (h === undefined ? 1 : (0.8 + 0.3 * h) * FALL.big * (0.92 + 0.08 * flick)));
      rig.halo.material.opacity = Math.min(1, 0.85 * s * dim * dim * low);
      rig.light.intensity = 6 * s * dim * low;
      if (rig.aura) {
        rig.aura.visible = h !== undefined && !w.away;
        rig.aura.material.opacity = Math.min(1, Math.max(0, 0.85 * s * dim * flick * (0.8 + 0.2 * h!)));
        rig.aura.scale.setScalar(5.0 * FALL.big * (0.94 + 0.06 * flick));
      }
      // Run 8's tug: every flame leans and streams toward its nearest well while it lasts.
      const tugOn = st.sieve?.pull?.phase === "tug" && h !== undefined ? 1 : 0;
      if (tugOn || rig.lean) {
        if (!rig.base) rig.base = [rig.core.position.clone(), rig.halo.position.clone()];
        rig.lean = (rig.lean ?? 0) + (tugOn - (rig.lean ?? 0)) * 0.12;
        if (rig.lean < 0.01 && !tugOn) rig.lean = 0;
        const wells = st.shrine.wells ?? [];
        const rx = rig.root.position.x, rz = rig.root.position.z;
        const near = wells.reduce((b, q) => (Math.hypot(q.x - rx, q.y - rz) - q.r < Math.hypot(b.x - rx, b.y - rz) - b.r ? q : b), wells[0] ?? { x: rx, y: rz, r: 0 });
        const dx = near.x - rx, dz = near.y - rz, dl = Math.hypot(dx, dz) || 1, wob = 0.85 + 0.15 * Math.sin(time * 19 + w.id);
        rig.core.position.copy(rig.base[0]).add(new THREE.Vector3((dx / dl) * 0.22, -0.05, (dz / dl) * 0.22).multiplyScalar(rig.lean * wob));
        rig.halo.position.copy(rig.base[1]).add(new THREE.Vector3((dx / dl) * 0.55, -0.1, (dz / dl) * 0.55).multiplyScalar(rig.lean * wob));
      }
      rig.trail.visible = stone < 0.5;
      if (w.rim > 0) rimPulse = Math.max(rimPulse, 1);
      const hide = !!st.dying?.blind;
      if (hide !== !!rig.root.userData.blind) (rig.root.visible = !hide), (rig.root.userData.blind = hide);
      wispPos.set(w.id, rig.root.position.clone());
    }
    // Her lantern, where the sparks start: about hand height by her side.
    const stormRig = st.snap.stormLight != null ? this.players.get(st.snap.stormLight) : undefined;
    this.stepStormString(st.snap.string ?? [], !!st.snap.stringLive, wispPos, time, stormRig ? stormRig.root.position.clone().add(new THREE.Vector3(0.35, 1.15, 0)) : null);
    for (const [id, rig] of this.wisps) if (!seenW.has(id)) (this.scene.remove(rig.root), rig.stones && this.scene.remove(rig.stones), rig.earth && this.scene.remove(rig.earth), rig.shade && this.scene.remove(...rig.shade), this.wisps.delete(id));
    this.stepDying(st, time);
    this.stepFalls(st, time);
    this.stepSieve(st, time);
    this.stepRescue(st, time);
    this.stepRematch(st);
    this.stepCove(st, time);
    this.stepKite(st, time);
    this.stepTidepool(st, time);
    this.stepShip(st, time);
    this.stepFight(st, time);
    this.stepCamp(st, time);
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
      // Run 9, busy Kes standing: her face to what she is watching (the patch, the west, the people she waves aboard).
      const look = st.rescue?.kes === p.id ? st.rescue.kesLook : undefined;
      if (look && !moving && p.beam === null) face = Math.atan2(this.worldX(b, look.x) - wx, this.worldZ(b, look.y) - wz);
      const toward = st.looks?.find((q) => q.id === p.id);
      if (toward && !moving && p.beam === null) face = Math.atan2(this.worldX(b, toward.x) - wx, this.worldZ(b, toward.y) - wz);
      rig.facing = lerpAngle(rig.facing, face, 0.18);
      const anim = rig.body?.userData.anim as CastAnim | undefined;
      if (anim) {
        // Animated cast: the clips do the moving, so no bob.
        // Hesta, two or more ahead and with nothing to do, eats a honey drop from her bag (story thread).
        const lead = (st.snap.scores[p.guild] ?? 0) - Math.max(...st.snap.scores.filter((_, i) => i !== p.guild), 0);
        // Not in runs 6 and 7 (Ladi).
        const snack = rig.cast === "hesta" && lead >= 2 && !st.dying && anim.has("snack");
        // Waving the people aboard: her staff up toward them, the pull pose with no wisp on it.
        const wave = !!look?.wave && !moving;
        anim.set(p.beam !== null || wave ? (p.mode === "push" ? "push" : "pull") : moving ? (p.run ? "run" : "walk") : snack ? "snack" : "idle");
        anim.update(time);
        rig.root.position.set(wx, 0, wz);
        this.stepSnack(rig, anim.at("snack"));
      } else rig.root.position.set(wx, moving ? Math.abs(Math.sin(time * 9)) * 0.06 : Math.sin(time * 1.6 + p.id) * 0.03, wz);
      if (this.perch && p.x === this.perch.x && p.y === this.perch.y) rig.root.position.y += this.perch.h;
      // Run 10's last ticks: he goes over the rail.
      if (this.shipFx && st.ship?.over !== undefined) this.shipFx.overRail(rig, st.ship.over, st.t);
      if (rig.body) rig.body.rotation.y = rig.facing;
      this.stepStoneCast(rig, time);
      // Lantern sits up and to the side of the figure, where the staff head is.
      const side = new THREE.Vector3(-0.38, 1.74, 0.07).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.facing);
      rig.lantern.position.copy(side);
      // Kes's own staff is long and held across her: a smaller, fainter glow, so that it does not wash her out (cast thread).
      const small = rig.cast === "kes";
      rig.lantern.scale.setScalar((small ? 0.5 : 0.9) + Math.sin(time * 7 + p.id) * 0.06);
      rig.lantern.material.opacity = small ? 0.55 : 1;

      const beam = rig.beam;
      let target = p.beam !== null ? wispPos.get(p.beam) : undefined;
      // Stopped at the bank: the beam breaks at the waterline, grey and flickering, short of the wisp.
      const broke = p.beam !== null ? this.stopFx.get(p.beam) : undefined;
      // Torn off his staff by the pull: the same broken beam, short of the wisp, while everything holds.
      const tornOff = st.sieve?.pull?.phase === "hold" && st.sieve.pull.torn === p.beam && p.id === st.me;
      const broken = ((!!broke && broke.player === p.id) || tornOff) && !!target;
      if (broken && target && broke) {
        const edge = new THREE.Vector3(this.worldX(b, broke.x), target.y, this.worldZ(b, broke.y));
        target = edge.lerp(target, 0.5);
      } else if (broken && target) target = rig.root.position.clone().add(side).lerp(target, 0.45);
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
        // The tug: his beam on the wisp being dragged away stretches thin and shakes.
        const pl = st.sieve?.pull;
        if (pl?.phase === "tug" && pl.tugged === p.beam && p.id === st.me && !broken) {
          beam.scale.y = 0.45 + 0.12 * Math.sin(time * 31);
          beam.position.addScaledVector(up, Math.sin(time * 53) * 0.07 + Math.sin(time * 23) * 0.04);
        }
        u.uDash!.value = p.mode === "push" ? 1 : 0;
      } else beam.visible = false;
    }
    for (const [id, rig] of this.players)
      if (!seenP.has(id)) (this.scene.remove(rig.root), this.scene.remove(rig.beam), this.players.delete(id));
    // The offspring fight: Rook thrown by it (offspring-dress.ts), over where his figure was just put.
    if (st.fight && this.fightFx) {
      const b2 = st.shrine.board;
      const rig = this.players.get(st.me);
      this.fightFx.throwRook({ f: st.fight, t: st.t, time, half: { w: b2.width / 2, h: b2.height / 2 }, rook: rig?.root ?? null, rig: rig ? { body: rig.body ?? null, anim: (rig.body?.userData.anim as CastAnim | undefined) ?? null, face: (a) => (rig.facing = a) } : null });
      // Her save: her own clip, facing it (Solenne is player 2 in the fight).
      const her = this.players.get(2);
      this.fightFx.herSave({ f: st.fight, t: st.t, half: { w: b2.width / 2, h: b2.height / 2 }, her: her?.root ?? null, rig: her ? { body: her.body ?? null, anim: (her.body?.userData.anim as CastAnim | undefined) ?? null, face: (a) => (her.facing = a) } : null });
      // The boy (player 3): he cowers while he waits, and is drained if it reaches him in run 4.
      const boy = this.players.get(3), boyAnim = (boy?.body?.userData.anim as CastAnim | undefined) ?? null;
      if (boyAnim) boyAnim.idleAs = "cower";
      this.fightFx.fenDrain({ f: st.fight, t: st.t, half: { w: b2.width / 2, h: b2.height / 2 }, rig: boy ? { body: boy.body ?? null, anim: boyAnim, face: (a) => (boy.facing = a) } : null });
    }

    // My reach square and walk marker.
    const me = st.snap.players.find((p) => p.id === st.me);
    if (me) {
      const r = me.mode === "pull" ? (st.ship?.reach ?? st.opt?.reach ?? PULL_REACH) : PUSH_REACH;
      const mx = lerp(me.px, me.x);
      const my = lerp(me.py, me.y);
      let x0 = Math.max(1, mx - r);
      const y0 = Math.max(1, my - r);
      let x1 = Math.min(b.width - 1, mx + r + 1);
      const y1 = Math.min(b.height - 1, my + r + 1);
      if (st.ship && me.mode === "pull") {
        // Run 10: from the band along a rail he reaches everything out over it, so the shape runs out to the farthest lane on that side.
        const cx = b.center.x, rel = me.x - cx;
        if (Math.abs(rel) >= SHIP_DECK.hw - SHIP.railLeeway && Math.abs(rel) <= SHIP_DECK.hw) rel > 0 ? (x1 = cx + st.ship.far + 1) : (x0 = cx - st.ship.far);
      }
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

/** How run 9's strip at the top looks. */
const RESCUE_HUD = {
  /** A boat's cell: its width and the hull's size, a pip's radius, and the gap between cells (px, before fitting to the screen). */
  cell: 62, hull: [44, 13] as const, pip: 5, gap: 10,
  /** How much larger the strip is drawn on a desktop than on a phone (the gameplay thread, 25 Nov: half again). */
  desk: 1.5,
  /** The dark mark on the cloud's bar while a crossing is told: its radius. */
  mark: 6.5,
  /** The cloud's bar, to the left of the boats: its length. */
  bar: 96,
  lit: "#ffc860", unlit: "rgba(255,236,200,0.2)", line: "rgba(255,236,200,0.75)", cloud: "#dfe5f4",
  /** The first-wisp hint: the ring's size on the wisp and the dashes of the line to the lamp. */
  ring: 20, dash: [7, 7] as [number, number],
  /** During a warning, what the patch is turned for: a thin cold line from the cloud's edge to it, and a ring the size it will come at. */
  aim: { line: "rgba(196,210,255,0.95)", under: "rgba(14,18,52,0.8)", width: 1.5, dash: [10, 8] as [number, number] },
  /** The lamp is not ready for its next wisp: a ring round its light that closes as the wait runs out (warm), or after the patch has sat on the boat (cold). */
  sip: { warm: "rgba(255,214,140,0.95)", cold: "rgba(170,196,255,0.95)", track: "rgba(255,255,255,0.16)", width: 3.2 },
};

/**
 * Run 9, the rescue: what Ladi could not tell (24 Nov). A strip at the top for the whole run: the
 * cloud closing, as a pale bar creeping toward the boats; three boats, each with its four pips and
 * its eight people; the one being filled outlined, a lifted one ticked. Under it, any line that
 * must land (the goal at the start). And until his first wisp is in, a ring on the nearest loose
 * one and a dotted line from it to the docked boat's lamp.
 */
function drawRescueHud(g: CanvasRenderingContext2D, cam: Camera, st: DrawState, r: NonNullable<DrawState["rescue"]>) {
  const H = RESCUE_HUD, n = r.boats.length;
  // Fitted between the corner buttons (and clear of the little map on a small screen). Before play starts it keeps to its small size, above the talk box.
  const room = cam.w - (cam.compact ? 230 : 150), wide = H.bar + 18 + n * H.cell + (n - 1) * H.gap + 24;
  const k = Math.max(0.62, Math.min(cam.compact || st.snap.tick < 1 ? 1.02 : H.desk, room / wide)), W = wide * k, x0 = Math.max(52, Math.min((cam.w - W) / 2 - (cam.compact && cam.w > cam.h ? 30 : 0), cam.w - 112 - W)), y0 = 4, hgt = 57 * k;
  g.save();
  g.fillStyle = "rgba(10,8,20,0.6)";
  roundRect(g, x0, y0, W, hgt, 12 * k);
  g.fill();
  // The cloud: a track with the landing at its right end, and the pale bar closing on it.
  const from = r.from ?? RESCUE.cloud.start, reach = r.reach ?? RESCUE.cloud.landing, near = Math.max(0, Math.min(1, (from - r.cloud) / Math.max(1, from - reach)));
  const bx = x0 + 12 * k, by = y0 + hgt / 2, bw = H.bar * k, bh = 9 * k;
  g.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(g, bx, by - bh / 2, bw, bh, bh / 2);
  g.fill();
  g.fillStyle = near > 0.75 ? "#ffd0c0" : H.cloud;
  g.globalAlpha = 0.9;
  roundRect(g, bx, by - bh / 2, Math.max(bh, bw * (0.08 + 0.92 * near)), bh, bh / 2);
  g.fill();
  g.globalAlpha = 1;
  // The patch, told on its clock: a small dark mark sliding along the bar toward the boats.
  if (r.tell) {
    const at = Math.max(0, Math.min(1, 1 - (r.tell.left - Math.min(1, st.t)) / r.tell.of)), mx = bx + bw * at;
    g.beginPath();
    g.arc(mx, by, H.mark * k, 0, Math.PI * 2);
    g.fillStyle = "#0c0a14";
    g.fill();
    g.strokeStyle = "rgba(200,190,235,0.85)";
    g.lineWidth = 1.4 * k;
    g.stroke();
  }
  g.font = `600 ${Math.round(10 * k)}px system-ui, sans-serif`;
  g.textAlign = "left";
  g.fillStyle = "rgba(223,229,244,0.8)";
  g.fillText("cloud", bx, by - bh / 2 - 5 * k);
  g.textAlign = "right";
  g.fillText("landing", bx + bw, by + bh / 2 + 12 * k);
  // The boats.
  const flare = r.flare !== undefined;
  for (let i = 0; i < n; i++) {
    const cx = bx + bw + 18 * k + i * (H.cell + H.gap) * k + (H.cell * k) / 2, fill = r.boats[i] ?? 0, lifted = i < r.lifted || (r.ending !== undefined && r.ending >= 0), mine = i === r.lifted && !lifted;
    const top = y0 + 9 * k;
    // Four pips.
    for (let p = 0; p < r.perBoat; p++) {
      const px = cx + (p - (r.perBoat - 1) / 2) * (H.pip * 2 + 3) * k, on = p < fill || lifted;
      g.beginPath();
      g.arc(px, top + H.pip * k, H.pip * k, 0, Math.PI * 2);
      g.fillStyle = on ? H.lit : H.unlit;
      // The newest pip of a lamp that is about to lose it flickers.
      const gut = mine && on && p === fill - 1 && r.lamp?.gutter !== undefined ? 0.25 + 0.75 * Math.abs(Math.sin(st.now / 65) * Math.sin(st.now / 173)) : 1;
      g.globalAlpha = (lifted ? 0.5 : mine && r.lamp?.dark && on ? 0.45 : 1) * gut;
      if (on && mine && !r.lamp?.dark) (g.shadowColor = H.lit), (g.shadowBlur = (flare ? 16 : 7) * k);
      g.fill();
      g.shadowBlur = 0;
      if (!on) (g.strokeStyle = mine ? H.line : "rgba(255,236,200,0.3)"), (g.lineWidth = 1), g.stroke();
    }
    g.globalAlpha = lifted ? 0.45 : mine ? 1 : 0.6;
    // The hull, seen from the side: a shallow bowl.
    const hw = (H.hull[0] * k) / 2, hh = H.hull[1] * k, hy = top + H.pip * 2 * k + 7 * k;
    g.beginPath();
    g.moveTo(cx - hw, hy);
    g.lineTo(cx + hw, hy);
    g.quadraticCurveTo(cx + hw * 0.8, hy + hh, cx + hw * 0.45, hy + hh);
    g.lineTo(cx - hw * 0.45, hy + hh);
    g.quadraticCurveTo(cx - hw * 0.8, hy + hh, cx - hw, hy);
    g.closePath();
    // Under the patch the boat is dark, and so are the people in it.
    const sat = mine && !!r.lamp?.sat;
    g.fillStyle = sat ? "#2b2530" : mine ? "#b98a58" : "#7b6248";
    g.fill();
    if (mine) (g.strokeStyle = sat ? "rgba(200,190,235,0.6)" : H.lit), (g.lineWidth = 1.6), g.stroke();
    // Its eight people: on the landing under it until they are aboard, two more with each pip.
    const per = 8, aboard = lifted ? per : Math.floor((fill / r.perBoat) * per);
    for (let q = 0; q < per; q++) {
      const on = q < aboard, qx = cx + (q - (per - 1) / 2) * 5 * k, qy = on ? hy - 2.5 * k : hy + hh + 8 * k;
      g.beginPath();
      g.arc(qx, qy, 1.9 * k, 0, Math.PI * 2);
      g.fillStyle = on ? (sat ? "#5d5868" : "#ffe9c4") : "#c9d2ea";
      g.fill();
    }
    if (lifted) {
      g.globalAlpha = 1;
      g.strokeStyle = "#bff0c0";
      g.lineWidth = 2.4 * k;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx - 7 * k, hy + 3 * k);
      g.lineTo(cx - 2 * k, hy + 9 * k);
      g.lineTo(cx + 9 * k, hy - 5 * k);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  // On the ground (drawn before the lines, so those lie over it): a circle of `rad` tiles round a tile, as it lies on the ground.
  const ground = (tx: number, ty: number, rad: number, from = 0, share = 1) => {
    g.beginPath();
    const steps = Math.max(2, Math.ceil(56 * share));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (from + (share * i) / steps) * Math.PI * 2, q = cam.toScreen(tx + Math.cos(a) * rad, ty + Math.sin(a) * rad, 0.3);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    }
    g.stroke();
  };
  // What the patch is turned for, all through its warning: he can see it, and change it.
  const to = r.tell?.to;
  if (to && to.kind !== "none" && r.ending === undefined && !r.hold) {
    const A = H.aim, half = st.shrine.board.width / 2, halfH = st.shrine.board.height / 2;
    // Toward the lamp it comes up the boat, two rows south of the lamp, and no smaller than a boat is wide.
    const sizes = RESCUE.patch.react.sizes, lamp = to.kind === "lamp", ty = to.y + (lamp ? 2 : 0) + 0.5, tx = to.x + 0.5;
    const rad = (lamp ? Math.max(sizes[1]!, sizes[to.n >= 2 ? 1 : 0]!) : sizes[to.n >= 2 ? 1 : 0]!) / 2;
    // From the cloud's edge, west of it on its row.
    const dz = ty - halfH, edge = half - Math.sqrt(Math.max(0, r.cloud * r.cloud - dz * dz)), x0 = Math.max(tx - 34, Math.min(edge, tx - rad - 1));
    const a = cam.toScreen(x0, ty, 0.3), b = cam.toScreen(tx - rad - RESCUE_LOOK.stainOver, ty, 0.3);
    g.save();
    g.lineCap = "round";
    // Dark under pale, so that it reads on the pale cloud and on the grass alike.
    for (const [color, width] of [[A.under, A.width + 2.4], [A.line, A.width]] as const) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(A.dash);
      g.lineDashOffset = -st.now / 45;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.setLineDash([]);
      ground(tx, ty, rad + RESCUE_LOOK.stainOver);
    }
    g.restore();
  }
  // The lamp between two wisps: the ring round its light closes, and the one waiting in it goes in by itself.
  const sip = r.lamp?.sip;
  if (sip && r.lamp && !r.lamp.dark && r.ending === undefined && !r.hold) {
    const S = H.sip, done = Math.max(0, Math.min(1, 1 - (sip.left - Math.min(1, st.t)) / Math.max(1, sip.of)));
    const lx = r.lamp.x + 0.5, ly = r.lamp.y + 0.5, rad = r.lamp.take + 0.2;
    g.save();
    g.lineCap = "round";
    g.lineWidth = S.width;
    g.strokeStyle = S.track;
    ground(lx, ly, rad);
    g.strokeStyle = r.lamp.cold !== undefined && sip.of === RESCUE.patch.bait.cold ? S.cold : S.warm;
    if (sip.n > 0) (g.shadowColor = g.strokeStyle), (g.shadowBlur = 8);
    ground(lx, ly, rad, 0, Math.max(0.02, done));
    g.restore();
  }
  // Lines that must land, under the strip.
  let cy = y0 + hgt + 8;
  // On a phone held upright the little map has the top right corner: the lines keep to its left.
  const tall = cam.compact && cam.h > cam.w, midX = tall ? (cam.w - 132) / 2 : cam.w / 2, maxW = tall ? cam.w - 160 : cam.w - 60;
  const fs = Math.max(13, Math.min(18, cam.w / 44));
  for (const [i, text] of (r.caption ?? []).entries()) {
    g.font = `${i === 0 ? 700 : 500} ${fs}px system-ui, sans-serif`;
    g.textAlign = "center";
    // Wrapped to the screen.
    const words = text.split(" "), rows: string[] = [];
    for (const w of words) {
      const last = rows[rows.length - 1];
      if (last !== undefined && g.measureText(`${last} ${w}`).width <= maxW) rows[rows.length - 1] = `${last} ${w}`;
      else rows.push(w);
    }
    const tw = Math.max(...rows.map((t) => g.measureText(t).width)) + 26, th = rows.length * (fs + 5) + 10;
    g.fillStyle = "rgba(10,8,20,0.72)";
    roundRect(g, midX - tw / 2, cy, tw, th, 10);
    g.fill();
    g.fillStyle = i === 0 ? "#ffe9c4" : "#d9cfff";
    rows.forEach((t, j) => g.fillText(t, midX, cy + 6 + (j + 1) * (fs + 5) - 6));
    cy += th + 6;
  }
  // Until his first wisp is in: which one, and where it goes.
  const none = r.lifted === 0 && (r.boats[0] ?? 0) === 0 && r.lamp && r.ending === undefined && !r.hold;
  if (none) {
    const me = st.snap.players.find((p) => p.id === st.me);
    const loose = st.snap.wisps.filter((w) => w.guild === 0 && !w.away);
    if (me && loose.length) {
      const held = me.beam != null ? loose.find((w) => w.id === me.beam) : undefined;
      const w = held ?? loose.reduce((a, b) => (Math.hypot(b.x - me.x, b.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? b : a));
      const t = Math.min(1, st.t), a = cam.toScreen(w.px + (w.x - w.px) * t + 0.5, w.py + (w.y - w.py) * t + 0.5, 0.9), b = cam.toScreen(r.lamp!.x + 0.5, r.lamp!.y + 0.5, 0.4);
      const beat = 0.5 + 0.5 * Math.sin(st.now / 380);
      g.strokeStyle = `rgba(255,226,160,${0.55 + 0.3 * beat})`;
      g.lineWidth = 2.2;
      g.beginPath();
      g.arc(a.x, a.y, H.ring + 3 * beat, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash(H.dash);
      g.lineDashOffset = -st.now / 60;
      g.strokeStyle = "rgba(255,226,160,0.7)";
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      g.beginPath();
      g.moveTo(a.x + ((b.x - a.x) / d) * (H.ring + 4), a.y + ((b.y - a.y) / d) * (H.ring + 4));
      g.lineTo(b.x, b.y);
      g.stroke();
      g.setLineDash([]);
    }
  }
  g.restore();
}

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
    // Run 9: inside the patch her name is not seen either. His always is: it does nothing to him.
    const cut = st.staticOn === pl.id;
    if (pl.id !== st.me && st.rescue?.dark?.includes(pl.id) && !cut) continue;
    const x = lerp(pl.px, pl.x) + 0.5;
    const y = lerp(pl.py, pl.y) + 0.5;
    const p = cam.toScreen(x, y, 2.05);
    const fs = Math.max(11, Math.min(14, cam.scale * 0.4));
    g.font = `600 ${fs}px system-ui, sans-serif`;
    g.textAlign = "center";
    const label = pl.name + (pl.id === st.me ? " (you)" : "");
    const tw = g.measureText(label).width + 10;
    if (cut) {
      // Cut off: where her name was, static for the length of the burst.
      const x0 = p.x - tw / 2, y0 = p.y - fs - 4, hh = fs + 8, cell = 3;
      g.save();
      roundRect(g, x0, y0, tw, hh, 6);
      g.clip();
      for (let yy = 0; yy < hh; yy += cell)
        for (let xx = 0; xx < tw; xx += cell) {
          const v = Math.floor(Math.random() * 230);
          g.fillStyle = `rgb(${v},${v},${v + 20})`;
          g.fillRect(x0 + xx, y0 + yy, cell, cell);
        }
      g.restore();
      continue;
    }
    g.fillStyle = "rgba(10,6,18,0.55)";
    roundRect(g, p.x - tw / 2, p.y - fs - 4, tw, fs + 8, 6);
    g.fill();
    g.fillStyle = GUILD_COLORS[pl.guild]!;
    g.fillText(label, p.x, p.y);
  }
  if (st.rescue) drawRescueHud(g, cam, st, st.rescue);
  if (st.opt) drawOptHud(g, cam, st.opt, st.snap, st.t, st.now, st.shrine.board.center);
  // Run 10: a cloud bank is coming down one side (Ladi, 24 Nov: "the affordance at the top is fine").
  // A pale swell with arrows at the top edge on its side, on every screen, from the moment it is on
  // its way until its front reaches the bow, growing as it nears.
  const bank = st.ship?.bank;
  if (bank && st.ship!.gutter === undefined) {
    const c = st.shrine.board.center, W = SHIP.bank, front = bank.front - bank.speed * (1 - Math.min(1, st.t));
    if (front < -SHIP_DECK.hl) {
      const p = cam.toScreen(c.x + bank.side * (SHIP_DECK.hw + 7) + 0.5, c.y - SHIP_DECK.hl + 0.5, 2);
      const near = Math.max(0, Math.min(1, 1 - (-SHIP_DECK.hl - front) / W.tell.rows)), k = W.tell.size[0] + (W.tell.size[1] - W.tell.size[0]) * near;
      // Clear of the corner buttons, and of the little map on a small screen.
      const x = Math.max(70, Math.min(cam.w - (cam.compact ? 160 : 70), p.x)), y = 56, r = 70 * k;
      const glow = g.createRadialGradient(x, y - 18, 4, x, y - 18, r);
      glow.addColorStop(0, `rgba(${W.tell.rgb},${0.35 + 0.5 * near})`);
      glow.addColorStop(1, `rgba(${W.tell.rgb},0)`);
      g.fillStyle = glow;
      g.fillRect(x - r, y - 18 - r, r * 2, r * 2);
      const pale = `rgba(244,247,255,${0.8 + 0.2 * near})`, lw = 2.5 + 1.5 * k;
      g.lineCap = g.lineJoin = "round";
      // They slide down toward the deck, over and over, a little quicker as it nears.
      const half = 13 * k, gap = 12 * k, slide = ((st.now / 1000) * (W.tell.rate[0] + (W.tell.rate[1] - W.tell.rate[0]) * near)) % 1;
      for (let i = 0; i < 3; i++) {
        const at = i + slide, yy = y + (at - 0.5) * gap;
        g.globalAlpha = Math.max(0, Math.min(1, at, 3 - at));
        // A thin dark edge under each, so that they show against the pale bank itself.
        for (const [ink, wide] of [["rgba(16,22,44,0.6)", lw + 3.5], [pale, lw]] as const) {
          g.strokeStyle = ink;
          g.lineWidth = wide;
          g.beginPath();
          g.moveTo(x - half, yy);
          g.lineTo(x, yy + half * 0.7);
          g.lineTo(x + half, yy);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
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
      g.fillStyle = t === Tile.Wall ? "#4a4a55" : t === Tile.Water ? "#3f9fa8" : t === Tile.Well ? (st.ship ? "#262d42" : "#c9d4dc") : t === Tile.Rock ? "#888" : t === Tile.CrystalA || t === Tile.CrystalB ? "#e6c8ff" : t === Tile.Rime ? "#cfe8f4" : t === Tile.Moss ? "#4f8a3a" : t === Tile.Glyph ? "#c9a24a" : t === Tile.Brazier ? "#ff9a3a" : "#3b3346";
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
  // Run 10: the patch ahead of the bow, which a phone held sideways cannot otherwise see.
  if (st.ship) {
    const r = SHIP.patch.size / 2, px = rect.x + (b.center.x + 0.5) * k, py = rect.y + (b.center.y - SHIP_DECK.hl - st.ship.lead - r + 0.5) * k;
    g.fillStyle = "#000";
    g.strokeStyle = "#8fa6d8";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(px, py, Math.max(3, r * k), 0, Math.PI * 2);
    g.fill();
    g.stroke();
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
