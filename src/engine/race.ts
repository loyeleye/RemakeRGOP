// Story run 5, the race with Kes: the numbers that set its feel, in one place. Drafts, to be
// judged by playing (build brief: project files gameplay/run5-prototype-brief.md; lines:
// story/run5-race-lines.md). The player is Rook; Kes is a bot with a storm light, which strings
// wisps together (the storm law, in game.ts). Lumi referees from the edge. No Hesta.

import type { BotStyle } from "./bot.js";

export const RACE = {
  run: "The race",
  title: "The race",
  /** Kes's island, Kite Fell (Ladi): for now the plain dry oval, to be dressed from the maps thread's draft. */
  shrine: "kite-fell",
  bellTicks: 5,
  /** Three heats, all played. Each is first to this many. */
  heats: 3,
  target: 6,
  /** Wisps come in loose groups of this many for each side, the next group when the last is banked. */
  group: 3,
  /** How far out a group arrives (as a share of the race oval's radius that way), and how loose it is (tiles across). */
  band: [0.62, 0.92] as const,
  /** How wide an arc round due west (Rook) and due east (Kes) a group may land in, radians. */
  arc: (Math.PI * 2) / 3,
  spread: 3,
  /** Ticks after a side's group is all banked before its next one arrives. */
  groupPause: 3,
  /** Long enough never to run out. */
  ticks: 600,
  /** OPEN with Ladi (story thread's recommendation): only the last heat decides the race. */
  lastHeatDecides: true,
  /** The storm law's numbers for this run. */
  /** gap: followers trail two tiles apart, so the string is a line to see and not a clump. */
  storm: { max: 3, reach: 2, link: 6, gap: 2 },
  /** Kes in heat 1: no string. A good player who taps, enjoying herself. */
  kes: {
    plain: { pushy: 0, sloppiness: 0.2, taps: true, pick: [0.1, 0.05] } as BotStyle,
    /** Pulling her string: how careful she is each tick. */
    strung: { pushy: 0, sloppiness: 0.04 } as BotStyle,
    /** A beat of pause after a bank she is pleased with (ticks), and how often she takes it. */
    preen: 3,
    preenChance: 0.35,
    /** She strings every wisp of the group before she pulls (a show-off: two would often be quicker). */
    stringAll: true,
  },
  /** Kes's and Lumi's bubbles: at least this many ticks between Kes's, and how long "winning" needs a lead. */
  kesGap: 33,
  /** "There he is.": this many of the player's wisps moving at once, in heat 3. */
  juggling: 3,
  /** Ticks of quiet after a heat's last bank before the talk. */
  heatTail: 2,
};
