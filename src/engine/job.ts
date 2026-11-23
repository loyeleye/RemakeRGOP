// Story run 4, A job: the numbers that set its feel, in one place.
// The player is Rook; Lumi is his partner on the board, sent to a tile with a tap. Hesta is the
// voice in his ear and plans the route. Two stops on other people's islands, one after the other.
// Build brief: project files gameplay/run4-prototype-brief.md. Counts, clocks and lines are drafts.

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
      /** Draft: bank this many in this many ticks, with at least `onWater` of them starting on a pool. */
      goal: 8,
      ticks: 220,
      wisps: 3,
      onWater: 5,
      /** Share of wisps that come back on a pool (the rest on the ground). */
      poolShare: 0.75,
      /** Only the two big side pools, this far east or west of the fire: well off Rook's lines. */
      poolDx: 13,
      /** The last ones (from this many banked) come up on the pool across from where Lumi was sent. */
      lateFrom: 6,
      rook: { x: 4, y: 3 },
      lumiStart: { x: 4, y: -3 },
      keeperAt: { x: 0, y: 6 },
      lines: {
        route: "Now the pools. Stand her on the fire side, and pull while the tide's coming in. It turns against you after.",
        greet: ["Rook. Good. Half of them are out on the water again.", "Granny said you'd bring someone for the water."],
        turned: "Tide's turned. Wait for it.",
        back: "Now.",
        fireSide: "She's pulling them away from you, Rook. Fire side.",
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
