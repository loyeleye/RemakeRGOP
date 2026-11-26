// The free-walk test (gameplay/free-walk-test-brief.md): the home pond between run 2 and run 3.
// No wisps, no score, no clock. The player is Rook; Hesta, Nell and Sefa walk in and gather on the
// far side of the pool, and Lumi runs over to them. Tap someone (or Lumi's lantern, or Rook's house)
// and they say a line; tap Hesta and Granny's game starts from where everyone stands.
// Its own room, so it can grow into the home island if the test feels good.

import { Mover, Tile, pt, type Board, type Pt } from "../engine/board.js";
import { Game, Rng, TICK_MS, type Action, type Guild } from "../engine/game.js";
import { GRANNY } from "../engine/granny.js";
import { shrineById } from "../engine/maps.js";
import type { ClientMsg, RoomView, ServerMsg, StoryLine, StoryView } from "../engine/protocol.js";
import { GrannyRoom } from "./granny.js";
import { JobRoom } from "./job.js";
import { realClock, type Clock } from "./room.js";
import { walkByN, type Anchor, type Walk, type WalkPerson } from "../engine/walks.js";

// Same ids as Granny's game, so the handover keeps everyone where they stand.
const ROOK_ID = 1, LUMI_ID = 2, NELL_ID = 3, SEFA_ID = 4, HESTA_ID = 5;
const [NELL, SEFA] = GRANNY.children;

export const POND = {
  title: "The pond",
  /** Ticks between the lines of an offer (walk 3's first state), and between an idle line's first time and the next. */
  offerGap: 4,
  idleEvery: [6, 28] as [number, number],
  /** Ticks before Hesta and the children start walking in, and before Lumi runs over. */
  enterAt: 4,
  lumiAt: 12,
  /** Tap reach: within this many tiles (either way, diagonals count as one) they answer at once. */
  reach: 2,
  /** Granny's game starts with everyone this many tiles from the brazier's centre. */
  ring: 5,
  /** The walking map: the same island built as a place, not Granny's board. */
  shrine: "home-island",
  /** Ticks of fade between tapping Hesta and the cut to Granny's board. */
  leaveTicks: 2,
  /** Sefa's "We need four!", every this many ticks once they've gathered (and not while Rook is with them). */
  sefaEvery: 60,
  /** Wanderers in walks 2 to 5: ticks between strolls (min, max), how far from their place, and how near Rook stops them. */
  wander: { every: [8, 22] as const, range: 5, stopNear: 3 },
};

/**
 * Where things are on the board Granny's game plays on (worked out from it, so a bigger or
 * smaller pond still works): Rook and Lumi by the brazier, the way in off the north rim, the
 * gathering spot across the pool from the brazier, and Lumi's lantern on the pool's west shore.
 */
export function pondSpots(board: Board, starts: readonly Pt[][], house?: { x: number; y: number; w: number; h: number }) {
  const walk = (p: Pt) => board.passable(p, Mover.Walker);
  const water: Pt[] = [];
  // The pond is the water by the brazier: on the horseshoe island, the lesson pond cove, not the lake.
  const cx = board.center.x, cy = board.center.y;
  // A lake east of the brazier (the horseshoe): only the cove's rows count.
  const lakeSide = board.tile(pt(cx + 12, cy)) === Tile.Water && board.tile(pt(cx + 12, cy - 10)) === Tile.Water;
  for (let y = 0; y < board.height; y++)
    for (let x = 0; x < board.width; x++) if (board.tile(pt(x, y)) === Tile.Water && Math.abs(x - cx) <= 12 && Math.abs(y - cy) <= (lakeSide ? 5 : 12) && x - cx <= (lakeSide ? 10 : 12)) water.push(pt(x, y));
  const minX = Math.min(...water.map((p) => p.x)), maxX = Math.max(...water.map((p) => p.x));
  const minY = Math.min(...water.map((p) => p.y));
  const midY = Math.round(water.reduce((a, p) => a + p.y, 0) / water.length);
  const midX = Math.round((minX + maxX) / 2);
  /** The nearest open tile to `at`, searching outward. */
  const open = (at: Pt, taken: Pt[] = []): Pt => {
    for (let r = 0; r < 12; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const q = pt(at.x + dx, at.y + dy);
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && board.inside(q) && walk(q) && !taken.some((t) => t.x === q.x && t.y === q.y)) return q;
        }
    return at;
  };
  // Hesta at the head of the pool, the children either side of her, Lumi a step toward the brazier.
  const hesta = open(pt(midX, minY - 2));
  const nell = open(pt(hesta.x - 1, hesta.y + 1), [hesta]);
  const sefa = open(pt(hesta.x + 1, hesta.y + 1), [hesta, nell]);
  const lumiAt = open(pt(hesta.x - 2, hesta.y), [hesta, nell, sefa]);
  // The way in: up the path from the south, where Hesta lives (on a map without a neck, the north rim).
  const c = board.center;
  // (The horseshoe's basin lies south of the pond brazier: they come up its west shore instead.)
  const ex = [0, -8].find((dx) => walk(pt(c.x + dx, c.y + 24)));
  let top = 0;
  while (top < board.height && !walk(pt(c.x, top))) top++;
  const ey = ex !== undefined ? c.y + 24 : top;
  const ec = c.x + (ex ?? 0);
  const enter = [open(pt(ec - 1, ey)), open(pt(ec, ey), []), open(pt(ec + 1, ey))];
  const rook = open(starts[0]![0]!);
  // Lumi's lantern: by Rook's door if the island has his house (door on its east side), else on the pool's west shore.
  const lantern = house ? open(pt(house.x + house.w, doorY(house) + 1)) : open(pt(minX - 1, midY));
  return { rook, lumi: open(pt(rook.x - 1, rook.y), [rook]), enter, gather: { hesta, nell, sefa, lumi: lumiAt }, lantern };
}

/** Placeholder lines (the story thread will write them). Each tap gives the next one, round and round. */
const LINES: Record<string, string[]> = {
  Hesta: ["Well? Are you playing or not?"],
  Lumi: ["I'm captain. You're on my team.", "Dad. Come ON."],
  [NELL]: ["Lumi says you're good. Are you?", "I'm on Lumi's side. Always."],
  [SEFA]: ["We need four!", "Are you playing? Say yes."],
  lantern: ["Lumi's lantern. Still warm.", "She left it by the door. Again."],
  house: ["Home. Later.", "The kettle can wait."],
  falls: ["Just a dream."],
  skiff: ["Not today. Today's for the pond."],
  shrine: ["Mabry's door. Shut, this time of day."],
  stall: ["Orrin's stall. He's off somewhere, arguing."],
  "orrin-house": ["Orrin's workshop. Panes everywhere, and him nowhere."],
  "maudie-house": ["Maudie's door. Shut. Geraniums keeping watch."],
  "moth-house": ["Moth's door. His poles are gone, so he's out."],
  "mabry-house": ["Mabry's room. Bells, herbs, and a shut door."],
  "nell-house": ["Nell's family's house. Honey jars in the hatch."],
  "sefa-house": ["Sefa's family's house. Somebody's singing inside."],
  "wick-house": ["Wick's house. The ladder's up, so he's in the loft."],
  mooring: ["The boat. Nobody takes it out. Not till the Offering."],
  boat: ["The boat. Nobody takes it out. Not till the Offering."],
  "hesta-house": ["Granny's door. Shut. It always is."],
  chair: ["Her chair. Still warm."],
  kindling: ["The Kindling brazier. Burning steady."],
};

/** Whether a place of this kind says anything when tapped (the page gives only these a tap target). */
export const answersTap = (kind: string) => !!LINES[kind];

type Thing = { name: string; at: () => Pt };

export class PondRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private game!: Game;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  /** What Rook is walking up to, after a tap from afar. */
  private going: Thing | null = null;
  /** A tap that would start a run, waiting on his answer (the page asks "Play ...?"). Walking off is a no. */
  private asking: { text: string; choices: string[]; no: string; then: (pick: number) => void } | null = null;
  /** Things to do on a later tick: lines said one after another, a question after its lines. */
  private later: { at: number; f: () => void }[] = [];
  /** When each person with an idle line next says it. */
  private idleNext = new Map<string, number>();
  private taps = new Map<string, number>();
  private gatheredAt = -1;
  private lastSefa = -99;
  /** Once Hesta is tapped: Granny's game, which this room hands everything to. */
  /** The run the walk has gone on to (Granny's game from walks 1 and 2, the job from walk 2's skiff), played inside this room. */
  private inner: { room: GrannyRoom | JobRoom; conn: ReturnType<GrannyRoom["connect"]> } | null = null;
  private get granny() {
    return this.inner;
  }
  /** Which run the fade leads to. */
  private nextRun: 3 | 4 = 3;
  /** The tick Hesta was tapped: the screen fades, then the cut to her game. */
  private leavingAt = -1;
  /** Where everything is (see pondSpots). */
  spots!: ReturnType<typeof pondSpots>;

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
    /** Which walk (1 to 5): its light, who is about, and what's next. */
    walkN = 1,
  ) {
    this.walkDef = walkByN(walkN);
    // A walk that opens inside his house starts with the kitchen still up.
    if (this.walkDef.inside) this.kitchen = 1;
  }
  readonly walkDef: Walk;
  /** Where Rook starts instead of the walk's own start (back from a job, by the sky skiff: Ladi, 26 Nov). */
  startAt: Anchor | null = null;
  /**
   * A trial of Rook's speed on the walkable map (the page's ?walkspeed=1.5, 2 or 2.5): either the
   * map's whole beat is shortened, so he and everyone on it stay in step, or (with &only=rook) only
   * his stride is longer. Never inside a run.
   */
  beatMs = TICK_MS;
  rookStride = 1;
  /** Lines for this walk's people, by name. */
  private walkLines = new Map<string, string[]>();
  /** A note for the player once the thing that goes on is tapped, when what's next isn't built. */
  private notBuilt = false;
  /** Played as part of Part 1's chain: the walk's last tap hands on to the page, which opens what comes next. */
  chain = false;
  /** The walk's last tap was made (in the chain). */
  private done = false;
  /** An optional run asked for in the walk, for the page to open (counted, so each ask is seen once). */
  private optional: { id: string; n: number } | null = null;
  /** From walk 2, Rook's door opens the kitchen still (client side): the times he's gone in. */
  private kitchen = 0;

  connect(send: (m: ServerMsg) => void) {
    return {
      message: (raw: string) => {
        if (this.granny) return this.granny.conn.message(raw);
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
        this.granny?.conn.close();
      },
    };
  }

  private handle(msg: ClientMsg, send: (m: ServerMsg) => void) {
    switch (msg.t) {
      case "ping":
        return send({ t: "pong", at: Number(msg.at) || 0 });
      case "hello":
        this.send = send;
        send({ t: "welcome", you: ROOK_ID, token: "" });
        return this.begin();
      case "act":
        return this.act(msg);
      case "answer": {
        const a = this.asking;
        this.asking = null;
        if (a && msg.yes && !this.granny && this.leavingAt < 0) a.then(Math.max(0, Math.min(a.choices.length - 1, Math.floor(Number(msg.pick) || 0))));
        return this.broadcast();
      }
    }
  }

  begin() {
    if (this.walkDef.n !== 1) return this.beginWalk();
    const shrine = shrineById(POND.shrine);
    const roster = [
      { id: ROOK_ID, guild: 0 as Guild, name: "Rook" },
      { id: LUMI_ID, guild: 0 as Guild, name: "Lumi" },
      { id: NELL_ID, guild: 0 as Guild, name: NELL },
      { id: SEFA_ID, guild: 0 as Guild, name: SEFA },
      { id: HESTA_ID, guild: 1 as Guild, name: "Hesta" },
    ];
    // No wisps and a clock that never runs out: nothing happens unless the player does something.
    this.game = new Game(shrine, roster, this.seed(), [0, 0], 1e9);
    if (this.rookStride !== 1) this.game.stride.set(ROOK_ID, this.rookStride);
    const S = (this.spots = pondSpots(this.game.board, shrine.starts, shrine.house));
    const place = (id: number, at: Pt) => {
      const p = this.player(id);
      p.pos = p.prev = at;
    };
    place(ROOK_ID, S.rook);
    place(LUMI_ID, S.lumi);
    place(NELL_ID, S.enter[0]!);
    place(HESTA_ID, S.enter[1]!);
    place(SEFA_ID, S.enter[2]!);
    this.player(HESTA_ID).run = false;
    this.player(NELL_ID).run = this.player(SEFA_ID).run = false;
    this.endClock();
    this.stop = this.clock.every(this.beatMs, () => this.onTick());
    this.broadcast();
  }

  /** Walks 2 to 5: everyone already where they are, nothing scripted. */
  private beginWalk() {
    const W = this.walkDef;
    const shrine = shrineById(POND.shrine);
    const roster = [{ id: ROOK_ID, guild: 0 as Guild, name: "Rook" }, ...W.people.map((p, i) => ({ id: 10 + i, guild: (p.name === "Hesta" ? 1 : 0) as Guild, name: p.name }))];
    this.game = new Game(shrine, roster, this.seed(), [0, 0], 1e9);
    if (this.rookStride !== 1) this.game.stride.set(ROOK_ID, this.rookStride);
    this.spots = pondSpots(this.game.board, shrine.starts, shrine.house);
    this.gatheredAt = 1e9;
    const taken: Pt[] = [];
    const put = (id: number, a: Anchor, off?: [number, number]) => {
      const base = this.anchor(a);
      const at = this.openNear(off ? pt(base.x + off[0], base.y + off[1]) : base, taken);
      taken.push(at);
      const p = this.player(id);
      p.pos = p.prev = at;
      p.run = id === ROOK_ID;
    };
    W.people.forEach((p, i) => {
      put(10 + i, p.at, p.off);
      this.walkLines.set(p.name, p.lines);
      // Anyone the story doesn't need where they are wanders about near their place.
      if (!p.stay && p.name !== W.go) {
        this.wanderers.set(10 + i, { home: this.player(10 + i).pos, next: 3 + Math.floor(this.rand() * POND.wander.every[1]) });
      }
    });
    put(ROOK_ID, this.startAt ?? W.start);
    this.endClock();
    this.stop = this.clock.every(this.beatMs, () => this.onTick());
    this.broadcast();
  }

  /** People wandering in this walk: their place, and the tick they next set off. */
  private wanderers = new Map<number, { home: Pt; next: number }>();
  private rand() {
    return (this.seed() % 100000) / 100000;
  }

  /**
   * Wanderers stroll to an open tile near their place every so often. Not while Rook is close
   * or walking up to them, so they're easy to talk to, and they stop when he gets near.
   */
  private wander() {
    const g = this.game, rook = this.player(ROOK_ID), Wd = POND.wander;
    for (const [id, w] of this.wanderers) {
      const p = this.player(id);
      const close = near(rook.pos, p.pos, Wd.stopNear) || this.going?.name === p.name;
      if (close) {
        if (p.action.kind === "walk") g.command(id, { action: { kind: "idle" } });
        w.next = Math.max(w.next, g.tick + Wd.every[0]);
        continue;
      }
      if (g.tick < w.next) continue;
      w.next = g.tick + Wd.every[0] + Math.floor(this.rand() * (Wd.every[1] - Wd.every[0]));
      const b = g.board;
      for (let tries = 0; tries < 12; tries++) {
        const to = pt(w.home.x + Math.round((this.rand() * 2 - 1) * Wd.range), w.home.y + Math.round((this.rand() * 2 - 1) * Wd.range));
        if (!b.inside(to) || !b.passable(to, Mover.Walker) || this.banned(to) || g.players.some((q) => q.pos.x === to.x && q.pos.y === to.y)) continue;
        this.walk(id, to);
        break;
      }
    }
  }

  /** A named place on the island, as a tile to stand on (see walks.ts). */
  private anchor(a: Anchor): Pt {
    const sh = this.game.shrine, b = this.game.board, c = b.center;
    const box = (kind: string) => {
      const ps = (sh.props ?? []).filter((p) => p.kind === kind);
      if (!ps.length) return null;
      const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    const mid = (v: { x0: number; x1: number }) => Math.round((v.x0 + v.x1) / 2);
    switch (a) {
      case "door":
        return sh.house ? pt(sh.house.x + sh.house.w + 1, doorY(sh.house)) : this.spots.rook;
      case "falls": {
        const f = box("falls");
        return f ? pt(mid(f), f.y1 + 2) : this.spots.rook;
      }
      case "landing": {
        // On the boards, one tile in from the dock's north edge (Ladi, 25 Nov: the edge row reads as standing on air).
        const k = box("skiff");
        return k ? pt(k.x1 + 3, k.y0 + 1) : this.spots.rook;
      }
      case "stall": {
        // Orrin's open workshop is the stall now (the horseshoe island): before its door, west.
        const ws = box("orrin-house");
        if (ws) return pt(ws.x0 - 1, Math.round((ws.y0 + ws.y1) / 2));
        const o = box("stall");
        return o ? pt(o.x0 + 1, o.y1 + 1) : this.spots.rook;
      }
      case "shrine": {
        const sb = box("shrine");
        // Before its steps: east when the island turns it to face the lake, else south as before.
        if (sb && sh.turns?.shrine === 0) return pt(sb.x1 + 2, Math.round((sb.y0 + sb.y1) / 2));
        return sb ? pt(mid(sb), sb.y1 + 2) : this.spots.rook;
      }
      case "chair": {
        const ch = box("chair");
        return ch ? pt(ch.x0 + 1, ch.y0) : this.spots.rook;
      }
      case "kindling": {
        const k = box("kindling");
        return k ? pt(mid(k), k.y0 - 2) : c;
      }
      case "pond":
        return this.spots.gather.hesta;
      case "path":
        return pt(c.x + 1, c.y + 14);
    }
  }

  /** The nearest open tile to `at` that isn't taken. */
  private openNear(at: Pt, taken: Pt[]): Pt {
    const b = this.game.board;
    for (let r = 0; r < 10; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const q = pt(at.x + dx, at.y + dy);
          if (b.inside(q) && b.passable(q, Mover.Walker) && !this.banned(q) && !taken.some((t) => t.x === q.x && t.y === q.y)) return q;
        }
    return at;
  }

  /**
   * Tiles nobody is put or wanders to: the dock's north edge row, from its mooring post by the skiff
   * to its land end, which reads as standing on air (Ladi, 25 Nov).
   */
  private banned(q: Pt) {
    const ks = (this.game.shrine.props ?? []).filter((p) => p.kind === "skiff");
    if (!ks.length) return false;
    const x1 = Math.max(...ks.map((p) => p.x)), y0 = Math.min(...ks.map((p) => p.y));
    return q.y === y0 && q.x >= x1 + 1 && q.x <= x1 + 6;
  }

  onTick() {
    if (this.granny) return;
    const g = this.game;
    if (this.leavingAt >= 0) {
      if (g.tick - this.leavingAt >= POND.leaveTicks) return this.cut();
      g.tick++;
      return this.broadcast();
    }
    const t = g.tick;
    if (this.walkDef.n !== 1) {
      this.wander();
      g.step();
      this.arrive();
      this.due();
      return this.broadcast();
    }
    if (t === POND.enterAt) {
      this.walk(HESTA_ID, this.spots.gather.hesta);
      this.walk(NELL_ID, this.spots.gather.nell);
      this.walk(SEFA_ID, this.spots.gather.sefa);
    }
    if (t === POND.lumiAt) this.walk(LUMI_ID, this.spots.gather.lumi);
    g.step();
    const rook = this.player(ROOK_ID);
    this.arrive();
    if (this.gatheredAt < 0 && near(this.player(SEFA_ID).pos, this.spots.gather.sefa, 0) && near(this.player(HESTA_ID).pos, this.spots.gather.hesta, 0)) this.gatheredAt = g.tick;
    if (!this.granny && this.gatheredAt >= 0 && g.tick - this.lastSefa >= POND.sefaEvery && g.tick - this.gatheredAt >= 8 && !near(rook.pos, this.player(SEFA_ID).pos, 4)) {
      this.lastSefa = g.tick;
      this.say(SEFA, "We need four!");
    }
    if (!this.granny) this.broadcast();
  }

  /** Rook reached what he was walking up to: they answer. */
  private arrive() {
    const rook = this.player(ROOK_ID);
    if (this.going && near(rook.pos, this.going.at(), POND.reach)) {
      const thing = this.going;
      this.going = null;
      this.game.command(ROOK_ID, { action: { kind: "idle" } });
      this.answer(thing);
    }
  }

  private act(msg: Extract<ClientMsg, { t: "act" }>) {
    if (this.granny || this.leavingAt >= 0) return;
    const g = this.game;
    if (this.asking) (this.asking = null), this.broadcast();
    const action = cleanAction(msg.action, g);
    const to = action?.kind === "walk" ? action.to : null;
    const thing = to ? this.thingAt(to) : null;
    this.going = null;
    if (thing) {
      const rook = this.player(ROOK_ID);
      if (near(rook.pos, thing.at(), POND.reach)) {
        g.command(ROOK_ID, { action: { kind: "idle" }, toggleRun: !!msg.toggleRun });
        return this.answer(thing);
      }
      // From afar: Rook walks up first, and they answer when he's close.
      this.going = thing;
      g.command(ROOK_ID, { action: { kind: "walk", to: this.beside(thing.at(), rook.pos) }, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
      return;
    }
    g.command(ROOK_ID, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
  }

  /** The person or thing on this tile (a tap on their tile, from the client's hit test), if any. */
  private thingAt(at: Pt): Thing | null {
    if (at.x === this.spots.lantern.x && at.y === this.spots.lantern.y) return { name: "lantern", at: () => this.spots.lantern };
    // A place on the island (the falls, the skiff, the shrine...): Rook walks to its nearest open side.
    const props = this.game.shrine.props ?? [];
    const hit = props.find((p) => p.x === at.x && p.y === at.y && LINES[p.kind]);
    if (hit) {
      const tiles = props.filter((p) => p.kind === hit.kind);
      const rook = this.player(ROOK_ID).pos;
      let best: Pt = at, bestD = Infinity;
      for (const t of tiles) {
        const q = this.beside(t, rook);
        const d = Math.hypot(q.x - rook.x, q.y - rook.y);
        if (this.game.board.passable(q, Mover.Walker) && d < bestD) (best = q), (bestD = d);
      }
      return { name: hit.kind, at: () => best };
    }
    const h = this.game.shrine.house;
    if (h && at.x >= h.x && at.x < h.x + h.w && at.y >= h.y && at.y < h.y + h.h) {
      const door = pt(h.x + h.w, doorY(h));
      return { name: "house", at: () => door };
    }
    for (const p of this.game.players) if (p.id !== ROOK_ID && p.pos.x === at.x && p.pos.y === at.y) return { name: p.name, at: () => this.player(p.id).pos };
    return null;
  }

  /** Where the walk's people face while they stand (WalkPerson.look). */
  private looks() {
    if (this.walkDef.n === 1 || !this.game) return [];
    return this.walkDef.people.flatMap((p, i) => (p.look ? [{ id: 10 + i, ...this.anchor(p.look) }] : []));
  }

  /** Who to talk to next. Walk 1's waits until Hesta has come down to the pond. */
  private goal(): string | null {
    if (this.walkDef.n === 1 && this.gatheredAt < 0) return null;
    const f = this.walkDef.first;
    if (f && !this.taps.has(f.name)) return f.goal;
    return this.walkDef.goal;
  }

  /** An exchange, one line after another (POND.offerGap apart); `then` after the last. */
  private exchange(lines: { who: string; text: string; still?: string }[], then?: () => void) {
    const g = this.game, gap = POND.offerGap;
    this.later = [];
    lines.forEach((l, i) => this.later.push({ at: g.tick + i * gap, f: () => this.say(l.who, l.text, l.still) }));
    if (then) this.later.push({ at: g.tick + (lines.length - 1) * gap + 2, f: then });
  }

  /** Puts the question up; a yes comes back through answer(thing, true). */
  private ask(thing: Thing, text: string, yes = "Play", no = "Not yet") {
    this.asking = { text, choices: [yes], no, then: () => this.answer(thing, true) };
    this.broadcast();
  }

  /** Walk 3's first state: their lines one after another, then which run (or not now). A pick says its lines and opens it. */
  private offer(o: NonNullable<WalkPerson["offer"]>) {
    const g = this.game, gap = POND.offerGap;
    this.later = [];
    o.lines.forEach((l, i) => this.later.push({ at: g.tick + i * gap, f: () => this.say(l.who, l.text) }));
    this.later.push({ at: g.tick + (o.lines.length - 1) * gap + 2, f: () => (this.asking = { text: o.ask, choices: o.runs.map((r) => r.label), no: "Not now", then: (i) => this.take(o.runs[i]!) }) });
  }

  private take(r: NonNullable<WalkPerson["offer"]>["runs"][number]) {
    const g = this.game, gap = POND.offerGap, then = r.then ?? [];
    then.forEach((l, i) => this.later.push({ at: g.tick + i * gap, f: () => this.say(l.who, l.text) }));
    this.later.push({ at: g.tick + Math.max(0, then.length - 1) * gap + 1, f: () => (this.optional = { id: r.run, n: (this.optional?.n ?? 0) + 1 }) });
  }

  /** Runs what is due, and the idle lines (Maudie's, while he is not close). */
  private due() {
    const g = this.game, rook = this.player(ROOK_ID);
    const now = this.later.filter((l) => l.at <= g.tick);
    this.later = this.later.filter((l) => l.at > g.tick);
    for (const l of now) l.f();
    this.walkDef.people.forEach((p, i) => {
      if (!p.idle) return;
      const next = this.idleNext.get(p.name) ?? g.tick + POND.idleEvery[0];
      if (g.tick < next) return void this.idleNext.set(p.name, next);
      if (near(rook.pos, this.player(10 + i).pos, 4) || this.asking) return;
      this.say(p.name, p.idle);
      this.idleNext.set(p.name, g.tick + POND.idleEvery[1]);
    });
  }

  private answer(thing: Thing, sure = false) {
    const W = this.walkDef;
    const offers = W.people.find((p) => p.name === thing.name)?.offer;
    if (offers && !sure) return this.offer(offers);
    if (W.n === 1 && thing.name === "Hesta") return sure ? this.startGame() : this.ask(thing, W.ask);
    // Walk 2's skiff: off to the first job (run 4), with Lumi's "I won. So I'm coming." behind it.
    if (W.n === 2 && thing.name === W.go && W.next === 4) {
      if (!sure) return this.ask(thing, W.ask, "Set out");
      this.nextRun = 4;
      this.going = null;
      this.leavingAt = this.game.tick;
      this.broadcast();
      return;
    }
    // Walk 2: Nell or Sefa, asked twice, starts the rematch (the optional run, O1): the page opens it, and brings him back here after.
    if (W.n === 2 && (thing.name === NELL || thing.name === SEFA) && (this.taps.get(thing.name) ?? 0) >= 1) {
      if (!sure) return this.ask(thing, "Play Granny's rematch?", "Play", "Not now");
      this.say(thing.name, "Yes! Granny! Rematch!");
      this.optional = { id: "o1", n: (this.optional?.n ?? 0) + 1 };
      this.broadcast();
      return;
    }
    // From walk 2, his door opens the kitchen: a still with three things to tap (client/kitchen.ts).
    if (W.n >= 2 && thing.name === "house") {
      this.kitchen++;
      this.broadcast();
      return;
    }
    // A yes to the walk's question: on, without the line again.
    if (sure && W.n !== 1 && thing.name === W.go && this.chain && !(W.first && !this.taps.has(W.first.name))) {
      this.done = true;
      this.broadcast();
      return;
    }
    const lines = this.walkLines.get(thing.name) ?? LINES[thing.name] ?? [];
    if (!lines.length) return;
    const n = this.taps.get(thing.name) ?? 0;
    // Before the walk's first talk (walk 7's Kes), the way on is only a person to talk to.
    const first = W.first && !this.taps.has(W.first.name) && thing.name === W.go;
    if (first) return this.say(thing.name, lines[0]!);
    this.taps.set(thing.name, n + 1);
    // An exchange on the first tap (then the question, if it is the way on).
    const talk = W.people.find((p) => p.name === thing.name)?.talk;
    if (talk && n === 0) {
      const on = W.n !== 1 && thing.name === W.go && this.chain && !first;
      // After the walk's first talk, whoever has somewhere to be goes there, running (walk 7's Lumi).
      const off = W.first?.name === thing.name ? () => W.people.forEach((p, i) => p.then && ((this.player(10 + i).run = true), this.walk(10 + i, this.openNear(this.anchor(p.then), [])))) : undefined;
      this.exchange(talk, on ? () => this.ask(thing, W.ask, "Go on") : off);
      this.broadcast();
      return;
    }
    // Lines about things are Rook's own; people say theirs over their heads.
    const person = this.game.players.some((p) => p.name === thing.name);
    this.say(person ? thing.name : "Rook", lines[n % lines.length]!);
    // What goes on from here isn't built yet: say so, once per tap.
    if (W.n !== 1 && thing.name === W.go && !first) {
      // In Part 1's chain the page goes on from here; on its own, say that nothing is built after it.
      if (this.chain) {
        // Their line first, then the question.
        return this.ask(thing, W.ask, "Go on");
      }
      this.notBuilt = true;
      this.lines.push({ who: "", text: `(This is where run ${W.next} would start. It isn't built yet.)`, talk: true });
    }
  }

  /** Hesta, tapped: her line, a short fade, then Granny's game. */
  private startGame(line = true) {
    this.nextRun = 3;
    if (line) this.say("Hesta", LINES.Hesta![0]!);
    this.going = null;
    this.leavingAt = this.game.tick;
    this.broadcast();
  }

  /**
   * The cut to Granny's board: everyone in a proper starting place, spaced evenly round the
   * brazier (Hesta on her own at the top, the four of them round the rest), then the bell.
   */
  private cut() {
    if (this.nextRun === 4) {
      const room = new JobRoom(this.clock, this.seed);
      this.endClock();
      const send = this.send;
      this.inner = { room, conn: room.connect((m) => send?.(m)) };
      this.inner.conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
      return;
    }
    const shrine = shrineById(GRANNY.shrine);
    const board = shrine.board;
    const order = [HESTA_ID, NELL_ID, ROOK_ID, LUMI_ID, SEFA_ID];
    const starts = new Map<number, Pt>();
    order.forEach((id, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / order.length;
      let at = pt(Math.round(board.center.x + Math.cos(a) * POND.ring), Math.round(board.center.y + Math.sin(a) * POND.ring));
      for (let r = 1; !board.passable(at, Mover.Walker) && r < 4; r++) at = pt(Math.round(board.center.x + Math.cos(a) * (POND.ring + r)), Math.round(board.center.y + Math.sin(a) * (POND.ring + r)));
      starts.set(id, at);
    });
    const room = new GrannyRoom(this.clock, this.seed, starts);
    room.eveningNext = this.chain;
    this.endClock();
    const send = this.send;
    const conn = room.connect((m) => send?.(m));
    this.inner = { room, conn };
    conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  }

  private walk(id: number, to: Pt) {
    this.game.command(id, { action: { kind: "walk", to } });
  }

  private player(id: number) {
    return this.game.players.find((p) => p.id === id)!;
  }

  private free(at: Pt | undefined): Pt | null {
    return at && this.game.board.inside(at) && this.game.board.passable(at, Mover.Walker) ? at : null;
  }

  /** The open tile next to `at` that's nearest `from`, to walk up to. */
  private beside(at: Pt, from: Pt): Pt {
    let best: Pt = at, bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const q = pt(at.x + dx, at.y + dy);
        if (!this.game.board.passable(q, Mover.Walker) || this.game.players.some((p) => p.id !== ROOK_ID && p.pos.x === q.x && p.pos.y === q.y)) continue;
        const d = Math.hypot(q.x - from.x, q.y - from.y);
        if (d < bestD) (best = q), (bestD = d);
      }
    return best;
  }

  private say(who: string, text: string, still?: string) {
    // A line with a picture: the picture's caption, in the stills panel.
    if (still) return void this.lines.push({ who, text, still: { id: still } });
    // Rook's own lines sit over his model, not in the corner (Ladi, 26 Nov: "She's my daughter." in walk 7).
    this.lines.push(who === "Rook" ? { who, text, player: ROOK_ID } : { who, text });
  }

  private flush() {
    if (!this.lines.length) return;
    const lines = this.lines;
    this.lines = [];
    this.send?.({ t: "say", lines });
  }

  private broadcast() {
    this.flush();
    this.send?.({ t: "room", room: this.view() });
    this.send?.({ t: "tick", snap: this.game.snapshot(), tickMs: this.beatMs });
  }

  private endClock() {
    this.stop?.();
    this.stop = null;
  }

  storyView(): StoryView {
    return { run: POND.title, movement: 0, title: this.walkDef.n === 1 ? POND.title : this.walkDef.title, ring: null, mark: null, kes: 0, rival: null, note: "", pond: { lantern: this.spots.lantern, walk: this.walkDef.n, light: this.walkDef.light, ...(this.kitchen ? { kitchen: this.kitchen } : {}), ...(this.leavingAt >= 0 ? { leaving: true } : {}), ...(this.done ? { done: true } : {}), ...(this.optional ? { optional: this.optional } : {}), ...(this.goal() ? { goal: this.goal()! } : {}), ...(this.looks().length ? { looks: this.looks() } : {}), ...(this.asking ? { ask: { text: this.asking.text, choices: this.asking.choices, no: this.asking.no } } : {}) } };
  }

  view(): RoomView {
    const kid = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: id !== ROOK_ID });
    return {
      code: "STORY",
      phase: "playing",
      host: ROOK_ID,
      shrine: POND.shrine,
      teams: 2,
      players: this.game.players.map((p) => (p.guild === 1 ? { id: p.id, name: p.name, guild: 1 as Guild, flame: "frost" as const, connected: true, bot: true } : kid(p.id, p.name))),
      countdown: 0,
      lastScores: null,
      roundTicks: this.game.roundTicks,
      story: this.storyView(),
    };
  }

  /** For tests. */
  get state() {
    return { game: this.game, granny: this.inner?.room instanceof GrannyRoom ? this.inner.room : null, job: this.inner?.room instanceof JobRoom ? this.inner.room : null, going: this.going, leaving: this.leavingAt >= 0 };
  }
}

/** The row of the house's door, on its east side: a little south of the middle (the model's door). */
export const doorY = (h: { y: number; h: number }) => h.y + Math.round(h.h / 2);

const near = (a: Pt, b: Pt, r: number) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= r;

function cleanAction(raw: unknown, game: Game): Action | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (a.kind === "idle") return { kind: "idle" };
  if (a.kind === "walk" && a.to && typeof a.to === "object") {
    const { x, y } = a.to as Record<string, unknown>;
    if (Number.isInteger(x) && Number.isInteger(y) && game.board.inside(pt(x as number, y as number))) return { kind: "walk", to: { x: x as number, y: y as number } };
  }
  return undefined;
}
