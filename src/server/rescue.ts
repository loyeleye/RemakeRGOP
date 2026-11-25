// Story run 9, the rescue, played in the page: Rook on the low one, filling the lamps of three
// boats at the landing while the cloud closes from the north. The docked boat's lamp is the bank:
// a wisp pulled into its light flies in. Kes strings wisps over from the far side and sets them
// down for him at the stones; she never banks. A dark patch in the cloud crosses the board three
// times, each time over the most light left lying loose: no light under it can be seen, loose
// wisps it covers are gone when it has passed, it breaks Kes's string, and it does nothing to Rook.
// (The first build's rules stay on switches: kesMode "banks", patchAim "line".) The numbers are RESCUE
// (src/engine/rescue.ts), the brief project files gameplay/runs9-10-prototype-brief.md, the lines
// story/runs9-10-story-check.md (drafts for Ladi). The cloud is the light law's cloud in game.ts,
// the string is the storm law, and the pools hold the laws of water.

import { Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { planSpot } from "../engine/bot.js";
import { Game, Grip, PULL_REACH, Rng, TICK_MS, type Action, type Command, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { LO_FRAME, LO_OVAL, LO_POOLS, RESCUE, loLand, loPlanks, loPool, loStrip, rescueCloudTicks } from "../engine/rescue.js";
import { STILL, stillMs, type StillCue } from "../engine/stills.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, KES_ID = 2;
const ROOK = "Rook", KES = "Kes", GRAN = "Sefa's grandmother";
/** Kes's lines for the bait rule (story/run9-rework-lines.md, the last section). Nobody says "bait". */
const RULE = "It goes for the brightest thing. So leave more at the stones than in the lamp.";
const NET = "These two stay at the stones. You fill the boat.";

/** What the patch would go for: a gathering of loose light, Kes's string, the docked lamp, or nothing much. Where, and how big. */
type Bright = { kind: "heap" | "string" | "lamp" | "none"; n: number; x: number; row: number; stones?: boolean };

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "hold" | "idle" | "heap" | "wary" | "spread" | "bait" | "badbait" | "timed";

/** The patch: its middle (tiles, not whole), its step each tick, its half-width, and ticks left before its edge reaches the land. */
type Patch = {
  x: number; y: number; dx: number; dy: number; r: number; warn: number; n: 1 | 2 | 3 | 4; took: number; crossedKes: boolean; saidUp: boolean;
  /** Its own pace and size, and (react) what it is going for: where along its row, whether it will loom there whatever is left, and where it is in that. */
  /** Ticks it has sat on a boat with light in its lamp. */
  sat?: number;
  speed: number; r0: number; aim?: { x: number; loom?: boolean; /** It is going for the docked lamp: it stops on the boat. */ lamp?: boolean }; phase: "run" | "loom" | "linger" | "leave"; left: number; big?: number;
  /** Left sitting at the landing's edge at the end: it does not move. */
  sit?: boolean;
  /**
   * The visit bent to pass over Kes: "to" while it makes for her, "on" while it is over her, "turn"
   * while it goes on to what it came for (on the row `row`); `bent` once it has. `called`: she has
   * said her line at it.
   */
  via?: "to" | "on" | "turn"; row?: number; bent?: boolean; called?: boolean;
};

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
  /** The second visit has been bent over her once this run (so the static over her is heard once for certain). */
  private bentOnce = false;
  /** The patch reached her in the middle of a line: when she is out, there is a moment for her to say it again. */
  private cutMidLine = false;
  private brokeString = false;
  private emptyHanded = false;
  /** The heaping stand-ins: bringing a heap in. And the wisp a stand-in is bringing: where it was when it started, last tick, how long it has not moved, and tiles it would not come to. */
  private heapIn = false;
  private fetching = { id: -1, from: pt(0, 0), last: pt(0, 0), still: 0, bad: new Set<number>() };
  /** Where Kes's next group comes up, and whether it is on its way. */
  private spots: Pt[] = [];
  private groupDue = false;
  /** The wisps that come up as hers (pearl, on the far side). One she has set down at the stones is his to pull until it is banked or lost. */
  private hers = new Set<number>();
  private setDown = new Set<number>();
  /** She has her string made up and is walking it to the stones, and how long it has not closed up behind her there. */
  private carrying = false;
  private headStill = 0;
  /** Banks, and the tick the lamp takes again after a boat has lifted. */
  private bankedN = 0;
  private dockAt = 0;
  /** The tick the docked lamp's newest pip goes out unless it is fed first, and the tick the last one went. */
  private goesAt = 1e9;
  private wentAt = -9;
  /** Wisps the lamp took: where each flew in from, and when. */
  private flew: { x: number; y: number; tick: number }[] = [];
  /** Ticks of the room's clock left on the full-screen still, and how long it has been up. */
  private holdLeft = 0;
  private holdFor = 0;
  /** Lines that must land: each stays on the screen as a caption until its tick. */
  private captions: { text: string; until: number }[] = [];
  /** Which call she made last at the stones. */
  private calls = 0;
  /** The last boat's lamp is full: the tick it filled, and the tick the boat lifted. */
  private endingAt = -1;
  private liftAt = -1;
  /** The room's own clock in ticks (it runs in the bells too), for the stills. */
  private clockTicks = 0;
  private stillEnd = -1e9;
  /** "dark" (the story thread's, the default) or "drag" (the first sketch; ?patch=drag in the page). */
  patchMode: "dark" | "drag" = RESCUE.patch.drag ? "drag" : "dark";
  /** Where a crossing aims: at the most loose light (the rule), or along the first build's fixed lines (?patch=line). */
  patchAim: "bait" | "clock" | "react" | "seek" | "line" = RESCUE.patch.aim;
  /** Bait: the tick the last tell began, what it would go for if it set out now, and whether it has sat on a boat this visit. */
  private toldAt = -1e9;
  /** Bait: the tick the lamp will take its next wisp. */
  private sipAt = 0;
  /** How long that wait is in all (the ring round the lamp closes over it). */
  private sipOf = 0;
  private target: Bright | null = null;
  private onBoat = false;
  private warned = false;
  /** This visit took a gathering at the stones while the docked lamp had light in it. */
  private spared = false;
  /** The tick it last moved off a boat it had sat on. */
  private offBoatAt = -1e9;
  /** Bait's safety net: wisps of Kes's that stay at the stones (hers, not his to pull). */
  private kept = new Set<number>();
  /** The pair she carries on the visit bent over her, and which of them it has covered. */
  private spare = new Set<number>();
  private spareOn = false;
  /** Bad bait (a stand-in): whether it leaves too few this visit. */
  private skimp = false;
  /** A crossing being told (clock): which one, and ticks until it sets out. */
  private tell: { k: number; left: number } | null = null;
  /** Kes sets hers down at the stones for him (the rule), or banks them herself as in the first build (?kes=banks). */
  kesMode: "supply" | "banks" = RESCUE.kes.banks ? "banks" : "supply";
  /** The docked lamp loses its pips unless it is fed in time (the rule), or keeps them (?lamp=holds). */
  lampMode: "leaks" | "holds" = RESCUE.lamp.leaks ? "leaks" : "holds";
  /** Pips that guttered out. */
  pipsLost = 0;
  /** All the stills off (?nostills in the page). */
  stillsOn = true;
  /** For tests and measurements. */
  stillsShown: string[] = [];
  restarts = 0;
  ticks = 0;
  lost = 0;
  lostToPatch = 0;
  /** Banks by her own pull (the first build's Kes only), and banks of wisps she set down at the stones. */
  kesBanks = 0;
  viaKes = 0;
  /** Wisps into the lamp (a flare's pip is a bank but not a wisp), and flares. */
  wispsIn = 0;
  flares = 0;
  flareOn: boolean = RESCUE.flare.on;
  private recent: number[] = [];
  private flaredAt = -9;
  setDowns = 0;

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
      case "on":
        // A tap on the full-screen still: on with it, once it has been up a moment.
        if (this.holdLeft > 0 && this.holdFor >= RESCUE.hold.minTicks) this.holdLeft = 0;
        return;
      case "act": {
        if (this.phase !== "playing" || this.endingAt >= 0 || this.holdLeft > 0) return;
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
    this.holdLeft = this.holdFor = 0;
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
      [R.his, R.hers + (this.netOn() ? R.patch.bait.kept : 0) + (this.spareOn0() ? R.patch.bait.spare : 0)],
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
    // The lamp does the banking (takeIn), not the engine's zone.
    for (const w of g.wisps) g.noBank.add(w.id);
    const theirs = g.wisps.filter((w) => w.guild === 1).map((w) => w.id);
    const keptN = this.netOn() ? R.patch.bait.kept : 0;
    this.hers = new Set(theirs.slice(0, R.hers));
    this.kept = new Set(theirs.slice(R.hers, R.hers + keptN));
    this.spare = new Set(theirs.slice(R.hers + keptN));
    this.spareOn = false;
    for (const id of this.spare) g.away.set(id, 1e9);
    this.toldAt = -1e9;
    this.sipAt = 0;
    this.sipOf = 0;
    this.target = null;
    this.onBoat = this.warned = this.skimp = false;
    this.offBoatAt = -1e9;
    this.setDown = new Set();
    this.carrying = false;
    this.headStill = 0;
    this.bankedN = this.dockAt = this.wispsIn = this.flares = 0;
    this.goesAt = 1e9;
    this.wentAt = -9;
    this.recent = [];
    this.flaredAt = -9;
    this.flew = [];
    this.captions = first && this.kesMode === "supply" ? [{ text: R.goal, until: R.goalTicks }, { text: R.part, until: R.goalTicks }] : [];
    // A try after the first: what she told him stays up a while, and after two lost tries she keeps a pair back herself.
    if (!first && this.patchAim === "bait" && this.said.has("rule")) this.captions.push({ text: this.kept.size ? NET : RULE, until: R.patch.bait.ruleTicks });
    if (this.kept.size && !this.said.has("net")) (this.said.add("net"), this.lines.push({ who: KES, text: NET, player: KES_ID }));
    this.queue = [];
    this.busyUntil = 0;
    this.fill = Array<number>(R.boats).fill(0);
    this.lifted = 0;
    this.cloudStep = 0;
    this.patch = null;
    this.crossings = 0;
    this.crossedAt = -1e9;
    this.tell = null;
    this.taken = new Set();
    this.outs = [];
    this.kesDark = this.kesHold = this.brokeString = this.emptyHanded = false;
    this.calls = 0;
    this.kesShaken = -1;
    this.endingAt = this.liftAt = -1;
    this.lost = this.lostToPatch = this.kesBanks = this.viaKes = this.setDowns = this.ticks = 0;
    this.said.delete("up");
    this.said.delete("where");
    this.said.delete("back");
    this.said.delete("string");
    this.said.delete("first");
    this.said.delete("stones");
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
      // The goal and her part in it, in her mouth (story/run9-rework-lines.md). The first build's line told the old split.
      if (this.kesMode === "supply") {
        this.say(KES, R.goal, { talk: true });
        this.say(KES, R.part, { talk: true });
      } else this.say(KES, "Near side's yours. I'll string the far side over.", { talk: true });
      this.countdown = R.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    }
    this.flush();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- the wisps

  /** A wisp comes onto the board: his on the near side by itself, hers in her group's place on the far side. */
  private arrive(w: Wisp) {
    const g = this.game;
    if (this.endingAt >= 0 || this.lifted >= RESCUE.boats || this.spare.has(w.id)) return void g.away.set(w.id, 1e9);
    if (this.kept.has(w.id)) {
      // The pair she keeps back: at the stones, hers.
      w.guild = 1 as Guild;
      const d = RESCUE.drop, c = g.board.center;
      const at = this.openSpot(() => true, 0, 1, pt(c.x + d.at[0], c.y + d.at[1]), 1) ?? pt(c.x + d.at[0], c.y + d.at[1]);
      return moveWisp(w, at);
    }
    if (this.hers.has(w.id)) {
      // One of hers comes back as hers, whatever became of it last time.
      w.guild = 1 as Guild;
      this.setDown.delete(w.id);
      const spot = this.spots[g.wisps.filter((o) => this.hers.has(o.id)).indexOf(w)];
      if (!spot) return void g.away.set(w.id, 1e9);
      return moveWisp(w, spot);
    }
    // Before the first crossing his come up on the middle strip where it will cross, so there is something loose there for it to pass over.
    const armed = this.crossings === 0 && !this.patch && this.banked() >= RESCUE.patch.firstBanks - 2;
    const bait = this.patchAim === "bait";
    const at = (armed && !bait && this.onCourse(this.course())) || this.openSpot((x) => loStrip(x) < 2, RESCUE.arriveNear, 2, null, 0, bait ? RESCUE.patch.bait.arriveFar : 99);
    if (!at) return void g.away.set(w.id, g.tick + RESCUE.pause);
    moveWisp(w, at);
  }

  /** A tile of open ground on the strips `strip` allows, at least `near` from the slip, inside the cloud's edge, and `apart` from every wisp. */
  private openSpot(strip: (x: number) => boolean, near: number, apart: number, around: Pt | null = null, within = 0, far = 99): Pt | null {
    const g = this.game, b = g.board, c = b.center, R = RESCUE;
    const edge = Math.min(far, (g.cloudAt ?? R.cloud.start) - R.arriveInside);
    const lo = Math.min(near, Math.max(6, edge - 4));
    const live = g.wisps.filter((o) => !g.away.has(o.id));
    for (let n = 0; n < 200; n++) {
      const x = around ? around.x - c.x + this.rng.int(within * 2 + 1) - within : LO_FRAME.x0 + this.rng.int(LO_FRAME.x1 - LO_FRAME.x0 + 1);
      const y = around ? around.y - c.y + this.rng.int(within * 2 + 1) - within : LO_FRAME.y0 + this.rng.int(-LO_FRAME.y0);
      const p = pt(c.x + x, c.y + y), d = Math.hypot(x, y);
      if (!strip(x) || d < lo || d > edge || !loLand(x, y) || loPlanks(x, y) || b.tile(p) !== Tile.Floor) continue;
      if (live.some((o) => cheb(o.pos, p) < apart) || g.players.some((q) => samePt(q.pos, p)) || this.spots.some((q) => cheb(q, p) < apart && !samePt(q, p) && around !== null)) continue;
      if (this.patch && this.covers(p, 1.5)) continue;
      // Nor on the lane ahead of it: one that came up there would only be taken.
      const q = this.patch;
      if (q && !q.sit && p.x + 0.5 > q.x - q.r && Math.abs(p.y + 0.5 - q.y) <= Math.max(q.r, q.big ?? 0, RESCUE.patch.react.sizes[2]! / 2) + 1.5) continue;
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
    const g = this.game, hers = g.wisps.filter((w) => this.hers.has(w.id));
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
    return this.bankedN;
  }

  /** The docked boat's lamp, as a tile. */
  private lampAt() {
    const c = this.game.board.center;
    return pt(c.x + RESCUE.lamp.at[0], c.y + RESCUE.lamp.at[1]);
  }

  /** The lamp is dark: the patch is fully on the boat (light inside it cannot be seen), or no boat is docked yet. */
  private lampDark() {
    return this.onTheBoat() || this.game.tick < this.dockAt;
  }

  /** Where the patch's middle is when it sits on the docked boat: two rows south of the lamp. */
  private boatAt() {
    const l = this.lampAt();
    return pt(l.x, l.y + 2);
  }

  /**
   * The patch is fully on the boat: its middle within a tile of the lamp or of where it sits on the
   * boat, or it went through one of them this tick. Not at first touch (Ladi, 25 Nov): until then the lamp still takes.
   */
  private onTheBoat() {
    const p = this.patch;
    return !!p && (this.covers(this.boatAt(), 1 - p.r) || this.covers(this.lampAt(), 1 - p.r));
  }

  /**
   * A boat has lifted out from under a patch on its way to it: it turns for the next brightest
   * thing there is (the next boat is not docked yet, so it is loose light or her string, or nothing).
   */
  private turnFromBoat() {
    const p = this.patch;
    if (!p || !p.aim?.lamp || p.phase === "linger" || p.phase === "leave") return;
    const t = this.brightest();
    if (t.kind === "heap" || t.kind === "string") {
      p.aim = { x: t.x + 0.5, ...(t.kind === "string" && t.n >= RESCUE.patch.react.loomAt ? { loom: true } : {}) };
      if (p.via !== "to") (p.via = "turn"), (p.phase = "run");
      p.row = t.row + 0.5;
      if (t.kind === "string") this.kesHold = true;
    } else {
      delete p.aim;
      if (p.via !== "to") delete p.via;
      p.phase = "run";
      p.dx = p.speed;
      p.dy = 0;
    }
  }

  /**
   * The docked boat's lamp takes every wisp of his that has come into its light: it flies in, and
   * another comes in its place as after any bank. Not hers while they are still hers (in supply),
   * not one the patch has, and nothing while the lamp is dark.
   */
  private takeIn() {
    const g = this.game, R = RESCUE, lamp = this.lampAt();
    if (this.lampDark()) return;
    const sip = this.patchAim === "bait" ? R.patch.bait.sip : 0;
    for (const w of g.wisps) {
      if (this.lifted >= R.boats || this.endingAt >= 0) return;
      // Bait: it takes one, and the next waits its turn in the lamp's light; but not the one that fills the boat (Ladi, 25 Nov).
      const fills = this.fill[this.lifted] === R.perBoat - 1;
      // What is left of its wait is the next boat's: it docks that much later, so pouring alone is no quicker than before.
      const early = fills && this.sipOf === sip ? Math.max(0, this.sipAt - g.tick) : 0;
      if (sip && g.tick < this.sipAt && !early) return;
      if (g.away.has(w.id)) continue;
      if (this.kesMode === "supply" && (w.guild === 1 || g.string.includes(w.id))) continue;
      if (Math.hypot(w.pos.x - lamp.x, w.pos.y - lamp.y) > R.lamp.take) continue;
      // The patch at its edge does not keep that one from the lamp either.
      if ((this.taken.has(w.id) || this.covers(w.pos)) && !(fills && w.guild === 0)) continue;
      this.taken.delete(w.id);
      this.flew.push({ x: w.pos.x, y: w.pos.y, tick: g.tick });
      if (w.guild === 1) this.kesBanks++;
      if (this.setDown.has(w.id)) this.viaKes++;
      for (const p of g.players) if (p.action.kind === "staff" && p.action.wisp === w.id) (p.action = { kind: "idle" }), (p.beam = null);
      w.holder = null;
      w.target = null;
      w.skate = null;
      w.grip = Grip.Free;
      g.string = g.string.filter((id) => id !== w.id);
      g.away.set(w.id, g.tick + R.pause);
      this.bankedN++;
      this.wispsIn++;
      this.goesAt = g.tick + R.lamp.hold;
      this.sipAt = g.tick + sip;
      this.sipOf = sip;
      // The try: enough of them in quick succession and the lamp flares, a pip more.
      this.recent = [...this.recent.filter((t) => g.tick - t < R.flare.within), g.tick];
      const flare = this.flareOn && this.recent.length >= R.flare.of;
      if (flare) (this.recent = []), (this.flares++), (this.flaredAt = g.tick);
      for (let k = flare ? 1 + R.flare.pips : 1; k > 0; k--) {
        if (k > 1) this.bankedN++;
        // Into the lamp of the boat in the slip; a full lamp lifts its boat, and the next slides in.
        if (++this.fill[this.lifted]! < R.perBoat) continue;
        if (this.lifted === R.boats - 1) return this.lastBoat();
        this.lifted++;
        this.dockAt = g.tick + R.lamp.swap + early;
        this.say(KES, this.lifted === 1 ? "First boat's away." : "Second's away. One more, Rook.", { player: KES_ID }, "key");
        this.turnFromBoat();
      }
      if (g.tick < this.dockAt) return;
    }
  }

  /**
   * The lamp does not keep its light in this cloud: when it has not been fed for a while its
   * newest pip gutters out, and then another, until a wisp goes in. A dark lamp's clock stands.
   */
  private leaks() {
    return this.lampMode === "leaks" && this.patchAim !== "bait";
  }

  /** A spare pair is made for a try only while the visit bent over Kes is still to come. */
  private spareOn0() {
    return this.patchAim === "bait" && this.kesMode === "supply" && !this.bentOnce;
  }

  private netOn() {
    return this.patchAim === "bait" && this.restarts >= RESCUE.patch.bait.net;
  }

  private leak() {
    const g = this.game, L = RESCUE.lamp;
    if (!this.leaks() || this.endingAt >= 0 || this.lifted >= RESCUE.boats) return;
    if (!this.fill[this.lifted]) return void (this.goesAt = 1e9);
    if (this.lampDark()) return void this.goesAt++;
    if (g.tick < this.goesAt) return;
    this.fill[this.lifted]!--;
    this.pipsLost++;
    this.wentAt = g.tick;
    this.goesAt = g.tick + L.drip;
    if (!this.said.has("leak")) (this.said.add("leak"), this.say(KES, "It won't keep in this cloud. Fill it in one go.", { player: KES_ID }, "key", RESCUE.goalTicks));
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
    // The one still that stops play: nothing moves while it is up.
    if (this.holdLeft > 0) {
      this.holdLeft--;
      this.holdFor++;
      this.flush();
      return this.broadcastRoom();
    }
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
      // The last look: with the boats gone it slides off the rim, toward home.
      const p = this.patch, slide = R.patch.react.slide;
      if (p?.sit) (p.dx = slide[0]), (p.dy = slide[1]), (p.x += p.dx), (p.y += p.dy);
      g.cloudAt = Math.max(3, (g.cloudAt ?? 0) - 7);
      if (g.tick - this.liftAt >= R.holdTicks) this.finish();
      return;
    }
    if (this.stand && this.stand !== "idle") this.steer();
    this.steerKes();
    g.step();
    this.trail();
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
      this.say(KES, "Not over the water. Walk it round.", { player: KES_ID }, "key");
    }
    // The first time it is over the docked boat: she says why nothing goes in.
    if (this.patch && !this.said.has("lampdark") && this.onTheBoat()) {
      this.said.add("lampdark");
      this.say(KES, this.patchAim === "bait" ? "It's on the boat. Steady." : "Lamp's gone dark. Wait for it.", { player: KES_ID }, "key");
    }
    this.takeIn();
    this.leak();
    if (this.endingAt >= 0) return;
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
    // React: it is left sitting at the landing's edge at its smallest, and does not move again.
    const A = RESCUE.patch.react, c = g.board.center;
    this.tell = null;
    this.patch = this.reacts() ? { x: c.x + A.sit[0] + 0.5, y: c.y + A.sit[1] + 0.5, dx: 0, dy: 0, r: A.sizes[0]! / 2, warn: 0, n: 4, took: 0, crossedKes: false, saidUp: true, speed: 0, r0: A.sizes[0]! / 2, phase: "run", left: 0, sit: true } : null;
    this.kesDark = false;
    for (const w of g.wisps) g.away.set(w.id, 1e9);
    g.string = [];
    for (const p of g.players) p.action = { kind: "idle" };
    this.say(KES, "That's all of them. Now us.", { player: KES_ID }, "key");
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
    const loose = (w: Wisp) => w.guild === 0 && !g.away.has(w.id) && !w.touched && Math.abs(w.pos.y - row) <= reach && !g.board.inBankZone(w.pos);
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
      if (this.patchAim === "bait") return this.onClock();
      if (g.tick < this.crossedAt + P.gap) return;
      const n = this.banked();
      if (this.patchAim === "clock") return this.onClock();
      if (this.patchAim !== "line") return this.setOut();
      if (this.crossings === 0 && (n >= P.firstBanks || g.tick >= P.firstBy)) {
        // Across the island's middle, west to east, where his last few have come up: the row within
        // `nearCourse` of the course with the most of his loose wisps on it (the middle strip's count
        // twice), and well away from her. If she is in the way it waits for her to move on.
        const reach = P.size / 2 - 1, by = this.course(), late = g.tick >= Math.max(P.firstBy, 0) + 25 || n >= P.firstBanks + 3;
        const loose = g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id) && !w.touched && !g.board.inBankZone(w.pos));
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
        this.say(KES, "It's coming back. Get them off the neck.", { player: KES_ID }, "key");
      }
      return;
    }
    const p = this.patch;
    if (p.sit) return;
    if (p.warn > 0) p.warn--;
    this.movePatch(p);
    // The first time, with the first lamps cold and before it is on the board: play stops on the full-screen still.
    if (this.patchAim !== "line" && p.n === 1 && p.warn === RESCUE.hold.warnLeft && !this.said.has("what")) {
      this.said.add("what");
      this.lines.push({ who: KES, text: "Rook. What is that.", player: KES_ID, ...(this.stillsOn ? { still: { id: RESCUE.hold.id, full: true } } : {}) });
      if (this.stillsOn) {
        this.stillsShown.push(RESCUE.hold.id);
        this.holdLeft = RESCUE.hold.ticks;
        this.holdFor = 0;
      }
    }
    if (p.warn > 0) return;
    // Loose wisps it covers: not seen while it is over them, and gone when it has passed.
    const rook = this.player(YOU);
    // A staff on it this tick: the engine's `holder` stays set after the last touch, so it is not the test by itself.
    const held = (w: Wisp) => rook.beam === w.id || (w.holder === YOU && w.touched) || (!this.kesDark && g.string.includes(w.id)) || (!this.kesDark && w.holder === KES_ID && w.touched);
    for (const w of g.wisps) {
      if (g.away.has(w.id)) continue;
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
    // It has moved off a boat it sat on: the glows aboard come back, and the lamp is cold a while (it takes nothing).
    if (this.onBoat && p.phase === "leave" && !this.covers(this.lampAt())) {
      this.onBoat = false;
      this.offBoatAt = g.tick;
      this.sipOf = RESCUE.patch.bait.cold;
      this.sipAt = Math.max(this.sipAt, g.tick + this.sipOf);
      this.say(KES, "They're all right. Lamp's cold. We go again.", { player: KES_ID }, this.said.has("cold") ? "quip" : "key");
      this.said.add("cold");
    }
    // The visit bent over her: a tick before it covers her she calls it, and stands where she is.
    if (p.via === "to" && !p.called && Math.hypot(kes.pos.x + 0.5 - p.x, kes.pos.y + 0.5 - p.y) - p.r <= p.speed) {
      p.called = true;
      this.kesHold = true;
      const line: StoryLine = { who: KES, text: "It's coming back.", player: KES_ID };
      this.queue = this.queue.filter((q) => q.key);
      this.lines.push(line);
      this.busyUntil = g.tick + lineTicks(line);
      this.cutMidLine = true;
    }
    // Over Kes: her glow goes dark and her string drops, every wisp on it loose where it was.
    if (!this.kesDark && this.covers(kes.pos)) {
      this.kesDark = true;
      p.crossedKes = true;
      this.kesHold = false;
      const had = g.string.length;
      this.brokeString = had > 0;
      this.carrying = false;
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
      // Her glow comes back the moment it has passed. She stands a moment, and with her string gone a long one, her hands empty.
      this.kesDark = false;
      // Cut off in the middle of a line, she says it again now: nothing else is said over it.
      if (this.cutMidLine) (this.cutMidLine = false), (this.busyUntil = Math.max(this.busyUntil, g.tick + 2));
      // The pair she was carrying is not there any more.
      if (this.spareOn) {
        this.spareOn = false;
        for (const id of this.spare) {
          const w = g.wisps[id]!;
          if (g.away.has(id)) continue;
          this.outs.push({ x: w.pos.x, y: w.pos.y, tick: g.tick });
          moveWisp(w, w.pos);
          g.string = g.string.filter((s) => s !== id);
          g.away.set(id, 1e9);
        }
      }
      this.kesShaken = g.tick + (this.kesMode === "supply" && this.brokeString ? RESCUE.kes.emptyHands : RESCUE.kes.shaken);
      this.emptyHanded = this.kesMode === "supply" && this.brokeString;
      this.brokeString = false;
    }
    // Half way over: she looks up, and there is nothing there.
    if (p.n === 1 && !p.saidUp && p.x >= c.x - 2) {
      p.saidUp = true;
      this.say(KES, "There's nothing up there.", { player: KES_ID, ...this.still("r9-1", pt(Math.round(p.x), Math.round(p.y))) }, "key");
    }
    // Off the land and away (the second time toward home): it is gone from the board.
    if (p.x - p.r > c.x + LO_FRAME.x1 + 2) {
      if (p.n === 1 && p.took > 0) this.say(KES, this.patchAim === "line" ? "Where did they go?" : "They're gone.", { player: KES_ID }, "key");
      // The one thing he has to learn about it, said after the first time, and held on the screen.
      if (this.patchAim !== "line" && this.patchAim !== "bait" && p.n === 1 && !this.said.has("light")) (this.said.add("light"), this.say(KES, "It went for the heap. Don't let mine sit.", { player: KES_ID }, "key", RESCUE.goalTicks));
      if (this.patchAim === "bait") {
        // What it left behind, in her mouth; and after its first visit, the rule.
        if (this.spared) this.say(KES, "It took the stones. Boat's still lit. Go.", { player: KES_ID }, this.said.has("spared") ? "quip" : "key"), this.said.add("spared");
        if (!this.said.has("rule")) (this.said.add("rule"), this.say(KES, RULE, { player: KES_ID }, "key", RESCUE.patch.bait.ruleTicks));
        this.onBoat = this.spared = false;
      }
      this.patch = null;
      this.kesHold = false;
      this.crossings++;
      this.crossedAt = g.tick;
      for (const id of this.taken) this.gone(g.wisps[id]!);
      this.taken.clear();
    }
  }

  /**
   * The rule: it goes for light. Crossing k sets out once enough are in (or it is late), along the
   * row of the biggest gathering of loose light he could pull. The second waits for Kes to have a
   * string in hand and goes through her, as it always did.
   */
  private setOut(clock = false) {
    const g = this.game, P = RESCUE.patch, c = g.board.center, k = this.crossings, n = this.banked();
    if (!clock && (k >= P.at.length || !(n >= P.at[k]! || g.tick >= P.by[k]!))) return;
    const kes = this.player(KES_ID), A = P.react, react = this.reacts();
    // Seek: one size, a little faster each time. React: its size and pace from how much light it is going for.
    const pace = (many: number) => (react ? A.speeds[Math.min(many, A.speeds.length) - 1] ?? P.speed : P.speeds[k] ?? P.speed);
    const size = (many: number) => (react ? A.sizes[many >= 2 ? 1 : 0]! : P.size);
    if (k === 1) {
      const strung = g.string.length, south = kes.pos.y - c.y >= LO_POOLS[0].y1 - 5;
      const late = n >= P.at[k]! + 1 || g.tick >= P.by[k]! + P.wait;
      const last = n >= P.at[k]! + 2 || g.tick >= P.by[k]! + 2 * P.wait;
      // On the clock it does not wait for her: it goes through her if she has a string in hand as it sets out.
      if (clock ? strung >= 1 : strung >= 2 ? south || late : strung >= 1 && late) {
        const mean = g.string.reduce((sum, id) => sum + g.wisps[id]!.pos.y, 0) / strung;
        this.launch(2, kes.pos.y + Math.max(-P.lean, Math.min(P.lean, Math.round(mean - kes.pos.y))), pace(strung), size(strung), react ? { x: kes.pos.x + 0.5, loom: strung >= A.loomAt } : undefined);
        this.kesHold = true;
        if (!clock) this.say(KES, "It's coming back.", { player: KES_ID }, "key");
        return;
      }
      if (!clock && !last) return;
    }
    const at = this.gathering(), many = Math.max(1, at?.n ?? 1);
    this.launch((k + 1) as 1 | 2 | 3, at ? at.row : this.course(), pace(many), size(many), react && at ? { x: at.x + 0.5 } : undefined);
    if (k > 0 && !clock) this.say(KES, k === 1 ? "It's coming back." : "Again. Clear the stones.", { player: KES_ID }, "key");
  }

  /** "react", or "clock", which is react on a clock. */
  private reacts() {
    return this.patchAim === "react" || this.patchAim === "clock" || this.patchAim === "bait";
  }

  /**
   * The clock: each crossing is told at its share of the cloud's own clock, for `clock.tell` ticks
   * (the far lamps going cold toward the landing), and then sets out at the biggest gathering.
   */
  private onClock() {
    const g = this.game, C = RESCUE.patch.clock, B = RESCUE.patch.bait, k = this.crossings, bait = this.patchAim === "bait";
    if (!this.tell) {
      if (this.endingAt >= 0) return;
      if (bait) {
        if (k === 0 ? !(this.bankedN >= 1 || g.tick >= B.firstBy) : g.tick < this.toldAt + B.every || g.tick < this.crossedAt + B.rest) return;
      } else if (k >= C.at.length || g.tick < Math.round(C.at[k]! * rescueCloudTicks())) return;
      this.tell = { k, left: C.tell };
      this.toldAt = g.tick;
      this.warned = false;
      this.skimp = this.rng.next() < 0.5;
      // The pair she keeps back is at the stones again for each visit.
      for (const id of this.kept) if (g.away.has(id)) g.away.set(id, g.tick + 1);
      // (Bait: the second visit's word is hers as it reaches her, see overKes; if that has been, it is said here.)
      if (k > 0 && (!bait || (k === 1 && this.bentOnce))) this.say(KES, k === 1 ? "It's coming back." : "Again. Clear the stones.", { player: KES_ID }, "key");
      return;
    }
    const t = this.tell;
    t.left--;
    // The first time, with the first lamps cold: play stops on the full-screen still.
    if (k === 0 && this.restarts === 0 && t.left <= C.tell - C.hold && !this.said.has("what")) {
      this.said.add("what");
      this.lines.push({ who: KES, text: "Rook. What is that.", player: KES_ID, ...(this.stillsOn ? { still: { id: RESCUE.hold.id, full: true } } : {}) });
      if (this.stillsOn) {
        this.stillsShown.push(RESCUE.hold.id);
        this.holdLeft = RESCUE.hold.ticks;
        this.holdFor = 0;
      }
    }
    if (bait) {
      // What it would go for if it set out now: he can see it, and change it.
      this.target = this.brightest();
      // Half way through the tell and still turned for the boat: she calls it, once he knows the rule.
      if (this.target.kind === "lamp" && this.said.has("rule") && !this.warned && t.left <= C.tell / 2 && t.left > 3) {
        this.warned = true;
        this.say(KES, "Too few at the stones. It's turning for the boat.", { player: KES_ID });
      }
    }
    if (t.left > 0) return;
    this.tell = null;
    if (bait) return this.setOutBait();
    this.setOut(true);
  }

  /**
   * Bait: the brightest thing there is. Loose light of his gathered within `near` tiles (the pair
   * Kes keeps back counts), her string in her hand, and the docked lamp at its pips. The lamp only
   * when it is brighter than both; of the other two the bigger, a gathering before a string.
   */
  private brightest(): Bright {
    const g = this.game, B = RESCUE.patch.bait, c = g.board.center, kes = this.player(KES_ID), lamp = this.lampAt();
    const docked = g.tick >= this.dockAt && this.lifted < RESCUE.boats;
    // What waits in the lamp's light is the lamp's light too.
    const waiting = this.waiting();
    const pips = docked ? this.fill[this.lifted]! + waiting.length : 0;
    const asLamp: Bright = { kind: "lamp", n: pips, x: lamp.x, row: lamp.y };
    // The first visit of the first try: to the lamp, if there is anything in it, so that he sees what it does there.
    if (B.teach && this.crossings === 0 && this.restarts === 0 && !this.said.has("rule") && pips >= 1) return asLamp;
    const heap = this.gathering(new Set(waiting.map((w) => w.id))), strung = this.kesDark ? 0 : g.string.length;
    const most = Math.max(heap?.n ?? 0, strung);
    if (pips > 0 && (B.tie === "lamp" ? pips >= most : pips > most)) return asLamp;
    if (heap && heap.n >= strung) {
      const d = RESCUE.drop;
      return { kind: "heap", n: heap.n, x: heap.x, row: heap.row, stones: Math.hypot(heap.x - (c.x + d.at[0]), heap.row - (c.y + d.at[1])) <= d.r + 2 };
    }
    if (strung) {
      const mean = g.string.reduce((sum, id) => sum + g.wisps[id]!.pos.y, 0) / strung, lean = RESCUE.patch.lean;
      return { kind: "string", n: strung, x: kes.pos.x, row: kes.pos.y + Math.max(-lean, Math.min(lean, Math.round(mean - kes.pos.y))) };
    }
    return { kind: "none", n: 0, x: c.x, row: this.course() };
  }

  /** His wisps waiting in the docked lamp's light for it to take them. */
  private waiting() {
    const g = this.game, lamp = this.lampAt();
    return g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id) && !this.taken.has(w.id) && Math.hypot(w.pos.x - lamp.x, w.pos.y - lamp.y) <= RESCUE.lamp.take);
  }

  /** Bait: the tell is over, and it sets out for the brightest thing. Its size and pace follow how bright that is. */
  private setOutBait() {
    const A = RESCUE.patch.react, P = RESCUE.patch, t = this.brightest(), many = Math.max(1, t.n);
    const n = Math.min(3, this.crossings + 1) as 1 | 2 | 3;
    const pace = A.speeds[Math.min(many, A.speeds.length) - 1] ?? P.speed, size = A.sizes[many >= 2 ? 1 : 0]!;
    this.target = null;
    this.spared = t.kind === "heap" && !!t.stones && this.fill[this.lifted]! > 0;
    if (n === 2 && !this.bentOnce) return this.overKes(t, pace, size);
    if (t.kind === "none") return this.launch(n, t.row, pace, size);
    // For the lamp it comes up the boat itself, two rows south of the lamp, and is never smaller than a boat is wide.
    if (t.kind === "lamp") return this.launch(n, t.row + 2, pace, Math.max(size, A.sizes[1]!), { x: t.x + 0.5, lamp: true, loom: many >= A.loomAt });
    this.launch(n, t.row, pace, size, { x: t.x + 0.5, ...(t.kind === "string" ? { loom: many >= A.loomAt } : {}) });
    if (t.kind === "string") this.kesHold = true;
  }

  /**
   * The second visit, once a run (the gameplay thread, 24 Nov): whatever it is going for, its way
   * is bent to pass over Kes first, so that the static over her is heard once for certain. It
   * sets out on her row and makes straight for her; she calls "It's coming back." a tick before
   * it covers her (the burst cuts the line off, and she says it again when she is out); it stays
   * over her a tick and then goes on to what it came for. Her next pair comes up as it sets out,
   * if it was due, so that she has it in hand.
   */
  private overKes(t: Bright, pace: number, size: number) {
    const A = RESCUE.patch.react, g = this.game, kes = this.player(KES_ID), lamp = t.kind === "lamp";
    this.bentOnce = true;
    const aim = t.kind === "heap" || lamp ? { x: t.x + 0.5, ...(lamp ? { lamp: true } : {}), ...(lamp && t.n >= A.loomAt ? { loom: true } : {}) } : undefined;
    this.launch(2, kes.pos.y, pace, lamp ? Math.max(size, A.sizes[1]!) : size, aim);
    const p = this.patch!;
    p.via = "to";
    p.bent = true;
    p.row = (lamp ? t.row + 2 : t.row) + 0.5;
    for (const w of g.wisps) if (this.hers.has(w.id) && this.groupDue && g.away.has(w.id) && g.away.get(w.id)! < 1e8) g.away.set(w.id, g.tick + 1);
    this.carryPair();
  }

  /**
   * The visit bent over her: she is carrying a pair to the stones when it comes (an extra pair, made
   * for this visit). They are strung behind her, and she makes for the stones with them.
   */
  private carryPair() {
    const g = this.game, b = g.board, kes = this.player(KES_ID), c = b.center, stand = pt(c.x + RESCUE.drop.stand[0], c.y + RESCUE.drop.stand[1]);
    if (this.kesMode !== "supply" || g.string.length >= 2) return;
    let lead = kes.pos;
    for (const id of this.spare) {
      if (g.string.length >= 2) break;
      const w = g.wisps[id]!, free = (p: Pt) => b.passable(p, Mover.Wisp) && !samePt(p, kes.pos) && !g.wisps.some((o) => o !== w && !g.away.has(o.id) && samePt(o.pos, p));
      // Behind her: the free tile next to the one in front that is farthest from the stones, so the string trails her there.
      let at: Pt | null = null;
      for (let r = 1; r <= 2 && !at; r++) {
        const ring: Pt[] = [];
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(pt(lead.x + dx, lead.y + dy))) ring.push(pt(lead.x + dx, lead.y + dy));
        at = ring.sort((p, q) => Math.hypot(q.x - stand.x, q.y - stand.y) - Math.hypot(p.x - stand.x, p.y - stand.y))[0] ?? null;
      }
      if (!at) break;
      g.away.delete(id);
      moveWisp(w, at);
      w.guild = 1 as Guild;
      w.holder = KES_ID;
      w.grip = Grip.Held;
      g.string.push(id);
      lead = at;
      this.spareOn = true;
    }
    if (this.spareOn) this.carrying = true;
  }

  /** One tick of the visit bent over Kes, until it is on its own row again. */
  private moveVia(p: Patch) {
    const A = RESCUE.patch.react, kes = this.player(KES_ID);
    const toward = (x: number, y: number) => {
      const d = Math.hypot(x - p.x, y - p.y), k = d <= p.speed ? 1 : p.speed / d;
      p.dx = (x - p.x) * k;
      p.dy = (y - p.y) * k;
      p.x += p.dx;
      p.y += p.dy;
      return d <= p.speed;
    };
    if (p.via === "to") {
      if (toward(kes.pos.x + 0.5, kes.pos.y + 0.5)) (p.via = "on"), (p.left = 1);
    } else if (p.via === "on") {
      p.dx = p.dy = 0;
      if (--p.left >= 0) return;
      // On: to what it came for, or with nothing to go for, straight off east.
      if (p.aim) p.via = "turn";
      else (delete p.via), (p.dx = p.speed);
    }
    if (p.via !== "turn" || !p.aim) return;
    // It swells on the way if there is enough there to swell for.
    const big = A.sizes[2]! / 2, d = Math.hypot(p.aim.x - p.x, p.row! - p.y);
    const g = this.game, rook = this.player(YOU), near = RESCUE.patch.near + 2;
    const pile = g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id) && rook.beam !== w.id && Math.abs(w.pos.x + 0.5 - p.aim!.x) <= near && Math.abs(w.pos.y + 0.5 - p.row!) <= near).length;
    const swell = p.aim.loom || (!p.aim.lamp && pile >= A.loomAt);
    if (swell) (p.big = big), (p.r += (big - p.r) / Math.max(1, Math.ceil(d / p.speed)));
    if (!toward(p.aim.x, p.row!)) return;
    delete p.via;
    // There: over a gathering big enough, or on the boat, it stays; over less it goes on as it always does.
    if (swell || p.aim.lamp) (p.phase = "linger"), (p.left = A.linger);
    else (p.phase = "leave"), (p.left = 0);
  }

  /** One tick of its going. React: it swells as it nears a gathering, stays over it a moment, and shrinks as it goes on. */
  private movePatch(p: Patch) {
    const A = RESCUE.patch.react;
    if (p.via) return this.moveVia(p);
    if (!this.reacts() || !p.aim) {
      p.x += p.dx;
      p.y += p.dy;
      return;
    }
    if (p.phase === "run") {
      const big = A.sizes[2]! / 2, gap = p.aim.x - p.x;
      const swell = p.aim.loom || this.pile(p) >= A.loomAt;
      // Going for the lamp it stops on the boat whatever its size; it swells only for three pips or more.
      if (p.aim.lamp && !swell && p.warn <= 0 && gap > 0 && gap <= p.speed) {
        p.dx = gap;
        p.x = p.aim.x;
        p.phase = "linger";
        p.left = A.linger;
        return;
      }
      if (p.warn > 0 || gap <= 0 || gap > A.swellFrom + big + p.speed || !swell) {
        p.dx = p.speed;
        p.x += p.dx;
        return;
      }
      p.phase = "loom";
      p.left = A.loomTicks;
      p.big = big;
    }
    if (p.phase === "loom") {
      p.dx = (p.aim.x - p.x) / p.left;
      p.x += p.dx;
      p.r += (p.big! - p.r) / p.left;
      if (--p.left <= 0) (p.phase = "linger"), (p.left = A.linger);
    } else if (p.phase === "linger") {
      p.dx = p.dy = 0;
      // On the boat it stays until the lamp is empty: a pip goes out every `drink` ticks. Nothing is seen or heard of it but the strip.
      const g = this.game, pips = this.lifted < RESCUE.boats && g.tick >= this.dockAt ? this.fill[this.lifted]! : 0;
      if (p.aim.lamp && pips > 0) {
        this.onBoat = true;
        p.left = Math.max(1, p.left - 1);
        if (++p.sat! % RESCUE.patch.bait.drink === 0) {
          this.fill[this.lifted]!--;
          this.pipsLost++;
          this.wentAt = g.tick;
        }
        return;
      }
      if (--p.left <= 0) (p.phase = "leave"), (p.left = A.loomTicks);
    } else {
      p.dx = p.speed;
      p.dy = 0;
      if (p.bent) {
        // It has been over her once: on its way off it keeps clear of her.
        const kes = this.player(KES_ID), off = p.y - (kes.pos.y + 0.5), clear = Math.max(p.r, p.r0) + 1.5;
        if (kes.pos.x + 0.5 > p.x - clear && Math.abs(off) < clear) p.dy = (off >= 0 ? 1 : -1) * Math.min(1.5, clear - Math.abs(off));
      }
      p.x += p.dx;
      p.y += p.dy;
      if (p.left > 0) (p.r += (p.r0 - p.r) / p.left), p.left--;
      if (p.left <= 0) delete p.big;
    }
  }

  /** How much loose light of his lies where it is going, now. */
  private pile(p: Patch) {
    const g = this.game, rook = this.player(YOU), near = RESCUE.patch.near + 2;
    return g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id) && rook.beam !== w.id && Math.abs(w.pos.x + 0.5 - p.aim!.x) <= near && Math.abs(w.pos.y + 0.5 - p.y) <= near).length;
  }

  /**
   * The biggest gathering of loose light he could pull: his own loose wisps and the ones at the
   * stones, within `near` tiles of each other. On a tie, the one nearest the lamp. Its row and size.
   */
  gathering(not?: Set<number>): { row: number; x: number; n: number; ids: number[] } | null {
    const g = this.game, P = RESCUE.patch, rook = this.player(YOU), lamp = this.lampAt();
    const loose = g.wisps.filter((w) => (w.guild === 0 || this.kept.has(w.id)) && !not?.has(w.id) && !g.away.has(w.id) && rook.beam !== w.id && !(w.holder === YOU && w.touched));
    const seen = new Set<number>();
    let best: { row: number; x: number; n: number; ids: number[]; d: number } | null = null;
    for (const w of loose) {
      if (seen.has(w.id)) continue;
      const group = [w];
      seen.add(w.id);
      for (let i = 0; i < group.length; i++) for (const o of loose) if (!seen.has(o.id) && cheb(o.pos, group[i]!.pos) <= P.near) (seen.add(o.id), group.push(o));
      const y = group.reduce((sum, o) => sum + o.pos.y, 0) / group.length, x = group.reduce((sum, o) => sum + o.pos.x, 0) / group.length;
      const d = Math.hypot(x - lamp.x, y - lamp.y);
      if (!best || group.length > best.n || (group.length === best.n && d < best.d)) best = { row: Math.round(y), x, n: group.length, ids: group.map((o) => o.id), d };
    }
    return best;
  }

  /** It sets out west of the land on this row, so that its edge reaches the land as the warning ends. */
  private launch(n: 1 | 2 | 3, row: number, speed: number = RESCUE.patch.speed, size: number = RESCUE.patch.size, aim?: { x: number; loom?: boolean; lamp?: boolean }) {
    const P = RESCUE.patch, c = this.game.board.center, r = size / 2;
    let west = LO_FRAME.x1;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let x = LO_FRAME.x0; x <= LO_FRAME.x1; x++) if (loLand(x, row - c.y + dy) && x < west) west = x;
    this.patch = { x: c.x + west - r - P.warn * speed, y: row + 0.5, dx: speed, dy: 0, r, warn: P.warn + 1, n, took: 0, crossedKes: false, saidUp: false, speed, r0: r, phase: "run", left: 0, sat: 0, ...(aim ? { aim } : {}) };
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
    g.away.set(w.id, this.kept.has(w.id) || this.spare.has(w.id) ? 1e9 : g.tick + RESCUE.pause);
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
    if (this.emptyHanded) {
      // Her supply starts again.
      this.emptyHanded = false;
      this.say(KES, "I'm all right. More coming.", { player: KES_ID }, "key");
    }
    const fix = me.mode !== "pull" || undefined;
    const live = (w: Wisp) => w.guild === 1 && !this.kept.has(w.id) && !g.board.inBankZone(w.pos) && !g.away.has(w.id) && !this.taken.has(w.id);
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
    // With the pair for the bent visit on her string, she makes straight for the stones.
    if (this.spareOn && this.kesMode === "supply" && head && live(head)) return this.carry(head);
    if (loose.length && g.string.length < RESCUE.storm.max) {
      this.carrying = false;
      // Walk to each wisp and touch it: that is what her gift costs her.
      const w = loose.sort((a, b) => cheb(a.pos, me.pos) - cheb(b.pos, me.pos))[0]!;
      if (cheb(me.pos, w.pos) <= RESCUE.storm.reach && g.inReach({ ...me, mode: "pull" }, w)) return cmd({ action: { kind: "staff", wisp: w.id }, toggleMode: fix });
      const at = this.besideWisp(w, me.pos);
      if (me.action.kind === "walk" && samePt(me.action.to, at)) return cmd(fix ? { toggleMode: true } : null);
      return cmd({ action: { kind: "walk", to: at }, toggleMode: fix });
    }
    if (this.kesMode === "supply") return this.carry(head && live(head) ? head : null);
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

  /**
   * Kes with her string made up: she walks it over to the stones, the string trailing after her
   * (trail), and from her place there sets it down loose for him. With nothing strung she goes
   * back to where her next group will come up.
   */
  private carry(head: Wisp | null) {
    const g = this.game, me = this.player(KES_ID), c = g.board.center, D = RESCUE.drop;
    const cmd = (k: Command | null) => k && g.command(KES_ID, k);
    const fix = me.mode !== "pull" || undefined;
    const walk = (to: Pt) => (samePt(me.pos, to) ? cmd(me.action.kind === "idle" ? null : { action: { kind: "idle" } }) : me.action.kind === "walk" && samePt(me.action.to, to) ? cmd(fix ? { toggleMode: true } : null) : cmd({ action: { kind: "walk", to }, toggleMode: fix }));
    this.carrying = !!head;
    // With a string in hand she walks; with empty hands she runs.
    if (me.run === !!head) g.command(KES_ID, { toggleRun: true });
    if (!head) {
      const wait = this.spots[0] ? this.besideWisp({ pos: this.spots[0] } as Wisp, me.pos) : null;
      return wait ? walk(wait) : undefined;
    }
    const stand = pt(c.x + D.stand[0], c.y + D.stand[1]);
    if (!samePt(me.pos, stand)) return (this.headStill = 0), walk(stand);
    // There: when the string has closed up behind her (or will come no nearer), she lets go, and they are his.
    // The pair for the bent visit is never set down: it comes for her before she can.
    if (this.spareOn) return;
    const tail = g.string.map((id) => g.wisps[id]!);
    const closed = tail.every((w, i) => cheb(w.pos, i ? tail[i - 1]!.pos : me.pos) <= 1);
    if (closed || ++this.headStill > 4) return this.setAtStones();
  }

  /**
   * The string in her hand follows her as she walks: each wisp on it steps after the one in
   * front (the head after her), up to two tiles a tick, by the way a walker would go. By the
   * stones it closes right up.
   */
  private trail() {
    const g = this.game, b = g.board, kes = this.player(KES_ID), c = b.center;
    if (!this.carrying || this.kesDark || this.kesHold || !g.string.length) return;
    const stand = pt(c.x + RESCUE.drop.stand[0], c.y + RESCUE.drop.stand[1]);
    const gap = samePt(kes.pos, stand) ? 1 : RESCUE.storm.gap;
    let lead = kes.pos, first = true;
    for (const id of g.string) {
      const w = g.wisps[id]!;
      for (let k = 0; k < 2 && cheb(w.pos, lead) > (first ? 1 : gap); k++) {
        const next = b.walkPath(w.pos, lead, true)[0];
        if (!next || samePt(next, kes.pos) || g.wisps.some((o) => o !== w && !g.away.has(o.id) && samePt(o.pos, next))) break;
        w.pos = next;
      }
      w.target = null;
      w.holder = KES_ID;
      w.grip = Grip.Held;
      lead = w.pos;
      first = false;
    }
    g.stringLive = true;
  }

  /** She lets her string go at the stones: every wisp on it is loose there, and his to pull. */
  private setAtStones() {
    const g = this.game, ids = [...g.string];
    g.string = [];
    for (const id of ids) {
      const w = g.wisps[id]!;
      w.guild = 0 as Guild;
      w.holder = null;
      w.target = null;
      w.grip = Grip.Free;
      this.setDown.add(id);
    }
    const kes = this.player(KES_ID);
    kes.action = { kind: "idle" };
    kes.beam = null;
    this.carrying = false;
    this.headStill = 0;
    this.setDowns += ids.length;
    // Called every time, never the same twice running; the first time it is kept even if she is mid-line.
    const n = ["", "One", "Two", "Three"][ids.length] ?? "", full = ids.length === RESCUE.hers && n;
    const call = full ? [`${n} at the stones, Rook.`, `${n} more at the stones.`, "More at the stones."][this.calls++ % 3]! : "More at the stones.";
    this.say(KES, call, { player: KES_ID }, this.said.has("stones") ? "quip" : "key");
    this.said.add("stones");
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

  /**
   * The stand-ins for the player (tests and measurements). All three move a wisp the same way
   * (fetch), so what differs is only what they choose. "hold" brings each wisp straight to the
   * lamp. "heap" gathers what the docked boat still needs at the stones first, then pours it in.
   * "wary" heaps like that only while the patch is away: from the first sign of it, while it is
   * about, and for as long after as the docked lamp has light in it to lose, it brings everything
   * straight in. "spread" sets four down near the lamp but apart, and then pours them in.
   */
  private steer() {
    const g = this.game, R = RESCUE, c = g.board.center, lamp = this.lampAt();
    if (this.rng.next() < R.stand.sloppiness) return;
    const mine = g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id) && !this.taken.has(w.id) && !this.covers(w.pos));
    const stones = pt(c.x + R.stand.heapAt[0], c.y + R.stand.heapAt[1]), byLamp = pt(c.x + R.stand.byLamp[0], c.y + R.stand.byLamp[1]);
    const far = (w: Wisp, from: Pt) => Math.hypot(w.pos.x - from.x, w.pos.y - from.y);
    const nearest = (ws: Wisp[], from: Pt) => [...ws].sort((a, b) => far(a, from) - far(b, from))[0];
    const straightIn = () => {
      const w = nearest(mine.filter((o) => far(o, lamp) > R.lamp.take), lamp);
      if (w) this.fetch(w, byLamp);
    };
    // "wary" also keeps a lamp that has light in it fed, so that what it poured in a hurry is not left to gutter.
    if (this.stand === "hold" || (this.stand === "wary" && (this.patch || this.tell || (this.lampMode === "leaks" && this.fill[this.lifted]! > 0)))) return (this.heapIn = false), straightIn();
    if (this.stand === "bait" || this.stand === "badbait" || this.stand === "timed") {
      // The bait rule's three. "bait" pours a couple of pips early in each round, then sees to it
      // that the stones hold more than the lamp does (what waits in its light counted) by the time
      // it sets out, and pours on only what they still cover; when the boat can be filled before
      // the next visit arrives it pours everything. "badbait" leaves one too few on half the
      // visits. "timed" only minds the stones once the tell has begun.
      const B = R.patch.bait, docked = g.tick >= this.dockAt;
      const atStones = (w: Wisp) => far(w, stones) <= R.stand.heapR;
      const waiting = mine.filter((w) => far(w, lamp) <= R.lamp.take);
      const heaped = mine.filter((w) => atStones(w) && !waiting.includes(w));
      const keptThere = g.wisps.filter((w) => this.kept.has(w.id) && !g.away.has(w.id) && atStones(w)).length;
      const loose = mine.filter((w) => !heaped.includes(w) && !waiting.includes(w));
      const bright = (docked ? this.fill[this.lifted]! : 0) + waiting.length, have = heaped.length + keptThere;
      const over = (B.tie === "lamp" ? 1 : 0) - (this.stand === "badbait" && this.skimp ? 2 : 0);
      // When the next one arrives, as he would feel it from the rhythm, and how many the lamp can take by then.
      const setsOut = this.tell ? g.tick + this.tell.left : this.crossings === 0 ? g.tick + 60 : Math.max(this.toldAt + B.every, this.crossedAt + B.rest) + R.patch.clock.tell;
      // (With a few ticks in hand: the first of them has still to be brought.)
      const left = this.patch ? 0 : setsOut + 4 - g.tick, free = left - Math.max(0, this.sipAt - g.tick) - (waiting.length ? 1 : 4);
      const sips = B.sip ? (free > 0 ? Math.floor(free / B.sip) + 1 : 0) : 99;
      const toLift = R.perBoat - this.fill[this.lifted]!;
      const anyNear = (ws: Wisp[]) => nearest(ws, lamp);
      // The boat can lift before it comes: everything in, the nearest first.
      if (docked && toLift <= sips && waiting.length + loose.length + heaped.length >= toLift) {
        if (waiting.length >= toLift) return;
        const w = anyNear([...loose, ...heaped]);
        return w ? this.fetch(w, byLamp) : undefined;
      }
      // Otherwise, by where the rhythm is. Early: pour, up to `plan` pips (more only if the stones
      // already hold enough for it). From `prep` ticks before it sets out: the stones first, until
      // they hold more than the lamp, and then pour only what they still cover.
      const need = bright + over, prep = !this.patch && setsOut - g.tick <= (this.stand === "timed" ? R.patch.clock.tell : B.prep);
      const covered = have >= need + 1;
      if (prep && bright > 0 && have < need) return loose.length ? this.fetch(nearest(loose, stones)!, stones) : undefined;
      if (loose.length && (covered || (!prep && bright < B.plan))) return this.fetch(anyNear(loose)!, byLamp);
      if (heaped.length && have - 1 >= need + 1) return this.fetch(anyNear(heaped)!, byLamp);
      // Nothing to pour that the stones would cover: stock the stones for the next one.
      if (loose.length && bright > 0) return this.fetch(nearest(loose, stones)!, stones);
      return;
    }
    if (this.stand === "spread") {
      // Four near the lamp but apart, one to a spot, so that the patch sees singles; then all in.
      const spots = R.stand.spread.map(([x, y]) => pt(c.x + x, c.y + y));
      const at = new Map<Wisp, Pt>();
      for (const w of mine) {
        const s = spots.find((q) => cheb(q, w.pos) <= 1 && ![...at.values()].includes(q));
        if (s && far(w, lamp) > R.lamp.take) at.set(w, s);
      }
      const need = R.perBoat - this.fill[this.lifted]!;
      this.heapIn = at.size > 0 && (this.heapIn || at.size >= need);
      if (this.heapIn) return this.fetch(nearest([...at.keys()], lamp)!, byLamp);
      const free = spots.filter((q) => ![...at.values()].includes(q));
      const loose = mine.filter((w) => !at.has(w) && far(w, lamp) > R.lamp.take);
      if (!loose.length || !free.length) return;
      // The spot and the wisp nearest each other.
      let best: [Wisp, Pt] | null = null, bestD = Infinity;
      for (const w of loose) for (const q of free) if (far(w, q) < bestD) (bestD = far(w, q)), (best = [w, q]);
      return this.fetch(best![0], best![1]);
    }
    const heaped = mine.filter((w) => far(w, stones) <= R.stand.heapR && far(w, lamp) > R.lamp.take);
    const need = this.lampMode === "leaks" ? R.perBoat - this.fill[this.lifted]! : Math.min(R.heapOf, (R.boats - this.lifted) * R.perBoat - this.fill[this.lifted]!);
    this.heapIn = heaped.length > 0 && (this.heapIn || heaped.length >= need);
    if (this.heapIn) return this.fetch(nearest(heaped, lamp)!, byLamp);
    const loose = nearest(mine.filter((w) => !heaped.includes(w) && far(w, lamp) > R.lamp.take), stones);
    if (loose) this.fetch(loose, stones);
  }

  /** No pool on the straight line between two tiles: a pull over water stops at the edge. */
  private dry(a: Pt, b: Pt) {
    const c = this.game.board.center, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let k = 0; k <= n; k++) if (loPool(Math.round(a.x + ((b.x - a.x) * k) / n) - c.x, Math.round(a.y + ((b.y - a.y) * k) / n) - c.y)) return false;
    return true;
  }

  /**
   * A stand-in brings a wisp toward `home`: it pulls from the tile nearest home that the wisp can
   * be pulled from, and falls back toward home as the wisp comes. If the wisp does not move (a
   * lamp post or a pool's end is in its way) it gives that tile up and pulls from the next.
   */
  private fetch(w: Wisp, home: Pt) {
    const g = this.game, b = g.board, me = this.player(YOU), F = this.fetching;
    if (F.id !== w.id || cheb(F.from, w.pos) > 2) (F.id = w.id), (F.from = w.pos), (F.bad = new Set());
    const key = (s: Pt) => s.x * 1000 + s.y;
    // Any tile the wisp can be pulled from and would move toward: the one nearest home.
    const R = PULL_REACH - 1, dHome = (s: Pt) => Math.hypot(s.x - home.x, s.y - home.y);
    let at: Pt | null = null, best = dHome(w.pos) - 0.5;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const q = pt(w.pos.x + dx, w.pos.y + dy), d = dHome(q);
        if (d >= best || (Math.max(Math.abs(dx), Math.abs(dy)) < 2 && d > 0) || F.bad.has(key(q))) continue;
        if (!b.inside(q) || !b.passable(q, Mover.Walker) || !b.canSee(q, w.pos) || !this.dry(q, w.pos)) continue;
        (best = d), (at = q);
      }
    if (!at) return;
    if (!samePt(me.pos, at)) {
      F.still = 0;
      if (!(me.action.kind === "walk" && samePt(me.action.to, at))) g.command(YOU, { action: { kind: "walk", to: at } });
      return;
    }
    if (samePt(F.last, w.pos)) {
      if (++F.still >= 3) (F.still = 0), F.bad.add(key(at));
    } else F.still = 0;
    F.last = w.pos;
    if (me.action.kind === "staff" && me.action.wisp === w.id && me.mode === "pull") return;
    g.command(YOU, { action: { kind: "staff", wisp: w.id }, ...(me.mode !== "pull" ? { toggleMode: true } : {}) });
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

  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, kind: "key" | "quip" = how.talk ? "key" : "quip", land = 0) {
    const line = { who, text, ...how };
    if (this.phase !== "playing") {
      this.shown(line, this.clockTicks + this.lines.reduce((n, l) => n + lineTicks(l), 0));
      return void this.lines.push(line);
    }
    this.queue.push({ line, trigger: this.game.tick, key: kind === "key", land });
    this.due();
  }

  private due() {
    const now = this.game.tick;
    while (this.queue.length && now >= this.busyUntil) {
      // Under the patch Kes is not heard: her lines wait until she is out, and others go ahead of them.
      const i = this.kesDark ? this.queue.findIndex((o) => o.line.player !== KES_ID) : 0;
      if (i < 0) break;
      const q = this.queue[i]!;
      // A still too soon after the last: its line still plays, as a bubble, without the picture.
      if (q.line.still && !this.stillReady()) delete q.line.still;
      this.queue.splice(i, 1);
      if (!q.key && now - q.trigger > 4) continue;
      this.shown(q.line);
      if (q.land) this.captions.push({ text: q.line.text, until: now + q.land });
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
        lamp: {
          x: this.lampAt().x, y: this.lampAt().y, take: RESCUE.lamp.take, ...(this.lampDark() ? { dark: true } : {}),
          ...(this.leaks() && this.endingAt < 0 && this.goesAt - this.game.tick <= RESCUE.lamp.flicker && this.fill[this.lifted] ? { gutter: Math.max(0, this.goesAt - this.game.tick) } : {}),
          ...(this.game.tick - this.wentAt <= 3 ? { went: this.wentAt } : {}),
          ...(this.onBoat && this.patch ? { sat: true } : {}),
          ...(this.game.tick - this.offBoatAt <= 12 ? { cold: this.game.tick - this.offBoatAt } : {}),
          ...(this.patchAim === "bait" && this.sipAt > this.game.tick && this.sipOf > 0 && this.endingAt < 0 ? { sip: { left: this.sipAt - this.game.tick, of: this.sipOf, n: this.waiting().length } } : {}),
        },
        left: (RESCUE.boats - this.lifted) * RESCUE.perBoat - (this.fill[this.lifted] ?? 0),
        reach: RESCUE.cloud.landing,
        from: RESCUE.cloud.start,
        ...(this.kesMode === "supply" ? { drop: { x: this.game.board.center.x + RESCUE.drop.at[0], y: this.game.board.center.y + RESCUE.drop.at[1], r: RESCUE.drop.r } } : {}),
        ...(this.ticks - this.flaredAt <= 2 ? { flare: this.flaredAt } : {}),
        ...(this.flew.some((o) => this.ticks - o.tick <= 2) ? { flew: this.flew.filter((o) => this.ticks - o.tick <= 2) } : {}),
        ...(this.phase === "playing" && this.captions.some((k) => this.ticks < k.until) ? { caption: this.captions.filter((k) => this.ticks < k.until).map((k) => k.text) } : {}),
        ...(this.holdLeft > 0 ? { hold: { id: RESCUE.hold.id, left: this.holdLeft, of: RESCUE.hold.ticks, line: "Rook. What is that." } } : {}),
        ...(this.tell ? { tell: { left: this.tell.left, of: RESCUE.patch.clock.tell, n: this.tell.k + 1, ...(this.target ? { to: { x: this.target.x, y: this.target.row, n: this.target.n, kind: this.target.kind } } : {}) } } : {}),
        ...(this.kept.size ? { kept: [...this.kept] } : {}),
        ...(p ? { patch: { x: p.x, y: p.y, dx: p.dx, dy: p.dy, r: p.r, warn: Math.max(0, p.warn), n: p.n, ...(this.patchMode === "drag" ? { drag: true } : {}), ...(p.big ? { big: p.big } : {}), ...(p.sit ? { sit: true } : {}) } } : {}),
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
    return { phase: this.phase, game: this.game, end: this.end, said: this.said, fill: this.fill, lifted: this.lifted, patch: this.patch, crossings: this.crossings, taken: this.taken, kesDark: this.kesDark, pools: LO_POOLS, banked: this.bankedN, setDown: this.setDown, hers: this.hers, holdLeft: this.holdLeft, tell: this.tell, target: this.target, kept: this.kept, spare: this.spare, onBoat: this.onBoat };
  }
}

type Pending = { line: StoryLine; trigger: number; key: boolean; land: number };

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
