// Arc 1 Part 2, runs 3 and 4: the offspring fight, one fight on one board with no screen between
// the runs. Brief: project files gameplay/part2/runs3-4-fight-brief.md (27 Nov 2026, a draft to
// prototype, nothing locked). Placeholder shapes only. Every number that sets the feel is in
// OFFSPRING, and the page's ?fight=key:val (dots for nested keys) overrides any of them.
// Tiles: x east, y south, the origin at the dead brazier (the board's centre). One tick is 0.6 s.

export const OFFSPRING = {
  run3: "Keep it off them",
  run4: "The first kill",
  title: "Part 2: the offspring fight",
  shrine: "solenne-yard",
  /** Ticks of quiet before the player has control (the scripted opening is the cutscene's). */
  bellTicks: 2,
  /** Where everyone stands at the start. */
  rook: [-6, 3] as readonly [number, number],
  solenne: [10, -1] as readonly [number, number],
  /** Fen just behind her, at the edge (so in run 3 the boy is not nearer to it than the fire). */
  fen: [12, 0] as readonly [number, number],
  /** The offspring at the first pull: four tiles off her toward the fire, facing her, just shoved. */
  start: [6, -1] as readonly [number, number],
  /** The 10 wisps, the same 10 every time. The first is the marked one: pulled to where Rook starts, it flies through the brazier. */
  wisps: [[4, 0], [-3, -6], [-9, -2], [-7, 6], [2, 7], [6, 6], [5, -6], [-1, -8], [-11, 1], [1, 4]] as readonly (readonly [number, number])[],
  /** Rook walks one tile a tick (he never runs here). */
  rookRuns: false as boolean,

  /**
   * The offspring. What it goes for (the gameplay thread's rule from its bot runs, 27 Nov 2 PM,
   * gameplay/part2/fight-sim/README.md, replacing brightness over distance): the first of these
   * that there is. In the kill, the brazier only. Then the uncovered shard, from anywhere. Then
   * food, nearest first: a lit loose wisp (one Rook has pulled, or torn from the wound; the rest
   * sleep and it can't see them), and the brazier for `flare` ticks after a bank and while it is
   * eating there. Otherwise the most light of Solenne, Fen and the brazier, as plain amounts.
   */
  it: {
    /**
     * How big it is, in tiles across (Ladi, 27 Nov 1:22 PM: "at least 3x3 tiles wide. Maybe even
     * 4x4"). It is square, the eye on its front edge. Every distance below is from its front edge
     * (or its back edge, for behind it), so changing this one number is enough to try 4.
     */
    size: 3,
    /** Speed in tiles a tick: `slow` with nothing inside it, rising to `speed` with all ten (faster the more it has eaten). */
    slow: 0.6,
    speed: 1.5,
    /** Ticks the brazier counts as food after a wisp is banked in it ("it flares when fed"). */
    flare: 10,
    /**
     * How fast it turns, in degrees a tick, and how near it has to be facing what it is after before
     * it moves. It turns on the spot first, so the turn is the tell for where it goes next (the
     * needle eye is dropped, Ladi 27 Nov 1:10 PM).
     */
    turn: 45,
    moveArc: 35,
    /** How near its front edge has to come to reach a light (tiles): a wisp, Rook, her or the boy; and the brazier, from the brazier's middle. */
    reach: 0.8,
    reachBrazier: 2.5,
    /** Ticks to eat a loose wisp, and a banked one. */
    eatLoose: 3,
    eatBanked: 6,
    /** The light it is after keeps its place this much against an equal one, so it doesn't dither. */
    stick: 1.25,
    /** The brazier counts from its rim, this far out from the middle (tiles), when it is nearest-first food. */
    brazierEdge: 2,
    /** A shove also dazes it this many ticks. */
    shoveDaze: 3,
    /** After the first hold in run 4 it stands dazed this many ticks (until she can blast again), so cycle 1 is safe. */
    daze1: 15,
  },
  /** How much light each thing has, in the most-light step: Solenne's is her light, the brazier's a wisp each. */
  light: {
    shard: 12,
    wisp: 1,
    /** The brazier: this much for each wisp banked. */
    banked: 1,
    fen3: 1,
    /** Fen in run 4: from `fen4` at the flare, rising `fenRise` a tick from cycle `fenFrom` on, up to `fenMax`. */
    fen4: 1,
    fenRise: 0.05,
    fenMax: 10,
    fenFrom: 3,
  },
  /** Solenne's light: her charge and her stamina, one number. */
  her: {
    full: 8,
    /** Run 3. She starts at half, a shove costs `shove` and knocks it back `knock` tiles, and her light climbs `regen3` a tick while it leaves her alone. */
    start3: 4,
    shove: 2,
    knock: 3,
    /** How near its front edge has to come to her or the boy before she shoves (tiles). */
    shoveAt: 1,
    regen3: 0.05,
    /** How bright she looks right after a blast, for `dipTicks`, whatever her light (run 3 has no dip). */
    dip: 0.5,
    dipTicks: 4,
    /** Run 4. The flare and a blast leave her at `afterBlast`. She climbs `regen4` a tick while it leaves her alone, and drains `drain` a tick while it is after her. */
    afterBlast: 2,
    regen4: 0.5,
    drain: 0.25,
    /** While it is on her, her light goes `eaten` a tick, down to `floor`; at 0 it moves on to the brazier or the boy. */
    eaten: 1,
    floor: 0,
    /** The wind-up (ticks), then the hold (ticks). */
    windup: 3,
    /** 18: with the strike from close behind and the pull from across the fire, a player a tick or two slow still wins (the gameplay thread's bots on v282, 27 Nov). */
    hold: 18,
    /** The save: what she has left after knocking it off him (a quarter of full), and how far it goes. */
    afterSave: 2,
    saveKnock: 3,
    /** After the save it stands dazed this many ticks before it looks for a light again. */
    saveDaze: 3,
  },
  /**
   * Random jumps (Ladi, 27 Nov 2:52 PM: "random jumps where he jumps to a random spot on the map if he
   * is not currently eating from the brazier. He can jump onto wisps. He won't jump on Rook since that
   * would be unfair"). Run 4, out of her hold: about every `every` ticks (give or take `spread` of it)
   * it leaps to a random spot in the yard over `ticks` ticks, or, `onWisp` of the time, onto a loose
   * lit wisp. Never within `clear` tiles of Rook (from its edge), nor onto her or the boy, nor while it
   * eats at the brazier. `run3` 1 lets it jump in run 3 too. `on` 0 turns them off.
   */
  hop: { on: 1, every: 14, spread: 0.4, ticks: 3, onWisp: 0.5, clear: 2, run3: 0 },
  /** The flare at the end of run 3, held this many ticks before run 4 starts on the spot. */
  flareTicks: 4,
  /** Run 3's knockdown: if he is anywhere in the path its body sweeps (its width, and `near` more), he is thrown `aside` tiles clear of it and is down `down` ticks. Off: ?fight=knockdown.on:0. */
  knockdown: { on: 1, aside: 2, down: 3, near: 0.3 },
  /** Run 4. */
  shard: {
    /** A hidden shard takes this many ticks to dim to nothing. */
    dim: 3,
    /** Each tick it is uncovered during her hold takes this many more ticks off the hold (0: struck by the gameplay thread, 27 Nov). */
    holdCost: 0,
  },
  wound: {
    /**
     * How near its back edge he has to be (tiles), and how far round from its face counts as behind
     * (degrees from straight ahead). The brief has him "behind it" and then "anywhere" once it is
     * open, and has him pull from the brazier's far side. Was 9 (strike from as far as his pull
     * reaches), which let him strike and pull from the brazier without moving (Ladi, 27 Nov 2:41 PM:
     * too easy there). 2 (the gameplay thread's bots): run in, strike, run back round the fire, pull.
     */
    near: 2,
    behind: 110,
    /** A tap on its back strikes (opens the wound) from behind it with the shard out. Ticks for each pull: one wisp torn out of the wound, which flies to him on its own (a tile a tick), so the next pull can follow at once. */
    pull: 2,
  },
  /**
   * Teaching run 4's three steps: show the shard, strike its back, pull the light out (Ladi, 27 Nov
   * 2:01 PM: "we definitely need some explanation"; the gameplay thread's draft, brief "Teaching it").
   * Round 1's hold waits until he has done all three once. Each step gets one order from Solenne
   * (`say`, never on a retry) and one hint bubble naming the key or the tap (`hint`, and `short` on a retry).
   */
  teach: {
    /** Her lines: the story thread's drafts (27 Nov 2:04 PM), not judged by Ladi. Text only, no voice. */
    say: {
      /** Round 1's hold starts, the shard thrown. Always. */
      show: "Get behind it and uncover the shard, Salvage.",
      /** Behind it with the shard out: only if he waits `wait` ticks. */
      strike: "Strike its back.",
      /** The wound open: only if he waits `wait` ticks. */
      pull: "Pull its light out and bank it.",
      /** Round 1's hold nearly spent. Always. */
      cover: "Cover the shard. I am letting go.",
      /** Round 1's dazed gap: he uncovers the shard and its eye snaps to him though it can't move. */
      sees: "With that uncovered you are the brightest thing it can see.",
      /** Round 2, as it starts eating from the brazier. Always. */
      lure: "Draw it off the brazier with the shard, and hide it before it reaches you.",
      /** Round 3's blast (not used: her flare draws it to her every round now, Ladi 27 Nov 2:41 PM). */
      placed: "I am done placing it for you, Salvage.",
    },
    /** The hint bubbles: PLACEHOLDER WORDING, the gameplay thread's to word. */
    hint: {
      show: { key: "Press Space to show the shard.", tap: "Tap Show shard." },
      strike: { key: "From behind it, click its glowing back to strike.", tap: "From behind it, tap its glowing back to strike." },
      pull: { key: "Click the wound to pull the light out.", tap: "Tap the wound to pull the light out." },
      cover: { key: "Press Space to cover the shard.", tap: "Tap Hide shard." },
      lure: { key: "Space shows the shard and draws it off. Hide it before it reaches you.", tap: "Show the shard to draw it off. Hide it before it reaches you." },
    },
    /** The same on a retry, shortened. */
    short: {
      show: { key: "Space: the shard.", tap: "Show shard." },
      strike: { key: "Click its back.", tap: "Tap its back." },
      pull: { key: "Click the wound.", tap: "Tap the wound." },
      cover: { key: "Space: cover it.", tap: "Hide shard." },
      lure: { key: "Space: draw it off, then hide.", tap: "Show to draw it off, then hide." },
    },
    /** Ticks he waits at a step before she says the strike or pull order. */
    wait: 3,
    /** Round 1: the cover step comes with this many ticks of her hold left (and her ring flashes). */
    coverAt: 4,
    /** Round 1's hold ends (down to the cover step) after this many pulls. */
    pulls1: 5,
    /** Ticks the lure hint stays up. */
    hintTicks: 9,
    /** Round 1's mark where to stand: on the line from it through the brazier, this many tiles past the brazier's middle. */
    mark: 3,
  },
  /**
   * Where it stands for each blast (Ladi, 27 Nov 2:41 PM: on the brazier run 4 was too easy; "the
   * offspring should leap itself to the spot rather than be pulled there ... attracted by her flare
   * right before she starts her energy blast"). As she winds up she flares and it leaps, over the
   * wind-up, to `at` tiles in front of her toward the brazier, facing her, its back to the fire,
   * dropping whatever it was doing. The landing is marked on the ground through the wind-up, and if
   * Rook is under its body as it lands (no margin: the close strike has him waiting just behind it)
   * he is knocked aside (run 3's knockdown). `side` (degrees, 0 off): from round 2 the
   * spot swings that far round her, on her side away from Rook, so the fire is off to its side and
   * the wisps come out loose to him (try 75). The leap is `jump` tiles high at the top. Not in the
   * kill: there it stares at the fire.
   */
  cycles: { at: 5, side: 0, jump: 2 },
  /** Her three lines after a save (approved wording, Ladi 27 Nov 12:48 PM; no voice take yet). One at random. */
  saved: ["I can't do that twice, Salvage.", "Next time it has you, I keep what's left for the boy.", "That cost more than you're worth. Stay behind it."],
  /** Text on the short card. Placeholder wording, not story lines. */
  card: { won: "It's down.", again3: "Again, from the first pull.", again4: "Again, from her flare." },
  /** Seconds a caption stays up (in ticks). */
  captionTicks: 6,
};

// ------------------------------------------------------------------ the yard

/** The yard: a plain oval round the dead brazier, the edge where Solenne and Fen stand to the east. */
export const OY_OVAL = { rx: 13, ry: 10 };
const HALF_W = 15, HALF_H = 12;
export const OY_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };
const wob = (a: number) => 1 + 0.03 * Math.sin(3 * a + 0.7) + 0.02 * Math.sin(5 * a + 2.1);
const land = (x: number, y: number) => Math.hypot(x / OY_OVAL.rx, y / OY_OVAL.ry) <= wob(Math.atan2(y, x));
export const oyLand = land;

/** About how far (x, y) is outside the yard, in tiles, negative inside. */
export function oyCoast(x: number, y: number) {
  const g = Math.hypot(x / OY_OVAL.rx, y / OY_OVAL.ry) || 1e-6;
  return (g - wob(Math.atan2(y, x))) / (Math.hypot(x / OY_OVAL.rx ** 2, y / OY_OVAL.ry ** 2) / g) - 0.5;
}
/** How far the edge is from the brazier at each angle. */
export function oyOutline(a: number) {
  let r = 6;
  while (r < 30 && land(Math.cos(a) * r, Math.sin(a) * r)) r += 0.25;
  return r;
}

/** The yard as map rows: open ground, the brazier, and Rook's start. */
export function yardRows(): string[] {
  const g: string[][] = Array.from({ length: OY_SIZE.h }, (_, by) => Array.from({ length: OY_SIZE.w }, (_, bx) => (land(bx - HALF_W, by - HALF_H) ? "." : " ")));
  const put = (x: number, y: number, ch: string, what: string) => {
    if (g[y + HALF_H]?.[x + HALF_W] !== ".") throw new Error(`solenne-yard: ${what} at ${x},${y} is not on open ground`);
    g[y + HALF_H]![x + HALF_W] = ch;
  };
  put(OFFSPRING.rook[0], OFFSPRING.rook[1], "1", "Rook's start");
  put(OFFSPRING.solenne[0], OFFSPRING.solenne[1], "2", "Solenne's start");
  return g.map((r) => r.join(""));
}
