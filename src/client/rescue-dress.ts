// Run 9, the rescue: what the low one has that no other board does. The cloud lying on the ground
// at ankle height with its wall closing on the landing, the dark patch in it, the landing's planks
// and slip, the three boats and their lamps, the crowd waiting and going aboard, the island's cold
// brazier, its houses and its path lamps. All block-outs: nothing here is drawn art yet. World
// units are tiles, the origin at the slip.

import * as THREE from "three";
import type { StoryView } from "../engine/protocol.js";
import { LO_BRAZIER, LO_HOUSES, LO_LAMPS, LO_LANDING, LO_OVAL, RESCUE, loPlanks } from "../engine/rescue.js";

type Rescue = NonNullable<StoryView["rescue"]>;
type Glow = (color: string, size: number, opacity?: number) => THREE.Sprite;

/** How it looks, in one place. */
export const RESCUE_LOOK = {
  /** The cloud lying on the ground: how thick its banks are (0 to 1), its height, and the wall's. */
  sea: 0.27,
  seaY: 0.22,
  wallY: 1.1,
  /** How wide the bright line along the cloud's front is (tiles; 0 for none). */
  front: 0.55,
  /** The cloud's colours (shade and light), and the stain's: its dark, and how much of the cloud's own texture shows in it. */
  pale: ["#8d98b4", "#d3d9e8"] as const,
  dark: "#04050a",
  stainShow: 0.09,
  /** How uneven the stain's edge is (a share of its half-width). */
  ragged: 0.07,
  /** Seconds a boat takes to lift away, and the next to slide into the slip. */
  liftSec: 3.4,
  slideSec: 1.6,
  /** A boat: half its width and half its length (tiles), and how far its middle lies south of the slip. */
  boat: { w: 1.7, l: 4.3, south: 3.1 },
  /** Which of the three house models stands at each of LO_HOUSES, and where the boat model's lantern hangs (up, and from its middle toward the stern). */
  houses: ["a", "b", "c", "c", "a"] as readonly string[],
  lantern: [3.36, -3.43] as const,
  /**
   * The queue: where the next boat and the one after wait (tiles from the slip, and how far they
   * are turned, stern toward the slip), one behind the other off the east wing. They are dark
   * (`waiting` of their own colour, no lamp) until they come into the slip.
   */
  berths: [[9.4, 2.7, 1.26], [10.0, 6.5, 1.26]] as const,
  waiting: 0.42,
  /** The pips, on a yard across the lamp post so they read from above: how big, how far apart, how high, and the size of a lit one's glow. */
  pip: { r: 0.27, gap: 0.72, top: 2.5, glow: 1.7 },
  /**
   * The lamp does not keep its light: before the newest pip goes it flickers (`hz` at first, quicker
   * as its time runs out, down to `low` of its light), and the cloud laps at the foot of the lamp
   * post, so the cloud reads as the cause: pale wisps of it, their size and how solid, climbing the
   * post to `rise`, and staying `after` seconds once the pip is out.
   */
  gutter: { hz: 15, low: 0.12, mist: "#e4e9f6", size: 2.1, opacity: 0.62, rise: 1.5, after: 2.2 },
  /** The lamp's light on the planks (where a wisp flies in from): its colour and how strong, and seconds a wisp takes to fly in. */
  pool: "#ffc070",
  poolShow: 0.34,
  flySec: 0.4,
  /** Kes's stones: how many, their colour, and how strong the pale ring on the ground is. */
  stones: 9,
  stone: "#c9ccd6",
  stoneRing: 0.5,
  /** People waiting on the landing's wings: this many go with each boat, some as each bank goes in. */
  perBoat: 8,
  /** The lane on the ground along its course, ahead of it: its colour and how strong it is (0 is none). */
  lane: "#1b2440",
  laneShow: 1,
  /** A lamp gone cold ahead of the patch: its ember's colour and how bright it is (a lit one is 1). */
  ember: "#ff4a1a",
  emberLit: 0.07,
  /** Seconds a wick of smoke stands where a wisp went out, and how far it rises. */
  smokeSec: 2,
  smokeRise: 2.2,
} as const;

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
uniform float uTime, uCloud, uBase, uVeil, uPatchA, uRag, uShow, uLane, uLaneR, uEdge;
uniform vec3 uCold;
uniform vec3 uPatch, uLo, uHi, uDark;
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
void main() {
  float n = fbm(vW * 0.2 + vec2(uTime * 0.05, uTime * 0.02));
  float n2 = fbm(vW * 0.55 - vec2(uTime * 0.07, uTime * 0.01));
  // The wall: everything farther from the slip than the cloud's edge, its face a little ragged.
  float wall = smoothstep(uCloud - 1.6, uCloud + 0.6, length(vW) + (n - 0.5) * 2.4);
  // On the ground it lies in banks, with the ground showing between them.
  float lay = smoothstep(0.36, 0.66, n);
  float a = uVeil > 0.5 ? wall * 0.94 : mix(uBase * (0.22 + 1.7 * lay * (0.5 + n2)), 0.97, wall);
  vec3 col = mix(uLo, uHi, clamp(n * 1.3, 0.0, 1.0));
  // The front of it: a pale, bright line along the wall's foot, so how far it has come can be read at a glance.
  float front = (1.0 - smoothstep(0.0, uEdge, abs(length(vW) + (n - 0.5) * 2.4 - uCloud + 0.6))) * (1.0 - uVeil);
  col = mix(col, vec3(1.0, 0.99, 0.96), front * 0.85);
  a = max(a, front * 0.9);
  // The patch: a stain in the cloud with a hard, uneven edge. The cloud's own grain shows in it, faintly; the ground under it does not.
  vec2 d = vW - uPatch.xy;
  float ang = atan(d.y, d.x);
  float edge = uPatch.z * (1.0 + uRag * (sin(ang * 3.0 + 1.3) + 0.6 * sin(ang * 5.0 - uTime * 0.5) + 0.5 * sin(ang * 9.0 + uTime * 0.8))) + (n2 - 0.5) * 0.5;
  float k = (1.0 - smoothstep(edge - 0.12, edge, length(d))) * uPatchA * (1.0 - uVeil);
  // Its course ahead of it: a faint cold lane on the ground, with a thin line down its middle, as far as the land goes.
  float ahead = step(uPatch.x, vW.x) * (1.0 - smoothstep(20.0, 23.0, abs(vW.x))) * (1.0 - wall) * (1.0 - uVeil) * uLane;
  float lane = (1.0 - smoothstep(uLaneR * 0.8, uLaneR, abs(d.y))) * 0.22 + (1.0 - smoothstep(0.05, 0.16, abs(d.y))) * 0.5;
  col = mix(col, uCold, clamp(lane * ahead, 0.0, 1.0));
  a = max(a, lane * ahead * 0.9);
  col = mix(col, uDark + col * uShow * (0.3 + 1.2 * n2 * n), k);
  a = mix(a, 0.97, k);
  gl_FragColor = vec4(col, a);
}`;

interface Lamp { x: number; z: number; glow: THREE.Sprite; core: THREE.Sprite; box: THREE.MeshStandardMaterial; lit: number; seed: number; coldAt: number; size: number; warm: THREE.Color }
interface Boat { root: THREE.Group; shell: THREE.Group; real: boolean; lamp: THREE.Sprite; core: THREE.Sprite; pips: THREE.Mesh[]; pipGlows: THREE.Sprite[]; mist: THREE.Sprite[]; mistOn: number; wentAt: number; seated: number; riders: THREE.Object3D[]; paint: { m: THREE.MeshStandardMaterial; base: THREE.Color; glow?: number }[]; at: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; rot: number; rotFrom: number; rotTo: number; movedAt: number; liftedAt: number; fill: number; pulse: number; lit: number }
interface Fly { s: THREE.Sprite; from: THREE.Vector3; at: number }
interface Body { root: THREE.Group; glow: THREE.Sprite; group: number; seat: number; gone: number }
interface Smoke { s: THREE.Sprite; x: number; z: number; at: number }

export interface RescueFrame {
  r: Rescue;
  /** How far through the tick (0 to 1), and the time in seconds. */
  t: number;
  time: number;
  /** Half the board's size in tiles (tiles are world units from the board's middle). */
  half: { w: number; h: number };
  wisps: Map<number, { root: THREE.Object3D; halo: THREE.Sprite; light: THREE.PointLight }>;
  players: Map<number, { root: THREE.Object3D; lantern: THREE.Sprite; beam: THREE.Object3D }>;
}

/** A soft grey blob, for smoke (the glow sprites add light, and smoke must not). */
export function smokeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class RescueFx {
  readonly all = new THREE.Group();
  private u = {
    uTime: { value: 0 }, uCloud: { value: RESCUE.cloud.start as number }, uBase: { value: RESCUE_LOOK.sea as number }, uVeil: { value: 0 }, uPatchA: { value: 0 },
    uRag: { value: RESCUE_LOOK.ragged as number }, uShow: { value: RESCUE_LOOK.stainShow as number }, uLane: { value: 0 }, uLaneR: { value: 3 }, uEdge: { value: RESCUE_LOOK.front as number }, uCold: { value: new THREE.Color(RESCUE_LOOK.lane) },
    uPatch: { value: new THREE.Vector3(0, 0, 3) }, uLo: { value: new THREE.Color(RESCUE_LOOK.pale[0]) }, uHi: { value: new THREE.Color(RESCUE_LOOK.pale[1]) }, uDark: { value: new THREE.Color(RESCUE_LOOK.dark) },
  };
  private lamps: Lamp[] = [];
  private boats: Boat[] = [];
  private bodies: Body[] = [];
  private smokes: Smoke[] = [];
  private flies: Fly[] = [];
  private flown = new Set<string>();
  private pool!: THREE.Mesh;
  private poolLit = 0;
  private poolPulse = -9;
  private stones: THREE.Group | null = null;
  /** The block-outs that the maps thread's models take the place of, once each has loaded: what, which model, and how it is turned. */
  private swaps: { group: THREE.Group; name: string; turn: number }[] = [];
  /** The patch's size as drawn, eased toward what it is. */
  private pr = 3;
  private patchBig = 0;
  private smoked = new Set<string>();
  private smokeMap = smokeTexture();
  private lifted = 0;
  /** The last pip that guttered out, as the room's tick. */
  private wentSeen = -9;
  private patchN = 0;
  private cloud = RESCUE.cloud.start as number;
  private ember = new THREE.Color(RESCUE_LOOK.ember);

  constructor(private glow: Glow, private model: (name: string) => THREE.Object3D | undefined = () => undefined) {
    const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    const K = RESCUE_LOOK;
    // The cloud on the ground, and the wall's body standing on it.
    const plane = new THREE.PlaneGeometry(260, 260);
    plane.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.u, transparent: true, depthWrite: false }));
    sea.position.set(0, K.seaY, LO_OVAL.y);
    sea.renderOrder = 3;
    const veil = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { ...this.u, uVeil: { value: 1 } }, transparent: true, depthWrite: false }));
    veil.position.set(0, K.wallY, LO_OVAL.y);
    veil.renderOrder = 5;
    this.all.add(sea, veil);
    // The docked boat's lamplight on the planks: a wisp pulled into it flies into the lamp. It shows through the cloud.
    const poolGeo = new THREE.CircleGeometry(RESCUE.lamp.take, 56);
    poolGeo.rotateX(-Math.PI / 2);
    this.pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTexture(), color: K.pool, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pool.position.set(RESCUE.lamp.at[0], K.seaY + 0.07, RESCUE.lamp.at[1]);
    this.pool.renderOrder = 6;
    this.all.add(this.pool);

    // The landing: planks round the slip, on posts over the sky, with a wide wing each side where the crowd waits.
    const wood = std("#7d5c3c"), dark = std("#4e3a28");
    const L = LO_LANDING;
    const tiles: [number, number][] = [];
    for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) if (loPlanks(x, y)) tiles.push([x, y]);
    for (const wing of [-1, 1]) for (let y = WING.y0; y <= WING.y1; y++) for (let x = WING.x0; x <= WING.x1; x++) tiles.push([wing * x, y]);
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(0.97, 0.1, 0.97), wood, tiles.length);
    const m = new THREE.Matrix4();
    tiles.forEach(([x, y], i) => deck.setMatrixAt(i, m.makeTranslation(x, 0.05 + ((x * 7 + y * 3) % 3) * 0.006, y)));
    deck.receiveShadow = deck.castShadow = true;
    this.all.add(deck);
    for (const [x, y] of [[L.x0, L.y1], [L.x1, L.y1], [L.x0, -1], [L.x1, -1], [-WING.x1, WING.y1], [WING.x1, WING.y1], [-WING.x1, WING.y0], [WING.x1, WING.y0], [-8, WING.y1], [8, WING.y1]] as const) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 5, 8), dark);
      post.position.set(x, -2.3, y + 0.3);
      this.all.add(post);
    }

    // The island's own brazier, cold: a dark bowl on its plinth, nothing in it.
    const stone = std("#3d4250", { roughness: 1 });
    const cold = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.5, 24), stone);
    plinth.position.y = 0.25;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.0, 20), stone);
    stem.position.y = 0.95;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.7, 0.7, 28, 1, true), std("#2f3440", { roughness: 1, side: THREE.DoubleSide }));
    bowl.position.y = 1.75;
    const ash = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), std("#17181d", { roughness: 1 }));
    ash.rotation.x = -Math.PI / 2;
    ash.position.y = 1.72;
    cold.add(plinth, stem, bowl, ash);
    cold.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
    cold.position.set(LO_BRAZIER.x, 0, LO_BRAZIER.y);
    this.all.add(cold);
    this.swaps.push({ group: cold, name: "cold-brazier", turn: 0 });

    // Path lamps: a post and a lantern each. They go cold ahead of the patch and are dark under it.
    const iron = std("#2c2f38", { roughness: 0.7 });
    const light = (x: number, yy: number, z: number, box: THREE.MeshStandardMaterial, size: number, color = "#ffb65a") => {
      const glow = this.glow(color, size, 0.55), core = this.glow("#ffe6b0", size * 0.3, 0.9);
      glow.position.set(x, yy, z);
      core.position.set(x, yy, z);
      glow.renderOrder = core.renderOrder = 6;
      this.all.add(glow, core);
      this.lamps.push({ x, z, glow, core, box, lit: 1, seed: this.lamps.length * 1.7 + 0.3, coldAt: -1, size, warm: (core.material.color as THREE.Color).clone() });
    };
    for (const [x, z] of LO_LAMPS) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.9, 8), iron);
      post.position.set(x, 0.95, z);
      post.castShadow = true;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34), std("#ffd9a0", { emissive: "#ffb65a", emissiveIntensity: 1.2 }));
      box.position.set(x, 2.05, z);
      this.all.add(post, box);
      light(x, 2.05, z, box.material as THREE.MeshStandardMaterial, 2.8);
    }

    // The houses: plaster and slate, a door, and windows still lit with nobody home.
    const plaster = ["#b4ad9f", "#a9a69c", "#bdb19d"], slate = std("#474c5a"), doorM = std("#3a2a1e");
    LO_HOUSES.forEach(([x, z], i) => {
      const h = new THREE.Group();
      const w = 2.6, tall = 1.9 + (i % 3) * 0.25;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, tall, w), std(plaster[i % plaster.length]!));
      walls.position.y = tall / 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.5, 4), slate);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = tall + 0.75;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.06), doorM);
      door.position.set(-0.55, 0.55, w / 2 + 0.02);
      const pane = std("#ffd9a0", { emissive: "#ffb65a", emissiveIntensity: 1.2 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.06), pane);
      win.position.set(0.55, tall * 0.58, w / 2 + 0.02);
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.55), pane);
      side.position.set((x < 0 ? 1 : -1) * (w / 2 + 0.02), tall * 0.58, 0.2);
      h.add(walls, roof, door, win, side);
      h.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
      h.position.set(x, 0, z);
      this.all.add(h);
      // The maps thread's three houses, as it placed them; fronts to the south, toward the eye.
      this.swaps.push({ group: h, name: `low-house-${K.houses[i % K.houses.length]}`, turn: 0 });
      light(x + 0.55, tall * 0.58, z + w / 2 + 0.25, pane, 2.2, "#ffb24a");
    });

    // The boats: the first lies stern-in at the slip, the others wait in a queue off the east wing.
    for (let i = 0; i < RESCUE.boats; i++) {
      const b = this.makeBoat(std, i);
      b.at.copy(this.berth(i));
      b.from.copy(b.at);
      b.to.copy(b.at);
      b.rot = b.rotFrom = b.rotTo = this.turn(i);
      b.seated = 0;
      b.wentAt = -9;
      b.lit = i === 0 ? 1 : 0;
      b.root.position.copy(b.at);
      this.boats.push(b);
      this.all.add(b.root);
    }

    // The crowd on the wings: a boatload goes with each boat, two at each bank. The first boat's are the little ones.
    const cloth = ["#4b5a6e", "#6a5746", "#5d6b52", "#70606e", "#4f4f5c", "#7a6a50", "#80705a", "#55606c"];
    const n = RESCUE.boats * K.perBoat, perSide = n / 2, cols = Math.ceil(perSide / 3);
    for (let i = 0; i < n; i++) {
      // Dealt out so each boat's people stand on both wings, the first boat's nearest the slip.
      const group = i % RESCUE.boats, seat = Math.floor(i / RESCUE.boats), side = seat % 2 ? 1 : -1, k = Math.floor(seat / 2) * RESCUE.boats + group;
      const root = new THREE.Group();
      const small = group === 0 && seat < 5;
      const h = small ? 0.72 + (seat % 3) * 0.08 : 1.2 + ((i * 37) % 5) * 0.05;
      root.add(...figure(std, cloth[(i * 5) % cloth.length]!, h, small));
      const glow = this.glow(["#ffcf8a", "#bfe0ff", "#ffd9c0", "#c9f0c0"][i % 4]!, 1.2, 0.45);
      glow.position.set(0.3, h * 0.7, 0.1);
      glow.renderOrder = 6;
      root.add(glow);
      const col = k % cols, row = Math.floor(k / cols);
      root.position.set(side * (WING.x0 + 0.3 + col * ((WING.x1 - WING.x0 - 0.4) / Math.max(1, cols - 1)) + (row % 2) * 0.3), 0.1, WING.y0 + 0.5 + row * 1.45 + ((i * 13) % 4) * 0.1);
      this.all.add(root);
      this.bodies.push({ root, glow, group, seat, gone: -1 });
    }
  }

  /** Where the boat `i` places back in the queue lies: 0 in the slip, the rest at the berths. */
  private berth(i: number) {
    const K = RESCUE_LOOK;
    const at = i <= 0 ? [0, K.boat.south] : K.berths[Math.min(i, K.berths.length) - 1]!;
    return new THREE.Vector3(at[0]!, 0, at[1]!);
  }

  /** How far it is turned there. */
  private turn(i: number) {
    return i <= 0 ? 0 : RESCUE_LOOK.berths[Math.min(i, RESCUE_LOOK.berths.length) - 1]![2];
  }

  /** Kes's drop: a low ring of pale stones, and a pale ring on the ground that shows through the cloud. A block-out until the maps thread's stones are in. */
  private makeStones(x: number, z: number, r: number) {
    const K = RESCUE_LOOK, g = new THREE.Group(), rocks = new THREE.Group();
    g.add(rocks);
    this.swaps.push({ group: rocks, name: "kes-drop", turn: 0 });
    for (let i = 0; i < K.stones; i++) {
      const a = (i / K.stones) * Math.PI * 2 + 0.3, k = 0.75 + ((i * 37) % 5) * 0.09;
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.34 * k, 10, 8), new THREE.MeshStandardMaterial({ color: K.stone, roughness: 1 }));
      st.scale.set(1.15, 0.62, 0.95);
      st.rotation.y = a * 2.3;
      st.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      st.castShadow = st.receiveShadow = true;
      rocks.add(st);
    }
    const ringGeo = new THREE.RingGeometry(r - 0.12, r + 0.12, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#e8ecff", transparent: true, opacity: K.stoneRing, depthTest: false, depthWrite: false }));
    ring.position.y = K.seaY + 0.07;
    ring.renderOrder = 6;
    g.add(ring);
    g.position.set(x, 0, z);
    return g;
  }

  private makeBoat(std: (color: string, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial, i: number): Boat {
    const K = RESCUE_LOOK, B = K.boat;
    const root = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(["#6b4630", "#5b4a3a", "#70503a"][i % 3]!, { side: THREE.DoubleSide }));
    hull.scale.set(B.w, 1.0, B.l);
    hull.position.y = 0.75;
    const deck = new THREE.Mesh(new THREE.CircleGeometry(1, 28), std("#8f6c48"));
    deck.rotation.x = -Math.PI / 2;
    deck.scale.set(B.w * 0.93, B.l * 0.95, 1);
    deck.position.y = 0.42;
    // The gunwale: a paler line round the top of the hull.
    const wale = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 6, 40), std("#a9865c"));
    wale.rotation.x = Math.PI / 2;
    wale.scale.set(B.w, B.l, 1.6);
    wale.position.y = 0.76;
    const shell = new THREE.Group();
    root.add(shell);
    shell.add(hull, deck, wale);
    // Benches across, two to a bench.
    const seats = K.perBoat / 2, gap = (B.l * 1.25) / seats, z0 = -((seats - 1) * gap) / 2 + 0.35;
    const riders: THREE.Object3D[] = [];
    const hoods = ["#8c98ad", "#a58b6f", "#93a384", "#a892a6", "#b3a27c", "#7f93a0"];
    for (let k = 0; k < seats; k++) {
      const z = z0 + k * gap, half = B.w * Math.sqrt(Math.max(0.05, 1 - (z / B.l) ** 2));
      const bench = new THREE.Mesh(new THREE.BoxGeometry(half * 1.8, 0.07, 0.34), std("#7d5c3c"));
      bench.position.set(0, 0.62, z);
      shell.add(bench);
      for (const sx of [-1, 1]) {
        const r = new THREE.Group();
        const small = i === 0 && riders.length < 5;
        // Seated: shoulders and a hood, seen mostly from above, with a small glow in the lap.
        const tone = hoods[(riders.length * 3 + i) % hoods.length]!;
        const body = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.3 : 0.4, 12, 8), std(tone));
        body.scale.set(1.15, 0.8, 0.9);
        body.position.y = small ? 0.28 : 0.36;
        const hood = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.19 : 0.24, 12, 8), std(tone));
        hood.position.y = small ? 0.62 : 0.8;
        r.add(body, hood);
        const glow = this.glow(["#ffcf8a", "#bfe0ff", "#ffd9c0", "#c9f0c0"][riders.length % 4]!, 0.5, 0.35);
        glow.position.set(0, 0.45, 0.42);
        glow.renderOrder = 6;
        r.add(glow);
        r.position.set(sx * Math.min(0.62, half * 0.5), 0.6, z);
        r.visible = false;
        riders.push(r);
        root.add(r);
      }
    }
    // The lamp, on a post at the stern (the end that lies in the slip): its pips show the banks.
    const sz = -B.l + 0.45;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), std("#3a2c20"));
    mast.position.set(0, 1.9, sz);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), std("#40372c", { emissive: "#ffb65a", emissiveIntensity: 0 }));
    lampBox.position.set(0, 3.4, sz);
    const lamp = this.glow("#ffb24a", 1, 0), core = this.glow("#fff0c8", 0.5, 0);
    lamp.position.set(0, 3.4, sz);
    core.position.set(0, 3.4, sz);
    lamp.renderOrder = core.renderOrder = 6;
    const pips: THREE.Mesh[] = [];
    // The pips: four in a row on a yard across the post, under the lamp, filled from the left, each with a glow when lit so they read from far off.
    const pipGlows: THREE.Sprite[] = [];
    const yard = new THREE.Mesh(new THREE.BoxGeometry(K.pip.gap * RESCUE.perBoat, 0.07, 0.07), std("#3a2c20"));
    yard.position.set(0, K.pip.top, sz);
    for (let k = 0; k < RESCUE.perBoat; k++) {
      const x = (k - (RESCUE.perBoat - 1) / 2) * K.pip.gap;
      const pip = new THREE.Mesh(new THREE.SphereGeometry(K.pip.r, 12, 10), std("#f2ead8", { emissive: "#ffc060", emissiveIntensity: 0 }));
      pip.position.set(x, K.pip.top, sz);
      pips.push(pip);
      const pg = this.glow("#ffd27a", K.pip.glow, 0);
      pg.position.set(x, K.pip.top, sz);
      pg.renderOrder = 7;
      pipGlows.push(pg);
    }
    // The cloud at the foot of the post, seen only while a pip gutters.
    const mist = [0, 1, 2].map(() => {
      const sp = this.glow(K.gutter.mist, K.gutter.size, 0);
      sp.position.set(0, 0.6, sz);
      sp.renderOrder = 6;
      return sp;
    });
    shell.add(mast, yard, lampBox);
    root.add(lamp, core, ...pips, ...pipGlows, ...mist);
    root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    root.userData.lampBox = lampBox;
    // Its own colours, kept so a waiting boat can be drawn dark.
    const paint: Boat["paint"] = [];
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.isMeshStandardMaterial && !pips.includes(o as THREE.Mesh) && o !== lampBox) paint.push({ m, base: m.color.clone() });
    });
    return { root, shell, real: false, lamp, core, pips, pipGlows, mist, mistOn: 0, wentAt: -9, seated: 0, riders, paint, at: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), rot: 0, rotFrom: 0, rotTo: 0, movedAt: -9, liftedAt: -1, fill: 0, pulse: -9, lit: 0 };
  }

  /** The maps thread's models in place of the block-outs, each as soon as it has loaded. */
  private dress() {
    this.swaps = this.swaps.filter((sw) => {
      const m = this.model(sw.name);
      if (!m) return true;
      sw.group.clear();
      const real = m.clone();
      real.rotation.y = sw.turn;
      sw.group.add(real);
      return false;
    });
    const hull = this.model("rescue-boat");
    if (!hull) return;
    for (const b of this.boats) {
      if (b.real) continue;
      b.real = true;
      const old = new Set<THREE.Material>();
      b.shell.traverse((o) => (o as THREE.Mesh).isMesh && old.add((o as THREE.Mesh).material as THREE.Material));
      b.paint = b.paint.filter((q) => !old.has(q.m));
      b.root.remove(b.shell);
      const real = hull.clone();
      // Its own paint (a waiting boat is drawn dark) and its own lantern glass, lit by the pips.
      real.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone());
        if (mat.name !== "lamp-glass") return;
        mat.emissiveMap = null;
        mat.emissive = new THREE.Color("#ffb65a");
        mat.emissiveIntensity = 0;
        b.root.userData.lampBox = mesh;
      });
      b.shell = real as THREE.Group;
      b.root.add(real);
      const [up, aft] = RESCUE_LOOK.lantern;
      b.lamp.position.set(0, up, aft);
      b.core.position.set(0, up, aft);
      real.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat?.isMeshStandardMaterial && mat.name !== "lamp-glass") b.paint.push({ m: mat, base: mat.color.clone(), glow: mat.emissiveIntensity });
      });
    }
  }

  /** From the top again (a restart): the boats back at their berths, everyone back on the landing. */
  private reset(time: number) {
    this.lifted = 0;
    this.boats.forEach((b, i) => {
      b.at.copy(this.berth(i));
      b.from.copy(b.at);
      b.to.copy(b.at);
      b.rot = b.rotFrom = b.rotTo = this.turn(i);
      b.seated = 0;
      b.wentAt = -9;
      b.liftedAt = -1;
      b.movedAt = time - 9;
      b.fill = 0;
      for (const r of b.riders) r.visible = false;
      b.root.visible = true;
    });
    for (const p of this.bodies) (p.gone = -1), (p.root.visible = true);
  }

  step(f: RescueFrame) {
    const { r, time } = f, L = RESCUE_LOOK;
    this.dress();
    this.u.uTime.value = time;
    // The cloud comes in a step at a time, quickly, and at the end closes over everything.
    this.cloud += (r.cloud - this.cloud) * (r.cloud < this.cloud ? 0.06 : 0.3);
    this.u.uCloud.value = this.cloud;

    // The patch, eased between ticks. When it has gone it fades from where it was.
    const p = r.patch;
    let px = 1e6, pz = 1e6, pr = 0;
    if (p) {
      px = p.x - p.dx * (1 - f.t) - f.half.w;
      pz = p.y - p.dy * (1 - f.t) - f.half.h;
      // Its size eases to what it is, so a swell is seen growing; a new one starts at its own size.
      if (this.patchN !== p.n) this.pr = p.r;
      this.pr += (p.r - this.pr) * 0.14;
      pr = this.pr;
      this.u.uPatch.value.set(px, pz, pr);
      this.u.uPatchA.value = Math.min(1, this.u.uPatchA.value + 0.08);
      // The lane is as wide as it will be: it widens the moment a swell begins. Sitting still, it has no lane.
      const wide = Math.max(p.r, p.big ?? 0);
      this.u.uLaneR.value += (wide - this.u.uLaneR.value) * 0.3;
      this.u.uLane.value = p.sit ? 0 : Math.min(L.laneShow, this.u.uLane.value + 0.05);
      if (this.patchN !== p.n && !p.sit) {
        // It has just set out: the lamps on its course go cold one after another, west to east, over the warning.
        this.patchN = p.n;
        this.patchBig = 0;
        this.u.uLaneR.value = wide;
        const course = this.lamps.filter((l) => Math.abs(l.z - pz) <= wide + 1.2).sort((a, b) => a.x - b.x);
        const over = (RESCUE.patch.warn * 0.6 * 0.9) / Math.max(1, course.length);
        for (const l of this.lamps) l.coldAt = -1;
        course.forEach((l, i) => (l.coldAt = time + 0.25 + i * over));
      } else if ((p.big ?? 0) > this.patchBig) {
        // A swell begins: the lamps the wider lane takes in go cold at once.
        this.patchBig = p.big!;
        for (const l of this.lamps) if (l.coldAt < 0 && l.x > px && Math.abs(l.z - pz) <= wide + 1.2) l.coldAt = time + 0.1;
      }
      this.patchN = p.n;
    } else {
      this.u.uPatchA.value = Math.max(0, this.u.uPatchA.value - 0.05);
      this.u.uLane.value = 0;
      this.patchN = 0;
    }
    const under = (x: number, z: number, grow = 0) => !!p && Math.hypot(x - px, z - pz) < pr + grow;
    const onCourse = (x: number, z: number) => !!p && !p.sit && Math.abs(z - pz) <= Math.max(pr, p.big ?? 0) + 0.6 && x > px;

    // Wisps: not seen under it, nor once it has had them; on its course they dim as it comes.
    const taken = r.taken ?? [];
    for (const [id, w] of f.wisps) {
      const x = w.root.position.x, z = w.root.position.z;
      w.root.visible = !(p && !p.drag && (under(x, z, -0.15) || taken.includes(id)));
      const k = p?.drag && under(x, z) ? 0.35 : onCourse(x, z) ? 0.45 + 0.2 * Math.sin(time * 17 + x) : 1;
      if (k < 1) (w.halo.material.opacity *= k), (w.light.intensity *= k);
    }
    // Where one went out: a grey wick of smoke stands a moment and thins.
    for (const o of r.outs ?? []) {
      const key = `${o.tick}:${o.x}:${o.y}`;
      if (this.smoked.has(key)) continue;
      this.smoked.add(key);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeMap, color: "#4a4e58", transparent: true, opacity: 0, depthWrite: false }));
      s.renderOrder = 7;
      this.all.add(s);
      this.smokes.push({ s, x: o.x + 0.5 - f.half.w, z: o.y + 0.5 - f.half.h, at: time });
    }
    if (!r.outs?.length && this.smoked.size > 64) this.smoked.clear();
    this.smokes = this.smokes.filter((m) => {
      const k = (time - m.at) / L.smokeSec;
      if (k >= 1) return m.s.removeFromParent(), m.s.material.dispose(), false;
      m.s.position.set(m.x + Math.sin(time * 2.3 + m.x) * 0.18 * k, 0.7 + k * L.smokeRise, m.z);
      m.s.scale.set(0.7 + 0.8 * k, 1.9 + 1.8 * k, 1);
      m.s.material.opacity = 0.85 * Math.min(1, k * 8) * (1 - k) ** 1.3;
      return true;
    });

    // People: a glow is dark under it and comes back the moment it has passed. Those gone aboard are not on the board.
    for (const [id, rig] of f.players) {
      const aboard = !!r.aboard?.includes(id);
      rig.root.visible = !aboard;
      if (aboard) rig.beam.visible = false;
      rig.lantern.visible = !(r.dark?.includes(id) || under(rig.root.position.x, rig.root.position.z));
    }

    // Lamps and windows: cold in a line ahead of it, one after the next, and cold until it has passed; dark under it; dark under the cloud.
    for (const l of this.lamps) {
      let want = 1, ember = false;
      const inCloud = Math.hypot(l.x, l.z) > this.cloud - 0.5;
      if (inCloud || under(l.x, l.z, 0.4)) want = 0;
      else if (p && l.coldAt >= 0 && px - pr < l.x + 1) {
        // A last flare, then an ember.
        if (time >= l.coldAt) (want = L.emberLit), (ember = true);
        else if (time >= l.coldAt - 0.14) want = 1.9;
      }
      l.lit += (want - l.lit) * (want < l.lit ? 0.45 : want > 1 ? 0.6 : 0.07);
      const breathe = 0.94 + 0.06 * Math.sin(time * 2.1 + l.seed);
      l.glow.material.opacity = Math.min(1, 0.55 * l.lit * breathe) * (ember ? 0.4 : 1);
      l.core.material.opacity = ember ? 0.55 + 0.25 * Math.sin(time * 5 + l.seed) : Math.min(1, 0.9 * l.lit);
      (l.core.material.color as THREE.Color).copy(ember ? this.ember : l.warm);
      l.glow.scale.setScalar(l.size * (ember ? 0.35 : Math.max(0.6, Math.min(1.5, l.lit))));
      l.box.emissiveIntensity = 1.2 * l.lit;
      l.box.color.set(l.lit > 0.2 ? "#ffd9a0" : "#2a2622");
      l.glow.visible = l.core.visible = l.lit > 0.02;
    }

    // Kes's stones.
    if (r.drop && !this.stones) this.all.add((this.stones = this.makeStones(r.drop.x + 0.5 - f.half.w, r.drop.y + 0.5 - f.half.h, r.drop.r)));
    if (this.stones) this.stones.visible = !!r.drop;

    // The lamp's light on the planks: there while the docked lamp takes wisps, gone while it is dark; a wisp that went in flies from where it was.
    const lampOn = !!r.lamp && !r.lamp.dark && r.ending === undefined;
    this.poolLit += ((lampOn ? 1 : 0) - this.poolLit) * 0.12;
    const poolPulse = Math.max(0, 1 - (time - this.poolPulse) / 0.7);
    (this.pool.material as THREE.MeshBasicMaterial).opacity = this.poolLit * (L.poolShow * (0.9 + 0.1 * Math.sin(time * 2.4)) + 0.3 * poolPulse);
    const docked = this.boats[Math.min(r.lifted, this.boats.length - 1)];
    for (const o of r.flew ?? []) {
      const key = `${o.tick}:${o.x}:${o.y}`;
      if (this.flown.has(key)) continue;
      this.flown.add(key);
      const s = this.glow("#ffe2a0", 1.5, 1);
      s.renderOrder = 8;
      this.all.add(s);
      this.flies.push({ s, from: new THREE.Vector3(o.x + 0.5 - f.half.w, 1.0, o.y + 0.5 - f.half.h), at: time });
    }
    if (!r.flew?.length && this.flown.size > 64) this.flown.clear();
    this.flies = this.flies.filter((m) => {
      const k = (time - m.at) / L.flySec;
      if (k >= 1 || !docked) {
        if (docked) (docked.pulse = time), (this.poolPulse = time);
        return m.s.removeFromParent(), m.s.material.dispose(), false;
      }
      const to = docked.lamp.getWorldPosition(new THREE.Vector3()).sub(this.all.getWorldPosition(new THREE.Vector3())), e = k * k * (3 - 2 * k);
      m.s.position.lerpVectors(m.from, to, e);
      m.s.position.y += Math.sin(k * Math.PI) * 1.6;
      m.s.scale.setScalar(1.5 - 0.7 * k);
      return true;
    });

    // Boats: each bank lights a pip, swells the lamp and seats two more of the crowd; a full lamp lifts its boat, and the queue moves up, the next into the slip.
    if (r.lifted < this.lifted) this.reset(time);
    while (this.lifted < r.lifted) {
      const gone = this.boats[this.lifted];
      if (gone) gone.liftedAt = time;
      this.lifted++;
      this.boats.forEach((b, i) => {
        if (i < this.lifted) return;
        b.from.copy(b.at);
        b.to.copy(this.berth(i - this.lifted));
        b.rotFrom = b.rot;
        b.rotTo = this.turn(i - this.lifted);
        b.movedAt = time + L.liftSec * 0.35;
      });
    }
    this.boats.forEach((b, i) => {
      const fill = r.boats[i] ?? 0;
      b.fill = fill;
      const share = fill / r.perBoat, pulse = Math.max(0, 1 - (time - b.pulse) / 0.6);
      // Aboard: a share of the boatload at each bank, all of it once the boat has lifted.
      // (Nobody gets off again when a pip gutters out.)
      const seated = (b.seated = Math.max(b.seated, b.liftedAt >= 0 ? L.perBoat : Math.floor(share * L.perBoat)));
      b.riders.forEach((rd, k) => (rd.visible = k < seated));
      for (const body of this.bodies) if (body.group === i && body.seat < seated && body.gone < 0) body.gone = time;
      b.lamp.scale.setScalar(1.2 + 3.6 * share + pulse * 1.4);
      // The boat being loaded shows a small light even empty, so it is seen which one takes the next bank.
      const mine = i === this.lifted && b.liftedAt < 0;
      // Under the patch the docked lamp is dark: nothing of its light is seen.
      const out = mine && !!r.lamp?.dark && !!p && under(r.lamp.x + 0.5 - f.half.w, r.lamp.y + 0.5 - f.half.h, 0.5) ? 0 : 1;
      b.lamp.material.opacity = (share > 0 ? 0.3 + 0.6 * share : mine ? 0.3 : 0) * out;
      b.core.scale.setScalar(0.5 + 0.8 * share + pulse * 0.4);
      b.core.material.opacity = (share > 0 ? 0.6 + 0.4 * share : mine ? 0.5 : 0) * out;
      ((b.root.userData.lampBox as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = (mine ? 0.5 : 0) + share * 2.2;
      // The lamp does not keep its light: its newest pip flickers before it goes, and the cloud laps at the post.
      const gut = mine && r.lamp?.gutter !== undefined ? r.lamp.gutter : -1, G = L.gutter;
      if (mine && r.lamp?.went !== undefined && r.lamp.went !== this.wentSeen) (this.wentSeen = r.lamp.went), (b.wentAt = time);
      const near = gut >= 0 ? 1 - gut / Math.max(1, RESCUE.lamp.flicker) : 0;
      const flick = gut >= 0 ? G.low + (1 - G.low) * Math.max(0, Math.sin(time * G.hz * (1 + near)) * Math.sin(time * 7.3 + 1.1)) ** 0.6 : 1;
      b.mistOn += ((mine && (gut >= 0 || time - b.wentAt < G.after) ? 1 : 0) - b.mistOn) * 0.08;
      b.mist.forEach((sp, k) => {
        const a = time * (0.9 + k * 0.23) + k * 2.1;
        sp.position.x = Math.sin(a) * 0.55;
        sp.position.y = 0.45 + (k / 2) * G.rise * (0.35 + 0.65 * Math.max(near, time - b.wentAt < G.after ? 1 : 0)) + Math.sin(a * 1.7) * 0.08;
        sp.material.opacity = G.opacity * b.mistOn * (0.75 + 0.25 * Math.sin(a * 2.3)) * out;
        sp.scale.setScalar(G.size * (0.8 + 0.25 * Math.sin(a * 1.3 + 1)));
      });
      b.pips.forEach((pip, k) => {
        const on = k < fill, newest = on && k === fill - 1 ? pulse : 0, fl = on && k === fill - 1 ? flick : 1;
        (pip.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? (2.6 + newest * 3) * fl : 0;
        (pip.material as THREE.MeshStandardMaterial).color.set(on ? "#ffe2a0" : mine ? "#cfc8ba" : "#5a554e");
        b.pipGlows[k]!.material.opacity = on ? (0.75 + 0.25 * newest) * out * fl : 0;
        b.pipGlows[k]!.scale.setScalar(L.pip.glow * (1 + 0.9 * newest));
      });
      // A waiting boat is dark; it takes its colour as it comes into the slip.
      b.lit += ((mine || b.liftedAt >= 0 ? 1 : 0) - b.lit) * 0.05;
      const shade = L.waiting + (1 - L.waiting) * b.lit;
      for (const q of b.paint) q.m.color.copy(q.base).multiplyScalar(shade), q.glow !== undefined && (q.m.emissiveIntensity = q.glow * shade * shade);
      // Moving up the queue, and into the slip.
      const s = Math.min(1, Math.max(0, (time - b.movedAt) / L.slideSec)), e = s * s * (3 - 2 * s);
      b.at.copy(b.from).lerp(b.to, e);
      b.rot = b.rotFrom + (b.rotTo - b.rotFrom) * e;
      if (s >= 1) b.from.copy(b.to), (b.rotFrom = b.rotTo);
      b.root.position.copy(b.at);
      b.root.rotation.y = b.rot;
      b.root.position.y = Math.sin(time * 1.3 + i * 2) * 0.05;
      b.root.rotation.z = Math.sin(time * 0.9 + i) * 0.02;
      // Lifting away: up, and off south, over a few seconds.
      if (b.liftedAt >= 0) {
        const k = Math.min(1, (time - b.liftedAt) / L.liftSec), up = k * k;
        b.root.position.y += up * 9;
        b.root.position.z += up * 16 + k * 1.5;
        b.root.visible = k < 1 || r.ending !== undefined;
        if (r.ending !== undefined && i === RESCUE.boats - 1) b.root.visible = true;
      } else b.root.visible = true;
    });
    // The crowd thins: each one goes from the wing as a seat in the boat fills.
    for (const b of this.bodies) b.root.visible = b.gone < 0 || time - b.gone < 0.2;
  }

  dispose() {
    this.all.removeFromParent();
    this.smokeMap.dispose();
    this.all.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}

/** The lamp's light on the planks: a soft disc, brighter toward its rim so its edge can be seen. */
function poolTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 63);
  grad.addColorStop(0, "rgba(255,255,255,0.75)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.4)");
  grad.addColorStop(0.9, "rgba(255,255,255,0.6)");
  grad.addColorStop(0.96, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** The landing's wings, where the crowd waits: this far out from the slip each side, and these rows (tiles). */
const WING = { x0: 5, x1: 12, y0: -5, y1: -1 };

/** A block-out person: a body and a head, `h` tall. */
export function figure(std: (color: string, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial, cloth: string, h: number, small: boolean) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(small ? 0.2 : 0.27, Math.max(0.1, h - 0.5), 4, 10), std(cloth));
  body.position.y = h / 2 + 0.1;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.17 : 0.2, 12, 10), std("#8a6a54"));
  head.position.y = h + 0.22;
  return [body, head];
}
