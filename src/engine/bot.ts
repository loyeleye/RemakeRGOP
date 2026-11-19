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
}

export const BOT_EASY: BotStyle = { pushy: 0, sloppiness: 0.35 };
export const BOT_FAIR: BotStyle = { pushy: 3, sloppiness: 0.1 };

export function botCommand(game: Game, id: number, style: BotStyle, rand: () => number = Math.random): Command | null {
  const me = game.players.find((p) => p.id === id);
  if (!me) return null;
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

  const spot = planSpot(game, me.id, me.pos, target);
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
function planSpot(game: Game, id: number, me: Pt, wisp: Wisp): Pt | null {
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
  let best: Pt | null = null;
  let bestCost = Infinity;
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.pos.x + dx, wisp.pos.y + dy);
      if (!board.inside(s) || (dx === 0 && dy === 0)) continue;
      const wk = walk[s.y * W + s.x]!;
      if (wk === UNREACHABLE || !board.canSee(s, wisp.pos)) continue;
      const { end, ticks } = simulatePull(board, s, wisp.pos);
      const left = bank[end.y * W + end.x]!;
      if (left >= now) continue;
      const cost = wk + ticks + left * 2.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = s;
      }
    }
  mine.set(id, { wisp: wisp.id, at, spot: best });
  return best;
}
