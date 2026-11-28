// The wreck (Part 2, run 1, the dark run): the maps thread's pieces (models/wreck.pack.json, base64 glbs by
// name), and the run on the board: the dark, the brazier's pool growing a bank at a time, his own small
// glow, the nightshades (the cast thread's blurred cut-out, black, its `reach` clip) leaning in at the
// light's edge, a candle-flick where one is snuffed, and at the end the lamps coming up from the south
// gap. World units are tiles, the origin at the brazier, x east and z south.

import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { StoryView } from "../engine/protocol.js";
import { RUN1_PIECES } from "../engine/run1.js";
import { dressed, loadShade } from "./camp-dress.js";
import { parsePacked } from "./yard-dress.js";

type Run1 = NonNullable<StoryView["run1"]>;

/** The look's numbers (the build's): the dark, his glow, the fire's pool, the nightshades' size, the snuff and the lamps. */
export const WRECK_LOOK = {
  /** Scene light kept in the dark (of the theme's), and at the end. */
  dark: { hemi: 0.12, sun: 0.08 },
  /** His own glow: about two tiles of sight. */
  rook: { power: 2.2, reach: 3.2, color: "#ffd9a8", h: 1.6 },
  /** The brazier's light, its reach a little past the lit circle. */
  fire: { power: 26, beyond: 2.5 },
  shade: { height: 2.3 },
  snuff: { color: "#fff1c8", size: 1.1, sec: 0.6 },
  lamp: { power: 4, reach: 5, color: "#ffb468", h: 1.3 },
  /** When a mark goes, his three diamonds flash over him once (the gameplay thread): this high, this long. */
  marks: { h: 3.5, sec: 1.4, size: 1.5 },
};

let pieces: Promise<Record<string, THREE.Object3D>> | null = null;
function loadPieces() {
  pieces ??= fetch("models/wreck.pack.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))))
    .then((b64s) => Promise.all(Object.entries(b64s).map(([n, b64]) => parsePacked(b64).then((g) => [n, dressed(g.scene)] as const))))
    .then((es) => Object.fromEntries(es));
  return pieces;
}

/** The wreck's pieces, added to `group` once they are in. */
export function dressWreck(group: THREE.Group) {
  loadPieces()
    .then((ms) => {
      if (!group.parent) return;
      for (const p of RUN1_PIECES) {
        const src = ms[p.m];
        if (!src) continue;
        const o = src.clone();
        o.position.set(p.at[0], 0, p.at[1]);
        o.rotation.y = ((p.yaw ?? 0) * Math.PI) / 180;
        group.add(o);
      }
    })
    .catch(() => {
      /* missing: the ground stays bare */
    });
}

interface ShadeFig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  slab: THREE.Mesh | null;
  seen: number;
}

/** Run 1 on the board, stepped each frame. */
export class Run1Fx {
  readonly all = new THREE.Group();
  readonly rookLight: THREE.PointLight;
  private figs = new Map<number, ShadeFig>();
  private model: GLTF | null = null;
  private flicks: { s: THREE.Sprite; at: number }[] = [];
  private lastSnuff = -1;
  private lamps: { light: THREE.PointLight; halo: THREE.Sprite }[] = [];
  private last = 0;
  private marks: THREE.Sprite;
  private markTex: THREE.CanvasTexture;
  private markCtx: CanvasRenderingContext2D | null;
  private lastMark = -1;
  private markAt = -99;

  constructor(private glow: (color: string, size: number, opacity?: number) => THREE.Sprite) {
    const R = WRECK_LOOK.rook;
    this.rookLight = new THREE.PointLight(R.color, R.power, R.reach, 1.4);
    this.all.add(this.rookLight);
    void loadShade().then((g) => (this.model = g));
    const cv = document.createElement("canvas");
    cv.width = 192;
    cv.height = 64;
    this.markCtx = cv.getContext("2d");
    this.markTex = new THREE.CanvasTexture(cv);
    this.marks = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, transparent: true, depthTest: false, opacity: 0 }));
    this.marks.scale.set(WRECK_LOOK.marks.size * 3, WRECK_LOOK.marks.size, 1);
    this.marks.renderOrder = 10;
    this.all.add(this.marks);
  }

  /** His three diamonds, the ones left lit. */
  private drawMarks(on: number, of: number) {
    const g = this.markCtx;
    if (!g) return;
    g.clearRect(0, 0, 192, 64);
    for (let i = 0; i < of; i++) {
      const x = 32 + i * 64, y = 32;
      g.beginPath();
      g.moveTo(x, y - 22), g.lineTo(x + 18, y), g.lineTo(x, y + 22), g.lineTo(x - 18, y), g.closePath();
      g.fillStyle = i < on ? "#ffb15c" : "rgba(170,205,240,0.55)";
      g.strokeStyle = i < on ? "#ffe2b0" : "#e4f2ff";
      g.lineWidth = 3;
      g.fill(), g.stroke();
    }
    this.markTex.needsUpdate = true;
  }

  private figure(): ShadeFig {
    const S = WRECK_LOOK.shade, root = new THREE.Group();
    let slab: THREE.Mesh | null = null, mixer: THREE.AnimationMixer | null = null;
    if (this.model) {
      const m = this.model.scene.clone(true), box = new THREE.Box3().setFromObject(m), h = Math.max(0.01, box.max.y - box.min.y);
      m.scale.setScalar(S.height / h);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        mesh.material = new THREE.MeshBasicMaterial({ map: src.map ?? null, color: "#000000", transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: false });
        mesh.frustumCulled = false;
      });
      root.add(m);
      mixer = new THREE.AnimationMixer(m);
      const clip = this.model.animations.find((a) => a.name === "reach") ?? this.model.animations.find((a) => a.name === "idle");
      if (clip) {
        const a = mixer.clipAction(clip);
        a.play();
        a.time = Math.random() * clip.duration;
      }
    } else {
      slab = new THREE.Mesh(new THREE.PlaneGeometry(0.9, S.height), new THREE.MeshBasicMaterial({ color: "#05040a", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      slab.position.y = S.height / 2;
      root.add(slab);
    }
    this.all.add(root);
    return { root, mixer, slab, seen: 0 };
  }

  step(o: { r: Run1; time: number; half: { w: number; h: number }; rook: THREE.Object3D | null }) {
    const { r, time, half } = o, dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    const W = (x: number) => x + 0.5 - half.w, Z = (y: number) => y + 0.5 - half.h;
    // His glow goes with him.
    if (o.rook) this.rookLight.position.set(o.rook.position.x, WRECK_LOOK.rook.h, o.rook.position.z);
    this.rookLight.intensity = r.end ? 0 : WRECK_LOOK.rook.power;
    // A mark lost: the diamonds over him, once.
    if (r.marked !== undefined && r.marked !== this.lastMark) {
      this.lastMark = r.marked;
      this.markAt = time;
      this.drawMarks(r.warmth, r.of3);
    }
    const mk = (time - this.markAt) / WRECK_LOOK.marks.sec;
    (this.marks.material as THREE.SpriteMaterial).opacity = mk >= 0 && mk < 1 ? Math.min(1, (1 - mk) * 2.5) : 0;
    if (o.rook) this.marks.position.set(o.rook.position.x, WRECK_LOOK.marks.h, o.rook.position.z);
    // The nightshades: each stands where the room has it, turned to him, held still between jumps (no glide).
    const live = new Set<number>();
    for (const s of r.shades) {
      live.add(s.id);
      let f = this.figs.get(s.id);
      if (f && f.slab && this.model) (this.all.remove(f.root), this.figs.delete(s.id), (f = undefined));
      if (!f) this.figs.set(s.id, (f = this.figure()));
      f.root.visible = true;
      f.root.position.set(W(s.x), 0, Z(s.y));
      if (o.rook) f.root.rotation.y = Math.atan2(o.rook.position.x - f.root.position.x, o.rook.position.z - f.root.position.z);
      f.mixer?.update(dt * (s.on ? 0.6 : 0.25));
    }
    for (const [id, f] of this.figs) if (!live.has(id)) (this.all.remove(f.root), this.figs.delete(id));
    // Snuffed: a candle's flick, bright and gone.
    if (r.snuffed && r.snuffed.tick !== this.lastSnuff) {
      this.lastSnuff = r.snuffed.tick;
      const s = this.glow(WRECK_LOOK.snuff.color, WRECK_LOOK.snuff.size, 0.9);
      s.position.set(W(r.snuffed.x), 1.2, Z(r.snuffed.y));
      this.all.add(s);
      this.flicks.push({ s, at: time });
    }
    this.flicks = this.flicks.filter((p) => {
      const k = (time - p.at) / WRECK_LOOK.snuff.sec;
      if (k >= 1) return void this.all.remove(p.s), false;
      (p.s.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - k) * (1 - k);
      p.s.scale.setScalar(WRECK_LOOK.snuff.size * (1 - 0.7 * k));
      return true;
    });
    // The lamps coming in.
    const ls = r.end?.lamps ?? [];
    while (this.lamps.length < ls.length) {
      const L = WRECK_LOOK.lamp, light = new THREE.PointLight(L.color, L.power, L.reach, 1.6), halo = this.glow(L.color, 0.7, 0.8);
      this.all.add(light, halo);
      this.lamps.push({ light, halo });
    }
    ls.forEach((p, i) => {
      const l = this.lamps[i]!, bob = Math.sin(time * 5 + i * 1.7) * 0.05;
      l.light.position.set(W(p.x), WRECK_LOOK.lamp.h + bob, Z(p.y));
      l.halo.position.copy(l.light.position);
    });
  }

  dispose() {
    this.all.removeFromParent();
    this.all.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
  }
}
