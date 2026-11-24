// Run 9, the rescue: what the low one has that no other board does. The cloud sea at ankle height
// with its wall closing on the landing, the dark patch in it, the landing's planks and slip, the
// three boats and their lamps, the people waiting, the island's cold brazier and its path lamps.
// All block-outs: nothing here is drawn art yet. World units are tiles, the origin at the slip.

import * as THREE from "three";
import type { StoryView } from "../engine/protocol.js";
import { LO_BRAZIER, LO_LAMPS, LO_LANDING, LO_OVAL, RESCUE, loPlanks } from "../engine/rescue.js";

type Rescue = NonNullable<StoryView["rescue"]>;
type Glow = (color: string, size: number, opacity?: number) => THREE.Sprite;

/** How it looks, in one place. */
export const RESCUE_LOOK = {
  /** The cloud sea over the ground: how thick (0 to 1), its height, and the wall's. */
  sea: 0.24,
  seaY: 0.16,
  wallY: 1.1,
  /** The cloud's colours (shade and light), and the patch's. */
  pale: ["#8d98b4", "#d3d9e8"] as const,
  dark: "#05060c",
  /** Seconds a boat takes to lift away, and the next to slide into the slip. */
  liftSec: 3.4,
  slideSec: 1.6,
  /** Where the two waiting boats lie, east then west of the slip (tiles from it). */
  berths: [[6.6, 1.2], [-6.6, 1.2]] as const,
  /** People waiting on the landing's wings: this many go with each boat. */
  perBoat: 4,
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
uniform float uTime, uCloud, uBase, uVeil, uPatchA;
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
  float a = uVeil > 0.5 ? wall * 0.94 : mix(uBase * (0.35 + 1.5 * n * (0.5 + n2)), 0.97, wall);
  vec3 col = mix(uLo, uHi, clamp(n * 1.3, 0.0, 1.0));
  // The patch: a stain with a hard edge. Nothing shows through it.
  float edge = uPatch.z + (n2 - 0.5) * 0.3;
  float k = (1.0 - smoothstep(edge - 0.1, edge, distance(vW, uPatch.xy))) * uPatchA * (1.0 - uVeil);
  col = mix(col, uDark, k);
  a = mix(a, 0.95, k);
  gl_FragColor = vec4(col, a);
}`;

interface Lamp { x: number; z: number; glow: THREE.Sprite; core: THREE.Sprite; box: THREE.MeshStandardMaterial; lit: number; seed: number }
interface Boat { root: THREE.Group; lamp: THREE.Sprite; core: THREE.Sprite; pips: THREE.Mesh[]; riders: THREE.Group; at: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; movedAt: number; liftedAt: number; fill: number; pulse: number }
interface Body { root: THREE.Group; glow: THREE.Sprite; group: number; gone: number }

export interface RescueFrame {
  r: Rescue;
  /** How far through the tick (0 to 1), and the time in seconds. */
  t: number;
  time: number;
  /** Half the board's size in tiles (tiles are world units from the board's middle). */
  half: { w: number; h: number };
  wisps: Iterable<{ root: THREE.Object3D; halo: THREE.Sprite; light: THREE.PointLight }>;
  players: Map<number, { root: THREE.Object3D; lantern: THREE.Sprite; beam: THREE.Object3D }>;
}

export class RescueFx {
  readonly all = new THREE.Group();
  private u = { uTime: { value: 0 }, uCloud: { value: RESCUE.cloud.start as number }, uBase: { value: RESCUE_LOOK.sea as number }, uVeil: { value: 0 }, uPatchA: { value: 0 }, uPatch: { value: new THREE.Vector3(0, 0, 3) }, uLo: { value: new THREE.Color(RESCUE_LOOK.pale[0]) }, uHi: { value: new THREE.Color(RESCUE_LOOK.pale[1]) }, uDark: { value: new THREE.Color(RESCUE_LOOK.dark) } };
  private lamps: Lamp[] = [];
  private boats: Boat[] = [];
  private bodies: Body[] = [];
  private lifted = 0;
  private patchSeen = -1;
  private patchN = 0;
  private cloud = RESCUE.cloud.start as number;

  constructor(private glow: Glow) {
    const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    // The cloud sea, and the wall's body standing on it.
    const plane = new THREE.PlaneGeometry(260, 260);
    plane.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.u, transparent: true, depthWrite: false }));
    sea.position.set(0, RESCUE_LOOK.seaY, LO_OVAL.y);
    sea.renderOrder = 3;
    const veil = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { ...this.u, uVeil: { value: 1 } }, transparent: true, depthWrite: false }));
    veil.position.set(0, RESCUE_LOOK.wallY, LO_OVAL.y);
    veil.renderOrder = 5;
    this.all.add(sea, veil);
    // The slip, where a wisp is banked: a warm line round it that shows through the cloud.
    const s = 2.5, y = RESCUE_LOOK.seaY + 0.06;
    const edge = [[-s, -s], [s, -s], [s, -s], [s, s], [s, s], [-s, s], [-s, s], [-s, -s]].map(([x, z]) => new THREE.Vector3(x!, y, z!));
    const rim = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0.85, depthTest: false }));
    rim.renderOrder = 6;
    this.all.add(rim);

    // The landing: planks round the slip, on posts over the sky, with a wing each side where people wait.
    const wood = std("#7d5c3c"), dark = std("#4e3a28");
    const L = LO_LANDING;
    const tiles: [number, number][] = [];
    for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) if (loPlanks(x, y) && !(Math.abs(x) <= 1 && Math.abs(y) <= 1)) tiles.push([x, y]);
    for (const wing of [-1, 1]) for (let y = -4; y <= -2; y++) for (let x = 5; x <= 8; x++) tiles.push([wing * x, y]);
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(0.97, 0.1, 0.97), wood, tiles.length);
    const m = new THREE.Matrix4();
    tiles.forEach(([x, y], i) => deck.setMatrixAt(i, m.makeTranslation(x, 0.05 + ((x * 7 + y * 3) % 3) * 0.006, y)));
    deck.receiveShadow = deck.castShadow = true;
    this.all.add(deck);
    for (const [x, y] of [[L.x0, L.y1], [L.x1, L.y1], [L.x0, -1], [L.x1, -1], [-2, L.y1], [2, L.y1], [-8, -2], [8, -2]] as const) {
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

    // Path lamps: a post and a lantern each. They gutter ahead of the patch and are dark under it.
    const iron = std("#2c2f38", { roughness: 0.7 });
    LO_LAMPS.forEach(([x, z], i) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.9, 8), iron);
      post.position.set(x, 0.95, z);
      post.castShadow = true;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), std("#ffd9a0", { emissive: "#ffb65a", emissiveIntensity: 1.2 }));
      box.position.set(x, 2.05, z);
      const glow = this.glow("#ffb65a", 2.6, 0.55), core = this.glow("#ffe6b0", 0.8, 0.9);
      glow.position.set(x, 2.05, z);
      core.position.set(x, 2.05, z);
      glow.renderOrder = core.renderOrder = 6;
      this.all.add(post, box, glow, core);
      this.lamps.push({ x, z, glow, core, box: box.material as THREE.MeshStandardMaterial, lit: 1, seed: i * 1.7 + 0.3 });
    });

    // The boats: the first lies in the slip, the others wait at either side.
    for (let i = 0; i < RESCUE.boats; i++) {
      const b = this.makeBoat(std, i);
      const berth = i === 0 ? [0, 0.7] : RESCUE_LOOK.berths[(i - 1) % RESCUE_LOOK.berths.length]!;
      b.at.set(berth[0]!, 0, berth[1]!);
      b.from.copy(b.at);
      b.to.copy(b.at);
      b.root.position.copy(b.at);
      this.boats.push(b);
      this.all.add(b.root);
    }

    // The people waiting, in threes and fours on the wings: a boatload goes with each boat.
    const cloth = ["#4b5a6e", "#6a5746", "#5d6b52", "#70606e", "#4f4f5c", "#7a6a50"];
    for (let i = 0; i < RESCUE.boats * RESCUE_LOOK.perBoat; i++) {
      const group = Math.floor(i / RESCUE_LOOK.perBoat), side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      const root = new THREE.Group();
      const small = group === 0 && i % RESCUE_LOOK.perBoat < 2;
      const h = small ? 0.75 : 1.2 + ((i * 37) % 5) * 0.05;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(small ? 0.2 : 0.27, h - 0.5, 4, 10), std(cloth[i % cloth.length]!));
      body.position.y = h / 2 + 0.1;
      body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.17 : 0.2, 12, 10), std("#8a6a54"));
      head.position.y = h + 0.22;
      const glow = this.glow(["#ffcf8a", "#bfe0ff", "#ffd9c0", "#c9f0c0"][i % 4]!, 1.3, 0.5);
      glow.position.set(0.3, h * 0.7, 0.1);
      glow.renderOrder = 6;
      root.add(body, head, glow);
      root.position.set(side * (5.4 + (k % 3) * 1.15 + (group % 2) * 0.2), 0.1, -3.7 + (Math.floor(k / 3) % 2) * 1.3 + ((i * 13) % 4) * 0.12);
      this.all.add(root);
      this.bodies.push({ root, glow, group, gone: -1 });
    }
  }

  private makeBoat(std: (color: string, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial, i: number): Boat {
    const root = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(["#6b4630", "#5b4a3a", "#70503a"][i % 3]!, { side: THREE.DoubleSide }));
    hull.scale.set(1.25, 0.75, 2.5);
    hull.position.y = 0.55;
    const deck = new THREE.Mesh(new THREE.CircleGeometry(1, 24), std("#8f6c48"));
    deck.rotation.x = -Math.PI / 2;
    deck.scale.set(1.18, 2.4, 1);
    deck.position.y = 0.5;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8), std("#3a2c20"));
    mast.position.set(0, 1.6, 0.2);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), std("#40372c", { emissive: "#ffb65a", emissiveIntensity: 0 }));
    lampBox.position.set(0, 2.85, 0.2);
    const lamp = this.glow("#ffb24a", 1, 0), core = this.glow("#fff0c8", 0.5, 0);
    lamp.position.set(0, 2.85, 0.2);
    core.position.set(0, 2.85, 0.2);
    lamp.renderOrder = core.renderOrder = 6;
    const pips: THREE.Mesh[] = [];
    for (let k = 0; k < RESCUE.perBoat; k++) {
      const pip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std("#3a3228", { emissive: "#ffc060", emissiveIntensity: 0 }));
      pip.position.set(0, 2.2 - k * 0.3, 0.2);
      pips.push(pip);
    }
    const riders = new THREE.Group();
    for (let k = 0; k < RESCUE_LOOK.perBoat; k++) {
      const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), std(["#4b5a6e", "#6a5746", "#5d6b52", "#70606e"][k % 4]!));
      r.position.set((k % 2 ? 0.45 : -0.45), 1.05, -1.1 + k * 0.6);
      riders.add(r);
    }
    riders.visible = false;
    root.add(hull, deck, mast, lampBox, lamp, core, ...pips, riders);
    root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    root.userData.lampBox = lampBox;
    return { root, lamp, core, pips, riders, at: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), movedAt: -9, liftedAt: -1, fill: 0, pulse: -9 };
  }

  /** From the top again (a restart): the boats back at their berths, everyone back on the landing. */
  private reset(time: number) {
    this.lifted = 0;
    this.boats.forEach((b, i) => {
      const berth = i === 0 ? [0, 0.7] : RESCUE_LOOK.berths[(i - 1) % RESCUE_LOOK.berths.length]!;
      b.at.set(berth[0]!, 0, berth[1]!);
      b.from.copy(b.at);
      b.to.copy(b.at);
      b.liftedAt = -1;
      b.movedAt = time - 9;
      b.fill = 0;
      b.riders.visible = false;
      b.root.visible = true;
    });
    for (const p of this.bodies) (p.gone = -1), (p.root.visible = true);
  }

  step(f: RescueFrame) {
    const { r, time } = f, L = RESCUE_LOOK;
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
      pr = p.r;
      this.u.uPatch.value.set(px, pz, pr);
      this.u.uPatchA.value = Math.min(1, this.u.uPatchA.value + 0.08);
      if (this.patchN !== p.n) (this.patchN = p.n), (this.patchSeen = time);
    } else {
      this.u.uPatchA.value = Math.max(0, this.u.uPatchA.value - 0.05);
      this.patchN = 0;
    }
    const under = (x: number, z: number, grow = 0) => !!p && Math.hypot(x - px, z - pz) < pr + grow;
    const onCourse = (x: number, z: number) => !!p && Math.abs(z - pz) <= pr + 0.6 && x > px;

    // Wisps: not seen under it; on its course they dim as it comes.
    for (const w of f.wisps) {
      const x = w.root.position.x, z = w.root.position.z;
      w.root.visible = !(p && !p.drag && under(x, z, -0.15));
      const k = p?.drag && under(x, z) ? 0.35 : onCourse(x, z) ? 0.45 + 0.2 * Math.sin(time * 17 + x) : 1;
      if (k < 1) (w.halo.material.opacity *= k), (w.light.intensity *= k);
    }

    // People: a glow is dark under it and comes back the moment it has passed. Those gone aboard are not on the board.
    for (const [id, rig] of f.players) {
      const aboard = !!r.aboard?.includes(id);
      rig.root.visible = !aboard;
      if (aboard) rig.beam.visible = false;
      rig.lantern.visible = !(r.dark?.includes(id) || under(rig.root.position.x, rig.root.position.z));
    }

    // Lamps: guttering in a line ahead of it, one after the next; dark under it; dark under the cloud.
    const span = 30, since = time - this.patchSeen;
    for (const l of this.lamps) {
      let want = 1;
      const inCloud = Math.hypot(l.x, l.z) > this.cloud - 0.5;
      if (inCloud || under(l.x, l.z, 0.4)) want = 0;
      else if (onCourse(l.x, l.z)) {
        // The line of them goes west to east over the warning, each a beat after the last.
        const turn = ((l.x + span / 2) / span) * RESCUE.patch.warn * 0.6;
        if (since >= turn) want = 0.12 + 0.5 * Math.max(0, Math.sin(time * 31 + l.seed * 5) * Math.sin(time * 13 + l.seed)) ;
      }
      l.lit += (want - l.lit) * (want < l.lit ? 0.5 : 0.08);
      const breathe = 0.94 + 0.06 * Math.sin(time * 2.1 + l.seed);
      l.glow.material.opacity = 0.55 * l.lit * breathe;
      l.core.material.opacity = 0.9 * l.lit;
      l.box.emissiveIntensity = 1.2 * l.lit;
      l.box.color.set(l.lit > 0.05 ? "#ffd9a0" : "#2a2622");
      l.glow.visible = l.core.visible = l.lit > 0.02;
    }

    // Boats: each bank lights a pip and swells the lamp; a full lamp lifts its boat, and the next slides into the slip.
    if (r.lifted < this.lifted) this.reset(time);
    while (this.lifted < r.lifted) {
      const gone = this.boats[this.lifted];
      if (gone) (gone.liftedAt = time), (gone.riders.visible = true);
      for (const b of this.bodies) if (b.group === this.lifted) b.gone = time;
      this.lifted++;
      const next = this.boats[this.lifted];
      if (next) (next.from.copy(next.at), next.to.set(0, 0, 0.7), (next.movedAt = time + L.liftSec * 0.35));
    }
    this.boats.forEach((b, i) => {
      const fill = r.boats[i] ?? 0;
      if (fill > b.fill) b.pulse = time;
      b.fill = fill;
      const share = fill / r.perBoat, pulse = Math.max(0, 1 - (time - b.pulse) / 0.6);
      b.lamp.scale.setScalar(0.9 + 3.2 * share + pulse * 1.2);
      // The boat being loaded shows a small light even empty, so it is seen which one takes the next bank.
      const mine = i === this.lifted && b.liftedAt < 0;
      b.lamp.material.opacity = share > 0 ? 0.3 + 0.6 * share : mine ? 0.22 : 0;
      b.core.scale.setScalar(0.4 + 0.7 * share + pulse * 0.4);
      b.core.material.opacity = share > 0 ? 0.6 + 0.4 * share : mine ? 0.4 : 0;
      ((b.root.userData.lampBox as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = share * 2.2;
      b.pips.forEach((pip, k) => ((pip.material as THREE.MeshStandardMaterial).emissiveIntensity = k < fill ? 2.4 : 0));
      // Sliding into the slip.
      const s = Math.min(1, Math.max(0, (time - b.movedAt) / L.slideSec)), e = s * s * (3 - 2 * s);
      b.at.copy(b.from).lerp(b.to, e);
      if (s >= 1) b.from.copy(b.to);
      b.root.position.copy(b.at);
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
    // The people: each boatload goes aboard as its boat lifts.
    for (const b of this.bodies) {
      if (b.gone < 0) continue;
      b.root.visible = time - b.gone < 0.25;
    }
  }

  dispose() {
    this.all.removeFromParent();
    this.all.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
