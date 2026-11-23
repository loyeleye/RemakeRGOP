import { describe, expect, it } from "vitest";
import { Tile, pt, samePt, type Pt } from "../src/engine/board.js";
import { Game } from "../src/engine/game.js";
import { ringSpot } from "../src/engine/kindling.js";
import { LESSON } from "../src/engine/lesson.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { LessonRoom } from "../src/server/lesson.js";

const manualClock = () => ({ every: () => () => {} });
const LUMI = 1, ROOK = 2;

function newRoom(seed = 7) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new LessonRoom(manualClock(), () => (s = (s * 48271) % 2147483647));
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Lumi" }));
  const act = (action: unknown) => conn.message(JSON.stringify({ t: "act", action }));
  const call = (p: Pt) => conn.message(JSON.stringify({ t: "call", x: p.x, y: p.y }));
  const said = () => msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  const lumi = () => room.state.game.players.find((p) => p.id === LUMI)!;
  const rook = () => room.state.game.players.find((p) => p.id === ROOK)!;
  /** Tick until the round is playing. */
  const play = () => {
    for (let i = 0; i < 20 && room.state.phase !== "playing"; i++) room.onTick();
  };
  return { room, act, call, said, lumi, rook, play };
}

/** Walk to a spot, waiting until there. */
function walkTo(r: ReturnType<typeof newRoom>, to: Pt, max = 60) {
  r.act({ kind: "walk", to });
  for (let i = 0; i < max && !samePt(r.lumi().pos, to); i++) r.room.onTick();
  expect(r.lumi().pos).toEqual(to);
}

describe("Engine pieces for run 2", () => {
  const shrine = shrineById("home-pond");

  it("builds Lumi's home pond: a pool on one side, out of reach from across the fire", () => {
    const b = shrine.board;
    let water = 0;
    for (let i = 0; i < b.tiles.length; i++) if (b.tiles[i] === Tile.Water) water++;
    expect(water).toBeGreaterThan(20);
    // Every pool tile is east of the brazier.
    for (let i = 0; i < b.tiles.length; i++) if (b.tiles[i] === Tile.Water) expect(i % b.width).toBeGreaterThan(b.center.x + 4);
  });

  it("a jammed wisp holds still for one staff and moves for two", () => {
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "a" }, { id: 2, guild: 0, name: "b" }], 3, [1, 0], 100);
    const c = g.board.center;
    const w = g.wisps[0]!;
    w.pos = w.prev = pt(c.x, c.y - 6);
    g.heavy.add(w.id);
    const [a, b] = g.players;
    a!.pos = a!.prev = pt(c.x - 3, c.y + 4);
    b!.pos = b!.prev = pt(c.x + 3, c.y + 4);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    for (let i = 0; i < 4; i++) g.step();
    expect(w.pos).toEqual(pt(c.x, c.y - 6));
    g.command(2, { action: { kind: "staff", wisp: 0 } });
    for (let i = 0; i < 12 && g.scores[0] === 0; i++) g.step();
    expect(g.scores[0]).toBe(1);
  });

  it("the tide pull draws the loose wisps on her pool toward her while she holds", () => {
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "Lumi" }, { id: 2, guild: 0, name: "Rook" }], 3, [3, 0], 100);
    const b = g.board;
    const pool: Pt[] = [];
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.tile(pt(x, y)) === Tile.Water) pool.push(pt(x, y));
    const top = pool.reduce((m, p) => (p.y < m.y ? p : m));
    const bottom = pool.reduce((m, p) => (p.y > m.y ? p : m));
    const [w0, w1, w2] = g.wisps;
    w0!.pos = w0!.prev = top;
    w1!.pos = w1!.prev = bottom;
    w2!.pos = w2!.prev = pt(b.center.x - 8, b.center.y);
    const lumi = g.players[0]!;
    lumi.pos = lumi.prev = pt(top.x, top.y - 2);
    const from = w1!.pos;
    // Rook's pull does nothing to the others.
    g.players[1]!.pos = g.players[1]!.prev = pt(top.x - 1, top.y - 2);
    g.tidePuller = 1;
    g.command(2, { action: { kind: "staff", wisp: 0 } });
    for (let i = 0; i < 3; i++) g.step();
    expect(w1!.pos).toEqual(from);
    g.command(2, { action: { kind: "idle" } });
    g.step();
    w0!.pos = w0!.prev = top;
    w0!.target = null;
    // Lumi's does, for as long as she holds, even once the one she holds has left the water.
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    for (let i = 0; i < 6; i++) g.step();
    expect(w1!.pos.y).toBeLessThanOrEqual(from.y - 4);
    expect(w2!.pos).toEqual(pt(b.center.x - 8, b.center.y));
  });
});

describe("Lumi's lesson", () => {
  it("round 1 restarts at once when she runs out of pulls", () => {
    const r = newRoom();
    r.play();
    expect(r.room.state.round).toBe(0);
    // Six pulls from where she stands that don't bank anything.
    for (let k = 0; k < LESSON.yourTurn.pulls; k++) {
      r.act({ kind: "staff", wisp: 0 });
      r.room.onTick();
      r.room.onTick();
      r.act({ kind: "idle" });
      for (let i = 0; i < 6; i++) r.room.onTick();
      if (r.room.state.restarts > 0 || r.room.state.banked > 0) break;
    }
    for (let i = 0; i < 20 && r.room.state.restarts === 0 && r.room.state.banked === 0; i++) r.room.onTick();
    if (r.room.state.banked === 0) {
      expect(r.room.state.restarts).toBe(1);
      expect(r.room.state.pulls).toBe(0);
      expect(r.said().some((l) => l.who === "Lumi" && l.text === "Again.")).toBe(true);
    }
  });

  it("plays all three rounds to the end with a scripted Lumi", () => {
    const r = newRoom(11);
    r.play();
    const c = r.room.state.game.board.center;
    // Round 1: stand where one pull banks it, and pull.
    for (let n = 0; n < 3 && r.room.state.round === 0; n++) {
      const w = r.room.state.game.wisps[0]!;
      const spot = ringSpot(r.room.state.game.board, w.pos, r.lumi().pos)!;
      walkTo(r, spot);
      r.act({ kind: "staff", wisp: 0 });
      for (let i = 0; i < 30 && r.room.state.banked === n && r.room.state.round === 0; i++) r.room.onTick();
      r.act({ kind: "idle" });
      r.room.onTick();
    }
    expect(r.room.state.round).toBe(1);
    expect(r.room.state.restarts).toBe(0);
    r.play();
    // Round 2, beat 1: the jam doesn't move for Rook alone; with her across from him, it banks.
    const R = LESSON.together;
    const jam = pt(c.x + R.jam1.x, c.y + R.jam1.y);
    for (let i = 0; i < 4; i++) r.room.onTick();
    expect(r.room.state.game.wisps[0]!.pos).toEqual(jam);
    walkTo(r, pt(c.x - R.rook1.x, c.y + R.rook1.y));
    r.act({ kind: "staff", wisp: 0 });
    for (let i = 0; i < 30 && r.room.state.beat === 0; i++) r.room.onTick();
    expect(r.room.state.beat).toBe(1);
    expect(r.said().some((l) => /middle of us/.test(l.text))).toBe(true);
    r.play();
    // Beat 2: call him east of the jam's line, stand across from him, and pull.
    r.call(pt(c.x + 3, c.y - 4));
    expect(r.said().some((l) => l.text === "Yes, ma'am.")).toBe(true);
    walkTo(r, pt(c.x + 3, c.y + 3));
    for (let i = 0; i < 30 && !samePt(r.rook().pos, pt(c.x + 3, c.y - 4)); i++) r.room.onTick();
    r.act({ kind: "staff", wisp: 0 });
    for (let i = 0; i < 40 && r.room.state.round === 1; i++) r.room.onTick();
    expect(r.room.state.round).toBe(2);
    r.play();
    // Round 3: her wisps on the pool, Rook stops at 2, and a win ends the run.
    const g = r.room.state.game;
    expect(g.wisps.filter((w) => w.guild === 0 && g.board.tile(w.pos) === Tile.Water).length).toBe(LESSON.firstToThree.onPool);
    for (let i = 0; i < 140; i++) r.room.onTick();
    expect(r.room.state.game.scores[1]).toBeLessThanOrEqual(LESSON.firstToThree.rookStops);
  });

  it("losing round 3 brings best of five, and winning ends the run", () => {
    const r = newRoom(5);
    const room = r.room as unknown as { startRound(n: number, again: boolean): void };
    room.startRound(2, false);
    r.play();
    for (let i = 0; i < LESSON.firstToThree.ticks + 5 && r.room.state.games === 1; i++) r.room.onTick();
    expect(r.room.state.games).toBe(2);
    expect(r.said().some((l) => l.text === "Best of five.")).toBe(true);
    r.play();
    r.room.state.game.scores[0] = LESSON.firstToThree.target;
    r.room.onTick();
    expect(r.room.state.phase).toBe("results");
    expect(r.room.state.end!.lines.at(-1)!.text).toBe("So I'm coming tomorrow.");
  });

  it("a call too many restarts the second jam", () => {
    const r = newRoom(9);
    const room = r.room as unknown as { startRound(n: number, again: boolean, beat: number): void };
    room.startRound(1, false, 1);
    r.play();
    const c = r.room.state.game.board.center;
    for (let k = 0; k < LESSON.together.calls; k++) r.call(pt(c.x - 2 - k, c.y + 6));
    expect(r.room.state.calls).toBe(LESSON.together.calls);
    r.call(pt(c.x, c.y + 7));
    expect(r.room.state.calls).toBe(0);
    expect(r.room.state.restarts).toBe(1);
  });
});
