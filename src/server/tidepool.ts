// Optional run 3b, Tidepool Steps, the tide job (Marit), played in the page
// (gameplay/optional-runs-prototype-brief.md, card O3b). Rook, with Lumi to send; Marit watches
// from the court; Hesta is a voice. Eight by the turn of the tide.
// The tide comes in and goes out. Wisps come up in the top pools each time it comes in. Each time
// it goes out, every pool spills a step down and leaves its wisps on the wet stone of the step
// below; what spills off the bottom step is gone. The limit: Rook's staff slips on a wisp over
// water, so he takes one only where it has been left on stone, before the water is back. The
// choice: wait low, where every side comes down past the court, or climb the corner stairs for one
// now. Lumi, sent (the Send button, then a tap), pulls across water: what comes to her is taken.
// Numbers are in TIDEPOOL (src/engine/tidepool.ts).

import { DIRS, Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { Game, Rng, TICK_MS, type Action, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { TIDEPOOL, TP, TP_SIDES, tidepoolLevel, tidepoolTicks, tidepoolTide, tpCell, tpSide, tpStepDry, tpTiles, type TpSide } from "../engine/tidepool.js";
import { cleanAction, lineTicks, moveWisp } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, LUMI_ID = 2, MARIT_ID = 3;
const ROOK = "Rook", LUMI = "Lumi", MARIT = "Marit", HESTA = "Hesta";
const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const word = (n: number) => WORDS[n] ?? String(n);
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * A stand-in for the player, for the sums. "smart" reads where the next lot will be left and goes
 * there, low or high, and sends Lumi to the fullest pool she can get to; "solo" does the same
 * without ever sending her; "low" waits on the court and takes only what comes down past it;
 * "climb" always goes up for the highest one left on stone; "low+" and "climb+" do the same and
 * send Lumi as "smart" does; "lumi" stands by the fire and only sends her; "idle" stands by the fire.
 */
export type Stand = "smart" | "solo" | "low" | "climb" | "low+" | "climb+" | "lumi" | "idle";

/** A pool on one step of one side: its water (the deep pool and, with the tide in, its strips) and the strips it leaves wisps on. */
interface Cascade {
  k: number;
  side: TpSide;
  pool: Pt[];
  strips: Pt[];
}

export class TidepoolRoom {
  /** His best so far (wisps taken in one job), and jobs done: the page keeps them between visits. */
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

  /** Whether the tide is in, as the board has it, and how many times it has come in. */
  private isIn = true;
  private floods = 0;
  private taken = 0;
  /** Each step's pool on each side (steps 1 to TP.steps). */
  private cascades: Cascade[] = [];
  /** Each step's strips (board indices), and whether they are stone now. */
  private stepTidal: number[][] = [];
  private dry: boolean[] = [];
  /** The dry tiles anyone can stand on with the tide in. */
  private footing: Pt[] = [];
  /** The side the rich lot came up on last. */
  private lastSide: TpSide | null = null;
  /** Where Lumi was sent, while she is on her way or there. */
  private sentTo: Pt | null = null;
  /** The flood she was sent on: with sends limited, she comes back to him when the next one comes in. */
  private sentFlood = 0;
  private record: { best: number; was: number; won: boolean; count: number } | null = null;
  /** The sums: taken by him and by her, gone off the bottom, the highest step he took one from, sends, and how many he took from each step. */
  private tally = { rook: 0, lumi: 0, off: 0, high: 0, sends: 0, steps: [0, 0, 0, 0, 0, 0] as number[] };
  /** The stand-in's spot for this tide. */
  private plan: { flood: number; spot: Pt } | null = null;

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
      case "call":
        if (this.phase === "playing" && !this.stand) this.sendLumi(pt(Math.floor(Number(msg.x)), Math.floor(Number(msg.y))));
        return;
      case "act": {
        if (this.phase !== "playing" || this.stand) return;
        const action = cleanAction(msg.action, this.game);
        // He pulls: there is nothing here to push.
        this.game.command(YOU, { action, toggleRun: !!msg.toggleRun });
        if (action?.kind === "staff") this.tapped(action.wisp);
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    const shrine = shrineById(TIDEPOOL.shrine);
    const roster = [
      { id: YOU, guild: 0 as Guild, name: ROOK },
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
      { id: MARIT_ID, guild: 0 as Guild, name: MARIT },
    ];
    // Enough wisps for every lot that comes up.
    const all = TIDEPOOL.seed.reduce((a, b) => a + b, 0) + Math.max(...TIDEPOOL.rise) * TIDEPOOL.tides + 2;
    const g = (this.game = new Game(shrine, roster, this.seed(), [all, 0], tidepoolTicks()));
    const b = g.board, c = b.center;
    g.waterLawHere = true;
    g.tideStaysWet = true;
    g.waterLight = LUMI_ID;
    g.tidePuller = LUMI_ID;
    g.tideDraw = TIDEPOOL.lumiDraw;
    g.reachRule = (p, w) => cheb(p.pos, w.pos) <= (p.id === LUMI_ID ? TIDEPOOL.lumiReach : TIDEPOOL.reach);
    const place = (id: number, [x, y]: readonly [number, number]) => {
      const p = this.player(id);
      p.pos = p.prev = pt(c.x + x, c.y + y);
    };
    place(YOU, TIDEPOOL.rook);
    place(LUMI_ID, TIDEPOOL.lumi);
    place(MARIT_ID, TIDEPOOL.marit);
    this.player(YOU).run = true;
    this.player(LUMI_ID).run = true;
    // Each step's pool and strips, side by side.
    const at = (t: { x: number; y: number }) => pt(c.x + t.x, c.y + t.y);
    const pools = tpTiles("pool"), strips = tpTiles("strip");
    this.cascades = [];
    for (let k = 1; k <= TP.steps; k++)
      for (const side of TP_SIDES)
        this.cascades.push({ k, side, pool: pools.filter((t) => t.k === k && t.side === side).map(at), strips: strips.filter((t) => t.k === k && t.side === side).map(at) });
    // The dry ground (the strips are open ground on the board until the tide floods them).
    const tidal = new Set(shrine.tidal ?? []);
    const from = this.walkMap(this.player(YOU).pos);
    this.footing = [];
    for (let i = 0; i < from.length; i++) if (from[i]! >= 0 && !tidal.has(i) && b.tiles[i] === Tile.Floor) this.footing.push(pt(i % b.width, Math.floor(i / b.width)));
    // Nothing is banked at the fire: a wisp is taken when it reaches him, or her.
    for (const w of g.wisps) (g.noBank.add(w.id), g.away.set(w.id, 1e9));
    this.stepTidal = Array.from({ length: TP.steps + 1 }, () => []);
    for (const t of strips) this.stepTidal[t.k]!.push((c.y + t.y) * b.width + c.x + t.x);
    this.dry = Array.from({ length: TP.steps + 1 }, () => false);
    g.setTide(true);
    this.isIn = true;
    this.floods = 0;
    this.taken = 0;
    this.lastSide = null;
    this.sentTo = null;
    this.gone = new Set();
    // Already on the way down when he gets there, and the first lot in the top pools.
    TIDEPOOL.seed.forEach((n, i) => {
      for (let j = 0; j < n; j++) this.rise(i + 1, TP_SIDES[this.rng.int(4)]!);
    });
    this.riseTop();
    this.record = null;
    this.tally = { rook: 0, lumi: 0, off: 0, high: 0, sends: 0, steps: [0, 0, 0, 0, 0, 0] };
    this.plan = null;
    this.said = new Set();
    this.queue = [];
    this.busyUntil = 0;
    this.phase = "countdown";
    // Marit's hello, then the goal: it stays up as a caption.
    const goal = "Eight by the turn of the tide, Rook. They come down a step each tide. Take them where they land.";
    const before = this.lines.length;
    this.say(MARIT, "Rook. Lumi. The tide's in a mood.", { player: MARIT_ID });
    this.say(MARIT, goal, { talk: true });
    this.countdown = TIDEPOOL.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.captions = [{ who: MARIT, text: goal, until: TIDEPOOL.goalTicks }];
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
    this.steerLumi();
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
  private rel(p: Pt) {
    const c = this.game.board.center;
    return { x: p.x - c.x, y: p.y - c.y };
  }
  /** The step a tile is on (0 the court). */
  private stepOf(p: Pt) {
    const r = this.rel(p);
    return Math.max(0, tpCell(r.x, r.y).k);
  }
  private cascadeAt(p: Pt) {
    const r = this.rel(p), cell = tpCell(r.x, r.y);
    if (cell.kind !== "pool" && cell.kind !== "strip") return undefined;
    return this.cascades.find((q) => q.k === cell.k && q.side === tpSide(r.x, r.y));
  }
  private loose() {
    const g = this.game;
    return g.wisps.filter((w) => !g.away.has(w.id));
  }
  /** The wisps on stone: his to take (with the tide in, only ones left where he let go of them). */
  private stranded() {
    return this.loose().filter((w) => !this.wet(w.pos));
  }

  // ---------------------------------------------------------------- the tide

  /** One comes up in a step's pool on a side, on a free tile of it. */
  private rise(k: number, side: TpSide) {
    const g = this.game, q = this.cascades.find((c) => c.k === k && c.side === side)!;
    const w = g.wisps.find((x) => g.away.has(x.id) && g.away.get(x.id)! >= 1e9 && !this.gone.has(x.id));
    if (!w) return;
    const free = q.pool.filter((t) => !this.loose().some((o) => samePt(o.pos, t)));
    const to = free[this.rng.int(free.length)] ?? q.pool[0]!;
    g.away.delete(w.id);
    moveWisp(w, to);
  }
  /** Wisps that have gone for good (off the bottom, or taken). */
  private gone = new Set<number>();


  /** A new lot in the top pools: the rich part in one side's pool (never the side it was last), the rest one to a pool on others. */
  private riseTop() {
    const sides = TP_SIDES.filter((s) => s !== this.lastSide);
    const rich = sides[this.rng.int(sides.length)]!;
    this.lastSide = rich;
    const others = TP_SIDES.filter((s) => s !== rich).map((s) => ({ s, key: this.rng.next() })).sort((a, b) => a.key - b.key);
    const n = TIDEPOOL.rise[Math.min(this.floods, TIDEPOOL.rise.length - 1)] ?? 0;
    for (let i = 0; i < n; i++) this.rise(TP.steps, i < TIDEPOOL.rich ? rich : others[(i - TIDEPOOL.rich) % others.length]!.s);
  }

  /** The tide turns on this tick. */
  private turn() {
    const g = this.game, now = tidepoolTide(g.tick);
    if (now.in !== this.isIn) this.turnTide(now.in);
    // Each step's strips: the low ones drain last and flood first.
    for (let k = 1; k <= TP.steps; k++) {
      const dry = tpStepDry(g.tick, k).dry;
      if (dry === this.dry[k]) continue;
      this.dry[k] = dry;
      g.setTide(!dry, this.stepTidal[k]);
      if (!dry) this.flooded();
    }
  }

  /** Water over a strip someone is on: up onto the nearest dry stone; and his staff lets go of one gone under. */
  private flooded() {
    const g = this.game;
    for (const p of [this.player(YOU), this.player(LUMI_ID)]) {
      if (!this.wet(p.pos)) continue;
      const dry = this.footing.filter((f) => !g.players.some((o) => o !== p && samePt(o.pos, f))).sort((a, b) => cheb(a, p.pos) - cheb(b, p.pos) || Math.hypot(a.x - p.pos.x, a.y - p.pos.y) - Math.hypot(b.x - p.pos.x, b.y - p.pos.y))[0];
      if (dry) p.pos = p.prev = dry;
      p.path = [];
      p.pathGoal = null;
      if (p.id === LUMI_ID && this.sentTo && this.wet(this.sentTo)) this.sentTo = p.pos;
    }
    const me = this.player(YOU);
    if (me.action.kind === "staff" && this.wet(g.wisps[me.action.wisp]!.pos)) g.command(YOU, { action: { kind: "idle" } });
  }

  /** The tide turns: in, a new lot comes up top; out, every pool spills a step down. */
  private turnTide(isIn: boolean) {
    const g = this.game, now = { in: isIn };
    this.isIn = now.in;
    if (now.in) {
      this.floods++;
      this.riseTop();
      // Sent for one tide: she comes back to him as the next comes in.
      if (TIDEPOOL.lumiSends < 99 && this.sentTo && this.floods > this.sentFlood) this.recallLumi();
      if (this.floods === 1 && !this.said.has("turned")) {
        this.said.add("turned");
        this.say(HESTA, "Tide's turned. Wait for it.", {}, true, TIDEPOOL.landTicks);
      }
      return;
    }
    // Out: every pool spills a step down, and leaves its wisps on the strips below it.
    const me = this.player(YOU), lumi = this.player(LUMI_ID);
    let near = 0, offNow = 0;
    const spill = this.loose().filter((w) => this.wet(w.pos) || this.cascadeAt(w.pos));
    for (const w of spill) {
      const from = this.cascadeAt(w.pos);
      if (!from) continue;
      // Held by Lumi over the water: it stays with her pull.
      if (w.holder === LUMI_ID && lumi.beam === w.id) continue;
      if (from.k === 1) {
        offNow++;
        this.goneFor(w);
        continue;
      }
      const below = this.cascades.find((q) => q.k === from.k - 1 && q.side === from.side)!;
      const free = below.strips.filter((t) => !this.loose().some((o) => o !== w && samePt(o.pos, t)) && !g.players.some((p) => samePt(p.pos, t)));
      const to = free[this.rng.int(free.length)] ?? below.strips[0]!;
      moveWisp(w, to);
      if (cheb(to, me.pos) <= TIDEPOOL.reach + 1) near++;
    }
    if (this.floods >= 1 && !this.said.has("now")) {
      this.said.add("now");
      this.say(HESTA, "Now.", {}, true);
    }
    if (offNow && !this.said.has("off")) {
      this.said.add("off");
      this.say(MARIT, "That one's off the bottom step.", { player: MARIT_ID }, true, TIDEPOOL.landTicks);
    }
    if (near >= TIDEPOOL.patience && this.stepOf(me.pos) <= 1 && !this.said.has("patience")) {
      this.said.add("patience");
      this.say(MARIT, "Patience. Good.", { player: MARIT_ID }, true, TIDEPOOL.landTicks);
    }
  }

  private goneFor(w: Wisp) {
    const g = this.game;
    this.tally.off++;
    this.gone.add(w.id);
    w.target = null;
    w.holder = null;
    g.away.set(w.id, 1e9);
  }

  // ---------------------------------------------------------------- Lumi

  /** Send Lumi to a tile (the nearest she can stand on). */
  sendLumi(to: Pt) {
    const g = this.game, b = g.board;
    if (!b.inside(to) || b.tile(to) === Tile.Edge) return;
    const lumi = this.player(LUMI_ID);
    const from = this.walkMap(lumi.pos);
    const spot = [to, ...this.footing, ...this.stranded().map((w) => w.pos)]
      .filter((f) => b.passable(f, Mover.Walker) && from[f.y * b.width + f.x]! >= 0 && !g.players.some((p) => p.id !== LUMI_ID && samePt(p.pos, f)))
      .sort((a, c) => cheb(a, to) - cheb(c, to) || Math.hypot(a.x - to.x, a.y - to.y) - Math.hypot(c.x - to.x, c.y - to.y))[0];
    if (!spot || this.sendsLeft() <= 0) return;
    this.sentTo = spot;
    this.sentFlood = this.floods;
    this.tally.sends++;
    // The first time, she says she can go only so often. [placeholder line, the build thread's, for the story thread]
    if (this.tally.sends === 1 && TIDEPOOL.lumiSends < 99) this.say(LUMI, "Two goes, Rook. A tide each.", { player: LUMI_ID }, true, TIDEPOOL.landTicks);
    g.command(LUMI_ID, { action: { kind: "walk", to: spot } });
    this.flush();
    this.broadcastRoom();
  }

  /** Back to his side, and her staff off whatever it held. */
  private recallLumi() {
    const g = this.game, lumi = this.player(LUMI_ID), me = this.player(YOU);
    this.sentTo = null;
    const by = this.footing.filter((f) => !samePt(f, me.pos)).sort((a, b) => cheb(a, me.pos) - cheb(b, me.pos))[0];
    g.command(LUMI_ID, { action: by ? { kind: "walk", to: by } : { kind: "idle" } });
    void lumi;
  }

  /** How many more times she can be sent. */
  private sendsLeft() {
    return Math.max(0, TIDEPOOL.lumiSends - this.tally.sends);
  }

  private steerLumi() {
    const g = this.game, me = this.player(LUMI_ID);
    const cmd = (action: Action) => g.command(LUMI_ID, { action, toggleMode: me.mode !== "pull" || undefined });
    if (!this.sentTo) return;
    if (!samePt(me.pos, this.sentTo)) {
      if (!(me.action.kind === "walk" && samePt(me.action.to, this.sentTo))) cmd({ kind: "walk", to: this.sentTo });
      return;
    }
    // There: the nearest on the water she can bring in (on stone they are his).
    const held = me.action.kind === "staff" ? g.wisps[me.action.wisp] : undefined;
    if (held && !g.away.has(held.id) && g.inReach(me, held) && this.wet(held.pos)) return;
    const next = this.loose()
      .filter((w) => g.inReach(me, w) && w.holder !== YOU && this.wet(w.pos))
      .sort((x, y) => cheb(x.pos, me.pos) - cheb(y.pos, me.pos))[0];
    if (next) cmd({ kind: "staff", wisp: next.id });
    else if (me.action.kind !== "idle") cmd({ kind: "idle" });
  }

  // ---------------------------------------------------------------- after each tick

  /** A tap on a wisp his staff will not hold: say why, once. */
  private tapped(id: number) {
    const w = this.game.wisps[id];
    if (!w || this.game.away.has(id) || !this.wet(w.pos) || this.said.has("wet")) return;
    this.said.add("wet");
    this.captions.push({ who: "", text: "His staff slips on a wisp over water. Take it when the tide leaves it on stone, or send Lumi.", until: this.game.tick + TIDEPOOL.landTicks });
  }

  private afterStep() {
    const g = this.game, me = this.player(YOU), lumi = this.player(LUMI_ID);
    // Lumi: what comes to her over the water is hers.
    if (this.sentTo) for (const w of this.loose()) if (cheb(w.pos, lumi.pos) <= 1 && w.holder !== YOU) this.take(w, true);
    for (const w of this.loose()) if (cheb(w.pos, me.pos) <= TIDEPOOL.feet && !this.wet(w.pos) && w.holder !== LUMI_ID) this.take(w);
    if (this.taken >= TIDEPOOL.target || g.finished) this.finish();
  }

  private take(w: Wisp, byLumi = false) {
    const g = this.game, me = this.player(byLumi ? LUMI_ID : YOU);
    const k = this.stepOf(w.pos);
    this.taken++;
    if (byLumi) {
      this.tally.lumi++;
      this.cameToHer();
    } else {
      this.tally.rook++;
      this.tally.steps[k] = (this.tally.steps[k] ?? 0) + 1;
      this.tally.high = Math.max(this.tally.high, k);
    }
    g.scores[0] = this.taken;
    g.banks.push({ tick: g.tick, wisp: w.id, guild: 0 });
    this.gone.add(w.id);
    w.target = null;
    w.holder = null;
    g.away.set(w.id, 1e9);
    if (me.action.kind === "staff" && me.action.wisp === w.id) g.command(me.id, { action: { kind: "idle" } });
  }

  private cameToHer() {
    if (this.said.has("lumi")) return;
    this.said.add("lumi");
    this.say(LUMI, "They come to me.", { player: LUMI_ID, mood: "proud" }, true);
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    const n = Math.min(TIDEPOOL.target, this.taken), won = n >= TIDEPOOL.target;
    this.record = { best: Math.max(this.best, n), was: this.best, won, count: this.count + 1 };
    this.end = {
      banked: n,
      kes: 0,
      summary: won ? "Eight by the turn of the tide." : `${cap(word(n))} of eight by the turn of the tide.`,
      lines: won
        ? [{ who: MARIT, text: "As agreed. And one over, for the small one." }, { who: LUMI, text: "I'm not small." }, { who: MARIT, text: "For the lamplighter, then." }]
        : [{ who: MARIT, text: `Short by ${word(TIDEPOOL.target - n)}. Come back on the next tide.` }],
    };
    this.best = this.record.best;
    this.count++;
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- the player's stand-in

  /** How many steps each tile is from `from` on foot, as the board is now (-1 where he cannot get). */
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

  /** Whether his staff reaches a wisp at `w` from `f` and can bring it in over stone. */
  private reaches(f: Pt, w: Pt) {
    const b = this.game.board;
    return cheb(f, w) <= TIDEPOOL.reach && b.canSee(f, w) && !b.lineTiles(f, w).some((t) => this.wet(t));
  }

  private steerYou() {
    const g = this.game, me = this.player(YOU), b = g.board, tide = tidepoolTide(g.tick);
    if (this.stand === "idle") return;
    if (this.stand === "lumi") {
      if (this.isIn && this.plan?.flood !== this.floods) (this.plan = { flood: this.floods, spot: me.pos }), this.planLumi(me.pos);
      return;
    }
    const sends = this.stand === "smart" || this.stand!.endsWith("+"), stand = this.stand!.replace("+", "") as Stand;
    const from = this.walkMap(me.pos), steps = (p: Pt) => from[p.y * b.width + p.x]!;
    const walk = (to: Pt) => {
      if (samePt(me.pos, to)) {
        if (me.action.kind !== "idle") g.command(YOU, { action: { kind: "idle" } });
      } else if (!(me.action.kind === "walk" && samePt(me.action.to, to))) g.command(YOU, { action: { kind: "walk", to } });
    };
    const court = (p: Pt) => this.stepOf(p) === 0;
    // Where to wait for the next lot, decided once as the tide comes in; Lumi goes near it.
    if (this.isIn && this.plan?.flood !== this.floods) {
      this.plan = { flood: this.floods, spot: this.spotFor(stand, from) };
      if (sends) this.planLumi(this.plan.spot);
    }
    // Keep hold of one coming in over stone.
    if (me.action.kind === "staff" && !g.away.has(me.action.wisp) && !this.wet(g.wisps[me.action.wisp]!.pos) && !me.slipped) return;
    // The best one on stone he can get to: before the water covers it.
    const opts = this.stranded()
      .filter((w) => w.holder !== LUMI_ID)
      .map((w) => {
        // The nearest tile he can pull it in from.
        let best = -1;
        for (let y = w.pos.y - TIDEPOOL.reach; y <= w.pos.y + TIDEPOOL.reach; y++)
          for (let x = w.pos.x - TIDEPOOL.reach; x <= w.pos.x + TIDEPOOL.reach; x++) {
            const f = pt(x, y);
            if (!b.inside(f) || steps(f) < 0 || (stand === "low" && !court(f)) || !this.reaches(f, w.pos)) continue;
            if (best < 0 || steps(f) < best) best = steps(f);
          }
        const r = this.rel(w.pos), cell = tpCell(r.x, r.y);
        return { w, steps: best, k: this.stepOf(w.pos), dry: cell.kind === "strip" ? tpStepDry(g.tick, cell.k).left : 99 };
      })
      .filter((o) => o.steps >= 0 && (o.dry >= 99 ? o.steps <= 12 || !this.isIn : o.steps / 2 + cheb(o.w.pos, me.pos) / 4 + 1 < o.dry));
    const pick = stand === "climb" ? opts.sort((x, y) => y.k - x.k || x.steps - y.steps)[0] : opts.sort((x, y) => x.steps - y.steps || x.k - y.k)[0];
    if (pick) {
      if (!(me.action.kind === "staff" && me.action.wisp === pick.w.id)) g.command(YOU, { action: { kind: "staff", wisp: pick.w.id } });
      return;
    }
    // Nothing he can get to: wait where the next lot will be.
    walk(this.isIn ? this.plan!.spot : this.spotFor(stand, from));
  }

  /**
   * Where to wait for the tide to go out. The wisps on the water of step k will be left on the
   * strips of step k - 1 (off the bottom from step 1). "low" waits on the court across from the
   * most of them coming onto the bottom step; "climb" waits on the highest step one will be left
   * on; "smart" and "solo" wait where the most will be in reach, for the fewest steps.
   */
  private spotFor(stand: Stand, from: Int16Array): Pt {
    const g = this.game, b = g.board, me = this.player(YOU), tide = tidepoolTide(g.tick);
    const steps = (p: Pt) => from[p.y * b.width + p.x]!;
    const coming = new Map<Cascade, number>();
    for (const w of this.loose()) {
      const q = this.cascadeAt(w.pos);
      if (!q || q.k === 1 || !this.wet(w.pos)) continue;
      const below = this.cascades.find((c) => c.k === q.k - 1 && c.side === q.side)!;
      coming.set(below, (coming.get(below) ?? 0) + 1);
    }
    const lumi = this.player(LUMI_ID);
    const left = [...coming].filter(([q]) => !(this.sentTo && q.pool.some((t) => cheb(t, lumi.pos) <= TIDEPOOL.lumiReach)));
    if (!left.length) return me.pos;
    const fits = (f: Pt) => steps(f) >= 0 && (this.isIn ? steps(f) <= (tide.left + 4) * 2 : true) && !g.players.some((p) => p.id !== YOU && samePt(p.pos, f));
    if (stand === "climb") left.sort((x, y) => y[0].k - x[0].k || y[1] - x[1]);
    // "smart": if enough will still come down past the court before the end, wait low; if not, go up for the ones that won't.
    const ebbs = TIDEPOOL.tides - tide.n;
    let low = stand === "low";
    if (stand === "smart" || stand === "solo") {
      const bottom = left.reduce((a, [q, n]) => a + (q.k <= ebbs ? n : 0), 0);
      low = bottom >= TIDEPOOL.target - this.taken + 1;
    }
    let best: { f: Pt; score: number } | null = null;
    for (const f of this.footing) {
      if (!fits(f) || (low && this.stepOf(f) !== 0)) continue;
      let score = 0;
      for (const [q, n] of stand === "climb" ? left.slice(0, 1) : left) {
        // Waiting low only cares about the bottom step: that is all it will take this tide.
        if (low && q.k !== 1) continue;
        const share = q.strips.filter((t) => this.reaches(f, t)).length / q.strips.length;
        // Going up: the ones that will not get down to the court in time are what it is for.
        score += n * share * (!low && stand !== "climb" && q.k > ebbs - 1 ? 2 : 1);
      }
      score -= steps(f) * 0.02;
      if (!best || score > best.score) best = { f, score };
    }
    return best?.f ?? me.pos;
  }

  /** The stand-in sends Lumi, near where he will wait, to the pool with the most on it that she can get to while the tide is in. */
  private planLumi(near: Pt) {
    const g = this.game, b = g.board, lumi = this.player(LUMI_ID), tide = tidepoolTide(g.tick);
    const from = this.walkMap(lumi.pos), steps = (p: Pt) => from[p.y * b.width + p.x]!;
    const him = this.walkMap(near), his = (p: Pt) => him[p.y * b.width + p.x]!;
    let best: { f: Pt; score: number } | null = null;
    const counts = this.cascades.map((q) => ({ q, n: this.loose().filter((w) => this.cascadeAt(w.pos) === q && this.wet(w.pos)).length })).filter((o) => o.n > 0);
    if (!counts.length) return;
    for (const f of this.footing) {
      const s = steps(f);
      if (s < 0 || s > (tide.left - 3) * 2 || his(f) < 0 || his(f) > TIDEPOOL.lumiNear || samePt(f, near) || g.players.some((p) => p.id !== LUMI_ID && samePt(p.pos, f))) continue;
      let score = 0;
      for (const { q, n } of counts) if (q.pool.some((t) => cheb(t, f) <= TIDEPOOL.lumiReach && b.canSee(f, t))) score += n;
      score -= s * 0.03 + his(f) * 0.05;
      if (!best || score > best.score) best = { f, score };
    }
    const worth = TIDEPOOL.lumiSends < 99 ? TIDEPOOL.lumiWorth - 0.5 : 0.5;
    if (best && best.score > worth && !(this.sentTo && samePt(best.f, this.sentTo))) this.sendLumi(best.f);
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
    const g = this.game, now = g.tick, tide = tidepoolTide(now), level = tidepoolLevel(now), soon = !tide.in && tide.left <= TIDEPOOL.tide.warn;
    const caption = this.phase === "playing" ? this.captions.filter((c) => now < c.until).map((c) => ({ who: c.who, text: c.text })) : [];
    const stranded = this.stranded().map((w) => w.id);
    const left = Math.max(0, TIDEPOOL.tides - tide.n + (tide.in ? 0 : 1));
    return {
      run: TIDEPOOL.run,
      movement: 0,
      title: TIDEPOOL.title,
      ring: null,
      mark: null,
      kes: 0,
      end: this.end,
      canCall: this.phase === "playing" && this.sendsLeft() > 0,
      callWho: LUMI,
      called: this.sentTo,
      opt: {
        id: TIDEPOOL.id,
        noPush: true,
        strip: [
          { label: "For Marit", n: Math.min(TIDEPOOL.target, this.taken), of: TIDEPOOL.target, tone: "us" },
          { label: tide.in ? "Tide in" : soon ? "Tide coming" : "Tide out", n: 0, of: 0, tone: "water", tide: { level, in: tide.in, share: tide.left / tide.of, soon } },
          { label: left === 1 ? "Last tide" : "Tides left", n: left, of: TIDEPOOL.tides, tone: "chalk" },
          ...(TIDEPOOL.lumiSends < 99 ? [{ label: "Send Lumi", n: this.sendsLeft(), of: TIDEPOOL.lumiSends, tone: "water" as const }] : []),
        ],
        ...(caption.length ? { caption } : {}),
        tide: { level, in: tide.in, left: tide.left, of: tide.of, n: tide.n },
        reach: TIDEPOOL.reach,
        terraces: this.dry.map((d, k) => (k === 0 ? 0 : d ? level : 1)),
        ...(stranded.length ? { stranded } : {}),
        ...(this.record ? { record: { id: TIDEPOOL.id, best: this.record.best, won: this.record.won, count: this.record.count } } : {}),
      },
    };
  }

  view(): RoomView {
    const one = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: id === LUMI_ID ? ("frost" as const) : ("amber" as const), connected: true, bot: id !== YOU });
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: TIDEPOOL.shrine,
      teams: 2,
      players: [one(YOU, ROOK), one(LUMI_ID, LUMI), one(MARIT_ID, MARIT)],
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
    return { phase: this.phase, game: this.game, end: this.end, taken: this.taken, isIn: this.isIn, floods: this.floods, tally: this.tally, record: this.record, sentTo: this.sentTo, cascades: this.cascades, stranded: this.phase === "playing" ? this.stranded().map((w) => w.id) : [] };
  }
}
