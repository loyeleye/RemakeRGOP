// A story run, played in the page like Practice: the Grand Kindling (run 1). It speaks the
// same messages as a Room, so the client draws it the same way, and adds a story view (the
// ring, Lumi's call, Kes's score, the ending) and spoken lines.
//
// The run is three Games in a row, one per movement, with the score carried across:
//   1. First light: one wisp at a time, and Hesta's ring shows where to stand.
//   2. The relay: two crew bots fetch wisps from the far field and leave them for Rook to bank.
//   3. The crescendo: Hesta goes quiet, no rings, no crew, three wisps, and Lumi calls the one
//      he's neglecting.
// It can't be failed: the total only sets how bright the sky gets.

import { pt, samePt, type Pt } from "../engine/board.js";
import { homeSquares } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Guild } from "../engine/game.js";
import { KINDLING, banksFrom, compass, crewCommand, neglected, numberWord, ringSpot, type CrewState } from "../engine/kindling.js";
import { shrineById, spawnField, type Shrine } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { realClock, type Clock } from "./room.js";

const ROOK = 1;
const HESTA = "Hesta";
const LUMI = "Lumi";
/** Lines with no speaker are narration. */
const TELL = "";

const MOVES = [KINDLING.first, KINDLING.relay, KINDLING.crescendo] as const;

/** Lines that take turns, so the same one doesn't come twice in a row. */
class Turns {
  private i = 0;
  constructor(private lines: string[]) {}
  next() {
    return this.lines[this.i++ % this.lines.length]!;
  }
}

interface Call {
  wisp: number;
  /** The wisp's life: it goes up each time that wisp is banked and comes back. */
  life: number;
  at: number;
  answered: boolean;
}

export class StoryRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private name = "Rook";
  private phase: Phase = "countdown";
  private movement = 0;
  private countdown = 0;
  private game!: Game;
  private carried = 0;
  private kes = 0;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];

  // Movement 1 and 2: the ring.
  private ring: Pt | null = null;
  private ringWisp = -1;
  private ringSaid = false;
  private onRingFor = 0;
  private home: Pt | null = null;
  private strayFor = 0;
  private lastHesta = -99;
  // Movement 2: the crew.
  private crew: { id: number; name: string; state: CrewState }[] = [];
  /** The wisp the crew last left for Rook, while it's still his to bank. */
  private fed: number | null = null;
  // Movement 3: Lumi's calls.
  private lastTouch = new Map<number, number>();
  private calls: Call[] = [];
  private lastCall = -99;
  /** Wisps she gave up calling, and until which tick she leaves them be. */
  private ignored = new Map<number, number>();
  private missed = 0;
  private lives = new Map<number, number>();
  private missedLives = new Set<string>();

  private readonly there = new Turns(["There. Stand there.", "That one. Stand in the ring.", "Across the brazier from it. There.", "Stand there, Rook."]);
  private readonly banked = new Turns(["That's it.", "Clean.", "Good. Again.", "That's the way."]);
  private readonly concede = new Turns(["...Fine. That one.", "...Fine. That one works too.", "Fine. I suppose that counts."]);
  private readonly instead = new Turns(["Forget it. {Dir} one, then.", "Never mind that one. {Dir}!", "Fine. {Dir} one. Dad."]);
  private readonly now = new Turns(["Now, Rook.", "That one's yours. Now.", "{crew} left you one, {dir}. Now.", "Now."]);

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
  ) {
    this.rng = new Rng(this.seed());
  }

  /** A connection, with the same handlers as a Room's. */
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
        if (msg.name) this.name = String(msg.name).slice(0, 16);
        send({ t: "welcome", you: ROOK, token: "" });
        return this.begin();
      case "lobby":
        // "Play again" from the ending.
        if (this.phase === "results") this.begin();
        return;
      case "act": {
        if (this.phase !== "playing") return;
        const action = cleanAction(msg.action, this.game);
        this.game.command(ROOK, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  /** Start (or restart) the run from the first bell. */
  begin() {
    this.carried = this.kes = this.missed = 0;
    this.end = undefined;
    this.rng = new Rng(this.seed());
    this.startMovement(0, null);
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  private startMovement(m: number, rookAt: Pt | null) {
    this.movement = m;
    const mv = MOVES[m]!;
    const base = shrineById(KINDLING.shrine);
    // The same island, with this movement's spawn band.
    const shrine: Shrine = { ...base, spawnField: spawnField(base.board, mv.band), farField: [], farShare: 0 };
    const roster = [{ id: ROOK, guild: 0 as Guild, name: this.name }];
    this.crew = [];
    if (m === 1)
      KINDLING.relay.crew.forEach((name, i) => {
        const id = ROOK + 1 + i;
        roster.push({ id, guild: 0, name: `${name} (crew)` });
        this.crew.push({ id, name, state: { wisp: null, fed: null, skip: new Map() } });
      });
    this.game = new Game(shrine, roster, this.seed(), [mv.wisps, 0], mv.ticks);
    // Rook stays where he was when the bell went.
    const rook = this.game.players.find((p) => p.id === ROOK)!;
    if (rookAt) rook.pos = rook.prev = rookAt;
    this.ring = null;
    this.ringWisp = -1;
    this.ringSaid = false;
    this.onRingFor = 0;
    this.strayFor = 0;
    this.fed = null;
    this.home = m === 1 ? (homeSquares(this.game, 1)[0] ?? null) : null;
    this.lastTouch = new Map(this.game.wisps.map((w) => [w.id, 0]));
    this.calls = [];
    this.lives = new Map();
    this.missedLives = new Set();
    this.lastCall = -99;
    this.ignored = new Map();
    this.lastHesta = -99;
    this.phase = "countdown";
    this.countdown = KINDLING.bellTicks;
    this.say(LUMI, ["First light! That's the bell. I ring it, you light it. Go on, Dad.", "Second bell! The crew bring them in and you finish. That's the important job.", "Last bell! Everyone's watching, Dad. I'm calling it now."][m]!);
    this.flush();
    this.broadcastRoom();
    this.broadcastTick();
  }

  /** One clock tick. Public so tests can drive it. */
  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) {
        this.phase = "playing";
        this.opening();
        this.flush();
      }
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing") return;
    const g = this.game;
    for (const c of this.crew) {
      const cmd = crewCommand(g, c.id, ROOK, c.state, this.crew.filter((o) => o !== c).map((o) => o.state));
      if (cmd) g.command(c.id, cmd);
      // A wisp the crew leave for Rook is his: a fresh touch takes it even while it's still drifting.
      if (c.state.fed !== null) {
        const w = g.wisps[c.state.fed]!;
        w.holder = null;
        w.grip = Grip.Free;
      }
    }
    g.step();
    if (this.rng.next() < 1 / KINDLING.kesEvery[this.movement]!) this.kes++;
    if (this.movement === 0) this.firstLight();
    else if (this.movement === 1) this.relay();
    else this.crescendo();
    this.flush();
    this.broadcastTick();
    const done = g.finished || (this.movement === 0 && g.scores[0]! >= KINDLING.first.banks);
    if (!done) return;
    const rook = g.players.find((p) => p.id === ROOK)!;
    this.carried += g.scores[0]!;
    if (this.movement === 0) this.say(HESTA, "That's the where of it. Stand across from it, and it comes home.");
    if (this.movement === 1) this.say(HESTA, "Good. You heard the crew and you finished. That's the when.");
    if (this.movement < 2) return this.startMovement(this.movement + 1, rook.pos);
    this.finish();
  }

  /** Lines as play begins in each movement. */
  private opening() {
    if (this.movement === 0) this.say(HESTA, "One at a time tonight, Rook. Stand in the ring and pull.");
    if (this.movement === 1) this.say(HESTA, "Hold the ring. Let the crew bring them to you.");
    if (this.movement === 2) this.say(HESTA, "It's yours, Rook. I'll be quiet now.");
  }

  private rook() {
    return this.game.players.find((p) => p.id === ROOK)!;
  }

  // ---------------------------------------------------------------- movement 1

  private firstLight() {
    const g = this.game, rook = this.rook();
    if (g.banks.length) {
      this.say(HESTA, this.banked.next());
      this.ring = null;
    }
    const w = g.wisps[0];
    if (!w || g.board.inBankZone(w.pos)) return;
    const fresh = w.id !== this.ringWisp || g.banks.length > 0;
    // A new wisp, or the old ring no longer brings it home: mark a new spot.
    if (fresh || !this.ring || !banksFrom(g.board, this.ring, w.pos)) {
      // While he's pulling it in, leave the ring where it is.
      const pulling = rook.action.kind === "staff" && rook.action.wisp === w.id && w.target;
      if (!pulling || fresh) {
        this.ring = ringSpot(g.board, w.pos, rook.pos);
        if (fresh) {
          this.ringWisp = w.id;
          this.ringSaid = false;
          this.onRingFor = 0;
          if (g.tick > 1) this.say(HESTA, this.there.next());
        }
      }
    }
    if (this.ring && samePt(rook.pos, this.ring)) {
      this.onRingFor++;
      const pulling = rook.action.kind === "staff" && rook.action.wisp === w.id;
      if (!this.ringSaid && !pulling) {
        this.say(HESTA, "Now pull.");
        this.ringSaid = true;
      } else if (this.onRingFor === 6 && !pulling) this.say(HESTA, "Pull, Rook. Tap the wisp.");
    }
  }

  // ---------------------------------------------------------------- movement 2

  private relay() {
    const g = this.game, rook = this.rook();
    const home = this.home;
    if (home) {
      const away = Math.max(Math.abs(rook.pos.x - home.x), Math.abs(rook.pos.y - home.y));
      if (!this.ringSaid) {
        this.ring = home;
        if (samePt(rook.pos, home)) {
          this.ringSaid = true;
          this.ring = null;
          this.say(HESTA, "Stay there. They'll come to you.");
        }
      } else {
        this.strayFor = away > 3 ? this.strayFor + 1 : 0;
        if (this.strayFor === 8 && g.tick - this.lastHesta > 25) {
          this.ring = home;
          this.say(HESTA, "Back to your square, Rook. Let them bring it.");
        }
        if (away === 0) this.ring = null;
      }
    }
    if (this.fed !== null) {
      const w = g.wisps[this.fed]!;
      const banked = g.banks.some((b) => b.wisp === w.id);
      const his = rook.action.kind === "staff" && rook.action.wisp === w.id;
      if (banked || his || !banksFrom(g.board, rook.pos, w.target ?? w.pos)) this.fed = null;
    }
    for (const c of this.crew) {
      const fed = c.state.fed;
      if (fed !== null && this.fed === null) this.fed = fed;
      if (fed === null || g.tick - this.lastHesta < 8) continue;
      const w = g.wisps[fed]!;
      this.say(HESTA, this.now.next().replace("{crew}", c.name).replace("{dir}", compass(g.board, w.target ?? w.pos)));
      break;
    }
    if (g.banks.length && g.tick - this.lastHesta > 12) this.say(HESTA, this.banked.next());
  }

  // ---------------------------------------------------------------- movement 3

  private crescendo() {
    const g = this.game, rook = this.rook();
    const K = KINDLING.crescendo;
    for (const w of g.wisps) if (w.pullers.includes(ROOK) || (w.holder === ROOK && w.touched) || rook.beam === w.id) this.lastTouch.set(w.id, g.tick);
    for (const b of g.banks) {
      this.lastTouch.set(b.wisp, g.tick);
      this.lives.set(b.wisp, (this.lives.get(b.wisp) ?? 0) + 1);
    }
    // Lumi's call is an opinion, not an order. Answered when he touches it. If he banks a
    // different wisp instead, she concedes (sometimes out loud) and moves on; if he just
    // leaves it, she says it once more with feeling, then gives up on it and calls another.
    const cur = this.calls.find((c) => !c.answered);
    let switchNow = false;
    if (cur) {
      const age = g.tick - cur.at;
      const other = g.banks.find((b) => b.wisp !== cur.wisp);
      if ((this.lastTouch.get(cur.wisp) ?? 0) >= cur.at) cur.answered = true;
      else if (other || age >= K.answerWithin) {
        cur.answered = true;
        this.ignored.set(cur.wisp, g.tick + K.neglectAfter);
        const k = `${cur.wisp}@${cur.life}`;
        if (!this.missedLives.has(k)) {
          this.missedLives.add(k);
          this.missed++;
        }
        if (other && this.rng.next() < K.concede) this.say(LUMI, this.concede.next());
        switchNow = !other;
      } else if (age === K.repeatAfter) {
        const Dir = cap(compass(g.board, g.wisps[cur.wisp]!.pos));
        this.say(LUMI, `Dad. ${Dir} one. *${Dir}.*`);
      }
    }
    if (this.calls.some((c) => !c.answered)) return;
    if (!switchNow && g.tick - this.lastCall < K.callEvery) return;
    const w = neglected(g, ROOK, this.lastTouch, K.neglectAfter, (id) => (this.ignored.get(id) ?? -1) > g.tick);
    if (!w) return;
    const Dir = cap(compass(g.board, w.pos));
    this.say(LUMI, switchNow ? this.instead.next().replace("{Dir}", Dir) : `Dad. ${Dir} one.`);
    this.calls.push({ wisp: w.id, life: this.lives.get(w.id) ?? 0, at: g.tick, answered: false });
    this.lastCall = g.tick;
  }

  /** The wisp to pick out: the crew's latest feed in the relay, Lumi's open call in the crescendo. */
  private mark(): StoryView["mark"] {
    if (this.phase !== "playing") return null;
    if (this.movement === 1 && this.fed !== null) return { wisp: this.fed, who: HESTA };
    if (this.movement !== 2) return null;
    const open = this.calls.filter((c) => !c.answered).at(-1);
    return open ? { wisp: open.wisp, who: LUMI } : null;
  }

  // ---------------------------------------------------------------- the end

  private finish() {
    const banked = this.carried;
    const sky = Math.min(1, banked / KINDLING.skyFull);
    const glow =
      sky >= 0.9
        ? "Every island is lit, and Fairy Ring burns the brightest."
        : sky >= 0.55
          ? "The sky over Fairy Ring is bright with your light."
          : sky >= 0.25
            ? "Fairy Ring's light rises to meet the others."
            : "A small, steady light rises over Fairy Ring.";
    const m = this.missed;
    const lines: StoryLine[] = [
      { who: LUMI, text: "That's the last bell!" },
      { who: HESTA, text: "Look up, Rook." },
      { who: TELL, text: glow },
      { who: LUMI, text: m === 0 ? "You didn't miss one. I counted anyway." : `You missed ${numberWord(m)}. I counted.` },
      { who: TELL, text: "Far below the clouds, something opens an eye." },
    ];
    this.end = { banked, kes: this.kes, sky, lines };
    this.ring = null;
    this.phase = "results";
    this.endClock();
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- wire

  private say(who: string, text: string) {
    this.lines.push({ who, text });
    if (who === HESTA) this.lastHesta = this.game?.tick ?? 0;
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
    const mv = MOVES[this.movement]!;
    return {
      run: "The Grand Kindling",
      movement: this.movement,
      title: mv.title,
      ring: this.ring && pt(this.ring.x, this.ring.y),
      mark: this.mark(),
      kes: this.kes,
      end: this.end,
    };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: this.phase,
      host: ROOK,
      shrine: KINDLING.shrine,
      teams: 2,
      players: [
        { id: ROOK, name: this.name, guild: 0, flame: "amber", connected: true, bot: false },
        ...this.crew.map((c, i) => ({ id: c.id, name: `${c.name} (crew)`, guild: 0 as Guild, flame: (["jade", "frost"] as const)[i % 2]!, connected: true, bot: true })),
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
    const snap = this.game.snapshot();
    // One score across the run, and Kes's island in the rival's place.
    snap.scores = [this.carried + this.game.scores[0]!, this.kes];
    this.send?.({ t: "room", room: this.view() });
    this.send?.({ t: "tick", snap, tickMs: TICK_MS });
  }

  /** For tests. */
  get state() {
    return { phase: this.phase, movement: this.movement, game: this.game, banked: this.carried + (this.phase === "results" ? 0 : this.game.scores[0]!), missed: this.missed, end: this.end, ring: this.ring, crew: this.crew };
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

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
