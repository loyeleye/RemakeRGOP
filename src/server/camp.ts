// Arc 1 Part 2, piece 1-2b: the camp walk. Rook in the crew's warm yard, wary: the crew round the fire,
// the boy by the back cart keeping clear of Outrider, the gate standing open onto the nightshades. Things
// and people answer a tap (Rook's thoughts in bubbles, the crew's lines over them); after two taps, or
// 25 s, Outrider gets up and waits at the cold brazier, and a tap on him there ends the walk (the ask is
// the next piece, pictures). Everything is in CAMP (engine/camp.ts); nothing is voiced.

import { Mover, pt, type Pt } from "../engine/board.js";
import { CAMP, CREW, type CampLine } from "../engine/camp.js";
import { Game, TICK_MS, type Guild } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { cleanAction } from "./granny.js";
import { POND_WALK_SPEED } from "./pond.js";
import { realClock, type Clock } from "./room.js";

const ROOK_ID = 1;
/** The people's ids, in CAMP.people's order. */
const ID: Record<string, number> = Object.fromEntries(CAMP.people.map((p, i) => [p.key, 2 + i]));

type Thing = { key: string; at: () => Pt; stand: () => Pt };

export class CampRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private game!: Game;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  /** What Rook is walking up to, after a tap from afar. */
  private going: Thing | null = null;
  /** Lines due on a later tick. */
  private later: { at: number; f: () => void }[] = [];
  /** Taps so far on each thing or person (by key). */
  private taps = new Map<string, number>();
  /** The tick the goal showed (Outrider got up), or -1. */
  private goalAt = -1;
  private done = false;
  /** Wanderers: their place, and the tick they next set off. */
  private wanderers = new Map<number, { home: Pt; next: number }>();
  /** The gateway: the tick its thought last played, and whether he was in it last tick. */
  private gateSaid = -99;
  private wasOut = false;
  /** The cook, called over to the nightshades: where she was sent, and the tick she goes back (-1: not yet). */
  private cookOut: { to: Pt; back: number } | null = null;
  private s = 1;

  /** The camp's beat: the walkable map's (POND_WALK_SPEED), at CAMP.slow of it, for his slower, watchful walk. */
  beatMs = TICK_MS / (POND_WALK_SPEED * CAMP.slow);
  /** Played as part of Part 2's chain: the last tap hands on to the page. */
  chain = false;

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
      case "act":
        return this.act(msg);
    }
  }

  begin() {
    const shrine = shrineById(CAMP.shrine);
    const roster = [{ id: ROOK_ID, guild: 0 as Guild, name: "Rook" }, ...CAMP.people.map((p) => ({ id: ID[p.key]!, guild: 0 as Guild, name: p.name }))];
    // No wisps and a clock that never runs out.
    this.game = new Game(shrine, roster, this.seed(), [0, 0], 1e9);
    this.s = this.seed() || 1;
    const c = this.game.board.center;
    const put = (id: number, at: readonly [number, number]) => {
      const p = this.player(id);
      p.pos = p.prev = pt(c.x + at[0], c.y + at[1]);
      p.run = false;
    };
    put(ROOK_ID, CAMP.rook);
    for (const p of CAMP.people) put(ID[p.key]!, p.at);
    for (const k of CAMP.wander.who) this.wanderers.set(ID[k]!, { home: this.player(ID[k]!).pos, next: 4 + Math.floor(this.rand() * CAMP.wander.every[1]) });
    this.endClock();
    this.stop = this.clock.every(this.beatMs, () => this.onTick());
    this.broadcast();
  }

  onTick() {
    const g = this.game;
    if (this.done) return;
    this.wander();
    this.keepBoyClear();
    g.step();
    // The goal: after two taps, or 25 s.
    if (this.goalAt < 0 && g.tick * this.beatMs >= CAMP.goal.seconds * 1000) this.showGoal();
    this.arrive();
    this.atGateway();
    this.callCook();
    this.due();
    this.broadcast();
  }

  // ------------------------------------------------------------------ people

  private rand() {
    this.s = (this.s * 48271) % 2147483647;
    return this.s / 2147483647;
  }

  /** The gate one, the lamp hand and the boy stroll near their places; not while Rook is close or walking up to them. */
  private wander() {
    const g = this.game, rook = this.player(ROOK_ID), W = CAMP.wander;
    for (const [id, w] of this.wanderers) {
      const p = this.player(id);
      if (near(rook.pos, p.pos, 2) || this.going?.key === this.keyOf(id)) {
        if (p.action.kind === "walk") g.command(id, { action: { kind: "idle" } });
        w.next = Math.max(w.next, g.tick + W.every[0]);
        continue;
      }
      if (g.tick < w.next) continue;
      w.next = g.tick + W.every[0] + Math.floor(this.rand() * (W.every[1] - W.every[0]));
      for (let tries = 0; tries < 12; tries++) {
        const to = pt(w.home.x + Math.round((this.rand() * 2 - 1) * W.range), w.home.y + Math.round((this.rand() * 2 - 1) * W.range));
        if (!this.open(to)) continue;
        if (id === ID.boy && dist(to, this.player(ID.outrider!).pos) < CAMP.boyKeeps) continue;
        this.walk(id, to);
        break;
      }
    }
  }

  /** The boy keeps CAMP.boyKeeps tiles from Outrider: when Outrider comes close, he steps away. */
  private keepBoyClear() {
    const boy = this.player(ID.boy!), out = this.player(ID.outrider!).pos;
    if (dist(boy.pos, out) >= CAMP.boyKeeps) return;
    let best: Pt | null = null, bd = -1;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const q = pt(boy.pos.x + dx, boy.pos.y + dy);
        if (!this.open(q)) continue;
        const d = dist(q, out) - 0.2 * Math.hypot(dx, dy);
        if (d > bd) (bd = d), (best = q);
      }
    if (best) this.walk(ID.boy!, best);
  }

  private showGoal() {
    if (this.goalAt >= 0) return;
    this.goalAt = this.game.tick;
    // Outrider gets up and goes to wait at the cold brazier's north rim: the player sees where to go because somebody went there.
    this.walk(ID.outrider!, this.tile(CAMP.rim));
  }

  /** The cook comes over when Rook is within reach of the nightshades past the gate, to be there by his tap. */
  private callCook() {
    const g = this.game, rook = this.player(ROOK_ID).pos, cook = ID.cook!;
    if (this.cookOut) {
      if (this.cookOut.back >= 0 && g.tick >= this.cookOut.back) {
        this.walk(cook, this.tile(CAMP.people.find((p) => p.key === "cook")!.at));
        this.cookOut = null;
      }
      return;
    }
    if ((this.taps.get("shades") ?? 0) > 0 || !this.nearShade(rook)) return;
    const to = this.besideOpen(rook, rook);
    this.cookOut = { to, back: -1 };
    this.walk(cook, to);
  }

  private nearShade(at: Pt) {
    const c = this.game.board.center;
    return CAMP.shades.slice(0, CAMP.gateShades).some(([x, y]) => Math.hypot(c.x + x - at.x, c.y + y - at.y) <= CAMP.shadeReach + 1);
  }

  /** In the gateway or out on the apron, the gate's thought plays: on the way in, and again if he keeps on (CAMP.gateway). */
  private atGateway() {
    const g = this.game, rook = this.player(ROOK_ID).pos, c = g.board.center, G = CAMP.gateway;
    const out = rook.y - c.y <= G.apron || (rook.x - c.x === G.at[0] && rook.y - c.y === G.at[1]);
    if (out && !this.wasOut && g.tick - this.gateSaid >= G.again) this.gateway();
    this.wasOut = out;
  }

  private gateway() {
    this.gateSaid = this.game.tick;
    this.taps.set("gateway", (this.taps.get("gateway") ?? 0) + 1);
    this.countTap("gateway");
    this.sayAll(CAMP.taps.find((t) => t.id === "gateway")!.first);
  }

  // ------------------------------------------------------------------ taps

  private act(msg: Extract<ClientMsg, { t: "act" }>) {
    if (this.done) return;
    const g = this.game;
    const action = cleanAction(msg.action, g);
    const to = action?.kind === "walk" ? action.to : null;
    const thing = to ? this.thingAt(to) : null;
    this.going = null;
    const rook = this.player(ROOK_ID);
    if (thing) {
      if (near(rook.pos, thing.stand(), CAMP.reach) || near(rook.pos, thing.at(), CAMP.reach)) {
        g.command(ROOK_ID, { action: { kind: "idle" } });
        return this.answer(thing);
      }
      this.going = thing;
      g.command(ROOK_ID, { action: { kind: "walk", to: thing.stand() } });
      return;
    }
    // Out past the light: he stays put, and the gate's thought plays again.
    const c = g.board.center;
    if (to && rook.pos.y - c.y <= CAMP.gateway.apron + 1 && to.y < rook.pos.y && !g.board.passable(to, Mover.Walker) && g.tick - this.gateSaid >= CAMP.gateway.again) {
      g.command(ROOK_ID, { action: { kind: "idle" } });
      return this.gateway();
    }
    g.command(ROOK_ID, { action });
  }

  /** The person or thing on (or by) this tile: a person on their tile, a thing within a tile of its spot, a nightshade past the gate once he is near. */
  private thingAt(at: Pt): Thing | null {
    const c = this.game.board.center;
    for (const p of this.game.players) if (p.id !== ROOK_ID && p.pos.x === at.x && p.pos.y === at.y) return this.person(p.id);
    // The nearest thing within a tile of the tap (the gate's bar, its inside face and the gateway stand close together).
    let best: (typeof CAMP.taps)[number] | null = null, bd = Infinity;
    for (const t of CAMP.taps) {
      const d = Math.hypot(c.x + t.at[0] - at.x, c.y + t.at[1] - at.y);
      if (near(at, this.tile(t.at), 1) && d < bd) (best = t), (bd = d);
    }
    if (best) {
      const t = best, q = this.tile(t.at);
      return { key: t.id, at: () => q, stand: () => this.tile(t.stand) };
    }
    const rook = this.player(ROOK_ID).pos;
    for (const [x, y] of CAMP.shades.slice(0, CAMP.gateShades)) {
      const q = pt(Math.round(c.x + x), Math.round(c.y + y));
      if (near(at, q, 1) && this.nearShade(rook)) return { key: "shades", at: () => q, stand: () => rook };
    }
    return null;
  }

  private person(id: number): Thing {
    const key = this.keyOf(id);
    return { key, at: () => this.player(id).pos, stand: () => this.besideOpen(this.player(id).pos, this.player(ROOK_ID).pos) };
  }

  private keyOf(id: number) {
    return CAMP.people.find((p) => ID[p.key] === id)?.key ?? "";
  }

  /** Rook reached what he was walking up to: it answers. */
  private arrive() {
    const t = this.going, rook = this.player(ROOK_ID);
    if (!t) return;
    if (near(rook.pos, t.stand(), 0) || near(rook.pos, t.at(), CAMP.reach)) {
      this.going = null;
      this.game.command(ROOK_ID, { action: { kind: "idle" } });
      this.answer(t);
    } else if (this.game.players.some((p) => p.id !== ROOK_ID && p.pos.x === t.at().x && p.pos.y === t.at().y) && rook.action.kind === "idle") {
      // A person who moved: after them again.
      this.game.command(ROOK_ID, { action: { kind: "walk", to: t.stand() } });
    }
  }

  private answer(t: Thing) {
    // The way on: Outrider at the cold brazier, once he is waiting there.
    if (t.key === "outrider" && this.goalAt >= 0) {
      this.done = true;
      this.going = null;
      if (!this.chain) this.lines.push({ who: "", text: "(This is where the ask would start: pictures, the next piece of Part 2.)", talk: true });
      return this.broadcast();
    }
    const n = this.taps.get(t.key) ?? 0;
    this.taps.set(t.key, n + 1);
    this.countTap(t.key);
    if (t.key === "shades") {
      const S = CAMP.shadesSay;
      if (n === 0) {
        this.sayAll(S.first);
        if (this.cookOut) this.cookOut.back = this.game.tick + this.gap(S.first) + CAMP.cookBack;
        return;
      }
      return this.sayAll(S.again);
    }
    const spot = CAMP.taps.find((x) => x.id === t.key);
    if (spot) {
      if (t.key === "gateway") {
        // Just said on the way in: not twice running.
        if (this.game.tick - this.gateSaid < CAMP.gateway.again) return;
        this.gateSaid = this.game.tick;
      }
      return this.sayAll(n === 0 || !spot.again ? spot.first : spot.again);
    }
    const says = CAMP.says[t.key];
    if (!says) return;
    this.sayAll(n === 0 || !says.again ? says.first : says.again);
  }

  /** A distinct thing tapped counts toward the goal. */
  private countTap(key: string) {
    if (this.taps.get(key) !== 1) return;
    const distinct = [...this.taps.keys()].filter((k) => k !== "outrider" || this.goalAt < 0).length;
    if (distinct >= CAMP.goal.taps) this.showGoal();
  }

  // ------------------------------------------------------------------ lines

  /** Ticks a line stays up before the next one, read at the bubble's own pace (60 ms a letter, at least 2 s). */
  private ticksFor(l: CampLine) {
    return Math.ceil(Math.max(2000, l.text.length * 60) / this.beatMs) + 1;
  }
  private gap(ls: CampLine[]) {
    return ls.reduce((a, l) => a + this.ticksFor(l), 0);
  }

  /** Lines one after another: the first now, each next when the last has been read. */
  private sayAll(ls: CampLine[]) {
    this.later = [];
    let at = this.game.tick;
    for (const l of ls) {
      this.later.push({ at, f: () => this.say(l) });
      at += this.ticksFor(l);
    }
    this.due();
  }

  private due() {
    const g = this.game;
    const now = this.later.filter((l) => l.at <= g.tick);
    this.later = this.later.filter((l) => l.at > g.tick);
    for (const l of now) l.f();
  }

  private say(l: CampLine) {
    const draft = l.final ? {} : { draft: true };
    if (l.who === "Rook") return void this.lines.push({ who: "Rook", text: l.text, player: ROOK_ID, thought: true, ...draft });
    // "Any of them, about the boy": the nearest of the crew to Rook (not Outrider).
    let id = CAMP.people.find((p) => p.name === l.who) ? ID[CAMP.people.find((p) => p.name === l.who)!.key]! : -1;
    if (l.who === "crew") {
      const rook = this.player(ROOK_ID).pos;
      id = ["cook", "lantern", "gate", "lamp"].map((k) => ID[k]!).sort((a, b) => dist(this.player(a).pos, rook) - dist(this.player(b).pos, rook))[0]!;
    }
    const who = this.game.players.find((p) => p.id === id)?.name ?? l.who;
    this.lines.push({ who, text: l.text, player: id, quiet: true, ...draft });
  }

  // ------------------------------------------------------------------ board

  private tile(at: readonly [number, number]): Pt {
    const c = this.game.board.center;
    return pt(Math.round(c.x + at[0]), Math.round(c.y + at[1]));
  }

  private open(q: Pt) {
    const g = this.game;
    return g.board.inside(q) && g.board.passable(q, Mover.Walker) && !g.players.some((p) => p.pos.x === q.x && p.pos.y === q.y);
  }

  /** The open tile next to `at` nearest `from`. */
  private besideOpen(at: Pt, from: Pt): Pt {
    let best: Pt = at, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const q = pt(at.x + dx, at.y + dy);
        if (!this.open(q)) continue;
        const d = Math.hypot(q.x - from.x, q.y - from.y);
        if (d < bd) (best = q), (bd = d);
      }
    return best;
  }

  private walk(id: number, to: Pt) {
    this.game.command(id, { action: { kind: "walk", to } });
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
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
    this.send?.({ t: "tick", snap: this.game.snapshot(), tickMs: this.beatMs });
  }

  private endClock() {
    this.stop?.();
    this.stop = null;
  }

  /** Who faces where while they stand: the crew round the fire face it; Outrider at the rim faces the gate's way in, toward Rook's side of the brazier. */
  private looks() {
    const c = this.game.board.center, fire = pt(c.x - 7, c.y + 5);
    const out = [ID.cook!, ID.lantern!].map((id) => ({ id, x: fire.x, y: fire.y }));
    if (this.goalAt < 0) out.push({ id: ID.outrider!, x: fire.x, y: fire.y });
    else out.push({ id: ID.outrider!, x: c.x, y: c.y });
    return out;
  }

  storyView(): StoryView {
    const g = this.game, c = g.board.center, rook = this.player(ROOK_ID).pos;
    const taps = CAMP.taps.map((t) => ({ ...this.tile(t.at), h: 0.6 }));
    const shades = CAMP.shades.map(([x, y], i) => ({ x: c.x + x, y: c.y + y, near: i < CAMP.gateShades && this.nearShade(rook) }));
    for (const s of shades) if (s.near) taps.push({ x: Math.round(s.x), y: Math.round(s.y), h: 1.1 });
    // What he hears from where he stands (tiles): the cook's fire, and the nearest nightshade.
    const fire = CAMP.taps.find((t) => t.id === "fire")!.at;
    const hear = { fire: Math.hypot(c.x + fire[0] - rook.x, c.y + fire[1] - rook.y), shade: Math.min(...shades.map((s) => Math.hypot(s.x - rook.x, s.y - rook.y))) };
    return {
      run: CAMP.title,
      movement: 0,
      title: CAMP.title,
      ring: null,
      mark: null,
      kes: 0,
      rival: null,
      note: "",
      camp: { ...(this.goalAt >= 0 && !this.done ? { goal: CAMP.goal.text } : {}), ...(this.done ? { done: true as const } : {}), taps, shades, looks: this.looks(), hear },
    };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: "playing",
      host: ROOK_ID,
      shrine: CAMP.shrine,
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
    return { game: this.game, goalAt: this.goalAt, done: this.done, taps: this.taps, going: this.going, ids: ID, crew: CREW };
  }
}

const near = (a: Pt, b: Pt, r: number) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= r;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
