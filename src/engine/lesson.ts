// Story run 2, Lumi's lesson: the numbers that set its feel, in one place.
// The player is Lumi; Rook is her partner on the board and the voice in her ear.

export const LESSON = {
  run: "Lumi's lesson",
  shrine: "home-pond",
  /** Ticks of the bell before each round. A restart skips the bell and waits this long instead. */
  bellTicks: 7,
  restartTicks: 2,
  /** Round 1, Your turn: three wisps one at a time, no rings, no clock. */
  yourTurn: {
    title: "Your turn",
    wisps: 3,
    /** Draft: bank all three in at most this many pulls (a pull is one hold, from taking a wisp to letting go). */
    pulls: 6,
    /** Rook's hint comes if she hasn't pulled or banked for this long; he over-explains this long after. */
    hintAfter: 25,
    overAfter: 20,
    /** Out of pulls: the round restarts once her last pull has stopped moving the wisp for this long. */
    settle: 3,
  },
  /** Round 2, Together: two jammed wisps. Spots are offsets from the brazier's centre (y grows south). */
  together: {
    title: "Together",
    /** Beat 1: the jam, and where Rook stands pulling it. */
    jam1: { x: 0, y: -6 },
    rook1: { x: -3, y: 4 },
    /** Beat 2: the second jam, where Rook waits to be called, and the calls she has. */
    jam2: { x: -7, y: -1 },
    rook2: { x: -9, y: -6 },
    /** Draft: bank the second jam with at most this many calls; one more restarts the beat. */
    calls: 3,
  },
  /** Round 3, First to three: against Rook, won with the tide pull. */
  firstToThree: {
    title: "First to three",
    target: 3,
    /** Rook plays a real game (medium bot) up to this score, then dawdles more (never stands frozen); first to three wins. */
    rookStops: 2,
    /** The first time her tide pull works, Rook stops and stares: this many ticks without moving or pulling, starting on the tick of her "!" (Ladi, 24 Nov: "He can stop for a beat or 2"). Once a round; the clock runs and she can score. */
    rookStares: 3,
    /** Ticks after her "!" to his "How did you do that?" (one, so her flash of delight shows first and he asks while he stands there), and to her "I pulled." (after his clip, 2.3 s, has finished: one voice at a time). */
    howAfter: 1,
    pulledAfter: 5,
    ticks: 150,
    /** Games she gets: each loss moves her goalposts (best of five ... best of fifteen); losing the last ends the run. */
    games: 7,
    /** Lumi's wisps in play, and how many start on the pool (the rest come back on it once banked). */
    wisps: 3,
    onPool: 2,
    rookWisps: 2,
    /** The pool tiles her wisps sit on: at least this far from the centre, so no plain pull from across the fire reaches. */
    poolFrom: 9,
  },
} as const;
