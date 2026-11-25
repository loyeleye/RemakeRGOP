// Optional run 1, Granny's rematch: what the pond has in the afternoon that it does not in the
// morning. The chalk wall against the pool's south tip, its face to the south (toward the eye),
// with the score chalked on it: Granny and her tallies, the children and theirs. The children's
// tally is their best against her, and grows between rematches; hers is always one more.
// A block-out: a plain stone wall and marks drawn here (the maps thread's sketch is the look).
// World units are tiles, the origin at the brazier.

import * as THREE from "three";
import type { StoryView } from "../engine/protocol.js";
import { tallies } from "./opt-hud.js";

type Opt = NonNullable<StoryView["opt"]>;

/** How it looks, in one place. */
export const WALL_LOOK = {
  /** Where the wall stands (tiles from the brazier, east and south), how long, how high and how thick. */
  at: [15, 8] as const,
  size: [3.4, 1.15, 0.5] as const,
  stone: "#8d877c",
  /** The slate the score is chalked on: how wide and how tall, its colour, and how far it leans back from upright. */
  slate: [3.6, 1.5] as const,
  slateColor: "#3b4046",
  lean: 0.95,
  chalk: "#f6f3ea",
  /** A score rubbed out under the new one: how much of it still shows. */
  ghost: 0.16,
};

export class RematchFx {
  readonly all = new THREE.Group();
  private canvas = document.createElement("canvas");
  private map: THREE.CanvasTexture;
  private drawn = "";

  constructor() {
    const L = WALL_LOOK, [w, h, d] = L.size;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: L.stone, roughness: 1 }));
    wall.position.set(L.at[0], h / 2, L.at[1]);
    wall.castShadow = wall.receiveShadow = true;
    // A few cap stones, so it reads as a wall and not a box.
    for (let i = 0; i < 4; i++) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w / 4 - 0.06, 0.16, d + 0.12), new THREE.MeshStandardMaterial({ color: i % 2 ? "#99938a" : "#827c72", roughness: 1 }));
      cap.position.set(L.at[0] - w / 2 + (i + 0.5) * (w / 4), h + 0.08, L.at[1]);
      cap.castShadow = true;
      this.all.add(cap);
    }
    this.canvas.width = 512;
    this.canvas.height = 176;
    this.map = new THREE.CanvasTexture(this.canvas);
    this.map.colorSpace = THREE.SRGBColorSpace;
    // The chalked face is a slate leaning against the wall's south side, tipped back so that it is read from above.
    const [sw, sh] = L.slate, lean = L.lean;
    const slate = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.08), new THREE.MeshStandardMaterial({ color: L.slateColor, roughness: 1 }));
    back.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.16, sh - 0.12), new THREE.MeshBasicMaterial({ map: this.map, transparent: true, depthWrite: false }));
    face.position.z = 0.045;
    slate.add(back, face);
    slate.rotation.x = -lean;
    slate.position.set(L.at[0], (sh / 2) * Math.cos(lean) + 0.05, L.at[1] + d / 2 + (sh / 2) * Math.sin(lean) + 0.06);
    this.all.add(wall, slate);
  }

  /** The score as it stands on the wall: the best before this rematch, and the new one once it is chalked up. */
  step(o: Opt) {
    const best = o.record?.best ?? o.wall?.best ?? 0, was = o.record && o.record.won ? o.wall?.best ?? 0 : -1, key = `${best}:${was}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const g = this.canvas.getContext("2d")!, L = WALL_LOOK, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.lineCap = "round";
    g.strokeStyle = g.fillStyle = L.chalk;
    g.lineWidth = 5;
    // Granny: a round face, her bun, two eyes and a line of a mouth. Her tallies beside her.
    const face = (cx: number, cy: number) => {
      g.beginPath();
      g.arc(cx, cy, 26, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx + 4, cy - 34, 11, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx - 9, cy - 5, 2.5, 0, Math.PI * 2);
      g.arc(cx + 9, cy - 5, 2.5, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(cx - 10, cy + 10);
      g.quadraticCurveTo(cx, cy + 18, cx + 12, cy + 8);
      g.stroke();
    };
    // The children: a wisp, a small round light with a tail.
    const wisp = (cx: number, cy: number) => {
      g.beginPath();
      g.arc(cx, cy, 15, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + 13, cy - 9);
      g.quadraticCurveTo(cx + 34, cy - 30, cx + 22, cy - 46);
      g.stroke();
      for (const a of [0.4, 1.9, 3.4, 4.9]) {
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
        g.lineTo(cx + Math.cos(a) * 29, cy + Math.sin(a) * 29);
        g.stroke();
      }
    };
    face(54, 58);
    tallies(g, 112, 30, best + 1, 52, L.chalk);
    wisp(300, 64);
    // A score that was beaten is rubbed out under the new one: a smear, and its marks faint.
    if (was >= 0 && was < best) {
      g.globalAlpha = L.ghost;
      g.fillRect(342, 100, 150, 46);
      g.globalAlpha = L.ghost * 2.2;
      tallies(g, 352, 106, was, 34, L.chalk);
      g.globalAlpha = 1;
    }
    tallies(g, 352, 30, best, 52, L.chalk);
    // A line under the lot, chalked in one go.
    g.lineWidth = 3;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.moveTo(20, H - 14);
    g.quadraticCurveTo(W / 2, H - 22, W - 20, H - 12);
    g.stroke();
    g.globalAlpha = 1;
    this.map.needsUpdate = true;
  }

  dispose() {
    this.all.removeFromParent();
    this.map.dispose();
    this.all.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
