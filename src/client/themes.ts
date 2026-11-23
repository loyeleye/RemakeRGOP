// Each shrine's island has its own look: palette, sky, light, the props that stand in for its
// walls and boulders, set pieces on the verge, and drifting particles. All procedural, smooth
// shaded except where the thing is faceted in life (crystals, ice).

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { makeCloud, makeTree, makeWaterfall, noise3 } from "./islands.js";

export type Particles = "pollen" | "embers" | "sparkles" | "mist" | "petals" | "fireflies" | "snow" | null;
/** What a wall tile (#) or a boulder tile (o) is drawn as. "monolith" and "boulder" are the Sogni models. */
export type PropKind = "monolith" | "boulder" | "crystal" | "icespire" | "rampart" | "glowtree" | "flowerbed" | "standing" | "icerock" | "smallcrystal" | "toadstool" | "mushrooms" | "column" | "hydrangea";

export interface Theme {
  name: string;
  floor: string;
  grass: string;
  soil: string;
  rock: string;
  sky: { zenith: string; sky: string; haze: string; below: string; stars: number };
  fog: string;
  clouds: string;
  hemi: [string, string, number];
  sun: [string, number];
  exposure: number;
  wall: PropKind;
  boulder: PropKind;
  particles: Particles;
  /** A place to walk, not an arena: grass, no parapet round the edge, no monoliths. */
  place?: boolean;
  /** Tint for the plain wall/boulder models, if the island wants them darker or paler. */
  tint?: string;
  /** What deflector stones inside the archways look like, if not the island's boulders. */
  deflector?: PropKind;
  /** Colour of crystal mirrors. */
  crystal?: string;
  /** Colour of the archway stone, if not the island's rock lightened. */
  arch?: string;
  /** Something that glows on top of the pillars at the ends of each archway run. */
  crown?: (seed: number) => THREE.Object3D;
  /** A small thing to dot the distant islands with. */
  scatter: (size: number, seed: number) => THREE.Object3D;
  decorate: (d: DecorContext) => void;
}

export interface DecorContext {
  group: THREE.Group;
  /** A point on the coastline at angle a, pushed `out` tiles past the flagstones. */
  ring: (a: number, out: number) => { x: number; z: number };
  /** The lower tiers: where they sit and how big they are. */
  tiers: { x: number; y: number; z: number; r: number; group: THREE.Group }[];
  time: (u: { value: number }) => void;
  low: boolean;
}

const DAY_SKY = { zenith: "#1a5cc7", sky: "#5c9eeb", haze: "#a8c9f2", below: "#4d85db", stars: 0 };

// The north verge (far side from the camera) runs from a = PI to 2 PI.
const NORTH = -Math.PI / 2;

export const THEMES: Record<string, Theme> = {
  "moss-hollow": {
    name: "Grove",
    floor: "moss-hollow",
    grass: "#5f9446",
    soil: "#7a5a40",
    rock: "#8a7a6a",
    sky: DAY_SKY,
    fog: "#9dbde8",
    clouds: "#ffffff",
    hemi: ["#cfe2ff", "#5a6a50", 1.15],
    sun: ["#fff1d6", 3],
    exposure: 1,
    wall: "monolith",
    boulder: "boulder",
    particles: "pollen",
    scatter: (size, seed) => makeTree(size, seed),
    decorate(d) {
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * (1.02 + (i / 15) * 0.96);
        const p = d.ring(a, 1.4 + (i % 3) * 0.35);
        add(d.group, makeTree(1.5 + (i % 3) * 0.6, i + 3), p.x, 0, p.z);
      }
      d.tiers.forEach((t, i) => {
        if (i === 0) pond(t.group, t.r * 0.35, "#3d8fb0");
        for (let k = 0; k < 3; k++) add(t.group, makeTree(1.5 + k * 0.4, i * 9 + k), Math.cos(k * 2.1 + i) * t.r * 0.5, 0, Math.sin(k * 2.1 + i) * t.r * 0.4);
      });
    },
  },
  "tidepool-steps": {
    name: "Lagoon",
    floor: "tidepool-steps",
    grass: "#dcc788",
    soil: "#c98a4a",
    rock: "#b0703e",
    sky: { ...DAY_SKY, zenith: "#0f6bc4", sky: "#4fb0ea" },
    fog: "#a6d2f0",
    clouds: "#ffffff",
    hemi: ["#d8f0ff", "#8a7a50", 1.2],
    sun: ["#fff4dc", 3.1],
    exposure: 1,
    wall: "monolith",
    boulder: "boulder",
    particles: null,
    scatter: (size, seed) => makePalm(size * 1.5, seed),
    decorate(d) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        const p = d.ring(a, 1.3 + (i % 2) * 0.5);
        add(d.group, makePalm(2.4 + (i % 3) * 0.6, i), p.x, 0, p.z);
      }
      d.tiers.forEach((t, i) => {
        stream(t.group, t.r, "#36b6d8", i);
        for (let k = 0; k < 2; k++) add(t.group, makePalm(2 + k * 0.5, i * 4 + k), Math.cos(k * 2.6 + i) * t.r * 0.45, 0, Math.sin(k * 2.6 + i) * t.r * 0.4);
        bushes(t.group, t.r, "#4fa83a", i);
      });
    },
  },
  // Lumi's home pond (story run 2): the lagoon look for now, as placeholder art.
  get "home-pond"() {
    return THEMES["tidepool-steps"]!;
  },
  get "home-pond-big"() {
    return THEMES["tidepool-steps"]!;
  },
  // The home island as a place to walk: the lagoon's sky and falls, on grass.
  get "home-island"() {
    return { ...THEMES["tidepool-steps"]!, name: "Home island", floor: "home-island", grass: "#7fb352", place: true };
  },
  "ember-quarry": {
    name: "Volcano",
    floor: "volcano",
    grass: "#5b4e48",
    soil: "#8f4f2c",
    rock: "#6e3b28",
    sky: { zenith: "#2e5aa8", sky: "#7d9ed6", haze: "#e0b8a0", below: "#5a78b8", stars: 0 },
    fog: "#c8b0a8",
    clouds: "#f2e4dc",
    hemi: ["#ffe2cc", "#4a3028", 1.0],
    sun: ["#ffd8b0", 2.8],
    exposure: 1,
    wall: "monolith",
    boulder: "boulder",
    tint: "#6a5a5a",
    particles: "embers",
    scatter: (size, seed) => makeCrystals(size * 0.6, "#5a4a48", seed),
    decorate(d) {
      const p = d.ring(NORTH, 6.5);
      add(d.group, makeVolcano(9, 10, d.time), p.x, -0.2, p.z - 3);
      d.tiers.forEach((t, i) => lavaPool(t.group, t.r * 0.45, d.time, i));
    },
  },
  "crystal-spire": {
    name: "Crystal",
    floor: "crystal-spire",
    grass: "#d9a9e3",
    soil: "#8c6f8e",
    rock: "#776a84",
    sky: { ...DAY_SKY, haze: "#d7c2f0", below: "#7a7fe0" },
    fog: "#c2b8ec",
    clouds: "#fbf2ff",
    hemi: ["#f2e0ff", "#6a5070", 1.2],
    sun: ["#fff0f8", 2.9],
    exposure: 1,
    wall: "crystal",
    boulder: "smallcrystal",
    particles: "sparkles",
    scatter: (size, seed) => makeCrystals(size, "#ff7ad9", seed),
    decorate(d) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.08 + (i / 6) * 0.84);
        const p = d.ring(a, 1.5);
        add(d.group, makeCrystals(1.6 + (i % 3) * 1.1, "#ff7ad9", i * 3), p.x, 0, p.z);
      }
      add(d.group, makeCrystals(7, "#ff6ad2", 99), d.ring(NORTH, 4).x, 0, d.ring(NORTH, 4).z);
      d.tiers.forEach((t, i) => add(t.group, makeCrystals(2.5 + i, "#e07aff", i * 11), 0, 0, 0));
    },
  },
  "cascade-falls": {
    name: "Cascade",
    floor: "cascade-falls",
    grass: "#6cbf47",
    soil: "#7a5a40",
    rock: "#9a948a",
    sky: DAY_SKY,
    fog: "#a2c8ee",
    clouds: "#ffffff",
    hemi: ["#d6ecff", "#5a7050", 1.2],
    sun: ["#fff4e0", 3],
    exposure: 1,
    wall: "monolith",
    boulder: "boulder",
    particles: "mist",
    scatter: (size, seed) => makeTree(size, seed),
    decorate(d) {
      const p = d.ring(NORTH, 3.5);
      add(d.group, makeCliffFall(9, d.time), p.x, 0, p.z - 1);
      for (const a of [Math.PI * 1.2, Math.PI * 1.8]) {
        const q = d.ring(a, 1.8);
        add(d.group, makeCliffFall(4, d.time), q.x, 0, q.z);
      }
      d.tiers.forEach((t, i) => {
        pond(t.group, t.r * 0.4, "#46a8d8");
        add(t.group, makeTree(1.6, i * 5), t.r * 0.4, 0, -t.r * 0.3);
      });
    },
  },
  "misty-stones": {
    name: "Misty Stones",
    floor: "misty-stones",
    grass: "#7f8f86",
    soil: "#646872",
    rock: "#7a7c88",
    sky: { zenith: "#24448a", sky: "#6886c0", haze: "#b4c2dc", below: "#4a64a0", stars: 0 },
    fog: "#9fb0d0",
    clouds: "#e8eef8",
    hemi: ["#cddcff", "#505660", 1.1],
    sun: ["#e8f0ff", 2.4],
    exposure: 1.05,
    wall: "standing",
    boulder: "standing",
    particles: "mist",
    scatter: (size, seed) => makeStoneBlock(size * 0.6, seed),
    decorate(d) {
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * (1.05 + (i / 7) * 0.9);
        const p = d.ring(a, 1.5);
        add(d.group, makeStoneBlock(0.9 + (i % 3) * 0.4, i), p.x, 0, p.z);
      }
      d.tiers.forEach((t, i) => {
        pond(t.group, t.r * 0.55, "#5d8fc8");
        for (let k = 0; k < 3; k++) add(t.group, makeStoneBlock(0.8 + k * 0.3, i * 3 + k), Math.cos(k * 2.1) * t.r * 0.3, 0, Math.sin(k * 2.1) * t.r * 0.3);
      });
      for (let i = 0; i < (d.low ? 6 : 12); i++) {
        const a = (i / 12) * Math.PI * 2;
        const p = d.ring(a, 2 + (i % 3));
        const c = makeCloud(6 + (i % 3) * 2, "#9cc0ff", 0.28);
        c.position.set(p.x, 1.2 + (i % 2), p.z);
        d.group.add(c);
      }
    },
  },
  "blossom-garden": {
    name: "Blossom",
    floor: "blossom-garden",
    grass: "#78c24a",
    soil: "#8a5a36",
    rock: "#9a7058",
    sky: DAY_SKY,
    fog: "#a8c8ee",
    clouds: "#ffffff",
    hemi: ["#fff0e8", "#5a7048", 1.2],
    sun: ["#fff0dc", 3],
    exposure: 1,
    wall: "monolith",
    boulder: "flowerbed",
    particles: "petals",
    scatter: (size, seed) => makeFlower(size, ["#ff5a4a", "#ff9a3a", "#ff6aa8"][seed % 3]!, seed),
    decorate(d) {
      const colours = ["#ff5a4a", "#ff9a3a", "#ff6aa8", "#ffd04a"];
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        const p = d.ring(a, 1.5 + (i % 2) * 0.4);
        add(d.group, makeFlower(3 + (i % 3) * 1.3, colours[i % 4]!, i), p.x, 0, p.z);
      }
      d.tiers.forEach((t, i) => {
        add(t.group, makeFlower(4.5 + i * 0.8, colours[(i + 1) % 4]!, i * 7), 0, 0, 0);
        bushes(t.group, t.r, "#3f9a3a", i);
      });
    },
  },
  "fairy-ring": {
    name: "Fairy Ring",
    floor: "fairy-ring",
    grass: "#3f9c78",
    soil: "#5a4060",
    rock: "#6a5a80",
    sky: { zenith: "#170f48", sky: "#3a2f86", haze: "#a070c4", below: "#28286e", stars: 1 },
    fog: "#3a2e78",
    clouds: "#8a74c4",
    hemi: ["#b8a0f0", "#2a2040", 0.85],
    sun: ["#d8c8ff", 1.4],
    exposure: 1.3,
    wall: "column",
    boulder: "hydrangea",
    deflector: "toadstool",
    arch: "#f2c8dc",
    crown: (seed) => makeStarLantern(STAR_COLOURS[seed % STAR_COLOURS.length]!, 0.42, seed),
    particles: "sparkles",
    scatter: (size, seed) => (seed % 3 === 0 ? makeMushroomLamp(size * 0.9, seed) : seed % 3 === 1 ? makeBlossomTree(size * 1.1, seed) : makeHydrangea(size * 0.5, seed)),
    decorate(d) {
      // A moonlit fairy garden: glittering blossom trees, glowing hydrangeas, hyacinths and
      // mushroom lamps round the verge, star lanterns on pink columns, shooting stars overhead.
      for (let i = 0; i < 13; i++) {
        const p = d.ring(Math.PI * (1.03 + (i / 12) * 0.94), 1.3 + (i % 2) * 0.7);
        const kind = i % 4;
        if (kind === 0) add(d.group, makeBlossomTree(4.5 + (i % 3), i, d.low), p.x, 0, p.z);
        else if (kind === 1) add(d.group, makeHydrangea(1.2, i), p.x, 0, p.z);
        else if (kind === 2) add(d.group, makeMushroomLamp(2.6 + (i % 2), i), p.x, 0, p.z);
        else add(d.group, makeHyacinths(1.1, i), p.x, 0, p.z);
      }
      for (const k of [-1, 1]) {
        const q = d.ring(NORTH + k * 0.22, 2.2);
        add(d.group, makeColumn(4.2, 40 + k), q.x, 0, q.z);
      }
      const n = d.ring(NORTH, 5.5);
      add(d.group, makeBlossomTree(10, 77, d.low), n.x, 0, n.z);
      d.tiers.forEach((t, i) => {
        add(t.group, makeBlossomTree(4 + i * 0.6, i * 5 + 1, d.low), t.r * 0.3, 0, -t.r * 0.25);
        add(t.group, makeMushroomLamp(1.8, i + 11), -t.r * 0.35, 0, t.r * 0.1);
        add(t.group, makeHydrangea(1, i + 3), 0, 0, t.r * 0.35);
        add(t.group, makeHyacinths(0.9, i + 4), -t.r * 0.1, 0, -t.r * 0.35);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          add(t.group, makeMushroom(0.35, i * 9 + k), Math.cos(a) * t.r * 0.16, 0, Math.sin(a) * t.r * 0.16);
        }
      });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16), new THREE.MeshBasicMaterial({ color: "#e6f4ff", fog: false }));
      moon.position.set(-160, 200, -420);
      d.group.add(moon);
      d.group.add(makeShootingStars(d.low ? 2 : 4));
    },
  },
  "castle-rise": {
    name: "Castle Rise",
    floor: "castle-rise",
    grass: "#74b548",
    soil: "#9a6a3a",
    rock: "#a07850",
    sky: DAY_SKY,
    fog: "#a2c4ec",
    clouds: "#ffffff",
    hemi: ["#e0ecff", "#607050", 1.15],
    sun: ["#fff0d8", 3],
    exposure: 1,
    wall: "rampart",
    boulder: "boulder",
    particles: null,
    scatter: (size, seed) => seed % 2 ? makeTower(size * 0.35, seed) : makeTree(size, seed),
    decorate(d) {
      const p = d.ring(NORTH, 5);
      add(d.group, makeCastle(1.3), p.x, 0, p.z - 1);
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * (1.02 + (i / 9) * 0.96);
        if (Math.abs(a - Math.PI * 1.5) < 0.35) continue;
        const q = d.ring(a, 1.4);
        add(d.group, makeTree(1.4 + (i % 3) * 0.4, i + 40), q.x, 0, q.z);
      }
      d.tiers.forEach((t, i) => {
        add(t.group, makeTower(1, i), 0, 0, 0);
        add(t.group, makeTree(1.5, i * 3 + 1), t.r * 0.45, 0, t.r * 0.2);
      });
    },
  },
  "night-glade": {
    name: "Night Glade",
    floor: "night-glade",
    grass: "#2c6e56",
    soil: "#4a3a40",
    rock: "#4a4660",
    sky: { zenith: "#050a24", sky: "#142a5c", haze: "#2a3e78", below: "#0c1840", stars: 1 },
    fog: "#1a2a52",
    clouds: "#3a4a7a",
    hemi: ["#5a78c8", "#1a2030", 0.55],
    sun: ["#a8c0ff", 1.1],
    exposure: 1.35,
    wall: "glowtree",
    boulder: "boulder",
    tint: "#5a6080",
    particles: "fireflies",
    scatter: (size, seed) => makeGlowTree(size, seed),
    decorate(d) {
      const p = d.ring(NORTH, 3.5);
      add(d.group, makeGlowTree(8, 7), p.x, 0, p.z);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.08 + (i / 5) * 0.84);
        if (Math.abs(a - Math.PI * 1.5) < 0.4) continue;
        const q = d.ring(a, 1.5);
        add(d.group, makeGlowTree(2.2 + (i % 2), i), q.x, 0, q.z);
      }
      d.tiers.forEach((t, i) => {
        pond(t.group, t.r * 0.45, "#8a7aff", true);
        add(t.group, makeGlowTree(2, i + 20), t.r * 0.4, 0, -t.r * 0.3);
      });
    },
  },
  glacier: {
    name: "Glacier",
    floor: "glacier",
    grass: "#eef5fa",
    soil: "#b9d6ea",
    rock: "#8cb2cc",
    sky: { zenith: "#2a6ad0", sky: "#86baf0", haze: "#d4e6f8", below: "#6a9ee0", stars: 0 },
    fog: "#a9c8ea",
    clouds: "#ffffff",
    hemi: ["#d8ecff", "#7890a8", 1.05],
    sun: ["#fff8ee", 2.6],
    exposure: 0.8,
    wall: "icespire",
    boulder: "icerock",
    particles: "snow",
    scatter: (size, seed) => makeCrystals(size, "#d4f4ff", seed, true),
    decorate(d) {
      const p = d.ring(NORTH, 4);
      add(d.group, makeCrystals(8, "#bfefff", 5, true), p.x, 0, p.z);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.06 + (i / 6) * 0.88);
        if (Math.abs(a - Math.PI * 1.5) < 0.3) continue;
        const q = d.ring(a, 1.5);
        add(d.group, makeCrystals(2 + (i % 3), "#d4f4ff", i * 5, true), q.x, 0, q.z);
      }
      d.tiers.forEach((t, i) => add(t.group, makeCrystals(3 + i, "#c8f0ff", i * 13, true), 0, 0, 0));
    },
  },
  "old-bastion": {
    name: "Bastion",
    floor: "castle-rise",
    grass: "#8a9a4a",
    soil: "#8a5a3a",
    rock: "#9a7a5a",
    sky: { zenith: "#2a3f8a", sky: "#d98a5a", haze: "#f2c08a", below: "#7a5a8a", stars: 0 },
    fog: "#e0a87a",
    clouds: "#ffe2c8",
    hemi: ["#ffe0c0", "#5a4a50", 1.1],
    sun: ["#ffc080", 2.8],
    exposure: 1,
    wall: "rampart",
    boulder: "boulder",
    particles: "pollen",
    scatter: (size, seed) => (seed % 3 ? makeTower(size * 0.3, seed) : makeStoneBlock(size * 0.5, seed)),
    decorate(d) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.08 + (i / 5) * 0.84);
        const p = d.ring(a, 1.6);
        add(d.group, makeTower(1.1 + (i % 2) * 0.4, i), p.x, 0, p.z);
      }
      for (let i = 0; i < 14; i++) {
        const p = d.ring((i / 14) * Math.PI * 2 + 0.2, 1);
        add(d.group, makeRampart(i + 7), p.x, 0, p.z);
      }
      d.tiers.forEach((t, i) => {
        add(t.group, makeTower(0.9, i + 3), 0, 0, 0);
        for (let k = 0; k < 3; k++) add(t.group, makeStoneBlock(0.7 + k * 0.3, i * 5 + k), Math.cos(k * 2.1) * t.r * 0.4, 0, Math.sin(k * 2.1) * t.r * 0.4);
      });
    },
  },
  "sunwell-terrace": {
    name: "Sunwell",
    floor: "tidepool-steps",
    grass: "#c8b860",
    soil: "#c08a50",
    rock: "#d8b888",
    sky: { zenith: "#3a62c8", sky: "#8ab8f0", haze: "#fbe6b8", below: "#7a90d8", stars: 0 },
    fog: "#f0dcb0",
    clouds: "#fff6e0",
    hemi: ["#fff4dc", "#8a7a50", 1.25],
    sun: ["#fff0c8", 3.2],
    exposure: 1.02,
    wall: "monolith",
    boulder: "boulder",
    particles: "sparkles",
    tint: "#f0dcc0",
    scatter: (size, seed) => (seed % 2 ? makePalm(size * 1.3, seed) : makeStoneBlock(size * 0.5, seed)),
    decorate(d) {
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * (1.04 + (i / 9) * 0.92);
        const p = d.ring(a, 1.3 + (i % 2) * 0.6);
        if (i % 3 === 0) add(d.group, makeStoneBlock(1.6, i), p.x, 0, p.z);
        else add(d.group, makePalm(2.4 + (i % 3) * 0.5, i), p.x, 0, p.z);
      }
      d.tiers.forEach((t, i) => {
        pond(t.group, t.r * 0.5, "#4fc0e8");
        add(t.group, makePalm(2.2, i + 9), t.r * 0.4, 0, -t.r * 0.2);
      });
    },
  },
};

export function themeFor(id: string): Theme {
  return THEMES[id] ?? THEMES["moss-hollow"]!;
}

// ------------------------------------------------------------------ props for tiles

/** A procedural prop standing on one tile, `height` tall. Null for the Sogni model kinds. */
export function makeTileProp(kind: PropKind, height: number, seed: number): THREE.Object3D | null {
  switch (kind) {
    case "crystal":
      return makeCrystals(height * 0.8, "#ff7ad9", seed);
    case "smallcrystal":
      return makeCrystals(0.9, "#e08aff", seed);
    case "icespire":
      return makeCrystals(height * 0.85, "#c8f2ff", seed, true);
    case "icerock":
      return makeIceRock(seed);
    case "rampart":
      return makeRampart(seed);
    case "glowtree":
      return makeGlowTree(2.4, seed);
    case "flowerbed":
      return makeFlowerbed(seed);
    case "standing":
      return makeStoneBlock(1.2 + rnd(seed, 1) * 0.5, seed);
    case "column":
      return makeColumn(height, seed);
    case "hydrangea":
      return makeHydrangea(0.9, seed);
    case "toadstool":
      return makeMushroom(height * 0.95, seed, true);
    case "mushrooms": {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) add(g, makeMushroom(0.5 + rnd(seed, i) * 0.6, seed * 3 + i), Math.cos(i * 2.1) * 0.25, 0, Math.sin(i * 2.1) * 0.25);
      return g;
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------ builders

function rnd(seed: number, k: number) {
  const s = Math.sin(seed * 91.7 + k * 13.1) * 43758.5453;
  return s - Math.floor(s);
}

function add(g: THREE.Object3D, o: THREE.Object3D, x: number, y: number, z: number) {
  o.position.set(x, y, z);
  g.add(o);
  return o;
}

function shadows(o: THREE.Object3D) {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
}

const crystalMats = new Map<string, THREE.Material>();
function crystalMat(color: string, ice: boolean) {
  const key = color + ice;
  let m = crystalMats.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshStandardMaterial({
      color: c,
      emissive: c.clone().multiplyScalar(ice ? 0.12 : 0.35),
      roughness: ice ? 0.15 : 0.25,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: ice ? 0.88 : 0.9,
    });
    crystalMats.set(key, m);
  }
  return m;
}

/** A cluster of six-sided crystal (or ice) shards fanning out of one base. */
export function makeCrystals(height: number, color: string, seed: number, ice = false) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(rnd(seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const h = height * (main ? 1 : 0.35 + rnd(seed, 10 + i) * 0.45);
    const r = h * (ice ? 0.2 : 0.14);
    const geo = new THREE.LatheGeometry(
      [new THREE.Vector2(0.001, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r * 1.05, h * 0.72), new THREE.Vector2(0.001, h)],
      ice ? 5 : 6,
    );
    const m = new THREE.Mesh(geo, crystalMat(color, ice));
    const a = rnd(seed, 20 + i) * Math.PI * 2;
    const tilt = main ? 0.05 : 0.25 + rnd(seed, 30 + i) * 0.45;
    m.position.set(main ? 0 : Math.cos(a) * height * 0.12, -h * 0.05, main ? 0 : Math.sin(a) * height * 0.12);
    m.rotation.set(Math.sin(a) * tilt, rnd(seed, 40 + i) * 3, -Math.cos(a) * tilt);
    g.add(m);
  }
  return shadows(g);
}

function makeIceRock(seed: number) {
  const geo = new THREE.DodecahedronGeometry(0.42, 0);
  geo.scale(1, 0.7 + rnd(seed, 2) * 0.3, 1);
  const m = new THREE.Mesh(geo, crystalMat("#d8f4ff", true));
  m.position.y = 0.25;
  m.rotation.y = rnd(seed, 3) * 6;
  return shadows(m);
}

const sandstone = new THREE.MeshStandardMaterial({ color: "#d6b27c", roughness: 0.9 });
const roofMat = new THREE.MeshStandardMaterial({ color: "#3f63c8", roughness: 0.6 });

function makeRampart(seed: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1, 1.5, 1, 3, 0.08), sandstone);
  body.position.y = 0.75;
  g.add(body);
  if (rnd(seed, 1) > 0.3) {
    const merlon = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.36, 0.42, 2, 0.05), sandstone);
    merlon.position.set((rnd(seed, 2) - 0.5) * 0.4, 1.68, (rnd(seed, 3) - 0.5) * 0.4);
    g.add(merlon);
  }
  return shadows(g);
}

function makeTower(scale: number, seed: number) {
  const g = new THREE.Group();
  const h = (4 + rnd(seed, 1) * 2) * scale;
  const r = 0.9 * scale;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 32), sandstone);
  body.position.y = h / 2;
  g.add(body);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.3 * scale, 0.35 * scale, 0.3 * scale, 2, 0.04), sandstone);
    m.position.set(Math.cos(a) * r * 0.9, h + 0.15 * scale, Math.sin(a) * r * 0.9);
    g.add(m);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.2, h * 0.55, 32), roofMat);
  roof.position.y = h + h * 0.27 + 0.3 * scale;
  g.add(roof);
  return shadows(g);
}

/** A small storybook castle: a keep with a roof, four corner towers and a gate. */
function makeCastle(scale: number) {
  const g = new THREE.Group();
  const keep = new THREE.Mesh(new RoundedBoxGeometry(5 * scale, 4 * scale, 4 * scale, 3, 0.15), sandstone);
  keep.position.y = 2 * scale;
  g.add(keep);
  const top = new THREE.Mesh(new THREE.ConeGeometry(2.4 * scale, 3 * scale, 4), roofMat);
  top.position.y = 5.5 * scale;
  top.rotation.y = Math.PI / 4;
  g.add(top);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(g, makeTower(scale * 0.9, x * 3 + z), x * 2.8 * scale, 0, z * 2.3 * scale);
  const tall = makeTower(scale * 1.25, 9);
  add(g, tall, 0, 0, -1.2 * scale);
  const gate = new THREE.Mesh(new RoundedBoxGeometry(1.2 * scale, 1.8 * scale, 0.3, 2, 0.1), new THREE.MeshStandardMaterial({ color: "#5a3a26", roughness: 1 }));
  gate.position.set(0, 0.9 * scale, 2 * scale + 0.05);
  g.add(gate);
  return shadows(g);
}

function makeStoneBlock(h: number, seed: number) {
  const w = 0.7 + rnd(seed, 1) * 0.3;
  const m = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, w * (0.6 + rnd(seed, 2) * 0.3), 3, 0.12),
    new THREE.MeshStandardMaterial({ color: new THREE.Color("#8c8e98").offsetHSL(0, 0, (rnd(seed, 3) - 0.5) * 0.08), roughness: 0.95 }),
  );
  m.position.y = h / 2 - 0.05;
  m.rotation.set((rnd(seed, 4) - 0.5) * 0.12, rnd(seed, 5) * 3, (rnd(seed, 6) - 0.5) * 0.12);
  return shadows(m);
}

const leafGreen = new THREE.MeshStandardMaterial({ color: "#3f9a3a", roughness: 0.8, side: THREE.DoubleSide });
const stemMat = new THREE.MeshStandardMaterial({ color: "#4a8a34", roughness: 0.8 });

/** A leaf: a flat teardrop bent down along its length. */
function leafGeometry(len: number, width: number, droop: number) {
  const geo = new THREE.PlaneGeometry(width, len, 4, 10);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + len / 2) / len; // 0 at the stem, 1 at the tip
    const shape = Math.sin(Math.min(1, t * 1.1) * Math.PI) * 0.9 + 0.1;
    p.setX(i, p.getX(i) * shape);
    p.setZ(i, -droop * t * t * len + Math.abs(p.getX(i)) * 0.3);
    p.setY(i, t * len);
  }
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function makePalm(h: number, seed: number) {
  const g = new THREE.Group();
  const lean = (rnd(seed, 1) - 0.5) * 0.8;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.4, h * 0.5, 0),
    new THREE.Vector3(lean, h, lean * 0.2),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, h * 0.045, 10), new THREE.MeshStandardMaterial({ color: "#8a6a48", roughness: 1 }));
  g.add(trunk);
  const crown = new THREE.Group();
  crown.position.set(lean, h, lean * 0.2);
  const frond = leafGeometry(h * 0.55, h * 0.16, 0.7);
  const mat = new THREE.MeshStandardMaterial({ color: "#3fa84a", roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const l = new THREE.Mesh(frond, mat);
    l.rotation.y = (i / 8) * Math.PI * 2 + rnd(seed, i);
    l.rotation.x = 0.25;
    crown.add(l);
  }
  g.add(crown);
  return shadows(g);
}

/** A giant storybook flower: a curved stem, two big leaves, a ring of soft petals. */
function makeFlower(h: number, color: string, seed: number) {
  const g = new THREE.Group();
  const lean = (rnd(seed, 1) - 0.5) * 0.6;
  const top = new THREE.Vector3(lean, h, lean * 0.4);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.2, h * 0.5, 0), top]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, h * 0.035, 8), stemMat));
  const leaf = leafGeometry(h * 0.45, h * 0.22, 0.4);
  for (let i = 0; i < 2; i++) {
    const l = new THREE.Mesh(leaf, leafGreen);
    l.position.y = h * (0.15 + i * 0.15);
    l.rotation.y = i * Math.PI + rnd(seed, 3);
    l.rotation.x = -0.3;
    g.add(l);
  }
  const head = new THREE.Group();
  head.position.copy(top);
  head.rotation.x = 0.5;
  const petalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: new THREE.Color(color).multiplyScalar(0.12) });
  const petal = new THREE.SphereGeometry(h * 0.16, 20, 12);
  petal.scale(0.55, 0.12, 1);
  petal.translate(0, 0, h * 0.15);
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(petal, petalMat);
    p.rotation.y = (i / 9) * Math.PI * 2;
    p.rotation.x = -0.25;
    head.add(p);
  }
  const centre = new THREE.Mesh(new THREE.SphereGeometry(h * 0.08, 20, 12), new THREE.MeshStandardMaterial({ color: "#ffd84a", roughness: 0.7, emissive: "#3a2a00" }));
  centre.scale.y = 0.6;
  head.add(centre);
  g.add(head);
  return shadows(g);
}

const CAPS = ["#e0443a", "#e86a3a", "#c84ad0", "#f0a040"];
const stalkMat = new THREE.MeshStandardMaterial({ color: "#f2e6d4", roughness: 0.8 });
const gillMat = new THREE.MeshStandardMaterial({ color: "#e8d2bc", roughness: 0.9, side: THREE.DoubleSide });
const spotMat = new THREE.MeshStandardMaterial({ color: "#fffaf0", roughness: 0.6 });

/** A toadstool `h` tall: a curved stalk, a domed spotted cap. `pillar` keeps it upright and stout. */
function makeMushroom(h: number, seed: number, pillar = false) {
  const g = new THREE.Group();
  const lean = pillar ? 0 : (rnd(seed, 1) - 0.5) * 0.5 * h * 0.3;
  const capR = h * (pillar ? 0.42 : 0.38 + rnd(seed, 2) * 0.12);
  const stalkR = h * (pillar ? 0.16 : 0.1);
  const pts = [0, 0.3, 0.7, 1].map((t) => new THREE.Vector2(stalkR * (1.25 - 0.35 * t + (t === 0 ? 0.2 : 0)), h * 0.82 * t));
  const stalk = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), stalkMat);
  stalk.castShadow = true;
  g.add(stalk);
  const capColor = CAPS[Math.floor(rnd(seed, 3) * CAPS.length)]!;
  const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.55, emissive: new THREE.Color(capColor).multiplyScalar(0.08) });
  const capGeo = new THREE.SphereGeometry(capR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  capGeo.scale(1, 0.62, 1);
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.set(lean, h * 0.78, 0);
  cap.castShadow = true;
  g.add(cap);
  const gills = new THREE.Mesh(new THREE.CircleGeometry(capR * 0.98, 32), gillMat);
  gills.rotation.x = Math.PI / 2;
  gills.position.copy(cap.position);
  g.add(gills);
  const spots = 5 + Math.floor(rnd(seed, 4) * 5);
  const spotGeo = new THREE.SphereGeometry(capR * 0.11, 10, 6);
  spotGeo.scale(1, 0.4, 1);
  for (let i = 0; i < spots; i++) {
    const a = rnd(seed, 10 + i) * Math.PI * 2;
    const el = 0.25 + rnd(seed, 20 + i) * 0.9;
    const s = new THREE.Mesh(spotGeo, spotMat);
    s.position.set(lean + Math.cos(a) * Math.cos(el) * capR, h * 0.78 + Math.sin(el) * capR * 0.62, Math.sin(a) * Math.cos(el) * capR);
    s.lookAt(cap.position);
    s.rotateX(Math.PI / 2);
    g.add(s);
  }
  return g;
}

/** A slender glowing mushroom lamp: tall pale stalk, small conical orange cap with spots. */
function makeMushroomLamp(h: number, seed: number) {
  const g = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.035, h * 0.06, h * 0.85, 12), stalkMat);
  stalk.position.y = h * 0.42;
  g.add(stalk);
  const warm = seed % 2 === 0;
  const glow = new THREE.MeshStandardMaterial({ color: warm ? "#ffb050" : "#fff4ec", emissive: warm ? "#ff8a20" : "#ffe6d8", emissiveIntensity: warm ? 1.6 : 1.1, roughness: 0.5 });
  const capGeo = new THREE.SphereGeometry(h * 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  capGeo.scale(1, 1.25, 1);
  const cap = new THREE.Mesh(capGeo, glow);
  cap.position.y = h * 0.82;
  g.add(cap);
  const spotGeo = new THREE.SphereGeometry(h * 0.025, 8, 6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd(seed, i);
    const el = 0.35 + (i % 2) * 0.4;
    const sp = new THREE.Mesh(spotGeo, spotMat);
    sp.position.set(Math.cos(a) * Math.cos(el) * h * 0.2, h * 0.82 + Math.sin(el) * h * 0.25, Math.sin(a) * Math.cos(el) * h * 0.2);
    g.add(sp);
  }
  return g;
}

const hyacinthPink = new THREE.MeshStandardMaterial({ color: "#ffb0d0", emissive: "#ff70b0", emissiveIntensity: 0.9, roughness: 0.6 });
const hyacinthBlue = new THREE.MeshStandardMaterial({ color: "#a8c8ff", emissive: "#6a9aff", emissiveIntensity: 1.1, roughness: 0.6 });
const hyacinthStem = new THREE.MeshStandardMaterial({ color: "#3a9a4a", roughness: 0.8 });

/** A clump of glowing pink hyacinth spikes. */
function makeHyacinths(h: number, seed: number) {
  const g = new THREE.Group();
  const hyacinthMat = seed % 2 ? hyacinthBlue : hyacinthPink;
  const bud = new THREE.SphereGeometry(h * 0.06, 8, 6);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + seed;
    const x = Math.cos(a) * h * 0.25 * (k ? 1 : 0), z = Math.sin(a) * h * 0.25 * (k ? 1 : 0);
    const hk = h * (0.8 + rnd(seed, k) * 0.4);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.025, h * 0.03, hk * 0.5, 6), hyacinthStem);
    stem.position.set(x, hk * 0.25, z);
    g.add(stem);
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(bud, hyacinthMat);
      const t = i / 18;
      const r = h * 0.1 * (1 - t * 0.6);
      b.position.set(x + Math.cos(i * 2.4) * r, hk * (0.45 + t * 0.5), z + Math.sin(i * 2.4) * r);
      g.add(b);
    }
  }
  return g;
}

/**
 * Shooting stars in the sky beyond the island: each streaks down at a slant for about a second,
 * then waits a few seconds and falls somewhere else. They animate themselves each frame.
 */
function makeShootingStars(count: number) {
  const g = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const tailMat = new THREE.MeshBasicMaterial({ color: "#cfe6ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const headMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    // The cone's wide end is the head; it tapers to nothing along the tail.
    const tailGeo = new THREE.CylinderGeometry(1.8, 0, 1, 10, 1, true);
    tailGeo.translate(0, -0.5, 0);
    const tail = new THREE.Mesh(tailGeo, tailMat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), headMat);
    head.add(tail);
    head.frustumCulled = tail.frustumCulled = false;
    g.add(head);
    let start = performance.now() + 800 + i * 1700;
    let dur = 1000;
    const from = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const pick = () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      from.set((Math.random() - 0.5) * 420, 50 + Math.random() * 90, -150 - Math.random() * 150);
      dir.set(side * (0.6 + Math.random() * 0.5), -0.55 - Math.random() * 0.35, 0.15).normalize();
      dur = 700 + Math.random() * 700;
      tail.quaternion.setFromUnitVectors(up, dir.clone().negate());
    };
    pick();
    head.onBeforeRender = () => {
      const now = performance.now();
      let t = (now - start) / dur;
      if (t > 1) {
        start = now + 1500 + Math.random() * 4500;
        pick();
        t = -1;
      }
      const on = t >= 0 ? Math.sin(Math.min(1, t) * Math.PI) : 0;
      head.position.copy(from).addScaledVector(dir, Math.max(0, t) * 170);
      tail.scale.set(1, 20 + 50 * on, 1);
      tailMat.opacity = 0.9 * on;
      headMat.opacity = on;
    };
  }
  return g;
}

const STAR_COLOURS = ["#ffd27a", "#ff9ad0", "#b8a8ff", "#9ae0ff", "#fff4fa"];

/** A glowing many-pointed star lantern, `r` across. */
function makeStarLantern(colour: string, r: number, seed: number) {
  const mat = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 2.2, roughness: 0.4 });
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.OctahedronGeometry(r), mat);
  const b = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.9), mat);
  b.rotation.set(Math.PI / 4, Math.PI / 4, 0);
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.8), mat);
  c.rotation.set(0, Math.PI / 4, Math.PI / 4);
  g.add(a, b, c);
  g.rotation.y = seed;
  return g;
}

const columnMat = new THREE.MeshStandardMaterial({ color: "#f4d2e2", roughness: 0.55 });
const vineMat = new THREE.MeshStandardMaterial({ color: "#2e5a3a", roughness: 0.8 });

/** A fluted pink marble column wound with a vine, a star lantern on top. */
function makeColumn(h: number, seed: number) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.075, h * 0.085, h * 0.86, 16), columnMat);
  shaft.position.y = h * 0.47;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.13, h * 0.06, 16), columnMat);
  base.position.y = h * 0.03;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.13, h * 0.09, h * 0.06, 16), columnMat);
  top.position.y = h * 0.92;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(new THREE.Vector3(Math.cos(t * 14 + seed) * h * 0.088, h * (0.05 + t * 0.85), Math.sin(t * 14 + seed) * h * 0.088));
  }
  const vine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, h * 0.012, 5), vineMat);
  g.add(shaft, base, top, vine);
  const star = makeStarLantern(STAR_COLOURS[seed % STAR_COLOURS.length]!, h * 0.11, seed);
  star.position.y = h * 1.05;
  g.add(star);
  return shadows(g);
}

const blossomMats = ["#ffb6d2", "#ffc8e0", "#f8a0c8"].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.18, roughness: 0.7 }));

/** A pink blossom tree with a twinkling cloud of glitter in its crown. */
function makeBlossomTree(size: number, seed: number, low = false) {
  const g = new THREE.Group();
  const lean = (rnd(seed, 1) - 0.5) * size * 0.2;
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-lean * 0.4, size * 0.3, 0), new THREE.Vector3(lean, size * 0.6, lean * 0.3)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(trunk, 12, size * 0.06, 8), darkBark));
  const n = 7 + Math.floor(rnd(seed, 2) * 4);
  for (let i = 0; i < n; i++) {
    const r = size * (0.2 + rnd(seed, 10 + i) * 0.12);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), blossomMats[i % blossomMats.length]!);
    const a = (i / n) * Math.PI * 2 + rnd(seed, 30 + i);
    const d = size * (0.12 + rnd(seed, 40 + i) * 0.22);
    m.position.set(lean + Math.cos(a) * d, size * (0.7 + rnd(seed, 20 + i) * 0.3), lean * 0.3 + Math.sin(a) * d);
    g.add(m);
  }
  // Glitter: points scattered over the crown that twinkle.
  const count = low ? 30 : 70;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rnd(seed, 100 + i) * Math.PI * 2, e = rnd(seed, 200 + i) * Math.PI, r = size * (0.3 + rnd(seed, 300 + i) * 0.22);
    pos.set([lean + Math.cos(a) * Math.sin(e) * r, size * 0.82 + Math.cos(e) * r * 0.7, Math.sin(a) * Math.sin(e) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: "#fff4fc", size: Math.max(0.12, size * 0.035), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.onBeforeRender = () => {
    mat.opacity = 0.55 + 0.45 * Math.sin(performance.now() / 260 + seed);
  };
  g.add(pts);
  return shadows(g);
}

const leafBush = new THREE.MeshStandardMaterial({ color: "#2f7a4a", roughness: 0.85 });
const hydrangeaMats = ["#8ab4ff", "#b08aff", "#d89aff", "#7ad0ff"].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.6 }));

/** A leafy bush crowned with glowing hydrangea heads. */
function makeHydrangea(h: number, seed: number) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + seed;
    const m = new THREE.Mesh(new THREE.SphereGeometry(h * 0.38, 16, 12), leafBush);
    m.position.set(Math.cos(a) * h * 0.25, h * 0.35, Math.sin(a) * h * 0.25);
    g.add(m);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd(seed, i);
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.2, 1), hydrangeaMats[(seed + i) % hydrangeaMats.length]!);
    f.position.set(Math.cos(a) * h * 0.32, h * (0.6 + rnd(seed, 10 + i) * 0.2), Math.sin(a) * h * 0.32);
    g.add(f);
  }
  return shadows(g);
}

function makeFlowerbed(seed: number) {
  const g = new THREE.Group();
  const bush = new THREE.MeshStandardMaterial({ color: "#3f9a3a", roughness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.26 + rnd(seed, i) * 0.1, 18, 12), bush);
    s.position.set((rnd(seed, 10 + i) - 0.5) * 0.5, 0.22, (rnd(seed, 20 + i) - 0.5) * 0.5);
    g.add(s);
  }
  const colours = ["#ff5a6a", "#ffb03a", "#ff7ad0", "#fff06a"];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: colours[i % 4], emissive: colours[i % 4], emissiveIntensity: 0.15 }));
    const a = rnd(seed, 30 + i) * Math.PI * 2;
    f.position.set(Math.cos(a) * 0.3, 0.42 + rnd(seed, 40 + i) * 0.1, Math.sin(a) * 0.3);
    g.add(f);
  }
  return shadows(g);
}

const glowLeaf = new THREE.MeshStandardMaterial({ color: "#3a6cff", emissive: "#2a4cd0", emissiveIntensity: 0.55, roughness: 0.7 });
const darkBark = new THREE.MeshStandardMaterial({ color: "#5a3a3a", roughness: 1 });

/** A twisting moonlit tree with a glowing blue crown. */
function makeGlowTree(size: number, seed: number) {
  const g = new THREE.Group();
  const lean = (rnd(seed, 1) - 0.5) * size * 0.3;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-lean * 0.5, size * 0.35, lean * 0.2),
    new THREE.Vector3(lean, size * 0.75, 0),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, size * 0.07, 10), darkBark));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + seed;
    const root = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, size * 0.12, 0),
      new THREE.Vector3(Math.cos(a) * size * 0.12, size * 0.04, Math.sin(a) * size * 0.12),
      new THREE.Vector3(Math.cos(a) * size * 0.24, 0, Math.sin(a) * size * 0.24),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(root, 8, size * 0.03, 6), darkBark));
  }
  const balls = 5 + Math.floor(rnd(seed, 2) * 3);
  for (let i = 0; i < balls; i++) {
    const r = size * (0.2 + rnd(seed, 10 + i) * 0.12);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 14), glowLeaf);
    const a = (i / balls) * Math.PI * 2;
    m.position.set(lean + Math.cos(a) * size * 0.28, size * (0.85 + rnd(seed, 20 + i) * 0.2), Math.sin(a) * size * 0.28);
    g.add(m);
  }
  return shadows(g);
}

/** A smooth wind-worn crag: a noisy squashed sphere. */
function crag(w: number, h: number, d: number, seed: number, color: string) {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.85 + noise3(x * 1.8 + seed, y * 1.8, z * 1.8, seed) * 0.3;
    p.setXYZ(i, x * w * k, Math.max(-0.1, y) * h * k, z * d * k);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
}

/** A rock outcrop with a waterfall spilling off its face into a pool. */
function makeCliffFall(h: number, time: (u: { value: number }) => void) {
  const g = new THREE.Group();
  const parts: [number, number, number, number][] = [[0, 1, 0, 0], [-0.55, 0.75, -0.1, 1], [0.6, 0.8, -0.15, 2], [-0.3, 0.55, 0.25, 3], [0.35, 0.5, 0.3, 4]];
  for (const [x, k, z, i] of parts) {
    const c = crag(h * 0.32 * (0.8 + k * 0.3), h * k, h * 0.28, i * 7 + h, i % 2 ? "#b8b2a6" : "#a8a296");
    c.position.set(x * h * 0.5, 0, z * h * 0.5 - h * 0.1);
    g.add(c);
  }
  const moss = new THREE.MeshStandardMaterial({ color: "#5aa83a", roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(h * 0.08, 16, 10), moss);
    m.scale.y = 0.5;
    m.position.set((i - 1.5) * h * 0.22, h * (0.55 + (i % 2) * 0.35), h * 0.12);
    g.add(m);
  }
  const u = { value: 0 };
  time(u);
  const fall = makeWaterfall(h * 0.26, h * 0.92, u);
  fall.position.set(0, h * 0.94, h * 0.2);
  g.add(fall);
  const pool = new THREE.Group();
  pond(pool, h * 0.32, "#46a8d8");
  pool.position.z = h * 0.45;
  g.add(pool);
  const spray = makeCloud(h * 0.5, "#ffffff", 0.35);
  spray.position.set(0, h * 0.12, h * 0.42);
  g.add(spray);
  return shadows(g);
}

/** A cone volcano with a glowing crater, lava runs and a plume of smoke. */
function makeVolcano(r: number, h: number, time: (u: { value: number }) => void) {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = h * t;
    const rad = r * (1 - t * 0.82) * (1 - 0.15 * Math.sin(t * Math.PI));
    pts.push(new THREE.Vector2(rad, y));
  }
  pts.push(new THREE.Vector2(r * 0.12, h * 0.9));
  const geo = new THREE.LatheGeometry(pts, 72);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col: number[] = [];
  const low = new THREE.Color("#7a4a34"), high = new THREE.Color("#4a3a38");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise3(x * 0.6, y * 0.6, z * 0.6, 4);
    const k = 1 + (n - 0.5) * 0.18;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    const c = low.clone().lerp(high, y / h).multiplyScalar(0.85 + n * 0.3);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  const lava = new THREE.MeshStandardMaterial({ color: "#ff6a1a", emissive: "#ff4a10", emissiveIntensity: 1.6, roughness: 0.5 });
  const crater = new THREE.Mesh(new THREE.CircleGeometry(r * 0.16, 32), lava);
  crater.rotation.x = -Math.PI / 2;
  crater.position.y = h * 0.86;
  g.add(crater);
  for (let k = 0; k < 3; k++) {
    const a = Math.PI * 0.5 + (k - 1) * 0.55;
    const run: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const y = h * (0.86 - t * 0.86);
      const rad = r * (1 - (y / h) * 0.82) * (1 - 0.15 * Math.sin((y / h) * Math.PI)) + 0.15;
      const wob = Math.sin(t * 7 + k) * 0.18;
      run.push(new THREE.Vector3(Math.cos(a + wob) * rad, y + 0.05, Math.sin(a + wob) * rad));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), 40, 0.22 - k * 0.04, 8), lava));
  }
  const light = new THREE.PointLight("#ff6a20", 30, r * 3, 1.6);
  light.position.y = h * 1.05;
  g.add(light);
  for (let i = 0; i < 5; i++) {
    const s = makeCloud(5 + i * 2.2, "#8a8288", 0.55 - i * 0.07);
    s.position.set(i * 0.8, h + 1.5 + i * 2.2, -i * 0.5);
    g.add(s);
  }
  const u = { value: 0 };
  time(u);
  return shadows(g);
}

/** A pool of glowing lava, a little sunken, for the volcano's tiers. */
function lavaPool(g: THREE.Object3D, r: number, _time: (u: { value: number }) => void, seed: number) {
  const shape = blob(r, seed);
  const m = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 1),
    new THREE.MeshStandardMaterial({ color: "#ff7a2a", emissive: "#ff4a10", emissiveIntensity: 1.3, roughness: 0.5 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  g.add(m);
}

/** A soft irregular blob outline, for ponds and pools. */
function blob(r: number, seed: number) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const k = 0.8 + noise3(Math.cos(a) * 1.5, Math.sin(a) * 1.5, seed, 3) * 0.4;
    if (i === 0) s.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
    else s.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  return s;
}

function pond(g: THREE.Object3D, r: number, color: string, glow = false) {
  const m = new THREE.Mesh(
    new THREE.ShapeGeometry(blob(r, r * 7), 1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, emissive: glow ? color : "#000000", emissiveIntensity: glow ? 0.6 : 0 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  g.add(m);
}

function stream(g: THREE.Object3D, r: number, color: string, seed: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8 - 0.5;
    pts.push(new THREE.Vector3(t * r * 1.6, 0.04, Math.sin(t * 5 + seed) * r * 0.2));
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r * 0.08, 8);
  tube.scale(1, 0.08, 1);
  g.add(new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color, roughness: 0.1 })));
}

function bushes(g: THREE.Object3D, r: number, color: string, seed: number) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  for (let i = 0; i < 5; i++) {
    const a = rnd(seed, i) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rnd(seed, 10 + i) * 0.3, 18, 12), mat);
    s.position.set(Math.cos(a) * r * 0.6, 0.25, Math.sin(a) * r * 0.5);
    s.scale.y = 0.7;
    s.castShadow = true;
    g.add(s);
  }
}

// ------------------------------------------------------------------ ambient particles

const AMB_VS = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uSize;
uniform float uFall;
uniform float uHeight;
uniform float uWander;
uniform float uBlink;
varying float vA;
void main() {
  vec3 p = position;
  float t = uTime + aSeed.x * 100.0;
  // Fall (or rise, if negative) and wrap within the height band.
  p.y = mod(p.y - uFall * uTime, uHeight);
  p.x += sin(t * 0.7 + aSeed.y * 6.0) * uWander;
  p.z += cos(t * 0.5 + aSeed.z * 6.0) * uWander;
  float edge = smoothstep(0.0, 0.15, p.y / uHeight) * smoothstep(1.0, 0.8, p.y / uHeight);
  vA = edge * mix(1.0, 0.5 + 0.5 * sin(t * 3.0), uBlink);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aSeed.y * 0.8) * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const AMB_FS = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(mix(uColor, uColor2, gl_PointCoord.y), a * vA);
}`;

/** Drifting particles over the whole island: snow, embers, fireflies, petals and so on. */
export function ambientParticles(kind: Particles, radius: number, low: boolean, time: (u: { value: number }) => void) {
  if (!kind) return null;
  const spec = {
    pollen: { n: 120, c: "#fff2a0", c2: "#ffe070", size: 0.12, fall: 0.05, h: 6, wander: 0.8, blink: 0.3, add: true },
    embers: { n: 260, c: "#ffb050", c2: "#ff5020", size: 0.16, fall: -0.9, h: 14, wander: 0.6, blink: 0.5, add: true },
    sparkles: { n: 200, c: "#ffd0ff", c2: "#ffffff", size: 0.14, fall: -0.15, h: 8, wander: 0.3, blink: 1, add: true },
    mist: { n: 90, c: "#cfe2ff", c2: "#ffffff", size: 1.6, fall: 0.03, h: 3, wander: 1.5, blink: 0, add: false },
    petals: { n: 160, c: "#ff8ab8", c2: "#ffb0c8", size: 0.22, fall: 0.6, h: 12, wander: 1.2, blink: 0, add: false },
    fireflies: { n: 160, c: "#fff27a", c2: "#ff9ad8", size: 0.18, fall: -0.05, h: 5, wander: 1.4, blink: 1, add: true },
    snow: { n: 300, c: "#ffffff", c2: "#e8f4ff", size: 0.13, fall: 1.1, h: 16, wander: 0.5, blink: 0, add: false },
  }[kind];
  const n = Math.round(spec.n * (low ? 0.5 : 1));
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    pos.set([Math.cos(a) * r, Math.random() * spec.h, Math.sin(a) * r], i * 3);
    seed.set([Math.random(), Math.random(), Math.random()], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
  const u = { value: 0 };
  time(u);
  const m = new THREE.ShaderMaterial({
    vertexShader: AMB_VS,
    fragmentShader: AMB_FS,
    uniforms: {
      uTime: u,
      uSize: { value: spec.size },
      uFall: { value: spec.fall },
      uHeight: { value: spec.h },
      uWander: { value: spec.wander },
      uBlink: { value: spec.blink },
      uColor: { value: new THREE.Color(spec.c) },
      uColor2: { value: new THREE.Color(spec.c2) },
    },
    transparent: true,
    depthWrite: false,
    blending: spec.add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  return pts;
}
