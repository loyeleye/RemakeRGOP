import { describe, expect, it } from "vitest";
import { cheb, pt, Tile } from "../src/engine/board.js";
import { shrineById } from "../src/engine/maps.js";
import { MOSS } from "../src/engine/mosshollow.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { MossRoom, type Stand } from "../src/server/mosshollow.js";

function play(seed: number, stand: Stand | null = "smart") {
  let s = seed * 7919;
  const room = new MossRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
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
const act = (p: ReturnType<typeof play>, wisp: number) => p.conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp } }));

describe("optional run 3a: Moss Hollow", () => {
  it("every patch, mossed single and bare one lies on open ground of the glade, and none in the fire's rim", () => {
    const b = shrineById(MOSS.shrine).board, c = b.center;
    const tiles = [...MOSS.patches.flatMap((p) => [pt(0, 0), pt(1, 0), pt(0, 1), pt(1, 1)].slice(0, p.n).map((o) => [p.at[0] + o.x, p.at[1] + o.y] as const)), ...MOSS.mossed, ...MOSS.bare];
    for (const [x, y] of tiles) {
      const q = pt(c.x + x, c.y + y);
      expect([Tile.Floor, Tile.Moss]).toContain(b.tile(q));
      expect(b.inBankZone(q)).toBe(false);
    }
    // The old patch is the rich one; one patch looks as thick and hides one.
    expect(MOSS.patches.find((p) => p.old)!.n).toBeGreaterThanOrEqual(3);
    expect(MOSS.patches.some((p) => p.n === 1 && p.cover >= MOSS.patches.find((q) => q.old)!.cover)).toBe(true);
  });

  it("opens with Hesta's route, Garrick's hello and goal, and Lumi's count, the goal and the count held as captions; the strip shows the count, the strokes and Lumi", () => {
    const { room, lines } = play(1, null);
    expect(lines.map((l) => l.text)).toEqual([
      "Moss Hollow and straight home. Don't let Garrick feed you.",
      "Back already? It grew while you were gone.",
      "Nine for the brazier, Rook, and I'll call it done.",
      "Eight strokes. I'm counting. Don't chip it.",
    ]);
    const opt = room.storyView().opt!;
    expect(opt.caption?.map((c) => c.text)).toEqual(["Nine for the brazier, Rook, and I'll call it done.", "Eight strokes. I'm counting. Don't chip it."]);
    expect(opt.strip.map((c) => c.label)).toEqual(["For Garrick", "Strokes", "Send Lumi"]);
    expect(opt.strip[1]).toMatchObject({ n: MOSS.strokes, of: MOSS.strokes });
    expect(opt.moss!.length).toBe(MOSS.patches.reduce((a, p) => a + p.n, 0) + MOSS.mossed.length);
  });

  it("a wisp under moss does not move for his staff: each tap is a stroke off the moss, and cut away it can be pulled", () => {
    const p = play(2, null), g = p.room.state.game, c = g.board.center;
    const cv = p.room.state.covers.find((v) => !v.single && v.wisps.length === 2)!;
    const id = cv.wisps[0]!, at = { ...g.wisps[id]!.pos };
    // Walk over to it: the tap is made when it is in reach.
    act(p, id);
    p.tick(1);
    for (let i = 0; i < 40 && p.room.state.strokes === 0; i++) p.tick();
    expect(p.room.state.strokes).toBe(1);
    expect(cv.hp).toBe(cv.of - 1);
    expect(g.wisps[id]!.pos).toEqual(at);
    for (let n = 1; n < cv.of; n++) act(p, id);
    expect(cv.hp).toBe(0);
    expect(p.room.state.strokes).toBe(cv.of);
    // Bare now: a pull is not a stroke.
    act(p, id);
    p.tick(3);
    expect(p.room.state.strokes).toBe(cv.of);
    expect(cheb(g.wisps[id]!.pos, at)).toBeGreaterThan(0);
    void c;
  });

  it("a bare one left lying is taken by the moss, and that moss thickens; the first cut into a thick patch gets Hesta's hint, and five left gets Lumi's", () => {
    const p = play(3, null), g = p.room.state.game;
    p.tick(MOSS.creep + 2);
    const crept = p.room.state.covers.filter((v) => v.single && v.of === 1);
    expect(crept.length).toBeGreaterThan(0);
    p.tick(MOSS.thicken + 1);
    expect(crept.some((v) => v.hp >= 2)).toBe(true);
    const old = p.room.state.covers.find((v) => v.old)!;
    // Stand by it.
    const me = g.players[0]!;
    me.pos = me.prev = { x: old.tiles[0]!.x - 3, y: old.tiles[0]!.y };
    act(p, old.wisps[0]!);
    p.tick(20);
    expect(p.lines.some((l) => l.text === "The thick patch hides three, Rook. Count before you cut.")).toBe(true);
    act(p, old.wisps[0]!);
    act(p, old.wisps[0]!);
    p.tick(10);
    expect(p.lines.filter((l) => l.text === "Five left. Choose.")).toHaveLength(1);
    act(p, old.wisps[0]!);
    p.tick(10);
    expect(old.hp).toBe(0);
    expect(p.lines.some((l) => l.text === "That's the old patch. Good.")).toBe(true);
  });

  it("Lumi, sent to a patch, tears it away with no strokes, twice a job and no more", () => {
    const p = play(4, null), g = p.room.state.game;
    const small = p.room.state.covers.find((v) => !v.single && v.wisps.length === 2)!;
    const t = small.tiles[0]!;
    p.conn.message(JSON.stringify({ t: "call", x: t.x, y: t.y }));
    for (let i = 0; i < 80 && small.hp > 0; i++) p.tick();
    expect(small.hp).toBe(0);
    expect(p.room.state.strokes).toBe(0);
    expect(p.room.state.tally.lumiFreed).toBe(2);
    p.tick(6);
    p.conn.message(JSON.stringify({ t: "call", x: t.x, y: t.y }));
    p.tick(4);
    p.conn.message(JSON.stringify({ t: "call", x: t.x, y: t.y }));
    expect(p.room.state.tally.sends).toBe(MOSS.lumiSends);
    expect(p.room.storyView().canCall).toBe(false);
    void g;
  });

  it("nine wins it with Garrick's line and the record is kept; short says how many and nobody says he lost", () => {
    const won = play(1, "smart").toEnd();
    expect(won.end!.summary).toBe("Nine for the brazier.");
    expect(won.end!.lines.map((l) => l.text)).toEqual(["That's the jar I owe her. Lumi, you carry it. Your father drops things."]);
    expect(won.record).toMatchObject({ won: true, best: 9, count: 1 });
    const short = play(1, "thick").toEnd();
    expect(short.end!.summary).toMatch(/^\w+ of nine for the brazier\.$/);
    expect(short.end!.lines.map((l) => l.text)).toEqual(["That's eight. I said.", "Come back when it's dried out."]);
    expect(short.record!.won).toBe(false);
    for (const t of [won, short]) for (const l of [t.end!.summary, ...t.end!.lines.map((x) => x.text)]) expect((l ?? "").toLowerCase()).not.toMatch(/\blost\b|\blose\b|\bsink/);
  });

  it("ignoring the choice costs: reading the moss wins most, never cutting a patch or cutting blind wins far less, and standing still never", () => {
    const wins = (stand: Stand) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((k) => play(k, stand).toEnd().record!.won).length;
    // 44, 38, 10, 2, 0 and 0 of 60 (tools/moss-sim.ts 60).
    const smart = wins("smart");
    expect(smart).toBeGreaterThanOrEqual(6);
    expect(wins("singles")).toBeLessThanOrEqual(smart - 3);
    expect(wins("blind")).toBeLessThanOrEqual(2);
    expect(wins("thick")).toBe(0);
    const idle = play(1, "idle").toEnd();
    expect(idle.record!.won).toBe(false);
    expect(idle.game.tick).toBe(MOSS.giveUp);
    // Played well, it is over in 90 seconds or so.
    const t = play(1, "smart").toEnd().game.tick * 0.6;
    expect(t).toBeGreaterThanOrEqual(60);
    expect(t).toBeLessThanOrEqual(150);
  });
});
