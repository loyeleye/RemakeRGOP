// A simple lamplighter bot. For its nearest wisp it tries every tile it could pull from,
// plays the pull forward (a pull stops one tile short of you, and the archway pillars stop
// wisps and sight), and walks to the tile that brings the wisp closest to banking soonest.
// Usually that's two pulls: up to a gap in the archways, then through it from across the brazier. With `pushy`
// set it also shoves rival wisps that get close to the rim.
// Used for practice rivals, tests and (later) story-mode opponents.

import { Board, DIRS, Mover, Tile, cheb, isSlick, pt, samePt, type Pt } from "./board.js";
import type { Gimmicks } from "./maps.js";
import { CRYSTAL_FLIGHT, PONDS_FLIGHT, PULL_REACH, flingOffset, wispMove, type Command, type Game, type Wisp } from "./game.js";

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
  /** Chance per decision to lapse and play like the Medium bot for that decision. */
  lapse?: number;
  /** Before each new move, stand still for a random number of ticks in this range. */
  wait?: [number, number];
  /**
   * Plays as a team with other co-op bots on its guild: some hold home squares by the
   * archways and pull in whatever comes into reach, the rest fetch wisps and feed them to
   * the home squares, and nobody chases a wisp a teammate already has.
   */
  coop?: boolean;
  /** Chance per decision to forget the team and play alone. */
  coopLapse?: number;
}

/** Easy: Medium's straight pulls, but it stops to think for 3 to 12 ticks before each new move. */
export const BOT_EASY: BotStyle = { pushy: 0, sloppiness: 0.3, straightOnly: true, wait: [3, 12] };
/** Medium: pulls only, along the 4 straight directions, and dawdles. Never pushes. */
export const BOT_MEDIUM: BotStyle = { pushy: 0, sloppiness: 0.3, straightOnly: true };
/**
 * Hard: walks to the best spot for its nearest wisp and holds it in, and pushes rivals about
 * to bank, but half its decisions are Medium ones. It never taps: juggling wisps with taps is
 * left as the trick a human can learn to beat it.
 */
export const BOT_HARD: BotStyle = { pushy: 3, sloppiness: 0.15, lapse: 1 / 2, coop: true, coopLapse: 0.7 };
export const BOT_LEVELS = { easy: BOT_EASY, medium: BOT_MEDIUM, hard: BOT_HARD } as const;
export type BotLevel = keyof typeof BOT_LEVELS;
/** Kept for older callers: the old "sharper bot". */
export const BOT_FAIR = BOT_HARD;

export function botCommand(game: Game, id: number, style: BotStyle, rand: () => number = Math.random): Command | null {
  const me = game.players.find((p) => p.id === id);
  if (!me) return null;
  // Teamwork lapses like the rest of a bot's judgment: among bots, some team decisions are
  // solo ones. With a person on the team it always plays along, so they can count on it.
  const team = style.coop ? coopTeam(game, me) : null;
  if (team && (team.people > 0 || rand() >= (style.coopLapse ?? 0))) {
    {
      const cmd = coopCommand(game, me, team, style, rand);
      if (cmd !== undefined) return cmd;
    }
  }
  if (style.lapse && rand() < style.lapse) return botCommand(game, id, BOT_MEDIUM, rand);
  if (style.wait) return waited(game, id, style, rand);
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

/** Per game, each slow bot's tick to act on (and the move it's thinking about). */
const thinking = new WeakMap<Game, Map<number, { until: number; cmd: Command | null }>>();

function waited(game: Game, id: number, style: BotStyle, rand: () => number): Command | null {
  const [lo, hi] = style.wait!;
  let all = thinking.get(game);
  if (!all) thinking.set(game, (all = new Map()));
  const t = all.get(id);
  if (t) {
    if (game.tick < t.until) return null;
    all.delete(id);
    return t.cmd;
  }
  const cmd = botCommand(game, id, { ...style, wait: undefined }, rand);
  if (!cmd) return null;
  all.set(id, { until: game.tick + lo + Math.floor(rand() * (hi - lo + 1)), cmd });
  return null;
}

const UNREACHABLE = 0x7fff;
const bankCache = new WeakMap<Board, { version: number; d: Int16Array }>();

/** For each tile, how many wisp steps it is from the brazier rim (going round the archways). */
export function bankDistances(board: Board): Int16Array {
  const cached = bankCache.get(board);
  if (cached && cached.version === board.version) return cached.d;
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
  // A wisp can't rest on ice, it skates on: count ending there as well short of banking.
  for (let i = 0; i < W * H; i++) if (isSlick(board.tiles[i]!) && d[i]! > 0 && d[i]! < UNREACHABLE) d[i] = d[i]! + 6;
  bankCache.set(board, { version: board.version, d });
  return d;
}

/** Where the wisp ends up if pulled from `from` until it stops, and how many ticks it takes. */
export function simulatePull(board: Board, from: Pt, start: Pt, maxTicks = 30, gimmicks: Gimmicks = {}): { end: Pt; ticks: number } {
  let w = start;
  // Once it's turned by a crystal or out of a moon pond, the staff has let go: it just flies.
  let skate: Pt | null = null;
  let glide = 0;
  const c = board.center;
  for (let t = 1; t <= maxTicks; t++) {
    if (board.inBankZone(w)) return { end: w, ticks: t };
    let target: Pt | null = null;
    if (!skate) {
      if (cheb(from, w) > PULL_REACH || !board.canSee(from, w)) return { end: w, ticks: t };
      const off = flingOffset(from, w, "pull");
      if (!off.x && !off.y) return { end: w, ticks: t };
      target = pt(w.x + off.x, w.y + off.y);
    }
    // One step, or two on a petal bed.
    for (let k = 0; k < 2; k++) {
      let dx: number, dy: number, ax: number, ay: number;
      if (skate) [dx, dy, ax, ay] = [skate.x, skate.y, 1, 1];
      else if (target && !samePt(target, w)) [dx, dy, ax, ay] = [Math.sign(target.x - w.x), Math.sign(target.y - w.y), Math.abs(target.x - w.x), Math.abs(target.y - w.y)];
      else break;
      const mv = wispMove(board, w, dx, dy, ax, ay);
      if (!mv) {
        if (skate) return { end: w, ticks: t };
        break;
      }
      if (mv.bounce) {
        skate = mv.bounce;
        glide = CRYSTAL_FLIGHT;
        target = null;
      }
      const prev = w;
      w = pt(w.x + mv.step[0], w.y + mv.step[1]);
      if (gimmicks.ponds && board.tile(w) === Tile.Water && board.tile(prev) !== Tile.Water) {
        const twin = pt(2 * c.x - w.x, 2 * c.y - w.y);
        if (board.tile(twin) === Tile.Water) {
          skate = pt(mv.step[0], mv.step[1]);
          glide = PONDS_FLIGHT + 1;
          target = null;
          w = twin;
        }
      }
      if (skate) {
        if (glide > 0) glide--;
        if (glide === 0) return { end: w, ticks: t + 1 };
      }
      if (board.inBankZone(w) || board.tile(w) !== Tile.Bloom) break;
    }
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
  const stuckOptions: { s: Pt; cost: number; end: number }[] = [];
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.pos.x + dx, wisp.pos.y + dy);
      if (!board.inside(s) || (dx === 0 && dy === 0)) continue;
      const wk = walk[s.y * W + s.x]!;
      // Nobody can stand still on ice to pull from it.
      if (wk === UNREACHABLE || board.tile(s) === Tile.Ice || !board.canSee(s, wisp.pos)) continue;
      const { end, ticks } = simulatePull(board, s, wisp.pos, 30, game.shrine.gimmicks);
      const left = bank[end.y * W + end.x]!;
      if (left >= now) {
        // No better: but a wisp wedged where nothing brings it closer has to be moved out first.
        if (samePt(end, wisp.pos) || left >= UNREACHABLE) continue;
        stuckOptions.push({ s, cost: wk + ticks + left * 2.5 + 50, end: end.y * W + end.x });
        continue;
      }
      // Easy bots avoid angled pulls: they take one only when no straight pull helps.
      const angled = straightOnly && dx !== 0 && dy !== 0 ? 1000 : 0;
      options.push({ s, cost: wk + ticks + left * 2.5 + angled, end: end.y * W + end.x });
    }
  if (options.length === 0) options.push(...stuckOptions);
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
    const { end, ticks } = simulatePull(board, me.pos, w.pos, 30, game.shrine.gimmicks);
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

// ------------------------------------------------------------------ co-op

/** Per game, the ids of co-op bots (they sign in the first time they're asked to move). */
const coopBots = new WeakMap<Game, Set<number>>();

interface Team {
  /** Co-op bots on my guild, by id. */
  bots: number[];
  /** Home squares held by the first bots in `bots`: one per anchor. */
  homes: Pt[];
  /** Where teammates who aren't co-op bots (people) are holding still by the court: fed like home squares. */
  partners: Pt[];
  /** How many people are on the team. */
  people: number;
}

/** Per game, where each player was last seen and since which tick they've stood there. */
const stillSince = new WeakMap<Game, Map<number, { x: number; y: number; since: number }>>();

/** My guild's co-op team, or null if I'm the only co-op bot on it. */
function coopTeam(game: Game, me: Game["players"][number]): Team | null {
  let set = coopBots.get(game);
  if (!set) coopBots.set(game, (set = new Set()));
  set.add(me.id);
  const bots = game.players.filter((p) => p.guild === me.guild && set.has(p.id)).map((p) => p.id).sort((a, b) => a - b);
  const people = game.players.filter((p) => p.guild === me.guild && !set.has(p.id));
  if (bots.length + people.length < 2) return null;
  // A person standing still in or by the court for a couple of ticks is holding a square:
  // feed them. One who's off fetching is fed by a bot on a home square instead.
  let still = stillSince.get(game);
  if (!still) stillSince.set(game, (still = new Map()));
  const c = game.board.center;
  const ring = Math.max(...game.shrine.rings.map((r) => r.radius), 4);
  const partners: Pt[] = [];
  for (const p of people) {
    const was = still.get(p.id);
    if (!was || was.x !== p.pos.x || was.y !== p.pos.y) still.set(p.id, { x: p.pos.x, y: p.pos.y, since: game.tick });
    else if (game.tick - was.since >= 2 && cheb(p.pos, c) <= ring + 3) partners.push(p.pos);
  }
  // Half the bots (rounded up) hold home squares and the rest fetch; with a person holding a
  // square, rounded down, so a lone bot fetches for them.
  const anchors = partners.length ? Math.floor(bots.length / 2) : Math.ceil(bots.length / 2);
  return { bots, homes: anchors ? homeSquares(game, anchors) : [], partners, people: people.length };
}

const homeCache = new WeakMap<Game, Pt[]>();

/**
 * The best home squares: tiles in or just outside the court that the most spawn tiles can be
 * pulled straight into the brazier from (from across it, so they fly over the rim). Each extra one is as far round as can be from those
 * already taken, so anchors cover different sides, like players on opposite home squares.
 */
export function homeSquares(game: Game, n: number): Pt[] {
  const cached = homeCache.get(game);
  if (cached) return cached.slice(0, n);
  const board = game.board, c = board.center;
  const ring = Math.max(...game.shrine.rings.map((r) => r.radius), 4);
  const all = game.shrine.spawnField.length ? game.shrine.spawnField : game.shrine.wispSpawns.flat();
  // Big fields are sampled: an even spread of up to 120 tiles is plenty to rank squares by.
  const field = all.length > 120 ? all.filter((_, i) => i % Math.ceil(all.length / 120) === 0) : all;
  const scored: { s: Pt; score: number }[] = [];
  for (let dy = -(ring + 3); dy <= ring + 3; dy++)
    for (let dx = -(ring + 3); dx <= ring + 3; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const s = pt(c.x + dx, c.y + dy);
      // In the court or just outside it: wherever wisps across the brazier come in from.
      if (d < 2 || !board.inside(s) || board.tile(s) !== Tile.Floor || board.inBankZone(s)) continue;
      let score = 0;
      for (const f of field) {
        if (cheb(f, s) > PULL_REACH || !board.canSee(s, f)) continue;
        if (board.inBankZone(simulatePull(board, s, f, 30, game.shrine.gimmicks).end)) score++;
      }
      if (score > 0) scored.push({ s, score });
    }
  scored.sort((a, b) => b.score - a.score);
  const out: Pt[] = [];
  const angle = (p: Pt) => Math.atan2(p.y - c.y, p.x - c.x);
  while (out.length < 4 && out.length < scored.length) {
    if (!out.length) {
      out.push(scored[0]!.s);
      continue;
    }
    // Score, weighted by how far round it is from the nearest square already chosen.
    let best = -1, bestV = -1;
    scored.forEach((o, i) => {
      if (out.some((h) => samePt(h, o.s))) return;
      const sep = Math.min(...out.map((h) => Math.abs(Math.atan2(Math.sin(angle(o.s) - angle(h)), Math.cos(angle(o.s) - angle(h))))));
      const v = o.score * (sep / Math.PI);
      if (v > bestV) [best, bestV] = [i, v];
    });
    if (best < 0) break;
    out.push(scored[best]!.s);
  }
  homeCache.set(game, out);
  return out.slice(0, n);
}

/**
 * A co-op bot's move, or undefined to fall back on its usual play. Anchors hold their home
 * square and pull in what comes into reach; fetchers leave a teammate's wisp alone and
 * prefer pulls that land a wisp where a home square can bank it.
 */
function coopCommand(game: Game, me: Game["players"][number], team: Team, style: BotStyle, rand: () => number): Command | null | undefined {
  // Two on a team coord the classic way: a half of the shrine each.
  const mates = game.players.filter((p) => p.guild === me.guild && p.id !== me.id);
  // On small shrines, that is. On big ones the wisps are too far out for it: there one holds
  // a home square and the other fetches.
  if (mates.length === 1 && !bigShrine(game)) return halfCommand(game, me, mates[0]!, rand, style);
  const board = game.board, W = board.width;
  const fixMode = me.mode !== "pull";
  const live = (w: Wisp) => w.guild === me.guild && !board.inBankZone(w.pos);
  const slot = team.bots.indexOf(me.id);
  const home = team.homes[slot];
  const bank = bankDistances(board);
  // Wisps my teammates are working on (pulling, or walking to pull).
  const claimed = new Set<number>();
  for (const p of game.players)
    if (p.id !== me.id && p.guild === me.guild && p.action.kind === "staff") claimed.add(p.action.wisp);

  if (home) {
    // Anchor. Pull in the wisp that banks soonest from here.
    if (me.action.kind === "staff" && !fixMode) {
      const w = game.wisps[me.action.wisp];
      if (w && live(w) && !me.slipped && w.target && samePt(me.pos, home)) return null;
    }
    if (samePt(me.pos, home)) {
      let pick: { id: number; score: number } | null = null;
      for (const w of game.wisps) {
        if (!live(w) || !game.inReach({ ...me, mode: "pull" }, w)) continue;
        const { end, ticks } = simulatePull(board, me.pos, w.pos, 30, game.shrine.gimmicks);
        const left = bank[end.y * W + end.x]!;
        if (left >= bank[w.pos.y * W + w.pos.x]!) continue;
        const score = left * 4 + ticks;
        if (!pick || score < pick.score) pick = { id: w.id, score };
      }
      if (pick) return { action: { kind: "staff", wisp: pick.id }, toggleMode: fixMode || undefined };
      // Nothing in reach: wait here if a fetcher is bringing one in or one is nearly in reach;
      // otherwise go and get one like anyone would.
      const incoming = game.wisps.some((w) => live(w) && claimed.has(w.id));
      if (incoming && team.homes.length < team.bots.length + team.people) return fixMode ? { toggleMode: true } : me.action.kind === "idle" ? null : { action: { kind: "idle" } };
      return undefined;
    }
    // Off the square: finish the wisp I went for, then head back when there's work there.
    if (me.action.kind === "staff" && live(game.wisps[me.action.wisp]!)) return undefined;
    if (me.action.kind === "walk" && samePt(me.action.to, home)) return null;
    if (game.wisps.some((w) => live(w) && cheb(w.pos, home) <= PULL_REACH && !claimed.has(w.id))) return { action: { kind: "walk", to: home }, toggleMode: fixMode || undefined };
    return undefined;
  }

  // Fetcher.
  if (me.action.kind === "staff" && !fixMode) {
    const w = game.wisps[me.action.wisp];
    const stuck = me.beam === w?.id && w && samePt(w.prev, w.pos);
    if (w && live(w) && !claimed.has(w.id) && !me.slipped && !stuck && (w.target || me.beam !== w.id)) return null;
  }
  if (rand() < style.sloppiness) return fixMode ? { toggleMode: true } : null;
  // A wisp an anchor can already bank from its square is theirs.
  const homes = [...team.homes.filter((h) => team.bots.some((id, i) => i < team.homes.length && samePt(game.players.find((p) => p.id === id)?.pos ?? pt(-1, -1), h))), ...team.partners];
  const anchorHas = (w: Wisp) =>
    homes.some((h) => cheb(h, w.pos) <= PULL_REACH && board.canSee(h, w.pos) && board.inBankZone(simulatePull(board, h, w.pos, 30, game.shrine.gimmicks).end)) ||
    // A person holding a square gets anything in their reach that they're working: one left
    // sitting there for a few ticks is fair game.
    (restingFor(game, w) < 6 && team.partners.some((h) => cheb(h, w.pos) <= PULL_REACH && board.canSee(h, w.pos)));
  const targets = game.wisps.filter((w) => live(w) && !claimed.has(w.id) && !anchorHas(w));
  let mine = fetching.get(game);
  if (!mine) fetching.set(game, (mine = new Map()));
  // Stick with the wisp I set out for while it's still mine to fetch.
  let target = targets.find((w) => w.id === mine!.get(me.id));
  if (!target) {
    if (!targets.length) return undefined;
    // Nearest to me: fetching is about getting there first.
    target = targets.sort((a, b) => cheb(a.pos, me.pos) - cheb(b.pos, me.pos))[0]!;
    mine.set(me.id, target.id);
  }
  const spot = feedSpot(game, me.pos, target, homes, team.partners) ?? planSpot(game, me.id, me.pos, target, 0, false);
  if (!spot) return { action: { kind: "staff", wisp: target.id }, toggleMode: fixMode || undefined };
  if (!samePt(me.pos, spot)) {
    if (me.action.kind === "walk" && samePt(me.action.to, spot)) return fixMode ? { toggleMode: true } : null;
    return { action: { kind: "walk", to: spot }, toggleMode: fixMode || undefined };
  }
  return { action: { kind: "staff", wisp: target.id }, toggleMode: fixMode || undefined };
}

/**
 * The best tile to pull this wisp from so it lands where a held home square can bank it in
 * one pull, if that's quicker than taking it all the way in myself. Null if no such feed.
 */
/** Per game, where each wisp was last seen and since which tick it's sat there. */
const resting = new WeakMap<Game, Map<number, { x: number; y: number; since: number }>>();

/** How many ticks this wisp has sat still. */
function restingFor(game: Game, w: Wisp): number {
  let m = resting.get(game);
  if (!m) resting.set(game, (m = new Map()));
  const r = m.get(w.id);
  if (!r || r.x !== w.pos.x || r.y !== w.pos.y) {
    m.set(w.id, { x: w.pos.x, y: w.pos.y, since: game.tick });
    return 0;
  }
  return game.tick - r.since;
}

/** Per game, the wisp each fetcher has set out for. */
const fetching = new WeakMap<Game, Map<number, number>>();

const feeds = new WeakMap<Game, Map<number, { key: string; spot: Pt | null }>>();

function feedSpot(game: Game, me: Pt, wisp: Wisp, homes: Pt[], partners: Pt[] = []): Pt | null {
  if (!homes.length) return null;
  let cache = feeds.get(game);
  if (!cache) feeds.set(game, (cache = new Map()));
  const key = `${wisp.pos.x},${wisp.pos.y},${homes.map((h) => h.x + "," + h.y).join(";")}`;
  const hit = cache.get(wisp.id);
  if (hit && hit.key === key) return hit.spot;
  const spot = findFeed(game, me, wisp, homes, partners);
  cache.set(wisp.id, { key, spot });
  return spot;
}

function findFeed(game: Game, me: Pt, wisp: Wisp, homes: Pt[], partners: Pt[]): Pt | null {
  const board = game.board;
  const g = game.shrine.gimmicks;
  let best: { s: Pt; cost: number } | null = null;
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.pos.x + dx, wisp.pos.y + dy);
      if (!board.inside(s) || (dx === 0 && dy === 0) || !board.passable(s, Mover.Walker) || board.tile(s) === Tile.Ice) continue;
      // Keep off a person's square: that's their spot.
      if (partners.some((h) => cheb(h, s) <= 1)) continue;
      if (!board.canSee(s, wisp.pos)) continue;
      const walk = cheb(me, s);
      if (walk > 12) continue;
      const { end, ticks } = simulatePull(board, s, wisp.pos, 30, g);
      if (board.inBankZone(end)) {
        // With a person holding a square, feeding them is the point: finishing it myself
        // has to be a good deal quicker.
        const cost = walk + ticks + (partners.length ? 10 : 0);
        if (!best || cost < best.cost) best = { s, cost };
        continue;
      }
      for (const h of homes) {
        if (cheb(h, end) > PULL_REACH || !board.canSee(h, end)) continue;
        const fin = simulatePull(board, h, end, 30, g);
        if (!board.inBankZone(fin.end)) continue;
        const cost = walk + ticks + fin.ticks;
        if (!best || cost < best.cost) best = { s, cost };
      }
    }
  return best?.s ?? null;
}

// ------------------------------------------------------------------ half-shrine coording

/**
 * Per game, each bot's half: the axis (x or y) and the side of the brazier (+1 or -1) it
 * works from, and how long its partner has been on that same side (to swap if they stay).
 */
/** Per game, where each partner was last seen and since which tick they've stood there. */
const mateStill = new WeakMap<Game, Map<number, { at: Pt; since: number }>>();

const halves = new WeakMap<Game, Map<number, { axis: "x" | "y"; side: number; crowded: number }>>();

/**
 * Coording with one teammate, the way pairs play the orb game: each takes a half of the
 * shrine and moves about inside the archways there. Wisps across the brazier on the
 * partner's side are pulled in over the rim from my half. A wisp on my side that's out of my
 * partner's reach I pull in until they can reach it, so they never have to leave their half.
 */
export function halfCommand(game: Game, me: Game["players"][number], mate: Game["players"][number], rand: () => number = Math.random, style: BotStyle = BOT_HARD): Command | null | undefined {
  const board = game.board, c = board.center, W = board.width;
  const g = game.shrine.gimmicks;
  const fixMode = me.mode !== "pull";
  const live = (w: Wisp) => w.guild === me.guild && !board.inBankZone(w.pos);
  // My half: opposite my partner, along whichever axis they're furthest out on.
  let all = halves.get(game);
  if (!all) halves.set(game, (all = new Map()));
  let half = all.get(me.id);
  const mdx = mate.pos.x - c.x, mdy = mate.pos.y - c.y;
  // Wait for my partner to settle somewhere (stand still 3 ticks) before taking the other half;
  // till then, play as usual.
  let seen = mateStill.get(game);
  if (!seen) mateStill.set(game, (seen = new Map()));
  const was = seen.get(mate.id);
  if (!was || !samePt(was.at, mate.pos)) seen.set(mate.id, { at: mate.pos, since: game.tick });
  if (!half && game.tick - (seen.get(mate.id)!.since) < 3) return undefined;
  if (!half) {
    const axis = Math.abs(mdx) >= Math.abs(mdy) ? "x" : "y";
    const m = axis === "x" ? mdx : mdy;
    half = { axis, side: m > 0 ? -1 : m < 0 ? 1 : me.id % 2 ? 1 : -1, crowded: 0 };
    all.set(me.id, half);
  }
  const along = (p: Pt) => (half!.axis === "x" ? p.x - c.x : p.y - c.y);
  // If my partner settles on my half, they've picked it: I take the other.
  if (along(mate.pos) * half.side >= 2) {
    if (++half.crowded >= 5) {
      const axis = Math.abs(mdx) >= Math.abs(mdy) ? "x" : "y";
      const m = axis === "x" ? mdx : mdy;
      all.set(me.id, (half = { axis, side: m > 0 ? -1 : 1, crowded: 0 }));
    }
  } else half.crowded = 0;
  const mine = (p: Pt) => along(p) * half!.side >= 1;
  const theirs = (p: Pt) => along(p) * half!.side <= -1;

  // The court tiles on my half, inside the archways and off the rim.
  const inner = Math.min(...game.shrine.rings.map((r) => r.radius));
  const court: Pt[] = [];
  // Inside the archways; if that's all ice (or too cramped), just outside them too.
  for (const reach of [inner - 1, inner + 2]) {
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const s = pt(c.x + dx, c.y + dy);
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d < 3 || (reach > inner - 1 && d <= inner - 1) || !mine(s) || !board.passable(s, Mover.Walker) || board.tile(s) === Tile.Ice) continue;
        court.push(s);
      }
    if (court.length >= 6) break;
  }
  const mateReach = (p: Pt) => cheb(mate.pos, p) <= PULL_REACH && board.canSee(mate.pos, p);
  const go = (to: Pt, wisp: number): Command | null => {
    if (!samePt(me.pos, to)) {
      if (me.action.kind === "walk" && samePt(me.action.to, to)) return fixMode ? { toggleMode: true } : null;
      return { action: { kind: "walk", to }, toggleMode: fixMode || undefined };
    }
    if (me.action.kind === "staff" && me.action.wisp === wisp && !fixMode && game.wisps[wisp]!.target) return null;
    return { action: { kind: "staff", wisp }, toggleMode: fixMode || undefined };
  };
  // Keep at a pull that's still going.
  if (me.action.kind === "staff" && !fixMode && mate.action.kind !== "staff") {
    const w = game.wisps[me.action.wisp];
    if (w && live(w) && w.target && me.beam === w.id) return null;
  }
  if (rand() < style.sloppiness) return fixMode ? { toggleMode: true } : null;
  const busy = mate.action.kind === "staff" ? mate.action.wisp : -1;

  // 1. Bank a wisp from my half: one on their side (it flies over the rim), or any I can.
  let best: { s: Pt; id: number; cost: number } | null = null;
  for (const w of game.wisps) {
    if (!live(w) || w.id === busy) continue;
    for (const s of court) {
      if (cheb(s, w.pos) > PULL_REACH || samePt(s, w.pos) || !board.canSee(s, w.pos)) continue;
      const { end, ticks } = simulatePull(board, s, w.pos, 30, g);
      if (!board.inBankZone(end)) continue;
      // A wisp on my own side is my partner's to bank unless they can't reach it.
      const cost = cheb(me.pos, s) + ticks + (mine(w.pos) && mateReach(w.pos) ? 12 : 0);
      if (!best || cost < best.cost) best = { s, id: w.id, cost };
    }
  }
  if (best && best.cost < 30) return go(best.s, best.id);

  // 2. Feed: a wisp on my side out of my partner's reach. Pull it in (going out for it if I
  // must) until they can reach it.
  let feed: { s: Pt; id: number; cost: number } | null = null;
  for (const w of game.wisps) {
    if (!live(w) || w.id === busy || !mine(w.pos) || mateReach(w.pos)) continue;
    for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
      for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
        const s = pt(w.pos.x + dx, w.pos.y + dy);
        if ((!dx && !dy) || !board.inside(s) || !board.passable(s, Mover.Walker) || board.tile(s) === Tile.Ice || !board.canSee(s, w.pos)) continue;
        const { end, ticks } = simulatePull(board, s, w.pos, 30, g);
        if (!mateReach(end) && !board.inBankZone(end)) continue;
        // Staying in my half's court is best; stepping out costs more.
        const cost = cheb(me.pos, s) * (mine(s) && cheb(s, c) < inner ? 1 : 1.5) + ticks;
        if (!feed || cost < feed.cost) feed = { s, id: w.id, cost };
      }
  }
  if (feed) return go(feed.s, feed.id);
  if (best) return go(best.s, best.id);

  // 3. Nothing to do: wait in my half of the court, nearest the middle of it.
  const wait = court.sort((a, b) => cheb(a, me.pos) * 0.2 + Math.abs(along(a)) - (cheb(b, me.pos) * 0.2 + Math.abs(along(b))))[0];
  if (wait && !mine(me.pos)) return go(wait, -1);
  return fixMode ? { toggleMode: true } : me.action.kind === "idle" ? null : { action: { kind: "idle" } };
}

/** A shrine whose wisps appear well out past the court (Old Bastion, Sunwell Terrace). */
function bigShrine(game: Game): boolean {
  const field = game.shrine.spawnField;
  if (!field.length) return false;
  const c = game.board.center;
  const mid = field.map((p) => cheb(p, c)).sort((a, b) => a - b)[field.length >> 1]!;
  return mid > 12;
}
