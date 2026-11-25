// Optional run 1, Granny's rematch: the numbers that set its feel, in one place. Drafts, to be
// judged by playing (gameplay/optional-runs-prototype-brief.md, card O1).
// Hesta alone, walking, against Lumi (captain), Nell, Sefa and Rook (the player). First to five,
// and she starts on one. She always wins by one: what can be won is the children's best score
// against her, chalked on the pond wall. One cheat each rematch, in turn.

import { BOT_CHILD, type BotStyle } from "./bot.js";

export type Cheat = "hold" | "goal" | "nap";

export const REMATCH = {
  id: "o1",
  run: "Granny's rematch",
  title: "Granny's rematch",
  /** Run 3's pond in the afternoon (the maps thread's light). */
  shrine: "home-pond-afternoon",
  bellTicks: 4,
  /** First to this many, and what she starts on. */
  target: 5,
  head: 1,
  /** Long enough never to run out in practice. */
  ticks: 900,
  /** What the wall says before any rematch: the children's best against her. */
  wallStart: 2,
  /** Her cheats, one each rematch, in this order. */
  cheats: ["hold", "goal", "nap"] as Cheat[],
  /** The children's score at which each cheat comes (once she has answered it). */
  cheatAt: { hold: 2, goal: 2, nap: 1 } as Record<Cheat, number>,
  /** No cheat before this tick. */
  cheatAfter: 12,
  /** The goal and Nell's wall line stay up this long as captions (6 seconds). */
  goalTicks: 10,
  /** A line that names the choice stays up this long. */
  landTicks: 10,
  /** Ticks a banked wisp is gone before it comes back. */
  respawnPause: 10,
  /** Wisps in play: the children's, and hers. */
  wisps: [2, 2] as [number, number],
  /** Their wisps come back this many tiles out from the brazier, on dry ground. */
  near: [15, 20] as [number, number],
  styles: {
    lumi: { ...BOT_CHILD, sloppiness: 0.05, earlyRelease: 0.03, poorSpot: 0.1, wrongWisp: 0.35 } as BotStyle,
    nell: { ...BOT_CHILD, earlyRelease: 0.08, poorSpot: 0.55, wrongWisp: 0.15 } as BotStyle,
    sefa: { ...BOT_CHILD, earlyRelease: 0.3, poorSpot: 0.15, wrongWisp: 0.1 } as BotStyle,
    /** The player's stand-in, for the sums: a grown-up who plays it straight. */
    you: { ...BOT_CHILD, sloppiness: 0.05, earlyRelease: 0, poorSpot: 0.1, wrongWisp: 0 } as BotStyle,
  },
  hesta: {
    /** Late push: only once their wisp is this many wisp steps from the rim... */
    latePushAt: 1,
    /** ...never while she leads by this many, always while she is level or behind, and this share of them otherwise. */
    calmLead: 2,
    evenChance: 0.6,
    /** No late pushes before this tick. */
    firstPushAfter: 16,
    /** She answers a point of theirs with one of hers after this many ticks (a range). */
    answer: [2, 5] as [number, number],
    /** Her wisps come back this many tiles out from the brazier, on her side of it. */
    back: [8, 12] as [number, number],
    /** The finish: her pull speed, and how far out from the brazier her wisps come back. */
    rush: { pull: 1.5, from: [4, 5] as [number, number] },
  },
  /** The earth hold: the wisp she is looking at is held in the ground if it comes this near the rim (wisp steps)... */
  hold: {
    at: 2,
    /** ...for this long. */
    ticks: 30,
    /** She looks at one of theirs once it is this many steps out: nearly in. */
    from: [3, 7] as [number, number],
    /** If he lets it lie this long, Sefa goes and brings it in. */
    max: 45,
    /** Her cast: she stands this long. */
    cast: 2,
    /** Sefa, bringing it in: slow and fumbling. */
    sefa: { ...BOT_CHILD, sloppiness: 0.35, earlyRelease: 0.3, poorSpot: 0.3, wrongWisp: 0 } as BotStyle,
    /**
     * Lumi's call. The story thread's line is "Leave the far one. She's looking at it."; here she
     * looks at the near one (the one worth cheating on), so "far" would point him the wrong way.
     */
    line: "Leave that one. She's looking at it.",
  },
  /** "My pond": the tell before the goal moves, how long it stays moved, how far out, how near a wisp must come to count, and how much being near one of theirs weighs in where it goes. */
  goal: { tell: 8, ticks: 34, out: [7, 9] as [number, number], r: 1.6, nearTheirs: 0.8, /** ...but never within this many tiles of one. */ clear: 5 },
  /** Nap time: how long she dozes, how long after her eyes shut a running step first wakes her, and how near the rim one of theirs must be for her to shut them (wisp steps). */
  nap: { ticks: 18, grace: 3, from: [3, 4] as [number, number] },
  /** The children guess her age this many ticks into play. */
  ageAt: 3,
  ages: ["Thirty-nine.", "Sixty and a bit.", "Old enough to win."],
};

/** Which cheat the nth rematch has (0 is the first). */
export const cheatOf = (n: number): Cheat => REMATCH.cheats[((n % REMATCH.cheats.length) + REMATCH.cheats.length) % REMATCH.cheats.length]!;
