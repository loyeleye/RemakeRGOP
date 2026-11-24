// Story run 10, the ship home, played in the page: Rook alone on the deck of the stranger's ship,
// at night, and nobody in his ear. The wind carries loose wisps from the bow to the stern; the
// ship's lamp amidships is the bank. The dark patch is in the cloud sea ahead, going the same way:
// each bank gains on it, each wisp lost off the stern lets it draw away, and if it goes out of
// sight the lamp gutters and the run starts again at the bow, with no line, because nobody is there
// to say one. The run lasts a fixed time and has no result. The numbers are SHIP
// (src/engine/shiphome.ts), the brief project files gameplay/runs9-10-prototype-brief.md, the lines
// and stills story/runs9-10-story-check.md (drafts for Ladi).

import { Mover, pt, samePt } from "../engine/board.js";
import { botCommand } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { SHIP, SHIP_DECK, shipLight } from "../engine/shiphome.js";
import { STILL, stillMs, type StillCue } from "../engine/stills.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1;
const ROOK = "Rook";

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "hold" | "idle";

export class ShipRoom {
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
  /** How far ahead of the bow the patch is (tiles). */
  private lead = SHIP.patch.start as number;
  /** The tick the next wisp may come over the bow, and when each wisp off the deck may come again. */
  private nextAt = 0;
  private free = new Map<number, number>();
  /** Out of sight: the tick the lamp began to gutter (-1 while the patch is in sight). */
  private gutterAt = -1;
  /** The room's own clock in ticks (it runs in the opening pause too), for the stills. */
  private clockTicks = 0;
  private stillEnd = -1e9;
  /** All the stills off (?nostills in the page). */
  stillsOn = true;
  /** The wind, to try by playing (?wind=1, 2 or 3 in the page): a loose wisp goes a tile astern every this many ticks. */
  windEvery = SHIP.wind as number;
  /** For tests and measurements. */
  stillsShown: string[] = [];
  restarts = 0;
  ticks = 0;
  banked = 0;
  lost = 0;
  nearest = 99;
  farthest = 0;

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
        if (this.phase !== "playing" || this.over()) return;
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
    this.clockTicks = 0;
    this.stillEnd = -1e9;
    this.stillsShown = [];
    this.endClock();
    this.start(true);
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  /** From the bow: at first with the opening pause before it, on a restart straight in, with no line. */
  private start(first: boolean) {
    const S = SHIP;
    const g = (this.game = new Game(shrineById(S.shrine), [{ id: YOU, guild: 0 as Guild, name: ROOK }], this.seed(), [S.wisps, 0], 100000));
    g.noShove = true;
    g.respawnPause = g.outPause = S.pause;
    this.queue = [];
    this.busyUntil = 0;
    this.lead = S.patch.start;
    this.nextAt = 0;
    this.gutterAt = -1;
    this.banked = this.lost = this.ticks = 0;
    this.nearest = 99;
    this.farthest = 0;
    this.said.delete("half");
    this.said.delete("last");
    // Every wisp waits beyond the bow; the room brings them over one at a time.
    this.free = new Map();
    for (const w of g.wisps) this.away(w, -1e9);
    // One that went in comes back to the bow's queue, not to the deck.
    g.onReturn = (w) => this.away(w, g.tick);
    this.phase = first ? "countdown" : "playing";
    if (first) {
      const before = this.lines.length;
      // Nobody speaks to him. His one word, with the first view over the bow.
      this.say(ROOK, "Faster.", { talk: true, ...this.still("r10-0") });
      this.countdown = S.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    }
    this.flush();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- the wisps and the wind

  /** Off the deck, to come over the bow again no sooner than `pause` after `since`. */
  private away(w: Wisp, since: number) {
    const g = this.game, rook = this.player();
    // His staff comes off it: a staff left on one that has gone would take hold of it again at the bow.
    if (rook.action.kind === "staff" && rook.action.wisp === w.id) rook.action = { kind: "idle" };
    if (rook.beam === w.id) rook.beam = null;
    w.holder = null;
    w.target = null;
    w.skate = null;
    w.grip = Grip.Free;
    g.away.set(w.id, 1e9);
    this.free.set(w.id, since + SHIP.pause);
  }

  /** One comes over the bow, in a lane with room in it. */
  private arrive() {
    const g = this.game, c = g.board.center;
    if (g.tick < this.nextAt) return;
    const w = g.wisps.find((o) => g.away.has(o.id) && (this.free.get(o.id) ?? 0) <= g.tick);
    if (!w) return;
    const open = SHIP.lanes.filter((x) => !g.wisps.some((o) => !g.away.has(o.id) && o.pos.x === c.x + x && o.pos.y <= c.y - SHIP_DECK.hl + 2));
    if (!open.length) return;
    const at = pt(c.x + open[this.rng.int(open.length)]!, c.y - SHIP_DECK.hl);
    g.away.delete(w.id);
    this.free.delete(w.id);
    w.pos = w.prev = at;
    w.rimTicks = 0;
    this.nextAt = g.tick + SHIP.every;
  }

  /** The wind: every loose wisp a tile toward the stern, and off it. One on his staff is not loose. */
  private wind() {
    const g = this.game, b = g.board, c = b.center, rook = this.player();
    if (g.tick % this.windEvery !== 0) return;
    // Sternmost first, so that one moving on leaves room for the one behind it.
    // Loose is "no staff on it this tick, and not in flight": the engine's `holder` stays set after a touch, so it cannot be the test.
    const loose = g.wisps.filter((w) => !g.away.has(w.id) && !w.touched && rook.beam !== w.id && !w.target && !w.skate && !b.inBankZone(w.pos)).sort((a, z) => z.pos.y - a.pos.y);
    for (const w of loose) {
      if (w.pos.y + 1 > c.y + SHIP_DECK.hl) {
        // Gone off the stern: the patch draws away.
        this.away(w, g.tick);
        this.lost++;
        this.lead += SHIP.patch.lose;
        continue;
      }
      // Round the hooded figure, who does not move.
      const tries = [pt(w.pos.x, w.pos.y + 1), pt(w.pos.x + 1, w.pos.y + 1), pt(w.pos.x - 1, w.pos.y + 1)];
      const to = tries.find((q) => b.passable(q, Mover.Wisp) && !g.wisps.some((o) => o !== w && !g.away.has(o.id) && samePt(o.pos, q)));
      if (!to) continue;
      w.prev = w.pos;
      w.pos = to;
      w.target = null;
    }
  }

  // ---------------------------------------------------------------- the clock

  /** The last stretch: home is over the top of the screen, and nothing can be lost any more. */
  private homeTicks() {
    return Math.ceil((SHIP.endSec * 1000) / TICK_MS);
  }
  private over() {
    return this.game.tick >= SHIP.ticks - SHIP.railTicks;
  }

  onTick() {
    this.clockTicks++;
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
    const g = this.game, S = SHIP, P = S.patch;
    // Out of sight: the lamp gutters, and it is the bow again. Nobody says anything.
    if (this.gutterAt >= 0) {
      g.tick++;
      if (g.tick - this.gutterAt >= P.gutterTicks) {
        this.restarts++;
        this.queue = [];
        this.start(false);
      }
      return;
    }
    if (this.over()) {
      // He goes over the rail before it touches. No score, no result.
      const rook = this.player();
      rook.action = { kind: "idle" };
      rook.beam = null;
      g.tick++;
      this.ticks = g.tick;
      if (g.tick >= S.ticks) this.finish();
      return;
    }
    if (this.stand && this.stand !== "idle") {
      const cmd = botCommand(g, YOU, S.stand, () => this.rng.next());
      if (cmd) g.command(YOU, cmd);
    }
    this.arrive();
    g.step();
    this.ticks = g.tick;
    this.wind();
    // The one meter. Each bank gains on it; it draws away by itself, and with every wisp the wind takes.
    this.banked += g.banks.length;
    this.lead += P.drift - P.gain * g.banks.length;
    const last = g.tick >= S.ticks - this.homeTicks();
    this.lead = Math.max(P.nearest, last ? Math.min(this.lead, P.gone - 1) : this.lead);
    this.nearest = Math.min(this.nearest, this.lead);
    this.farthest = Math.max(this.farthest, this.lead);
    if (this.lead >= P.gone) {
      this.gutterAt = g.tick;
      for (const w of g.wisps) if (!g.away.has(w.id)) this.away(w, g.tick);
      this.player().action = { kind: "idle" };
      return;
    }
    // The views over the bow: half way (the picture alone), and near the end, with the question the Offering answers.
    if (!this.said.has("half") && g.tick >= S.ticks * S.stills.half) {
      this.said.add("half");
      this.say(ROOK, "", this.still("r10-1"), "key");
    }
    if (!this.said.has("last") && g.tick >= S.ticks - Math.ceil((S.stills.lastSec * 1000) / TICK_MS)) {
      this.said.add("last");
      this.say(ROOK, "That's her lantern. Why is it on the water?", { player: YOU, ...this.still("r10-2") }, "key");
    }
  }

  private player() {
    return this.game.players.find((p) => p.id === YOU)!;
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    // No result screen: the page cuts.
    this.end = { banked: this.banked, kes: 0, summary: "", lines: [], cut: true };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  /** The still to show with a line: spread into the line's options. Nothing when the stills are off. */
  private still(id: string): { still?: StillCue } {
    return this.stillsOn ? { still: { id } } : {};
  }

  private stillReady() {
    return this.clockTicks >= this.stillEnd + Math.ceil(STILL.gapMs / TICK_MS);
  }

  private shown(line: StoryLine, from = this.clockTicks) {
    if (!line.still) return;
    const ms = stillMs(line.still.id, line.text ? lineTicks(line) * TICK_MS : 0);
    if (this.phase === "playing") this.stillEnd = from + Math.ceil(ms / TICK_MS);
    this.stillsShown.push(line.still.id);
  }

  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, kind: "key" | "quip" = how.talk ? "key" : "quip") {
    const line = { who, text, ...how };
    if (this.phase !== "playing") {
      this.shown(line, this.clockTicks + this.lines.reduce((n, l) => n + lineTicks(l), 0));
      return void this.lines.push(line);
    }
    this.queue.push({ line, trigger: this.game.tick, key: kind === "key" });
    this.due();
  }

  private due() {
    const now = this.game.tick;
    while (this.queue.length && now >= this.busyUntil) {
      const q = this.queue[0]!;
      if (q.line.still && !this.stillReady()) delete q.line.still;
      this.queue.shift();
      // A picture with no words, whose turn was missed: nothing to show.
      if (!q.line.text && !q.line.still) continue;
      if (!q.key && now - q.trigger > 4) continue;
      this.shown(q.line);
      this.lines.push(q.line);
      this.busyUntil = now + (q.line.text ? lineTicks(q.line) : 1);
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
    const S = SHIP, t = this.game.tick, home = this.homeTicks();
    return {
      run: S.run, movement: 0, title: "", ring: null, mark: null, kes: 0, rival: null, note: "", end: this.end,
      ship: {
        tick: t,
        ticks: S.ticks,
        lead: this.lead,
        light: shipLight(t / S.ticks),
        home: Math.max(0, Math.min(1, (t - (S.ticks - home)) / home)),
        bell: t >= S.ticks * S.bell.from && this.gutterAt < 0,
        ...(this.gutterAt >= 0 ? { gutter: t - this.gutterAt } : {}),
        ...(this.over() ? { over: t - (S.ticks - S.railTicks) } : {}),
      },
    };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: SHIP.shrine,
      teams: 2,
      players: [{ id: YOU, name: ROOK, guild: 0, flame: "amber", connected: true, bot: false }],
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

  /** For tests and measurements. */
  get state() {
    return { phase: this.phase, game: this.game, end: this.end, lead: this.lead, gutterAt: this.gutterAt };
  }
}

type Pending = { line: StoryLine; trigger: number; key: boolean };

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
