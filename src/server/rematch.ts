// Optional run 1, Granny's rematch, played in the page (gameplay/optional-runs-prototype-brief.md).
// Hesta alone, walking, against Lumi (captain), Nell, Sefa and Rook (the player). First to five,
// and she starts on one. She keeps a point ahead in plain sight: her wisps wait on the rim and go
// in when theirs do. Each rematch has one cheat of hers, in turn, and the player's choice is what
// to do about it: read it and the children end on four; walk into it and they end on three. She
// always wins by one or two. What can be won is the chalked best on the pond wall.
// Numbers are in REMATCH (src/engine/rematch.ts).

import { Mover, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { bankDistances, botCommand, planSpot } from "../engine/bot.js";
import { Game, PULL_REACH, Rng, TICK_MS, type Command, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { REMATCH, cheatOf, type Cheat } from "../engine/rematch.js";
import { cleanAction, lineTicks, moveWisp } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, LUMI_ID = 2, NELL_ID = 3, SEFA_ID = 4, HESTA_ID = 5;
const ROOK = "Rook", LUMI = "Lumi", HESTA = "Hesta", NELL = "Nell", SEFA = "Sefa";

/** A stand-in for the player, for the sums: plays it straight and takes no notice of her cheat, reads the cheat, or stands still. */
export type Stand = "ignore" | "smart" | "idle";

export class RematchRoom {
  /** What the wall says: the children's best against her. The page keeps it between visits. */
  wall = REMATCH.wallStart;
  /** Rematches played before this one: it picks her cheat and her age. */
  count = 0;
  /** A cheat picked by hand (?cheat=hold, goal or nap); otherwise they take turns. */
  cheatPick: Cheat | null = null;
  /** ?granny=beatable: she plays it straight and can lose, for comparison. */
  beatable = false;
  /** A stand-in plays the player's part (the sums). */
  stand: Stand | null = null;

  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  private dist!: Int16Array;
  private said = new Set<string>();
  private queue: { line: StoryLine; trigger: number; key: boolean; land?: number }[] = [];
  private busyUntil = 0;
  private captions: { who: string; text: string; until: number }[] = [];

  private cheat: Cheat = "hold";
  private stage: "before" | "on" | "done" = "before";
  /** How her cheat came out: read ("dodged") or walked into ("landed"). */
  private outcome: "dodged" | "landed" | null = null;
  /** How many more than theirs she lets herself have: one, or two once her cheat has landed. */
  private lead = 0;
  /** The tick from which her next wisp may go in. */
  private answerAt = 0;
  private pushes = 0;
  private lastPushedBy: number | null = null;
  private rushing = false;
  /** The hold: the wisp she is looking at, the one held, and until when. */
  private eye: number | null = null;
  private eyeAt = 0;
  private held: number | null = null;
  private heldUntil = 0;
  private castUntil = 0;
  /** The moved goal: where, the tick it moves, and the tick it goes back. */
  private over: Pt | null = null;
  private moveAt = 0;
  private backAt = 0;
  /** The nap: from when and until when. */
  private napFrom = -1;
  private napUntil = -1;
  private doubled = false;
  /** The record at the end. */
  private record: { best: number; was: number; won: boolean; count: number } | null = null;
  /** Ticks each held wisp has not moved. */
  private still = new Map<number, number>();
  private benched = new Map<number, number>();
  private fetching = { id: -1, from: pt(0, 0), last: pt(0, 0), still: 0, bad: new Set<number>() };

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
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
        return this.begin();
      case "lobby":
        if (this.phase === "results") this.begin();
        return;
      case "act": {
        if (this.phase !== "playing" || this.stand) return;
        const action = cleanAction(msg.action, this.game);
        this.game.command(YOU, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    const shrine = shrineById(REMATCH.shrine);
    const roster = [
      { id: YOU, guild: 0 as Guild, name: ROOK },
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
      { id: NELL_ID, guild: 0 as Guild, name: NELL },
      { id: SEFA_ID, guild: 0 as Guild, name: SEFA },
      { id: HESTA_ID, guild: 1 as Guild, name: HESTA },
    ];
    const g = (this.game = new Game(shrine, roster, this.seed(), REMATCH.wisps, REMATCH.ticks));
    // The laws of water hold in every story run, and Lumi carries the water light.
    g.waterLawHere = true;
    g.tideStaysWet = true;
    g.waterLight = LUMI_ID;
    g.tidePuller = LUMI_ID;
    g.respawnPause = REMATCH.respawnPause;
    // "I start on one."
    g.scores[1] = REMATCH.head;
    g.onReturn = (w) => {
      // (Playing it straight, on her switch, hers come back as far out as theirs do: one walker against four.)
      const spot = w.guild === 1 && !this.beatable ? (this.rushing ? this.nearAltar(w) : this.nearHer(w)) : this.nearMiddle(w);
      if (spot) moveWisp(w, spot);
    };
    for (const w of g.wisps) g.onReturn(w);
    // She walks: that's her whole handicap.
    this.player(HESTA_ID).run = false;
    this.dist = bankDistances(g.board);
    this.cheat = this.cheatPick ?? cheatOf(this.count);
    this.stage = "before";
    this.outcome = null;
    this.lead = this.answerAt = this.pushes = 0;
    this.lastPushedBy = null;
    this.rushing = false;
    this.eye = this.held = null;
    this.heldUntil = this.castUntil = 0;
    this.over = null;
    this.moveAt = this.backAt = 0;
    this.napFrom = this.napUntil = -1;
    this.doubled = false;
    this.record = null;
    this.still = new Map();
    this.benched = new Map();
    this.said = new Set();
    this.queue = [];
    this.busyUntil = 0;
    this.phase = "countdown";
    // The goal, in her mouth, and what there is to win, in Nell's. Both stay up as captions.
    const goal = "First to five, and I start on one. Old lady's rules.", wall = `Wall says ${this.wall}. Beat ${this.wall}!`;
    const before = this.lines.length;
    this.say(HESTA, goal, { talk: true, mood: "grinning" });
    this.say(NELL, wall, { talk: true });
    this.countdown = REMATCH.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.captions = [{ who: HESTA, text: goal, until: REMATCH.goalTicks }, { who: NELL, text: wall, until: REMATCH.goalTicks }];
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
    this.flush();
    this.broadcastTick();
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
    this.gate();
    this.steerKids();
    if (this.stand) this.steerYou();
    this.steerHesta();
    g.step();
    this.afterStep();
    if (this.phase === "playing") this.due();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }
  private stepsOut(w: Wisp) {
    return this.dist[w.pos.y * this.game.board.width + w.pos.x] ?? 99;
  }
  private kids() {
    return this.game.scores[0]!;
  }
  private hers() {
    return this.game.scores[1]!;
  }
  /** The most the children end on: four, or three once her cheat has landed. */
  private cap() {
    return REMATCH.target - 1 - this.lead;
  }
  private napping() {
    return this.napUntil >= 0 && this.game.tick < this.napUntil;
  }
  /** The goal stands "over there" just now. */
  private moved() {
    return this.over !== null && this.game.tick >= this.moveAt && this.game.tick < this.backAt;
  }

  // ---------------------------------------------------------------- what may go in

  /**
   * Which wisps may bank on this tick. Hers wait on the rim, in plain sight, and one goes in when
   * she is owed it: she keeps `lead` more than theirs, a moment after each of their points. Theirs
   * never take them past what she allows, and while the goal stands elsewhere none goes in here.
   */
  private gate() {
    const g = this.game, T = REMATCH.target;
    g.noBank.clear();
    if (this.beatable) {
      if (this.moved()) for (const w of g.wisps) if (w.guild === 0) g.noBank.add(w.id);
      return;
    }
    const kids = this.kids(), hers = this.hers();
    const owed = hers < T && hers <= kids + this.lead;
    // While her cheat is being played she lets the score stand, so the choice reads cleanly.
    const may = owed && g.tick >= this.answerAt && (this.stage !== "on" || kids >= this.cap()) && !this.napping();
    const mine = g.wisps.filter((w) => w.guild === 1).sort((a, b) => this.stepsOut(a) - this.stepsOut(b));
    for (const w of may ? mine.slice(1) : mine) g.noBank.add(w.id);
    // Theirs: no more than the cap, even when two reach the rim together.
    let room = this.moved() ? 0 : this.cap() - kids;
    for (const w of g.wisps.filter((q) => q.guild === 0 && g.board.inBankZone(q.pos)).sort((a, b) => b.rimTicks - a.rimTicks)) {
      if (room > 0) room--;
      else g.noBank.add(w.id);
    }
  }

  // ---------------------------------------------------------------- the children

  private steerKids() {
    const g = this.game, S = REMATCH.styles;
    const bots: [number, typeof S.lumi][] = [[NELL_ID, S.nell], [SEFA_ID, S.sefa], [LUMI_ID, S.lumi]];
    const asleep = this.napping();
    for (const [i, [id, style]] of bots.entries()) {
      const p = this.player(id);
      // "Walk. Nobody run."
      p.run = !asleep;
      // The goal is over there: they let go and gather round it, and leave the bringing to him.
      if (this.over && g.tick >= this.moveAt - 2 && g.tick < this.backAt) {
        const a = (i / bots.length) * Math.PI * 2 + 0.6, at = this.freeNear(pt(Math.round(this.over.x + Math.cos(a) * 3), Math.round(this.over.y + Math.sin(a) * 3)), id);
        if (at && !samePt(at, p.pos)) {
          if (!(p.action.kind === "walk" && samePt(p.action.to, at))) g.command(id, { action: { kind: "walk", to: at } });
        } else if (p.action.kind !== "idle") g.command(id, { action: { kind: "idle" } });
        continue;
      }
      // She is looking at one of theirs, the one nearly in. Lumi has seen it, and all three stop
      // and watch her: what happens to it is his doing. If he lets it lie too long, Sefa cannot
      // bear it and brings it in herself.
      if (this.eye !== null) {
        if (id !== SEFA_ID || g.tick < this.eyeAt + REMATCH.hold.max) {
          if (p.action.kind !== "idle") g.command(id, { action: { kind: "idle" } });
          continue;
        }
        const other = g.wisps.find((w) => w.guild === 0 && w.id !== this.eye)?.id ?? null;
        const cmd = this.unseen(other, () => botCommand(g, id, REMATCH.hold.sefa, () => this.rng.next()));
        if (cmd) g.command(id, cmd);
        continue;
      }
      const cmd = botCommand(g, id, style, () => this.rng.next());
      if (cmd && !this.jammed(id)) g.command(id, cmd);
    }
  }

  /**
   * Two of them pulling one wisp from opposite sides hold it between them for ever. Once a held
   * wisp has not moved for a while, all but the one of them nearest the brazier let go of it and
   * stand a moment. True when this one is standing.
   */
  private jammed(id: number) {
    const g = this.game, p = this.player(id), c = g.board.center;
    if (g.tick < (this.benched.get(id) ?? 0)) return true;
    const w = p.beam !== null ? g.wisps[p.beam] : undefined;
    if (!w || w.guild !== 0 || (this.still.get(w.id) ?? 0) < 5) return false;
    const pullers = g.players.filter((q) => q.guild === 0 && q.beam === w.id).sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.y - c.y) - Math.hypot(b.pos.x - c.x, b.pos.y - c.y) || a.id - b.id);
    // Whoever stands with the keeper is pulling the same way, and keeps on.
    if (!pullers.length || samePt(pullers[0]!.pos, p.pos)) return false;
    this.benched.set(id, g.tick + 6);
    g.command(id, { action: { kind: "idle" } });
    return true;
  }

  /** Run `f` with one wisp out of the practice bot's sight. */
  private unseen<T>(wisp: number | null, f: () => T): T {
    const g = this.game;
    if (wisp === null || g.away.has(wisp)) return f();
    g.away.set(wisp, 1e9);
    try {
      return f();
    } finally {
      g.away.delete(wisp);
    }
  }

  /** The walkable dry tile nearest `at` that nobody else stands on. */
  private freeNear(at: Pt, id: number): Pt | null {
    const g = this.game, b = g.board;
    let best: Pt | null = null, bestD = Infinity;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const q = pt(at.x + dx, at.y + dy), d = Math.hypot(dx, dy);
        if (d >= bestD || !b.inside(q) || !b.passable(q, Mover.Walker) || g.lawWater(q) || b.inBankZone(q)) continue;
        if (g.players.some((p) => p.id !== id && samePt(p.pos, q))) continue;
        (best = q), (bestD = d);
      }
    return best;
  }

  /** Where one of theirs comes back: a free dry tile `near` tiles out from the brazier, anywhere round it. */
  private nearMiddle(w: Wisp): Pt | null {
    const [lo, hi] = REMATCH.near;
    return this.ringSpot(w, lo, hi, () => this.rng.next() * 40);
  }

  /** A free tile `rush.from` tiles out from the brazier, as near Hesta as can be, for a wisp of hers. */
  private nearAltar(w: Wisp): Pt | null {
    const me = this.player(HESTA_ID), [lo, hi] = REMATCH.hesta.rush.from;
    return this.ringSpot(w, lo, hi, (x, y) => Math.hypot(x - me.pos.x, y - me.pos.y) + this.rng.next() * 2);
  }

  private ringSpot(w: Wisp, lo: number, hi: number, cost: (x: number, y: number) => number): Pt | null {
    const g = this.game, b = g.board;
    let best: Pt | null = null, bestD = Infinity;
    for (let y = b.center.y - hi; y <= b.center.y + hi; y++)
      for (let x = b.center.x - hi; x <= b.center.x + hi; x++) {
        const p = pt(x, y);
        const r = Math.max(Math.abs(x - b.center.x), Math.abs(y - b.center.y));
        if (r < lo || r > hi || !b.inside(p) || !b.passable(p, Mover.Wisp) || b.inBankZone(p) || g.lawWater(p)) continue;
        if (g.wisps.some((o) => o !== w && samePt(o.pos, p)) || g.players.some((q) => samePt(q.pos, p))) continue;
        const d = cost(x, y);
        if (d < bestD) (bestD = d), (best = p);
      }
    return best;
  }

  /** Where one of hers comes back: dry ground a little way out from the brazier, on her side. She only walks, and the board is big. */
  private nearHer(w: Wisp): Pt | null {
    const me = this.player(HESTA_ID), [lo, hi] = REMATCH.hesta.back;
    return this.ringSpot(w, lo, hi, (x, y) => Math.hypot(x - me.pos.x, y - me.pos.y) + this.rng.next() * 5);
  }

  // ---------------------------------------------------------------- the player's stand-in

  private steerYou() {
    const g = this.game, me = this.player(YOU);
    if (this.stand === "idle") return;
    const smart = this.stand === "smart";
    // Nap time: the one who reads it walks.
    me.run = !(smart && this.napping());
    // The goal is about to move, or has: he brings the nearest of theirs to where it will be.
    if (smart && this.over && g.tick < this.backAt) {
      const o = this.over;
      const w = g.wisps.filter((q) => q.guild === 0 && !g.away.has(q.id) && !g.rooted.has(q.id) && !g.lawWater(q.pos)).sort((a, b) => Math.hypot(a.pos.x - o.x, a.pos.y - o.y) - Math.hypot(b.pos.x - o.x, b.pos.y - o.y))[0];
      if (w) return this.fetch(w, o);
    }
    const cmd = this.unseen(smart ? this.eye : null, () => botCommand(g, YOU, REMATCH.styles.you, () => this.rng.next()));
    if (cmd && !this.jammed(YOU)) g.command(YOU, cmd);
  }

  /** Bring a wisp toward `home`: pull from the tile nearest home it can be pulled from; a tile it will not move from is given up. */
  private fetch(w: Wisp, home: Pt) {
    const g = this.game, b = g.board, me = this.player(YOU), F = this.fetching;
    if (F.id !== w.id || cheb(F.from, w.pos) > 2) (F.id = w.id), (F.from = w.pos), (F.bad = new Set());
    const key = (s: Pt) => s.x * 1000 + s.y;
    const R = PULL_REACH - 1, dHome = (s: Pt) => Math.hypot(s.x - home.x, s.y - home.y);
    let at: Pt | null = null, best = dHome(w.pos) - 0.5;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const q = pt(w.pos.x + dx, w.pos.y + dy), d = dHome(q);
        if (d >= best || (Math.max(Math.abs(dx), Math.abs(dy)) < 2 && d > 0) || F.bad.has(key(q))) continue;
        if (!b.inside(q) || !b.passable(q, Mover.Walker) || !b.canSee(q, w.pos) || b.lineTiles(q, w.pos).some((t) => g.lawWater(t))) continue;
        (best = d), (at = q);
      }
    if (!at) return;
    if (!samePt(me.pos, at)) {
      F.still = 0;
      if (!(me.action.kind === "walk" && samePt(me.action.to, at))) g.command(YOU, { action: { kind: "walk", to: at } });
      return;
    }
    if (samePt(F.last, w.pos)) {
      if (++F.still >= 3) (F.still = 0), F.bad.add(key(at));
    } else F.still = 0;
    F.last = w.pos;
    if (me.action.kind === "staff" && me.action.wisp === w.id && me.mode === "pull") return;
    g.command(YOU, { action: { kind: "staff", wisp: w.id }, ...(me.mode !== "pull" ? { toggleMode: true } : {}) });
  }

  // ---------------------------------------------------------------- Hesta

  private steerHesta() {
    const g = this.game, me = this.player(HESTA_ID), H = REMATCH.hesta;
    const kids = this.kids(), hers = this.hers(), lead = hers - kids;
    const cmd = (c: Command) => g.command(HESTA_ID, c);
    const fix = (mode: "pull" | "push") => me.mode !== mode || undefined;
    // Asleep, or casting stone: she stands.
    if (this.napping() || g.tick < this.castUntil) {
      if (me.action.kind !== "idle") cmd({ action: { kind: "idle" } });
      return;
    }
    const finishing = !this.beatable && kids >= this.cap();
    if (finishing) this.rush();

    // 1. Late push: only once their wisp is about to bank, and only as give and take allows.
    if (!finishing && !this.moved() && this.eye === null && lead < H.calmLead && g.tick >= H.firstPushAfter && !this.talking()) {
      const threats = g.wisps
        .filter((w) => w.guild === 0 && !g.rooted.has(w.id) && this.stepsOut(w) > 0 && this.stepsOut(w) <= H.latePushAt && g.inReach({ ...me, mode: "push" }, w) && !g.slipsAt(HESTA_ID, w.pos))
        .sort((a, b) => this.stepsOut(a) - this.stepsOut(b));
      const threat = threats.find((w) => w.holder === null || w.holder !== this.lastPushedBy) ?? threats[0];
      const already = me.action.kind === "staff" && threat !== undefined && me.action.wisp === threat.id && me.mode === "push";
      const keen = lead <= 0 || this.rng.next() < H.evenChance;
      if (threat && (already || keen)) {
        if (!already) {
          this.pushes++;
          this.lastPushedBy = threat.holder;
        }
        return cmd({ action: { kind: "staff", wisp: threat.id }, toggleMode: fix("push") });
      }
    }

    // 2. Her own wisps: each to the rim, where it waits its turn. Never over water: she walks round.
    const live = g.wisps.filter((w) => w.guild === 1 && this.stepsOut(w) > 0 && !g.away.has(w.id) && !g.slipsAt(HESTA_ID, w.pos));
    if (me.action.kind === "staff" && me.mode === "pull") {
      const w = g.wisps[me.action.wisp];
      if (w && live.includes(w) && (w.target || me.beam !== w.id)) return;
    }
    const target = live.sort((a, b) => this.stepsOut(a) - this.stepsOut(b))[0];
    if (target && g.board.lineTiles(me.pos, target.pos).some((q) => g.lawWater(q))) {
      const round = this.dryLine(target);
      if (round && !samePt(round, me.pos)) {
        if (!(me.action.kind === "walk" && samePt(me.action.to, round))) cmd({ action: { kind: "walk", to: round }, toggleMode: fix("pull") });
        return;
      }
    }
    if (!target) {
      if (me.action.kind !== "idle") cmd({ action: { kind: "idle" }, toggleMode: fix("pull") });
      return;
    }
    const spot = planSpot(g, HESTA_ID, me.pos, target, 0, false);
    if (!spot || (spot.x === me.pos.x && spot.y === me.pos.y)) return cmd({ action: { kind: "staff", wisp: target.id }, toggleMode: fix("pull") });
    if (me.action.kind === "walk" && me.action.to.x === spot.x && me.action.to.y === spot.y) return;
    cmd({ action: { kind: "walk", to: spot }, toggleMode: fix("pull") });
  }

  /** The finish: faster pulls, and her wisps come back close to the brazier. */
  private rush() {
    const g = this.game;
    if (this.rushing) return;
    this.rushing = true;
    this.answerAt = 0;
    g.pullBoost.set(HESTA_ID, REMATCH.hesta.rush.pull);
    g.respawnPause = 0;
    for (const w of g.wisps) {
      if (w.guild !== 1 || !(g.away.has(w.id) || this.stepsOut(w) > REMATCH.hesta.rush.from[1])) continue;
      g.away.delete(w.id);
      const spot = this.nearAltar(w);
      if (spot) moveWisp(w, spot), (w.prev = w.pos);
    }
  }

  /** A tile she can pull `w` from without the pond in the way, as near her as can be. */
  private dryLine(w: Wisp): Pt | null {
    const g = this.game, b = g.board, me = this.player(HESTA_ID), c = b.center;
    let best: Pt | null = null, bestD = Infinity;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const q = pt(w.pos.x + dx, w.pos.y + dy);
        if (cheb(q, w.pos) < 2 || !b.inside(q) || !b.passable(q, Mover.Walker) || g.players.some((p) => p !== me && samePt(p.pos, q))) continue;
        if (!g.inReach({ ...me, pos: q, mode: "pull" }, w) || b.lineTiles(q, w.pos).some((t) => g.lawWater(t))) continue;
        const d = Math.hypot(q.x - me.pos.x, q.y - me.pos.y) + (cheb(q, c) > cheb(w.pos, c) ? 6 : 0);
        if (d < bestD) (bestD = d), (best = q);
      }
    return best;
  }

  // ---------------------------------------------------------------- her cheat

  private runCheat() {
    const g = this.game, kids = this.kids();
    if (this.stage === "before") {
      // Once theirs is on the board and she has answered it, and nobody is mid-sentence.
      if (kids < REMATCH.cheatAt[this.cheat] || g.tick < REMATCH.cheatAfter || this.talking()) return;
      // Too late for it: they are on their last point already.
      if (!this.beatable && kids >= this.cap()) return void (this.stage = "done");
      if (this.cheat === "hold") return this.startHold();
      if (this.cheat === "goal") return this.startGoal();
      return this.startNap();
    }
    if (this.stage !== "on") return;
    if (this.cheat === "hold") this.runHold();
    else if (this.cheat === "goal") this.runGoal();
    else this.runNap();
  }

  private settle(outcome: "dodged" | "landed") {
    this.stage = "done";
    this.outcome = outcome;
    this.eye = null;
    if (outcome === "landed") this.lead = 1;
    this.answerAt = this.game.tick + 2;
  }

  // The earth hold. She looks at the one of theirs that is nearly in: bring it to the rim and it
  // is held in the ground. The read is to leave it lying where it is and bank the other first.
  private startHold() {
    const g = this.game, [lo, hi] = REMATCH.hold.from;
    const near = g.wisps
      .filter((w) => w.guild === 0 && !g.away.has(w.id) && !g.lawWater(w.pos) && this.stepsOut(w) >= lo && this.stepsOut(w) <= hi)
      .sort((a, b) => this.stepsOut(a) - this.stepsOut(b))[0];
    if (!near) return;
    this.stage = "on";
    this.eye = near.id;
    this.eyeAt = g.tick;
    // Whoever has it lets go: she has been seen looking.
    for (const p of g.players) if (p.guild === 0 && p.id !== YOU && p.action.kind !== "idle") g.command(p.id, { action: { kind: "idle" } });
    this.say(LUMI, REMATCH.hold.line, { player: LUMI_ID }, true, REMATCH.landTicks);
  }

  private runHold() {
    const g = this.game, w = g.wisps[this.eye!]!;
    if (!g.away.has(w.id) && this.stepsOut(w) <= REMATCH.hold.at) {
      g.rooted.set(w.id, HESTA_ID);
      w.target = null;
      w.rimTicks = 0;
      this.held = w.id;
      this.heldUntil = g.tick + REMATCH.hold.ticks;
      this.castUntil = g.tick + REMATCH.hold.cast;
      this.say(HESTA, "Rock's allowed. I checked.", { player: HESTA_ID, mood: "grinning" }, true);
      return this.settle("landed");
    }
    // Their next point came from the other one: she looks away.
    if (g.banks.some((b) => b.guild === 0)) this.settle("dodged");
  }

  // "My pond, my rules." She says where the goal has always been, and a moment later it is there.
  private startGoal() {
    const g = this.game, b = g.board, [lo, hi] = REMATCH.goal.out, me = this.player(HESTA_ID);
    // Dry ground a little way out, away from her and clear of the pool.
    let best: Pt | null = null, bestD = -Infinity;
    for (let y = b.center.y - hi; y <= b.center.y + hi; y++)
      for (let x = b.center.x - hi; x <= b.center.x + hi; x++) {
        const p = pt(x, y), r = Math.hypot(x - b.center.x, y - b.center.y);
        if (r < lo || r > hi || !b.inside(p) || !b.passable(p, Mover.Walker)) continue;
        let clear = true;
        for (let dy = -3; dy <= 3 && clear; dy++) for (let dx = -3; dx <= 3; dx++) if (!b.inside(pt(x + dx, y + dy)) || g.lawWater(pt(x + dx, y + dy)) || !b.passable(pt(x + dx, y + dy), Mover.Wisp)) clear = false;
        if (!clear) continue;
        // Away from her, and not too far from one of theirs.
        const theirs = Math.min(99, ...g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id)).map((w) => Math.hypot(x - w.pos.x, y - w.pos.y)));
        if (theirs < REMATCH.goal.clear) continue;
        const d = Math.hypot(x - me.pos.x, y - me.pos.y) - REMATCH.goal.nearTheirs * theirs + this.rng.next() * 4;
        if (d > bestD) (bestD = d), (best = p);
      }
    if (!best) return void (this.stage = "done");
    this.stage = "on";
    this.over = best;
    this.moveAt = g.tick + REMATCH.goal.tell;
    this.backAt = this.moveAt + REMATCH.goal.ticks;
    this.say(HESTA, "My pond. It was always over there.", { player: HESTA_ID, mood: "grinning" }, true, REMATCH.goal.tell + 4);
  }

  private runGoal() {
    const g = this.game, o = this.over!;
    if (g.tick < this.moveAt) return;
    // They got to their last point while she was saying it: nothing moves.
    if (!this.beatable && this.kids() >= this.cap()) {
      this.over = null;
      this.stage = "done";
      return;
    }
    // One of theirs brought to where the goal stands now: it counts, and the goal goes home.
    // (Brought there and stopped: one only passing through on its way to the brazier does not.)
    const w = g.wisps.find((q) => q.guild === 0 && !g.away.has(q.id) && samePt(q.pos, q.prev) && Math.hypot(q.pos.x - o.x, q.pos.y - o.y) <= REMATCH.goal.r);
    if (w) {
      g.scores[0]!++;
      g.banks.push({ tick: g.tick, wisp: w.id, guild: 0 });
      w.target = null;
      w.holder = null;
      g.away.set(w.id, g.tick + REMATCH.respawnPause);
      this.backAt = g.tick;
      this.over = null;
      return this.settle("dodged");
    }
    if (g.tick >= this.backAt) {
      this.over = null;
      this.settle("landed");
    }
  }

  // Nap time. What goes in while she dozes counts double; a running step wakes her.
  private startNap() {
    const g = this.game, [lo, hi] = REMATCH.nap.from;
    // She shuts her eyes when one of theirs is nearly in, so there is something to walk for.
    if (!g.wisps.some((w) => w.guild === 0 && !g.away.has(w.id) && !g.lawWater(w.pos) && this.stepsOut(w) >= lo && this.stepsOut(w) <= hi)) return;
    this.stage = "on";
    this.napFrom = g.tick;
    this.napUntil = g.tick + REMATCH.nap.ticks;
    this.doubled = false;
    this.captions.push({ who: LUMI, text: "Walk. Nobody run.", until: g.tick + REMATCH.nap.ticks });
    this.say(SEFA, "She's asleep!", { player: SEFA_ID }, true);
    this.say(LUMI, "She isn't.", { player: LUMI_ID }, true);
    this.say(HESTA, "Resting my eyes.", { player: HESTA_ID, mood: "dozing" }, true);
    this.say(LUMI, "Walk. Nobody run.", { player: LUMI_ID }, true);
  }

  private runNap() {
    const g = this.game;
    const wake = (outcome: "dodged" | "landed") => {
      this.napUntil = g.tick;
      this.captions = this.captions.filter((c) => c.text !== "Walk. Nobody run.");
      this.settle(outcome);
    };
    // The first of theirs to go in counts double, and that is the end of her nap.
    if (g.banks.some((b) => b.guild === 0)) {
      g.scores[0] = Math.min(this.beatable ? REMATCH.target : REMATCH.target - 1, g.scores[0]! + 1);
      this.doubled = true;
      return wake("dodged");
    }
    const ran = g.tick >= this.napFrom + REMATCH.nap.grace && g.players.some((p) => p.guild === 0 && p.run && !samePt(p.pos, p.prev));
    if (ran || g.tick >= this.napUntil) wake("landed");
  }

  // ---------------------------------------------------------------- after each tick

  private afterStep() {
    const g = this.game, T = REMATCH.target;
    for (const w of g.wisps) this.still.set(w.id, w.holder !== null && samePt(w.pos, w.prev) && !g.rooted.has(w.id) ? (this.still.get(w.id) ?? 0) + 1 : 0);
    // The held one comes out of the ground again.
    if (this.held !== null && g.tick >= this.heldUntil) (g.rooted.delete(this.held), (this.held = null));
    const banked = g.banks.some((b) => b.guild === 0);
    this.runCheat();
    // Two of hers never go in on the same breath.
    if (g.banks.some((b) => b.guild === 1) && !this.rushing) this.answerAt = Math.max(this.answerAt, g.tick + 2);
    // She answers each of theirs a moment later.
    if (banked && this.stage !== "on") {
      const [lo, hi] = REMATCH.hesta.answer;
      this.answerAt = Math.max(this.answerAt, g.tick + lo + Math.floor(this.rng.next() * (hi - lo + 1)));
    }
    // The children guess her age: one guess a rematch.
    if (g.tick === REMATCH.ageAt) {
      this.say(SEFA, "Are you a hundred?", { player: SEFA_ID }, true);
      this.say(HESTA, REMATCH.ages[this.count % REMATCH.ages.length]!, { player: HESTA_ID }, true);
    }
    if (this.hers() >= T || this.kids() >= T || g.finished) this.finish();
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    const g = this.game, kids = g.scores[0]!, hers = g.scores[1]!;
    const was = this.wall, won = kids > was;
    this.record = { best: Math.max(was, kids), was, won, count: this.count + 1 };
    this.end = {
      banked: kids,
      kes: hers,
      summary: `The children ${kids}, Granny ${hers}. ${won ? `A new best on the wall: ${kids}.` : `The wall still says ${was}.`}`,
      lines: won
        ? [{ who: NELL, text: `${kids}! That's the most!` }, { who: HESTA, text: "Closer. Don't tell the others." }]
        : [{ who: NELL, text: `Still ${was}.` }, { who: HESTA, text: "One more. There's always one more." }],
    };
    // The next rematch starts from this one's wall, and has her next cheat.
    this.wall = this.record.best;
    this.count++;
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  /** A line. One plays at a time. `key` lines always play, in order; a quip that cannot start at once is dropped. `land`: it also stays up as a caption that many ticks. */
  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, key = !!how.talk, land?: number) {
    const line = { who, text, ...how };
    if (this.phase !== "playing") return void this.lines.push(line);
    if (!key && this.talking()) return;
    this.queue.push({ line, trigger: this.game.tick, key, land });
    this.due();
  }

  private talking() {
    return this.queue.length > 0 || this.game.tick < this.busyUntil;
  }

  private due() {
    const now = this.game.tick;
    while (this.queue.length && now >= this.busyUntil) {
      const q = this.queue.shift()!;
      this.lines.push(q.line);
      this.busyUntil = now + lineTicks(q.line);
      if (q.land) this.captions.push({ who: q.line.who, text: q.line.text, until: now + q.land });
    }
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

  storyView(): StoryView {
    const g = this.game, T = REMATCH.target, now = g.tick;
    const caption = this.phase === "playing" ? this.captions.filter((c) => now < c.until).map((c) => ({ who: c.who, text: c.text })) : [];
    return {
      run: REMATCH.run,
      movement: 0,
      title: REMATCH.title,
      ring: null,
      mark: null,
      kes: 0,
      rival: { name: HESTA, short: HESTA, score: g.scores[1]! },
      end: this.end,
      opt: {
        id: REMATCH.id,
        strip: [
          { label: "The children", n: g.scores[0]!, of: T, tone: "us", ...(this.napping() ? { badge: "x2" } : {}) },
          { label: "Granny", n: g.scores[1]!, of: T, tone: "her", ...(this.napping() ? { badge: "zzz" } : {}) },
          { label: "The wall", n: this.record?.best ?? this.wall, of: T - 1, tone: "chalk" },
        ],
        ...(caption.length ? { caption } : {}),
        ...(this.eye !== null ? { eye: { wisp: this.eye, from: HESTA_ID } } : {}),
        ...(this.over ? { goal: { x: this.over.x, y: this.over.y, r: REMATCH.goal.r, live: now >= this.moveAt, left: now >= this.moveAt ? this.backAt - now : this.moveAt - now, of: now >= this.moveAt ? REMATCH.goal.ticks : REMATCH.goal.tell } } : {}),
        ...(this.napping() ? { nap: { who: HESTA_ID, left: this.napUntil - now, of: REMATCH.nap.ticks } } : {}),
        wall: { best: this.record?.was ?? this.wall, now: g.scores[0]!, hers: g.scores[1]! },
        ...(this.record ? { record: { id: REMATCH.id, best: this.record.best, won: this.record.won, count: this.record.count } } : {}),
      },
    };
  }

  view(): RoomView {
    const kid = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: id !== YOU });
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: REMATCH.shrine,
      teams: 2,
      players: [kid(YOU, ROOK), kid(LUMI_ID, LUMI), kid(NELL_ID, NELL), kid(SEFA_ID, SEFA), { id: HESTA_ID, name: HESTA, guild: 1, flame: "frost", connected: true, bot: true }],
      countdown: this.countdown,
      lastScores: this.end ? [this.end.banked, this.end.kes] : null,
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

  /** For tests and the sums. */
  get state() {
    return { phase: this.phase, game: this.game, end: this.end, cheat: this.cheat, stage: this.stage, outcome: this.outcome, lead: this.lead, eye: this.eye, held: this.held, over: this.over, napping: this.phase === "playing" && this.napping(), doubled: this.doubled, pushes: this.pushes, record: this.record };
  }
}
