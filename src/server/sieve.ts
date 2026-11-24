// Story run 8, a harder job, played in the page: Rook alone on the Sieve, where every wisp has a
// height that falls unless a staff touches it. Bank ten from a supply of sixteen. The first wisp
// cannot be saved. Nothing is counted on screen and nobody names what is happening. The rules are
// the falling law in game.ts, the numbers SIEVE (src/engine/sieve.ts), the brief project files
// gameplay/run8-prototype-brief.md, the keeper (Tilda) and the lines story/run8-sieve-lines.md
// (the story thread's drafts for Ladi).

import { Mover, Tile, pt, type Pt } from "../engine/board.js";
import { botCommand } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { SIEVE, SV_WELLS } from "../engine/sieve.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, KEEPER_ID = 2;
const ROOK = "Rook", HESTA = "Hesta", KEEPER = "Tilda";
const COUNT = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen"];

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "juggle" | "hold" | "idle";

export class SieveRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  private said = new Set<string>();
  private queue: Pending[] = [];
  private busyUntil = 0;
  /** The wisp that cannot be saved, until it has fallen. */
  private doomed: number | null = null;
  /** How many of the supply have come onto the board. */
  private arrived = 0;
  /** The tick a staff was last on each wisp. */
  private touchedAt = new Map<number, number>();
  /** Wisps that arrived over a well this time round. */
  private overWell = new Set<number>();
  /** For the measurements: wisps lost (the first not counted), how many of those over a well, restarts, and the ticks the last try took. */
  lost = 0;
  lostWell = 0;
  restarts = 0;
  ticks = 0;

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
    /** Tests and measurements: a bot plays Rook this way. */
    private stand: Stand | null = null,
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
        if (this.phase !== "playing") return;
        this.game.command(YOU, { action: cleanAction(msg.action, this.game), toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    this.said = new Set();
    this.lines = [];
    this.restarts = 0;
    this.endClock();
    this.start(true);
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  /** The stop, from the top: at first with Hesta's word before it, on a restart straight in. */
  private start(first: boolean) {
    const S = SIEVE;
    const g = (this.game = new Game(
      shrineById(S.shrine),
      [
        { id: YOU, guild: 0 as Guild, name: ROOK },
        { id: KEEPER_ID, guild: 0 as Guild, name: KEEPER },
      ],
      this.seed(),
      [S.onBoard, 0],
      100000,
    ));
    g.waterLawHere = true;
    g.fallRate = S.fall;
    g.liftTap = S.liftTap;
    g.liftHold = S.liftHold;
    g.respawnPause = g.outPause = S.pause;
    this.queue = [];
    this.busyUntil = 0;
    this.arrived = 0;
    this.touchedAt = new Map();
    this.lost = this.lostWell = this.ticks = 0;
    g.onReturn = (w) => this.arrive(w);
    for (const w of g.wisps) this.arrive(w);
    // The first wisp is already nearly down, over the well furthest from Rook. It is not his to save.
    const c = g.board.center;
    const far = [...SV_WELLS].sort((a, b) => Math.hypot(b.x - S.rook[0], b.y - S.rook[1]) - Math.hypot(a.x - S.rook[0], a.y - S.rook[1]))[0]!;
    const first1 = g.wisps[0]!;
    moveWisp(first1, pt(c.x + far.x, c.y + far.y));
    g.height.set(first1.id, S.firstHeight);
    this.doomed = g.pastSaving = first1.id;
    // Tilda stands off to the south and watches. She does not move.
    const tilda = this.player(KEEPER_ID);
    tilda.pos = tilda.prev = g.nearestFree(pt(c.x + S.keeper[0], c.y + S.keeper[1]), 0);
    const rook = this.player(YOU);
    rook.pos = rook.prev = g.nearestFree(pt(c.x + S.rook[0], c.y + S.rook[1]), 0);
    this.arrived--;
    this.phase = first ? "countdown" : "playing";
    if (first) {
      const before = this.lines.length;
      this.say(HESTA, "The Sieve this morning, Rook. Young Tilda sent word. Keep them all moving. Don't settle on one.", { talk: true });
      this.say(KEEPER, "You're Rook. I'm Tilda. I keep this now.", { talk: true });
      this.countdown = S.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    }
    this.flush();
    this.broadcastTick();
  }

  /** A wisp of the supply comes onto the board, in the outer band, lower the later it comes. None once the supply is spent. */
  private arrive(w: Wisp) {
    const g = this.game, S = SIEVE, b = g.board, c = b.center;
    if (this.arrived >= S.supply) return void g.away.set(w.id, 1e9);
    this.overWell.delete(w.id);
    const sh = shrineById(S.shrine);
    const taken = new Set(g.wisps.filter((o) => o !== w && !g.away.has(o.id)).map((o) => `${o.pos.x},${o.pos.y}`));
    // Some come in hanging over a well, so he has to choose which to draw off first.
    const well = S.overWell.includes(this.arrived);
    for (let n = 0; well && n < 80; n++) {
      // One of the wells furthest from where he is standing.
      const rook = this.player(YOU).pos;
      const k = [...SV_WELLS].sort((p, q) => Math.hypot(c.x + q.x - rook.x, c.y + q.y - rook.y) - Math.hypot(c.x + p.x - rook.x, c.y + p.y - rook.y))[Math.floor(this.rng.next() * S.wellFarthest)]!;
      const a = this.rng.next() * Math.PI * 2, r = this.rng.next() * Math.max(0, k.r - 0.8);
      const p = pt(Math.round(c.x + k.x + Math.cos(a) * r), Math.round(c.y + k.y + Math.sin(a) * r));
      if (b.tile(p) !== Tile.Well || taken.has(`${p.x},${p.y}`) || g.wisps.some((o) => o !== w && !g.away.has(o.id) && b.tile(o.pos) === Tile.Well && Math.hypot(o.pos.x - p.x, o.pos.y - p.y) < 4)) continue;
      moveWisp(w, p);
      n = 1e9;
      this.overWell.add(w.id);
    }
    for (let n = 0; n < 80 && !this.overWell.has(w.id); n++) {
      const a = this.rng.next() * Math.PI * 2, edge = sh.outline!(a);
      const r = edge * (S.band[0] + this.rng.next() * (S.band[1] - S.band[0]));
      const p = pt(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r));
      if (!b.inside(p) || b.tile(p) !== Tile.Floor || !b.passable(p, Mover.Wisp) || taken.has(`${p.x},${p.y}`)) continue;
      moveWisp(w, p);
      break;
    }
    g.height.set(w.id, Math.max(S.wellFloor, S.arriveHigh + ((S.arriveLow - S.arriveHigh) * this.arrived) / Math.max(1, S.supply - 1) - (this.overWell.has(w.id) ? S.wellLower : 0)));
    this.arrived++;
  }

  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) this.phase = "playing";
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing") return;
    this.step();
    if (this.phase === "playing") this.due();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private step() {
    const g = this.game, S = SIEVE;
    if (this.stand && this.stand !== "idle") this.steer();
    g.step();
    this.ticks = g.tick;
    for (const f of g.falls) {
      if (f.wisp === this.doomed) {
        this.doomed = g.pastSaving = null;
        if (!this.said.has("there")) (this.said.add("there"), this.say(KEEPER, "There. That's what I sent for you about.", { player: KEEPER_ID }, "key"));
        continue;
      }
      this.lost++;
      if (f.well) {
        this.lostWell++;
        if (!this.said.has("look")) (this.said.add("look"), this.say(KEEPER, "Don't look. We don't.", { player: KEEPER_ID }, "key"));
      }
    }
    // Three or more kept up at once: more than she can do.
    for (const w of g.wisps) if (w.touched) this.touchedAt.set(w.id, g.tick);
    if (!this.said.has("three") && this.said.has("knock") && g.wisps.filter((w) => !g.away.has(w.id) && g.tick - (this.touchedAt.get(w.id) ?? -99) <= SIEVE.upWithin).length >= 3) {
      this.said.add("three");
      this.say(KEEPER, "I can't do that. I can only hold one.", { player: KEEPER_ID }, "key");
    }
    if (!this.said.has("half") && g.scores[0]! >= Math.ceil(S.need / 2)) {
      this.said.add("half");
      this.say(KEEPER, "Mum kept this thirty years. Nothing ever went down a well.", { player: KEEPER_ID }, "key");
    }
    if (!this.said.has("knock") && this.said.has("there") && g.wisps.some((w) => w.touched)) {
      this.said.add("knock");
      this.say(KEEPER, "If I leave one, it goes down. If I knock it, it comes up. For a while.", { player: KEEPER_ID }, "key");
    }
    const banked = g.scores[0]!;
    if (banked >= S.need) return this.finish(banked);
    // So many lost that ten can't be reached: again, at once, and no blame.
    const live = g.wisps.filter((w) => !g.away.has(w.id) || g.away.get(w.id)! < 1e8).length - (this.doomed !== null ? 1 : 0);
    if (banked + live + (S.supply - this.arrived) < S.need) {
      this.restarts++;
      this.lines.push({ who: HESTA, text: "Again, Rook." });
      this.start(false);
    }
  }

  private steer() {
    // The juggler knocks up whichever wisp is lowest before it is too low, then goes back to hauling.
    if (this.stand === "juggle") {
      const g = this.game, me = this.player(YOU);
      const low = g.wisps
        .filter((w) => !g.away.has(w.id) && w.id !== this.doomed && !g.board.inBankZone(w.pos) && (g.height.get(w.id) ?? 100) < SIEVE.standKnockAt)
        .sort((a, b) => (g.height.get(a.id) ?? 100) - (g.height.get(b.id) ?? 100))[0];
      if (low && !low.touched) {
        if (g.inReach(me, low)) return void g.command(YOU, { action: { kind: "staff", wisp: low.id } });
        const c = g.board.center, d = Math.hypot(low.pos.x - me.pos.x, low.pos.y - me.pos.y) || 1;
        // Toward it, as far as open ground goes.
        const to = g.nearestFree(pt(Math.round(me.pos.x + ((low.pos.x - me.pos.x) / d) * 4), Math.round(me.pos.y + ((low.pos.y - me.pos.y) / d) * 4)), 0);
        void c;
        return void g.command(YOU, { action: { kind: "walk", to } });
      }
    }
    const cmd = botCommand(this.game, YOU, STAND[this.stand as "juggle" | "hold"], () => this.rng.next());
    if (cmd) this.game.command(YOU, cmd);
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  private finish(banked: number) {
    this.queue = [];
    this.phase = "results";
    // No score: she reads the number against the book, and nobody answers her.
    this.end = {
      banked,
      kes: 0,
      summary: "",
      lines: [
        { who: KEEPER, text: `${COUNT[banked] ?? banked}.` },
        { who: KEEPER, text: `The book says ${(COUNT[SIEVE.supply] ?? String(SIEVE.supply)).toLowerCase()}. Every year, back to the first page.` },
        { who: KEEPER, text: "Is it me?" },
        { who: ROOK, text: "It's not you." },
        { who: KEEPER, text: "Then what is it?" },
        { who: HESTA, text: "Come home, Rook." },
      ],
    };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, kind: "key" | "quip" = how.talk ? "key" : "quip") {
    const line = { who, text, ...how };
    if (this.phase !== "playing") return void this.lines.push(line);
    this.queue.push({ line, trigger: this.game.tick, key: kind === "key" });
    this.due();
  }

  private due() {
    const now = this.game.tick;
    while (this.queue.length && now >= this.busyUntil) {
      const q = this.queue.shift()!;
      if (!q.key && now - q.trigger > 4) continue;
      this.lines.push(q.line);
      this.busyUntil = now + lineTicks(q.line);
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
    return { run: SIEVE.run, movement: 0, title: "", ring: null, mark: null, kes: 0, rival: null, note: "", end: this.end, sieve: { keeper: KEEPER_ID } };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: SIEVE.shrine,
      teams: 2,
      players: [
        { id: YOU, name: ROOK, guild: 0, flame: "amber", connected: true, bot: false },
        { id: KEEPER_ID, name: KEEPER, guild: 0, flame: "amber", connected: true, bot: true },
      ],
      countdown: this.countdown,
      lastScores: this.end ? [0, 0] : null,
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
    return { phase: this.phase, game: this.game, end: this.end, said: this.said, doomed: this.doomed, arrived: this.arrived };
  }
}

const STAND = {
  hold: { pushy: 0, sloppiness: 0.08 },
  juggle: { pushy: 0, sloppiness: 0.08, taps: true },
} as const;

type Pending = { line: StoryLine; trigger: number; key: boolean };

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
    if (Number.isInteger(x) && Number.isInteger(y)) return { kind: "walk", to: pt(x as number, y as number) };
  }
  return undefined;
}
