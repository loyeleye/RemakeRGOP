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
import { realClock, type Clock } from "./room.js";

// Same ids as Granny's game, so the handover keeps everyone where they stand.
const ROOK_ID = 1, LUMI_ID = 2, NELL_ID = 3, SEFA_ID = 4, HESTA_ID = 5;
const [NELL, SEFA] = GRANNY.children;

export const POND = {
  title: "The pond",
  /** Ticks before Hesta and the children start walking in, and before Lumi runs over. */
  enterAt: 4,
  lumiAt: 12,
  /** Tap reach: within this many tiles (either way, diagonals count as one) they answer at once. */
  reach: 2,
  /** Sefa's "We need four!", every this many ticks once they've gathered (and not while Rook is with them). */
  sefaEvery: 60,
};

/**
 * Where things are on the board Granny's game plays on (worked out from it, so a bigger or
 * smaller pond still works): Rook and Lumi by the brazier, the way in off the north rim, the
 * gathering spot across the pool from the brazier, and Lumi's lantern on the pool's west shore.
 */
export function pondSpots(board: Board, starts: readonly Pt[][], house?: { x: number; y: number; w: number; h: number }) {
  const walk = (p: Pt) => board.passable(p, Mover.Walker);
  const water: Pt[] = [];
  for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) if (board.tile(pt(x, y)) === Tile.Water) water.push(pt(x, y));
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
  // The way in: the north rim, above the brazier.
  const c = Math.floor(board.width / 2);
  let top = 0;
  while (top < board.height && !walk(pt(c, top))) top++;
  const enter = [open(pt(c - 1, top)), open(pt(c, top)), open(pt(c + 1, top))];
  const rook = open(starts[0]![0]!);
  // Lumi's lantern: by Rook's door if the island has his house (door on its east side), else on the pool's west shore.
  const lantern = house ? open(pt(house.x + house.w, house.y + Math.floor(house.h / 2) + 1)) : open(pt(minX - 1, midY));
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
};

type Thing = { name: string; at: () => Pt };

export class PondRoom {
  private send: ((m: ServerMsg) => void) | null = null;
  private game!: Game;
  private stop: (() => void) | null = null;
  private lines: StoryLine[] = [];
  /** What Rook is walking up to, after a tap from afar. */
  private going: Thing | null = null;
  private taps = new Map<string, number>();
  private gatheredAt = -1;
  private lastSefa = -99;
  /** Once Hesta is tapped: Granny's game, which this room hands everything to. */
  private granny: { room: GrannyRoom; conn: ReturnType<GrannyRoom["connect"]> } | null = null;
  /** Where everything is (see pondSpots). */
  spots!: ReturnType<typeof pondSpots>;

  constructor(
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
    private from: { rook?: Pt; lumi?: Pt } = {},
  ) {}

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
    }
  }

  begin() {
    const shrine = shrineById(GRANNY.shrine);
    const roster = [
      { id: ROOK_ID, guild: 0 as Guild, name: "Rook" },
      { id: LUMI_ID, guild: 0 as Guild, name: "Lumi" },
      { id: NELL_ID, guild: 0 as Guild, name: NELL },
      { id: SEFA_ID, guild: 0 as Guild, name: SEFA },
      { id: HESTA_ID, guild: 1 as Guild, name: "Hesta" },
    ];
    // No wisps and a clock that never runs out: nothing happens unless the player does something.
    this.game = new Game(shrine, roster, this.seed(), [0, 0], 1e9);
    const S = (this.spots = pondSpots(this.game.board, shrine.starts, shrine.house));
    const place = (id: number, at: Pt) => {
      const p = this.player(id);
      p.pos = p.prev = at;
    };
    place(ROOK_ID, this.free(this.from.rook) ?? S.rook);
    place(LUMI_ID, this.free(this.from.lumi) ?? S.lumi);
    place(NELL_ID, S.enter[0]!);
    place(HESTA_ID, S.enter[1]!);
    place(SEFA_ID, S.enter[2]!);
    this.player(HESTA_ID).run = false;
    this.player(NELL_ID).run = this.player(SEFA_ID).run = false;
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
    this.broadcast();
  }

  onTick() {
    if (this.granny) return;
    const g = this.game;
    const t = g.tick;
    if (t === POND.enterAt) {
      this.walk(HESTA_ID, this.spots.gather.hesta);
      this.walk(NELL_ID, this.spots.gather.nell);
      this.walk(SEFA_ID, this.spots.gather.sefa);
    }
    if (t === POND.lumiAt) this.walk(LUMI_ID, this.spots.gather.lumi);
    g.step();
    const rook = this.player(ROOK_ID);
    if (this.going && near(rook.pos, this.going.at(), POND.reach)) {
      const thing = this.going;
      this.going = null;
      this.game.command(ROOK_ID, { action: { kind: "idle" } });
      this.answer(thing);
    }
    if (this.gatheredAt < 0 && near(this.player(SEFA_ID).pos, this.spots.gather.sefa, 0) && near(this.player(HESTA_ID).pos, this.spots.gather.hesta, 0)) this.gatheredAt = g.tick;
    if (!this.granny && this.gatheredAt >= 0 && g.tick - this.lastSefa >= POND.sefaEvery && g.tick - this.gatheredAt >= 8 && !near(rook.pos, this.player(SEFA_ID).pos, 4)) {
      this.lastSefa = g.tick;
      this.say(SEFA, "We need four!");
    }
    if (!this.granny) this.broadcast();
  }

  private act(msg: Extract<ClientMsg, { t: "act" }>) {
    if (this.granny) return;
    const g = this.game;
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
    const h = this.game.shrine.house;
    if (h && at.x >= h.x && at.x < h.x + h.w && at.y >= h.y && at.y < h.y + h.h) {
      const door = pt(h.x + h.w, h.y + Math.floor(h.h / 2));
      return { name: "house", at: () => door };
    }
    for (const p of this.game.players) if (p.id !== ROOK_ID && p.pos.x === at.x && p.pos.y === at.y) return { name: p.name, at: () => this.player(p.id).pos };
    return null;
  }

  private answer(thing: Thing) {
    if (thing.name === "Hesta") return this.startGame();
    const lines = LINES[thing.name] ?? [];
    if (!lines.length) return;
    const n = this.taps.get(thing.name) ?? 0;
    this.taps.set(thing.name, n + 1);
    // The lantern's and the house's lines are Rook's own; the rest say theirs over their heads.
    this.say(thing.name === "lantern" || thing.name === "house" ? "Rook" : thing.name, lines[n % lines.length]!);
  }

  /** Hesta, tapped: Granny's game, from where everyone stands. No menu, no cutscene: the bell rings and the wisps arrive. */
  private startGame() {
    this.say("Hesta", LINES.Hesta![0]!);
    this.flush();
    const starts = new Map(this.game.players.map((p) => [p.id, p.pos] as const));
    const room = new GrannyRoom(this.clock, this.seed, starts);
    this.endClock();
    const send = this.send;
    const conn = room.connect((m) => send?.(m));
    this.granny = { room, conn };
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

  private say(who: string, text: string) {
    this.lines.push({ who, text });
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
    this.send?.({ t: "tick", snap: this.game.snapshot(), tickMs: TICK_MS });
  }

  private endClock() {
    this.stop?.();
    this.stop = null;
  }

  storyView(): StoryView {
    return { run: POND.title, movement: 0, title: POND.title, ring: null, mark: null, kes: 0, rival: null, note: "", pond: { lantern: this.spots.lantern } };
  }

  view(): RoomView {
    const kid = (id: number, name: string) => ({ id, name, guild: 0 as Guild, flame: "amber" as const, connected: true, bot: id !== ROOK_ID });
    return {
      code: "STORY",
      phase: "playing",
      host: ROOK_ID,
      shrine: GRANNY.shrine,
      teams: 2,
      players: [kid(ROOK_ID, "Rook"), kid(LUMI_ID, "Lumi"), kid(NELL_ID, NELL), kid(SEFA_ID, SEFA), { id: HESTA_ID, name: "Hesta", guild: 1, flame: "frost", connected: true, bot: true }],
      countdown: 0,
      lastScores: null,
      roundTicks: this.game.roundTicks,
      story: this.storyView(),
    };
  }

  /** For tests. */
  get state() {
    return { game: this.game, granny: this.granny?.room ?? null, going: this.going };
  }
}

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
