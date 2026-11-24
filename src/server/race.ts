// Story run 5, the race with Kes, played in the page like the other runs. The player is Rook;
// Kes is a bot with a storm light, which strings her wisps together (the storm law, game.ts).
// Three heats, all played: an even one, one where she strings, and the one that decides it.
// Lumi referees from the edge in bubbles. Numbers are in RACE (src/engine/race.ts); the build
// brief is project files gameplay/run5-prototype-brief.md, the lines story/run5-race-lines.md.

import { Mover, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { botCommand, planSpot } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Command, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { RACE } from "../engine/race.js";
import { lineTicks } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, KES_ID = 2, LUMI_ID = 3;
const ROOK = "Rook", KES = "Kes", LUMI = "Lumi";

/** How a stand-in for the player plays, in tests and measurements: holding one wisp at a time, or tapping them in turn. */
export type Stand = "hold" | "juggle";

export class RaceRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  /** The heat being played (0, 1, 2), and heats won: Rook's, Kes's. */
  private heat = 0;
  private wins: [number, number] = [0, 0];
  private heatWon: number[] = [];
  /** Each side's group of wisps this heat: which one it is on, and where its wisps come up. */
  private groupN: [number, number] = [0, 0];
  private spots: [Pt[], Pt[]] = [[], []];
  private said = new Set<string>();
  private queue: Pending[] = [];
  private busyUntil = 0;
  private started = new Set<number>();
  private dropped = new Set<number>();
  private groupId = 0;
  private lastKes = -99;
  /** Kes standing pleased with herself until this tick. */
  private preenUntil = 0;
  /** The tick each of Rook's wisps last moved. */
  private movedAt = new Map<number, number>();
  /** The heat is won: the tick its talk starts. */
  private overAt = -1;
  /** Ticks of each heat, for the measurements. */
  heatTicks: number[] = [];
  /** Tiles each side's wisps travelled in each heat: [Rook's, Kes's]. */
  travel: [number, number][] = [];

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
        // "Race again": the board is meant to host a rematch.
        if (this.phase === "results") this.begin();
        return;
      case "act": {
        if (this.phase !== "playing") return;
        let action = cleanAction(msg.action, this.game);
        // No shoving: his staff does nothing to her wisps here, and the referee says so.
        if (action?.kind === "staff" && this.game.wisps[action.wisp]!.guild !== 0) {
          action = undefined;
          if (!this.said.has(`shove${this.heat}`)) {
            this.said.add(`shove${this.heat}`);
            this.say(LUMI, "No shoving. I said.", { player: LUMI_ID }, "key");
          }
        }
        this.game.command(YOU, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    this.heat = 0;
    this.wins = [0, 0];
    this.heatWon = [];
    this.heatTicks = [];
    this.travel = [];
    this.said = new Set();
    this.endClock();
    this.startHeat();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  /** A fresh board for the heat, and the talk before it (the bell waits for the talk). */
  private startHeat() {
    const shrine = shrineById(RACE.shrine);
    const roster = [
      { id: YOU, guild: 0 as Guild, name: ROOK },
      { id: KES_ID, guild: 1 as Guild, name: KES },
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
    ];
    this.travel[this.heat] = [0, 0];
    const g = (this.game = new Game(shrine, roster, this.seed(), [RACE.group, RACE.group], RACE.ticks));
    // The laws of water hold in every story run (this board is dry, so they never come up).
    g.waterLawHere = true;
    g.noShove = true;
    // Heat 1 is an even race: she doesn't string until heat 2.
    g.stormLight = this.heat >= 1 ? KES_ID : null;
    g.stringMax = RACE.storm.max;
    g.stringReach = RACE.storm.reach;
    g.stringLink = RACE.storm.link;
    g.stringGap = RACE.storm.gap;
    // A banked wisp waits for the rest of its group; the room brings the next group in.
    g.respawnPause = RACE.ticks * 2;
    g.onReturn = (w) => {
      const spot = this.spots[w.guild as 0 | 1][g.wisps.filter((o) => o.guild === w.guild).indexOf(w)];
      if (spot) moveWisp(w, spot);
    };
    this.groupN = [0, 0];
    this.heatSeed = this.seed();
    this.placeGroups();
    for (const w of g.wisps) g.onReturn(w);
    // Lumi, the referee, at the south edge, out of the way.
    const lumi = this.player(LUMI_ID), b = g.board;
    let y = b.height - 1;
    while (y > b.center.y && !b.passable(pt(b.center.x, y - 1), Mover.Walker)) y--;
    lumi.pos = lumi.prev = pt(b.center.x, y - 1);
    this.queue = [];
    this.busyUntil = 0;
    this.started = new Set();
    this.dropped = new Set();
    this.lastKes = -99;
    this.movedAt = new Map();
    this.preenUntil = 0;
    this.overAt = -1;
    this.phase = "countdown";
    const talk = { talk: true };
    const before = this.lines.length;
    if (this.heat === 0) {
      this.say(KES, "You took my pupil on a job.", talk);
      this.say(ROOK, "She's my daughter.", talk);
      this.say(KES, "She was going to be my pupil. Race you for her.", talk);
      this.say(LUMI, "I'm not a prize. I'm the referee.", talk);
      this.say(LUMI, "First to six. No shoving.", talk);
      this.say(KES, "Whatever you say, Captain.", talk);
    } else {
      const last = this.heatWon[this.heat - 1]!;
      this.say(LUMI, last === 0 ? "Dad, one." : "Kes, one.", talk);
      if (this.heat === 1) {
        // Rosalind, named once (Ladi): in heat 1 when the scores were first level, or here if they never were.
        if (!this.said.has("rosie")) this.rosie(talk);
      } else {
        this.say(KES, "You hold on too long, Rook. You always have.", talk);
        this.say(LUMI, "Don't hold them. Touch them all.", talk);
        if (RACE.lastHeatDecides) {
          if (this.wins[1] === 2) this.say(KES, "Two nothing's no fun. Last one takes it.", talk);
          else if (this.wins[0] === 2) {
            this.say(KES, "Last one takes it. Obviously.", talk);
            this.say(LUMI, "That's not how counting works.", talk);
          } else {
            this.say(LUMI, "One each. Last one.", talk);
            this.say(KES, "Good. I'd hate for it to be easy.", talk);
          }
        } else if (this.wins[0] === 1 && this.wins[1] === 1) this.say(LUMI, "One each. Last one.", talk);
      }
    }
    // The bell waits for the talk to finish.
    this.countdown = RACE.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.flush();
    this.broadcastTick();
  }

  private rosie(how: Omit<StoryLine, "who" | "text"> | null) {
    this.said.add("rosie");
    this.say(KES, "Rosie would have tripped me by now.", how ?? { player: KES_ID }, "key");
    this.say(LUMI, "Mum cheated?", how ?? { player: LUMI_ID }, "key");
    this.say(KES, "Constantly.", how ?? { player: KES_ID }, "key");
  }

  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) {
        this.phase = "playing";
        this.say(LUMI, "Go!", { player: LUMI_ID }, "key");
        this.flush();
      }
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing") return;
    const g = this.game;
    if (this.overAt < 0) {
      if (this.stand) this.steerStand();
      this.steerKes();
    }
    g.step();
    // How far each side's wisps travelled (the measurements): a step, not a wisp coming back.
    if (this.overAt < 0) for (const w of g.wisps) if (!g.away.has(w.id) && cheb(w.pos, w.prev) <= 2) this.travel[this.heat]![w.guild as 0 | 1] += cheb(w.pos, w.prev);
    this.afterStep();
    if (this.phase === "playing") this.due();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  // ---------------------------------------------------------------- the wisps

  /**
   * Where both sides' next groups come up: a loose cluster in the outer band, Rook's to the west
   * and Kes's mirrored to the east, so the two have the same job each time.
   */
  private placeGroups(side: 0 | 1 | "both" = "both") {
    const g = this.game, b = g.board, c = b.center;
    // The same draw for the same group number on either side, whoever gets to it first.
    const n = side === "both" ? 0 : this.groupN[side];
    const rng = new Rng(this.heatSeed + n * 7919);
    const a = (rng.next() - 0.5) * ((Math.PI * 2) / 3);
    const r = RACE.band[0] + rng.next() * (RACE.band[1] - RACE.band[0]);
    const offs: Pt[] = [];
    while (offs.length < RACE.group) {
      const o = pt(Math.round(-Math.cos(a) * r) + rng.int(RACE.spread * 2 + 1) - RACE.spread, Math.round(Math.sin(a) * r) + rng.int(RACE.spread * 2 + 1) - RACE.spread);
      if (offs.some((q) => cheb(q, o) < 2)) continue;
      offs.push(o);
    }
    for (const s of side === "both" ? ([0, 1] as const) : [side]) {
      this.spots[s] = offs.map((o) => {
        const want = pt(c.x + (s === 0 ? o.x : -o.x), c.y + o.y);
        return b.passable(want, Mover.Wisp) && !b.inBankZone(want) ? want : g.nearestFree(want, 0);
      });
    }
  }
  private heatSeed = 1;

  /** A side's group is all banked and it still needs more: the next group comes up. */
  private nextGroups() {
    const g = this.game;
    for (const s of [0, 1] as const) {
      const mine = g.wisps.filter((w) => w.guild === s);
      if (g.scores[s]! >= RACE.target || !mine.every((w) => (g.away.get(w.id) ?? 0) > g.tick + RACE.groupPause)) continue;
      this.groupN[s]++;
      this.placeGroups(s);
      for (const w of mine) g.away.set(w.id, g.tick + RACE.groupPause);
    }
  }

  // ---------------------------------------------------------------- Kes

  private steerKes() {
    const g = this.game, me = this.player(KES_ID);
    const cmd = (c: Command | null) => c && g.command(KES_ID, c);
    if (g.tick < this.preenUntil) return cmd(me.action.kind === "idle" ? null : { action: { kind: "idle" } });
    if (g.stormLight !== KES_ID) return cmd(botCommand(g, KES_ID, RACE.kes.plain, () => this.rng.next()));
    const fix = me.mode !== "pull" || undefined;
    const live = (w: Wisp) => w.guild === 1 && !g.board.inBankZone(w.pos) && !g.away.has(w.id);
    // Only what her string can reach: a wisp too far from its tail would break off at once.
    const tail = g.string.length ? g.wisps[g.string[g.string.length - 1]!]! : null;
    const loose = g.wisps.filter((w) => live(w) && !g.string.includes(w.id) && (!tail || (cheb(w.pos, tail.pos) <= RACE.storm.link - 1 && g.board.canSee(w.pos, tail.pos))));
    const want = RACE.kes.stringAll ? RACE.storm.max : 2;
    if (loose.length && g.string.length < Math.min(want, RACE.storm.max)) {
      // Walk to each wisp and touch it: that is what her gift costs her.
      const w = loose.sort((a, b) => cheb(a.pos, me.pos) - cheb(b.pos, me.pos))[0]!;
      if (cheb(me.pos, w.pos) <= RACE.storm.reach && g.inReach({ ...me, mode: "pull" }, w)) return cmd({ action: { kind: "staff", wisp: w.id }, toggleMode: fix });
      const at = this.besideWisp(w, me.pos);
      if (me.action.kind === "walk" && samePt(me.action.to, at)) return cmd(fix ? { toggleMode: true } : null);
      return cmd({ action: { kind: "walk", to: at }, toggleMode: fix });
    }
    const head = g.string.length ? g.wisps[g.string[0]!] : undefined;
    if (!head || !live(head)) {
      // Between groups, or only the rim to wait on: stand easy.
      return cmd(me.action.kind === "idle" ? null : { action: { kind: "idle" } });
    }
    if (this.rng.next() < RACE.kes.strung.sloppiness) return;
    // Pull the head in from the best spot, as any good player would; the rest follow.
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
    const g = this.game, b = g.board, R = RACE.storm.reach;
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

  /** Tests and measurements: a bot in Rook's place, holding one wisp at a time or tapping them in turn. */
  private steerStand() {
    const g = this.game, me = this.player(YOU), c = g.board.center;
    if (this.stand !== "juggle") {
      const cmd = botCommand(g, YOU, STAND.hold, () => this.rng.next());
      return void (cmd && g.command(YOU, cmd));
    }
    // Juggling, done well: stand between the group and the fire with all of them in reach, tap
    // whichever has stopped (each tap sends it two tiles), and back off toward the rim as they come.
    const mine = g.wisps.filter((w) => w.guild === 0 && !g.board.inBankZone(w.pos) && !g.away.has(w.id));
    if (!mine.length || this.rng.next() < STAND.juggle.sloppiness) return;
    const rad = (p: Pt) => Math.hypot(p.x - c.x, p.y - c.y);
    const mx = mine.reduce((a, w) => a + w.pos.x, 0) / mine.length - c.x, my = mine.reduce((a, w) => a + w.pos.y, 0) / mine.length - c.y;
    const far = Math.max(...mine.map((w) => rad(w.pos))), len = Math.hypot(mx, my) || 1;
    // The last step onto the rim is an ordinary pull from the right spot.
    if (far <= 4.5) {
      const cmd = botCommand(g, YOU, { pushy: 0, sloppiness: 0 }, () => this.rng.next());
      return void (cmd && g.command(YOU, cmd));
    }
    const r = Math.max(2, far - 8);
    const want = pt(Math.round(c.x + (mx / len) * r), Math.round(c.y + (my / len) * r));
    const idle = mine.filter((w) => !w.target && g.inReach({ ...me, mode: "pull" }, w) && cheb(w.pos, me.pos) > 1).sort((a, b) => rad(b.pos) - rad(a.pos));
    const fix = me.mode !== "pull" || undefined;
    if (cheb(me.pos, want) > 2 || (!idle.length && !samePt(me.pos, want))) return void g.command(YOU, { action: { kind: "walk", to: g.board.passable(want, Mover.Walker) ? want : g.nearestFree(want, 0) }, toggleMode: fix });
    if (idle.length) g.command(YOU, { action: { kind: "staff", wisp: idle[0]!.id }, toggleMode: fix });
  }

  // ---------------------------------------------------------------- after each tick

  private afterStep() {
    const g = this.game, rook = g.scores[0]!, kes = g.scores[1]!;
    if (this.overAt >= 0) {
      // The heat is won: a breath, then the next heat's talk, or the end.
      if (g.tick >= this.overAt + RACE.heatTail && !this.talking()) {
        if (this.heat + 1 < RACE.heats) {
          this.heat++;
          this.startHeat();
        } else this.finish();
      }
      return;
    }
    // Her string, the first time anyone sees it pulled.
    if (g.stringLive && g.string.length >= 2 && !this.said.has("string")) {
      this.said.add("string");
      this.say(LUMI, "How did you do that?", { player: LUMI_ID }, "key");
      this.say(KES, "I pulled.", { player: KES_ID }, "key");
      this.say(KES, "They like company. Wind does that.", { player: KES_ID }, "key");
    }
    if (g.stringEvents.some((e) => e.kind === "break")) this.kesSays("No, no. Come back.");
    // Heat 3: the first time he keeps three moving at once.
    // (A tap carries a wisp two ticks, so three "at once" means three that each moved in the last three.)
    for (const w of g.wisps) if (w.guild === 0 && !samePt(w.pos, w.prev) && cheb(w.pos, w.prev) <= 2) this.movedAt.set(w.id, g.tick);
    if (this.heat === 2 && !this.said.has("juggling") && g.wisps.filter((w) => w.guild === 0 && g.tick - (this.movedAt.get(w.id) ?? -9) <= 2).length >= RACE.juggling) {
      this.said.add("juggling");
      this.say(KES, "There he is.", { player: KES_ID }, "key");
    }
    // Heat 1, the first time they're level after somebody has scored.
    if (this.heat === 0 && !this.said.has("rosie") && rook === kes && rook > 0 && rook < RACE.target - 1 && g.banks.length) this.rosie(null);
    for (const bk of g.banks) {
      if (bk.guild === 0) this.kesSays("Nice.", `nice${this.heat}`);
      else if (g.stormLight === KES_ID && kes < RACE.target && !g.string.length && this.rng.next() < RACE.kes.preenChance) {
        // A beat of pause after a good bank: a show-off, not a waiting bot.
        this.preenUntil = g.tick + RACE.kes.preen;
        if (!this.said.has("see")) {
          this.said.add("see");
          this.say(KES, "Did you see that?", { player: KES_ID });
          this.say(LUMI, "Everyone saw.", { player: LUMI_ID });
        }
      }
    }
    // The referee calls a clear lead, once each a heat.
    if (kes - rook >= 2 && !this.said.has(`kw${this.heat}`)) {
      this.said.add(`kw${this.heat}`);
      this.say(LUMI, "Kes is winning.", { player: LUMI_ID });
    }
    if (rook - kes >= 2 && !this.said.has(`rw${this.heat}`)) {
      this.said.add(`rw${this.heat}`);
      this.say(LUMI, "Dad's winning.", { player: LUMI_ID });
      this.kesSays("Don't get used to it.", "used");
    }
    if (rook >= RACE.target || kes >= RACE.target || g.finished) {
      const won = rook > kes ? 0 : 1;
      this.heatWon[this.heat] = won;
      this.wins[won]++;
      this.heatTicks[this.heat] = g.tick;
      this.overAt = g.tick;
      // Nobody banks another while the talk plays.
      for (const w of g.wisps) g.noBank.add(w.id);
      for (const p of g.players) g.command(p.id, { action: { kind: "idle" } });
      this.queue = this.queue.filter((q) => q.key);
      return;
    }
    this.nextGroups();
  }

  /** One of Kes's own bubbles: rare, and each kind once (by `once`) when asked. */
  private kesSays(text: string, once?: string) {
    const g = this.game;
    if (once && this.said.has(once)) return;
    if (g.tick - this.lastKes < RACE.kesGap || this.talking()) return;
    if (once) this.said.add(once);
    this.lastKes = g.tick;
    this.say(KES, text, { player: KES_ID });
  }

  /** Who takes the race: the last heat (the working plan), or the most heats. */
  private winner(): 0 | 1 {
    if (RACE.lastHeatDecides) return this.heatWon[RACE.heats - 1] === 0 ? 0 : 1;
    return this.wins[0] > this.wins[1] ? 0 : 1;
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    const rookWon = this.winner() === 0;
    this.end = {
      banked: this.wins[0],
      kes: this.wins[1],
      summary: `The race: Rook ${this.wins[0]} ${this.wins[0] === 1 ? "heat" : "heats"}, Kes ${this.wins[1]}. ${rookWon ? "Rook" : "Kes"} takes it.`,
      // Losing is an ending too: only these lines change, and the story goes on.
      lines: [
        ...(rookWon
          ? [
              { who: KES, text: "You worked for that." },
              { who: ROOK, text: "I always do." },
              { who: KES, text: "I know. It's annoying." },
            ]
          : [
              { who: KES, text: "Same time next week? I'll go slower." },
              { who: LUMI, text: "She won't." },
            ]),
        { who: LUMI, text: "I'm picking my own teacher." },
        { who: KES, text: "Good. Pick me, Captain." },
      ],
    };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  /**
   * A line. At the bell it is talk in the dialog box. In play one bubble shows at a time, paced by
   * how long it takes to read; "key" lines always play, a quip that can't start soon is dropped.
   */
  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, kind: "key" | "quip" = how.talk ? "key" : "quip") {
    const line = { who, text, ...how };
    if (this.phase !== "playing") return void this.lines.push(line);
    const now = this.game.tick;
    const last = this.queue[this.queue.length - 1];
    const group = last && last.trigger === now ? last.group : ++this.groupId;
    this.queue.push({ line, trigger: now, key: kind === "key", group });
    this.due();
  }

  private talking() {
    return this.queue.length > 0 || this.game.tick < this.busyUntil;
  }

  private due() {
    const now = this.game.tick;
    while (this.queue.length && now >= this.busyUntil) {
      const q = this.queue.shift()!;
      const late = !q.key && !this.started.has(q.group) && now - q.trigger > 4;
      if (late || this.dropped.has(q.group)) {
        this.dropped.add(q.group);
        continue;
      }
      this.started.add(q.group);
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
    return {
      run: RACE.run,
      movement: this.heat,
      title: `Heat ${this.heat + 1}`,
      ring: null,
      mark: null,
      kes: 0,
      rival: { name: KES, short: KES, score: this.game.scores[1]! },
      note: `of ${RACE.heats}. Heats: Rook ${this.wins[0]}, Kes ${this.wins[1]}`,
      end: this.end,
    };
  }

  view(): RoomView {
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: RACE.shrine,
      teams: 2,
      players: [
        { id: YOU, name: ROOK, guild: 0, flame: "amber", connected: true, bot: false },
        { id: KES_ID, name: KES, guild: 1, flame: "pearl", connected: true, bot: true },
        { id: LUMI_ID, name: LUMI, guild: 0, flame: "amber", connected: true, bot: true },
      ],
      countdown: this.countdown,
      lastScores: this.end ? [this.end.banked, this.end.kes] : null,
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
    return { phase: this.phase, game: this.game, end: this.end, heat: this.heat, wins: this.wins, heatWon: this.heatWon, said: this.said };
  }
}

/** The stand-ins for the player: a careful hand that holds one wisp at a time, and one that taps them in turn. */
const STAND = {
  hold: { pushy: 0, sloppiness: 0.08 },
  juggle: { pushy: 0, sloppiness: 0.2, taps: true },
} as const;

type Pending = { line: StoryLine; trigger: number; key: boolean; group: number };

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
