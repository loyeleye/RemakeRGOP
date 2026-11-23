// Story run 3, Granny's game: the numbers that set its feel, in one place. Drafts, to be judged
// by playing (see the build brief, gameplay/run3-prototype-brief.md).
// The player is Rook, on a team with Lumi and two children; Hesta plays alone against all four.

import { BOT_CHILD, type BotStyle } from "./bot.js";

export const GRANNY = {
  run: "Granny's game",
  title: "Granny's game",
  shrine: "home-pond-big",
  bellTicks: 7,
  /** First to this many. Hesta always wins it by one. */
  target: 10,
  /** Long enough never to run out in practice. */
  ticks: 900,
  /** Ticks a banked wisp is gone before it comes back (0: straight back). */
  respawnPause: 8,
  /** Wisps in play: the children's team, and Hesta's. Each comes back when banked. */
  wisps: [2, 2] as [number, number],
  /** Who the player is: Rook (Lumi is a bot and calls to him) or Lumi (Rook is a bot). Ladi is still choosing. */
  player: "rook" as "rook" | "lumi",
  /** The other children: Nell (Lumi's best friend, follows her, ends up in poor spots) and Sefa (about six, lets go early). */
  children: ["Nell", "Sefa"] as [string, string],
  /** Each child's mistakes: Lumi is the best of them (mostly the wrong, exciting wisp); Sefa lets go early, Nell picks poor spots. */
  styles: {
    lumi: { ...BOT_CHILD, sloppiness: 0.05, earlyRelease: 0.03, poorSpot: 0.1, wrongWisp: 0.35 } as BotStyle,
    nell: { ...BOT_CHILD, earlyRelease: 0.08, poorSpot: 0.55, wrongWisp: 0.15 } as BotStyle,
    sefa: { ...BOT_CHILD, earlyRelease: 0.3, poorSpot: 0.15, wrongWisp: 0.1 } as BotStyle,
    /** Rook as a bot, when the player is Lumi: a grown-up playing gently. */
    rook: { ...BOT_CHILD, sloppiness: 0.2, earlyRelease: 0.05, poorSpot: 0.2, wrongWisp: 0.1 } as BotStyle,
  },
  hesta: {
    /** Late push: she pushes a children's wisp only once it is this many wisp steps from the rim. */
    latePushAt: 1,
    /** Give and take: no late pushes while she leads by this many or more... */
    calmLead: 2,
    /** ...every one she can reach while she trails, and this share of them when it's level or she leads by one. */
    evenChance: 0.6,
    /** Parked wisp: her own wisp left this many steps from the rim (one at a time)... */
    parkAt: 2,
    /** ...until a children's wisp gets this close to scoring, or this many ticks pass. */
    releaseWhen: 2,
    parkMax: 45,
    /** Her wisps come back within this many tiles of her (0: anywhere, like theirs). */
    near: 6,
  },
  /** Match point: on this many, the children's next wisp to come within `holdAt` steps of the rim is held fast. */
  holdAt: 1,
  /** Lumi's tide pull, seen by Hesta: if her bot hasn't done one by this combined score (about halfway), it's set up. */
  tideBy: 10,
  /** Ticks between Lumi's calls, barks only: once every 30 seconds (Ladi). */
  callEvery: 50,
  /** A quip (a bark that isn't a key line) that can't start within this many ticks of what set it off is dropped. */
  quipWait: 4,
  /** Lumi's chatter keeps this many ticks clear of any key line. */
  quietAround: 8,
  /** The children guess her age this many ticks into play (one exchange, line after line). */
  ageAt: 4,
  /** "She's not even running!", once there's a quiet moment after this tick. */
  runningAt: 150,
  /** No late pushes before this tick, nor while a key exchange (the age guess) is still playing. */
  firstPushAfter: 26,
  /** The quiet "You saw what I was doing" at the end: this many late pushes drawn while another of their wisps banked (within `baitWindow` ticks). */
  baited: 2,
  baitWindow: 4,
};
