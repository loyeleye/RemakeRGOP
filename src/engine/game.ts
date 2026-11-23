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
  wisps: { id: number; guild: Guild; x: number; y: number; px: number; py: number; rim: number; holder: number | null; rooted?: number; away?: boolean }[];
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
  /** Ticks a banked wisp stays gone before it comes back (0: straight back, as in a match). */
  respawnPause = 0;
  /** Banked wisps that are gone for now, and the tick each comes back. They wait, unseen, on the rim. */
  away = new Map<number, number>();
  /**
   * Story: a player whose pulls run faster, by this factor (1.5: an extra tile every other tick).
   * Only a held wisp being pulled toward its target hurries.
   */
  pullBoost = new Map<number, number>();
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
    for (const w of this.wisps) this.stepWisp(w);
    for (const p of this.players) this.stepPlayer(p);
    for (const w of this.wisps) {
      if (!w.touched && w.grip !== Grip.Free) w.grip = (w.grip + 1) % 4;
    }
  }

  // ---------------------------------------------------------------- wisps

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
      const mv = wispMove(this.board, w.pos, sign(p.pos.x - w.pos.x), sign(p.pos.y - w.pos.y), Math.abs(p.pos.x - w.pos.x), Math.abs(p.pos.y - w.pos.y));
      if (!mv || mv.bounce) continue;
      const to = pt(w.pos.x + mv.step[0], w.pos.y + mv.step[1]);
      if (samePt(to, p.pos) || this.wisps.some((o) => o !== w && samePt(o.pos, to))) continue;
      this.drift.set(w.id, to);
    }
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
        if (mv && !mv.bounce) w.pos = pt(w.pos.x + mv.step[0], w.pos.y + mv.step[1]);
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
    w.pos = pt(w.pos.x + dx, w.pos.y + dy);
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
    const steps = p.run ? 2 : 1;
    for (let i = 0; i < steps && p.path.length > 0; i++) {
      const next = p.path.shift()!;
      p.facing = pt(sign(next.x - p.pos.x), sign(next.y - p.pos.y));
      p.pos = next;
      p.moved = true;
      // Stepping onto ice ends the step: the slide takes over next tick.
      if (this.board.tile(next) === Tile.Ice) break;
    }
  }

  /** Pull works on your own guild's wisps; push works on any wisp. */
  canAffect(p: Lamplighter, w: Wisp) {
    return p.mode === "push" || w.guild === p.guild;
  }

  inReach(p: Lamplighter, w: Wisp) {
    if (samePt(p.pos, w.pos)) return false;
    const reach = p.mode === "pull" ? PULL_REACH : PUSH_REACH;
    return cheb(p.pos, w.pos) <= reach && this.board.canSee(p.pos, w.pos);
  }

  private touch(p: Lamplighter, w: Wisp, fresh: boolean) {
    if (fresh) p.slipped = false;
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
