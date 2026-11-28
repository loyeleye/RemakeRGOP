// Optional run 3a, Moss Hollow, the moss job (Garrick), played in the page
// (gameplay/optional-runs-prototype-brief.md, card O3a). Rook, with Lumi to send; Garrick by his
// fire; Hesta a voice. Nine for the brazier.
// Moss grows over a wisp that lies still. A wisp under moss cannot be pulled: each tap on it is a
// stroke that cuts the moss back one, and when it is cut away the wisps under it are bare again.
// The limit: Lumi counts the strokes, so many for the whole job. A pull is not a stroke. The
// choice: cut into a thick old patch that holds several at once, or run for the bare singles before
// the moss takes them. Lumi, sent (the Send button, then a tap), tears at the moss with her hands:
// slowly, and only twice. Numbers are in MOSS (src/engine/mosshollow.ts).

import { DIRS, Mover, Tile, cheb, pt, samePt, type Pt } from "../engine/board.js";
import { botCommand, type BotStyle } from "../engine/bot.js";
import { Game, Rng, TICK_MS, type Guild, type Wisp } from "../engine/game.js";
import { shrineById } from "../engine/maps.js";
import { MOSS, mossWord } from "../engine/mosshollow.js";
import type { ClientMsg, Phase, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { cleanAction, lineTicks, moveWisp } from "./granny.js";
import { realClock, type Clock } from "./room.js";

const YOU = 1, LUMI_ID = 2, GARRICK_ID = 3;
const ROOK = "Rook", LUMI = "Lumi", GARRICK = "Garrick", HESTA = "Hesta";
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** How the stand-in pulls: a careful hand, no pushing. */
const PULLER: BotStyle = { pushy: 0, sloppiness: 0 };

/**
 * A stand-in for the player, for the sums. "smart" takes a bare one while it is bare, and cuts
 * where a stroke frees the most, counting first (so not the thick patch that hides one), and sends
 * Lumi to the old patch; "solo" does the same and never sends her; "singles" never cuts into a
 * patch; "blind" cuts the nearest moss, whatever it hides; "thick" cuts the thickest first;
 * "idle" stands by the fire.
 */
export type Stand = "smart" | "solo" | "singles" | "blind" | "thick" | "idle";

/** Moss over one or more wisps: they lie where they are until it is cut away. */
interface Cover {
  id: number;
  wisps: number[];
  tiles: Pt[];
  hp: number;
  of: number;
  /** One that grew over a lone wisp in play (it thickens), or one there from the start. */
  single: boolean;
  old: boolean;
  /** When it last thickened. */
  grew: number;
}

export class MossRoom {
  /** His best so far (wisps for the brazier in one job), and jobs done: the page keeps them between visits. */
  best = 0;
  count = 0;
  /** A stand-in plays the player's part (the sums). */
  stand: Stand | null = null;

  private send: ((m: ServerMsg) => void) | null = null;
  private phase: Phase = "countdown";
  private countdown = 0;
  private game!: Game;
  private rng: Rng;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  private end: StoryView["end"];
  private said = new Set<string>();
  private queue: { line: StoryLine; trigger: number; key: boolean; land?: number }[] = [];
  private busyUntil = 0;
  private captions: { who: string; text: string; until: number }[] = [];

  private covers: Cover[] = [];
  private nextCover = 0;
  /** How long each bare wisp has lain still and unheld, and where. */
  private still = new Map<number, { at: Pt; n: number }>();
  /** Wisps not yet up, and gone for good (banked). */
  private waiting: number[] = [];
  private gone = new Set<number>();
  private risen = 0;
  private taken = 0;
  private strokes = 0;
  /** A stroke he is on his way to make: the cover he tapped, out of his reach. */
  private pending: number | null = null;
  /** The stand-in's wisp, while it walks to its spot. */
  private walkingFor: number | null = null;
  private chip: { x: number; y: number; tick: number; by: "rook" | "lumi" } | null = null;
  /** Lumi: where she was sent, and when she last tore. */
  private sentTo: Pt | null = null;
  private tore = 0;
  private idleThere = 0;
  private record: { best: number; was: number; won: boolean; count: number } | null = null;
  /** The sums: strokes on each kind of moss, wisps freed by Lumi, sends, and wisps taken bare. */
  private tally = { sends: 0, lumiFreed: 0, cut: 0, cutSingles: 0, cutPatches: 0, bare: 0, crept: 0 };

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
      case "call":
        if (this.phase === "playing" && !this.stand) this.sendLumi(pt(Math.floor(Number(msg.x)), Math.floor(Number(msg.y))));
        return;
      case "act": {
        if (this.phase !== "playing" || this.stand) return;
        const action = cleanAction(msg.action, this.game);
        if (action?.kind === "staff") {
          const c = this.coverOf(action.wisp);
          if (c) return void this.strike(c);
        }
        this.pending = null;
        this.game.command(YOU, { action, toggleRun: !!msg.toggleRun });
        return;
      }
    }
  }

  begin() {
    this.end = undefined;
    this.rng = new Rng(this.seed());
    const shrine = shrineById(MOSS.shrine);
    const roster = [
      { id: YOU, guild: 0 as Guild, name: ROOK },
      { id: LUMI_ID, guild: 0 as Guild, name: LUMI },
      { id: GARRICK_ID, guild: 0 as Guild, name: GARRICK },
    ];
    const all = MOSS.patches.reduce((a, p) => a + p.n, 0) + MOSS.mossed.length + MOSS.bare.length + MOSS.rise.n + 2;
    const g = (this.game = new Game(shrine, roster, this.seed(), [all, 0], 100000));
    const b = g.board, c = b.center;
    g.pullReach = MOSS.reach;
    g.reachRule = (p, w) => cheb(p.pos, w.pos) <= MOSS.reach;
    // The board's own tufts (run 4's) are not this job's: the moss here is on the wisps.
    for (let i = 0; i < b.tiles.length; i++) if (b.tiles[i] === Tile.Moss) while (g.tearMoss(pt(i % b.width, Math.floor(i / b.width))));
    const place = (id: number, [x, y]: readonly [number, number]) => {
      const p = this.player(id);
      p.pos = p.prev = pt(c.x + x, c.y + y);
    };
    place(YOU, MOSS.rook);
    place(LUMI_ID, MOSS.lumi);
    place(GARRICK_ID, MOSS.garrick);
    this.player(YOU).run = true;
    this.player(LUMI_ID).run = true;
    for (const w of g.wisps) g.away.set(w.id, 1e9);
    this.waiting = g.wisps.map((w) => w.id);
    this.gone = new Set();
    this.covers = [];
    this.nextCover = 0;
    this.still = new Map();
    this.risen = 0;
    this.taken = 0;
    this.strokes = 0;
    this.pending = null;
    this.walkingFor = null;
    this.chip = null;
    this.sentTo = null;
    this.tore = 0;
    this.idleThere = 0;
    this.tally = { sends: 0, lumiFreed: 0, cut: 0, cutSingles: 0, cutPatches: 0, bare: 0, crept: 0 };
    // The patches, the mossed singles and the bare ones there at the start.
    const at = ([x, y]: readonly [number, number]) => pt(c.x + x, c.y + y);
    for (const p of MOSS.patches) {
      const tiles = [pt(0, 0), pt(1, 0), pt(0, 1), pt(1, 1)].slice(0, p.n).map((o) => pt(c.x + p.at[0] + o.x, c.y + p.at[1] + o.y));
      this.cover(tiles.map((t) => this.up(t)!), p.cover, false, !!p.old);
    }
    for (const m of MOSS.mossed) this.cover([this.up(at(m))!], MOSS.mossedCover, false, false);
    for (const s of MOSS.bare) this.up(at(s));
    this.record = null;
    this.said = new Set();
    this.queue = [];
    this.busyUntil = 0;
    this.phase = "countdown";
    // Hesta's route, Garrick's hello and his goal, then Lumi's count: the goal and the count stay up as captions.
    const goal = `${cap(mossWord(MOSS.target))} for the brazier, Rook, and I'll call it done.`;
    const count = `${cap(mossWord(MOSS.strokes))} strokes. I'm counting. Don't chip it.`;
    const before = this.lines.length;
    this.say(HESTA, "Moss Hollow and straight home. Don't let Garrick feed you.", { talk: true });
    this.say(GARRICK, "Back already? It grew while you were gone.", { player: GARRICK_ID });
    this.say(GARRICK, goal, { talk: true });
    this.say(LUMI, count, { player: LUMI_ID });
    this.countdown = MOSS.bellTicks + this.lines.slice(before).reduce((n, l) => n + lineTicks(l), 0);
    this.captions = [
      { who: GARRICK, text: goal, until: MOSS.goalTicks },
      { who: LUMI, text: count, until: MOSS.goalTicks },
    ];
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
    this.grow();
    if (this.stand) this.steerYou();
    this.goStrike();
    this.steerLumi();
    g.step();
    this.afterStep();
    if (this.phase === "playing") this.due();
    this.flush();
    if (this.phase === "playing") this.broadcastTick();
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }
  private rel(p: Pt) {
    const c = this.game.board.center;
    return { x: p.x - c.x, y: p.y - c.y };
  }
  private loose() {
    const g = this.game;
    return g.wisps.filter((w) => !g.away.has(w.id));
  }
  private coverOf(id: number) {
    return this.covers.find((c) => c.hp > 0 && c.wisps.includes(id));
  }
  /** Bare: out, and under no moss. */
  private bare() {
    return this.loose().filter((w) => !this.coverOf(w.id));
  }
  private strokesLeft() {
    return Math.max(0, MOSS.strokes - this.strokes);
  }
  private sendsLeft() {
    return Math.max(0, MOSS.lumiSends - this.tally.sends);
  }

  // ---------------------------------------------------------------- the moss

  /** One comes up on a tile (the next not yet up). */
  private up(at: Pt): Wisp | undefined {
    const g = this.game, id = this.waiting.shift();
    if (id === undefined) return undefined;
    const w = g.wisps[id]!;
    g.away.delete(id);
    moveWisp(w, at);
    this.still.set(id, { at, n: 0 });
    return w;
  }

  private cover(ws: Wisp[], hp: number, single: boolean, old: boolean) {
    const c: Cover = { id: this.nextCover++, wisps: ws.map((w) => w.id), tiles: ws.map((w) => w.pos), hp, of: hp, single, old, grew: this.game?.tick ?? 0 };
    for (const w of ws) moveWisp(w, w.pos);
    this.covers.push(c);
    return c;
  }

  /** New bare ones come up out in the glade; moss takes a bare one that lies still; a single's moss thickens. */
  private grow() {
    const g = this.game, b = g.board, c = b.center, R = MOSS.rise;
    if (this.risen < R.n && g.tick > 0 && g.tick % R.every === 0) {
      const taken = (q: Pt) => this.loose().some((w) => cheb(w.pos, q) <= 1) || g.players.some((p) => cheb(p.pos, q) <= 2);
      const spots = g.shrine.spawnField.filter((q) => cheb(q, c) >= R.far && b.tile(q) === Tile.Floor && !b.inBankZone(q) && !taken(q));
      const q = spots[this.rng.int(spots.length)];
      if (q && this.up(q)) this.risen++;
    }
    for (const cv of this.covers) {
      if (!cv.single || cv.hp <= 0 || cv.hp >= MOSS.singleMax || g.tick - cv.grew < MOSS.thicken) continue;
      cv.hp++;
      cv.of = Math.max(cv.of, cv.hp);
      cv.grew = g.tick;
    }
  }

  /** After each tick: covered wisps lie where they are; a bare one lying still is counted toward the moss taking it. */
  private creep() {
    const g = this.game, me = this.player(YOU);
    for (const cv of this.covers) if (cv.hp > 0) cv.wisps.forEach((id, i) => g.wisps[id]!.pos.x === cv.tiles[i]!.x && g.wisps[id]!.pos.y === cv.tiles[i]!.y ? ((g.wisps[id]!.target = null), (g.wisps[id]!.holder = null)) : moveWisp(g.wisps[id]!, cv.tiles[i]!));
    for (const w of this.bare()) {
      const s = this.still.get(w.id) ?? { at: w.pos, n: 0 };
      const held = me.beam === w.id || !!w.target || !!w.skate;
      s.n = held || !samePt(s.at, w.pos) || g.board.inBankZone(w.pos) ? 0 : s.n + 1;
      s.at = w.pos;
      this.still.set(w.id, s);
      if (s.n >= MOSS.creep) {
        this.cover([w], 1, true, false);
        this.tally.crept++;
        if (me.action.kind === "staff" && me.action.wisp === w.id) g.command(YOU, { action: { kind: "idle" } });
      }
    }
  }

  /** His staff on moss: a stroke, now if it is in reach, or when he gets there. */
  private strike(cv: Cover) {
    const g = this.game, me = this.player(YOU);
    if (this.strokesLeft() <= 0) {
      this.hint("out", "", "No strokes left. Lumi has counted them all.");
      return;
    }
    this.hint("moss", "", "Moss holds it. Each stroke cuts it back one, and Lumi counts every stroke. A pull is not a stroke.");
    if (this.inReach(me.pos, cv)) return void this.cut(cv, "rook");
    // Out of reach: he goes to it, and strikes when it is.
    this.pending = cv.id;
    const near = this.game.wisps[cv.wisps[0]!]!.pos;
    g.command(YOU, { action: { kind: "walk", to: near } });
  }

  private inReach(from: Pt, cv: Cover) {
    const b = this.game.board;
    return cv.tiles.some((t) => cheb(from, t) <= MOSS.reach && b.canSee(from, t));
  }

  /** On his way to strike: once it is in reach, he stops and strikes. */
  private goStrike() {
    if (this.pending === null) return;
    const g = this.game, me = this.player(YOU), cv = this.covers.find((c) => c.id === this.pending);
    if (!cv || cv.hp <= 0) return void (this.pending = null);
    if (!this.inReach(me.pos, cv)) {
      if (me.action.kind !== "walk") g.command(YOU, { action: { kind: "walk", to: g.wisps[cv.wisps[0]!]!.pos } });
      return;
    }
    this.pending = null;
    g.command(YOU, { action: { kind: "idle" } });
    if (this.strokesLeft() > 0) this.cut(cv, "rook");
  }

  /** One stroke (or one tear of Lumi's) off a cover; cut away, its wisps are bare. */
  private cut(cv: Cover, by: "rook" | "lumi") {
    const g = this.game;
    const r = this.rel(cv.tiles[0]!);
    this.chip = { x: r.x, y: r.y, tick: g.tick, by };
    if (by === "rook") {
      this.strokes++;
      this.tally.cut++;
      if (cv.single) this.tally.cutSingles++;
      else this.tally.cutPatches++;
      if (!cv.single && cv.of >= 3 && !this.said.has("thick")) {
        this.said.add("thick");
        this.say(HESTA, "The thick patch hides three, Rook. Count before you cut.", {}, true, MOSS.landTicks);
      }
      if (this.strokesLeft() === 5 && MOSS.strokes > 5 && !this.said.has("five")) {
        this.said.add("five");
        this.say(LUMI, "Five left. Choose.", { player: LUMI_ID }, true, MOSS.landTicks);
      }
    }
    cv.hp--;
    if (cv.hp > 0) return;
    for (const id of cv.wisps) {
      if (by === "lumi") this.tally.lumiFreed++;
      this.still.set(id, { at: g.wisps[id]!.pos, n: 0 });
    }
    if (cv.old && !this.said.has("old")) {
      this.said.add("old");
      this.say(GARRICK, "That's the old patch. Good.", { player: GARRICK_ID }, true);
    }
  }

  private hint(key: string, who: string, text: string) {
    if (this.said.has(key)) return;
    this.said.add(key);
    // [placeholder wording, the build thread's, for the story thread]
    this.captions.push({ who, text, until: this.game.tick + MOSS.landTicks });
  }

  // ---------------------------------------------------------------- Lumi

  /** Send Lumi to a tile: beside the moss nearest it, if there is moss near it. */
  sendLumi(to: Pt) {
    const g = this.game, b = g.board;
    if (!b.inside(to) || this.sendsLeft() <= 0) return;
    const lumi = this.player(LUMI_ID);
    const cv = this.covers.filter((c) => c.hp > 0 && c.tiles.some((t) => cheb(t, to) <= 2)).sort((x, y) => cheb(x.tiles[0]!, to) - cheb(y.tiles[0]!, to))[0];
    const want = cv ? cv.tiles : [to];
    const from = b.walkPath(lumi.pos, want[0]!);
    void from;
    let spot: Pt | null = null, best = 1e9;
    for (const t of want)
      for (const d of [pt(0, 0), ...DIRS, pt(1, 1), pt(-1, 1), pt(1, -1), pt(-1, -1)]) {
        const q = pt(t.x + d.x, t.y + d.y);
        if (!b.inside(q) || !b.passable(q, Mover.Walker) || this.loose().some((w) => samePt(w.pos, q)) || g.players.some((p) => p.id !== LUMI_ID && samePt(p.pos, q))) continue;
        const k = cheb(q, lumi.pos) + (cv ? 0 : cheb(q, to) * 10);
        if (k < best) (best = k), (spot = q);
      }
    if (!spot) return;
    this.sentTo = spot;
    this.idleThere = 0;
    this.tally.sends++;
    g.command(LUMI_ID, { action: { kind: "walk", to: spot } });
    this.flush();
    this.broadcastRoom();
  }

  private steerLumi() {
    const g = this.game, me = this.player(LUMI_ID);
    if (!this.sentTo) {
      // By his side.
      const rook = this.player(YOU);
      if (cheb(me.pos, rook.pos) > 3 && me.action.kind !== "walk") g.command(LUMI_ID, { action: { kind: "walk", to: rook.pos } });
      else if (cheb(me.pos, rook.pos) <= 1 && me.action.kind === "walk") g.command(LUMI_ID, { action: { kind: "idle" } });
      return;
    }
    if (!samePt(me.pos, this.sentTo)) {
      if (!(me.action.kind === "walk" && samePt(me.action.to, this.sentTo))) g.command(LUMI_ID, { action: { kind: "walk", to: this.sentTo } });
      return;
    }
    // There: she tears at the moss beside her, slowly; with none left there she comes back to him.
    const cv = this.covers.filter((c) => c.hp > 0 && c.tiles.some((t) => Math.hypot(t.x - me.pos.x, t.y - me.pos.y) <= MOSS.lumiNear)).sort((x, y) => x.hp - y.hp)[0];
    if (!cv) {
      if (++this.idleThere >= 2) this.sentTo = null;
      return;
    }
    this.idleThere = 0;
    if (g.tick - this.tore < MOSS.lumiTear) return;
    this.tore = g.tick;
    if (!this.said.has("lumimoss")) {
      this.said.add("lumimoss");
      this.say(LUMI, "Moss is mine.", { player: LUMI_ID });
    }
    this.cut(cv, "lumi");
  }

  // ---------------------------------------------------------------- after each tick

  private afterStep() {
    const g = this.game;
    // Banked at the fire: for Garrick, and gone.
    for (const k of g.banks) {
      if (this.gone.has(k.wisp)) continue;
      this.gone.add(k.wisp);
      this.taken++;
      this.tally.bare++;
      g.away.set(k.wisp, 1e9);
    }
    g.scores[0] = this.taken;
    this.creep();
    if (this.taken >= MOSS.target) return this.finish();
    // Out of strokes with nothing bare to pull (and nothing on its way in), or nothing left at all.
    const inFlight = this.bare().some((w) => !!w.target || !!w.skate || this.player(YOU).beam === w.id);
    const lumiAt = this.sentTo !== null;
    // Nothing bare and nothing coming: done once no moss left can be cut away with the strokes there are.
    const stuck = !this.bare().length && !inFlight && !lumiAt && this.risen >= MOSS.rise.n && this.covers.every((c) => c.hp <= 0 || c.hp > this.strokesLeft());
    if ((this.strokesLeft() <= 0 && !this.bare().length && !inFlight && !lumiAt) || stuck) return this.finish();
    if (g.tick >= MOSS.giveUp) this.finish();
  }

  private finish() {
    this.queue = [];
    this.phase = "results";
    const n = Math.min(MOSS.target, this.taken), won = n >= MOSS.target;
    this.record = { best: Math.max(this.best, n), was: this.best, won, count: this.count + 1 };
    this.end = {
      banked: n,
      kes: 0,
      summary: won ? `${cap(mossWord(MOSS.target))} for the brazier.` : `${cap(mossWord(n))} of ${mossWord(MOSS.target)} for the brazier.`,
      lines: won
        ? [{ who: GARRICK, text: "That's the jar I owe her. Lumi, you carry it. Your father drops things." }]
        : [
            // Lumi's "I said" only when it was the strokes that ran short.
            ...(this.game.tick < MOSS.giveUp ? [{ who: LUMI, text: `That's ${mossWord(this.strokes)}. I said.` }] : []),
            { who: GARRICK, text: "Come back when it's dried out." },
          ],
    };
    this.best = this.record.best;
    this.count++;
    this.endClock();
    this.broadcastRoom();
    this.broadcastTick();
  }

  // ---------------------------------------------------------------- the player's stand-in

  private steerYou() {
    const g = this.game, me = this.player(YOU), b = g.board;
    if (this.stand === "idle") return;
    if (this.pending !== null) return;
    // Lumi first, to the old patch, and the next thickest patch when she is back.
    if (this.stand === "smart" && !this.sentTo && this.sendsLeft() > 0) {
      const her = this.covers.filter((c) => c.hp > 0 && !c.single && c.wisps.length >= 2).sort((x, y) => y.hp - x.hp)[0];
      if (her && (this.tally.sends === 0 || her.hp >= 2)) this.sendLumi(her.tiles[0]!);
    }
    // Keep hold of one coming in (or walking to its spot): the bot decides when it is done.
    const held = me.action.kind === "staff" ? g.wisps[me.action.wisp] : undefined;
    if (held && !g.away.has(held.id) && !this.coverOf(held.id) && !b.inBankZone(held.pos)) return void this.pullAs(held);
    if (me.action.kind === "walk" && this.walkingFor !== null && !g.away.has(this.walkingFor) && !this.coverOf(this.walkingFor)) return void this.pullAs(g.wisps[this.walkingFor]!);
    const walkTo = (p: Pt) => Math.max(0, cheb(me.pos, p) - MOSS.reach) / 2;
    // A bare one that can be had before the moss takes it.
    const bare = this.bare()
      .filter((w) => !b.inBankZone(w.pos))
      .map((w) => ({ w, t: walkTo(w.pos), left: MOSS.creep - (this.still.get(w.id)?.n ?? 0) }))
      .filter((o) => this.stand === "blind" || this.stand === "thick" || o.t < o.left)
      .sort((x, y) => x.t - y.t || cheb(x.w.pos, me.pos) - cheb(y.w.pos, me.pos));
    const lumi = this.player(LUMI_ID);
    const hers = (c: Cover) => !!this.sentTo && c.tiles.some((t) => Math.hypot(t.x - lumi.pos.x, t.y - lumi.pos.y) <= MOSS.lumiNear + 2);
    const moss = this.covers.filter((c) => c.hp > 0 && c.hp <= this.strokesLeft() && !hers(c));
    let pick: Cover | undefined;
    if (this.stand === "blind") {
      const near = [...moss].sort((x, y) => cheb(x.tiles[0]!, me.pos) - cheb(y.tiles[0]!, me.pos))[0];
      if (near && (!bare[0] || cheb(near.tiles[0]!, me.pos) < cheb(bare[0].w.pos, me.pos))) pick = near;
    } else if (this.stand === "thick") {
      pick = [...moss].sort((x, y) => y.hp - x.hp || cheb(x.tiles[0]!, me.pos) - cheb(y.tiles[0]!, me.pos))[0];
    } else if (!bare.length) {
      const ok = this.stand === "singles" ? moss.filter((c) => c.single) : moss;
      // Where a stroke frees the most: wisps for strokes, and a little for the walk.
      pick = ok.sort((x, y) => y.wisps.length / y.hp - x.wisps.length / x.hp || walkTo(x.tiles[0]!) - walkTo(y.tiles[0]!))[0];
    }
    if (pick) return void this.strikeAs(pick);
    const w = bare[0]?.w;
    if (w) {
      this.walkingFor = w.id;
      return void this.pullAs(w);
    }
    this.walkingFor = null;
    // Nothing to do: back toward the middle of the glade.
    const home = pt(b.center.x + MOSS.rook[0], b.center.y + MOSS.rook[1]);
    if (!samePt(me.pos, home) && me.action.kind !== "walk") g.command(YOU, { action: { kind: "walk", to: home } });
  }

  /** The stand-in brings one in as a bot would: from a spot where its pull ends on the rim. */
  private pullAs(w: Wisp) {
    const g = this.game, hid = this.loose().filter((o) => o !== w);
    for (const o of hid) g.away.set(o.id, 1);
    const cmd = botCommand(g, YOU, PULLER, () => this.rng.next());
    for (const o of hid) g.away.delete(o.id);
    if (cmd) g.command(YOU, cmd);
  }

  private strikeAs(cv: Cover) {
    if (this.strokesLeft() <= 0) return;
    if (this.inReach(this.player(YOU).pos, cv)) this.cut(cv, "rook");
    else {
      this.pending = cv.id;
      this.game.command(YOU, { action: { kind: "walk", to: this.game.wisps[cv.wisps[0]!]!.pos } });
    }
  }

  // ---------------------------------------------------------------- wire

  /** A line. One plays at a time. `key` lines always play, in order; a quip that cannot start at once is dropped. `land`: it also stays up as a caption that many ticks. */
  private say(who: string, text: string, how: Omit<StoryLine, "who" | "text"> = {}, key = !!how.talk, land?: number) {
    const line = { who, text, ...how };
    if (this.phase !== "playing") return void this.lines.push(line);
    if (!key && this.talking()) return;
    this.queue.push({ line, trigger: this.game.tick, key, land });
    this.due();
  }

  private talking() {
    return this.queue.length > 0 || this.game.tick < this.busyUntil;
  }

  private due() {
    const now = this.game.tick;
    while (this.queue.length && now >= this.busyUntil) {
      const q = this.queue.shift()!;
      this.lines.push(q.line);
      this.busyUntil = now + lineTicks(q.line);
      if (q.land) this.captions.push({ who: q.line.who, text: q.line.text, until: now + q.land });
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
    const g = this.game, now = g.tick;
    const caption = this.phase === "playing" ? this.captions.filter((c) => now < c.until).map((c) => ({ who: c.who, text: c.text })) : [];
    const moss = this.covers.filter((c) => c.hp > 0).flatMap((c) => c.tiles.map((t) => ({ ...this.rel(t), hp: c.hp, of: c.of, patch: c.id })));
    return {
      run: MOSS.run,
      movement: 0,
      title: MOSS.title,
      ring: null,
      mark: null,
      kes: 0,
      end: this.end,
      canCall: this.phase === "playing" && this.sendsLeft() > 0 && !this.sentTo,
      callWho: LUMI,
      called: this.sentTo,
      opt: {
        id: MOSS.id,
        noPush: true,
        strip: [
          { label: "For Garrick", n: Math.min(MOSS.target, this.taken), of: MOSS.target, tone: "us" },
          { label: this.strokesLeft() === 1 ? "Last stroke" : "Strokes", n: this.strokesLeft(), of: MOSS.strokes, tone: "chalk" },
          { label: "Send Lumi", n: this.sendsLeft(), of: MOSS.lumiSends, tone: "water" },
        ],
        ...(caption.length ? { caption } : {}),
        reach: MOSS.reach,
        moss,
        ...(this.chip ? { chip: this.chip } : {}),
        ...(this.record ? { record: { id: MOSS.id, best: this.record.best, won: this.record.won, count: this.record.count } } : {}),
      },
    };
  }

  view(): RoomView {
    const one = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: id === LUMI_ID ? ("frost" as const) : ("amber" as const), connected: true, bot: id !== YOU });
    return {
      code: "STORY",
      phase: this.phase,
      host: YOU,
      shrine: MOSS.shrine,
      teams: 2,
      players: [one(YOU, ROOK), one(LUMI_ID, LUMI), one(GARRICK_ID, GARRICK)],
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

  /** For tests and the sums. */
  get state() {
    return { phase: this.phase, game: this.game, end: this.end, taken: this.taken, strokes: this.strokes, tally: this.tally, record: this.record, sentTo: this.sentTo, covers: this.covers, risen: this.risen };
  }
}
