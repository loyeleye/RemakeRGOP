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
  /**
   * Beginner's mistakes (story children: weak but busy, never standing still to think).
   * earlyRelease: chance per tick of a pull in flight that it lets go too soon, so the wisp
   * stops short. poorSpot: chance per decision it walks to the second-best spot. wrongWisp:
   * chance, each time it picks a wisp, that it goes for a random one of its own instead of
   * the nearest, and sticks with it.
   */
  earlyRelease?: number;
  poorSpot?: number;
  wrongWisp?: number;
}

/** Story children (run 3): Medium's straight pulls, never waiting, with beginner's mistakes mixed in. Tune per child. */
export const BOT_CHILD: BotStyle = { pushy: 0, sloppiness: 0.12, straightOnly: true, earlyRelease: 0.15, poorSpot: 0.3, wrongWisp: 0.2 };

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

/** What a bot is up to, for the debug overlay. */
export interface BotTrace {
  /** solo, half (coording by halves), anchor (home square) or fetcher. */
  role: string;
  /** Its half when coording: east, west, north or south. */
  half?: string;
  /** Its home square when anchoring, as an offset from the brazier. */
  home?: string;
  /** Who it's teamed with (names), if anyone. */
  team?: string;
  /** What it decided this tick, in words. */
  intent: string;
}

const traces = new WeakMap<Game, Map<number, BotTrace>>();

/** The bots' latest traces for this game (for the debug overlay). */
export function botTraces(game: Game): Map<number, BotTrace> {
  let m = traces.get(game);
  if (!m) traces.set(game, (m = new Map()));
  return m;
}

function note(game: Game, id: number, t: Partial<BotTrace>) {
  const m = botTraces(game);
  m.set(id, { role: "solo", intent: "", ...m.get(id), ...t });
}

/** A tile as an offset from the brazier, e.g. "(+3,-2)". */
function off(game: Game, p: Pt): string {
  const c = game.board.center;
  const f = (n: number) => (n > 0 ? "+" + n : String(n));
  return `(${f(p.x - c.x)},${f(p.y - c.y)})`;
}

export function botCommand(game: Game, id: number, style: BotStyle, rand: () => number = Math.random): Command | null {
  const me = game.players.find((p) => p.id === id);
  if (!me) return null;
  // Slow bots think first, then decide (as a team player or not) when the wait is up.
  if (style.wait) return waited(game, id, style, rand);
  // Teamwork lapses like the rest of a bot's judgment: among bots, some team decisions are
  // solo ones. With a person on the team it always plays along, so they can count on it.
  const team = style.coop ? coopTeam(game, me) : null;
  if (team && (team.people > 0 || rand() >= (style.coopLapse ?? 0))) {
    {
      const cmd = coopCommand(game, me, team, style, rand);
      if (cmd !== undefined) return cmd;
    }
  } else if (team) note(game, id, { intent: "teamwork lapse: playing solo this tick" });
  if (!team) note(game, id, { role: "solo", half: undefined, home: undefined, team: undefined });
  if (style.lapse && rand() < style.lapse) {
    if (!team) note(game, id, { intent: "lapse: a Medium move" });
    return botCommand(game, id, BOT_MEDIUM, rand);
  }
  const c = game.board.center;
  // Not one on the rim, waiting off the board, or (with dry hands, run 4) out on the water.
  const live = (w: Wisp) => !game.board.inBankZone(w.pos) && !game.away.has(w.id) && !game.slipsAt(id, w.pos);

  // Shove a rival wisp that's about to be banked.
  if (style.pushy > 0) {
    const threat = game.wisps
      .filter((w) => w.guild !== me.guild && live(w) && cheb(w.pos, c) <= 2 + style.pushy && w.target)
      .sort((a, b) => cheb(a.pos, c) - cheb(b.pos, c))[0];
    if (threat && game.inReach({ ...me, mode: "push" }, threat)) {
      note(game, id, { intent: `push rival wisp ${threat.id} away from the rim` });
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
  if (style.poorSpot && rand() < style.poorSpot) rank = 1;
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
    if (w && w.guild === me.guild && live(w) && !me.slipped && !stuck && (w.target || me.beam !== w.id)) {
      if (style.earlyRelease && me.beam === w.id && w.target && rand() < style.earlyRelease) {
        note(game, id, { intent: `let go of wisp ${w.id} too soon` });
        return { action: { kind: "idle" } };
      }
      return null;
    }
  }
  if (rand() < style.sloppiness) return fixMode ? { toggleMode: true } : null;

  const dist = bankDistances(game.board);
  const W = game.board.width;
  const mine = game.wisps.filter((w) => w.guild === me.guild && live(w));
  let target = mine.sort((a, b) => (dist[a.pos.y * W + a.pos.x] ?? 0) - (dist[b.pos.y * W + b.pos.x] ?? 0))[0];
  if (style.wrongWisp && target) target = stickyChoice(game, id, mine, target, style.wrongWisp, rand);
  if (!target) return fixMode ? { toggleMode: true, action: { kind: "idle" } } : null;

  const spot = planSpot(game, me.id, me.pos, target, rank, !!style.straightOnly);
  note(game, id, { intent: spot ? `wisp ${target.id}: pull from ${off(game, spot)}` : `wisp ${target.id}: pull from here` });
  if (!spot) return { action: { kind: "staff", wisp: target.id }, toggleMode: fixMode || undefined };
  const atSpot = me.pos.x === spot.x && me.pos.y === spot.y;
  if (!atSpot) {
    if (me.action.kind === "walk" && me.action.to.x === spot.x && me.action.to.y === spot.y) return fixMode ? { toggleMode: true } : null;
    return { action: { kind: "walk", to: spot }, toggleMode: fixMode || undefined };
  }
  return { action: { kind: "staff", wisp: target.id }, toggleMode: fixMode || undefined };
}

/** Per game, the wisp each mistake-prone bot has set its heart on (see wrongWisp). */
const chosen = new WeakMap<Game, Map<number, { wisp: number; wrong: boolean; at: number }>>();

function stickyChoice(game: Game, id: number, mine: Wisp[], best: Wisp, chance: number, rand: () => number): Wisp {
  let m = chosen.get(game);
  if (!m) chosen.set(game, (m = new Map()));
  const had = m.get(id);
  // A banked wisp comes back elsewhere under the same id: that's a fresh choice.
  const still = had && !game.banks.some((b) => b.wisp === had.wisp) && mine.find((w) => w.id === had.wisp);
  if (still) return had!.wrong ? still : best;
  const wrong = mine.length > 1 && rand() < chance;
  const pick = wrong ? mine.filter((w) => w !== best)[Math.floor(rand() * (mine.length - 1))]! : best;
  m.set(id, { wisp: pick.id, wrong, at: game.tick });
  return pick;
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
/** The shrine's gimmicks, plus the laws of water for this puller: where a pull of theirs stops at the bank. */
export type PullRules = Gimmicks & { wet?: (p: Pt) => boolean };
export function pullRules(game: Game, id: number): PullRules {
  return { ...game.shrine.gimmicks, wet: (p) => game.slipsAt(id, p) };
}

export function simulatePull(board: Board, from: Pt, start: Pt, maxTicks = 30, gimmicks: PullRules = {}): { end: Pt; ticks: number } {
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
      const next = pt(w.x + mv.step[0], w.y + mv.step[1]);
      // The laws of water: without a water light the pull stops at the bank.
      if (!skate && gimmicks.wet && gimmicks.wet(next) && !gimmicks.wet(prev)) return { end: w, ticks: t };
      w = next;
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
export function planSpot(game: Game, id: number, me: Pt, wisp: Wisp, rank = 0, straightOnly = false): Pt | null {
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
  const rules = pullRules(game, id);
  const options: { s: Pt; cost: number; end: number }[] = [];
  const stuckOptions: { s: Pt; cost: number; end: number }[] = [];
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.pos.x + dx, wisp.pos.y + dy);
      if (!board.inside(s) || (dx === 0 && dy === 0)) continue;
      const wk = walk[s.y * W + s.x]!;
      // Nobody can stand still on ice to pull from it.
      if (wk === UNREACHABLE || board.tile(s) === Tile.Ice || !board.canSee(s, wisp.pos)) continue;
      const { end, ticks } = simulatePull(board, s, wisp.pos, 30, rules);
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
    const { end, ticks } = simulatePull(board, me.pos, w.pos, 30, pullRules(game, me.id));
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
  if (mates.length === 1 && !bigShrine(game)) return halfCommand(game, me, mates[0]!, rand, style, team.people > 0);
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

  note(game, me.id, { role: home ? "anchor" : "fetcher", home: home ? off(game, home) : undefined, half: undefined, team: mateNames(game, me) });
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
        const { end, ticks } = simulatePull(board, me.pos, w.pos, 30, pullRules(game, me.id));
        const left = bank[end.y * W + end.x]!;
        if (left >= bank[w.pos.y * W + w.pos.x]!) continue;
        const score = left * 4 + ticks;
        if (!pick || score < pick.score) pick = { id: w.id, score };
      }
      if (pick) {
        note(game, me.id, { intent: `on home square: bank wisp ${pick.id}` });
        return { action: { kind: "staff", wisp: pick.id }, toggleMode: fixMode || undefined };
      }
      // Nothing in reach: wait here if a fetcher is bringing one in or one is nearly in reach;
      // otherwise go and get one like anyone would.
      const incoming = game.wisps.some((w) => live(w) && claimed.has(w.id));
      note(game, me.id, { intent: incoming ? "on home square: waiting for a feed" : "on home square: nothing coming, fetching one myself" });
      if (incoming && team.homes.length < team.bots.length + team.people) return fixMode ? { toggleMode: true } : me.action.kind === "idle" ? null : { action: { kind: "idle" } };
      return undefined;
    }
    // Off the square: finish the wisp I went for, then head back when there's work there.
    if (me.action.kind === "staff" && live(game.wisps[me.action.wisp]!)) return undefined;
    if (me.action.kind === "walk" && samePt(me.action.to, home)) return null;
    if (game.wisps.some((w) => live(w) && cheb(w.pos, home) <= PULL_REACH && !claimed.has(w.id))) {
      note(game, me.id, { intent: "back to home square: a wisp is in reach there" });
      return { action: { kind: "walk", to: home }, toggleMode: fixMode || undefined };
    }
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
  const fed = feedSpot(game, me.pos, target, homes, team.partners);
  const spot = fed ?? planSpot(game, me.id, me.pos, target, 0, false);
  note(game, me.id, { intent: fed ? `fetch wisp ${target.id}: feed it from ${off(game, fed)}` : `fetch wisp ${target.id}: bring it in myself` });
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
const halves = new WeakMap<Game, Map<number, { axis: "x" | "y"; side: number; crowded: number; fixed?: boolean }>>();

/**
 * Coording with one teammate, the way pairs play the orb game: each takes a half of the
 * shrine and moves about inside the archways there. Wisps across the brazier on the
 * partner's side are pulled in over the rim from my half. A wisp on my side that's out of my
 * partner's reach I pull in until they can reach it, so they never have to leave their half.
 */
export function halfCommand(game: Game, me: Game["players"][number], mate: Game["players"][number], rand: () => number = Math.random, style: BotStyle = BOT_HARD, adapt = true): Command | null | undefined {
  const board = game.board, c = board.center, W = board.width;
  const g = game.shrine.gimmicks;
  const fixMode = me.mode !== "pull";
  const live = (w: Wisp) => w.guild === me.guild && !board.inBankZone(w.pos);
  // My half: opposite my partner, along whichever axis they're furthest out on.
  let all = halves.get(game);
  if (!all) halves.set(game, (all = new Map()));
  let half = all.get(me.id);
  const mdx = mate.pos.x - c.x, mdy = mate.pos.y - c.y;
  // At the start I take the far side straight away: the half across the brazier from where
  // my guild starts (my partner is starting there too).
  // Two bots don't chase each other's position: they split east-west, lower id west.
  // (Until both have moved once a bot can look like a person, so this can replace a guess.)
  if (!adapt && !half?.fixed) {
    half = { axis: "x", side: me.id < mate.id ? -1 : 1, crowded: 0, fixed: true };
    all.set(me.id, half);
  }
  if (!half) {
    const axis = Math.abs(mdx) >= Math.abs(mdy) ? "x" : "y";
    const m = axis === "x" ? mdx : mdy;
    half = { axis, side: m > 0 ? -1 : m < 0 ? 1 : me.id % 2 ? 1 : -1, crowded: 0 };
    all.set(me.id, half);
  }
  const along = (p: Pt) => (half!.axis === "x" ? p.x - c.x : p.y - c.y);
  // If my partner lingers somewhere that calls for a different split (on my half, or out to
  // the north or south when we split east-west, or the other way round), I adapt: I take
  // the half opposite them along whichever axis they're further out on.
  // Moving about their own half (into its corners, say) doesn't count: to change the axis
  // they have to be clearly further out on the other one.
  const cur = half.axis === "x" ? mdx : mdy, other = half.axis === "x" ? mdy : mdx;
  const swapAxis = Math.abs(other) >= Math.abs(cur) + 2;
  const wantAxis: "x" | "y" = swapAxis ? (half.axis === "x" ? "y" : "x") : half.axis;
  const m = swapAxis ? other : cur;
  const wantSide = m > 0 ? -1 : 1;
  if (adapt && Math.abs(m) >= 2 && (wantAxis !== half.axis || wantSide !== half.side)) {
    if (++half.crowded >= 5) all.set(me.id, (half = { axis: wantAxis, side: wantSide, crowded: 0 }));
  } else half.crowded = 0;
  const sideName = half.axis === "x" ? (half.side > 0 ? "east" : "west") : half.side > 0 ? "south" : "north";
  const prev = botTraces(game).get(me.id);
  note(game, me.id, { role: "half", half: sideName, home: undefined, team: mate.name });
  if (prev?.half && prev.half !== sideName) note(game, me.id, { intent: `partner moved: switching to the ${sideName} half` });
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
  // Each of us stands just off the brazier on our own side, level with its middle (the
  // classic east-west coord; north-south is the same turned a quarter). From there the
  // shrine splits by who can bank a wisp without moving, not by a straight line.
  const spotFor = (side: number): Pt => {
    const ideal = half!.axis === "x" ? pt(c.x + side * 3, c.y) : pt(c.x, c.y + side * 3);
    const ok = (p: Pt) => board.inside(p) && board.passable(p, Mover.Walker) && board.tile(p) !== Tile.Ice && !board.inBankZone(p);
    if (ok(ideal)) return ideal;
    let near: Pt | null = null;
    for (let r = 1; r <= 4 && !near; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const q = pt(ideal.x + dx, ideal.y + dy);
          const a = half!.axis === "x" ? q.x - c.x : q.y - c.y;
          if (a * side >= 1 && ok(q) && (!near || cheb(q, ideal) < cheb(near, ideal))) near = q;
        }
    return near ?? ideal;
  };
  const home = spotFor(half.side), mateHome = spotFor(-half.side);
  const bankable = (from: Pt, p: Pt) =>
    cheb(from, p) <= PULL_REACH && !samePt(from, p) && board.canSee(from, p) && board.inBankZone(simulatePull(board, from, p, 30, g).end);
  /** "me" if it's mine to bank from my spot, "mate" if theirs, "fetch" if neither spot can bank it. */
  const owner = (w: Wisp): "me" | "mate" | "fetch" => {
    const a = bankable(home, w.pos), b = bankable(mateHome, w.pos);
    if (a && b) return mine(w.pos) || (along(w.pos) === 0 && me.id < mate.id) ? "me" : "mate";
    return a ? "me" : b ? "mate" : "fetch";
  };
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
    // Mine to bank from my spot; theirs only if they're elsewhere and can't reach it.
    // A wisp neither spot reaches is whoever's half it's on (a step or two inside the court
    // often banks it).
    const own = owner(w);
    if (own === "fetch" && !(mine(w.pos) || (along(w.pos) === 0 && me.id < mate.id))) continue;
    for (const s of court) {
      if (cheb(s, w.pos) > PULL_REACH || samePt(s, w.pos) || !board.canSee(s, w.pos)) continue;
      const { end, ticks } = simulatePull(board, s, w.pos, 30, g);
      if (!board.inBankZone(end)) continue;
      const cost = cheb(me.pos, s) + ticks + cheb(s, home) * 0.5 + (own === "mate" ? (mateReach(w.pos) ? 30 : 8) : 0);
      if (!best || cost < best.cost) best = { s, id: w.id, cost };
    }
  }
  if (best && best.cost < 30) {
    note(game, me.id, { intent: `bank wisp ${best.id} from ${off(game, best.s)}${theirs(game.wisps[best.id]!.pos) ? " (on partner's side)" : ""}` });
    return go(best.s, best.id);
  }

  // 2. Fetch: a wisp on my side that neither of us can bank from our spot. Go out for it and
  // pull it in until one of us can.
  let feed: { s: Pt; id: number; cost: number } | null = null;
  for (const w of game.wisps) {
    if (!live(w) || w.id === busy || owner(w) !== "fetch") continue;
    // On the middle line, the lower id goes for it.
    if (!(mine(w.pos) || (along(w.pos) === 0 && me.id < mate.id))) continue;
    for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
      for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
        const s = pt(w.pos.x + dx, w.pos.y + dy);
        if ((!dx && !dy) || !board.inside(s) || !board.passable(s, Mover.Walker) || board.tile(s) === Tile.Ice || !board.canSee(s, w.pos)) continue;
        const { end, ticks } = simulatePull(board, s, w.pos, 30, g);
        if (!mateReach(end) && !board.inBankZone(end) && !bankable(home, end) && !bankable(mateHome, end)) continue;
        // Staying in my half's court is best; stepping out costs more.
        const cost = cheb(me.pos, s) * (mine(s) && cheb(s, c) < inner ? 1 : 1.5) + ticks;
        if (!feed || cost < feed.cost) feed = { s, id: w.id, cost };
      }
  }
  if (feed) {
    note(game, me.id, { intent: `fetch wisp ${feed.id} from ${off(game, feed.s)} (out of reach of both spots)` });
    return go(feed.s, feed.id);
  }
  if (best) {
    note(game, me.id, { intent: `bank wisp ${best.id} from ${off(game, best.s)} (long one)` });
    return go(best.s, best.id);
  }
  note(game, me.id, { intent: `nothing to do: back to my spot ${off(game, home)}` });

  // 3. Nothing to do: back to my spot beside the brazier.
  if (!samePt(me.pos, home)) return go(home, -1);
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

function mateNames(game: Game, me: Game["players"][number]): string {
  return game.players.filter((p) => p.guild === me.guild && p.id !== me.id).map((p) => p.name).join(", ");
}
