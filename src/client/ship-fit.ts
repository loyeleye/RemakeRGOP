// Run 10, the ship home: the things the ship and the cloud sea are dressed with. The ship is its
// owner's: old and immaculate, narrow, dark oiled wood, scrubbed planks, polished brass, nothing
// loose, no sail, no name, no flag. The one thing on it that does not belong is a coil of new pale
// rope with two iron blocks. And the islands he passes, asleep, each over a pool of its heart's
// colour. Story notes: project files story/run10-backdrop.md. All still block-outs, only finer.
// World units are tiles; the bow is north (-z).

import * as THREE from "three";
import { SHIP_DECK } from "../engine/shiphome.js";

type Glow = (color: string, size: number, opacity?: number) => THREE.Sprite;
type Std = (color: string, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;

/** The ship's colours, in one place. */
export const SHIP_WOOD = {
  hull: "#2b1e16",
  rail: "#38271b",
  board: "#9b866a",
  hatch: "#7f6c54",
  brass: "#d9ad55",
  iron: "#2e3138",
  rope: "#75644a",
  newRope: "#f1e7cb",
  coat: "#41454d",
  hair: "#7a5033",
  skin: "#c8a48b",
  glove: "#ece6d8",
} as const;

/** A number from 0 to 1 that is the same every time for the same seed. */
function dice(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 48271) % 2147483647), (s & 0xffff) / 0xffff);
}

/** One board's grain: streaks along its length and a dark seam down each edge. */
export function plankTexture() {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 256;
  const g = c.getContext("2d")!, rnd = dice(7);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 32, 256);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 32, y = rnd() * 256, len = 30 + rnd() * 120;
    g.fillStyle = `rgba(${rnd() < 0.5 ? "60,40,20" : "255,250,235"},${0.05 + rnd() * 0.09})`;
    g.fillRect(x, y, 1 + rnd() * 1.5, len);
  }
  g.fillStyle = "rgba(25,14,8,0.85)";
  g.fillRect(0, 0, 1.6, 256);
  g.fillRect(30.4, 0, 1.6, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A round bar from one point to another. */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, r2 = r) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The brass everything on the ship is trimmed with: it has to catch the lamp without a sky to mirror. */
export const brassOf = (std: Std) => std(SHIP_WOOD.brass, { roughness: 0.35, metalness: 0.25, emissive: "#5a3c0c", emissiveIntensity: 0.45 });

/**
 * The deck's planking: long boards laid bow to stern, half a tile wide, their butts staggered, each
 * a shade off its neighbours. `map` is one board's grain.
 */
export function buildBoards(std: Std, map: THREE.Texture) {
  const hw = SHIP_DECK.hw + 0.5, hl = SHIP_DECK.hl + 0.5, wide = 0.5, long = 6;
  const spots: [number, number, number][] = [];
  for (let col = 0; col < Math.round((hw * 2) / wide); col++) {
    const x = -hw + wide * (col + 0.5);
    let z = -hl - ((col * 2.3) % long);
    while (z < hl) {
      const a = Math.max(z, -hl), b = Math.min(z + long, hl);
      if (b - a > 0.05) spots.push([x, (a + b) / 2, b - a]);
      z += long;
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), std(SHIP_WOOD.board, { map, roughness: 0.82 }), spots.length);
  const m = new THREE.Matrix4(), tint = new THREE.Color(), rnd = dice(3);
  spots.forEach(([x, z, len], i) => {
    m.makeScale(wide - 0.015, 1, len - 0.03).setPosition(x, 0.03, z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, tint.setScalar(0.86 + rnd() * 0.2));
  });
  mesh.receiveShadow = true;
  return mesh;
}

/** A rope coiled flat on the deck: rings one inside the other, `layers` high. */
function coil(mat: THREE.Material, radius: number, layers = 1, thick = 0.07) {
  const g = new THREE.Group();
  for (let k = 0; k < layers; k++) {
    for (let r = radius - k * 0.12; r > 0.14; r -= thick * 2.1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 6, 22).rotateX(Math.PI / 2), mat);
      ring.position.y = thick + k * thick * 1.7;
      g.add(ring);
    }
  }
  return g;
}

/** An iron pulley block lying on its cheek. */
function block(std: Std) {
  const iron = std(SHIP_WOOD.iron, { roughness: 0.55, metalness: 0.4 }), g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.62), iron);
  shell.position.y = 0.1;
  const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 12), std("#565b66", { roughness: 0.4, metalness: 0.5 }));
  sheave.position.y = 0.1;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 12).rotateX(Math.PI / 2), iron);
  eye.position.set(0, 0.1, -0.4);
  g.add(shell, sheave, eye);
  return g;
}

/**
 * What lies on the deck: a closed hatch forward, cleats inside the bulwarks, two old ropes coiled
 * flat, the tiller lashed with one knot, and by the stern the coil of new pale rope, part used,
 * with its two blocks. All of it is flat enough to walk over; none of it is in the way of play.
 */
export function buildFittings(std: Std, map: THREE.Texture) {
  const g = new THREE.Group(), hw = SHIP_DECK.hw + 0.5, hl = SHIP_DECK.hl + 0.5;
  const brass = brassOf(std), dark = std(SHIP_WOOD.rail), oldRope = std(SHIP_WOOD.rope, { roughness: 1 }), newRope = std(SHIP_WOOD.newRope, { roughness: 0.9, emissive: "#3a3524", emissiveIntensity: 0.35 });

  // The hatch: a coaming, a cover of five boards, a brass ring let into it, a strap at each corner.
  const hatch = new THREE.Group();
  const coaming = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 2.2), dark);
  coaming.position.y = 0.11;
  hatch.add(coaming);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 1.86), std(SHIP_WOOD.hatch, { map, roughness: 0.8 }));
    b.position.set(-1.16 + i * 0.58, 0.18, 0);
    hatch.add(b);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 16).rotateX(Math.PI / 2), brass);
  ring.position.set(0, 0.23, 0.55);
  hatch.add(ring);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.12), brass);
    strap.position.set(sx * 1.25, 0.22, sz * 0.78);
    hatch.add(strap);
  }
  hatch.position.set(0, 0, -7.5);
  g.add(hatch);

  // Cleats, inside the bulwark on both sides.
  for (const sx of [-1, 1]) for (const z of [-9.5, -3.5, 3.5, 9.5]) {
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.62), brass);
    horn.position.set(sx * (hw - 0.32), 0.34, z);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.2), brass);
    foot.position.set(sx * (hw - 0.32), 0.2, z);
    g.add(horn, foot);
  }

  // Two old ropes, coiled flat where they belong.
  const a = coil(oldRope, 0.62);
  a.position.set(hw - 1.1, 0.08, -hl + 1.0);
  const b = coil(oldRope, 0.62);
  b.position.set(hw - 1.1, 0.08, hl - 1.1);
  g.add(a, b);

  // The new rope: a big pale coil, part of it gone, an end run off toward the rail, and its two blocks.
  const pale = coil(newRope, 1.05, 2, 0.085);
  pale.position.set(-hw + 2.0, 0.08, hl - 1.5);
  const end = bar(v(-hw + 1.2, 0.17, hl - 2.3), v(-hw + 0.5, 0.17, hl - 4.1), 0.08, newRope);
  const b1 = block(std), b2 = block(std);
  b1.position.set(-hw + 0.8, 0.08, hl - 4.6);
  b1.rotation.y = 0.35;
  b2.position.set(-hw + 3.6, 0.08, hl - 0.9);
  b2.rotation.y = -1.1;
  g.add(pale, end, b1, b2);

  // The tiller, behind the man at the stern: lashed to the rail with one neat knot, and nobody's hand on it.
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.0, 10), dark);
  head.position.set(0, 0.55, hl + 0.55);
  const arm = bar(v(0, 1.0, hl + 0.6), v(0, 1.08, hl - 0.75), 0.1, dark, 0.06);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), brass);
  tip.position.set(0, 1.09, hl - 0.8);
  const lash = bar(v(0, 1.06, hl - 0.55), v(1.7, 0.98, hl + 0.35), 0.035, oldRope);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), oldRope);
  knot.position.set(0, 1.07, hl - 0.55);
  g.add(head, arm, tip, lash, knot);

  g.traverse((o) => (o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)));
  return g;
}

/**
 * The rails: a dark bulwark, turned posts with a brass cap on each, and a polished rail on top,
 * along a line of points.
 */
export function buildRail(std: Std, pts: [number, number][]) {
  const g = new THREE.Group(), dark = std(SHIP_WOOD.hull), cap = std(SHIP_WOOD.rail, { roughness: 0.45 }), brass = brassOf(std);
  const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.62, 8), knobGeo = new THREE.SphereGeometry(0.085, 8, 6);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    for (const [h, y, w, mat] of [[0.4, 0.26, 0.2, dark], [0.09, 1.0, 0.2, cap], [0.03, 1.06, 0.07, brass]] as const) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, len + 0.1), mat);
      piece.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      piece.rotation.y = ang;
      piece.castShadow = true;
      g.add(piece);
    }
    const n = Math.max(1, Math.round(len / 1.25));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
      const post = new THREE.Mesh(postGeo, cap);
      post.position.set(x, 0.72, z);
      g.add(post);
      // Every fourth post stands proud of the rail with a brass cap.
      if (k % 4 === 0) {
        const knob = new THREE.Mesh(knobGeo, brass);
        knob.position.set(x, 1.14, z);
        g.add(knob);
      }
    }
  }
  return g;
}

/**
 * The ship's lamp amidships: a plain lamp on a brass standard, in a brass cage. `glass` is the
 * part that burns. Its bars throw bars of shadow across the deck (see `buildBars`).
 */
export function buildLamp(std: Std, glass: THREE.Material, y: number) {
  const g = new THREE.Group(), brass = brassOf(std), dark = std(SHIP_WOOD.rail);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 2.5), dark);
  plinth.position.y = 0.3;
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), std("#4a3626"));
  step.position.y = 0.7;
  g.add(plinth, step);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.54, 0.16), brass);
    band.position.set(sx * 1.2, 0.3, sz * 1.2);
    g.add(band);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, y - 1.25, 10), brass);
  post.position.y = 0.85 + (y - 1.25) / 2;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.14, 12), brass);
  collar.position.y = y - 0.46;
  const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.72, 12), glass);
  flame.position.y = y;
  g.add(post, collar, flame);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.86, 6), brass);
    rod.position.set(Math.cos(a) * 0.36, y, Math.sin(a) * 0.36);
    g.add(rod);
  }
  for (const dy of [-0.4, 0.4]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 6, 20).rotateX(Math.PI / 2), brass);
    hoop.position.y = y + dy;
    g.add(hoop);
  }
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.3, 12), brass);
  hood.position.y = y + 0.58;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 6, 12), brass);
  loop.position.y = y + 0.8;
  g.add(hood, loop);
  g.traverse((o) => (o as THREE.Mesh).isMesh && o !== flame && ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** The light the caged lamp throws on the planks: warm, falling off, and barred by the cage's eight rods. `uLit` is how brightly it burns. */
export function buildBars(color: string) {
  const u = { uLit: { value: 1 }, uCol: { value: new THREE.Color(color) }, uHalf: { value: new THREE.Vector2(SHIP_DECK.hw + 0.5, SHIP_DECK.hl + 0.5) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vP;
      uniform float uLit;
      uniform vec3 uCol;
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x);
        // Eight rods, eight thin shadows that widen as they go.
        float rod = abs(sin(a * 4.0 + 1.5708));
        float lit = smoothstep(0.10, 0.30, rod);
        float fall = exp(-r * r / 46.0) * smoothstep(1.3, 2.4, r);
        gl_FragColor = vec4(uCol * fall * (0.25 + 0.75 * lit) * 0.42 * uLit, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((SHIP_DECK.hw + 0.5) * 2, (SHIP_DECK.hl + 0.5) * 2).rotateX(-Math.PI / 2), mat);
  mesh.position.y = 0.115;
  mesh.renderOrder = 3;
  return { mesh, u };
}

/**
 * The man at the stern, seen from behind and never from in front: slim and upright, brown hair, a
 * clean charcoal coat, pale gloves, his hands folded behind his back, and at his hip a fine
 * lantern that is not lit. He faces the bow and does not move.
 */
export function buildFixer(std: Std) {
  const g = new THREE.Group();
  const coat = std(SHIP_WOOD.coat, { roughness: 0.95 }), darker = std("#1c1e23", { roughness: 0.9 }), glove = std(SHIP_WOOD.glove, { roughness: 0.8, emissive: "#3a382f", emissiveIntensity: 0.3 });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.9, 8), darker);
    leg.position.set(sx * 0.105, 0.47, 0);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.3), std("#101114", { roughness: 0.3 }));
    shoe.position.set(sx * 0.105, 0.04, -0.05);
    g.add(leg, shoe);
  }
  // The coat: narrow at the shoulder, a little fuller to the knee, with a vent down the back.
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 14), coat);
  skirt.scale.z = 0.72;
  skirt.position.y = 0.98;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.2, 0.62, 14), coat);
  chest.scale.z = 0.68;
  chest.position.y = 1.66;
  const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 8), coat);
  yoke.scale.set(1.12, 0.36, 0.7);
  yoke.position.y = 1.97;
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), darker);
  vent.position.set(0, 0.86, 0.2);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.2, 10), darker);
  neck.position.y = 2.07;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), std(SHIP_WOOD.skin));
  head.position.y = 2.27;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), std(SHIP_WOOD.hair, { roughness: 0.75 }));
  hair.scale.set(1, 0.95, 1.02);
  hair.position.set(0, 2.3, 0.03);
  g.add(skirt, chest, yoke, vent, neck, head, hair);
  // His arms go down and back, and his gloved hands lie one in the other at the small of his back.
  for (const sx of [-1, 1]) {
    const shoulder = v(sx * 0.25, 1.9, 0), elbow = v(sx * 0.3, 1.5, 0.1), wrist = v(sx * 0.06, 1.3, 0.2);
    g.add(bar(shoulder, elbow, 0.07, coat, 0.08), bar(elbow, wrist, 0.06, coat, 0.07));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glove);
    hand.scale.set(1.1, 0.9, 0.9);
    hand.position.set(sx * 0.035, 1.28, 0.23);
    g.add(hand);
  }
  // The lantern at his hip: fine work, brass and dark glass, and no light in it.
  const fine = std("#8f7436", { roughness: 0.4, metalness: 0.3 }), glassOff = std("#1b2028", { roughness: 0.2 });
  const lan = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 8), glassOff);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 8), fine);
  top.position.y = 0.13;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 8), fine);
  base.position.y = -0.1;
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), fine);
  bail.position.y = 0.2;
  lan.add(body, top, base, bail);
  lan.position.set(-0.33, 1.05, 0.02);
  g.add(lan);
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** One island he passes: how wide it is, its heart's colour, how many doors have a lamp, and whether it is Kite Fell (vanes, and no lamp, because Kes is not home). */
export interface IslandSpec {
  r: number;
  heart: string;
  lamps: number;
  kite?: boolean;
  seed: number;
}

/**
 * A small sleeping island, seen from above: land, a few roofs with every window dark, paths
 * between them, a tree or two, and a lamp left burning at a door. Its origin is its middle, at
 * the height of the deck; the rest of it goes down into the cloud.
 */
export function buildIsland(std: Std, glow: Glow, spec: IslandSpec) {
  const g = new THREE.Group(), rnd = dice(spec.seed), R = spec.r;
  // The land: an uneven round, greener on top than at the edge.
  const sides = 11, geo = new THREE.CylinderGeometry(R, R * 0.45, 3.6, sides, 1);
  const pos = geo.attributes.position!;
  const lump = Array.from({ length: sides }, () => 0.82 + rnd() * 0.3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) < 0.01) continue;
    const k = lump[Math.round(((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1) * sides) % sides]!;
    pos.setX(i, x * k);
    pos.setZ(i, z * k * 0.86);
  }
  geo.computeVertexNormals();
  // Its heart is underneath and lights it a little from below, so that at night it is land and not a dark shape on the cloud.
  const lift = { emissive: spec.heart, emissiveIntensity: 0.07 };
  const land = new THREE.Mesh(geo, std("#4a5d49", { roughness: 1, flatShading: true, ...lift }));
  land.position.y = 0.7 - 1.8;
  g.add(land);
  const green = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.72, R * 0.72, 0.08, sides), std("#5b7355", { roughness: 1, ...lift }));
  green.scale.z = 0.86;
  green.position.y = 0.73;
  g.add(green);
  const top = 0.75;
  // Houses, round the middle, each turned its own way; no window lit.
  const slate = std("#3d4250", { emissive: "#3d4250", emissiveIntensity: 0.25 }), pane = std("#15171c"), path = std("#958b76", { roughness: 1, emissive: "#958b76", emissiveIntensity: 0.3 });
  const n = spec.kite ? 3 : 3 + Math.floor(rnd() * 3);
  const doors: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.8, d = R * (0.3 + rnd() * 0.22);
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.86, w = 1.25 + rnd() * 0.5, tall = 1.0 + rnd() * 0.5;
    const h = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, tall, w * 0.85), std(["#8f8a80", "#86837b", "#968c7c"][i % 3]!, { emissive: "#8f8a80", emissiveIntensity: 0.22 }));
    walls.position.y = tall / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, 0.85, 4), slate);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = tall + 0.42;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), pane);
    win.position.set(0.25, tall * 0.58, w * 0.425 + 0.02);
    h.add(walls, roof, win);
    h.position.set(x, top, z);
    h.rotation.y = rnd() * 0.9 - 0.45;
    g.add(h);
    doors.push(v(x - 0.3, top, z + w * 0.5 + 0.25));
    // A path from the door to the middle.
    const strip = bar(v(x, top + 0.02, z + w * 0.45), v(0, top + 0.02, 0), 0.16, path);
    strip.scale.z = 0.12;
    g.add(strip);
  }
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, d = R * (0.5 + rnd() * 0.2);
    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.42 + rnd() * 0.2, 1.3 + rnd() * 0.5, 7), std("#324a37", { roughness: 1 }));
    tree.position.set(Math.cos(a) * d, top + 0.7, Math.sin(a) * d * 0.86);
    g.add(tree);
  }
  if (spec.kite) {
    // Kite Fell: its vanes on their poles, and nothing lit.
    const pole = std("#6b5a48"), cloth = ["#b5524a", "#4a78b5", "#d0b060"];
    const kite = new THREE.Shape();
    kite.moveTo(0, 0.75);
    kite.lineTo(0.5, 0.15);
    kite.lineTo(0, -0.75);
    kite.lineTo(-0.5, 0.15);
    kite.closePath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.6, d = R * 0.52, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.86, tall = 3.0 + i * 0.4;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, tall, 6), pole);
      p.position.set(x, top + tall / 2, z);
      const vane = new THREE.Mesh(new THREE.ShapeGeometry(kite), new THREE.MeshStandardMaterial({ color: cloth[i]!, roughness: 0.9, side: THREE.DoubleSide, emissive: cloth[i]!, emissiveIntensity: 0.45 }));
      vane.position.set(x + 0.2, top + tall + 0.1, z + 0.35);
      vane.rotation.set(-1.15, 0.3 + i * 0.5, 0.2);
      const tail = bar(v(x + 0.2, top + tall - 0.1, z + 0.9), v(x + 0.5, top + tall - 0.5, z + 2.1), 0.03, new THREE.MeshStandardMaterial({ color: cloth[i]!, roughness: 0.9, emissive: cloth[i]!, emissiveIntensity: 0.45 }));
      g.add(p, vane, tail);
    }
  } else {
    for (let i = 0; i < Math.min(spec.lamps, doors.length); i++) {
      const lit = glow("#ffd9a0", 1.5, 0.6), core = glow("#fff3d6", 0.4, 0.95);
      lit.position.copy(doors[i]!).setY(top + 0.9);
      core.position.copy(lit.position);
      lit.renderOrder = core.renderOrder = 6;
      g.add(lit, core);
    }
  }
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return g;
}
