// Story runs 6 and 7, the dying brazier and Hesta's landing: one piece, played without a break.
// Brief: project files gameplay/runs6-7-prototype-brief.md; lines: story/runs6-7-lines.md.
// Every number that sets the feel lives in DYING, so it is easy to change. The rules themselves
// (the flame, the light, wisps going out, the glass) are the light law in game.ts.

import { Board, Tile, pt, sign, type Pt } from "./board.js";

export const DYING = {
  run: "The dying brazier",
  /** The Kindling ground, the board run 1 uses; and the same ground after the landing. */
  shrine: "fairy-ring",
  craterShrine: "kindling-crater",
  /** Ticks of talk before run 6 starts. */
  bellTicks: 4,
  six: {
    /** The flame at the start, and what a bank adds. */
    flame: 55,
    feed: 6,
    /** The drain per tick at the start, and how much it grows every tick. */
    drain: 0.35,
    drainGrow: 0.01,
    /** Run 6 ends in embers when the flame reaches this, but never before `minTicks`, and at `maxTicks` whatever the flame. */
    embersAt: 10,
    minTicks: 80,
    maxTicks: 150,
    wisps: 3,
    /** Ticks outside the light before a wisp goes out. */
    dimTicks: 10,
    /** Where a wisp arrives: this share of the lit radius, to this many tiles past it. */
    arrive: [0.7, 2] as const,
    /** They come from one side at a time: within this arc (radians), whose middle wanders by up to `arcDrift` with each arrival. */
    arc: 0.9,
    arcDrift: 0.5,
    /** Hesta's calls, by tick (the first flare's is on the first bank). */
    leaveFarAt: 45,
    cutOffAt: 64,
  },
  embers: {
    /** Ticks the flame takes to fall to embers, the level it falls to, and the ticks of black and silence after. */
    fall: 3,
    level: 2,
    silence: 4,
  },
  landing: {
    /** Where the comet strikes, from the brazier (Hesta's terrace is north of the Kindling ground), and the crater's radius. */
    at: [0, -4] as const,
    radius: 3.5,
    /** Ticks from the streak showing to the strike, and from the strike to her line. */
    streak: 2,
    line: 2,
    /** Rook and any wisps this near the strike are put back this far from it. */
    blast: 5,
  },
  seven: {
    /** The flame the fire restarts from, what a bank adds now, and no drain. */
    flame: 10,
    feed: 12,
    /** Wisps on the board at once, and how many Hesta holds. */
    wisps: 5,
    holds: 4,
    /** Ticks between one hold and the next, so her hands are seen to work. */
    holdEvery: 2,
    /** Where wisps arrive, tiles from the brazier: mostly far out. */
    band: [11, 16] as const,
    dimTicks: 10,
    /** The falter: at this flame her holds drop and she holds nothing more; from then a wisp takes this long to go out, and one that does comes back this near. */
    falterAt: 80,
    falterDim: 30,
    nearBand: [6, 9] as const,
    /** "Still warm, this." only if run 6 lasted at least this long. */
    warmAfter: 120,
    /** Ticks of the fire roaring before the end. */
    roar: 6,
  },
  /**
   * The village at the rim: glows only. Each is an angle (turns, 0 east, clockwise from above), a
   * colour and a size; Lumi's is plainly the brightest, beside Maudie's. They stand `rimOut` tiles
   * outside the playable ground and step back by up to `rimBack` more as the light shrinks.
   */
  rim: [
    { who: "Lumi", a: 0.4, c: "#ffd36a", s: 1.7 },
    { who: "Maudie", a: 0.425, c: "#f4a6c8", s: 0.9 },
    { who: "Wick", a: 0.33, c: "#9fd8ff", s: 0.9 },
    { who: "Moth", a: 0.3, c: "#c8b0ff", s: 0.9 },
    { who: "Nell", a: 0.17, c: "#a8e6a0", s: 0.7 },
    { who: "Sefa", a: 0.12, c: "#ffb07a", s: 0.7 },
    { who: "Mabry", a: 0.47, c: "#ffe9b0", s: 0.8 },
    { who: "Orrin", a: 0.55, c: "#8fd0c8", s: 0.8 },
    { who: "Jarek", a: 0.62, c: "#ffc890", s: 0.8 },
    { who: "Hania", a: 0.65, c: "#f0d0ff", s: 0.75 },
    { who: "Manu", a: 0.72, c: "#b8e0ff", s: 0.8 },
    { who: "Sina", a: 0.76, c: "#ffd0a0", s: 0.75 },
    { who: "Garrick", a: 0.86, c: "#d8c8a0", s: 0.8 },
    { who: "Marit", a: 0.93, c: "#c0e8c0", s: 0.8 },
    { who: "", a: 0.03, c: "#ffdcae", s: 0.7 },
    { who: "", a: 0.09, c: "#e0c0ff", s: 0.7 },
  ],
  rimOut: 1,
  rimBack: 1.5,
} as const;

/** The crater's glass tiles on a board: the circle the comet leaves, and every tile a wisp crosses sliding from it to the brazier's rim. */
export function craterTiles(board: Board): Pt[] {
  const c = board.center, at = pt(c.x + DYING.landing.at[0], c.y + DYING.landing.at[1]);
  const out = new Map<string, Pt>();
  const add = (p: Pt) => {
    if (board.inside(p) && board.tile(p) !== Tile.Brazier && board.tile(p) !== Tile.Edge) out.set(`${p.x},${p.y}`, p);
  };
  const r = Math.ceil(DYING.landing.radius);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.hypot(dx, dy) > DYING.landing.radius) continue;
      let p = pt(at.x + dx, at.y + dy);
      add(p);
      // The way in from here, a tile at a time, as the glass sends a wisp.
      for (let n = 0; n < 12 && !board.inBankZone(p); n++) {
        p = pt(p.x + sign(c.x - p.x), p.y + sign(c.y - p.y));
        add(p);
      }
    }
  return [...out.values()];
}

/** The same board with the crater in it: glass where the comet struck, the stones that stood there gone. */
export function craterBoard(base: Board): Board {
  const tiles = [...base.tiles];
  for (const p of craterTiles(base)) tiles[p.y * base.width + p.x] = Tile.Rime;
  return new Board(base.width, base.height, tiles);
}
