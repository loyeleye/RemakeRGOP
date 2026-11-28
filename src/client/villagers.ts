// Run 9's villagers: the people of the low one, who wait on the landing and go aboard. Six bases
// from the cast thread (man, woman, girl, boy, elder woman, elder man), each painted grey where
// skin and the main garment are, so one model can be many people: the game picks a skin and an
// outfit colour for each (sogni/lanternfall/production/villagers/README.md is the contract).
// Who stands where is worked out here, the same every run: no two who stand together match.

import * as THREE from "three";

export const VILLAGER_BASES = ["villager-man", "villager-woman", "villager-girl", "villager-boy", "villager-elder-woman", "villager-elder-man"] as const;
export type VillagerBase = (typeof VILLAGER_BASES)[number];

/** How it looks, in one place. */
export const VILLAGERS = {
  /** The man's height in tiles (Rook is 1.8), and each base's against his. */
  man: 1.72,
  heights: { "villager-man": 1, "villager-woman": 0.93, "villager-girl": 0.62, "villager-boy": 0.7, "villager-elder-woman": 0.86, "villager-elder-man": 0.85 } as Record<VillagerBase, number>,
  /** Seated, the underside of the thighs is this share of each one's own height above its feet. */
  seat: { "villager-man": 0.24, "villager-woman": 0.25, "villager-girl": 0.23, "villager-boy": 0.2, "villager-elder-woman": 0.24, "villager-elder-man": 0.22 } as Record<VillagerBase, number>,
  /** Each one's height varies by this much either way. */
  vary: 0.06,
  /** The cast thread's colours: muted, away from the guild colours and from saffron and rust. */
  skins: ["#5c3a28", "#734a32", "#8d5a3c", "#a8714e", "#c4936c", "#e2b494"],
  outfits: ["#5c6e80", "#68784f", "#765468", "#c4b696", "#4e807c", "#b07a68", "#464a5c", "#8a8578", "#3f5a4a"],
  /** Two who stand within this many tiles of each other are neighbours. */
  near: 1.9,
  /** How much each one's own colours light it (as the cast's). */
  flat: 0.25,
  /** The first boat takes the little ones: this many children in it, the rest of each boat grown. */
  children: 5,
} as const;

export interface Villager {
  base: VillagerBase;
  skin: string;
  outfit: string;
  /** Height in tiles. */
  height: number;
  /** Where in its clips it starts (0 to 1), so that no two move together, and which way it leans: 0 stands easy, 1 huddles, 2 looks up. */
  phase: number;
  mood: 0 | 1 | 2;
}

/**
 * The roster: one villager for each place. `groups[i]` is which boat the one at `places[i]` goes
 * with and `seats[i]` its seat there; the first boat's first seats are the children. Each is given
 * a base, then the skin and outfit that match the fewest of those already standing near it: never
 * the same outfit as a neighbour, and never the same base and skin as one.
 */
export function villagerRoster(places: readonly (readonly [number, number])[], groups: readonly number[], seats: readonly number[], seed = 9): Villager[] {
  const V = VILLAGERS;
  let s = seed * 2654435761 >>> 0;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const grown: VillagerBase[] = ["villager-woman", "villager-man", "villager-elder-woman", "villager-elder-man"], small: VillagerBase[] = ["villager-girl", "villager-boy"];
  const out: Villager[] = [];
  let g = 0, c = 0;
  places.forEach((at, i) => {
    const child = groups[i] === 0 && seats[i]! < V.children;
    const base = child ? small[c++ % small.length]! : grown[(g++ * 3 + (groups[i] ?? 0)) % grown.length]!;
    const near = out.filter((_, j) => Math.hypot(places[j]![0] - at[0], places[j]![1] - at[1]) <= V.near);
    let best: { skin: string; outfit: string; cost: number } = { skin: V.skins[0]!, outfit: V.outfits[0]!, cost: Infinity };
    for (const outfit of V.outfits)
      for (const skin of V.skins) {
        const cost = near.filter((n) => n.outfit === outfit).length * 10 + near.filter((n) => n.base === base && n.skin === skin).length * 10 + near.filter((n) => n.skin === skin).length * 2
          + out.filter((n) => n.outfit === outfit).length * 0.7 + out.filter((n) => n.skin === skin).length * 0.5 + out.filter((n) => n.base === base && n.skin === skin && n.outfit === outfit).length * 50 + rand() * 0.9;
        if (cost < best.cost) best = { skin, outfit, cost };
      }
    const roll = rand();
    out.push({ base, skin: best.skin, outfit: best.outfit, height: V.man * V.heights[base] * (1 + (rand() * 2 - 1) * V.vary), phase: rand(), mood: roll < 0.5 ? 0 : roll < 0.8 ? 1 : 2 });
  });
  return out;
}

/**
 * Colour a villager (the cast thread's villager-tint.js): the model's occlusion texture, which does
 * nothing by itself, is the mask: red is skin, green is the main garment. Each material is cloned
 * and its paint and its own light multiplied by the two colours there. Call it last, after anything
 * else that clones the material: a clone does not carry the patch.
 */
export function tintVillager(root: THREE.Object3D, skin: string, outfit: string) {
  const u = { uTintMask: { value: null as THREE.Texture | null }, uSkin: { value: new THREE.Color(skin) }, uOutfit: { value: new THREE.Color(outfit) } };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial, mask = (src.userData.tintMask as THREE.Texture | undefined) ?? src.aoMap;
    if (!mask) return;
    const m = src.clone();
    m.userData.tintMask = mask;
    m.aoMap = null;
    u.uTintMask.value = mask;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\nuniform sampler2D uTintMask;\nuniform vec3 uSkin;\nuniform vec3 uOutfit;")
        .replace("#include <map_fragment>", "#include <map_fragment>\n\tvec4 villagerMask = texture2D( uTintMask, vMapUv );\n\tvec3 villagerTint = mix( vec3( 1.0 ), uSkin, villagerMask.r ) * mix( vec3( 1.0 ), uOutfit, villagerMask.g );\n\tdiffuseColor.rgb *= villagerTint;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= villagerTint;");
    };
    m.customProgramCacheKey = () => "villager-tint";
    mesh.material = m;
  });
  return u;
}
