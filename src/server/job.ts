// Story run 4, A job, played in the page like the other runs. The player is Rook; Lumi is his
// partner on the board. He sends her to a tile with a tap (run 2's call turned round), and she
// works from there: she tears the moss round her and pulls their wisps in toward her spot.
// Left alone she plays as she likes, drawn to the far, exciting wisp. Two stops, each with a
// count and a clock; running out restarts that stop at once, with one line.
//   1. Moss Hollow: the wisps come up behind a moss thicket. Send her to clear the way.
//   2. Tidepool Steps: most come up on the pools. Where she is sent decides which way her tide
//      pull draws them, and the clocked tide decides how fast (see TIDE_AGAINST).
// Numbers are in JOB (src/engine/job.ts).

import { Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { BOT_MEDIUM, botCommand } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, tideIn, type Action, type Guild, type Wisp } from "../engine/game.js";
import { JOB } from "../engine/job.js";
import { VOICE_SECONDS } from "../engine/voice-durations.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { realClock, type Clock } from "./room.js";

export const ROOK_ID = 1;
export const LUMI_ID = 2;
const KEEPER_ID = 3;
const ROOK = "Rook";
const LUMI = "Lumi";
const HESTA = "Hesta";

type Stop = (typeof JOB.stops)[number];

export class JobRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private stopN = 0;
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  /** Where Lumi was sent last, if anywhere this stop. */
  private sentTo: Pt | null = null;
  /** For tuning: sends this stop and this run, restarts, and how many banked wisps started on water. */
  private sends = 0;
  private allSends = 0;
  private restarts = 0;
  private fromWater = 0;
  private wet = new Set<number>();
  private turnSaid = false;
  private backSaid = false;
  private hintSaid = false;
  private farFor = 0;
  private lastBark = -99;
  private barked = new Set<string>();
  /** Wisps Lumi has had hold of since they last came up (for "That one was mine."). */
  private lumiHeld = new Set<number>();
  /** The closing lines are playing: the board is still, and the results come at this tick. */
  private outroUntil = -1;
  private outroTick = 0;
  /** Lumi re-taps a wisp the moss is holding (a fresh tap tears at it). */
  private lumiStuck = 0;
  private lastSent = -1;

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
    /** Tests: a bot plays Rook. */
    private autoRook = false,
  ) {
    this.rng = new Rng(this.seed());
  }

  connect(send: (m: ServerMsg) => void) {
    return {
      message: (raw: string) => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(raw) as ClientMsg;
        } catch {
          return;
        }
        this.handle(msg, send);
      },
      close: () => {
        this.send = null;
        this.endClock();
      },
    };
  }

  private handle(msg: ClientMsg, send: (m: ServerMsg) => void) {
    switch (msg.t) {
      case "ping":
        return send({ t: "pong", at: Number(msg.at) || 0 });
      case "hello":
        this.send = send;
        send({ t: "welcome", you: ROOK_ID, token: "" });
        return this.begin();
      case "lobby":
        if (this.phase === "results") this.begin();
        return;
      case "act": {
        if (this.phase !== "playing") return;
        const action = cleanAction(msg.action, this.game);
        this.game.command(ROOK_ID, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
      case "call":
        if (this.phase === "playing") this.sendLumi(pt(Math.floor(Number(msg.x)), Math.floor(Number(msg.y))));
        return;
    }
  }

  begin() {
    this.end = undefined;
    this.restarts = this.allSends = 0;
    this.rng = new Rng(this.seed());
    this.startStop(0, false);
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  private get S(): Stop {
    return JOB.stops[this.stopN]!;
  }

  /** Start a stop, from its bell, or at once after a miss. */
  private startStop(n: number, again: boolean) {
    this.stopN = n;
    const S = this.S;
    const shrine = shrineById(S.shrine);
    const c = shrine.board.center;
    const at = (o: { x: number; y: number }) => pt(c.x + o.x, c.y + o.y);
    const roster = [
      { id: ROOK_ID, guild: 0 as Guild, name: ROOK },
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
      { id: KEEPER_ID, guild: 1 as Guild, name: S.keeper },
    ];
    // The clock is the stop's own; the game's never runs out first.
    this.game = new Game(shrine, roster, this.seed(), [S.wisps, 0], S.ticks + 10);
    const g = this.game;
    g.tideStaysWet = true;
    this.sentTo = null;
    this.sends = this.fromWater = this.lumiStuck = 0;
    this.wet.clear();
    this.turnSaid = this.backSaid = this.hintSaid = false;
    this.farFor = 0;
    this.lastBark = -99;
    this.lumiHeld.clear();
    const put = (id: number, o: { x: number; y: number }) => {
      const p = this.player(id);
      p.pos = p.prev = this.open(at(o));
    };
    put(ROOK_ID, S.rook);
    put(LUMI_ID, S.lumiStart);
    put(KEEPER_ID, S.keeperAt);
    this.player(KEEPER_ID).run = false;
    if (n === 0) this.thicket();
    // Where each wisp comes up, and again each time one is banked.
    g.onReturn = (w) => {
      this.lumiHeld.delete(w.id);
      this.respawn(w);
    };
    for (const w of g.wisps) if (w.guild === 0) this.respawn(w);
    this.phase = "countdown";
    this.countdown = again ? JOB.restartTicks : JOB.bellTicks;
    if (!again) this.opening();
    this.flush();
    this.broadcastRoom();
    this.broadcastTick();
  }

  /** Moss Hollow's thicket: a moss wall east of the fire, between Rook and where the wisps come up. */
  private thicket() {
    const S = JOB.stops[0], g = this.game, c = g.board.center;
    for (const dx of S.wall) for (let dy = S.rows[0]; dy <= S.rows[1]; dy++) g.addMoss(pt(c.x + dx, c.y + dy));
  }

  /** Where a wisp of theirs comes up: behind the thicket, or (at the Steps) mostly on a pool. */
  private respawn(w: Wisp) {
    if (w.guild !== 0) return;
    const g = this.game, b = g.board, c = b.center;
    const free = (p: Pt) => !g.wisps.some((o) => o !== w && samePt(o.pos, p)) && !g.players.some((q) => samePt(q.pos, p));
    let spots: Pt[] = [];
    if (this.stopN === 0) {
      const S = JOB.stops[0];
      for (let dy = S.rows[0]; dy <= S.rows[1]; dy++)
        for (let dx = S.spawnX[0]; dx <= S.spawnX[1]; dx++) {
          const p = pt(c.x + dx, c.y + dy);
          if (b.tile(p) === Tile.Floor && free(p)) spots.push(p);
        }
    } else {
      const S = JOB.stops[1];
      const pools = g.shrine.poolField.filter((p) => b.tile(p) === Tile.Water && free(p) && Math.abs(p.x - c.x) >= JOB.stops[1].poolDx);
      if (this.banked() >= S.lateFrom && this.sentTo) {
        // Near the end: the pool on the far side of the fire from where she was sent last.
        const side = Math.sign(this.sentTo.x - c.x) || 1;
        spots = pools.filter((p) => Math.sign(p.x - c.x) === -side);
      } else if (this.rng.next() < S.poolShare) spots = pools;
    }
    if (!spots.length) return;
    const p = spots[Math.floor(this.rng.next() * spots.length)]!;
    w.pos = w.prev = p;
    w.target = null;
    w.holder = null;
    w.grip = Grip.Free;
    w.rimTicks = 0;
    if (b.tile(p) === Tile.Water) this.wet.add(w.id);
    else this.wet.delete(w.id);
  }

  /** Hesta's route line, and the keeper's greeting, at the bell. */
  private opening() {
    const S = this.S;
    this.say(HESTA, S.lines.route, { talk: true });
    for (const l of S.lines.greet) this.say(S.keeper, l, { player: KEEPER_ID });
    if (this.stopN === 0) {
      this.say(LUMI, JOB.stops[0].lines.lumiGreet, { player: LUMI_ID });
      this.say(LUMI, JOB.lines.lumiStart, { player: LUMI_ID });
    }
  }

  /** One of Lumi's work barks: once each, and never close on another. */
  private bark(text: string, once = true) {
    const t = this.game.tick;
    if ((once && this.barked.has(text)) || t - this.lastBark < JOB.lumi.barkGap) return;
    this.barked.add(text);
    this.lastBark = t;
    this.say(LUMI, text, { player: LUMI_ID });
  }

  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) this.phase = "playing";
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing") return;
    const g = this.game;
    if (this.outroUntil >= 0) {
      if (++this.outroTick >= this.outroUntil) this.finish();
      return;
    }
    if (this.autoRook) {
      const cmd = botCommand(g, ROOK_ID, BOT_MEDIUM, () => this.rng.next());
      if (cmd) g.command(ROOK_ID, cmd);
    }
    this.steerLumi();
    g.step();
    for (const b of g.banks) {
      if (b.guild !== 0) continue;
      if (this.wet.has(b.wisp)) this.fromWater++;
      if (this.lumiHeld.has(b.wisp)) this.bark(JOB.lines.mine, false);
    }
    this.notice();
    const S = this.S;
    if (this.banked() >= S.goal) {
      if (this.stopN === 0) {
        this.say(S.keeper, JOB.stops[0].lines.done, { player: KEEPER_ID });
        this.startStop(1, false);
      } else this.outro();
    } else if (g.tick >= S.ticks) this.again();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  /** Hesta's tide calls, her one hint, and Lumi's barks as she works. */
  private notice() {
    const g = this.game, me = this.player(LUMI_ID), c = g.board.center;
    if (me.beam !== null) this.lumiHeld.add(me.beam);
    if (!this.sends && g.tick >= JOB.lumi.unsentFor) this.bark(JOB.lines.unsent);
    if (this.stopN !== 1) return;
    const L = JOB.stops[1].lines, tide = g.shrine.gimmicks.tide ?? 20;
    const inNow = tideIn(g.tick, tide);
    if (!this.turnSaid && !inNow) {
      this.turnSaid = true;
      this.say(HESTA, L.turned);
    } else if (this.turnSaid && !this.backSaid && inNow) {
      this.backSaid = true;
      this.say(HESTA, L.back);
    }
    // Her tide pull at work: the pool's loose wisps on the move to her.
    const held = me.beam !== null ? g.wisps[me.beam] : undefined;
    const drawing = !!this.sentTo && !!held && g.drifting > 0;
    if (drawing) {
      const late = this.banked() >= JOB.stops[1].lateFrom;
      if (late && held && Math.sign(held.pos.x - c.x) === Math.sign(me.pos.x - c.x) && cheb(me.pos, c) < cheb(held.pos, c)) this.bark(JOB.lines.thisSide);
      else this.bark(JOB.lines.coming);
    }
    // Sent to a pool's far bank: they go the wrong way. One hint, never near the end.
    const far = !!this.sentTo && Math.abs(this.sentTo.x - c.x) > JOB.stops[1].poolDx + 4;
    this.farFor = far ? this.farFor + 1 : 0;
    if (!this.hintSaid && this.farFor >= JOB.farBankFor && this.banked() < JOB.stops[1].lateFrom) {
      this.hintSaid = true;
      this.say(HESTA, L.fireSide);
    }
  }

  private banked() {
    return this.game.scores[0]!;
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  /** The nearest tile a lamplighter can stand on to `at`. */
  private open(at: Pt): Pt {
    const b = this.game.board;
    for (let r = 0; r < 8; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const q = pt(at.x + dx, at.y + dy);
          if (b.inside(q) && b.passable(q, Mover.Walker) && !this.game.players.some((p) => samePt(p.pos, q))) return q;
        }
    return at;
  }

  // ---------------------------------------------------------------- Lumi

  /** Rook sends her to a tile: she says so in a bubble and goes. No budget. */
  sendLumi(to: Pt) {
    const g = this.game, b = g.board;
    if (!b.inside(to) || b.tile(to) === Tile.Edge) return;
    const spot = b.passable(to, Mover.Walker) ? to : this.open(to);
    this.sentTo = spot;
    this.sends++;
    this.allSends++;
    // A different one each time, never the same twice running.
    const barks = JOB.lines.sent;
    const k = (this.lastSent + 1 + Math.floor(this.rng.next() * (barks.length - 1))) % barks.length;
    this.lastSent = k;
    this.say(LUMI, barks[k]!, { player: LUMI_ID });
    g.command(LUMI_ID, { action: { kind: "walk", to: spot } });
    this.flush();
    this.broadcastRoom();
  }

  private steerLumi() {
    const g = this.game, me = this.player(LUMI_ID);
    const cmd = (action: Action) => g.command(LUMI_ID, { action, toggleMode: me.mode !== "pull" || undefined });
    // Her tide pull is work: it's on where she's been sent, not while she plays about.
    g.tidePuller = this.sentTo ? LUMI_ID : null;
    if (!this.sentTo) return this.lumiFree();
    // On her way.
    if (!samePt(me.pos, this.sentTo)) {
      if (me.action.kind !== "walk") cmd({ kind: "walk", to: this.sentTo });
      return;
    }
    // There: first the moss round her, a tear a tick.
    const moss = this.nearMoss(me.pos, JOB.lumi.clearReach);
    if (moss) {
      g.tearMoss(moss);
      this.bark(JOB.lines.moss);
      if (me.action.kind !== "idle") cmd({ kind: "idle" });
      return;
    }
    // Then their wisps: the nearest she can bring in toward her spot (wet ones first at the Steps).
    const w = this.lumiPick();
    if (!w) {
      if (me.action.kind !== "idle") cmd({ kind: "idle" });
      return;
    }
    const holding = me.action.kind === "staff" && me.action.wisp === w.id;
    // Held back (moss, or nothing moving): a fresh tap.
    this.lumiStuck = holding && !w.target && samePt(w.pos, w.prev) && g.board.tile(w.pos) !== Tile.Water ? this.lumiStuck + 1 : 0;
    if (!holding || this.lumiStuck >= 2) {
      this.lumiStuck = 0;
      cmd({ kind: "staff", wisp: w.id });
    }
  }

  /** The wisp she works from where she stands, or null. */
  private lumiPick(): Wisp | null {
    const g = this.game, me = this.player(LUMI_ID), b = g.board;
    const c = b.center, rook = this.player(ROOK_ID);
    // Only ones further out than she is (pulled to her, they come in), and not one Rook has hold of.
    const reachable = g.wisps.filter(
      (w) => w.guild === 0 && !b.inBankZone(w.pos) && !g.away.has(w.id) && (cheb(w.pos, c) > cheb(me.pos, c) || (this.stopN === 1 && b.tile(w.pos) === Tile.Water)) && !(rook.action.kind === "staff" && rook.action.wisp === w.id) && g.inReach({ ...me, mode: "pull" }, w),
    );
    // Not one already at her feet (it won't come any closer), unless it's all there is.
    const useful = reachable.filter((w) => cheb(w.pos, me.pos) > 1);
    const pool = useful.length ? useful : [];
    const wet = this.stopN === 1 ? pool.filter((w) => b.tile(w.pos) === Tile.Water) : [];
    const from = wet.length ? wet : pool;
    return from.sort((a, c) => cheb(a.pos, me.pos) - cheb(c.pos, me.pos))[0] ?? null;
  }

  /** Left alone: busy, and drawn to the far, exciting wisp. Not bad, just not where she's needed. */
  private lumiFree() {
    const g = this.game, me = this.player(LUMI_ID), c = g.board.center;
    const mine = g.wisps.filter((w) => w.guild === 0 && !g.board.inBankZone(w.pos) && !g.away.has(w.id));
    // The pools don't interest her yet: the ground ones out far do.
    const dry = mine.filter((w) => g.board.tile(w.pos) !== Tile.Water);
    const far = dry.sort((a, b) => cheb(b.pos, c) - cheb(a.pos, c))[0];
    if (!far) {
      // Nothing out far on the ground: off she goes to look, along the rim of the island.
      if (me.action.kind !== "walk") {
        const b = g.board;
        for (let tries = 0; tries < 20; tries++) {
          const a = this.rng.next() * Math.PI * 2, r = 9 + this.rng.next() * 4;
          const to = pt(Math.round(c.x + Math.cos(a) * r * 1.4), Math.round(c.y + Math.sin(a) * r * 0.8));
          if (b.inside(to) && b.passable(to, Mover.Walker)) return void g.command(LUMI_ID, { action: { kind: "walk", to } });
        }
      }
      return;
    }
    if (me.action.kind === "staff" && me.action.wisp === far.id) {
      // A fresh tap now and then, so the moss gives way for her too.
      if (g.tick % 3 === 0 && samePt(far.pos, far.prev) && !far.target) g.command(LUMI_ID, { action: { kind: "staff", wisp: far.id } });
      return;
    }
    g.command(LUMI_ID, { action: { kind: "staff", wisp: far.id }, toggleMode: me.mode !== "pull" || undefined });
  }

  private nearMoss(at: Pt, r: number): Pt | null {
    const b = this.game.board;
    let best: Pt | null = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const q = pt(at.x + dx, at.y + dy);
        if (b.inside(q) && b.tile(q) === Tile.Moss && Math.hypot(dx, dy) < bestD) (best = q), (bestD = Math.hypot(dx, dy));
      }
    return best;
  }

  // ---------------------------------------------------------------- misses and the end

  /** Out of time: one line, and straight back into the same stop. */
  private again() {
    this.restarts++;
    this.say(HESTA, this.S.lines.again, { talk: true });
    this.startStop(this.stopN, true);
  }

  /** Both stops done: the board holds still while Marit pays and thanks them, then the results. */
  private outro() {
    let secs = 0;
    for (const [who, text] of JOB.lines.thanks) {
      this.say(who, text, { talk: true });
      secs += (VOICE_SECONDS[`${who}|${text}`] ?? 0.9 + text.length * 0.055) + 0.7;
    }
    this.outroTick = 0;
    this.outroUntil = Math.ceil((secs * 1000) / TICK_MS) + JOB.outroTail;
  }

  private finish() {
    this.phase = "results";
    this.outroUntil = -1;
    this.end = {
      banked: this.banked(),
      kes: 0,
      summary: `Two jobs done: Moss Hollow and Tidepool Steps.${this.restarts ? ` ${this.restarts} ${this.restarts === 1 ? "restart" : "restarts"}.` : ""} Lumi sent ${this.allSends} ${this.allSends === 1 ? "time" : "times"}.`,
      lines: [],
    };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}) {
    this.lines.push({ who, text, ...how });
  }

  private flush() {
    if (!this.lines.length) return;
    const lines = this.lines;
    this.lines = [];
    this.send?.({ t: "say", lines });
  }

  private endClock() {
    this.stop?.();
    this.stop = null;
  }

  private note(): string | undefined {
    if (this.phase === "countdown") return undefined;
    const g = this.game, S = this.S;
    const left = Math.max(0, S.ticks - g.tick);
    const tide = g.shrine.gimmicks.tide;
    const t = tide ? ` · tide ${tideIn(g.tick + 1, tide) ? "coming in" : "going out"} (${tide - ((g.tick + 1) % tide)})` : "";
    return `${this.banked()}/${S.goal} banked · ${left} ticks${t}`;
  }

  storyView(): StoryView {
    return {
      run: JOB.run,
      movement: this.stopN,
      title: this.S.title,
      ring: null,
      mark: null,
      kes: 0,
      rival: null,
      note: this.note(),
      canCall: this.phase === "playing" && this.outroUntil < 0,
      callWho: LUMI,
      called: this.sentTo,
      end: this.end,
    };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: this.phase,
      host: ROOK_ID,
      shrine: this.S.shrine,
      teams: 2,
      players: [
        { id: ROOK_ID, name: ROOK, guild: 0, flame: "amber", connected: true, bot: false },
        { id: LUMI_ID, name: LUMI, guild: 0, flame: "frost", connected: true, bot: true },
        { id: KEEPER_ID, name: this.S.keeper, guild: 1, flame: "amber", connected: true, bot: true },
      ],
      countdown: this.countdown,
      lastScores: this.end ? [this.end.banked, 0] : null,
      roundTicks: this.S.ticks,
      story: this.storyView(),
    };
  }

  private broadcastRoom() {
    this.send?.({ t: "room", room: this.view() });
  }

  private broadcastTick() {
    this.send?.({ t: "room", room: this.view() });
    this.send?.({ t: "tick", snap: this.game.snapshot(), tickMs: TICK_MS });
  }

  /** For tests. */
  get state() {
    return { phase: this.phase, stop: this.stopN, game: this.game, sends: this.sends, allSends: this.allSends, restarts: this.restarts, fromWater: this.fromWater, sentTo: this.sentTo, end: this.end };
  }
}

function cleanAction(raw: unknown, game: Game): Action | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (a.kind === "idle") return { kind: "idle" };
  if (a.kind === "staff" && Number.isInteger(a.wisp) && (a.wisp as number) >= 0 && (a.wisp as number) < game.wisps.length) return { kind: "staff", wisp: a.wisp as number };
  if (a.kind === "walk" && a.to && typeof a.to === "object") {
    const { x, y } = a.to as Record<string, unknown>;
    if (Number.isInteger(x) && Number.isInteger(y) && game.board.inside(pt(x as number, y as number))) return { kind: "walk", to: { x: x as number, y: y as number } };
  }
  return undefined;
}
