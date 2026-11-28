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
  /** Rook starts walking (one tile a tick); the run button switches him to running and back, as on every other board. */
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
    /** Ticks to eat a loose wisp, and a banked one (in run 3, and in run 4: 4 with the hunt, where it sits on the fire; it was 2, then 6 before that). */
    eatLoose: 3,
    eatBanked: 6,
    eatBanked4: 4,
    /** The light it is after keeps its place this much against an equal one, so it doesn't dither. */
    stick: 1.25,
    /** The brazier counts from its rim, this far out from the middle (tiles), when it is nearest-first food. */
    brazierEdge: 2,
    /** A shove also dazes it this many ticks. */
    shoveDaze: 3,
    /** After the first hold in run 4 it stood dazed this many ticks, so cycle 1 was safe. 0 (was 15): Ladi, 27 Nov 3:51 PM, "Take out the two seconds completely its way too easy and theres no danger". */
    daze1: 0,
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
    regen4: 0.2,
    drain: 0.25,
    /** While it is on her, her light goes `eaten` a tick, down to `floor`; at 0 it moves on to the brazier or the boy. */
    eaten: 1,
    floor: 0,
    /** The wind-up (ticks), then the hold (ticks). */
    windup: 3,
    /**
     * Her hold (ticks): 18 at first; 10 when the wound began to stay open after it (wound.loose; she
     * held it for almost half the fight, Ladi 27 Nov 3:25 PM); now 12, and she tires (Ladi 3:34 PM,
     * "Shorten the pull each time", read by the gameplay thread as her hold): from the round after
     * wound.looseFrom each hold is `tire` shorter, never under `holdMin` (under 9 he can't get round
     * the fire).
     */
    hold: 12,
    tire: 1,
    holdMin: 9,
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
    /**
     * Pulling while it is loose (the gameplay thread's idea 1, Ladi 27 Nov 3:25 PM "Let's try 1"):
     * from round `looseFrom`, when her hold ends the wound stays open for as long as the shard is
     * out, and he keeps pulling while it comes for the shard. Round 1 is as before. 0 for off.
     */
    loose: 1,
    looseFrom: 2,
    /** Its speed while the wound is open and she is not holding it, and for shard.dim ticks after he covers (tiles a tick; 0 for its usual speed). 0.8, was 0.6 (Ladi 27 Nov 3:32 PM: "increase the crawl speed"); at 1 only a frame-perfect player lives. */
    crawl: 0.8,
    /** A pull works only within this many tiles of its back edge, held or loose (0 for from anywhere). 8.5 (was 6, which left only the tiles against the fire, so round 1 could hang): a middle distance up to 10, as far as the staff's pull reaches (the gameplay thread, 27 Nov). */
    reach: 8.5,
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
      /** The first loose wound, as she lets go: the story thread's draft 1, picked by Ladi (27 Nov 3:35 PM). Text only, no voice. */
      loose: "It is still open, and it is coming for the shard. Pull while it walks, and cover before it reaches you.",
    },
    /** The hint bubbles: PLACEHOLDER WORDING, the gameplay thread's to word. */
    hint: {
      show: { key: "Press Space to show the shard.", tap: "Tap Show shard." },
      strike: { key: "From behind it, click its glowing back to strike.", tap: "From behind it, tap its glowing back to strike." },
      pull: { key: "Click the wound to pull the light out.", tap: "Tap the wound to pull the light out." },
      cover: { key: "Press Space to cover the shard.", tap: "Tap Hide shard." },
      lure: { key: "Space shows the shard and draws it off. Hide it before it reaches you.", tap: "Show the shard to draw it off. Hide it before it reaches you." },
      loose: { key: "Keep pulling. Press Space to cover the shard before it reaches you.", tap: "Keep pulling. Hide the shard before it reaches you." },
      far: { key: "Too far to pull. Get closer to its back.", tap: "Too far to pull. Get closer to its back." },
      home: { key: "Pull the fallen light to the fire while it is away.", tap: "Pull the fallen light to the fire while it is away." },
      eye: { key: "Its eye is turning. Get out of its sight: press R to run.", tap: "Its eye is turning. Get out of its sight: tap Running." },
    },
    /** The same on a retry, shortened. */
    short: {
      show: { key: "Space: the shard.", tap: "Show shard." },
      strike: { key: "Click its back.", tap: "Tap its back." },
      pull: { key: "Click the wound.", tap: "Tap the wound." },
      cover: { key: "Space: cover it.", tap: "Hide shard." },
      lure: { key: "Space: draw it off, then hide.", tap: "Show to draw it off, then hide." },
      loose: { key: "Pull, then Space to cover.", tap: "Pull, then hide." },
      far: { key: "Too far. Get closer.", tap: "Too far. Get closer." },
      home: { key: "Pull the light to the fire.", tap: "Pull the light to the fire." },
      eye: { key: "Its eye: run (R).", tap: "Its eye: run." },
    },
    /** Ticks he waits at a step before she says the strike or pull order. */
    wait: 3,
    /** Round 1: the cover step comes with this many ticks of her hold left (and her ring flashes). */
    coverAt: 4,
    /** Round 1's hold ends (down to the cover step) after this many pulls (3, was 5: with 5 the fight was over in three rounds; the gameplay thread, 27 Nov). */
    pulls1: 3,
    /** Ticks the "too far" hint stays up after a tap on the wound out of reach. */
    farTicks: 4,
    /** Ticks the lure hint stays up. */
    hintTicks: 9,
    /** Round 1's mark where to stand: on the line from it through the brazier, this many tiles past the brazier's middle, off the bank zone and within wound.reach of its back where it can be. */
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
  /**
   * Run 4 as a hunt (the gameplay thread's rules; Ladi chose "Try the hunt", 27 Nov 3:55 PM). 0 for
   * off gives back the rounds of holds (v291). He strikes its back from behind whenever it is not
   * mid-leap, held or not; the strike brings the shard out and opens the wound, which shuts after
   * `tears` tears (not counted while she stuns it) or when he covers. Torn light is `fling` tiles
   * (give or take `flingSpread`) off, any way, and lies lit until he taps it (within his pull's
   * reach): then it flies home to the fire by itself (`home`). It goes for the shard, then loose
   * light nearest first (`straysFirst`), and only then the fire. While it sits on the fire nothing
   * banks (`block`): light sent home waits at the rim. The brazier is solid to its body (`solid`).
   * Solenne no longer holds: full, she flares and stuns it where it stands for `stun` ticks. No
   * hops while the shard glows or its eye turns (`hopShard` 0).
   */
  hunt: { on: 1, stun: 4, tears: 3, home: 0, block: 0, hopShard: 0, fling: 6, flingSpread: 2, straysFirst: 1, solid: 1, bolt: 1, boltMin: 9, boltTicks: 3, away: 12, flingHeld: 1, safe: 1 },
  /*
   * The jump (gameplay thread, trial-jump-delta.patch, from Ladi 27 Nov 4:46 PM: "after 2 or 3 taps it
   * jumps to safety", and "Besides tapping which feels kind of like a different game"):
   * - `bolt`: after `tears` tears the wound shuts and it leaps (`boltTicks`) to a random spot at least
   *   `boltMin` tiles from Rook, eye and gaze cleared; it stays there `away` ticks, then limps back
   *   for dark.hurt ticks. `away` 12 (7.2 s): Ladi, 27 Nov 5:17 PM, "lets try 7 seconds and it is
   *   invulnerable" (it was 16, then the gameplay thread's 8).
   * - `safe` (Ladi's, same message): from the jump until its time away ends a tap on its back does
   *   nothing, and Solenne's charge waits (her light doesn't rise, a wind-up freezes, no blast), going
   *   on where it stopped after.
   * - `home` 0 (Ladi's): no tap that sends light home; torn light is ordinary loose lit light, pulled
   *   with the staff and banked at the brazier.
   * - The gameplay thread's own calls, not Ladi's: `block` 0 (the fire no longer shuts while it sits
   *   there) and `flingHeld` 1 (light torn during her stun is flung too, and three tears in a stun
   *   shut the wound and it jumps the moment she lets go).
   */
  /**
   * Its eye, in place of the touch catch (Ladi, 27 Nov 3:57 PM: "it should have to face you then its
   * eye takes 3 or 4 ticks to turn reflective then you are dead if you are in it's cone of vision").
   * After the shard it walks to within `range` tiles of him (from its front edge) and turns to face
   * him (within `aim` degrees). Then the eye turns over `ticks`, while it stands and follows him only
   * `track` degrees a tick (`lock`). Once turned, its gaze holds `hold` more ticks, sweeping after him
   * `sweep` degrees a tick (Ladi, 27 Nov 4:22 PM: "The gaze definitely would need to last longer").
   * On any of those ticks he is caught (the save, then the loss) if the shard still glows and he is
   * within `cone` degrees either side of its facing and `range` + `slack` tiles of its front. If the
   * shard goes dark first the eye lets go.
   */
  eye: { on: 1, ticks: 3, cone: 35, aim: 15, range: 1.5, lock: 1, slack: 4.5, track: 8, hold: 5, sweep: 15 },
  /**
   * TRIAL, the dark (Ladi, 27 Nov 4:24 PM, decision card "Fight it in the dark"; the gameplay thread's
   * trial-dark.patch). How far each light shows its body, in tiles from its body's edge: Rook's own
   * ring, the uncovered shard, the brazier (and more for each banked light), a loose lit wisp,
   * Solenne (and more for her light), Fen. It also shows while she winds up or holds it, for
   * `ateTicks` after each mouthful, and in the kill; its turning eye and its gaze show at any distance.
   * `glow`: ticks it can still follow a covered shard, which lights nothing for him (Ladi, 27 Nov
   * 4:32 PM: "Let's set it to 3 seconds"). `hurt`: ticks of the crawl after the wound shuts.
   */
  dark: { on: 1, rook: 1, shard: 4, brazier: 0.5, perBanked: 0.3, wisp: 0.8, her: 1, perHer: 0.25, fen: 1.5, ateTicks: 2, glow: 5, hurt: 3 },
  /** Her three lines after a save (approved wording, Ladi 27 Nov 12:48 PM; no voice take yet). One at random. */
  saved: ["I can't do that twice, Salvage.", "Next time it has you, I keep what's left for the boy.", "That cost more than you're worth. Stay behind it."],
  /** Text on the short card. Placeholder wording, not story lines. */
  card: { won: "It's down.", again3: "Again, from the first pull.", again4: "Again, from her flare." },
  /** Seconds a caption stays up (in ticks). */
  captionTicks: 6,
};

// ------------------------------------------------------------------ the yard

/**
 * The crew's yard in its third state (the maps thread's plan 2, sogni/lanternfall/production/places/
 * crew-yard/, 27 Nov): a ruin 25 by 21 inside its low walls (x -12..12, y -10..10), the cold brazier
 * in the middle, the west wall breached at y 1..7, an overturned cart on the east wall at x 10..12,
 * y -5..-4 beside Solenne and the boy, and the back cart north-south against the south wall at
 * x -4..-2, y 7..10, the hoods beside it at x -6..-5, y 9..10 (the maps thread's changes, 28 Nov).
 * Lit ground (the apron) runs out past the walls, deeper in the north; past it, dark. The offspring
 * keeps to the clear ground, x -12..12, y -9..9, and off both carts.
 */
export const OY_YARD = {
  inside: [-12, -10, 12, 10] as const,
  clear: [-12, -9, 12, 9] as const,
  cover: [10, -5, 12, -4] as const,
  cage: [-4, 7, -2, 10] as const,
  hoods: [-6, 9, -5, 10] as const,
  breach: { x: -13, y: [1, 7] as const },
  /** Crates and barrels against the walls (solid; the plan's crate tiles). */
  crates: [[-11, -9], [-10, -9], [11, 9], [10, 9], [-11, 9], [-3, -9], [6, 9], [7, 9]] as readonly (readonly [number, number])[],
  /** The gate's bar, leaning on the wall east of the gateway (solid too). */
  bar: [3, -9] as const,
  /** The lit ground's edge (tiles), and how round its corners are. */
  apron: { x: 16, n: -15, s: 13, round: 3 },
};
const HALF_W = 13, HALF_H = 11;
export const OY_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };
const inBox = (x: number, y: number, b: readonly [number, number, number, number]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

/** About how far (x, y) is outside the lit ground, in tiles, negative inside (the island's edge for drawing). */
export function oyCoast(x: number, y: number) {
  const A = OY_YARD.apron, cy = (A.n + A.s) / 2, hx = A.x - A.round, hy = (A.s - A.n) / 2 - A.round;
  const qx = Math.abs(x) - hx, qy = Math.abs(y - cy) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - A.round - 0.5;
}
/** How far the lit ground's edge is from the brazier at each angle. */
export function oyOutline(a: number) {
  let r = 6;
  while (r < 40 && oyCoast(Math.cos(a) * r, Math.sin(a) * r) < 0) r += 0.25;
  return r;
}
/** How far (x, y) is outside the ground the offspring can stand on (its middle), negative inside: the clear yard, off the cart. */
export function oyRoom(x: number, y: number) {
  const C = OY_YARD.clear;
  const out = Math.max(C[0] - 0.5 - x, x - C[2] - 0.5, C[1] - 0.5 - y, y - C[3] - 0.5);
  const off = (K: readonly number[]) => Math.max(K[0]! - 0.5 - x, x - K[2]! - 0.5, K[1]! - 0.5 - y, y - K[3]! - 0.5);
  return Math.max(out, -off(OY_YARD.cover), -off(OY_YARD.cage));
}

/** The yard as map rows: open ground inside the walls, everything else solid (the dress draws the walls, carts and the rest), the brazier, and the starts. */
export function yardRows(): string[] {
  const Y = OY_YARD;
  const g: string[][] = Array.from({ length: OY_SIZE.h }, (_, by) =>
    Array.from({ length: OY_SIZE.w }, (_, bx) => {
      const x = bx - HALF_W, y = by - HALF_H;
      const crate = Y.crates.some(([cx, cy]) => cx === x && cy === y) || (x === Y.bar[0] && y === Y.bar[1]);
      return inBox(x, y, [...Y.inside]) && !inBox(x, y, [...Y.cover]) && !inBox(x, y, [...Y.cage]) && !inBox(x, y, [...Y.hoods]) && !crate ? "." : "!";
    }),
  );
  const put = (x: number, y: number, ch: string, what: string) => {
    if (g[y + HALF_H]?.[x + HALF_W] !== ".") throw new Error(`solenne-yard: ${what} at ${x},${y} is not on open ground`);
    g[y + HALF_H]![x + HALF_W] = ch;
  };
  put(OFFSPRING.rook[0], OFFSPRING.rook[1], "1", "Rook's start");
  put(OFFSPRING.solenne[0], OFFSPRING.solenne[1], "2", "Solenne's start");
  return g.map((r) => r.join(""));
}
