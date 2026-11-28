import { describe, expect, it } from "vitest";
import { pt, Tile } from "../src/engine/board.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { TIDEPOOL, TP, tidepoolTicks, tidepoolTide, tpCell, tpTiles } from "../src/engine/tidepool.js";
import { TidepoolRoom, type Stand } from "../src/server/tidepool.js";

function play(seed: number, stand: Stand | null = "smart") {
  let s = seed * 7919;
  const room = new TidepoolRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
  room.stand = stand;
  const lines: StoryLine[] = [];
  const conn = room.connect((m: ServerMsg) => m.t === "say" && lines.push(...m.lines));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) room.onTick();
  };
  for (let i = 0; i < 200 && room.state.phase === "countdown"; i++) tick();
  const toEnd = () => {
    for (let i = 0; i < 3000 && room.state.phase !== "results"; i++) tick();
    return room.state;
  };
  return { room, lines, tick, toEnd, conn };
}

/** Tick until the tide turns out (the first ebb, or the next). */
function toEbb(p: ReturnType<typeof play>) {
  const g = p.room.state.game;
  while (tidepoolTide(g.tick).in && p.room.state.phase === "playing") p.tick();
  // The turn is made at the start of the next tick.
  p.tick();
}

describe("optional run 3b: Tidepool Steps", () => {
  it("the terraces rise in steps from a court round the brazier, with a deep pool on every step of every side, and every step can be walked to by the corner stairs", () => {
    const sh = shrineById(TIDEPOOL.shrine), b = sh.board, c = b.center;
    expect(b.tile(c)).toBe(Tile.Brazier);
    for (let k = 1; k <= TP.steps; k++) for (const side of ["n", "e", "s", "w"]) expect(tpTiles("pool").some((t) => t.k === k && t.side === side)).toBe(true);
    for (const t of tpTiles("pool")) expect(b.tile(pt(c.x + t.x, c.y + t.y))).toBe(Tile.Water);
    // From Rook's start, a strip on the top step of each side is in reach on foot.
    const from = pt(c.x + TIDEPOOL.rook[0], c.y + TIDEPOOL.rook[1]);
    for (const side of ["n", "e", "s", "w"]) {
      const top = tpTiles("strip").find((t) => t.k === TP.steps && t.side === side)!;
      const to = pt(c.x + top.x, c.y + top.y);
      const path = b.walkPath(from, to);
      expect(path[path.length - 1]).toEqual(to);
    }
    expect(tpCell(TIDEPOOL.rook[0], TIDEPOOL.rook[1]).kind).toBe("court");
  });

  it("opens with Marit's greeting and the goal, the goal held as a caption, and the count and the tide on screen", () => {
    const { room, lines } = play(1, null);
    const texts = lines.map((l) => l.text);
    expect(texts[0]).toBe("Rook. Lumi. The tide's in a mood.");
    expect(texts[1]).toMatch(/^Eight by the turn of the tide, Rook\./);
    const opt = room.storyView().opt!;
    expect(opt.caption?.[0]?.text).toMatch(/^Eight by the turn of the tide/);
    expect(opt.strip.map((c) => c.label)).toEqual(["For Marit", "Tide in", "Tides left", "Send Lumi"]);
    expect(opt.strip[0]!.of).toBe(TIDEPOOL.target);
    expect(tidepoolTicks() * 0.6).toBeGreaterThanOrEqual(90);
    expect(tidepoolTicks() * 0.6).toBeLessThanOrEqual(150);
  });

  it("when the tide goes out every pool spills a step down: its wisps are left on the strips below, and off the bottom step they are gone", () => {
    const p = play(2, null), g = p.room.state.game;
    const where = () => new Map(g.wisps.filter((w) => !g.away.has(w.id)).map((w) => [w.id, tpCell(w.pos.x - g.board.center.x, w.pos.y - g.board.center.y)] as const));
    p.tick(TIDEPOOL.tide.firstIn - 2);
    const before = where();
    expect(before.size).toBeGreaterThan(0);
    toEbb(p);
    const after = where();
    for (const [id, was] of before) {
      if (was.kind !== "pool" && was.kind !== "strip") continue;
      if (was.k === 1) expect(after.has(id)).toBe(false);
      else {
        expect(after.get(id)?.kind).toBe("strip");
        expect(after.get(id)?.k).toBe(was.k - 1);
      }
    }
  });

  it("his staff does not take a wisp over water, and a tap on one says why, once", () => {
    const { room, conn, tick } = play(3, null), g = room.state.game;
    const wet = g.wisps.find((w) => !g.away.has(w.id) && g.board.tile(w.pos) === Tile.Water)!;
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: wet.id } }));
    tick(3);
    expect(room.state.tally.rook).toBe(0);
    const caps = () => (room.storyView().opt!.caption ?? []).filter((c) => c.text.startsWith("His staff slips"));
    expect(caps()).toHaveLength(1);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: wet.id } }));
    tick();
    expect(caps()).toHaveLength(1);
  });

  it("Lumi, sent to a pool, takes what comes to her over the water, and says so the first time", () => {
    const p = play(4, null), g = p.room.state.game;
    const top = p.room.state.cascades.filter((q) => q.k < TP.steps).find((q) => q.pool.some((t) => g.wisps.some((w) => !g.away.has(w.id) && w.pos.x === t.x && w.pos.y === t.y)))!;
    const s = top.strips[0]!;
    p.conn.message(JSON.stringify({ t: "call", x: s.x, y: s.y }));
    for (let i = 0; i < 60 && p.room.state.tally.lumi === 0; i++) p.tick();
    expect(p.room.state.tally.lumi).toBeGreaterThan(0);
    p.tick(20);
    expect(p.lines.filter((l) => l.text === "They come to me.")).toHaveLength(1);
    // Twice a job, and no more.
    for (let n = 0; n < 2; n++) p.conn.message(JSON.stringify({ t: "call", x: s.x, y: s.y + 1 }));
    expect(p.room.state.tally.sends).toBe(TIDEPOOL.lumiSends);
    expect(p.room.storyView().canCall).toBe(false);
  });

  it("eight wins it with Marit's lines, short says by how many, and nobody says he lost; the record is kept", () => {
    const won = play(2, "smart").toEnd();
    expect(won.end!.summary).toBe("Eight by the turn of the tide.");
    expect(won.end!.lines.map((l) => l.text)).toEqual(["As agreed. And one over, for the small one.", "I'm not small.", "For the lamplighter, then."]);
    expect(won.record).toMatchObject({ won: true, best: 8, count: 1 });
    const short = play(2, "idle").toEnd();
    expect(short.end!.summary).toMatch(/of eight by the turn of the tide\.$/);
    expect(short.end!.lines[0]!.text).toMatch(/^Short by \w+\. Come back on the next tide\.$/);
    expect(short.record!.won).toBe(false);
    for (const t of [won, short]) for (const l of [t.end!.summary, ...t.end!.lines.map((x) => x.text)]) expect((l ?? "").toLowerCase()).not.toMatch(/\blost\b|\blose\b|\bsink/);
  });

  it("ignoring the choice costs: reading the tides wins most, waiting low or only sending Lumi wins far less, and standing still never", () => {
    const wins = (stand: Stand) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((k) => play(k, stand).toEnd().end!.banked >= TIDEPOOL.target).length;
    // 8, 3, 5, 0 and 0 of these ten; 55, 12, 29, 0 and 0 of 60 (tools/tidepool-sim.ts 60), with Lumi sent at most twice.
    const smart = wins("smart");
    expect(smart).toBeGreaterThanOrEqual(6);
    expect(wins("low")).toBeLessThanOrEqual(smart - 3);
    expect(wins("climb")).toBeLessThan(smart);
    expect(wins("lumi")).toBeLessThanOrEqual(2);
    expect(wins("idle")).toBe(0);
  });
});
