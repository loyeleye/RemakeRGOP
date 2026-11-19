// The shrines. Only the northern half is drawn (rows 0-12, plus the west half of the
// brazier row up to the centre tile); the south half is that drawing turned 180 degrees
// with Dawn and Dusk swapped, so neither guild ever gets the better side.
//
//   .  floor        #  shrine wall     o  boulder       ~  pool
//   B  brazier      a  Dawn wisp spawn b  Dusk wisp spawn
//   1  Dawn start   2  Dusk start

import { Board, Tile, pt, type Pt } from "./board.js";

export interface ShrineDef {
  id: string;
  name: string;
  blurb: string;
  rows: string[];
}

export interface Shrine {
  id: string;
  name: string;
  blurb: string;
  board: Board;
  wispSpawns: [Pt[], Pt[]];
  starts: [Pt[], Pt[]];
}

export const SHRINE_DEFS: ShrineDef[] = [
  {
    id: "moss-hollow",
    name: "Moss Hollow",
    blurb: "An open glade. A few boulders, long sight lines.",
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
  const rows = mirrorRows(def.rows);
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
  return { id: def.id, name: def.name, blurb: def.blurb, board, wispSpawns, starts };
}

export const SHRINES: Shrine[] = SHRINE_DEFS.map(buildShrine);

export function shrineById(id: string): Shrine {
  return SHRINES.find((s) => s.id === id) ?? SHRINES[0]!;
}
