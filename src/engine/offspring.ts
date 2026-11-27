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

  /** The offspring. Speed in tiles a tick (3 tiles every 2 ticks). */
  it: {
    /**
     * How big it is, in tiles across (Ladi, 27 Nov 1:22 PM: "at least 3x3 tiles wide. Maybe even
     * 4x4"). It is square, the eye on its front edge. Every distance below is from its front edge
     * (or its back edge, for behind it), so changing this one number is enough to try 4.
     */
    size: 3,
    speed: 1.5,
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
    eatLoose: 1,
    eatBanked: 3,
    /** The light it is after counts this much more than the rest, so it doesn't dither between two near-equal ones. */
    stick: 1.25,
    /** The brazier's light counts from its rim, this far out from the middle (tiles). */
    brazierEdge: 2,
    /** Distance counts as max(d, this) (tiles), so nothing it is on top of counts for infinity. */
    nearest: 1,
  },
  /** Brightness of each light. What it chases is the brightest by brightness / distance. */
  light: {
    shard: 12,
    wisp: 1,
    /** The brazier: this much for each wisp banked. */
    banked: 1,
    fen3: 1,
    /** Fen in run 4: from `fen4` at the flare, rising `fenRise` a tick from cycle `fenFrom` on, up to `fenMax`. Until then, while it sits on her, nothing ends the fight but his lure. */
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
    /**
     * How bright she looks right after a shove or a blast, for `dipTicks`, whatever her light.
     * The brief has about 2; at 2 her three tiles beat a one-wisp brazier at six under brightness
     * over distance, so the opening pull could not turn it. 0.5 lets it.
     */
    dip: 0.5,
    dipTicks: 4,
    /** Run 4. The flare and a blast leave her at `afterBlast`. She climbs `regen4` a tick while it leaves her alone, and drains `drain` a tick while it is after her. */
    afterBlast: 2,
    regen4: 0.5,
    drain: 0.25,
    /** While it is on her, her light goes `eaten` a tick, down to `floor`. */
    eaten: 1,
    floor: 0.5,
    /** The wind-up (ticks), then the hold (ticks). */
    windup: 3,
    hold: 8,
    /** The save: what she has left after knocking it off him (a quarter of full), and how far it goes. */
    afterSave: 2,
    saveKnock: 3,
    /** After the save it stands dazed this many ticks before it looks for a light again. */
    saveDaze: 3,
  },
  /** The flare at the end of run 3, held this many ticks before run 4 starts on the spot. */
  flareTicks: 4,
  /** Run 3's knockdown: if he is anywhere in the path its body sweeps (its width, and `near` more), he is thrown `aside` tiles clear of it and is down `down` ticks. Off: ?fight=knockdown.on:0. */
  knockdown: { on: 1, aside: 2, down: 3, near: 0.3 },
  /** Run 4. */
  shard: {
    /** A hidden shard takes this many ticks to dim to nothing. */
    dim: 3,
    /** Each tick it is uncovered during her hold takes this many more ticks off the hold. */
    holdCost: 1,
  },
  wound: {
    /** Ticks behind it with the shard uncovered before the wound opens. */
    open: 1,
    /**
     * How near its back edge he has to be (tiles), and how far round from its face counts as behind
     * (degrees from straight ahead). The brief has him "behind it" and then "anywhere" once it is
     * open, and has him pull from the brazier's far side: with an 8-tick hold that the shard cuts in
     * half there is no time to walk round from its back, so behind counts from as far as his pull
     * reaches, and the far side of the fire is behind it when she has put it in place.
     */
    near: 9,
    behind: 110,
    /** Ticks for each pull: one wisp torn out of the wound, flying toward him. */
    pull: 2,
  },
  /** Cycles 1 to `placed`: her blast also puts it in place, `at` tiles in front of her toward the brazier. Cycle 1: it doesn't go for the brazier. */
  cycles: { placed: 2, at: 3, noBrazier: 1 },
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
