// Optional run 3c, Kes's rematch on a windy day: what Kite Fell has for it that the board's own
// drawing does not. The wind's course over the Fell, as a pale band on the ground; streaks that
// run down it the way the wind is going; ribbons on stakes along its edges; and a chalked circle
// at the mark by each vane, where a staff takes hold.
// A block-out, to be judged by playing. World units are tiles, the origin at the race brazier.

import * as THREE from "three";
import { KITE, KT_ARMS, KT_SPLIT, KT_TRUNK, KT_VANES, ktAt, ktLength, type Arm } from "../engine/kite.js";
import { KF_SIZE, kfCoast } from "../engine/kitefell.js";
import type { StoryView } from "../engine/protocol.js";

type Opt = NonNullable<StoryView["opt"]>;

/** How it looks, in one place. */
export const KITE_LOOK = {
  /** The band: its colour and how solid it is, and how much wider than the course it is drawn. */
  band: "#f4f1e4",
  solid: 0.42,
  wider: 1,
  /** The streaks: how many on each way, how long (tiles), how fast (tiles a second) and how solid. */
  streaks: 16,
  long: [1.6, 3.2] as const,
  fast: [5, 8] as const,
  streak: "#ffffff",
  streakSolid: 0.8,
  /** The stakes: how far apart along each edge (tiles), how high, and the ribbon's colours. */
  stakeEvery: 7,
  stakeHigh: 1.3,
  ribbon: ["#e8674f", "#f2c14e"] as const,
  /** The circle at a mark: plain, when Rook stands in it, and when Kes does. */
  mark: "#f3f1e8",
  markYou: "#ffd98a",
  markHer: "#d7c4ff",
};

const ARMS: Arm[] = ["n", "s"];

export class KiteFx {
  readonly all = new THREE.Group();
  private textures: THREE.Texture[] = [];
  private streaks: { mesh: THREE.Mesh; arm: Arm; s: number; lat: number; fast: number; long: number }[] = [];
  private ribbons: { mesh: THREE.Mesh; turn: number; phase: number }[] = [];
  private marks: THREE.Mesh[] = [];
  private last = 0;

  constructor() {
    const L = KITE_LOOK, W = KF_SIZE.w, H = KF_SIZE.h, hw = (W - 1) / 2, hh = (H - 1) / 2, PX = 8;
    // The band, painted once: the trunk and both arms, soft at the edges.
    const c = document.createElement("canvas");
    c.width = W * PX;
    c.height = H * PX;
    const g = c.getContext("2d")!;
    g.filter = `blur(${PX * 0.7}px)`;
    g.strokeStyle = L.band;
    g.lineWidth = (KITE.width + L.wider) * PX;
    g.lineJoin = g.lineCap = "round";
    const px = (p: readonly [number, number]) => [(p[0] + hw + 0.5) * PX, (p[1] + hh + 0.5) * PX] as const;
    for (const pts of [KT_TRUNK, KT_ARMS.n, KT_ARMS.s]) {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
      g.stroke();
    }
    // Only on the land: the band fades out a tile in from the coast, and does not hang over the sky.
    g.filter = "none";
    g.globalCompositeOperation = "destination-in";
    const land = g.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) land.data[(y * c.width + x) * 4 + 3] = 255 * Math.max(0, Math.min(1, (-kfCoast(x / PX - hw - 0.5, y / PX - hh - 0.5) - 0.3) / 1.5));
    const lc = document.createElement("canvas");
    lc.width = c.width;
    lc.height = c.height;
    lc.getContext("2d")!.putImageData(land, 0, 0);
    g.drawImage(lc, 0, 0);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(map);
    const plane = new THREE.PlaneGeometry(W, H);
    plane.rotateX(-Math.PI / 2);
    const band = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map, transparent: true, opacity: L.solid, depthWrite: false }));
    band.position.y = 0.09;
    band.renderOrder = 1;
    this.all.add(band);

    // The streaks: thin pale strokes lying on the band, each going its own way down it.
    let seed = 11;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const streakMat = () => new THREE.MeshBasicMaterial({ color: L.streak, transparent: true, opacity: 0, depthWrite: false });
    for (const arm of ARMS)
      for (let i = 0; i < L.streaks; i++) {
        const long = L.long[0] + rand() * (L.long[1] - L.long[0]), geo = new THREE.PlaneGeometry(1, 0.16);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, streakMat());
        mesh.scale.x = long;
        mesh.renderOrder = 2;
        this.all.add(mesh);
        this.streaks.push({ mesh, arm, s: rand() * ktLength(arm), lat: (rand() - 0.5) * KITE.width, fast: L.fast[0] + rand() * (L.fast[1] - L.fast[0]), long });
      }

    // Stakes along both edges, a ribbon on each that the wind holds out.
    const post = new THREE.CylinderGeometry(0.06, 0.08, L.stakeHigh, 6), wood = new THREE.MeshStandardMaterial({ color: "#6b5a47", roughness: 0.9 });
    const cloth = L.ribbon.map((color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    let n = 0;
    const stake = (arm: Arm, s: number, side: number) => {
      const p = ktAt(arm, s), off = (KITE.width / 2 + 0.9) * side, x = p.x - p.dy * off, z = p.y + p.dx * off;
      if (kfCoast(x, z) > -1.5) return;
      const m = new THREE.Mesh(post, wood);
      m.position.set(x, L.stakeHigh / 2, z);
      m.castShadow = true;
      const flag = new THREE.PlaneGeometry(1, 0.22);
      flag.translate(0.5, 0, 0);
      const r = new THREE.Mesh(flag, cloth[n++ % cloth.length]!);
      r.position.set(x, L.stakeHigh - 0.1, z);
      const turn = -Math.atan2(p.dy, p.dx);
      r.rotation.y = turn;
      this.all.add(m, r);
      this.ribbons.push({ mesh: r, turn, phase: n * 1.7 });
    };
    for (let s = 0; s < KT_SPLIT - 6; s += L.stakeEvery) for (const side of [-1, 1]) stake("n", s, side);
    // After the split the inside edges would cross: the outside of each arm, and the inside once the arms are clear of each other.
    for (const arm of ARMS)
      for (let s = KT_SPLIT + 3; s < ktLength(arm); s += L.stakeEvery) {
        stake(arm, s, arm === "n" ? -1 : 1);
        if (s > KT_SPLIT + 12) stake(arm, s, arm === "n" ? 1 : -1);
      }

    // The mark by each vane: a chalked circle on the ground.
    for (const arm of ARMS) {
      const [mx, my] = KT_VANES[arm].mark, ring = new THREE.RingGeometry(KITE.spot + 0.3, KITE.spot + 0.52, 40);
      ring.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: L.mark, transparent: true, opacity: 0.75, depthWrite: false }));
      mesh.position.set(mx, 0.12, my);
      mesh.renderOrder = 2;
      this.all.add(mesh);
      this.marks.push(mesh);
    }
  }

  /** Each frame: the streaks run on, the ribbons stream, and a mark takes the colour of whoever stands in it. */
  step(o: Opt, time: number) {
    const L = KITE_LOOK, dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    for (const k of this.streaks) {
      const whole = ktLength(k.arm);
      k.s += k.fast * dt;
      if (k.s > whole) k.s -= whole;
      const p = ktAt(k.arm, k.s), lat = k.lat * Math.max(0.35, Math.min(1, (KT_SPLIT + 14 - k.s) / 8));
      k.mesh.position.set(p.x - p.dy * lat, 0.14, p.y + p.dx * lat);
      k.mesh.rotation.y = -Math.atan2(p.dy, p.dx);
      // In at the rim and out at the far edge, and a little unsteady between.
      const ends = Math.min(1, k.s / 5, -kfCoast(p.x, p.y) / 2);
      (k.mesh.material as THREE.MeshBasicMaterial).opacity = L.streakSolid * Math.max(0, ends) * (0.6 + 0.4 * Math.sin(time * 3 + k.s));
    }
    for (const r of this.ribbons) {
      r.mesh.rotation.y = r.turn + Math.sin(time * 9 + r.phase) * 0.22;
      r.mesh.rotation.z = Math.sin(time * 13 + r.phase) * 0.12;
    }
    (o.vanes ?? []).forEach((v, i) => {
      const m = this.marks[i]?.material as THREE.MeshBasicMaterial | undefined;
      if (!m) return;
      m.color.set(v.you ? L.markYou : v.her ? L.markHer : L.mark);
      m.opacity = v.you || v.her ? 0.95 : 0.6 + 0.15 * Math.sin(time * 3);
    });
  }

  dispose() {
    this.all.removeFromParent();
    for (const t of this.textures) t.dispose();
    this.all.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
