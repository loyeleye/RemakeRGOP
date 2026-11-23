// Story run 3, Granny's game, played in the page like runs 1 and 2. The player is Rook, on a
// team with Lumi (the captain, who calls) and two children; Hesta plays alone against all four.
// She walks and plays near perfectly, and messes with them in the open: late pushes, a parked
// wisp, give and take. On the children's match point she holds their wisp fast in the ground
// and walks her last one in, so it always ends with her winning by one.
// Numbers are in GRANNY (src/engine/granny.ts).

import { Tile, pt, samePt, type Pt } from "../engine/board.js";
import { bankDistances, botCommand, planSpot } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Command, type Guild, type Wisp } from "../engine/game.js";
import { GRANNY } from "../engine/granny.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { realClock, type Clock } from "./room.js";

// The player is always id 1: Rook or Lumi, as GRANNY.player says.
const PLAYER_IS_ROOK = GRANNY.player === "rook";
const ROOK_ID = PLAYER_IS_ROOK ? 1 : 2;
const LUMI_ID = PLAYER_IS_ROOK ? 2 : 1;
const YOU = 1;
const KID_IDS = [3, 4] as const;
const HESTA_ID = 5;
const ROOK = "Rook", LUMI = "Lumi", HESTA = "Hesta";
const [NELL, SEFA] = GRANNY.children;

export class GrannyRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  private dist!: Int16Array;
  /** Her parked wisp (left near the rim), and since when. */
  private parked: number | null = null;
  private parkedAt = 0;
  /** The wisp held fast at match point, once it is. */
  private holdWisp: number | null = null;
  private lastCall = 0;
  private pushes = 0;
  private said = new Set<string>();
  private lastPushedBy: number | null = null;
  /** Ticks of her late pushes, and how many drew her while another of their wisps banked. */
  private pushTicks: number[] = [];
  private baits = 0;
  private callTurn = 0;
  private leader = 0;
  private sefaLetGo = -99;
  /** Who last held each wisp, so a bank can be put down to someone. */
  private lastHolder = new Map<number, number>();
  /** Lumi's tide pull, seen in front of Hesta (tick), or -1. */
  private tideSeen = -1;

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
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
        const action = cleanAction(msg.action, this.game);
        this.game.command(YOU, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    const shrine = shrineById(GRANNY.shrine);
    const roster = [
      { id: ROOK_ID, guild: 0 as Guild, name: ROOK },
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
      { id: KID_IDS[0], guild: 0 as Guild, name: NELL },
      { id: KID_IDS[1], guild: 0 as Guild, name: SEFA },
      { id: HESTA_ID, guild: 1 as Guild, name: HESTA },
    ].sort((a, b) => a.id - b.id);
    this.game = new Game(shrine, roster, this.seed(), GRANNY.wisps, GRANNY.ticks);
    this.game.tidePuller = LUMI_ID;
    // She walks: that's her whole handicap.
    this.player(HESTA_ID).run = false;
    this.dist = bankDistances(this.game.board);
    this.parked = this.holdWisp = null;
    this.parkedAt = this.lastCall = this.pushes = this.baits = this.callTurn = this.leader = 0;
    this.said = new Set();
    this.lastPushedBy = null;
    this.pushTicks = [];
    this.sefaLetGo = -99;
    this.lastHolder = new Map();
    this.tideSeen = -1;
    this.phase = "countdown";
    this.countdown = GRANNY.bellTicks;
    this.say(LUMI, PLAYER_IS_ROOK ? "I'm captain. I picked Dad first." : "I'm captain.", { talk: true });
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
    this.flush();
    this.broadcastTick();
  }

  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) this.phase = "playing";
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing") return;
    const g = this.game;
    this.steerKids();
    this.steerHesta();
    g.step();
    this.afterStep();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  private stepsOut(w: Wisp) {
    return this.dist[w.pos.y * this.game.board.width + w.pos.x] ?? 99;
  }

  private kidsScore() {
    return this.game.scores[0]!;
  }
  private hestaScore() {
    return this.game.scores[1]!;
  }

  // ---------------------------------------------------------------- the children

  private steerKids() {
    const g = this.game;
    const S = GRANNY.styles;
    const bots: [number, typeof S.lumi][] = [[KID_IDS[0], S.nell], [KID_IDS[1], S.sefa], PLAYER_IS_ROOK ? [LUMI_ID, S.lumi] : [ROOK_ID, S.rook]];
    for (const [id, style] of bots) {
      const before = this.player(id).beam;
      const cmd = botCommand(g, id, style, () => this.rng.next());
      if (cmd) g.command(id, cmd);
      if (id === KID_IDS[1] && before !== null && cmd?.action?.kind === "idle") this.sefaLetGo = g.tick;
    }
    // Lumi calls to Nell and Sefa now and then (never to the player): barks, no rule.
    const sefa = this.player(KID_IDS[1]);
    if (g.tick - this.sefaLetGo === 1) this.say(LUMI, `It's fine. Again, ${SEFA}.`, { player: LUMI_ID });
    else if (g.tick >= GRANNY.firstPushAfter && g.tick - this.lastCall >= GRANNY.callEvery) {
      this.lastCall = g.tick;
      if (sefa.beam !== null && this.callTurn++ % 2 === 0) this.say(LUMI, `${SEFA}, hold it. Hold it. ...${SEFA}.`, { player: LUMI_ID });
      else this.say(LUMI, `${NELL}, go left. Your other left.`, { player: LUMI_ID });
    }
    for (const p of g.players) if (p.beam !== null) this.lastHolder.set(p.beam, p.id);
    if (this.staging() && LUMI_ID !== YOU) this.stageTide();
  }

  /** No tide pull yet by about the halfway score: set one up in front of her. */
  private staging() {
    return this.tideSeen < 0 && this.kidsScore() + this.hestaScore() >= GRANNY.tideBy;
  }

  /** Lumi goes for a loose wisp of theirs on the pond while another sits on the same water. */
  private stageTide() {
    const g = this.game, lumi = this.player(LUMI_ID);
    const wet = g.wisps.filter((w) => w.guild === 0 && !w.target && !g.rooted.has(w.id) && g.board.tile(w.pos) === Tile.Water);
    if (wet.length < 2) return;
    const w = wet.sort((a, b) => Math.hypot(a.pos.x - lumi.pos.x, a.pos.y - lumi.pos.y) - Math.hypot(b.pos.x - lumi.pos.x, b.pos.y - lumi.pos.y))[0]!;
    const fix = lumi.mode !== "pull" || undefined;
    if (g.inReach({ ...lumi, mode: "pull" }, w)) return g.command(LUMI_ID, { action: { kind: "staff", wisp: w.id }, toggleMode: fix });
    const spot = planSpot(g, LUMI_ID, lumi.pos, w, 0, true);
    if (spot) g.command(LUMI_ID, { action: { kind: "walk", to: spot }, toggleMode: fix });
  }

  /** A free pond tile for a wisp coming back while the tide pull is being set up. */
  private pondSpot(): Pt | null {
    const g = this.game, b = g.board;
    const spots: Pt[] = [];
    for (let y = 0; y < b.height; y++)
      for (let x = 0; x < b.width; x++) {
        const p = pt(x, y);
        if (b.tile(p) !== Tile.Water || b.inBankZone(p)) continue;
        if (g.wisps.some((w) => samePt(w.pos, p)) || g.players.some((q) => samePt(q.pos, p))) continue;
        spots.push(p);
      }
    return spots.length ? spots[Math.floor(this.rng.next() * spots.length)]! : null;
  }

  // ---------------------------------------------------------------- Hesta

  private steerHesta() {
    const g = this.game, me = this.player(HESTA_ID), H = GRANNY.hesta;
    const kids = this.kidsScore(), hers = this.hestaScore(), lead = hers - kids;
    const matchPoint = kids >= GRANNY.target - 1;
    const cmd = (c: Command) => g.command(HESTA_ID, c);
    const fix = (mode: "pull" | "push") => me.mode !== mode || undefined;

    // 1. Late push: only once their wisp is about to bank, and only as give and take allows.
    if (!matchPoint && lead < H.calmLead && g.tick >= GRANNY.firstPushAfter) {
      const threats = g.wisps
        .filter((w) => w.guild === 0 && !g.rooted.has(w.id) && this.stepsOut(w) > 0 && this.stepsOut(w) <= H.latePushAt && g.inReach({ ...me, mode: "push" }, w))
        .sort((a, b) => this.stepsOut(a) - this.stepsOut(b));
      // Spread it about: not the same child twice in a row when she has a choice.
      const threat = threats.find((w) => w.holder === null || w.holder !== this.lastPushedBy) ?? threats[0];
      const already = me.action.kind === "staff" && threat !== undefined && me.action.wisp === threat.id && me.mode === "push";
      const keen = lead < 0 || this.rng.next() < H.evenChance;
      if (threat && (already || keen)) {
        if (!already) {
          this.pushes++;
          this.pushTicks.push(g.tick);
          this.lastPushedBy = threat.holder;
          if (this.pushes === 1) {
            this.say(LUMI, "That's not allowed!", { player: LUMI_ID });
            this.say(HESTA, "Show me where it says.", { player: HESTA_ID });
          } else if (PLAYER_IS_ROOK && threat.holder === YOU && this.hint("guard")) {
            this.say(HESTA, "I only have to watch one, Rook. Lucky you only brought one.", { player: HESTA_ID });
          } else if (this.rng.next() < 0.35) this.say(HESTA, "Nearly.", { player: HESTA_ID });
        }
        return cmd({ action: { kind: "staff", wisp: threat.id }, toggleMode: fix("push") });
      }
    }

    // 2. Her own wisps. One is parked near the rim until the children threaten, or a while passes.
    const live = g.wisps.filter((w) => w.guild === 1 && this.stepsOut(w) > 0);
    if (this.parked !== null && !live.some((w) => w.id === this.parked)) this.parked = null;
    const kidsClose = g.wisps.some((w) => w.guild === 0 && this.stepsOut(w) <= H.releaseWhen && !g.rooted.has(w.id));
    // On her own match point she waits for theirs, so the hold always comes and it ends ten to nine.
    const waitForThem = hers >= GRANNY.target - 1 && this.holdWisp === null;
    // While she waits for their match point her wisps sit on the rim without banking, in plain
    // sight. Once she has held theirs, one of them may go in: hers is the only point left.
    g.noBank.clear();
    if (hers >= GRANNY.target - 1) {
      const mine = g.wisps.filter((w) => w.guild === 1).sort((a, b) => this.stepsOut(a) - this.stepsOut(b));
      for (const w of this.holdWisp === null ? mine : mine.slice(1)) g.noBank.add(w.id);
    }
    // Give and take: leading by enough, she brings hers close but not in, and lets them catch up.
    const holdBack = lead >= H.calmLead;
    const release = !waitForThem && (this.holdWisp !== null || kidsClose || g.tick - this.parkedAt >= H.parkMax);
    if (release && this.parked !== null && kidsClose && !this.said.has("about to")) {
      this.said.add("about to");
      this.say(HESTA, "Oh, were you about to? So was I.", { player: HESTA_ID });
    }
    if (release) this.parked = null;
    const near = live.filter((w) => this.stepsOut(w) <= H.parkAt && !w.target);
    if (!release && this.parked === null && near.length) {
      this.parked = near[0]!.id;
      this.parkedAt = g.tick;
      if (PLAYER_IS_ROOK && this.hint("parked")) this.say(HESTA, "Don't mind that one, Rook. It only goes in when you make me nervous.", { player: HESTA_ID });
    }
    // The player working a wisp out of her reach, on her far side.
    const you = this.player(YOU);
    if (PLAYER_IS_ROOK && you.beam !== null && g.tick >= GRANNY.firstPushAfter) {
      const w = g.wisps[you.beam];
      if (w && w.guild === 0 && !g.inReach({ ...me, mode: "push" }, w) && this.hint("far")) this.say(HESTA, "All the way over there, Rook? At my age?", { player: HESTA_ID });
    }
    // Anything near the rim stays put while she waits; otherwise only the parked one does.
    const free = live.filter((w) => w.id !== this.parked && !(waitForThem && this.stepsOut(w) <= H.parkAt) && !(holdBack && this.stepsOut(w) <= H.parkAt + 1));
    // Keep a pull going while it's in flight.
    if (me.action.kind === "staff" && me.mode === "pull") {
      const w = g.wisps[me.action.wisp];
      if (w && free.includes(w) && (w.target || me.beam !== w.id)) return;
    }
    const target = free.sort((a, b) => this.stepsOut(a) - this.stepsOut(b))[0];
    if (!target) {
      if (me.action.kind !== "idle") cmd({ action: { kind: "idle" }, toggleMode: fix("pull") });
      return;
    }
    const spot = planSpot(g, HESTA_ID, me.pos, target, 0, false);
    if (!spot || (spot.x === me.pos.x && spot.y === me.pos.y)) return cmd({ action: { kind: "staff", wisp: target.id }, toggleMode: fix("pull") });
    if (me.action.kind === "walk" && me.action.to.x === spot.x && me.action.to.y === spot.y) return;
    cmd({ action: { kind: "walk", to: spot }, toggleMode: fix("pull") });
  }

  /** Her three hints to the player: each once, the first time he sees the thing. */
  private hint(k: string) {
    if (this.said.has(`hint:${k}`)) return false;
    this.said.add(`hint:${k}`);
    return true;
  }

  // ---------------------------------------------------------------- after each tick

  private afterStep() {
    const g = this.game;
    // Match point: their next wisp to reach the rim stops dead, held in the ground.
    if (this.kidsScore() >= GRANNY.target - 1) {
      for (const w of g.wisps) {
        if (w.guild !== 0 || g.rooted.has(w.id) || this.stepsOut(w) > GRANNY.holdAt) continue;
        g.rooted.add(w.id);
        w.target = null;
        w.rimTicks = 0;
        if (this.holdWisp === null) {
          this.holdWisp = w.id;
          this.say(LUMI, "You can't do that!", { talk: true });
          this.say(HESTA, "You did it on the pond. Yours is water. Mine's rock.", { talk: true });
          this.say(LUMI, "Dad hasn't got one.", { talk: true });
          this.say(HESTA, "No. Your father does it the hard way.", { talk: true });
        }
      }
    }
    // Lumi's tide pull, in front of everyone: Hesta notices.
    if (this.tideSeen < 0 && g.drifting > 0) {
      this.tideSeen = g.tick;
      this.say(SEFA, "How did you do that?", { player: KID_IDS[1] });
      this.say(LUMI, "I pulled.", { player: LUMI_ID });
      this.say(HESTA, "Did you now.", { player: HESTA_ID });
    }
    // Setting it up: their wisps come back on the pond.
    if (this.staging())
      for (const b of g.banks) {
        if (b.guild !== 0) continue;
        const spot = this.pondSpot();
        if (spot) moveWisp(g.wisps[b.wisp]!, spot);
      }
    // The children guess her age in the opening, before the first push.
    const age: [number, string, string, number][] = [
      [4, SEFA, "Are you a hundred?", KID_IDS[1]],
      [8, HESTA, "Higher.", HESTA_ID],
      [12, NELL, "A hundred and ten?", KID_IDS[0]],
      [16, HESTA, "Higher.", HESTA_ID],
      [20, LUMI, "She's distracting you. Eyes on the wisp.", LUMI_ID],
      [24, HESTA, "Is it working?", HESTA_ID],
      [150, SEFA, "She's not even running!", KID_IDS[1]],
      [154, HESTA, "Why would I run? You're all coming to me.", HESTA_ID],
    ];
    for (const [t, who, text, id] of age) if (g.tick === t) this.say(who, text, { player: id });
    // Their banks: drawn pushes (bait), and her one line of real praise.
    for (const b of g.banks) {
      if (b.guild !== 0) continue;
      if (this.pushTicks.some((t) => g.tick - t <= GRANNY.baitWindow)) {
        this.baits++;
        this.pushTicks = [];
      }
      if (PLAYER_IS_ROOK && this.lastHolder.get(b.wisp) === YOU && !this.said.has("my dad")) {
        this.said.add("my dad");
        this.say(LUMI, "That's my dad.", { player: LUMI_ID });
        this.say(HESTA, "So I hear.", { player: HESTA_ID });
      } else if (this.pushes > 0 && !this.said.has("praise")) {
        this.said.add("praise");
        this.say(HESTA, "Good. Do that again and I'll have to try.", { player: HESTA_ID });
      }
    }
    // Who leads: the children's cheer, and her taking it back.
    const lead = Math.sign(this.kidsScore() - this.hestaScore());
    if (lead !== 0 && lead !== this.leader) {
      if (lead > 0 && !this.said.has("winning")) {
        this.said.add("winning");
        this.say(LUMI, "We're winning. Nobody change anything.", { player: LUMI_ID });
        this.say(HESTA, "I might change one thing.", { player: HESTA_ID });
      }
      if (lead < 0 && this.leader > 0 && !this.said.has("mine again")) {
        this.said.add("mine again");
        this.say(LUMI, "It's fine. Nobody panic.", { player: LUMI_ID });
        this.say(HESTA, "A little panic is fine.", { player: HESTA_ID });
      }
      this.leader = lead;
    }
    if (this.hestaScore() >= GRANNY.target) return this.finish();
    if (g.finished) return this.finish();
  }

  private finish() {
    this.phase = "results";
    const g = this.game;
    this.end = {
      banked: g.scores[0]!,
      kes: g.scores[1]!,
      summary: `Granny's game: the children ${g.scores[0]}, Hesta ${g.scores[1]}.`,
      lines: [
        { who: HESTA, text: "Winner's prize. I'm giving it to the losers." },
        { who: LUMI, text: "There's three left." },
        { who: HESTA, text: "Three of you. I can count too." },
        ...(PLAYER_IS_ROOK ? [{ who: LUMI, text: "There were four of us." }] : []),
        { who: LUMI, text: "Best of three. No rocks." },
        { who: HESTA, text: "No promises." },
        ...(this.baits >= GRANNY.baited && PLAYER_IS_ROOK ? [{ who: HESTA, text: "You saw what I was doing. Most don't." }] : []),
      ],
    };
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- wire

  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}) {
    this.lines.push({ who, text, ...how });
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
      run: GRANNY.run,
      movement: 0,
      title: GRANNY.title,
      ring: null,
      mark: null,
      kes: 0,
      rival: { name: HESTA, short: HESTA, score: this.game.scores[1]! },
      end: this.end,
    };
  }

  view(): RoomView {
    const kid = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: true });
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: GRANNY.shrine,
      teams: 2,
      players: [
        { ...kid(ROOK_ID, ROOK), bot: ROOK_ID !== YOU },
        { ...kid(LUMI_ID, LUMI), bot: LUMI_ID !== YOU },
        kid(KID_IDS[0], NELL),
        kid(KID_IDS[1], SEFA),
        { id: HESTA_ID, name: HESTA, guild: 1, flame: "frost", connected: true, bot: true },
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
    return { phase: this.phase, game: this.game, end: this.end, holdWisp: this.holdWisp, parked: this.parked, pushes: this.pushes, baits: this.baits, tideSeen: this.tideSeen };
  }
}

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

export type { Pt };
