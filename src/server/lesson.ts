// Story run 2, Lumi's lesson, played in the page like run 1. The player is Lumi; Rook is her
// partner on the board and the voice in her ear. Three short rounds, each with a small goal;
// missing it restarts that round at once, with no menu.
//   1. Your turn: three wisps, one at a time, no rings, at most 6 pulls.
//   2. Together: a jammed wisp that only moves when both pull (it heads for the point halfway
//      between them), then a second one where she calls Rook to a tile. He pulls when she pulls.
//   3. First to three against Rook, won with her tide pull: while she holds a wisp on water,
//      every loose wisp on that pool drifts to her.
// Numbers are in LESSON (src/engine/lesson.ts).

import { Mover, Tile, pt, samePt, type Pt } from "../engine/board.js";
import { BOT_EASY, BOT_MEDIUM, botCommand } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Guild, type Wisp } from "../engine/game.js";
import { LESSON } from "../engine/lesson.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { realClock, type Clock } from "./room.js";

const LUMI_ID = 1;
const ROOK_ID = 2;
const LUMI = "Lumi";
const ROOK = "Rook";
const ROUNDS = [LESSON.yourTurn, LESSON.together, LESSON.firstToThree] as const;
const FOREVER = 1_000_000;

export class LessonRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private round = 0;
  /** Round 2's beat: 0, the first jam (pull with Rook); 1, the second (call him). */
  private beat = 0;
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  /** Tries at round 3 (best of five after a loss). */
  private games = 1;
  private restarts = 0;

  // Round 1.
  private pulls = 0;
  private lastBeam: number | null = null;
  private banked = 0;
  private quietFor = 0;
  private hinted = false;
  private overSaid = false;
  private outFor = 0;
  // Round 2.
  private joined = false;
  private calls = 0;
  private callTo: Pt | null = null;
  private seeSaid = false;
  // Round 3.
  private tideSeen = -1;

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
        send({ t: "welcome", you: LUMI_ID, token: "" });
        return this.begin();
      case "lobby":
        if (this.phase === "results") this.begin();
        return;
      case "act": {
        if (this.phase !== "playing") return;
        const action = cleanAction(msg.action, this.game);
        this.game.command(LUMI_ID, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
      case "call":
        if (this.phase === "playing") this.call(pt(Math.floor(Number(msg.x)), Math.floor(Number(msg.y))));
        return;
    }
  }

  begin() {
    this.end = undefined;
    this.games = 1;
    this.restarts = 0;
    this.rng = new Rng(this.seed());
    this.startRound(0, false);
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  /** Start a round, from its bell, or at once after a miss. */
  private startRound(r: number, again: boolean, beat = 0) {
    this.round = r;
    this.beat = beat;
    const shrine = shrineById(LESSON.shrine);
    const c = shrine.board.center;
    const at = (o: { x: number; y: number }) => pt(c.x + o.x, c.y + o.y);
    const rival = r === 2;
    const roster = [
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
      { id: ROOK_ID, guild: (rival ? 1 : 0) as Guild, name: ROOK },
    ];
    const T = LESSON.firstToThree;
    this.game = new Game(shrine, roster, this.seed(), rival ? [T.wisps, T.rookWisps] : [1, 0], rival ? T.ticks : FOREVER);
    const g = this.game;
    const rook = this.player(ROOK_ID);
    this.pulls = this.banked = this.quietFor = this.outFor = this.calls = 0;
    this.lastBeam = null;
    this.hinted = this.overSaid = this.joined = this.seeSaid = false;
    this.callTo = null;
    this.tideSeen = -1;
    if (r === 0) place(rook, at({ x: -7, y: 6 }));
    if (r === 1) {
      const R = LESSON.together;
      const w = g.wisps[0]!;
      g.heavy.add(w.id);
      if (beat === 0) {
        moveWisp(w, at(R.jam1));
        place(rook, at(R.rook1));
      } else {
        moveWisp(w, at(R.jam2));
        place(rook, at(R.rook2));
      }
    }
    if (r === 2) {
      g.tidePuller = LUMI_ID;
      g.wisps.filter((w) => w.guild === 0).slice(0, T.onPool).forEach((w) => moveWisp(w, this.poolSpot()!));
    }
    this.phase = "countdown";
    this.countdown = again ? LESSON.restartTicks : LESSON.bellTicks;
    if (!again) this.opening();
    this.flush();
    this.broadcastRoom();
    this.broadcastTick();
  }

  /** Lines as a round begins (talk, at the bell). */
  private opening() {
    const talk = { talk: true };
    if (this.round === 0) {
      this.say(ROOK, "Three wisps. I won't point today.", talk);
      this.say(LUMI, "I don't need pointers.", talk);
    }
    if (this.round === 1 && this.beat === 0) this.say(ROOK, "This one's stuck. Pull with me.", talk);
    if (this.round === 1 && this.beat === 1) this.say(ROOK, "Now you're the boss. Tell me where to stand.", talk);
    if (this.round === 2) {
      this.say(ROOK, "First to three. No help.", talk);
      this.say(LUMI, "I didn't ask for any.", talk);
    }
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
    this.steerRook();
    g.step();
    if (this.round === 0) this.yourTurn();
    else if (this.round === 1) this.together();
    else this.firstToThree();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  /** What Rook does this tick. */
  private steerRook() {
    const g = this.game, lumi = this.player(LUMI_ID), rook = this.player(ROOK_ID);
    let action: Action | null = null;
    if (this.round === 1) {
      const hers = lumi.action.kind === "staff" ? lumi.action.wisp : null;
      if (this.beat === 0 && !this.joined) action = { kind: "staff", wisp: 0 };
      else if (rook.action.kind === "walk") action = null;
      // Two magnets: he takes hold and lets go on the same tick she does, and switches when she does.
      else action = hers !== null ? { kind: "staff", wisp: hers } : { kind: "idle" };
    }
    if (this.round === 2) {
      // He plays for real up to two, then eases off: still moving and pulling, but slowly, so
      // she has time to find the tide pull and a slow player can still lose.
      const style = g.scores[1]! < LESSON.firstToThree.rookStops ? BOT_MEDIUM : BOT_EASY;
      const cmd = botCommand(g, ROOK_ID, style, () => this.rng.next());
      if (cmd) g.command(ROOK_ID, cmd);
      return;
    }
    if (action && !(rook.action.kind === action.kind && (action.kind !== "staff" || (rook.action.kind === "staff" && rook.action.wisp === action.wisp)))) g.command(ROOK_ID, { action });
  }

  // ---------------------------------------------------------------- round 1: your turn

  private yourTurn() {
    const g = this.game, lumi = this.player(LUMI_ID);
    const Y = LESSON.yourTurn;
    const fresh = lumi.beam !== null && lumi.beam !== this.lastBeam;
    this.lastBeam = lumi.beam;
    if (fresh) {
      this.pulls++;
      this.quietFor = 0;
    }
    if (g.banks.some((b) => b.guild === 0)) {
      this.banked++;
      this.quietFor = 0;
      this.hinted = this.overSaid = false;
      if (this.banked >= Y.wisps) return this.startRound(1, false);
      this.say(ROOK, this.banked % 2 ? "That's it." : "Just like that.");
    }
    // Stuck for a while: a gentle, vague hint, and later an over-explained one.
    if (lumi.beam === null) this.quietFor++;
    if (!this.hinted && this.quietFor >= Y.hintAfter) {
      this.hinted = true;
      this.quietFor = 0;
      this.say(ROOK, "Where would I stand?");
    } else if (this.hinted && !this.overSaid && this.quietFor >= Y.overAfter) {
      this.overSaid = true;
      this.say(ROOK, "Remember, across the fire from...");
      this.say(LUMI, "Dad. I know.", { player: LUMI_ID });
    }
    // Out of pulls, and the last one has stopped: again, at once.
    const w = g.wisps[0]!;
    const moving = !!w.target || g.board.inBankZone(w.pos);
    this.outFor = this.pulls >= Y.pulls && lumi.beam === null && !moving ? this.outFor + 1 : 0;
    if (this.outFor >= Y.settle) this.again();
  }

  // ---------------------------------------------------------------- round 2: together

  private together() {
    const g = this.game, w = g.wisps[0]!;
    if (this.beat === 0 && !this.joined && w.pullers.includes(LUMI_ID) && w.pullers.includes(ROOK_ID)) this.joined = true;
    if (this.joined && !this.seeSaid && w.target) {
      this.seeSaid = true;
      this.say(ROOK, "See? It comes to the middle of us.");
    }
    if (g.banks.length) {
      this.say(ROOK, "That's it.");
      if (this.beat === 0) return this.startRound(1, false, 1);
      return this.startRound(2, false);
    }
  }

  /** She calls Rook to a tile. Too many calls and the beat starts again. */
  private call(to: Pt) {
    if (this.round !== 1 || this.beat !== 1) return;
    const g = this.game;
    if (!g.board.inside(to) || !g.board.passable(to, Mover.Walker) || g.board.tile(to) === Tile.Water) return;
    this.calls++;
    if (this.calls > LESSON.together.calls) {
      this.again();
      this.flush();
      return;
    }
    this.callTo = to;
    g.command(ROOK_ID, { action: { kind: "walk", to } });
    this.say(ROOK, "Yes, ma'am.", { player: ROOK_ID });
    this.flush();
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- round 3: first to three

  private firstToThree() {
    const g = this.game, lumi = this.player(LUMI_ID);
    const T = LESSON.firstToThree;
    // Her banked wisps come back on the pool.
    for (const b of g.banks) {
      if (b.guild !== 0) continue;
      const spot = this.poolSpot();
      if (spot) moveWisp(g.wisps[b.wisp]!, spot);
    }
    // The first time her tide pull moves something, Rook notices.
    const held = lumi.beam !== null ? g.wisps[lumi.beam] : undefined;
    const tide = held && held.touched && g.board.tile(held.pos) === Tile.Water && g.wisps.some((o) => o !== held && o.guild === 0 && g.board.tile(o.pos) === Tile.Water && !samePt(o.pos, o.prev) && !o.target);
    if (tide && this.tideSeen < 0) {
      this.tideSeen = g.tick;
      // One flash of open delight, without words, then she reins it into "I pulled." (smug).
      this.say(LUMI, "!", { player: LUMI_ID, mood: "delight-flash" });
    }
    if (this.tideSeen >= 0 && g.tick === this.tideSeen + 4) {
      this.say(ROOK, "How did you do that?");
      this.say(LUMI, "I pulled.", { player: LUMI_ID });
    }
    if (g.scores[0]! >= T.target) return this.finish();
    // Rook to three first, or the clock runs out: she goes again.
    if (g.finished || g.scores[1]! >= T.target) {
      // She won't take a loss: each one moves the goalposts. Best of five, of seven, ...up to
      // fifteen. Lose that one too and Rook calls it for the night.
      if (this.games >= LESSON.firstToThree.games) return this.finish(false);
      this.games++;
      const n = ["three", "five", "seven", "nine", "eleven", "thirteen", "fifteen"][this.games - 1];
      this.say(LUMI, `${this.games > 3 ? "..." : ""}Best of ${n}.`, { talk: true });
      this.startRound(2, true);
    }
  }

  /** A free pool tile far enough out that no plain pull from across the fire reaches it. */
  private poolSpot(): Pt | null {
    const g = this.game, b = g.board, c = b.center;
    const spots: Pt[] = [];
    for (let y = 0; y < b.height; y++)
      for (let x = 0; x < b.width; x++) {
        const p = pt(x, y);
        if (b.tile(p) !== Tile.Water || Math.hypot(x - c.x, y - c.y) < LESSON.firstToThree.poolFrom) continue;
        if (g.wisps.some((w) => samePt(w.pos, p)) || g.players.some((q) => samePt(q.pos, p))) continue;
        spots.push(p);
      }
    return spots.length ? spots[Math.floor(this.rng.next() * spots.length)]! : null;
  }

  // ---------------------------------------------------------------- misses and the end

  /** Missed the goal: "Again." and straight back in, before Rook can say anything kind. */
  private again() {
    this.restarts++;
    this.say(LUMI, "Again.", { talk: true });
    this.startRound(this.round, true, this.beat);
  }

  private finish(won = true) {
    this.phase = "results";
    const g = this.game;
    this.end = {
      banked: g.scores[0]!,
      kes: g.scores[1]!,
      summary: `First to three: Lumi ${g.scores[0]}, Rook ${g.scores[1]}${this.games > 1 ? ` (game ${this.games})` : ""}.`,
      lines: won ? [{ who: LUMI, text: "So I'm coming tomorrow." }] : [{ who: ROOK, text: "Let's call it for now. We can try again tomorrow." }],
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
    if (this.round === 0) return `${this.banked}/${LESSON.yourTurn.wisps} banked · pulls left ${Math.max(0, LESSON.yourTurn.pulls - this.pulls)}`;
    if (this.round === 1) return this.beat === 0 ? "Pull with Rook" : `Calls left ${Math.max(0, LESSON.together.calls - this.calls)}`;
    return undefined;
  }

  /** Where the wisp two are pulling is heading: the point halfway between them. */
  private halfway(): { x: number; y: number } | null {
    const g = this.game;
    for (const w of g.wisps) {
      if (w.pullers.length < 2) continue;
      const ps = w.pullers.map((id) => this.player(id));
      return { x: ps.reduce((a, p) => a + p.pos.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.pos.y, 0) / ps.length };
    }
    return null;
  }

  storyView(): StoryView {
    const R = ROUNDS[this.round]!;
    const rook = this.game.players.find((p) => p.id === ROOK_ID);
    const called = this.callTo && rook && !samePt(rook.pos, this.callTo) ? this.callTo : this.callTo;
    return {
      run: LESSON.run,
      movement: this.round,
      title: this.round === 2 && this.games > 1 ? `${R.title} · game ${this.games}` : R.title,
      ring: null,
      mark: null,
      kes: 0,
      rival: this.round === 2 ? { name: ROOK, short: ROOK, score: this.game.scores[1]! } : null,
      note: this.note(),
      canCall: this.round === 1 && this.beat === 1 && this.phase === "playing",
      halfway: this.halfway(),
      called,
      end: this.end,
    };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: this.phase,
      host: LUMI_ID,
      shrine: LESSON.shrine,
      teams: 2,
      players: [
        { id: LUMI_ID, name: LUMI, guild: 0, flame: "frost", connected: true, bot: false },
        { id: ROOK_ID, name: ROOK, guild: this.round === 2 ? 1 : 0, flame: "amber", connected: true, bot: true },
      ],
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

  /** For tests. */
  get state() {
    return { phase: this.phase, round: this.round, beat: this.beat, game: this.game, pulls: this.pulls, calls: this.calls, banked: this.banked, games: this.games, restarts: this.restarts, end: this.end, tideSeen: this.tideSeen };
  }
}

function place(p: { pos: Pt; prev: Pt }, at: Pt) {
  p.pos = p.prev = at;
}

function moveWisp(w: Wisp, at: Pt) {
  w.pos = w.prev = at;
  w.target = null;
  w.holder = null;
  w.grip = Grip.Free;
  w.skate = null;
  w.rimTicks = 0;
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
