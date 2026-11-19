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

import { Board, Mover, Tile, cheb, pt, samePt, sign, type Pt } from "./board.js";
import type { Shrine } from "./maps.js";

export const TICK_MS = 600;
export const ROUND_TICKS = 200;
export const COUNTDOWN_TICKS = 5;
/** How far a staff reaches when pulling (Chebyshev tiles, with line of sight). */
export const PULL_REACH = 10;
/** Pushing reaches less far than pulling. */
export const PUSH_REACH = 8;
export const WISPS_PER_GUILD = 2;
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
  /** One score per team in the round. */
  scores: number[];
  wisps: { id: number; guild: Guild; x: number; y: number; px: number; py: number; rim: number; holder: number | null }[];
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
  tick = 0;
  scores: number[];
  wisps: Wisp[] = [];
  players: Lamplighter[] = [];
  banks: BankEvent[] = [];
  private rng: Rng;
  private queued = new Map<number, Command>();

  constructor(
    readonly shrine: Shrine,
    roster: JoinSpec[],
    seed: number,
    wispsPerGuild = WISPS_PER_GUILD,
  ) {
    this.board = shrine.board;
    this.rng = new Rng(seed);
    this.scores = Array<number>(this.teams).fill(0);
    const used = new Set<string>();
    for (let g = 0 as Guild; g < this.teams; g = (g + 1) as Guild) {
      for (let i = 0; i < wispsPerGuild; i++) {
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
    return this.tick >= ROUND_TICKS;
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
    for (const w of this.wisps) this.stepWisp(w);
    for (const p of this.players) this.stepPlayer(p);
    for (const w of this.wisps) {
      if (!w.touched && w.grip !== Grip.Free) w.grip = (w.grip + 1) % 4;
    }
  }

  // ---------------------------------------------------------------- wisps

  private stepWisp(w: Wisp) {
    w.touched = false;
    w.prev = w.pos;
    if (this.board.inBankZone(w.pos)) {
      w.target = null;
      w.rimTicks++;
      if (w.rimTicks >= 1) {
        // Nobody can keep tugging a wisp that's already on the rim.
        for (const p of this.players) {
          if (p.action.kind === "staff" && p.action.wisp === w.id) {
            p.action = { kind: "idle" };
            p.beam = null;
          }
        }
      }
      if (w.rimTicks >= BANK_TICKS) {
        this.scores[w.guild]!++;
        this.banks.push({ tick: this.tick, wisp: w.id, guild: w.guild });
        this.placeWisp(w, new Set(this.wisps.filter((o) => o !== w).map((o) => key(o.pos))));
        w.prev = w.pos;
      }
      return;
    }
    if (!w.target || samePt(w.target, w.pos)) {
      w.target = null;
      return;
    }
    let dx = sign(w.target.x - w.pos.x);
    let dy = sign(w.target.y - w.pos.y);
    if (!this.board.canStep(w.pos, dx, dy, Mover.Wisp)) {
      // Slide along whatever blocked it, x first, then y; otherwise it stops dead.
      if (dx !== 0 && this.board.canStep(w.pos, dx, 0, Mover.Wisp)) dy = 0;
      else if (dy !== 0 && this.board.canStep(w.pos, 0, dy, Mover.Wisp)) dx = 0;
      else {
        w.target = null;
        return;
      }
    }
    w.pos = pt(w.pos.x + dx, w.pos.y + dy);
    if (samePt(w.pos, w.target)) w.target = null;
  }

  private placeWisp(w: Wisp, taken: Set<string>) {
    const spawns = this.shrine.wispSpawns[w.guild]!;
    const free = spawns.filter((s) => !taken.has(key(s)));
    const pool = free.length > 0 ? free : spawns;
    w.pos = pool[this.rng.int(pool.length)]!;
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

    // Ice: start a tick on it and you slide a tile the way you face, and that's your tick.
    // You keep sliding until you leave the ice or hit something; then your order carries on.
    const f = p.facing;
    if (this.board.tile(p.pos) === Tile.Ice && (f.x || f.y) && this.board.canStep(p.pos, f.x, f.y, Mover.Walker)) {
      p.pos = pt(p.pos.x + f.x, p.pos.y + f.y);
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
    if (!p.slipped && this.loses(p, w)) p.slipped = true;
    p.beam = w.id;
    if (p.slipped) return;
    const off = flingOffset(p.pos, w.pos, p.mode);
    // Already right in front of the puller: the touch holds it but it doesn't move.
    w.target = off.x === 0 && off.y === 0 ? null : pt(w.pos.x + off.x, w.pos.y + off.y);
    w.holder = p.id;
    w.grip = Grip.Held;
    w.touched = true;
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
