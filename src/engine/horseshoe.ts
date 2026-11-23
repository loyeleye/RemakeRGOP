// The home island as a horseshoe (maps thread, draft 3, approved by Ladi on 23 Nov 2026).
// Spec: project files sogni/lanternfall/production/places/home-island-horseshoe-spec.md, shapes from
// home-island-horseshoe-draft-3.py. Coordinates as the spec has them: tiles, x east, y south, the
// origin in the middle of the lake channel. The board is centred on the pond brazier (the game
// always puts the brazier at the board's centre), so everything here is placed from spec coordinates.

/** The pond brazier, by the lesson pond cove: the board's centre. */
export const HS_CENTRE = { x: -17, y: -8 };
/** Board half-sizes round the centre: wide enough for the east point spur, tall enough for the Kindling ground. */
const HALF_W = 70, HALF_H = 87;
export const HS_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };

const wob = (a: number, amp: number) => (amp * (Math.sin(3 * a + 0.7) + 0.6 * Math.sin(5 * a + 2.1) + 0.4 * Math.sin(9 * a + 4.0))) / 2;
/** The outer edge: 41 wide each way, 53 tall to the north and 58 to the south, a gentle wobble. */
const outerQ = (x: number, y: number) => {
  const B = y < 0 ? 53 : 58, a = Math.atan2(y, x);
  return Math.sqrt((x / 41) ** 2 + (y / B) ** 2) / (1 + wob(a, 0.05));
};
const outer = (x: number, y: number) => outerQ(x, y) < 1;
/** The keyhole lake: a wavy channel out through the north rim, and a round basin at the bottom. */
export function lake(x: number, y: number) {
  let w = 7.5 + 1.2 * Math.sin(y * 0.21);
  if (y < -36) w -= (-36 - y) * 0.12;
  const ch = Math.abs(x) < w && -60 < y && y < 12;
  const basin = (x * x) / 18 ** 2 + (y - 19) ** 2 / 15 ** 2 < 1;
  return ch || basin;
}
const cove = (x: number, y: number) => (x + 10) ** 2 / 12 + (y + 8) ** 2 / 9 < 1;
const kindling = (x: number, y: number) => x * x + (y - 65) ** 2 < 10.5 ** 2;
const spur = (x: number, y: number) => x >= 37 && x <= 50 && y >= 12 && y <= 15;
export const isLand = (x: number, y: number) => outer(x, y) || kindling(x, y) || spur(x, y);
export const isWater = (x: number, y: number) => (lake(x, y) || cove(x, y)) && outer(x, y);

/**
 * Roughly how far (x, y) is from the island's edge, in tiles, negative on land, for drawing the
 * coast: the oval, the Kindling bulge and the spur, joined.
 */
export function hsOval(x: number, y: number) {
  const B = y < 0 ? 53 : 58, a = Math.atan2(y, x);
  const r = (1 + wob(a, 0.05)) / Math.sqrt((Math.cos(a) / 41) ** 2 + (Math.sin(a) / B) ** 2);
  return (outerQ(x, y) - 1) * r - 0.5;
}
export function hsCoast(x: number, y: number) {
  const oval = hsOval(x, y) + 0.5;
  const kd = Math.hypot(x, y - 65) - 10.5;
  const qx = Math.abs(x - 43.5) - 7, qy = Math.abs(y - 13.5) - 2;
  const sp = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return Math.min(oval, kd, sp + 0.5) - 0.5;
}

/** Extra plateaus under the parts that stick out of the oval: the Kindling ground and the spur (spec coordinates). */
export const HS_LOBES = [
  { x: 0, y: 66, r: 11.5 },
  ...[39, 42, 45, 48, 50].map((x) => ({ x, y: 13.5, r: 2.6 })),
];

/** Houses: where each plot's top-left corner is, its size, its letter, and which way its door faces. */
export const HS_HOUSES = [
  { kind: "maudie-house", ch: "M", x: -22, y: -20, w: 7, h: 7, door: "e" },
  { kind: "moth-house", ch: "D", x: -33, y: 4, w: 7, h: 7, door: "e" },
  { kind: "shrine", ch: "S", x: -28, y: 26, w: 6, h: 5, door: "e" },
  { kind: "mabry-house", ch: "g", x: -28, y: 32, w: 5, h: 5, door: "e" },
  { kind: "hesta-house", ch: "R", x: -4, y: 38, w: 7, h: 7, door: "n" },
  { kind: "orrin-house", ch: "I", x: 17, y: 28, w: 7, h: 7, door: "w" },
  { kind: "nell-house", ch: "e", x: 12, y: -26, w: 6, h: 6, door: "w" },
  { kind: "sefa-house", ch: "f", x: 13, y: -8, w: 6, h: 6, door: "s" },
  { kind: "wick-house", ch: "X", x: 26, y: 8, w: 6, h: 6, door: "s" },
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
  // Out to the landing past Moth's, and along the spur to Wick's post.
  line(-27, 12, -38, 9);
  line(29, 15, 47, 13);
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
  set(-27, -38, "N");
  turnAt(-27, -38, -Math.PI / 2);

  // The houses round the U.
  for (const h of HS_HOUSES) {
    block(h.x, h.y, h.w, h.h, h.ch);
    turns[h.kind] = DOOR_TURN[h.door];
  }
  // The shrine's yard: a wall behind it (west), a shade tree past each end, the lamp before its
  // steps (east) and the spout basin south of the lamp.
  for (let y = 25; y <= 31; y++) set(-30, y, "W");
  set(-30, 23, "T");
  set(-31, 33, "T");
  set(-21, 27, "A", ".,");
  set(-21, 29, "Q", ".,");
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

  // The falls: the north mouth, where the channel runs off the rim.
  for (let x = -8; x <= 8; x++) {
    let y = -40;
    while (outer(x, y - 1)) y--;
    if (lake(x, y) && !(x >= -1 && x <= 1)) set(x, y, "V", "~");
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
  for (let x = -43; x <= -38; x++) for (let y = 8; y <= 10; y++) set(x, y, ";", " .,");
  set(-44, 8, "K", " ");
  set(-44, 9, "K", " ");
  set(-43, 11, "E", " .");
  set(-42, 11, "E", " .");

  // The Kindling ground: the great brazier in the middle, the north steps up to Hesta's terrace.
  block(-2, 63, 5, 5, "G", ".,:");
  block(-1, 53, 3, 3, ":", ".,");
  // Wick's post near the spur's tip.
  set(49, 13, "J", ".,");

  // Where the walk starts: Rook and Lumi by the pond brazier.
  set(-17, -3, "1", ".,");
  set(-16, -3, "2", ".,");
  return { rows: g.map((r) => r.join("")), turns };
}
