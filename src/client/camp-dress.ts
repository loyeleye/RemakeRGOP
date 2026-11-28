// The crew's camp, warm (Part 2, the camp walk): the maps thread's walk pieces (CAMP_PIECES, from
// models/crew-yard.pack.json and models/warm-camp.pack.json, base64 glbs by name), the lamps' lights and
// the cooking fire's flicker (CAMP_LIGHTS), and the nightshades at the light's edge: the cast thread's
// blurred cut-out (models/nightshade.glb, its `reach` clip), leaning in with their fingers stopped at the
// light. They hold a pose, and change to another only while the camera is not on them (the brief: they
// never walk). World units are tiles, the origin at the brazier, x east and z south.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CAMP_LIGHTS, CAMP_PIECES } from "../engine/camp.js";
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
      const want = new Set(CAMP_PIECES.map((p) => p.m));
      return Promise.all(Object.entries(b64s).filter(([n]) => want.has(n)).map(([n, b64]) => parsePacked(b64).then((g) => [n, dressed(g.scene)] as const)));
    })
    .then((es) => Object.fromEntries(es));
  return pieces;
}

/** The game contract's look: no metal, rough, lit a little by its own paint. */
function dressed(root: THREE.Object3D) {
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

/** The warm camp's pieces, added to `group` once they are in. */
export function dressCamp(group: THREE.Group) {
  loadPieces()
    .then((ms) => {
      if (!group.parent) return;
      for (const p of CAMP_PIECES) {
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
function loadShade() {
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
