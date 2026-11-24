// Story run 10, the ship home, played in the page: Rook alone on the deck of the stranger's ship,
// at night, and nobody in his ear. The wind carries loose wisps from the bow to the stern; the
// ship's lamp amidships is the bank. The dark patch is in the cloud sea ahead, going the same way:
// each bank gains on it, each wisp lost off the stern lets it draw away, and if it goes out of
// sight the lamp gutters and the run starts again at the bow, with no line, because nobody is there
// to say one. The run lasts a fixed time and has no result. The numbers are SHIP
// (src/engine/shiphome.ts), the brief project files gameplay/runs9-10-prototype-brief.md, the lines
// and stills story/runs9-10-story-check.md (drafts for Ladi).

import { Mover, pt, samePt, type Pt } from "../engine/board.js";
import { botCommand } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, flingOffset, type Action, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { SHIP, SHIP_DECK, inDraw, shipLanes, shipLight, shipReach, shipRise } from "../engine/shiphome.js";
import { STILL, stillMs, type StillCue } from "../engine/stills.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1;
const ROOK = "Rook";

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "hold" | "rails" | "idle";

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
  /** His reach in this run, to try by playing (?reach=8, 10 or 12 in the page). */
  reach = SHIP.reach as number;
  /** The wind, to try by playing (?wind=0.75 or 1.25 in the page): SHIP.wind times this. */
  windScale = 1;
  /** The bell from home: the tick of its next stroke, how many it has rung, and whether it rings on this tick. */
  private bellAt = 0;
  private bells = 0;
  private stroke = false;
  /** Tiles of wind owed to the loose wisps (it blows by parts of a tile a tick). */
  private windOwed = 0;
  /** Wisps the wind has just taken off the stern: the column each left by (tiles from the lamp) and the tick, for the page to show going. */
  private gone: { x: number; tick: number }[] = [];
  /** Wisps the lamp has: over the rail, on their way to it. */
  private drawn = new Set<number>();
  /** The tiles round the lamp where one is banked. */
  private rim: Pt[] = [];
  /** How far off the rail the farthest lane is (tiles): the whole width on a wide screen, less on one held upright. */
  far: number = SHIP.off[1];
  /** Whether the lamp takes a wisp that is over the rail (see SHIP.draw). */
  draws: boolean = SHIP.draw.on;
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
    g.pullReach = this.reach;
    // From the band along a rail, everything out over it.
    const c0 = g.board.center;
    g.reachRule = (p, w) => shipReach(p.pos.x - c0.x, p.pos.y - c0.y, w.pos.x - c0.x, w.pos.y - c0.y, this.reach);
    g.pullBoost.set(YOU, 2);
    this.drawn = new Set();
    this.rim = [];
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (g.board.inBankZone(pt(c0.x + x, c0.y + y))) this.rim.push(pt(c0.x + x, c0.y + y));
    g.respawnPause = g.outPause = S.pause;
    this.queue = [];
    this.busyUntil = 0;
    this.lead = S.patch.start;
    this.nextAt = 0;
    this.gutterAt = -1;
    this.windOwed = 0;
    this.gone = [];
    this.bellAt = Math.ceil(S.ticks * S.bell.from);
    this.bells = 0;
    this.stroke = false;
    this.banked = this.lost = this.ticks = 0;
    this.nearest = 99;
    this.farthest = 0;
    this.said.delete("half");
    this.said.delete("last");
    // Every wisp waits out of sight ahead; the room brings them into the cloud beside the ship one at a time.
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
    this.drawn.delete(w.id);
  }

  /** Where the lull is now: 0 before it and after the rich stretch, 1 in the lull, 2 in the rich stretch that follows. */
  private lull() {
    const L = SHIP.lull, t = this.game.tick - Math.round(SHIP.ticks * L.at);
    return t < 0 ? 0 : t < L.ticks ? 1 : t < L.ticks + L.rich ? 2 : 0;
  }

  /** One shows in the cloud ahead of the bow: anywhere across the width of it, most of them far out, never two in a row. */
  private arrive() {
    const g = this.game, c = g.board.center, S = SHIP;
    // None once home is coming in over where they would show: the sea empties toward the end.
    if (g.tick < this.nextAt || g.tick >= S.ticks - this.homeTicks()) return;
    const w = g.wisps.find((o) => g.away.has(o.id) && (this.free.get(o.id) ?? 0) <= g.tick);
    if (!w) return;
    const top = c.y - SHIP_DECK.hl - S.ahead;
    const clear = (x: number) => !g.wisps.some((o) => !g.away.has(o.id) && Math.abs(o.pos.x - (c.x + x)) <= 1 && o.pos.y <= top + 3);
    const lanes = shipLanes(this.far), nearEdge = SHIP_DECK.hw + S.off[0] + 1;
    const near = lanes.filter((x) => Math.abs(x) <= nearEdge && clear(x)), wide = lanes.filter((x) => Math.abs(x) > nearEdge && clear(x));
    const lull = this.lull();
    const from = (near.length && this.rng.next() < (lull === 2 ? S.lull.richNear : S.nearShare)) || !wide.length ? near : wide;
    if (!from.length) return;
    const at = pt(c.x + from[this.rng.int(from.length)]!, top - this.rng.int(S.scatter + 1));
    g.away.delete(w.id);
    this.free.delete(w.id);
    w.pos = w.prev = at;
    w.rimTicks = 0;
    const every = shipRise(S.every[0], S.every[1], this.share(), S.rise.by);
    this.nextAt = g.tick + Math.ceil((lull === 1 ? every * S.lull.thin : lull === 2 ? S.lull.richEvery : every) - 1e-9);
  }

  /**
   * His haul, and the lamp's draw. A wisp his staff is on comes `haul` tiles a tick in all (the
   * engine brings it two of them). One that is over the rail is the lamp's: his staff comes off it
   * and it goes to the lamp by itself.
   */
  private haul() {
    const g = this.game, b = g.board, c = b.center, rook = this.player(), S = SHIP;
    const step = (w: Wisp, to: Pt, n: number, stopBy = 0) => {
      for (let i = 0; i < n; i++) {
        if (Math.max(Math.abs(to.x - w.pos.x), Math.abs(to.y - w.pos.y)) <= stopBy || b.inBankZone(w.pos)) return;
        const q = pt(w.pos.x + Math.sign(to.x - w.pos.x), w.pos.y + Math.sign(to.y - w.pos.y));
        if (!b.passable(q, Mover.Wisp) || samePt(q, rook.pos) || g.wisps.some((o) => o !== w && !g.away.has(o.id) && samePt(o.pos, q))) return;
        w.pos = q;
      }
    };
    for (const w of g.wisps) {
      if (g.away.has(w.id) || b.inBankZone(w.pos)) continue;
      if (!this.drawn.has(w.id) && w.touched && w.holder === YOU && rook.mode === "pull" && rook.beam === w.id) {
        step(w, rook.pos, S.haul - 2, 1);
        // The engine aimed it from where it was; it is nearer now, so aim it again from here.
        const off = flingOffset(rook.pos, w.pos, "pull");
        w.target = off.x || off.y ? pt(w.pos.x + off.x, w.pos.y + off.y) : null;
      }
      // Over the rail, or hauled right to his hand wherever he stands.
      const atHand = w.touched && rook.beam === w.id && Math.max(Math.abs(w.pos.x - rook.pos.x), Math.abs(w.pos.y - rook.pos.y)) <= 1;
      if (!this.draws || !(inDraw(w.pos.x - c.x, w.pos.y - c.y) || atHand || this.drawn.has(w.id))) continue;
      // The lamp has it. Its nearest side of the rim, and his staff off it.
      const fresh = !this.drawn.has(w.id);
      this.drawn.add(w.id);
      if (rook.action.kind === "staff" && rook.action.wisp === w.id) rook.action = { kind: "idle" };
      if (rook.beam === w.id) rook.beam = null;
      const to = this.rim.reduce((a, q) => (Math.hypot(q.x - w.pos.x, q.y - w.pos.y) < Math.hypot(a.x - w.pos.x, a.y - w.pos.y) ? q : a));
      w.skate = null;
      w.target = to;
      if (!fresh) step(w, to, S.draw.speed - 1);
    }
    for (const id of this.drawn) if (g.away.has(id)) this.drawn.delete(id);
  }

  /** How much of the run is done (0 to 1). */
  private share() {
    return this.game.tick / SHIP.ticks;
  }

  /** The wind: every loose wisp out in the cloud a tile toward the stern, and gone once it is past it. One on his staff is not loose, and one over the rail is out of the wind. */
  private wind() {
    const g = this.game, b = g.board, c = b.center, rook = this.player();
    this.gone = this.gone.filter((o) => g.tick - o.tick < 4);
    // It rises over the run, and blows by parts of a tile: a whole tile owed is a step astern for every loose wisp.
    this.windOwed += shipRise(SHIP.wind[0], SHIP.wind[1], this.share(), SHIP.rise.by) * this.windScale;
    if (this.windOwed < 1) return;
    this.windOwed -= 1;
    // Sternmost first, so that one moving on leaves room for the one behind it.
    // Loose is "no staff on it this tick, and not in flight": the engine's `holder` stays set after a touch, so it cannot be the test.
    const loose = g.wisps.filter((w) => !g.away.has(w.id) && !w.touched && rook.beam !== w.id && !w.target && !w.skate && !b.inBankZone(w.pos) && !this.drawn.has(w.id) && !inDraw(w.pos.x - c.x, w.pos.y - c.y)).sort((a, z) => z.pos.y - a.pos.y);
    for (const w of loose) {
      if (w.pos.y + 1 > c.y + SHIP_DECK.hl + SHIP.astern) {
        // Gone astern: the patch draws away.
        this.gone.push({ x: w.pos.x - c.x, tick: g.tick });
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
    this.stroke = false;
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
    if (this.stand === "rails") this.keen();
    else if (this.stand && this.stand !== "idle") {
      const cmd = botCommand(g, YOU, S.stand, () => this.rng.next());
      if (cmd) g.command(YOU, cmd);
    }
    this.arrive();
    g.step();
    this.ticks = g.tick;
    this.haul();
    this.wind();
    // The one meter. Each bank gains on it; it draws away by itself, and with every wisp the wind takes.
    this.banked += g.banks.length;
    const nearness = Math.max(0, Math.min(1, (P.gone - this.lead) / (P.gone - P.nearest)));
    // In the last stretch, with home in sight, it draws away no more.
    const last = g.tick >= S.ticks - this.homeTicks();
    const drift = last ? 0 : shipRise(P.drift[0], P.drift[1], this.share()) * (P.pull[0] + (P.pull[1] - P.pull[0]) * nearness) * [1, S.lull.drift, S.lull.richDrift][this.lull()]!;
    this.lead += drift - P.gain * g.banks.length;
    this.lead = Math.max(P.nearest, last ? Math.min(this.lead, P.gone - 1) : this.lead);
    this.nearest = Math.min(this.nearest, this.lead);
    this.farthest = Math.max(this.farthest, this.lead);
    if (this.lead >= P.gone) {
      this.gutterAt = g.tick;
      for (const w of g.wisps) if (!g.away.has(w.id)) this.away(w, g.tick);
      this.player().action = { kind: "idle" };
      return;
    }
    // The bell from home, from half way: one stroke, and the next after a gap that is never the last one.
    if (g.tick >= this.bellAt) {
      this.stroke = true;
      this.bellAt = g.tick + S.bell.gaps[this.bells++ % S.bell.gaps.length]!;
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

  /**
   * Measurements only: a keen stand-in, who runs to whichever rail has the wisp that costs him
   * least to get and hauls it over, where the other stand-in stays amidships and takes what is
   * within the square. `stand.sloppiness` is how often he dithers for a tick before choosing.
   */
  private keen() {
    const g = this.game, c = g.board.center, rook = this.player(), S = SHIP;
    const px = rook.pos.x - c.x, py = rook.pos.y - c.y;
    const live = (w: Wisp) => !g.away.has(w.id) && !this.drawn.has(w.id) && !g.board.inBankZone(w.pos);
    const a = rook.action;
    if (a.kind === "staff" && g.wisps[a.wisp] && live(g.wisps[a.wisp]!)) return;
    if (this.rng.next() < S.stand.sloppiness) return;
    const wind = shipRise(S.wind[0], S.wind[1], g.tick / S.ticks, S.rise.by) * this.windScale;
    const band = SHIP_DECK.hw - S.railLeeway;
    let best: number | null = null, cost = Infinity;
    for (const w of g.wisps) {
      if (!live(w)) continue;
      const x = w.pos.x - c.x, y = w.pos.y - c.y;
      if (y < -SHIP_DECK.hl - 3) continue;
      const side = Math.sign(x);
      // Ticks to be where he can take it (he runs two tiles a tick, and steadies for one), then to haul it to the rail.
      const walk = shipReach(px, py, x, y, this.reach) ? 0 : Math.ceil(Math.max(Math.max(0, band - side * px), Math.max(0, Math.abs(y - py) - this.reach + 2)) / 2) + 1;
      const hauls = Math.ceil(Math.max(0, Math.abs(x) - SHIP_DECK.hw - 1) / S.haul);
      if (walk + 1 >= (SHIP_DECK.hl + S.astern - y) / wind) continue;
      if (walk + hauls < cost) (best = w.id), (cost = walk + hauls);
    }
    if (best !== null) g.command(YOU, { action: { kind: "staff", wisp: best }, toggleRun: !rook.run });
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
        bell: this.stroke,
        reach: this.reach,
        far: SHIP_DECK.hw + this.far,
        ...(this.gone.length ? { lost: this.gone } : {}),
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
