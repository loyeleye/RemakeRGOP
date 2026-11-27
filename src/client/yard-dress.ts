// The crew's yard in its third state (Part 2, runs 3 and 4): the maps thread's models (project files
// sogni/lanternfall/production/places/crew-yard/, 27 Nov) placed on their plan 2. The ruin's walls
// with the west wall broken in, the carts still standing in the gaps, the overturned cart Solenne and
// the boy stand by, the cage cart open with the hoods beside it, the gate, the crates, and the stake
// out on the apron. The lamps are out. All the models come in one file (models/crew-yard.pack.json,
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
  { m: "yard-cage-cart-open", at: [0, 9.5] },
  { m: "yard-hood-pile", at: [-3.5, 9.5] },
  // The west leaf shut, the east leaf forced open along the wall, the bar gone.
  { m: "yard-gate-leaf", at: [-0.75, -11] },
  { m: "yard-gate-leaf", at: [2.1, -10.2], yaw: 90 },
  { m: "yard-stake", at: [0, -15] },
  ...OY_YARD.crates.map(([x, y], i) => ({ m: i % 3 === 1 ? "yard-barrel" : "yard-crate", at: [x, y] as [number, number], yaw: (i * 37) % 90 - 45 })),
];

const plain = new GLTFLoader().register((parser) => {
  (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: "plain_textures" };
});

let pack: Promise<Record<string, THREE.Object3D>> | null = null;
/** The yard's models, asked for once (when the yard is first built). */
function loadPack() {
  pack ??= fetch("models/crew-yard.pack.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))))
    .then((b64s) =>
      Promise.all(
        Object.entries(b64s).map(
          ([n, b64]) =>
            new Promise<[string, THREE.Object3D]>((ok, no) =>
              plain.parse(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "", (g: GLTF) => ok([n, dressed(g.scene)]), no),
            ),
        ),
      ),
    )
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
