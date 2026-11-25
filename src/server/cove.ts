// Optional run 2, Lumi's lesson with Kes, played in the page (gameplay/optional-runs-prototype-brief.md).
// The player is Lumi, in the Cove of the home pond. Kes, on the shore, strings what she lands; Nell
// watches. Three full strings of three before the light goes.
// The limit is the tide. In: the flats are under water, she stands where she was when it came in,
// and her pull brings wisps to her over the water (and draws the loose ones near her). Out: the
// flats are wet stone, a wisp left on them is hers when she walks to it, and her staff slips on the
// ones in the pools. The choice is where to stand for the next tide: each tide most of the wisps
// are in one pool, on another side of the cove from the last, and she cannot reach two sides.
// A wisp she lands goes down and comes up again at the next turn of the tide; one she does not
// reach stays where it is. Numbers are in COVE (src/engine/cove.ts).

import { DIRS, Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { COVE, CV_POOLS, CV_STONES, coveLevel, coveTicks, coveTide } from "../engine/cove.js";
import { Game, Rng, TICK_MS, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { cleanAction, lineTicks, moveWisp } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, KES_ID = 2, NELL_ID = 3;
const LUMI = "Lumi", KES = "Kes", NELL = "Nell";

/**
 * A stand-in for the player, for the sums. "smart" goes where the most wisps will be in reach and
 * picks up what is left on wet stone when there is time; "near" goes to the nearest pool with
 * anything in it; "stay" picks one standing stone and never leaves it; "wander" picks a stone at
 * random each tide; "idle" stands by the fire.
 */
export type Stand = "smart" | "near" | "stay" | "wander" | "idle";

export class CoveRoom {
  /** Her best so far (wisps landed in one lesson), and lessons had: the page keeps them between visits. */
  best = 0;
  count = 0;
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
  private said = new Set<string>();
  private queue: { line: StoryLine; trigger: number; key: boolean; land?: number }[] = [];
  private busyUntil = 0;
  private captions: { who: string; text: string; until: number }[] = [];

  /** Whether the tide is in, as the board has it. */
  private isIn = false;
  private landed = 0;
  /** The side of the cove the rich pool was on last. */
  private lastSide: string | null = null;
  /** Each pool's tiles, and the dry tiles she can stand on (the shore, the apron, the stones). */
  private pools: Pt[][] = [];
  private footing: Pt[] = [];
  private record: { best: number; was: number; won: boolean; count: number } | null = null;
  /** The sums: wisps landed over water and on foot, and the tide the last one was landed on. */
  private tally = { pulled: 0, walked: 0, tides: 0 };
  /** The stand-in's plan for this low tide. */
  private plan: { tide: number; spot: Pt } | null = null;

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
    const shrine = shrineById(COVE.shrine);
    const roster = [
      { id: YOU, guild: 0 as Guild, name: LUMI },
      { id: KES_ID, guild: 0 as Guild, name: KES },
      { id: NELL_ID, guild: 0 as Guild, name: NELL },
    ];
    const g = (this.game = new Game(shrine, roster, this.seed(), [COVE.rich + COVE.singles, 0], coveTicks()));
    const b = g.board, c = b.center;
    g.waterLawHere = true;
    g.tideStaysWet = true;
    g.tideDraw = COVE.draw;
    const place = (id: number, [x, y]: readonly [number, number]) => {
      const p = this.player(id);
      p.pos = p.prev = pt(c.x + x, c.y + y);
    };
    place(YOU, COVE.lumi);
    place(KES_ID, COVE.kes);
    place(NELL_ID, COVE.nell);
    this.player(YOU).run = true;
    // The pools' tiles, and the dry ground she can get to on foot.
    this.pools = CV_POOLS.map((p) => {
      const out: Pt[] = [];
      for (let y = Math.floor(p.y - p.r); y <= Math.ceil(p.y + p.r); y++)
        for (let x = Math.floor(p.x - p.r); x <= Math.ceil(p.x + p.r); x++) if (Math.hypot(x - p.x, y - p.y) <= p.r && b.tile(pt(c.x + x, c.y + y)) === Tile.Water) out.push(pt(c.x + x, c.y + y));
      return out;
    });
    const tidal = new Set(shrine.tidal ?? []);
    const from = this.walkMap(this.player(YOU).pos);
    this.footing = [];
    for (let i = 0; i < from.length; i++) if (from[i]! >= 0 && !tidal.has(i) && b.tiles[i] === Tile.Floor) this.footing.push(pt(i % b.width, Math.floor(i / b.width)));
    // Nothing is banked at the fire here: a wisp is landed when it reaches her.
    for (const w of g.wisps) (g.noBank.add(w.id), g.away.set(w.id, 1e9));
    this.isIn = true;
    this.setTide(false);
    this.landed = 0;
    this.lastSide = null;
    this.deal(true);
    this.record = null;
    this.tally = { pulled: 0, walked: 0, tides: 0 };
    this.plan = null;
    this.said = new Set();
    this.queue = [];
    this.busyUntil = 0;
    this.phase = "countdown";
    // The goal, in Kes's mouth: it stays up as a caption.
    const goal = "Three full strings before dark, Captain. They only cross when the tide's in.";
    const before = this.lines.length;
    this.say(KES, goal, { talk: true, mood: "teaching" });
    this.countdown = COVE.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.captions = [{ who: KES, text: goal, until: COVE.goalTicks }];
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
    this.turn();
    if (this.stand) this.steerYou();
    g.step();
    this.afterStep();
    if (this.phase === "playing") this.due();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }
  private wet(at: Pt) {
    return this.game.board.tile(at) === Tile.Water;
  }
  /** The wisps left on wet stone: out of the water, with the tide out. */
  private stranded() {
    const g = this.game;
    return this.isIn ? [] : g.wisps.filter((w) => !g.away.has(w.id) && !this.wet(w.pos));
  }

  // ---------------------------------------------------------------- the tide

  /** The tide as the board has it: the flats, how far her staff reaches, and whether it holds on water. */
  private setTide(isIn: boolean) {
    const g = this.game;
    if (isIn === this.isIn) return;
    this.isIn = isIn;
    g.setTide(isIn);
    g.pullReach = isIn ? COVE.reach : COVE.feet;
    g.waterLight = g.tidePuller = isIn ? YOU : null;
  }

  /** The tide turns on this tick. */
  private turn() {
    const g = this.game, now = coveTide(g.tick);
    if (now.in === this.isIn) return;
    const me = this.player(YOU);
    this.setTide(now.in);
    if (now.in) {
      // Caught on the flats: she gets to the nearest dry ground.
      if (this.wet(me.pos)) {
        const dry = this.footing.filter((f) => !g.players.some((p) => p !== me && samePt(p.pos, f))).sort((a, b) => Math.hypot(a.x - me.pos.x, a.y - me.pos.y) - Math.hypot(b.x - me.pos.x, b.y - me.pos.y))[0];
        if (dry) me.pos = dry;
      }
      me.path = [];
      me.pathGoal = null;
      if (me.action.kind !== "idle") g.command(YOU, { action: { kind: "idle" } });
      return;
    }
    // Out: what she landed comes up again, and what is left on the flats lies on wet stone.
    this.deal(false);
    if (me.action.kind === "staff") g.command(YOU, { action: { kind: "idle" } });
    if (this.stranded().length && !this.said.has("feet")) {
      this.said.add("feet");
      this.say(KES, "Tide's out. Feet, Captain.", { player: KES_ID }, true, COVE.landTicks);
      this.say(LUMI, "I know.", { player: YOU }, true);
    }
    if (!this.said.has("turning")) {
      this.said.add("turning");
      this.say(KES, "Tide's turning. Pick your pool.", { player: KES_ID, mood: "teaching" }, true, COVE.landTicks);
    }
  }

  /**
   * The wisps she has landed come up again: `rich` of them in one pool, on another side of the
   * cove from the last, and the rest one to a pool on the other sides. The first lot is by the fire.
   */
  private deal(first: boolean) {
    const g = this.game;
    const back = g.wisps.filter((w) => g.away.has(w.id));
    if (!back.length) return;
    const count = (i: number) => g.wisps.filter((w) => !g.away.has(w.id) && this.pools[i]!.some((t) => samePt(t, w.pos))).length;
    const order = CV_POOLS.map((p, i) => ({ i, side: p.side, key: this.rng.next() }));
    const rich = first
      ? order.filter((o) => o.side === "west").sort((a, b) => a.key - b.key)[0]!
      : order.filter((o) => o.side !== this.lastSide).sort((a, b) => count(a.i) - count(b.i) || a.key - b.key)[0]!;
    this.lastSide = rich.side;
    const others = order.filter((o) => o.side !== rich.side).sort((a, b) => count(a.i) - count(b.i) || a.key - b.key);
    back.forEach((w, n) => {
      const pool = n < COVE.rich ? rich.i : others[(n - COVE.rich) % others.length]!.i;
      const free = this.pools[pool]!.filter((t) => !g.wisps.some((o) => o !== w && !g.away.has(o.id) && samePt(o.pos, t)));
      const at = free[Math.floor(this.rng.next() * free.length)] ?? this.pools[pool]![0]!;
      g.away.delete(w.id);
      moveWisp(w, at);
    });
  }

  // ---------------------------------------------------------------- after each tick

  private afterStep() {
    const g = this.game, me = this.player(YOU), need = COVE.strings * COVE.perString;
    // Landed: a wisp that has come to her over the water, or one on wet stone that she has walked to.
    for (const w of g.wisps) {
      if (g.away.has(w.id) || cheb(w.pos, me.pos) > 1 || (!this.isIn && this.wet(w.pos))) continue;
      this.land(w);
    }
    const held = me.beam !== null && !me.slipped ? g.wisps[me.beam] : undefined;
    if (this.isIn && held && !g.away.has(held.id) && this.wet(held.pos)) {
      if (!this.said.has("ha")) {
        this.said.add("ha");
        this.say(KES, "Ha! Do that again.", { player: KES_ID }, true);
      } else if (!this.said.has("far") && cheb(held.pos, me.pos) >= COVE.far && !this.talking()) {
        this.said.add("far");
        this.say(NELL, "Do the far one!", { player: NELL_ID }, true);
        this.say(LUMI, "I am doing the far one.", { player: YOU, mood: "proud" }, true);
      }
    }
    // "Your dad's busy."
    if (g.tick === 2 && !this.said.has("start")) {
      this.said.add("start");
      this.say(KES, "Your dad's busy. Show me the thing.", { player: KES_ID }, true);
      this.say(LUMI, "It's called pulling.", { player: YOU }, true);
    }
    if (this.landed >= need || g.finished) this.finish();
  }

  private land(w: Wisp) {
    const g = this.game, me = this.player(YOU);
    this.landed++;
    if (this.isIn) this.tally.pulled++;
    else this.tally.walked++;
    this.tally.tides = coveTide(g.tick).n;
    g.scores[0] = this.landed;
    g.banks.push({ tick: g.tick, wisp: w.id, guild: 0 });
    w.target = null;
    w.holder = null;
    g.away.set(w.id, 1e9);
    if (me.action.kind === "staff" && me.action.wisp === w.id) g.command(YOU, { action: { kind: "idle" } });
    // A string filled.
    const full = this.landed / COVE.perString;
    if (Number.isInteger(full) && full < COVE.strings) this.say(KES, full === 1 ? "That's one. Two to go." : "Two. One more.", { player: KES_ID }, true);
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    const need = COVE.strings * COVE.perString, n = Math.min(need, this.landed), won = n >= need;
    const strings = Math.floor(n / COVE.perString), over = n % COVE.perString;
    const word = ["No", "One", "Two", "Three"][strings] ?? String(strings);
    this.record = { best: Math.max(this.best, n), was: this.best, won, count: this.count + 1 };
    this.end = {
      banked: n,
      kes: 0,
      summary: won ? "Three full strings before dark." : `${word} full string${strings === 1 ? "" : "s"}${over ? ` and ${over === 1 ? "one" : "two"} on the next` : ""}. The light went.`,
      lines: won
        ? [{ who: KES, text: "Three strings. I'd have stopped at two." }, { who: LUMI, text: "I counted four." }, { who: KES, text: "Captain." }]
        : [{ who: KES, text: "Light's gone. Tomorrow, Captain." }],
    };
    this.best = this.record.best;
    this.count++;
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- the player's stand-in

  /** How many steps each tile is from `from` on foot, as the board is now (-1 where she cannot get). */
  private walkMap(from: Pt): Int16Array {
    const b = this.game.board, d = new Int16Array(b.width * b.height).fill(-1), q = [from];
    d[from.y * b.width + from.x] = 0;
    for (let i = 0; i < q.length; i++) {
      const p = q[i]!;
      for (const dir of DIRS) {
        const n = pt(p.x + dir.x, p.y + dir.y);
        if (!b.inside(n) || d[n.y * b.width + n.x] !== -1 || !b.canStep(p, dir.x, dir.y, Mover.Walker)) continue;
        d[n.y * b.width + n.x] = d[p.y * b.width + p.x]! + 1;
        q.push(n);
      }
    }
    return d;
  }

  /** How many of the wisps that will be afloat she could take hold of from `f`, and how far off they are in all. */
  private inReachFrom(f: Pt, skip: Set<number>) {
    const g = this.game;
    let n = 0, far = 0;
    for (const w of g.wisps) {
      if (g.away.has(w.id) || skip.has(w.id)) continue;
      const d = cheb(f, w.pos);
      if (d > COVE.reach || !g.board.canSee(f, w.pos)) continue;
      n++;
      far += d;
    }
    return { n, far };
  }

  private steerYou() {
    const g = this.game, me = this.player(YOU), b = g.board, c = b.center, tide = coveTide(g.tick);
    if (this.stand === "idle") return;
    const walk = (to: Pt) => {
      if (samePt(me.pos, to)) {
        if (me.action.kind !== "idle") g.command(YOU, { action: { kind: "idle" } });
      } else if (!(me.action.kind === "walk" && samePt(me.action.to, to))) g.command(YOU, { action: { kind: "walk", to } });
    };
    if (this.isIn) {
      // In: take hold of the nearest one in reach, and keep hold.
      if (me.action.kind === "staff" && !g.away.has(me.action.wisp) && g.inReach(me, g.wisps[me.action.wisp]!)) return;
      const next = g.wisps.filter((w) => !g.away.has(w.id) && g.inReach(me, w)).sort((x, y) => cheb(x.pos, me.pos) - cheb(y.pos, me.pos))[0];
      if (next) g.command(YOU, { action: { kind: "staff", wisp: next.id } });
      return;
    }
    // Out: where to stand for the next tide, decided once the wisps have come up.
    const from = this.walkMap(me.pos), steps = (p: Pt) => from[p.y * b.width + p.x]!;
    if (this.plan?.tide !== tide.n) {
      const stones = CV_STONES.map(([x, y]) => pt(c.x + x + 1, c.y + y)).filter((s) => steps(s) >= 0);
      let spot: Pt | undefined;
      if (this.stand === "stay") spot = this.plan?.spot ?? stones[0];
      else if (this.stand === "wander") spot = stones[Math.floor(this.rng.next() * stones.length)];
      else {
        const none = new Set<number>();
        // Only where she can be before the water is (she runs: two tiles a tick).
        const seen = this.footing.filter((f) => steps(f) >= 0 && steps(f) <= (tide.left - 1) * 2).map((f) => ({ f, ...this.inReachFrom(f, none) })).filter((s) => s.n > 0);
        spot = (this.stand === "near" ? seen.sort((x, y) => steps(x.f) - steps(y.f) || y.n - x.n) : seen.sort((x, y) => y.n - x.n || x.far - y.far || steps(x.f) - steps(y.f)))[0]?.f;
      }
      this.plan = { tide: tide.n, spot: spot ?? me.pos };
    }
    const spot = this.plan.spot;
    // What is left on wet stone, if there is time to go by it ("smart" only).
    if (this.stand === "smart") {
      const reach = (tide.left - 2) * 2;
      const stray = this.stranded()
        .map((w) => ({ w, there: steps(w.pos), on: this.walkMap(w.pos)[spot.y * b.width + spot.x]! }))
        .filter((s) => s.there >= 0 && s.on >= 0 && s.there + s.on <= reach)
        .sort((x, y) => x.there - y.there)[0];
      if (stray) {
        if (!(me.action.kind === "staff" && me.action.wisp === stray.w.id)) g.command(YOU, { action: { kind: "staff", wisp: stray.w.id } });
        return;
      }
    }
    walk(spot);
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
    const g = this.game, now = g.tick, tide = coveTide(now), need = COVE.strings * COVE.perString, light = Math.max(0, 1 - now / coveTicks());
    const caption = this.phase === "playing" ? this.captions.filter((c) => now < c.until).map((c) => ({ who: c.who, text: c.text })) : [];
    const level = coveLevel(now), soon = !tide.in && tide.left <= COVE.tide.warn;
    const stranded = this.stranded().map((w) => w.id);
    return {
      run: COVE.run,
      movement: 0,
      title: COVE.title,
      ring: null,
      mark: null,
      kes: 0,
      end: this.end,
      opt: {
        id: COVE.id,
        strip: [
          { label: "Kes's strings", n: Math.min(need, this.landed), of: need, tone: "us", group: COVE.perString },
          { label: tide.in ? "Tide in" : soon ? "Tide coming" : "Tide out", n: 0, of: 0, tone: "water", tide: { level, in: tide.in, share: tide.left / tide.of, soon } },
          { label: "Light", n: 0, of: 0, tone: "chalk", bar: light },
        ],
        ...(caption.length ? { caption } : {}),
        tide: { level, in: tide.in, left: tide.left, of: tide.of, n: tide.n },
        reach: g.pullReach,
        light,
        ...(stranded.length ? { stranded } : {}),
        ...(this.record ? { record: { id: COVE.id, best: this.record.best, won: this.record.won, count: this.record.count } } : {}),
      },
    };
  }

  view(): RoomView {
    const one = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: id !== YOU });
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: COVE.shrine,
      teams: 2,
      players: [one(YOU, LUMI), one(KES_ID, KES), one(NELL_ID, NELL)],
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
    return { phase: this.phase, game: this.game, end: this.end, landed: this.landed, isIn: this.isIn, tally: this.tally, record: this.record, stranded: this.phase === "playing" ? this.stranded().map((w) => w.id) : [] };
  }
}
