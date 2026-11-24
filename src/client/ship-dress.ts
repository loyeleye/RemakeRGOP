// Run 10, the ship home: what the deck has that no other board does. The cloud sea going by under
// the ship, with ridges and furrows in it, and turning from night to grey; the dark patch in it
// ahead of the bow; the ship itself and the man at its stern (built in ship-fit.ts); the islands he
// passes, each over a pool of its heart's colour; cloud banks going by; the wind over the deck;
// and at the end home coming in over the top of the screen. Still block-outs, only finer.
// What may and may not be seen here: project files story/run10-backdrop.md. Never a star, a moon,
// the sun's disc, anything under the cloud, or any dark shape on the cloud but the patch.
// World units are tiles, the origin at the lamp; the bow is north (-z).

import * as THREE from "three";
import type { StoryView } from "../engine/protocol.js";
import { SHIP, SHIP_DECK, onDeck } from "../engine/shiphome.js";
import { figure, smokeTexture } from "./rescue-dress.js";
import { SHIP_WOOD, brassOf, buildBars, buildBoards, buildFittings, buildFixer, buildIsland, buildLamp, buildRail, plankTexture, type IslandSpec } from "./ship-fit.js";

type Ship = NonNullable<StoryView["ship"]>;
type Glow = (color: string, size: number, opacity?: number) => THREE.Sprite;
type Std = (color: string, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;

/** How it looks, in one place. (What sets the feel of play is SHIP, in engine/shiphome.ts.) */
export const SHIP_LOOK = {
  /** The cloud sea: its height against the deck, how fast it goes by (tiles a second), and how much of its grain shows at night and at first light. */
  seaY: -1.1,
  stream: 2.5,
  grain: [0.1, 0.46] as const,
  /** How much faster the sea goes by when the patch is as near as it gets than when it is nearly lost (1 is the speed above). */
  gainSpeed: [0.85, 1.4] as const,
  /** Ridges in the cloud: how strongly their lit side and their furrows show (0 is a flat sea). */
  ridge: 0.9,
  /**
   * The patch's distance, spread up the screen so that it can be read: how many tiles ahead of the
   * prow's tip its near edge is when it is as near as it gets, and when it is lost from sight (a
   * speck at the top edge of the screen). The number it follows is SHIP.patch's. The eye
   * foreshortens the sea ahead, so tiles are not spread evenly between the two: `patchLens` is
   * how strongly (the bigger, the more evenly), set so that it slides evenly up the screen.
   */
  patchNear: 1.5,
  patchFar: 29,
  patchLens: 7.3,
  /** The patch: its dark, how uneven its edge is, and the faint cold line round it that lets it be seen at night. */
  dark: "#000001",
  ragged: 0.08,
  rim: "#5a6f9c",
  rimShow: 0.5,
  /** The light on the deck at night and at first light: the sky's colour and strength, the sun's, and the exposure. */
  hemi: [["#4a62a8", 0.42], ["#b9c0d0", 0.95]] as const,
  sun: [["#8ea6e8", 0.5], ["#d6dbe8", 0.9]] as const,
  exposure: [1.25, 0.98] as const,
  /** The ship's lamp: its colour, its glow's size, how much it swells at a bank, and how low it burns when the patch is as far as it can be and still in sight (1 is no dimming). */
  lamp: "#ffb24a",
  lampSize: 7,
  lampPulse: 2.2,
  lampFar: 0.3,
  /** A wisp out in the cloud: how far under its usual height it rides, how much of its light shows, and how thick the cloud lying over its lower half is. Pulled, it lifts clear and is itself again. */
  sunk: 0.75,
  sunkLight: 0.5,
  puff: 0.9,
  /** The band along each rail where the far ones can be had: how strongly the planks are tinted there (0 is not at all). */
  leeway: 0.07,
  /** Seconds a wisp takes to lift out of the cloud when his staff takes it, and one the wind has taken astern to be gone from sight. */
  liftSec: 0.35,
  goneSec: 1.6,
  /** The ship's own pool of lamplight on the cloud round the hull: how wide and how strong when the patch is nearly lost, and when it is as near as it gets. It grows as he banks. */
  own: [[60, 0.1], [230, 0.3]] as const,
  /**
   * The islands he passes, all asleep: when each is level with the lamp (share of the run; they
   * come closer together toward home), which side, how wide, its heart's colour, and how many
   * doors have a lamp left burning. One is Kite Fell. Then how far outside the farthest lane they
   * pass, how fast (tiles a second), how wide and strong each one's pool of colour on the cloud is
   * (times its own width; strength at night and at first light), and how much of a pool is left
   * while the patch is level with it.
   */
  islands: [
    { at: 0.16, side: -1, r: 6.2, heart: "#62d6a0", lamps: 2, seed: 11 },
    { at: 0.42, side: 1, r: 6.8, heart: "#6fb4ff", lamps: 0, seed: 23, kite: true },
    { at: 0.62, side: -1, r: 5.6, heart: "#f08ab0", lamps: 1, seed: 37 },
    { at: 0.76, side: 1, r: 6.0, heart: "#b99cff", lamps: 2, seed: 41 },
  ] as readonly (IslandSpec & { at: number; side: number })[],
  islandOff: 4,
  islandSpeed: 2.4,
  pool: 2.3,
  poolShow: [0.46, 0.34] as const,
  poolDark: 0.1,
  /** Home's two hearts, under its two halves: their colours, and how wide and strong their pools are. */
  homeHearts: ["#ffb45e", "#a898ff"] as const,
  homePool: [22, 0.2] as const,
  /** Cloud banks standing up out of the sea, off beyond the lanes: how many, how much of them shows, and how much faster a tall one goes by than the sea (for each tile of its height). */
  banks: 14,
  bankShow: 0.5,
  bankLift: 0.14,
  /** The first seconds: a pale ring closing in the cloud astern, where the low one was. Seconds it lasts, its width at first and at last (tiles), and how strongly it shows. */
  ring: { sec: 10, from: 19, to: 2, show: 0.5 },
  /** Once, early: three small lamps in a line far off to starboard, going another way. Ticks they are in sight from and until, and how big each is. */
  boats: { from: 6, until: 64, size: 0.9 },
  /** The first warm colour, at the top edge, as home comes in. */
  dawn: "#f2a878",
  dawnShow: 0.32,
  /** Wind streaks over the deck: how many, and how fast (tiles a second). */
  streaks: 26,
  streakSpeed: 9,
  /** Home at the end: how far it comes in over the last seconds (tiles), how far ahead of the prow its tips stop, how far east of the ship the falls' mouth lies, the landing's length, and the crowd on the tips. */
  approach: 20,
  homeGap: 0.5,
  mouthEast: 9,
  pier: 6,
  crowd: 56,
  /** Seconds the cloud takes to lift again after a restart. */
  clearSec: 1.2,
} as const;

const WHITE = new THREE.Color("#ffffff"), TMP = new THREE.Color();
/** How far the prow runs ahead of the deck (tiles). */
const PROW = 4.2;

const VS = `
varying vec2 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FS = `
precision highp float;
varying vec2 vW;
uniform float uTime, uScroll, uGrain, uRag, uRimShow, uLamp, uRidge, uDawn;
uniform vec3 uPatch, uSea, uDark, uRim, uWarm, uDawnCol;
uniform vec2 uOwn;
uniform vec4 uRing;
uniform vec4 uPool[6];
uniform vec3 uPoolCol[6];
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
// The cloud's height: long ridges and furrows drawn out the way the ship is going.
float high(vec2 p) { return 0.62 * noise(p * vec2(0.19, 0.045)) + 0.26 * noise(p * vec2(0.43, 0.11) + 3.1) + 0.12 * noise(p * vec2(0.9, 0.3) + 9.7); }
void main() {
  // The sea goes by toward the stern.
  vec2 p = vec2(vW.x, vW.y - uScroll);
  float h = high(p);
  float n2 = fbm(p * vec2(0.5, 0.22) + 7.3);
  // Lit from one side: the near flank of each ridge is a little paler, and the furrow beyond it a little deeper.
  float slope = (h - high(p + vec2(1.1, 0.0))) * 5.0;
  float tops = smoothstep(0.42, 0.7, h) * (0.55 + 0.9 * n2);
  float furrow = 1.0 - smoothstep(0.3, 0.46, h);
  vec3 pale = uSea + vec3(0.42, 0.47, 0.6);
  vec3 col = uSea * (0.72 + 0.5 * h) + pale * (tops + uRidge * clamp(slope, 0.0, 1.0) * 0.8) * uGrain;
  col *= 1.0 - 0.22 * uRidge * furrow * clamp(uGrain * 2.0, 0.0, 1.0);
  float body = 0.55 + 0.9 * tops + 0.5 * h;
  // The islands' hearts light the cloud under them, each in its own colour.
  for (int i = 0; i < 6; i++) {
    vec2 dp = vW - uPool[i].xy;
    col += uPoolCol[i] * uPool[i].w * exp(-dot(dp, dp) / (uPool[i].z * uPool[i].z)) * body;
  }
  // Where the low one was: a pale ring closing.
  float rr = length(vW - uRing.xy) - uRing.z;
  col += vec3(0.62, 0.68, 0.85) * uRing.w * exp(-rr * rr / 1.6) * body;
  // The ship's own lamplight on the cloud round the hull.
  float d0 = length(vW * vec2(1.0, 0.55));
  col += uWarm * uLamp * uOwn.y * exp(-d0 * d0 / uOwn.x) * (0.6 + 0.8 * tops);
  // First light: a warm colour at the top edge, and nothing more.
  col += uDawnCol * uDawn * smoothstep(-24.0, -70.0, vW.y) * body;
  // The patch: a hole in the cloud with a hard, uneven edge, nothing in it, and a thin cold line round it.
  vec2 d = vW - uPatch.xy;
  float ang = atan(d.y, d.x);
  float edge = uPatch.z * (1.0 + uRag * (sin(ang * 3.0 + 1.3) + 0.6 * sin(ang * 5.0 - uTime * 0.5) + 0.5 * sin(ang * 9.0 + uTime * 0.8))) + (n2 - 0.5) * 0.4;
  float len = length(d);
  float k = 1.0 - smoothstep(edge - 0.14, edge, len);
  float rim = smoothstep(edge - 0.1, edge + 0.05, len) * (1.0 - smoothstep(edge + 0.05, edge + 0.9, len));
  col = mix(col, uDark, k);
  col += uRim * rim * uRimShow;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface ShipFrame {
  r: Ship;
  /** How far through the tick (0 to 1), and the time in seconds. */
  t: number;
  time: number;
  players: Map<number, { root: THREE.Object3D; beam: THREE.Object3D }>;
  /** Each wisp's drawing, and where each is (tiles from the lamp) and whether his staff is on it. */
  wisps: Map<number, { root: THREE.Object3D; halo: THREE.Sprite; light: THREE.PointLight }>;
  at: Map<number, { x: number; y: number; held: boolean }>;
}

export class ShipFx {
  readonly all = new THREE.Group();
  /** The sea's colour now, for the sky behind it. */
  readonly sea = new THREE.Color(SHIP.sky.night);
  private u = {
    uTime: { value: 0 }, uScroll: { value: 0 }, uGrain: { value: SHIP_LOOK.grain[0] as number }, uRag: { value: SHIP_LOOK.ragged as number }, uRimShow: { value: SHIP_LOOK.rimShow as number }, uLamp: { value: 1 },
    uPatch: { value: new THREE.Vector3(0, -30, SHIP.patch.size / 2) }, uSea: { value: new THREE.Color(SHIP.sky.night) }, uDark: { value: new THREE.Color(SHIP_LOOK.dark) }, uRim: { value: new THREE.Color(SHIP_LOOK.rim) }, uWarm: { value: new THREE.Color(SHIP_LOOK.lamp) },
    uRidge: { value: SHIP_LOOK.ridge as number }, uDawn: { value: 0 }, uDawnCol: { value: new THREE.Color(SHIP_LOOK.dawn) }, uOwn: { value: new THREE.Vector2(SHIP_LOOK.own[0][0], SHIP_LOOK.own[0][1]) }, uRing: { value: new THREE.Vector4(0, 0, 1, 0) },
    uPool: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 1, 0)) }, uPoolCol: { value: Array.from({ length: 6 }, () => new THREE.Color("#000000")) },
  };
  private night = new THREE.Color(SHIP.sky.night);
  private grey = new THREE.Color(SHIP.sky.grey);
  private lead = SHIP.patch.start as number;
  private lastLead = SHIP.patch.start as number;
  private pulse = -9;
  private lit = 1;
  private lampGlow: THREE.Sprite;
  private lampCore: THREE.Sprite;
  private lampBox: THREE.MeshStandardMaterial;
  private lampLight: THREE.PointLight;
  private streaks: { m: THREE.Mesh; v: number }[] = [];
  private veil: THREE.Mesh;
  private veilK = 0;
  private home = new THREE.Group();
  private last = 0;
  /** How far each wisp is sunk in the cloud (0 clear of it, 1 riding in it). */
  private sunk = new Map<number, number>();
  /** Wisps the wind has taken, going astern. */
  private goners: { s: THREE.Sprite; x: number; at: number }[] = [];
  private goneSeen = new Set<string>();
  /** The cloud lying over each wisp that is out in it. */
  private puffs = new Map<number, THREE.Sprite>();
  private puffMap = smokeTexture();
  private plankMap = plankTexture();
  private layMap: THREE.Texture | null = null;
  private barsU: { uLit: { value: number } };
  private isles: THREE.Group[] = [];
  private banks: { s: THREE.Sprite; side: number; off: number; y: number }[] = [];
  private boats: THREE.Sprite[] = [];
  private born = -1;
  private own = 0;

  constructor(private glow: Glow) {
    const std: Std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    const K = SHIP_LOOK, hw = SHIP_DECK.hw + 0.5, hl = SHIP_DECK.hl + 0.5;

    // The cloud sea.
    const plane = new THREE.PlaneGeometry(420, 420);
    plane.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.u }));
    sea.position.y = K.seaY;
    this.all.add(sea);

    // The hull: narrow and dark, the deck's rectangle with a long pointed prow ahead of it and a round stern, sitting in the cloud.
    const prow = PROW, round = 1.45;
    const shape = new THREE.Shape();
    // Drawn with the stern at +y: turned flat, +y is south and the depth goes down from just under the planks.
    shape.moveTo(-hw - 0.2, hl);
    shape.bezierCurveTo(-hw - 0.2, hl + round * 0.8, -2.6, hl + round, 0, hl + round);
    shape.bezierCurveTo(2.6, hl + round, hw + 0.2, hl + round * 0.8, hw + 0.2, hl);
    shape.lineTo(hw + 0.2, -hl);
    shape.quadraticCurveTo(hw + 0.1, -hl - prow * 0.55, 0, -hl - prow);
    shape.quadraticCurveTo(-hw - 0.1, -hl - prow * 0.55, -hw - 0.2, -hl);
    shape.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false, curveSegments: 10 });
    hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, std(SHIP_WOOD.hull, { roughness: 0.6 }));
    hull.position.y = 0.04;
    hull.receiveShadow = true;
    this.all.add(hull);
    // A paler strake along the hull's side, just under the rail, so its line reads from above.
    const wale = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).scale(1.012, 1, 1.004), std("#4a3525", { roughness: 0.5 }));
    wale.position.y = -0.15;
    this.all.add(wale);

    // The planking: long scrubbed boards bow to stern, and the same boards on the prow and the round of the stern.
    this.all.add(buildBoards(std, this.plankMap));
    const lay = this.plankMap.clone();
    lay.wrapS = lay.wrapT = THREE.RepeatWrapping;
    lay.repeat.set(2, 1 / 6);
    lay.needsUpdate = true;
    this.layMap = lay;
    const boards = std(SHIP_WOOD.board, { map: lay, roughness: 0.82, side: THREE.DoubleSide });
    const nose = new THREE.Shape();
    nose.moveTo(-hw, 0);
    nose.lineTo(hw, 0);
    nose.quadraticCurveTo(hw - 0.1, prow * 0.55, 0, prow - 0.25);
    nose.quadraticCurveTo(-hw + 0.1, prow * 0.55, -hw, 0);
    const noseMesh = new THREE.Mesh(new THREE.ShapeGeometry(nose, 10).rotateX(-Math.PI / 2), boards);
    noseMesh.position.set(0, 0.08, -hl);
    const aft = new THREE.Shape();
    aft.moveTo(-hw, 0);
    aft.bezierCurveTo(-hw, -round * 0.8, -2.6, -round + 0.15, 0, -round + 0.15);
    aft.bezierCurveTo(2.6, -round + 0.15, hw, -round * 0.8, hw, 0);
    const aftMesh = new THREE.Mesh(new THREE.ShapeGeometry(aft, 10).rotateX(-Math.PI / 2), boards);
    aftMesh.position.set(0, 0.08, hl);
    noseMesh.receiveShadow = aftMesh.receiveShadow = true;
    this.all.add(noseMesh, aftMesh);

    // The leeway: the planks from which he reaches everything out over that rail, a little paler along each side.
    const band = SHIP.railLeeway + 1;
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(band, hl * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffe2b0", transparent: true, opacity: K.leeway, depthWrite: false }));
      strip.position.set(sx * (hw - band / 2), 0.1, 0);
      strip.renderOrder = 2;
      this.all.add(strip);
    }

    // The rails: down both sides, round the stern, and along the prow to the stem.
    const curve = (f: (t: number) => [number, number], n: number) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
    const quad = (a: number, c: number, e: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * e;
    const cube = (a: number, c1: number, c2: number, e: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) * (1 - t) * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * e;
    this.all.add(buildRail(std, [[-hw, -hl], [-hw, hl]]), buildRail(std, [[hw, -hl], [hw, hl]]));
    for (const sx of [-1, 1]) {
      this.all.add(buildRail(std, curve((t) => [quad(sx * hw, sx * (hw - 0.1), 0, t), quad(-hl, -hl - prow * 0.55, -hl - prow + 0.2, t)], 5)));
      this.all.add(buildRail(std, curve((t) => [cube(sx * hw, sx * hw, sx * 2.6, 0, t), cube(hl, hl + round * 0.8, hl + round - 0.1, hl + round - 0.1, t)], 5)));
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.7, 10), std(SHIP_WOOD.rail, { roughness: 0.45 }));
    stem.position.set(0, 0.85, -hl - prow + 0.2);
    const stemCap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), brassOf(std));
    stemCap.position.set(0, 1.75, -hl - prow + 0.2);
    this.all.add(stem, stemCap);

    // What lies on the deck: hatch, cleats, ropes coiled flat, the lashed tiller, and the new rope that does not belong.
    this.all.add(buildFittings(std, this.plankMap));

    // The ship's lamp amidships, where a wisp is banked: a plain lamp in a brass cage, whose bars lie across the deck in its light, with a warm line round the edge of its plinth.
    this.lampBox = std("#ffd9a0", { emissive: K.lamp, emissiveIntensity: 1.6 });
    this.all.add(buildLamp(std, this.lampBox, 3.1));
    const bars = buildBars(K.lamp);
    this.barsU = bars.u;
    this.all.add(bars.mesh);
    this.lampGlow = this.glow(K.lamp, K.lampSize, 0.6);
    this.lampCore = this.glow("#fff0c8", K.lampSize * 0.3, 0.95);
    this.lampGlow.position.set(0, 3.1, 0);
    this.lampCore.position.set(0, 3.1, 0);
    this.lampGlow.renderOrder = this.lampCore.renderOrder = 6;
    this.lampLight = new THREE.PointLight("#ffb060", 70, 26, 1.5);
    this.lampLight.position.set(0, 3.3, 0);
    this.all.add(this.lampGlow, this.lampCore, this.lampLight);
    const s = 2.5, y = 0.12;
    const edge = [[-s, -s], [s, -s], [s, -s], [s, s], [s, s], [-s, s], [-s, s], [-s, -s]].map(([x, z]) => new THREE.Vector3(x!, y, z!));
    const rim = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0.7 }));
    this.all.add(rim);

    // The man at the stern: his back to us, his hands folded behind it, and the tiller lashed behind him. He never moves.
    const who = buildFixer(std);
    who.scale.setScalar(0.86);
    who.position.set(SHIP.figure[0], 0.08, SHIP.figure[1]);
    this.all.add(who);

    // The islands he passes, each put in its place as the run goes.
    for (const spec of K.islands) {
      const isle = buildIsland(std, this.glow, spec);
      isle.visible = false;
      this.isles.push(isle);
      this.all.add(isle);
    }
    // Cloud banks, standing up out of the sea off beyond the lanes: the tall ones go by faster.
    for (let i = 0; i < K.banks; i++) {
      // Not tested against the sea: a tall one stands partly under it, and the sea would cut it off in a line.
      const mat = new THREE.SpriteMaterial({ map: this.puffMap, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
      const sp = new THREE.Sprite(mat);
      const y = 0.4 + ((i * 37) % 10) * 0.34;
      sp.scale.set(8 + ((i * 53) % 10) * 0.6, 15 + ((i * 29) % 10) * 1.3, 1);
      sp.position.set(0, y, -82 + ((i * 61) % 116));
      sp.renderOrder = 1;
      this.banks.push({ s: sp, side: i % 2 ? 1 : -1, off: 7 + ((i * 17) % 10) * 2.4, y });
      this.all.add(sp);
    }
    // Hesta's boats, once, early: three small lamps in a line far off to starboard, going another way.
    for (let i = 0; i < 3; i++) {
      const lamp = this.glow("#ffd9a0", K.boats.size, 0);
      lamp.renderOrder = 5;
      lamp.visible = false;
      this.boats.push(lamp);
      this.all.add(lamp);
    }

    // The wind: thin pale streaks going over the deck from the bow to the stern.
    const streakMat = new THREE.MeshBasicMaterial({ color: "#c9d6f0", transparent: true, opacity: 0.1, depthWrite: false });
    for (let i = 0; i < K.streaks; i++) {
      const len = 1.2 + ((i * 37) % 10) * 0.16;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.05, len).rotateX(-Math.PI / 2), streakMat);
      mesh.position.set(-13 + ((i * 53) % 260) / 10, 0.9 + ((i * 17) % 10) * 0.12, -18 + ((i * 29) % 34));
      mesh.renderOrder = 4;
      this.streaks.push({ m: mesh, v: 0.75 + ((i * 13) % 10) * 0.05 });
      this.all.add(mesh);
    }

    // Home, which comes in over the top of the screen at the end.
    this.buildHome(std);
    this.home.visible = false;
    this.all.add(this.home);

    // The cloud the ship goes into when the patch is lost: over everything, and gone again at the bow.
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#232838", transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.veil.position.y = 6;
    this.veil.renderOrder = 20;
    this.veil.visible = false;
    this.all.add(this.veil);
  }

  /**
   * Home's north end as the ship comes at it, turned so its two tips point at him: the falls'
   * mouth between them with one small light on the stone, both tips crowded with glows and every
   * back to him, no window lit, and the landing run out along his side with nobody on it.
   * Its own coordinates: x east from the mouth, z = 0 at the tips' ends, the land going north.
   */
  private buildHome(std: Std) {
    const K = SHIP_LOOK, g = this.home;
    const land = new THREE.Shape();
    const pts: [number, number][] = [[-13, 0], [-17, 2], [-24, 6], [-34, 11], [-46, 18], [-60, 30], [-60, 90], [60, 90], [60, 30], [46, 18], [34, 11], [24, 6], [17, 2], [13, 0], [5, 0], [3.5, 1.5], [3.5, 30], [2.5, 33], [0, 34.5], [-2.5, 33], [-3.5, 30], [-3.5, 1.5], [-5, 0]];
    pts.forEach(([x, v], i) => (i === 0 ? land.moveTo(x, v) : land.lineTo(x, v)));
    land.closePath();
    // Turned flat the other way: the shape's +y goes north, and its depth goes up to the ground.
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(land, { depth: 7, bevelEnabled: false }).rotateX(-Math.PI / 2), std("#4c6048", { roughness: 1 }));
    body.position.y = 0.35 - 7;
    body.receiveShadow = true;
    g.add(body);
    // The lake in the channel, and its water going over the lip either side of the stone.
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(7, 34).rotateX(-Math.PI / 2), std("#27344c", { roughness: 0.35, metalness: 0.2 }));
    lake.position.set(0, 0.12, -17);
    g.add(lake);
    const white = new THREE.MeshBasicMaterial({ color: "#aebbd6", transparent: true, opacity: 0.5, depthWrite: false });
    for (const sx of [-1, 1]) {
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 7), white);
      fall.position.set(sx * 2.2, -3.3, 0.05);
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6).rotateX(-Math.PI / 2), white);
      foam.position.set(sx * 2.2, 0.14, -0.7);
      g.add(fall, foam);
    }
    // The stone at the lip, and the one small warm light on it.
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.5, 14), std("#6d7180", { roughness: 1 }));
    stone.position.set(0, 0.3, -0.9);
    const lit = this.glow("#ffb24a", 2.6, 0.75), core = this.glow("#fff0c8", 0.8, 1);
    lit.position.set(0, 0.95, -0.9);
    core.position.set(0, 0.95, -0.9);
    lit.renderOrder = core.renderOrder = 6;
    g.add(stone, lit, core);
    // Houses inland, every window dark.
    const slate = std("#3d4250"), pane = std("#15171c");
    for (const [i, [x, v]] of ([[-13, 9], [-22, 12], [-10, 16], [12, 9], [21, 12], [10, 17], [-30, 16], [31, 17]] as const).entries()) {
      const h = new THREE.Group(), w = 2.6, tall = 1.9 + (i % 3) * 0.25;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, tall, w), std(["#8f8a80", "#86837b", "#968c7c"][i % 3]!));
      walls.position.y = tall / 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.5, 4), slate);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = tall + 0.75;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.06), pane);
      win.position.set(0.5, tall * 0.58, w / 2 + 0.02);
      h.add(walls, roof, win);
      h.position.set(x, 0.35, -v);
      g.add(h);
    }
    // Everyone, on the two tips, along the channel's edges and the ends, all turned to the water. Nobody near the landing.
    const cloth = ["#4b5a6e", "#6a5746", "#5d6b52", "#70606e", "#4f4f5c", "#7a6a50", "#80705a", "#55606c"];
    const tints = ["#ffcf8a", "#bfe0ff", "#ffd9c0", "#c9f0c0"];
    for (let i = 0; i < K.crowd; i++) {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      // Rows back from the channel's edge, thinning away from it.
      const row = k % 4, along = Math.floor(k / 4);
      const x = side * (4.3 + row * 0.95 + ((i * 13) % 5) * 0.1), v = 1.2 + along * 1.25 + (row % 2) * 0.5 + ((i * 7) % 4) * 0.08;
      const small = i % 5 === 0, h = small ? 0.8 : 1.2 + ((i * 37) % 5) * 0.05;
      const p = new THREE.Group();
      p.add(...figure(std, cloth[(i * 5) % cloth.length]!, h, small));
      const glow = this.glow(tints[i % 4]!, 1.3, 0.5);
      glow.position.set(-side * 0.25, h * 0.75, 0);
      glow.renderOrder = 6;
      p.add(glow);
      p.position.set(x, 0.35, -v);
      g.add(p);
    }
    // The landing: planks run out south along the ship's side from the west tip's shoulder, a post at the end with its lamp unlit, and nobody.
    const px = -K.mouthEast - (SHIP_DECK.hw + 2.6), wood = std("#7d5c3c");
    const n = K.pier + 6;
    const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.9, 0.12, 0.94), wood, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) planks.setMatrixAt(i, m.makeTranslation(px, 0.36 + (i % 3) * 0.006, K.pier - 0.5 - i));
    planks.receiveShadow = true;
    g.add(planks);
    for (const z of [K.pier - 0.6, 1]) {
      for (const sx of [-1.3, 1.3]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 6, 8), std("#4e3a28"));
        leg.position.set(px + sx, -2.6, z);
        g.add(leg);
      }
    }
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.9, 8), std("#2c2f38"));
    lampPost.position.set(px - 1.1, 1.3, K.pier - 1);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34), std("#2a2622"));
    lampBox.position.set(px - 1.1, 2.4, K.pier - 1);
    g.add(lampPost, lampBox);
    g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  }

  step(f: ShipFrame) {
    const { r, time } = f, K = SHIP_LOOK, P = SHIP.patch;
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    this.u.uTime.value = time;
    // The sea goes by faster the nearer he is to the patch.
    const nearness = Math.max(0, Math.min(1, (P.gone - this.lead) / (P.gone - P.nearest)));
    const stream = K.stream * (K.gainSpeed[0] + (K.gainSpeed[1] - K.gainSpeed[0]) * nearness);
    this.u.uScroll.value += stream * dt;

    // The second clock: the sea goes from night to grey.
    this.sea.copy(this.night).lerp(this.grey, r.light);
    this.u.uSea.value.copy(this.sea);
    this.u.uGrain.value = K.grain[0] + (K.grain[1] - K.grain[0]) * r.light;
    this.u.uRimShow.value = K.rimShow * (1 - 0.7 * r.light);

    // The one meter: the patch ahead of the bow. The picture follows the number a little behind.
    if (r.lead < this.lastLead - 0.01) this.pulse = time;
    this.lastLead = r.lead;
    this.lead += (r.lead - this.lead) * P.ease;
    const bow = -(SHIP_DECK.hl + 0.5);
    // Its distance is spread up the screen: just clear of the prow at its nearest, at the top edge when it is lost.
    const away = Math.max(0, Math.min(1.05, (this.lead - P.nearest) / (P.gone - P.nearest)));
    const uNear = 1 / (K.patchNear + K.patchLens), uFar = 1 / (K.patchFar + K.patchLens);
    this.u.uPatch.value.set(0, bow - PROW - (1 / (uNear + (uFar - uNear) * away) - K.patchLens) - P.size / 2, P.size / 2);
    const patchZ = this.u.uPatch.value.y;

    // The ship's own pool of lamplight on the cloud: it grows as he banks.
    this.own += (nearness - this.own) * 0.04;
    this.u.uOwn.value.set(K.own[0][0] + (K.own[1][0] - K.own[0][0]) * this.own, K.own[0][1] + (K.own[1][1] - K.own[0][1]) * this.own);

    // The islands: each comes from ahead, passes outside the lanes, and goes astern. Its heart lights the
    // cloud under it; while the patch is level with it that pool is dark, and it comes back when the patch has passed.
    const clock = r.tick + (r.gutter === undefined && r.over === undefined ? f.t : 0), show = K.poolShow[0] + (K.poolShow[1] - K.poolShow[0]) * r.light;
    K.islands.forEach((spec, i) => {
      const isle = this.isles[i]!, z = (clock - spec.at * r.ticks) * 0.6 * K.islandSpeed, x = spec.side * (r.far + K.islandOff + spec.r);
      isle.visible = Math.abs(z) < 90;
      isle.position.set(x, 0, z);
      const R = spec.r * K.pool, dz = Math.abs(patchZ - z);
      const lit = K.poolDark + (1 - K.poolDark) * Math.max(0, Math.min(1, (dz - R * 0.45) / (R * 0.5)));
      this.u.uPool.value[i]!.set(x, z, R, isle.visible ? show * lit : 0);
      this.u.uPoolCol.value[i]!.set(spec.heart);
    });

    // Cloud banks going by, the tall ones faster; they thin as home comes in.
    for (const b of this.banks) {
      b.s.position.x = b.side * (r.far + b.off);
      b.s.position.z += stream * (1 + K.bankLift * b.y) * dt;
      if (b.s.position.z > 36) b.s.position.z -= 118;
      b.s.material.color.copy(this.sea).add(TMP.setRGB(0.42, 0.47, 0.6).multiplyScalar(0.16 + 0.5 * r.light));
      b.s.material.opacity = K.bankShow * (1 - 0.85 * r.home) * Math.min(1, (36 - b.s.position.z) / 10);
    }

    // The first seconds: where the low one was, a pale ring closing in the cloud astern.
    if (this.born < 0) this.born = time;
    const age = (time - this.born) / K.ring.sec;
    this.u.uRing.value.set(0, SHIP_DECK.hl + 3 + age * K.ring.sec * 1.3, K.ring.from + (K.ring.to - K.ring.from) * Math.min(1, age), age < 1 ? K.ring.show * (1 - age) ** 0.8 : 0);

    // Hesta's three boats, far off to starboard and going another way: seen once, then behind him.
    const bt = clock - K.boats.from, span = K.boats.until - K.boats.from;
    this.boats.forEach((lamp, i) => {
      lamp.visible = bt > 0 && bt < span && r.gutter === undefined;
      if (!lamp.visible) return;
      const along = bt * 0.6 - i * 2.6;
      lamp.position.set(r.far + 7 + along * 0.45, 0.2, -30 + along * 1.25);
      lamp.material.opacity = 0.75 * Math.min(1, bt / 5, (span - bt) / 5);
    });

    // First light, at the top edge, as home comes in.
    this.u.uDawn.value = K.dawnShow * r.home;

    // The lamp: it swells as one goes in, and gutters out when the patch is lost.
    const gut = r.gutter;
    const want = gut === undefined ? 1 : Math.max(0, 1 - (gut + f.t) / (P.gutterTicks * 0.45));
    this.lit += (want - this.lit) * (want < this.lit ? 0.25 : 0.06);
    const flick = gut === undefined ? 0.96 + 0.04 * Math.sin(time * 2.3) : 0.55 + 0.45 * Math.sin(time * 31) * Math.sin(time * 17);
    const pulse = Math.max(0, 1 - (time - this.pulse) / 0.6);
    // It burns lower the farther the patch draws away.
    const far = Math.max(0, Math.min(1, (this.lead - P.nearest) / (P.gone - P.nearest)));
    const lit = Math.max(0, this.lit * flick) * (1 - (1 - K.lampFar) * far * far);
    this.lampGlow.scale.setScalar(K.lampSize * (0.5 + 0.5 * lit) + pulse * K.lampPulse);
    this.lampGlow.material.opacity = 0.6 * lit;
    this.lampCore.material.opacity = 0.95 * lit;
    this.lampBox.emissiveIntensity = 1.6 * lit + pulse;
    this.lampLight.intensity = 70 * lit + 40 * pulse;
    this.u.uLamp.value = lit;
    this.barsU.uLit.value = lit;

    // Into the cloud, and out of it again at the bow.
    const veilWant = gut === undefined ? 0 : Math.min(1, Math.max(0, (gut + f.t - 1) / (P.gutterTicks - 2)));
    this.veilK = gut === undefined ? Math.max(0, this.veilK - dt / K.clearSec) : Math.max(this.veilK, veilWant);
    this.veil.visible = this.veilK > 0.004;
    (this.veil.material as THREE.MeshBasicMaterial).color.copy(this.sea).lerp(WHITE, 0.1).multiplyScalar(0.4);
    (this.veil.material as THREE.MeshBasicMaterial).opacity = this.veilK * 0.97;

    // Wisps out in the cloud ride half sunk in it and dim; one his staff has, or one over the deck, is clear of it and bright.
    for (const [id, rig] of f.wisps) {
      const w = f.at.get(id);
      if (!w) continue;
      const want = !w.held && !onDeck(w.x, w.y) ? 1 : 0;
      let k = this.sunk.get(id) ?? want;
      k += Math.sign(want - k) * Math.min(Math.abs(want - k), dt / K.liftSec);
      this.sunk.set(id, k);
      rig.root.position.y -= K.sunk * k;
      rig.halo.material.opacity *= 1 - (1 - K.sunkLight) * k;
      rig.light.intensity *= 1 - k;
      let puff = this.puffs.get(id);
      if (!puff) {
        puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffMap, transparent: true, opacity: 0, depthWrite: false }));
        puff.renderOrder = 7;
        this.puffs.set(id, puff);
        this.all.add(puff);
      }
      puff.visible = k > 0.02 && rig.root.visible;
      puff.position.set(rig.root.position.x + Math.sin(time * 0.9 + id) * 0.08, rig.root.position.y - 0.42, rig.root.position.z + 0.3);
      puff.scale.set(1.9, 0.95, 1);
      puff.material.color.copy(this.sea).lerp(WHITE, 0.3);
      puff.material.opacity = K.puff * k;
    }
    for (const [id, puff] of this.puffs) if (!f.wisps.has(id)) (puff.removeFromParent(), puff.material.dispose(), this.puffs.delete(id));
    // One the wind has taken: a dim light going away astern in the cloud, quickly, and out.
    for (const o of r.lost ?? []) {
      const key = `${o.tick}:${o.x}`;
      if (this.goneSeen.has(key)) continue;
      this.goneSeen.add(key);
      const s = this.glow("#ffd9a0", 1.5, 0.5);
      s.renderOrder = 5;
      this.all.add(s);
      this.goners.push({ s, x: o.x, at: time });
    }
    if (!r.lost?.length && this.goneSeen.size > 64) this.goneSeen.clear();
    this.goners = this.goners.filter((o) => {
      const k = (time - o.at) / K.goneSec;
      if (k >= 1) return o.s.removeFromParent(), o.s.material.dispose(), false;
      o.s.position.set(o.x, K.seaY + 0.35 - k * 0.5, SHIP_DECK.hl + SHIP.astern + 1 + k * (6 + K.stream * K.goneSec));
      o.s.scale.setScalar(1.5 * (1 - 0.6 * k));
      o.s.material.opacity = 0.5 * (1 - k) ** 1.5;
      return true;
    });

    // The wind.
    for (const s of this.streaks) {
      s.m.position.z += K.streakSpeed * s.v * dt;
      if (s.m.position.z > 16) s.m.position.z -= 34;
    }

    // Home: in over the top of the screen through the last seconds, at the ship's own speed. It does not slow.
    this.home.visible = r.home > 0;
    if (r.home > 0) {
      const h = Math.min(1, r.home - (1 - f.t) / Math.ceil((SHIP.endSec * 1000) / 600));
      this.home.position.set(K.mouthEast, 0, bow - PROW - K.homeGap - (1 - h) * K.approach);
    }
    // Home's two hearts light the cloud under its two halves.
    for (const [i, sx] of [-1, 1].entries()) {
      this.u.uPool.value[4 + i]!.set(this.home.position.x + sx * 26, this.home.position.z - 13, K.homePool[0], r.home > 0 ? K.homePool[1] : 0);
      this.u.uPoolCol.value[4 + i]!.set(K.homeHearts[i]!);
    }

    if (r.over === undefined) this.from = null;
  }

  /** He goes over the rail before it touches: to the side the landing is on, up, and over. Called once his place for the frame is set. */
  overRail(rook: { root: THREE.Object3D; beam: THREE.Object3D }, over: number, t: number) {
    const k = Math.min(1, (over + t) / SHIP.railTicks), at = rook.root.position;
    const run = Math.min(1, k / 0.55), hop = Math.max(0, (k - 0.55) / 0.45);
    const edge = -(SHIP_DECK.hw + 0.1);
    if (this.from === null) this.from = at.clone();
    at.x = this.from.x + (edge - this.from.x) * run - hop * 1.9;
    at.y = this.from.y + Math.sin(Math.min(1, hop * 1.15) * Math.PI) * 1.5 + hop * 0.4;
    at.z = this.from.z - run * 1.2;
    rook.beam.visible = false;
  }
  private from: THREE.Vector3 | null = null;

  dispose() {
    this.all.removeFromParent();
    this.puffMap.dispose();
    this.plankMap.dispose();
    this.layMap?.dispose();
    this.all.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
