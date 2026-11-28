// Story run 10, the ship home, played in the page: Rook alone on the deck of the stranger's ship,
// at night, and nobody in his ear. Loose wisps slide from the bow to the stern in the cloud either
// side; the ship's lamp amidships is the bank. The dark patch is in the cloud sea ahead, going the
// same way. What makes it a game is in three parts, each with its own switch (SHIP's header says
// why): the lamp's fire is the ship's speed and the speed is the difficulty; cloud banks sweep one
// side at a time; and a haul commits him, for wisps of two worths. If the patch goes out of sight
// the lamp gutters and the run starts again at the bow, with no line, because nobody is there to
// say one. The run lasts a fixed time and has no result. The numbers are SHIP
// (src/engine/shiphome.ts), the brief project files gameplay/runs9-10-prototype-brief.md, the lines
// and stills story/runs9-10-story-check.md (drafts for Ladi).

import { Mover, pt, samePt, type Pt } from "../engine/board.js";
import { botCommand } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, flingOffset, type Action, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { SHIP, SHIP_DECK, SHIP_SEA, bankCovers, inDraw, shipKindLanes, shipLanes, shipLight, shipReach, shipRise, type ShipBank } from "../engine/shiphome.js";
import { STILL, stillMs, type StillCue } from "../engine/stills.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1;
const ROOK = "Rook";

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "hold" | "rails" | "port" | "idle";

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
  /** The warning: how many said, whether it may be said again, and the tick it last was. */
  private warns = 0;
  private warnArmed = true;
  private warnedAt = -99;
  private wasLead = 0;
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
  private gone: { x: number; y?: number; tick: number }[] = [];
  /** Wisps the lamp has: over the rail, on their way to it. */
  private drawn = new Set<number>();
  /** The tiles round the lamp where one is banked. */
  private rim: Pt[] = [];
  /** How far off the rail the farthest lane is (tiles): the whole width on a wide screen, less on one held upright. */
  far: number = SHIP.off[1];
  /** Measurements: how often the keen stand-in dithers for a tick before a choice. */
  sloppy: number = SHIP.stand.sloppiness;
  /** Measurements: how much of that dithering is also not looking ahead for a bank. */
  standBlind: number = SHIP.stand.blind;
  /** Whether the lamp takes a wisp that is over the rail (see SHIP.draw). */
  draws: boolean = SHIP.draw.on;
  /** The three parts of the game, each to be turned off by itself (?speed=0, ?banks=0, ?hauls=0), and the run's length in ticks (?len). */
  speedOn = true;
  banksOn = true;
  haulsOn = true;
  len: number = SHIP.ticks;
  /** The lamp's fire (0 to 1): the ship's speed. */
  private fire = SHIP.speed.start as number;
  /** Wisps owed to the cloud ahead (one shows for so many tiles the ship goes through). */
  private showOwed = 0;
  /** The cloud bank there is now, the tick the next is first seen, and the side the last was on. */
  private bank: ShipBank | null = null;
  private bankAt = 0;
  private bankSide = 1;
  /** The big ones (worth more), the wisp on his line, and how many tiles a tick it comes. */
  private big = new Set<number>();
  private line: number | null = null;
  private rate = 1;
  /** What went into the lamp this tick, in points. */
  private fed = 0;
  /** For tests and measurements. */
  torn = 0;
  fireSum = 0;
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
        // Nothing can be taken hold of under a bank: he does not set off after one he cannot see.
        if (this.covered(msg.action)) return;
        this.game.command(YOU, { action: cleanAction(msg.action, this.game), toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    this.said = new Set();
    this.warns = 0;
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
    g.reachRule = (p, w) => !bankCovers(this.bank, w.pos.x - c0.x, w.pos.y - c0.y) && shipReach(p.pos.x - c0.x, p.pos.y - c0.y, w.pos.x - c0.x, w.pos.y - c0.y, this.reach);
    g.pullBoost.set(YOU, 2);
    this.drawn = new Set();
    this.rim = [];
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (g.board.inBankZone(pt(c0.x + x, c0.y + y))) this.rim.push(pt(c0.x + x, c0.y + y));
    g.respawnPause = g.outPause = S.pause;
    this.queue = [];
    this.busyUntil = 0;
    this.lead = this.wasLead = S.patch.start;
    this.warnArmed = true;
    this.warnedAt = -99;
    this.fire = S.speed.start;
    this.showOwed = 0;
    this.bank = null;
    this.bankAt = S.bank.first;
    this.bankSide = this.rng.next() < 0.5 ? -1 : 1;
    this.big = new Set();
    this.line = null;
    this.torn = 0;
    this.fireSum = 0;
    this.nextAt = 0;
    this.gutterAt = -1;
    this.windOwed = 0;
    this.gone = [];
    this.bellAt = Math.ceil(this.len * S.bell.from);
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
    // A few are alongside already, so that there is something to haul from the first tick: small ones near each rail, and a big one far out.
    const lanes = shipKindLanes(this.far);
    for (const [i, [x, y]] of ([[lanes.small[1]!, -9], [-lanes.small[2]!, -3], [lanes.big[lanes.big.length >> 2]!, -13], [-lanes.small[0]!, -16]] as const).entries()) {
      const w = g.wisps[i]!;
      g.away.delete(w.id);
      this.free.delete(w.id);
      w.pos = w.prev = pt(c0.x + x, c0.y + y);
      w.rimTicks = 0;
      if (this.haulsOn && Math.abs(x) >= Math.abs(lanes.big[0]!)) this.big.add(w.id);
    }
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
    this.big.delete(w.id);
    if (this.line === w.id) this.line = null;
  }

  /** How many tiles astern a loose wisp slides this tick: the ship's speed, or with that part off a wind that rises over the run. */
  private slide() {
    const S = SHIP;
    return (this.speedOn ? S.speed.wind[0] + (S.speed.wind[1] - S.speed.wind[0]) * this.fire : shipRise(S.wind[0], S.wind[1], this.share(), S.rise.by)) * this.windScale;
  }

  /** What a wisp is worth banked. */
  private worth(id: number) {
    // With hauls off they are all alike, and each is worth what the two kinds come to between them.
    return this.haulsOn ? SHIP.kinds.worth[this.big.has(id) ? 1 : 0]! : SHIP.kinds.worthPlain;
  }

  /** One shows in the cloud ahead of the bow: a small one down a lane near a rail, or a big one far out. */
  private arrive() {
    const g = this.game, c = g.board.center, S = SHIP;
    // None once home is coming in over where they would show: the sea empties toward the end.
    if (g.tick >= this.len - this.homeTicks()) return;
    if (this.speedOn) {
      // One for every so many tiles of cloud the ship goes through: a hot lamp brings more of them.
      this.showOwed = Math.min(2, this.showOwed + this.slide() / S.speed.rows);
      if (this.showOwed < 1) return;
    } else if (g.tick < this.nextAt) return;
    const w = g.wisps.find((o) => g.away.has(o.id) && (this.free.get(o.id) ?? 0) <= g.tick);
    if (!w) return;
    const top = c.y - SHIP_DECK.hl - S.ahead;
    const clear = (x: number) => !g.wisps.some((o) => !g.away.has(o.id) && Math.abs(o.pos.x - (c.x + x)) <= 1 && o.pos.y <= top + 3);
    let big = false, from: number[];
    if (this.haulsOn) {
      const kinds = shipKindLanes(this.far), small = kinds.small.filter(clear), far = kinds.big.filter(clear);
      big = far.length > 0 && (this.rng.next() < S.kinds.bigShare || !small.length);
      from = big ? far : small;
    } else {
      const lanes = shipLanes(this.far), nearEdge = SHIP_DECK.hw + S.off[0] + 1;
      const near = lanes.filter((x) => Math.abs(x) <= nearEdge && clear(x)), wide = lanes.filter((x) => Math.abs(x) > nearEdge && clear(x));
      from = (near.length && this.rng.next() < S.nearShare) || !wide.length ? near : wide;
    }
    if (!from.length) return;
    const at = pt(c.x + from[this.rng.int(from.length)]!, top - this.rng.int(S.scatter + 1));
    g.away.delete(w.id);
    this.free.delete(w.id);
    w.pos = w.prev = at;
    w.rimTicks = 0;
    if (big) this.big.add(w.id);
    if (this.speedOn) this.showOwed -= 1;
    else this.nextAt = g.tick + Math.ceil(shipRise(S.every[0], S.every[1], this.share(), S.rise.by) - 1e-9);
  }

  /**
   * His haul, and the lamp's draw. The wisp on his line comes straight in toward the rail, a small
   * one fast and a big one slowly, and slides astern with the rest all the while; the engine's own
   * pull is taken off it. (With hauls off it comes to him as the engine brings it, `haul` tiles a
   * tick, and the wind leaves it alone.) One that is over the rail is the lamp's: his staff comes
   * off it and it goes to the lamp by itself.
   */
  private haul() {
    const g = this.game, b = g.board, c = b.center, rook = this.player(), S = SHIP;
    const free = (q: Pt, w: Wisp) => b.passable(q, Mover.Wisp) && !samePt(q, rook.pos) && !g.wisps.some((o) => o !== w && !g.away.has(o.id) && samePt(o.pos, q));
    const step = (w: Wisp, to: Pt, n: number, stopBy = 0) => {
      for (let i = 0; i < n; i++) {
        if (Math.max(Math.abs(to.x - w.pos.x), Math.abs(to.y - w.pos.y)) <= stopBy || b.inBankZone(w.pos)) return;
        const q = pt(w.pos.x + Math.sign(to.x - w.pos.x), w.pos.y + Math.sign(to.y - w.pos.y));
        if (!free(q, w)) return;
        w.pos = q;
      }
    };
    let line: number | null = null;
    for (const w of g.wisps) {
      if (g.away.has(w.id) || b.inBankZone(w.pos)) continue;
      const held = !this.drawn.has(w.id) && w.touched && w.holder === YOU && rook.mode === "pull" && rook.beam === w.id;
      if (held && this.haulsOn) {
        const x = w.pos.x - c.x, side = Math.sign(x), edge = SHIP_DECK.hw + 1;
        if (this.line !== w.id) this.rate = Math.max(1, Math.ceil((SHIP_DECK.hw + this.far - edge) / S.kinds.ticks[this.big.has(w.id) ? 1 : 0]!));
        line = w.id;
        w.target = null;
        w.skate = null;
        // Straight in to the hull's side; another wisp in the way is passed over.
        let to = side * Math.max(edge, Math.abs(x) - this.rate);
        while (Math.abs(to) < Math.abs(x) && !free(pt(c.x + to, w.pos.y), w)) to += side;
        if (to !== x) w.pos = pt(c.x + to, w.pos.y);
      } else if (held) {
        step(w, rook.pos, Math.max(S.haul, Math.ceil(this.far / S.haulTicks)) - 2, 1);
        // The engine aimed it from where it was; it is nearer now, so aim it again from here.
        const off = flingOffset(rook.pos, w.pos, "pull");
        w.target = off.x || off.y ? pt(w.pos.x + off.x, w.pos.y + off.y) : null;
      } else if (this.haulsOn && !this.drawn.has(w.id) && !onDeckPt(w.pos, c)) {
        // A line that has dropped leaves it where it is, loose again.
        w.target = null;
        w.skate = null;
      }
      // Over the rail, or (with hauls off) hauled right to his hand wherever he stands.
      const atHand = !this.haulsOn && w.touched && rook.beam === w.id && Math.max(Math.abs(w.pos.x - rook.pos.x), Math.abs(w.pos.y - rook.pos.y)) <= 1;
      if (!this.draws || !(inDraw(w.pos.x - c.x, w.pos.y - c.y) || atHand || this.drawn.has(w.id))) continue;
      // The lamp has it. Its nearest side of the rim, and his staff off it.
      const fresh = !this.drawn.has(w.id);
      this.drawn.add(w.id);
      if (line === w.id) line = null;
      if (rook.action.kind === "staff" && rook.action.wisp === w.id) rook.action = { kind: "idle" };
      if (rook.beam === w.id) rook.beam = null;
      const to = this.rim.reduce((a, q) => (Math.hypot(q.x - w.pos.x, q.y - w.pos.y) < Math.hypot(a.x - w.pos.x, a.y - w.pos.y) ? q : a));
      w.skate = null;
      w.target = to;
      if (!fresh) step(w, to, S.draw.speed - 1);
    }
    this.line = line;
    for (const id of this.drawn) if (g.away.has(id)) this.drawn.delete(id);
  }

  /** Before the engine's step: a line whose wisp has slid out of his reach drops (he does not walk after it), and no staff goes onto one a bank is over. */
  private lineCheck() {
    const g = this.game, c = g.board.center, rook = this.player(), a = rook.action;
    if (a.kind !== "staff") return;
    const w = g.wisps[a.wisp];
    if (!w || g.away.has(w.id)) return;
    const x = w.pos.x - c.x, y = w.pos.y - c.y;
    const slid = this.haulsOn && this.line === w.id && !shipReach(rook.pos.x - c.x, rook.pos.y - c.y, x, y, this.reach);
    if (slid || bankCovers(this.bank, x, y)) {
      rook.action = { kind: "idle" };
      rook.beam = null;
      this.line = null;
    }
  }

  /** The cloud banks: one sweeps down one side from ahead, hides what it lies over, and tears a haul in the air under it off his line. */
  private banks() {
    const g = this.game, c = g.board.center, B = SHIP.bank;
    if (!this.banksOn) return;
    if (this.bank) {
      this.bank.front += B.speed;
      if (this.bank.front - B.len > SHIP_SEA.y1) this.bank = null;
    }
    if (!this.bank && g.tick >= this.bankAt && g.tick < this.len - this.homeTicks() - B.warn) {
      this.bankSide = this.rng.next() < B.swap ? -this.bankSide : this.bankSide;
      this.bank = { side: this.bankSide, front: SHIP_SEA.y0 - B.warn * B.speed };
      this.bankAt = g.tick + B.every[0] + this.rng.int(B.every[1] - B.every[0] + 1);
    }
    if (!this.bank || this.line === null) return;
    const w = g.wisps[this.line]!;
    if (g.away.has(w.id) || this.drawn.has(w.id) || !bankCovers(this.bank, w.pos.x - c.x, w.pos.y - c.y)) return;
    this.gone.push({ x: w.pos.x - c.x, y: w.pos.y - c.y, tick: g.tick });
    this.away(w, g.tick);
    this.lost++;
    this.torn++;
  }

  /** The fire that keeps pace with the patch from here (with speed on): nearer it, it takes more. */
  private pace() {
    const P = SHIP.patch, Sp = SHIP.speed;
    const nearness = Math.max(0, Math.min(1, (P.gone - this.lead) / (P.gone - P.nearest)));
    return Math.min(1, Sp.even + Sp.near * nearness);
  }

  /** How much of the run is done (0 to 1). */
  private share() {
    return this.game.tick / this.len;
  }

  /** The slide: every loose wisp out in the cloud toward the stern, and gone once it is past it. One over the rail is out of it; one on his line is not (with hauls off, it is). */
  private wind() {
    const g = this.game, b = g.board, c = b.center, rook = this.player();
    this.gone = this.gone.filter((o) => g.tick - o.tick < 4);
    // It goes by parts of a tile: each whole tile owed is a step astern for every loose wisp.
    this.windOwed += this.slide();
    for (; this.windOwed >= 1; this.windOwed -= 1) {
      // Sternmost first, so that one moving on leaves room for the one behind it.
      // Loose is "no staff on it this tick, and not in flight": the engine's `holder` stays set after a touch, so it cannot be the test.
      const loose = g.wisps.filter((w) => !g.away.has(w.id) && (this.haulsOn || (!w.touched && rook.beam !== w.id && !w.target && !w.skate)) && !b.inBankZone(w.pos) && !this.drawn.has(w.id) && !inDraw(w.pos.x - c.x, w.pos.y - c.y)).sort((a, z) => z.pos.y - a.pos.y);
      for (const w of loose) {
        if (w.pos.y + 1 > c.y + SHIP_DECK.hl + SHIP.astern) {
          // Gone astern. (With speed off, the patch draws away for it.)
          this.gone.push({ x: w.pos.x - c.x, tick: g.tick });
          this.away(w, g.tick);
          this.lost++;
          if (!this.speedOn) this.lead += SHIP.patch.lose;
          continue;
        }
        // Round the hooded figure, who does not move.
        const tries = [pt(w.pos.x, w.pos.y + 1), pt(w.pos.x + 1, w.pos.y + 1), pt(w.pos.x - 1, w.pos.y + 1)];
        const to = tries.find((q) => b.passable(q, Mover.Wisp) && !g.wisps.some((o) => o !== w && !g.away.has(o.id) && samePt(o.pos, q)));
        if (!to) continue;
        w.pos = to;
        w.target = null;
      }
    }
  }

  // ---------------------------------------------------------------- the clock

  /** The last stretch: home is over the top of the screen, and nothing can be lost any more. */
  private homeTicks() {
    return Math.ceil((SHIP.endSec * 1000) / TICK_MS);
  }
  private over() {
    return this.game.tick >= this.len - SHIP.railTicks;
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
    this.fed = 0;
    // Out of sight: the lamp gutters, and it is the bow again. Nobody says anything.
    if (this.gutterAt >= 0) {
      g.tick++;
      if (g.tick - this.gutterAt >= P.gutterTicks) {
        this.restarts++;
        this.queue = [];
        this.start(false);
        // Why it is the bow again, in his own mouth.
        if (S.lostLine) this.say(ROOK, S.lostLine, { player: YOU }, "key");
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
      if (g.tick >= this.len) this.finish();
      return;
    }
    if (this.stand === "rails" || this.stand === "port") this.keen();
    else if (this.stand && this.stand !== "idle") {
      const cmd = botCommand(g, YOU, S.stand, () => this.rng.next());
      if (cmd) g.command(YOU, cmd);
    }
    this.lineCheck();
    this.arrive();
    g.step();
    this.ticks = g.tick;
    this.haul();
    this.wind();
    this.banks();
    // The one meter.
    const worth = (this.fed = g.banks.reduce((n, o) => n + this.worth(o.wisp), 0));
    this.banked += g.banks.length;
    const nearness = Math.max(0, Math.min(1, (P.gone - this.lead) / (P.gone - P.nearest)));
    // In the last stretch, with home in sight, it draws away no more.
    const last = g.tick >= this.len - this.homeTicks();
    if (this.speedOn) {
      // The fire burns down and is fed; above what it takes to hold his distance he gains on the patch, below it he falls behind.
      const Sp = S.speed;
      this.fire = Math.max(0, Math.min(1, this.fire - (last ? 0 : Sp.burn[0] + Sp.burn[1] * this.fire) + Sp.feed * worth));
      const by = (Sp.even + Sp.near * nearness - this.fire) * Sp.rate;
      this.lead += last ? Math.min(0, by) : by;
    } else {
      // Each bank gains on it; it draws away by itself, and with every wisp lost.
      const drift = last ? 0 : shipRise(P.drift[0], P.drift[1], this.share()) * (P.pull[0] + (P.pull[1] - P.pull[0]) * nearness);
      this.lead += drift - P.gain * worth;
    }
    this.fireSum += this.fire;
    this.lead = Math.max(P.nearest, last ? Math.min(this.lead, P.gone - 1) : this.lead);
    this.nearest = Math.min(this.nearest, this.lead);
    this.farthest = Math.max(this.farthest, this.lead);
    // Drawing away and near out of sight: his warning, taking turns.
    const W = S.warn, edge = P.gone - W.lead;
    if (this.lead < edge - W.rearm) this.warnArmed = true;
    if (!last && this.warnArmed && this.lead >= edge && this.lead < P.gone && this.lead > this.wasLead && g.tick - this.warnedAt >= W.gap) {
      this.warnArmed = false;
      this.warnedAt = g.tick;
      this.say(ROOK, W.lines[this.warns++ % W.lines.length]!, { player: YOU });
    }
    this.wasLead = this.lead;
    if (this.lead >= P.gone) {
      this.gutterAt = g.tick;
      this.bank = null;
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
    if (!this.said.has("half") && g.tick >= this.len * S.stills.half) {
      this.said.add("half");
      this.say(ROOK, "", this.still("r10-1"), "key");
    }
    if (!this.said.has("last") && g.tick >= this.len - Math.ceil((S.stills.lastSec * 1000) / TICK_MS)) {
      this.said.add("last");
      // The picture has no Rook in it now (Ladi, 25 Nov, 1:52 AM): the line stays his bubble, with his face, over the picture.
      this.say(ROOK, "That's Lumi's lantern. Why is it on the water?", { player: YOU, ...(this.stillsOn ? { still: { id: "r10-2", bubble: true } } : {}) }, "key");
    }
  }

  private player() {
    return this.game.players.find((p) => p.id === YOU)!;
  }

  private covered(raw: unknown) {
    const a = raw as { kind?: unknown; wisp?: unknown } | null, w = a && a.kind === "staff" && Number.isInteger(a.wisp) ? this.game.wisps[a.wisp as number] : undefined, c = this.game.board.center;
    return !!w && !this.game.away.has(w.id) && bankCovers(this.bank, w.pos.x - c.x, w.pos.y - c.y);
  }

  /**
   * Measurements only: a keen stand-in, where the other one stays amidships and takes what is
   * within the square. He takes whichever wisp is worth most for the ticks it will cost him (the
   * run to its rail, then the haul), and leaves any that would reach the stern, slide out of his
   * reach, or be under a bank before it was aboard. With nothing to take he waits at the rail a
   * bank is not coming down. `sloppy` is how often he dithers for a tick before a choice. As
   * "port" he never leaves the port rail, to measure what crossing the deck is worth.
   */
  private keen() {
    const g = this.game, c = g.board.center, rook = this.player(), S = SHIP, B = S.bank;
    const px = rook.pos.x - c.x, py = rook.pos.y - c.y;
    const live = (w: Wisp) => !g.away.has(w.id) && !this.drawn.has(w.id) && !g.board.inBankZone(w.pos);
    const a = rook.action;
    if (a.kind === "staff" && g.wisps[a.wisp] && live(g.wisps[a.wisp]!)) return;
    if (this.rng.next() < this.sloppy) return;
    const slide = this.slide(), band = SHIP_DECK.hw - S.railLeeway;
    // The careless one sometimes does not look ahead for a bank, and has his haul torn off his line as a person would.
    const blind = this.rng.next() < this.sloppy * this.standBlind;
    let best: number | null = null, value = 0;
    for (const w of g.wisps) {
      if (!live(w)) continue;
      const x = w.pos.x - c.x, y = w.pos.y - c.y, side = Math.sign(x);
      if (y < -SHIP_DECK.hl - S.ahead + 1 || bankCovers(this.bank, x, y)) continue;
      // The one who never leaves the port rail takes nothing to starboard.
      if (this.stand === "port" && side > 0) continue;
      // Ticks to be where he can take it (he runs two tiles a tick, and steadies for one), then to haul it to the rail.
      const there = shipReach(px, py, x, y, this.reach);
      const walk = there ? 0 : Math.ceil(Math.max(Math.max(0, band - side * px), Math.max(0, Math.abs(y - py) - this.reach + 2)) / 2) + 1;
      const kind = this.big.has(w.id) ? 1 : 0, out = Math.max(0, Math.abs(x) - SHIP_DECK.hw - 1);
      const hauls = this.haulsOn ? Math.ceil(out / Math.max(1, Math.ceil((this.far - 1) / S.kinds.ticks[kind]!))) : Math.ceil(out / Math.max(S.haul, Math.ceil(this.far / S.haulTicks)));
      const ticks = walk + 1 + hauls, then = y + slide * ticks;
      // It would be gone astern, or have slid out of his reach, before it was aboard.
      if (then > SHIP_DECK.hl + S.astern - 1) continue;
      if (this.haulsOn && there && then - py > this.reach) continue;
      // A bank would be over it first.
      if (!blind && this.bank && this.bank.side === side && this.bank.front < y && this.bank.front + B.speed * ticks >= y) continue;
      const v = (this.haulsOn ? this.worth(w.id) : 1) / ticks;
      if (v > value) (best = w.id), (value = v);
    }
    if (best !== null) return void g.command(YOU, { action: { kind: "staff", wisp: best }, toggleRun: !rook.run });
    // Nothing to take: to the rail no bank is coming down, a little forward of the lamp, to see them early.
    const to = this.stand === "port" ? -1 : this.bank ? -this.bank.side : Math.sign(px) || 1;
    const at = pt(c.x + to * SHIP_DECK.hw, c.y - 4);
    if (!samePt(rook.pos, at) && a.kind !== "walk") g.command(YOU, { action: { kind: "walk", to: at }, toggleRun: !rook.run });
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
    const S = SHIP, g = this.game, c = g.board.center, t = g.tick, home = this.homeTicks();
    const out = g.wisps.filter((w) => !g.away.has(w.id));
    const hid = out.filter((w) => !this.drawn.has(w.id) && bankCovers(this.bank, w.pos.x - c.x, w.pos.y - c.y)).map((w) => w.id);
    return {
      run: S.run, movement: 0, title: "", ring: null, mark: null, kes: 0, rival: null, note: "", end: this.end,
      ship: {
        tick: t,
        ticks: this.len,
        lead: this.lead,
        light: shipLight(t / this.len),
        home: Math.max(0, Math.min(1, (t - (this.len - home)) / home)),
        bell: this.stroke,
        reach: this.reach,
        far: SHIP_DECK.hw + this.far,
        ...(this.speedOn ? { fire: this.fire } : {}),
        ...(this.bank ? { bank: { ...this.bank, len: S.bank.len, speed: S.bank.speed } } : {}),
        ...(this.big.size ? { big: [...this.big] } : {}),
        ...(hid.length ? { hid } : {}),
        ...(this.line !== null ? { line: this.line } : {}),
        ...(this.fed ? { fed: this.fed } : {}),
        ...(this.gone.length ? { lost: this.gone } : {}),
        ...(this.gutterAt >= 0 ? { gutter: t - this.gutterAt } : {}),
        ...(this.over() ? { over: t - (this.len - S.railTicks) } : {}),
      },
      // Two meters along the top (Ladi, 24 Nov): how far along the way home he is (Progress, filling
      // up: Ladi, 24 Nov late), and how much light the lamp has, which is how fast the ship goes. The
      // lamp's notch is what it takes to keep pace with the patch from here: below it the patch draws
      // away, and out of sight it is the bow again, lamp or no lamp. Gone once he is over the rail.
      ...(this.phase === "playing" && !this.over()
        ? {
            opt: {
              id: "r10",
              strip: [
                { label: "Progress", n: 0, of: 0, tone: "chalk" as const, bar: Math.min(1, t / this.len), steady: true },
                ...(this.speedOn ? [{ label: "Lamp", n: 0, of: 0, tone: "us" as const, bar: this.fire, ...(t >= this.len - home ? {} : { mark: this.pace() }) }] : []),
              ],
            },
          }
        : {}),
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

const onDeckPt = (p: Pt, c: Pt) => Math.abs(p.x - c.x) <= SHIP_DECK.hw && Math.abs(p.y - c.y) <= SHIP_DECK.hl;

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
