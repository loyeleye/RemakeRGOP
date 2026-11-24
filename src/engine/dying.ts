// Story runs 6 and 7, the dying brazier and Hesta's landing: one piece, played without a break.
// Briefs: project files gameplay/runs6-7-prototype-brief.md and gameplay/runs6-7-rework-brief.md
// (the night the island goes down); lines: story/runs6-7-lines.md, story/runs6-7-reimagined.md.
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
    drain: 0.72,
    drainGrow: 0.004,
    /** The early hope: for this many ticks the drain is only `calmDrain`, so a player who keeps moving holds the fire level. Then it steps up. */
    calmTicks: 28,
    calmDrain: 0.2,
    /** Run 6 ends in embers when the flame reaches this, but never before `minTicks`, and at `maxTicks` whatever the flame. */
    embersAt: 10,
    minTicks: 80,
    maxTicks: 150,
    wisps: 8,
    /** Ticks outside the light before a wisp goes out. */
    dimTicks: 10,
    /** Ticks before another wisp comes in the place of one that went out. Letting them go out is what costs. */
    outPause: 25,
    /** Where a wisp arrives, in tiles from the cloud's edge: from this far inside it to this far out in it. */
    arrive: [1.5, 5] as const,
    /** The arc (radians) they arrive within, whose middle wanders by up to `arcDrift` with each arrival. A full turn: from all round. */
    arc: 6.3,
    arcDrift: 0.5,
    /** Hesta's calls, by tick (the first flare's is on the first bank). */
    leaveFarAt: 45,
    cutOffAt: 64,
  },
  /**
   * The cloud is the clock. Its edge starts `start` tiles from the brazier and comes in `stepIn`
   * tiles, with a lurch, each time the flame falls below the next of `stepsAt`. A bank pushes it
   * back `push` (never more than `pushMax` in all), and a push eases off after `pushHold` ticks.
   * A wisp the cloud covers fades over six.dimTicks and is lost.
   */
  cloud: { start: 10.5, stepIn: 1.5, stepsAt: [46, 37, 28, 19] as const, push: 1, pushMax: 4, pushHold: 12 },
  /**
   * The bottom, scripted, however he did: the last lurch, the flame falling to `level` over `fall`
   * ticks, the cloud closing to `radius` and (the switch below) over Rook from `blindAt`. The sounds
   * stop one at a time: the fire at `fireOff`, the crowd at `crowdOff`, the shrine's great bell at
   * `greatOff`, and Lumi's hand bell, the last, at `bellOff`, when she looks up; from `orange` everything is lit from above.
   */
  bottom: { ticks: 17, fall: 3, level: 2, radius: 3, blindAt: 3, fireOff: 6, crowdOff: 8, greatOff: 10, bellOff: 14, orange: 15 },
  /** Three held pictures, the cutscene thread's, for this many ticks in all; plain cards with these names until they exist. */
  stills: { ticks: 10, names: ["Faces, lit from above", "The comet over the horseshoe", "Hesta on one knee in the glass"] as const },
  /** The picture at the end of run 7, and how long it is held. */
  risen: { ticks: 5, name: "The island clears the cloud" },
  /** What Ladi ruled on 24 Nov, each on a switch so the other way can be tried. */
  switches: {
    /** The cloud reaches Rook at the bottom: he can move, and can see no wisp. (Ladi: yes.) */
    cloudOverRook: true,
    /** Her line gives back the wisps lost in the last `giveBack` ticks of run 6. (Ladi: yes, definitely.) */
    lineGivesBack: true,
    /** Lumi takes over the calls when Hesta's voice cuts off. (Ladi: no, nobody calls; kept to compare.) */
    lumiCalls: false,
    /** A crowd sound. (Ladi: shown by movement for now; the game has no such sound.) */
    crowdSound: false,
  },
  giveBack: 40,
  /** Lumi's calls, when switched on: not before this many ticks after Hesta's voice stops, this far apart, for a wisp untouched this long. */
  lumi: { after: 4, every: 7, neglect: 8 },
  landing: {
    /** Where the comet strikes, from the brazier (Hesta's terrace is north of the Kindling ground), and the crater's radius. */
    at: [0, -4] as const,
    radius: 3.5,
    /** Ticks from the board coming back to her line. */
    line: 1,
    /** Rook and any wisps this near the strike are put back this far from it. */
    blast: 5,
  },
  seven: {
    /** The flame the fire restarts from, what a bank adds now, and no drain: nine banks fill it. */
    flame: 10,
    feed: 10,
    /** Wisps on the board at once, and how many Hesta takes hold of herself (the ones her line gives back are held besides). */
    wisps: 6,
    holds: 5,
    /** Ticks between one hold and the next, so her hands are seen to work. */
    holdEvery: 2,
    /** Where wisps arrive, tiles from the brazier: mostly far out. */
    band: [10, 13] as const,
    dimTicks: 10,
    /** Every bank lifts the island; after this many the wall of cloud at the rim is gone. */
    cloudGone: 6,
    /** The falter: at this flame her holds drop and she holds nothing more; from then a wisp takes this long to go out, and one that does comes back this near. */
    falterAt: 80,
    falterDim: 30,
    nearBand: [6, 9] as const,
    /** "Still warm, this." only if run 6 lasted at least this long. */
    warmAfter: 120,
    /** Ticks held on the board after the last bank, before the picture; and ticks on the board after it before the closing lines. */
    hold: 3,
    gather: 4,
  },
  /**
   * The village: small figures with lamps, who stand just inside the cloud's edge and back in
   * toward the fire as it comes. Each has an angle (turns, 0 east, clockwise from above; none
   * stand to the north, where she lands), a lamp colour and size, and a model where the cast has
   * one (`cast`), else a plain figure. Manu carries Sefa; Maudie stands by Lumi. They block nothing.
   */
  crowd: [
    { who: "Lumi", a: 0.555, c: "#ffd36a", s: 1.5, cast: "lumi" },
    { who: "Maudie", a: 0.525, c: "#f4a6c8", s: 0.9 },
    { who: "Wick", a: 0.47, c: "#9fd8ff", s: 0.9, cast: "wick" },
    { who: "Moth", a: 0.425, c: "#c8b0ff", s: 0.9, cast: "moth" },
    { who: "Jarek", a: 0.37, c: "#ffc890", s: 0.8 },
    { who: "Nell", a: 0.32, c: "#a8e6a0", s: 0.7, cast: "nell" },
    { who: "Orrin", a: 0.265, c: "#8fd0c8", s: 0.8 },
    { who: "Mabry", a: 0.21, c: "#ffe9b0", s: 0.8 },
    { who: "Manu", a: 0.15, c: "#b8e0ff", s: 0.8, carries: "sefa" },
    { who: "Sina", a: 0.115, c: "#ffd0a0", s: 0.75 },
    { who: "Hania", a: 0.05, c: "#f0d0ff", s: 0.75 },
    { who: "Garrick", a: 0.99, c: "#d8c8a0", s: 0.8 },
    { who: "Marit", a: 0.94, c: "#c0e8c0", s: 0.8 },
  ] as readonly { who: string; a: number; c: string; s: number; cast?: string; carries?: string }[],
  /** How far inside the cloud's edge they stand, never nearer the brazier than `crowdNear` nor farther than `crowdFar`; and where they stand through run 7. */
  crowdIn: 1.2,
  crowdNear: 3.1,
  crowdFar: 11.5,
  crowdSeven: 8.5,
} as const;

/** How far from the brazier the crowd stands for a cloud this far out (run 6 and its bottom). */
export function crowdRadius(cloud: number) {
  return Math.max(DYING.crowdNear, Math.min(DYING.crowdFar, cloud - DYING.crowdIn));
}

/** Where one of the crowd stands (tile coordinates, fractions allowed), `r` tiles from the brazier; they stand in two rows when pressed close. */
export function crowdSpot(board: Board, i: number, r: number): { x: number; y: number } {
  const m = DYING.crowd[i]!, a = m.a * Math.PI * 2;
  const row = r < 5 ? (i % 2) * 1.1 : 0;
  return { x: board.center.x + 0.5 + Math.cos(a) * (r + row), y: board.center.y + 0.5 + Math.sin(a) * (r + row) };
}

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
