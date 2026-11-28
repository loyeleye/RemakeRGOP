// The shrines. Each is an island with its own coastline. Only the northern half is drawn (plus the west half of the
// brazier row up to the centre tile); the south half is that drawing turned 180 degrees
// with Dawn and Dusk swapped, so neither guild ever gets the better side.
//
//   .  floor        #  shrine wall     o  boulder       ~  pool     (space) open sky
//   ≈  deep pool (a plain pull slips over it; only a water light holds)
//   *  ice (slides you the way you face)
//   B  brazier      a  Dawn wisp spawn b  Dusk wisp spawn
//   1  Dawn start   2  Dusk start

import { DYING, craterBoard, craterTiles } from "./dying.js";
import { SV_WELLS, sieveRows, svCoast, svOutline } from "./sieve.js";
import { OFFSPRING, oyCoast, oyOutline, yardRows } from "./offspring.js";
import { CAMP, CAMP_ROWS, campCoast, campOutline } from "./camp.js";
import { RUN2, RUN2_ROWS } from "./run2.js";
import { LO_FRAME, LO_OVAL, RESCUE, loCoast, loFromSlip, loOutline, lowOneRows } from "./rescue.js";
import { SHIP, SHIP_DECK, SHIP_FRAME, shipRows } from "./shiphome.js";
import { KF_FAR, KF_OVAL, KF_LOBES, kfCoast, kfOutline, kiteFellRows } from "./kitefell.js";
import { TIDEPOOL, TP_FRAME, tidepoolRows, tpCoast, tpOutline, tpTiles } from "./tidepool.js";
import { COVE, CV_FRAME, CV_ISLE, coveFlats, coveRows, cvCoast, cvFromBrazier, cvOutline } from "./cove.js";
import { HS_CENTRE, HS_FAR, HS_LOBES, horseshoeRows, hsCoast, hsOval } from "./horseshoe.js";
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
  /** A share of wisps appear on pools in this band instead (of those not sent far out). */
  poolSpawns?: { band: [number, number]; share: number };
  /** The rows are the whole island, not half of a point-symmetric one (story islands). */
  full?: boolean;
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
  /** Mist banks drift round the brazier, hiding wisps behind and inside them from sight. */
  mist?: boolean;
  /** Pressure plates (`_`): someone standing on one opens the shortcut gates (`=`) in its quarter. */
  plates?: boolean;
  /** Sun glyph bands every this many wisp moves out along the way in; a wisp left on one is relayed this many tiles less 2. */
  glyphs?: number;
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
  /** Clutter scale on this arm (default 1; 0 keeps it clear, for a place to walk). */
  clutter?: number;
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
    for (let i = 0; i <= n; i++) out.push({ ...armPoint(s, arm, i / n), c: arm.clutter ?? 1 });
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
export type RingStyle = "gates" | "open" | "diagonals" | "pillared" | "pinwheel" | "colonnade" | "posts";

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

/** Story places: solid things drawn as themselves. Multi-tile ones are one block of their letter. */
export type PropKind = "fence" | "post" | "bench" | "barrel" | "woodpile" | "flowerbed" | "shrine-wall" | "tree" | "lamp" | "basin" | "statue" | "lookout" | "rail" | "falls" | "skiff" | "shrine" | "stall" | "hesta-house" | "chair" | "kindling"
  | "maudie-house" | "moth-house" | "mabry-house" | "orrin-house" | "nell-house" | "sefa-house" | "wick-house" | "offering" | "mooring" | "boat" | "path-lamp" | "ladder"
  | "beehive" | "garden-plot" | "mat-rack" | "baskets" | "wheelbarrow" | "pane-crate" | "cargo-crates" | "streamer" | "streamer-blue" | "kes-house" | "wind-vane" | "bent-tree" | "referee-stand"
  | "cold-brazier" | "low-lamp" | "low-house" | "ship-figure" | "yard-solid";
export const PROP_CHARS: Record<string, PropKind> = {
  F: "fence", Y: "post", N: "bench", U: "barrel", P: "woodpile", L: "flowerbed", W: "shrine-wall", T: "tree", A: "lamp", Q: "basin", Z: "statue", J: "lookout", E: "rail", V: "falls", K: "skiff", S: "shrine", O: "stall", R: "hesta-house", C: "chair", G: "kindling",
  // The horseshoe island's houses, the Offering stone, and the one boat at its mooring.
  M: "maudie-house", D: "moth-house", g: "mabry-house", I: "orrin-house", e: "nell-house", f: "sefa-house", X: "wick-house", h: "offering", i: "mooring", j: "boat", v: "falls",
  // The lake path's lamp posts, and the lamp trimmer's ladder against one.
  l: "path-lamp", k: "ladder",
  // The yards: hives, garden plots (3x2, walkable), a mat rack (2x1), baskets, a barrow, crates.
  // Kite Fell's streamers: storm violet, and one in Rosalind's blue.
  u: "streamer", y: "streamer-blue",
  // And its own models: Kes's house, the wind vanes, the bent trees, and Lumi's referee stand (open ground: she stands on it).
  "5": "kes-house", "6": "wind-vane", "7": "bent-tree", "8": "referee-stand",
  // The low one (run 9): its own brazier, cold, its path lamps and its houses. All are drawn by the run (rescue-dress.ts).
  "9": "cold-brazier", "0": "low-lamp", "?": "low-house",
  // The ship home (run 10) once had its figure on the deck here; he now stands in the prow, off the map (shiphome.ts SHIP.figure).
  "$": "ship-figure",
  // The crew's yard (the offspring fight): solid ground the yard's own dress draws (walls, carts, the cage).
  "!": "yard-solid",
  q: "beehive", p: "garden-plot", m: "mat-rack", s: "baskets", w: "wheelbarrow", n: "pane-crate", r: "cargo-crates",
};
/** Story places: open ground drawn differently (a worn path, a landing's planks, a terrace's flags). */
export const GROUND_CHARS: Record<string, "path" | "planks" | "terrace"> = { ",": "path", ";": "planks", ":": "terrace" };

export interface Shrine {
  id: string;
  name: string;
  blurb: string;
  board: Board;
  /** Story: a house on the island (Rook's), drawn as a building over its tiles, which nobody walks through. Door on the east side. */
  house?: { x: number; y: number; w: number; h: number };
  /** Story places: things to walk round (solid tiles, drawn as themselves), and worn-path tiles to draw on the grass. */
  props?: { kind: PropKind; x: number; y: number }[];
  paths?: Pt[];
  /** Story places: planks (the landing) and terrace flags, drawn over the grass. */
  ground?: { kind: "planks" | "terrace"; x: number; y: number }[];
  /** Teams this layout seats: 2, or up to 4 on a four-way island. */
  teams: number;
  /** Per team: the drawn spawn marks (kept for the map's look and as a fallback). */
  wispSpawns: Pt[][];
  /** Where wisps appear, shared by every guild. */
  spawnField: Pt[];
  /** A farther-out field that a share of wisps appear in instead (empty for none). */
  farField: Pt[];
  farShare: number;
  /** Pool tiles that a share of wisps appear on instead (empty for none). */
  poolField: Pt[];
  poolShare: number;
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
  /** Story places drawn from their own shape (the horseshoe): extra plateaus under the parts that stick out, in tiles from the centre. */
  lobes?: { x: number; y: number; r: number }[];
  /** Where the main plateau is hung from when that isn't the board's centre (the horseshoe's brazier is by its west rim): the middle of the land, in tiles from the centre, and the edge's distance from there at each angle. */
  core?: { x: number; y: number; outline: (a: number) => number };
  /** Story: rime here is the comet's glass (dark, an ember glow under it), not frost. */
  glass?: boolean;
  /** Story places: an oval of other ground round the brazier (Kite Fell's race ground), half-sizes in tiles; drawn from textures/floor-<id>-race.webp. */
  raceOval?: { rx: number; ry: number };
  /** Story places: wells, shafts open to the sky below (the Sieve), as offsets from the brazier and radii in tiles. */
  wells?: { x: number; y: number; r: number }[];
  /** Story places: where the lower terraces hang (radians, east is 0, south a quarter turn), to keep them clear of a landing or falls. */
  tierAngles?: number[];
  /** Story places: model turns (radians) by prop kind, or by tile as "x,y", over the usual. */
  turns?: Record<string, number>;
  /** Story places: wash lines (by their west post, "x,y") hung with small pale cloths (a baby's things). */
  smallWash?: string[];
  /** Story: the bank is a landing's slip, where a boat's lamp is filled (run 9). No brazier, dais or fire is drawn at the centre. */
  landing?: boolean;
  /** Story: the board is a ship's deck in the sky (run 10). No island is drawn under it; the run draws the hull. */
  deck?: boolean;
  /** Story places: named islands of the sky that must be in view from here, in tiles from the centre; `drop` is how far below this one they hang. */
  far?: { x: number; y: number; r: number; drop: number }[];
  /** Story (the Cove): the tiles (by index) that the tide covers and uncovers. Open ground on this board; a round floods them (Game.setTide). */
  tidal?: number[];
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
    rings: [{ radius: 5, style: "colonnade", marks: [{ x: 8, y: 3, c: "&" }, { x: 8, y: 4, c: "&" }, { x: 7, y: 7, c: "&" }] }],
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
    rings: [{ radius: 5, style: "open" }],
    gimmicks: { tide: 20 },
    farSpawns: { band: [11, 15], share: 1 / 3 },
    poolSpawns: { band: [5, 15], share: 0.4 },
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
      "        ..........≈.....b.....       ",
      "       ..o...a...≈≈≈...........      ",
      "    .........~~..≈o≈..~~........     ",
      "  ....a.....~~~~..≈..~~~~.....b..    ",
      "  ...........~~.......~~o........    ",
      " ......≈≈≈.................≈≈≈....   ",
      "  ..1..≈≈≈.................≈≈≈..2..  ",
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
    rings: [{ radius: 5, style: "open" }],
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
    gimmicks: { mist: true },
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
    // Shortcut gates in the closed corners: shut unless someone holds that quarter's plate.
    // The middle arches are always open, so a lone lamplighter can still score.
    rings: [{ radius: 6, style: "gates", marks: [{ x: 6, y: 6, c: "=" }, { x: 6, y: 5, c: "=" }, { x: 9, y: 9, c: "_" }] }],
    gimmicks: { plates: true },
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
    rings: [{ radius: 5, style: "posts" }, { radius: 9, style: "open" }],
    gimmicks: { glyphs: 10 },
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
  // A house (story islands): solid like a wall, drawn as a building.
  H: Tile.Wall,
  l: Tile.Wall,
  k: Tile.Wall,
  // Yard things are solid; a garden plot ("p") stays open ground.
  q: Tile.Wall,
  u: Tile.Wall,
  y: Tile.Wall,
  "5": Tile.Wall,
  "6": Tile.Wall,
  "7": Tile.Wall,
  m: Tile.Wall,
  s: Tile.Wall,
  w: Tile.Wall,
  n: Tile.Wall,
  r: Tile.Wall,
  "!": Tile.Wall,
  // Story places: a fence, a wash-line post, a bench (solid), and a worn path (open ground).
  F: Tile.Wall,
  Y: Tile.Wall,
  N: Tile.Wall,
  U: Tile.Wall,
  P: Tile.Wall,
  L: Tile.Wall,
  W: Tile.Wall,
  T: Tile.Wall,
  A: Tile.Wall,
  Q: Tile.Wall,
  Z: Tile.Wall,
  J: Tile.Wall,
  E: Tile.Wall,
  V: Tile.Wall,
  K: Tile.Wall,
  S: Tile.Wall,
  O: Tile.Wall,
  R: Tile.Wall,
  C: Tile.Wall,
  G: Tile.Wall,
  M: Tile.Wall,
  D: Tile.Wall,
  g: Tile.Wall,
  I: Tile.Wall,
  e: Tile.Wall,
  f: Tile.Wall,
  X: Tile.Wall,
  h: Tile.Wall,
  i: Tile.Wall,
  /** The boat rides on the water: drawn, but the tile stays water. */
  j: Tile.Water,
  /** The horseshoe's falls: the lake's last row at the lip, still water. */
  v: Tile.Water,
  o: Tile.Rock,
  // The low one's cold brazier and lamps: nobody walks through them, but sight and reach carry past.
  "9": Tile.Rock,
  "0": Tile.Rock,
  "?": Tile.Rock,
  "$": Tile.Rock,
  "~": Tile.Water,
  /** Deep water (the law of the water): a pool tile where a plain pull slips. */
  "≈": Tile.Water,
  B: Tile.Brazier,
  "%": Tile.Rime,
  /** A well (the Sieve, run 8): open to the sky below. */
  "@": Tile.Well,
  "+": Tile.Bloom,
  "^": Tile.Vent,
  "=": Tile.Gate,
  "&": Tile.Moss,
  _: Tile.Plate,
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
  let rows = scaleRows(def.full ? def.rows : mirrorRows(def.rows), def.scale ?? MAP_SCALE);
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
  const house: Pt[] = [];
  const props: NonNullable<Shrine["props"]> = [];
  const paths: Pt[] = [];
  const ground: NonNullable<Shrine["ground"]> = [];
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${def.id}: row ${y} is ${row.length} wide, expected ${width}`);
    [...row].forEach((ch, x) => {
      tiles.push(TILE_OF[ch] ?? Tile.Floor);
      const sp = SPAWN_TEAM[ch], st = START_TEAM[ch];
      if (sp !== undefined && sp < teams) wispSpawns[sp]!.push(pt(x, y));
      if (st !== undefined && st < teams) starts[st]!.push(pt(x, y));
      if (ch === "H") house.push(pt(x, y));
      if (PROP_CHARS[ch]) props.push({ kind: PROP_CHARS[ch]!, x, y });
      const gk = GROUND_CHARS[ch];
      if (gk === "path") paths.push(pt(x, y));
      else if (gk) ground.push({ kind: gk, x, y });
    });
  });
  // The brazier is always a 3x3 block at the centre, whatever the ASCII shows.
  const board = new Board(width, height, tiles);
  const deep = rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "≈" ? [y * width + x] : [])));
  if (deep.length) board.deep = new Set(deep);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) tiles[(board.center.y + dy) * width + board.center.x + dx] = Tile.Brazier;
  const every = def.gimmicks?.glyphs;
  if (every) {
    // Sun glyphs: a band across the way in at every `every` moves, starting two bands out.
    const d = board.bankFlow();
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === Tile.Floor && d[i]! >= 2 * every && d[i]! % every === 0) tiles[i] = Tile.Glyph;
  }
  const hx = house.map((p) => p.x), hy = house.map((p) => p.y);
  const houseBox = house.length ? { x: Math.min(...hx), y: Math.min(...hy), w: Math.max(...hx) - Math.min(...hx) + 1, h: Math.max(...hy) - Math.min(...hy) + 1 } : undefined;
  return { id: def.id, name: def.name, blurb: def.blurb, board, ...(houseBox ? { house: houseBox } : {}), ...(props.length ? { props } : {}), ...(paths.length ? { paths } : {}), ...(ground.length ? { ground } : {}), teams, wispSpawns, spawnField: spawnField(board, def.spawnBand ?? SPAWN_BAND), starts, rings: ringsOf(def), outline, coast: isle && outline ? (dx, dy) => coastDepth(isle, dx, dy, outline) : null, arms: !!isle?.arms?.length, isle: isle ?? null, gimmicks: def.gimmicks ?? {}, farField: def.farSpawns ? spawnField(board, def.farSpawns.band) : [], farShare: def.farSpawns?.share ?? 0, poolField: def.poolSpawns ? spawnField(board, def.poolSpawns.band, Tile.Water) : [], poolShare: def.poolSpawns?.share ?? 0 };
}

/**
 * The floor tiles in the band that a wisp could be pulled from into the brazier zone. The
 * board is symmetric, so the field is too, and every guild draws from the same field.
 */
export function spawnField(board: Board, [lo, hi]: [number, number], kind: Tile = Tile.Floor): Pt[] {
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
      if (r >= lo && r <= hi && ok[y * W + x] && board.tile(pt(x, y)) === kind) out.push(pt(x, y));
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
      // A gate mark can stand in the ring's own wall line (it's a wall whenever it's shut).
      g[y]![x] = court.get(`${dx},${dy}`) === "=" ? "=" : walls.has(`${dx},${dy}`) ? "#" : d > 2 && court.has(`${dx},${dy}`) ? court.get(`${dx},${dy}`)! : d <= 1 ? "B" : ".";
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
      const cl = clutter(x - cx, y - cy);
      if (cl <= 0) continue;
      const r = hash(x, y, 1) / cl;
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

/**
 * Lumi's home pond, for story run 2: a small island, the brazier in the middle, one pool on the
 * east side (far enough out that nobody can pull a wisp on it straight into the brazier from
 * across the fire), and a few boulders round the jams. Not symmetric, and not in the lobby.
 */
/** Lumi's home pond, at `k` times the size across (1 for runs 1 and 2; Granny's game plays it bigger). */
function homePondRows(k = 1): string[] {
  const N = Math.round(31 * k) | 1, c = (N - 1) / 2;
  const g = Array.from({ length: N }, () => Array<string>(N).fill("."));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // The pool: an oval east of the brazier, 8 to 12 tiles out (times k).
      const px = (x - (c + 10 * k)) / (2.6 * k), py = (y - c) / (5.2 * k);
      if (px * px + py * py <= 1) g[y]![x] = "~";
    }
  // Boulders by the jams (north and west), and a couple out in the open.
  for (const [x, y] of [[13, 6], [17, 6], [6, 12], [6, 18], [9, 24], [21, 24], [10, 9]] as const) g[Math.round(c + (y - 15) * k)]![Math.round(c + (x - 15) * k)] = "o";
  // Rook's house, on the big pond only (4x4): a block-out by the west shore, door facing the brazier.
  if (k > 1) for (let y = c - 1; y <= c + 2; y++) for (let x = c - 16; x <= c - 13; x++) g[y]![x] = "H";
  const sy = Math.round(c + 7 * k);
  g[sy]![c] = "1";
  g[sy]![c + 1] = "2";
  return g.map((r) => r.join(""));
}

/** Run 5's race ground: open dry ground, Rook starting south-west of the fire and Kes south-east. */
export const STORY_SHRINES: Shrine[] = [
  buildShrine({
    id: "home-pond",
    name: "Home pond",
    blurb: "Lumi's island: a small pond island, the brazier in the middle and a pool to the east.",
    full: true,
    scale: 1,
    isle: { radius: 14.5, squareness: 2.1, coves: 0.06, heads: 0.05, seed: 5, stretch: [1.08, 0.95] },
    rings: [],
    spawnBand: [6, 9],
    rows: homePondRows(),
  }),
  // Granny's game: the same pond half as big again across, so every point is longer walks and longer pulls.
  buildShrine({
    id: "home-pond-big",
    name: "Home pond",
    blurb: "Lumi's island, played big: the brazier in the middle and a pool to the east.",
    full: true,
    scale: 1,
    isle: { radius: 14.5 * 1.5, squareness: 2.1, coves: 0.06, heads: 0.05, seed: 5, stretch: [1.08, 0.95] },
    rings: [],
    spawnBand: [15, 21],
    rows: homePondRows(1.5),
  }),
  // Granny's rematch (optional run 1): the same big pond, in the afternoon (its look is the theme's).
  buildShrine({
    id: "home-pond-afternoon",
    name: "Home pond",
    blurb: "Lumi's island in the afternoon: the brazier in the middle and a pool to the east.",
    full: true,
    scale: 1,
    isle: { radius: 14.5 * 1.5, squareness: 2.1, coves: 0.06, heads: 0.05, seed: 5, stretch: [1.08, 0.95] },
    rings: [],
    spawnBand: [15, 21],
    rows: homePondRows(1.5),
  }),
  // Run 5, the race with Kes, on her island (see kitefell.ts).
  kiteFell(),
  // The free walk between runs: the home island as a horseshoe round its lake (see horseshoe.ts).
  homeIsland(),
  // Runs 6 and 7: the Kindling ground after Hesta's landing, with the glass crater by the brazier (see dying.ts).
  kindlingCrater(),
  // Run 8, a harder job: the Sieve, pale chalk pierced by wells (see sieve.ts).
  sieve(),
  lowOne(),
  shipDeck(),
  // Optional run 2, Lumi's lesson with Kes: the Cove of the home pond (see cove.ts).
  cove(),
  // Optional run 3b, the tide job: Tidepool Steps, terraced (see tidepool.ts).
  tidepoolTerraces(),
  // Part 2, runs 3 and 4: the offspring fight in Solenne's yard (see offspring.ts).
  solenneYard(),
  // Part 2, the camp walk: the same yard before the fight, warm (see camp.ts).
  warmCamp(),
  crewRun2(),
];

/** The crew's camp, warm (Part 2, the camp walk): the same yard, whole, its gate open; drawn by camp-dress.ts. */
function warmCamp(): Shrine {
  const def: ShrineDef = { id: CAMP.shrine, name: CAMP.title, blurb: "A walled yard in a pool of lamplight round a cold brazier, its gate standing open.", full: true, scale: 1, rings: [], spawnBand: [3, 12], rows: CAMP_ROWS };
  const sh = finish(def, CAMP_ROWS, 2, null);
  return { ...sh, coast: campCoast, outline: campOutline, arms: true, lobes: [], core: { x: 0, y: 0, outline: campOutline } };
}

/** The same camp for run 2: its gate shut and barred, the brazier lit by the run (camp-dress.ts). */
function crewRun2(): Shrine {
  const def: ShrineDef = { id: RUN2.shrine, name: RUN2.title, blurb: "The crew's camp round its cold brazier, the gate barred for the night.", full: true, scale: 1, rings: [], spawnBand: RUN2.band, rows: RUN2_ROWS };
  const sh = finish(def, RUN2_ROWS, 2, null);
  return { ...sh, coast: campCoast, outline: campOutline, arms: true, lobes: [], core: { x: 0, y: 0, outline: campOutline } };
}

/** The crew's yard, breached (Part 2, runs 3 and 4): its walls, carts and cage drawn by yard-dress.ts. */
function solenneYard(): Shrine {
  const rows = yardRows();
  const def: ShrineDef = { id: OFFSPRING.shrine, name: "The crew's yard", blurb: "A ruin round a cold brazier, its west wall broken in, and something in it that eats light.", full: true, scale: 1, rings: [], spawnBand: [3, 12], rows };
  const sh = finish(def, rows, 2, null);
  return { ...sh, coast: oyCoast, outline: oyOutline, arms: true, lobes: [], core: { x: 0, y: 0, outline: oyOutline } };
}

/** The Kindling ground with the crater in it: everything else as run 1's island. */
function kindlingCrater(): Shrine {
  const base = SHRINES.find((sh) => sh.id === DYING.shrine)!;
  const board = craterBoard(base.board);
  // The stones the comet struck are gone from the drawing too.
  const gone = new Set(craterTiles(base.board).map((p) => `${p.x},${p.y}`));
  return { ...base, id: DYING.craterShrine, name: "The Kindling ground", board, props: base.props?.filter((p) => !gone.has(`${p.x},${p.y}`)), glass: true };
}

/** The Sieve: a plain chalk oval with its wells, and nothing else on it. */
function sieve(): Shrine {
  const rows = sieveRows();
  const def: ShrineDef = { id: "sieve", name: "The Sieve", blurb: "Pale chalk pierced by wells open to the cloud below.", full: true, scale: 1, rings: [], spawnBand: [10, 14], rows };
  const sh = finish(def, rows, 2, null);
  return { ...sh, coast: svCoast, outline: svOutline, arms: true, lobes: [], wells: SV_WELLS.map((w) => ({ ...w })) };
}

/** The low one (run 9): a plain oval cut by two long pools, with the landing at its south end. The board's centre is the landing's slip. */
/** The stranger's ship (run 10): a deck 11 by 25, the lamp amidships, open sky all round. */
function shipDeck(): Shrine {
  const rows = shipRows();
  const def: ShrineDef = { id: SHIP.shrine, name: "The ship home", blurb: "The deck of a small ship in the sky, at night.", full: true, scale: 1, rings: [], spawnBand: [3, 12], rows };
  const sh = finish(def, rows, 2, null);
  const c = sh.board.center;
  sh.board.frame = { x: c.x + SHIP_FRAME.x0, y: c.y + SHIP_FRAME.y0, w: SHIP_FRAME.x1 - SHIP_FRAME.x0 + 1, h: SHIP_FRAME.y1 - SHIP_FRAME.y0 + 1 };
  sh.board.phoneSpan = SHIP.phoneSpan;
  // The rules' coast is the deck's edge (the rails).
  const coast = (x: number, y: number) => Math.max(Math.abs(x) - SHIP_DECK.hw, Math.abs(y) - SHIP_DECK.hl) - 0.5;
  const outline = (a: number) => Math.min((SHIP_DECK.hw + 0.5) / Math.abs(Math.cos(a) || 1e-6), (SHIP_DECK.hl + 0.5) / Math.abs(Math.sin(a) || 1e-6));
  return { ...sh, coast, outline, arms: true, lobes: [], landing: true, deck: true };
}

function lowOne(): Shrine {
  const rows = lowOneRows();
  const def: ShrineDef = { id: RESCUE.shrine, name: "The low one", blurb: "A neighbouring island, ankle-deep in cloud. Everyone is leaving.", full: true, scale: 1, rings: [], spawnBand: [14, 34], rows };
  const sh = finish(def, rows, 2, null);
  const c = sh.board.center;
  sh.board.frame = { x: c.x + LO_FRAME.x0, y: c.y + LO_FRAME.y0, w: LO_FRAME.x1 - LO_FRAME.x0 + 1, h: LO_FRAME.y1 - LO_FRAME.y0 + 1 };
  // On a phone the view takes in half the island's depth, so the line of lamps going cold is seen.
  sh.board.phoneSpan = RESCUE.phoneSpan;
  return { ...sh, coast: loCoast, outline: loFromSlip, arms: true, lobes: [], core: { x: LO_OVAL.x, y: LO_OVAL.y, outline: loOutline }, landing: true };
}

/** The Cove (optional run 2): mostly water, its flats under the tide or out of it. The board's centre is the pond brazier, by its west end. */
function cove(): Shrine {
  const rows = coveRows();
  const def: ShrineDef = { id: COVE.shrine, name: "The Cove", blurb: "The cove of the home pond: mostly water, and the tide comes and goes.", full: true, scale: 1, rings: [], spawnBand: [3, 30], rows };
  const sh = finish(def, rows, 2, null);
  const b = sh.board, c = b.center;
  b.frame = { x: c.x + CV_FRAME.x0, y: c.y + CV_FRAME.y0, w: CV_FRAME.x1 - CV_FRAME.x0 + 1, h: CV_FRAME.y1 - CV_FRAME.y0 + 1 };
  b.phoneSpan = COVE.phoneSpan;
  const tidal = coveFlats().map(([x, y]) => (c.y + y) * b.width + c.x + x);
  return { ...sh, coast: cvCoast, outline: cvFromBrazier, arms: true, lobes: [], core: { x: CV_ISLE.x, y: CV_ISLE.y, outline: cvOutline }, tidal };
}

/** Tidepool Steps, terraced (optional run 3b): five steps up from the court, a cascade of pools on each side. The strips are open ground on the board; the tide floods them. */
function tidepoolTerraces(): Shrine {
  const rows = tidepoolRows();
  const def: ShrineDef = { id: TIDEPOOL.shrine, name: "Tidepool Steps", blurb: "Marit's island: terraces of tide pools, stepping down to the brazier.", full: true, scale: 1, rings: [], spawnBand: [6, 18], rows };
  const sh = finish(def, rows, 2, null);
  const b = sh.board, c = b.center;
  b.frame = { x: c.x + TP_FRAME.x0, y: c.y + TP_FRAME.y0, w: TP_FRAME.x1 - TP_FRAME.x0 + 1, h: TP_FRAME.y1 - TP_FRAME.y0 + 1 };
  b.phoneSpan = TIDEPOOL.phoneSpan;
  const tidal = tpTiles("strip").map(({ x, y }) => (c.y + y) * b.width + c.x + x);
  return { ...sh, coast: tpCoast, outline: tpOutline, arms: true, lobes: [], tidal };
}

/** Kite Fell: drawn from the maps thread's shapes, like the home island. */
function kiteFell(): Shrine {
  const { rows, turns, flags } = kiteFellRows();
  const def: ShrineDef = { id: "kite-fell", name: "Kite Fell", blurb: "Kes's island: a plain dry oval with the brazier in the middle, and the wind always up.", full: true, scale: 1, rings: [], spawnBand: [10, 15], rows };
  const sh = finish(def, rows, 2, null);
  // The start marks are whole stones, under the starts too.
  const ground = [...(sh.ground ?? []), ...flags.map((f) => ({ kind: "terrace" as const, ...f }))];
  return { ...sh, ground, coast: kfCoast, outline: kfOutline, arms: true, lobes: KF_LOBES, far: KF_FAR, turns, tierAngles: [3.3, 4.4, 1.9], raceOval: KF_OVAL };
}

/** The home island to walk on: drawn from the maps thread's shapes, not an IsleShape. */
function homeIsland(): Shrine {
  const { rows, turns, smallWash } = horseshoeRows();
  const def: ShrineDef = { id: "home-island", name: "Home island", blurb: "Lumi's island, to walk about on: the houses round the lake, the falls, the Kindling ground.", full: true, scale: 1, rings: [], spawnBand: [15, 21], rows };
  const sh = finish(def, rows, 2, null);
  const at = (dx: number, dy: number) => hsCoast(dx + HS_CENTRE.x, dy + HS_CENTRE.y);
  // The cliff's outline: how far out the oval's edge is (the bulge and spur have their own plateaus) at each angle from the pond brazier.
  const outline = (a: number) => {
    let r = 1;
    while (r < 200 && hsOval(Math.cos(a) * r + HS_CENTRE.x, Math.sin(a) * r + HS_CENTRE.y) < 0) r += 0.5;
    return r;
  };
  // The plateau hangs from the middle of the land, so its underside tapers under the lake, not out past the west rim.
  const mid = { x: 0, y: 2 };
  const fromMid = (a: number) => {
    let r = 1;
    while (r < 200 && hsOval(Math.cos(a) * r + mid.x, Math.sin(a) * r + mid.y) < 0) r += 0.25;
    return r;
  };
  return { ...sh, coast: at, outline, arms: true, far: HS_FAR.map((f) => ({ ...f, x: f.x - HS_CENTRE.x, y: f.y - HS_CENTRE.y })), core: { x: mid.x - HS_CENTRE.x, y: mid.y - HS_CENTRE.y, outline: fromMid }, lobes: HS_LOBES.map((l) => ({ x: l.x - HS_CENTRE.x, y: l.y - HS_CENTRE.y, r: l.r })), turns, smallWash };
}

export function shrineById(id: string): Shrine {
  return SHRINES.find((s) => s.id === id) ?? STORY_SHRINES.find((s) => s.id === id) ?? SHRINES[0]!;
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
