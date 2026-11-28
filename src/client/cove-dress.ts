// Optional run 2, Lumi's lesson with Kes: what the Cove has that the board's own drawing does not.
// The flats, wet grey stone when the tide is out; the tide itself, water that comes in over them
// from the deep and goes out again; and the five standing stones, always dry.
// A block-out, to be judged by playing: the maps thread's sketches are the look
// (sogni/lanternfall/production/places/cove). World units are tiles, the origin at the brazier.

import * as THREE from "three";
import { CV_SIZE, CV_STONES, coveGround } from "../engine/cove.js";
import type { StoryView } from "../engine/protocol.js";

type Opt = NonNullable<StoryView["opt"]>;

/** How it looks, in one place. */
export const COVE_LOOK = {
  /** The flats: wet stone, and how much it shines. */
  flat: ["#6e7780", "#5f6972", "#7b848b"] as const,
  shine: 0.28,
  /** The tide over them: its two colours and how solid it is, just in and fully in. */
  water: ["#2f6f86", "#62a9b8"] as const,
  solid: [0.5, 0.86] as const,
  /** A standing stone: its colour and how high it stands. */
  stone: "#b9b3a6",
  stoneTop: "#cdc8bc",
  high: 0.16,
  /** How fast the water's height follows the tide (per second). */
  ease: 4,
  /** How much of the light is left at the end (the sun does not set: it goes orange and low). */
  dusk: 0.62,
};

const VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The tide: the mask's red is where the flats are, its green how near each is to water that never
// drains. As the level rises the water spreads from there to the shore.
const FS = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform float uLevel;
uniform float uTime;
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec2 uSolid;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 t = vUv * uSize;
  vec4 m = texture2D(uMask, vUv);
  float rough = (noise(t * 1.9) - 0.5) * 0.12;
  float reach = uLevel * 1.3 - (1.0 - m.g) + rough;
  float a = smoothstep(0.32, 0.5, m.r) * smoothstep(0.0, 0.12, reach);
  if (a < 0.01) discard;
  float swell = noise(t * 0.9 + vec2(uTime * 0.22, uTime * 0.15));
  float glint = smoothstep(0.6, 0.95, noise(t * 1.6 - vec2(uTime * 0.35, uTime * 0.1)));
  // A pale line where the water's edge is, while it is coming or going.
  float lip = (1.0 - smoothstep(0.0, 0.22, reach)) * step(uLevel, 0.98);
  vec3 col = mix(uLo, uHi, swell) + glint * 0.09 + lip * 0.3;
  gl_FragColor = vec4(col, a * mix(uSolid.x, uSolid.y, smoothstep(0.5, 1.0, uLevel)));
}`;

export class CoveFx {
  readonly all = new THREE.Group();
  private u = { uMask: { value: null as THREE.Texture | null }, uSize: { value: new THREE.Vector2(CV_SIZE.w, CV_SIZE.h) }, uLevel: { value: 0 }, uTime: { value: 0 }, uLo: { value: new THREE.Color(COVE_LOOK.water[0]) }, uHi: { value: new THREE.Color(COVE_LOOK.water[1]) }, uSolid: { value: new THREE.Vector2(...COVE_LOOK.solid) } };
  private textures: THREE.Texture[] = [];
  private last = 0;

  constructor() {
    const L = COVE_LOOK, W = CV_SIZE.w, H = CV_SIZE.h, hw = (W - 1) / 2, hh = (H - 1) / 2, PX = 16;
    // How far each flat is from water that never drains, in tiles (the tide comes in from there).
    const far = new Float32Array(W * H).fill(-1), queue: number[] = [];
    const kind = (i: number) => coveGround((i % W) - hw, Math.floor(i / W) - hh);
    for (let i = 0; i < W * H; i++) if (kind(i) === "deep" || kind(i) === "pool") (far[i] = 0), queue.push(i);
    let most = 1;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!, x = i % W, y = Math.floor(i / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || far[j]! >= 0 || kind(j) !== "flat") continue;
        far[j] = far[i]! + 1;
        most = Math.max(most, far[j]!);
        queue.push(j);
      }
    }
    // Two pictures of the board: the wet stone, and the tide's mask.
    const stone = document.createElement("canvas"), mask = document.createElement("canvas");
    stone.width = mask.width = W * PX;
    stone.height = mask.height = H * PX;
    const sg = stone.getContext("2d")!, mg = mask.getContext("2d")!;
    mg.fillStyle = "#000";
    mg.fillRect(0, 0, mask.width, mask.height);
    let seed = 7;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < W * H; i++) {
      if (kind(i) !== "flat") continue;
      const x = i % W, y = Math.floor(i / W);
      sg.fillStyle = L.flat[Math.floor(rand() * L.flat.length)]!;
      sg.fillRect(x * PX - 2, y * PX - 2, PX + 4, PX + 4);
      // A few darker seams, so it reads as stone and not as paint.
      sg.fillStyle = "rgba(30,36,44,0.22)";
      if (rand() < 0.5) sg.fillRect(x * PX + rand() * PX, y * PX, 1.5, PX);
      if (rand() < 0.5) sg.fillRect(x * PX, y * PX + rand() * PX, PX, 1.5);
      const near = Math.round(255 * (1 - Math.max(0, far[i]!) / most));
      mg.fillStyle = `rgb(255,${near},0)`;
      mg.fillRect(x * PX - 3, y * PX - 3, PX + 6, PX + 6);
    }
    const soft = (c: HTMLCanvasElement, px: number) => {
      const out = document.createElement("canvas");
      out.width = c.width;
      out.height = c.height;
      const o = out.getContext("2d")!;
      o.filter = `blur(${px}px)`;
      o.drawImage(c, 0, 0);
      return out;
    };
    const stoneMap = new THREE.CanvasTexture(soft(stone, 1.2)), maskMap = new THREE.CanvasTexture(soft(mask, PX * 0.4));
    stoneMap.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(stoneMap, maskMap);
    this.u.uMask.value = maskMap;
    const flat = (y: number, material: THREE.Material) => {
      const g = new THREE.PlaneGeometry(W, H);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, material);
      m.position.y = y;
      return m;
    };
    const stones = flat(0.014, new THREE.MeshStandardMaterial({ map: stoneMap, transparent: true, roughness: L.shine, metalness: 0, depthWrite: false }));
    stones.receiveShadow = true;
    const tide = flat(0.04, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.u, transparent: true, depthWrite: false }));
    tide.renderOrder = 2;
    this.all.add(stones, tide);
    // The standing stones: low slabs, two tiles square, a paler top.
    for (const [sx, sy] of CV_STONES) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.05, L.high, 2.05), [L.stone, L.stone, L.stoneTop, L.stone, L.stone, L.stone].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })));
      slab.position.set(sx + 0.5, L.high / 2, sy + 0.5);
      slab.castShadow = slab.receiveShadow = true;
      this.all.add(slab);
    }
  }

  /** Each frame: the water's height follows the tide. Returns how much of the day's light is left (1 to `dusk`). */
  step(o: Opt, time: number) {
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    const to = o.tide?.level ?? 0;
    this.u.uLevel.value += (to - this.u.uLevel.value) * (1 - Math.exp(-dt * COVE_LOOK.ease));
    this.u.uTime.value = time;
    return COVE_LOOK.dusk + (1 - COVE_LOOK.dusk) * (o.light ?? 1);
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
