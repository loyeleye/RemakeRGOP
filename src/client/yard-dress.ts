// The crew's yard in its third state (Part 2, runs 3 and 4): the maps thread's models (project files
// sogni/lanternfall/production/places/crew-yard/, 27 Nov, and its "Changes, 28 Nov" in the README:
// the cart remade as still D7, the gate remade, the walls without the south hole, ruin stubs past
// the walls). The ruin's walls with the west wall broken in, the carts still standing in the gaps,
// the overturned cart Solenne and the boy stand by, the back cart open (north-south, its door to the
// brazier) with the hoods beside it, the gate with its east leaf in, its bar leaning on the wall, the
// crates, the stake out on the apron, and a few ruin pieces past the walls. The lamps are out. All the models come in one file (models/crew-yard.pack.json,
// base64 glbs by name) so the preview page stays under its file count. World units are tiles, the
// origin at the brazier, x east and z south.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OY_YARD } from "../engine/offspring.js";

/** Where each piece stands (the maps thread's Placements table, state 3): board x, board y, yaw in degrees. */
export const YARD_PIECES: readonly { m: string; at: [number, number]; yaw?: number }[] = [
  { m: "yard-walls-breached", at: [0, 0] },
  // The carts in the gaps; the west one by the breach (W2) was smashed.
  { m: "yard-wagon", at: [-13, -5], yaw: 90 },
  { m: "yard-wagon", at: [13, -5], yaw: -90 },
  { m: "yard-wagon", at: [13, 4], yaw: -90 },
  { m: "yard-wagon-overturned", at: [11, -4.5], yaw: -90 },
  { m: "yard-cage-cart-open", at: [-3, 8.6], yaw: 180 },
  { m: "yard-hood-pile", at: [-5.6, 9.3] },
  // The gate: the west leaf shut, the east leaf swung in; its bar leaning on the wall east of it.
  { m: "yard-gate-open", at: [0, -11] },
  { m: "yard-gate-bar", at: [3.2, -9.4] },
  { m: "yard-stake", at: [0, -15] },
  // A few ruin pieces past the walls, then dark (Ladi's pick).
  ...([[-15.8, -13.2, 25], [-8.5, -13.6, -10], [8.5, -13.8, 40], [15.6, -8, 80], [-15.8, 1, 95], [15.8, 7, -75], [-15, 13.4, 150], [6, 13.4, 175], [15, 13.2, -140]] as const).map(([x, y, yaw]) => ({ m: "yard-wall-stub", at: [x, y] as [number, number], yaw })),
  ...OY_YARD.crates.map(([x, y], i) => ({ m: i % 3 === 1 ? "yard-barrel" : "yard-crate", at: [x, y] as [number, number], yaw: (i * 37) % 90 - 45 })),
];

const plain = new GLTFLoader().register((parser) => {
  (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: "plain_textures" };
});

let raw: Promise<Record<string, string>> | null = null;
/** The pack file itself (base64 glbs by name), fetched once: the yard's pieces, and the offspring's model (offspring-dress.ts). */
export function yardPackFile() {
  raw ??= fetch("models/crew-yard.pack.json").then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))));
  return raw;
}
/** One glb from the pack, parsed whole (its scene and its clips). */
export function parsePacked(b64: string) {
  return new Promise<GLTF>((ok, no) => plain.parse(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "", ok, no));
}

let pack: Promise<Record<string, THREE.Object3D>> | null = null;
/** The yard's models, asked for once (when the yard is first built). Not the offspring: it is dressed by the fight. */
function loadPack() {
  pack ??= yardPackFile()
    .then((b64s) => Promise.all(Object.entries(b64s).filter(([n]) => n !== "offspring").map(([n, b64]) => parsePacked(b64).then((g) => [n, dressed(g.scene)] as const))))
    .then((es) => Object.fromEntries(es));
  return pack;
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
      mat.emissiveIntensity = 0.15;
    }
  });
  return root;
}

/** The yard's dress, added to `group` once its models are in (nothing shows until then). */
export function dressYard(group: THREE.Group) {
  loadPack()
    .then((ms) => {
      if (!group.parent) return;
      for (const p of YARD_PIECES) {
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
