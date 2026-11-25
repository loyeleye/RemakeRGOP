// Optional run 2, Lumi's lesson with Kes: the numbers that set its feel, and the Cove's board, in
// one place. Drafts, to be judged by playing (gameplay/optional-runs-prototype-brief.md, card O2).
// The player is Lumi. Kes, on the shore, strings what she lands; Nell watches. The Cove is mostly
// water. While the tide is in, the flats are under water, Lumi stands where she was when it came
// in, and her pull brings wisps to her across the water. While it is out, the flats are wet stone:
// a wisp left on them is walked to, and her staff slips on the ones still in the pools.
// The limit is the tide. The choice is where to stand for the next one.
// The board is the maps thread's plan (sogni/lanternfall/production/places/cove/README.md): tiles
// from the pond brazier, x east, y south.

export const COVE = {
  id: "o2",
  run: "Lumi's lesson with Kes",
  title: "Lumi's lesson with Kes",
  shrine: "cove",
  bellTicks: 4,
  /** Kes's strings: how many, and how many wisps fill one. */
  strings: 3,
  perString: 3,
  /**
   * The tide. It starts out, for `firstOut` ticks, then is in for `in` and out for `out`, over and
   * over. `warn`: the water is seen coming this many ticks before it is in.
   */
  tide: { firstOut: 14, in: 16, out: 20, warn: 5 },
  /** The light goes at the end of this many tides in. */
  tides: 5,
  /** How far her pull reaches over the water (the game's usual pull is 10), and how far round her it draws the loose ones on the water. */
  reach: 7,
  draw: 7,
  /** With the tide out, a wisp on wet stone is hers when she is this near it. */
  feet: 1,
  /**
   * What comes up each tide: this many in one pool (the rich one), and one in each of this many
   * other pools. The rich pool is never on the side of the cove the last one was.
   */
  rich: 3,
  singles: 1,
  /** The goal stays up this long as a caption (6 seconds). */
  goalTicks: 10,
  /** A line that names the choice stays up this long. */
  landTicks: 10,
  /** Where they stand: Lumi starts by the fire, Kes strings beside it, Nell watches from behind. */
  lumi: [2, 1] as const,
  kes: [1, -2] as const,
  nell: [-3, 3] as const,
  /** Nell asks for the far one once she has taken hold of a wisp from this far. */
  far: 5,
} as const;

/** How many ticks of light there are: the light goes as the last tide turns. */
export const coveTicks = () => COVE.tide.firstOut + COVE.tides * (COVE.tide.in + COVE.tide.out) - COVE.tide.out;

/** The tide on a tick: in or out, which tide it is (0 before the first, then 1, 2, ...), ticks left of this state and its length. */
export function coveTide(tick: number): { in: boolean; n: number; left: number; of: number } {
  const T = COVE.tide;
  if (tick < T.firstOut) return { in: false, n: 0, left: T.firstOut - tick, of: T.firstOut };
  const t = tick - T.firstOut, cycle = T.in + T.out, n = Math.floor(t / cycle) + 1, r = t % cycle;
  return r < T.in ? { in: true, n, left: T.in - r, of: T.in } : { in: false, n, left: cycle - r, of: T.out };
}

/** How high the water stands over the flats on a tick, 0 (out) to 1 (in): it comes in over `warn` ticks and goes out over two. */
export function coveLevel(tick: number): number {
  const s = coveTide(tick), W = COVE.tide.warn;
  if (s.in) return s.left <= 2 && tick < coveTicks() ? 0.6 + 0.4 * (s.left / 2) : 1;
  if (s.left <= W) return 0.6 * (1 - s.left / W);
  return s.of - s.left < 2 ? 0.6 * (1 - (s.of - s.left) / 2) : 0;
}

// ---------------------------------------------------------------- the board

/** The island's ground round the cove. */
export const CV_ISLE = { x: 12, y: 0, rx: 21.5, ry: 15.2 };
/** The cove: a wobbly oval, open east to the lake channel. */
export const CV_OVAL = { x: 15, y: 0, rx: 14.5, ry: 11 };
/** Deep water, always water: an oval in the middle, and the channel out to the lake. */
export const CV_DEEP = { x: 17, y: 0, rx: 9, ry: 4 };
export const CV_CHANNEL = { x0: 25, hy: 2.5 };
/** The five tide pools (always water), with the side of the cove each is on: where the wisps come up. */
export const CV_POOLS: readonly { x: number; y: number; r: number; side: "west" | "north" | "south" | "east" }[] = [
  { x: 5, y: -3, r: 1.9, side: "west" },
  { x: 5, y: 3, r: 1.9, side: "west" },
  { x: 12, y: -10, r: 1.9, side: "north" },
  { x: 12, y: 10, r: 1.9, side: "south" },
  { x: 24, y: -6, r: 1.9, side: "east" },
];
/** The five standing stones, always dry, two tiles square: the tile nearest the brazier and the north of each. */
export const CV_STONES: readonly (readonly [number, number])[] = [[7, -6], [7, 5], [15, -8], [15, 7], [21, 0]];
/**
 * A ford to the stone in the deep water: wet stone at low tide, like the flats. (Mine, not the
 * maps thread's: on its plan that stone stands in water that never drains, so nobody could get to it.)
 */
export const CV_FORD = { x0: 21, x1: 22, y0: -4, y1: -1 };
/** Dry ground round the brazier, where Kes and Nell are. */
export const CV_APRON = 3.6;
/** The part of the board worth looking at, in tiles from the brazier. */
export const CV_FRAME = { x0: -9, y0: -15, x1: 33, y1: 15 };
const HALF_W = 34, HALF_H = 16;
export const CV_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };

const wob = (a: number) => 1 + 0.03 * Math.sin(3 * a + 0.7) + 0.02 * Math.sin(5 * a + 2.1);
const inOval = (o: { x: number; y: number; rx: number; ry: number }, x: number, y: number, grow = 0, wobble = false) =>
  Math.hypot((x - o.x) / (o.rx + grow), (y - o.y) / (o.ry + grow)) <= (wobble ? wob(Math.atan2(y - o.y, x - o.x)) : 1);
const isle = (x: number, y: number) => inOval(CV_ISLE, x, y);
const channel = (x: number, y: number) => x >= CV_CHANNEL.x0 && Math.abs(y) <= CV_CHANNEL.hy;
const stone = (x: number, y: number) => CV_STONES.some(([sx, sy]) => x >= sx && x <= sx + 1 && y >= sy && y <= sy + 1);
const ford = (x: number, y: number) => x >= CV_FORD.x0 && x <= CV_FORD.x1 && y >= CV_FORD.y0 && y <= CV_FORD.y1;

export type CoveGround = "sky" | "land" | "fence" | "stone" | "pool" | "deep" | "flat";

/** What is at a tile (from the brazier): sky, the island's ground, the fence, a standing stone, a tide pool, deep water, or a flat the tide covers. */
export function coveGround(x: number, y: number): CoveGround {
  if (!isle(x, y)) return "sky";
  if (Math.hypot(x, y) <= CV_APRON) return "land";
  if (stone(x, y)) return "stone";
  const cove = inOval(CV_OVAL, x, y, 0, true) || (channel(x, y) && x > CV_OVAL.x);
  if (!cove) {
    // The fence: round the land edge, open west by the brazier and east at the channel.
    const band = inOval(CV_OVAL, x, y, 2.7, true) && !inOval(CV_OVAL, x, y, 1.7, true);
    return band && Math.hypot(x, y) > 7 && !(x >= CV_CHANNEL.x0 && Math.abs(y) <= CV_CHANNEL.hy + 3) ? "fence" : "land";
  }
  if (CV_POOLS.some((p) => Math.hypot(x - p.x, y - p.y) <= p.r)) return "pool";
  if (ford(x, y)) return "flat";
  if (inOval(CV_DEEP, x, y) || channel(x, y)) return "deep";
  return "flat";
}

/** About how far (x, y) is outside the island's ground, in tiles from the brazier, negative on land. */
export function cvCoast(x: number, y: number) {
  const px = x - CV_ISLE.x, py = y - CV_ISLE.y;
  const g = Math.hypot(px / CV_ISLE.rx, py / CV_ISLE.ry) || 1e-6;
  return (g - 1) / (Math.hypot(px / CV_ISLE.rx ** 2, py / CV_ISLE.ry ** 2) / g) - 0.5;
}
/** How far the island's edge is from its own middle at each angle (the plateau hangs from there). */
export function cvOutline(a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return 1 / Math.hypot(c / CV_ISLE.rx, s / CV_ISLE.ry);
}
/** How far the land runs from the brazier at each angle. */
export function cvFromBrazier(a: number) {
  let r = 2;
  while (r < 60 && isle(Math.cos(a) * (r + 0.25), Math.sin(a) * (r + 0.25))) r += 0.25;
  return r;
}

/** The Cove as map rows, as it is with the tide out: ground, fence, deep water, the pools, and Lumi's start. The flats are open ground here; the run floods them. */
export function coveRows(): string[] {
  const g: string[][] = Array.from({ length: CV_SIZE.h }, (_, by) =>
    Array.from({ length: CV_SIZE.w }, (_, bx) => {
      const k = coveGround(bx - HALF_W, by - HALF_H);
      return k === "sky" ? " " : k === "fence" ? "F" : k === "pool" ? "~" : k === "deep" ? "≈" : ".";
    }),
  );
  g[COVE.lumi[1] + HALF_H]![COVE.lumi[0] + HALF_W] = "1";
  return g.map((r) => r.join(""));
}

/** The tiles the tide covers, as offsets from the brazier. */
export function coveFlats(): [number, number][] {
  const out: [number, number][] = [];
  for (let y = -HALF_H; y <= HALF_H; y++) for (let x = -HALF_W; x <= HALF_W; x++) if (coveGround(x, y) === "flat") out.push([x, y]);
  return out;
}
