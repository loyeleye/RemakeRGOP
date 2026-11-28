import { describe, expect, it } from "vitest";
import { Mover } from "../src/engine/board.js";
import { RUN1, run1Lit } from "../src/engine/run1.js";
import { Run1Room } from "../src/server/run1.js";

function room(seed: number) {
  const r = new Run1Room({ every: () => () => {} }, () => seed);
  r.connect(() => {}).message(JSON.stringify({ t: "hello" }));
  return r;
}

describe("Part 2, run 1, the dark run", () => {
  it("the board: the brazier in the middle, Rook's wake spot and the lamps' gap on open floor", () => {
    const r = room(1), g = r.state.game, c = g.board.center;
    expect(g.board.width).toBe(41);
    expect(g.board.passable({ x: c.x + RUN1.rook[0], y: c.y + RUN1.rook[1] }, Mover.Walker)).toBe(true);
    expect(g.board.passable({ x: c.x + 1, y: c.y + 17 }, Mover.Walker)).toBe(true);
    expect(g.pullReach).toBe(RUN1.pullReach);
    expect(r.state.shades.length).toBe(RUN1.shades.start);
    expect(run1Lit(1)).toBe(2);
    expect(run1Lit(7)).toBe(9);
  });

  it("a Rook who stands in the dark loses his warmth to them, and the round starts again", () => {
    const r = room(2);
    let lost = false;
    for (let i = 0; i < 400 && !lost; i++) {
      r.onTick();
      if (r.state.closing >= 0) lost = true;
    }
    expect(lost).toBe(true);
    expect(r.state.warmth).toBe(0);
    for (let i = 0; i < 10; i++) r.onTick();
    expect(r.state.tries).toBe(1);
    expect(r.state.warmth).toBe(RUN1.warmth);
    expect(r.state.game.scores[0]).toBe(0);
  });

  it("an average player lights it in a few tries; the lamps come and it hands on", () => {
    const wins: number[] = [], tries: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = room(seed);
      r.auto = true;
      let t = 0;
      while (!r.state.end?.done && t < 6000) r.onTick(), t++;
      expect(r.state.end?.done).toBe(true);
      wins.push(t);
      tries.push(r.state.tries + 1);
    }
    const av = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    console.log("run1: ticks", wins.join(","), "tries", tries.join(","), "avg tries", av(tries));
    expect(av(tries)).toBeLessThan(5);
  });
});
