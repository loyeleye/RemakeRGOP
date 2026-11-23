// Story run 1, the Grand Kindling: the pieces of play that aren't in a normal round.
//   - ringSpot: the tile Hesta's ring marks, where one pull banks a wisp (movement 1).
//   - crewCommand: a crew bot that fetches wisps and lets go once Rook can bank them, so it
//     never banks for itself (movement 2).
//   - neglected / compass: which wisp Lumi calls, and how she names it (movement 3).
// Every number that sets the feel lives in KINDLING at the top, so it is easy to change.

import { Mover, cheb, pt, samePt, type Board, type Pt } from "./board.js";
import { PULL_REACH, flingOffset, wispMove, type Command, type Game, type Wisp } from "./game.js";
import { bankDistances, simulatePull } from "./bot.js";

export const KINDLING = {
  /** The island the run is played on. */
  shrine: "fairy-ring",
  /** Ticks of bell and title before each movement. */
  bellTicks: 5,
  first: {
    title: "First light",
    /** One wisp at a time. */
    wisps: 1,
    /** Where wisps appear (tiles from the brazier). Fairy Ring's own band. */
    band: [6, 8] as [number, number],
    /** It ends after this many banks, or when the clock runs out. */
    banks: 5,
    ticks: 150,
  },
  relay: {
    title: "The relay",
    wisps: 4,
    /** Farther out than usual, so there is fetching for the crew to do. */
    band: [10, 14] as [number, number],
    ticks: 200,
    crew: ["Wick", "Moth"],
    /** How far a crew bot will walk to a feeding spot. */
    crewWalk: 14,
    /** A wisp this close to Rook is his to sort out: the crew leave it. */
    leaveNear: 3,
    /**
     * Coording: the second crew member holds a tile across the brazier from Rook and banks the
     * wisps on Rook's side (which Rook can't bank without changing sides). If Rook changes sides
     * more than `maxCrossings` times in `crossWindow` ticks, both go back to feeding him, until
     * he has stayed on one side for `settle` ticks.
     */
    split: { crossWindow: 40, maxCrossings: 2, settle: 20 },
  },
  crescendo: {
    title: "The crescendo",
    wisps: 3,
    band: [6, 10] as [number, number],
    ticks: 200,
    /** Lumi calls at most this often. */
    callEvery: 8,
    /** A wisp counts as neglected once he hasn't touched it for this many ticks. */
    neglectAfter: 16,
    /** A call he hasn't answered (touched the wisp) within this many ticks is a miss: she gives up on that wisp and calls another. She counts each wisp once. */
    answerWithin: 12,
    /** Ticks into an unanswered call when she says it again, with feeling. */
    repeatAfter: 6,
    /** Chance she concedes out loud ("...Fine. That one.") when he banks a different wisp. A bank elsewhere also counts her call as missed. */
    concede: 0.6,
  },
  /** Kes's island: a scripted score, a bank every so many ticks on average, per movement. */
  kesEvery: [16, 12, 12],
  /** Banks for a sky that's fully lit. */
  skyFull: 40,
} as const;

// ------------------------------------------------------------------ movement 1: the ring

/**
 * The tile to stand on so that one pull banks this wisp: in reach, in sight, and the pull's
 * flight ends on the rim. The cheapest one wins, counting the walk there (2 tiles a tick)
 * and how long the pull takes. Null if there's no such tile.
 */
export function ringSpot(board: Board, wisp: Pt, from: Pt): Pt | null {
  return oneSpot(board, wisp, from) ?? nearerSpot(board, wisp, from);
}

/** The tile whose pull brings the wisp nearest the rim, for when no one pull can bank it. */
function nearerSpot(board: Board, wisp: Pt, from: Pt): Pt | null {
  const dist = bankDistances(board);
  const at = (p: Pt) => dist[p.y * board.width + p.x]!;
  let best: { s: Pt; cost: number } | null = null;
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.x + dx, wisp.y + dy);
      if ((!dx && !dy) || !board.inside(s) || !board.passable(s, Mover.Walker) || board.inBankZone(s)) continue;
      if (!board.canSee(s, wisp)) continue;
      const { end } = simulatePull(board, s, wisp);
      if (at(end) >= at(wisp)) continue;
      const cost = at(end) * 2 + cheb(from, s) / 2;
      if (!best || cost < best.cost) best = { s, cost };
    }
  return best?.s ?? null;
}

function oneSpot(board: Board, wisp: Pt, from: Pt): Pt | null {
  let best: { s: Pt; cost: number } | null = null;
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.x + dx, wisp.y + dy);
      if ((!dx && !dy) || !board.inside(s) || !board.passable(s, Mover.Walker) || board.inBankZone(s)) continue;
      if (!board.canSee(s, wisp)) continue;
      const { end, ticks } = simulatePull(board, s, wisp);
      if (!board.inBankZone(end)) continue;
      const cost = ticks + cheb(from, s) / 2;
      if (!best || cost < best.cost) best = { s, cost };
    }
  return best?.s ?? null;
}

/** Does one pull from `from` bank a wisp sitting at `at`? */
export function banksFrom(board: Board, from: Pt, at: Pt): boolean {
  if (board.inBankZone(at)) return false;
  if (samePt(from, at) || cheb(from, at) > PULL_REACH || !board.canSee(from, at)) return false;
  return board.inBankZone(simulatePull(board, from, at).end);
}

// ------------------------------------------------------------------ movement 2: the crew

/** The tiles a wisp passes through, tick by tick, while pulled from `from` (until it stops or reaches the rim). */
export function pullPath(board: Board, from: Pt, start: Pt, maxTicks = 20): Pt[] {
  const out: Pt[] = [];
  let w = start;
  for (let t = 0; t < maxTicks; t++) {
    if (board.inBankZone(w) || cheb(from, w) > PULL_REACH || !board.canSee(from, w)) break;
    const off = flingOffset(from, w, "pull");
    if (!off.x && !off.y) break;
    const target = pt(w.x + off.x, w.y + off.y);
    const mv = wispMove(board, w, Math.sign(target.x - w.x), Math.sign(target.y - w.y), Math.abs(target.x - w.x), Math.abs(target.y - w.y));
    if (!mv || mv.bounce) break;
    w = pt(w.x + mv.step[0], w.y + mv.step[1]);
    out.push(w);
  }
  return out;
}

/** What a crew bot is up to, for the story's lines. */
export interface CrewState {
  /** The wisp it set out for. */
  wisp: number | null;
  /** Set on the tick it lets go of a wisp for Rook to bank. */
  fed: number | null;
  /** Wisps it gave up on, and until which tick. */
  skip: Map<number, number>;
  /** Set on the tick it lets go of a wisp near Rook: the story stops it where it is, so it can't drift onto the rim. */
  drop?: number | null;
}

/**
 * A crew bot's move. It goes for the nearest wisp nobody else is on, pulls it from the spot
 * that soonest brings it where Rook (wherever he stands) can bank it in one pull, and lets go
 * as soon as the wisp will come to rest there. It steps off any wisp Rook touches.
 */
export function crewCommand(game: Game, id: number, rookId: number, state: CrewState, others: CrewState[], scope: (w: Wisp) => boolean = () => true, finish?: Pt): Command | null {
  state.fed = null;
  state.drop = null;
  const me = game.players.find((p) => p.id === id);
  const rook = game.players.find((p) => p.id === rookId);
  if (!me || !rook) return null;
  const board = game.board;
  // Who finishes: Rook, or (for the partner feeding himself) a post across the brazier.
  const fin = finish ?? rook.pos;
  const live = (w: Wisp) => w.guild === me.guild && !board.inBankZone(w.pos);
  const rookOn = rook.action.kind === "staff" ? rook.action.wisp : null;
  const memo = new Map<string, boolean>();
  const ready = (at: Pt) => {
    const k = `${at.x},${at.y}`;
    let v = memo.get(k);
    if (v === undefined) memo.set(k, (v = banksFrom(board, fin, at)));
    return v;
  };
  // Where a wisp comes to rest if every staff lets go now.
  const rest = (w: Wisp) => w.target ?? w.pos;

  if (me.action.kind === "staff") {
    const w = game.wisps[me.action.wisp]!;
    if (w.id === rookOn || w.pullers.includes(rookId)) {
      state.wisp = null;
      return { action: { kind: "idle" } };
    }
    // Where it is now, or where it's heading: as soon as Rook can bank it, let go and leave it there.
    if (live(w) && (ready(w.pos) || ready(rest(w)))) {
      state.fed = state.drop = w.id;
      state.wisp = null;
      return { action: { kind: "idle" } };
    }
    if (live(w) && cheb(rest(w), fin) <= KINDLING.relay.leaveNear) {
      state.drop = w.id;
      state.wisp = null;
      return { action: { kind: "idle" } };
    }
    const stuck = me.beam === w.id && samePt(w.prev, w.pos) && !w.target;
    if (live(w) && !stuck) return null;
  }

  const taken = new Set(others.map((o) => o.wisp).filter((v): v is number => v !== null));
  // Not one that's already at Rook's feet, or one this bot gave up on a moment ago.
  const near = (w: Wisp) => cheb(rest(w), fin) <= KINDLING.relay.leaveNear;
  const skipped = (w: Wisp) => (state.skip.get(w.id) ?? -1) > game.tick;
  const targets = game.wisps.filter((w) => live(w) && scope(w) && w.id !== rookOn && !taken.has(w.id) && !ready(rest(w)) && !near(w) && !skipped(w));
  let target = targets.find((w) => w.id === state.wisp);
  if (!target) {
    target = targets.sort((a, b) => cheb(a.pos, me.pos) - cheb(b.pos, me.pos))[0];
    state.wisp = target?.id ?? null;
  }
  if (!target) {
    // Nothing to fetch: stand clear of Rook.
    return me.action.kind === "idle" ? null : { action: { kind: "idle" } };
  }
  const spot = feedSpot(game, me.pos, target.pos, ready, fin);
  if (!spot) {
    // No pull from anywhere helps: leave it a while and fetch another.
    state.skip.set(target.id, game.tick + 10);
    state.wisp = null;
    return me.action.kind === "idle" ? null : { action: { kind: "idle" } };
  }
  if (samePt(spot, me.pos)) return { action: { kind: "staff", wisp: target.id } };
  if (me.action.kind === "walk" && samePt(me.action.to, spot)) return null;
  return { action: { kind: "walk", to: spot } };
}

/**
 * The best tile to pull from: the pull's path reaches a tile Rook can bank from before it
 * touches the rim, and walking there plus the flight is quickest. With no such tile, the one
 * that brings the wisp nearest Rook without banking it.
 */
function feedSpot(game: Game, me: Pt, wisp: Pt, ready: (p: Pt) => boolean, rook: Pt): Pt | null {
  const board = game.board;
  let best: { s: Pt; cost: number } | null = null;
  for (let dy = -PULL_REACH; dy <= PULL_REACH; dy++)
    for (let dx = -PULL_REACH; dx <= PULL_REACH; dx++) {
      const s = pt(wisp.x + dx, wisp.y + dy);
      if ((!dx && !dy) || !board.inside(s) || !board.passable(s, Mover.Walker) || board.inBankZone(s)) continue;
      // Keep off Rook's tile and the ones next to it.
      if (cheb(s, rook) <= 1) continue;
      const walk = cheb(me, s);
      if (walk > KINDLING.relay.crewWalk || !board.canSee(s, wisp)) continue;
      const path = pullPath(board, s, wisp);
      let cost: number | null = null;
      for (let i = 0; i < path.length; i++) {
        if (board.inBankZone(path[i]!)) break;
        if (ready(path[i]!)) {
          cost = walk / 2 + i + 1;
          break;
        }
      }
      if (cost === null) {
        // A pull that would carry it onto the rim is the crew banking it: not theirs to do.
        if (path.some((p) => board.inBankZone(p))) continue;
        const end = path.at(-1);
        if (!end || cheb(end, rook) >= cheb(wisp, rook)) continue;
        cost = 100 + cheb(end, rook) * 3 + walk / 2;
      }
      if (!best || cost < best.cost) best = { s, cost };
    }
  return best?.s ?? null;
}

/** One half of the island: the side of a line through the brazier, across `axis`. */
export interface Half {
  axis: "x" | "y";
  side: 1 | -1;
}

/** The half a tile is in: along whichever axis it is further from the brazier on. */
export function halfOf(board: Board, p: Pt): Half {
  const dx = p.x - board.center.x, dy = p.y - board.center.y;
  return Math.abs(dx) >= Math.abs(dy) ? { axis: "x", side: dx < 0 ? -1 : 1 } : { axis: "y", side: dy < 0 ? -1 : 1 };
}

/** How far into the half a tile is (negative: across the line, on the far side). */
export function depthIn(board: Board, h: Half, p: Pt): number {
  return h.side * (h.axis === "x" ? p.x - board.center.x : p.y - board.center.y);
}

/** The free floor tile nearest the point across the brazier from `p`: where a partner stands to cover Rook's blind side. */
export function acrossFrom(board: Board, p: Pt): Pt {
  const c = board.center;
  const m = pt(2 * c.x - p.x, 2 * c.y - p.y);
  for (let r = 0; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const q = pt(m.x + dx, m.y + dy);
        if (board.inside(q) && board.passable(q, Mover.Walker) && !board.inBankZone(q)) return q;
      }
  return m;
}

/**
 * The partner who coords with Rook, the way two players work an altar: he holds a tile across
 * the brazier from Rook and banks the wisps on Rook's side, the ones Rook can't bring home
 * without changing sides. Wisps on his own side are Rook's. Undefined: nothing for him to bank
 * from his post, so he can fetch for Rook instead.
 */
export function partnerCommand(game: Game, id: number, rookId: number, state: CrewState, post: Pt, mine: (w: Wisp) => boolean): Command | null | undefined {
  state.fed = null;
  state.drop = null;
  const me = game.players.find((p) => p.id === id);
  const rook = game.players.find((p) => p.id === rookId);
  if (!me || !rook) return null;
  const board = game.board;
  const live = (w: Wisp) => w.guild === me.guild && !board.inBankZone(w.pos);
  const rookOn = rook.action.kind === "staff" ? rook.action.wisp : null;
  const rest = (w: Wisp) => w.target ?? w.pos;
  if (me.action.kind === "staff") {
    const w = game.wisps[me.action.wisp]!;
    if (w.id === rookOn || w.pullers.includes(rookId)) {
      state.wisp = null;
      return { action: { kind: "idle" } };
    }
    const stuck = me.beam === w.id && samePt(w.prev, w.pos) && !w.target;
    // Banking from the post: hold it until it's home.
    if (live(w) && !stuck && state.wisp === w.id && samePt(me.pos, post)) return null;
  }
  const targets = game.wisps.filter((w) => live(w) && w.id !== rookOn && mine(w) && banksFrom(board, post, rest(w)));
  if (!targets.length) {
    state.wisp = null;
    return undefined;
  }
  if (!samePt(me.pos, post)) {
    if (me.action.kind === "walk" && samePt(me.action.to, post)) return null;
    return { action: { kind: "walk", to: post } };
  }
  const w = targets.sort((a, b) => cheb(a.pos, post) - cheb(b.pos, post))[0]!;
  state.wisp = w.id;
  return { action: { kind: "staff", wisp: w.id } };
}

// ------------------------------------------------------------------ movement 3: Lumi's calls

/**
 * The wisp Rook is neglecting: the one he has gone longest without touching, if that's at
 * least `after` ticks and he isn't working it now. `lastTouch` maps wisp id to the tick he
 * last touched it (or when it appeared).
 */
export function neglected(game: Game, rookId: number, lastTouch: Map<number, number>, after: number, skip: (id: number) => boolean = () => false): Wisp | null {
  const rook = game.players.find((p) => p.id === rookId);
  if (!rook) return null;
  const on = rook.action.kind === "staff" ? rook.action.wisp : null;
  let pick: Wisp | null = null;
  let age = after - 1;
  for (const w of game.wisps) {
    if (w.id === on || skip(w.id) || game.board.inBankZone(w.pos)) continue;
    const a = game.tick - (lastTouch.get(w.id) ?? game.tick);
    if (a > age) [pick, age] = [w, a];
  }
  return pick;
}

/** "North", "south-east" and so on: where a tile is from the brazier (north is up the board). */
export function compass(board: Board, p: Pt): string {
  const c = board.center;
  const a = Math.atan2(-(p.y - c.y), p.x - c.x);
  const names = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
  return names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]!;
}

const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const numberWord = (n: number) => WORDS[n] ?? String(n);
