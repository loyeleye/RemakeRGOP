// Arc 1 Part 2, piece 2: run 2, the crew's brazier (engine/run2.ts has the place, the numbers and the
// words). A standard run with no clock and no way to lose: Rook and three of the crew pull for one
// brazier; past warm only his lights take, a crew light at the rim fizzes out uncounted, and the crew
// bring him lights to finish instead. On the sixteenth bank control is taken from the player: Rook
// walks for the cart, the lines of light run under his boots, the cage lights, and two of the crew take
// his arms. No results screen: the walk's `done` hands on to the next piece.

import { pt, type Pt } from "../engine/board.js";
import { BOT_MEDIUM, botCommand } from "../engine/bot.js";
import { Game, TICK_MS, type Guild } from "../engine/game.js";
import { crewCommand, type CrewState } from "../engine/kindling.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { RUN2 } from "../engine/run2.js";
import type { CampLine } from "../engine/camp.js";
import { cleanAction } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const ROOK_ID = 1;
/** The crew's ids, in RUN2.people's order. */
const ID: Record<string, number> = Object.fromEntries(RUN2.people.map((p, i) => [p.key, 2 + i]));
const PULLERS = RUN2.people.filter((p) => "pulls" in p).map((p) => ID[p.key]!);

type Run2 = NonNullable<StoryView["run2"]>;

export class Run2Room {
  private send: ((m: ServerMsg) => void) | null = null;
  private game!: Game;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private s = 1;
  /** Banks that counted, and the crew's that fizzed past warm (with the tick and where). */
  private filled = 0;
  private fizz: { tick: number; x: number; y: number } | null = null;
  private fizzed = 0;
  /** Who last pulled each light, so a bank knows whose it was. */
  private lastPull = new Map<number, number>();
  private crew = new Map<number, CrewState>();
  /** Barks: the next tick one is due, the last said and by whom, and the tick of the last line of any kind. */
  private nextBark = RUN2.bark.first;
  private lastBark = -1;
  private lastBarker = -1;
  private lastLine = -99;
  /** The ending: the tick it began, his steps since, when the lines ran and the bars lit, when both had him, and done. */
  private end: { at: number; steps: number; from: Pt; lines?: number; lit?: number; held?: number; done?: true } | null = null;
  /** Rook's banks, for tests. */
  private rookBanks = 0;

  /** Played as part of Part 2's chain: the end hands on to the page. */
  chain = false;
  /** For the screenshot scripts: an average player's bot plays Rook. */
  auto = false;
  beatMs = TICK_MS;

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
  ) {}

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
      case "act": {
        // Once it is full he is not the player's any more.
        if (this.end) return;
        const action = cleanAction(msg.action, this.game);
        this.game.command(ROOK_ID, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  begin() {
    const shrine = shrineById(RUN2.shrine);
    const roster = [{ id: ROOK_ID, guild: 0 as Guild, name: "Rook" }, ...RUN2.people.map((p) => ({ id: ID[p.key]!, guild: 0 as Guild, name: p.name }))];
    // No clock: it ends when the brazier is full.
    this.game = new Game(shrine, roster, this.seed(), [RUN2.wisps, 0], 1e9);
    this.game.respawnPause = RUN2.respawnPause;
    this.s = this.seed() || 1;
    const c = this.game.board.center;
    const put = (id: number, at: readonly [number, number]) => {
      const p = this.player(id);
      p.pos = p.prev = pt(c.x + Math.round(at[0]), c.y + Math.round(at[1]));
    };
    put(ROOK_ID, RUN2.rook);
    for (const p of RUN2.people) put(ID[p.key]!, p.at);
    this.filled = this.fizzed = this.rookBanks = 0;
    this.fizz = this.end = null;
    this.lastPull.clear();
    this.crew = new Map(PULLERS.map((id) => [id, { wisp: null, fed: null, drop: null, skip: new Map() }]));
    this.nextBark = RUN2.bark.first;
    this.lastBark = this.lastBarker = -1;
    this.lastLine = -99;
    this.restartClock(TICK_MS);
    this.broadcast();
  }

  private restartClock(ms: number) {
    this.endClock();
    this.beatMs = ms;
    this.stop = this.clock.every(ms, () => this.onTick());
  }

  onTick() {
    const g = this.game;
    if (this.end?.done) return;
    if (this.end) this.ending();
    else {
      if (this.auto) {
        const cmd = botCommand(g, ROOK_ID, BOT_MEDIUM, () => this.rand());
        if (cmd) g.command(ROOK_ID, cmd);
      }
      this.pull();
    }
    const was = new Map(g.wisps.map((w) => [w.id, { x: w.pos.x, y: w.pos.y }]));
    g.step();
    for (const p of g.players) if (p.action.kind === "staff") this.lastPull.set(p.action.wisp, p.id);
    if (!this.end) this.count(was);
    this.broadcast();
  }

  // ------------------------------------------------------------------ the run

  private rand() {
    this.s = (this.s * 48271) % 2147483647;
    return this.s / 2147483647;
  }

  /** The crew pull for it, badly; past warm they bring him lights instead, and dawdle. */
  private pull() {
    const g = this.game, warm = this.filled >= RUN2.warm;
    for (const id of PULLERS) {
      let cmd;
      if (warm) {
        if (this.rand() < RUN2.dawdle) continue;
        const st = this.crew.get(id)!;
        cmd = crewCommand(g, id, ROOK_ID, st, [...this.crew.values()].filter((x) => x !== st));
      } else cmd = botCommand(g, id, RUN2.crew, () => this.rand());
      if (cmd) g.command(id, cmd);
    }
  }

  private count(was: Map<number, { x: number; y: number }>) {
    const g = this.game;
    for (const b of g.banks) {
      const who = this.lastPull.get(b.wisp) ?? 0;
      this.lastPull.delete(b.wisp);
      // Past warm a crew light gutters at the rim and does not count (it comes back out like any other).
      if (who !== ROOK_ID && this.filled >= RUN2.warm) {
        this.fizzed++;
        this.fizz = { tick: g.tick, ...(was.get(b.wisp) ?? g.board.center) };
        continue;
      }
      if (who === ROOK_ID) this.rookBanks++;
      this.filled++;
      for (const o of RUN2.outrider) if (o.at === this.filled) this.say(o.line);
      if (RUN2.lampHand.at === this.filled) this.say(RUN2.lampHand.line);
      if (this.filled >= RUN2.banks) return this.full();
    }
    this.barks();
  }

  /** A crew bark now and then, from one of the three pulling, never the same line twice running. */
  private barks() {
    const g = this.game, B = RUN2.bark;
    if (g.tick < this.nextBark || g.tick - this.lastLine < B.quiet) return;
    const warm = this.filled >= RUN2.warm;
    const pool = RUN2.barks.map((_, i) => i).filter((i) => i !== this.lastBark && (warm || i !== 0));
    const i = pool[Math.floor(this.rand() * pool.length)]!;
    const by = PULLERS.filter((id) => id !== this.lastBarker);
    const id = by[Math.floor(this.rand() * by.length)]!;
    this.lastBark = i;
    this.lastBarker = id;
    this.nextBark = g.tick + B.every[0] + Math.floor(this.rand() * (B.every[1] - B.every[0]));
    this.say({ who: this.player(id).name, text: RUN2.barks[i]! });
  }

  // ------------------------------------------------------------------ how it ends

  /** Full: the crew cheer, and he is already walking for the cart at his fast, unnoticed walk. */
  private full() {
    const g = this.game, rook = this.player(ROOK_ID);
    this.end = { at: g.tick, steps: 0, from: rook.pos };
    for (const id of PULLERS) g.command(id, { action: { kind: "idle" } });
    g.stride.set(ROOK_ID, RUN2.end.stride);
    rook.run = false;
    this.walk(ROOK_ID, this.tile(RUN2.end.held));
  }

  private ending() {
    const g = this.game, e = this.end!, E = RUN2.end, rook = this.player(ROOK_ID);
    rook.run = false;
    if (rook.pos.x !== rook.prev.x || rook.pos.y !== rook.prev.y) e.steps++;
    // On his second step the lines run from the rim to the cart's door; when they reach it the bars light.
    if (e.lines === undefined && e.steps >= E.linesAfterSteps) e.lines = g.tick;
    if (e.lines !== undefined && e.lit === undefined && (g.tick - e.lines) * this.beatMs >= E.linesSec * 1000) {
      e.lit = g.tick;
      // Two of the crew close in from the sides.
      for (const h of E.holders) this.walk(ID[h.key]!, this.tile(h.at));
    }
    const at = (id: number, q: readonly [number, number]) => {
      const p = this.player(id).pos, t = this.tile(q);
      return p.x === t.x && p.y === t.y;
    };
    if (e.lit !== undefined && e.held === undefined && at(ROOK_ID, E.held) && E.holders.every((h) => at(ID[h.key]!, h.at))) e.held = g.tick;
    if (e.held !== undefined && (g.tick - e.held) * this.beatMs >= E.holdSec * 1000) {
      e.done = true;
      this.endClock();
    }
    // If anyone is stuck, the picture still holds and goes on (a few seconds' grace past the lines).
    if (e.lit !== undefined && e.held === undefined && (g.tick - e.lit) * this.beatMs > 8000) e.held = g.tick;
  }

  // ------------------------------------------------------------------ board

  private tile(at: readonly [number, number]): Pt {
    const c = this.game.board.center;
    return pt(Math.round(c.x + at[0]), Math.round(c.y + at[1]));
  }

  private walk(id: number, to: Pt) {
    this.game.command(id, { action: { kind: "walk", to } });
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  // ------------------------------------------------------------------ wire

  private say(l: CampLine) {
    const id = RUN2.people.find((p) => p.name === l.who) ? ID[RUN2.people.find((p) => p.name === l.who)!.key]! : -1;
    // All of run 2's words are the story thread's drafts.
    this.lines.push({ who: l.who, text: l.text, player: id, quiet: true, ...(l.final ? {} : { draft: true }) });
    this.lastLine = this.game.tick;
  }

  private flush() {
    if (!this.lines.length) return;
    const lines = this.lines;
    this.lines = [];
    this.send?.({ t: "say", lines });
  }

  private broadcast() {
    this.flush();
    this.send?.({ t: "room", room: this.view() });
    this.send?.({ t: "tick", snap: this.game.snapshot(), tickMs: this.beatMs });
  }

  private endClock() {
    this.stop?.();
    this.stop = null;
  }

  /** Outrider watches Rook from the rim; the cook stands by the cart. */
  private looks() {
    const rook = this.player(ROOK_ID).pos, cart = this.tile([-3, 8]);
    const out = [{ id: ID.outrider!, x: rook.x, y: rook.y }];
    if (!this.end?.lit) out.push({ id: ID.cook!, x: cart.x, y: cart.y });
    return out;
  }

  run2View(): Run2 {
    const e = this.end;
    return {
      filled: this.filled,
      of: RUN2.banks,
      warm: RUN2.warm,
      ...(this.fizz ? { fizz: this.fizz } : {}),
      looks: this.looks(),
      ...(e ? { end: { at: e.at, ...(e.lines !== undefined ? { lines: e.lines } : {}), ...(e.lit !== undefined ? { lit: e.lit } : {}), ...(e.held !== undefined ? { held: e.held } : {}), ...(e.done ? { done: true as const } : {}) } } : {}),
    };
  }

  storyView(): StoryView {
    return { run: RUN2.title, movement: 0, title: RUN2.title, ring: null, mark: null, kes: 0, rival: null, note: "", run2: this.run2View() };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: "playing",
      host: ROOK_ID,
      shrine: RUN2.shrine,
      teams: 2,
      players: this.game.players.map((p) => ({ id: p.id, name: p.name, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: p.id !== ROOK_ID })),
      countdown: 0,
      lastScores: null,
      roundTicks: this.game.roundTicks,
      story: this.storyView(),
    };
  }

  /** For tests. */
  get state() {
    return { game: this.game, filled: this.filled, fizzed: this.fizzed, rookBanks: this.rookBanks, end: this.end, ids: ID, crew: this.crew };
  }
}
