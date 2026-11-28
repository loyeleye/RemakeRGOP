// Arc 1 Part 2, runs 3 and 4: the offspring fight, one fight on one board (project files
// gameplay/part2/runs3-4-fight-brief.md, a draft to prototype). Rook is the player; Solenne and Fen
// stand at the yard's east edge; the offspring is not a player on the board but a thing of its own
// that moves in fractional tiles, always turning to face the light it is after before it goes.
// Run 3: feed it the yard's light to keep it off her and the boy. Run 4: take that light back out
// of it and bank it, until the brazier holds its eye for the kill. Numbers in OFFSPRING.

import { Tile, pt, samePt, type Pt } from "../engine/board.js";
import { Game, Rng, TICK_MS, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import { OFFSPRING, oyRoom } from "../engine/offspring.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { cleanAction, moveWisp } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, SOL_ID = 2, FEN_ID = 3;
const ROOK = "Rook", SOLENNE = "Solenne", FEN = "Fen";
const GONE = 1e9;

type After = NonNullable<StoryView["fight"]>["it"]["after"];
type Fight = NonNullable<StoryView["fight"]>;
type Hint = NonNullable<NonNullable<Fight["teach"]>["hint"]>;
type Leap = NonNullable<Fight["it"]["leap"]>;

export class FightRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private captions: { who: string; text: string; until: number }[] = [];
  private end: StoryView["end"];

  run: 3 | 4 = 3;
  private part: Fight["part"] = "open";
  /** The offspring: where it is (tiles, fractional), its facing (radians), what it is after. */
  private it = { x: 0, y: 0, face: 0, after: null as After, key: "", eat: 0, knocked: -99, held: false, dazed: -1, leap: null as Leap | null };
  /** Wisps inside it, and in the brazier, by id. A wisp in neither is loose in the yard. */
  private inside = new Set<number>();
  private banked = new Set<number>();
  /** Wisps torn out of the wound and flying to him on their own, a tile a tick, until they reach him or the brazier. */
  private torn = new Set<number>();
  /** Lit wisps: ones he has pulled, or torn from the wound. The rest sleep, and it can't see them. */
  private lit = new Set<number>();
  /** The brazier counts as food until this tick (it flares when fed). */
  private flareUntil = -1;
  /** The tick of its next random jump (OFFSPRING.hop). */
  private hopAt = -1;
  private her = { light: 0, dipUntil: -1, doing: "rest" as "rest" | "windup" | "hold", left: 0, of: 0, flash: undefined as Fight["her"]["flash"] };
  private fenLight = 0;
  private shard = { shown: false, glow: 0 };
  private cycle = 0;
  private catches = 0;
  private down = 0;
  /** His last throw (a knockdown), for the view's flight. */
  private thrown: { from: { x: number; y: number }; to: { x: number; y: number }; tick: number; ticks: number } | null = null;
  private pulling = 0;
  private hurtUntil = -1;
  private eye = 0;
  /** The gaze: ticks it still holds after the eye has turned (eye.hold). */
  private gaze = 0;
  /** The dark: the tick it last ate or drank (it shows for a moment). */
  private ateAt = -99;
  /** The hunt: light flung out of the wound this tick or lately: from its back to where it fell. */
  private flung: { id: number; from: { x: number; y: number }; to: { x: number; y: number }; tick: number }[] = [];
  stats = { flashes: 0, hits: 0, strikes: 0, stuns: 0, drunk: 0, eaten: 0, bolts: 0 };
  private wound = { open: false, timer: 0 };
  /** Where things stood at the flare, for a retry of run 4. */
  private at4: { rook: Pt; it: { x: number; y: number; face: number } } | null = null;
  /**
   * Run 4's teaching (OFFSPRING.teach). `retry`: run 4 again after a loss (hints only, no captions).
   * `pulled`: a pull done in round 1 (its hold waits for one). `held`: a pull in this hold. `remind`:
   * round 3 on, a whole hold went by with no pull, so this hold gets its step hint once. `said`: the
   * captions given. `lure`: round 2's hint given. `timed`: a hint up until a tick. `hint`: the hint now.
   */
  private teach = { retry: false, pulled: false, pulls: 0, held: false, remind: false, reminded: false, said: new Set<string>(), lure: false, loose: -1, far: -1, homed: false, eyed: false, timed: null as { id: Hint; until: number } | null, hint: null as Hint | null, wait: 0 };

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
    /** Which run to start on (the page's ?fight=start:4 starts on run 4). */
    private startAt: 3 | 4 = 3,
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
        send({ t: "welcome", you: YOU, token: "" });
        return this.begin(this.startAt);
      case "lobby":
        if (this.phase === "results") this.begin(this.end?.summary === OFFSPRING.card.again4 ? 4 : this.startAt);
        return;
      case "act": {
        if (this.phase !== "playing") return;
        // Walking or running: his to switch at any time (it was never passed on, so the button did nothing).
        if (msg.toggleRun) this.game.command(YOU, { toggleRun: true });
        if (this.down > 0 || this.pulling > 0 || this.part === "flare") return;
        const action = cleanAction(msg.action, this.game);
        if (!action) return;
        if (action.kind === "staff" && this.game.away.has(action.wisp)) return;
        if (OFFSPRING.hunt.on && OFFSPRING.hunt.home && OFFSPRING.hunt.fling && action.kind === "staff" && this.game.noBank.has(action.wisp)) {
          // The hunt: a tap on a torn light sends it home to the fire by itself.
          const w = this.game.wisps[action.wisp]!, me = this.spot(YOU);
          if (Math.max(Math.abs(w.pos.x - me.x), Math.abs(w.pos.y - me.y)) <= this.game.pullReach) (this.torn.add(action.wisp), (this.teach.homed = true));
          return;
        }
        if (action.kind === "staff") {
          // The jump: his first pull on light the wound let go of is the "home" step done.
          if (OFFSPRING.hunt.on && !OFFSPRING.hunt.home && this.strays().some((w) => w.id === action.wisp)) this.teach.homed = true;
          this.lit.add(action.wisp);
        }
        this.game.command(YOU, { action });
        return;
      }
      case "fight": {
        if (this.phase !== "playing" || this.run !== 4 || this.part === "flare") return;
        if (msg.shard) this.shard.shown = !this.shard.shown;
        if (msg.hit || msg.pull) this.hit();
        return;
      }
    }
  }

  // ---------------------------------------------------------------- set-up

  begin(run: 3 | 4 = 3) {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    const O = OFFSPRING, shrine = shrineById(O.shrine);
    const roster = [
      { id: YOU, guild: 0 as Guild, name: ROOK },
      { id: SOL_ID, guild: 0 as Guild, name: SOLENNE },
      { id: FEN_ID, guild: 0 as Guild, name: FEN },
    ];
    const g = (this.game = new Game(shrine, roster, this.seed(), [O.wisps.length, 0], 1e7));
    const c = g.board.center;
    // A banked wisp stays in the brazier until the offspring takes it back out.
    g.respawnPause = GONE;
    // A wisp torn from the wound comes to him wherever he stands; the rest as usual.
    g.reachRule = (p, w) => this.torn.has(w.id) || Math.max(Math.abs(p.pos.x - w.pos.x), Math.abs(p.pos.y - w.pos.y)) <= g.pullReach;
    const place = (id: number, [x, y]: readonly [number, number]) => {
      const p = this.player(id);
      p.pos = p.prev = pt(c.x + x, c.y + y);
      p.run = id === YOU ? O.rookRuns : false;
    };
    place(YOU, O.rook);
    place(SOL_ID, O.solenne);
    place(FEN_ID, O.fen);
    O.wisps.forEach(([x, y], i) => moveWisp(g.wisps[i]!, pt(c.x + x, c.y + y)));
    this.inside = new Set();
    this.banked = new Set();
    this.torn = new Set();
    this.lit = new Set();
    this.flareUntil = -1;
    this.hopAt = -1;
    this.catches = 0;
    this.down = 0;
    this.thrown = null;
    this.dying = null;
    this.pulling = 0;
    this.wound = { open: false, timer: 0 };
    this.eye = 0;
    this.gaze = 0;
    this.boltDue = false;
    this.bolted = null;
    this.awayUntil = -1;
    this.flung = [];
    this.stats = { flashes: 0, hits: 0, strikes: 0, stuns: 0, drunk: 0, eaten: 0, bolts: 0 };
    this.shard = { shown: false, glow: 0 };
    this.captions = [];
    this.lines = [];
    const sol = this.spot(SOL_ID);
    this.it = { x: c.x + O.start[0], y: c.y + O.start[1], face: 0, after: "her", key: "her", eat: 0, knocked: -99, held: false, dazed: -1, leap: null };
    this.it.face = Math.atan2(sol.y - this.it.y, sol.x - this.it.x);
    if (run === 3) {
      this.run = 3;
      this.part = "open";
      this.cycle = 0;
      this.fenLight = O.light.fen3;
      // She has just shoved it off: half her light.
      this.her = { light: O.her.start3, dipUntil: -1, doing: "rest", left: 0, of: 0, flash: undefined };
      this.at4 = null;
    } else {
      // Run 4 on its own, or again: everything as it stood at the flare.
      this.teach.retry = !!this.at4;
      for (const w of g.wisps) (this.inside.add(w.id), g.away.set(w.id, GONE));
      if (this.at4) {
        const me = this.player(YOU);
        me.pos = me.prev = this.at4.rook;
        Object.assign(this.it, this.at4.it);
      }
      this.startRun4();
    }
    this.phase = "countdown";
    this.countdown = O.bellTicks;
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
    this.broadcastTick();
  }

  /** Her flare: run 4's first blast, on the spot. */
  private startRun4() {
    const O = OFFSPRING, g = this.game;
    this.run = 4;
    this.part = "play";
    this.cycle = 0;
    this.fenLight = O.light.fen4;
    this.shard = { shown: false, glow: 0 };
    this.teach = { retry: this.teach.retry, pulled: false, pulls: 0, held: false, remind: false, reminded: false, said: new Set(), lure: false, loose: -1, far: -1, homed: false, eyed: false, timed: null, hint: null, wait: 0 };
    this.her = { light: O.her.afterBlast, dipUntil: -1, doing: "rest", left: 0, of: 0, flash: undefined };
    if (!this.at4) this.at4 = { rook: this.player(YOU).pos, it: { x: this.it.x, y: this.it.y, face: this.it.face } };
    this.blast(g.tick);
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }
  private spot(id: number) {
    return this.player(id).pos;
  }

  // ---------------------------------------------------------------- the clock

  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) this.phase = "playing";
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing") return;
    const g = this.game, O = OFFSPRING;
    // The kill: the clock runs on and nothing else does, until its death has played out.
    if (this.dying) {
      g.tick++;
      if (g.tick >= this.dying.t0 + this.dying.ticks) return this.win();
      this.broadcastTick();
      return;
    }
    if (this.part === "flare") {
      g.step();
      this.stepLeap();
      if (--this.her.left <= 0) (this.teach.retry = false), this.startRun4();
      this.flush();
      this.broadcastTick();
      return;
    }
    // Rook, knocked down or tearing a wisp out, stands where he is.
    if (this.down > 0) {
      this.down--;
      g.command(YOU, { action: { kind: "idle" } });
    }
    if (this.pulling > 0) {
      g.command(YOU, { action: { kind: "idle" } });
      if (!this.wound.open) this.pulling = 0;
      else if (--this.pulling === 0) this.tearOut();
    }
    if (O.hunt.on && !O.hunt.home && this.run === 4) {
      // Real pulls: a loose light banks at the brazier as in any run, except while it sits at the fire.
      const shut = O.hunt.block && this.onFire();
      for (const w of g.wisps) if (!g.away.has(w.id) && !this.banked.has(w.id)) shut ? g.noBank.add(w.id) : g.noBank.delete(w.id);
    }
    g.step();
    // Banked this tick: in the brazier now, and it flares.
    for (const b of g.banks) this.bank(b.wisp);
    this.fly();
    g.scores[0] = this.banked.size;
    if (this.run === 4) this.stepShard();
    if (this.part !== "open") {
      if (this.run === 4) this.stepHer4();
      if (this.phase === "playing") this.stepIt();
      if (this.phase === "playing" && this.run === 3) this.stepHer3();
      if (this.phase === "playing" && this.run === 4) this.stepWound();
    }
    if (this.phase === "playing" && this.run === 4) this.stepTeach();
    if (this.phase === "playing" && this.run === 4 && this.part === "play" && this.banked.size === O.wisps.length) this.part = "kill";
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private bank(id: number) {
    this.banked.add(id);
    this.torn.delete(id);
    this.flareUntil = this.game.tick + OFFSPRING.it.flare;
    if (this.part === "open") this.part = "play";
  }

  /** Torn wisps fly to him on their own, a tile a tick (unless his staff has one): into the brazier on the way, or loose at his feet. */
  private fly() {
    const g = this.game, me = this.player(YOU), a = me.action;
    for (const id of [...this.torn]) {
      const w = g.wisps[id]!;
      if (g.away.has(id)) {
        this.torn.delete(id);
        continue;
      }
      if (a.kind === "staff" && a.wisp === id) continue;
      const HU = OFFSPRING.hunt, home = HU.on && HU.home, cc = g.board.center;
      const dx = (home ? cc.x : me.pos.x) - w.pos.x, dy = (home ? cc.y : me.pos.y) - w.pos.y;
      if (!home && Math.max(Math.abs(dx), Math.abs(dy)) <= 1) {
        this.torn.delete(id);
        continue;
      }
      // The hunt: it flies home to the fire; while the offspring is at the fire it waits at the rim.
      if (home && HU.block && this.onFire() && Math.max(Math.abs(dx), Math.abs(dy)) <= 2) continue;
      // A step on the line to him (eight ways), like a pulled wisp.
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const to = pt(w.pos.x + (ax >= ay || ax * 2 >= ay ? Math.sign(dx) : 0), w.pos.y + (ay >= ax || ay * 2 >= ax ? Math.sign(dy) : 0));
      const from = w.pos;
      moveWisp(w, to);
      w.prev = from;
      if (this.throughFire(to)) {
        g.away.set(id, GONE);
        g.noBank.delete(id);
        this.bank(id);
      }
    }
    // One out of the wound that came down short of the fire's middle banks only once it is pulled through it.
    for (const id of [...g.noBank]) if (!this.torn.has(id) && (g.away.has(id) || this.throughFire(g.wisps[id]!.pos))) g.noBank.delete(id);
  }

  /**
   * The dark: whether any light shows it now. Each light shows it within its own reach of its body; her blast, its open eye and a mouthful of light show it anywhere.
   * With `eyeToo` false, whether its body shows: its turning eye and gaze show only the eye and the cone (the view).
   */
  seen(eyeToo = true) {
    const D = OFFSPRING.dark, g = this.game, it = this.it, c = g.board.center, half = OFFSPRING.it.size / 2;
    if (!D.on || this.run !== 4) return true;
    if (eyeToo && (this.eye > 0 || this.gaze > 0)) return true;
    if (it.held || this.her.doing === "windup" || g.tick - this.ateAt < D.ateTicks || this.part === "kill") return true;
    const near = (p: { x: number; y: number }, r: number) => Math.hypot(p.x - it.x, p.y - it.y) <= r + half;
    const me = this.spot(YOU);
    if (near(me, this.shard.shown ? D.shard : D.rook)) return true;
    if (this.banked.size && near(c, D.brazier + D.perBanked * this.banked.size)) return true;
    if (near(this.spot(SOL_ID), D.her + D.perHer * this.her.light) || near(this.spot(FEN_ID), D.fen)) return true;
    for (const w of g.wisps) if (!g.away.has(w.id) && !this.banked.has(w.id) && this.lit.has(w.id) && near(w.pos, D.wisp)) return true;
    return false;
  }

  /** The hunt: its body is at the fire (within its drinking distance), and not held. */
  private onFire() {
    const I = OFFSPRING.it, c = this.game.board.center, it = this.it;
    return !it.held && Math.hypot(c.x - it.x, c.y - it.y) <= I.reachBrazier + I.size / 2 + 0.1;
  }

  /** The fire's middle: a wisp out of the wound banks only through it, not at the brazier's rim (so he can't strike and pull from the rim on its side). */
  private throughFire(p: Pt) {
    const c = this.game.board.center;
    return Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= 1;
  }

  // ---------------------------------------------------------------- what it is after

  /** The lights it can see, each with its brightness and where it is. */
  private lights() {
    const O = OFFSPRING, g = this.game, c = g.board.center, out: { key: string; after: After; at: { x: number; y: number }; b: number; edge: number }[] = [];
    const sol = this.spot(SOL_ID), fen = this.spot(FEN_ID);
    out.push({ key: "her", after: "her", at: sol, b: this.herGlow(), edge: 0 });
    out.push({ key: "fen", after: "fen", at: fen, b: this.fenLight, edge: 0 });
    for (const w of g.wisps) if (!g.away.has(w.id) && !this.banked.has(w.id)) out.push({ key: `w${w.id}`, after: "wisp", at: w.pos, b: O.light.wisp, edge: 0 });
    if (this.banked.size) out.push({ key: "brazier", after: "brazier", at: c, b: this.banked.size * O.light.banked, edge: O.it.brazierEdge });
    if (this.run === 4 && this.shard.glow > 0) out.push({ key: "shard", after: "shard", at: this.spot(YOU), b: this.shard.glow, edge: 0 });
    return out;
  }

  private herGlow() {
    return this.game.tick < this.her.dipUntil ? Math.min(this.her.light, OFFSPRING.her.dip) : this.her.light;
  }

  /** What it goes for: the first there is of the kill's brazier, the uncovered shard, lit food nearest first, and the most light (OFFSPRING.it). */
  private choose() {
    const I = OFFSPRING.it, it = this.it, L = this.lights().filter((l) => l.b > 0);
    const gap = (l: (typeof L)[number]) => Math.max(0, Math.hypot(l.at.x - it.x, l.at.y - it.y) - l.edge - I.size / 2);
    if (this.part === "kill") return L.find((l) => l.after === "brazier") ?? null;
    const shard = L.find((l) => l.after === "shard");
    if (shard) return shard;
    const c = this.game.board.center, atMeal = it.key === "brazier" && Math.hypot(c.x - it.x, c.y - it.y) <= I.reachBrazier + I.size / 2 + 0.1;
    const food = L.filter((l) => (l.after === "wisp" && this.lit.has(Number(l.key.slice(1)))) || (l.after === "brazier" && (this.game.tick < this.flareUntil || atMeal)));
    // The hunt: loose light before the fire. Only with no stray left does it go back to drink.
    const strays = OFFSPRING.hunt.on && OFFSPRING.hunt.straysFirst && this.run === 4 ? food.filter((l) => l.after === "wisp") : [];
    if (strays.length) return strays.sort((a, b) => gap(a) / (a.key === it.key ? I.stick : 1) - gap(b) / (b.key === it.key ? I.stick : 1))[0]!;
    if (food.length) return food.sort((a, b) => gap(a) / (a.key === it.key ? I.stick : 1) - gap(b) / (b.key === it.key ? I.stick : 1))[0]!;
    // The most light of her, the boy and the brazier, plain amounts; the nearer if they are level.
    let best: (typeof L)[number] | null = null, top = -1;
    for (const l of L) {
      if (l.after === "wisp") continue;
      const s = l.b * (l.key === it.key ? I.stick : 1) - gap(l) * 1e-3;
      if (s > top) (top = s), (best = l);
    }
    return best;
  }

  /** The offspring's tick: pick, turn, go, eat. */
  private stepIt() {
    const O = OFFSPRING, I = O.it, g = this.game, it = this.it;
    if (this.stepLeap()) return;
    if (it.held) {
      // Held by her blast: facing her, still.
      const sol = this.spot(SOL_ID);
      if (!OFFSPRING.hunt.on || this.cycle <= 1) it.face = Math.atan2(sol.y - it.y, sol.x - it.x);
      this.eye = this.gaze = 0;
      return;
    }
    if (this.hop()) return;
    if (g.tick < it.dazed) {
      // Dazed, it can't move; but with the shard out its eye snaps to him.
      if (this.run === 4 && this.shard.shown) {
        const me = this.spot(YOU);
        it.face = Math.atan2(me.y - it.y, me.x - it.x);
        if (this.cycle === 1) this.say("sees");
      }
      return;
    }
    const l = this.choose();
    if (!l) return;
    const E = O.eye, HU = O.hunt;
    if (HU.on && E.on && l.after !== "shard") this.eye = this.gaze = 0;
    if (HU.on && E.on && (this.eye > 0 || this.gaze > 0)) {
      // Its eye is turning: it stands and stares (locked, or tracking him), and at the end he is caught if he is in its cone with the shard still lit.
      const me = this.spot(YOU);
      // The sweep after him comes after the look, so he is caught only by the cone he was shown (Ladi, 27 Nov 5:58 PM:
      // the cone swung onto him and caught him on the same tick).
      const sweepTn = ((this.eye > 0 ? (E.lock ? E.track : I.turn) : E.sweep) * Math.PI) / 180;
      // The eye turned: one look, and then the gaze holds for eye.hold more ticks, sweeping after him; he is caught on any tick he is in it.
      const turned = this.eye > 0 ? --this.eye === 0 : true;
      if (this.eye === 0 && turned) {
        if (this.gaze === 0) (this.stats.flashes++, (this.gaze = E.hold + 1));
        this.gaze--;
        let off = Math.atan2(me.y - it.y, me.x - it.x) - it.face;
        while (off > Math.PI) off -= 2 * Math.PI;
        while (off < -Math.PI) off += 2 * Math.PI;
        const d = Math.hypot(me.x - it.x, me.y - it.y) - I.size / 2;
        if (this.shard.glow > 0 && Math.abs(off) <= (E.cone * Math.PI) / 180 && d <= E.range + E.slack) {
          this.stats.hits++;
          return this.caught();
        }
      }
      if ((!E.lock || E.track) && (this.eye > 0 || this.gaze > 0)) {
        const w = Math.atan2(me.y - it.y, me.x - it.x);
        let d = w - it.face;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        it.face += Math.abs(d) <= sweepTn ? d : Math.sign(d) * sweepTn;
      }
      return;
    }
    if (l.key !== it.key) it.eat = 0;
    it.key = l.key;
    it.after = l.after;
    // In the kill it has only the brazier's light, and stares at it.
    const want = Math.atan2(l.at.y - it.y, l.at.x - it.x);
    let diff = want - it.face;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const turn = (I.turn * Math.PI) / 180;
    it.face += Math.abs(diff) <= turn ? diff : Math.sign(diff) * turn;
    const reach = (l.after === "brazier" ? I.reachBrazier : HU.on && E.on && l.after === "shard" ? E.range : I.reach) + I.size / 2;
    const dist = Math.hypot(l.at.x - it.x, l.at.y - it.y);
    if (HU.on && E.on && l.after === "shard" && dist <= reach && Math.abs(diff) - Math.min(Math.abs(diff), turn) <= (E.aim * Math.PI) / 180) {
      this.eye = E.ticks;
      return;
    }
    if (dist > reach && Math.abs(diff) - Math.min(Math.abs(diff), turn) <= (I.moveArc * Math.PI) / 180) {
      const speed = (this.wound.open || g.tick < this.hurtUntil) && O.wound.crawl ? O.wound.crawl : I.slow + (I.speed - I.slow) * (this.inside.size / O.wisps.length);
      const step = Math.min(speed, dist - reach + 0.2), from = { x: it.x, y: it.y };
      const nx = it.x + (Math.cos(want) * step), ny = it.y + (Math.sin(want) * step);
      this.moveTo(nx, ny);
      this.knockdown(from, l.after);
      if (this.overFire(l.at, Math.hypot(it.x - from.x, it.y - from.y))) return;
    } else this.stuck = 0;
    // Reached it.
    if (Math.hypot(l.at.x - it.x, l.at.y - it.y) > reach) {
      it.eat = 0;
      return;
    }
    switch (l.after) {
      case "wisp": {
        if (++it.eat < I.eatLoose) return;
        const id = Number(l.key.slice(1));
        this.eat(g.wisps[id]!);
        it.eat = 0;
        return;
      }
      case "brazier": {
        // In the kill it drinks at the fire but is given nothing: the look of drinking, and its back to him.
        if (this.part === "kill") return void (it.eat = 1);
        if (++it.eat < (this.run === 4 ? I.eatBanked4 : I.eatBanked)) return;
        const id = [...this.banked].pop()!;
        this.stats.drunk++;
        this.ateAt = g.tick;
        this.banked.delete(id);
        this.inside.add(id);
        g.scores[0] = this.banked.size;
        it.eat = 0;
        if (this.run === 3) this.ate();
        return;
      }
      case "shard":
        if (HU.on && E.on) return;
        return this.caught();
      case "fen":
        if (this.run === 4) return this.lose();
        return;
      case "her":
        return;
    }
  }

  private moveTo(nx: number, ny: number) {
    const c = this.game.board.center, solid = OFFSPRING.hunt.on && OFFSPRING.hunt.solid && this.run === 4 ? OFFSPRING.it.size / 2 + 1.5 : 0;
    // The hunt: the brazier is solid to it too (its body stops against it), unless it is already inside that ring.
    const here = Math.hypot(this.it.x - c.x, this.it.y - c.y);
    const ok = (x: number, y: number) => oyRoom(x - c.x, y - c.y) < -OFFSPRING.it.size / 2 && (!solid || Math.hypot(x - c.x, y - c.y) >= Math.min(solid, here + 0.01));
    if (ok(nx, ny)) (this.it.x = nx), (this.it.y = ny);
    else if (ok(nx, this.it.y)) this.it.x = nx;
    else if (ok(this.it.x, ny)) this.it.y = ny;
  }
  /** Ticks in a row it has wanted to walk and not got anywhere (against the brazier). */
  private stuck = 0;

  /**
   * Pinned against the brazier with what it wants right across it: it leaps over the fire to that side
   * (Ladi, 27 Nov 6:20 PM: "If its stuck in the same spot it should jump to that side"). True if it leapt.
   */
  private overFire(to: { x: number; y: number }, moved: number) {
    const O = OFFSPRING, J = O.hunt, c = this.game.board.center, it = this.it;
    if (!J.on || !J.solid || this.run !== 4 || !J.overFire) return false;
    const ring = O.it.size / 2 + 1.5, here = Math.hypot(it.x - c.x, it.y - c.y);
    this.stuck = moved < 0.05 && here < ring + 1 ? this.stuck + 1 : 0;
    if (this.stuck < J.overFire) return false;
    // Over the middle of the fire, landing clear of its ring on the far side, toward what it wants.
    const a = Math.atan2(to.y - c.y, to.x - c.x);
    for (let d = ring + 0.5; d <= ring + 4; d += 0.5) {
      const q = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
      if (oyRoom(q.x - c.x, q.y - c.y) < -O.it.size / 2) {
        this.stuck = 0;
        this.leapTo(q, J.overTicks);
        return true;
      }
    }
    return false;
  }

  private eat(w: Wisp) {
    const g = this.game;
    if (w.holder === YOU || this.player(YOU).action.kind === "staff") {
      const a = this.player(YOU).action;
      if (a.kind === "staff" && a.wisp === w.id) g.command(YOU, { action: { kind: "idle" } });
    }
    w.target = null;
    w.holder = null;
    g.away.set(w.id, GONE);
    this.torn.delete(w.id);
    this.lit.delete(w.id);
    this.stats.eaten++;
    this.ateAt = g.tick;
    this.inside.add(w.id);
    if (this.run === 3) this.ate();
  }

  /** Run 3: the tenth wisp eaten, and nothing left but her and the boy. She flares, whatever her light. */
  private ate() {
    if (this.inside.size < OFFSPRING.wisps.length) return;
    this.part = "flare";
    this.her.flash = { kind: "flare", tick: this.game.tick };
    this.her.left = OFFSPRING.flareTicks;
    this.it.held = true;
    this.at4 = { rook: this.player(YOU).pos, it: { x: this.it.x, y: this.it.y, face: this.it.face } };
    // Her flare draws it: it leaps to her, where her first blast will hold it.
    this.leapTo(this.spotFor(1), OFFSPRING.flareTicks);
    this.game.command(YOU, { action: { kind: "idle" } });
  }

  /** A run through his tile, when it is not after him: thrown aside and down a while. Never damage. */
  private knockdown(from: { x: number; y: number }, after: After) {
    const K = OFFSPRING.knockdown, g = this.game;
    if (!K.on || after === "shard" || this.down > 0) return;
    const me = this.player(YOU), px = me.pos.x, py = me.pos.y;
    const dx = this.it.x - from.x, dy = this.it.y - from.y, len = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((px - from.x) * dx + (py - from.y) * dy) / (len * len)));
    if (Math.hypot(from.x + dx * t - px, from.y + dy * t - py) > OFFSPRING.it.size / 2 + K.near) return;
    // Aside: square to its way, on whichever side he was.
    const side = (px - from.x) * -dy + (py - from.y) * dx >= 0 ? 1 : -1;
    const ax = (-dy / len) * side, ay = (dx / len) * side;
    const clear = Math.ceil(OFFSPRING.it.size / 2) + K.aside;
    for (let k = clear; k >= 1; k--) {
      const to = pt(Math.round(px + ax * k), Math.round(py + ay * k));
      if (g.board.inside(to) && g.board.tile(to) === Tile.Floor && !g.players.some((p) => p !== me && samePt(p.pos, to))) {
        me.pos = me.prev = to;
        break;
      }
    }
    this.thrown = { from: { x: px, y: py }, to: { x: me.pos.x, y: me.pos.y }, tick: g.tick, ticks: K.down };
    me.path = [];
    me.pathGoal = null;
    g.command(YOU, { action: { kind: "idle" } });
    this.down = K.down;
    this.pulling = 0;
  }

  /** Knocked back `n` tiles straight away from (x, y). */
  private knockBack(from: { x: number; y: number }, n: number) {
    const it = this.it, a = Math.atan2(it.y - from.y, it.x - from.x);
    for (let k = 0; k < n * 4; k++) this.moveTo(it.x + Math.cos(a) * 0.25, it.y + Math.sin(a) * 0.25);
    it.knocked = this.game.tick;
    it.eat = 0;
  }

  // ---------------------------------------------------------------- run 3: her shove

  private stepHer3() {
    const H = OFFSPRING.her, g = this.game, it = this.it;
    const sol = this.spot(SOL_ID), fen = this.spot(FEN_ID);
    const near = Math.min(Math.hypot(sol.x - it.x, sol.y - it.y), Math.hypot(fen.x - it.x, fen.y - it.y)) - OFFSPRING.it.size / 2;
    if (near <= H.shoveAt) {
      if (this.her.light < H.shove) return this.lose();
      this.her.light -= H.shove;
      this.her.flash = { kind: "shove", tick: g.tick };
      this.knockBack(sol, H.knock);
      it.dazed = g.tick + OFFSPRING.it.shoveDaze;
      return;
    }
    if ((it.after !== "her" && it.after !== "fen") || g.tick < it.dazed) this.her.light = Math.min(H.full, this.her.light + H.regen3);
  }

  // ---------------------------------------------------------------- run 4: the blast cycle

  private blast(tick: number) {
    const O = OFFSPRING, H = O.her, g = this.game, it = this.it, sol = this.spot(SOL_ID);
    this.cycle++;
    this.her.light = H.afterBlast;
    this.her.dipUntil = tick + H.dipTicks;
    this.her.doing = "hold";
    // She tires: from the round after the first loose one, each hold a little shorter, never under holdMin. Its bar is out of the full hold, so it starts shorter.
    this.her.left = O.hunt.on ? O.hunt.stun : Math.max(Math.min(H.hold, H.holdMin), H.hold - H.tire * Math.max(0, this.cycle - O.wound.looseFrom));
    this.her.of = O.hunt.on ? O.hunt.stun : H.hold;
    this.stats.stuns++;
    this.her.flash = { kind: this.cycle === 1 ? "flare" : "blast", tick };
    it.held = true;
    it.eat = 0;
    // Where her flare drew it (OFFSPRING.cycles); at the very start of run 4, already there. Not in the kill.
    if (this.part !== "kill" && !(O.hunt.on && this.cycle > 1)) {
      const L = it.leap && tick - it.leap.t0 <= it.leap.ticks + 1 ? it.leap : null, to = L?.to ?? this.spotFor(this.cycle);
      it.x = to.x;
      it.y = to.y;
      if (L) this.landedOn();
    }
    if (!(O.hunt.on && this.cycle > 1)) it.face = Math.atan2(sol.y - it.y, sol.x - it.x);
  }

  private stepHer4() {
    const O = OFFSPRING, H = O.her, L = O.light, g = this.game, it = this.it, her = this.her;
    if (this.cycle >= L.fenFrom) this.fenLight = Math.min(L.fenMax, this.fenLight + L.fenRise);
    // While it is away after its jump her charge waits: no charging, no wind-up, no blast.
    if (O.hunt.on && O.hunt.safe && g.tick < this.awayUntil && her.doing !== "hold") return;
    if (her.doing === "hold") {
      // Round 1's hold waits until he has shown the shard, struck and pulled once.
      if (this.cycle === 1 && !this.teach.pulled) return;
      her.left -= 1 + (this.shard.shown ? O.shard.holdCost : 0);
      if (her.left <= 0) {
        her.doing = "rest";
        her.left = 0;
        it.held = false;
        // From round 2 a wound open with the shard out stays open: it is loose, and he can keep pulling.
        if (O.hunt.on) void 0;
        else if (!(O.wound.loose && this.cycle >= O.wound.looseFrom && this.shard.shown)) this.wound = { open: false, timer: 0 };
        else if (this.wound.open && this.teach.loose < 0) this.teach.loose = this.cycle;
        // Round 3 on: a whole hold with no pull, and the next hold gets its step hint (once).
        if (this.cycle >= 3 && !this.teach.held && !this.teach.reminded) this.teach.remind = true;
        else this.teach.remind = false;
        this.teach.held = false;
        // After the first hold it stands dazed until she can blast again: cycle 1 is safe.
        if (this.cycle === 1) it.dazed = g.tick + O.it.daze1;
        if (this.boltDue) {
          this.boltDue = false;
          if (O.hunt.bolt && this.inside.size) this.bolt();
        }
      }
      return;
    }
    if (her.doing === "windup") {
      if (--her.left <= 0) this.blast(g.tick);
      return;
    }
    // While it is dazed it is after nothing.
    const after = g.tick < it.dazed ? null : it.after;
    const sol = this.spot(SOL_ID), on = after === "her" && Math.hypot(sol.x - it.x, sol.y - it.y) <= O.it.reach + O.it.size / 2;
    if (on) her.light = Math.max(H.floor, her.light - H.eaten);
    else if (after === "her") her.light = Math.max(0, her.light - H.drain);
    else her.light = Math.min(H.full, her.light + H.regen4);
    if (her.light >= H.full) {
      her.doing = "windup";
      her.left = her.of = H.windup;
      if (!O.hunt.on) (this.wound = { open: false, timer: 0 }), (this.pulling = 0);
      // She flares, and it leaps to her over the wind-up (not in the kill: there the fire holds its eye).
      if (O.hunt.on) her.flash = { kind: "flare", tick: g.tick };
      else if (this.part !== "kill") {
        her.flash = { kind: "flare", tick: g.tick };
        this.leapTo(this.spotFor(this.cycle + 1), H.windup);
      }
    }
  }

  /** Where her flare draws it for blast `cycle`: in front of her, toward the fire in round 1, to her side away from Rook after. */
  private spotFor(cycle: number) {
    const O = OFFSPRING, g = this.game, c = g.board.center, sol = this.spot(SOL_ID), me = this.spot(YOU);
    const a0 = Math.atan2(c.y - sol.y, c.x - sol.x), side = (O.cycles.side * Math.PI) / 180;
    const ok = (p: { x: number; y: number }) => oyRoom(p.x - c.x, p.y - c.y) < -O.it.size / 2;
    const at = (a: number, d: number) => ({ x: sol.x + Math.cos(a) * d, y: sol.y + Math.sin(a) * d });
    const angles = cycle <= 1 ? [a0] : [a0 + side, a0 - side].sort((p, q) => Math.hypot(at(q, O.cycles.at).x - me.x, at(q, O.cycles.at).y - me.y) - Math.hypot(at(p, O.cycles.at).x - me.x, at(p, O.cycles.at).y - me.y));
    for (const a of [...angles, a0]) for (let d = O.cycles.at; d >= 1.5; d -= 0.5) if (ok(at(a, d))) return at(a, d);
    return at(a0, O.cycles.at);
  }

  /** It lands on him: run 3's knockdown, thrown clear of it (never hurt). */
  private landedOn() {
    const K = OFFSPRING.knockdown, g = this.game, it = this.it, me = this.player(YOU);
    if (!K.on || this.down > 0) return;
    const px = me.pos.x, py = me.pos.y;
    const d = Math.hypot(me.pos.x - it.x, me.pos.y - it.y);
    // Only under its body: he may wait right behind where it lands.
    if (d >= OFFSPRING.it.size / 2) return;
    const c = g.board.center, a = d > 0.01 ? Math.atan2(me.pos.y - it.y, me.pos.x - it.x) : Math.atan2(c.y - it.y, c.x - it.x);
    const clear = Math.ceil(OFFSPRING.it.size / 2) + K.aside;
    for (let k = clear; k >= 1; k--) {
      const to = pt(Math.round(it.x + Math.cos(a) * k), Math.round(it.y + Math.sin(a) * k));
      if (g.board.inside(to) && g.board.tile(to) === Tile.Floor && !g.players.some((p) => p !== me && samePt(p.pos, to))) {
        me.pos = me.prev = to;
        break;
      }
    }
    this.thrown = { from: { x: px, y: py }, to: { x: me.pos.x, y: me.pos.y }, tick: g.tick, ticks: K.down };
    me.path = [];
    me.pathGoal = null;
    g.command(YOU, { action: { kind: "idle" } });
    this.down = K.down;
    this.pulling = 0;
  }

  /** A random jump, when one is due (OFFSPRING.hop). True if it has just leapt. */
  private hop() {
    const H = OFFSPRING.hop, I = OFFSPRING.it, g = this.game, it = this.it, c = g.board.center;
    if (!H.on || (this.run === 3 && !H.run3) || this.part !== "play" || g.tick < it.dazed || this.her.doing !== "rest") return false;
    // No jumps with its wound open; the next one is timed afresh from when it shuts.
    if ((OFFSPRING.wound.loose && this.wound.open) || (OFFSPRING.hunt.on && !OFFSPRING.hunt.hopShard && (this.shard.glow > 0 || this.eye > 0))) {
      this.hopAt = -1;
      return false;
    }
    const next = () => (this.hopAt = g.tick + Math.max(H.ticks + 1, Math.round(H.every * (1 - H.spread + 2 * H.spread * this.rng.next()))));
    if (this.hopAt < 0) next();
    if (g.tick < this.hopAt) return false;
    // Not while it eats at the brazier.
    if (it.key === "brazier" && Math.hypot(c.x - it.x, c.y - it.y) <= I.reachBrazier + I.size / 2 + 0.1) return false;
    const me = this.spot(YOU), sol = this.spot(SOL_ID), fen = this.spot(FEN_ID);
    const fits = (p: { x: number; y: number }) =>
      oyRoom(p.x - c.x, p.y - c.y) < -I.size / 2 &&
      Math.hypot(p.x - me.x, p.y - me.y) > I.size / 2 + H.clear &&
      Math.min(Math.hypot(p.x - sol.x, p.y - sol.y), Math.hypot(p.x - fen.x, p.y - fen.y)) > I.size / 2 + OFFSPRING.her.shoveAt + 1 &&
      Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) > 2 + I.size / 2;
    let to: { x: number; y: number } | null = null;
    if (this.rng.next() < H.onWisp) {
      const ws = g.wisps.filter((w) => !g.away.has(w.id) && this.lit.has(w.id) && !this.torn.has(w.id)).map((w) => ({ x: w.pos.x, y: w.pos.y })).filter(fits);
      if (ws.length) to = ws[Math.floor(this.rng.next() * ws.length)]!;
    }
    for (let k = 0; !to && k < 40; k++) {
      const p = { x: c.x + (this.rng.next() * 2 - 1) * 12, y: c.y + (this.rng.next() * 2 - 1) * 9 };
      if (fits(p)) to = p;
    }
    next();
    if (!to) return false;
    this.leapTo(to, H.ticks);
    return this.stepLeap();
  }

  /** Hurt enough, it jumps to safety (Ladi, 27 Nov 4:46 PM): a leap to somewhere far from him, out of the light if it can. */
  private bolt() {
    const H = OFFSPRING.hunt, I = OFFSPRING.it, g = this.game, c = g.board.center, me = this.spot(YOU), sol = this.spot(SOL_ID), fen = this.spot(FEN_ID);
    let best: { x: number; y: number } | null = null, score = -1;
    for (let k = 0; k < 60; k++) {
      const p = { x: c.x + (this.rng.next() * 2 - 1) * 12, y: c.y + (this.rng.next() * 2 - 1) * 9 };
      if (oyRoom(p.x - c.x, p.y - c.y) >= -I.size / 2 || Math.hypot(p.x - c.x, p.y - c.y) < I.size / 2 + 3) continue;
      if (Math.min(Math.hypot(p.x - sol.x, p.y - sol.y), Math.hypot(p.x - fen.x, p.y - fen.y)) <= I.size / 2 + OFFSPRING.her.shoveAt + 1) continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < H.boltMin) continue;
      const s = this.rng.next();
      if (s > score) (score = s), (best = p);
    }
    if (!best) return;
    this.eye = this.gaze = 0;
    this.hopAt = -1;
    this.stats.bolts++;
    // Hurt, it limps: the crawl holds for dark.hurt ticks from the jump.
    this.hurtUntil = g.tick + H.boltTicks + H.away + OFFSPRING.dark.hurt;
    // It stays where it lands for hunt.away ticks before it comes back for the light.
    this.it.dazed = g.tick + H.boltTicks + H.away;
    this.awayUntil = g.tick + H.boltTicks + H.away;
    this.leapTo(best, H.boltTicks);
    this.bolted = { from: { x: this.it.x, y: this.it.y }, to: best, t0: g.tick, ticks: H.boltTicks, away: H.away };
  }

  private leapTo(to: { x: number; y: number }, ticks: number) {
    const it = this.it;
    it.leap = { from: { x: it.x, y: it.y }, to, t0: this.game.tick, ticks: Math.max(1, ticks) };
    it.eat = 0;
  }

  /** A leap under way: along the line, facing her. True while it is in the air. */
  private stepLeap() {
    const it = this.it, L = it.leap;
    if (!L) return false;
    const k = (this.game.tick - L.t0) / L.ticks;
    if (k > 1) return false;
    it.x = L.from.x + (L.to.x - L.from.x) * Math.min(1, k);
    it.y = L.from.y + (L.to.y - L.from.y) * Math.min(1, k);
    // Drawn by her flare it faces her; a jump of its own faces where it is going.
    const sol = this.spot(SOL_ID), toHer = this.part === "flare" || this.her.doing === "windup";
    it.face = toHer ? Math.atan2(sol.y - it.y, sol.x - it.x) : Math.atan2(L.to.y - L.from.y, L.to.x - L.from.x);
    return true;
  }

  private stepShard() {
    const S = OFFSPRING.shard, full = OFFSPRING.light.shard, D = OFFSPRING.dark;
    // The dark: a covered shard keeps a glow it can follow for dark.glow ticks, though it lights nothing for him.
    const dim = D.on && OFFSPRING.hunt.on && D.glow ? D.glow : S.dim;
    this.shard.glow = this.shard.shown ? full : Math.max(0, this.shard.glow - full / dim);
  }

  /** Near enough its back to pull from the wound (wound.reach; 0 for anywhere). */
  private inReach() {
    const W = OFFSPRING.wound, me = this.spot(YOU);
    return !W.reach || Math.hypot(me.x - this.it.x, me.y - this.it.y) <= W.reach + OFFSPRING.it.size / 2;
  }

  /** The wound shuts when the shard is covered, and when her hold ends (from round 2, with the shard out, not: it stays open, loose). In the kill it shuts: the last press is a strike while it drinks. */
  private stepWound() {
    const keep = (OFFSPRING.hunt.on || (OFFSPRING.wound.loose && this.cycle >= OFFSPRING.wound.looseFrom)) && this.wound.open;
    if (!this.shard.shown || (!this.it.held && !keep)) {
      if (this.wound.open && !this.it.held) this.hurtUntil = this.game.tick + (OFFSPRING.dark.on && OFFSPRING.hunt.on ? OFFSPRING.dark.hurt : OFFSPRING.shard.dim);
      this.wound = { open: false, timer: 0 };
      this.pulling = 0;
      return;
    }
    // In the kill it is empty, so the wound has nothing left to give: it shuts, and the kill is a strike in its back while it drinks (Ladi, 27 Nov 10:03 PM).
    if (this.wound.open && this.part === "kill") {
      this.wound = { open: false, timer: 0 };
      this.pulling = 0;
    }
  }

  /** The kill's last press: it is at the fire drinking (empty; her blast may hold it there too), and he is behind it. */
  private atFire() {
    const I = OFFSPRING.it, c = this.game.board.center;
    return Math.hypot(c.x - this.it.x, c.y - this.it.y) <= I.reachBrazier + I.size / 2 + 0.1;
  }
  private killable() {
    const L = this.it.leap;
    return this.part === "kill" && this.atFire() && this.behind() && !(L && this.game.tick - L.t0 <= L.ticks);
  }

  /** Whether he is behind it, near enough to strike (OFFSPRING.wound). */
  private behind() {
    const W = OFFSPRING.wound, it = this.it, me = this.spot(YOU);
    const d = Math.hypot(me.x - it.x, me.y - it.y);
    let off = Math.atan2(me.y - it.y, me.x - it.x) - it.face;
    while (off > Math.PI) off -= 2 * Math.PI;
    while (off < -Math.PI) off += 2 * Math.PI;
    return d <= W.near + OFFSPRING.it.size / 2 && Math.abs(off) >= (W.behind * Math.PI) / 180;
  }

  /** A tap on its back. With the wound open, a pull. Held, with the shard out and him behind it, a strike: the wound opens. In the kill, a strike at the fire ends it. */
  private hit() {
    if (this.down > 0) return;
    // The kill: only a strike in its back while it drinks at the fire ends it (Ladi, 27 Nov 10:03 PM).
    if (this.part === "kill") {
      if (!this.killable()) return;
      this.shard.shown = true;
      return this.win();
    }
    if (this.wound.open) {
      if (this.pulling || !this.inside.size) return;
      // Out of reach a tap is not silent: the "too far" hint for a moment (its ring is already dim).
      if (!this.inReach()) return void (this.teach.far = this.game.tick + OFFSPRING.teach.farTicks);
      this.pulling = OFFSPRING.wound.pull;
      this.game.command(YOU, { action: { kind: "idle" } });
      return;
    }
    if (OFFSPRING.hunt.on) {
      // The hunt: a strike from behind whenever it isn't looking, held or not. He strikes with the shard, so it is out from here.
      const L = this.it.leap;
      if ((L && this.game.tick - L.t0 <= L.ticks) || !this.behind()) return;
      // Away after its jump it can't be struck (the view shows the tap turned aside).
      if (OFFSPRING.hunt.safe && this.game.tick < this.awayUntil) return void (this.wardAt = this.game.tick);
      this.shard.shown = true;
      this.wound = { open: true, timer: 0 };
      this.stats.strikes++;
      return;
    }
    if (!this.it.held || !this.shard.shown || !this.behind()) return;
    this.wound.open = true;
  }

  /** Solenne's order for a teaching step, once a run, and never on a retry. */
  private say(key: keyof typeof OFFSPRING.teach.say | keyof typeof OFFSPRING.teach.huntSay) {
    if (this.teach.retry || this.teach.said.has(key)) return;
    this.teach.said.add(key);
    const T = OFFSPRING.teach, hunt = OFFSPRING.hunt.on && this.run === 4 && key in T.huntSay;
    // Over her, as her other lines are; text only, no voice yet.
    this.lines.push({ who: SOLENNE, text: hunt ? T.huntSay[key as keyof typeof T.huntSay] : T.say[key as keyof typeof T.say], player: SOL_ID, quiet: true });
  }

  /** Run 4's teaching: which step's hint is up, and its caption the first time. */
  private stepTeach() {
    const T = OFFSPRING.teach, g = this.game, t = this.teach, her = this.her, it = this.it;
    let id: Hint | null = null;
    const HU = OFFSPRING.hunt.on;
    // The hunt has no step to show the shard: the strike brings it out.
    const steps = (): Hint => (!this.wound.open ? (HU || this.shard.shown ? "strike" : "show") : "pull");
    if (HU) {
      // Round 1's stun waits for his first tear: strike, pull. Then, the first fallen light: send it home. And the first time its eye turns: get out of it.
      if (this.cycle === 1 && her.doing === "hold" && !t.pulled && this.part !== "kill") id = steps();
      else if (t.pulled && !t.homed && this.strays().length) id = "home";
      if (this.eye > 0 && !t.eyed) (t.eyed = true), (t.timed = { id: "eye", until: g.tick + OFFSPRING.eye.ticks + 2 });
    } else if (her.doing === "hold" && this.part !== "kill") {
      if (this.cycle === 1) id = t.pulled ? (this.shard.shown && her.left <= T.coverAt ? "cover" : null) : steps();
      else if (t.remind && !t.held) id = steps();
    }
    if (HU && t.timed?.id === "eye" && g.tick < t.timed.until) id = "eye";
    // A tap on the wound from too far: say so, over any other hint, while the wound is open.
    if (g.tick < t.far && this.wound.open) id = "far";
    // The first loose wound: her word as she lets go, and the hint while it stays open.
    else if (t.loose === this.cycle && this.wound.open && !it.held && her.doing === "rest") id = "loose";
    // Round 2: the first time it eats from the brazier, the lure.
    if (this.cycle === 2 && !t.lure && her.doing === "rest" && it.after === "brazier" && it.eat > 0) {
      t.lure = true;
      t.timed = { id: "lure", until: g.tick + T.hintTicks };
    }
    if (!id && t.timed && g.tick < t.timed.until) id = t.timed.id;
    // Her order: at once for the shard, the cover, the lure and the loose wound; the strike and the pull only if he waits.
    t.wait = id !== t.hint ? 0 : id === "pull" || (id === "strike" && this.behind()) ? t.wait + 1 : t.wait;
    // In the hunt, her four lines: each the first time its hint shows.
    if (HU && id && id in T.huntSay && id !== t.hint) this.say(id as keyof typeof T.huntSay);
    else if (id && id !== "far" && id !== "home" && id !== "eye" && !(HU && id in T.huntSay) && (id === "strike" || id === "pull" ? t.wait >= T.wait : id !== t.hint)) this.say(id);
    t.hint = id;
  }

  /** A pull: one wisp torn out of the wound, lit, flying to him on its own wherever he stands (fly). */
  private tearOut() {
    const g = this.game, it = this.it, id = [...this.inside][0];
    if (id === undefined) return;
    const w = g.wisps[id]!;
    const back = OFFSPRING.it.size / 2 + 0.5, bx = Math.round(it.x - Math.cos(it.face) * back), by = Math.round(it.y - Math.sin(it.face) * back);
    let at = pt(bx, by);
    if (!g.board.inside(at) || g.board.tile(at) !== Tile.Floor) at = pt(Math.round(it.x), Math.round(it.y));
    this.inside.delete(id);
    g.away.delete(id);
    const HU = OFFSPRING.hunt;
    const flung = HU.on && HU.fling && (!it.held || (!HU.home && HU.flingHeld));
    if (flung) {
      // Flung out of the wound: it lands some tiles off, anywhere round it, and lies there lit until he sends it home.
      const c = g.board.center;
      for (let k = 0; k < 30; k++) {
        const a = this.rng.next() * 2 * Math.PI, d = HU.fling + (this.rng.next() * 2 - 1) * HU.flingSpread;
        const q = pt(Math.round(it.x + Math.cos(a) * d), Math.round(it.y + Math.sin(a) * d));
        if (g.board.inside(q) && g.board.tile(q) === Tile.Floor && oyRoom(q.x - c.x, q.y - c.y) < -0.5 && Math.max(Math.abs(q.x - c.x), Math.abs(q.y - c.y)) > 3) {
          at = q;
          break;
        }
      }
      this.flung = [...this.flung.filter((q) => g.tick - q.tick <= 2), { id, from: { x: bx, y: by }, to: { x: at.x, y: at.y }, tick: g.tick }];
    }
    moveWisp(w, at);
    if (!flung && !(HU.on && !HU.home)) this.torn.add(id);
    this.lit.add(id);
    if (!(HU.on && !HU.home)) g.noBank.add(id);
    this.teach.pulled = this.teach.held = true;
    // Round 1's waiting hold ends after a few pulls (down to the cover step).
    if (this.cycle === 1 && ++this.teach.pulls >= OFFSPRING.teach.pulls1) this.her.left = Math.min(this.her.left, OFFSPRING.teach.coverAt);
    if (this.teach.remind) (this.teach.remind = false), (this.teach.reminded = true);
    if (HU.on && HU.tears && ++this.wound.timer >= HU.tears && (!it.held || (!HU.home && HU.flingHeld))) {
      this.wound = { open: false, timer: 0 };
      // Held by her blast it can't jump yet: it goes the moment she lets go.
      if (it.held) this.boltDue = true;
      else if (HU.bolt && this.inside.size) this.bolt();
    }
  }

  /** It reached him while it was after the shard. The first time she saves him. */
  private caught() {
    const O = OFFSPRING, H = O.her, g = this.game, me = this.spot(YOU);
    this.catches++;
    // A catch ends its look: one gaze catches once.
    this.eye = this.gaze = 0;
    // A catch shuts the wound and his hand closes on the shard, so the save is a real second chance.
    if (O.wound.loose) {
      this.shard = { shown: false, glow: 0 };
      this.wound = { open: false, timer: 0 };
      this.pulling = 0;
    }
    if (this.catches >= 2) return this.lose();
    this.her.light = H.afterSave;
    this.her.doing = "rest";
    this.her.left = 0;
    this.her.flash = { kind: "save", tick: g.tick };
    this.knockBack(me, H.saveKnock);
    this.it.dazed = g.tick + H.saveDaze;
    const text = O.saved[Math.floor(this.rng.next() * O.saved.length)]!;
    this.lines.push({ who: SOLENNE, text, player: SOL_ID });
    this.captions.push({ who: SOLENNE, text, until: g.tick + O.captionTicks });
  }

  // ---------------------------------------------------------------- the end

  lostTo = "";
  private boltDue = false;
  /** Until this tick it is away after a jump to safety, and nothing can touch it (Ladi, 27 Nov 5:17 PM). */
  private awayUntil = -1;
  /** The tick his last tap on it was turned aside while it was untouchable (the view). */
  private wardAt = -99;
  /** The jump: where it fled from and to, and when (for the view's trail of light it leaves). */
  private bolted: { from: { x: number; y: number }; to: { x: number; y: number }; t0: number; ticks: number; away: number } | null = null;
  private lose() {
    this.lostTo = this.catches >= 2 ? "caught" : "fen";
    this.finish(this.run === 3 ? OFFSPRING.card.again3 : OFFSPRING.card.again4);
  }

  private win() {
    // Its death plays out first: nothing moves while its light leaves it, then the card.
    const D = OFFSPRING.death;
    if (D.ticks > 0 && !this.dying) {
      this.dying = { t0: this.game.tick, ticks: D.ticks };
      this.eye = this.gaze = 0;
      this.broadcastTick();
      return;
    }
    // A tap while it dies changes nothing.
    if (this.dying && this.game.tick < this.dying.t0 + this.dying.ticks) return;
    this.finish(OFFSPRING.card.won);
  }
  /** The kill under way (OFFSPRING.death), or null. */
  private dying: { t0: number; ticks: number } | null = null;

  private finish(summary: string) {
    this.phase = "results";
    this.end = { banked: this.banked.size, kes: 0, summary, lines: [] };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

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

  fightView(): Fight {
    const O = OFFSPRING, g = this.game, it = this.it, sol = this.spot(SOL_ID), fen = this.spot(FEN_ID);
    // The dark: unseen, nothing of it is drawn (no body, no back, no line to what it is after, no landing mark).
    // Its jump to safety is seen all the way (it flees hurt into the dark), and leaves a trail until it is back.
    const B = this.bolted && g.tick <= this.bolted.t0 + this.bolted.ticks + this.bolted.away ? this.bolted : null, fleeing = !!B && g.tick <= B.t0 + B.ticks;
    const dark = this.run === 4 && O.dark.on && O.hunt.on, body = !dark || fleeing || this.seen(false);
    const safe = this.run === 4 && O.hunt.on && O.hunt.safe && g.tick < this.awayUntil;
    const l = it.held || !body ? null : this.lights().find((x) => x.key === it.key);
    return {
      run: this.run,
      part: this.part,
      tick: g.tick,
      it: { x: it.x, y: it.y, face: it.face, after: it.held ? "her" : it.after, ...(l ? { to: { x: l.at.x, y: l.at.y } } : {}), inside: this.inside.size, held: it.held, wound: this.wound.open ? 1 : 0, knocked: it.knocked, ...(it.eat > 0 ? { eating: true } : {}), ...(!body ? { hidden: true } : {}), ...((this.wound.open || g.tick < this.hurtUntil) && O.wound.crawl ? { crawl: true as const } : {}), ...(this.run === 4 && body && !safe && !this.wound.open && this.part !== "flare" ? (O.hunt.on ? (this.behind() && (this.part !== "kill" || this.atFire()) && !(it.leap && g.tick <= it.leap.t0 + it.leap.ticks) ? { strike: 2 as const } : {}) : it.held && this.shard.shown ? { strike: this.behind() ? (2 as const) : (1 as const) } : {}) : {}), ...(body && it.leap && g.tick <= it.leap.t0 + it.leap.ticks + 1 ? { leap: it.leap } : {}) },
      her: { x: sol.x, y: sol.y, light: this.her.light, full: O.her.full, glow: this.herGlow(), doing: this.part === "flare" ? "hold" : this.her.doing, left: this.her.left, of: this.her.of, ...(this.her.flash ? { flash: this.her.flash } : {}) },
      fen: { x: fen.x, y: fen.y, light: this.fenLight },
      ...(this.run === 4 ? { shard: { shown: this.shard.shown, glow: this.shard.glow, of: O.light.shard } } : {}),
      banked: this.banked.size,
      wisps: O.wisps.length,
      asleep: g.wisps.filter((w) => !g.away.has(w.id) && !this.lit.has(w.id)).map((w) => w.id),
      cycle: this.cycle,
      catches: this.catches,
      down: this.down,
      ...(this.thrown && g.tick <= this.thrown.tick + this.thrown.ticks + 1 ? { thrown: this.thrown } : {}),
      pulling: this.pulling,
      // Its eye turning (left of of), then its gaze holding (gaze of hold, the eye fully turned), seen at any distance.
      ...(this.run === 4 && O.hunt.on && O.eye.on && (this.eye > 0 || this.gaze > 0) ? { eye: { left: this.eye, of: O.eye.ticks, cone: O.eye.cone, r: O.eye.range + O.eye.slack, ...(this.eye === 0 ? { gaze: this.gaze, hold: O.eye.hold } : {}) } } : {}),
      ...(dark ? { dark: this.pools() } : {}),
      ...(B ? { bolt: B } : {}),
      ...(this.dying ? { dying: this.dying } : {}),
      // Away after its jump: untouchable for `left` of `of` ticks, and her charge waits as long.
      ...(safe ? { safe: { left: this.awayUntil - g.tick, of: O.hunt.boltTicks + O.hunt.away, ...(g.tick - this.wardAt <= 1 ? { ward: this.wardAt } : {}) } } : {}),
      ...(this.run === 4 && O.hunt.on && O.hunt.block && this.onFire() ? { shut: true } : {}),
      ...(this.flung.length ? { flung: this.flung.filter((q) => g.tick - q.tick <= 2) } : {}),
      ...(this.run === 4 ? { teach: { ...(this.teach.hint ? { hint: this.teach.hint } : {}), ...(this.teach.retry ? { retry: true } : {}), ...(this.standAt() ? { stand: this.standAt()! } : {}) } } : {}),
    };
  }

  /**
   * The dark: the pools of light on the ground (each light's reach of its body, so the edge is where it
   * starts to show), and where it is to be heard from: its distance from Rook to its body edge, and its
   * offset from him (for the knock's gain and pan). Also, whether her light fills the yard.
   */
  private pools() {
    const D = OFFSPRING.dark, g = this.game, c = g.board.center, half = OFFSPRING.it.size / 2, me = this.spot(YOU), it = this.it, sol = this.spot(SOL_ID), fen = this.spot(FEN_ID);
    const pools: { k: "rook" | "shard" | "fire" | "wisp" | "her" | "fen"; x: number; y: number; r: number }[] = [
      { k: this.shard.shown ? "shard" : "rook", x: me.x, y: me.y, r: (this.shard.shown ? D.shard : D.rook) + half },
      { k: "her", x: sol.x, y: sol.y, r: D.her + D.perHer * this.her.light + half },
      { k: "fen", x: fen.x, y: fen.y, r: D.fen + half },
    ];
    if (this.banked.size) pools.push({ k: "fire", x: c.x, y: c.y, r: D.brazier + D.perBanked * this.banked.size + half });
    for (const w of g.wisps) if (!g.away.has(w.id) && !this.banked.has(w.id) && this.lit.has(w.id)) pools.push({ k: "wisp", x: w.pos.x, y: w.pos.y, r: D.wisp + half });
    const flood = it.held || this.her.doing === "windup" || this.part === "kill";
    return { pools, hear: { d: Math.max(0, Math.hypot(it.x - me.x, it.y - me.y) - half), dx: it.x - me.x, dy: it.y - me.y }, ...(flood ? { flood: true as const } : {}) };
  }

  /** The hunt: light torn out that lies where it fell, lit, waiting for his tap to send it home. */
  private strays() {
    const g = this.game;
    // With real pulls (hunt.home 0) it is any lit light lying loose: not in it, not banked, not on its way home.
    if (!OFFSPRING.hunt.home) return g.wisps.filter((w) => this.lit.has(w.id) && !this.inside.has(w.id) && !this.banked.has(w.id) && !this.torn.has(w.id) && !g.away.has(w.id));
    return g.wisps.filter((w) => g.noBank.has(w.id) && !this.torn.has(w.id) && !g.away.has(w.id));
  }

  /** Round 1's mark where to stand, while the steps are not done: close behind it to strike, then past the brazier to pull (in the hunt, where he struck). */
  private standAt() {
    if (this.cycle !== 1 || this.her.doing !== "hold" || this.teach.pulled) return null;
    if (OFFSPRING.hunt.on && this.wound.open) return null;
    const g = this.game, c = g.board.center, it = this.it, free = (at: Pt) => g.board.inside(at) && g.board.tile(at) === Tile.Floor;
    if (!this.wound.open) {
      const back = OFFSPRING.it.size / 2 + Math.min(1, OFFSPRING.wound.near / 2);
      for (const d of [back, back + 0.5, back - 0.5]) {
        const at = pt(Math.round(it.x - Math.cos(it.face) * d), Math.round(it.y - Math.sin(it.face) * d));
        if (free(at)) return { x: at.x, y: at.y };
      }
    }
    // Past the fire, where the pulled wisps fly home through it: off the bank zone if that is within reach of its back, else the nearest open tile that is.
    const a = Math.atan2(c.y - it.y, c.x - it.x), W = OFFSPRING.wound;
    const near = (at: Pt) => !W.reach || Math.hypot(at.x - it.x, at.y - it.y) <= W.reach + OFFSPRING.it.size / 2;
    const ks = Array.from({ length: 4 }, (_, i) => OFFSPRING.teach.mark + i).map((k) => pt(Math.round(c.x + Math.cos(a) * k), Math.round(c.y + Math.sin(a) * k)));
    const at = ks.find((q) => free(q) && near(q) && !g.board.inBankZone(q)) ?? ks.find((q) => free(q) && near(q)) ?? ks.find((q) => free(q) && !g.board.inBankZone(q));
    return at ? { x: at.x, y: at.y } : null;
  }

  storyView(): StoryView {
    const O = OFFSPRING, g = this.game, now = g.tick, f = this.fightView();
    const caption = this.phase === "playing" ? this.captions.filter((c) => now < c.until).map((c) => ({ who: c.who, text: c.text })) : [];
    // Ladi, 27 Nov 1:34 PM: a meter, not brightness, is the readout. Its light as 10 pips: in run 3
    // a pip for each wisp it has eaten; in run 4 a tug of war, its side against the brazier's, strays
    // between. Her light is a ring at her feet, notched where her next shove (run 3) or blast (run 4) is.
    const loose = f.wisps - f.it.inside - f.banked;
    const strip: NonNullable<StoryView["opt"]>["strip"] = [
      { label: this.run === 3 ? "Its light" : "Its light / the brazier", n: f.it.inside, of: f.wisps, tone: "us", tug: this.run === 3 ? { mine: f.it.inside, loose: 0, bank: 0 } : { mine: f.it.inside, loose, bank: f.banked, fen: f.fen.light } },
    ];
    if (f.her.doing !== "rest") strip.push({ label: f.her.doing === "hold" ? "Her hold" : f.safe ? "Solenne: waiting" : "Solenne: winding up", n: 0, of: 0, tone: "her", bar: f.her.of ? Math.max(0, f.her.left / f.her.of) : 0, steady: true });
    if (f.shard) strip.push({ label: f.shard.shown ? "Shard: uncovered" : f.shard.glow > 0 ? "Shard: dimming" : "Shard: hidden", n: 0, of: 0, tone: "chalk", bar: f.shard.glow / f.shard.of, steady: true });
    // In run 4 the boy's light matters too: a marker on the bar from the brazier's end, and a ring at his feet.
    const feet: NonNullable<NonNullable<StoryView["opt"]>["feet"]> = [{ x: f.her.x, y: f.her.y, f: f.her.light / f.her.full, mark: (this.run === 3 ? O.her.shove : f.her.full) / f.her.full, tone: "her", ...(f.teach?.hint === "cover" ? { flash: true } : {}), ...(f.safe && f.her.doing !== "hold" ? { paused: f.safe.left / f.safe.of } : {}) }];
    if (this.run === 4) feet.push({ x: f.fen.x, y: f.fen.y, f: f.fen.light / O.light.fenMax, tone: "fen" });
    // Where to tap: its back, held with the shard out (live from behind it), or the open wound.
    const lp = f.it.leap, land = lp && !f.bolt && f.tick < lp.t0 + lp.ticks ? { x: lp.to.x, y: lp.to.y, r: O.it.size / 2 } : null;
    const back = O.it.size * 0.25, hit = !f.it.hidden && (f.it.strike || f.it.wound) ? { x: f.it.x - Math.cos(f.it.face) * back, y: f.it.y - Math.sin(f.it.face) * back, live: f.it.strike === 2 || (f.it.wound > 0 && this.inReach()) } : null;
    return {
      run: this.run === 3 ? O.run3 : O.run4,
      movement: 0,
      title: O.title,
      ring: null,
      mark: this.part === "open" ? { wisp: 0, who: ROOK } : null,
      kes: 0,
      end: this.end,
      opt: { id: "fight", noPush: true, strip, feet, ...(hit ? { hit } : {}), ...(f.eye ? { cone: { x: f.it.x, y: f.it.y, face: f.it.face, deg: f.eye.cone, near: O.it.size / 2, far: O.it.size / 2 + f.eye.r, k: 1 - f.eye.left / f.eye.of } } : {}), ...(land ? { land } : {}), ...(f.teach?.stand ? { stand: f.teach.stand } : {}), ...(caption.length ? { caption } : {}) },
      fight: f,
    };
  }

  view(): RoomView {
    const one = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: id !== YOU });
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: OFFSPRING.shrine,
      teams: 2,
      players: [one(YOU, ROOK), one(SOL_ID, SOLENNE), one(FEN_ID, FEN)],
      countdown: this.countdown,
      lastScores: this.end ? [this.end.banked, 0] : null,
      roundTicks: this.game.roundTicks,
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

  /** For tests: the live state itself, to set up a moment. */
  get inner() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const room = this;
    return {
      it: this.it, her: this.her, shard: this.shard, inside: this.inside, banked: this.banked, torn: this.torn, lit: this.lit, teach: this.teach,
      get cycle() {
        return room.cycle;
      },
      set cycle(v: number) {
        room.cycle = v;
      },
      get wound() {
        return room.wound;
      },
    };
  }

  /** For tests. */
  get state() {
    return { phase: this.phase, game: this.game, end: this.end, run: this.run, part: this.part, it: { ...this.it }, her: { ...this.her }, inside: this.inside.size, banked: this.banked.size, catches: this.catches, down: this.down, shard: { ...this.shard }, wound: this.wound.open, cycle: this.cycle, fen: this.fenLight };
  }
}
