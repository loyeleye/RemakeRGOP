// Optional run 3b, Tidepool Steps, the tide job (Marit): the numbers that set its feel, and the
// terraced board, in one place. Drafts, to be judged by playing (gameplay/optional-runs-prototype-brief.md, card O3b).
// The player is Rook, with Lumi to send. Marit wants eight by the turn of the tide.
// The island is a rounded square of terraces rising outward from a flat court round the brazier.
// On each of the four sides a cascade: a deep pool on every step, with tidal strips of wet stone
// beside it. Wisps come up in the top pools. Each time the tide goes out, every pool spills a step
// down and its wisps are left on the strips of the step below; off the bottom step they are gone.
// The limit: Rook's staff will not hold a wisp over water, so he takes one only where it is left on
// stone, with the tide out. The choice: wait low, where every side comes down to the court, or climb
// the corner stairs for one now. Lumi, sent, pulls across water: the third answer.
// The board is the maps thread's plan (sogni/lanternfall/production/places/tidepool-terraces/,
// sketches/plan.py, draft 1): tiles from the brazier, x east, y south.

export const TIDEPOOL = {
  id: "o3b",
  run: "Tidepool Steps",
  title: "Tidepool Steps",
  shrine: "tidepool-terraces",
  bellTicks: 4,
  /** Marit's count. */
  target: 8,
  /**
   * The tide. It starts in, for `firstIn` ticks, then is out for `out` and in for `in`, over and
   * over. `warn`: the water is seen coming this many ticks before it is in. The job ends as the
   * last tide out turns.
   */
  tide: { firstIn: 14, out: 14, in: 12, warn: 4 },
  /**
   * The low steps drain last and flood first: each step below the top is uncovered this many ticks
   * later after the tide turns out, and covered again this many ticks sooner before it turns in.
   * So at the bottom everything comes down at once, for a short while; up high there is time.
   * Off (0) for now: with it on, the court was too short a wait to be worth it (tools/tidepool-sim.ts).
   */
  lag: 0,
  /** How many times the tide goes out in the job. */
  tides: 6,
  /** Each time the tide comes in (the first is the start), this many new wisps come up in the top pools, the first `rich` of them in one side's pool. More come later than early: waiting at the bottom misses the last of them. */
  rise: [2, 2, 3, 4, 5, 5] as readonly number[],
  rich: 2,
  /** At the start, wisps already on the way down: this many in the pool of each step (bottom first), on sides picked at random. One on step 2 is left on the bottom step at the first ebb, so the first thing he learns is that they land. */
  seed: [0, 1, 0, 0, 0] as readonly number[],
  /** How far Rook's staff reaches, on stone (the game's usual pull is 10): about a step and a half. */
  reach: 4,
  /** A wisp is his when it is this near him, on stone. */
  feet: 1,
  /** Lumi, sent: how far her pull reaches over the water, and how far round her it draws the loose ones on her pool. */
  lumiReach: 5,
  lumiDraw: 4,
  /** How many times she can be sent in a job (the gameplay thread, 25 Nov: so that she does not take the place of climbing or waiting). 99: any number. */
  lumiSends: 2,
  /** The stand-in sends her only to a spot where she would reach at least this many on the water. */
  lumiWorth: 2,
  /** The stand-in sends her no farther than this many steps from where he will wait (99: anywhere). */
  lumiNear: 99,
  /** The goal stays up this long as a caption (6 seconds). */
  goalTicks: 10,
  /** A line that names the choice stays up this long. */
  landTicks: 10,
  /** "Patience. Good.": this many left within his reach in one tide, with him on the court or the bottom step. */
  patience: 3,
  /** Where they stand at the start (on the court, south of the fire), and where Marit waits. */
  rook: [0, 3] as const,
  lumi: [1, 3] as const,
  marit: [-3, 2] as const,
  /** On a phone, how many tiles the short side of the screen shows (12 is usual): more, so a step or two above is in sight. */
  phoneSpan: 18,
} as const;

// ---------------------------------------------------------------- the board (plan.py, draft 1)

/** Squareness of the rings (superellipse power), the court's radius, each terrace front to back, how many. */
export const TP = { P: 4, court: 5, depth: 3, steps: 5, stair: 1.6, strip: 2.5, rise: 0.3 } as const;
export const TP_RIM = TP.court + TP.depth * TP.steps;
/** The deep pool's width on step k, widening outward so the strips line up for pulls in. */
export const tpPoolWidth = (k: number) => 2 + k;
const HALF = TP_RIM + 1;
export const TP_SIZE = { w: HALF * 2 + 1, h: HALF * 2 + 1 };
export const TP_FRAME = { x0: -HALF, y0: -HALF, x1: HALF, y1: HALF };

export type TpKind = "brazier" | "court" | "pool" | "strip" | "ledge" | "dry" | "stairs" | "rim" | "sky";
export type TpSide = "n" | "e" | "s" | "w";
export const TP_SIDES: readonly TpSide[] = ["n", "e", "s", "w"];

export const tpNorm = (x: number, y: number) => (Math.abs(x) ** TP.P + Math.abs(y) ** TP.P) ** (1 / TP.P);

/** What a tile is (from the brazier), and the step it is on (0 the court, 1 the lowest terrace, `TP.steps` the top). */
export function tpCell(x: number, y: number): { kind: TpKind; k: number } {
  const n = tpNorm(x, y);
  if (x === 0 && y === 0) return { kind: "brazier", k: 0 };
  if (n < TP.court) return { kind: "court", k: 0 };
  if (n >= TP_RIM + 0.6) return { kind: "sky", k: -1 };
  if (n >= TP_RIM) return { kind: "rim", k: TP.steps };
  const k = Math.floor((n - TP.court) / TP.depth) + 1, u = n - TP.court - TP.depth * (k - 1);
  const t = Math.abs(y) >= Math.abs(x) ? x : y;
  if (Math.abs(Math.abs(x) - Math.abs(y)) <= TP.stair) return { kind: "stairs", k };
  if (u < 1) return { kind: "ledge", k };
  if (Math.abs(t) <= tpPoolWidth(k) / 2) return { kind: "pool", k };
  if (Math.abs(t) <= tpPoolWidth(k) / 2 + TP.strip) return { kind: "strip", k };
  return { kind: "dry", k };
}

/** Which side of the island a tile is on: the cascade it belongs to. */
export function tpSide(x: number, y: number): TpSide {
  return Math.abs(y) >= Math.abs(x) ? (y < 0 ? "n" : "s") : x > 0 ? "e" : "w";
}

/** The board as map rows: ground, the ledges (walkers can't cross, wisps pass down), the deep pools, and Rook's start. The strips are open ground here; the tide floods them. */
export function tidepoolRows(): string[] {
  const g: string[][] = Array.from({ length: TP_SIZE.h }, (_, by) =>
    Array.from({ length: TP_SIZE.w }, (_, bx) => {
      const k = tpCell(bx - HALF, by - HALF).kind;
      return k === "sky" ? " " : k === "pool" ? "≈" : k === "ledge" ? "@" : k === "brazier" ? "B" : ".";
    }),
  );
  g[TIDEPOOL.rook[1] + HALF]![TIDEPOOL.rook[0] + HALF] = "1";
  return g.map((r) => r.join(""));
}

/** Every tile of a kind, as offsets from the brazier, with its step and side. */
export function tpTiles(kind: TpKind): { x: number; y: number; k: number; side: TpSide }[] {
  const out: { x: number; y: number; k: number; side: TpSide }[] = [];
  for (let y = -HALF; y <= HALF; y++)
    for (let x = -HALF; x <= HALF; x++) {
      const c = tpCell(x, y);
      if (c.kind === kind) out.push({ x, y, k: c.k, side: tpSide(x, y) });
    }
  return out;
}

/** About how far (x, y) is outside the island, in tiles from the brazier, negative on land. */
export function tpCoast(x: number, y: number) {
  return tpNorm(x, y) - (TP_RIM + 0.5);
}
/** How far the island's edge is from the brazier at each angle. */
export function tpOutline(a: number) {
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return (TP_RIM + 0.5) / (c ** TP.P + s ** TP.P) ** (1 / TP.P);
}

// ---------------------------------------------------------------- the tide

/** How many ticks the job lasts: it ends as the last tide out turns. */
export const tidepoolTicks = () => TIDEPOOL.tide.firstIn + TIDEPOOL.tides * TIDEPOOL.tide.out + (TIDEPOOL.tides - 1) * TIDEPOOL.tide.in;

/** The tide on a tick: in or out, how many times it has gone out (0 before the first), ticks left of this state and its length. */
export function tidepoolTide(tick: number): { in: boolean; n: number; left: number; of: number } {
  const T = TIDEPOOL.tide;
  if (tick < T.firstIn) return { in: true, n: 0, left: T.firstIn - tick, of: T.firstIn };
  const t = tick - T.firstIn, cycle = T.in + T.out, n = Math.floor(t / cycle) + 1, r = t % cycle;
  return r < T.out ? { in: false, n, left: T.out - r, of: T.out } : { in: true, n, left: cycle - r, of: T.in };
}

/** How long step k waits after the tide turns out before its strips are stone, and stops before it turns in. */
export const tpLag = (k: number) => Math.round(TIDEPOOL.lag * (TP.steps - k));

/** Whether step k's strips are stone on a tick, and for how many more ticks (or how many until they are). */
export function tpStepDry(tick: number, k: number): { dry: boolean; left: number } {
  const s = tidepoolTide(tick), d = tpLag(k);
  if (s.in || s.n === 0) return { dry: false, left: (s.in ? s.left : 0) + d };
  const into = s.of - s.left;
  if (into < d) return { dry: false, left: d - into };
  if (s.left <= d) return { dry: false, left: s.left + TIDEPOOL.tide.in + d };
  return { dry: true, left: s.left - d };
}

/** How high the water stands over the strips, 0 (out) to 1 (in): it comes in over `warn` ticks and goes out over two. */
export function tidepoolLevel(tick: number): number {
  const s = tidepoolTide(tick), W = TIDEPOOL.tide.warn;
  if (!s.in) return s.left <= W && tick < tidepoolTicks() ? 0.6 * (1 - s.left / W) : s.of - s.left < 2 ? 1 - 0.5 * (s.of - s.left) : 0;
  return 1;
}
