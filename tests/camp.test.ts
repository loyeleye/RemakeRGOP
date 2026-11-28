import { describe, expect, it } from "vitest";
import { Mover, pt } from "../src/engine/board.js";
import { CAMP } from "../src/engine/camp.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { CampRoom } from "../src/server/camp.js";

function walk() {
  const room = new CampRoom({ every: () => () => {} }, () => 12345);
  const lines: StoryLine[] = [];
  const conn = room.connect((m: ServerMsg) => m.t === "say" && lines.push(...m.lines));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const g = room.state.game, c = g.board.center, ids = room.state.ids;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) room.onTick();
  };
  const tap = (x: number, y: number) => conn.message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x: c.x + x, y: c.y + y } } }));
  const at = (id: number) => {
    const p = g.players.find((q) => q.id === id)!.pos;
    return { x: p.x - c.x, y: p.y - c.y };
  };
  return { room, lines, g, c, ids, tick, tap, at };
}

describe("Part 2, the camp walk", () => {
  it("the board: the brazier in the middle, Rook, the crew and every tap's standing tile on open ground", () => {
    const { g, c } = walk();
    const open = (x: number, y: number) => g.board.passable(pt(c.x + x, c.y + y), Mover.Walker);
    expect(open(...CAMP.rook)).toBe(true);
    for (const p of CAMP.people) if (!("sits" in p)) expect([p.key, open(p.at[0], p.at[1])]).toEqual([p.key, true]);
    for (const t of CAMP.taps) expect([t.id, open(Math.round(t.stand[0]), Math.round(t.stand[1]))]).toEqual([t.id, true]);
    expect(open(...CAMP.rim)).toBe(true);
    // The light is the fence: past the apron, and outside the walls, is not walkable.
    expect(open(0, -15)).toBe(false);
    expect(open(0, -14)).toBe(true);
    expect(open(1, -11)).toBe(true);
  });

  it("a tap on the fire walks him up and he thinks it; draft lines carry the mark, final ones don't", () => {
    const w = walk();
    w.tap(-7, 5);
    w.tick(10);
    const l = w.lines.find((x) => x.text === "Five of them, and the boy makes six.");
    expect(l).toMatchObject({ who: "Rook", thought: true });
    expect(l?.draft).toBeUndefined();
    w.tap(-1, 9);
    w.tick(40);
    expect(w.lines.find((x) => x.text === "He's not theirs.")).toMatchObject({ thought: true, draft: true });
  });

  it("the goal shows after two taps: Outrider walks to the north rim, and a tap on him there ends the walk", () => {
    const w = walk();
    w.tap(-7, 5);
    w.tick(10);
    expect(w.room.storyView().camp?.goal).toBeUndefined();
    // The cook, beside the fire: her line, then his thought about the bowl.
    w.tap(-8, 5);
    w.tick(30);
    expect(w.lines.some((x) => x.who === "The cook" && x.draft && x.quiet)).toBe(true);
    expect(w.lines.some((x) => x.text === "I'll eat, and I'll watch their hands while I do.")).toBe(true);
    expect(w.room.storyView().camp?.goal).toBe(CAMP.goal.text);
    w.tick(40);
    expect(w.at(w.ids.outrider!)).toEqual({ x: CAMP.rim[0], y: CAMP.rim[1] });
    const o = w.at(w.ids.outrider!);
    w.tap(o.x, o.y);
    w.tick(60);
    expect(w.room.state.done).toBe(true);
    expect(w.room.storyView().camp?.done).toBe(true);
  });

  it("the goal shows by itself after 25 s", () => {
    const w = walk();
    w.tick(Math.ceil((CAMP.goal.seconds * 1000) / w.room.beatMs) + 1);
    expect(w.room.storyView().camp?.goal).toBe(CAMP.goal.text);
  });

  it("the boy keeps his distance from Outrider", () => {
    const w = walk();
    w.tick(2);
    let least = 99;
    // Outrider walks right up to the cart; the boy keeps clear (a step or two to react).
    w.g.command(w.ids.outrider!, { action: { kind: "walk", to: pt(w.c.x - 1, w.c.y + 7) } });
    for (let i = 0; i < 60; i++) {
      w.tick();
      const b = w.at(w.ids.boy!), o = w.at(w.ids.outrider!);
      if (i > 20) least = Math.min(least, Math.hypot(b.x - o.x, b.y - o.y));
    }
    expect(least).toBeGreaterThanOrEqual(CAMP.boyKeeps - 1);
  });

  it("the gateway: \"Not without the kid.\" when he stands in it, and the cook comes over at the nightshades", () => {
    const w = walk();
    w.tap(0, -14);
    w.tick(80);
    expect(w.at(1)).toEqual({ x: 0, y: -14 });
    expect(w.lines.filter((x) => x.text === "Not without the kid.").length).toBeGreaterThanOrEqual(1);
    expect(w.room.storyView().camp?.shades.slice(0, 3).some((s) => s.near)).toBe(true);
    // The cook walks over.
    w.tick(60);
    const cook = w.at(w.ids.cook!), me = w.at(1);
    expect(Math.max(Math.abs(cook.x - me.x), Math.abs(cook.y - me.y))).toBeLessThanOrEqual(2);
    w.tap(0, -17);
    w.tick(30);
    expect(w.lines.filter((x) => x.who === "The cook" && x.text.startsWith("Those? Nightshades.")).length).toBe(1);
  });

  it("what he hears: the fire close at the start, the nightshades close at the gateway", () => {
    const w = walk();
    const h0 = w.room.storyView().camp!.hear!;
    expect(h0.fire).toBeLessThan(4);
    expect(h0.shade).toBeGreaterThan(10);
    w.tap(0, -14);
    w.tick(80);
    const h1 = w.room.storyView().camp!.hear!;
    expect(h1.fire).toBeGreaterThan(12);
    expect(h1.shade).toBeLessThan(4);
  });
});
