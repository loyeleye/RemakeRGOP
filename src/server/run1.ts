// Arc 1 Part 2, piece 1: run 1, the dark run (engine/run1.ts has the place and every dial). Seven banks
// relight the wreck's dead brazier; the nightshades come for Rook through the dark and stop at any
// light's edge; one beside him in the dark takes his warmth, a mark at a time; a light he pulls snuffs any
// it passes, and the fire's circle any it reaches as it grows, and another always steps out of the dark.
// At no warmth the dark closes over him, the fire goes out and the round starts again. On the seventh
// bank the light jumps to full, they are gone, and after a quiet the lamps come in at the south gap.

import { pt, type Pt } from "../engine/board.js";
import { BOT_MEDIUM, botCommand } from "../engine/bot.js";
import { Game, TICK_MS, type Guild } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { RUN1, run1Lit } from "../engine/run1.js";
import { cleanAction } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const ROOK_ID = 1;

type Run1 = NonNullable<StoryView["run1"]>;
interface Shade {
  id: number;
  x: number;
  y: number;
  /** The tick it may next move, and whether it has hold of him (and the tick it next takes a mark). */
  next: number;
  on: boolean;
  grip: number;
  /** Gone (snuffed) until this tick, then it steps out of the dark: at the fire's edge, or far from him. */
  gone: number;
  where: "edge" | "far";
}

export class Run1Room {
  private send: ((m: ServerMsg) => void) | null = null;
  private game!: Game;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private s = 1;
  private shades: Shade[] = [];
  private nextShade = 0;
  private warmth: number = RUN1.warmth;
  /** The spawn field, all of it, and the share of it in use (moved out as the circle grows). */
  private field: Pt[] = [];
  private allField: Pt[] = [];
  /** Things that happened, for the view's sounds and looks: the last snuff (tick, where), the last mark lost, the last catch of the fire. */
  private snuffed: { tick: number; x: number; y: number } | null = null;
  private marked = -1;
  private lastBanks = 0;
  /** The dark closing over him (the tick), and how many rounds he has lost. */
  private closing = -1;
  private tries = 0;
  /** The end: the tick it filled, the tick the lamps set off, and done. */
  private end: { at: number; lamps?: number; done?: true } | null = null;
  private lampIds: number[] = [];

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
        this.tries = 0;
        this.s = this.seed() || 1;
        this.round();
        this.endClock();
        this.stop = this.clock.every(TICK_MS, () => this.onTick());
        return;
      case "act": {
        if (this.end || this.closing >= 0) return;
        const action = cleanAction(msg.action, this.game);
        this.game.command(ROOK_ID, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  /** A round from the wake: the brazier dead, his warmth whole, two nightshades out in the dark. */
  private round() {
    const shrine = shrineById(RUN1.shrine);
    // The spawn field is the room's to move: Game reads it where it is.
    this.allField = shrine.spawnField.slice();
    this.field = this.allField.slice();
    const sh = { ...shrine, spawnField: this.field, farField: [], farShare: 0 };
    this.game = new Game(sh, [{ id: ROOK_ID, guild: 0 as Guild, name: "Rook" }], this.seed() + this.tries, [RUN1.wisps, 0], 1e9);
    this.game.respawnPause = RUN1.respawnPause;
    this.game.pullReach = RUN1.pullReach;
    const c = this.game.board.center, rook = this.rook();
    rook.pos = rook.prev = pt(c.x + RUN1.rook[0], c.y + RUN1.rook[1]);
    rook.run = false;
    this.reband();
    // The lights start where this round's field allows.
    for (const w of this.game.wisps) {
      const q = this.field[Math.floor(this.rand() * this.field.length)];
      if (q) w.pos = w.prev = { ...q } as never;
    }
    this.warmth = RUN1.warmth;
    this.shades = [];
    this.nextShade = 0;
    for (let i = 0; i < RUN1.shades.start; i++) this.addShade(RUN1.shades.still);
    this.snuffed = null;
    this.marked = -1;
    this.lastBanks = 0;
    this.closing = -1;
    this.end = null;
    this.lampIds = [];
  }

  onTick() {
    const g = this.game;
    if (this.end?.done) return;
    // The dark has closed over him: a moment black, then the round again.
    if (this.closing >= 0) {
      if ((g.tick - this.closing) * TICK_MS >= RUN1.closeSec * 1000) {
        this.tries++;
        this.round();
      } else g.tick++;
      return this.broadcast();
    }
    if (this.end) return this.ending();
    if (this.auto) {
      const cmd = botCommand(g, ROOK_ID, BOT_MEDIUM, () => this.rand());
      if (cmd) g.command(ROOK_ID, cmd);
    }
    g.step();
    const banks = g.scores[0]!;
    if (banks > this.lastBanks) {
      this.lastBanks = banks;
      this.warmth = Math.min(RUN1.warmth, this.warmth + 1);
      this.reband();
      if (banks >= RUN1.banks) return this.full();
      // The circle grows: any it reaches is snuffed, and comes back at its new edge.
      for (const s of this.up()) if (this.dC(s) <= run1Lit(banks) + 0.5) this.snuff(s, "edge");
    }
    const want = Math.min(RUN1.shades.most, RUN1.shades.start + Math.floor(banks / RUN1.shades.per));
    while (this.shades.length < want) this.addShade(4);
    this.hunt();
    if (this.warmth <= 0) this.closing = g.tick;
    this.broadcast();
  }

  // ------------------------------------------------------------------ the nightshades

  private rand() {
    this.s = (this.s * 48271) % 2147483647;
    return this.s / 2147483647;
  }

  private rook() {
    return this.game.players.find((p) => p.id === ROOK_ID)!;
  }

  private dC(p: { x: number; y: number }) {
    const c = this.game.board.center;
    return Math.hypot(p.x - c.x, p.y - c.y);
  }

  private live() {
    return this.game.wisps.filter((w) => !this.game.away.has(w.id));
  }

  /** In the light: the fire's circle, or near any light. */
  private inLight(p: { x: number; y: number }, slack = 0) {
    const R = run1Lit(this.game.scores[0]!);
    return (R > 0 && this.dC(p) <= R + 0.5 + slack) || this.live().some((w) => Math.hypot(w.pos.x - p.x, w.pos.y - p.y) <= RUN1.glow + slack);
  }

  private up() {
    return this.shades.filter((s) => s.gone < 0);
  }

  /** Where one steps out of the dark: far from him (at the start, or after a pull) or at the fire's edge (after a bank). */
  private place(where: "edge" | "far"): { x: number; y: number } {
    const g = this.game, c = g.board.center, me = this.rook().pos, R = run1Lit(g.scores[0]!);
    for (let k = 0; k < 300; k++) {
      const a = this.rand() * Math.PI * 2;
      const p =
        where === "edge" && R > 0
          ? { x: c.x + Math.cos(a) * (R + 1 + this.rand()), y: c.y + Math.sin(a) * (R + 1 + this.rand()) }
          : { x: me.x + Math.cos(a) * (RUN1.shades.backFar + this.rand() * 2), y: me.y + Math.sin(a) * (RUN1.shades.backFar + this.rand() * 2) };
      if (p.x < 0 || p.y < 0 || p.x >= g.board.width || p.y >= g.board.height) continue;
      if (!this.inLight(p, 0.5) && Math.hypot(p.x - me.x, p.y - me.y) >= 3) return p;
    }
    return { x: me.x + RUN1.shades.far, y: me.y };
  }

  private addShade(still: number) {
    const p = this.place("far");
    this.shades.push({ id: this.nextShade++, ...p, next: this.game.tick + still, on: false, grip: 0, gone: -1, where: "far" });
  }

  private snuff(s: Shade, where: "edge" | "far") {
    this.snuffed = { tick: this.game.tick, x: s.x, y: s.y };
    s.gone = this.game.tick + RUN1.shades.back;
    s.on = false;
    s.where = where;
  }

  private hunt() {
    const g = this.game, S = RUN1.shades, me = this.rook(), lit = this.inLight(me.pos);
    const pulled = me.action.kind === "staff" ? g.wisps[me.action.wisp] : undefined;
    for (const s of this.shades) {
      if (s.gone >= 0) {
        if (g.tick >= s.gone) Object.assign(s, this.place(s.where), { gone: -1, on: false, next: g.tick + 1 });
        continue;
      }
      // A light on the move snuffs it.
      if (pulled && !g.away.has(pulled.id) && Math.hypot(pulled.pos.x - s.x, pulled.pos.y - s.y) <= S.snuff) {
        this.snuff(s, "far");
        continue;
      }
      const dx = me.pos.x - s.x, dy = me.pos.y - s.y, d = Math.hypot(dx, dy);
      // Beside him in the dark: it has hold, a mark now and one more each `again` ticks.
      if (!lit && d <= S.hold1) {
        if (!s.on) (s.on = true), (s.grip = S.again), this.mark();
        else if (--s.grip <= 0) (s.grip = S.again), this.mark();
        continue;
      }
      if (d > S.free) s.on = false;
      if (g.tick < s.next) continue;
      // A held pose, then a jump of 1 or 2 tiles straight for him, stopping at any light's edge.
      s.next = g.tick + S.hold[0] + Math.floor(this.rand() * (S.hold[1] - S.hold[0] + 1));
      const step = Math.min(S.jump[0] + Math.floor(this.rand() * (S.jump[1] - S.jump[0] + 1)), Math.max(0, d - 0.9));
      const a0 = Math.atan2(dy, dx);
      for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
        let k = step;
        for (; k > 0.2; k -= 0.5) {
          const nx = s.x + Math.cos(a0 + da) * k, ny = s.y + Math.sin(a0 + da) * k;
          if (!this.inLight({ x: nx, y: ny })) {
            s.x = nx;
            s.y = ny;
            break;
          }
        }
        if (k > 0.2) break;
      }
    }
  }

  private mark() {
    this.warmth = Math.max(0, this.warmth - 1);
    this.marked = this.game.tick;
  }

  /** The lights appear 2 to 5 tiles past the fire's edge, never nearer than 4 from the brazier, only where he can reach. */
  private reband() {
    const R = run1Lit(this.game.scores[0]!), P = RUN1.spawn, c = this.game.board.center;
    let f = this.allField.filter((p) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      return d >= Math.max(P.least, R + P.past[0]) && d <= Math.max(P.least + 3, R + P.past[1]);
    });
    if (f.length < 6) f = this.allField.filter((p) => Math.hypot(p.x - c.x, p.y - c.y) >= R + 1);
    if (f.length < 3) f = this.allField;
    this.field.length = 0;
    this.field.push(...f);
  }

  // ------------------------------------------------------------------ the end

  /** Full: the light jumps to full, the nightshades are gone, and it is quiet. */
  private full() {
    const g = this.game;
    this.end = { at: g.tick };
    this.shades = [];
    this.rook().action = { kind: "idle" };
    // The lights go out of play: nothing left to pull.
    for (const w of g.wisps) g.away.set(w.id, 1e9);
    this.broadcast();
  }

  private ending() {
    const g = this.game, e = this.end!;
    g.step();
    // The quiet, then 3 to 5 lamps at the south gap, coming up the path toward the light.
    if (e.lamps === undefined && (g.tick - e.at) * TICK_MS >= RUN1.end.quietSec * 1000) {
      e.lamps = g.tick;
      this.lampIds = RUN1.end.lamps.map((_, i) => 2 + i);
    }
    if (e.lamps !== undefined && (g.tick - e.lamps) * TICK_MS >= RUN1.end.walkSec * 1000) {
      e.done = true;
      this.endClock();
    }
    this.broadcast();
  }

  /** The lamps' places: from the south gap straight up toward the light, each a little behind the one before. */
  private lampsNow(): { x: number; y: number }[] {
    const e = this.end, g = this.game, c = g.board.center;
    if (!e || e.lamps === undefined) return [];
    const k = Math.min(1, ((g.tick - e.lamps) * TICK_MS) / (RUN1.end.walkSec * 1000));
    return RUN1.end.lamps.map(([x, y], i) => {
      const t = Math.max(0, Math.min(1, k * 1.2 - i * 0.1)), tx = x * 0.7, ty = RUN1.end.stopAt + (i % 2);
      return { x: c.x + x + (tx - x) * t, y: c.y + y + (ty - y) * t };
    });
  }

  // ------------------------------------------------------------------ wire

  private flush() {
    if (!this.lines.length) return;
    const lines = this.lines;
    this.lines = [];
    this.send?.({ t: "say", lines });
  }

  private broadcast() {
    this.flush();
    this.send?.({ t: "room", room: this.view() });
    this.send?.({ t: "tick", snap: this.game.snapshot(), tickMs: TICK_MS });
  }

  private endClock() {
    this.stop?.();
    this.stop = null;
  }

  run1View(): Run1 {
    const g = this.game, me = this.rook().pos, banks = g.scores[0]!;
    const near = Math.min(99, ...this.up().map((s) => Math.hypot(s.x - me.x, s.y - me.y)));
    const e = this.end;
    return {
      banks,
      of: RUN1.banks,
      lit: e ? RUN1.lit.full : run1Lit(banks),
      warmth: this.warmth,
      of3: RUN1.warmth,
      dark: !this.inLight(me),
      shades: this.up().map((s) => ({ id: s.id, x: s.x, y: s.y, on: s.on })),
      near,
      ...(this.snuffed ? { snuffed: this.snuffed } : {}),
      ...(this.marked >= 0 ? { marked: this.marked } : {}),
      ...(this.closing >= 0 ? { closing: this.closing } : {}),
      tries: this.tries,
      lantern: { x: g.board.center.x + RUN1.lantern[0], y: g.board.center.y + RUN1.lantern[1] },
      ...(e ? { end: { at: e.at, ...(e.lamps !== undefined ? { lamps: this.lampsNow() } : {}), ...(e.done ? { done: true as const } : {}) } } : {}),
    };
  }

  storyView(): StoryView {
    return { run: RUN1.title, movement: 0, title: RUN1.title, ring: null, mark: null, kes: 0, rival: null, note: "", run1: this.run1View() };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: "playing",
      host: ROOK_ID,
      shrine: RUN1.shrine,
      teams: 2,
      players: [{ id: ROOK_ID, name: "Rook", guild: 0 as Guild, flame: "amber" as const, connected: true, bot: false }],
      countdown: 0,
      lastScores: null,
      roundTicks: this.game.roundTicks,
      story: this.storyView(),
    };
  }

  /** For tests. */
  get state() {
    return { game: this.game, warmth: this.warmth, shades: this.shades, tries: this.tries, end: this.end, closing: this.closing, lit: run1Lit(this.game.scores[0]!) };
  }
}
