// Story run 9, the rescue: the low one, a neighbouring island already ankle-deep in cloud. Brief:
// project files gameplay/runs9-10-prototype-brief.md; lines and stills: story/runs9-10-story-check.md.
// Rook fills the lamps of three boats at the landing while the cloud closes from the north, Kes
// strings wisps over from the far side and sets them down for him at the stones, and a dark patch
// in the cloud crosses the board three times, each time over the most light left lying loose.
// Reworked from Ladi's play notes (project files gameplay/run9-rework-brief.md). Every number that
// sets the feel is in RESCUE. Tiles: x east, y south, the origin at the landing's slip (the bank, and the board's centre).
// The island is wider than it is deep, so that all of it sits in a screen held sideways.

export const RESCUE = {
  run: "The rescue",
  shrine: "low-one",
  /** Ticks of talk before it starts. */
  bellTicks: 3,
  /** Boats at the landing, and banks to fill one boat's lamp. The run is won when the last lifts. */
  boats: 3,
  perBoat: 4,
  /** Wisps out at a time: Rook's on the near side (the west and middle strips), Kes's on the far side (the east strip). */
  his: 3,
  hers: 2,
  /** Ticks before another comes in the place of one of his that banked or was lost. */
  pause: 3,
  /** Ticks after Kes's group is all banked (or lost) before her next one comes up on the far side. */
  groupPause: 4,
  /**
   * The docked boat's lamp is the bank. It stands at the stern, `at` tiles from the slip, and any
   * wisp he can pull that comes within `take` tiles of it flies in by itself. When a boat lifts,
   * the lamp takes nothing for `swap` ticks while the next slides in; wisps left in its light wait.
   *
   * The lamp does not keep its light in this cloud (`leaks`; the page's ?lamp=holds turns it off):
   * a docked boat's lamp keeps its pips for `hold` ticks after the last wisp went in, then loses
   * one, and one more every `drip` ticks until it is fed again. The newest pip flickers for the
   * last `flicker` ticks before it goes. A lifted boat is safe for good. So a boat is filled by
   * pouring its wisps in close together, which means having them near first: the heap the patch
   * goes for. The clock stands still while the lamp is dark under the patch or between boats.
   */
  lamp: { at: [0, -1] as readonly [number, number], take: 3.5, swap: 4, leaks: true as boolean, hold: 20, drip: 8, flicker: 5 },
  /**
   * A try (off; the page's ?flare=1): heaping pays. When `of` wisps go into the lamp within
   * `within` ticks of each other the lamp flares and gives one pip more. Without it nothing in the
   * rules makes a heap faster than bringing each wisp straight in (measured, 25 Nov).
   */
  flare: { on: false as boolean, of: 3, within: 16, pips: 1 },
  /**
   * Kes's drop, a ring of stones on his side by the landing (tiles from the slip): she strings
   * hers on the far strip, walks them over with the string trailing after her, and from `stand`
   * sets it down loose at the stones. From then they are his to pull.
   */
  drop: { at: [5, -7] as readonly [number, number], stand: [4, -6] as readonly [number, number], r: 1.9 },
  /** The goal and her part in it, said by Kes before it starts and held on the screen for `goalTicks` of play (story/run9-rework-lines.md). A line that must land is held as long. */
  goal: "Fill the lamp and the boat lifts. Three boats, Rook. Then us.",
  part: "I'll bring them to the stones. You put them in.",
  goalTicks: 10,
  /**
   * The one pause that stops play (Ladi, 24 Nov): when the first crossing's warning has `warnLeft`
   * ticks to run, play holds for `ticks` on full-screen pictures. Three stills now (Ladi, 24 Nov,
   * 7:43 PM): each for its `ms`, the line on the first, and between the second and third a burst
   * of static, picture and sound (`static`: its frames in order, for `ms` in all). A tap goes on.
   */
  hold: {
    id: "r9-what-is-that", ticks: 10, warnLeft: 1, minTicks: 1,
    frames: [{ id: "r9-what-is-that-1", ms: 2000 }, { id: "r9-what-is-that-2", ms: 1500 }, { id: "r9-what-is-that-3", ms: 2000 }],
    static: { after: 1, ms: 400, frames: ["r9-static-1", "r9-static-2", "r9-static-3", "r9-static-4"] },
  },
  /** How near the landing a wisp may arrive (tiles), how far inside the cloud's edge, and how loose one of her groups is. */
  arriveNear: 11,
  arriveInside: 3,
  spread: 3,
  /**
   * The cloud is the clock (run 6's wall, with no push-back at all). Its edge is an arc round the
   * landing: it starts `start` tiles off, past the north end, and from tick `firstAt` comes in
   * `stepIn` tiles every `every` ticks. A wisp it covers fades over `dimTicks` and is lost. When the
   * edge is within `landing` tiles of the slip with a boat still tied, the run starts again.
   */
  cloud: { start: 35, stepIn: 3, firstAt: 36, every: 64, dimTicks: 8, landing: 8 },
  /** The storm law's numbers, as in the race. */
  storm: { max: 3, reach: 2, link: 6, gap: 2 },
  /** Kes: how careful she is each tick, and ticks she stands and looks after the patch has crossed her. */
  /** After a crossing breaks her string she stands with empty hands for `emptyHands` ticks. `banks` is the first build's Kes, who banked her own (the page's ?kes=banks). */
  kes: {
    sloppiness: 0.05, shaken: 5, emptyHands: 20, banks: false as boolean,
    /**
     * Busy Kes (?kes=busy, the default; ?kes=still is the build before): where she watches from
     * through a warning (by the stones, east of them), where she waves a docked boat's people
     * aboard from and the crowd she faces, for how long, and her pacing: this many tiles out toward
     * the neck from where her next pair comes up, a pause of `pause` ticks at each end.
     */
    busy: { watch: [11, -9] as readonly [number, number], wave: [-3, -2] as readonly [number, number], crowd: [-1, -3] as readonly [number, number], waveTicks: 4, pause: 2, pace: 3 },
  },
  /**
   * The dark patch: a hard-edged stain `size` tiles across, moving `speed` tiles a tick on a
   * straight line (3 is the island in about 9 seconds). For `warn` ticks before its edge
   * reaches the land, the lamps on its course go cold one after another, and stay cold until it has
   * passed. The first crossing comes once `firstBanks` are in (or at tick `firstBy`), west to east
   * across the island's middle: `courseSouth` rows south of the cold brazier, give or take
   * `nearCourse`, at least `clearOfKes` rows from her. From two banks before, his wisps come up on
   * that course, and as it sets out any still waiting do too, up to `under` of them. The second
   * comes once `secondBanks` are in (or at `secondBy`), along the south neck, through where Kes is
   * with a string in hand: up to `lean` rows off her own row toward her string, and after `wait`
   * more ticks (or one more bank) wherever she has a string, and after twice that wherever she is.
   * `drag` is the other behaviour (the page's ?patch=drag): loose wisps under it are carried off with it.
   *
   * All of that is the fixed line (the page's ?patch=line). The rule now (`light`): it goes for
   * light. Crossing k sets out once `at[k]` are in (or at tick `by[k]`), at `speeds[k]` tiles a
   * tick, west to east along the row of the biggest gathering of loose light he could pull: loose
   * wisps within `near` tiles of each other are one gathering, the one nearest the lamp on a tie.
   * The second still waits for Kes with a string in hand, as above. While it is over the docked
   * boat's lamp the lamp is dark and takes nothing. That much is "seek" (the page's ?patch=seek).
   *
   * On top of it, Ladi's idea to try (25 Nov, a brainstorm; "react", the default): it answers to
   * how much light it is going for. `react.sizes` is how wide it is for a lone wisp, for two, and
   * what it looms to over three or more; `react.speeds` its pace for one, two, three or more (the
   * island in about 12, 9 and 7 seconds). Over a gathering of `loomAt` or more it swells over
   * `loomTicks`, starting while its swollen edge is still `swellFrom` tiles short of them, stays
   * over them for `linger` ticks, and shrinks as it moves on. If he has cleared them by then it
   * passes at its own size. When the last lamp is full it is left sitting at `sit` (tiles from the
   * slip) at its smallest, by the stones, and once the boat has lifted it slides off the rim
   * toward home, `slide` tiles a tick (the story thread's last look: run 10 has him chasing it).
   *
   * And over that, the rule now ("clock", the gameplay thread, 25 Nov): it comes on a clock he can
   * read, never on how many are in. Crossing k is told when the cloud's own clock (its ticks from
   * the start to the landing) has run `clock.at[k]` of its way: for `clock.tell` ticks the far
   * lamps go cold one by one toward the landing, the music thins, and a dark mark slides along the
   * cloud's bar in the strip. Then it sets out as "react" does, at the biggest gathering there is
   * at that moment (the second through Kes if she has a string in hand). The tell is longer than
   * pouring four in takes, so "pour before it comes, gather after it has gone" is a plan. The
   * full-screen still comes `clock.hold` ticks into the first tell.
   */
  patch: {
    aim: "bait" as "bait" | "clock" | "react" | "seek" | "line",
    clock: { at: [0.12, 0.25, 0.4] as readonly number[], tell: 18, hold: 2 },
    /**
     * The rule now ("bait", from Ladi's note of 24 Nov, 6:38 PM; the page's ?patch=bait, and
     * ?patch=clock is the one before): it goes for the brightest thing there is, and the docked
     * boat's lamp is a light as big as its pips. It comes all run long, told as on the clock: the
     * first tell when his first wisp is in (or at tick `firstBy`), and after that a tell every
     * `every` ticks, never sooner than `rest` ticks after the last visit ended. At the end of the
     * tell it sets out for the biggest light: a gathering of loose wisps, Kes's string in her hand,
     * or the lamp. A tie goes as `tie` says. A gathering it takes whole, as before. On the
     * lamp it sits, the boat and everyone aboard dark under it, and a pip goes out every `drink`
     * ticks until the lamp is empty; then it moves off. A boat that has lifted is never touched.
     * So a boat is filled by leaving it something brighter than the lamp to take. The lamp does
     * not leak in this rule. `teach`: on the first try its first visit goes to the lamp if there
     * is a pip in it, whatever lies about, so that he sees it before Kes says the rule.
     * `net`: after this many lost tries, `kept` wisps of Kes's stay at the stones, hers and not
     * his to pull, and are there again for each visit.
     */
    bait: { firstBy: 40, every: 45, rest: 6, drink: 3, teach: true as boolean, net: 2, kept: 2, /** The visit bent over Kes: she is carrying this many toward the stones when it covers her, and they are gone when she comes out. An extra pair, for that visit only (the pair at the stones stays as the lure). */ spare: 2, ruleTicks: 14, /** A tie goes to the lamp ("more at the stones than there is in the lamp"), or to the loose light. */ tie: "lamp" as "lamp" | "heap", /** The lamp takes one wisp, then nothing for this many ticks (the next waits in its light, and what waits there counts as the lamp's own light): so no boat is filled between two visits by pouring alone. 0: it takes them as they come. */ sip: 14, /** After it has sat on a boat the lamp is cold: it takes nothing for this many ticks after it moves off. */ cold: 10, /** His wisps come up no farther than this from the slip, so that there is time to place them between visits. */ arriveFar: 17, /** Measurements: how long before it sets out the stand-in that leaves it some starts seeing to the stones... */ prep: 30, /** ...and how many pips it pours early in a round before it minds the stones. */ plan: 2 },
    react: { sizes: [4, 6, 9] as readonly number[], speeds: [2.25, 3, 3.9] as readonly number[], loomAt: 3, swellFrom: 4, loomTicks: 2, linger: 3, sit: [8, -7] as readonly [number, number], slide: [1.3, 0.9] as readonly [number, number] },
    at: [5, 7, 10] as readonly number[], by: [110, 200, 290] as readonly number[], speeds: [3, 3.4, 3.9] as readonly number[], near: 3, size: 6, speed: 3, warn: 3, firstBanks: 4, firstBy: 110, secondBanks: 8, secondBy: 230, clearOfKes: 5, courseSouth: 3, nearCourse: 3, under: 3, gap: 30, lean: 2, wait: 20, smokeTicks: 4, drag: false as boolean,
  },
  /** The end: Kes runs to this tile by the slip (from the slip) and the boat lifts when she is there and the lines are said, or after `boardBy` ticks; then ticks the view holds on the boat before the usual end. */
  board: [3, 0] as const,
  boardBy: 26,
  holdTicks: 5,
  /** Measurements only: how the stand-in for the player plays. */
  /** `spread` is where the one that spreads its wisps out sets them: near the lamp, more than `patch.near` tiles apart, so the patch sees four single wisps. */
  /** `byLamp` is where it stands to pour wisps in (tiles from the slip); one that heaps gathers them round `heapAt`, the stones, where a wisp within `heapR` tiles counts as heaped. */
  stand: { pushy: 0, sloppiness: 0.08, byLamp: [0, -2] as readonly [number, number], heapAt: [5, -7] as readonly [number, number], heapR: 2.5, spread: [[-7, -7], [-3, -7], [1, -7], [5, -7]] as readonly (readonly [number, number])[] },
  /** With a lamp that holds (?lamp=holds), the stand-ins that heap bring a heap in once it is `heapOf`; with one that leaks, once it is what the docked boat still needs. */
  heapOf: 3,
  /** On a phone, how many tiles the short side of the screen shows. */
  phoneSpan: 22,
  /** Where Rook and Kes start, and where the old couple stand, in tiles from the slip. */
  rook: [-3, -5] as const,
  kesAt: [11, -14] as const,
} as const;

/** The land: a wide oval north of the landing. */
export const LO_OVAL = { x: 0, y: -17, rx: 20.5, ry: 12.5 };
const HALF_W = 24, HALF_H = 32;
export const LO_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };
/** The part of the board worth looking at (the south half of it is open sky), in tiles from the slip. */
export const LO_FRAME = { x0: -21, y0: -30, x1: 21, y1: 8 };
/** The two long pools, and the three strips they leave: west, middle, east. */
export const LO_POOLS = [
  { x0: -8, x1: -6, y0: -25, y1: -9 },
  { x0: 6, x1: 8, y0: -25, y1: -9 },
] as const;
/** The landing: planks round a slip, open to the south, where the boat being loaded lies stern-in. */
export const LO_LANDING = { x0: -4, x1: 4, y0: -5, y1: 2 };
/** The island's own brazier, cold, in the middle of the middle strip: three tiles square. */
export const LO_BRAZIER = { x: 0, y: -17 };
/** The houses, lit and empty: three tiles square each, by the rim and out of the way of the work. */
export const LO_HOUSES: readonly (readonly [number, number])[] = [[-16, -17], [-12, -24], [16, -19], [11, -25], [13, -11]];
/** Path lamps along the strips. */
export const LO_LAMPS: readonly (readonly [number, number])[] = [
  [-4, -25], [4, -22], [-4, -19], [4, -15], [-4, -12], [4, -9],
  [-10, -26], [-14, -21], [-10, -17], [-15, -13], [-10, -11], [-10, -8],
  [14, -23], [10, -20], [18, -16], [10, -16], [16, -13], [10, -9],
  [-3, -28], [3, -28],
];

const wob = (a: number) => 1 + 0.025 * Math.sin(3 * a + 0.9) + 0.015 * Math.sin(5 * a + 2.3);
const oval = (x: number, y: number) => Math.hypot((x - LO_OVAL.x) / LO_OVAL.rx, (y - LO_OVAL.y) / LO_OVAL.ry) <= wob(Math.atan2(y - LO_OVAL.y, x - LO_OVAL.x));
/** The slip: the gap in the planks where the stern of the boat being loaded lies, its lamp at the origin. */
export const loSlip = (x: number, y: number) => Math.abs(x) <= 2 && y >= -1;
function landing(x: number, y: number) {
  return x >= LO_LANDING.x0 && x <= LO_LANDING.x1 && y >= LO_LANDING.y0 && y <= LO_LANDING.y1 && !loSlip(x, y);
}
export const loPool = (x: number, y: number) => LO_POOLS.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
export const loPlanks = landing;
export const loLand = (x: number, y: number) => oval(x, y) || landing(x, y);
/** Which strip a tile is on: 0 west, 1 middle, 2 east (the necks belong to the strip they are nearest). */
export const loStrip = (x: number) => (x < -5.5 ? 0 : x > 5.5 ? 2 : 1);

/** About how far (x, y) is outside the island's own ground, in tiles from the slip, negative on land. (The landing's planks hang out over the sky and are drawn by themselves.) */
export function loCoast(x: number, y: number) {
  const px = x - LO_OVAL.x, py = y - LO_OVAL.y;
  const g = Math.hypot(px / LO_OVAL.rx, py / LO_OVAL.ry) || 1e-6;
  return (g - wob(Math.atan2(py, px))) / (Math.hypot(px / LO_OVAL.rx ** 2, py / LO_OVAL.ry ** 2) / g) - 0.5;
}
/** How far the oval's edge is from its own middle at each angle (the plateau hangs from there). */
export function loOutline(a: number) {
  let r = 6;
  while (r < 40 && oval(LO_OVAL.x + Math.cos(a) * r, LO_OVAL.y + Math.sin(a) * r)) r += 0.25;
  return r;
}
/** How far the land runs from the slip at each angle. */
export function loFromSlip(a: number) {
  let r = 2, last = 2;
  for (; r < 50; r += 0.25) if (loLand(Math.cos(a) * r, Math.sin(a) * r)) last = r;
  return last;
}

/** The island as map rows: ground, the pools, the landing's planks, the cold brazier, the houses, the lamps, and where Rook and Kes start. */
export function lowOneRows(): string[] {
  const g: string[][] = Array.from({ length: LO_SIZE.h }, (_, by) =>
    Array.from({ length: LO_SIZE.w }, (_, bx) => {
      const x = bx - HALF_W, y = by - HALF_H;
      if (landing(x, y)) return ".";
      if (!oval(x, y)) return " ";
      return loPool(x, y) ? "~" : ".";
    }),
  );
  const put = (x: number, y: number, ch: string, what: string) => {
    const v = g[y + HALF_H]?.[x + HALF_W];
    if (v !== ".") throw new Error(`low-one: ${what} at ${x},${y} is not on open ground`);
    g[y + HALF_H]![x + HALF_W] = ch;
  };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(LO_BRAZIER.x + dx, LO_BRAZIER.y + dy, "9", "the cold brazier");
  for (const [x, y] of LO_HOUSES) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(x + dx, y + dy, "?", "a house");
  for (const [x, y] of LO_LAMPS) put(x, y, "0", "a path lamp");
  put(RESCUE.rook[0], RESCUE.rook[1], "1", "Rook's start");
  put(RESCUE.kesAt[0], RESCUE.kesAt[1], "2", "Kes's start");
  return g.map((r) => r.join(""));
}

/** The cloud's own clock: ticks from the start until its edge is at the landing. */
export const rescueCloudTicks = () => RESCUE.cloud.firstAt + (Math.ceil((RESCUE.cloud.start - RESCUE.cloud.landing) / RESCUE.cloud.stepIn) - 1) * RESCUE.cloud.every;
