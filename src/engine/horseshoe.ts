// The home island as a horseshoe (maps thread, draft 4, approved by Ladi on 23 Nov 2026).
// Spec: project files sogni/lanternfall/production/places/home-island-horseshoe-spec-4.md, shapes from
// home-island-horseshoe-draft-4.py. Coordinates as the spec has them: tiles, x east, y south, the
// origin in the middle of the lake channel. The board is centred on the pond brazier (the game
// always puts the brazier at the board's centre), so everything here is placed from spec coordinates.

/** The pond brazier, by the lesson pond cove: the board's centre. */
export const HS_CENTRE = { x: -17, y: -8 };
/** Board half-sizes round the centre: wide enough for the east point spur, tall enough for the Kindling ground. */
const HALF_W = 64, HALF_H = 85;
export const HS_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };

const wob = (a: number, amp: number) => (amp * (Math.sin(3 * a + 0.7) + 0.6 * Math.sin(5 * a + 2.1) + 0.4 * Math.sin(9 * a + 4.0))) / 2;
/** The outer edge's half-width at each latitude: the tips as wide as ever, the arms pulled in, widest round the basin, a rounded bottom. */
const CP: [number, number][] = [[-40, 26.9], [-30, 24.5], [-20, 23.5], [-8, 24], [2, 25], [12, 29], [20, 32.5], [30, 30.5], [40, 27]];
/** The northmost and southmost latitudes of the outer edge. */
const NB = -53, SB = 56;
function halfWidth(y: number) {
  if (y <= -40) return 41 * Math.sqrt(Math.max(0, 1 - (y / 53) ** 2));
  if (y >= 40) return 27 * Math.sqrt(Math.max(0, 1 - ((y - 40) / (SB - 40)) ** 2));
  for (let i = 0; i + 1 < CP.length; i++) {
    const [y0, e0] = CP[i]!, [y1, e1] = CP[i + 1]!;
    if (y >= y0 && y <= y1) return e0 + ((e1 - e0) * (1 - Math.cos((Math.PI * (y - y0)) / (y1 - y0)))) / 2;
  }
  return 0;
}
/** The two arms differ a little, so it isn't a mirror image. */
const armside = (x: number, y: number) => 1 + 0.05 * (x < 0 ? Math.sin(y * 0.11 + 0.8) : Math.sin(y * 0.09 + 2.6));
const edgeX = (x: number, y: number) => halfWidth(y) * armside(x, y) * (1 + wob(Math.atan2(y, x), 0.06));
const outer = (x: number, y: number) => Math.abs(x) < edgeX(x, y) && y > NB && y < SB;
/** The keyhole lake: a wavy channel out through the north rim, and a round basin at the bottom. */
export function lake(x: number, y: number) {
  let w = 7.5 + 1.2 * Math.sin(y * 0.21);
  if (y < -36) w -= (-36 - y) * 0.12;
  const ch = Math.abs(x) < w && -60 < y && y < 12;
  const basin = (x * x) / 18 ** 2 + (y - 19) ** 2 / 15 ** 2 < 1;
  return ch || basin;
}
const cove = (x: number, y: number) => (x + 10) ** 2 / 12 + (y + 8) ** 2 / 9 < 1;
/** The Kindling ground's centre: 7 south of the southmost point. */
const KY = SB + 7;
const kindling = (x: number, y: number) => x * x + (y - KY) ** 2 < 10.5 ** 2;
// (Two tiles longer inland than the spec's 30..43, so it meets the coast with no gap.)
const spur = (x: number, y: number) => x >= 28 && x <= 43 && y >= 12 && y <= 15;
export const isLand = (x: number, y: number) => outer(x, y) || kindling(x, y) || spur(x, y);
export const isWater = (x: number, y: number) => (lake(x, y) || cove(x, y)) && outer(x, y);

/**
 * Roughly how far (x, y) is from the island's outer edge, in tiles, negative on land, for drawing
 * the coast: the edge's own shape, without the Kindling bulge or the spur.
 */
export function hsOval(x: number, y: number) {
  const fy = Math.floor(y);
  let best = Infinity;
  for (let k = 0; k - 1 <= best && k < 140; k++)
    for (const row of k ? [fy - k, fy + k] : [fy])
      for (const p of rim().get(row) ?? []) best = Math.min(best, Math.hypot(p[0] - x, p[1] - y));
  return (outer(x, y) ? -best : best) - 0.5;
}
/** Points along the outer edge, a tenth of a tile apart in latitude, kept by whole latitude. */
let RIM: Map<number, [number, number][]> | null = null;
function rim() {
  if (RIM) return RIM;
  RIM = new Map();
  const add = (px: number, py: number) => {
    const k = Math.floor(py);
    if (!RIM!.has(k)) RIM!.set(k, []);
    RIM!.get(k)!.push([px, py]);
  };
  let last: number[] = [0, 0];
  for (let y = NB; y <= SB + 1e-9; y += 0.1)
    [-1, 1].forEach((side, i) => {
      // The wobble turns on the angle, which turns on x: a few rounds settle it.
      let ex = halfWidth(y);
      for (let n = 0; n < 4; n++) ex = edgeX(side * Math.max(ex, 0.01), y);
      // Where the width changes fast (the rounded ends), fill in along the edge too.
      const gap = Math.abs(ex - last[i]!);
      for (let t = 1; t < gap / 0.2; t++) add(side * (last[i]! + ((ex - last[i]!) * t) / (gap / 0.2)), y - 0.05);
      add(side * ex, y);
      last[i] = ex;
    });
  return RIM;
}
export function hsCoast(x: number, y: number) {
  const oval = hsOval(x, y) + 0.5;
  const kd = Math.hypot(x, y - KY) - 10.5;
  const qx = Math.abs(x - 35.5) - 8, qy = Math.abs(y - 13.5) - 2;
  const sp = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return Math.min(oval, kd, sp + 0.5) - 0.5;
}

/** Extra plateaus under the parts that stick out of the edge: the Kindling ground and the spur (spec coordinates). */
export const HS_LOBES = [
  { x: 0, y: KY + 1, r: 11.5 },
  ...[29, 32, 35, 38, 41, 43].map((x) => ({ x, y: 13.5, r: 2.6 })),
];

/** "The low one": the island the beacon is lit on, in clear view east of Wick's spur and well below it (spec coordinates). */
export const HS_FAR = [{ x: 64, y: 12, r: 8, drop: 5 }];

/** Houses: where each plot's top-left corner is, its size, its letter, and which way its door faces. */
export const HS_HOUSES = [
  { kind: "maudie-house", ch: "M", x: -22, y: -20, w: 7, h: 7, door: "e" },
  { kind: "moth-house", ch: "D", x: -24, y: -1, w: 7, h: 7, door: "e" },
  { kind: "shrine", ch: "S", x: -29, y: 21, w: 6, h: 5, door: "e" },
  { kind: "mabry-house", ch: "g", x: -29, y: 26, w: 5, h: 5, door: "e" },
  { kind: "hesta-house", ch: "R", x: -4, y: 38, w: 7, h: 7, door: "n" },
  { kind: "orrin-house", ch: "I", x: 21, y: 27, w: 7, h: 7, door: "w" },
  { kind: "nell-house", ch: "e", x: 12, y: -28, w: 9, h: 9, door: "w" },
  { kind: "sefa-house", ch: "f", x: 11, y: -10, w: 9, h: 9, door: "w" },
  { kind: "wick-house", ch: "X", x: 21, y: 6, w: 6, h: 6, door: "w" },
] as const;
/** Rook and Lumi's house: 9x9, door east, facing the channel and the statue. */
export const HS_ROOK = { x: -16, y: -42, w: 9, h: 9 };

/** Model turns (radians) by kind, and by tile ("x,y" on the board) for one-offs. Doors face +Z in the models. */
const DOOR_TURN = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 };

/** The island as map rows, and the turns its models need. */
export function horseshoeRows(): { rows: string[]; turns: Record<string, number> } {
  const { w: W, h: H } = HS_SIZE;
  const X = (sx: number) => sx - HS_CENTRE.x + HALF_W, Y = (sy: number) => sy - HS_CENTRE.y + HALF_H;
  const g: string[][] = Array.from({ length: H }, (_, by) =>
    Array.from({ length: W }, (_, bx) => {
      const x = bx - HALF_W + HS_CENTRE.x, y = by - HALF_H + HS_CENTRE.y;
      if (isWater(x, y)) return "~";
      if (!isLand(x, y)) return " ";
      return kindling(x, y) && !outer(x, y) ? ":" : ".";
    }),
  );
  const get = (x: number, y: number) => g[Y(y)]?.[X(x)];
  const set = (x: number, y: number, ch: string, over = ".") => {
    const v = get(x, y);
    if (v !== undefined && over.includes(v)) g[Y(y)]![X(x)] = ch;
  };
  const block = (x: number, y: number, w: number, h: number, ch: string, over = ".,:") => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, ch, over);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, ch = ",") => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      set(x, y, ch);
      set(x + 1, y, ch);
    }
  };
  const turns: Record<string, number> = {};
  const turnAt = (x: number, y: number, a: number) => (turns[`${X(x)},${Y(y)}`] = a);

  // The path right round the U, tip to tip, a few tiles back from the lake (the cove doesn't count).
  const lakeD = new Map<string, number>();
  const q: [number, number][] = [];
  for (let y = -60; y <= 80; y++)
    for (let x = -50; x <= 55; x++)
      if (lake(x, y) && outer(x, y)) (lakeD.set(`${x},${y}`, 0), q.push([x, y]));
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!, d = lakeD.get(`${x},${y}`)!;
    if (d >= 4) continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${x + dx},${y + dy}`;
        if (lakeD.has(k)) continue;
        lakeD.set(k, d + 1);
        q.push([x + dx, y + dy]);
      }
  }
  for (const [k, d] of lakeD) if (d === 3 || d === 4) set(...(k.split(",").map(Number) as [number, number]), ",");

  // The doors: a short path from each to the ring.
  const doorOf = (h: { x: number; y: number; w: number; h: number; door: string }) =>
    h.door === "e" ? [h.x + h.w, h.y + (h.h >> 1)] : h.door === "w" ? [h.x - 1, h.y + (h.h >> 1)] : h.door === "n" ? [h.x + (h.w >> 1), h.y - 1] : [h.x + (h.w >> 1), h.y + h.h];
  const toRing = (dx: number, dy: number) => {
    let best: [number, number] = [dx, dy], bd = Infinity;
    for (const [k, d] of lakeD)
      if (d === 3) {
        const [x, y] = k.split(",").map(Number) as [number, number];
        const dd = Math.hypot(x - dx, y - dy);
        if (dd < bd) (bd = dd), (best = [x, y]);
      }
    line(dx, dy, best[0], best[1]);
  };
  for (const h of HS_HOUSES) {
    if (h.kind === "mabry-house") continue;
    const [dx, dy] = doorOf(h) as [number, number];
    toRing(dx, dy);
  }
  // Rook's door on the channel shore, and the path along it south to the ring.
  line(-7, -38, -7, -31);
  // Round Hesta's house and down the north steps to the Kindling ground.
  line(4, 37, 5, 46);
  line(5, 46, 1, 52);
  line(-1, 53, -1, 56);
  // Out across the open apron to the landing, and past Wick's along the spur to his post.
  line(-20, 11, -28, 10);
  line(20, 13, 41, 13);
  line(20, 14, 41, 14);
  // The pond brazier, by the cove.
  line(-17, -4, -17, 2);

  // Rook and Lumi's house, and its yard.
  const R = HS_ROOK;
  block(R.x, R.y, R.w, R.h, "H");
  for (let x = R.x; x <= R.x + R.w - 2; x++) set(x, -31, "F", ".,");
  set(-23, -33, "Y");
  set(-18, -33, "Y");
  set(-18, -40, "P");
  set(-9, -33, "U");
  // Rosalind's blue flowers, between Rook's and Maudie's.
  set(-14, -27, "L", ".,");
  // Rosalind's bench on the outer west rim, facing out to the sky.
  set(-25, -38, "N");
  turnAt(-25, -38, -Math.PI / 2);

  // The houses round the U.
  for (const h of HS_HOUSES) {
    block(h.x, h.y, h.w, h.h, h.ch);
    turns[h.kind] = DOOR_TURN[h.door];
  }
  // The shrine's yard: a wall behind it (west), a shade tree past each end, the lamp before its
  // steps (east) and the spout basin south of the lamp.
  // The yard is x -29..-19, y 20..31, open east of the steps for the glow test's crowd.
  for (let y = 20; y <= 31; y++) set(-30, y, "W");
  set(-26, 19, "T");
  set(-23, 31, "T");
  set(-22, 22, "A", ".,");
  set(-22, 24, "Q", ".,");
  // The shrine model's steps are on +X already.
  turns.shrine = 0;

  // Hesta's chair on the basin's south shore, facing north up the lake. Nothing between it and the water.
  set(0, 35, "C", ".,");
  turns.chair = Math.PI;

  // The Willing Girl on the east tip, facing the stone and the falls (north-west), her bench 3 south.
  set(7, -44, "Z", ".,");
  turns.statue = (-3 * Math.PI) / 4;
  set(7, -41, "N", ".,");
  set(8, -41, "N", ".,");

  // The falls: the north mouth, where the channel runs off the rim, the stone's column too.
  for (let x = -8; x <= 8; x++) {
    let y = -40;
    while (outer(x, y - 1)) y--;
    // Water still (so the lake runs right to the lip), marked as the falls.
    if (lake(x, y)) set(x, y, "v", "~");
  }
  // The Offering stone in the falls' mouth, water on both sides. Nobody walks to it.
  block(-1, -49, 3, 3, "h", "~");
  // The boat and its mooring on the channel's west shore, on the path from Rook's to Maudie's.
  set(-10, -24, "i", ".,");
  set(-9, -24, "i", ".,");
  set(-7, -23, "j", "~");
  set(-6, -23, "j", "~");

  // The lesson pond's fence: round the cove, open on the brazier's side and to the channel.
  for (let y = -12; y <= -4; y++)
    for (let x = -15; x <= -5; x++) {
      if (get(x, y) !== "." && get(x, y) !== ",") continue;
      if (cove(x, y) || lake(x, y)) continue;
      const byCove = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => cove(x + dx, y + dy) && !lake(x + dx, y + dy)));
      if (!byCove || (x <= -13 && Math.abs(y + 8) <= 1)) continue;
      if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => lake(x + dx, y + dy) && !cove(x + dx, y + dy)))) continue;
      set(x, y, "F", ".,");
    }

  // The landing: planks out over the sky from the west rim beside Moth's, Moth's rail, the skiff at the end.
  // The apron inland of the planks (x -27..-20, y 8..14) stays open for the send-off.
  for (let x = -32; x <= -28; x++) for (let y = 9; y <= 11; y++) set(x, y, ";", " .,");
  set(-33, 9, "K", " ");
  set(-33, 10, "K", " ");
  set(-32, 12, "E", " .");
  set(-31, 12, "E", " .");

  // The Kindling ground: the great brazier in the middle, the north steps up to Hesta's terrace.
  block(-2, KY - 2, 5, 5, "G", ".,:");
  block(-1, 53, 3, 3, ":", ".,");
  // Wick's post near the spur's tip.
  set(42, 13, "J", ".,");

  // Lamp posts along the lake path: on its landward side, about nine tiles apart, each lantern
  // hanging out over the path. The lamp trimmer's ladder leans on the one nearest Nell's house.
  const lamps: [number, number][] = [];
  const ringOut = [...lakeD].filter(([, d]) => d === 4).map(([k]) => k.split(",").map(Number) as [number, number]);
  for (const [px, py] of ringOut.sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    // Away from the water: the tile just past the path.
    const tx = 0, ty = Math.min(py, 19), n = Math.hypot(px - tx, py - ty) || 1;
    const ux = (px - tx) / n, uy = (py - ty) / n;
    const x = Math.round(px + ux * 1.2), y = Math.round(py + uy * 1.2);
    if (get(x, y) !== "." || y < -44 || lamps.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 9)) continue;
    // Clear of the open apron, the shrine yard's crowd room and the chair's view up the lake.
    if ((x >= -27 && x <= -20 && y >= 8 && y <= 14) || (Math.abs(x) <= 3 && y >= 30)) continue;
    lamps.push([x, y]);
    set(x, y, "l");
    // The model's lantern hangs to +X: turned back toward the path.
    turnAt(x, y, Math.atan2(uy, -ux));
  }
  const byNell = lamps.reduce((b, l) => (Math.hypot(l[0] - 10, l[1] + 24) < Math.hypot(b[0] - 10, b[1] + 24) ? l : b), lamps[0]!);
  {
    const a = turns[`${X(byNell[0])},${Y(byNell[1])}`]!;
    // Behind the post, away from the path (the model's -X).
    const x = byNell[0] - Math.round(Math.cos(a)), y = byNell[1] + Math.round(Math.sin(a));
    set(x, y, "k");
    turnAt(x, y, a);
  }

  // The other houses' yards, dressed like Rook's (Ladi; the maps thread's plan, places/yards/README.md),
  // with things that say who lives there. All on plain ground: a miss here means the board moved.
  const toS = -Math.PI / 2, toW = Math.PI;
  const yard = (x: number, y: number, ch: string, w = 1, h = 1, turn?: number) => {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (get(x + i, y + j) !== ".") throw new Error(`horseshoe: yard ${ch} at ${x + i},${y + j} is not plain ground`);
        set(x + i, y + j, ch);
      }
    if (turn !== undefined) turnAt(x, y, turn);
  };
  // Nell's (Jarek, Hania): Hania's hives in a fenced bee garden, Jarek's lamp oil by his ladder, wash, wood.
  for (let x = 14; x <= 23; x++) yard(x, -35, "F");
  for (const x of [15, 17, 19, 21]) yard(x, -32, "q", 1, 1, toS);
  yard(15, -18, "U");
  yard(21, -23, "P");
  yard(18, -16, "Y");
  yard(22, -16, "Y");
  // Sefa's (Manu, Sina, Mele): Sina's mats and baskets, Manu's plots with a fence, barrow and rain barrel, wash.
  for (let x = 18; x <= 25; x++) yard(x, 4, "F");
  yard(14, -12, "m", 2, 1);
  yard(12, -11, "s");
  yard(17, -14, "Y");
  yard(21, -14, "Y");
  for (const x of [14, 18, 22]) yard(x, 1, "p", 3, 2);
  yard(25, -1, "w", 1, 1, toW);
  yard(21, -1, "U");
  // Wick's.
  yard(27, 7, "r", 1, 1, toW);
  yard(27, 10, "U");
  yard(25, 12, "P");
  // Orrin's: crates of panes by the stall.
  yard(20, 32, "n");
  yard(22, 26, "n");
  yard(24, 26, "U");
  yard(27, 25, "P");
  yard(24, 22, "Y");
  yard(28, 22, "Y");
  // Maudie's: a kitchen garden and a wash line.
  yard(-21, -26, "p", 3, 2);
  yard(-21, -22, "Y");
  yard(-17, -22, "Y");
  yard(-15, -20, "U");
  yard(-22, -13, "P");
  // Moth's: landing cargo, outside the apron.
  yard(-24, 6, "r", 1, 1, toS);
  yard(-25, 4, "U");
  yard(-25, 0, "P");

  // Where the walk starts: Rook and Lumi by the pond brazier.
  set(-17, -3, "1", ".,");
  set(-16, -3, "2", ".,");
  return { rows: g.map((r) => r.join("")), turns };
}
