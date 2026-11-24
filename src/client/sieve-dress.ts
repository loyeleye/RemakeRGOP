// The Sieve (run 8), dressed with no bought art: a quarry floor of warm, worked chalk, its wells
// cut as stepped pits, and the cutters' things on a grass verge round the rim. Procedural only.
// (gameplay/run8-rework-brief.md, "dress the Sieve", 24 Nov.)

import * as THREE from "three";
import { noise3 } from "./islands.js";

type Pt = { x: number; z: number };
export type Well = { x: number; y: number; r: number };

/** The look's numbers. */
export const DRESS = {
  /** How far the grass verge runs out past the chalk, in tiles. */
  verge: 4.8,
  /** The chalk: warm and a little darker than white, banded by its bedding. */
  chalk: [200, 186, 156] as const,
  /** Bedding bands: how wide, and which way they run. */
  band: 2.3,
  bandAngle: 0.38,
  /** Worn paths: packed and browner. */
  path: "rgba(96, 76, 52, 0.26)",
  pathEdge: "rgba(110, 88, 60, 0.14)",
  /** The pits: steps down, each this deep; the shaft below them to this depth. */
  steps: [0.5, 0.6, 0.7] as const,
  /** How far down the shaft goes before the cloud. (The island has no hanging spires here: one showed through a shaft.) */
  shaftDepth: 8,
  grass: "#9c9b6c",
  /** Where things stand, by angle (radians, 0 east, +pi/2 south toward the eye). Huts and work on the far side. */
  huts: [-1.95, -1.32, -2.62],
  blocks: [-0.95, -2.95, 2.75],
  spoil: [-2.28, -0.62, 0.42, 3.4],
  cart: -0.25,
};

/** Each well's edge wobbles, the same everywhere it is drawn (the hole in the ground, the pit's walls). */
export function wellEdge(w: Well, i: number) {
  return (a: number) => 1 + 0.035 * Math.sin(3 * a + i * 1.7) + 0.025 * Math.sin(7 * a + i * 4.1);
}
/** The mouth of a well in world units: its tiles plus the half tile round them. */
export const mouthOf = (w: Well) => w.r + 0.55;

/** A well's mouth as a closed loop of points, for cutting it out of the ground. */
export function wellLoop(w: Well, i: number, n = 48): Pt[] {
  const R = mouthOf(w), J = wellEdge(w, i);
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return { x: w.x + Math.cos(a) * R * J(a), z: w.y + Math.sin(a) * R * J(a) };
  });
}

function fbm2(x: number, z: number, seed: number, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) (v += a * noise3(x * f, 0.5, z * f, seed + i * 7)), (f *= 2.07), (a *= 0.5);
  return v;
}
function rnd(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 48271) % 2147483647) - 1) / 2147483646;
}

/** Where the worn paths run: from the brazier out to each hut, each hut to its nearest well, to Tilda's table, and round the brazier. */
export function sievePaths(wells: Well[], coast: (a: number) => number, table: Pt): { paths: Pt[][]; ruts: Pt[] } {
  const at = (a: number, out: number) => ({ x: Math.cos(a) * (coast(a) + out), z: Math.sin(a) * (coast(a) + out) });
  const curve = (from: Pt, to: Pt, bend: number, n = 24) => {
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
    return Array.from({ length: n + 1 }, (_, k) => {
      const t = k / n, s = Math.sin(t * Math.PI) * bend + Math.sin(t * Math.PI * 3) * 0.25;
      return { x: from.x + dx * t + (-dz / len) * s, z: from.z + dz * t + (dx / len) * s };
    });
  };
  const ring = Array.from({ length: 49 }, (_, k) => {
    const a = (k / 48) * Math.PI * 2;
    return { x: Math.cos(a) * 3.4, z: Math.sin(a) * 3.1 };
  });
  const paths: Pt[][] = [ring];
  DRESS.huts.forEach((a, i) => {
    const hut = at(a, 0.2), from = { x: Math.cos(a) * 3.3, z: Math.sin(a) * 3.1 };
    paths.push(curve(from, hut, i % 2 ? 1.2 : -1.0));
    // Hut to the nearest well's lip.
    const w = wells.reduce((b, q) => (Math.hypot(q.x - hut.x, q.y - hut.z) < Math.hypot(b.x - hut.x, b.y - hut.z) ? q : b), wells[0]!);
    const d = Math.hypot(hut.x - w.x, hut.z - w.y) || 1, R = mouthOf(w) + 0.5;
    paths.push(curve(hut, { x: w.x + ((hut.x - w.x) / d) * R, z: w.y + ((hut.z - w.y) / d) * R }, 0.6, 14));
  });
  const ta = Math.atan2(table.z, table.x);
  paths.push(curve({ x: Math.cos(ta) * 3.3, z: Math.sin(ta) * 3.1 }, table, 0.7));
  const ruts = curve({ x: Math.cos(DRESS.cart) * 3.4, z: Math.sin(DRESS.cart) * 3.1 }, at(DRESS.cart, 0.6), -1.4, 30);
  paths.push(ruts);
  return { paths, ruts };
}

/**
 * The quarry floor, painted once into one big texture laid over the whole island in world space:
 * bedding bands with flint in them, pick marks, cracks, worn paths and cart ruts, a darker lip round
 * every well and trampled ground near it, and grass stains toward the rim. `S` world units square.
 */
export function sieveGround(o: { S: number; wells: Well[]; coastAt: (x: number, z: number) => number; paths: Pt[][]; ruts: Pt[]; low: boolean }) {
  const { S, wells } = o;
  const N = o.low ? 1536 : 3072;
  const M = o.low ? 384 : 768;
  const R = rnd(8117);
  const [cr, cg, cb] = DRESS.chalk;
  const ca = Math.cos(DRESS.bandAngle), sa = Math.sin(DRESS.bandAngle);
  const across = (x: number, z: number) => x * ca + z * sa;
  const along = (x: number, z: number) => -x * sa + z * ca;
  const warp = (v: number) => 1.1 * Math.sin(v * 0.11 + 0.7) + 0.5 * Math.sin(v * 0.31 + 2.1);
  const lipDist = (x: number, z: number) => Math.min(...wells.map((w) => Math.hypot(x - w.x, z - w.y) - mouthOf(w)));

  // The broad colour, a pixel per ~0.07 tile: mottling, the bands' tones, the rim's stain, the trampled ring round each well.
  const base = document.createElement("canvas");
  base.width = base.height = M;
  const bg = base.getContext("2d")!;
  const img = bg.createImageData(M, M);
  for (let py = 0; py < M; py++)
    for (let px = 0; px < M; px++) {
      const x = (px / M - 0.5) * S, z = (py / M - 0.5) * S;
      const u = across(x, z) + warp(along(x, z)), band = Math.floor(u / DRESS.band);
      const tone = 0.93 + 0.1 * (((band * 7919) % 13) / 13) + (fbm2(x * 0.09, z * 0.09, 3) - 0.5) * 0.22;
      const fine = (noise3(x * 1.3, 2.5, z * 1.3, 11) - 0.5) * 0.06;
      let k = tone + fine;
      // Warm patches and cool patches.
      const warm = (fbm2(x * 0.05 + 9, z * 0.05, 5) - 0.5) * 0.5;
      // Toward the rim: weathered and stained by the grass.
      const edge = Math.max(0, Math.min(1, (o.coastAt(x, z) + 1.6) / 1.6));
      // Trampled near the wells.
      const ld = lipDist(x, z), tr = ld > 0 && ld < 2.2 ? (1 - ld / 2.2) * 0.12 : 0;
      k *= 1 - tr;
      let r = cr * k * (1 + warm * 0.06), g = cg * k, b = cb * k * (1 - warm * 0.08);
      r = r * (1 - edge * 0.25) + 150 * edge * 0.25;
      g = g * (1 - edge * 0.25) + 145 * edge * 0.25;
      b = b * (1 - edge * 0.25) + 100 * edge * 0.25;
      const i = (py * M + px) * 4;
      img.data[i] = Math.min(255, r);
      img.data[i + 1] = Math.min(255, g);
      img.data[i + 2] = Math.min(255, b);
      img.data[i + 3] = 255;
    }
  bg.putImageData(img, 0, 0);

  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(base, 0, 0, N, N);
  // From here on, draw in world units.
  g.setTransform(N / S, 0, 0, N / S, N / 2, N / 2);
  const onFloor = (x: number, z: number) => o.coastAt(x, z) < -0.3 && lipDist(x, z) > 0.2;
  const line = (pts: Pt[], w: number, style: string) => {
    g.strokeStyle = style;
    g.lineWidth = w;
    g.lineCap = g.lineJoin = "round";
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
    g.stroke();
  };

  // Bedding planes: a thin dark seam at every band's edge, a pale one beside it, and flint nodules strung along every third.
  const span = S * 0.75;
  for (let k = -Math.ceil(span / DRESS.band); k <= Math.ceil(span / DRESS.band); k++) {
    const u0 = k * DRESS.band;
    const pts: Pt[] = [];
    for (let v = -span; v <= span; v += 0.4) {
      const u = u0 - warp(v) + (noise3(v * 0.6, k, 0.3, 21) - 0.5) * 0.12;
      pts.push({ x: u * ca - v * sa, z: u * sa + v * ca });
    }
    line(pts, 0.05, "rgba(92, 78, 58, 0.42)");
    line(pts.map((p) => ({ x: p.x + ca * 0.07, z: p.z + sa * 0.07 })), 0.04, "rgba(246, 238, 220, 0.35)");
    if (((k % 4) + 4) % 4 === 1)
      for (const p of pts) {
        if (R() > 0.16 || !onFloor(p.x, p.z)) continue;
        const s = 0.07 + R() * 0.16, q = { x: p.x + ca * (0.2 + R() * 0.5) + (R() - 0.5) * 0.4, z: p.z + sa * (0.2 + R() * 0.5) + (R() - 0.5) * 0.4 };
        g.fillStyle = "rgba(72, 74, 82, 0.55)";
        g.beginPath();
        g.ellipse(q.x, q.z, s, s * (0.5 + R() * 0.4), R() * 3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(240, 236, 226, 0.6)";
        g.lineWidth = 0.025;
        g.stroke();
      }
  }

  // Worn paths, then the cart's two ruts along its track.
  for (const p of o.paths) line(p, 2.1, DRESS.pathEdge);
  for (const p of o.paths) line(p, 1.25, DRESS.path);
  for (const p of o.paths)
    for (let k = 0; k < p.length * 6; k++) {
      const q = p[Math.floor(R() * p.length)]!, s = 0.025 + R() * 0.05;
      g.fillStyle = R() < 0.5 ? "rgba(70, 56, 40, 0.5)" : "rgba(235, 226, 205, 0.55)";
      g.fillRect(q.x + (R() - 0.5) * 1.4, q.z + (R() - 0.5) * 1.4, s, s);
    }
  const offset = (pts: Pt[], d: number) =>
    pts.map((p, k) => {
      const a = pts[Math.max(0, k - 1)]!, b = pts[Math.min(pts.length - 1, k + 1)]!, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { x: p.x + (-dz / l) * d, z: p.z + (dx / l) * d };
    });
  for (const d of [-0.42, 0.42]) {
    line(offset(o.ruts, d), 0.16, "rgba(72, 56, 38, 0.5)");
    line(offset(o.ruts, d + 0.1), 0.05, "rgba(240, 230, 210, 0.35)");
  }

  // Pick marks: little fans of parallel strokes where blocks were cut.
  for (let n = 0; n < (o.low ? 70 : 140); n++) {
    const x = (R() - 0.5) * S * 0.85, z = (R() - 0.5) * S * 0.75;
    if (!onFloor(x, z)) continue;
    const a = R() * Math.PI, len = 0.3 + R() * 0.45, m = 4 + Math.floor(R() * 6);
    for (let j = 0; j < m; j++) {
      const ox = x + Math.cos(a + Math.PI / 2) * j * 0.11, oz = z + Math.sin(a + Math.PI / 2) * j * 0.11;
      const l = len * (0.7 + R() * 0.5);
      line([{ x: ox, z: oz }, { x: ox + Math.cos(a) * l, z: oz + Math.sin(a) * l }], 0.035, "rgba(84, 68, 48, 0.32)");
      line([{ x: ox + 0.03, z: oz + 0.03 }, { x: ox + 0.03 + Math.cos(a) * l, z: oz + 0.03 + Math.sin(a) * l }], 0.025, "rgba(250, 244, 230, 0.3)");
    }
  }
  // Saw-cut squares, where blocks came out of the floor.
  for (let n = 0; n < (o.low ? 10 : 18); n++) {
    const x = (R() - 0.5) * S * 0.8, z = (R() - 0.5) * S * 0.7;
    if (!onFloor(x, z) || Math.hypot(x, z) < 4) continue;
    const w = 0.9 + R() * 0.8, h = 0.45 + R() * 0.3, a = DRESS.bandAngle + (R() < 0.5 ? 0 : Math.PI / 2);
    g.save();
    g.translate(x, z);
    g.rotate(a);
    g.fillStyle = "rgba(120, 104, 80, 0.16)";
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = "rgba(80, 64, 46, 0.45)";
    g.lineWidth = 0.04;
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }

  // Cracks: wandering, branching, tapering.
  const crack = (x: number, z: number, a: number, n: number, w: number) => {
    let px = x, pz = z;
    for (let k = 0; k < n; k++) {
      a += (R() - 0.5) * 0.9;
      const nx = px + Math.cos(a) * 0.22, nz = pz + Math.sin(a) * 0.22;
      const ww = w * (1 - k / n) + 0.012;
      line([{ x: px, z: pz }, { x: nx, z: nz }], ww, "rgba(56, 44, 32, 0.6)");
      line([{ x: px + 0.025, z: pz + 0.025 }, { x: nx + 0.025, z: nz + 0.025 }], ww * 0.6, "rgba(246, 238, 220, 0.25)");
      if (R() < 0.06 && n - k > 5) crack(nx, nz, a + (R() < 0.5 ? 0.9 : -0.9), Math.floor((n - k) * 0.6), ww * 0.7);
      (px = nx), (pz = nz);
    }
  };
  for (let n = 0; n < (o.low ? 45 : 80); n++) {
    const x = (R() - 0.5) * S * 0.85, z = (R() - 0.5) * S * 0.75;
    if (!onFloor(x, z)) continue;
    crack(x, z, R() * Math.PI * 2, 10 + Math.floor(R() * 22), 0.05 + R() * 0.04);
  }
  // From each well's lip, a few cracks run out into the floor.
  wells.forEach((w) => {
    for (let k = 0; k < 7; k++) {
      const a = R() * Math.PI * 2, R0 = mouthOf(w) + 0.1;
      crack(w.x + Math.cos(a) * R0, w.y + Math.sin(a) * R0, a, 6 + Math.floor(R() * 10), 0.07);
    }
  });

  // Each well's lip: a dark worn band, broken edge specks, a spill of pale rubble.
  wells.forEach((w, i) => {
    const loop = wellLoop(w, i, 64);
    loop.push(loop[0]!);
    const out = (d: number) => loop.map((p) => ({ x: w.x + (p.x - w.x) * (1 + d / mouthOf(w)), z: w.y + (p.z - w.y) * (1 + d / mouthOf(w)) }));
    line(out(0.45), 0.8, "rgba(110, 92, 68, 0.2)");
    line(out(0.18), 0.36, "rgba(78, 62, 44, 0.5)");
    line(out(0.04), 0.1, "rgba(48, 38, 28, 0.75)");
    for (let k = 0; k < 140; k++) {
      const a = R() * Math.PI * 2, d = mouthOf(w) + 0.15 + R() ** 2 * 1.6, s = 0.03 + R() * 0.09;
      g.fillStyle = R() < 0.6 ? "rgba(236, 228, 210, 0.75)" : "rgba(84, 70, 52, 0.5)";
      g.fillRect(w.x + Math.cos(a) * d, w.y + Math.sin(a) * d, s, s * (0.6 + R() * 0.6));
    }
  });

  // Grit everywhere.
  for (let n = 0; n < (o.low ? 9000 : 26000); n++) {
    const x = (R() - 0.5) * S, z = (R() - 0.5) * S, s = 0.02 + R() * 0.05;
    g.fillStyle = R() < 0.5 ? "rgba(70, 58, 42, 0.32)" : "rgba(250, 245, 232, 0.4)";
    g.fillRect(x, z, s, s);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  // The floor's UVs are its shape's (x, -z) in world units.
  t.repeat.set(1 / S, 1 / S);
  t.offset.set(0.5, 0.5);
  return t;
}

/** Fine grain for the chalk's surface under a low sun: a tileable bump of pits and chisel grain, laid every 3 tiles. */
export function sieveGrain() {
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x / N) * Math.PI * 2, v = (y / N) * Math.PI * 2;
      const a = noise3(Math.cos(u) * 3, Math.sin(u) * 3 + Math.cos(v) * 3, Math.sin(v) * 3, 31);
      const b = noise3(Math.cos(u) * 14, Math.sin(u) * 14 + Math.cos(v) * 14, Math.sin(v) * 14, 37);
      const k = 0.5 + (a - 0.5) * 0.5 + (b - 0.5) * 0.45;
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * k;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const R = rnd(77);
  for (let n = 0; n < 220; n++) {
    g.fillStyle = `rgba(0,0,0,${0.25 + R() * 0.35})`;
    g.beginPath();
    g.arc(R() * N, R() * N, 0.8 + R() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 3, 1 / 3);
  return t;
}

/**
 * A well cut as a quarry pit: three stepped ledges going down from a dark lip, then a shaft
 * darkening into the depth, and the cloud far below (drawn by `cloud`). Centred on (0, 0, 0).
 */
export function quarryPit(w: Well, i: number, cloud: THREE.Material, low: boolean) {
  const grp = new THREE.Group();
  const J = wellEdge(w, i), SEG = low ? 36 : 56;
  const R0 = mouthOf(w), step = Math.max(0.24, Math.min(0.42, R0 * 0.13));
  const chalk = new THREE.Color("#d2c4a6"), deep = new THREE.Color("#262a33"), ledgeC = new THREE.Color("#b9aa8a");
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const at = (a: number, r: number, y: number, c: THREE.Color) => {
    pos.push(Math.cos(a) * r * J(a), y, Math.sin(a) * r * J(a));
    col.push(c.r, c.g, c.b);
    return pos.length / 3 - 1;
  };
  // A band of quads between two rings of (radius, height, colour).
  const band = (r0: number, y0: number, c0: THREE.Color, r1: number, y1: number, c1: THREE.Color) => {
    const first = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      // Strata in the walls: a light and dark seam by height, broken by the angle.
      const seam = (y: number) => 0.92 + 0.08 * Math.sin(y * 11 + Math.sin(a * 5 + i) * 0.8);
      at(a, r0, y0, c0.clone().multiplyScalar(seam(y0)));
      at(a, r1, y1, c1.clone().multiplyScalar(seam(y1)));
    }
    for (let s = 0; s < SEG; s++) {
      const a = first + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  let r = R0, y = 0;
  DRESS.steps.forEach((h, k) => {
    const shade = 1 - k * 0.14;
    const top = chalk.clone().multiplyScalar(shade), bot = chalk.clone().multiplyScalar(shade * 0.86);
    // The wall, with a few rows so its seams show.
    const rows = 3;
    for (let q = 0; q < rows; q++) band(r, y - (h * q) / rows, top.clone().lerp(bot, q / rows), r, y - (h * (q + 1)) / rows, top.clone().lerp(bot, (q + 1) / rows));
    y -= h;
    // The ledge.
    band(r, y, ledgeC.clone().multiplyScalar(shade * 0.92), r - step, y, ledgeC.clone().multiplyScalar(shade * 0.85));
    r -= step;
  });
  // The shaft: straight down, chalk going to dark.
  const ys = [y, y - 0.8, y - 2, y - 4, -DRESS.shaftDepth];
  for (let k = 0; k < ys.length - 1; k++) {
    const t0 = k / (ys.length - 1), t1 = (k + 1) / (ys.length - 1);
    band(r, ys[k]!, chalk.clone().multiplyScalar(0.62).lerp(deep, t0 ** 0.7), r, ys[k + 1]!, chalk.clone().multiplyScalar(0.62).lerp(deep, t1 ** 0.7));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const walls = new THREE.Mesh(geo, mat);
  walls.receiveShadow = true;
  grp.add(walls);
  // Rubble on the ledges.
  const R = rnd(991 + i * 17);
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: "#cbbd9d", roughness: 1 }), low ? 18 : 40);
  const m = new THREE.Matrix4();
  let rr = R0, yy = 0;
  const ledges = DRESS.steps.map((h) => ((yy -= h), (rr -= step), { y: yy, r: rr + step / 2 }));
  for (let k = 0; k < rubble.count; k++) {
    const L = ledges[k % ledges.length]!, a = R() * Math.PI * 2, s = 0.05 + R() * 0.1;
    m.compose(new THREE.Vector3(Math.cos(a) * L.r * J(a), L.y + s * 0.5, Math.sin(a) * L.r * J(a)), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)), new THREE.Vector3(s, s * 0.7, s));
    rubble.setMatrixAt(k, m);
  }
  rubble.receiveShadow = true;
  grp.add(rubble);
  // The cloud, far down the shaft.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.02, 32).rotateX(-Math.PI / 2), cloud);
  disc.position.y = -DRESS.shaftDepth + 0.05;
  grp.add(disc);
  return grp;
}

// ------------------------------------------------------------------ the cutters' things

const M = {
  block: () => new THREE.MeshStandardMaterial({ color: "#ddd0b2", roughness: 0.92 }),
  timber: () => new THREE.MeshStandardMaterial({ color: "#6e4c30", roughness: 0.85 }),
  dark: () => new THREE.MeshStandardMaterial({ color: "#3b2a1d", roughness: 0.9 }),
  thatch: () => new THREE.MeshStandardMaterial({ color: "#8d7a52", roughness: 1 }),
  iron: () => new THREE.MeshStandardMaterial({ color: "#4a4e55", roughness: 0.6, metalness: 0.4 }),
  page: () => new THREE.MeshStandardMaterial({ color: "#efe6cf", roughness: 0.9 }),
  spoil: () => new THREE.MeshStandardMaterial({ color: "#cdbf9f", roughness: 1, flatShading: true }),
};
type Mats = { [K in keyof typeof M]: THREE.MeshStandardMaterial };

function box(m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = b.receiveShadow = true;
  return b;
}
function rod(m: THREE.Material, r: number, len: number) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
  c.castShadow = true;
  return c;
}

/** A cutter's hut: walls of chalk block, a thatched roof, a dark door facing the floor, a pick leant by it. */
function hut(mt: Mats, seed: number) {
  const g = new THREE.Group();
  const R = rnd(seed);
  const w = 2.1 + R() * 0.4, d = 1.7, h = 1.25;
  // Courses of block, slightly uneven.
  for (let c = 0; c < 4; c++) {
    const y = (c + 0.5) * (h / 4);
    g.add(box(mt.block, w + (R() - 0.5) * 0.04, h / 4 - 0.02, d + (R() - 0.5) * 0.04, 0, y, 0));
  }
  // A ridge roof: a triangular prism with eaves.
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, w + 0.5, 3, 1), mt.thatch);
  roof.rotation.set(0, 0, Math.PI / 2);
  roof.rotation.x = Math.PI;
  roof.scale.set(0.75, 1, (d / 2 + 0.3) / 0.866);
  roof.position.y = h + 0.36;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  // The door and a lintel, toward the chalk (local +z).
  g.add(box(mt.dark, 0.6, 0.95, 0.05, 0.3 - R() * 0.6, 0.48, d / 2 + 0.01));
  g.add(box(mt.timber, 0.8, 0.1, 0.12, 0, 1.0, d / 2 + 0.03));
  // A small window.
  g.add(box(mt.dark, 0.35, 0.28, 0.05, -w / 2 + 0.45, 0.82, d / 2 + 0.01));
  const pick = toolPick(mt);
  pick.position.set(w / 2 + 0.12, 0, d / 2 - 0.2);
  pick.rotation.set(0, 0, -0.25);
  g.add(pick);
  return g;
}

function toolPick(mt: Mats) {
  const g = new THREE.Group();
  const h = rod(mt.timber, 0.03, 0.95);
  h.position.y = 0.47;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.04, 0.62, 5), mt.iron);
  head.rotation.z = Math.PI / 2;
  head.position.y = 0.92;
  head.castShadow = true;
  g.add(h, head);
  return g;
}
function toolShovel(mt: Mats) {
  const g = new THREE.Group();
  const h = rod(mt.timber, 0.025, 0.9);
  h.position.y = 0.45;
  g.add(h, box(mt.iron, 0.26, 0.3, 0.02, 0, 0.0, 0));
  g.children[1]!.position.y = -0.1;
  return g;
}
/** Lay a standing tool down on the ground. */
function laid(tool: THREE.Object3D, a: number) {
  const g = new THREE.Group();
  tool.rotation.set(Math.PI / 2, 0, 0);
  tool.position.set(0, 0.04, -0.45);
  g.add(tool);
  g.rotation.y = a;
  return g;
}

/** A stack of cut blocks, in courses, a few out of true; with loose ones beside it. */
function blockStack(mt: Mats, seed: number) {
  const g = new THREE.Group();
  const R = rnd(seed);
  const L = 0.85, H = 0.42, D = 0.48;
  const rows = 2 + Math.floor(R() * 2), cols = 2 + Math.floor(R() * 2);
  for (let c = 0; c < 3; c++)
    for (let i = 0; i < rows - (c > 1 ? 1 : 0); i++)
      for (let j = 0; j < cols - c; j++) {
        const b = box(mt.block, L, H, D, (j - (cols - c - 1) / 2) * (L + 0.03) + (R() - 0.5) * 0.06, H / 2 + c * (H + 0.01), (i - (rows - 1) / 2) * (D + 0.03));
        b.rotation.y = (R() - 0.5) * 0.08;
        g.add(b);
      }
  for (let k = 0; k < 3; k++) {
    const b = box(mt.block, L, H, D, 1.5 + R() * 0.6, H / 2, (R() - 0.5) * 1.6);
    b.rotation.y = R() * 3;
    g.add(b);
  }
  // A wedge and a mallet by the loose ones.
  g.add(laid(toolPick(mt), R() * 3).translateX(1.2).translateZ(0.9));
  return g;
}

/** A heap of spoil: a low lumpy mound of broken chalk. */
function spoilHeap(mt: Mats, seed: number, size: number) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.getAttribute("position");
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const n = 0.8 + 0.45 * noise3(x * 2.2, y * 2.2, z * 2.2, seed);
    p.setXYZ(k, x * n, Math.max(-0.1, y) * n, z * n);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mt.spoil);
  m.scale.set(size, size * 0.45, size * 0.8);
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  const R = rnd(seed + 5);
  for (let k = 0; k < 10; k++) {
    const s = 0.08 + R() * 0.16, a = R() * Math.PI * 2, d = size * (0.9 + R() * 0.5);
    const b = box(mt.spoil, s, s * 0.7, s * 1.2, Math.cos(a) * d, s * 0.3, Math.sin(a) * d * 0.8);
    b.rotation.set(R() * 3, R() * 3, R() * 3);
    g.add(b);
  }
  return g;
}

/** A two-wheeled cart, its shafts down, three blocks in its bed. */
function cart(mt: Mats) {
  const g = new THREE.Group();
  g.add(box(mt.timber, 1.0, 0.1, 1.6, 0, 0.62, 0));
  for (const s of [-1, 1]) {
    g.add(box(mt.timber, 0.06, 0.3, 1.6, s * 0.5, 0.8, 0));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), mt.dark);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(s * 0.6, 0.45, 0.1);
    wheel.castShadow = true;
    g.add(wheel);
    for (let k = 0; k < 3; k++) {
      const spoke = rod(mt.timber, 0.02, 0.84);
      spoke.position.set(s * 0.6, 0.45, 0.1);
      spoke.rotation.x = (k / 3) * Math.PI;
      g.add(spoke);
    }
    // The shafts, resting on the ground ahead.
    const shaft = rod(mt.timber, 0.035, 1.9);
    shaft.rotation.x = Math.PI / 2 + 0.3;
    shaft.position.set(s * 0.32, 0.33, 1.55);
    g.add(shaft);
  }
  const axle = rod(mt.dark, 0.04, 1.25);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, 0.45, 0.1);
  g.add(axle);
  for (let k = 0; k < 3; k++) g.add(box(mt.block, 0.4, 0.3, 0.5, -0.22 + (k % 2) * 0.44, 0.82, -0.4 + k * 0.4));
  return g;
}

/** Tilda's table: a plain board on legs, her book open on it, an inkpot, and a stool. */
function table(mt: Mats) {
  const g = new THREE.Group();
  g.add(box(mt.timber, 1.1, 0.06, 0.62, 0, 0.74, 0));
  for (const [x, z] of [[-0.48, -0.25], [0.48, -0.25], [-0.48, 0.25], [0.48, 0.25]] as const) g.add(box(mt.dark, 0.06, 0.72, 0.06, x, 0.36, z));
  // The book: two pages, a little apart, on a dark board.
  g.add(box(mt.dark, 0.56, 0.03, 0.4, 0, 0.785, 0));
  for (const s of [-1, 1]) {
    const p = box(mt.page, 0.26, 0.02, 0.36, s * 0.135, 0.81, 0);
    p.rotation.z = s * -0.06;
    g.add(p);
  }
  g.add(box(mt.dark, 0.07, 0.08, 0.07, 0.42, 0.81, -0.16));
  const stool = new THREE.Group();
  stool.add(box(mt.timber, 0.42, 0.05, 0.42, 0, 0.45, 0));
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]] as const) stool.add(box(mt.dark, 0.045, 0.44, 0.045, x, 0.22, z));
  stool.position.set(0.1, 0, 0.62);
  g.add(stool);
  return g;
}

/**
 * Everything on the verge: the huts, the stacked blocks, the spoil heaps, the cart at the end of
 * its ruts, Tilda's table behind where she stands, tools, and grass and scrub all round. Nothing
 * stands on the chalk (every tile of it is in play).
 */
export function dressVerge(group: THREE.Group, coast: (a: number) => number, tableAt: Pt, low: boolean) {
  const mt = Object.fromEntries(Object.entries(M).map(([k, f]) => [k, f()])) as Mats;
  const at = (a: number, out: number) => ({ x: Math.cos(a) * (coast(a) + out), z: Math.sin(a) * (coast(a) + out) });
  const facing = (x: number, z: number) => Math.atan2(-x, -z);
  const taken: { x: number; z: number; r: number }[] = [];
  const put = (o: THREE.Object3D, p: Pt, rot: number, r: number) => {
    o.position.set(p.x, 0, p.z);
    o.rotation.y = rot;
    group.add(o);
    taken.push({ ...p, r });
  };
  DRESS.huts.forEach((a, i) => {
    const p = at(a, 2.5);
    put(hut(mt, 31 + i * 7), p, facing(p.x, p.z), 2.0);
  });
  DRESS.blocks.forEach((a, i) => {
    const p = at(a, 2.0);
    put(blockStack(mt, 51 + i * 13), p, facing(p.x, p.z) + Math.PI / 2, 2.0);
  });
  DRESS.spoil.forEach((a, i) => {
    const p = at(a, 2.6);
    put(spoilHeap(mt, 71 + i * 3, 1.3 + (i % 2) * 0.5), p, a, 1.9);
  });
  const cp = at(DRESS.cart, 1.9);
  put(cart(mt), cp, facing(cp.x, cp.z), 1.4);
  const ta = Math.atan2(tableAt.z, tableAt.x);
  put(table(mt), tableAt, facing(tableAt.x, tableAt.z) + Math.PI, 0.9);
  // A shovel and a pick laid by the cart; a shovel stuck in the nearest spoil heap.
  put(laid(toolShovel(mt), 0.6), at(DRESS.cart + 0.12, 1.1), 0, 0.3);
  const sh = toolShovel(mt);
  sh.rotation.z = 0.3;
  put(sh, at(DRESS.spoil[0]! + 0.05, 1.6), 0, 0.2);

  // Grass tufts and scrub, all round the verge, lower and sparser on the near (south) side so nothing hides the floor.
  const R = rnd(4242);
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#5f6a45", roughness: 1, flatShading: true }), low ? 50 : 110);
  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.42, 4), new THREE.MeshStandardMaterial({ color: "#a8a46c", roughness: 1 }), low ? 260 : 700);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const free = (p: Pt, r: number) => taken.every((t) => Math.hypot(t.x - p.x, t.z - p.z) > t.r + r);
  let nb = 0;
  for (let k = 0; k < 2000 && nb < bushes.count; k++) {
    const a = R() * Math.PI * 2, near = Math.sin(a) > 0.3;
    if (near && R() < 0.6) continue;
    const p = at(a, 0.8 + R() * 3.6), s = (near ? 0.22 : 0.3) + R() * 0.35;
    if (!free(p, s)) continue;
    m.compose(new THREE.Vector3(p.x, s * 0.45, p.z), q.setFromEuler(e.set(0, R() * 6, 0)), new THREE.Vector3(s * 1.2, s * 0.8, s));
    bushes.setMatrixAt(nb++, m);
  }
  bushes.count = nb;
  bushes.castShadow = true;
  let nt = 0;
  for (let k = 0; k < 6000 && nt < tufts.count; k++) {
    const a = R() * Math.PI * 2, p = at(a, 0.45 + R() * 4.1);
    if (!free(p, 0.1)) continue;
    const s = 0.6 + R() * 0.8;
    m.compose(new THREE.Vector3(p.x, 0.18 * s, p.z), q.setFromEuler(e.set((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5)), new THREE.Vector3(s, s, s));
    tufts.setMatrixAt(nt++, m);
  }
  tufts.count = nt;
  group.add(bushes, tufts);
  void ta;
}
