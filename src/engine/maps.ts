// The shrines. Only the northern half is drawn (rows 0-12, plus the west half of the
// brazier row up to the centre tile); the south half is that drawing turned 180 degrees
// with Dawn and Dusk swapped, so neither guild ever gets the better side.
//
//   .  floor        #  shrine wall     o  boulder       ~  pool     (space) open sky
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
  /** How deep the coves bite in, as a fraction of the radius. */
  coves: number;
  /** How far the headlands push out. */
  heads: number;
  seed: number;
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

/** Margin of tiles added around the drawing so headlands have room. */
const MARGIN = 3;

/**
 * The edge of an island at angle a. Built only from even harmonics, so it's the same turned
 * 180 degrees: both guilds always get the same coastline.
 */
export function isleRadius(s: IsleShape, a: number) {
  const c = Math.cos(a), sn = Math.sin(a);
  const n = s.squareness;
  const base = s.radius / Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(sn), n), 1 / n);
  const ph = (k: number) => ((Math.sin(s.seed * 12.9898 + k * 78.233) * 43758.5453) % 1) * Math.PI * 2;
  // A wobble in [-1, 1]: a few low even harmonics with seeded phases.
  const w = (Math.cos(2 * a + ph(1)) * 0.25 + Math.cos(4 * a + ph(2)) * 0.45 + Math.cos(6 * a + ph(3)) * 0.3);
  const k = w < 0 ? 1 + w * s.coves : 1 + w * s.heads;
  return base * k;
}

export const SHRINE_DEFS: ShrineDef[] = [
  {
    id: "moss-hollow",
    name: "Moss Hollow",
    blurb: "An open glade. A few boulders, long sight lines.",
    isle: { radius: 14, squareness: 2.6, coves: 0.16, heads: 0.12, seed: 7 },
    rows: [
      "###########################",
      "#.........................#",
      "#..a.........o.........b..#",
      "#.........................#",
      "#.....o.............o.....#",
      "#.........................#",
      "#..........~~~~~..........#",
      "#.......o...........o.....#",
      "#.........................#",
      "#....a.................b..#",
      "#.........................#",
      "#..1.....#.......#.....2..#",
      "#.............B...........#",
      "#.o.........BB",
    ],
  },
  {
    id: "tidepool-steps",
    name: "Tidepool Steps",
    blurb: "Pools you can't wade but wisps drift across. Plan your walk.",
    isle: { radius: 14, squareness: 3, coves: 0.14, heads: 0.1, seed: 6 },
    rows: [
      "###########################",
      "#.........................#",
      "#.a.......~~~~~.........b.#",
      "#.........~~~~~...........#",
      "#...~~~...........~~~.....#",
      "#...~~~....o...o..~~~.....#",
      "#.........................#",
      "#..o.......~~~~~.......o..#",
      "#..........~~~~~..........#",
      "#.~~~...a.........b...~~~.#",
      "#.~~~.................~~~.#",
      "#..1..........~........2..#",
      "#.......~.....B...........#",
      "#.......~...BB",
    ],
  },
  {
    id: "ember-quarry",
    name: "Ember Quarry",
    blurb: "Cut-stone walls break sight. Corners matter.",
    isle: { radius: 14, squareness: 3.4, coves: 0.14, heads: 0.12, seed: 7 },
    rows: [
      "###########################",
      "#.........................#",
      "#..a........#..........b..#",
      "#...........#.............#",
      "#....####.........####....#",
      "#.......#....o....#.......#",
      "#.......#.........#.......#",
      "#..o..........a...........#",
      "#.........##...##.........#",
      "#.....b...................#",
      "#..####...............##..#",
      "#..1..........o........2..#",
      "#.........#...B...#.......#",
      "#.o.........BB",
    ],
  },
];

const TILE_OF: Record<string, Tile> = {
  " ": Tile.Edge,
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
  return g.map((r) => r.join(""));
}

export const SHRINES: Shrine[] = SHRINE_DEFS.map(buildShrine);

export function shrineById(id: string): Shrine {
  return SHRINES.find((s) => s.id === id) ?? SHRINES[0]!;
}
