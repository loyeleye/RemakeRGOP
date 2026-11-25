// Optional run 3c, Kes's rematch on a windy day, played in the page
// (gameplay/optional-runs-prototype-brief.md). The player is Rook, on Kite Fell, against Kes; Lumi
// referees from her stand. First to six.
// The wind carries loose wisps east along a course that splits at the brazier, and off the edge.
// A staff takes hold only from the mark by a vane, so a wisp is taken as it goes by or it is gone.
// They come in gusts, most of each down one arm. The choice is which vane to stand at: Kes takes
// the one he does not, and comes over to his when he gets ahead of her there.
// A wisp is his (or hers) when it has come to the one pulling it. Nothing is banked at the fire.
// Numbers and the course are in src/engine/kite.ts.

import { Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { Game, Rng, TICK_MS, type Guild, type Wisp } from "../engine/game.js";
import { KF_REFEREE } from "../engine/kitefell.js";
import { KITE, KT_SPLIT, KT_VANES, ktLength, ktOn, ktTile, ktVaneAt, type Arm } from "../engine/kite.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { cleanAction, lineTicks, moveWisp } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, KES_ID = 2, LUMI_ID = 3;
const ROOK = "Rook", KES = "Kes", LUMI = "Lumi";
const ARMS: readonly Arm[] = ["n", "s"];
const other = (a: Arm): Arm => (a === "n" ? "s" : "n");
const WORDS = ["", "one", "two", "three", "four", "five", "six"];

/**
 * A stand-in for the player, for the sums. "smart" takes the gusts in turn, each at the vane more
 * of it is coming to; "late" does the same but only looks once a gust has reached the split;
 * "stay" takes the north vane and never leaves it; "wander" picks a vane at random for each gust;
 * "idle" stands by the fire.
 */
export type Stand = "smart" | "stay" | "wander" | "late" | "idle";

export class KiteRoom {
  /** His best score against her so far, and rematches had: the page keeps them between visits. */
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

  /** The score: his and hers. */
  private score: [number, number] = [0, 0];
  /** Wisps on the wind: which arm each is bound for, how far along its way, and how far to the right of it. */
  private course = new Map<number, { arm: Arm; s: number; lat: number }>();
  /** Each wisp's gust, and the arm it was sent down. */
  private gustOf = new Map<number, { gust: number; arm: Arm }>();
  private gusts = 0;
  private lastRich: Arm[] = [];
  /** The arm he is at (or was last near), and the one Kes is at or making for. */
  private hisArm: Arm = "n";
  private kesArm: Arm = "s";
  /** What each has taken since Kes last changed vanes. */
  private since: [number, number] = [0, 0];
  /** When each wisp came into Kes's reach, and the tick she may reach again. */
  private kesSaw = new Map<number, number>();
  private kesFree = 0;
  /** What he has taken of each gust, and the last "Gone." */
  private tookOf = new Map<number, number>();
  private goneAt = -1e9;
  private sawAt = -1e9;
  private hintAt = -1e9;
  private record: { best: number; was: number; won: boolean; count: number } | null = null;
  /** The sums: wisps that went off the edge, those that went by the vane he stood at, and times Kes came over. */
  private tally = { off: 0, past: 0, pressed: 0, moves: 0 };
  /** The stand-in's vane, and the gust it chose it for. */
  private plan: { gust: number; arm: Arm } | null = null;

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
        const g = this.game, action = cleanAction(msg.action, g);
        if (action?.kind === "staff") {
          const w = g.wisps[action.wisp]!, me = this.player(YOU);
          // No shoving: one that Kes has hold of is hers.
          if (this.heldBy(w) === KES_ID) return;
          // His staff takes hold only from a vane's mark. A tap from anywhere else says so, and he stays where he is.
          if (!this.canHold(me, w)) {
            if (g.tick - this.hintAt >= 12) {
              this.hintAt = g.tick;
              this.captions.push({ who: "", text: this.atMark(me) ? "Too far. It has to come by the vane." : "Your staff only holds from the mark by a vane.", until: g.tick + 6 });
            }
            return;
          }
        }
        // He pulls: there is no shoving here.
        g.command(YOU, { action, toggleRun: !!msg.toggleRun });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    const shrine = shrineById(KITE.shrine);
    const roster = [
      { id: YOU, guild: 0 as Guild, name: ROOK },
      { id: KES_ID, guild: 0 as Guild, name: KES },
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
    ];
    const g = (this.game = new Game(shrine, roster, this.seed(), [(KITE.gust.rich + KITE.gust.lone) * 4, 0], KITE.ticks));
    const c = g.board.center;
    g.pullReach = KITE.reach;
    g.noShove = true;
    const place = (id: number, [x, y]: readonly [number, number]) => {
      const p = this.player(id);
      p.pos = p.prev = pt(c.x + x, c.y + y);
    };
    place(YOU, KITE.rookAt);
    place(KES_ID, KITE.kesAt);
    place(LUMI_ID, [KF_REFEREE.x, KF_REFEREE.y]);
    this.player(YOU).run = true;
    this.player(KES_ID).run = true;
    // Nothing is banked at the fire here: a wisp is taken when it reaches the one pulling it.
    for (const w of g.wisps) (g.noBank.add(w.id), g.away.set(w.id, 1e9));
    this.score = [0, 0];
    this.course = new Map();
    this.gustOf = new Map();
    this.gusts = 0;
    this.lastRich = [];
    this.hisArm = "n";
    this.kesArm = "s";
    this.since = [0, 0];
    this.kesSaw = new Map();
    this.kesFree = 0;
    this.tookOf = new Map();
    this.goneAt = this.sawAt = this.hintAt = -1e9;
    this.record = null;
    this.tally = { off: 0, past: 0, pressed: 0, moves: 0 };
    this.plan = null;
    this.said = new Set();
    this.queue = [];
    this.busyUntil = 0;
    this.phase = "countdown";
    this.gust(KITE.gust.head);
    // The goal, in the referee's mouth, and the limit in Kes's: both stay up as captions.
    const goal = "First to six. No shoving. No blaming the wind.", limit = "Wind's up. They come by once, Rook. Miss it and it's mine.";
    const before = this.lines.length;
    this.say(LUMI, goal, { talk: true });
    this.say(KES, limit, { talk: true });
    this.countdown = KITE.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.captions = [{ who: LUMI, text: goal, until: KITE.goalTicks }, { who: KES, text: limit, until: KITE.goalTicks }];
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
    const g = this.game, me = this.player(YOU);
    if (g.tick > 0 && g.tick % KITE.gust.every === 0) this.gust(0);
    this.where();
    this.steerKes();
    if (this.stand) this.steerYou();
    // A hold that no longer stands (he has left the mark, or it has gone out of reach) is let go.
    if (me.action.kind === "staff" && !this.canHold(me, g.wisps[me.action.wisp]!)) g.command(YOU, { action: { kind: "idle" } });
    g.step();
    this.wind();
    this.afterStep();
    if (this.phase === "playing") this.due();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }
  /** The mark by an arm's vane, as a tile. */
  private mark(arm: Arm): Pt {
    const c = this.game.board.center, m = KT_VANES[arm].mark;
    return pt(c.x + m[0], c.y + m[1]);
  }
  /** Standing at a vane's mark (either one). */
  private atMark(p: { pos: Pt }): Arm | null {
    return ARMS.find((a) => cheb(p.pos, this.mark(a)) <= KITE.spot) ?? null;
  }
  /** A staff takes hold from a mark, of a wisp within reach and in sight. */
  private canHold(p: { pos: Pt }, w: Wisp) {
    const g = this.game;
    return !g.away.has(w.id) && !!this.atMark(p) && !samePt(p.pos, w.pos) && cheb(p.pos, w.pos) <= KITE.reach && g.board.canSee(p.pos, w.pos);
  }
  /** Who has a staff on this wisp, if anyone. */
  private heldBy(w: Wisp): number | null {
    return this.game.players.find((p) => p.action.kind === "staff" && p.action.wisp === w.id)?.id ?? null;
  }
  /** The wisps on the wind bound for an arm that have not yet gone by its vane. */
  private coming(arm: Arm) {
    const at = ktVaneAt(arm) + KITE.reach - 2;
    return [...this.course].filter(([, k]) => k.arm === arm && k.s <= at).map(([id, k]) => ({ w: this.game.wisps[id]!, ...k }));
  }

  // ---------------------------------------------------------------- the wind

  /** A gust: most of it down one arm, the rest down the other, `head` tiles along already. */
  private gust(head: number) {
    const g = this.game, G = KITE.gust;
    const free = g.wisps.filter((w) => g.away.has(w.id));
    if (free.length < G.rich + G.lone) return;
    // Never the same arm more than `same` gusts running.
    const run = this.lastRich.slice(-G.same);
    const rich: Arm = run.length === G.same && run.every((a) => a === run[0]) ? other(run[0]!) : this.rng.next() < 0.5 ? "n" : "s";
    this.lastRich.push(rich);
    const n = this.gusts++;
    for (let i = 0; i < G.rich + G.lone; i++) {
      const w = free[i]!, arm = i < G.rich ? rich : other(rich);
      const s = head - (i < G.rich ? i * G.apart : (i - G.rich + 0.5) * G.apart);
      g.away.delete(w.id);
      this.course.set(w.id, { arm, s, lat: arm === "n" ? -1 : 1 });
      this.gustOf.set(w.id, { gust: n, arm });
      moveWisp(w, this.tileOf(arm, s, arm === "n" ? -1 : 1) ?? pt(0, 0));
    }
  }

  /** The board tile for a place on the course, or null where there is no board (it is out over the sky). */
  private tileOf(arm: Arm, s: number, lat: number): Pt | null {
    const b = this.game.board, c = b.center, [x, y] = ktTile(arm, s, lat), p = pt(c.x + x, c.y + y);
    return b.inside(p) ? p : null;
  }

  /** One tick of wind: every loose wisp on the course is carried along it, and one that reaches the edge is gone. */
  private wind() {
    const g = this.game, b = g.board, c = b.center, me = this.player(YOU);
    for (const w of g.wisps) {
      if (g.away.has(w.id)) continue;
      if (this.heldBy(w) !== null) {
        this.course.delete(w.id);
        continue;
      }
      let k = this.course.get(w.id);
      if (!k) {
        // Let go of: back on the course if it lies on it (the nearer arm past the split), and still where it is if not.
        const sent = this.gustOf.get(w.id)?.arm ?? "n";
        const on = ARMS.map((arm) => ({ arm, ...ktOn(arm, w.pos.x - c.x, w.pos.y - c.y) })).sort((x, y) => x.off - y.off || (x.arm === sent ? -1 : 1))[0]!;
        if (on.off > KITE.width / 2) continue;
        k = { arm: on.arm, s: on.s, lat: Math.max(-1.5, Math.min(1.5, on.lat)) };
        this.course.set(w.id, k);
      }
      const before = k.s;
      k.s += KITE.wind;
      // Past the land's edge: gone. (A wisp only goes over open ground: it is carried a little farther past anything in its way.)
      let to = this.tileOf(k.arm, k.s, k.lat);
      for (let n = 0; n < 6 && to && k.s < ktLength(k.arm) && b.tile(to) !== Tile.Floor && b.tile(to) !== Tile.Edge; n++) (k.s += 0.5), (to = this.tileOf(k.arm, k.s, k.lat));
      const off = !to || (b.tile(to) === Tile.Edge && k.s > KT_SPLIT) || k.s >= ktLength(k.arm);
      if (off) {
        this.tally.off++;
        // It went by the vane he was standing at.
        if (this.atMark(me) === k.arm) this.passed();
        this.course.delete(w.id);
        this.kesSaw.delete(w.id);
        g.away.set(w.id, 1e9);
        continue;
      }
      // Before the land (the west rim) it is out over the sky and not on a tile yet: it keeps its last one.
      if (to && b.passable(to, Mover.Wisp)) (w.pos = to), (w.target = null), (w.holder = null);
      else if (before < 8 && to) (w.pos = w.prev = to), (w.target = null);
    }
  }

  /** One went by him at his own vane. */
  private passed() {
    const g = this.game;
    this.tally.past++;
    if (g.tick - this.goneAt < 30) return;
    this.goneAt = g.tick;
    this.say(KES, "Gone. Wind doesn't do seconds.", { player: KES_ID }, !this.said.has("gone"));
    this.said.add("gone");
  }

  // ---------------------------------------------------------------- after each tick

  /** Which arm he is at: the one whose mark he is near, or is walking to. */
  private where() {
    const me = this.player(YOU);
    const to = me.action.kind === "walk" ? me.action.to : me.pos;
    const near = ARMS.map((a) => ({ a, d: Math.min(cheb(me.pos, this.mark(a)), cheb(to, this.mark(a))) })).sort((x, y) => x.d - y.d)[0]!;
    if (near.d <= 9) this.hisArm = near.a;
  }

  private afterStep() {
    const g = this.game;
    // Taken: a wisp that has come to the one pulling it.
    for (const p of g.players) {
      if (p.action.kind !== "staff") continue;
      const w = g.wisps[p.action.wisp]!;
      if (g.away.has(w.id) || cheb(w.pos, p.pos) > 1) continue;
      this.take(p.id === YOU ? 0 : 1, w);
      if (this.phase !== "playing") return;
    }
    // "Left or right": as the first of them nears the split.
    if (!this.said.has("split") && [...this.course.values()].some((k) => k.s >= KT_SPLIT - 12)) {
      this.said.add("split");
      this.say(KES, "Left or right, Rook. I'll take what you don't.", { player: KES_ID }, true, KITE.landTicks);
    }
    if (g.finished) this.finish();
  }

  private take(side: 0 | 1, w: Wisp) {
    const g = this.game, id = side === 0 ? YOU : KES_ID;
    this.score[side]++;
    this.since[side]++;
    g.scores[side] = this.score[side];
    g.banks.push({ tick: g.tick, wisp: w.id, guild: side as Guild });
    w.target = null;
    w.holder = null;
    this.course.delete(w.id);
    this.kesSaw.delete(w.id);
    g.away.set(w.id, 1e9);
    g.command(id, { action: { kind: "idle" } });
    if (side === 1) this.kesFree = g.tick + KITE.kes.slow;
    if (this.score[side] >= KITE.target) return this.finish();
    // A run of them: he read the wind.
    const gust = this.gustOf.get(w.id)?.gust ?? -1;
    if (side === 0) {
      const n = (this.tookOf.get(gust) ?? 0) + 1;
      this.tookOf.set(gust, n);
      if (n === KITE.run2 && g.tick - this.sawAt >= 40) {
        this.sawAt = g.tick;
        this.say(KES, "Oh, you saw that one coming.", { player: KES_ID }, !this.said.has("saw"));
        this.said.add("saw");
        return;
      }
    }
    // The referee calls it.
    this.say(LUMI, `${side === 0 ? "Dad" : KES}, ${WORDS[this.score[side]]}.`, { player: LUMI_ID });
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    const [his, hers] = this.score, won = his >= KITE.target && his > hers;
    this.record = { best: Math.max(this.best, his), was: this.best, won, count: this.count + 1 };
    this.end = {
      banked: his,
      kes: hers,
      summary: `Rook ${his}, Kes ${hers}.`,
      lines: won
        ? [{ who: KES, text: "The wind helped you." }, { who: ROOK, text: "It helped us both." }, { who: KES, text: "It likes me better." }]
        : [{ who: KES, text: "Tomorrow, then. I'll bring less wind." }, { who: LUMI, text: "She won't." }],
    };
    this.best = this.record.best;
    this.count++;
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- Kes

  /**
   * Kes takes the vane he does not. When he has taken `press` more than she has since she last
   * moved, she comes over to his. At her mark she takes hold of the wisp nearest to going by,
   * `quick` ticks after it came into her reach, unless he has it.
   */
  private steerKes() {
    const g = this.game, me = this.player(KES_ID), K = KITE.kes;
    const want = this.since[0] - this.since[1] >= K.press ? this.hisArm : this.kesArm === this.hisArm ? this.kesArm : other(this.hisArm);
    if (want !== this.kesArm) {
      if (want === this.hisArm) this.tally.pressed++;
      this.kesArm = want;
      this.since = [0, 0];
      this.tally.moves++;
    }
    if (me.action.kind === "staff") {
      const w = g.wisps[me.action.wisp]!;
      if (this.canHold(me, w)) return;
      g.command(KES_ID, { action: { kind: "idle" } });
    }
    const at = this.mark(this.kesArm), mine = this.near(at, KES_ID);
    if (cheb(me.pos, at) > KITE.spot) {
      if (!(me.action.kind === "walk" && samePt(me.action.to, mine))) g.command(KES_ID, { action: { kind: "walk", to: mine } });
      return;
    }
    for (const w of g.wisps) {
      if (g.away.has(w.id) || !this.canHold(me, w)) this.kesSaw.delete(w.id);
      else if (!this.kesSaw.has(w.id)) this.kesSaw.set(w.id, g.tick);
    }
    if (g.tick < this.kesFree) return;
    const next = g.wisps
      .filter((w) => this.course.has(w.id) && this.kesSaw.has(w.id) && g.tick - this.kesSaw.get(w.id)! >= K.quick && this.heldBy(w) === null)
      .sort((x, y) => (this.course.get(y.id)?.s ?? 0) - (this.course.get(x.id)?.s ?? 0))[0];
    if (next) g.command(KES_ID, { action: { kind: "staff", wisp: next.id } });
  }

  /** A tile to stand on at a mark: the mark itself, or beside it if someone else is on it. */
  private near(at: Pt, who: number): Pt {
    const g = this.game, b = g.board;
    const taken = (p: Pt) => g.players.some((q) => q.id !== who && (samePt(q.pos, p) || (q.action.kind === "walk" && samePt(q.action.to, p))));
    if (!taken(at)) return at;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const p = pt(at.x + dx, at.y + dy);
      if (b.passable(p, Mover.Walker) && !taken(p)) return p;
    }
    return at;
  }

  // ---------------------------------------------------------------- the player's stand-in

  /** The wisps bound for an arm that he could still be in time for, running from where he is. */
  private inTime(arm: Arm, from: Pt) {
    const steps = Math.ceil(Math.max(0, cheb(from, this.mark(arm)) - KITE.spot) / 2) + 1;
    const last = ktVaneAt(arm) + KITE.reach - 3;
    return this.coming(arm).filter((k) => k.s + steps * KITE.wind <= last);
  }

  private steerYou() {
    const g = this.game, me = this.player(YOU);
    if (this.stand === "idle") return;
    const gustOf = (id: number) => this.gustOf.get(id)?.gust ?? -1;
    if (this.stand === "smart" || this.stand === "late") {
      // The oldest gust there is still something of to take: the vane more of it is coming to. (A late one only looks once it is at the split.)
      const all = ARMS.flatMap((arm) => this.inTime(arm, me.pos).map((k) => ({ arm, gust: gustOf(k.w.id), s: k.s }))).filter((k) => this.stand !== "late" || k.s >= KT_SPLIT);
      const first = Math.min(...all.map((k) => k.gust));
      if (all.length && this.plan?.gust !== first) {
        const here = this.plan?.arm ?? "n", n = (arm: Arm) => all.filter((k) => k.gust === first && k.arm === arm).length;
        this.plan = { gust: first, arm: n(other(here)) > n(here) ? other(here) : here };
      }
    } else if (this.plan?.gust !== this.gusts - 1) this.plan = { gust: this.gusts - 1, arm: this.stand === "wander" && this.rng.next() < 0.5 ? "s" : "n" };
    const arm = this.plan?.arm ?? "n", at = this.mark(arm);
    if (me.action.kind === "staff" && this.canHold(me, g.wisps[me.action.wisp]!)) return;
    if (cheb(me.pos, at) > KITE.spot) {
      const to = this.near(at, YOU);
      if (!(me.action.kind === "walk" && samePt(me.action.to, to))) g.command(YOU, { action: { kind: "walk", to } });
      return;
    }
    // At the mark: the one nearest to going by that nobody has.
    const next = g.wisps.filter((w) => this.canHold(me, w) && this.heldBy(w) === null).sort((x, y) => (this.course.get(y.id)?.s ?? 0) - (this.course.get(x.id)?.s ?? 0))[0];
    if (next) g.command(YOU, { action: { kind: "staff", wisp: next.id } });
    else if (me.action.kind !== "idle") g.command(YOU, { action: { kind: "idle" } });
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
    const g = this.game, now = g.tick, me = this.player(YOU), kes = this.player(KES_ID);
    const caption = this.phase === "playing" ? this.captions.filter((c) => now < c.until).map((c) => ({ who: c.who, text: c.text })) : [];
    return {
      run: KITE.run,
      movement: 0,
      title: KITE.title,
      ring: null,
      mark: null,
      kes: 0,
      end: this.end,
      opt: {
        id: KITE.id,
        strip: [
          { label: ROOK, n: this.score[0], of: KITE.target, tone: "us" },
          { label: KES, n: this.score[1], of: KITE.target, tone: "her" },
        ],
        ...(caption.length ? { caption } : {}),
        reach: KITE.reach,
        vanes: ARMS.map((arm) => ({ x: this.mark(arm).x, y: this.mark(arm).y, r: KITE.spot + 0.5, n: this.coming(arm).length, ...(this.atMark(me) === arm ? { you: true } : {}), ...(this.atMark(kes) === arm ? { her: true } : {}) })),
        ...(this.record ? { record: { id: KITE.id, best: this.record.best, won: this.record.won, count: this.record.count } } : {}),
      },
    };
  }

  view(): RoomView {
    const one = (id: number, name: string, flame: "amber" | "pearl") => ({ id, name, guild: 0 as Guild, flame, connected: true, bot: id !== YOU });
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: KITE.shrine,
      teams: 2,
      players: [one(YOU, ROOK, "amber"), one(KES_ID, KES, "pearl"), one(LUMI_ID, LUMI, "amber")],
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
    return { phase: this.phase, game: this.game, end: this.end, score: this.score, hisArm: this.hisArm, kesArm: this.kesArm, course: this.course, tally: this.tally, record: this.record, gusts: this.gusts, rich: this.lastRich };
  }
}
