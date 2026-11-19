// Sky-island pieces: smooth, rounded floating islands with a grassy lip and a tapering rocky
// underside, stylised trees, waterfalls and cloud puffs. All smooth-shaded, high enough in
// segments that nothing reads as faceted.

import * as THREE from "three";

// ------------------------------------------------------------------ noise

function hash3(x: number, y: number, z: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x: number, y: number, z: number, seed: number) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    v += a * noise3(x * f, y * f, z * f, seed + i * 7);
    f *= 2.1;
    a *= 0.5;
  }
  return v;
}

// ------------------------------------------------------------------ island

export interface IslandOptions {
  /** Half-size of the flat top along x and z (before lobes). */
  rx: number;
  rz: number;
  /** How far the underside hangs below the top. */
  depth: number;
  /** 2 = ellipse, higher = squarer. */
  squareness: number;
  seed: number;
  /** Ring segments around, and rings in the long taper. */
  segments?: number;
  rings?: number;
  /** Radius at angle a; replaces the superellipse (rx, rz, squareness) when given. */
  radius?: (a: number) => number;
  /** How far headlands push out past the base outline (0 = none, 0.5 = up to half again). */
  lobes?: number;
  /** Drop a terrace: a grassy shelf this far below the top, stepping out from the cliff. */
  ledge?: number;
  /** Extra rock spires hanging under the island, so the underside isn't one neat cone. */
  spires?: number;
  grass?: string;
  soil?: string;
  rock?: string;
  /** Skip the grassy top (the main plaza draws its own floor). */
  noTop?: boolean;
}

/** Point on a superellipse of radii (rx, rz) at angle a. */
function superellipse(a: number, rx: number, rz: number, n: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return {
    x: rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
    z: rz * Math.sign(s) * Math.pow(Math.abs(s), 2 / n),
  };
}

/**
 * The island's outline at angle a: the base superellipse pushed out into headlands and bays.
 * Lobes only ever push outward, so whatever sits inside the base outline stays on the island.
 */
function outline(o: IslandOptions, a: number) {
  const p = o.radius ? { x: Math.cos(a) * o.radius(a), z: Math.sin(a) * o.radius(a) } : superellipse(a, o.rx, o.rz, o.squareness);
  const lobes = o.lobes ?? 0;
  if (!lobes) return p;
  const n = fbm(Math.cos(a) * 1.4 + 3, 0.5, Math.sin(a) * 1.4 + 3, o.seed + 41);
  const n2 = noise3(Math.cos(a) * 3.2, 1.5, Math.sin(a) * 3.2, o.seed + 43);
  const k = 1 + lobes * Math.min(1, Math.max(0, (n - 0.38) / 0.3)) + lobes * 0.25 * n2;
  return { x: p.x * k, z: p.z * k };
}

interface ProfilePt {
  y: number;
  s: number;
  /** 0 grass, 1 soil, 2 rock: blended for vertex colour. */
  kind: number;
  /** 0 at the top, 1 at the tip: how much wind-worn noise to apply. */
  wear: number;
}

/** The side profile from the top edge to the tip: a rounded lip, a cliff, maybe a grassy shelf, then the long taper. */
function profile(o: IslandOptions): ProfilePt[] {
  const out: ProfilePt[] = [];
  const RINGS = o.rings ?? 40;
  // Rounded grassy lip.
  for (let i = 0; i <= 5; i++) {
    const u = i / 5;
    out.push({ y: -0.35 * (1 - Math.cos(u * Math.PI * 0.5)), s: 0.94 + 0.06 * Math.sin(u * Math.PI * 0.5), kind: 0, wear: 0 });
  }
  let y = -0.35;
  if (o.ledge) {
    // A sheer cliff down to the shelf, the shelf rolling out, then another short cliff.
    const L = o.ledge;
    for (let i = 1; i <= 6; i++) {
      const u = i / 6;
      out.push({ y: y - u * L, s: 1 - 0.04 * Math.sin(u * Math.PI), kind: Math.min(2, u * 3), wear: 0.15 });
    }
    y -= L;
    for (let i = 1; i <= 6; i++) {
      const u = i / 6;
      out.push({ y: y - 0.25 * Math.sin(u * Math.PI * 0.5), s: 1 + 0.16 * Math.sin(u * Math.PI * 0.5), kind: 0, wear: 0.1 });
    }
    y -= 0.25;
    for (let i = 1; i <= 4; i++) {
      const u = i / 4;
      out.push({ y: y - 0.3 * Math.sin(u * Math.PI * 0.5), s: 1.16 + 0.02 * Math.sin(u * Math.PI), kind: 0, wear: 0.1 });
    }
    y -= 0.3;
    const top = 1.16;
    const rest = o.depth - (0.35 + L + 0.55);
    for (let i = 1; i <= RINGS; i++) {
      const t = i / RINGS;
      const s = top * (t < 0.06 ? 1 - 0.1 * (t / 0.06) : 0.9 * Math.pow(1 - (t - 0.06) / 0.94, 0.8));
      out.push({ y: y - t * rest, s: Math.max(0.0001, s), kind: t < 0.05 ? 1 + t / 0.05 : 2, wear: 0.2 + t * 0.8 });
    }
    return out;
  }
  const rest = o.depth - 0.35;
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS;
    const bulge = 1 + 0.05 * Math.sin(Math.min(1, t / 0.08) * Math.PI);
    const taper = t < 0.05 ? 1 : Math.pow(1 - (t - 0.05) / 0.95, 0.85);
    out.push({ y: y - t * rest, s: Math.max(0.0001, bulge * taper), kind: t < 0.12 ? (t / 0.12) * 2 : 2, wear: Math.min(1, t * 1.5) });
  }
  return out;
}

/**
 * A floating island. The top is flat at y=0; a soft grassy lip rolls over the edge, then a
 * cliff (and, if asked, a grassy terrace), then earth and stone taper down to a ragged point,
 * with extra spires hanging beneath so it looks torn out of the ground rather than lathed.
 */
export function makeIsland(o: IslandOptions): THREE.Group {
  const group = new THREE.Group();
  const SEG = o.segments ?? 96;
  const grass = new THREE.Color(o.grass ?? "#5f8f4a");
  const soil = new THREE.Color(o.soil ?? "#7a5a40");
  const rock = new THREE.Color(o.rock ?? "#8a7a6a");
  const deep = new THREE.Color("#3a3444");
  const prof = profile(o);
  const RINGS = prof.length - 1;
  const ring = Array.from({ length: SEG + 1 }, (_, s) => outline(o, (s / SEG) * Math.PI * 2));

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const { y, s: scale, kind, wear } = prof[r]!;
    const depthT = Math.min(1, -y / o.depth);
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const p = ring[s]!;
      // Wind-worn bumps, stronger lower down; vertical streaks for crags.
      const n = fbm(Math.cos(a) * 2.2, y * 0.18, Math.sin(a) * 2.2, o.seed);
      const streak = noise3(Math.cos(a) * 11, y * 0.05, Math.sin(a) * 11, o.seed + 3);
      const k = scale * (1 + (n - 0.5) * 0.5 * wear + (streak - 0.5) * 0.12 * wear);
      pos.push(p.x * k, y + (n - 0.5) * 0.9 * wear * depthT, p.z * k);
      // Colour: grass, soil, rock in horizontal strata, darkening toward the tip.
      const c = new THREE.Color();
      if (kind <= 1) c.copy(grass).lerp(soil, smooth(kind));
      else c.copy(soil).lerp(rock, smooth(Math.min(1, kind - 1)));
      const strata = 0.5 + 0.5 * Math.sin(y * 2.3 + n * 4);
      if (kind > 1.5) c.lerp(soil, strata * 0.25);
      c.lerp(deep, smooth(Math.max(0, (depthT - 0.35) / 0.65)) * 0.7);
      c.multiplyScalar(0.82 + streak * 0.32);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = SEG + 1;
  for (let r = 0; r < RINGS; r++)
    for (let s = 0; s < SEG; s++) {
      const a = r * row + s, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  stitchSeam(geo, RINGS, SEG);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const under = new THREE.Mesh(geo, mat);
  under.castShadow = true;
  under.receiveShadow = true;
  group.add(under);

  // Hanging spires: smaller ragged cones tucked under the body, poking out at odd angles.
  const spires = o.spires ?? 0;
  const span = ring.reduce((m, p) => m + Math.hypot(p.x, p.z), 0) / ring.length;
  const sx = o.radius ? span : o.rx, sz = o.radius ? span : o.rz;
  for (let i = 0; i < spires; i++) {
    const rnd = (k: number) => hash3(o.seed, i, k, 77);
    const a = rnd(1) * Math.PI * 2;
    const d = 0.25 + rnd(2) * 0.4;
    const r = Math.min(sx, sz) * (0.18 + rnd(3) * 0.2);
    const spire = makeIsland({
      rx: r,
      rz: r * (0.7 + rnd(4) * 0.5),
      depth: o.depth * (0.45 + rnd(5) * 0.45),
      squareness: 2,
      seed: o.seed * 31 + i,
      segments: 32,
      rings: 18,
      grass: o.rock ?? "#8a7a6a",
      soil: o.rock ?? "#8a7a6a",
      rock: o.rock,
      noTop: true,
    });
    const top = -(0.2 + d * 0.5) * o.depth * 0.45;
    spire.position.set(Math.cos(a) * sx * d, top, Math.sin(a) * sz * d);
    spire.rotation.set((rnd(6) - 0.5) * 0.25, rnd(7) * 6, (rnd(8) - 0.5) * 0.25);
    group.add(spire);
  }

  if (!o.noTop) {
    const shape = new THREE.Shape();
    for (let s = 0; s <= SEG; s++) {
      const p = ring[s]!;
      if (s === 0) shape.moveTo(p.x * 0.95, -p.z * 0.95);
      else shape.lineTo(p.x * 0.95, -p.z * 0.95);
    }
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshStandardMaterial({ color: grass, map: grassTexture(), roughness: 1 }));
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    group.add(top);
  }
  group.userData.outline = (a: number) => outline(o, a);
  return group;
}

let GRASS: THREE.Texture | null = null;

/** A soft mottled meadow texture (light and dark patches, tiny flecks), tinted by the material colour. */
function grassTexture() {
  if (GRASS) return GRASS;
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // Tileable: sample noise on a torus.
      const u = (x / N) * Math.PI * 2, v = (y / N) * Math.PI * 2;
      const big = fbm(Math.cos(u) * 1.2, Math.sin(u) * 1.2 + Math.cos(v) * 1.2, Math.sin(v) * 1.2, 5);
      const fine = noise3(Math.cos(u) * 9, Math.sin(u) * 9 + Math.cos(v) * 9, Math.sin(v) * 9, 9);
      const k = 0.72 + big * 0.5 + (fine - 0.5) * 0.18;
      const warm = big > 0.55 ? (big - 0.55) * 0.6 : 0;
      const i = (y * N + x) * 4;
      img.data[i] = Math.min(255, 255 * k * (1 + warm));
      img.data[i + 1] = Math.min(255, 255 * k);
      img.data[i + 2] = Math.min(255, 255 * k * (1 - warm));
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  GRASS = new THREE.CanvasTexture(c);
  GRASS.wrapS = GRASS.wrapT = THREE.RepeatWrapping;
  GRASS.repeat.set(1 / 9, 1 / 9);
  GRASS.colorSpace = THREE.SRGBColorSpace;
  return GRASS;
}

/** Average the normals on the duplicated seam column so the island has no visible crease. */
function stitchSeam(geo: THREE.BufferGeometry, rings: number, seg: number) {
  const n = geo.getAttribute("normal") as THREE.BufferAttribute;
  const row = seg + 1;
  for (let r = 0; r <= rings; r++) {
    const a = r * row, b = r * row + seg;
    const v = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

// ------------------------------------------------------------------ trees

const leafMats = ["#7fb35a", "#9cc46a", "#d8a0c8", "#f2c46a"].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }),
);
const trunkMat = new THREE.MeshStandardMaterial({ color: "#6a4a3a", roughness: 1 });

/** A soft, rounded storybook tree: a curved trunk and a cluster of smooth canopy balls. */
export function makeTree(size: number, seed: number) {
  const g = new THREE.Group();
  const rnd = (k: number) => hash3(seed, k, 3, 11);
  const lean = (rnd(1) - 0.5) * 0.5;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.3, size * 0.45, 0),
    new THREE.Vector3(lean, size * 0.9, lean * 0.3),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, size * 0.07, 10), trunkMat);
  trunk.castShadow = true;
  g.add(trunk);
  const mat = leafMats[Math.floor(rnd(2) * leafMats.length)]!;
  const balls = 3 + Math.floor(rnd(3) * 3);
  for (let i = 0; i < balls; i++) {
    const r = size * (0.32 + rnd(10 + i) * 0.18);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
    const a = (i / balls) * Math.PI * 2 + rnd(20 + i);
    m.position.set(lean + Math.cos(a) * size * 0.25, size * (0.95 + rnd(30 + i) * 0.25), lean * 0.3 + Math.sin(a) * size * 0.25);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------ waterfalls

const FALL_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FS = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float streaks = noise(vec2(vUv.x * 14.0, vUv.y * 3.0 + uTime * 2.2)) * 0.6 + noise(vec2(vUv.x * 30.0, vUv.y * 6.0 + uTime * 3.1)) * 0.4;
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
  float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  vec3 col = mix(vec3(0.55, 0.8, 0.95), vec3(1.0), streaks);
  gl_FragColor = vec4(col, (0.35 + streaks * 0.55) * edge * fade);
}`;

/** A ribbon of falling water `length` long, dropping from y=0. Faces +z. */
export function makeWaterfall(width: number, length: number, time: { value: number }) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, length, 1, 24);
  // Curve it outward a little as it falls, like water leaving a ledge.
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (length / 2 - p.getY(i)) / length;
    p.setZ(i, Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) * width * 0.6);
  }
  geo.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: FALL_VS,
      fragmentShader: FALL_FS,
      uniforms: { uTime: time },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  g.add(m);
  return g;
}

// ------------------------------------------------------------------ clouds

function cloudTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 14; i++) {
    const x = 30 + hash3(i, 1, 1, 5) * 68;
    const y = 50 + hash3(i, 2, 1, 5) * 30;
    const r = 18 + hash3(i, 3, 1, 5) * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let CLOUD: THREE.Texture | null = null;

export function makeCloud(size: number, tint: string, opacity: number) {
  CLOUD ??= cloudTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: CLOUD, color: tint, transparent: true, opacity, depthWrite: false }));
  s.scale.set(size, size * 0.55, 1);
  return s;
}
