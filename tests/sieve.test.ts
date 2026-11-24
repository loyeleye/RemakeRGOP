import { describe, expect, it } from "vitest";
import { Mover, Tile, pt } from "../src/engine/board.js";
import { Game } from "../src/engine/game.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { SIEVE, SV_WELLS } from "../src/engine/sieve.js";
import { SieveRoom, type Stand } from "../src/server/sieve.js";

/** Rook alone on the Sieve with one wisp, under the falling law. */
function sieve() {
  const g = new Game(shrineById(SIEVE.shrine), [{ id: 1, guild: 0, name: "Rook" }], 7, [1, 0], 400);
  g.waterLawHere = true;
  g.fallRate = SIEVE.fall;
  g.liftTap = SIEVE.liftTap;
  g.liftHold = SIEVE.liftHold;
  g.outPause = 50;
  const c = g.board.center, rook = g.players[0]!, w = g.wisps[0]!;
  rook.pos = rook.prev = pt(c.x, c.y + 4);
  w.pos = w.prev = pt(c.x, c.y + 10);
  return { g, c, rook, w };
}

describe("the wells", () => {
  it("are open air: nobody walks on one, wisps float over, and sight and reach carry across", () => {
    const { g, c } = sieve();
    const well = SV_WELLS[0], p = pt(c.x + well.x, c.y + well.y);
    expect(g.board.tile(p)).toBe(Tile.Well);
    expect(g.board.passable(p, Mover.Walker)).toBe(false);
    expect(g.board.passable(p, Mover.Wisp)).toBe(true);
    expect(g.board.passable(p, Mover.Sight)).toBe(true);
    // Five of them, none within 3 tiles of the brazier, 3 to 6 tiles across.
    expect(SV_WELLS.length).toBe(5);
    for (const w of SV_WELLS) {
      expect(Math.hypot(w.x, w.y) - w.r).toBeGreaterThanOrEqual(3);
      expect(w.r * 2).toBeGreaterThanOrEqual(3);
      expect(w.r * 2).toBeLessThanOrEqual(6);
    }
  });

  it("a pull works on a wisp over a well as on the ground (it is not water)", () => {
    const { g, c, rook, w } = sieve();
    const well = SV_WELLS[3];
    w.pos = w.prev = pt(c.x + well.x, c.y + well.y);
    rook.pos = rook.prev = pt(c.x + well.x + 5, c.y + well.y - 3);
    g.command(1, { action: { kind: "staff", wisp: w.id } });
    for (let t = 0; t < 3; t++) g.step();
    expect(rook.slipped).toBeFalsy();
    expect(w.pos).not.toEqual(pt(c.x + well.x, c.y + well.y));
  });
});

describe("the falling law", () => {
  it("an untouched wisp loses height every tick and at the ground is gone, without scoring", () => {
    const { g, w } = sieve();
    g.height.set(w.id, 10);
    g.step();
    expect(g.height.get(w.id)).toBeCloseTo(10 - SIEVE.fall);
    expect(g.snapshot().wisps[0]!.h).toBeCloseTo((10 - SIEVE.fall) / 100);
    let fell = null as null | { well: boolean };
    for (let t = 0; t < 10 && !fell; t++) (g.step(), (fell = g.falls[0] ?? null));
    expect(fell).toEqual(expect.objectContaining({ wisp: w.id, well: false }));
    expect(g.away.has(w.id)).toBe(true);
    expect(g.scores[0]).toBe(0);
  });

  it("says when it fell over a well", () => {
    const { g, c, w } = sieve();
    w.pos = w.prev = pt(c.x + SV_WELLS[0].x, c.y + SV_WELLS[0].y);
    g.height.set(w.id, 1);
    g.step();
    expect(g.falls[0]!.well).toBe(true);
    expect(g.snapshot().falls![0]!.well).toBe(true);
  });

  it("a staff lifts it: a jump when it arrives, then steadily while it stays, to full height at most", () => {
    const { g, w } = sieve();
    g.height.set(w.id, 20);
    g.command(1, { action: { kind: "staff", wisp: w.id } });
    g.step();
    expect(g.height.get(w.id)).toBeCloseTo(20 + SIEVE.liftTap);
    g.step();
    expect(g.height.get(w.id)).toBeCloseTo(20 + SIEVE.liftTap + SIEVE.liftHold);
    for (let t = 0; t < 3; t++) g.step();
    expect(g.height.get(w.id)).toBeLessThanOrEqual(100);
  });

  it("height changes nothing else: a low wisp is pulled as far as a high one", () => {
    const go = (h: number) => {
      const { g, w } = sieve();
      g.height.set(w.id, h);
      g.command(1, { action: { kind: "staff", wisp: w.id } });
      for (let t = 0; t < 4; t++) g.step();
      return { ...w.pos };
    };
    expect(go(5)).toEqual(go(100));
  });

  it("applies nowhere else", () => {
    const g = new Game(shrineById(SIEVE.shrine), [{ id: 1, guild: 0, name: "Rook" }], 7, [1, 0], 400);
    for (let t = 0; t < 80; t++) g.step();
    expect(g.falls).toEqual([]);
    expect(g.snapshot().wisps[0]!.h).toBeUndefined();
  });
});

function play(stand: Stand, seed: number, max = 1500) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new SieveRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  room.connect((m) => msgs.push(m)).message(JSON.stringify({ t: "hello", name: "Rook" }));
  let n = 0;
  while (room.state.phase !== "results" && n < max) room.onTick(), n++;
  return { room, said: msgs.flatMap((m) => (m.t === "say" ? m.lines.map((l) => l.text) : [])) };
}

describe("Run 8: a harder job, on the Sieve", () => {
  it("opens with a wisp nearly down over the far well that nothing can save, and it is not counted", () => {
    let s = 5;
    const room = new SieveRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
    const conn = room.connect(() => {});
    conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
    while (room.state.phase !== "playing") room.onTick();
    const g = room.state.game, id = room.state.doomed!;
    expect(g.board.tile(g.wisps[id]!.pos)).toBe(Tile.Well);
    // He puts his staff on it from beside the well, and it goes all the same.
    const rook = g.players[0]!;
    rook.pos = rook.prev = g.nearestFree(pt(g.wisps[id]!.pos.x - 5, g.wisps[id]!.pos.y + 2), 0);
    for (let t = 0; t < 12 && room.state.doomed !== null; t++) {
      conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: id } }));
      room.onTick();
    }
    expect(room.state.doomed).toBeNull();
    expect(room.lost).toBe(0);
    expect(room.state.said.has("there")).toBe(true);
  });

  it("a juggler loses none or one and banks ten; the count is read against sixteen", () => {
    for (const seed of [3, 44, 501]) {
      const { room, said } = play("juggle", seed);
      expect(room.state.phase).toBe("results");
      expect(room.lost).toBeLessThanOrEqual(1);
      expect(room.restarts).toBe(0);
      expect(room.state.game.scores[0]).toBe(SIEVE.need);
      expect(room.state.arrived).toBeLessThanOrEqual(SIEVE.supply);
      expect(said).toContain("There. That's what I sent for you about.");
      expect(said).toContain("I can't do that. I can only hold one.");
      const end = room.state.end!.lines.map((l) => l.text);
      expect(end.slice(0, 2)).toEqual(["Ten.", "The book says sixteen. Every year, back to the first page."]);
      expect(end.at(-1)).toBe("Come home, Rook.");
      expect([...said, ...end].join(" ").toLowerCase()).not.toContain("sink");
    }
  });

  it("holding one at a time loses several", () => {
    let lost = 0, restarts = 0;
    for (const seed of [3, 44, 501, 77]) {
      const { room } = play("hold", seed);
      lost += room.lost;
      restarts += room.restarts;
    }
    expect(lost + restarts * 7).toBeGreaterThanOrEqual(12);
  });

  it("standing still loses everything, and the stop starts again with no blame", () => {
    const { room, said } = play("idle", 9, 400);
    expect(room.state.phase).toBe("playing");
    expect(room.restarts).toBeGreaterThanOrEqual(2);
    expect(said).toContain("Again, Rook.");
    expect(room.state.game.scores[0]).toBe(0);
  });
});
