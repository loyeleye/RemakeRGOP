// The crew's camp, warm (Part 2, the camp walk): the maps thread's walk pieces (CAMP_PIECES, from
// models/crew-yard.pack.json and models/warm-camp.pack.json, base64 glbs by name), the lamps' lights and
// the cooking fire's flicker (CAMP_LIGHTS), and the nightshades at the light's edge: the cast thread's
// blurred cut-out (models/nightshade.glb, its `reach` clip), leaning in with their fingers stopped at the
// light. They hold a pose, and change to another only while the camera is not on them (the brief: they
// never walk). World units are tiles, the origin at the brazier, x east and z south.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CAMP_LIGHTS, CAMP_PIECES } from "../engine/camp.js";
import { RUN2, RUN2_PIECES } from "../engine/run2.js";
import type { StoryView } from "../engine/protocol.js";
import { parsePacked, yardPackFile } from "./yard-dress.js";

type Camp = NonNullable<StoryView["camp"]>;

/** The look's numbers (the build's): lamp strength and reach, the fire's flicker, the nightshades' size, how often one moves (s) and how far along the edge (tiles), and how far off the camera must be. */
export const CAMP_LOOK = {
  lamp: { power: 7, reach: 7.5 },
  fire: { power: 16, reach: 9, flicker: 0.3 },
  shade: { height: 2.3, every: [4, 6] as const, along: 0.9, offCam: 5, sway: 0.15 },
};

let warm: Promise<Record<string, string>> | null = null;
function warmPackFile() {
  warm ??= fetch("models/warm-camp.pack.json").then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))));
  return warm;
}

let pieces: Promise<Record<string, THREE.Object3D>> | null = null;
function loadPieces() {
  pieces ??= Promise.all([yardPackFile().catch(() => ({})), warmPackFile().catch(() => ({}))])
    .then(([a, b]) => ({ ...a, ...b }) as Record<string, string>)
    .then((b64s) => {
      const want = new Set([...CAMP_PIECES, ...RUN2_PIECES].map((p) => p.m));
      return Promise.all(Object.entries(b64s).filter(([n]) => want.has(n)).map(([n, b64]) => parsePacked(b64).then((g) => [n, dressed(g.scene)] as const)));
    })
    .then((es) => Object.fromEntries(es));
  return pieces;
}

/** The game contract's look: no metal, rough, lit a little by its own paint. */
export function dressed(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      mat.metalness = 0;
      mat.roughness = 1;
      if (mat.map) {
        mat.emissiveMap = mat.map;
        mat.emissive = new THREE.Color("#ffffff");
      } else mat.emissive = mat.color.clone();
      mat.emissiveIntensity = 0.08;
    }
  });
  return root;
}

/** The warm camp's pieces (the walk's, or run 2's with the gate barred), added to `group` once they are in. */
export function dressCamp(group: THREE.Group, which: readonly { m: string; at: [number, number]; yaw?: number }[] = CAMP_PIECES) {
  loadPieces()
    .then((ms) => {
      if (!group.parent) return;
      for (const p of which) {
        const src = ms[p.m];
        if (!src) continue;
        const o = src.clone();
        o.position.set(p.at[0], 0, p.at[1]);
        o.rotation.y = ((p.yaw ?? 0) * Math.PI) / 180;
        group.add(o);
      }
    })
    .catch(() => {
      /* missing: the yard stays bare */
    });
}

let shadeModel: Promise<GLTF | null> | null = null;
export function loadShade() {
  const plain = new GLTFLoader().register((parser) => {
    (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: "plain_textures" };
  });
  shadeModel ??= new Promise<GLTF | null>((ok) =>
    new GLTFLoader().load("models/nightshade.glb", ok, undefined, () =>
      fetch("models/nightshade.glb.txt")
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((b64) => plain.parse(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)).buffer, "", ok, () => ok(null)))
        .catch(() => ok(null)),
    ),
  );
  return shadeModel;
}

/** The camp's lights and its nightshades, stepped each frame while the walk is on. */
export class CampFx {
  readonly all = new THREE.Group();
  private lamps: { light: THREE.PointLight; base: number; fire: boolean }[] = [];
  private shades: { root: THREE.Object3D; mixer: THREE.AnimationMixer | null; act: THREE.AnimationAction | null; home: THREE.Vector3; face: number; next: number; off: number; fallback: THREE.Mesh | null }[] = [];
  private last = 0;
  private disposed = false;

  constructor(glow: (color: string, size: number, opacity?: number) => THREE.Sprite) {
    const L = CAMP_LOOK;
    for (const l of CAMP_LIGHTS) {
      const fire = !!l.fire;
      const light = new THREE.PointLight(l.c, fire ? L.fire.power : L.lamp.power, fire ? L.fire.reach : L.lamp.reach, 1.6);
      light.position.set(l.at[0], l.h + (fire ? 0.3 : 0.4), l.at[1]);
      this.all.add(light);
      const halo = glow(l.c, fire ? 1.8 : 0.9, fire ? 0.55 : 0.45);
      halo.position.copy(light.position);
      this.all.add(halo);
      this.lamps.push({ light, base: light.intensity, fire });
    }
  }

  /** The nightshades, placed once the walk's view gives their spots (board tiles; `half` turns them into world units). */
  private placeShades(c: Camp, half: { w: number; h: number }) {
    const S = CAMP_LOOK.shade;
    for (const [i, s] of c.shades.entries()) {
      const at = new THREE.Vector3(s.x + 0.5 - half.w, 0, s.y + 0.5 - half.h);
      // Facing the light: toward the brazier.
      const face = Math.atan2(-at.x, -at.z);
      // Until the model is in, a soft dark slab stands in.
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(0.9, S.height), new THREE.MeshBasicMaterial({ color: "#05040a", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      slab.position.y = S.height / 2;
      const root = new THREE.Group();
      root.add(slab);
      root.position.copy(at);
      root.rotation.y = face;
      this.all.add(root);
      this.shades.push({ root, mixer: null, act: null, home: at.clone(), face, next: 2 + i * 1.3, off: 0, fallback: slab });
    }
    void loadShade().then((g) => {
      if (!g || this.disposed) return;
      for (const sh of this.shades) {
        const m = g.scene.clone(true);
        // Normalize to one unit tall, then to a tall adult; black, never lit by the scene.
        const box = new THREE.Box3().setFromObject(m), h = Math.max(0.01, box.max.y - box.min.y);
        m.scale.setScalar(S.height / h);
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const src = mesh.material as THREE.MeshStandardMaterial;
          mesh.material = new THREE.MeshBasicMaterial({ map: src.map ?? null, color: "#000000", transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: false });
          mesh.frustumCulled = false;
        });
        if (sh.fallback) sh.root.remove(sh.fallback), (sh.fallback = null);
        sh.root.add(m);
        const mixer = new THREE.AnimationMixer(m);
        const clip = g.animations.find((a) => a.name === "reach") ?? g.animations.find((a) => a.name === "idle");
        if (clip) {
          const a = mixer.clipAction(clip);
          a.play();
          // Each holds its own moment of the lean, and trembles there.
          a.time = Math.random() * clip.duration;
          sh.act = a;
        }
        sh.mixer = mixer;
      }
    });
  }

  step(o: { c: Camp; time: number; half: { w: number; h: number }; camAt: { x: number; z: number } }) {
    const L = CAMP_LOOK, dt = Math.min(0.1, Math.max(0, o.time - this.last));
    this.last = o.time;
    if (!this.shades.length && o.c.shades.length) this.placeShades(o.c, o.half);
    // The cooking fire flickers; the lamps hold steady with a faint breath.
    for (const [i, l] of this.lamps.entries()) {
      const f = l.fire ? 1 + L.fire.flicker * (Math.sin(o.time * 13.1) * 0.5 + Math.sin(o.time * 7.3 + 1) * 0.3 + Math.sin(o.time * 23.7) * 0.2) : 1 + 0.03 * Math.sin(o.time * 1.7 + i);
      l.light.intensity = l.base * f;
    }
    // A nightshade moves only while the camera is not on it: then it is somewhere a little different along the edge.
    for (const sh of this.shades) {
      sh.mixer?.update(dt * 0.25);
      const seen = Math.hypot(sh.root.position.x - o.camAt.x, sh.root.position.z - o.camAt.z) < L.shade.offCam;
      if (o.time < sh.next || seen) continue;
      sh.next = o.time + L.shade.every[0] + Math.random() * (L.shade.every[1] - L.shade.every[0]);
      sh.off = (Math.random() * 2 - 1) * L.shade.along;
      // Along the edge: across the line to the brazier.
      const ax = Math.cos(sh.face), az = -Math.sin(sh.face);
      sh.root.position.set(sh.home.x + ax * sh.off, 0, sh.home.z + az * sh.off);
      sh.root.rotation.y = sh.face + (Math.random() * 2 - 1) * L.shade.sway;
      if (sh.act) sh.act.time = Math.random() * sh.act.getClip().duration;
    }
  }

  dispose() {
    this.disposed = true;
    this.all.removeFromParent();
    this.all.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
  }
}

type Run2 = NonNullable<StoryView["run2"]>;

/** Run 2's look (the build's): a crew light's fizz at the rim, the lines of light, the cage bars lit. */
export const RUN2_LOOK = {
  puff: { color: "#9a9088", size: 0.9, sec: 0.7, rise: 0.8 },
  line: { width: 0.1, y: 0.03, glow: 0.5 },
  bars: { color: "#ffc878", power: 1.6, rise: 0.4 },
};

/** Run 2 on the board: a puff where a crew light gutters past warm; at the end the lines of light from the brazier's rim to the cart's door, and the cart's bars lit. */
export class Run2Fx {
  readonly all = new THREE.Group();
  private puffs: { s: THREE.Sprite; at: number }[] = [];
  private lastFizz = -1;
  private lines: THREE.Mesh[] = [];
  private linesAt = -1;
  private litAt = -1;
  private bars: THREE.MeshStandardMaterial[] | null = null;

  constructor(
    private glow: (color: string, size: number, opacity?: number) => THREE.Sprite,
    private yard: THREE.Object3D,
  ) {
    const L = RUN2.end.lines, K = RUN2_LOOK.line;
    const [fx, fz] = L.from, [tx, tz] = L.to, len = Math.hypot(tx - fx, tz - fz), ang = Math.atan2(tz - fz, tx - fx);
    // Across the line's way: the three lie side by side.
    const nx = -Math.sin(ang), nz = Math.cos(ang);
    for (let i = 0; i < L.count; i++) {
      const off = (i - (L.count - 1) / 2) * L.spacing;
      const geo = new THREE.PlaneGeometry(1, K.width);
      geo.translate(0.5, 0, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: L.colour, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -ang;
      m.position.set(fx + nx * off, K.y, fz + nz * off);
      m.scale.x = 0.001;
      m.visible = false;
      m.userData.len = len;
      this.all.add(m);
      this.lines.push(m);
    }
  }

  /** The cart's bar material, its own copy so the next run starts dull. */
  private findBars() {
    if (this.bars) return this.bars;
    const found: THREE.MeshStandardMaterial[] = [];
    this.yard.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((mat) => {
        if (!/cage-bars/.test(mat.name)) return mat;
        const c = (mat as THREE.MeshStandardMaterial).clone();
        found.push(c);
        return c;
      });
      if (out.some((x, i) => x !== mats[i])) m.material = Array.isArray(m.material) ? out : out[0]!;
    });
    if (found.length) this.bars = found;
    return this.bars;
  }

  step(o: { r: Run2; time: number; half: { w: number; h: number }; tickMs: number }) {
    const { r, time } = o, P = RUN2_LOOK.puff;
    // A crew light that gutters past warm: a grey puff at the rim, rising and gone.
    if (r.fizz && r.fizz.tick !== this.lastFizz) {
      this.lastFizz = r.fizz.tick;
      const s = this.glow(P.color, P.size, 0.7);
      s.position.set(r.fizz.x + 0.5 - o.half.w, 0.8, r.fizz.y + 0.5 - o.half.h);
      this.all.add(s);
      this.puffs.push({ s, at: time });
    }
    this.puffs = this.puffs.filter((p) => {
      const k = (time - p.at) / P.sec;
      if (k >= 1) return void this.all.remove(p.s), false;
      p.s.position.y += P.rise * 0.016;
      (p.s.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - k);
      p.s.scale.setScalar(P.size * (1 + k));
      return true;
    });
    const e = r.end;
    // The lines run from the rim to the cart's door, building to the last instant.
    if (e?.lines !== undefined && this.linesAt < 0) this.linesAt = time;
    if (this.linesAt >= 0) {
      const k = Math.min(1, (time - this.linesAt) / RUN2.end.linesSec);
      for (const m of this.lines) {
        m.visible = true;
        m.scale.x = Math.max(0.001, (m.userData.len as number) * k * k);
      }
    }
    // The bars take the light.
    if (e?.lit !== undefined && this.litAt < 0) this.litAt = time;
    const bars = this.findBars();
    if (bars) {
      const B = RUN2_LOOK.bars, k = this.litAt < 0 ? 0 : Math.min(1, (time - this.litAt) / B.rise);
      for (const b of bars) {
        if (!b.userData.dull) b.userData.dull = { c: b.emissive.clone(), i: b.emissiveIntensity };
        const d = b.userData.dull as { c: THREE.Color; i: number };
        b.emissive.copy(d.c).lerp(new THREE.Color(B.color), k);
        b.emissiveIntensity = d.i + (B.power - d.i) * k;
      }
    }
  }

  dispose() {
    // The bars go dull again, for the next time the run is played on the same yard.
    for (const b of this.bars ?? []) {
      const d = b.userData.dull as { c: THREE.Color; i: number } | undefined;
      if (d) b.emissive.copy(d.c), (b.emissiveIntensity = d.i);
    }
    this.all.removeFromParent();
    this.all.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
  }
}
