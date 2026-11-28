// Part 2, runs 3 and 4, the offspring fight: placeholder shapes only (no Spark, no models), drawn
// from StoryView.fight. One plain eye on four legs, the eye the biggest thing about it and level
// while the body bobs (look 1); a thin back that glows with every wisp it has eaten, seen best from
// behind (look 7); a bright slit on the back for the wound. Solenne's light over her, the boy's
// over him, the shard in Rook's hand, and a flash for her shove, her blast, her save and her flare.

import * as THREE from "three";
import type { StoryView } from "../engine/protocol.js";
import { OFFSPRING } from "../engine/offspring.js";
import { knockClock, nearness } from "./fight-music.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { parsePacked, yardPackFile } from "./yard-dress.js";

/**
 * The offspring's model (the cast thread, 28 Nov: sogni/lanternfall/production/offspring/, its
 * README the contract), from the yard's pack: hands at y 0, facing +Z, 3.38 wide unscaled; one skin;
 * meshes eye, back, wound and light_1..6 driven from here; clips idle, walk, crawl, feed, stagger,
 * stunned, leap, die. Parsed once; each fight gets its own copy. Until it is in, the placeholder shapes.
 */
let modelP: Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null> | null = null;
function offspringModel() {
  modelP ??= yardPackFile()
    .then((b) => (b.offspring ? parsePacked(b.offspring).then((g) => ({ scene: g.scene, clips: g.animations })) : null))
    .catch(() => null);
  return modelP;
}

type Fight = NonNullable<StoryView["fight"]>;

/** The look's numbers, in one place. */
export const FIGHT_LOOK = {
  body: "#2b2630",
  leg: "#1d1a22",
  eye: "#f4f1e8",
  iris: "#6b8f3a",
  pupil: "#0b0a0c",
  /** The back's thin skin, dark until it has eaten, and the light under it. */
  skin: "#3a3036",
  back: "#ffb85a",
  wound: "#fff4d0",
  her: "#cfe6ff",
  fen: "#ffd9a0",
  shard: "#bfefff",
  /** Where to strike on its back. */
  strike: "#5fe3ff",
  /** How high the body rides, and the eye's middle (world units). */
  ride: 1.0,
  eyeAt: 1.55,
  /** Seconds a flash takes to grow and fade. */
  flash: 0.7,
  /** Feeding at the fire: the light streaming from the brazier into its eye (how many motes, how fast they go, seconds the stream lasts after a bite), and the dip at the fire as each light goes. */
  sap: { motes: 12, speed: 1.4, hold: 1.4, color: "#ffc070", dip: 0.6 },
  /** The hunt: its eye turning reflective (the colour it goes, and its glint), and light flung out of the wound (how high it arcs, seconds in the air). */
  mirror: "#e8f6ff",
  fling: { up: 2.2, sec: 0.55, color: "#ffd58a" },
  /**
   * The dark (run 4, OFFSPRING.dark): each pool's light (colour, strength, how high it hangs), the
   * disc on the ground at the pool's edge, and the shudder of Rook's own light on each knock: how
   * hard (its share of the light and of the disc's size) and for how long (s), scaled by how near it
   * is (`nearness`, fight-music.ts: the knock's own curve).
   */
  pools: {
    light: { rook: ["#ffe2b0", 14, 1.6], shard: ["#cff4ff", 26, 1.9], fire: ["#ff9a4a", 30, 1.4], wisp: ["#ffd58a", 5, 0.9], her: ["#cfe6ff", 14, 2.1], fen: ["#ffd9a0", 9, 1.5] } as Record<string, [string, number, number]>,
    disc: 0.3,
    max: 12,
  },
  shudder: { light: 0.55, size: 0.1, sec: 0.35 },
  /** The jump: it flees hurt, dripping light along its arc; the drops (how many, colour, size) lie on the ground and fade out over the ticks it stays away. */
  trail: { drops: 16, color: "#ffc070", size: 0.55, glow: 0.85 },
  /**
   * Its gaze drinking the light (Ladi, 27 Nov 5:49 PM: "make the cone that is sucking up light start to
   * gradually distort the area that is in the cone? As well as show a sucking animation by the eye"):
   * the ground and all in the cone seen through a warping lens, more the longer it looks (its strength
   * at the full gaze, how tall the lens stands, how fast its ripples run in toward the eye, how bright
   * they shimmer at the full gaze, so it reads in the dark), and motes
   * of light streaming in to the pupil (how many, their colour and size).
   */
  warp: { strength: 2.2, high: 2.4, pull: 0.9, shimmer: 0.35, motes: 14, color: "#e8f6ff", size: 0.35 },
  /**
   * The model: how wide (tiles) it is drawn; the back's stages (how many lights show, and the back's
   * glow, at full, more than half, some, and empty: Ladi's four); a faint warm rim on its body and
   * arms (the cast thread's ask, for the camera above); how far the wound opens (its y
   * scale, shut and open); how fast the ink turns in each light (rad/s, plus a little more for each);
   * and how long a change of clip blends (s).
   */
  model: { rim: { color: "#b8a89a", strength: 0.35, power: 2.5 }, wide: 3, stages: [[6, 1], [4, 0.6], [2, 0.3], [0, 0]] as const, wound: [0.3, 2.2] as const, ink: [0.6, 0.15] as const, blend: 0.2 },
  /** Untouchable after its jump: a pale shell round it (its strength, and how slowly it breathes), and a tap turned aside: a ring off the shell (how far it spreads, seconds). */
  safe: { color: "#dfe8ff", shell: 0.22, breathe: 2.2, ward: { spread: 0.8, sec: 0.5 } },
};

/** The gaze's lens: a tiling field of soft bumps as a normal map, to bend what is seen through it. */
let warpTex: THREE.Texture | null = null;
function warpNormals() {
  if (warpTex) return warpTex;
  const n = 128, c = document.createElement("canvas");
  c.width = c.height = n;
  const x = c.getContext("2d")!, img = x.createImageData(n, n);
  // A height field of a few waves that tile, and its slopes as the normal.
  const h = (u: number, v: number) => Math.sin(2 * Math.PI * (u * 3 + v)) + 0.6 * Math.sin(2 * Math.PI * (v * 4 - u * 2)) + 0.4 * Math.sin(2 * Math.PI * (u * 5 + v * 3));
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = i / n, v = j / n, e = 1 / n, dx = (h(u + e, v) - h(u - e, v)) / (2 * e), dy = (h(u, v + e) - h(u, v - e)) / (2 * e);
      const len = Math.hypot(dx * 0.02, dy * 0.02, 1), o = (j * n + i) * 4;
      img.data[o] = 128 + 127 * ((-dx * 0.02) / len);
      img.data[o + 1] = 128 + 127 * ((-dy * 0.02) / len);
      img.data[o + 2] = 255 / len;
      img.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  // The same waves as a faint shimmer, so the warp reads in the dark too (nothing lit to bend there).
  const c2 = document.createElement("canvas");
  c2.width = c2.height = n;
  const x2 = c2.getContext("2d")!, im2 = x2.createImageData(n, n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, h(i / n, j / n) / 2), o = (j * n + i) * 4;
      im2.data[o] = im2.data[o + 1] = im2.data[o + 2] = Math.round(255 * Math.min(1, v * v));
      im2.data[o + 3] = 255;
    }
  x2.putImageData(im2, 0, 0);
  const t2 = new THREE.CanvasTexture(c2);
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
  t2.repeat.set(0.5, 0.5);
  shimmerTex = t2;
  return (warpTex = t);
}
let shimmerTex: THREE.Texture | null = null;

/** A soft round pool of light on the ground (the dark's lit pools). */
let poolTex: THREE.Texture | null = null;
function poolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.75, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return (poolTex = new THREE.CanvasTexture(c));
}

type Glow = (color: string, size: number, opacity?: number) => THREE.Sprite;
const TMP_Q = new THREE.Quaternion(), Y_AXIS = new THREE.Vector3(0, 1, 0);

export class OffspringFx {
  readonly all = new THREE.Group();
  private it = new THREE.Group();
  private body: THREE.Mesh;
  private legs: THREE.Mesh[] = [];
  private eye = new THREE.Group();
  private ball: THREE.Mesh;
  private glint: THREE.Sprite;
  private flungMotes = new Map<number, { s: THREE.Sprite; from: { x: number; y: number }; to: { x: number; y: number }; at: number }>();
  private glow: Glow;
  private backSkin: THREE.Mesh;
  private backGlow: THREE.Sprite;
  private slit: THREE.Mesh;
  private slitGlow: THREE.Sprite;
  /** Where to strike: its back glows, held with the shard out, and pulses when a tap would strike. */
  private strikeGlow: THREE.Sprite;
  private strikeRing: THREE.Mesh;
  private herGlow: THREE.Sprite;
  private fenGlow: THREE.Sprite;
  private shardGlow: THREE.Sprite;
  private flash: THREE.Sprite;
  private beam: THREE.Mesh;
  private motes: THREE.Sprite[] = [];
  private sapUntil = -1;
  private sapLevel = 0;
  private dip: THREE.Sprite;
  private dipAt = -99;
  private banked = -1;
  private from = { x: 0, y: 0, face: 0 };
  private to = { x: 0, y: 0, face: 0 };
  private seen = -1;
  private walk = 0;
  private wound = 0;
  private last = 0;
  /** The dark's pools: a light and a ground disc each (made once, unused ones dark). */
  private pools: { light: THREE.PointLight; disc: THREE.Mesh }[] = [];
  /** The jump's trail of dropped light, laid down for one jump (its t0). */
  private trail: { drops: THREE.Sprite[]; t0: number } | null = null;
  private shell: THREE.Mesh;
  private wardRing: THREE.Mesh;
  private wardAt = -99;
  private wardTick = -99;
  /** The model, once in: its root (under `it`), its mixer and clips, and the meshes driven from here. */
  private model: {
    root: THREE.Object3D; mixer: THREE.AnimationMixer; acts: Map<string, THREE.AnimationAction>; now: string; once: { name: string; until: number } | null;
    eye: THREE.Mesh | null; back: THREE.Mesh | null; wound: THREE.Mesh | null; lights: { m: THREE.Mesh; rest: THREE.Quaternion }[]; parts: THREE.Mesh[];
  } | null = null;
  private struck = 0;
  /** The gaze's lens: a wedge the shape of the cone, of glass that bends what is behind it, and the light it draws in. */
  private lens: THREE.Mesh | null = null;
  private lensCone = "";
  private drawn: THREE.Sprite[] = [];
  private leapT0 = -1;

  constructor(glow: Glow) {
    this.glow = glow;
    const L = FIGHT_LOOK, S = OFFSPRING.it.size;
    const mat = (c: string, e?: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...(e ? { emissive: new THREE.Color(e), emissiveIntensity: 0 } : {}) });
    // The body: a low rounded block, its front (+x) the eye's.
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat(L.body));
    this.body.scale.set(S * 0.9, S * 0.42, S * 0.8);
    this.body.position.y = L.ride + 0.25;
    this.it.add(this.body);
    // Four legs at the corners.
    for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, L.ride + 0.2, 8), mat(L.leg));
      leg.geometry.translate(0, -(L.ride + 0.2) / 2, 0);
      leg.position.set(lx * S * 0.3, L.ride + 0.2, lz * S * 0.28);
      this.legs.push(leg);
      this.it.add(leg);
    }
    // The eye: the biggest thing about it, on the front edge. A plain eye: no needle, no tell but the turn.
    const ball = (this.ball = new THREE.Mesh(new THREE.SphereGeometry(S * 0.3, 28, 20), new THREE.MeshStandardMaterial({ color: L.eye, roughness: 0.3, emissive: new THREE.Color(L.eye), emissiveIntensity: 0.25 })));
    this.eye.add(ball);
    // Its glint as the eye turns reflective.
    this.glint = glow(L.mirror, S * 0.9, 0);
    this.glint.position.x = S * 0.32;
    this.eye.add(this.glint);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(S * 0.15, 24), new THREE.MeshStandardMaterial({ color: L.iris, roughness: 0.4, emissive: new THREE.Color(L.iris), emissiveIntensity: 0.3 }));
    iris.rotation.y = Math.PI / 2;
    iris.position.x = S * 0.3 + 0.01;
    this.eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(S * 0.07, 20), new THREE.MeshBasicMaterial({ color: L.pupil }));
    pupil.rotation.y = Math.PI / 2;
    pupil.position.x = S * 0.3 + 0.02;
    this.eye.add(pupil);
    this.eye.position.set(S * 0.38, L.eyeAt, 0);
    this.it.add(this.eye);
    // The back: a thin skin over the light it has eaten.
    this.backSkin = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), mat(L.skin, L.back));
    this.backSkin.scale.set(S * 0.55, S * 0.16, S * 0.6);
    this.backSkin.position.set(-S * 0.15, L.ride + 0.25 + S * 0.17, 0);
    this.it.add(this.backSkin);
    this.backGlow = glow(L.back, S * 0.8, 0);
    this.backGlow.position.set(-S * 0.2, L.ride + 0.9, 0);
    this.it.add(this.backGlow);
    // The wound: a bright slit along the back that opens and shuts.
    this.slit = new THREE.Mesh(new THREE.BoxGeometry(S * 0.5, 0.06, 0.3), new THREE.MeshBasicMaterial({ color: L.wound }));
    this.slit.position.set(-S * 0.18, L.ride + 0.25 + S * 0.24, 0);
    this.slit.scale.z = 0.01;
    this.slit.visible = false;
    this.it.add(this.slit);
    this.slitGlow = glow(L.wound, S * 0.9, 0);
    this.slitGlow.position.set(-S * 0.2, L.ride + 0.9, 0);
    this.it.add(this.slitGlow);
    this.strikeGlow = glow(L.strike, S * 0.9, 0);
    this.strikeGlow.position.set(-S * 0.3, L.ride + 0.95, 0);
    this.it.add(this.strikeGlow);
    // And a ring drawn over the back, on top of everything, so it reads through the light inside it.
    this.strikeRing = new THREE.Mesh(new THREE.RingGeometry(S * 0.16, S * 0.22, 40), new THREE.MeshBasicMaterial({ color: L.strike, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.strikeRing.rotation.x = -Math.PI / 2;
    this.strikeRing.position.set(-S * 0.2, L.ride + 0.3 + S * 0.26, 0);
    this.strikeRing.renderOrder = 10;
    this.it.add(this.strikeRing);
    // Untouchable after its jump: a pale shell, and the ring a turned-aside tap throws off it.
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshBasicMaterial({ color: L.safe.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shell.scale.set(S * 1.05, S * 0.62, S * 0.95);
    this.shell.position.y = L.ride + 0.3;
    this.it.add(this.shell);
    this.wardRing = new THREE.Mesh(new THREE.RingGeometry(S * 0.5, S * 0.56, 48), new THREE.MeshBasicMaterial({ color: L.safe.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.wardRing.rotation.x = -Math.PI / 2;
    this.wardRing.position.y = L.ride + 0.9;
    this.it.add(this.wardRing);
    this.all.add(this.it);
    void offspringModel().then((m) => m && !this.disposed && this.takeModel(m.scene, m.clips));
    // Her light, the boy's, the shard, her flash, and the beam of her hold.
    this.herGlow = glow(L.her, 1.5, 0.9);
    this.fenGlow = glow(L.fen, 0.8, 0.8);
    this.shardGlow = glow(L.shard, 1, 0);
    this.flash = glow(L.her, 1, 0);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: L.her, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.all.add(this.herGlow, this.fenGlow, this.shardGlow, this.flash, this.beam);
    for (let i = 0; i < L.sap.motes; i++) {
      const m = glow(L.sap.color, 0.45, 0);
      this.motes.push(m);
      this.all.add(m);
    }
    this.dip = glow(L.sap.color, 2.5, 0);
    this.dip.position.set(0, 1.2, 0);
    this.all.add(this.dip);
  }

  step(o: { f: Fight; t: number; time: number; half: { w: number; h: number }; rook: THREE.Object3D | null }) {
    const L = FIGHT_LOOK, f = o.f, S = OFFSPRING.it.size;
    const dt = Math.min(0.1, Math.max(0, o.time - this.last));
    this.last = o.time;
    if (f.tick !== this.seen) {
      // A new tick: from where it was drawn to where it is now.
      this.from = this.seen < 0 || f.tick < this.seen ? { x: f.it.x, y: f.it.y, face: f.it.face } : { ...this.to };
      this.to = { x: f.it.x, y: f.it.y, face: f.it.face };
      this.seen = f.tick;
    }
    const t = Math.max(0, Math.min(1, o.t));
    let df = this.to.face - this.from.face;
    while (df > Math.PI) df -= 2 * Math.PI;
    while (df < -Math.PI) df += 2 * Math.PI;
    let x = this.from.x + (this.to.x - this.from.x) * t, y = this.from.y + (this.to.y - this.from.y) * t, up = 0;
    const face = this.from.face + df * t;
    // A leap to her, drawn by her flare: along the line in an arc, smooth over the ticks.
    const lp = f.it.leap;
    if (lp) {
      const k = Math.max(0, Math.min(1, (f.tick - 1 + t - lp.t0) / lp.ticks));
      x = lp.from.x + (lp.to.x - lp.from.x) * k;
      y = lp.from.y + (lp.to.y - lp.from.y) * k;
      up = Math.sin(Math.PI * k) * OFFSPRING.cycles.jump;
    }
    const wx = (px: number) => px + 0.5 - o.half.w, wz = (py: number) => py + 0.5 - o.half.h;
    this.it.position.set(wx(x), up, wz(y));
    this.it.rotation.y = -face;
    // The legs and body move; the eye stays level and still.
    const moving = up === 0 && Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y) > 0.05;
    if (moving) this.walk += dt * 9;
    this.legs.forEach((leg, i) => (leg.rotation.z = moving ? Math.sin(this.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35 : leg.rotation.z * 0.8));
    // In the air its legs hang spread.
    if (up > 0.05) this.legs.forEach((leg, i) => (leg.rotation.z = (i < 2 ? -1 : 1) * 0.55));
    this.body.position.y = L.ride + 0.25 + (moving ? Math.abs(Math.sin(this.walk)) * 0.08 : 0);
    // The back: brighter for every wisp inside it.
    const full = f.it.inside / Math.max(1, f.wisps);
    (this.backSkin.material as THREE.MeshStandardMaterial).emissiveIntensity = full * 2.2;
    // With the model its own lights glow; the sprite is only a little halo over them.
    this.backGlow.material.opacity = full * (this.model ? 0.3 : 0.85);
    this.backGlow.scale.setScalar(S * (this.model ? 0.35 + full * 0.35 : 0.5 + full * 0.9));
    // The wound opens and shuts over a few frames.
    this.wound += (f.it.wound - this.wound) * Math.min(1, dt * 10);
    this.slit.visible = this.wound > 0.02;
    this.slit.scale.z = Math.max(0.01, this.wound);
    this.slitGlow.material.opacity = this.wound * (0.8 + 0.2 * Math.sin(o.time * 12));
    // Where to strike: faint while it is held with the shard out, pulsing once he is behind it.
    const st = f.it.strike ?? 0;
    this.strikeGlow.material.opacity = st === 2 ? 0.55 + 0.4 * Math.sin(o.time * 8) : st === 1 ? 0.4 + 0.1 * Math.sin(o.time * 4) : 0;
    this.strikeGlow.scale.setScalar(S * (st === 2 ? 0.8 + 0.15 * Math.sin(o.time * 8) : 0.7));
    (this.strikeRing.material as THREE.MeshBasicMaterial).opacity = st === 2 ? 0.75 + 0.25 * Math.sin(o.time * 8) : st === 1 ? 0.35 : 0;
    this.strikeRing.scale.setScalar(st === 2 ? 1 + 0.18 * Math.sin(o.time * 8) : 1);
    // The dark: no light has it, so nothing of it shows; while its eye turns or its gaze holds, only the eye.
    const hidden = !!f.it.hidden;
    for (const ch of this.it.children) if (ch !== this.eye) ch.visible = ch === this.slit ? this.slit.visible && !hidden : !hidden;
    this.eye.visible = !hidden || !!f.eye;
    this.stepPools(f, o, wx, wz);
    this.stepWarp(f, o.t, o.time, wx(x), wz(y), face);
    // Untouchable: the shell breathes while it is away, and a tap on it throws a ring off the shell.
    const SF = L.safe, sm = this.shell.material as THREE.MeshBasicMaterial, rm = this.wardRing.material as THREE.MeshBasicMaterial;
    sm.opacity = f.safe ? SF.shell * (0.7 + 0.3 * Math.sin((o.time * 2 * Math.PI) / SF.breathe)) * Math.min(1, f.safe.left / 2) : 0;
    if (f.safe?.ward !== undefined && f.safe.ward !== this.wardTick) (this.wardTick = f.safe.ward), (this.wardAt = o.time);
    const wa = (o.time - this.wardAt) / SF.ward.sec;
    rm.opacity = wa < 1 ? 0.9 * (1 - wa) : 0;
    this.wardRing.scale.setScalar(1 + SF.ward.spread * Math.min(1, wa));
    if (wa < 1) sm.opacity = Math.max(sm.opacity, 0.5 * (1 - wa));
    this.stepTrail(f, o.t, wx, wz);
    // Her light over her: its size is her glow, and it pulses while she winds up.
    const her = f.her, wind = her.doing === "windup" ? 1 + 0.25 * Math.sin(o.time * 18) : 1;
    this.herGlow.position.set(wx(her.x), 2.1, wz(her.y));
    this.herGlow.scale.setScalar((0.5 + (her.glow / her.full) * 2.6) * wind);
    this.herGlow.material.opacity = 0.35 + 0.6 * (her.glow / her.full);
    this.fenGlow.position.set(wx(f.fen.x), 1.5, wz(f.fen.y));
    this.fenGlow.scale.setScalar(0.4 + Math.min(10, f.fen.light) * 0.22);
    // The shard, in Rook's hand.
    const sh = f.shard;
    this.shardGlow.visible = !!sh && sh.glow > 0 && !!o.rook;
    if (sh && o.rook) {
      this.shardGlow.position.set(o.rook.position.x, o.rook.position.y + 1.3, o.rook.position.z);
      this.shardGlow.scale.setScalar(0.4 + (sh.glow / sh.of) * 1.6);
      this.shardGlow.material.opacity = sh.shown ? 0.95 : 0.6 * (sh.glow / sh.of);
    }
    // Her flash: the shove the smallest, the save, the blast, the flare the biggest.
    const fl = her.flash, age = fl ? (f.tick - fl.tick) * 0.6 + t * 0.6 : 99;
    if (fl && age < L.flash) {
      const big = fl.kind === "shove" ? 2.5 : fl.kind === "save" ? 3.5 : fl.kind === "blast" ? 5 : 7;
      this.flash.position.set(wx(her.x), 1.6, wz(her.y));
      this.flash.scale.setScalar(big * (0.4 + age / L.flash));
      this.flash.material.opacity = 1 - age / L.flash;
      this.flash.visible = true;
    } else this.flash.visible = false;
    // The hunt: its eye turns reflective step by step (eye.left of eye.of), whitening and glinting; at the last step it flashes.
    const ey = f.eye, em = this.ball.material as THREE.MeshStandardMaterial;
    const turned = ey ? Math.min(1, (ey.of - ey.left + t) / ey.of) : 0;
    em.emissive.set(ey ? L.mirror : L.eye);
    em.emissiveIntensity = ey ? 0.4 + 2.4 * turned : 0.25;
    em.metalness = ey ? 0.6 * turned : 0;
    this.glint.material.opacity = ey ? 0.25 + 0.7 * turned * (0.75 + 0.25 * Math.sin(o.time * 20)) : 0;
    this.glint.scale.setScalar(S * (0.5 + 0.9 * turned));
    if (this.model) this.stepModel(f, o, dt, moving, up, turned);
    // Light flung out of the wound: a mote arcing from its back to where the light fell.
    for (const q of f.flung ?? []) {
      if (this.flungMotes.has(q.id) && this.flungMotes.get(q.id)!.to.x === q.to.x && this.flungMotes.get(q.id)!.to.y === q.to.y) continue;
      this.flungMotes.get(q.id)?.s.removeFromParent();
      const m = this.glow(L.fling.color, 0.7, 0.95);
      this.all.add(m);
      this.flungMotes.set(q.id, { s: m, from: q.from, to: q.to, at: o.time });
    }
    for (const [id, q] of this.flungMotes) {
      const k = (o.time - q.at) / L.fling.sec;
      if (k >= 1) {
        q.s.removeFromParent();
        q.s.material.dispose();
        this.flungMotes.delete(id);
        continue;
      }
      q.s.position.set(wx(q.from.x + (q.to.x - q.from.x) * k), 0.8 + Math.sin(Math.PI * k) * L.fling.up, wz(q.from.y + (q.to.y - q.from.y) * k));
    }
    // Feeding at the fire: light streams from the brazier into its eye, and the fire dips as each one goes.
    const P = L.sap;
    if (f.it.eating && f.it.after === "brazier") this.sapUntil = o.time + P.hold;
    this.sapLevel += ((o.time < this.sapUntil ? 1 : 0) - this.sapLevel) * Math.min(1, dt * 6);
    const ex = wx(x) + Math.cos(face) * S * 0.38, ez = wz(y) + Math.sin(face) * S * 0.38;
    this.motes.forEach((m, i) => {
      const k = (o.time * P.speed + i / this.motes.length) % 1;
      m.visible = this.sapLevel > 0.02 && !f.it.hidden;
      if (!m.visible) return;
      m.position.set(ex * k, 1.2 + (L.eyeAt - 1.2) * k + Math.sin(Math.PI * k) * 0.8, ez * k);
      m.scale.setScalar(0.25 + 0.3 * (1 - k));
      m.material.opacity = this.sapLevel * Math.sin(Math.PI * k) * 0.9;
    });
    if (this.banked >= 0 && f.banked < this.banked) this.dipAt = o.time;
    this.banked = f.banked;
    const da = o.time - this.dipAt;
    this.dip.material.opacity = da < P.dip ? 0.8 * (1 - da / P.dip) : 0;
    this.dip.scale.setScalar(2.5 * (1 - 0.6 * Math.min(1, da / P.dip)));
    // The hold: a beam from her to its eye.
    const hold = f.it.held && her.doing === "hold";
    (this.beam.material as THREE.MeshBasicMaterial).opacity = hold ? 0.45 + 0.15 * Math.sin(o.time * 14) : 0;
    if (hold) {
      const a = new THREE.Vector3(wx(her.x), 1.6, wz(her.y)), b = new THREE.Vector3(wx(x), L.eyeAt, wz(y));
      const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
      this.beam.position.copy(mid);
      this.beam.scale.set(1, len, 1);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    }
  }

  /** Its gaze: the cone's lens warping more as it looks (the eye's turn, then its hold), the warp running in toward the eye, and light streaming in to it. */
  private stepWarp(f: Fight, t: number, time: number, x: number, z: number, face: number) {
    const W = FIGHT_LOOK.warp, E = f.eye, S = OFFSPRING.it.size;
    const on = !!E && !f.it.held;
    // How long it has looked, of the whole turn and hold.
    const k = E ? Math.min(1, (E.of - E.left + (E.gaze !== undefined && E.hold ? E.hold - E.gaze : 0) + Math.max(0, Math.min(1, t))) / (E.of + (E.hold ?? 0))) : 0;
    if (on && E) {
      const key = `${E.cone}:${E.r}`;
      if (!this.lens || this.lensCone !== key) {
        this.lens?.removeFromParent();
        this.lens?.geometry.dispose();
        const near = S / 2, far = S / 2 + E.r, a = (E.cone * Math.PI) / 180, sh = new THREE.Shape();
        sh.moveTo(Math.cos(-a) * near, Math.sin(-a) * near);
        sh.absarc(0, 0, far, -a, a, false);
        sh.lineTo(Math.cos(a) * near, Math.sin(a) * near);
        sh.absarc(0, 0, near, a, -a, true);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: W.high, bevelEnabled: false, curveSegments: 24 });
        // The shape is drawn in x, y; stood up so y is the ground's z and the depth is up.
        geo.rotateX(Math.PI / 2);
        geo.translate(0, W.high, 0);
        const nm = warpNormals();
        const mat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0, transmission: 1, thickness: 1.2, ior: 1.25, normalMap: nm, normalScale: new THREE.Vector2(0, 0), emissive: new THREE.Color(FIGHT_LOOK.mirror), emissiveMap: shimmerTex, emissiveIntensity: 0, transparent: true, opacity: 1, depthWrite: false });
        this.lens = new THREE.Mesh(geo, mat);
        this.lens.renderOrder = 5;
        this.all.add(this.lens);
        this.lensCone = key;
      }
      const m = this.lens.material as THREE.MeshPhysicalMaterial;
      this.lens.visible = true;
      this.lens.position.set(x, 0, z);
      this.lens.rotation.y = -face;
      m.normalScale.setScalar(W.strength * k * k);
      // The ripples run in toward the eye, and shimmer faintly as they go.
      m.normalMap!.offset.set(time * W.pull, time * 0.13);
      m.emissiveMap?.offset.copy(m.normalMap!.offset);
      m.emissiveIntensity = W.shimmer * k;
    } else if (this.lens) this.lens.visible = false;
    // Light drawn in: motes from across the cone streaming to its eye.
    while (on && this.drawn.length < W.motes) {
      const m = this.glow(W.color, W.size, 0);
      this.all.add(m);
      this.drawn.push(m);
    }
    const ex = x + Math.cos(face) * S * 0.25, ez = z + Math.sin(face) * S * 0.25;
    this.drawn.forEach((m, i) => {
      m.visible = on;
      if (!on || !E) return;
      const u = (time * (0.7 + 0.5 * k) + i / W.motes) % 1, a = ((((i * 37) % 11) / 10) * 2 - 1) * (E.cone * Math.PI) / 180, r = S / 2 + E.r * (1 - u) * (0.4 + 0.6 * (((i * 53) % 7) / 6));
      m.position.set(x + Math.cos(face + a * (1 - u)) * r * (1 - u) + (ex - x) * u, 0.3 + 1.0 * u, z + Math.sin(face + a * (1 - u)) * r * (1 - u) + (ez - z) * u);
      m.material.opacity = (0.25 + 0.7 * k) * Math.sin(Math.PI * u);
      m.scale.setScalar(W.size * (1.2 - 0.7 * u));
    });
  }

  /** The jump: drops of light fall from it along its arc as it flees, then fade on the ground until it comes back. */
  private stepTrail(f: Fight, t: number, wx: (x: number) => number, wz: (y: number) => number) {
    const T = FIGHT_LOOK.trail, B = f.bolt;
    if (!B || (this.trail && this.trail.t0 !== B.t0)) {
      this.trail?.drops.forEach((d) => (d.removeFromParent(), d.material.dispose()));
      this.trail = null;
    }
    if (!B) return;
    if (!this.trail) {
      const drops: THREE.Sprite[] = [];
      for (let i = 0; i < T.drops; i++) {
        const d = this.glow(T.color, T.size * (0.6 + 0.8 * ((i * 7) % 5) / 4), 0);
        // A little to either side of the line, as it lands where it falls.
        const k = (i + 0.5) / T.drops, side = (((i * 13) % 7) / 6 - 0.5) * 0.9;
        const dx = B.to.x - B.from.x, dy = B.to.y - B.from.y, n = Math.hypot(dx, dy) || 1;
        d.position.set(wx(B.from.x + dx * k - (dy / n) * side), 0.12, wz(B.from.y + dy * k + (dx / n) * side));
        d.userData.k = k;
        this.all.add(d);
        drops.push(d);
      }
      this.trail = { drops, t0: B.t0 };
    }
    // Laid down as it passes over, then fading through its time away.
    const flew = (f.tick - B.t0 + Math.max(0, Math.min(1, t))) / B.ticks, after = Math.max(0, f.tick - B.t0 - B.ticks + t) / B.away;
    for (const d of this.trail.drops) d.material.opacity = flew >= (d.userData.k as number) ? T.glow * Math.max(0, 1 - after) : 0;
  }

  /** The dark: a light and a disc for each pool, Rook's own shuddering on each knock, harder the nearer it is. */
  private stepPools(f: Fight, o: { t: number; time: number; rook: THREE.Object3D | null }, wx: (x: number) => number, wz: (y: number) => number) {
    const P = FIGHT_LOOK.pools, D = f.dark;
    while (D && this.pools.length < Math.min(P.max, D.pools.length)) {
      const light = new THREE.PointLight("#ffffff", 0, 4, 1.5);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.03;
      this.all.add(light, disc);
      this.pools.push({ light, disc });
    }
    // The knock: Rook's light gives a little on each one (every 2 ticks from bar 1, as the knock stem plays).
    const kc = knockClock(), t0 = kc ?? 0, age = ((((f.tick - t0) % 2) + 2) % 2 + Math.max(0, Math.min(1, o.t))) * 0.6;
    const S = FIGHT_LOOK.shudder, near = D ? nearness(D.hear.d) : 0, kick = age < S.sec ? near * Math.exp(-age / (S.sec / 3)) : 0;
    this.pools.forEach((q, i) => {
      const p = D && !D.flood ? D.pools[i] : undefined;
      q.light.visible = q.disc.visible = !!p;
      if (!p) return;
      const [color, power, high] = P.light[p.k]!, mine = i === 0 && o.rook;
      const x = mine ? o.rook!.position.x : wx(p.x), z = mine ? o.rook!.position.z : wz(p.y);
      const shake = mine ? kick : 0;
      q.light.color.set(color);
      q.light.intensity = power * (1 - S.light * shake);
      q.light.distance = p.r * 1.7;
      q.light.position.set(x, high, z);
      q.disc.position.set(x, 0.03, z);
      q.disc.scale.setScalar(p.r * (1 + S.size * shake * Math.sin(age * 60)));
      const m = q.disc.material as THREE.MeshBasicMaterial;
      m.color.set(color);
      m.opacity = P.disc * (1 - S.light * shake);
    });
  }

  private disposed = false;
  /** The model is in: a copy of it under `it`, turned to face +x (the eye's way here), the placeholder shapes put away. */
  private takeModel(src: THREE.Object3D, clips: THREE.AnimationClip[]) {
    const L = FIGHT_LOOK, S = OFFSPRING.it.size, root = cloneSkinned(src), k = (L.model.wide / 3.38) * (S / 3);
    root.scale.setScalar(k);
    root.rotation.y = Math.PI / 2;
    const parts: THREE.Mesh[] = [];
    let eye: THREE.Mesh | null = null, back: THREE.Mesh | null = null, wound: THREE.Mesh | null = null;
    const lights: { m: THREE.Mesh; rest: THREE.Quaternion }[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      // Its own materials, so this fight's changes stay its own; the game's look on the plain ones.
      m.material = (m.material as THREE.Material).clone();
      const mat = m.material as THREE.MeshStandardMaterial, own = m.name === "back" || m.name === "wound" || m.name.startsWith("light_");
      if (!own && m.name !== "eye") {
        mat.metalness = 0;
        mat.roughness = 1;
        if (mat.map) (mat.emissiveMap = mat.map), mat.emissive.set("#ffffff");
        else mat.emissive.copy(mat.color);
        mat.emissiveIntensity = 0.4;
        // A faint warm rim (fresnel) on the body and arms, so its shape reads from the camera above in the dark.
        const R = FIGHT_LOOK.model.rim;
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uRim = { value: new THREE.Color(R.color) };
          sh.uniforms.uRimK = { value: R.strength };
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform vec3 uRim;\nuniform float uRimK;")
            .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * uRimK * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), ${R.power.toFixed(1)});`);
        };
        mat.customProgramCacheKey = () => "offspring-rim";
      }
      if (m.name === "eye") eye = m;
      else if (m.name === "back") back = m;
      else if (m.name === "wound") wound = m;
      else if (m.name.startsWith("light_")) lights.push({ m, rest: m.quaternion.clone() });
      parts.push(m);
    });
    lights.sort((a, b) => a.m.name.localeCompare(b.m.name));
    const mixer = new THREE.AnimationMixer(root), acts = new Map<string, THREE.AnimationAction>();
    for (const c of clips) acts.set(c.name, mixer.clipAction(c));
    for (const n of ["stagger", "leap", "die"]) {
      const a = acts.get(n);
      if (a) (a.setLoop(THREE.LoopOnce, 1), (a.clampWhenFinished = true));
    }
    acts.get("idle")?.play();
    // The placeholder body, legs, back and eye go; its glows and rings stay as the tells they are.
    for (const ph of [this.body, ...this.legs, this.backSkin, this.slit]) ph.visible = false;
    this.body.removeFromParent();
    this.legs.forEach((l) => l.removeFromParent());
    this.backSkin.removeFromParent();
    this.slit.removeFromParent();
    this.ball.visible = false;
    for (const ch of this.eye.children) if (ch !== this.glint) ch.visible = false;
    // The glint sits on the model's eye (its middle about 1.48 up and 0.47 forward, unscaled).
    this.eye.position.set(0.47 * k, 1.48 * k, 0);
    this.glint.position.x = 0.25 * k;
    this.it.add(root);
    this.model = { root, mixer, acts, now: "idle", once: null, eye, back, wound, lights, parts };
  }

  /** The model's tick: which clip, the back's stage, the wound, the eye going to a mirror, the ink turning, and what shows in the dark. */
  private stepModel(f: Fight, o: { time: number }, dt: number, moving: boolean, up: number, turned: number) {
    const M = this.model!, L = FIGHT_LOOK.model, it = f.it;
    // The clip: a one-shot (struck, a leap) plays out; else held, feeding, crawling, walking, or still.
    if (it.wound > 0 && this.struck === 0) M.once = { name: "stagger", until: o.time + 0.8 };
    this.struck = it.wound;
    const lp = it.leap;
    if (lp && lp.t0 !== this.leapT0) {
      this.leapT0 = lp.t0;
      M.once = { name: "leap", until: o.time + lp.ticks * 0.6 };
      const a = M.acts.get("leap");
      if (a) a.timeScale = 1.8 / Math.max(0.6, lp.ticks * 0.6);
    }
    if (M.once && o.time >= M.once.until) M.once = null;
    const want = M.once?.name ?? (it.held ? "stunned" : it.eating ? "feed" : moving && it.crawl ? "crawl" : moving || up > 0.05 ? "walk" : "idle");
    if (want !== M.now && M.acts.has(want)) {
      const from = M.acts.get(M.now), to = M.acts.get(want)!;
      to.reset().play();
      if (from) to.crossFadeFrom(from, L.blend, false);
      M.now = want;
    }
    M.mixer.update(dt);
    // The back: Ladi's four stages, by how full it is.
    const full = it.inside / Math.max(1, f.wisps), st = full >= 1 ? L.stages[0] : full > 0.5 ? L.stages[1] : full > 0 ? L.stages[2] : L.stages[3];
    M.lights.forEach((q, i) => {
      q.m.visible = i < st[0];
      // The ink turning in each light.
      const spin = o.time * (L.ink[0] + L.ink[1] * (i + 1));
      q.m.quaternion.copy(q.rest).multiply(TMP_Q.setFromAxisAngle(Y_AXIS, spin));
    });
    if (M.back) (M.back.material as THREE.MeshStandardMaterial).emissiveIntensity = st[1];
    if (M.wound) M.wound.scale.y = L.wound[0] + (L.wound[1] - L.wound[0]) * this.wound;
    // Its eye: toward a mirror as it turns on him (and a little while it feeds).
    if (M.eye) {
      const em = M.eye.material as THREE.MeshStandardMaterial, k = Math.max(turned, it.eating ? 0.35 : 0);
      // Plain, its own brown eye lit a little by its paint; turning, the paint gives way to a white mirror.
      em.emissiveMap = k > 0.01 ? null : em.map;
      if ((em.userData.mapped as boolean | undefined) !== k <= 0.01) (em.userData.mapped = k <= 0.01), (em.needsUpdate = true);
      em.emissive.set(k > 0.01 ? FIGHT_LOOK.mirror : "#ffffff");
      em.emissiveIntensity = k > 0.01 ? 0.4 + 2.2 * k : 0.45;
      em.metalness = 0.6 * k;
      em.roughness = 1 - 0.7 * k;
    }
    // The dark: unseen, only its eye shows (while it turns on him).
    const hidden = !!it.hidden;
    M.root.visible = !hidden || !!f.eye;
    for (const m of M.parts) m.visible = !hidden || m === M.eye ? m.name.startsWith("light_") ? m.visible : true : false;
  }

  dispose() {
    this.disposed = true;
    this.all.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.all.removeFromParent();
  }
}
