// Story runs 6 and 7, the night the island goes down, played in the page as one piece with no
// break. Run 6: Rook alone at night, feeding a flame that drains faster than anyone can bank. As it
// falls the island settles into the cloud sea: pale cloud comes in from the rim in steps, each with
// a lurch, and a wisp it covers fades and is lost. A bank pushes it back a tile. It cannot be won.
// Then the bottom, scripted: the cloud closes round the brazier and over Rook, the sounds go one by
// one, and everything is lit orange from above. Three held pictures of Hesta landing; then run 7 on
// the same ground with her crater in it: the cloud thrown back to the rim, the wisps it took last
// held on her earth line, every bank lifting the island. The rules are the light law in game.ts,
// the numbers DYING (src/engine/dying.ts), the brief project files gameplay/runs6-7-rework-brief.md.

import { Mover, Tile, pt, type Pt } from "../engine/board.js";
import { botCommand } from "../engine/bot.js";
import { DYING, bankLine } from "../engine/dying.js";
import { compass, neglected } from "../engine/kindling.js";
import { Game, Grip, Rng, TICK_MS, lightRadius, type Action, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, HESTA_ID = 2;
const ROOK = "Rook", HESTA = "Hesta", LUMI = "Lumi";

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "juggle" | "hold" | "idle";
/** Where the piece is: run 6, its bottom, the three stills, run 7, the hold after the last bank, the last picture, the village gathering. */
export type Part = NonNullable<StoryView["dying"]>["part"];

export class DyingRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
  /** Ticks added before run 6's first countdown: the board is asked for this long before the alarm's last shot ends, so it is built under the picture. */
  lead = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  private part: Part = "six";
  /** The tick (of the game in play) the part began. */
  private since = 0;
  private said = new Set<string>();
  private queue: Pending[] = [];
  private busyUntil = 0;
  /** Run 7: the tick Rook's staff was last on each wisp, so her hold doesn't snatch one back from him. */
  private touchedAt = new Map<number, number>();
  /** Run 6: the side the wisps are coming from (radians).  */
  private side = 0;
  private lastHold = -99;
  private faltered = false;
  /** The cloud: how many steps in it has come, how far banks are holding it back and since when, and how many times the ground has lurched. */
  private cloudStep = 0;
  private push = 0;
  private pushAt = 0;
  private lurch = 0;
  /** Run 6: when Rook's staff was last on each wisp (Lumi's calls), when she last called, and where and when each wisp was lost. */
  private lastTouch = new Map<number, number>();
  private lastCall = -99;
  private lostAt: { tick: number; pos: Pt }[] = [];
  /** What Ladi ruled, each on a switch (DYING.switches); tests and the page can turn them. */
  switches: { cloudOverRook: boolean; lineGivesBack: boolean; lumiCalls: boolean; crowdSound: boolean; cometOnMap: boolean; crowdShown: boolean } = { ...DYING.switches };
  /** How many wisps her line gave back at the landing: for the measurements. */
  gaveBack = 0;
  get lost6() {
    return this.lostAt.length;
  }
  /** How many ticks run 6 lasted, the flame at each of its ticks, and run 7's length and wisps lost after the falter: for the measurements. */
  lasted = 0;
  curve: number[] = [];
  sevenTicks = 0;
  lostLate = 0;
  lostSeven = 0;

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
        if (this.phase !== "playing" || this.part === "stills" || this.part === "risen" || this.card > 0) return;
        // Under the cloud he can walk, and has nothing to put his staff on.
        if (this.blind() && (msg.action as { kind?: string } | undefined)?.kind === "staff") return;
        this.game.command(YOU, { action: cleanAction(msg.action, this.game), toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    this.said = new Set();
    this.queue = [];
    this.busyUntil = 0;
    this.lines = [];
    this.curve = [];
    this.lasted = this.sevenTicks = this.lostLate = this.lostSeven = this.gaveBack = 0;
    this.faltered = false;
    this.card = 0;
    this.cloudStep = this.push = this.pushAt = this.lurch = 0;
    this.lastTouch = new Map();
    this.lastCall = -99;
    this.lostAt = [];
    this.endClock();
    this.startSix();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  // ---------------------------------------------------------------- run 6

  private startSix() {
    const S = DYING.six;
    const g = (this.game = new Game(shrineById(DYING.shrine), [{ id: YOU, guild: 0 as Guild, name: ROOK }], this.seed(), [S.wisps, 0], 100000));
    g.waterLawHere = true;
    g.flame = S.flame;
    g.flameFeed = S.feed;
    g.dimTicks = S.dimTicks;
    g.outPause = S.outPause;
    g.respawnPause = 1;
    g.cloudAt = this.cloud();
    this.side = this.rng.next() * Math.PI * 2;
    g.onReturn = (w) => {
      this.side += (this.rng.next() - 0.5) * 2 * S.arcDrift;
      // From where the cloud stands of itself: a bank that pushes it back does not push the wisps out with it.
      const edge = this.cloud() - this.push;
      this.arrive(w, edge + S.arrive[0], edge + S.arrive[1], this.side, S.arc);
      this.lastTouch.set(w.id, g.tick);
    };
    for (const w of g.wisps) g.onReturn(w);
    // Rook alone, by the fire, on the side away from Hesta's terrace.
    const rook = this.player(YOU);
    rook.pos = rook.prev = g.nearestFree(pt(g.board.center.x, g.board.center.y + 4), 0);
    this.part = "six";
    this.since = 0;
    this.phase = "countdown";
    const before = this.lines.length;
    this.say(HESTA, "It's low, Rook. Feed it. Nearest first.", { talk: true });
    this.countdown = DYING.bellTicks + this.lead + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.flush();
    this.broadcastTick();
  }

  /** Where the cloud's edge is in run 6: in by a step for each fall of the flame, back a little for his banks. */
  private cloud() {
    const C = DYING.cloud;
    return C.start - C.stepIn * this.cloudStep + this.push;
  }

  /** The cloud is over Rook: the bottom, once it has closed. */
  private blind() {
    return this.switches.cloudOverRook && this.part === "bottom" && this.game.tick - this.since >= DYING.bottom.blindAt;
  }

  private stepSix() {
    const g = this.game, S = DYING.six, C = DYING.cloud;
    const t = g.tick + 1;
    // The drain grows every tick, until it outruns anything a player can bank. A weak run is held just above embers until the run has had its length.
    g.flameDrain = t <= S.calmTicks ? S.calmDrain : S.drain + S.drainGrow * t;
    g.flameFloor = t < S.minTicks ? S.embersAt + 0.5 : 0;
    if (this.stand) this.steer();
    const rook = this.player(YOU);
    if (rook.action.kind === "staff" && g.inReach(rook, g.wisps[rook.action.wisp]!)) this.lastTouch.set(rook.action.wisp, g.tick);
    g.cloudAt = this.cloud();
    const was = g.wisps.map((w) => w.pos);
    g.step();
    this.curve.push(g.flame!);
    for (const o of g.outs) this.lostAt.push({ tick: g.tick, pos: was[o.wisp]! });
    // Each fall of the flame past a mark: the ground lurches and the cloud comes in. It never goes back out.
    while (this.cloudStep < C.stepsAt.length && g.flame! < C.stepsAt[this.cloudStep]!) (this.cloudStep++, this.lurch++);
    // Each bank flares and pushes it back, for a while.
    if (g.banks.length) {
      this.push = Math.min(C.pushMax, this.push + C.push * g.banks.length);
      this.pushAt = g.tick;
    } else if (this.push > 0 && g.tick - this.pushAt >= C.pushHold) {
      this.push = Math.max(0, this.push - C.push);
      this.pushAt = g.tick;
    }
    // Her voice, from the terrace: three calls and a broken one, then nothing however long he lasts.
    if (g.banks.length && !this.said.has("flare")) (this.said.add("flare"), this.say(HESTA, "That's it. Keep it breathing."));
    if (g.tick === S.leaveFarAt) this.say(HESTA, "Leave the far ones, Rook. Hold what's near.", {}, "key");
    if (g.tick === S.cutOffAt) this.say(HESTA, "North one. Then the...", {}, "key");
    if (this.switches.lumiCalls) this.lumiCalls();
    if ((g.flame! <= S.embersAt && g.tick >= S.minTicks) || g.tick >= S.maxTicks) {
      this.lasted = g.tick;
      this.part = "bottom";
      this.since = g.tick;
      this.queue = [];
      // However he did: the last lurch, the flame falls to embers, the cloud closes, and nothing more is lost or flares.
      this.lurch++;
      g.flameFloor = 0;
      g.flameFeed = 0;
      g.dimTicks = 0;
      g.cloudAt = DYING.bottom.radius;
      g.flameDrain = Math.max(0, g.flame! - DYING.bottom.level) / DYING.bottom.fall;
    }
  }

  /** The switch: Lumi calls in Hesta's place, with her own calls from the Kindling, for the wisp he has left longest. */
  private lumiCalls() {
    const g = this.game, L = DYING.lumi;
    if (g.tick < DYING.six.cutOffAt + L.after || g.tick - this.lastCall < L.every || this.talking()) return;
    const w = neglected(g, YOU, this.lastTouch, L.neglect, (id) => g.away.has(id));
    if (!w) return;
    const dir = compass(g.board, w.pos);
    this.lastCall = g.tick;
    this.lastTouch.set(w.id, g.tick);
    this.say(LUMI, `Dad. ${dir[0]!.toUpperCase()}${dir.slice(1)} one.`, { wisp: w.id });
  }

  private stepBottom() {
    const g = this.game, B = DYING.bottom;
    const n = g.tick - this.since;
    if (n >= B.fall) g.flameDrain = 0;
    const rook = this.player(YOU);
    if (this.blind()) {
      if (rook.action.kind === "staff") g.command(YOU, { action: { kind: "idle" } });
    } else if (this.stand) this.steer();
    g.step();
    this.curve.push(g.flame!);
    // Nobody speaks. He can still move. Then the pictures.
    if (g.tick - this.since >= B.ticks) {
      this.part = "stills";
      this.since = g.tick;
      this.stillTick = 0;
    }
  }

  // ---------------------------------------------------------------- the landing

  private stillTick = 0;
  /** Three held pictures: nothing on the board moves. Then the board, with her standing in the glass. */
  private stepStills() {
    const T = DYING.landingShow;
    if (!this.switches.cometOnMap) {
      if (++this.stillTick >= DYING.stills.ticks) this.strike();
      return;
    }
    // Faces, then the comet on the map; at the strike her picture comes up over the new board.
    if (++this.stillTick >= T.faces + T.comet) (this.strike(), (this.card = T.hesta));
  }
  /** Ticks her picture still covers the new board, which waits under it. */
  private card = 0;
  /** What picture is up, if any, and for how many ticks in all. */
  private picture(): { still: number; stillTicks: number } | { comet: number } | null {
    const T = DYING.landingShow;
    if (this.card > 0) return { still: 2, stillTicks: T.hesta };
    if (this.part !== "stills") return null;
    if (!this.switches.cometOnMap) return { still: Math.min(2, Math.floor((this.stillTick * 3) / DYING.stills.ticks)), stillTicks: Math.ceil(DYING.stills.ticks / 3) };
    if (this.stillTick < T.faces) return { still: 0, stillTicks: T.faces };
    return { comet: this.stillTick - T.faces };
  }

  /** The comet lands: the same ground with the crater in it, Rook and the wisps put clear of it, Hesta standing in the glass. */
  private strike() {
    const old = this.game, S = DYING.seven, L = DYING.landing;
    const shrine = shrineById(DYING.craterShrine);
    // The wisps on the board are not lost in the landing. And the ones the cloud took last are still there, on her line: most, not all.
    const kept = old.wisps.filter((w) => !old.away.has(w.id)).map((w) => w.pos);
    const back = this.switches.lineGivesBack ? this.lostAt.filter((o) => o.tick > this.lasted - DYING.giveBack).map((o) => o.pos) : [];
    this.gaveBack = back.length;
    const count = Math.min(12, Math.max(S.wisps, kept.length + back.length));
    const g = (this.game = new Game(
      shrine,
      [
        { id: YOU, guild: 0 as Guild, name: ROOK },
        { id: HESTA_ID, guild: 0 as Guild, name: HESTA },
      ],
      this.seed(),
      [count, 0],
      100000,
    ));
    g.waterLawHere = true;
    g.flame = S.flame;
    g.flameFeed = S.feed;
    g.dimTicks = 0; // nothing dims until she has landed and can hold
    g.rootedLit = true;
    g.slideHome = true;
    g.respawnPause = 1;
    const c = g.board.center, at = pt(c.x + L.at[0], c.y + L.at[1]);
    // Pushed back from the blast, unharmed: straight out from the strike to the nearest free ground.
    const clear = (p: Pt, who: Mover) => {
      const d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d >= L.blast && g.board.tile(p) !== Tile.Rime) return p;
      const a = d > 0.01 ? Math.atan2(p.y - at.y, p.x - at.x) : Math.PI / 2;
      for (let r = L.blast; r < L.blast + 8; r += 0.5) {
        const q = pt(Math.round(at.x + Math.cos(a) * r), Math.round(at.y + Math.sin(a) * r));
        if (g.board.inside(q) && g.board.passable(q, who) && g.board.tile(q) !== Tile.Rime && !g.board.inBankZone(q)) return q;
      }
      return g.nearestFree(pt(c.x, c.y + 5), 0);
    };
    const rook = this.player(YOU), was = old.players.find((p) => p.id === YOU)!;
    rook.pos = rook.prev = clear(was.pos, Mover.Walker);
    rook.run = was.run;
    rook.mode = was.mode;
    const hesta = this.player(HESTA_ID);
    hesta.pos = hesta.prev = at;
    g.onReturn = (w) => this.arriveSeven(w);
    const here = [...kept, ...back];
    const taken = new Set<string>();
    g.wisps.forEach((w, i) => {
      const from = here[i];
      if (!from) return this.arriveSeven(w);
      let p = clear(from, Mover.Wisp);
      if (taken.has(`${p.x},${p.y}`) || g.board.tile(p) !== Tile.Floor) p = g.nearestFree(p, 1) ?? p;
      taken.add(`${p.x},${p.y}`);
      moveWisp(w, p);
      // Held on her earth line from the first moment, wherever the cloud had them.
      if (this.switches.lineGivesBack) g.rooted.set(w.id, HESTA_ID);
    });
    this.part = "seven";
    this.since = 0;
    this.queue = [];
    this.busyUntil = 0;
    this.touchedAt = new Map();
    this.lastHold = -99;
    this.faltered = false;
  }

  // ---------------------------------------------------------------- run 7

  /** Banks still needed for a full fire. */
  private needed() {
    return Math.max(0, Math.ceil((100 - this.game.flame!) / DYING.seven.feed));
  }

  /** A wisp comes onto the board in run 7: far out, or nearer once she has faltered; none once the fire needs no more. */
  private arriveSeven(w: Wisp) {
    const g = this.game, S = DYING.seven;
    const others = g.wisps.filter((o) => o !== w && !g.away.has(o.id)).length;
    if (others >= Math.min(S.wisps, this.needed())) return void g.away.set(w.id, 1e9);
    const band = this.faltered ? S.nearBand : S.band;
    this.arrive(w, band[0], band[1]);
  }

  private stepSeven() {
    const g = this.game, S = DYING.seven;
    const rook = this.player(YOU);
    if (this.stand) this.steer();
    // When Rook takes hold of a wisp she is holding, her line lets go.
    if (rook.action.kind === "staff") {
      const w = g.wisps[rook.action.wisp]!;
      if (g.inReach(rook, w)) {
        this.touchedAt.set(w.id, g.tick);
        if (g.rooted.delete(w.id)) g.dark.delete(w.id);
      }
    }
    const lit = lightRadius(g.flame!), c = g.board.center;
    const far = (w: Wisp) => Math.hypot(w.pos.x - c.x, w.pos.y - c.y) > lit;
    if (!this.faltered && g.tick === DYING.landing.line + 3) g.dimTicks = S.dimTicks;
    // Not before she has said her piece on landing.
    if (!this.faltered && g.tick >= DYING.landing.line + 3 && g.tick - this.lastHold >= S.holdEvery && g.rooted.size < S.holds) {
      // She holds the far ones, the nearest to going out first. She never fetches.
      const w = g.wisps
        .filter((o) => !g.away.has(o.id) && !g.rooted.has(o.id) && far(o) && g.tick - (this.touchedAt.get(o.id) ?? -99) > 3)
        .sort((a, b) => (g.dark.get(b.id) ?? 0) - (g.dark.get(a.id) ?? 0))[0];
      if (w) {
        g.rooted.set(w.id, HESTA_ID);
        this.lastHold = g.tick;
      }
    }
    if (!this.faltered && !this.said.has("hold") && g.rooted.size && g.tick >= DYING.landing.line + 4) {
      this.said.add("hold");
      this.say(HESTA, "I'll hold them. You fetch.", { player: HESTA_ID }, "key");
    }
    const before = g.scores[0]!;
    g.step();
    this.sevenTicks = g.tick;
    if (g.outs.length) {
      this.lostSeven += g.outs.length;
      if (this.faltered) this.lostLate += g.outs.length;
    }
    if (g.tick === DYING.landing.line) this.say(HESTA, "Budge up, Rook.", { player: HESTA_ID }, "key");
    // The first sound from the crowd: two children, one on top of the other.
    if (g.tick === DYING.landing.line + 3) this.lines.push({ who: "Nell", text: "Granny!" });
    if (g.tick === DYING.landing.line + 4) this.lines.push({ who: "Sefa", text: "Granny!" });
    if (this.lasted >= S.warmAfter && g.tick === DYING.landing.line + 8) this.say(HESTA, "Still warm, this. Somebody taught you well.", { player: HESTA_ID }, "key");
    if (!this.said.has("glass") && g.wisps.some((w) => !g.away.has(w.id) && g.board.tile(w.pos) === Tile.Rime)) {
      this.said.add("glass");
      this.say(HESTA, "Let go at the glass. It knows the way.", { player: HESTA_ID }, "key");
    }
    // The falter, whatever he does: her line flickers, she lets go, and covers it at once. The rest are his.
    if (!this.faltered && g.flame! >= S.falterAt && g.flame! < 100) {
      this.faltered = true;
      g.rooted.clear();
      g.dimTicks = S.falterDim;
      g.dark.clear();
      this.say(HESTA, "That one's yours, Rook. At my age?", { player: HESTA_ID }, "key");
    }
    // Each bank lifts the island, and she says what that one did. The first and the stars must land; the rest may be lost under another line.
    if (g.flame! < 100)
      for (let n = before + 1; n <= g.scores[0]!; n++) {
        const which = bankLine(n);
        if (which) this.say(HESTA, S.bank[which], { player: HESTA_ID }, which === "first" || which === "stars" ? "key" : "quip");
      }
    if (g.flame! >= 100 && g.scores[0]! > before) {
      this.part = "lifted";
      this.since = g.tick;
      g.dimTicks = 0;
      g.rooted.clear();
      this.say(HESTA, "There. That'll hold.", { player: HESTA_ID }, "key");
    }
  }

  /** After the last bank: a short hold on the board with the crowd moving, the picture, then the village round her and Lumi out to Rook. */
  private stepEnd() {
    const g = this.game, S = DYING.seven;
    if (this.part === "lifted") {
      g.step();
      if (g.tick - this.since >= S.hold) (this.part = "risen"), (this.stillTick = 0);
    } else if (this.part === "risen") {
      if (++this.stillTick >= DYING.risen.ticks) (this.part = "after"), (this.since = g.tick), (this.queue = []);
    } else {
      g.step();
      if (g.tick - this.since === S.gather) {
        this.say(LUMI, "Nine seconds from the terrace. I counted.", {}, "key");
        this.say(HESTA, "Slow. I used to be quick.", { player: HESTA_ID }, "key");
      }
      if (g.tick - this.since > S.gather + 2 && !this.talking()) this.finish();
    }
  }

  // ---------------------------------------------------------------- shared

  /** Puts a wisp down between two distances from the brazier, on open ground that isn't glass. */
  private arrive(w: Wisp, from: number, to: number, mid = 0, arc = Math.PI * 2) {
    const g = this.game, b = g.board, c = b.center;
    const taken = new Set(g.wisps.filter((o) => o !== w && !g.away.has(o.id)).map((o) => `${o.pos.x},${o.pos.y}`));
    for (let n = 0; n < 60; n++) {
      const a = mid + (this.rng.next() - 0.5) * arc, r = from + this.rng.next() * Math.max(0, to - from);
      const p = pt(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r));
      if (!b.inside(p) || !b.passable(p, Mover.Wisp) || b.tile(p) !== Tile.Floor || b.inBankZone(p) || taken.has(`${p.x},${p.y}`)) continue;
      return moveWisp(w, p);
    }
    // No such ground (a tiny light): wherever the board would have put it.
  }

  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) this.phase = "playing";
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing") return;
    if (this.part === "six") this.stepSix();
    else if (this.part === "bottom") this.stepBottom();
    else if (this.part === "stills") this.stepStills();
    else if (this.card > 0) this.card--;
    else if (this.part === "seven") this.stepSeven();
    else this.stepEnd();
    if (this.phase === "playing") this.due();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private steer() {
    if (this.stand === "idle") return;
    const cmd = botCommand(this.game, YOU, STAND[this.stand!], () => this.rng.next());
    if (cmd) this.game.command(YOU, cmd);
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    // No score, no summary, and nothing that says how run 6 went.
    this.end = { banked: 0, kes: 0, summary: "\u00a0", lines: [] };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  /** A line: talk in the dialog box before play, a bubble in play, one at a time; a "key" line always plays. */
  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, kind: "key" | "quip" = how.talk ? "key" : "quip") {
    const line = { who, text, ...how };
    if (this.phase !== "playing") return void this.lines.push(line);
    this.queue.push({ line, trigger: this.game.tick, key: kind === "key" });
    this.due();
  }

  private talking() {
    return this.queue.length > 0 || this.game.tick < this.busyUntil;
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
    const L = DYING.landing, c = this.game.board.center;
    const after = this.after(), B = DYING.bottom, g = this.game;
    const n = g.tick - this.since;
    const low = this.part === "bottom";
    return {
      run: DYING.run,
      movement: after ? 1 : 0,
      title: "",
      ring: null,
      mark: null,
      kes: 0,
      rival: null,
      note: "",
      end: this.end,
      dying: {
        part: this.part,
        strike: { x: c.x + L.at[0], y: c.y + L.at[1], r: L.radius },
        lurch: this.lurch + (after ? g.scores[0]! : 0),
        ...(after ? { lift: g.scores[0]!, lifts: Math.ceil((100 - DYING.seven.flame) / DYING.seven.feed) } : { cloud: low || this.part === "stills" ? B.radius : this.cloud() }),
        fire: this.part === "six" || (low && n < B.fireOff) || after,
        bell: this.part === "six" || (low && n < B.bellOff),
        great: this.part === "six" || (low && n < B.greatOff),
        ...(this.blind() || this.part === "stills" ? { blind: true } : {}),
        ...((low && n >= B.orange) || this.part === "stills" ? { orange: true } : {}),
        ...(this.picture() ?? {}),
        ...(this.switches.crowdShown ? { crowd: true } : {}),
        ...(this.faltered ? { faltered: true } : {}),
        ...(after ? { hesta: HESTA_ID } : {}),
      },
    };
  }

  /** She has landed: the crater's board, with her on it. */
  private after() {
    return this.part !== "six" && this.part !== "bottom" && this.part !== "stills";
  }

  view(): RoomView {
    const after = this.after();
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: after ? DYING.craterShrine : DYING.shrine,
      teams: 2,
      players: [
        { id: YOU, name: ROOK, guild: 0, flame: "amber", connected: true, bot: false },
        ...(after ? [{ id: HESTA_ID, name: HESTA, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: true }] : []),
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
    return { phase: this.phase, part: this.part, game: this.game, end: this.end, said: this.said, faltered: this.faltered, cloud: this.cloud(), lurch: this.lurch };
  }
}

/** The stand-ins for the player: one that taps the wisps in turn, and a careful hand that holds one at a time. */
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
    if (Number.isInteger(x) && Number.isInteger(y) && game.board.inside(pt(x as number, y as number))) return { kind: "walk", to: { x: x as number, y: y as number } };
  }
  return undefined;
}
