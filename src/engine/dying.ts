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
  /** The landing's three held pictures: their names (shown on a plain card until one is drawn) and their files in public/stills/. */
  stills: { ticks: 10, names: ["Faces, lit from above", "The comet over the horseshoe", "Hesta on one knee in the glass"] as const, files: ["r6-land-1", "r6-land-2", "r6-land-3"] as const },
  /**
   * Ladi, 24 Nov: the comet lands on the map. The first picture fades in and out (`faces` ticks),
   * then the map, with the comet falling onto the terrace for `comet` ticks, then Hesta's picture
   * fades in over the strike and out again (`hesta` ticks) onto the board with her in the glass.
   */
  landingShow: { faces: 4, comet: 5, hesta: 4 },
  /** The picture at the end of run 7 (its file in public/stills/), and how long it is up, fading in and out. */
  risen: { ticks: 7, name: "The island clears the cloud", file: "r7-end-1" },
  /**
   * The alarm, before run 6: five short shots, full screen, none of them still (Ladi, 24 Nov: the
   * first cut was too long and too quiet). `shots` is the order: each is up for `ms`, pushes in by
   * `push` of its size, and cross-fades over `fadeMs` into the next. The great bell tolls through
   * all of it from `bellFromMs`, every `bellEveryMs`, growing from `bellFar` of its full sound to
   * `bellNear`. Lumi's line comes `lineAfterMs` into her shot, which Ladi put straight after the
   * kitchen (24 Nov, 10:25 AM). ?noalarm leaves the alarm out.
   */
  alarm: {
    shots: [
      { id: "kitchen", name: "The kitchen, dark", ms: 3000, push: 0.03 },
      { id: "lumi", name: "Lumi at the door", ms: 3000, push: 0.03 },
      { id: "falls", name: "From Rook's door: the falls", ms: 3000, push: 0.08 },
      { id: "brazier", name: "The Kindling ground, close", ms: 5000, push: 0.05, at: [468, 380] },
      { id: "descent", name: "The island going down", ms: 6000, push: 0 },
    ] as readonly { id: "kitchen" | "falls" | "brazier" | "descent" | "lumi"; name: string; ms: number; push: number; at?: readonly [number, number] }[],
    fadeMs: 500, bellFromMs: 300, bellEveryMs: 2400, bellFar: 0.6, bellNear: 1, lineAfterMs: 300,
    /** The board is asked for under Lumi's shot, the one that does not move, this long into it, so building it holds nothing up. */
    readyAfterMs: 800,
    line: { who: "Lumi", text: "Dad. The falls." },
    /** The lamp and the three cups (where each hangs on the 1024 by 768 picture): they start still and build over `build` seconds to `swing` degrees either way, each at its own rate (swings a second). Cups knock at `clinks` (ms). */
    kitchen: { lamp: [403, 40] as const, cups: [[335, 251], [395, 242], [453, 241]] as const, hooks: [[367, 253], [434, 244], [485, 243]] as const, build: 0.6, swing: 9, rates: [1.7, 2.05, 1.85] as const, lampSwing: 5, lampRate: 1.1, clinks: [700, 1150, 1900, 2450] as const },
    /**
     * The brazier, close: how high its fire is by seconds into the shot (3 strong, 2 low, 1 embers, 0 out;
     * the four pictures cross-fade between marks). `sparks`: `count` of them rise `rise` pixels from
     * `at` (the bowl's mouth, give or take `spread`), fewer and duller until none is born after `until` seconds.
     */
    brazier: {
      fire: [[0, 3], [0.9, 3], [1.1, 2], [1.35, 3], [1.6, 2], [1.8, 3], [2.1, 2], [2.6, 2], [2.9, 1], [3.1, 2], [3.5, 1], [4.2, 0], [5, 0]] as readonly (readonly [number, number])[],
      sparks: { at: [468, 330] as const, spread: 42, rise: 150, until: 3.5, count: 46 },
    },
    /**
     * The island going down. Its heart flickers for `heartMs` (how dim along the way) and is dead. From
     * `dropAt` seconds it drops `drop` pixels by the shot's end, shaking by `shake`, and lets go of
     * `rocks` rocks from its underside (a point `tip` pixels below its top in the middle, rising by
     * `slope` to either side, `half` wide) until `rocksUntil`. The clouds, back to front: each at
     * `scale`, its top at `y`, starting at `x` and drifting `speed` pixels a second; those marked
     * `behind` are behind the island and its rocks. The far bank and the one hanging from the top
     * are there so the starry sky is barely seen (Ladi, 24 Nov).
     */
    descent: {
      heartMs: 1800, dropAt: 1.6, drop: 330, shake: 4, rocks: 16, rocksUntil: 5.2, gravity: 620,
      heart: [[0, 0], [0.1, 0.9], [0.18, 0.15], [0.32, 1], [0.4, 0.1], [0.52, 0.8], [0.6, 0.3], [0.74, 1], [0.82, 0.45], [0.92, 1], [1, 1]] as readonly (readonly [number, number])[],
      island: { size: [730, 744] as const, scale: 0.8, top: 6 },
      /** Where rock lets go, on the island's picture after `scale`: the underside's edge runs up from `tip` by `slope` either side of the middle. Rock comes from `clear` to `half` out, either side, never the middle, where the falls are. */
      under: { tip: 672, slope: 1.46, half: 255, clear: 85 },
      /** The waterfall, on the island's near face and in front of it: a strip that repeats down from this spot on the island's picture (before `scale`), `wide` across and `tall` to a repeat, to the bottom of the screen and into the cloud, its water running down at `speed` pixels a second. It goes down with the island. */
      fall: { at: [322, 440] as const, wide: 114, tall: 240, speed: 330 },
      cloudSize: [1536, 640] as const,
      clouds: [
        { file: "cloud-far", scale: 1.2, y: -40, x: -500, speed: 6, behind: true },
        { file: "cloud-top", scale: 1.2, y: -470, x: -200, speed: -9, behind: true },
        { file: "cloud-back", scale: 1.2, y: 290, x: -340, speed: -10, behind: true },
        { file: "cloud-mid", scale: 1.2, y: 400, x: -620, speed: 22, behind: false },
        { file: "cloud-front", scale: 1.4, y: 545, x: -420, speed: -45, behind: false },
      ] as readonly { file: string; scale: number; y: number; x: number; speed: number; behind: boolean }[],
    },
  },
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
    /** The village watching from Hesta's terrace, above the north steps. (Ladi, 24 Nov: never on the field; ?nocrowd takes them away.) */
    crowdShown: true,
    /** The comet is seen landing on the map, between two pictures. (Ladi: yes; off plays the three pictures alone.) */
    cometOnMap: true,
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
    /** Every bank lifts the island and drops the wall of cloud at the rim, which stands `wallHigh` at first; after this many it is gone. The stars count as out once they are at `starsAt` of their full light. */
    cloudGone: 6,
    wallHigh: 3.4,
    starsAt: 0.8,
    /**
     * What Hesta says on a bank, by what that bank visibly does (story/runs6-7-lines.md, 24 Nov;
     * Ladi: "The lines for granny are good"). The other banks are silent; the last has its own line.
     */
    bank: {
      first: "Feel that, Rook? Up she comes.",
      second: "Again. My knees felt that one.",
      seen: "They can see us now. Look busy.",
      wall: "Down goes the wall. Don't stop.",
      stars: "There's a star, Rook. Fetch me the rest.",
    },
    /** The falter: at this flame her holds drop and she holds nothing more; from then a wisp takes this long to go out, and one that does comes back this near. */
    falterAt: 80,
    falterDim: 30,
    nearBand: [6, 9] as const,
    /** "Still warm, this." only if run 6 lasted at least this long. */
    warmAfter: 120,
    /** Ticks held on the board after the last bank, before the picture; and ticks on the board after it before the closing lines. */
    hold: 3,
    gather: 4,
    /** The last wisp: Rook's first thought this many ticks after her line ends (about a second), then one each `thinkEvery` (7 s) he isn't pulling. */
    thinkAfter: 2,
    thinkEvery: 12,
  },
  /**
   * The village: small figures with lamps, who stand just inside the cloud's edge and back in
   * toward the fire as it comes. Each has an angle (turns, 0 east, clockwise from above; none
   * stand to the north, where she lands), a lamp colour and size, and a model where the cast has
   * one (`cast`), else a plain figure. Manu carries Sefa; Maudie stands by Lumi. They block nothing.
   */
  crowd: [
    { who: "Lumi", a: 0.555, c: "#ffd36a", s: 1.5, cast: "lumi" },
    { who: "Maudie", a: 0.525, c: "#f4a6c8", s: 0.9, cast: "maudie" },
    { who: "Wick", a: 0.47, c: "#9fd8ff", s: 0.9, cast: "wick" },
    { who: "Moth", a: 0.425, c: "#c8b0ff", s: 0.9, cast: "moth" },
    { who: "Jarek", a: 0.37, c: "#ffc890", s: 0.8, cast: "jarek" },
    { who: "Nell", a: 0.32, c: "#a8e6a0", s: 0.7, cast: "nell" },
    { who: "Orrin", a: 0.265, c: "#8fd0c8", s: 0.8, cast: "orrin" },
    { who: "Mabry", a: 0.21, c: "#ffe9b0", s: 0.8, cast: "mabry" },
    { who: "Manu", a: 0.15, c: "#b8e0ff", s: 0.8, carries: "sefa", cast: "manu" },
    { who: "Sina", a: 0.115, c: "#ffd0a0", s: 0.75, cast: "sina" },
    { who: "Hania", a: 0.05, c: "#f0d0ff", s: 0.75, cast: "hania" },
    { who: "Garrick", a: 0.99, c: "#d8c8a0", s: 0.8, cast: "garrick" },
    { who: "Marit", a: 0.94, c: "#c0e8c0", s: 0.8, cast: "marit" },
  ] as readonly { who: string; a: number; c: string; s: number; cast?: string; carries?: string }[],
  /**
   * Where they stand (Ladi, 24 Nov: "I definitely do not want the crowd on the field... they are by
   * Hesta's house looking down at the Kindling field"). Never on the field: all through both runs
   * they are up on her terrace, past the north edge of the ground, by the lower half of her house,
   * at the head of the steps (drawn, not walkable). Distances in tiles north of the brazier:
   * the steps climb from `stepsFrom` to the terrace's edge at `front`, `top` tiles up; the terrace
   * runs `half` to either side and `depth` back; her house's middle is `house` past the edge. The
   * village stand in two rows, `rows` back from the edge, at the `slots` (tiles east of the steps'
   * middle, and which row), in the order of `crowd`. At the very end only Lumi comes down, to Rook.
   */
  terrace: {
    stepsFrom: 17.7, front: 20.2, top: 2, half: 11.5, depth: 12, stepsHalf: 1.5, steps: 10, house: 6.9,
    rows: [0.8, 1.9] as const,
    /** The island view makes room for it: the eye this many tiles further north, and this much of the usual size. */
    viewNorth: 2.2, viewZoom: 0.93,
    slots: [[-2.3, 0], [-3.5, 0], [-5.0, 0], [-4.2, 1], [-6.6, 0], [-5.9, 1], [-8.3, 0], [2.4, 0], [3.8, 0], [5.3, 0], [4.5, 1], [6.9, 0], [8.4, 0]] as readonly (readonly [number, number])[],
  },
} as const;

/** The alarm's length, and when in it the board is asked for (ms from its start). */
export function alarmTimes() {
  const A = DYING.alarm;
  let total = 0, readyAt = 0;
  for (const s of A.shots) {
    if (s.id === "lumi") readyAt = total + Math.min(A.readyAfterMs, s.ms);
    total += s.ms;
  }
  return { total, readyAt };
}

/** Which of her lines a bank in run 7 gets (the `n`th, from 1), by what it visibly does; null for a silent bank. */
export function bankLine(n: number): keyof typeof DYING.seven.bank | null {
  const S = DYING.seven;
  const wall = (k: number) => S.wallHigh * Math.max(0, 1 - k / S.cloudGone);
  const firstBank = (f: (k: number) => boolean) => {
    for (let k = 1; k <= S.cloudGone; k++) if (f(k)) return k;
    return S.cloudGone;
  };
  // The wall is below the village's feet on the terrace: their lamps and they are in plain sight.
  const seen = firstBank((k) => wall(k) < DYING.terrace.top);
  const stars = firstBank((k) => 1 - wall(k) / S.wallHigh >= S.starsAt);
  if (n === stars) return "stars";
  if (n === seen) return "seen";
  if (n === 1) return "first";
  if (n === 2 && n < seen) return "second";
  if (n === seen + 1 && n < stars) return "wall";
  return null;
}

/** How high the ground is at a spot (tile coordinates): the terrace's top, the slope of its steps, or the field. */
export function terraceHeight(board: Board, x: number, y: number): number {
  const T = DYING.terrace, c = board.center, north = c.y + 0.5 - y;
  if (north >= T.front) return T.top;
  if (north > T.stepsFrom && Math.abs(x - c.x - 0.5) <= T.stepsHalf + 0.4) return (T.top * (north - T.stepsFrom)) / (T.front - T.stepsFrom);
  return 0;
}

/** Where one of the crowd stands (tile coordinates, fractions allowed) all through runs 6 and 7: on Hesta's terrace, looking down at the field. */
export function crowdSpot(board: Board, i: number): { x: number; y: number } {
  const T = DYING.terrace, c = board.center, [dx, row] = T.slots[i % T.slots.length]!;
  return { x: c.x + 0.5 + dx, y: c.y + 0.5 - T.front - T.rows[row]! };
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
