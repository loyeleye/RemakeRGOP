// Story run 9, the rescue: the low one, a neighbouring island already ankle-deep in cloud. Brief:
// project files gameplay/runs9-10-prototype-brief.md; lines and stills: story/runs9-10-story-check.md.
// Rook and Kes fill the lamps of three boats at the landing while the cloud closes from the north,
// and a dark patch in the cloud crosses the board twice. Every number that sets the feel is in
// RESCUE. Tiles: x east, y south, the origin at the landing's slip (the bank, and the board's centre).

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
  hers: 3,
  /** Ticks before another comes in the place of one of his that banked or was lost. */
  pause: 3,
  /** Ticks after Kes's group is all banked before her next one comes. */
  groupPause: 4,
  /** How near the landing a wisp may arrive (tiles), how far inside the cloud's edge, and how loose one of her groups is. */
  arriveNear: 13,
  arriveInside: 3,
  spread: 3,
  /**
   * The cloud is the clock (run 6's wall, with no push-back at all). Its edge is an arc round the
   * landing: it starts `start` tiles off, past the north end, and from tick `firstAt` comes in
   * `stepIn` tiles every `every` ticks. A wisp it covers fades over `dimTicks` and is lost. When the
   * edge is within `landing` tiles of the slip with a boat still tied, the run starts again.
   */
  cloud: { start: 44, stepIn: 3, firstAt: 36, every: 32, dimTicks: 8, landing: 8 },
  /** The storm law's numbers, as in the race. */
  storm: { max: 3, reach: 2, link: 6, gap: 2 },
  /** Kes: how careful she is each tick, and ticks she stands and looks after the patch has crossed her. */
  kes: { sloppiness: 0.05, shaken: 5 },
  /**
   * The dark patch: a hard-edged stain `size` tiles across, moving `speed` tiles a tick on a
   * straight line. For `warn` ticks before its edge reaches the land, the lamps on its course gutter.
   * The first crossing comes once `firstBanks` are in (or at tick `firstBy`), west to east across the
   * middle strip where the most loose wisps are, at least `clearOfKes` tiles from her. The second
   * comes once `secondBanks` are in (or at `secondBy`), along the south neck, through where Kes is
   * with a string in hand: up to `lean` rows off her own row toward her string, and after `wait`
   * more ticks (or one more bank) wherever she has a string, and after twice that wherever she is.
   * `drag` is the other behaviour (the page's ?patch=drag): loose wisps under it are carried off with it.
   */
  patch: { size: 6, speed: 1, warn: 3, firstBanks: 4, firstBy: 110, secondBanks: 8, secondBy: 230, clearOfKes: 8, gap: 30, lean: 2, wait: 20, drag: false as boolean },
  /** The end: Kes runs to this tile by the slip (from the slip) and the boat lifts when she is there and the lines are said, or after `boardBy` ticks; then ticks the view holds on the boat before the usual end. */
  board: [3, 0] as const,
  boardBy: 26,
  holdTicks: 5,
  /** Measurements only: how the stand-in for the player plays. */
  stand: { pushy: 0, sloppiness: 0.08 },
  /** Where Rook and Kes start, and where the old couple stand, in tiles from the slip. */
  rook: [-3, -5] as const,
  kesAt: [10, -13] as const,
} as const;

/** The land: an oval north of the landing. */
export const LO_OVAL = { x: 0, y: -22, rx: 15.5, ry: 19.5 };
const HALF_W = 19, HALF_H = 45;
export const LO_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };
/** The part of the board worth looking at (the south half of it is open sky), in tiles from the slip. */
export const LO_FRAME = { x0: -18, y0: -44, x1: 18, y1: 8 };
/** The two long pools, and the three strips they leave: west, middle, east. */
export const LO_POOLS = [
  { x0: -6, x1: -4, y0: -36, y1: -9 },
  { x0: 4, x1: 6, y0: -36, y1: -9 },
] as const;
/** The landing: planks round a slip, open to the south, where the boat being loaded lies. */
export const LO_LANDING = { x0: -4, x1: 4, y0: -5, y1: 2 };
/** The island's own brazier, cold, in the middle of the middle strip: three tiles square. */
export const LO_BRAZIER = { x: 0, y: -22 };
/** Path lamps along the strips. */
export const LO_LAMPS: readonly (readonly [number, number])[] = [
  [-3, -33], [3, -28], [-3, -16], [3, -12],
  [-9, -34], [-13, -26], [-13, -17], [-9, -11],
  [9, -34], [13, -26], [13, -17], [9, -11],
  [-2, -39], [2, -7], [-7, -7], [7, -7],
];

const wob = (a: number) => 1 + 0.025 * Math.sin(3 * a + 0.9) + 0.015 * Math.sin(5 * a + 2.3);
const oval = (x: number, y: number) => Math.hypot((x - LO_OVAL.x) / LO_OVAL.rx, (y - LO_OVAL.y) / LO_OVAL.ry) <= wob(Math.atan2(y - LO_OVAL.y, x - LO_OVAL.x));
function landing(x: number, y: number) {
  return x >= LO_LANDING.x0 && x <= LO_LANDING.x1 && y >= LO_LANDING.y0 && y <= LO_LANDING.y1 && !(Math.abs(x) <= 1 && y >= 2);
}
export const loPool = (x: number, y: number) => LO_POOLS.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
export const loPlanks = landing;
export const loLand = (x: number, y: number) => oval(x, y) || landing(x, y);
/** Which strip a tile is on: 0 west, 1 middle, 2 east (the necks belong to the strip they are nearest). */
export const loStrip = (x: number) => (x < -3.5 ? 0 : x > 3.5 ? 2 : 1);

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

/** The island as map rows: ground, the pools, the landing's planks, the cold brazier, the lamps, and where Rook and Kes start. */
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
  for (const [x, y] of LO_LAMPS) put(x, y, "0", "a path lamp");
  put(RESCUE.rook[0], RESCUE.rook[1], "1", "Rook's start");
  put(RESCUE.kesAt[0], RESCUE.kesAt[1], "2", "Kes's start");
  return g.map((r) => r.join(""));
}
