// Story run 4, A job: the numbers that set its feel, in one place.
// The player is Rook; Lumi is his partner on the board, sent to a tile with a tap. Hesta is the
// voice in his ear and plans the route. Two stops on other people's islands, one after the other.
// Build brief: project files gameplay/run4-prototype-brief.md. Counts, clocks and lines are drafts.

import { Tile, cheb, pt, type Board, type Pt } from "./board.js";

export const JOB = {
  run: "A job",
  /** Ticks of the bell before each stop. A restart skips the bell and waits this long instead. */
  bellTicks: 7,
  restartTicks: 2,
  /** Lumi, sent: how far round her she tears moss. Her barks are bubbles, not voiced, at most one per `barkGap` ticks. */
  lumi: { clearReach: 3, barkGap: 33, unsentFor: 50 },
  /** Hesta's one hint: Lumi on a pool's far bank this long while the wisps go the wrong way. */
  farBankFor: 15,
  /** Ticks of quiet after the closing lines, before the results. */
  outroTail: 3,
  stops: [
    {
      title: "Moss Hollow",
      shrine: "moss-hollow",
      keeper: "Garrick",
      /** Draft: bank this many in this many ticks. One send to the thicket should leave about a third. */
      goal: 6,
      ticks: 180,
      wisps: 3,
      /** Offsets from the brazier's centre (y grows south). Rook and Lumi start west, the keeper by the fire. */
      rook: { x: -6, y: 1 },
      lumiStart: { x: -6, y: -2 },
      keeperAt: { x: -3, y: 5 },
      /** The thicket: wisps come up east of a moss wall (columns `wall`, rows `rows`), out of Rook's easy lines. */
      wall: [7, 8],
      rows: [-6, 6],
      spawnX: [11, 14],
      lines: {
        route: "Moss Hollow first. Send Sparkbug ahead to tear the moss, then pull behind her. It grows back.",
        greet: ["Rook! About time. It's up to my knees this year.", "And this is Rosalind's girl. You've got her hair."],
        lumiGreet: "I know.",
        done: "That'll hold till spring. Tell Granny I owe her a jar.",
        again: "Again, Rook. Moss first.",
      },
    },
    {
      title: "Tidepool Steps",
      shrine: "tidepool-steps",
      keeper: "Marit",
      /** Draft (Ladi, 23 Nov: "add more pools"): bank this many in this many ticks, all off the pools. */
      goal: 10,
      ticks: 380,
      wisps: 3,
      onWater: 8,
      /**
       * The wisps come in waves, `sizes` of them a wave, each on one pool and never on the same side
       * of the fire twice running. The next wave comes `gap` ticks after the last one is banked, and
       * its pool shimmers for those ticks first. Pools: the big ones on each side (see stepsPools).
       */
      waves: { sizes: [3, 3, 2, 2] as readonly number[], gap: 6, firstAt: 6 },
      /** Hesta's far-bank hint: Lumi this much further out than the wave's pool's fire side. */
      farBy: 4,
      rook: { x: 4, y: 3 },
      lumiStart: { x: 4, y: -3 },
      keeperAt: { x: -4, y: 3 },
      lines: {
        route: "Now the pools. Stand her on the fire side, and pull while the tide's coming in. It turns against you after.",
        greet: ["Rook. Good. Half of them are out on the water again.", "Granny said you'd bring someone for the water."],
        turned: "Tide's turned. Wait for it.",
        back: "Now.",
        fireSide: "She's pulling them away from you, Rook. Fire side.",
        /** Drafts (story thread, run4-job-lines.md B2): Rook's first slip on the water, and the first shimmer. */
        slip: "Water won't hold for you, Rook. Send her.",
        next: "That pool. It's next.",
        again: "Again. The tide comes back. So can you.",
      },
    },
  ],
  /** Lines from the story thread (story/run4-job-lines.md, approved by Ladi 23 Nov 2026). */
  lines: {
    lumiStart: "Tell me where.",
    sent: ["On it.", "Going.", "There. Right."],
    moss: "Moss is mine.",
    coming: "They're coming.",
    mine: "That one was mine.",
    unsent: "I'll find something.",
    thisSide: "Oh. This side.",
    /** The end at Tidepool Steps: who says what, in order. */
    thanks: [
      ["Marit", "As agreed. Thank you, Rook."],
      ["Marit", "And you. I watched you at the pools. What's your name?"],
      ["Lumi", "Lumi."],
      ["Marit", "Thank you, Lumi."],
      ["Lumi", "She said my name."],
      ["Rook", "I heard."],
    ],
  },
} as const;

export interface StepsPool {
  /** Which side of the fire: 0 west, 1 east, 2 north, 3 south. Waves never repeat a side. */
  side: number;
  tiles: Pt[];
  /** Where to stand her: the ground on the pool's fire side, nearest the brazier. */
  fire: Pt;
}

const poolCache = new WeakMap<Board, StepsPool[]>();
/**
 * Tidepool Steps' wave pools: each connected pool of 8 tiles or more that lies square off the fire
 * (west, east, north or south), not the small diagonal arcs close in.
 */
export function stepsPools(b: Board): StepsPool[] {
  const hit = poolCache.get(b);
  if (hit) return hit;
  const c = b.center, seen = new Set<number>(), out: StepsPool[] = [];
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const k = y * b.width + x;
      if (seen.has(k) || b.tile(pt(x, y)) !== Tile.Water) continue;
      const tiles: Pt[] = [], todo = [pt(x, y)];
      seen.add(k);
      while (todo.length) {
        const q = todo.pop()!;
        tiles.push(q);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = pt(q.x + dx, q.y + dy), nk = n.y * b.width + n.x;
          if (b.inside(n) && !seen.has(nk) && b.tile(n) === Tile.Water) (seen.add(nk), todo.push(n));
        }
      }
      if (tiles.length < 8) continue;
      const mx = tiles.reduce((a, q) => a + q.x, 0) / tiles.length - c.x, my = tiles.reduce((a, q) => a + q.y, 0) / tiles.length - c.y;
      // Square off the fire: well out along one axis and close to the other.
      const side = Math.abs(mx) >= 10 && Math.abs(my) <= 3 ? (mx < 0 ? 0 : 1) : Math.abs(my) >= 7 && Math.abs(mx) <= 3 ? (my < 0 ? 2 : 3) : -1;
      if (side < 0) continue;
      // The fire side: ground beside the pool's nearest tile, one step toward the brazier.
      const near = tiles.reduce((a, q) => (cheb(q, c) < cheb(a, c) ? q : a));
      const step = side < 2 ? pt(Math.sign(c.x - near.x), 0) : pt(0, Math.sign(c.y - near.y));
      const fire = pt(near.x + step.x, near.y + step.y);
      out.push({ side, tiles, fire });
    }
  poolCache.set(b, out);
  return out;
}
