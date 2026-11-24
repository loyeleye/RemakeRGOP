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
import { STILL, stillMs, type StillCue } from "../engine/stills.js";
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
  /** Wisps on their way to a well: where each will appear, over which well, and how high. That well shimmers meanwhile. */
  /** The first fall: ticks left of standing and looking down the well, and where. Nothing moves meanwhile. */
  private lookLeft = 0;
  private look: Pt | null = null;
  private warned = new Map<number, { at: Pt; well: number; height: number }>();
  /** The first pull: waiting, winding up (ticks left), holding (ticks left), or done. Wisps touched in the wind-up are spared. Once a game, restarts included. */
  private pull: Pull = { phase: "wait", left: 0, spared: new Set(), moved: [], torn: null, focus: null };
  /** The first pull: "loud" (the second take, the default), "quiet" (the first take, v111; ?pull=1 in the page) or "off" (v108; ?nopull=1). */
  /** The first pull: "tug" (the third take, the default), "loud" (the second, v112; ?pull=2), "quiet" (the first, v111; ?pull=1), "off" (v108; ?nopull=1). */
  pullMode: "tug" | "loud" | "quiet" | "off" = SIEVE.pull.on ? "tug" : "off";
  get pullOn() {
    return this.pullMode !== "off";
  }
  set pullOn(on: boolean) {
    this.pullMode = on ? (this.pullMode === "off" ? "tug" : this.pullMode) : "off";
  }
  /** For the measurements: the tick the pull fired, whether it was staged on a near bank, and how many wisps it moved and sent over a well. */
  pulledAt = -1;
  pullStaged = false;
  pullMoved = 0;
  pullOnWell = 0;
  /** Reaction stills (engine/stills.ts): the room's own clock in ticks (it runs in the bells too), when the one up ends, and when the last one ended. */
  private clockTicks = 0;
  private stillUntil = -1;
  private stillEnd = -1e9;
  /** Wisps held back by the still up now, so they can be let out one by one. */
  private heldBack = 0;
  /** When the still up now came, and whether it has a line (the next in a sequence lets that one have its hold first). */
  private stillFrom = -1;
  private stillSpoken = false;
  private stillId = "";
  /** When the tug let go, for "Granny?". */
  private tugEndedAt = -1;
  /** Which stills have been shown, in order (for tests). */
  stillsShown: string[] = [];
  /** Picture 4 (the tug itself, no face) is off by default: the board already shows it in his hand (gameplay thread). ?still4 in the page. */
  stillFour = false;
  /** All the stills off (?nostills in the page). */
  stillsOn = true;
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
        if (this.phase !== "playing" || this.lookLeft > 0 || this.pull.phase === "hold") return;
        // In the tug he cannot take up another: his staff stays on the one being dragged, or comes away.
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
    this.pull = { phase: this.pullOn ? "wait" : "done", left: 0, spared: new Set(), moved: [], torn: null, focus: null };
    this.pulledAt = -1;
    this.pullStaged = false;
    this.clockTicks = 0;
    this.stillUntil = -1;
    this.stillEnd = -1e9;
    this.stillFrom = -1;
    this.stillSpoken = false;
    this.tugEndedAt = -1;
    this.stillsShown = [];
    this.pullMoved = this.pullOnWell = 0;
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
    this.warned = new Map();
    this.overWell = new Set();
    this.lookLeft = 0;
    this.look = null;
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
    this.phase = first ? "countdown" : "playing";
    if (first) {
      const before = this.lines.length;
      this.say(HESTA, "The Sieve this morning, Rook. Young Tilda sent word. Keep them all moving. Don't settle on one.", { talk: true });
      this.say(KEEPER, "You're Rook. I'm Tilda. I keep this now.", { talk: true, ...this.still("r8-1") });
      this.countdown = S.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    }
    this.flush();
    this.broadcastTick();
  }

  /** A wisp of the supply comes onto the board, in the outer band, lower the later it comes. None once the supply is spent. */
  private arrive(w: Wisp) {
    const g = this.game, S = SIEVE, b = g.board, c = b.center;
    // While a still is up, none comes: it waits off the board until the panel has gone.
    // Held back ones come one at a time after it, not in a crowd.
    if (this.clockTicks < this.stillUntil && this.phase === "playing") return void g.away.set(w.id, g.tick + (this.stillUntil - this.clockTicks) + SIEVE.stillSpacing * this.heldBack++);
    // One that was warned of: it appears over its well now.
    const due = this.warned.get(w.id);
    if (due) {
      this.warned.delete(w.id);
      moveWisp(w, due.at);
      g.height.set(w.id, due.height);
      this.overWell.add(w.id);
      return;
    }
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
      // The air over that well shimmers for a few ticks first, as run 4's pools did.
      const height = Math.max(S.wellFloor, S.arriveHigh + ((S.arriveLow - S.arriveHigh) * this.arrived) / Math.max(1, S.supply - 1) - S.wellLower);
      this.warned.set(w.id, { at: p, well: SV_WELLS.indexOf(k), height });
      g.away.set(w.id, g.tick + S.warnTicks);
      this.arrived++;
      return;
    }
    for (let n = 0; n < 80; n++) {
      const a = this.rng.next() * Math.PI * 2, edge = sh.outline!(a);
      const r = edge * (S.band[0] + this.rng.next() * (S.band[1] - S.band[0]));
      const p = pt(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r));
      if (!b.inside(p) || b.tile(p) !== Tile.Floor || !b.passable(p, Mover.Wisp) || taken.has(`${p.x},${p.y}`)) continue;
      moveWisp(w, p);
      break;
    }
    g.height.set(w.id, S.arriveHigh + ((S.arriveLow - S.arriveHigh) * this.arrived) / Math.max(1, S.supply - 1));
    this.arrived++;
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
    const g = this.game, S = SIEVE;
    // The first one has just gone down the well: a moment of looking after it, in silence, and then her line.
    if (this.lookLeft > 0) {
      if (--this.lookLeft === 0) {
        const looked = this.look;
        this.look = null;
        if (!this.said.has("there")) {
          this.said.add("there");
          this.say(KEEPER, "There. That's what I sent for you about.", { player: KEEPER_ID, ...this.still("r8-2", false, looked) }, "key");
          if (this.pullOn) {
            // Calm, so the pull can answer her. These take the place of her old line about knocking them up.
            this.said.add("knock");
            this.said.add("calm");
            this.say(KEEPER, "A tired one drops. Straight down, right where it hangs. Knock it and it's right again.", { player: KEEPER_ID }, "key");
            this.say(KEEPER, "They don't wander. Mind the wells and you'll be fine.", { player: KEEPER_ID }, "key");
          }
        }
      }
      return;
    }
    // The pull has happened: everything holds, in silence, while she says it.
    if (this.pull.phase === "hold") {
      // The jump has been seen once; from here it stands where it landed.
      for (const w of g.wisps) w.prev = w.pos;
      if (--this.pull.left <= 0) (this.pull.phase = "done"), (this.pull.moved = []), (this.pull.torn = null), (this.pull.focus = null);
      return;
    }
    if (this.stand && this.stand !== "idle") this.steer();
    const pre = this.pull.phase === "tug" ? g.wisps.map((w) => ({ ...w.pos })) : null;
    g.step();
    if (pre) this.stepTug(pre);
    this.ticks = g.tick;
    this.stepPull();
    for (const f of g.falls) {
      if (f.wisp === this.doomed) {
        this.doomed = g.pastSaving = null;
        // The first time only (not on a restart): hold on it.
        if (!this.said.has("there")) {
          this.lookLeft = S.lookTicks;
          this.look = pt(f.x, f.y);
          this.player(YOU).action = { kind: "idle" };
        }
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
    // Picture 7: the first quiet moment well after the tug (his staff idle, nothing low), or after a while regardless. He asks for her, and nothing comes.
    if (this.tugEndedAt >= 0 && !this.said.has("granny")) {
      const since = g.tick - this.tugEndedAt, rook = this.player(YOU), Q = SIEVE.tug;
      const quiet = rook.beam === null && rook.action.kind !== "staff" && g.wisps.every((w) => g.away.has(w.id) || w.id === this.doomed || (g.height.get(w.id) ?? 100) >= Q.grannyLow);
      if (since >= Q.grannyAfter && (quiet || since >= Q.grannyBy) && this.stillReady()) {
        this.said.add("granny");
        // His line is the caption on his small picture, not a bubble (Ladi tried the bubble on 24 Nov and went back).
        this.say(ROOK, "Granny?", { player: YOU, ...this.still("r8-7") }, "key");
      }
    }
    if (!this.said.has("knock") && this.said.has("there") && g.wisps.some((w) => w.touched)) {
      this.said.add("knock");
      this.say(KEEPER, "If I leave one, it goes down. If I knock it, it comes up. For a while.", { player: KEEPER_ID }, "key");
    }
    // All sixteen play out: ten is the pass mark, and she counts what he banked.
    const banked = g.scores[0]!;
    const live = g.wisps.filter((w) => !g.away.has(w.id) || g.away.get(w.id)! < 1e8).length - (this.doomed !== null ? 1 : 0);
    if (live === 0 && this.arrived >= S.supply && this.doomed === null && banked >= S.need) return this.finish(banked);
    // So many lost that ten can't be reached: again, at once, and no blame.
    if (banked + live + (S.supply - this.arrived) < S.need) {
      this.restarts++;
      // Tilda says it, in a bubble: Hesta is not on the Sieve (Ladi, 24 Nov: "Tilda should say something"). The line is in SIEVE.again.
      this.lines.push({ who: KEEPER, text: SIEVE.again, player: KEEPER_ID });
      this.start(false);
    }
  }

  /** The first pull: staged on his near bank (or half way through the supply), wound up, then the snap. */
  private stepPull() {
    const g = this.game, P = SIEVE.pull, p = this.pull;
    if (p.phase === "after") {
      if (--p.left <= 0) (p.phase = "done"), (p.tugged = null);
      return;
    }
    if (p.phase === "wait" && this.pullMode === "tug") {
      if (!this.said.has("calm") || this.talking() || this.doomed !== null) return;
      const rook = this.player(YOU), T = SIEVE.tug;
      const on = rook.beam !== null ? g.wisps[rook.beam]! : null;
      // Near a well where it was as the tick began (his pull may have carried it two tiles since).
      const near = on && !g.away.has(on.id) && !g.board.inBankZone(on.prev) && !g.board.inBankZone(on.pos) && Math.min(this.lipDistance(on.prev), this.lipDistance(on.pos)) <= T.nearWell ? on : null;
      if (near && this.lipDistance(near.prev) < this.lipDistance(near.pos) && g.board.tile(near.prev) === Tile.Floor) near.pos = near.prev;
      if (!near && this.arrived < Math.ceil(SIEVE.supply * T.lateShare)) return;
      this.pullStaged = !!near;
      p.phase = "tug";
      p.left = T.ticks;
      p.tugged = near?.id ?? null;
      p.moved = [];
      this.pulledAt = g.tick;
      if (this.stillFour) this.picture("r8-4", true, near ? this.wellTile(near.pos) : null);
      return;
    }
    if (p.phase === "wait") {
      // Not before she has told him they don't wander, and he has had time to read it.
      if (!this.said.has("calm") || this.talking() || this.doomed !== null) return;
      const near = this.nearBank();
      if (near === null && this.arrived < Math.ceil(SIEVE.supply / 2)) return;
      this.pullStaged = near !== null;
      p.focus = near !== null ? { ...g.wisps[near]!.pos } : null;
      p.phase = "wind";
      p.left = P.windTicks;
      p.spared = new Set();
      return;
    }
    if (p.phase !== "wind") return;
    // The first take: whatever his staff is on in the wind-up stays where it is. The second spares nothing.
    if (this.pullMode === "quiet") for (const w of g.wisps) if (w.touched || g.players.some((q) => q.id === YOU && q.beam === w.id)) p.spared.add(w.id);
    if (--p.left > 0) return;
    if (this.pullMode === "quiet") this.snap();
    else this.snapLoud();
    p.phase = "hold";
    p.left = P.holdTicks;
    this.pulledAt = g.tick;
    this.player(YOU).action = { kind: "idle" };
    this.queue = [];
    this.busyUntil = 0;
    this.say(KEEPER, "They don't do that. They've never done that.", { player: KEEPER_ID }, "key");
  }

  /**
   * The second take: every wisp on the board, his own under the staff too (torn off it, the beam
   * broken), goes up to `reach` tiles toward its nearest well and stops at the lip. None falls in.
   */
  private snapLoud() {
    const g = this.game, b = g.board, p = this.pull, rook = this.player(YOU);
    const taken = new Set(g.wisps.filter((w) => !g.away.has(w.id)).map((w) => `${w.pos.x},${w.pos.y}`));
    p.moved = [];
    p.torn = null;
    for (const w of g.wisps) {
      if (g.away.has(w.id) || w.id === this.doomed) continue;
      const well = this.nearestWell(w.pos), k = SV_WELLS[well]!;
      const wx = Math.round(b.center.x + k.x), wy = Math.round(b.center.y + k.y);
      const from = { ...w.pos };
      let at = w.pos;
      for (let n = 0; n < SIEVE.pull.reach; n++) {
        const to = pt(at.x + Math.sign(wx - at.x), at.y + Math.sign(wy - at.y));
        // At the lip it stops: the next tile is the well.
        if ((to.x === at.x && to.y === at.y) || !b.inside(to) || b.tile(to) !== Tile.Floor || !b.passable(to, Mover.Wisp) || taken.has(`${to.x},${to.y}`)) break;
        at = to;
      }
      if (rook.beam === w.id || (rook.action.kind === "staff" && rook.action.wisp === w.id)) p.torn = w.id;
      if (at.x === from.x && at.y === from.y && p.torn !== w.id) continue;
      taken.delete(`${from.x},${from.y}`);
      taken.add(`${at.x},${at.y}`);
      w.prev = from;
      w.pos = at;
      w.target = null;
      w.skate = null;
      w.holder = null;
      w.grip = Grip.Free;
      w.touched = false;
      w.rimTicks = 0;
      p.moved.push({ id: w.id, x: from.x, y: from.y, well });
    }
    // His staff comes away empty. (The beam stays drawn, broken, while everything holds.)
    if (p.torn !== null) rook.action = { kind: "idle" };
    this.pullMoved = p.moved.length;
  }

  /**
   * The tug, after each tick of play: his wisp is held where it was and dragged back toward its
   * well a tile every other tick while he keeps his staff on it; slides to the lip if he lets go;
   * every other wisp creeps to its lip. At the end the wells let go: if he held on, it springs back
   * toward him. She speaks during it and after, in the silence, and steps back from the nearest well.
   */
  private stepTug(pre: Pt[]) {
    const g = this.game, p = this.pull, T = SIEVE.tug, rook = this.player(YOU);
    const n = T.ticks - p.left;
    const creep = n % T.every === T.every - 1;
    const taken = new Set(g.wisps.filter((w) => !g.away.has(w.id)).map((w) => `${w.pos.x},${w.pos.y}`));
    const held = p.tugged !== null && rook.beam === p.tugged;
    for (const w of g.wisps) {
      if (g.away.has(w.id) || w.id === this.doomed) continue;
      const mine = w.id === p.tugged;
      if (mine && held) {
        // It stops coming to him: back where it was before his pull, then a tile toward the well.
        taken.delete(`${w.pos.x},${w.pos.y}`);
        w.pos = pre[w.id]!;
        w.target = null;
        if (creep) this.towardLip(w, taken, 1);
        else taken.add(`${w.pos.x},${w.pos.y}`);
        w.prev = pre[w.id]!;
        continue;
      }
      // Anything else his staff is on still answers to him; the rest go to the lip.
      if (rook.beam === w.id) continue;
      if (mine || creep) {
        const before = { ...w.pos };
        this.towardLip(w, taken, 1);
        if (before.x !== w.pos.x || before.y !== w.pos.y) p.moved.push({ id: w.id, x: before.x, y: before.y, well: this.nearestWell(w.pos) });
      }
    }
    p.held = held;
    const at = p.tugged != null ? this.wellTile(g.wisps[p.tugged]!.pos) : null;
    if (n + 1 === T.saidAt) this.say(KEEPER, "They don't do that.", { player: KEEPER_ID, ...this.still("r8-5", true, at) }, "key");
    if (--p.left > 0) return;
    // The wells let go, all at once.
    if (p.tugged !== null && rook.beam === p.tugged) {
      const w = g.wisps[p.tugged]!, d = Math.hypot(rook.pos.x - w.pos.x, rook.pos.y - w.pos.y) || 1;
      const to = g.nearestFree(pt(Math.round(w.pos.x + ((rook.pos.x - w.pos.x) / d) * T.spring), Math.round(w.pos.y + ((rook.pos.y - w.pos.y) / d) * T.spring)), 0);
      if (g.board.passable(to, Mover.Wisp)) (w.prev = w.pos), (w.pos = to);
      this.pullStaged = true;
    }
    this.pullMoved = new Set(p.moved.map((m) => m.id)).size;
    p.phase = "after";
    p.left = 3;
    this.queue = this.queue.filter((q) => q.key);
    this.tugEndedAt = g.tick;
    this.say(KEEPER, "They've never done that.", { player: KEEPER_ID, ...this.still("r8-6", true, at, "r8-5") }, "key");
    // She steps back from the nearest well, of her own accord.
    const tilda = this.player(KEEPER_ID), k = SV_WELLS[this.nearestWell(tilda.pos)]!, c = g.board.center;
    const dx = tilda.pos.x - (c.x + k.x), dy = tilda.pos.y - (c.y + k.y), dl = Math.hypot(dx, dy) || 1;
    const back = g.nearestFree(pt(Math.round(tilda.pos.x + (dx / dl) * 2), Math.round(tilda.pos.y + (dy / dl) * 2)), 0);
    tilda.prev = tilda.pos;
    tilda.pos = back;
  }

  /** Moves a wisp up to `steps` tiles toward its nearest well, stopping on the last chalk tile before it. */
  private towardLip(w: Wisp, taken: Set<string>, steps: number) {
    const b = this.game.board, k = SV_WELLS[this.nearestWell(w.pos)]!;
    const wx = Math.round(b.center.x + k.x), wy = Math.round(b.center.y + k.y);
    taken.delete(`${w.pos.x},${w.pos.y}`);
    const free = (to: Pt) => b.inside(to) && b.tile(to) === Tile.Floor && b.passable(to, Mover.Wisp) && !taken.has(`${to.x},${to.y}`);
    const far = (q: Pt) => Math.hypot(b.center.x + k.x - q.x, b.center.y + k.y - q.y);
    for (let n = 0; n < steps; n++) {
      const sx = Math.sign(wx - w.pos.x), sy = Math.sign(wy - w.pos.y);
      // Straight at it, or else the nearer of the two sidelong steps that still closes on it; at the lip nothing does.
      const to = [pt(w.pos.x + sx, w.pos.y + sy), pt(w.pos.x + sx, w.pos.y), pt(w.pos.x, w.pos.y + sy)].find((q) => (q.x !== w.pos.x || q.y !== w.pos.y) && far(q) < far(w.pos) - 0.01 && free(q));
      if (!to) break;
      w.prev = w.pos;
      w.pos = to;
      w.target = null;
      w.skate = null;
      w.rimTicks = 0;
    }
    taken.add(`${w.pos.x},${w.pos.y}`);
  }

  /** How far a tile is from the nearest well's lip. */
  private lipDistance(at: Pt) {
    const c = this.game.board.center;
    return Math.min(...SV_WELLS.map((k) => Math.hypot(c.x + k.x - at.x, c.y + k.y - at.y) - k.r));
  }

  private nearestWell(at: Pt) {
    const c = this.game.board.center;
    let best = 0;
    SV_WELLS.forEach((k, i) => {
      const q = SV_WELLS[best]!;
      if (Math.hypot(c.x + k.x - at.x, c.y + k.y - at.y) - k.r < Math.hypot(c.x + q.x - at.x, c.y + q.y - at.y) - q.r) best = i;
    });
    return best;
  }

  /** One of his wisps, loose, a move from the bank: its id, or null. */
  private nearBank(): number | null {
    const g = this.game, P = SIEVE.pull, b = g.board;
    const rook = this.player(YOU);
    for (const w of g.wisps) {
      if (g.away.has(w.id) || w.id === this.doomed || b.inBankZone(w.pos) || w.touched || rook.beam === w.id) continue;
      if (g.tick - (this.touchedAt.get(w.id) ?? -99) > P.hisWithin) continue;
      for (let dy = -P.nearBank; dy <= P.nearBank; dy++)
        for (let dx = -P.nearBank; dx <= P.nearBank; dx++) if (b.inBankZone(pt(w.pos.x + dx, w.pos.y + dy))) return w.id;
    }
    return null;
  }

  /** Every loose wisp jumps one tile toward its nearest well. One that lands over a well is over a well, as any other. */
  private snap() {
    const g = this.game, b = g.board, c = b.center, p = this.pull;
    const taken = new Set(g.wisps.filter((w) => !g.away.has(w.id)).map((w) => `${w.pos.x},${w.pos.y}`));
    p.moved = [];
    for (const w of g.wisps) {
      if (g.away.has(w.id) || p.spared.has(w.id) || w.holder !== null) continue;
      const k = [...SV_WELLS].sort((a, z) => Math.hypot(c.x + a.x - w.pos.x, c.y + a.y - w.pos.y) - Math.hypot(c.x + z.x - w.pos.x, c.y + z.y - w.pos.y))[0]!;
      const to = pt(w.pos.x + Math.sign(Math.round(c.x + k.x) - w.pos.x), w.pos.y + Math.sign(Math.round(c.y + k.y) - w.pos.y));
      if ((to.x === w.pos.x && to.y === w.pos.y) || !b.inside(to) || !b.passable(to, Mover.Wisp) || taken.has(`${to.x},${to.y}`)) continue;
      taken.delete(`${w.pos.x},${w.pos.y}`);
      taken.add(`${to.x},${to.y}`);
      w.prev = w.pos;
      w.pos = to;
      w.target = null;
      w.skate = null;
      w.rimTicks = 0;
      p.moved.push({ id: w.id, x: w.prev.x, y: w.prev.y, well: SV_WELLS.indexOf(k) });
      if (b.tile(to) === Tile.Well) this.pullOnWell++;
    }
    this.pullMoved = p.moved.length;
  }

  private talking() {
    return this.queue.length > 0 || this.game.tick < this.busyUntil;
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
        { who: KEEPER, text: `${COUNT[banked] ?? banked}.`, ...this.still("r8-10") },
        { who: KEEPER, text: `The book says ${(COUNT[SIEVE.supply] ?? String(SIEVE.supply)).toLowerCase()}. Every year, back to the first page.` },
        { who: KEEPER, text: "Is it me?" },
        { who: ROOK, text: "It's not you." },
        { who: KEEPER, text: "Then what is it?", ...this.still("r8-11a") },
        { who: HESTA, text: "Come home, Rook.", ...this.still("r8-11b", true) },
      ],
    };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  /** The still to show with a line: spread into the line's options. Nothing when the stills are off. */
  private still(id: string, seq = false, at: Pt | null = null, after = ""): { still?: StillCue } {
    if (!this.stillsOn) return {};
    return { still: { id, ...(seq ? { seq } : {}), ...(after ? { after } : {}), ...(at ? { at: { x: at.x, y: at.y } } : {}) } };
  }

  /** A still with no line: the picture alone. */
  private picture(id: string, seq = false, at: Pt | null = null) {
    const s = this.still(id, seq, at);
    if (!s.still) return;
    const line: StoryLine = { who: "", text: "", ...s };
    this.shown(line);
    this.lines.push(line);
  }

  /** Not within the gap after the last one. */
  private stillReady() {
    return this.clockTicks >= this.stillEnd + Math.ceil(STILL.gapMs / TICK_MS);
  }

  /** A line with a still goes out: the panel is up from now (or from `from`, for lines in the bells that wait their turn) until it fades. */
  private shown(line: StoryLine, from = this.clockTicks) {
    if (!line.still) return;
    const ms = stillMs(line.still.id, line.text ? lineTicks(line) * TICK_MS : 0);
    this.stillUntil = from + Math.ceil(ms / TICK_MS);
    this.stillFrom = from;
    this.stillSpoken = !!line.text;
    this.stillId = line.still.id;
    // The gap is for play: one shown in the bells (picture 1) doesn't hold back the first in play.
    if (this.phase === "playing") this.stillEnd = this.stillUntil;
    this.heldBack = 0;
    this.stillsShown.push(line.still.id);
  }

  /** The well tile nearest a tile. */
  private wellTile(at: Pt): Pt {
    const k = SV_WELLS[this.nearestWell(at)]!, c = this.game.board.center;
    return pt(Math.round(c.x + k.x), Math.round(c.y + k.y));
  }

  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, kind: "key" | "quip" = how.talk ? "key" : "quip") {
    const line = { who, text, ...how };
    if (this.phase !== "playing") {
      // In the bells: it waits for the lines before it in this batch.
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
      // A still that isn't part of a sequence waits out the gap after the last one (its line with it).
      if (q.line.still && !q.line.still.seq && !this.stillReady()) break;
      // The next in a sequence lets a still with a line have its shortest hold first (a picture alone, like 4, it fades straight over).
      if (q.line.still?.seq && q.line.still.after === this.stillId && this.stillSpoken && this.clockTicks < this.stillUntil && this.clockTicks < this.stillFrom + Math.ceil((STILL.inMs + STILL.holdMs) / TICK_MS)) break;
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
    return { run: SIEVE.run, movement: 0, title: "", ring: null, mark: null, kes: 0, rival: null, note: "", end: this.end, sieve: { keeper: KEEPER_ID, drain: Math.max(0, Math.min(1, (this.arrived - SIEVE.onBoard) / (SIEVE.supply - SIEVE.onBoard))), ...(this.look ? { look: { x: this.look.x, y: this.look.y } } : {}), ...(this.warned.size ? { warn: [...new Set([...this.warned.values()].map((q) => q.well))] } : {}), ...(this.pull.phase === "wind" || this.pull.phase === "hold" || this.pull.phase === "tug" || this.pull.phase === "after" ? { pull: { phase: this.pull.phase, left: this.pull.left, moved: this.pull.moved, ...(this.pull.torn !== null ? { torn: this.pull.torn } : {}), ...(this.pull.focus ? { focus: this.pull.focus } : {}), ...(this.pull.tugged !== null ? { tugged: this.pull.tugged, held: !!this.pull.held } : {}), loud: this.pullMode !== "quiet" } } : {}) } };
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
    return { phase: this.phase, game: this.game, end: this.end, said: this.said, doomed: this.doomed, arrived: this.arrived, warned: this.warned, pull: this.pull };
  }
}

const STAND = {
  hold: { pushy: 0, sloppiness: 0.08 },
  juggle: { pushy: 0, sloppiness: 0.08, taps: true },
} as const;

type Pull = { phase: "wait" | "wind" | "hold" | "tug" | "after" | "done"; left: number; spared: Set<number>; moved: { id: number; x: number; y: number; well: number }[]; torn: number | null; focus: Pt | null; tugged?: number | null; held?: boolean };
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
