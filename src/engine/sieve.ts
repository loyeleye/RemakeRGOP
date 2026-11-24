// The Sieve (story run 8, a harder job): a broad, flat oval of pale chalk pierced by round wells,
// shafts open to the pale cloud below. Gameplay thread's sketch A (project files
// gameplay/run8-map-sketches.png) and brief (gameplay/run8-prototype-brief.md). Tiles, x east,
// y south, the origin at the brazier. The island's name and its keeper are the story thread's to
// give; "sieve" is a neutral id until then.

/** The numbers of run 8. Drafts from the brief, tuned by simulation (tools/sieve-sim.ts). */
export const SIEVE = {
  run: "A harder job",
  shrine: "sieve",
  /** Ticks of talk before the stop starts. */
  bellTicks: 3,
  /** Height lost a tick untouched; gained on the tick a staff first reaches a wisp; gained each tick it stays. */
  fall: 1.6,
  liftTap: 35,
  liftHold: 8,
  /** Wisps arrive lower as the run goes on: the first at `arriveHigh`, the last of the supply at `arriveLow`. */
  arriveHigh: 90,
  arriveLow: 55,
  /** Bank `need` from a supply of `supply`, `onBoard` out at a time. */
  need: 10,
  supply: 16,
  onBoard: 4,
  /** Where they arrive: between these shares of the way from the brazier to the coast. */
  band: [0.82, 0.97] as const,
  /** Which of the supply (counted from 0) arrive hanging over a well: six of the sixteen, never two running, and not the first. */
  overWell: [2, 5, 7, 10, 12, 14] as readonly number[],
  /** They hang over one of this many wells furthest from Rook, and this much lower than a wisp arriving then on the ground. */
  wellFarthest: 2,
  wellLower: 55,
  /** However late it comes, a wisp over a well arrives at least this high. */
  wellFloor: 27,
  /** The first fall: ticks of looking down the well after it, with nothing moving and no sound (about 2 seconds). */
  lookTicks: 4,
  /** Ticks the air over a well shimmers before a wisp appears there. */
  warnTicks: 6,
  /** Ticks before another comes in the place of one that banked or fell. */
  pause: 2,
  /** A wisp counts as kept up if a staff was on it within this many ticks (for Tilda's line when three are). */
  upWithin: 12,
  /** Measurements only: the juggling stand-in knocks a wisp up once it is below this. */
  standKnockAt: 45,
  /** The first wisp, which cannot be saved: its height as the run opens, over the well furthest from Rook. */
  firstHeight: 9,
  /** Where Rook starts, and where the keeper stands and watches. */
/**
   * The first pull (gameplay/run8-rework-brief.md, update of 24 Nov, a test on a switch): the rings
   * on every well close in for `windTicks`; then every loose wisp jumps one tile toward its nearest
   * well, and play holds for `holdTicks` with the whole island in view and no sound. It is staged
   * for when one of his wisps is within `nearBank` tiles of the bank and loose (touched within
   * `hisWithin` ticks, not under his staff); by the time half the supply has come, it fires anyway.
   * Once a game. `on` false plays the run as it was (v108).
   */
  pull: { on: true as boolean, windTicks: 3, holdTicks: 3, nearBank: 2, hisWithin: 12 },
  rook: [0, 4] as const,
  keeper: [5, 12] as const,
} as const;

/** The chalk: a plain oval, a little wobbly at the coast. */
export const SV_OVAL = { rx: 23, ry: 17 };
const HALF_W = 27, HALF_H = 21;
export const SV_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };
const wob = (a: number) => 1 + 0.02 * Math.sin(3 * a + 0.7) + 0.015 * Math.sin(5 * a + 2.1);
const land = (x: number, y: number) => Math.hypot(x / SV_OVAL.rx, y / SV_OVAL.ry) <= wob(Math.atan2(y, x));

/**
 * The wells: five, of different sizes (3 to 6 tiles across), round the brazier with clear ground
 * between them and none within 3 tiles of it. They sit between where wisps arrive and the
 * brazier, so the straight pull often crosses one.
 */
export const SV_WELLS = [
  { x: 10, y: -7, r: 3 },
  { x: -11, y: -5, r: 2.6 },
  { x: -1, y: -11, r: 1.6 },
  { x: -8, y: 8, r: 2.6 },
  { x: 10, y: 7, r: 2.1 },
] as const;
export const svWell = (x: number, y: number) => SV_WELLS.some((w) => Math.hypot(x - w.x, y - w.y) <= w.r);

/** About how far (x, y) is outside the land, in tiles, negative on land. */
export function svCoast(x: number, y: number) {
  const g = Math.hypot(x / SV_OVAL.rx, y / SV_OVAL.ry) || 1e-6;
  return (g - wob(Math.atan2(y, x))) / (Math.hypot(x / SV_OVAL.rx ** 2, y / SV_OVAL.ry ** 2) / g) - 0.5;
}
/** How far the coast is from the brazier at each angle. */
export function svOutline(a: number) {
  let r = 8;
  while (r < 40 && land(Math.cos(a) * r, Math.sin(a) * r)) r += 0.25;
  return r;
}

/** The island as map rows: chalk, the wells, the brazier, and where Rook and the keeper stand. */
export function sieveRows(): string[] {
  const g: string[][] = Array.from({ length: SV_SIZE.h }, (_, by) =>
    Array.from({ length: SV_SIZE.w }, (_, bx) => {
      const x = bx - HALF_W, y = by - HALF_H;
      if (!land(x, y)) return " ";
      return svWell(x, y) ? "@" : ".";
    }),
  );
  g[HALF_H + SIEVE.rook[1]]![HALF_W + SIEVE.rook[0]] = "1";
  g[HALF_H + SIEVE.keeper[1]]![HALF_W + SIEVE.keeper[0]] = "2";
  return g.map((r) => r.join(""));
}
