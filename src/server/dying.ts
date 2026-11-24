// Story runs 6 and 7, the dying brazier and Hesta's landing, played in the page as one piece with
// no break. Run 6: Rook alone at night, feeding a flame that drains faster than anyone can bank;
// wisps outside its light dim and go out; it cannot be won. Then embers and silence, Hesta lands
// like a comet beside the brazier, and run 7 follows on the same ground: her earth line holds the
// far wisps lit, the glass of her crater carries a wisp home, and Rook fetches. The rules are the
// light law in game.ts, the numbers DYING (src/engine/dying.ts), the brief project files
// gameplay/runs6-7-prototype-brief.md, the lines story/runs6-7-lines.md (placeholders).

import { Mover, Tile, pt, type Pt } from "../engine/board.js";
import { botCommand } from "../engine/bot.js";
import { DYING } from "../engine/dying.js";
import { Game, Grip, Rng, TICK_MS, lightRadius, type Action, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, HESTA_ID = 2;
const ROOK = "Rook", HESTA = "Hesta";

/** How a stand-in for the player plays, in tests and measurements. */
export type Stand = "juggle" | "hold" | "idle";
/** Where the piece is: run 6, its embers, the comet in the air, run 7, the fire roaring. */
export type Part = "six" | "embers" | "landing" | "seven" | "roar";

export class DyingRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
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
    this.queue = [];
    this.busyUntil = 0;
    this.lines = [];
    this.curve = [];
    this.lasted = this.sevenTicks = this.lostLate = this.lostSeven = 0;
    this.faltered = false;
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
    g.respawnPause = 1;
    this.side = this.rng.next() * Math.PI * 2;
    g.onReturn = (w) => {
      this.side += (this.rng.next() - 0.5) * 2 * S.arcDrift;
      this.arrive(w, lightRadius(g.flame!) * S.arrive[0], lightRadius(g.flame!) + S.arrive[1], this.side, S.arc);
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
    this.countdown = DYING.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.flush();
    this.broadcastTick();
  }

  private stepSix() {
    const g = this.game, S = DYING.six;
    const t = g.tick + 1;
    // The drain grows every tick, until it outruns anything a player can bank. A weak run is held just above embers until the run has had its length.
    g.flameDrain = S.drain + S.drainGrow * t;
    g.flameFloor = t < S.minTicks ? S.embersAt + 0.5 : 0;
    if (this.stand) this.steer();
    g.step();
    this.curve.push(g.flame!);
    // Her voice, from the terrace: three calls and a broken one, then nothing however long he lasts.
    if (g.banks.length && !this.said.has("flare")) (this.said.add("flare"), this.say(HESTA, "That's it. Keep it breathing."));
    if (g.tick === S.leaveFarAt) this.say(HESTA, "Leave the far ones, Rook. Hold what's near.", {}, "key");
    if (g.tick === S.cutOffAt) this.say(HESTA, "North one. Then the...", {}, "key");
    if ((g.flame! <= S.embersAt && g.tick >= S.minTicks) || g.tick >= S.maxTicks) {
      this.lasted = g.tick;
      this.part = "embers";
      this.since = g.tick;
      this.queue = [];
      // However he did: the flame falls to embers, and nothing more goes out or flares.
      g.flameFloor = 0;
      g.flameFeed = 0;
      g.dimTicks = 0;
      g.flameDrain = Math.max(0, g.flame! - DYING.embers.level) / DYING.embers.fall;
    }
  }

  private stepEmbers() {
    const g = this.game, E = DYING.embers;
    if (g.tick - this.since >= E.fall) g.flameDrain = 0;
    if (this.stand) this.steer();
    g.step();
    this.curve.push(g.flame!);
    // Nothing happens. Rook can still move. Then the comet.
    if (g.tick - this.since >= E.fall + E.silence) {
      this.part = "landing";
      this.since = g.tick;
    }
  }

  // ---------------------------------------------------------------- the landing

  private stepLanding() {
    const g = this.game;
    if (this.stand) this.steer();
    g.step();
    if (g.tick - this.since >= DYING.landing.streak) this.strike();
  }

  /** The comet lands: the same ground with the crater in it, Rook and the wisps put clear of it, Hesta standing in the glass. */
  private strike() {
    const old = this.game, S = DYING.seven, L = DYING.landing;
    const shrine = shrineById(DYING.craterShrine);
    const g = (this.game = new Game(
      shrine,
      [
        { id: YOU, guild: 0 as Guild, name: ROOK },
        { id: HESTA_ID, guild: 0 as Guild, name: HESTA },
      ],
      this.seed(),
      [S.wisps, 0],
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
    // The wisps on the board are not lost in the landing; the rest arrive far out.
    const kept = old.wisps.filter((w) => !old.away.has(w.id));
    g.onReturn = (w) => this.arriveSeven(w);
    g.wisps.forEach((w, i) => {
      const k = kept[i];
      if (k) moveWisp(w, clear(k.pos, Mover.Wisp));
      else this.arriveSeven(w);
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
    if (others >= this.needed()) return void g.away.set(w.id, 1e9);
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
        if (!this.said.has("hold")) {
          this.said.add("hold");
          this.say(HESTA, "I'll hold them. You fetch.", { player: HESTA_ID }, "key");
          this.say(HESTA, "My hands, your legs.", { player: HESTA_ID }, "key");
        }
      }
    }
    const before = g.scores[0]!;
    g.step();
    this.sevenTicks = g.tick;
    if (g.outs.length) {
      this.lostSeven += g.outs.length;
      if (this.faltered) this.lostLate += g.outs.length;
    }
    if (g.tick === DYING.landing.line) this.say(HESTA, "Budge up, Rook.", { player: HESTA_ID }, "key");
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
    if (g.flame! >= 100 && g.scores[0]! > before) {
      this.part = "roar";
      this.since = g.tick;
      g.dimTicks = 0;
      g.rooted.clear();
      this.say(HESTA, "There. That'll hold.", { player: HESTA_ID }, "key");
    }
  }

  private stepRoar() {
    const g = this.game;
    g.step();
    if (g.tick - this.since >= DYING.seven.roar && !this.talking()) this.finish();
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
    else if (this.part === "embers") this.stepEmbers();
    else if (this.part === "landing") this.stepLanding();
    else if (this.part === "seven") this.stepSeven();
    else this.stepRoar();
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
    // No score, and nothing that says how run 6 went.
    this.end = { banked: 0, kes: 0, summary: "The fire holds.", lines: [] };
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
    const after = this.part === "seven" || this.part === "roar";
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
        ...(this.faltered ? { faltered: true } : {}),
        ...(after ? { hesta: HESTA_ID } : {}),
      },
    };
  }

  view(): RoomView {
    const after = this.part === "seven" || this.part === "roar";
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
    return { phase: this.phase, part: this.part, game: this.game, end: this.end, said: this.said, faltered: this.faltered };
  }
}

/** The stand-ins for the player: one that taps the wisps in turn, and a careful hand that holds one at a time. */
const STAND = {
  hold: { pushy: 0, sloppiness: 0.08 },
  juggle: { pushy: 0, sloppiness: 0.2, taps: true },
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
