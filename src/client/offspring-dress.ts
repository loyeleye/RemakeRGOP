// Part 2, runs 3 and 4, the offspring fight: placeholder shapes only (no Spark, no models), drawn
// from StoryView.fight. One plain eye on four legs, the eye the biggest thing about it and level
// while the body bobs (look 1); a thin back that glows with every wisp it has eaten, seen best from
// behind (look 7); a bright slit on the back for the wound. Solenne's light over her, the boy's
// over him, the shard in Rook's hand, and a flash for her shove, her blast, her save and her flare.

import * as THREE from "three";
import type { StoryView } from "../engine/protocol.js";
import { OFFSPRING } from "../engine/offspring.js";

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
};

type Glow = (color: string, size: number, opacity?: number) => THREE.Sprite;

export class OffspringFx {
  readonly all = new THREE.Group();
  private it = new THREE.Group();
  private body: THREE.Mesh;
  private legs: THREE.Mesh[] = [];
  private eye = new THREE.Group();
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
  private from = { x: 0, y: 0, face: 0 };
  private to = { x: 0, y: 0, face: 0 };
  private seen = -1;
  private walk = 0;
  private wound = 0;
  private last = 0;

  constructor(glow: Glow) {
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
    const ball = new THREE.Mesh(new THREE.SphereGeometry(S * 0.3, 28, 20), new THREE.MeshStandardMaterial({ color: L.eye, roughness: 0.3, emissive: new THREE.Color(L.eye), emissiveIntensity: 0.25 }));
    this.eye.add(ball);
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
    this.all.add(this.it);
    // Her light, the boy's, the shard, her flash, and the beam of her hold.
    this.herGlow = glow(L.her, 1.5, 0.9);
    this.fenGlow = glow(L.fen, 0.8, 0.8);
    this.shardGlow = glow(L.shard, 1, 0);
    this.flash = glow(L.her, 1, 0);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: L.her, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.all.add(this.herGlow, this.fenGlow, this.shardGlow, this.flash, this.beam);
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
    this.backGlow.material.opacity = full * 0.85;
    this.backGlow.scale.setScalar(S * (0.5 + full * 0.9));
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

  dispose() {
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
