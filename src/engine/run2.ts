// Arc 1 Part 2, piece 2: run 2, the crew's brazier. A standard run on the crew's camp, the brazier cold
// for a week: Rook and three of the crew pull for it, the crew slow and poor at it; past warm only his
// lights take. On the sixteenth bank he is already walking for the cart, and the lines of light beat
// him to it. The place is the maps thread's (warm-camp.json "run2" and "cageLit", 28 Nov); the numbers
// are the gameplay thread's test players (gameplay/part2/camp-and-run2-brief.md, "Run 2's numbers",
// DRAFT, Claude's); "How it ends" is that brief's, the beat Ladi's (27 Nov, 1:42 PM); words from
// story/part2-lines-for-build.md, all DRAFT there and shown with the draft mark. Nothing is voiced.
// Board tiles: x east, y south, from the brazier.

import { BOT_CHILD, type BotStyle } from "./bot.js";
import { CAMP_PIECES, CREW, type CampLine } from "./camp.js";

const D = (who: string, text: string): CampLine => ({ who, text });

export const RUN2 = {
  shrine: "crew-run2",
  title: "The crew's brazier",
  /** Five lights, appearing 5 to 9 tiles from the brazier, each straight back out when banked (gameplay thread's numbers). */
  wisps: 5,
  band: [5, 9] as [number, number],
  respawnPause: 0,
  /** Sixteen banks fill it; up to `warm` anybody's light counts, past it only Rook's (gameplay thread's rule, from Outrider's line). */
  banks: 16,
  warm: 8,
  /** The crew: run 3's children made slow (gameplay thread's test players). */
  crew: { ...BOT_CHILD, sloppiness: 0.3, earlyRelease: 0.3, poorSpot: 0.5, wrongWisp: 0.4, wait: [6, 14] } as BotStyle,
  /** Past warm they bring lights to where he can finish them, doing nothing on this share of ticks (gameplay thread's). */
  dawdle: 0.4,
  /** Where everyone starts (the maps thread's run2 people). The lantern man is its "weigher". The boy is in the back cart, unseen. */
  rook: [-1, 3] as const,
  people: [
    { key: "lantern", name: CREW.lantern, at: [-2.6, -1.6], pulls: true },
    { key: "gate", name: CREW.gate, at: [2.4, -1.4], pulls: true },
    { key: "lamp", name: CREW.lamp, at: [2.5, 2], pulls: true },
    { key: "outrider", name: CREW.outrider, at: [0, -2.2] },
    { key: "cook", name: CREW.cook, at: [-0.9, 8] },
  ] as const,
  /** Outrider's three lines land on the meter: the first bank, the 8th and the 15th (gameplay thread's). */
  outrider: [
    { at: 1, line: D(CREW.outrider, "Oh, that's lovely. Do that again.") },
    { at: 8, line: D(CREW.outrider, "A week we couldn't get it past warm.") },
    { at: 15, line: D(CREW.outrider, "Go on, friend. Finish it.") },
  ],
  /** The lamp hand's own, on the third bank. */
  lampHand: { at: 3, line: D(CREW.lamp, "That's three. Is that three?") },
  /** The crew's barks, any order, never two the same in a row; the first only once they are bringing him lights (past warm). */
  barks: ["Left one's yours, friend!", "I've got it. I haven't got it.", "Mind the pot!", "He doesn't even look at them. Did you see that?", "Slower, friend, you'll show us up."],
  /** The first bark no sooner than this, then one every so many ticks, none within `quiet` ticks of another line (build). */
  bark: { first: 25, every: [28, 48] as const, quiet: 8 },
  /** How it ends (the brief; the cageLit spots): he walks for the cart at 1.3 times his walk, never running; on his second step the lines run from the brazier's rim to the cart's door over `linesSec`; then the bars light; two of the crew take his arms and the picture holds. */
  end: {
    stride: 1.3,
    linesAfterSteps: 2,
    linesSec: 1.2,
    lines: { from: [-0.6, 1.38] as const, to: [-3, 6.9] as const, count: 3, spacing: 0.45, colour: "#ffe9a0" },
    /** Where he is held, and the two who take his arms (the cook and the lamp hand: the build's pick), from either side. */
    held: [-2, 5] as const,
    holders: [
      { key: "cook", at: [-3, 5] as const },
      { key: "lamp", at: [-1, 5] as const },
    ],
    /** Seconds the picture holds once both have him, before the next piece. */
    holdSec: 2.5,
  },
};

/** Run 2's board: the warm camp with its gate shut and barred (warm-camp.json "run2"), padded south to the walk's size. */
export const RUN2_ROWS = [
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!........!.....!....!...!!!!!!!",
  "!!!!!!.!!......!...............!!!!!!",
  "!!!!!!.................!!!!!!..!!!!!!",
  "!!!!!!..!!.................!!..!!!!!!",
  "!!!!!!!.......................!!!!!!!",
  "!!!!!!!.......................!!!!!!!",
  "!!!!!!!.......................!!!!!!!",
  "!!!!!!..!!.................!!..!!!!!!",
  "!!!!!!.........................!!!!!!",
  "!!!!!!...........BBB...........!!!!!!",
  "!!!!!!!..........BBB..........!!!!!!!",
  "!!!!!!...........BBB...........!!!!!!",
  "!!!!!!..!!.................!!..!!!!!!",
  "!!!!!!!....!.....1............!!!!!!!",
  "!!!!!!!..!.!.!................!!!!!!!",
  "!!!!!!!....!!.................!!!!!!!",
  "!!!!!!..!!.!!!.............!!..!!!!!!",
  "!!!!!!.....!!!!!!..............!!!!!!",
  "!!!!!!......!!!!!..............!!!!!!",
  "!!!!!!.!...!!!!!!.......!!..!!.!!!!!!",
  "!!!!!!!....!!!!!!.!...........!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
];

/** Its pieces: the walk's, with the gate shut and barred instead of standing open (the maps thread's run2 pieces). */
export const RUN2_PIECES: readonly { m: string; at: [number, number]; yaw?: number }[] = [...CAMP_PIECES.filter((p) => p.m !== "yard-gate-open" && p.m !== "yard-gate-bar"), { m: "yard-gate-shut", at: [0, -11] }];
