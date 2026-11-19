// The shrines. Each is an island with its own coastline. Only the northern half is drawn (plus the west half of the
// brazier row up to the centre tile); the south half is that drawing turned 180 degrees
// with Dawn and Dusk swapped, so neither guild ever gets the better side.
//
//   .  floor        #  shrine wall     o  boulder       ~  pool     (space) open sky
//   *  ice (slides you the way you face)
//   B  brazier      a  Dawn wisp spawn b  Dusk wisp spawn
//   1  Dawn start   2  Dusk start

import { Board, Tile, pt, type Pt } from "./board.js";

export interface ShrineDef {
  id: string;
  name: string;
  blurb: string;
  rows: string[];
  /**
   * The island's shape. The drawing's outer wall is dropped, the grid gets a margin, and every
   * tile outside this outline becomes open sky. Without it the shrine is the plain rectangle.
   */
  isle?: IsleShape;
}

export interface IsleShape {
  /** Radius along the axes, in tiles from the centre. */
  radius: number;
  /** 2 = round, higher = squarer. */
  squareness: number;
  /** How deep the small coves bite in, as a fraction of the radius. */
  coves: number;
  /** How far the small headlands push out. */
  heads: number;
  seed: number;
  /** Stretch along x and y before turning: an oval, a long strip. */
  stretch?: [number, number];
  /** Turn the whole shape (radians, clockwise on screen). */
  turn?: number;
  /**
   * Big shape-defining waves: [k, amount, phase]. k must be even so the shape is the same
   * turned 180 degrees. k=2 pinches into an hourglass, 4 makes a clover or a cross, 6 a star.
   */
  waves?: [number, number, number][];
}

export interface Shrine {
  id: string;
  name: string;
  blurb: string;
  board: Board;
  wispSpawns: [Pt[], Pt[]];
  starts: [Pt[], Pt[]];
  /** Radius of the island's edge (in tiles from the centre) at angle a, where a = atan2(dy, dx). */
  outline: ((a: number) => number) | null;
}

/**
 * The edge of an island at angle a. Built only from even harmonics, so it's the same turned
 * 180 degrees: both guilds always get the same coastline.
 */
export function isleRadius(s: IsleShape, a: number) {
  const t = a - (s.turn ?? 0);
  const [sx, sy] = s.stretch ?? [1, 1];
  const c = Math.cos(t) / sx, sn = Math.sin(t) / sy;
  const n = s.squareness;
  const base = s.radius / Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(sn), n), 1 / n);
  let shape = 1;
  for (const [k, amt, ph] of s.waves ?? []) shape += amt * Math.cos(k * t + ph);
  const ph = (k: number) => ((Math.sin(s.seed * 12.9898 + k * 78.233) * 43758.5453) % 1) * Math.PI * 2;
  // A small wobble in [-1, 1]: a few even harmonics with seeded phases.
  const w = Math.cos(2 * a + ph(1)) * 0.2 + Math.cos(6 * a + ph(2)) * 0.45 + Math.cos(10 * a + ph(3)) * 0.35;
  const k = w < 0 ? 1 + w * s.coves : 1 + w * s.heads;
  return base * Math.max(0.2, shape) * k;
}

export const SHRINE_DEFS: ShrineDef[] = [
  {
    id: "moss-hollow",
    name: "Moss Hollow",
    blurb: "A round glade. A few boulders, a pond, long sight lines.",
    isle: { radius: 13.5, squareness: 2.2, coves: 0.12, heads: 0.1, seed: 7 },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "              ........               ",
      "             .....o....              ",
      "            ............             ",
      "           .................         ",
      "         .....................       ",
      "       .....o...~~~~~...o.....       ",
      "      ....a.....~~~~~.....b...       ",
      "      ........................       ",
      "      .....#..a.......b..#....       ",
      "      .....................o..       ",
      "      ...o.....................      ",
      "      ........o................      ",
      "      ..1...................2..      ",
      "      .............",
    ],
  },
  {
    id: "tidepool-steps",
    name: "Tidepool Steps",
    blurb: "A wide lagoon atoll dotted with pools. Wisps drift over; you can't wade.",
    isle: { radius: 12.5, squareness: 2.4, coves: 0.14, heads: 0.08, seed: 11, stretch: [1.35, 0.8] },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "          .........  .....           ",
      "         ..................          ",
      "        .......~~.......b.....       ",
      "       ..o...a.......~~........      ",
      "    ......~~......o..~~.........     ",
      "  ....a...~~...............~~.b..    ",
      "  ...~~.................o..~~....    ",
      " ....~~.....~~.................~~.   ",
      "  ..1...........................2..  ",
      "  .................",
    ],
  },
  {
    id: "ember-quarry",
    name: "Ember Quarry",
    blurb: "Two halves of a broken mountain, joined only at the brazier. Basalt pillars break sight.",
    isle: { radius: 13, squareness: 2.6, coves: 0.1, heads: 0.08, seed: 7, turn: Math.PI / 4, waves: [[2, 0.42, 0]] },
    rows: [
      "                                     ",
      "                                     ",
      "           ....                      ",
      "          .......                    ",
      "         .........                   ",
      "        ............                 ",
      "      .#...#...b....                 ",
      "    .................                ",
      "   ...a..........o...                ",
      "  .......o...#........               ",
      "  ...#................               ",
      "  ....................               ",
      "   ...1.....a.........               ",
      "   ......#..............             ",
      "   .......................           ",
      "    ....b.............#....          ",
      "    ....................2....        ",
      "     ..........................      ",
      "     ..............",
    ],
  },
  {
    id: "crystal-spire",
    name: "Crystal Spire",
    blurb: "A six-pointed star. Crystal clusters guard the points; sight runs down the arms.",
    isle: { radius: 12.2, squareness: 2, coves: 0.06, heads: 0.06, seed: 9, waves: [[6, 0.3, 0]] },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "           ...          ..           ",
      "          .....       .....          ",
      "          ....a.     ......          ",
      "          .......   .....b.          ",
      "          .......   .......          ",
      "          ...##.........##.          ",
      "           ................          ",
      "           .......o.......           ",
      "           ...............           ",
      "           ....o.....o....           ",
      "        ..................b..        ",
      "     ....#.................#....     ",
      "    ..1....a..................2..    ",
      "   ................",
    ],
  },
  {
    id: "cascade-falls",
    name: "Cascade Falls",
    blurb: "A long island cut by two streams. Wisps float over; you need the fords.",
    isle: { radius: 12.5, squareness: 2.8, coves: 0.1, heads: 0.08, seed: 2, stretch: [0.8, 1.3] },
    rows: [
      "                                     ",
      "                                     ",
      "                 ......              ",
      "                ........             ",
      "            ..~~...b....             ",
      "           ...~~.........            ",
      "           ...~~......~~.            ",
      "          ....~~......~~.b           ",
      "          ..a.~~......~~...          ",
      "          ....~~..o...~~...          ",
      "         .............~~...          ",
      "         ...................         ",
      "         ...o.~~.........o..         ",
      "         .....~~..a.........         ",
      "         .....~~......~~....         ",
      "         .....~~......~~....         ",
      "          ............~~....         ",
      "          .1..............2.         ",
      "          .........",
    ],
  },
  {
    id: "misty-stones",
    name: "Misty Stones",
    blurb: "A cross of four causeways. Standing stones in still pools; reach over them, walk round.",
    isle: { radius: 11.5, squareness: 2.6, coves: 0.05, heads: 0.05, seed: 5, waves: [[4, 0.42, 0]] },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                .....                ",
      "               a.....b               ",
      "               .......               ",
      "              ...~o~...              ",
      "              .........              ",
      "              .........              ",
      "              .........              ",
      "              ...~o~...              ",
      "              .........              ",
      "              .........              ",
      "              .........              ",
      "      ..~...................~.       ",
      "    ....o...................o...     ",
      "   ..............................    ",
      "   ...a.......................b2..   ",
      "   ..1.............",
    ],
  },
  {
    id: "blossom-garden",
    name: "Blossom Garden",
    blurb: "A four-petal flower. Flower beds you can reach across but not walk through.",
    isle: { radius: 12, squareness: 2, coves: 0.05, heads: 0.05, seed: 5, waves: [[4, 0.32, Math.PI]] },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "        .....           ....         ",
      "       .....1..       ...2....       ",
      "      ..a........    .......b..      ",
      "      ....oo......  .....oo....      ",
      "      ....o...............o....      ",
      "       ........a..o..b........       ",
      "       .......................       ",
      "        ......o.......o......        ",
      "         ...................         ",
      "          .................          ",
      "          ................           ",
      "           ........",
    ],
  },
  {
    id: "castle-rise",
    name: "Castle Rise",
    blurb: "A walled square with corner bastions. Sight lines run through the gates.",
    isle: { radius: 12, squareness: 7, coves: 0.03, heads: 0.03, seed: 3, waves: [[4, 0.13, Math.PI]] },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "      ......            ......       ",
      "      ..a......      .......b..      ",
      "      ............ ............      ",
      "      ....######.....######....      ",
      "      ....#...............#....      ",
      "      ....#...............#....      ",
      "       ...#..a....o....b..#....      ",
      "       .......................       ",
      "        ......................       ",
      "        .....................        ",
      "        .1...o.........o....2        ",
      "         ....................        ",
      "         ..........",
    ],
  },
  {
    id: "night-glade",
    name: "Night Glade",
    blurb: "A long moonlit ridge lying across the sky. Old trees and a glowing pond.",
    isle: { radius: 14, squareness: 2.3, coves: 0.08, heads: 0.06, seed: 7, stretch: [1.3, 0.62], turn: -Math.PI / 6 },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                         ........    ",
      "                   .......a.......   ",
      "                  ................   ",
      "                ...........##...b.   ",
      "               ...................   ",
      "             ..........~~~....o...   ",
      "          .............~~~.....2..   ",
      "         ...........#.............   ",
      "        .......a.......b..........   ",
      "        .........................    ",
      "      ...1..#...................     ",
      "     ..............",
    ],
  },
  {
    id: "glacier",
    name: "Glacier",
    blurb: "A jagged ice floe. Ice patches slide you the way you're facing; ice spires block sight.",
    isle: { radius: 13, squareness: 2.4, coves: 0.04, heads: 0.04, seed: 9, waves: [[10, 0.1, 0], [14, 0.06, 1]] },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "             ..                      ",
      "             ...    ...              ",
      "             ...#  ....              ",
      "             ..... .....             ",
      "             .......***...           ",
      "       .............***....  .       ",
      "       ..a..***............b...      ",
      "       .....***a.....b.........      ",
      "      ....#............***#....      ",
      "       .........**.....***....       ",
      "       ..**..................        ",
      "       ..**...........#.....         ",
      "       ...................**...      ",
      "      .......#............**..2..    ",
      "    ..1............",
    ],
  },
];

const TILE_OF: Record<string, Tile> = {
  " ": Tile.Edge,
  "*": Tile.Ice,
  "#": Tile.Wall,
  o: Tile.Rock,
  "~": Tile.Water,
  B: Tile.Brazier,
};

const SWAP: Record<string, string> = { a: "b", b: "a", "1": "2", "2": "1" };

/** Completes a half drawing into the full point-symmetric grid. */
export function mirrorRows(half: string[]): string[] {
  const width = half[0]!.length;
  const height = 2 * (half.length - 1) + 1;
  const c = half.length - 1;
  const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill("."));
  half.forEach((row, y) => [...row].forEach((ch, x) => (grid[y]![x] = ch)));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const drawn = y < c || (y === c && x <= c);
      if (drawn) continue;
      const src = grid[height - 1 - y]![width - 1 - x]!;
      grid[y]![x] = SWAP[src] ?? src;
    }
  return grid.map((r) => r.join(""));
}

export function buildShrine(def: ShrineDef): Shrine {
  let rows = mirrorRows(def.rows);
  if (def.isle) rows = carveIsle(rows, def.isle);
  const height = rows.length;
  const width = rows[0]!.length;
  const tiles: Tile[] = [];
  const wispSpawns: [Pt[], Pt[]] = [[], []];
  const starts: [Pt[], Pt[]] = [[], []];
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${def.id}: row ${y} is ${row.length} wide, expected ${width}`);
    [...row].forEach((ch, x) => {
      tiles.push(TILE_OF[ch] ?? Tile.Floor);
      if (ch === "a") wispSpawns[0].push(pt(x, y));
      if (ch === "b") wispSpawns[1].push(pt(x, y));
      if (ch === "1") starts[0].push(pt(x, y));
      if (ch === "2") starts[1].push(pt(x, y));
    });
  });
  // The brazier is always a 3x3 block at the centre, whatever the ASCII shows.
  const board = new Board(width, height, tiles);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) tiles[(board.center.y + dy) * width + board.center.x + dx] = Tile.Brazier;
  const isle = def.isle;
  return { id: def.id, name: def.name, blurb: def.blurb, board, wispSpawns, starts, outline: isle ? (a) => isleRadius(isle, a) : null };
}

/**
 * Turn a walled rectangle into an island: drop the outer wall, add a margin, and mark every
 * tile whose centre lies outside the coastline as open sky (" "). The coastline is a radius
 * per angle, so the land is always one piece around the centre.
 */
function carveIsle(rows: string[], isle: IsleShape): string[] {
  const H0 = rows.length, W0 = rows[0]!.length;
  let reach = 0;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const r = isleRadius(isle, a);
    reach = Math.max(reach, Math.abs(Math.cos(a) * r), Math.abs(Math.sin(a) * r));
  }
  const MARGIN = Math.max(0, Math.ceil(reach + 1.5 - (Math.min(W0, H0) - 1) / 2));
  const W = W0 + MARGIN * 2, H = H0 + MARGIN * 2;
  const g: string[][] = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const ox = x - MARGIN, oy = y - MARGIN;
      if (ox < 0 || oy < 0 || ox >= W0 || oy >= H0) return ".";
      const ch = rows[oy]![ox]!;
      const border = ox === 0 || oy === 0 || ox === W0 - 1 || oy === H0 - 1;
      return border && ch === "#" ? "." : ch;
    }),
  );
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const rim = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (!rim && Math.hypot(dx, dy) <= isleRadius(isle, Math.atan2(dy, dx)) - 0.5) continue;
      if ("ab12".includes(g[y]![x]!)) throw new Error(`island edge cuts off a spawn or start at (${x},${y})`);
      g[y]![x] = " ";
    }
  // Crop to the land plus a ring of sky, keeping the brazier dead centre.
  let ex = 0, ey = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (g[y]![x] !== " ") {
        ex = Math.max(ex, Math.abs(x - cx));
        ey = Math.max(ey, Math.abs(y - cy));
      }
  return g.slice(cy - ey - 1, cy + ey + 2).map((r) => r.slice(cx - ex - 1, cx + ex + 2).join(""));
}

export const SHRINES: Shrine[] = SHRINE_DEFS.map(buildShrine);

export function shrineById(id: string): Shrine {
  return SHRINES.find((s) => s.id === id) ?? SHRINES[0]!;
}
