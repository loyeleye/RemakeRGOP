// Optional run 3c, Kes's rematch on a windy day: the numbers that set its feel, and the wind's
// course over Kite Fell, in one place. Drafts, to be judged by playing
// (gameplay/optional-runs-prototype-brief.md, card O3c).
// The player is Rook, against Kes; Lumi referees. First to six. The wind comes in over the west rim
// and carries loose wisps east along a course that splits at the brazier into a north arm and a
// south arm, each running past a vane and off the edge. A staff takes hold only from a vane's
// mark, so a wisp is taken as it goes by or not at all.
// The limit: a wisp passes each spot once. The choice: which arm's vane to stand at. They come in
// gusts, most of a gust down one arm, and Kes takes the vane he does not.
// The course is the maps thread's plan (sogni/lanternfall/production/places/kite-fell-course):
// tiles from the race brazier, x east, y south.

export const KITE = {
  id: "o3c",
  run: "Kes's rematch",
  title: "Kes's rematch on the Fell",
  shrine: "kite-fell",
  bellTicks: 4,
  /** First to this many. */
  target: 6,
  /** Long enough never to run out. */
  ticks: 600,
  /** How far the wind carries a loose wisp each tick, in tiles, and how wide the course is. */
  wind: 1.5,
  width: 4,
  /**
   * The gusts. One every `every` ticks: `rich` wisps down one arm and `lone` down the other,
   * `apart` tiles behind one another. The same arm is never the rich one more than `same` gusts
   * running. The first gust is already `head` tiles along when play starts.
   */
  gust: { every: 30, rich: 2, lone: 1, apart: 3, same: 2, head: 20 },
  /** How far a staff reaches from a vane's mark, and how near the mark he must stand for it to take hold. */
  reach: 7,
  spot: 2,
  /**
   * Kes. She takes the vane he is not at. When he has taken `press` more than she has since she
   * last moved, she comes over to his: there she takes hold of a wisp `quick` ticks after it comes
   * into her reach, if he has not. `slow`: ticks she stands after a wisp is hers before she
   * reaches again.
   */
  kes: { press: 2, quick: 0, slow: 0 },
  /** The goal stays up this long as a caption (6 seconds); a line that names the choice as long. */
  goalTicks: 10,
  landTicks: 10,
  /** "Oh, you saw that one coming.": this many of one gust taken. */
  run2: 2,
  /** Where they start (tiles from the brazier): Rook and Kes by the fire, either side of the course. */
  rookAt: [4, -3] as const,
  kesAt: [4, 4] as const,
} as const;

export type Arm = "n" | "s";

/** The course: the trunk in from the west rim to the split, and the two arms from the split off the edge. */
export const KT_TRUNK: readonly (readonly [number, number])[] = [[-40, 5], [-20, 3], [-3, 0]];
export const KT_ARMS: Record<Arm, readonly (readonly [number, number])[]> = {
  n: [[-3, 0], [6, -4], [15, -9.5], [22, -15], [38, -26]],
  s: [[-3, 0], [5, 3.5], [11, 8.5], [16.5, 16], [29, 29]],
};
/** The two east vanes (the board's own), and the mark by each where a lamplighter stands. */
export const KT_VANES: Record<Arm, { vane: readonly [number, number]; mark: readonly [number, number] }> = {
  n: { vane: [23, -13], mark: [24, -12] },
  s: { vane: [19, 16], mark: [20, 14] },
};

const len = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lengthOf = (pts: readonly (readonly [number, number])[]) => pts.slice(1).reduce((n, p, i) => n + len(pts[i]!, p), 0);
/** The trunk's length: an arm's own distances start from here. */
export const KT_SPLIT = lengthOf(KT_TRUNK);
/** A wisp's whole way down one arm: the trunk and then the arm. */
export const ktPath = (arm: Arm) => [...KT_TRUNK, ...KT_ARMS[arm].slice(1)];
export const ktLength = (arm: Arm) => lengthOf(ktPath(arm));

/** The point `s` tiles along an arm's way (from the west rim), and the way the wind blows there (a unit step). */
export function ktAt(arm: Arm, s: number): { x: number; y: number; dx: number; dy: number } {
  const pts = ktPath(arm);
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, d = len(a, b);
    if (left <= d || i === pts.length - 1) {
      const k = left / d;
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: (b[0] - a[0]) / d, dy: (b[1] - a[1]) / d };
    }
    left -= d;
  }
  return { x: 0, y: 0, dx: 1, dy: 0 };
}

/**
 * The tile a wisp is on, `s` along an arm's way and `lat` tiles to the right of the wind (south, on
 * the trunk). Each arm's wisps keep to their own side of the trunk and round the brazier, and
 * come in to the middle of their arm after the split.
 */
export function ktTile(arm: Arm, s: number, lat: number): [number, number] {
  const p = ktAt(arm, s), side = lat * Math.max(0, Math.min(1, (KT_SPLIT + 14 - s) / 8));
  return [Math.round(p.x - p.dy * side), Math.round(p.y + p.dx * side)];
}

/** Where (x, y) is on an arm's way: how far along, how far to the right of it, and how far off it in all. */
export function ktOn(arm: Arm, x: number, y: number): { s: number; lat: number; off: number } {
  const pts = ktPath(arm);
  let best = { s: 0, lat: 0, off: Infinity }, along = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, d = len(a, b), ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
    const t = Math.max(0, Math.min(d, (x - a[0]) * ux + (y - a[1]) * uy));
    const px = a[0] + ux * t, py = a[1] + uy * t, off = Math.hypot(x - px, y - py);
    if (off < best.off) best = { s: along + t, lat: (x - px) * -uy + (y - py) * ux, off };
    along += d;
  }
  return best;
}

/** How far along its arm's way each vane's mark is: a wisp farther on than this has gone by. */
export const ktVaneAt = (arm: Arm) => ktOn(arm, KT_VANES[arm].vane[0], KT_VANES[arm].vane[1]).s;
