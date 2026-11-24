// Story run 10, the ship home: the deck of the stranger's small ship, at night, with nobody in his
// ear. Brief: project files gameplay/runs9-10-prototype-brief.md; lines and stills:
// story/runs9-10-story-check.md. The wisps are out in the cloud sea on both sides of the ship
// (Ladi, 24 Nov: "the wisps should be farther out and pulled down from the clouds"): they come
// from ahead and slide back past it on the wind, and he pulls them out of the cloud and over the
// rail. The ship's lamp amidships is the bank, and the dark patch from the low one is in the cloud
// sea ahead of the bow, going the same way: banking gains on it, a wisp that passes the stern lets
// it draw away. The run lasts a fixed time and cannot be won early. Every number that sets the
// feel is in SHIP.
// Tiles: x east, y south, the origin at the lamp (the board's centre). The bow is north.

export const SHIP = {
  run: "The ship home",
  shrine: "ship-deck",
  /** Ticks of the opening pause before it starts (his one word is said in it). */
  bellTicks: 3,
  /** The run's length in ticks of play (0.6 s each). Nothing ends it sooner. */
  ticks: 200,
  /** Wisps there are (so at most this many on deck), and ticks between one coming over the bow and the next: the first number at the start, the second from `rise.by` of the run on. */
  wisps: 14,
  every: [3, 2] as readonly [number, number],
  /** The wind: how many tiles toward the stern a loose wisp is carried each tick, at the start and from `rise.by` of the run on. It rises evenly between. */
  wind: [0.5, 1] as readonly [number, number],
  /** The share of the run by which the wind and the wisps have reached their worst. */
  rise: { by: 0.67 },
  /** The columns they come down, out in the cloud: this many tiles off the rail at the nearest and at the farthest, on both sides. None is ever on the deck by itself. */
  off: [2, 7] as readonly [number, number],
  /** Where one first shows: this many tiles ahead of the bow. And how far astern of the deck one is gone. */
  ahead: 7,
  astern: 2,
  /**
   * How far his pull reaches in this run (tiles; 10 is the game's own), and the leeway (Ladi, 24 Nov:
   * "1 tile from the rail, so 2 tiles total"): standing on the tile against a rail or up to
   * `railLeeway` tiles in from it (so a band `railLeeway + 1` tiles wide, tinted on the deck), every
   * lane on that side is in reach, out to the farthest. `reach` is `off[1] + railLeeway`, so the
   * reach square on screen is exactly what he can take. From the middle of the deck he has only the
   * near lanes, and from one rail nothing over the other side. To widen the band, raise both by the
   * same number.
   */
  reach: 8,
  railLeeway: 1,
  /** How many tiles a tick a wisp comes while he is pulling it (1 everywhere else): a haul out of the cloud would otherwise take as long as the wind takes to carry three others past. */
  haul: 2,
  /** Ticks before one that went in, or went off the stern, can come over the bow again. */
  pause: 2,
  /**
   * The patch ahead, the one meter: how far ahead of the bow it is (tiles). It starts at `start`,
   * each bank brings it `gain` nearer, each wisp lost off the stern lets it draw `lose` farther,
   * and it draws farther every tick by itself: by `drift[0]` at the start, rising evenly to
   * `drift[1]` at the end, so it is never held for good. And it pulls harder the nearer it is:
   * that drift is taken `pull[0]` times when it is as far as `gone` and `pull[1]` times when it is
   * as near as `nearest`, evenly between, so closing on it gets harder and losing it takes longer.
   * It is never nearer than `nearest`; past
   * `gone` it is out of sight, the lamp gutters for `gutterTicks`, and the run starts again at the
   * bow. `size` is how wide it is, `ease` how quickly the picture follows the number.
   */
  patch: { start: 11, gain: 0.8, lose: 0.08, drift: [0.04, 0.12] as readonly [number, number], pull: [0.4, 1.3] as readonly [number, number], nearest: 3, gone: 16, size: 6, ease: 0.12, gutterTicks: 5 },
  /** The second clock, which nobody has to read: the cloud sea goes from `night` to `grey` over the run, by this curve (1 is even; more keeps it dark longer). */
  sky: { night: "#03040a", grey: "#8b91a2", curve: 1.9 },
  /** The bell from home: from this share of the run, one slow stroke, then the next after each of these gaps in turn (ticks; 9 to 12 seconds, never the same twice running, so it tolls and never beats). */
  bell: { from: 0.5, gaps: [15, 19, 16, 20, 17] as readonly number[] },
  /** The stills over the bow: the second at this share of the run, the third this many seconds from the end (inside the last fifteen, and once home is coming into view). */
  stills: { half: 0.5, lastSec: 8 },
  /** The end: home comes in over the top of the screen in the last this many seconds, and he goes over the rail in the last `railTicks` ticks. */
  endSec: 10,
  railTicks: 3,
  /** Measurements only: how the stand-in for the player plays. */
  stand: { pushy: 0, sloppiness: 0.08 },
  /** Where Rook starts and where the hooded figure stands, in tiles from the lamp. */
  rook: [0, 4] as const,
  figure: [0, 11] as const,
  /** On a phone, how many tiles the short side of the screen shows, and how far ahead of him the eye sits (tiles toward the bow). */
  phoneSpan: 27,
  phoneAhead: 4,
} as const;

/** The deck: half its width and half its length in tiles (11 by 25), and the board it sits in. */
export const SHIP_DECK = { hw: 5, hl: 12 };
const HALF_W = 14, HALF_H = 30;
export const SHIP_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };
/** What the camera frames: the deck, the sea either side, and the sea ahead where the patch is. */
export const SHIP_FRAME = { x0: -13, y0: -30, x1: 13, y1: 15 };
/** The cloud sea a wisp can be in: this far either side of the lamp, and from ahead of the bow to astern. */
export const SHIP_SEA = { hw: SHIP_DECK.hw + SHIP.off[1] + 1, y0: -(SHIP_DECK.hl + SHIP.ahead + 1), y1: SHIP_DECK.hl + SHIP.astern + 1 };
/** The columns the wisps come down (tiles from the lamp). */
export const SHIP_LANES: readonly number[] = [-1, 1].flatMap((side) => Array.from({ length: SHIP.off[1] - SHIP.off[0] + 1 }, (_, i) => side * (SHIP_DECK.hw + SHIP.off[0] + i)));
export const inSea = (x: number, y: number) => !onDeck(x, y) && Math.abs(x) <= SHIP_SEA.hw && y >= SHIP_SEA.y0 && y <= SHIP_SEA.y1;

export const onDeck = (x: number, y: number) => Math.abs(x) <= SHIP_DECK.hw && Math.abs(y) <= SHIP_DECK.hl;

/** A number that goes evenly from `a` at the start to `b` by `by` of the run, at this share of it. */
export const shipRise = (a: number, b: number, share: number, by = 1) => a + (b - a) * Math.max(0, Math.min(1, share / by));

/** The run's share done (0 to 1) as the sea's light: 0 is night, 1 is first light. */
export const shipLight = (share: number) => Math.pow(Math.max(0, Math.min(1, share)), SHIP.sky.curve);

/** The deck as map rows: planks, the cloud sea round it (wells: nobody walks there, wisps float over it, a staff reaches across), the hooded figure at the stern, and where Rook starts. The lamp is the board's centre. */
export function shipRows(): string[] {
  const g: string[][] = Array.from({ length: SHIP_SIZE.h }, (_, by) => Array.from({ length: SHIP_SIZE.w }, (_, bx) => (onDeck(bx - HALF_W, by - HALF_H) ? "." : inSea(bx - HALF_W, by - HALF_H) ? "@" : " ")));
  const put = (x: number, y: number, ch: string) => (g[y + HALF_H]![x + HALF_W] = ch);
  put(SHIP.figure[0], SHIP.figure[1], "$");
  put(SHIP.rook[0], SHIP.rook[1], "1");
  return g.map((r) => r.join(""));
}
