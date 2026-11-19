// A simple lamplighter bot. For its nearest wisp it tries every tile it could pull from,
// plays the pull forward (a pull stops one tile short of you, and the archway pillars stop
// wisps and sight), and walks to the tile that brings the wisp closest to banking soonest.
// Usually that's two pulls: up to a gap in the archways, then through it from across the brazier. With `pushy`
// set it also shoves rival wisps that get close to the rim.
// Used for practice rivals, tests and (later) story-mode opponents.

import { Board, DIRS, Mover, cheb, pt, type Pt } from "./board.js";
import { PULL_REACH, flingOffset, slideStep, type Command, type Game, type Wisp } from "./game.js";

export interface BotStyle {
  /** Push rival wisps within this many tiles of the brazier rim (0 = never). */
  pushy: number;
  /** Chance per decision to dawdle for a tick (keeps easy bots beatable). */
  sloppiness: number;
  /**
   * Juggle: tap whichever of its wisps needs a nudge from where it stands (a one-tick touch
   * sends a wisp 2 tiles, so tapping in turn keeps several moving), and only walk when none
   * can be brought in from here. This is how good players score in the orb game.
   */
  taps?: boolean;
  /** Pull along the 4 straight directions (wisp and bot share a row or column) whenever any straight pull helps. */
  straightOnly?: boolean;
  /**
   * Imperfect judgment: [best, second best]. Each decision picks the best option with the
   * first chance, the second best with the second, and otherwise has a lapse and plays like
   * the Medium bot (no taps, best walking plan) for that decision.
   */
  pick?: [number, number];
  /** Chance per decision to lapse and play like the Easy bot for that decision. */
  easyLapse?: number;
}

/** Easy: pulls only, along the 4 straight directions, and dawdles. Never pushes. */
export const BOT_EASY: BotStyle = { pushy: 0, sloppiness: 0.3, straightOnly: true };
/** Medium: walks to the best spot for its nearest wisp and holds it in; pushes rivals about to bank. Half its decisions are Easy ones. */
export const BOT_MEDIUM: BotStyle = { pushy: 3, sloppiness: 0.15, easyLapse: 1 / 2 };
/** Hard: taps to juggle wisps, but picks the best angle only half the time. */
export const BOT_HARD: BotStyle = { pushy: 3, sloppiness: 0.05, taps: true, pick: [1 / 2, 1 / 6] };
export const BOT_LEVELS = { easy: BOT_EASY, medium: BOT_MEDIUM, hard: BOT_HARD } as const;
export type BotLevel = keyof typeof BOT_LEVELS;
/** Kept for older callers: the old "sharper bot". */
export const BOT_FAIR = BOT_HARD;

export function botCommand(game: Game, id: number, style: BotStyle, rand: () => number = Math.random): Command | null {
  const me = game.players.find((p) => p.id === id);
  if (!me) return null;
  if (style.easyLapse && rand() < style.easyLapse) return botCommand(game, id, BOT_EASY, rand);
  const c = game.board.center;
  const live = (w: Wisp) => !game.board.inBankZone(w.pos);

  // Shove a rival wisp that's about to be banked.
  if (style.pushy > 0) {
    const threat = game.wisps
      .filter((w) => w.guild !== me.guild && live(w) && cheb(w.pos, c) <= 2 + style.pushy && w.target)
      .sort((a, b) => cheb(a.pos, c) - cheb(b.pos, c))[0];
    if (threat && game.inReach({ ...me, mode: "push" }, threat)) {
      if (me.action.kind === "staff" && me.action.wisp === threat.id && me.mode === "push") return null;
      return { action: { kind: "staff", wisp: threat.id }, toggleMode: me.mode !== "push" };
    }
  }

  const fixMode = me.mode !== "pull";
  // This decision's judgment: best, second best, or a lapse into Medium play.
  let rank = 0;
  let taps = !!style.taps;
  if (style.pick) {
    const r = rand();
    if (r >= style.pick[0] + style.pick[1]) taps = false;
    else if (r >= style.pick[0]) rank = 1;
  }
  if (taps && !me.moved && rand() >= style.sloppiness) {
    const tap = pickTap(game, me, rank);
    if (tap !== null) {
      if (me.action.kind === "staff" && me.action.wisp === tap && !fixMode) return null;
      return { action: { kind: "staff", wisp: tap }, toggleMode: fixMode || undefined };
    }
  }
  // Keep holding a wisp we're already pulling while it's in flight, or while we're still
  // walking into reach of it.
  if (me.action.kind === "staff" && !fixMode) {
    const w = game.wisps[me.action.wisp];
    const stuck = me.beam === w?.id && w && w.prev.x === w.pos.x && w.prev.y === w.pos.y;
    if (w && w.guild === me.guild && live(w) && !me.slipped && !stuck && (w.target || me.beam !== w.id)) return null;
  }
  if (rand() < style.sloppiness) return fixMode ? { toggleMode: true } : null;

  const dist = bankDistances(game.board);
  const W = game.board.width;
  const target = game.wisps
    .filter((w) => w.guild === me.guild && live(w))
    .sort((a, b) => (dist[a.pos.y * W + a.pos.x] ?? 0) - (dist[b.pos.y * W + b.pos.x] ?? 0))[0];
  if (!target) return fixMode ? { toggleMode: true, action: { kind: "idle" } } : null;

  const spot = planSpot(game, me.id, me.pos, target, rank, !!style.straightOnly);
  if (!spot) return { action: { kind: "staff", wisp: target.id }, toggleMode: fixMode || undefined };
  const atSpot = me.pos.x === spot.x && me.pos.y === spot.y;
  if (!atSpot) {
    if (me.action.kind === "walk" && me.action.to.x === spot.x && me.action.to.y === spot.y) return fixMode ? { toggleMode: true } : null;
    return { action: { kind: "walk", to: spot }, toggleMode: fixMode || undefined };
  }
  return { action: { kind: "staff", wisp: target.id }, toggleMode: fixMode || undefined };
}

const UNREACHABLE = 0x7fff;
const bankCache = new WeakMap<Board, Int16Array>();

/** For each tile, how many wisp steps it is from the brazier rim (going round the archways). */
export function bankDistances(board: Board): Int16Array {
  const cached = bankCache.get(board);
  if (cached) return cached;
  const W = board.width, H = board.height;
  const d = new Int16Array(W * H).fill(UNREACHABLE);
  const q: Pt[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (board.inBankZone(pt(x, y))) {
        d[y * W + x] = 0;
        q.push(pt(x, y));
      }
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    for (const dir of DIRS) {
      const n = pt(p.x + dir.x, p.y + dir.y);
      if (!board.inside(n) || d[n.y * W + n.x]! !== UNREACHABLE) continue;
      // A wisp at n could step onto p.
      if (!board.canStep(n, -dir.x, -dir.y, Mover.Wisp)) continue;
      d[n.y * W + n.x] = d[p.y * W + p.x]! + 1;
      q.push(n);
    }
  }
  bankCache.set(board, d);
  return d;
}

/** Where the wisp ends up if pulled from `from` until it stops, and how many ticks it takes. */
export function simulatePull(board: Board, from: Pt, start: Pt, maxTicks = 30): { end: Pt; ticks: number } {
  let w = start;
  for (let t = 1; t <= maxTicks; t++) {
    if (board.inBankZone(w)) return { end: w, ticks: t };
    if (cheb(from, w) > PULL_REACH || !board.canSee(from, w)) return { end: w, ticks: t };
    const off = flingOffset(from, w, "pull");
    if (!off.x && !off.y) return { end: w, ticks: t };
    const step = slideStep(board, w, Math.sign(off.x), Math.sign(off.y), Math.abs(off.x), Math.abs(off.y));
    if (!step) return { end: w, ticks: t };
    w = pt(w.x + step[0], w.y + step[1]);
  }
  return { end: w, ticks: maxTicks };
}

interface Plan {
  wisp: number;
  at: number;
  spot: Pt | null;
}
const plans = new WeakMap<Game, Map<number, Plan>>();

/**
 * The tile to pull this wisp from: the one that gets it closest to banking soonest, counting
 * the walk there. Kept until the wisp moves.
 */
function planSpot(game: Game, id: number, me: Pt, wisp: Wisp, rank = 0, straightOnly = false): Pt | null {
  const board = game.board;
  const W = board.width;
  let mine = plans.get(game);
  if (!mine) plans.set(game, (mine = new Map()));
  const at = wisp.pos.y * W + wisp.pos.x;
  const old = mine.get(id);
  if (old && old.wisp === wisp.id && old.at === at) return old.spot;

  const bank = bankDistances(board);
  // Walking distance from me to every tile.
  const walk = new Int16Array(W * board.height).fill(UNREACHABLE);
  walk[me.y * W + me.x] = 0;
  const q: Pt[] = [me];
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    for (const d of DIRS) {
      if (!board.canStep(p, d.x, d.y, Mover.Walker)) continue;
      const n = pt(p.x + d.x, p.y + d.y);
      if (walk[n.y * W + n.x]! !== UNREACHABLE) continue;
      walk[n.y * W + n.x] = walk[p.y * W + p.x]! + 1;
      q.push(n);
    }
  }
  const now = bank[at]!;
  const options: { s: Pt; cost: number; end: number }[] = [];
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.pos.x + dx, wisp.pos.y + dy);
      if (!board.inside(s) || (dx === 0 && dy === 0)) continue;
      const wk = walk[s.y * W + s.x]!;
      if (wk === UNREACHABLE || !board.canSee(s, wisp.pos)) continue;
      const { end, ticks } = simulatePull(board, s, wisp.pos);
      const left = bank[end.y * W + end.x]!;
      if (left >= now) continue;
      // Easy bots avoid angled pulls: they take one only when no straight pull helps.
      const angled = straightOnly && dx !== 0 && dy !== 0 ? 1000 : 0;
      options.push({ s, cost: wk + ticks + left * 2.5 + angled, end: end.y * W + end.x });
    }
  options.sort((a, b) => a.cost - b.cost);
  // The second best is the best plan that ends the wisp somewhere else, so it's a real choice.
  const best = options[0];
  const pickd = rank > 0 && best ? options.find((o) => o.end !== best.end) ?? best : best;
  const spot = pickd ? pickd.s : null;
  mine.set(id, { wisp: wisp.id, at, spot });
  return spot;
}

/**
 * The wisp to touch this tick without moving, or null if none is worth it from here: one that
 * a pull from here brings closer to banking and that is about to stop (a wisp still with 2
 * tiles to go can be left alone a tick). Prefers the one that banks soonest.
 */
function pickTap(game: Game, me: Game["players"][number], rank = 0): number | null {
  const board = game.board;
  const W = board.width;
  const bank = bankDistances(board);
  const ranked: { id: number; score: number }[] = [];
  let moving: number | null = null;
  for (const w of game.wisps) {
    if (w.guild !== me.guild || board.inBankZone(w.pos)) continue;
    if (!game.inReach({ ...me, mode: "pull" }, w)) continue;
    const now = bank[w.pos.y * W + w.pos.x]!;
    const { end, ticks } = simulatePull(board, me.pos, w.pos);
    const left = bank[end.y * W + end.x]!;
    if (left >= now) continue;
    const stalled = w.prev.x === w.pos.x && w.prev.y === w.pos.y;
    const needs = !w.target || cheb(w.pos, w.target) <= 1 || (stalled && w.holder === me.id);
    if (!needs) {
      moving = w.id;
      continue;
    }
    ranked.push({ id: w.id, score: left * 4 + ticks });
  }
  ranked.sort((a, b) => a.score - b.score);
  const best = (ranked[Math.min(rank, ranked.length - 1)] ?? null)?.id ?? null;
  return best ?? (moving !== null && me.action.kind === "staff" ? me.action.wisp : null);
}
