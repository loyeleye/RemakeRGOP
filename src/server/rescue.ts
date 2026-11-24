// Story run 9, the rescue, played in the page: Rook and Kes on the low one, filling the lamps of
// three boats at the landing while the cloud closes from the north. A dark patch in the cloud
// crosses the board twice: no light under it can be seen, loose wisps it covers are gone when it
// has passed, it breaks Kes's string, and it does nothing to Rook. The numbers are RESCUE
// (src/engine/rescue.ts), the brief project files gameplay/runs9-10-prototype-brief.md, the lines
// story/runs9-10-story-check.md (drafts for Ladi). The cloud is the light law's cloud in game.ts,
// the string is the storm law, and the pools hold the laws of water.

import { Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { botCommand, planSpot } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Command, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { LO_FRAME, LO_OVAL, LO_POOLS, RESCUE, loLand, loPlanks, loStrip } from "../engine/rescue.js";
import { STILL, stillMs, type StillCue } from "../engine/stills.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, KES_ID = 2;
const ROOK = "Rook", KES = "Kes", GRAN = "Sefa's grandmother";

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "hold" | "idle";

/** The patch: its middle (tiles, not whole), its step each tick, its half-width, and ticks left before its edge reaches the land. */
type Patch = { x: number; y: number; dx: number; dy: number; r: number; warn: number; n: 1 | 2; took: number; crossedKes: boolean; saidUp: boolean };

export class RescueRoom {
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
  /** Each boat's lamp, and how many boats have lifted. */
  private fill: number[] = [];
  private lifted = 0;
  /** How many steps in the cloud has come. */
  private cloudStep = 0;
  /** The patch while it is about, how many times it has crossed, and when the last crossing ended. */
  private patch: Patch | null = null;
  private crossings = 0;
  private crossedAt = -1e9;
  /** Loose wisps it has covered: gone when it has passed. */
  private taken = new Set<number>();
  /** Where each wisp it took went out, and when: a wick of smoke stands there a moment. */
  private outs: { x: number; y: number; tick: number }[] = [];
  /** Kes under it (her glow dark), standing shaken until this tick after it, and held where she is while it comes the second time. */
  private kesDark = false;
  private kesShaken = -1;
  private kesHold = false;
  /** Where Kes's next group comes up, and whether it is on its way. */
  private spots: Pt[] = [];
  private groupDue = false;
  /** The last boat's lamp is full: the tick it filled, and the tick the boat lifted. */
  private endingAt = -1;
  private liftAt = -1;
  /** The room's own clock in ticks (it runs in the bells too), for the stills. */
  private clockTicks = 0;
  private stillEnd = -1e9;
  /** "dark" (the story thread's, the default) or "drag" (the first sketch; ?patch=drag in the page). */
  patchMode: "dark" | "drag" = RESCUE.patch.drag ? "drag" : "dark";
  /** All the stills off (?nostills in the page). */
  stillsOn = true;
  /** For tests and measurements. */
  stillsShown: string[] = [];
  restarts = 0;
  ticks = 0;
  lost = 0;
  lostToPatch = 0;
  kesBanks = 0;

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
        if (this.phase !== "playing" || this.endingAt >= 0) return;
        const action = cleanAction(msg.action, this.game);
        // He cannot start a pull on a wisp he cannot see: one under the patch that is not already on his staff.
        if (action?.kind === "staff" && this.patchMode === "dark" && this.covers(this.game.wisps[action.wisp]!.pos) && this.player(YOU).beam !== action.wisp) {
          return this.game.command(YOU, { toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        }
        this.game.command(YOU, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
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

  /** From the top: at first with the talk at the landing before it, on a restart straight in. */
  private start(first: boolean) {
    const R = RESCUE;
    const g = (this.game = new Game(
      shrineById(R.shrine),
      [
        { id: YOU, guild: 0 as Guild, name: ROOK },
        { id: KES_ID, guild: 1 as Guild, name: KES },
      ],
      this.seed(),
      [R.his, R.hers],
      100000,
    ));
    g.waterLawHere = true;
    g.noShove = true;
    g.stormLight = KES_ID;
    g.stringMax = R.storm.max;
    g.stringReach = R.storm.reach;
    g.stringLink = R.storm.link;
    g.stringGap = R.storm.gap;
    // The cloud is the light law's cloud: a wisp beyond its edge fades and is lost. The flame itself is not used.
    g.flame = 100;
    g.flameFloor = 100;
    g.flameDrain = g.flameFeed = 0;
    g.dimTicks = R.cloud.dimTicks;
    g.cloudAt = R.cloud.start;
    g.respawnPause = g.outPause = R.pause;
    this.queue = [];
    this.busyUntil = 0;
    this.fill = Array<number>(R.boats).fill(0);
    this.lifted = 0;
    this.cloudStep = 0;
    this.patch = null;
    this.crossings = 0;
    this.crossedAt = -1e9;
    this.taken = new Set();
    this.outs = [];
    this.kesDark = this.kesHold = false;
    this.kesShaken = -1;
    this.endingAt = this.liftAt = -1;
    this.lost = this.lostToPatch = this.kesBanks = this.ticks = 0;
    this.said.delete("up");
    this.said.delete("where");
    this.said.delete("back");
    this.said.delete("string");
    this.said.delete("first");
    g.onReturn = (w) => this.arrive(w);
    this.placeGroup();
    for (const w of g.wisps) this.arrive(w);
    this.groupDue = false;
    this.phase = first ? "countdown" : "playing";
    if (first) {
      const before = this.lines.length;
      // Where this is, before anyone speaks.
      this.say("", "The low one. The next island over, and the cloud is taking it.", { talk: true });
      this.say(GRAN, "Little ones on the first boat. We'll keep.", { talk: true, ...this.still("r9-0") });
      this.say(KES, "Near side's yours. I'll string the far side over.", { talk: true });
      this.countdown = R.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    }
    this.flush();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- the wisps

  /** A wisp comes onto the board: his on the near side by itself, hers in her group's place on the far side. */
  private arrive(w: Wisp) {
    const g = this.game;
    if (this.endingAt >= 0 || this.lifted >= RESCUE.boats) return void g.away.set(w.id, 1e9);
    if (w.guild === 1) {
      const spot = this.spots[g.wisps.filter((o) => o.guild === 1).indexOf(w)];
      if (!spot) return void g.away.set(w.id, 1e9);
      return moveWisp(w, spot);
    }
    // Before the first crossing his come up on the middle strip where it will cross, so there is something loose there for it to pass over.
    const armed = this.crossings === 0 && !this.patch && this.banked() >= RESCUE.patch.firstBanks - 2;
    const at = (armed && this.onCourse(this.course())) || this.openSpot((x) => loStrip(x) < 2, RESCUE.arriveNear, 2);
    if (!at) return void g.away.set(w.id, g.tick + RESCUE.pause);
    moveWisp(w, at);
  }

  /** A tile of open ground on the strips `strip` allows, at least `near` from the slip, inside the cloud's edge, and `apart` from every wisp. */
  private openSpot(strip: (x: number) => boolean, near: number, apart: number, around: Pt | null = null, within = 0): Pt | null {
    const g = this.game, b = g.board, c = b.center, R = RESCUE;
    const edge = (g.cloudAt ?? R.cloud.start) - R.arriveInside;
    const lo = Math.min(near, Math.max(6, edge - 4));
    const live = g.wisps.filter((o) => !g.away.has(o.id));
    for (let n = 0; n < 200; n++) {
      const x = around ? around.x - c.x + this.rng.int(within * 2 + 1) - within : LO_FRAME.x0 + this.rng.int(LO_FRAME.x1 - LO_FRAME.x0 + 1);
      const y = around ? around.y - c.y + this.rng.int(within * 2 + 1) - within : LO_FRAME.y0 + this.rng.int(-LO_FRAME.y0);
      const p = pt(c.x + x, c.y + y), d = Math.hypot(x, y);
      if (!strip(x) || d < lo || d > edge || !loLand(x, y) || loPlanks(x, y) || b.tile(p) !== Tile.Floor) continue;
      if (live.some((o) => cheb(o.pos, p) < apart) || g.players.some((q) => samePt(q.pos, p)) || this.spots.some((q) => cheb(q, p) < apart && !samePt(q, p) && around !== null)) continue;
      if (this.patch && this.covers(p, 1.5)) continue;
      return p;
    }
    return null;
  }

  /** Where Kes's next group comes up: a loose cluster on the east strip. */
  private placeGroup() {
    this.spots = [];
    const mid = this.openSpot((x) => loStrip(x) === 2 && x >= 8, RESCUE.arriveNear + 2, 2);
    if (!mid) return;
    this.spots.push(mid);
    while (this.spots.length < RESCUE.hers) {
      const p = this.openSpot((x) => loStrip(x) === 2 && x >= 7, RESCUE.arriveNear, 2, mid, RESCUE.spread);
      if (!p) break;
      this.spots.push(p);
    }
  }

  /** Hers wait off the board until the whole group is banked or lost, then the next group comes together. */
  private nextGroup() {
    const g = this.game, hers = g.wisps.filter((w) => w.guild === 1);
    if (this.endingAt >= 0) return;
    if (!this.groupDue) {
      for (const w of hers) if (g.away.has(w.id) && g.away.get(w.id)! < 1e8) g.away.set(w.id, 1e9);
      if (!hers.every((w) => g.away.has(w.id))) return;
      this.placeGroup();
      for (const w of hers) g.away.set(w.id, g.tick + RESCUE.groupPause);
      this.groupDue = true;
    } else if (hers.every((w) => !g.away.has(w.id) || g.away.get(w.id)! >= 1e8)) this.groupDue = false;
  }

  private banked() {
    return this.game.scores[0]! + this.game.scores[1]!;
  }

  // ---------------------------------------------------------------- the clock

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
    const g = this.game, R = RESCUE;
    // The last lamp is full: Kes runs to the boat while the last lines are said, it lifts with her and the two old
    // people aboard, the cloud closes over the low one behind it, and after a hold on the boat, the usual end.
    if (this.endingAt >= 0) {
      const kes = this.player(KES_ID), slip = pt(g.board.center.x + R.board[0], g.board.center.y + R.board[1]);
      if (this.liftAt < 0) {
        if (!samePt(kes.pos, slip) && !(kes.action.kind === "walk" && samePt(kes.action.to, slip))) g.command(KES_ID, { action: { kind: "walk", to: slip } });
        g.step();
        this.ticks = g.tick;
        const waited = g.tick - this.endingAt;
        if ((cheb(kes.pos, slip) <= 1 && !this.talking()) || waited >= R.boardBy) {
          this.liftAt = g.tick;
          this.lifted = R.boats;
        }
        return;
      }
      g.tick++;
      this.ticks = g.tick;
      g.cloudAt = Math.max(3, (g.cloudAt ?? 0) - 7);
      if (g.tick - this.liftAt >= R.holdTicks) this.finish();
      return;
    }
    if (this.stand && this.stand !== "idle") this.steer();
    this.steerKes();
    g.step();
    this.ticks = g.tick;
    // The cloud: in a step at a time, and never back.
    if (g.tick >= R.cloud.firstAt && (g.tick - R.cloud.firstAt) % R.cloud.every === 0) {
      this.cloudStep++;
      g.cloudAt = R.cloud.start - R.cloud.stepIn * this.cloudStep;
    }
    this.lost += g.outs.length;
    this.stepPatch();
    // The first pull stopped at a pool: she calls it, once.
    if (!this.said.has("water") && g.bankStops.some((s) => s.player === YOU)) {
      this.said.add("water");
      this.say(KES, "Not over the water! Walk it round!", { player: KES_ID }, "key");
    }
    // Each bank goes into the lamp of the boat in the slip; a full lamp lifts its boat.
    for (const bk of g.banks) {
      if (bk.guild === 1) this.kesBanks++;
      if (this.lifted >= R.boats) break;
      if (++this.fill[this.lifted]! < R.perBoat) continue;
      if (this.lifted === R.boats - 1) return this.lastBoat();
      this.lifted++;
      if (this.lifted === 1) this.say(KES, "First boat's away!", { player: KES_ID }, "key");
    }
    this.nextGroup();
    // The cloud at the landing with a boat still tied: again, from the landing. Nobody is shown lost.
    if ((g.cloudAt ?? 99) <= R.cloud.landing) {
      this.restarts++;
      this.queue = [];
      this.lines.push({ who: KES, text: "Cloud got the landing first.", player: KES_ID });
      this.start(false);
    }
  }

  private talking() {
    return this.queue.length > 0 || this.game.tick < this.busyUntil;
  }

  /** The third boat's lamp is full: it lifts with Kes and the two old people aboard, and he is the only one not looking at it. */
  private lastBoat() {
    const g = this.game;
    this.endingAt = g.tick;
    this.queue = [];
    this.busyUntil = 0;
    this.patch = null;
    for (const w of g.wisps) g.away.set(w.id, 1e9);
    g.string = [];
    for (const p of g.players) p.action = { kind: "idle" };
    this.say(KES, "That's all of them. Rook, that's all of them.", { player: KES_ID }, "key");
    this.say(GRAN, "You keep looking over there. Go on.", this.still("r9-3"), "key");
  }

  // ---------------------------------------------------------------- the dark patch

  /** Whether the patch is over a tile, or went over it in this tick's step (its middle within the patch's edge, plus `grow`). */
  private covers(at: Pt, grow = 0) {
    const p = this.patch;
    if (!p || p.warn > 0) return false;
    const x = at.x + 0.5, y = at.y + 0.5, len = Math.hypot(p.dx, p.dy) || 1;
    // The nearest point to it on the stretch the patch's middle moved along this tick.
    const k = Math.max(0, Math.min(1, ((x - (p.x - p.dx)) * p.dx + (y - (p.y - p.dy)) * p.dy) / (len * len)));
    return Math.hypot(x - (p.x - p.dx * (1 - k)), y - (p.y - p.dy * (1 - k))) <= p.r + grow;
  }

  /** The row the first crossing is meant for: the island's middle, just south of its cold brazier. */
  private course() {
    return this.game.board.center.y + LO_OVAL.y + RESCUE.patch.courseSouth;
  }

  /** An open tile on the middle strip within the band a crossing on `row` covers, inside the cloud's edge. */
  private onCourse(row: number): Pt | null {
    const g = this.game, b = g.board, c = b.center, reach = Math.floor(RESCUE.patch.size / 2) - 1;
    for (let n = 0; n < 80; n++) {
      const at = pt(c.x + this.rng.int(11) - 5, row + this.rng.int(reach * 2 + 1) - reach);
      if (b.tile(at) !== Tile.Floor || g.wisps.some((o) => !g.away.has(o.id) && cheb(o.pos, at) < 2) || g.players.some((q) => cheb(q.pos, at) < 2)) continue;
      if (Math.hypot(at.x - c.x, at.y - c.y) > (g.cloudAt ?? 99) - RESCUE.arriveInside) continue;
      return at;
    }
    return null;
  }

  /** His wisps that were waiting to come up do so now, on the band the patch will cross, until `under` of his are loose there. */
  private bringUnder(row: number) {
    const g = this.game, reach = Math.floor(RESCUE.patch.size / 2) - 1;
    const waiting = g.wisps.filter((w) => w.guild === 0 && g.away.has(w.id) && g.away.get(w.id)! < 1e8);
    const loose = (w: Wisp) => w.guild === 0 && !g.away.has(w.id) && w.holder === null && Math.abs(w.pos.y - row) <= reach && !g.board.inBankZone(w.pos);
    for (const w of waiting) {
      if (g.wisps.filter(loose).length >= RESCUE.patch.under) return;
      const at = this.onCourse(row);
      if (!at) return;
      g.away.delete(w.id);
      moveWisp(w, at);
    }
  }

  private stepPatch() {
    const g = this.game, P = RESCUE.patch, c = g.board.center;
    const kes = this.player(KES_ID);
    if (!this.patch) {
      if (g.tick < this.crossedAt + P.gap) return;
      const n = this.banked();
      if (this.crossings === 0 && (n >= P.firstBanks || g.tick >= P.firstBy)) {
        // Across the island's middle, west to east, where his last few have come up: the row within
        // `nearCourse` of the course with the most of his loose wisps on it (the middle strip's count
        // twice), and well away from her. If she is in the way it waits for her to move on.
        const reach = P.size / 2 - 1, by = this.course(), late = g.tick >= Math.max(P.firstBy, 0) + 25 || n >= P.firstBanks + 3;
        const loose = g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id) && w.holder === null && !g.board.inBankZone(w.pos));
        const waiting = g.wisps.filter((w) => w.guild === 0 && g.away.has(w.id) && g.away.get(w.id)! < 1e8).length;
        let best = -1, row = by;
        for (let y = by - P.nearCourse; y <= by + P.nearCourse; y++) {
          if (Math.abs(kes.pos.y - y) < P.clearOfKes) continue;
          const k = loose.filter((w) => Math.abs(w.pos.y - y) <= reach && loStrip(w.pos.x - c.x) === 1).length * 2 + loose.filter((w) => Math.abs(w.pos.y - y) <= reach).length;
          if (k > best || (k === best && Math.abs(y - by) < Math.abs(row - by))) (best = k), (row = y);
        }
        // It waits a little for two of his to be on its course (or waiting to come up), but not for long.
        if ((best < 0 || best + waiting * 2 < 3) && !late) return;
        this.bringUnder(row);
        this.launch(1, row);
        this.say(KES, "Rook. What is that.", { player: KES_ID }, "key");
      } else if (this.crossings === 1 && (n >= P.secondBanks || g.tick >= P.secondBy)) {
        // Along the south neck, through where she is, while she has a string in hand. The longer it
        // has waited the less it asks: any string at all, and at the last her alone.
        const strung = g.string.length, south = kes.pos.y - c.y >= LO_POOLS[0].y1 - 5;
        const late = n >= P.secondBanks + 1 || g.tick >= P.secondBy + P.wait;
        const last = n >= RESCUE.boats * RESCUE.perBoat - 2 || g.tick >= P.secondBy + 2 * P.wait;
        if (!(strung >= 2 && (south || late)) && !(late && strung >= 1) && !last) return;
        // On her row, leaning toward her string so that it covers both.
        const mean = strung ? g.string.reduce((sum, id) => sum + g.wisps[id]!.pos.y, 0) / strung : kes.pos.y;
        this.launch(2, kes.pos.y + Math.max(-P.lean, Math.min(P.lean, Math.round(mean - kes.pos.y))));
        this.kesHold = true;
        this.say(KES, "It's coming back. Get them off the neck!", { player: KES_ID }, "key");
      }
      return;
    }
    const p = this.patch;
    if (p.warn > 0) p.warn--;
    p.x += p.dx;
    p.y += p.dy;
    if (p.warn > 0) return;
    // Loose wisps it covers: not seen while it is over them, and gone when it has passed.
    const rook = this.player(YOU);
    const held = (w: Wisp) => rook.beam === w.id || w.holder === YOU || (!this.kesDark && g.string.includes(w.id)) || (!this.kesDark && w.holder === KES_ID);
    for (const w of g.wisps) {
      if (g.away.has(w.id) || g.board.inBankZone(w.pos)) continue;
      const over = this.covers(w.pos);
      if (over && !held(w)) this.taken.add(w.id);
      else if (over && this.patchMode === "dark") this.taken.delete(w.id);
      if (!this.taken.has(w.id)) continue;
      if (this.patchMode === "drag" && over) {
        // The other behaviour: it carries them off with it, a tile a tick, and they are gone at the rim.
        // (its pace, a tile at a time, for as far as the way is open).
        const from = w.pos;
        for (let k = Math.max(1, Math.round(Math.hypot(p.dx, p.dy))); k > 0; k--) {
          const to = pt(w.pos.x + Math.sign(Math.round(p.dx)), w.pos.y + Math.sign(Math.round(p.dy)));
          if (!g.board.passable(to, Mover.Wisp) || g.board.tile(to) === Tile.Edge) break;
          w.pos = to;
        }
        if (!samePt(from, w.pos)) {
          w.prev = from;
          w.target = null;
          w.holder = null;
          continue;
        }
      } else if (over) continue;
      this.taken.delete(w.id);
      this.gone(w);
      p.took++;
    }
    // Over Kes: her glow goes dark and her string drops, every wisp on it loose where it was.
    if (!this.kesDark && this.covers(kes.pos)) {
      this.kesDark = true;
      p.crossedKes = true;
      this.kesHold = false;
      const had = g.string.length;
      g.string = [];
      for (const w of g.wisps) if (w.holder === KES_ID) (w.holder = null), (w.target = null), (w.grip = Grip.Free);
      kes.action = { kind: "idle" };
      if (had && !this.said.has("string")) {
        this.said.add("string");
        this.queue = this.queue.filter((q) => q.key);
        this.say(KES, "My string...", { player: KES_ID, ...this.still("r9-2", kes.pos) }, "key");
        this.say(ROOK, "Kes!", { player: YOU }, "key");
      }
    } else if (this.kesDark && !this.covers(kes.pos)) {
      // Her glow comes back the moment it has passed. She stands a moment.
      this.kesDark = false;
      this.kesShaken = g.tick + RESCUE.kes.shaken;
    }
    // Half way over: she looks up, and there is nothing there.
    if (p.n === 1 && !p.saidUp && p.x >= c.x - 2) {
      p.saidUp = true;
      this.say(KES, "There's nothing up there.", { player: KES_ID, ...this.still("r9-1", pt(Math.round(p.x), Math.round(p.y))) }, "key");
    }
    // Off the land and away (the second time toward home): it is gone from the board.
    if (p.x - p.r > c.x + LO_FRAME.x1 + 2) {
      if (p.n === 1 && p.took > 0) this.say(KES, "Where did they go?", { player: KES_ID }, "key");
      this.patch = null;
      this.kesHold = false;
      this.crossings++;
      this.crossedAt = g.tick;
      for (const id of this.taken) this.gone(g.wisps[id]!);
      this.taken.clear();
    }
  }

  /** It sets out west of the land on this row, so that its edge reaches the land as the warning ends. */
  private launch(n: 1 | 2, row: number) {
    const P = RESCUE.patch, c = this.game.board.center, r = P.size / 2;
    let west = LO_FRAME.x1;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let x = LO_FRAME.x0; x <= LO_FRAME.x1; x++) if (loLand(x, row - c.y + dy) && x < west) west = x;
    this.patch = { x: c.x + west - r - P.warn * P.speed, y: row + 0.5, dx: P.speed, dy: 0, r, warn: P.warn + 1, n, took: 0, crossedKes: false, saidUp: false };
  }

  /** A wisp the patch took: it is not there any more. Another comes in its place, as after a bank. */
  private gone(w: Wisp) {
    const g = this.game;
    if (g.away.has(w.id)) return;
    this.outs.push({ x: w.pos.x, y: w.pos.y, tick: g.tick });
    w.holder = null;
    w.target = null;
    w.skate = null;
    w.grip = Grip.Free;
    g.string = g.string.filter((id) => id !== w.id);
    g.away.set(w.id, g.tick + RESCUE.pause);
    this.lost++;
    this.lostToPatch++;
  }

  // ---------------------------------------------------------------- Kes

  private steerKes() {
    const g = this.game, me = this.player(KES_ID);
    const cmd = (c: Command | null) => c && g.command(KES_ID, c);
    const idle = () => cmd(me.action.kind === "idle" ? null : { action: { kind: "idle" } });
    // Under it, and for a moment after, she does nothing.
    if (this.kesDark || g.tick < this.kesShaken) return idle();
    const fix = me.mode !== "pull" || undefined;
    const live = (w: Wisp) => w.guild === 1 && !g.board.inBankZone(w.pos) && !g.away.has(w.id) && !this.taken.has(w.id);
    const tail = g.string.length ? g.wisps[g.string[g.string.length - 1]!]! : null;
    const loose = g.wisps.filter((w) => live(w) && !g.string.includes(w.id) && !this.covers(w.pos) && (!tail || (cheb(w.pos, tail.pos) <= RESCUE.storm.link - 1 && g.board.canSee(w.pos, tail.pos))));
    const head = g.string.length ? g.wisps[g.string[0]!] : undefined;
    // The first time she sees it coming and gets off its course, north or south, whichever is nearer.
    const p = this.patch;
    if (p && p.n === 1 && p.x - p.r < me.pos.x + 1 && Math.abs(me.pos.y + 0.5 - p.y) <= p.r + 1.5) {
      const side = me.pos.y + 0.5 >= p.y ? 1 : -1;
      for (const sgn of [side, -side])
        for (let dx = 0; dx <= 3; dx++)
          for (const sx of [1, -1]) {
            const to = pt(me.pos.x + sx * dx, Math.round(p.y - 0.5 + sgn * (p.r + 3)));
            if (g.board.tile(to) !== Tile.Floor || loStrip(to.x - g.board.center.x) !== 2) continue;
            if (me.action.kind === "walk" && samePt(me.action.to, to)) return;
            return cmd({ action: { kind: "walk", to } });
          }
    }
    // While it comes the second time she stays where she is, her staff on her string.
    if (this.kesHold) {
      if (head && live(head) && g.inReach({ ...me, mode: "pull" }, head)) return cmd(me.action.kind === "staff" && me.action.wisp === head.id ? null : { action: { kind: "staff", wisp: head.id }, toggleMode: fix });
      return idle();
    }
    if (loose.length && g.string.length < RESCUE.storm.max) {
      // Walk to each wisp and touch it: that is what her gift costs her.
      const w = loose.sort((a, b) => cheb(a.pos, me.pos) - cheb(b.pos, me.pos))[0]!;
      if (cheb(me.pos, w.pos) <= RESCUE.storm.reach && g.inReach({ ...me, mode: "pull" }, w)) return cmd({ action: { kind: "staff", wisp: w.id }, toggleMode: fix });
      const at = this.besideWisp(w, me.pos);
      if (me.action.kind === "walk" && samePt(me.action.to, at)) return cmd(fix ? { toggleMode: true } : null);
      return cmd({ action: { kind: "walk", to: at }, toggleMode: fix });
    }
    if (!head || !live(head)) return idle();
    if (this.rng.next() < RESCUE.kes.sloppiness) return;
    // Pull the head in from the best spot; the rest follow.
    const spot = planSpot(g, KES_ID, me.pos, head, 0, false);
    if (spot && !samePt(spot, me.pos)) {
      if (me.action.kind === "walk" && samePt(me.action.to, spot)) return cmd(fix ? { toggleMode: true } : null);
      return cmd({ action: { kind: "walk", to: spot }, toggleMode: fix });
    }
    if (me.action.kind === "staff" && me.action.wisp === head.id && !fix) return;
    cmd({ action: { kind: "staff", wisp: head.id }, toggleMode: fix });
  }

  /** A tile to stand on within the string's reach of a wisp, the nearest to where she is. */
  private besideWisp(w: Wisp, from: Pt): Pt {
    const g = this.game, b = g.board, R = RESCUE.storm.reach;
    let best = w.pos, bestD = Infinity;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const q = pt(w.pos.x + dx, w.pos.y + dy);
        if ((!dx && !dy) || !b.inside(q) || !b.passable(q, Mover.Walker) || !b.canSee(q, w.pos) || g.wisps.some((o) => samePt(o.pos, q))) continue;
        const d = Math.hypot(q.x - from.x, q.y - from.y);
        if (d < bestD) (bestD = d), (best = q);
      }
    return best;
  }

  /** Tests and measurements: a careful hand in Rook's place. It leaves alone what it cannot see. */
  private steer() {
    const g = this.game, me = this.player(YOU);
    const cmd = botCommand(g, YOU, RESCUE.stand, () => this.rng.next());
    if (cmd?.action?.kind === "staff" && this.covers(g.wisps[cmd.action.wisp]!.pos) && me.beam !== cmd.action.wisp) return;
    if (cmd) g.command(YOU, cmd);
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    // No flourish: he saved the people and not the place.
    this.end = { banked: this.banked(), kes: this.kesBanks, summary: "", lines: [] };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  /** The still to show with a line: spread into the line's options. Nothing when the stills are off. */
  private still(id: string, at: Pt | null = null): { still?: StillCue } {
    if (!this.stillsOn) return {};
    return { still: { id, ...(at ? { at: { x: at.x, y: at.y } } : {}) } };
  }

  /** Not within the gap after the last one. */
  private stillReady() {
    return this.clockTicks >= this.stillEnd + Math.ceil(STILL.gapMs / TICK_MS);
  }

  private shown(line: StoryLine, from = this.clockTicks) {
    if (!line.still) return;
    const ms = stillMs(line.still.id, line.text ? lineTicks(line) * TICK_MS : 0);
    // The gap is for play: one shown in the bells doesn't hold back the first in play.
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
      // A still too soon after the last: its line still plays, as a bubble, without the picture.
      if (q.line.still && !this.stillReady()) delete q.line.still;
      this.queue.shift();
      if (!q.key && now - q.trigger > 4) continue;
      this.shown(q.line);
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
    const p = this.patch;
    return {
      run: RESCUE.run, movement: 0, title: "", ring: null, mark: null, kes: 0, rival: null, note: "", end: this.end,
      rescue: {
        kes: KES_ID,
        boats: [...this.fill],
        perBoat: RESCUE.perBoat,
        lifted: this.lifted,
        cloud: this.game.cloudAt ?? RESCUE.cloud.start,
        ...(p ? { patch: { x: p.x, y: p.y, dx: p.dx, dy: p.dy, r: p.r, warn: Math.max(0, p.warn), n: p.n, ...(this.patchMode === "drag" ? { drag: true } : {}) } } : {}),
        ...(this.kesDark ? { dark: [KES_ID] } : {}),
        ...(this.taken.size ? { taken: [...this.taken] } : {}),
        ...(this.outs.some((o) => this.ticks - o.tick <= RESCUE.patch.smokeTicks) ? { outs: this.outs.filter((o) => this.ticks - o.tick <= RESCUE.patch.smokeTicks) } : {}),
        ...(this.endingAt >= 0 ? { ending: this.liftAt >= 0 ? this.ticks - this.liftAt : -1 } : {}),
        ...(this.liftAt >= 0 ? { aboard: [KES_ID] } : {}),
      },
    };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: RESCUE.shrine,
      teams: 2,
      players: [
        { id: YOU, name: ROOK, guild: 0, flame: "amber", connected: true, bot: false },
        { id: KES_ID, name: KES, guild: 1, flame: "pearl", connected: true, bot: true },
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
    return { phase: this.phase, game: this.game, end: this.end, said: this.said, fill: this.fill, lifted: this.lifted, patch: this.patch, crossings: this.crossings, taken: this.taken, kesDark: this.kesDark, pools: LO_POOLS };
  }
}

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
