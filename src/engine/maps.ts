// The shrines. Each is an island with its own coastline. Only the northern half is drawn (plus the west half of the
// brazier row up to the centre tile); the south half is that drawing turned 180 degrees
// with Dawn and Dusk swapped, so neither guild ever gets the better side.
//
//   .  floor        #  shrine wall     o  boulder       ~  pool     (space) open sky
//   *  ice (slides you the way you face)
//   B  brazier      a  Dawn wisp spawn b  Dusk wisp spawn
//   1  Dawn start   2  Dusk start

import { Board, DIRS, Mover, Tile, pt, type Pt } from "./board.js";

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
  /** Drawing-to-play scale (default MAP_SCALE). Tests use 1. */
  scale?: number;
  /** The archway rings round the brazier, innermost first (default [RING]). */
  rings?: Ring[];
  /**
   * Where wisps appear: every floor tile this far from the centre (Euclidean, in played
   * tiles), shared by all guilds and picked at random. Default SPAWN_BAND.
   */
  spawnBand?: [number, number];
  /** The shrine's own trick, if any. */
  gimmicks?: Gimmicks;
  /** A share of wisps (0..1) that appear in a second, farther band instead. */
  farSpawns?: { band: [number, number]; share: number };
}

export interface Gimmicks {
  /**
   * The tide turns every this many ticks: while it comes in, a loose wisp on a pool drifts a
   * tile a tick toward the brazier; while it goes out, away from it.
   */
  tide?: number;
  /** Pools are linked moon ponds: a wisp flying into one comes out of its mirror image across the brazier. */
  ponds?: boolean;
  /** Pools are streams running clockwise round the brazier: a loose wisp on one is carried a tile a tick. */
  current?: "swirl";
  /** Vents erupt every this many ticks, flinging a wisp on one up to 6 tiles toward the brazier. */
  vents?: number;
  /** Portcullises change every this many ticks: east and west gates open while north and south are shut, then the other way. */
  portcullis?: number;
}

/** Default spawn band: from just past the archways to a couple of pulls out. */
export const SPAWN_BAND: [number, number] = [6, 10];

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
  /** Tentacle arms that curl out from the core. They needn't be symmetric. */
  arms?: Arm[];
  /** Bridges between arms. */
  links?: Link[];
}

/**
 * A curling arm of land. It starts inside the core at angle `from` and runs `length` tiles
 * outward, turning `curl` radians as it goes (most of the turn near the tip), narrowing from
 * width[0] to width[1] (half-widths, in tiles). `wiggle` adds a sideways wave.
 */
export interface Arm {
  from: number;
  length: number;
  curl: number;
  width: [number, number];
  wiggle?: number;
  /** Side routes that leave this arm and rejoin it further out. */
  forks?: Fork[];
}

/**
 * A second route along an arm: it leaves at `from` and rejoins at `to` (0 = arm root, 1 = tip),
 * bowing out `bend` tiles to one side (negative for the other), with half-width `width`.
 * `clutter` scales the boulders, walls and ice on it (1 = like the arm).
 */
export interface Fork {
  from: number;
  to: number;
  bend: number;
  width: number;
  clutter: number;
}

/** A bridge between two arms: from arm a at ta to arm b at tb, bowing out `bend` tiles. */
export interface Link {
  a: number;
  ta: number;
  b: number;
  tb: number;
  bend: number;
  width: number;
  clutter: number;
}

export interface ArmSample {
  x: number;
  y: number;
  /** Half-width here. */
  w: number;
  /** How cluttered this stretch is (1 = normal). */
  c: number;
}

const armCache = new WeakMap<IsleShape, ArmSample[]>();

function armPoint(s: IsleShape, arm: Arm, t: number): { x: number; y: number; w: number } {
  const r = isleRadius(s, arm.from) * 0.6 + arm.length * t;
  const th = arm.from + arm.curl * t * t + Math.sin(t * Math.PI * 3) * (arm.wiggle ?? 0) * t;
  return { x: Math.cos(th) * r, y: Math.sin(th) * r, w: arm.width[0] + (arm.width[1] - arm.width[0]) * t };
}

/** A bowed path from p to q (quadratic curve whose middle sits `bend` tiles off the line). */
function bowed(p: { x: number; y: number }, q: { x: number; y: number }, bend: number, width: number, c: number): ArmSample[] {
  const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
  const cx = (p.x + q.x) / 2 - (dy / len) * bend * 2, cy = (p.y + q.y) / 2 + (dx / len) * bend * 2;
  const n = Math.ceil((len + Math.abs(bend) * 2) * 2);
  const out: ArmSample[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({ x: u * u * p.x + 2 * u * t * cx + t * t * q.x, y: u * u * p.y + 2 * u * t * cy + t * t * q.y, w: width, c });
  }
  return out;
}

/** Points along every arm, fork and bridge, half a tile apart, with the half-width there. */
export function armSamples(s: IsleShape): ArmSample[] {
  const hit = armCache.get(s);
  if (hit) return hit;
  const out: ArmSample[] = [];
  for (const arm of s.arms ?? []) {
    const n = Math.ceil(arm.length * 2);
    for (let i = 0; i <= n; i++) out.push({ ...armPoint(s, arm, i / n), c: 1 });
    for (const f of arm.forks ?? []) out.push(...bowed(armPoint(s, arm, f.from), armPoint(s, arm, f.to), f.bend, f.width, f.clutter));
  }
  for (const l of s.links ?? []) {
    const a = s.arms?.[l.a], b = s.arms?.[l.b];
    if (a && b) out.push(...bowed(armPoint(s, a, l.ta), armPoint(s, b, l.tb), l.bend, l.width, l.clutter));
  }
  armCache.set(s, out);
  return out;
}

/** How far outside the land (dx, dy) is, in tiles: negative on land. Core and arms together. */
export function coastDepth(s: IsleShape, dx: number, dy: number, core = (a: number) => isleRadius(s, a)): number {
  let d = Math.hypot(dx, dy) - core(Math.atan2(dy, dx));
  for (const p of armSamples(s)) d = Math.min(d, Math.hypot(dx - p.x, dy - p.y) - p.w);
  return d;
}

/** How far the land reaches from the centre along x or y. */
function landReach(s: IsleShape, core = (a: number) => isleRadius(s, a)): number {
  let reach = 0;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2, r = core(a);
    reach = Math.max(reach, Math.abs(Math.cos(a) * r), Math.abs(Math.sin(a) * r));
  }
  for (const p of armSamples(s)) reach = Math.max(reach, Math.abs(p.x) + p.w, Math.abs(p.y) + p.w);
  return reach;
}

/** How much bigger the played island is than its drawing. */
export const MAP_SCALE = 1.5;

/**
 * How a ring of archways is laid out. Each is described along one side (t runs from -R to R,
 * corners at the ends) and the other three sides are that side turned 90 degrees, so every
 * style is fair to two or four guilds.
 *
 *   gates      pillars all round, one 3-wide arch in the middle of each side (tightest)
 *   open       the corners are open too: arches in the middle, open diagonals (loosest)
 *   diagonals  the middle of each side is walled up; only the open corners let wisps in
 *   pillared   like open, but a lone pillar stands on each corner, so nothing comes in
 *              straight down a diagonal
 *   pinwheel   pillars all round, with each side's gap pushed off centre the same way round,
 *              so no gap lines up with the one across the brazier
 *   colonnade  a pillar on every other tile: lots of 1-wide gaps, but a wisp can't cut
 *              diagonally between two pillars
 *   posts      one post each side of a narrow middle gate; everything else open
 */
export type RingStyle = "gates" | "open" | "diagonals" | "pillared" | "pinwheel" | "colonnade" | "posts" | "wickets";

export interface Ring {
  /** Chebyshev distance of the pillars from the centre tile. */
  radius: number;
  style: RingStyle;
  /**
   * Deflector stones on the four diagonals at this distance from the centre, inside the ring.
   * They stop wisps and walkers but not sight, so a wisp flung at a corner of the rim glances
   * off one and slides in: most good angles are bank shots off a stone.
   */
  stones?: number;
  /** A round sheet of ice round the rim, out to this radius (the court's corners stay dry). */
  ice?: number;
  /**
   * Crystals in the court, given in one eighth and copied to all eight symmetric places. A
   * crystal is a thin mirror on its tile's diagonal ("/" or "\\" as drawn, north up): it blocks
   * walking and wisps but not sight, and a wisp that flies into it is turned off the mirror.
   */
  crystals?: { x: number; y: number; o: "/" | "\\" }[];
  /** Other tiles (by map character), given in one eighth and copied to all eight symmetric places. */
  marks?: { x: number; y: number; c: string; turns?: boolean }[];
}

/** Every court feature of a ring as offset -> map character. */
export function courtFeatures(ring: Ring): Map<string, string> {
  const out = new Map<string, string>();
  if (ring.ice) {
    const r = ring.ice, R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) > 2 && Math.hypot(dx, dy) <= r) out.set(`${dx},${dy}`, "*");
  }
  if (ring.stones) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) out.set(`${sx * ring.stones},${sy * ring.stones}`, "o");
  for (const m of ring.marks ?? []) {
    if (m.turns) {
      // Only the four quarter turns (for pinwheel rings, which have no mirror symmetry).
      let x = m.x, y = m.y;
      for (let k = 0; k < 4; k++) {
        out.set(`${x},${y}`, m.c);
        [x, y] = [-y, x];
      }
      continue;
    }
    for (const [x, y] of [[m.x, m.y], [m.y, m.x]] as const)
      for (const sx of [1, -1]) for (const sy of [1, -1]) out.set(`${x * sx},${y * sy}`, m.c);
  }
  for (const c of ring.crystals ?? [])
    for (const swap of [false, true])
      for (const sx of [1, -1])
        for (const sy of [1, -1]) {
          const x = (swap ? c.y : c.x) * sx, y = (swap ? c.x : c.y) * sy;
          // A mirror flipped on one axis turns into the other diagonal; swapping x and y keeps it.
          const o = sx * sy < 0 ? (c.o === "/" ? "\\" : "/") : c.o;
          out.set(`${x},${y}`, o);
        }
  return out;
}

export const RING: Ring = { radius: 5, style: "gates" };

/** One line for the lobby on how a shrine's archways play. */
export const RING_NOTES: Record<RingStyle, string> = {
  gates: "Archways: closed corners, one gate per side. Hard to score.",
  open: "Archways: open corners and open gates. Easy to score.",
  diagonals: "Archways: the gates are walled up; wisps come in at the corners.",
  pillared: "Archways: open corners, but a pillar stops straight diagonal shots.",
  pinwheel: "Archways: every gate is off-centre, so nothing lines up across the brazier.",
  colonnade: "Archways: a pillar on every other tile. Lots of narrow ways in.",
  posts: "Archways: a post each side of every gate, wide open corners.",
  wickets: "Archways: open corners, and a narrow wicket gate in the middle of each wall.",
};

/** The lobby line for a shrine's archways (outer ring first when there are two). */
export function ringNote(rings: Ring[]): string {
  if (rings.length > 1) return "Two rings of archways: in through a gate, round the court, in at a corner. Very hard to score.";
  if (!rings[0]) return "";
  const r = rings[0];
  const extra = r.stones ? " Stones by the brazier turn wisps in off the corners." : r.crystals ? " Pull a wisp into a crystal mirror and it flies off at right angles, straight on." : r.ice ? " The brazier stands on a round sheet of ice: let go of a wisp on it and it skates on; step on it and so do you." : "";
  return RING_NOTES[r.style] + extra;
}

/** Is tile t along a side (t from -R to R, centre 0) a pillar? */
function ringPillar(style: RingStyle, R: number, t: number): boolean {
  const a = Math.abs(t);
  switch (style) {
    case "gates":
      return a >= 2;
    case "open":
      return a >= 2 && a <= R - 2;
    case "diagonals":
      return a <= R - 2;
    case "pillared":
      return (a >= 2 && a <= R - 2) || a === R;
    case "pinwheel":
      return t < 1 || t > 3;
    case "colonnade":
      return a >= 2 && a % 2 === 0;
    case "posts":
      return a === 1;
    case "wickets":
      return a >= 1 && a <= R - 2;
  }
}

/** The pillar tiles of a ring, as offsets from the centre, each once. */
export function ringWalls(ring: Ring): Pt[] {
  const R = ring.radius;
  const seen = new Set<string>();
  const out: Pt[] = [];
  for (let t = -R; t <= R; t++) {
    if (!ringPillar(ring.style, R, t)) continue;
    let x = t, y = -R;
    for (let k = 0; k < 4; k++) {
      const key = `${x},${y}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(pt(x, y));
      }
      [x, y] = [-y, x];
    }
  }
  return out;
}

export interface Shrine {
  id: string;
  name: string;
  blurb: string;
  board: Board;
  /** Teams this layout seats: 2, or up to 4 on a four-way island. */
  teams: number;
  /** Per team: the drawn spawn marks (kept for the map's look and as a fallback). */
  wispSpawns: Pt[][];
  /** Where wisps appear, shared by every guild. */
  spawnField: Pt[];
  /** A farther-out field that a share of wisps appear in instead (empty for none). */
  farField: Pt[];
  farShare: number;
  starts: Pt[][];
  /** The archway rings round the brazier, innermost first. */
  rings: Ring[];
  /** Radius of the island's edge (in tiles from the centre) at angle a, where a = atan2(dy, dx). */
  outline: ((a: number) => number) | null;
  /** Signed distance from the coast at (dx, dy) from the centre, negative on land; null for no island. */
  coast: ((dx: number, dy: number) => number) | null;
  /** True when the island has arms, so its outline isn't one radius per angle. */
  arms: boolean;
  gimmicks: Gimmicks;
  /** The island's shape in played tiles (scaled), or null. */
  isle: IsleShape | null;
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
    rings: [{ radius: 5, style: "colonnade" }],
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
    blurb: "A wide lagoon atoll with big tide pools on the way in. Wisps drift over; you can't wade. The tide turns every 20 ticks: a loose wisp on a pool drifts in toward the brazier, then out again.",
    isle: { radius: 12.5, squareness: 2.4, coves: 0.14, heads: 0.08, seed: 11, stretch: [1.35, 0.8] },
    rings: [{ radius: 5, style: "wickets" }],
    gimmicks: { tide: 20 },
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
      "        ..........~.....b.....       ",
      "       ..o...a...~~~...........      ",
      "    .........~~..~o~..~~........     ",
      "  ....a.....~~~~..~..~~~~.....b..    ",
      "  ...........~~.......~~o........    ",
      " ......~~~.................~~~....   ",
      "  ..1..~~~.................~~~..2..  ",
      "  .................",
    ],
  },
  {
    id: "ember-quarry",
    name: "Ember Quarry",
    blurb: "Two halves of a broken mountain, joined only at the brazier. Basalt pillars break sight. Ember vents erupt every 5 ticks, flinging a wisp on one toward the brazier.",
    isle: { radius: 13, squareness: 2.6, coves: 0.1, heads: 0.08, seed: 7, turn: Math.PI / 4, waves: [[2, 0.42, 0]] },
    rings: [{ radius: 5, style: "pinwheel", marks: [{ x: 7, y: 3, c: "^", turns: true }, { x: 8, y: 5, c: "^", turns: true }] }],
    gimmicks: { vents: 5 },
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
    blurb: "A six-pointed star. Crystal clusters guard the points; sight runs down the arms. Crystal mirrors out among the spawns turn a wisp at right angles and send it flying straight on.",
    isle: { radius: 12.2, squareness: 2, coves: 0.06, heads: 0.06, seed: 9, waves: [[6, 0.3, 0]] },
    rings: [{ radius: 5, style: "open", crystals: [{ x: 7, y: 2, o: "/" }] }],
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
    blurb: "A long island cut by two streams. Wisps float over; you need the fords. The streams run clockwise round the island, carrying a loose wisp a tile a tick.",
    isle: { radius: 12.5, squareness: 2.8, coves: 0.1, heads: 0.08, seed: 2, stretch: [0.8, 1.3] },
    rings: [{ radius: 5, style: "diagonals" }],
    gimmicks: { current: "swirl" },
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
    rings: [{ radius: 5, style: "pillared" }],
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
    blurb: "A four-petal flower. Flower beds you can reach across but not walk through, and petal paths that hurry a wisp along at 2 tiles a tick.",
    isle: { radius: 12, squareness: 2, coves: 0.05, heads: 0.05, seed: 5, waves: [[4, 0.32, Math.PI]] },
    rings: [{ radius: 5, style: "open", marks: [{ x: 6, y: 0, c: "+" }, { x: 7, y: 0, c: "+" }, { x: 8, y: 0, c: "+" }, { x: 6, y: 6, c: "+" }, { x: 7, y: 7, c: "+" }] }],
    gimmicks: {},
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
    id: "fairy-ring",
    name: "Fairy Ring",
    blurb: "A small glade inside a ring of giant toadstools. Wisps appear close and the gates line up: the place to learn your angles and chase records.",
    isle: { radius: 12, squareness: 2, coves: 0.04, heads: 0.04, seed: 21 },
    rings: [{ radius: 5, style: "posts", stones: 3 }],
    spawnBand: [6, 8],
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "                  .                  ",
      "             ...........             ",
      "            .............            ",
      "          .................          ",
      "         ..o.............o..         ",
      "        ..........a..........        ",
      "        ..........b..........        ",
      "       .......................       ",
      "      .........................      ",
      "      .......o.........o.......      ",
      "      .........................      ",
      "      .........................      ",
      "      ....1...............2....      ",
      "     ..............",
    ],
  },
  {
    id: "castle-rise",
    name: "Castle Rise",
    blurb: "A walled square with corner bastions. Portcullises in the gates rise and fall every 10 ticks: east and west, then north and south.",
    isle: { radius: 12, squareness: 7, coves: 0.03, heads: 0.03, seed: 3, waves: [[4, 0.13, Math.PI]] },
    rings: [{ radius: 5, style: "pillared", marks: [{ x: 5, y: 0, c: "=" }, { x: 5, y: 1, c: "=" }] }],
    gimmicks: { portcullis: 10 },
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
    blurb: "A long moonlit ridge lying across the sky. Old trees and two linked moon ponds: a wisp that flies into one comes out of the other, still going the same way.",
    isle: { radius: 14, squareness: 2.3, coves: 0.08, heads: 0.06, seed: 7, stretch: [1.3, 0.62], turn: -Math.PI / 6 },
    rings: [{ radius: 5, style: "pinwheel" }],
    gimmicks: { ponds: true },
    farSpawns: { band: [10, 14], share: 0.5 },
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
    blurb: "A jagged ice floe. Step on ice and you slide until something stops you or you're off it; let go of a wisp on ice and it skates on the same way. The brazier sits on a round sheet of ice.",
    isle: { radius: 13, squareness: 2.4, coves: 0.04, heads: 0.04, seed: 9, waves: [[10, 0.1, 0], [14, 0.06, 1]] },
    rings: [{ radius: 5, style: "open", ice: 4.6 }],
    farSpawns: { band: [10, 14], share: 0.2 },
    rows: [
      "                                     ",
      "                                     ",
      "                                     ",
      "                                     ",
      "             ..                      ",
      "             ...    ...              ",
      "             ...#  ....              ",
      "             ..... .....             ",
      "             .......****..           ",
      "       .............****...  .       ",
      "       ..a..****....****...b...      ",
      "       .....***a.....b.........      ",
      "      ....#.****.......***#....      ",
      "       .........***....****...       ",
      "       ..***....***....****..        ",
      "       ..***..........#.....         ",
      "       ..***..............***..      ",
      "      .......#............***.2..    ",
      "    ..1............",
    ],
  },
  {
    id: "old-bastion",
    name: "Old Bastion",
    blurb: "A huge ruined fortress. Broken walls everywhere and a tight gatehouse round the brazier: every wisp is hard won.",
    isle: { radius: 21, squareness: 3.2, coves: 0.06, heads: 0.05, seed: 4, waves: [[4, 0.06, Math.PI]] },
    rings: [{ radius: 6, style: "gates" }],
    spawnBand: [14, 30],
    rows: [
      "                                                         ",
      "                                                         ",
      "                                                         ",
      "                                                         ",
      "                                                         ",
      "                                                         ",
      "                                                         ",
      "                                       ...               ",
      "              .......              .........             ",
      "            .................    ............            ",
      "           .....................o.............           ",
      "           ..............o.................~~~.          ",
      "          .......a.....................b...~~~.          ",
      "          .....................................          ",
      "          ....######...####....#####...####.....         ",
      "          ....#...........................#.....         ",
      "          ....#.............o.............#.b...         ",
      "          ..a.#.........a..............o..#......        ",
      "         .....#..o........#..................o...        ",
      "         ..o........###...#.....b.###............        ",
      "         ...........#...............#............        ",
      "        ............#...............#.....#......        ",
      "        ......#........o......#...........#.....         ",
      "        ......#...............#...........#.....         ",
      "        ..~~..#..................o......o.#.....         ",
      "         .~~......##............................         ",
      "         .~~.........................##.........         ",
      "         .1.....o.............................2.         ",
      "         ....................",
    ],
  },
  {
    id: "sunwell-terrace",
    name: "Sunwell Terrace",
    blurb: "A sprawling sky-kraken of a terrace: five long arms curl out from a double-ringed sunwell. Wisps appear far out on the arms; pass them in as a team.",
    isle: {
      radius: 13, squareness: 2.2, coves: 0.08, heads: 0.06, seed: 12, waves: [[4, 0.1, 0]],
      // Five long tentacles, deliberately not symmetric.
      arms: [
        // Three ways along this one: the arm, a clear loop out one side, a cluttered cut the other.
        { from: 0.1, length: 50, curl: 0.9, width: [2.8, 1.4], wiggle: 0.12, forks: [{ from: 0.3, to: 0.66, bend: 7, width: 1.6, clutter: 0.3 }, { from: 0.36, to: 0.6, bend: -4, width: 1.4, clutter: 2.6 }] },
        { from: 1.35, length: 40, curl: 0.7, width: [2.5, 1.5], wiggle: 0.2, forks: [{ from: 0.45, to: 0.8, bend: -6, width: 1.5, clutter: 0.4 }] },
        { from: 2.45, length: 54, curl: 1.0, width: [3, 1.4], wiggle: 0.08, forks: [{ from: 0.22, to: 0.5, bend: -6, width: 1.5, clutter: 0.3 }, { from: 0.58, to: 0.88, bend: 5, width: 1.4, clutter: 2.4 }] },
        { from: 3.75, length: 42, curl: 0.6, width: [2.6, 1.5], wiggle: 0.22, forks: [{ from: 0.35, to: 0.72, bend: 6, width: 1.5, clutter: 2.5 }] },
        { from: 5.0, length: 46, curl: 0.8, width: [2.8, 1.4], wiggle: 0.14, forks: [{ from: 0.2, to: 0.52, bend: -5, width: 1.5, clutter: 0.3 }] },
      ],
      // Bridges between neighbouring arms: a wisp can be passed across instead of walked round.
      links: [
        { a: 0, ta: 0.78, b: 1, tb: 0.85, bend: 3, width: 1.3, clutter: 1.4 },
        { a: 2, ta: 0.7, b: 3, tb: 0.75, bend: -3, width: 1.3, clutter: 1.4 },
        { a: 3, ta: 0.95, b: 4, tb: 0.8, bend: 2, width: 1.2, clutter: 1 },
        { a: 4, ta: 0.92, b: 0, tb: 0.42, bend: 3, width: 1.3, clutter: 1.2 },
      ],
    },
    rings: [{ radius: 5, style: "diagonals" }, { radius: 9, style: "gates" }],
    spawnBand: [16, 90],
    rows: [
      "                                   ",
      "                                   ",
      "                                   ",
      "               ..                  ",
      "              .....                ",
      "             ........              ",
      "            ............           ",
      "           ......o.......          ",
      "          ..a.......~~b..          ",
      "         ...........~~....         ",
      "         .o.............o..        ",
      "        ~~....a.....b.......       ",
      "      ..~~...................      ",
      "    ...a...................b.      ",
      "    ........................o.     ",
      "    ..o.......................     ",
      "    .1.......................2.    ",
      "    ..............",
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
  "%": Tile.Rime,
  "+": Tile.Bloom,
  "^": Tile.Vent,
  "=": Tile.Gate,
  "/": Tile.CrystalA,
  "\\": Tile.CrystalB,
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
  let rows = scaleRows(mirrorRows(def.rows), def.scale ?? MAP_SCALE);
  const isle = scaledIsle(def);
  if (isle) rows = carveIsle(rows, isle);
  rows = addRings(rows, ringsOf(def));
  return finish(def, rows, 2, isle ? (a) => isleRadius(isle, a) : null, isle);
}

const SPAWN_TEAM: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
const START_TEAM: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3 };

function finish(def: ShrineDef, rows: string[], teams: number, outline: ((a: number) => number) | null, isle?: IsleShape): Shrine {
  const height = rows.length;
  const width = rows[0]!.length;
  const tiles: Tile[] = [];
  const wispSpawns: Pt[][] = Array.from({ length: teams }, () => []);
  const starts: Pt[][] = Array.from({ length: teams }, () => []);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${def.id}: row ${y} is ${row.length} wide, expected ${width}`);
    [...row].forEach((ch, x) => {
      tiles.push(TILE_OF[ch] ?? Tile.Floor);
      const sp = SPAWN_TEAM[ch], st = START_TEAM[ch];
      if (sp !== undefined && sp < teams) wispSpawns[sp]!.push(pt(x, y));
      if (st !== undefined && st < teams) starts[st]!.push(pt(x, y));
    });
  });
  // The brazier is always a 3x3 block at the centre, whatever the ASCII shows.
  const board = new Board(width, height, tiles);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) tiles[(board.center.y + dy) * width + board.center.x + dx] = Tile.Brazier;
  return { id: def.id, name: def.name, blurb: def.blurb, board, teams, wispSpawns, spawnField: spawnField(board, def.spawnBand ?? SPAWN_BAND), starts, rings: ringsOf(def), outline, coast: isle && outline ? (dx, dy) => coastDepth(isle, dx, dy, outline) : null, arms: !!isle?.arms?.length, isle: isle ?? null, gimmicks: def.gimmicks ?? {}, farField: def.farSpawns ? spawnField(board, def.farSpawns.band) : [], farShare: def.farSpawns?.share ?? 0 };
}

/**
 * The floor tiles in the band that a wisp could be pulled from into the brazier zone. The
 * board is symmetric, so the field is too, and every guild draws from the same field.
 */
export function spawnField(board: Board, [lo, hi]: [number, number]): Pt[] {
  const W = board.width, H = board.height, c = board.center;
  // Tiles a wisp can travel from to reach the zone.
  const ok = new Uint8Array(W * H);
  const q: Pt[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (board.inBankZone(pt(x, y))) {
        ok[y * W + x] = 1;
        q.push(pt(x, y));
      }
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    for (const d of DIRS) {
      const n = pt(p.x + d.x, p.y + d.y);
      if (!board.inside(n) || ok[n.y * W + n.x] || !board.canStep(n, -d.x, -d.y, Mover.Wisp)) continue;
      ok[n.y * W + n.x] = 1;
      q.push(n);
    }
  }
  const out: Pt[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - c.x, y - c.y);
      if (r >= lo && r <= hi && ok[y * W + x] && board.tile(pt(x, y)) === Tile.Floor) out.push(pt(x, y));
    }
  return out;
}

function scaledIsle(def: ShrineDef): IsleShape | undefined {
  const f = def.scale ?? MAP_SCALE;
  return (
    def.isle && {
      ...def.isle,
      radius: def.isle.radius * f,
      arms: def.isle.arms?.map((a) => ({
        ...a,
        length: a.length * f,
        width: [a.width[0] * f, a.width[1] * f] as [number, number],
        forks: a.forks?.map((k) => ({ ...k, bend: k.bend * f, width: k.width * f })),
      })),
      links: def.isle.links?.map((l) => ({ ...l, bend: l.bend * f, width: l.width * f })),
    }
  );
}

const ringsOf = (def: ShrineDef) => def.rings ?? [RING];

/** Rounds half away from zero, so a layout scaled about its centre stays point-symmetric. */
const sround = (v: number) => Math.sign(v) * Math.round(Math.abs(v));

/**
 * Blows a drawing up about its centre tile. Pools, ice, walls and open sky grow with it; spawns,
 * starts and boulders stay single tiles, at their scaled spots.
 */
export function scaleRows(rows: string[], f: number): string[] {
  const H0 = rows.length, W0 = rows[0]!.length;
  const cx0 = Math.floor(W0 / 2), cy0 = Math.floor(H0 / 2);
  const hx = sround(cx0 * f), hy = sround(cy0 * f);
  const out: string[] = [];
  for (let y = -hy; y <= hy; y++) {
    let r = "";
    for (let x = -hx; x <= hx; x++) {
      const sx = sround(x / f), sy = sround(y / f);
      const ch = rows[cy0 + sy]?.[cx0 + sx] ?? " ";
      const point = "ab12o".includes(ch);
      r += point ? (sround(sx * f) === x && sround(sy * f) === y ? ch : ".") : ch === "B" ? "." : ch;
    }
    out.push(r);
  }
  return out;
}

/**
 * The archway rings. Pillars block walking, wisps and sight, so a wisp has to come in through
 * a gap. Everything else from the brazier out to one tile past the outer ring is cleared, and
 * any spawn or start in there moves out along its ray.
 */
export function addRings(rows: string[], rings: Ring[]): string[] {
  if (rings.length === 0) return rows;
  const H = rows.length, W = rows[0]!.length;
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  const g = rows.map((r) => [...r]);
  const walls = new Set(rings.flatMap(ringWalls).map((p) => `${p.x},${p.y}`));
  const outer = Math.max(...rings.map((r) => r.radius));
  const court = new Map(rings.flatMap((r) => [...courtFeatures(r)]));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (g[y]![x] === " ") continue;
      if (d > outer + 1) {
        // Features out past the archways sit on whatever ground is there (spawns move aside).
        const f = court.get(`${dx},${dy}`);
        if (f && g[y]![x] !== "#") g[y]![x] = f;
        continue;
      }
      const ch = g[y]![x]!;
      if ("abcd1234".includes(ch)) {
        for (let k = outer + 2; ; k++) {
          const nx = cx + sround((dx * k) / d), ny = cy + sround((dy * k) / d);
          if (!g[ny]?.[nx] || g[ny]![nx] === " ") throw new Error(`no room past the ring for (${x},${y})`);
          if (g[ny]![nx] === ".") {
            g[ny]![nx] = ch;
            break;
          }
        }
      }
      g[y]![x] = walls.has(`${dx},${dy}`) ? "#" : d > 2 && court.has(`${dx},${dy}`) ? court.get(`${dx},${dy}`)! : d <= 1 ? "B" : ".";
    }
  return g.map((r) => r.join(""));
}

/**
 * Turn a walled rectangle into an island: drop the outer wall, add a margin, and mark every
 * tile whose centre lies outside the coastline as open sky (" "). The coastline is a radius
 * per angle, so the land is always one piece around the centre.
 */
function carveIsle(rows: string[], isle: IsleShape): string[] {
  const H0 = rows.length, W0 = rows[0]!.length;
  const reach = landReach(isle);
  const MARGIN = Math.max(0, Math.ceil(reach + 1.5 - (Math.min(W0, H0) - 1) / 2));
  const W = W0 + MARGIN * 2, H = H0 + MARGIN * 2;
  const g: string[][] = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const ox = x - MARGIN, oy = y - MARGIN;
      if (ox < 0 || oy < 0 || ox >= W0 || oy >= H0) return ".";
      const ch = rows[oy]![ox]!;
      const border = ox === 0 || oy === 0 || ox === W0 - 1 || oy === H0 - 1;
      // Sky in the drawing is redrawn by the coastline below.
      return (border && ch === "#") || ch === " " ? "." : ch;
    }),
  );
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const rim = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const inside = coastDepth(isle, dx, dy);
      // A spawn or start right on the shore is kept (the scaled layout can round onto it).
      if (!rim && (inside <= -0.5 || (inside <= 0.5 && "abcd1234".includes(g[y]![x]!)))) continue;
      if ("abcd1234".includes(g[y]![x]!)) throw new Error(`island edge cuts off a spawn or start at (${x},${y}) d=${inside.toFixed(2)}`);
      g[y]![x] = " ";
    }
  if (isle.arms?.length) scatterArms(g, cx, cy, isle);
  dropIslets(g, cx, cy);
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

/**
 * The four-way version of an island, for 3 or 4 teams. One quarter of the two-team layout
 * (west of the centre column, from the brazier row up) is turned 90 degrees three times, so
 * all four sides are the same. The coastline is the wider of the shape and the shape turned a
 * quarter, which is the same from all four sides.
 */
export function buildFourWay(def: ShrineDef): Shrine {
  // Use the first quarter (turning the source a quarter at a time) that holds two spawns.
  let err: unknown;
  for (let turn = 0; turn < 4; turn++) {
    try {
      return fourWayFrom(def, turn);
    } catch (e) {
      err = e;
    }
  }
  throw err;
}

function fourWayFrom(def: ShrineDef, turn: number): Shrine {
  const src = scaleRows(mirrorRows(def.rows), def.scale ?? MAP_SCALE);
  const H0 = src.length, W0 = src[0]!.length;
  const scx = Math.floor(W0 / 2), scy = Math.floor(H0 / 2);
  const isle = scaledIsle(def);
  const outline = isle ? (a: number) => Math.max(isleRadius(isle, a), isleRadius(isle, a + Math.PI / 2)) : null;
  let half = Math.max(scx, scy);
  if (isle && outline) half = Math.max(half, Math.ceil(landReach(isle, outline) + 1.5));
  const S = half * 2 + 1;
  // Quarter D: dx <= -1, dy <= 0. Turn k maps (dx, dy) -> (-dy, dx) k times.
  const quarter = (qx: number, qy: number) => {
    let dx = qx, dy = qy;
    for (let k = 0; k < turn; k++) [dx, dy] = [-dy, dx];
    const x = scx + dx, y = scy + dy;
    if (x < 0 || y < 0 || x >= W0 || y >= H0) return ".";
    let ch = src[y]![x]!;
    const border = x === 0 || y === 0 || x === W0 - 1 || y === H0 - 1;
    if (ch === " " || (border && ch === "#")) ch = ".";
    if (ch in SPAWN_TEAM) return "a";
    if (ch in START_TEAM) return "1";
    return ch;
  };
  const g: string[][] = Array.from({ length: S }, () => Array<string>(S).fill("."));
  for (let dy = -half; dy <= 0; dy++)
    for (let dx = -half; dx <= -1; dx++) {
      let ch = quarter(dx, dy);
      let x = dx, y = dy;
      for (let k = 0; k < 4; k++) {
        const out = ch === "a" ? "abcd"[k]! : ch === "1" ? "1234"[k]! : ch;
        g[half + y]![half + x] = out;
        [x, y] = [-y, x];
      }
    }
  g[half]![half] = "B";
  const rows = g.map((r) => r.join(""));
  let carved = isle && outline ? carveFolded(rows, (dx, dy) => coastDepth(isle, dx, dy, outline), isle) : rows;
  carved = addRings(carved, ringsOf(def));
  const s = finish(def, carved, 4, outline, isle);
  for (let t = 0; t < 4; t++) {
    if (s.wispSpawns[t]!.length < 2) throw new Error(`${def.id} four-way: team ${t} has ${s.wispSpawns[t]!.length} wisp spawns`);
    if (s.starts[t]!.length < 1) throw new Error(`${def.id} four-way: team ${t} has no start`);
  }
  return s;
}

/**
 * Clutter for the arms, past the core: boulders, short broken walls and ice slicks, placed by a
 * hash of the tile so the same island always gets the same clutter. Never pools, which would
 * cut an arm in two for walkers.
 */
function scatterArms(g: string[][], cx: number, cy: number, isle: IsleShape) {
  const H = g.length, W = g[0]!.length;
  const hash = (x: number, y: number, k: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7 + isle.seed * 17.3) * 43758.5453;
    return v - Math.floor(v);
  };
  const core = (dx: number, dy: number) => Math.hypot(dx, dy) - isleRadius(isle, Math.atan2(dy, dx));
  const land = (x: number, y: number) => g[y]?.[x] === "." && core(x - cx, y - cy) > 1.5;
  const samples = armSamples(isle);
  // Clutter of the route a tile is on: the sample it sits deepest inside.
  const clutter = (dx: number, dy: number) => {
    let best = Infinity, c = 1;
    for (const p of samples) {
      const d = Math.hypot(dx - p.x, dy - p.y) - p.w;
      if (d < best) {
        best = d;
        c = p.c;
      }
    }
    return c;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!land(x, y)) continue;
      const r = hash(x, y, 1) / clutter(x - cx, y - cy);
      if (r < 0.028) g[y]![x] = "o";
      else if (r < 0.036) {
        // A short wall, two or three tiles, along x or y.
        const along = hash(x, y, 2) < 0.5;
        const n = 2 + Math.floor(hash(x, y, 3) * 2);
        for (let i = 0; i < n; i++) {
          const tx = along ? x + i : x, ty = along ? y : y + i;
          if (land(tx, ty)) g[ty]![tx] = "#";
        }
      } else if (r < 0.042) {
        // An ice slick about two tiles across.
        for (let j = -2; j <= 2; j++)
          for (let i = -2; i <= 2; i++)
            if (i * i + j * j <= 4 + hash(x + i, y + j, 4) * 2 && land(x + i, y + j)) g[y + j]![x + i] = "*";
      }
    }
}

/** Turns land that isn't joined to the centre (8-way, through anything but sky) into sky. */
function dropIslets(g: string[][], cx: number, cy: number) {
  const H = g.length, W = g[0]!.length;
  const seen = new Uint8Array(W * H);
  const q: [number, number][] = [[cx, cy]];
  seen[cy * W + cx] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || g[ny]![nx] === " ") continue;
        seen[ny * W + nx] = 1;
        q.push([nx, ny]);
      }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && g[y]![x] !== " ") g[y]![x] = " ";
}

/** Marks every tile outside the outline as open sky, then crops to the land plus a ring of sky. */
function carveFolded(rows: string[], depth: (dx: number, dy: number) => number, isle?: IsleShape): string[] {
  const S = rows.length, c = Math.floor(S / 2);
  const g = rows.map((r) => [...r]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x - c, dy = y - c;
      const rim = x === 0 || y === 0 || x === S - 1 || y === S - 1;
      const inside = depth(dx, dy);
      if (!rim && (inside <= -0.5 || (inside <= 0.5 && "abcd1234".includes(g[y]![x]!)))) continue;
      if ("abcd1234".includes(g[y]![x]!)) throw new Error(`four-way island edge cuts off a spawn or start at (${x},${y})`);
      g[y]![x] = " ";
    }
  if (isle?.arms?.length) scatterArms(g, c, c, isle);
  dropIslets(g, c, c);
  let e = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g[y]![x] !== " ") e = Math.max(e, Math.abs(x - c), Math.abs(y - c));
  return g.slice(c - e - 1, c + e + 2).map((r) => r.slice(c - e - 1, c + e + 2).join(""));
}

export const SHRINES: Shrine[] = SHRINE_DEFS.map((d) => {
  try {
    return buildShrine(d);
  } catch (e) {
    throw new Error(`${d.id}: ${(e as Error).message}`);
  }
});
const FOUR_WAY = new Map<string, Shrine>();

export function shrineById(id: string): Shrine {
  return SHRINES.find((s) => s.id === id) ?? SHRINES[0]!;
}

/**
 * The layout for a round with this many teams: the usual island for 2, the four-way island for
 * 3 or 4 (with 3, one side stays empty). Same id either way, so the look and theme match.
 */
export function shrineFor(id: string, teams: number): Shrine {
  const base = shrineById(id);
  if (teams <= 2) return base;
  let four = FOUR_WAY.get(base.id);
  if (!four) {
    four = buildFourWay(SHRINE_DEFS.find((d) => d.id === base.id)!);
    FOUR_WAY.set(base.id, four);
  }
  if (teams >= 4) return four;
  return { ...four, teams, wispSpawns: four.wispSpawns.slice(0, teams), starts: four.starts.slice(0, teams) };
}
