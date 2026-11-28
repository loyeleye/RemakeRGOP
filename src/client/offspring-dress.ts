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
   * Rook thrown (a knockdown, Ladi 27 Nov 5:55 PM): his flight from his old spot to his new one (ticks, and how
   * high), how far over he goes (degrees back), how long it takes him to get up at the end (ticks), and his daze:
   * stars round his head while he is down, and a puff of dust where he lands. The gameplay thread's starting picks.
   */
  /**
   * Its death (OFFSPRING.death; Ladi, 27 Nov 6:27 PM: "a dramatic kill scene where the light dissipates it"), in
   * seconds from the last press: a flash, then it shakes and burns white from inside (`hot`), its light tears out
   * of it and spirals up (`motes`, `rise`, `spread`), it comes apart and fades (`fade`: from, to), and a ring of
   * light runs out over the ground (`ring`: at, speed). The gameplay thread's starting picks.
   * With his own clips (the cast thread's knocked and getup, 28 Nov, Ladi: "Let's add knocked and get up"), they
   * play instead of the tip-over, sped up by `knockedSpeed` and `getupSpeed` to fit his ticks down (1.1 s and
   * 1.6 s at their own speed, against 1.8 s down).
   */
  death: { flash: "#fff4d6", hot: "#ffe2a0", heat: 1.6, shake: 0.07, motes: 56, rise: 4.2, spread: 3.2, size: 0.5, fade: [1.5, 3.1] as const, ring: [2.4, 7] as const, ringColor: "#ffd890" },
  /**
   * Solenne's save (Ladi, 27 Nov 10:57 PM: "an animation of her saving you and stunning the offspring
   * that's visible and easy to tell what happened"; the beats are the gameplay thread's draft, the
   * numbers here are the build's, timed to the cast thread's clips, 28 Nov): a thick pale-gold beam
   * from her right hand to its eye, leaving at `start` and crossing in `cross` seconds, gone by
   * `beam[1]`; a burst at its eye as it lands (`hit`); its eye whited out for `white`, then shut
   * (its own lid, in its recoil and stunshut clips; scaled flat without them); it held where it
   * stood until the beam lands, then thrown back over `slide`; a streak on the ground; sparks
   * crawling over it while it is dazed. Solenne plays her save clip (arm up, the jolt, down on a
   * knee), holds the knee, and rises at `riseAt`; without the clips she leans down a little for
   * `kneel`. Rook goes down on his own clips (thrown).
   */
  save: { color: "#ffe9a8", core: 0.22, outer: 0.7, start: 0.2, cross: 0.15, hit: 0.35, beam: [1.1, 1.4] as const, burst: [0.35, 0.95] as const, burstSize: 4.5, white: 0.2, shut: 0.12, slide: [0.35, 0.7] as const, recoil: 1, streak: [0.35, 1.5] as const, sparks: 7, sparkSize: 0.5, sparkColor: "#cfe3ff", riseAt: 3, rise: 1, kneel: [0.5, 2.6] as const, kneelDrop: 0.45, kneelLean: 14 },
  thrown: { knockedSpeed: 1.5, getupSpeed: 1.7, flight: 0.6, high: 0.9, tilt: 78, rise: 0.9, stars: 3, starSize: 0.42, starSpin: 5, starColor: "#ffe38a", dust: "#b9a58a", dustSize: 2.2 },
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
/** What throwRook needs of a cast member's animation (view3d's CastAnim). */
type HoldAnim = { has(move: string): boolean; hold(move: string, timeScale?: number, fade?: number): boolean; release(): void };
const TMP_Q = new THREE.Quaternion(), Y_AXIS = new THREE.Vector3(0, 1, 0);
/** A small four-pointed star, for his daze. */
function starTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.translate(32, 32);
  g.fillStyle = "#ffffff";
  g.shadowColor = "#ffffff";
  g.shadowBlur = 8;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, r = i % 2 ? 7 : 26;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TMP_V = new THREE.Vector3();

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
  /** His throw: the stars of his daze and the dust where he lands (made on the first throw), and whether his root is tilted now. */
  private daze: { stars: THREE.Sprite[]; dust: THREE.Sprite } | null = null;
  /** Its death under way: when it began (s), the light leaving it, the flash, the ring, and its own materials (cloned, so fading them fades only this one). */
  private death: { at: number; motes: { s: THREE.Sprite; a: number; up: number; out: number; t0: number }[]; flash: THREE.Sprite; ring: THREE.Mesh; mats: THREE.MeshStandardMaterial[] } | null = null;
  private tilted: THREE.Object3D | null = null;
  /** His own clips under way for one throw (its tick), and whether getup has started. */
  private clip: { tick: number; anim: HoldAnim; up: boolean } | null = null;
  /** Solenne's save, while it plays (FIGHT_LOOK.save). */
  private saveFx: { tick: number; core: THREE.Mesh; outer: THREE.Mesh; burst: THREE.Sprite; streak: THREE.Mesh; sparks: THREE.Sprite[]; eyeRest: number | null } | null = null;
  private knelt: THREE.Object3D | null = null;
  /** Her right hand, where the save's beam leaves from (her model's hand_R), and her clip under way. */
  private herHand: THREE.Object3D | null = null;
  private herClip: { tick: number; anim: HoldAnim; rose: boolean; done: boolean } | null = null;
  /** Seconds into her save (99 when none), worked out each frame for stepModel. */
  private saveSec = 99;

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
    // Her save: it stands where it was caught until her beam lands, then is thrown back (FIGHT_LOOK.save.slide).
    const sv = f.save, SV = L.save;
    this.saveSec = sv ? (f.tick - sv.tick + t) * 0.6 : 99;
    if (sv && this.saveSec >= 0 && this.saveSec < SV.slide[1]) {
      const k = Math.max(0, Math.min(1, (this.saveSec - SV.slide[0]) / (SV.slide[1] - SV.slide[0]))), e = 1 - (1 - k) * (1 - k);
      x = sv.from.x + (sv.to.x - sv.from.x) * e;
      y = sv.from.y + (sv.to.y - sv.from.y) * e;
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
    this.stepDeath(f, o.time, wx(x), wz(y));
    this.stepSave(f, t, wx, wz, wx(x), wz(y), up);
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
    for (const n of ["stagger", "leap", "die", "recoil"]) {
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
    // Her save: its recoil as her beam lands, then stunshut for as long as it is dazed.
    const SV = FIGHT_LOOK.save, ss = this.saveSec - SV.hit, dazed = !!f.save && ss >= 0 && this.saveSec < (f.save.until - f.save.tick + 1) * 0.6;
    const saved = dazed && M.acts.has("recoil") ? (ss < SV.recoil ? "recoil" : M.acts.has("stunshut") ? "stunshut" : "stunned") : null;
    const want = f.dying && M.acts.has("die") ? "die" : saved ?? M.once?.name ?? (it.held ? "stunned" : it.eating ? "feed" : moving && it.crawl ? "crawl" : moving || up > 0.05 ? "walk" : "idle");
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

  /** Her save, shown (FIGHT_LOOK.save): the beam, the burst at its eye, its eye shut, the streak and its daze. */
  private stepSave(f: Fight, t: number, wx: (px: number) => number, wz: (py: number) => number, x: number, z: number, up: number) {
    const V = FIGHT_LOOK.save, s = f.save, S = OFFSPRING.it.size;
    const sec = s ? (f.tick - s.tick + t) * 0.6 : 99, end = s ? (s.until - s.tick + 1) * 0.6 : 0;
    const eye = this.model?.eye ?? null;
    if (!s || sec < 0 || sec > Math.max(end, V.beam[1], V.streak[1])) {
      if (this.saveFx) {
        for (const m of [this.saveFx.core, this.saveFx.outer, this.saveFx.burst, this.saveFx.streak, ...this.saveFx.sparks]) m.visible = false;
        if (eye && this.saveFx.eyeRest !== null) eye.scale.y = this.saveFx.eyeRest;
        const em = eye?.material as THREE.MeshStandardMaterial | undefined;
        if (em?.userData.color !== undefined) em.color.setHex(em.userData.color as number);
        this.saveFx.eyeRest = null;
      }
      return;
    }
    if (!this.saveFx) {
      const mat = (o: number) => new THREE.MeshBasicMaterial({ color: V.color, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending });
      const core = new THREE.Mesh(new THREE.CylinderGeometry(V.core, V.core, 1, 12, 1, true), mat(0));
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(V.outer, V.outer, 1, 16, 1, true), mat(0));
      const burst = this.glow(V.color, V.burstSize, 0);
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(0));
      streak.rotation.x = -Math.PI / 2;
      const tex = starTexture(), sparks: THREE.Sprite[] = [];
      for (let i = 0; i < V.sparks; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: V.sparkColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.scale.setScalar(V.sparkSize);
        sp.renderOrder = 5;
        sparks.push(sp);
      }
      for (const m of [core, outer, burst, streak, ...sparks]) (m.renderOrder = 6), this.all.add(m);
      this.saveFx = { tick: -1, core, outer, burst, streak, sparks, eyeRest: null };
    }
    const X = this.saveFx;
    X.tick = s.tick;
    // The beam: from her to its eye, reaching it over `cross`, held, then fading.
    const eyeAt = new THREE.Vector3();
    if (eye) eye.getWorldPosition(eyeAt), this.all.worldToLocal(eyeAt);
    else eyeAt.set(x, FIGHT_LOOK.eyeAt + up, z);
    const a = new THREE.Vector3(wx(s.sol.x), 1.6, wz(s.sol.y));
    if (this.herHand) this.herHand.getWorldPosition(a), this.all.worldToLocal(a);
    const reach = Math.max(0, Math.min(1, (sec - V.start) / V.cross)), fade = sec < V.start ? 0 : sec < V.beam[0] ? 1 : Math.max(0, 1 - (sec - V.beam[0]) / (V.beam[1] - V.beam[0]));
    const b = a.clone().lerp(eyeAt, reach), len = Math.max(0.01, a.distanceTo(b)), mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    for (const [m, o] of [[X.core, 0.95], [X.outer, 0.35]] as const) {
      m.visible = fade > 0;
      m.position.copy(mid);
      m.scale.set(1, len, 1);
      if (len > 0.02) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      (m.material as THREE.MeshBasicMaterial).opacity = o * fade * (0.85 + 0.15 * Math.sin(sec * 40));
    }
    // The burst at its eye as the beam lands.
    const bk = (sec - V.burst[0]) / (V.burst[1] - V.burst[0]);
    X.burst.visible = bk >= 0 && bk < 1;
    if (X.burst.visible) X.burst.position.copy(eyeAt), X.burst.scale.setScalar(V.burstSize * (0.4 + bk)), (X.burst.material.opacity = 1 - bk);
    // Its eye: white as the beam lands, then shut while it is dazed.
    if (eye) {
      if (X.eyeRest === null) X.eyeRest = eye.scale.y;
      const em = eye.material as THREE.MeshStandardMaterial;
      em.userData.color ??= em.color.getHex();
      if (sec >= V.hit && sec < V.hit + V.white) (em.emissiveMap = null), em.color.set("#ffffff"), em.emissive.set("#ffffff"), (em.emissiveIntensity = 4), (em.needsUpdate = true);
      else em.color.setHex(em.userData.color as number);
      // Its own lid shuts it in the recoil clip; without it, the eye is flattened shut.
      const lid = !!this.model?.acts.has("recoil");
      eye.scale.y = !lid && sec >= V.hit + V.white && sec < end ? X.eyeRest * V.shut : X.eyeRest;
    }
    // The streak on the ground, from where it stood to where she knocked it.
    const sk = (sec - V.streak[0]) / (V.streak[1] - V.streak[0]);
    const p0 = { x: wx(s.from.x), z: wz(s.from.y) }, p1 = { x: wx(s.to.x), z: wz(s.to.y) }, sl = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    X.streak.visible = sk >= -1 && sk < 1 && sl > 0.1;
    if (X.streak.visible) {
      X.streak.position.set((p0.x + p1.x) / 2, 0.06, (p0.z + p1.z) / 2);
      X.streak.rotation.set(-Math.PI / 2, 0, -Math.atan2(p1.z - p0.z, p1.x - p0.x));
      X.streak.scale.set(sl + S * 0.6, S * 0.7, 1);
      (X.streak.material as THREE.MeshBasicMaterial).opacity = 0.45 * (sk < 0 ? 1 : 1 - sk);
    }
    // Sparks crawling over it while it is dazed.
    const dazed = sec >= V.hit && sec < end;
    X.sparks.forEach((sp, i) => {
      sp.visible = dazed;
      if (!dazed) return;
      const ang = sec * (2.2 + (i % 3) * 0.7) + (i / X.sparks.length) * Math.PI * 2, r = S * (0.3 + 0.12 * Math.sin(sec * 5 + i));
      sp.position.set(x + Math.cos(ang) * r, up + S * 0.35 + 0.5 * Math.sin(sec * 7 + i * 1.7) + 0.6, z + Math.sin(ang) * r);
      sp.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(sec * 11 + i));
    });
  }

  /**
   * Solenne's part in the save: her save clip, turned to face it (then the knee held, then rise), or,
   * without the clips, a lean down for a moment. Call after the players are placed.
   */
  herSave(o: { f: Fight; t: number; half: { w: number; h: number }; her: THREE.Object3D | null; rig: { body: THREE.Object3D | null; anim: HoldAnim | null; face: (a: number) => void } | null }) {
    const V = FIGHT_LOOK.save, s = o.f.save, sec = s ? (o.f.tick - s.tick + Math.max(0, Math.min(1, o.t))) * 0.6 : 99;
    this.herHand = o.rig?.body?.getObjectByName("hand_R") ?? null;
    const A = o.rig?.anim && o.rig.anim.has("save") ? o.rig.anim : null;
    if (A && o.rig && s && sec >= 0 && sec < V.riseAt + V.rise) {
      if (this.herClip?.tick !== s.tick) {
        this.herClip = { tick: s.tick, anim: A, rose: false, done: false };
        A.hold("save", 1, 0.1);
      }
      // Facing it where it was caught (the clip points straight ahead).
      const face = Math.atan2(s.from.x - s.sol.x, s.from.y - s.sol.y);
      o.rig.face(face);
      if (o.rig.body) o.rig.body.rotation.y = face;
      if (!this.herClip.rose && sec >= V.riseAt) (this.herClip.rose = true), A.hold(A.has("rise") ? "rise" : "idle", 1, 0);
      return;
    }
    if (this.herClip && !this.herClip.done) (this.herClip.done = true), this.herClip.anim.release();
    if (A) return;
    this.kneelHer(o.f, o.t, o.her);
  }

  /** Without her clips: down a little for a moment (FIGHT_LOOK.save.kneel). */
  private kneelHer(f: Fight, t: number, her: THREE.Object3D | null) {
    const V = FIGHT_LOOK.save, s = f.save, sec = s ? (f.tick - s.tick + Math.max(0, Math.min(1, t))) * 0.6 : 99;
    const k = sec < V.kneel[0] || sec > V.kneel[1] ? 0 : Math.min(1, (sec - V.kneel[0]) / 0.2, (V.kneel[1] - sec) / 0.4);
    if (!her || k <= 0) {
      if (this.knelt) (this.knelt.rotation.x = 0), (this.knelt = null);
      return;
    }
    this.knelt = her;
    her.position.y -= V.kneelDrop * k;
    her.rotation.x = ((V.kneelLean * Math.PI) / 180) * k;
  }

  /** Its death: the light tears out of it and it comes apart (FIGHT_LOOK.death). */
  private stepDeath(f: Fight, time: number, x: number, z: number) {
    const D = FIGHT_LOOK.death, S = OFFSPRING.it.size;
    if (!f.dying) return;
    if (!this.death) {
      const motes = Array.from({ length: D.motes }, (_, i) => {
        const s = this.glow(i % 3 ? D.hot : D.flash, D.size * (0.6 + Math.random() * 0.8), 0);
        this.all.add(s);
        return { s, a: Math.random() * 2 * Math.PI, up: D.rise * (0.6 + Math.random() * 0.6), out: D.spread * (0.5 + Math.random() * 0.7), t0: 0.15 + (i / D.motes) * 1.9 };
      });
      const flash = this.glow(D.flash, S * 3, 0);
      this.all.add(flash);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: D.ringColor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      this.all.add(ring);
      // Its own materials, cloned so the fade is this body's alone.
      const mats: THREE.MeshStandardMaterial[] = [];
      (this.model?.root ?? this.it).traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !(m.material instanceof THREE.MeshStandardMaterial)) return;
        const c = m.material.clone();
        c.transparent = true;
        c.userData.e0 = c.emissiveIntensity;
        m.material = c;
        mats.push(c);
      });
      this.death = { at: time, motes, flash, ring, mats };
    }
    const d = this.death, s = time - d.at, sm = (a: number, b: number) => Math.max(0, Math.min(1, (s - a) / (b - a)));
    // It shakes, harder at first, as it burns white from inside.
    const shake = D.shake * (1 - sm(0, 2));
    this.it.position.x += (Math.random() * 2 - 1) * shake;
    this.it.position.z += (Math.random() * 2 - 1) * shake;
    const hot = sm(0, D.heat), gone = sm(D.fade[0], D.fade[1]);
    for (const m of d.mats) {
      m.emissive.set(D.hot);
      m.emissiveIntensity = (m.userData.e0 as number) + 3.5 * hot * (1 - gone);
      m.opacity = 1 - gone;
    }
    this.it.scale.setScalar(1 - 0.2 * gone);
    // Its lights burn bright and go first.
    if (this.model) for (const q of this.model.lights) (q.m.visible = gone < 0.6), q.m.scale.setScalar(1 + 1.5 * hot);
    // The flash of the press, and a second as it goes.
    const fl = Math.max(1 - sm(0, 0.4), Math.sin(Math.PI * sm(D.fade[1] - 0.5, D.fade[1] + 0.3)));
    d.flash.position.set(x, 1.4, z);
    d.flash.material.opacity = 0.7 * fl;
    d.flash.scale.setScalar(S * (1.8 + 1.4 * fl));
    // Its light, torn out of its back and spiralling up and away.
    for (const m of d.motes) {
      const k = sm(m.t0, m.t0 + 1.5), e = 1 - (1 - k) * (1 - k), a = m.a + e * 2.2;
      m.s.visible = k > 0 && k < 1;
      m.s.position.set(x + Math.cos(a) * m.out * e, 1.2 + m.up * e, z + Math.sin(a) * m.out * e);
      m.s.material.opacity = Math.sin(Math.PI * k) * 0.95;
    }
    // A ring of light runs out over the ground as it is gone.
    const r = s - D.ring[0];
    d.ring.visible = r > 0;
    if (r > 0) {
      d.ring.position.set(x, 0.06, z);
      d.ring.scale.setScalar(0.5 + D.ring[1] * r);
      (d.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - r * 0.7);
    }
  }

  /**
   * After the figures are placed: Rook thrown, flown along an arc from his old spot to his new one and tipped
   * over backwards, lying there dazed (stars round his head) while he is down, then back up.
   */
  throwRook(o: { f: Fight; t: number; time: number; half: { w: number; h: number }; rook: THREE.Object3D | null; rig?: { body: THREE.Object3D | null; anim: HoldAnim | null; face: (a: number) => void } | null }) {
    const T = FIGHT_LOOK.thrown, th = o.f.thrown, R = o.rook, A = o.rig?.anim && o.rig.anim.has("knocked") && o.rig.anim.has("getup") ? o.rig.anim : null;
    const e = th ? o.f.tick - th.tick + Math.max(0, Math.min(1, o.t)) : 99;
    const on = !!th && !!R && e >= 0 && e < th.ticks + 0.05;
    if (!on) {
      if (this.clip) (this.clip.anim.release(), (this.clip = null));
      if (this.tilted) (this.tilted.quaternion.identity(), (this.tilted = null));
      if (this.daze) (this.daze.stars.forEach((s) => (s.visible = false)), (this.daze.dust.visible = false));
      return;
    }
    if (!this.daze) {
      const tex = starTexture(), stars: THREE.Sprite[] = [];
      for (let i = 0; i < T.stars; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: T.starColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.setScalar(T.starSize);
        s.renderOrder = 5;
        this.all.add(s);
        stars.push(s);
      }
      const dust = this.glow(T.dust, T.dustSize, 0);
      this.all.add(dust);
      this.daze = { stars, dust };
    }
    const wx = (px: number) => px + 0.5 - o.half.w, wz = (py: number) => py + 0.5 - o.half.h;
    const a = { x: wx(th.from.x), z: wz(th.from.y) }, b = { x: wx(th.to.x), z: wz(th.to.y) };
    const k = Math.min(1, e / T.flight), ease = 1 - (1 - k) * (1 - k);
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1, high = T.high * Math.min(1, len / 1.5);
    (dx /= len), (dz /= len);
    // In the air along the arc, then where he fell (a small bounce as he hits).
    const bounce = k >= 1 ? Math.max(0, Math.sin(Math.min(1, (e - T.flight) / 0.25) * Math.PI)) * 0.08 : 0;
    R.position.set(a.x + (b.x - a.x) * ease, Math.sin(Math.PI * k) * high + bounce, a.z + (b.z - a.z) * ease);
    let up: number, head: THREE.Vector3;
    if (A && o.rig) {
      // His own clips: knocked as he is thrown, held flat, then getup timed to end as his ticks down do. He faces
      // back the way he came, so falling back lays him along the throw.
      const face = Math.atan2(-dx, -dz), getup = 1.6 / T.getupSpeed / 0.6, from = th.ticks - getup;
      o.rig.face(face);
      if (o.rig.body) o.rig.body.rotation.y = face;
      if (this.clip?.tick !== th.tick) (this.clip = { tick: th.tick, anim: A, up: false }), A.hold("knocked", T.knockedSpeed, 0.08);
      if (!this.clip.up && e >= from) (this.clip.up = true), A.hold("getup", T.getupSpeed, 0);
      up = Math.max(0, Math.min(1, (e - from) / getup));
      const lie = Math.min(1, e / (1.1 / T.knockedSpeed / 0.6)) * (1 - up);
      head = TMP_V.set(R.position.x + dx * 1.45 * lie, 1.55 - 1.3 * lie, R.position.z + dz * 1.45 * lie);
    } else {
      // Tipped over backwards, head along the throw; up again over the last `rise` ticks.
      up = Math.max(0, Math.min(1, (e - (th.ticks - T.rise)) / T.rise));
      const tilt = ((T.tilt * Math.PI) / 180) * ease * (1 - up * up * (3 - 2 * up));
      R.quaternion.setFromAxisAngle(TMP_V.set(dz, 0, -dx), tilt);
      this.tilted = R;
      head = TMP_V.set(0, 1.55, 0).applyQuaternion(R.quaternion).add(R.position);
    }
    // His daze: stars circling where his head is, from the moment he lands until he is up.
    const fade = Math.min(1, Math.max(0, (e - T.flight * 0.6) / 0.2)) * (1 - Math.max(0, up - 0.6) / 0.4);
    this.daze.stars.forEach((s, i) => {
      const ang = o.time * T.starSpin + (i * 2 * Math.PI) / T.stars;
      s.visible = fade > 0.01;
      s.position.set(head.x + Math.cos(ang) * 0.35, head.y + 0.25 + Math.sin(ang * 2) * 0.05, head.z + Math.sin(ang) * 0.35);
      (s.material as THREE.SpriteMaterial).opacity = fade * (0.75 + 0.25 * Math.sin(o.time * 11 + i));
      (s.material as THREE.SpriteMaterial).rotation = o.time * 3 + i;
    });
    // Dust where he hits the ground.
    const d = (e - T.flight) / 0.7;
    const D = this.daze.dust;
    D.visible = d >= 0 && d < 1;
    if (D.visible) {
      D.position.set(b.x + dx * 0.8, 0.25 + d * 0.3, b.z + dz * 0.8);
      D.scale.setScalar(T.dustSize * (0.5 + d));
      D.material.opacity = 0.55 * (1 - d);
    }
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
