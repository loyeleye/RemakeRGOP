// The tick engine. Everything that happens in a round happens inside `Game.step()`, once per
// 600 ms tick, in a fixed order, from the actions players have queued. Same seed and same
// actions give the same round on the server and in tests.
//
// Order inside a tick:
//   1. Wisps move one tile toward their targets (set by staffs on earlier ticks), then any
//      wisp on the brazier rim is banked.
//   2. Lamplighters act in join order: walk (1 tile, or 2 when running), or use the staff.
// So a staff touch shows up as wisp movement on the *next* tick, and a lamplighter who walks
// into reach on one tick only touches the wisp on the tick after.

import { Board, DIRS, Mover, Tile, cheb, isCrystal, isSlick, pt, samePt, sign, type Pt } from "./board.js";
import type { Shrine } from "./maps.js";

export const TICK_MS = 600;
export const ROUND_TICKS = 200;
export const COUNTDOWN_TICKS = 5;
/** How far a staff reaches when pulling (Chebyshev tiles, with line of sight). */
export const PULL_REACH = 10;
/** Experimental: teammates pulling one wisp on the same tick pull it toward the point between them. */
export const TEAM_PULL = true;
/** How many tiles a wisp turned by a crystal flies straight on before it stops. */
export const CRYSTAL_FLIGHT = 8;
/** How far a wisp flies on out of a moon pond. */
export const PONDS_FLIGHT = 3;

/** How far a vent flings a wisp. */
export const VENT_FLIGHT = 6;

/** Is a portcullis at (dx, dy) from the centre open on this tick? East-west ones open first. */
export function gateOpen(tick: number, period: number, dx: number, dy: number) {
  const eastWest = Math.abs(dx) >= Math.abs(dy);
  return (Math.floor(tick / period) % 2 === 0) === eastWest;
}

/** Does a vent erupt on this tick? */
export function ventErupts(tick: number, period: number) {
  return tick % period === 0;
}

/** Where the mist banks are on this tick (centre and radius in tiles). */
export function mistBanks(tick: number, center: Pt): { x: number; y: number; r: number }[] {
  // Four banks drift round the brazier, one lap every MIST_LAP ticks, so every guild gets the same.
  const a0 = (tick / MIST_LAP) * Math.PI * 2;
  return [0, 1, 2, 3].map((k) => {
    const a = a0 + (k * Math.PI) / 2;
    return { x: center.x + Math.cos(a) * MIST_ORBIT, y: center.y + Math.sin(a) * MIST_ORBIT, r: MIST_RADIUS };
  });
}

/** Which quarter round the brazier an offset falls in, as "sx,sy". */
export const quarterOf = (dx: number, dy: number) => `${sign(dx)},${sign(dy)}`;

/** The quarters with somebody standing on a pressure plate: their shortcut gates are open. */
export function platesHeld(board: Board, players: readonly { pos: Pt }[]): Set<string> {
  const c = board.center;
  const out = new Set<string>();
  for (const p of players) if (board.tile(p.pos) === Tile.Plate) out.add(quarterOf(p.pos.x - c.x, p.pos.y - c.y));
  return out;
}

/** Is the tide coming in on this tick (it turns every `period` ticks, starting in)? */
export function tideIn(tick: number, period: number) {
  return Math.floor(tick / period) % 2 === 0;
}
/** Mist banks: how far out they drift, how big they are, and how many ticks a lap takes. */
export const MIST_ORBIT = 9;
export const MIST_RADIUS = 2.2;
export const MIST_LAP = 150;
/** Moss: taps it takes to break a tuft, how often it grows (ticks), and how much there can be. */
export const MOSS_HP = 2;
export const MOSS_GROW = 6;
export const MOSS_MAX = 64;
/**
 * The tide puller against the clocked tide: drawn the way the tide runs, a wisp comes two tiles
 * a tick; drawn against it, it only moves one tick in this many.
 */
export const TIDE_AGAINST = 3;
/** Pushing reaches less far than pulling. */
export const PUSH_REACH = 8;
export const WISPS_PER_GUILD = 3;
/** Ticks a wisp sits on the rim before it's banked. */
export const BANK_TICKS = 2;

/** 0 = Dawn, 1 = Dusk, 2 = Tide, 3 = Grove. Two-team rounds use only Dawn and Dusk. */
export type Guild = 0 | 1 | 2 | 3;
export const MAX_TEAMS = 4;
export type StaffMode = "pull" | "push";

export type Action =
  | { kind: "idle" }
  | { kind: "walk"; to: Pt }
  | { kind: "staff"; wisp: number };

/** What a client sends: an action, plus optional toggles applied at the start of its tick. */
export interface Command {
  action?: Action;
  toggleRun?: boolean;
  toggleMode?: boolean;
}

/** Control of a contested wisp: who touched it last, and how many quiet ticks since. */
export enum Grip {
  Free = 0,
  Held = 1,
  Easing = 2,
  Loose = 3,
}

export interface Wisp {
  id: number;
  guild: Guild;
  pos: Pt;
  prev: Pt;
  target: Pt | null;
  /** Ticks spent on the brazier rim. */
  rimTicks: number;
  holder: number | null;
  grip: Grip;
  touched: boolean;
  /** Skating across ice: the way it keeps sliding each tick. No staff can grip it meanwhile. */
  skate: Pt | null;
  /** Ticks left of a crystal's straight flight (it flies on whatever the ground until it runs out). */
  glide: number;
  /** Teammates pulling it together this tick (the midpoint of all of them is what it heads for). */
  pullers: number[];
  /** Tiles left of a sun glyph's relay toward the brazier (0 when it isn't being relayed). */
  relay: number;
}

export interface Lamplighter {
  id: number;
  /** Join order inside the round: lower goes first and wins standing-wisp ties. */
  order: number;
  guild: Guild;
  name: string;
  pos: Pt;
  prev: Pt;
  run: boolean;
  mode: StaffMode;
  action: Action;
  path: Pt[];
  pathGoal: Pt | null;
  /** The way this lamplighter last stepped: one of the eight directions, or (0,0) before the first step. */
  facing: Pt;
  /** Moved on this tick. */
  moved: boolean;
  /** Slid on ice this tick instead of acting. */
  slid: boolean;
  /** The wisp this lamplighter is holding with the staff, for drawing the beam. */
  beam: number | null;
  /** Lost a tie for the current wisp: the staff does nothing until a fresh click. */
  slipped: boolean;
  /** The slip is the water's (laws of water), checked again each tick. */
  wetSlip?: boolean;
}

export interface BankEvent {
  tick: number;
  wisp: number;
  guild: Guild;
}

export interface GameSnapshot {
  tick: number;
  /** Moss tufts as flat [tile index, taps left] pairs, on shrines that have moss. */
  moss?: number[];
  /** One score per team in the round. */
  scores: number[];
  wisps: { id: number; guild: Guild; x: number; y: number; px: number; py: number; rim: number; holder: number | null; rooted?: number; away?: boolean; /** How far gone a wisp outside the light is: 0 just out of it, 1 about to go out. */ dim?: number; /** Height under the falling law, 0 (down) to 1 (full). */ h?: number }[];
  players: {
    id: number;
    guild: Guild;
    name: string;
    x: number;
    y: number;
    px: number;
    py: number;
    run: boolean;
    mode: StaffMode;
    beam: number | null;
    slipped: boolean;
    /** Sliding on ice this tick. */
    slid: boolean;
    walkTo: Pt | null;
  }[];
  banks: BankEvent[];
  /** The storm light's string of wisps, head first (story run 5), and whether it is being pulled. */
  string?: number[];
  stringLive?: boolean;
  /** Who carries the storm light, so the view can run its sparks from their lantern. */
  stormLight?: number;
  /** The light law (story runs 6 and 7): the flame's level (0 to 100), how far its light reaches in tiles, wisps that went out this tick, and whether wisps held in the ground stay lit. */
  flame?: number;
  lit?: number;
  /** Where the cloud's edge is, tiles from the brazier, when the cloud and not the dark takes wisps. */
  cloud?: number;
  outs?: { tick: number; wisp: number }[];
  /** The falling law: wisps that fell away this tick, where, and whether over a well. */
  falls?: { tick: number; wisp: number; x: number; y: number; well: boolean }[];
  rootLit?: boolean;
  /** Pulls stopped at the bank this tick (the laws of water): who, which wisp, and the water tile it met. */
  stops?: { player: number; wisp: number; x: number; y: number }[];
}

/** Small seeded PRNG (mulberry32): wisp respawns must be the same on every replay. */
export class Rng {
  constructor(private s: number) {}
  next() {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
}

/**
 * Where a staff touch sends a wisp, as an offset from the wisp. The wisp is flung up to 2
 * tiles along the line from the lamplighter, snapped to one of 16 compass directions by
 * how steep the line is. A pull never sends a wisp past the tile in front of the puller.
 */
/**
 * The step a wisp takes toward a target (dx, dy are -1, 0 or 1; ax, ay how far it still has
 * to go on each axis). If the straight or diagonal step is blocked it slides along the
 * obstacle on the axis it has further to go; if both are as far and both are open it stops,
 * because picking one would favour one side of the island. Null means it stops dead.
 */
export function slideStep(board: Board, from: Pt, dx: number, dy: number, ax: number, ay: number, who = Mover.Wisp): [number, number] | null {
  if (board.canStep(from, dx, dy, who)) return [dx, dy];
  if (dx === 0 || dy === 0) return null;
  const okX = board.canStep(from, dx, 0, who);
  const okY = board.canStep(from, 0, dy, who);
  if (okX && (!okY || ax > ay)) return [dx, 0];
  if (okY && (!okX || ay > ax)) return [0, dy];
  return null;
}

/** The way a crystal mirror turns a wisp heading (dx, dy). y grows south, so "/" runs from SW to NE. */
export function reflect(t: Tile, dx: number, dy: number): [number, number] {
  return t === Tile.CrystalA ? [-dy, -dx] : [dy, dx];
}

/**
 * One wisp step toward a target, with the shrine's tricks: a wisp flying into a crystal is
 * turned off its mirror and flies straight on the new way (`bounce` is the new heading and it
 * takes its first step that way this tick). Otherwise it is slideStep. Null: it stops.
 */
export function wispMove(board: Board, from: Pt, dx: number, dy: number, ax: number, ay: number): { step: [number, number]; bounce: Pt | null } | null {
  const hit = board.tile(pt(from.x + dx, from.y + dy));
  if (isCrystal(hit)) {
    const [rx, ry] = reflect(hit, dx, dy);
    if (rx !== dx || ry !== dy) {
      const s = slideStep(board, from, rx, ry, Math.abs(rx), Math.abs(ry));
      return s ? { step: s, bounce: pt(rx, ry) } : null;
    }
  }
  const s = slideStep(board, from, dx, dy, ax, ay);
  return s ? { step: s, bounce: null } : null;
}

export function flingOffset(from: Pt, wisp: Pt, mode: StaffMode): Pt {
  // Direction from wisp toward the lamplighter.
  const dx = from.x - wisp.x;
  const dy = from.y - wisp.y;
  const sx = sign(dx);
  const sy = sign(dy);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let ox: number;
  let oy: number;
  if (ay > 2 * ax) [ox, oy] = [0, 2 * sy];
  else if (ay > ax) [ox, oy] = [sx, 2 * sy];
  else if (ay === ax) [ox, oy] = [2 * sx, 2 * sy];
  else if (2 * ay >= ax) [ox, oy] = [2 * sx, sy];
  else [ox, oy] = [2 * sx, 0];
  if (mode === "push") return pt(-ox || 0, -oy || 0);
  // Don't pull it onto or past the lamplighter: stop one tile short.
  const capX = dx - sx;
  const capY = dy - sy;
  return pt(Math.abs(ox) < Math.abs(capX) ? ox : capX, Math.abs(oy) < Math.abs(capY) ? oy : capY);
}

export interface JoinSpec {
  id: number;
  guild: Guild;
  name: string;
}

export class Game {
  readonly board: Board;
  /** The portcullis tiles, if any, as offsets from the centre too. */
  private gates: { p: Pt; dx: number; dy: number }[] = [];
  /** Moss tufts by tile index, and how many more taps each takes to break. */
  private mossHp = new Map<number, number>();
  /** Sun glyph relays: each tile's distance in wisp moves from the bank zone. */
  private flow: Int32Array | null = null;
  tick = 0;
  scores: number[];
  wisps: Wisp[] = [];
  players: Lamplighter[] = [];
  banks: BankEvent[] = [];
  private rng: Rng;
  private queued = new Map<number, Command>();
  /**
   * Story runs: jammed wisps. One staff holds a jammed wisp but can't move it; it only moves
   * when two pull together (toward the point between them).
   */
  heavy = new Set<number>();
  /** Story: wisps held fast in the ground (run 3's earth hold), and by whom. Nothing moves them while they're here. */
  rooted = new Map<number, number>();
  /** Story: wisps that sit on the rim without banking for now (Hesta waiting on her match point). */
  noBank = new Set<number>();
  /**
   * The storm law (story run 5, gameplay/run5-prototype-brief.md): a storm light strings wisps
   * together, and a strung wisp follows the string.
   * 1. When the storm light takes hold of one of her own wisps from within `stringReach` tiles, it
   *    joins her string, at the end. A string holds up to `stringMax`.
   * 2. While she pulls the wisp at the head, every wisp behind it steps toward the wisp in front
   *    of it, a tile a tick, and stops beside it.
   * 3. A wisp leaves the string when it is banked, or when the wisp in front is more than
   *    `stringLink` tiles off or out of its sight; a broken link drops it and all behind it.
   * Nobody else can string. `string` is head first.
   */
  stormLight: number | null = null;
  string: number[] = [];
  stringMax = 3;
  stringReach = 2;
  stringLink = 6;
  /** How close a follower comes to the wisp in front before it stops (1: right beside it). */
  stringGap = 1;
  /** The head is being pulled this tick (or riding in on the rim), so the string is moving. */
  stringLive = false;
  /** This tick's joins and breaks, for the story's lines and the crackle. */
  stringEvents: { kind: "join" | "break"; wisp: number }[] = [];
  /**
   * The light law (story runs 6 and 7, gameplay/runs6-7-prototype-brief.md): the brazier's flame
   * has a level, the ground is lit as far as the flame reaches, and a wisp left outside the light
   * dims and goes out.
   * 1. `flame` runs 0 to 100. Every tick it loses `flameDrain` (never below `flameFloor`); every
   *    bank adds `flameFeed`.
   * 2. The lit ground is a circle round the brazier, `lightRadius(flame)` tiles across the middle.
   * 3. A wisp outside the light that no staff is on counts a tick; one back in the light, or
   *    under a staff, starts again from nothing. At `dimTicks` it goes
   *    out: it leaves play (`outs`), and comes back like a banked wisp, without scoring.
   * 4. A wisp held in the ground (`rooted`) while `rootedLit` is set stays lit and never counts.
   * null: no flame, and none of this applies.
   */
  flame: number | null = null;
  flameFeed = 0;
  flameDrain = 0;
  flameFloor = 0;
  /** Ticks outside the light before a wisp goes out (0: wisps don't dim). */
  dimTicks = 0;
  /** Ticks each wisp has counted outside the light. */
  dark = new Map<number, number>();
  /** The cloud (runs 6 and 7 reworked): when set, wisps are lost beyond this many tiles from the brazier, in the cloud, and not beyond the flame's light. The room moves it, in steps. */
  cloudAt: number | null = null;
  /** This tick's wisps that went out. */
  outs: { tick: number; wisp: number }[] = [];
  /** Ticks a wisp that went out stays gone. */
  outPause = 1;
  /** Story run 7: wisps held in the ground stay lit lights, not stones (Hesta's helping hold). */
  rootedLit = false;
  /**
   * Story run 7, the glass: a wisp on rime slides to the brazier by itself, out of every staff's
   * grip, and banks.
   */
  slideHome = false;
  /**
   * The falling law (story run 8, gameplay/run8-prototype-brief.md): every wisp has a height, 0
   * to 100. Untouched, it loses `fallRate` a tick. A staff on it lifts it: `liftTap` on the tick
   * the staff first reaches it, `liftHold` for every tick the staff stays. At 0 it is gone
   * (`falls`, with whether it was over a well), without scoring, and another comes in its place
   * after `outPause`. A wisp on the brazier's rim no longer falls. Height changes nothing else:
   * a low wisp pulls and taps exactly as a high one.
   * `fallRate` 0: no heights, and none of this applies.
   */
  fallRate = 0;
  liftTap = 0;
  liftHold = 0;
  /** Each wisp's height; one not listed is at full height. */
  height = new Map<number, number>();
  /** A wisp no staff can lift (run 8's first, which is not his to save), or null. */
  pastSaving: number | null = null;
  /** This tick's wisps that fell away. */
  falls: { tick: number; wisp: number; x: number; y: number; well: boolean }[] = [];
  /** Wisps a staff was on last tick, to tell a staff arriving from one staying. */
  private lifted = new Set<number>();
  /** Story: nobody can push another side's wisps (run 5: no shoving). */
  noShove = false;
  /** How far a pull reaches in this game (tiles), where a run sets its own (run 10). The stand-in bot still plans with the usual reach. */
  pullReach = PULL_REACH;
  /** Ticks a banked wisp stays gone before it comes back (0: straight back, as in a match). */
  respawnPause = 0;
  /** Banked wisps that are gone for now, and the tick each comes back. They wait, unseen, on the rim. */
  away = new Map<number, number>();
  /**
   * Story: a player whose pulls run faster, by this factor (1.5: an extra tile every other tick).
   * Only a held wisp being pulled toward its target hurries.
   */
  pullBoost = new Map<number, number>();
  /**
   * The laws of water (gameplay thread's events doc, agreed by Ladi 23 Nov), in the story runs:
   * 1. Only a water light can pull or push a wisp that is over water; anyone else slips (the grey beam).
   * 2. A pull without a water light can't carry a wisp onto water: it stops at the bank, on land.
   * 3. While the water light holds a wisp over water, her partner can pull it too (a team pull).
   * 4. Story runs only (waterLawHere); practice keeps the old behaviour.
   * Switch: "all" water, "deep" only (the ≈ tiles), or "off".
   */
  static waterLaw: "all" | "deep" | "off" = "all";
  /** Extend the laws to every board, practice too. */
  static waterLawEverywhere = false;
  /** Brainstorm, to judge by feel: a pull across water walks you round to a dry line first (off: it stops at the bank). */
  static walkRound = true;
  waterLawHere = false;
  /** Who carries a water light (Lumi): she holds on any water. The tide puller always does too. */
  waterLight: number | null = null;
  private hasLight(id: number | null | undefined) {
    return id != null && (id === this.waterLight || id === this.tidePuller);
  }
  private lawOn() {
    return Game.waterLaw !== "off" && (this.waterLawHere || Game.waterLawEverywhere);
  }
  /** Whether water at `at` is the kind the law covers. */
  lawWater(at: Pt) {
    return this.lawOn() && this.board.tile(at) === Tile.Water && (Game.waterLaw === "all" || this.board.isDeep(at));
  }
  /** Whether this lamplighter's staff slips on a wisp at `at` (no water light, over water). */
  slipsAt(id: number, at: Pt) {
    return !this.hasLight(id) && this.lawWater(at);
  }
  /** Ticks on which a pull without a light was stopped at the bank (for the story runs' lines). */
  bankStops: { tick: number; player: number; wisp: number; water: Pt }[] = [];
  /** The laws of water, law 5: moving water (tide or current) carries a loose wisp about its pool but
   *  never puts it ashore; it stops at the water's edge. On in the story runs that set it (run 4);
   *  every board once the water laws are settled. */
  tideStaysWet = false;
  /** A walker whose stride is scaled (tiles a tick times this), for the walkable map's speed trial. */
  stride = new Map<number, number>();
  private strideOwed = new Map<number, number>();
  /** Story: where a wisp comes back, if not the usual spawn (called after it's placed). */
  onReturn: ((w: Wisp) => void) | null = null;
  /**
   * Story runs: the player whose pull is a tide pull (Lumi). When she takes hold of a wisp on
   * water, every loose wisp on that pool drifts a tile a tick toward her for as long as she holds.
   */
  tidePuller: number | null = null;
  /** Each water tile's pool (its connected stretch of water), worked out when first needed. */
  private pools: Int32Array | null = null;
  /** The wisp the tide puller took hold of on water, and its pool, while she holds it. */
  private tideHold: { wisp: number; pool: number } | null = null;
  /** This tick's tide-pull steps, by wisp. */
  private drift = new Map<number, Pt>();
  /** How many wisps the tide puller's pull moved this tick (story: noticing it). */
  get drifting() {
    return this.drift.size;
  }

  constructor(
    readonly shrine: Shrine,
    roster: JoinSpec[],
    seed: number,
    /** Wisps for every guild, or one count per guild (a story run can leave a guild with none). */
    wispsPerGuild: number | readonly number[] = WISPS_PER_GUILD,
    /** How many ticks this round lasts. */
    readonly roundTicks = ROUND_TICKS,
  ) {
    const gm = shrine.gimmicks ?? {};
    const gp = gm.portcullis || gm.plates;
    // Gates and mist change the board mid-round, so this round gets its own copy of it.
    const moss = shrine.board.tiles.includes(Tile.Moss);
    this.board = gp || gm.mist || moss ? new Board(shrine.board.width, shrine.board.height, shrine.board.tiles.slice()) : shrine.board;
    if (gm.glyphs) this.flow = this.board.bankFlow();
    if (moss) this.board.tiles.forEach((t, i) => t === Tile.Moss && this.mossHp.set(i, MOSS_HP));
    if (gm.mist) this.setMist();
    if (gp) {
      const c = this.board.center;
      this.board.tiles.forEach((t, i) => {
        if (t !== Tile.Gate) return;
        const p = pt(i % this.board.width, Math.floor(i / this.board.width));
        this.gates.push({ p, dx: p.x - c.x, dy: p.y - c.y });
      });
      this.setGates();
    }
    this.rng = new Rng(seed);
    this.scores = Array<number>(this.teams).fill(0);
    const used = new Set<string>();
    for (let g = 0 as Guild; g < this.teams; g = (g + 1) as Guild) {
      const n = typeof wispsPerGuild === "number" ? wispsPerGuild : (wispsPerGuild[g] ?? 0);
      for (let i = 0; i < n; i++) {
        const w: Wisp = {
          id: this.wisps.length,
          guild: g,
          pos: pt(0, 0),
          prev: pt(0, 0),
          target: null,
          rimTicks: 0,
          holder: null,
          grip: Grip.Free,
          touched: false,
          skate: null,
          glide: 0,
          pullers: [],
          relay: 0,
        };
        this.placeWisp(w, used);
        this.wisps.push(w);
      }
    }
    const seen = [0, 0, 0, 0];
    roster.forEach((r, order) => {
      const starts = shrine.starts[r.guild];
      if (!starts) throw new Error(`guild ${r.guild} has no seat on this shrine (${this.teams} teams)`);
      const base = starts[seen[r.guild]! % starts.length]!;
      // Spread team-mates out around their start tiles.
      const spot = this.nearestFree(base, Math.floor(seen[r.guild]! / starts.length));
      seen[r.guild]!++;
      this.players.push({
        id: r.id,
        order,
        guild: r.guild,
        name: r.name,
        pos: spot,
        prev: spot,
        run: true,
        mode: "pull",
        action: { kind: "idle" },
        path: [],
        pathGoal: null,
        facing: pt(0, 0),
        moved: false,
        slid: false,
        beam: null,
        slipped: false,
      });
    });
  }

  /** Teams in this round: as many as the shrine has spawn sets (2 or, on a four-way island, up to 4). */
  get teams() {
    return this.shrine.teams;
  }

  get finished() {
    return this.tick >= this.roundTicks;
  }

  /** Queue a command for the next tick. A later command in the same tick replaces the action. */
  command(playerId: number, cmd: Command) {
    const prev = this.queued.get(playerId) ?? {};
    this.queued.set(playerId, {
      action: cmd.action ?? prev.action,
      toggleRun: !!prev.toggleRun !== !!cmd.toggleRun,
      toggleMode: !!prev.toggleMode !== !!cmd.toggleMode,
    });
  }

  removePlayer(playerId: number) {
    this.players = this.players.filter((p) => p.id !== playerId);
    for (const w of this.wisps) if (w.holder === playerId) w.holder = null;
  }

  step() {
    if (this.finished) return;
    this.tick++;
    this.banks = [];
    this.bankStops = [];
    for (const w of this.wisps) w.pullers = [];
    const g = this.shrine.gimmicks;
    if ((g?.portcullis && this.tick % g.portcullis === 0) || g?.plates) this.setGates();
    if (g?.mist) this.setMist();
    if (this.mossHp.size && this.tick % MOSS_GROW === 0) this.growMoss();
    if (g?.vents && ventErupts(this.tick, g.vents)) {
      const c = this.board.center;
      for (const w of this.wisps) {
        if (this.board.tile(w.pos) !== Tile.Vent) continue;
        // The vent erupts: off it goes toward the brazier, out of every staff's grip.
        w.skate = pt(sign(c.x - w.pos.x), sign(c.y - w.pos.y));
        w.glide = VENT_FLIGHT;
        w.target = null;
        w.touched = false;
        this.letGo(w);
      }
    }
    this.drift.clear();
    if (this.tidePuller !== null) this.tidePull();
    this.stringEvents = [];
    const head = this.string.length ? this.wisps[this.string[0]!] : undefined;
    // Pulled last tick by the storm light, or already riding in on the rim behind such a pull.
    this.stringLive = !!head && ((head.touched && head.holder === this.stormLight) || (this.stringLive && this.board.inBankZone(head.pos)));
    for (const w of this.wisps) this.stepWisp(w);
    if (this.string.length) this.stepString();
    if (this.flame !== null) this.stepLight();
    for (const p of this.players) this.stepPlayer(p);
    for (const w of this.wisps) {
      if (!w.touched && w.grip !== Grip.Free) w.grip = (w.grip + 1) % 4;
    }
    if (this.fallRate > 0) this.stepFall();
  }

  // ---------------------------------------------------------------- wisps

  /** The falling law: untouched wisps lose height, a staff lifts them, and one that reaches the ground is gone. */
  private stepFall() {
    this.falls = [];
    const now = new Set<number>();
    for (const w of this.wisps) {
      if (this.away.has(w.id)) {
        this.height.delete(w.id);
        continue;
      }
      const h = this.height.get(w.id) ?? 100;
      if (w.touched && w.id !== this.pastSaving) {
        now.add(w.id);
        this.height.set(w.id, Math.min(100, h + (this.lifted.has(w.id) ? this.liftHold : this.liftTap)));
        continue;
      }
      // Riding in on the rim: as good as banked.
      if (this.board.inBankZone(w.pos) && w.id !== this.pastSaving) continue;
      const to = h - this.fallRate;
      if (to > 0) {
        this.height.set(w.id, to);
        continue;
      }
      this.height.delete(w.id);
      this.falls.push({ tick: this.tick, wisp: w.id, x: w.pos.x, y: w.pos.y, well: this.board.tile(w.pos) === Tile.Well });
      this.letGo(w);
      w.holder = null;
      w.target = null;
      w.skate = null;
      this.away.set(w.id, this.tick + Math.max(1, this.outPause));
    }
    this.lifted = now;
  }

  /** The light law: the flame drains, and wisps left outside its light dim and go out. */
  private stepLight() {
    this.outs = [];
    this.flame = Math.max(Math.min(this.flame!, this.flameFloor), this.flame! - this.flameDrain);
    if (this.dimTicks <= 0) return void this.dark.clear();
    const lit = this.cloudAt ?? lightRadius(this.flame), c = this.board.center;
    for (const w of this.wisps) {
      if (this.away.has(w.id) || (this.rootedLit && this.rooted.has(w.id)) || Math.hypot(w.pos.x - c.x, w.pos.y - c.y) <= lit) {
        this.dark.delete(w.id);
        continue;
      }
      // A staff on it brings its light back: it starts again from nothing when he lets go.
      if (w.touched || this.players.some((p) => p.beam === w.id)) {
        this.dark.delete(w.id);
        continue;
      }
      const n = (this.dark.get(w.id) ?? 0) + 1;
      if (n < this.dimTicks) {
        this.dark.set(w.id, n);
        continue;
      }
      // Out: a fade, and it is gone. It comes back as a new wisp would.
      this.dark.delete(w.id);
      this.outs.push({ tick: this.tick, wisp: w.id });
      this.letGo(w);
      w.holder = null;
      w.target = null;
      w.skate = null;
      this.rooted.delete(w.id);
      this.string = this.string.filter((id) => id !== w.id);
      this.away.set(w.id, this.tick + Math.max(1, this.outPause));
    }
  }

  /**
   * The tide puller took hold of a wisp on water: for as long as she holds it, the loose wisps on
   * that pool drift to her (even once the one she holds has left the water).
   */
  private tidePull() {
    const p = this.players.find((q) => q.id === this.tidePuller);
    const held = p?.beam != null ? this.wisps[p.beam] : undefined;
    if (!p || !held || !held.touched) {
      this.tideHold = null;
      return;
    }
    if (this.tideHold?.wisp !== held.id) this.tideHold = this.board.tile(held.pos) === Tile.Water ? { wisp: held.id, pool: this.poolOf(held.pos) } : null;
    if (!this.tideHold) return;
    const pool = this.tideHold.pool;
    for (const w of this.wisps) {
      if (w === held || w.touched || w.target || w.skate || this.board.inBankZone(w.pos)) continue;
      if (this.board.tile(w.pos) !== Tile.Water || this.poolOf(w.pos) !== pool) continue;
      const to = this.tideStep(w.pos, p.pos);
      if (!to) continue;
      // Moving water and her pull add up (laws of water, 6): with the flow she draws them two tiles
      // a tick; against it, they barely move; across it, as usual. The flow is the tide (toward the
      // brazier while it comes in, away while it goes out) or the current (round the brazier).
      const flow = this.flowAt(w.pos);
      let at = to;
      if (flow) {
        const along = (to.x - w.pos.x) * flow.x + (to.y - w.pos.y) * flow.y;
        if (along > 0) {
          const more = this.tideStep(to, p.pos, w);
          if (more && this.board.tile(more) === Tile.Water) at = more;
        } else if (along < 0 && this.tick % TIDE_AGAINST !== 0) continue;
      }
      this.drift.set(w.id, at);
    }
  }

  /** Which way the water runs at `at` this tick (a unit step), or null where it's still. The same
   *  directions the loose-wisp drift uses. */
  private flowAt(at: Pt): Pt | null {
    const { tide, current } = this.shrine.gimmicks;
    if (!tide && !current) return null;
    const c = this.board.center;
    if (tide) {
      const dir = tideIn(this.tick, tide) ? 1 : -1;
      return pt(dir * sign(c.x - at.x), dir * sign(c.y - at.y));
    }
    const ox = at.x - c.x, oy = at.y - c.y;
    return Math.abs(oy) >= Math.abs(ox) ? pt(-sign(oy), 0) : pt(0, sign(ox));
  }

  /** One tile from `from` toward the tide puller at `to`, over open water or ground, or null. */
  private tideStep(from: Pt, to: Pt, self?: Wisp): Pt | null {
    const mv = wispMove(this.board, from, sign(to.x - from.x), sign(to.y - from.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    if (!mv || mv.bounce) return null;
    const at = pt(from.x + mv.step[0], from.y + mv.step[1]);
    if (samePt(at, to) || this.wisps.some((o) => o !== self && !samePt(o.pos, from) && samePt(o.pos, at))) return null;
    return at;
  }

  /** Story: moss laid by the run (a thicket), as if it had grown there. */
  addMoss(at: Pt) {
    const i = at.y * this.board.width + at.x;
    if (this.board.tile(at) !== Tile.Floor) return;
    this.board.tiles[i] = Tile.Moss;
    this.mossHp.set(i, MOSS_HP);
    this.board.version++;
  }

  /** Story: one tear at the tuft on this tile (a partner clearing the way), as a tap would. */
  tearMoss(at: Pt) {
    const i = at.y * this.board.width + at.x;
    const hp = this.mossHp.get(i);
    if (hp === undefined) return false;
    if (hp > 1) this.mossHp.set(i, hp - 1);
    else {
      this.mossHp.delete(i);
      this.board.tiles[i] = Tile.Floor;
      this.board.version++;
    }
    return true;
  }

  private poolOf(at: Pt) {
    if (!this.pools) {
      const W = this.board.width, H = this.board.height;
      const pools = new Int32Array(W * H).fill(-1);
      let n = 0;
      for (let i = 0; i < W * H; i++) {
        if (pools[i] !== -1 || this.board.tiles[i] !== Tile.Water) continue;
        const q = [i];
        pools[i] = n;
        for (let k = 0; k < q.length; k++) {
          const x = q[k]! % W, y = Math.floor(q[k]! / W);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (pools[j] === -1 && this.board.tiles[j] === Tile.Water) {
              pools[j] = n;
              q.push(j);
            }
          }
        }
        n++;
      }
      this.pools = pools;
    }
    return this.pools[at.y * this.board.width + at.x]!;
  }

  private stepWisp(w: Wisp) {
    // Touched last tick: a staff is still on it, and a pull beats the ice.
    const held = w.touched;
    w.touched = false;
    w.prev = w.pos;
    if (this.rooted.has(w.id)) {
      w.target = null;
      return;
    }
    const back = this.away.get(w.id);
    if (back !== undefined) {
      w.target = null;
      if (this.tick < back) return;
      this.away.delete(w.id);
      this.placeWisp(w, new Set(this.wisps.filter((o) => o !== w).map((o) => key(o.pos))));
      w.prev = w.pos;
      this.onReturn?.(w);
      return;
    }
    if (this.board.inBankZone(w.pos)) {
      w.target = null;
      if (this.noBank.has(w.id)) {
        w.rimTicks = 0;
        return;
      }
      w.rimTicks++;
      // Nobody can keep tugging a wisp that's already on the rim.
      if (w.rimTicks >= 1) this.letGo(w);
      if (w.rimTicks >= BANK_TICKS) {
        this.scores[w.guild]!++;
        this.banks.push({ tick: this.tick, wisp: w.id, guild: w.guild });
        if (this.flame !== null) this.flame = Math.min(100, this.flame + this.flameFeed);
        this.dark.delete(w.id);
        // Banked: it leaves the string, and the one behind it moves up.
        this.string = this.string.filter((id) => id !== w.id);
        if (this.respawnPause > 0) {
          w.rimTicks = 0;
          this.away.set(w.id, this.tick + this.respawnPause);
          return;
        }
        this.placeWisp(w, new Set(this.wisps.filter((o) => o !== w).map((o) => key(o.pos))));
        w.prev = w.pos;
        this.onReturn?.(w);
      }
      return;
    }
    // Past saving: no staff moves it. It goes down where it hangs.
    if (w.id === this.pastSaving) {
      w.target = null;
      w.skate = null;
      return;
    }
    // Strung behind a moving head: it follows the wisp in front (stepString), whatever it was doing.
    if (this.stringLive && this.string.indexOf(w.id) > 0) {
      w.target = null;
      w.skate = null;
      return;
    }
    if (this.slideHome && this.board.tile(w.pos) === Tile.Rime) {
      // On the glass: it knows the way. Whoever had it has let go.
      this.letGo(w);
      w.holder = null;
      w.target = null;
      const c = this.board.center;
      w.skate = pt(sign(c.x - w.pos.x), sign(c.y - w.pos.y));
      this.moveWisp(w, false);
      return;
    }
    if (held) {
      w.glide = 0;
      w.relay = 0;
    }
    const tide = this.drift.get(w.id);
    if (tide) {
      w.pos = tide;
      return;
    }
    // Left resting on a sun glyph: it's relayed in, two tiles a tick, the short way round.
    if (this.flow && !held && !w.relay && !w.target && !w.skate && this.board.tile(w.pos) === Tile.Glyph) w.relay = this.shrine.gimmicks.glyphs! - 2;
    if (w.relay > 0 && !held) {
      for (let k = 0; k < 2 && w.relay > 0; k++) {
        const from = w.pos;
        const next = this.flowStep(w.pos);
        if (!next) {
          w.relay = 0;
          break;
        }
        w.pos = next;
        w.relay--;
        this.afterStep(w, from);
        if (this.board.inBankZone(w.pos)) w.relay = 0;
      }
      return;
    }
    this.moveWisp(w, held);
    const boost = held && w.holder !== null ? this.pullBoost.get(w.holder) : undefined;
    if (boost && boost > 1 && w.target && !this.board.inBankZone(w.pos)) {
      const f = boost - 1;
      if (Math.floor(this.tick * f) > Math.floor((this.tick - 1) * f)) this.moveWisp(w, held);
    }
    // Petal beds hurry a moving wisp: a second step this tick.
    if (this.board.tile(w.pos) === Tile.Bloom && !samePt(w.pos, w.prev) && (w.target || w.skate) && !this.board.inBankZone(w.pos)) this.moveWisp(w, held);
  }

  /**
   * The string, after the wisps have moved: each follower steps toward the wisp in front of it
   * while the head is pulled, then any link that is too long or can't see breaks.
   */
  private stepString() {
    const at = (i: number) => this.wisps[this.string[i]!]!;
    if (this.stringLive)
      for (let i = 1; i < this.string.length; i++) {
        const w = at(i), front = at(i - 1);
        if (this.board.inBankZone(w.pos) || this.away.has(w.id) || this.rooted.has(w.id)) continue;
        // They close right up behind a wisp that has reached the rim.
        if (cheb(w.pos, front.pos) > (this.board.inBankZone(front.pos) ? 1 : this.stringGap)) this.stringStep(w, front.pos);
      }
    for (let i = 1; i < this.string.length; i++) {
      const w = at(i), front = at(i - 1);
      if (cheb(w.pos, front.pos) <= this.stringLink && this.board.canSee(w.pos, front.pos)) continue;
      for (const id of this.string.slice(i)) this.stringEvents.push({ kind: "break", wisp: id });
      this.string.length = i;
      break;
    }
  }

  /**
   * One step of a strung follower toward the wisp in front. Today it steps like any wisp: walls
   * and the sky's edge stop it, and so does water without a light. (Run 9 means to pull a string
   * across gaps: the exemption would go here, by stepping with its own mover instead of
   * Mover.Wisp, since nothing else moves a follower while the string is live.)
   */
  private stringStep(w: Wisp, to: Pt) {
    const dx = to.x - w.pos.x, dy = to.y - w.pos.y;
    const s = slideStep(this.board, w.pos, sign(dx), sign(dy), Math.abs(dx), Math.abs(dy), Mover.Wisp);
    if (!s) return;
    const next = pt(w.pos.x + s[0], w.pos.y + s[1]);
    if (isCrystal(this.board.tile(next))) return;
    if (this.lawWater(next) && !this.lawWater(w.pos) && !this.hasLight(this.stormLight)) return;
    const from = w.pos;
    w.pos = next;
    this.afterStep(w, from);
  }

  /** One tile of a wisp's travel this tick: its pull, its skate or crystal flight, or the tide. */
  private moveWisp(w: Wisp, held: boolean) {
    const from = w.pos;
    this.moveOnce(w, held);
    if (!samePt(from, w.pos)) this.afterStep(w, from);
  }

  /** Shrine tricks that act when a wisp lands on a tile. */
  private afterStep(w: Wisp, from: Pt) {
    const g = this.shrine.gimmicks;
    if (g.ponds && this.board.tile(w.pos) === Tile.Water && this.board.tile(from) !== Tile.Water) {
      // Into a moon pond: out of its twin across the brazier, flying on the same way.
      const c = this.board.center;
      const twin = pt(2 * c.x - w.pos.x, 2 * c.y - w.pos.y);
      if (this.board.tile(twin) === Tile.Water) {
        w.skate = pt(sign(w.pos.x - from.x), sign(w.pos.y - from.y));
        w.glide = PONDS_FLIGHT;
        w.target = null;
        w.pos = twin;
        this.letGo(w);
      }
    }
  }

  private moveOnce(w: Wisp, held: boolean) {
    if (w.skate && !held) {
      // Skating on ice with nobody pulling, or flying off a crystal: on it goes the same way
      // until it stops, leaves the ice, or its crystal flight runs out.
      w.target = null;
      const mv = wispMove(this.board, w.pos, w.skate.x, w.skate.y, 1, 1);
      if (!mv) {
        w.skate = null;
        w.glide = 0;
        return;
      }
      if (mv.bounce) {
        w.skate = mv.bounce;
        w.glide = CRYSTAL_FLIGHT;
      }
      w.pos = pt(w.pos.x + mv.step[0], w.pos.y + mv.step[1]);
      if (w.glide > 0) w.glide--;
      if (w.glide === 0 && !isSlick(this.board.tile(w.pos))) w.skate = null;
      return;
    }
    if (!w.target || samePt(w.target, w.pos)) {
      w.target = null;
      // Loose on a pool when the tide runs: it drifts a tile in or out.
      const { tide, current } = this.shrine.gimmicks;
      if ((tide || current) && !held && this.board.tile(w.pos) === Tile.Water) {
        const c = this.board.center;
        const dir = tide && tideIn(this.tick, tide) ? 1 : -1;
        // The tide runs in or out; a stream runs clockwise round the brazier (y grows south).
        // The stream steps along one axis, the tangent of whichever side of the brazier it is on.
        const ox = w.pos.x - c.x, oy = w.pos.y - c.y;
        const northSouth = Math.abs(oy) >= Math.abs(ox);
        const tx = tide ? dir * sign(c.x - w.pos.x) : northSouth ? -sign(oy) : 0;
        const ty = tide ? dir * sign(c.y - w.pos.y) : northSouth ? 0 : sign(ox);
        const mv = (tx || ty) && wispMove(this.board, w.pos, tx, ty, Math.abs(c.x - w.pos.x), Math.abs(c.y - w.pos.y));
        const to = mv && !mv.bounce ? pt(w.pos.x + mv.step[0], w.pos.y + mv.step[1]) : null;
        if (to && !(this.tideStaysWet && this.board.tile(to) !== Tile.Water)) w.pos = to;
      }
      return;
    }
    w.skate = null;
    const mv = wispMove(this.board, w.pos, sign(w.target.x - w.pos.x), sign(w.target.y - w.pos.y), Math.abs(w.target.x - w.pos.x), Math.abs(w.target.y - w.pos.y));
    if (!mv) {
      w.target = null;
      return;
    }
    if (mv.bounce) {
      // Off a crystal: it flies straight on the new way, out of every staff's grip.
      w.target = null;
      w.skate = mv.bounce;
      w.glide = CRYSTAL_FLIGHT - 1;
      this.letGo(w);
      w.pos = pt(w.pos.x + mv.step[0], w.pos.y + mv.step[1]);
      return;
    }
    const [dx, dy] = mv.step;
    // Law 2: a pull or fling without a water light stops at the bank instead of going out on the water.
    const next = pt(w.pos.x + dx, w.pos.y + dy);
    if (this.lawWater(next) && !this.lawWater(w.pos) && !this.hasLight(w.holder) && !w.pullers.some((id) => this.hasLight(id))) {
      w.target = null;
      if (w.holder != null) this.bankStops.push({ tick: this.tick, player: w.holder, wisp: w.id, water: next });
      return;
    }
    w.pos = next;
    if (samePt(w.pos, w.target)) w.target = null;
    // On ice it keeps its way: the moment nobody is pulling it, it skates on.
    if (isSlick(this.board.tile(w.pos)) && !this.board.inBankZone(w.pos)) w.skate = pt(dx, dy);
  }

  /**
   * Open and shut the gates for this tick: by the clock (portcullises) or by who stands on the
   * pressure plates. Shut, a gate is wall, but it never drops on a wisp or a lamplighter in it.
   */
  private setGates() {
    const { portcullis, plates } = this.shrine.gimmicks;
    const held = plates ? platesHeld(this.board, this.players) : null;
    let changed = false;
    for (const g of this.gates) {
      const i = g.p.y * this.board.width + g.p.x;
      const open = held ? held.has(quarterOf(g.dx, g.dy)) : gateOpen(this.tick, portcullis!, g.dx, g.dy);
      const blocked = this.wisps.some((w) => samePt(w.pos, g.p)) || this.players.some((p) => samePt(p.pos, g.p));
      const t = open || blocked ? Tile.Gate : Tile.Wall;
      if (this.board.tiles[i] !== t) {
        this.board.tiles[i] = t;
        changed = true;
      }
    }
    if (changed) this.board.version++;
  }

  /** Lay this tick's mist: it hides what's behind it, but walkers and wisps go through. */
  private setMist() {
    const b = this.board;
    const fog = b.fog ?? (b.fog = new Uint8Array(b.width * b.height));
    fog.fill(0);
    for (const m of mistBanks(this.tick, b.center))
      for (let y = Math.floor(m.y - m.r); y <= Math.ceil(m.y + m.r); y++)
        for (let x = Math.floor(m.x - m.r); x <= Math.ceil(m.x + m.r); x++)
          if (b.inside(pt(x, y)) && Math.hypot(x - m.x, y - m.y) <= m.r) fog[y * b.width + x] = 1;
  }

  /**
   * Moss creeps: a tuft spreads to a free tile next to it, or now and then a new one takes root
   * out in the field. It grows the same on every guild's side.
   */
  private growMoss() {
    if (this.mossHp.size >= MOSS_MAX) return;
    const b = this.board, W = b.width, c = b.center;
    const tufts = [...this.mossHp.keys()];
    let at: Pt;
    if (this.rng.next() < 0.25 && this.shrine.spawnField.length) at = this.shrine.spawnField[this.rng.int(this.shrine.spawnField.length)]!;
    else {
      const i = tufts[this.rng.int(tufts.length)]!;
      const d = DIRS[this.rng.int(4)]!;
      at = pt((i % W) + d.x, Math.floor(i / W) + d.y);
    }
    const dx = at.x - c.x, dy = at.y - c.y;
    const images = this.teams === 4 ? [pt(dx, dy), pt(-dy, dx), pt(-dx, -dy), pt(dy, -dx)] : [pt(dx, dy), pt(-dx, -dy)];
    const taken = (q: Pt) => this.wisps.some((w) => samePt(w.pos, q)) || this.players.some((p) => samePt(p.pos, q));
    const spots = images.map((o) => pt(c.x + o.x, c.y + o.y));
    // Never in the court or on anything: only plain ground well out from the archways.
    if (cheb(at, c) < 8 || spots.some((q) => b.tile(q) !== Tile.Floor || taken(q))) return;
    for (const q of spots) {
      b.tiles[q.y * W + q.x] = Tile.Moss;
      this.mossHp.set(q.y * W + q.x, MOSS_HP);
    }
    b.version++;
  }

  /** A fresh tap on a wisp the moss is holding back tears at the tuft in its way. */
  private chipMoss(p: Lamplighter, w: Wisp) {
    const off = flingOffset(p.pos, w.pos, p.mode);
    const sx = sign(off.x), sy = sign(off.y);
    if (!sx && !sy) return;
    const W = this.board.width;
    for (const d of [pt(sx, sy), pt(sx, 0), pt(0, sy)]) {
      if (!d.x && !d.y) continue;
      const q = pt(w.pos.x + d.x, w.pos.y + d.y);
      const i = q.y * W + q.x;
      const hp = this.mossHp.get(i);
      if (hp === undefined) continue;
      if (hp > 1) this.mossHp.set(i, hp - 1);
      else {
        this.mossHp.delete(i);
        this.board.tiles[i] = Tile.Floor;
        this.board.version++;
      }
      return;
    }
  }

  /** One tile nearer the bank zone along the glyphs' flow, or null if there's no way. */
  private flowStep(p: Pt): Pt | null {
    const f = this.flow!, W = this.board.width;
    const d = f[p.y * W + p.x]!;
    if (d <= 0) return null;
    for (const dir of DIRS) {
      const n = pt(p.x + dir.x, p.y + dir.y);
      if (this.board.inside(n) && f[n.y * W + n.x] === d - 1 && this.board.canStep(p, dir.x, dir.y, Mover.Wisp)) return n;
    }
    return null;
  }

  /** Every staff on this wisp lets go. */
  private letGo(w: Wisp) {
    for (const p of this.players) {
      if (p.action.kind === "staff" && p.action.wisp === w.id) {
        p.action = { kind: "idle" };
        p.beam = null;
      }
    }
  }

  private placeWisp(w: Wisp, taken: Set<string>) {
    // Some shrines send a share of wisps farther out.
    const far = this.shrine.farField?.length > 0 && this.rng.next() < this.shrine.farShare;
    // And some on pools, where the tide or the stream will take them.
    const pool = !far && this.shrine.poolField?.length > 0 && this.rng.next() < this.shrine.poolShare;
    const spawns = far ? this.shrine.farField : pool ? this.shrine.poolField : this.shrine.spawnField.length > 0 ? this.shrine.spawnField : this.shrine.wispSpawns[w.guild]!;
    const free = spawns.filter((s) => !taken.has(key(s)));
    const from = free.length > 0 ? free : spawns;
    w.pos = from[this.rng.int(from.length)]!;
    w.prev = w.pos;
    w.target = null;
    w.rimTicks = 0;
    w.holder = null;
    w.grip = Grip.Free;
    taken.add(key(w.pos));
  }

  // ---------------------------------------------------------------- lamplighters

  private stepPlayer(p: Lamplighter) {
    const cmd = this.queued.get(p.id);
    this.queued.delete(p.id);
    p.prev = p.pos;
    p.moved = false;
    p.slid = false;
    if (cmd?.toggleRun) p.run = !p.run;
    if (cmd?.toggleMode) {
      p.mode = p.mode === "pull" ? "push" : "pull";
      // Switching to pull on a rival wisp drops it.
      if (p.action.kind === "staff" && !this.canAffect(p, this.wisps[p.action.wisp]!)) p.action = { kind: "idle" };
    }
    let fresh = false;
    if (cmd?.action) {
      fresh = true;
      p.action = cmd.action;
      p.slipped = false;
    }
    p.beam = null;

    // Ice: start a tick on it and you slide a tile the way you're going, and that's your tick:
    // you've lost your footing. Like a wisp, you glance off what you hit and slide on until
    // something stops you or you leave the ice; then your order carries on.
    const f = p.facing;
    const slide = this.board.tile(p.pos) === Tile.Ice && (f.x || f.y) ? slideStep(this.board, p.pos, f.x, f.y, 1, 1, Mover.Walker) : null;
    if (slide) {
      p.facing = pt(slide[0], slide[1]);
      p.pos = pt(p.pos.x + slide[0], p.pos.y + slide[1]);
      p.moved = true;
      p.slid = true;
      p.path = [];
      p.pathGoal = null;
      return;
    }

    switch (p.action.kind) {
      case "idle":
        p.path = [];
        p.pathGoal = null;
        break;
      case "walk": {
        const to = p.action.to;
        if (!p.pathGoal || !samePt(p.pathGoal, to)) {
          p.path = this.board.walkPath(p.pos, to);
          p.pathGoal = to;
        }
        this.walk(p);
        if (p.path.length === 0) {
          p.action = { kind: "idle" };
          p.pathGoal = null;
        }
        break;
      }
      case "staff": {
        const w = this.wisps[p.action.wisp];
        if (!w || !this.canAffect(p, w)) {
          p.action = { kind: "idle" };
          break;
        }
        // The laws of water: water is in the way of a pull like any obstacle. Without a water light
        // you walk round to a spot where the pull won't cross it, then take hold.
        const round = this.roundWater(p, w);
        if (round) {
          p.path = samePt(round, p.pos) ? [] : this.board.walkPath(p.pos, round);
          p.pathGoal = null;
          if (p.path.length) {
            this.walk(p);
            break;
          }
        }
        if (this.inReach(p, w)) {
          p.path = [];
          p.pathGoal = null;
          this.touch(p, w, fresh);
        } else {
          // Out of reach or out of sight: walk toward the wisp, re-aiming as it drifts. The
          // staff can't be used on a tick spent walking, so it takes hold next tick.
          p.path = this.board.walkPath(p.pos, w.pos, true);
          p.pathGoal = null;
          this.walk(p);
        }
        break;
      }
    }
  }

  private walk(p: Lamplighter) {
    let steps = p.run ? 2 : 1;
    // A trial on the walkable map: one walker's stride scaled, the part-tiles carried to the next tick.
    const f = this.stride.get(p.id);
    if (f !== undefined) {
      const due = (this.strideOwed.get(p.id) ?? 0) + steps * f;
      steps = Math.floor(due);
      this.strideOwed.set(p.id, due - steps);
    }
    for (let i = 0; i < steps && p.path.length > 0; i++) {
      const next = p.path.shift()!;
      p.facing = pt(sign(next.x - p.pos.x), sign(next.y - p.pos.y));
      p.pos = next;
      p.moved = true;
      // Stepping onto ice ends the step: the slide takes over next tick.
      if (this.board.tile(next) === Tile.Ice) break;
    }
  }

  /**
   * The laws of water, for a pull without a water light on a wisp on land: if the straight line
   * from here to it crosses water, the nearest tile (by walking) where it doesn't, in reach and in
   * sight, preferring the brazier's side of the wisp. Null when nothing is in the way.
   */
  roundWater(p: Lamplighter, w: Wisp): Pt | null {
    if (!Game.walkRound || p.mode !== "pull" || !this.lawOn() || this.hasLight(p.id) || this.lawWater(w.pos)) return null;
    if (this.hasLight(w.holder) || w.pullers.some((id) => this.hasLight(id))) return null;
    const wet = (q: Pt) => this.board.lineTiles(q, w.pos).some((t) => this.lawWater(t));
    if (!wet(p.pos)) return null;
    const b = this.board, W = b.width, c = b.center;
    const seen = new Set<number>([p.pos.y * W + p.pos.x]);
    let ring: Pt[] = [p.pos];
    let best: Pt | null = null;
    let bestCost = Infinity;
    for (let d = 0; ring.length && d < bestCost; d++) {
      const next: Pt[] = [];
      for (const q of ring) {
        if (cheb(q, w.pos) <= this.pullReach && !samePt(q, w.pos) && b.canSee(q, w.pos) && !wet(q)) {
          const cost = d + (cheb(q, c) > cheb(w.pos, c) ? 6 : 0);
          if (cost < bestCost) (bestCost = cost), (best = q);
        }
        for (const dir of DIRS) {
          if (!b.canStep(q, dir.x, dir.y, Mover.Walker)) continue;
          const n = pt(q.x + dir.x, q.y + dir.y);
          const k = n.y * W + n.x;
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(n);
        }
      }
      ring = next;
    }
    return best;
  }

  /** Pull works on your own guild's wisps; push works on any wisp. */
  canAffect(p: Lamplighter, w: Wisp) {
    if (this.noShove && w.guild !== p.guild) return false;
    return p.mode === "push" || w.guild === p.guild;
  }

  inReach(p: Lamplighter, w: Wisp) {
    if (samePt(p.pos, w.pos)) return false;
    const reach = p.mode === "pull" ? this.pullReach : PUSH_REACH;
    return cheb(p.pos, w.pos) <= reach && this.board.canSee(p.pos, w.pos);
  }

  private touch(p: Lamplighter, w: Wisp, fresh: boolean) {
    if (fresh) p.slipped = false;
    // The laws of water: no light, no hold over water, pull or push; but a partner can join the
    // light's own pull on a wisp she has hold of. Checked afresh each tick (not a sticky slip).
    if (p.wetSlip) (p.slipped = false), (p.wetSlip = false);
    if (this.slipsAt(p.id, w.pos) && !(p.mode === "pull" && this.hasLight(w.holder) && w.grip === Grip.Held)) {
      p.slipped = p.wetSlip = true;
      p.beam = w.id;
      return;
    }
    if (fresh && this.mossHp.size) this.chipMoss(p, w);
    // Pulling together: a teammate already pulled this wisp this tick, so it heads for the
    // point between all of them instead.
    if (TEAM_PULL && p.mode === "pull" && w.touched && w.pullers.length > 0 && !w.pullers.includes(p.id)) {
      p.slipped = false;
      p.beam = w.id;
      w.pullers.push(p.id);
      const pullers = w.pullers.map((id) => this.players.find((q) => q.id === id)!);
      const mx = pullers.reduce((a, q) => a + q.pos.x, 0) / pullers.length;
      const my = pullers.reduce((a, q) => a + q.pos.y, 0) / pullers.length;
      const base = w.pos;
      // Round the midpoint toward the wisp, so it never aims past where they meet.
      const mid = pt(base.x + Math.trunc(mx - base.x), base.y + Math.trunc(my - base.y));
      const off = samePt(mid, base) ? pt(0, 0) : flingOffset(mid, base, "pull");
      w.target = (off.x === 0 && off.y === 0) || this.rooted.has(w.id) || this.away.has(w.id) ? null : pt(base.x + off.x, base.y + off.y);
      return;
    }
    if (!p.slipped && this.loses(p, w)) p.slipped = true;
    p.beam = w.id;
    if (p.slipped) return;
    const off = flingOffset(p.pos, w.pos, p.mode);
    // Already right in front of the puller: the touch holds it but it doesn't move. A jammed
    // wisp doesn't move for one staff either; a second puller joining moves it (above).
    w.target = (off.x === 0 && off.y === 0) || (this.heavy.has(w.id) && p.mode === "pull") || this.rooted.has(w.id) || this.away.has(w.id) ? null : pt(w.pos.x + off.x, w.pos.y + off.y);
    w.holder = p.id;
    w.grip = Grip.Held;
    w.touched = true;
    w.pullers = p.mode === "pull" ? [p.id] : [];
    // The storm law: her touch from close by strings it, at the end.
    if (p.id === this.stormLight && p.mode === "pull" && w.guild === p.guild && !this.string.includes(w.id) && this.string.length < this.stringMax && cheb(p.pos, w.pos) <= this.stringReach) {
      this.string.push(w.id);
      this.stringEvents.push({ kind: "join", wisp: w.id });
    }
  }

  /**
   * Does p lose the wisp to whoever holds it? A wisp in flight can't be taken. A standing
   * wisp goes to whoever joined first, unless it has been loose for two quiet ticks.
   */
  private loses(p: Lamplighter, w: Wisp) {
    if (w.holder === null || w.holder === p.id || w.grip === Grip.Free) return false;
    const holder = this.players.find((q) => q.id === w.holder);
    if (!holder) return false;
    if (w.target) return true;
    if (w.grip === Grip.Loose) return false;
    return p.order > holder.order;
  }

  snapshot(): GameSnapshot {
    return {
      tick: this.tick,
      scores: [...this.scores],
      wisps: this.wisps.map((w) => ({
        id: w.id,
        guild: w.guild,
        x: w.pos.x,
        y: w.pos.y,
        px: w.prev.x,
        py: w.prev.y,
        rim: w.rimTicks,
        holder: w.holder,
        ...(this.rooted.has(w.id) ? { rooted: this.rooted.get(w.id)! } : {}),
        ...(this.away.has(w.id) ? { away: true } : {}),
        ...(this.dark.has(w.id) && this.dimTicks > 0 ? { dim: this.dark.get(w.id)! / this.dimTicks } : {}),
        ...(this.fallRate > 0 && !this.away.has(w.id) ? { h: (this.height.get(w.id) ?? 100) / 100 } : {}),
      })),
      players: this.players.map((p) => ({
        id: p.id,
        guild: p.guild,
        name: p.name,
        x: p.pos.x,
        y: p.pos.y,
        px: p.prev.x,
        py: p.prev.y,
        run: p.run,
        mode: p.mode,
        beam: p.beam,
        slipped: p.slipped,
        slid: p.slid,
        walkTo: p.action.kind === "walk" ? p.action.to : null,
      })),
      banks: this.banks,
      ...(this.string.length ? { string: [...this.string], stringLive: this.stringLive } : {}),
      ...(this.stormLight != null ? { stormLight: this.stormLight } : {}),
      ...(this.flame !== null ? { flame: this.flame, lit: lightRadius(this.flame), ...(this.cloudAt !== null ? { cloud: this.cloudAt } : {}), outs: this.outs.length ? this.outs : undefined, rootLit: this.rootedLit || undefined } : {}),
      ...(this.falls.length ? { falls: this.falls } : {}),
      stops: this.bankStops.length ? this.bankStops.map((b) => ({ player: b.player, wisp: b.wisp, x: b.water.x, y: b.water.y })) : undefined,
      moss: this.mossHp.size ? [...this.mossHp].flat() : undefined,
    };
  }

  nearestFree(base: Pt, skip: number): Pt {
    const taken = new Set(this.players.map((p) => key(p.pos)));
    const cands: Pt[] = [];
    for (let r = 0; r <= 3; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const q = pt(base.x + dx, base.y + dy);
          if (this.board.passable(q, Mover.Walker) && !taken.has(key(q))) cands.push(q);
        }
    return cands[Math.min(skip, cands.length - 1)] ?? base;
  }
}

const key = (p: Pt) => `${p.x},${p.y}`;

/** How far the brazier's light reaches for a flame level: 14 tiles at 100, 4 at 10, and closing to nothing below that. */
export function lightRadius(flame: number) {
  return flame >= 10 ? 4 + ((Math.min(100, flame) - 10) / 90) * 10 : 0.4 * Math.max(0, flame);
}
