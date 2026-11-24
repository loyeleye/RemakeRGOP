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
import { LO_FRAME, LO_POOLS, RESCUE, loLand, loPlanks, loStrip } from "../engine/rescue.js";
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
    // Before the first crossing his come up the middle strip, so there is something loose there for it to pass over.
    const middle = this.crossings === 0 && this.banked() >= RESCUE.patch.firstBanks - 2;
    const at = this.openSpot((x) => (middle ? loStrip(x) === 1 : loStrip(x) < 2), RESCUE.arriveNear, 2);
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

  /** Whether the patch is over a tile (its middle within the patch's edge, less `inside`). */
  private covers(at: Pt, grow = 0) {
    const p = this.patch;
    return !!p && p.warn <= 0 && Math.hypot(at.x + 0.5 - p.x, at.y + 0.5 - p.y) <= p.r + grow;
  }

  private stepPatch() {
    const g = this.game, P = RESCUE.patch, c = g.board.center;
    const kes = this.player(KES_ID);
    if (!this.patch) {
      if (g.tick < this.crossedAt + P.gap) return;
      const n = this.banked();
      if (this.crossings === 0 && (n >= P.firstBanks || g.tick >= P.firstBy)) {
        // Across the island, west to east, on the row where the most of his loose wisps are, well away from her.
        const loose = g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id) && w.holder === null && !g.board.inBankZone(w.pos));
        let best = -1, row = c.y - 22;
        for (let y = c.y - 34; y <= c.y - 11; y++) {
          if (Math.abs(kes.pos.y - y) < P.clearOfKes) continue;
          const k = loose.filter((w) => Math.abs(w.pos.y - y) <= P.size / 2 - 1 && loStrip(w.pos.x - c.x) === 1).length * 2 + loose.filter((w) => Math.abs(w.pos.y - y) <= P.size / 2 - 1).length;
          if (k > best || (k === best && Math.abs(y - (c.y - 22)) < Math.abs(row - (c.y - 22)))) (best = k), (row = y);
        }
        // It waits a little for something loose to pass over, but not for long.
        if (best < 3 && g.tick < Math.max(P.firstBy, 0) + 25 && n < P.firstBanks + 3) return;
        this.launch(1, row);
        this.say(KES, "Rook. What is that.", { player: KES_ID }, "key");
      } else if (this.crossings === 1 && (n >= P.secondBanks || g.tick >= P.secondBy)) {
        // Along the south neck, through where she is, while she has a string in hand. The longer it
        // has waited the less it asks: any string at all, and at the last her alone.
        const strung = g.string.length, south = kes.pos.y - c.y >= -16;
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
        const to = pt(w.pos.x + Math.sign(Math.round(p.dx)), w.pos.y + Math.sign(Math.round(p.dy)));
        if (g.board.passable(to, Mover.Wisp) && g.board.tile(to) !== Tile.Edge) {
          w.prev = w.pos;
          w.pos = to;
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
    if (p.x - p.r > c.x + LO_FRAME.x1 + 6) {
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
