// Story run 3, Granny's game, played in the page like runs 1 and 2. The player is Rook, on a
// team with Lumi (the captain, who calls) and two children; Hesta plays alone against all four.
// She walks and plays near perfectly, and messes with them in the open: late pushes, a parked
// wisp, give and take. On the children's match point she holds their wisp fast in the ground
// and walks her last one in, so it always ends with her winning by one.
// Numbers are in GRANNY (src/engine/granny.ts).

import { Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { bankDistances, botCommand, planSpot } from "../engine/bot.js";
import { Game, Grip, Rng, TICK_MS, type Action, type Command, type Guild, type Wisp } from "../engine/game.js";
import { GRANNY } from "../engine/granny.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { VOICE_SECONDS } from "../engine/voice-durations.js";
import { realClock, type Clock } from "./room.js";

// The player is always id 1: Rook or Lumi, as GRANNY.player says.
const PLAYER_IS_ROOK = GRANNY.player === "rook";
const ROOK_ID = PLAYER_IS_ROOK ? 1 : 2;
const LUMI_ID = PLAYER_IS_ROOK ? 2 : 1;
const YOU = 1;
const KID_IDS = [3, 4] as const;
const HESTA_ID = 5;
/** How long her stone cast takes: 1.2 seconds, two ticks. */
const CAST_TICKS = 2;
const ROOK = "Rook", LUMI = "Lumi", HESTA = "Hesta";
const [NELL, SEFA] = GRANNY.children;
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export class GrannyRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  /** The reaction still (?nostills in the page leaves it out). */
  stillsOn = true;
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
  private scoreTurn = 0;
  private leader = 0;
  private sefaLetGo = -99;
  /** Who last held each wisp, so a bank can be put down to someone. */
  private lastHolder = new Map<number, number>();
  /** Barks waiting their turn, when the next may play, and when the last story line played. */
  /** Lines waiting their turn: one plays at a time. `key` lines always wait; a quip that can't start soon is dropped. */
  private queue: Pending[] = [];
  /** The tick the line now playing is done, and whether it's a key line. */
  private busyUntil = 0;
  private busyKey = false;
  private lastKey = -99;
  /** Groups (lines said together on one tick) that have started, so the rest of them always play; and dropped ones. */
  private started = new Set<number>();
  private dropped = new Set<number>();
  private holdTick = 0;
  private rushing = false;
  /** Lumi's tide pull, seen in front of Hesta (tick), or -1. */
  private tideSeen = -1;

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
    /** Where each player stands when the game starts (from the free walk on the pond), by id. */
    private starts?: ReadonlyMap<number, Pt>,
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
    // The laws of water hold in every story run.
    this.game.waterLawHere = true;
    // Moving water never puts a wisp ashore in a story run.
    this.game.tideStaysWet = true;
    // Lumi carries the water light: she holds on any water.
    this.game.waterLight = LUMI_ID;
    this.game.tidePuller = LUMI_ID;
    // A banked wisp is gone a moment before it comes back, so every point takes a little longer.
    this.game.respawnPause = GRANNY.respawnPause;
    // Setting up the tide pull: their wisps come back on the pond.
    this.game.onReturn = (w) => {
      // Hers come back near her: she only walks, and the board is big.
      if (w.guild === 1) {
        const spot = this.rushing ? this.nearAltar(w) : this.nearHesta();
        if (spot) moveWisp(w, spot);
        return;
      }
      if (!this.staging()) return;
      const spot = this.pondSpot();
      if (spot) moveWisp(w, spot);
    };
    for (const [id, at] of this.starts ?? []) {
      const p = this.game.players.find((q) => q.id === id);
      if (p && this.game.board.passable(at, Mover.Walker)) p.pos = p.prev = at;
    }
    // She walks: that's her whole handicap.
    this.player(HESTA_ID).run = false;
    this.dist = bankDistances(this.game.board);
    this.parked = this.holdWisp = null;
    this.rushing = false;
    this.parkedAt = this.lastCall = this.pushes = this.baits = this.callTurn = this.leader = this.scoreTurn = 0;
    this.said = new Set();
    this.lastPushedBy = null;
    this.pushTicks = [];
    this.sefaLetGo = -99;
    this.lastHolder = new Map();
    this.tideSeen = -1;
    this.queue = [];
    this.busyUntil = 0;
    this.busyKey = false;
    this.lastKey = -99;
    this.started = new Set();
    this.dropped = new Set();
    this.phase = "countdown";
    this.countdown = GRANNY.bellTicks;
    // Still 3.0 under her line (approved for "I picked Dad first.", so only when he is Rook).
    this.say(LUMI, PLAYER_IS_ROOK ? "I'm captain. I picked Dad first." : "I'm captain.", { talk: true, ...(this.stillsOn && PLAYER_IS_ROOK ? { still: { id: "r3-0" } } : {}) });
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
    if (this.phase === "playing") this.due();
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
    if (g.tick - this.sefaLetGo === 1) this.say(LUMI, `It's fine. Again, ${SEFA}.`, { player: LUMI_ID }, "chatter");
    else if (g.tick >= GRANNY.firstPushAfter && g.tick - this.lastCall >= GRANNY.callEvery) {
      this.lastCall = g.tick;
      if (sefa.beam !== null && this.callTurn++ % 2 === 0) this.say(LUMI, `${SEFA}, hold it. Hold it. ...${SEFA}.`, { player: LUMI_ID }, "chatter");
      else this.say(LUMI, `${NELL}, go left. Your other left.`, { player: LUMI_ID }, "chatter");
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

  /**
   * The finish, once theirs are stoned (Ladi): her pulls run at `rush.pull` times the usual
   * speed, and every wisp of hers comes back `rush.from` tiles out from the brazier, on her side.
   * She still pulls each one in herself. Returns true once she has ten and should stand still.
   */
  private rush() {
    const g = this.game;
    if (!this.rushing) {
      this.rushing = true;
      g.pullBoost.set(HESTA_ID, GRANNY.rush.pull);
      g.respawnPause = 0;
      for (const w of g.wisps) {
        if (w.guild !== 1) continue;
        g.away.delete(w.id);
        const spot = this.nearAltar(w);
        if (spot) moveWisp(w, spot), (w.prev = w.pos);
      }
    }
    if (this.hestaScore() < GRANNY.target) return false;
    // Ten and done: nothing more of hers goes in while the last lines play.
    for (const w of g.wisps) if (w.guild === 1) g.noBank.add(w.id);
    return true;
  }

  /** A free tile `rush.from` tiles out from the brazier, as near Hesta as can be, for a wisp of hers. */
  private nearAltar(w: Wisp): Pt | null {
    const g = this.game, b = g.board, me = this.player(HESTA_ID), [lo, hi] = GRANNY.rush.from;
    let best: Pt | null = null, bestD = Infinity;
    for (let y = b.center.y - hi; y <= b.center.y + hi; y++)
      for (let x = b.center.x - hi; x <= b.center.x + hi; x++) {
        const p = pt(x, y);
        const r = Math.max(Math.abs(x - b.center.x), Math.abs(y - b.center.y));
        if (r < lo || r > hi || !b.passable(p, Mover.Wisp) || b.inBankZone(p) || g.lawWater(p)) continue;
        if (g.wisps.some((o) => o !== w && samePt(o.pos, p)) || g.players.some((q) => samePt(q.pos, p))) continue;
        const d = Math.hypot(x - me.pos.x, y - me.pos.y) + this.rng.next() * 2;
        if (d < bestD) (bestD = d), (best = p);
      }
    return best;
  }

  /** A free spawn tile within `hestaNear` of Hesta, for one of her wisps coming back. */
  private nearHesta(): Pt | null {
    const g = this.game, me = this.player(HESTA_ID);
    const spots = g.shrine.spawnField.filter(
      (p) => Math.max(Math.abs(p.x - me.pos.x), Math.abs(p.y - me.pos.y)) <= GRANNY.hesta.near && !g.lawWater(p) && !g.wisps.some((w) => samePt(w.pos, p)) && !g.players.some((q) => samePt(q.pos, p)),
    );
    return spots.length ? spots[Math.floor(this.rng.next() * spots.length)]! : null;
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
    // Her stone cast (Ladi): she lets go of her pull for the 1.2 seconds it takes, then goes back to it.
    if (this.holdWisp !== null && g.tick < this.holdTick + CAST_TICKS) {
      if (me.action.kind !== "idle") cmd({ action: { kind: "idle" } });
      return;
    }

    // 1. Late push: only once their wisp is about to bank, and only as give and take allows.
    // Her scripted beats wait for any key exchange to finish, so none is cut off.
    const quiet = !this.keyTalking();
    if (!matchPoint && lead < H.calmLead && g.tick >= GRANNY.firstPushAfter && (this.pushes > 0 || quiet)) {
      const threats = g.wisps
        .filter((w) => w.guild === 0 && !g.rooted.has(w.id) && this.stepsOut(w) > 0 && this.stepsOut(w) <= H.latePushAt && g.inReach({ ...me, mode: "push" }, w) && !g.slipsAt(HESTA_ID, w.pos))
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
            this.say(LUMI, "That's not allowed!", { player: LUMI_ID }, "key");
            this.say(HESTA, "Show me where it says.", { player: HESTA_ID }, "key");
          } else if (PLAYER_IS_ROOK && threat.holder === YOU && quiet && this.hint("guard")) {
            this.say(HESTA, "I only have to watch one, Rook. Lucky you only brought one.", { player: HESTA_ID }, "key");
          } else if (this.rng.next() < 0.35) this.say(HESTA, "Nearly.", { player: HESTA_ID });
        }
        return cmd({ action: { kind: "staff", wisp: threat.id }, toggleMode: fix("push") });
      }
    }

    // After the hold she finishes it: faster pulls, and her wisps come back close to the brazier.
    if (this.holdWisp !== null && this.rush()) {
      if (me.action.kind !== "idle") cmd({ action: { kind: "idle" }, toggleMode: fix("pull") });
      return;
    }

    // 2. Her own wisps. One is parked near the rim until the children threaten, or a while passes.
    // She never reaches for one over water (the laws of water): she waits for it, or walks round.
    const live = g.wisps.filter((w) => w.guild === 1 && this.stepsOut(w) > 0 && !g.slipsAt(HESTA_ID, w.pos));
    if (this.parked !== null && !live.some((w) => w.id === this.parked)) this.parked = null;
    const kidsClose = g.wisps.some((w) => w.guild === 0 && this.stepsOut(w) <= H.releaseWhen && !g.rooted.has(w.id));
    // On her own match point she waits for theirs, so the hold always comes and it ends ten to nine.
    const waitForThem = hers >= GRANNY.target - 1 && this.holdWisp === null;
    // While she waits for their match point her wisps sit on the rim without banking, in plain
    // sight. Once she has held theirs, one of them may go in: hers is the only point left.
    g.noBank.clear();
    if (hers >= GRANNY.target - 1) {
      const mine = g.wisps.filter((w) => w.guild === 1).sort((a, b) => this.stepsOut(a) - this.stepsOut(b));
      // ...and not before the exchange at the hold has had its moment.
      const talking = this.holdWisp !== null && this.talking();
      for (const w of this.holdWisp === null || talking ? mine : mine.slice(1)) g.noBank.add(w.id);
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
      if (PLAYER_IS_ROOK && quiet && this.hint("parked")) this.say(HESTA, "Don't mind that one, Rook. It only goes in when you make me nervous.", { player: HESTA_ID }, "key");
    }
    // The player working a wisp out of her reach, on her far side.
    const you = this.player(YOU);
    if (PLAYER_IS_ROOK && you.beam !== null && g.tick >= GRANNY.firstPushAfter) {
      const w = g.wisps[you.beam];
      if (w && w.guild === 0 && quiet && !g.inReach({ ...me, mode: "push" }, w) && this.hint("far")) this.say(HESTA, "All the way over there, Rook? At my age?", { player: HESTA_ID }, "key");
    }
    // Anything near the rim stays put while she waits; otherwise only the parked one does.
    const free = live.filter((w) => w.id !== this.parked && !(waitForThem && this.stepsOut(w) <= H.parkAt) && !(holdBack && this.stepsOut(w) <= H.parkAt + 1));
    // Keep a pull going while it's in flight.
    if (me.action.kind === "staff" && me.mode === "pull") {
      const w = g.wisps[me.action.wisp];
      if (w && free.includes(w) && (w.target || me.beam !== w.id)) return;
    }
    const target = free.sort((a, b) => this.stepsOut(a) - this.stepsOut(b))[0];
    // The pond between her and it (a pull stops at the bank): she walks round to a dry line on it.
    if (target && g.board.lineTiles(me.pos, target.pos).some((q) => g.lawWater(q))) {
      const round = this.dryLine(target);
      if (round && !samePt(round, me.pos)) {
        if (!this.said.has("round")) {
          this.said.add("round");
          this.say(LUMI, "Use the pond. She has to go round.", { player: LUMI_ID }, "key");
        }
        if (!(me.action.kind === "walk" && samePt(me.action.to, round))) cmd({ action: { kind: "walk", to: round }, toggleMode: fix("pull") });
        return;
      }
    }
    if (!target) {
      if (me.action.kind !== "idle") cmd({ action: { kind: "idle" }, toggleMode: fix("pull") });
      return;
    }
    const spot = planSpot(g, HESTA_ID, me.pos, target, 0, false);
    if (!spot || (spot.x === me.pos.x && spot.y === me.pos.y)) return cmd({ action: { kind: "staff", wisp: target.id }, toggleMode: fix("pull") });
    if (me.action.kind === "walk" && me.action.to.x === spot.x && me.action.to.y === spot.y) return;
    cmd({ action: { kind: "walk", to: spot }, toggleMode: fix("pull") });
  }

  /** A tile she can pull `w` from without the pond in the way: in reach, a dry straight line to it,
   *  on the brazier's side of it if there's a choice, and as near her as can be. */
  private dryLine(w: Wisp): Pt | null {
    const g = this.game, b = g.board, me = this.player(HESTA_ID), c = b.center;
    let best: Pt | null = null, bestD = Infinity;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const q = pt(w.pos.x + dx, w.pos.y + dy);
        if (cheb(q, w.pos) < 2 || !b.inside(q) || !b.passable(q, Mover.Walker) || g.players.some((p) => p !== me && samePt(p.pos, q))) continue;
        if (!g.inReach({ ...me, pos: q, mode: "pull" }, w) || b.lineTiles(q, w.pos).some((t) => g.lawWater(t))) continue;
        const d = Math.hypot(q.x - me.pos.x, q.y - me.pos.y) + (cheb(q, c) > cheb(w.pos, c) ? 6 : 0);
        if (d < bestD) (bestD = d), (best = q);
      }
    return best;
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
    if (this.kidsScore() >= GRANNY.target - 1 && this.holdWisp === null) {
      const near = g.wisps.find((w) => w.guild === 0 && this.stepsOut(w) <= GRANNY.holdAt);
      if (near) {
        // She stones every wisp they have in play, a line of earth from her lantern to each.
        for (const w of g.wisps) {
          if (w.guild !== 0) continue;
          g.rooted.set(w.id, HESTA_ID);
          w.target = null;
          w.rimTicks = 0;
        }
        {
          this.holdWisp = near.id;
          this.holdTick = g.tick;
          // Everything still waiting goes, so the hold plays clean: all but the tide exchange,
          // which must land (Hesta has to have seen the tide pull before she answers it with rock).
          const TIDE_LINES = ["How did you do that?", "I pulled.", "Did you now."];
          this.queue = this.queue.filter((q) => TIDE_LINES.includes(q.line.text));
          this.busyUntil = Math.min(this.busyUntil, g.tick + 2);
          this.say(NELL, "No fair!", { player: KID_IDS[0] }, "key");
          this.say(SEFA, "That's cheating!", { player: KID_IDS[1] }, "key");
          this.say(LUMI, "You can't do that!", { talk: true });
          this.say(HESTA, "You did it on the pond. Yours is water. Mine's rock.", { talk: true });
          // Still 3.2 under the pair: the second cross-fades the same picture in place.
          this.say(LUMI, "Dad hasn't got one.", { talk: true, ...(this.stillsOn ? { still: { id: "r3-2" } } : {}) });
          this.say(HESTA, "No. Your father does it the hard way.", { talk: true, ...(this.stillsOn ? { still: { id: "r3-2", seq: true } } : {}) });
        }
      }
    }
    // The first time the player's pull stops at the pond's edge: Hesta states the law.
    if (PLAYER_IS_ROOK && !this.said.has("bank") && g.bankStops.some((b) => b.player === YOU)) {
      this.said.add("bank");
      this.say(HESTA, "It takes water to hold water, Rook. Go round.", { player: HESTA_ID }, "key");
    }
    // Lumi's tide pull, in front of everyone: Hesta notices.
    if (this.tideSeen < 0 && g.drifting > 0) {
      this.tideSeen = g.tick;
      this.say(SEFA, "How did you do that?", { player: KID_IDS[1] }, "key");
      this.say(LUMI, "I pulled.", { player: LUMI_ID }, "key");
      this.say(HESTA, "Did you now.", { player: HESTA_ID }, "key");
    }
    // The children guess her age in the opening, before the first push.
    // One exchange each, line after line: nothing else scripted starts until it's done.
    const age: [string, string, number][] = [
      [SEFA, "Are you a hundred?", KID_IDS[1]],
      [HESTA, "Higher.", HESTA_ID],
      [NELL, "A hundred and ten?", KID_IDS[0]],
      [HESTA, "Higher.", HESTA_ID],
      [LUMI, "She's distracting you. Eyes on the wisp.", LUMI_ID],
      [HESTA, "Is it working?", HESTA_ID],
    ];
    if (g.tick === GRANNY.ageAt) for (const [who, text, id] of age) this.say(who, text, { player: id }, "key");
    // "She's not even running!": the first time she leads by two (story thread), so it lands on her
    // lead and not on the clock. Most games she never gets two ahead, so past the old time it goes
    // the first time she leads at all, and at twice that time whatever the score, so it's never lost.
    const ahead = this.hestaScore() - this.kidsScore();
    const runningNow = ahead >= 2 || (ahead >= 1 && g.tick >= GRANNY.runningAt) || g.tick >= GRANNY.runningAt * 2;
    // Never at match point or after the hold: that moment has its own exchange.
    if (runningNow && g.tick > GRANNY.ageAt + 10 && this.kidsScore() < GRANNY.target - 1 && this.holdWisp === null && !this.said.has("running") && !this.keyTalking()) {
      this.said.add("running");
      this.say(SEFA, "She's not even running!", { player: KID_IDS[1] }, "key");
      this.say(HESTA, "Why would I run? You're all coming to me.", { player: HESTA_ID }, "key");
    }
    // Their banks: drawn pushes (bait), and her one line of real praise.
    // Nell and Sefa call how many they still need.
    if (g.banks.some((b) => b.guild === 0)) {
      const left = GRANNY.target - this.kidsScore();
      if (left > 0 && this.holdWisp === null) {
        const kid = this.scoreTurn++ % 2;
        this.say(kid ? SEFA : NELL, `${left === 1 ? "One more" : `${WORDS[left] ?? left} more`}!`, { player: KID_IDS[kid] });
      }
    }
    for (const b of g.banks) {
      if (b.guild !== 0) continue;
      if (this.pushTicks.some((t) => g.tick - t <= GRANNY.baitWindow)) {
        this.baits++;
        this.pushTicks = [];
      }
      if (PLAYER_IS_ROOK && this.lastHolder.get(b.wisp) === YOU && !this.said.has("my dad")) {
        this.said.add("my dad");
        this.say(LUMI, "That's my dad.", { player: LUMI_ID }, "key");
        this.say(HESTA, "So I hear.", { player: HESTA_ID }, "key");
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
    // Her tenth ends it, once the exchange at the hold has finished.
    if (this.hestaScore() >= GRANNY.target && !(this.holdWisp !== null && this.talking())) return this.finish();
    if (g.finished) return this.finish();
  }

  private finish() {
    // Nothing waiting plays after the end: the closing lines are the end's own.
    this.queue = [];
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

  /**
   * A line. One plays at a time, paced by how long it takes to say (its voice clip, or reading
   * time), so nothing talks over anything else. Lines said together on one tick are an exchange:
   * once its first line starts, the rest follow. `kind`:
   * - "key": always plays, however long it waits (the dialog, and the scripted exchanges).
   * - "quip": dropped if it can't start within `quipWait` ticks, so nothing plays late.
   * - "chatter": Lumi's calls to the others: only into silence, and never near a key line.
   */
  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, kind: "key" | "quip" | "chatter" = how.talk ? "key" : "quip") {
    // Nell and Sefa are read, not heard, in this run (Ladi, 25 Nov).
    const line = { who, text, ...how, ...(who === NELL || who === SEFA ? { quiet: true } : {}) };
    if (this.phase !== "playing") return void this.lines.push(line);
    const now = this.game.tick;
    if (kind === "chatter" && (this.talking() || now - this.lastKey < GRANNY.quietAround)) return;
    const last = this.queue[this.queue.length - 1];
    const group = last && last.trigger === now ? last.group : ++this.groupN;
    this.queue.push({ line, trigger: now, key: kind === "key", group });
    this.due();
  }
  private groupN = 0;

  /** Is a line playing, or waiting to? */
  private talking() {
    return this.queue.length > 0 || this.game.tick < this.busyUntil;
  }

  /** Is a key line playing or waiting? Her scripted beats hold off until it's done. */
  private keyTalking() {
    return this.queue.some((q) => q.key) || (this.busyKey && this.game.tick < this.busyUntil);
  }

  /** Start the next line, if the last is done. */
  private due() {
    const now = this.game.tick;
    while (this.queue.length && now >= this.busyUntil) {
      const q = this.queue.shift()!;
      const late = !q.key && !this.started.has(q.group) && now - q.trigger > GRANNY.quipWait;
      if (late || this.dropped.has(q.group)) {
        this.dropped.add(q.group);
        continue;
      }
      this.started.add(q.group);
      this.lines.push(q.line);
      this.busyUntil = now + lineTicks(q.line);
      this.busyKey = q.key;
      if (q.key) this.lastKey = now;
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

type Pending = { line: StoryLine; trigger: number; key: boolean; group: number };

/** Ticks a line takes: its voice clip if it has one, or the time the box or bubble shows it, and a breath. */
export function lineTicks(l: StoryLine) {
  const voice = VOICE_SECONDS[`${l.who}|${l.text}`] ?? 0;
  const n = l.text.length;
  const read = l.talk ? n / 50 + Math.max(1.8, n * 0.045) : Math.max(2, n * 0.06);
  return Math.ceil((Math.max(voice + 0.4, read) * 1000) / TICK_MS);
}

export function moveWisp(w: Wisp, at: Pt) {
  w.pos = w.prev = at;
  w.target = null;
  w.holder = null;
  w.grip = Grip.Free;
  w.skate = null;
  w.rimTicks = 0;
}

export function cleanAction(raw: unknown, game: Game): Action | undefined {
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
