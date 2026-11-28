// Optional run 3b, Tidepool Steps: what the terraces have that the board's own drawing does not.
// The steps themselves, a shade of stone each, with a kerb along every step's lip (walkers can't
// cross it; wisps go down over it); the corner stairs; the tidal strips beside each pool, wet grey
// stone with the tide out and water with it in; and the weirs where each pool spills down a step,
// white for a moment each time the tide goes out.
// A block-out, to be judged by playing: the maps thread's plan is the layout
// (sogni/lanternfall/production/places/tidepool-terraces). World units are tiles, the origin at the brazier.

import * as THREE from "three";
import type { StoryView } from "../engine/protocol.js";
import { TP, TP_SIZE, tpCell, tpNorm, tpPoolWidth } from "../engine/tidepool.js";

type Opt = NonNullable<StoryView["opt"]>;

/** How it looks, in one place. */
export const TIDEPOOL_LOOK = {
  /** Dry terrace, bottom step first: paler as it climbs, so the height reads from above. */
  step: ["#9a8a6c", "#ab9c7e", "#bcae91", "#cdc1a5", "#ded4ba"] as readonly string[],
  /** The shade at the back of each step, under the next one's lip. */
  shade: "rgba(40,30,18,0.32)",
  /** The corner stairs: their stone and the line of each tread. */
  stairs: "#e4dcc8",
  tread: "rgba(90,74,52,0.35)",
  /** The strips with the tide out: wet stone. */
  wet: ["#6f7a80", "#65717a", "#7a858a"] as const,
  /** The kerb on each step's lip: its sides and top, and how high it stands; a weir is lower, and wet. */
  kerb: "#6b5a43",
  kerbTop: "#8d7b5f",
  high: 0.16,
  weir: "#4f7f8c",
  weirHigh: 0.05,
  /** The water over the strips: its two colours and how solid it is. */
  water: ["#2f6f86", "#62a9b8"] as const,
  solid: 0.82,
  /** How fast the water follows the tide (per second), and how long the white of a spill lasts (seconds). */
  ease: 3,
  foam: 1.6,
  /** The island's rim: grass. */
  rim: "#6f9a52",
};

const VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The strips' water: the mask's red is where a step's strips are. The level fades it in and out,
// with a ragged edge while it comes and goes.
const FS = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform float uLevel;
uniform float uTime;
uniform vec3 uLo;
uniform vec3 uHi;
uniform float uSolid;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 t = vUv * uSize;
  float m = texture2D(uMask, vUv).r;
  float rough = (noise(t * 1.7) - 0.5) * 0.3;
  float a = smoothstep(0.3, 0.55, m) * smoothstep(0.0, 0.25, uLevel * 1.2 + rough - 0.1);
  if (a < 0.01) discard;
  float swell = noise(t * 0.9 + vec2(uTime * 0.22, uTime * 0.15));
  float glint = smoothstep(0.6, 0.95, noise(t * 1.6 - vec2(uTime * 0.35, uTime * 0.1)));
  vec3 col = mix(uLo, uHi, swell) + glint * 0.09;
  gl_FragColor = vec4(col, a * uSolid);
}`;

export class TidepoolFx {
  readonly all = new THREE.Group();
  private textures: THREE.Texture[] = [];
  private tides: { u: Record<string, THREE.IUniform> }[] = [];
  private foam: THREE.MeshBasicMaterial;
  private last = 0;
  private wasIn = true;
  private spillAt = -1e9;

  constructor() {
    const L = TIDEPOOL_LOOK, W = TP_SIZE.w, H = TP_SIZE.h, hw = (W - 1) / 2, hh = (H - 1) / 2, PX = 16;
    const cell = (i: number) => tpCell((i % W) - hw, Math.floor(i / W) - hh);
    // The terraces as one picture: each step's stone, the stairs, the wet strips. The court and the pools are left to the board.
    const ground = document.createElement("canvas");
    ground.width = W * PX;
    ground.height = H * PX;
    const g = ground.getContext("2d")!;
    let seed = 11;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const masks = Array.from({ length: TP.steps + 1 }, () => {
      const c = document.createElement("canvas");
      c.width = W * PX;
      c.height = H * PX;
      const m = c.getContext("2d")!;
      m.fillStyle = "#000";
      m.fillRect(0, 0, c.width, c.height);
      return { c, m };
    });
    const kerbs: { x: number; y: number }[] = [], weirs: { x: number; y: number }[] = [];
    for (let i = 0; i < W * H; i++) {
      const { kind, k } = cell(i), x = i % W, y = Math.floor(i / W), bx = x - hw, by = y - hh;
      if (kind === "dry" || kind === "ledge") {
        g.fillStyle = L.step[Math.max(0, k - 1)] ?? L.step[0]!;
        g.fillRect(x * PX - 1, y * PX - 1, PX + 2, PX + 2);
        g.fillStyle = "rgba(60,48,32,0.12)";
        if (rand() < 0.45) g.fillRect(x * PX + rand() * PX, y * PX, 1.5, PX);
        if (rand() < 0.45) g.fillRect(x * PX, y * PX + rand() * PX, PX, 1.5);
      } else if (kind === "stairs") {
        g.fillStyle = L.stairs;
        g.fillRect(x * PX - 1, y * PX - 1, PX + 2, PX + 2);
        // Treads, across the way up (the way up is away from the brazier, along the diagonal).
        g.strokeStyle = L.tread;
        g.lineWidth = 2;
        g.beginPath();
        const sx = Math.sign(bx) || 1, sy = Math.sign(by) || 1;
        for (let n = 0; n < 2; n++) {
          const o = (n + 0.5) * (PX / 2);
          g.moveTo(x * PX + (sx > 0 ? 0 : PX), y * PX + o * (sy > 0 ? 1 : -1) + (sy > 0 ? 0 : PX));
          g.lineTo(x * PX + o * (sx > 0 ? 1 : -1) + (sx > 0 ? 0 : PX), y * PX + (sy > 0 ? 0 : PX));
        }
        g.stroke();
      } else if (kind === "strip") {
        g.fillStyle = L.wet[Math.floor(rand() * L.wet.length)]!;
        g.fillRect(x * PX - 1, y * PX - 1, PX + 2, PX + 2);
        g.fillStyle = "rgba(30,36,44,0.25)";
        if (rand() < 0.5) g.fillRect(x * PX + rand() * PX, y * PX, 1.5, PX);
        const m = masks[k]!.m;
        m.fillStyle = "#fff";
        m.fillRect(x * PX - 2, y * PX - 2, PX + 4, PX + 4);
      } else if (kind === "rim") {
        g.fillStyle = L.rim;
        g.fillRect(x * PX - 1, y * PX - 1, PX + 2, PX + 2);
      }
      // The back of a step, under the lip of the one above: in its shade.
      if ((kind === "dry" || kind === "strip") && k < TP.steps && tpNorm(bx, by) - TP.court - TP.depth * (k - 1) > TP.depth - 1) {
        g.fillStyle = L.shade;
        g.fillRect(x * PX, y * PX, PX, PX);
      }
      if (kind === "ledge") {
        // A weir where the pool and its strips go over; a kerb elsewhere.
        const t = Math.abs(by) >= Math.abs(bx) ? bx : by;
        (Math.abs(t) <= tpPoolWidth(k) / 2 + TP.strip ? weirs : kerbs).push({ x: bx, y: by });
      }
    }
    const map = new THREE.CanvasTexture(ground);
    map.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(map);
    const flat = (y: number, material: THREE.Material) => {
      const geo = new THREE.PlaneGeometry(W, H);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.y = y;
      return mesh;
    };
    const terraces = flat(0.03, new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, alphaTest: 0.01 }));
    terraces.receiveShadow = true;
    this.all.add(terraces);
    // The canvas is see-through where nothing was drawn (the court, the pools): the board shows there.
    // Each step's strips get their own water, so a step can flood on its own.
    for (let k = 1; k <= TP.steps; k++) {
      const soft = document.createElement("canvas");
      soft.width = W * PX;
      soft.height = H * PX;
      const s = soft.getContext("2d")!;
      s.filter = `blur(${PX * 0.3}px)`;
      s.drawImage(masks[k]!.c, 0, 0);
      const mask = new THREE.CanvasTexture(soft);
      this.textures.push(mask);
      const u = { uMask: { value: mask }, uSize: { value: new THREE.Vector2(W, H) }, uLevel: { value: 1 }, uTime: { value: 0 }, uLo: { value: new THREE.Color(L.water[0]) }, uHi: { value: new THREE.Color(L.water[1]) }, uSolid: { value: L.solid } };
      const water = flat(0.06, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: u, transparent: true, depthWrite: false }));
      water.renderOrder = 2;
      this.all.add(water);
      this.tides.push({ u });
    }
    // Kerbs and weirs, one block per tile.
    const blocks = (list: { x: number; y: number }[], high: number, side: string, top: string) => {
      const mats = [side, side, top, side, side, side].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }));
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.01, high, 1.01), mats, list.length);
      const m = new THREE.Matrix4();
      list.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, high / 2, p.y)));
      mesh.castShadow = mesh.receiveShadow = true;
      this.all.add(mesh);
      return mesh;
    };
    blocks(kerbs, L.high, L.kerb, L.kerbTop);
    blocks(weirs, L.weirHigh, L.weir, L.weir);
    // The white of a spill over each weir.
    this.foam = new THREE.MeshBasicMaterial({ color: "#f4fbff", transparent: true, opacity: 0, depthWrite: false });
    const foam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.05, 1.05).rotateX(-Math.PI / 2), this.foam, weirs.length);
    const m = new THREE.Matrix4();
    weirs.forEach((p, i) => foam.setMatrixAt(i, m.makeTranslation(p.x, L.weirHigh + 0.02, p.y)));
    foam.renderOrder = 3;
    this.all.add(foam);
  }

  /** Each frame: each step's water follows its tide, and the weirs go white as the tide turns out. */
  step(o: Opt, time: number) {
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    const ease = 1 - Math.exp(-dt * TIDEPOOL_LOOK.ease);
    this.tides.forEach((t, i) => {
      const to = o.terraces?.[i + 1] ?? o.tide?.level ?? 1;
      t.u.uLevel!.value += (to - t.u.uLevel!.value) * ease;
      t.u.uTime!.value = time;
    });
    const isIn = o.tide?.in ?? true;
    if (this.wasIn && !isIn) this.spillAt = time;
    this.wasIn = isIn;
    const since = time - this.spillAt;
    this.foam.opacity = since < TIDEPOOL_LOOK.foam ? 0.85 * (1 - since / TIDEPOOL_LOOK.foam) * (0.8 + 0.2 * Math.sin(time * 14)) : 0;
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
