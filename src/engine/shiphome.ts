// Story run 10, the ship home: the deck of the stranger's small ship, at night, with nobody in his
// ear. Brief: project files gameplay/runs9-10-prototype-brief.md; lines and stills:
// story/runs9-10-story-check.md. The wind carries loose wisps from the bow to the stern, the ship's
// lamp amidships is the bank, and the dark patch from the low one is in the cloud sea ahead of the
// bow, going the same way: banking gains on it, a wisp lost off the stern lets it draw away. The
// run lasts a fixed time and cannot be won early. Every number that sets the feel is in SHIP.
// Tiles: x east, y south, the origin at the lamp (the board's centre). The bow is north.

export const SHIP = {
  run: "The ship home",
  shrine: "ship-deck",
  /** Ticks of the opening pause before it starts (his one word is said in it). */
  bellTicks: 3,
  /** The run's length in ticks of play (0.6 s each). Nothing ends it sooner. */
  ticks: 200,
  /** Wisps there are (so at most this many on deck), and ticks between one coming over the bow and the next. */
  wisps: 12,
  every: 3,
  /** The wind: a loose wisp moves one tile toward the stern every this many ticks. */
  wind: 2,
  /** The columns they come down. The lamp's own columns are left clear, so none goes in by itself. */
  lanes: [-5, -4, -3, 3, 4, 5] as readonly number[],
  /** Ticks before one that went in, or went off the stern, can come over the bow again. */
  pause: 2,
  /**
   * The patch ahead, the one meter: how far ahead of the bow it is (tiles). It starts at `start`,
   * each bank brings it `gain` nearer, each wisp lost off the stern lets it draw `lose` farther,
   * and it draws `drift` farther every tick by itself. It is never nearer than `nearest`; past
   * `gone` it is out of sight, the lamp gutters for `gutterTicks`, and the run starts again at the
   * bow. `size` is how wide it is, `ease` how quickly the picture follows the number.
   */
  patch: { start: 9, gain: 0.4, lose: 0.15, drift: 0.04, nearest: 5, gone: 15, size: 6, ease: 0.12, gutterTicks: 5 },
  /** The second clock, which nobody has to read: the cloud sea goes from `night` to `grey` over the run, by this curve (1 is even; more keeps it dark longer). */
  sky: { night: "#03040a", grey: "#8b91a2", curve: 1.9 },
  /** The bell from home: from this share of the run, one slow stroke every this many ticks. */
  bell: { from: 0.5, every: 15 },
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
const HALF_W = 11, HALF_H = 30;
export const SHIP_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };
/** What the camera frames: the deck, the sea either side, and the sea ahead where the patch is. */
export const SHIP_FRAME = { x0: -11, y0: -30, x1: 11, y1: 15 };

export const onDeck = (x: number, y: number) => Math.abs(x) <= SHIP_DECK.hw && Math.abs(y) <= SHIP_DECK.hl;

/** The run's share done (0 to 1) as the sea's light: 0 is night, 1 is first light. */
export const shipLight = (share: number) => Math.pow(Math.max(0, Math.min(1, share)), SHIP.sky.curve);

/** The deck as map rows: planks, the hooded figure at the stern, and where Rook starts. The lamp is the board's centre. */
export function shipRows(): string[] {
  const g: string[][] = Array.from({ length: SHIP_SIZE.h }, (_, by) => Array.from({ length: SHIP_SIZE.w }, (_, bx) => (onDeck(bx - HALF_W, by - HALF_H) ? "." : " ")));
  const put = (x: number, y: number, ch: string) => (g[y + HALF_H]![x + HALF_W] = ch);
  put(SHIP.figure[0], SHIP.figure[1], "$");
  put(SHIP.rook[0], SHIP.rook[1], "1");
  return g.map((r) => r.join(""));
}
