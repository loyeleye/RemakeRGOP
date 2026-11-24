import { describe, expect, it } from "vitest";
import { Tile, pt } from "../src/engine/board.js";
import { DYING, craterTiles } from "../src/engine/dying.js";
import { Game, lightRadius } from "../src/engine/game.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { DyingRoom, type Stand } from "../src/server/dying.js";

/** Rook by the fire on the Kindling ground with one wisp, and a flame. */
function lit(shrine: string = DYING.shrine) {
  const g = new Game(shrineById(shrine), [{ id: 1, guild: 0, name: "Rook" }], 7, [1, 0], 4000);
  g.flame = 55;
  g.dimTicks = 5;
  g.respawnPause = 3;
  const c = g.board.center, rook = g.players[0]!, w = g.wisps[0]!;
  rook.pos = rook.prev = pt(c.x, c.y + 4);
  return { g, c, rook, w };
}
const put = (w: Game["wisps"][number], x: number, y: number) => (w.pos = w.prev = pt(x, y));

describe("the light law", () => {
  it("lights 14 tiles at a full flame and 4 at a low one, and closes to nothing", () => {
    expect(lightRadius(100)).toBe(14);
    expect(lightRadius(10)).toBe(4);
    expect(lightRadius(55)).toBe(9);
    expect(lightRadius(0)).toBe(0);
    expect(lightRadius(5)).toBeLessThan(4);
  });

  it("drains the flame every tick, never below its floor, and a bank feeds it", () => {
    const { g, c, w } = lit();
    g.flameDrain = 2;
    g.flameFeed = 6;
    put(w, c.x + 6, c.y);
    g.step();
    expect(g.flame).toBe(53);
    g.flameFloor = 52.5;
    g.step();
    g.step();
    expect(g.flame).toBe(52.5);
    // On the rim: banked two ticks on, and the fire flares.
    g.flameDrain = 0;
    put(w, c.x + 2, c.y);
    g.step();
    g.step();
    expect(g.scores[0]).toBe(1);
    expect(g.flame).toBe(58.5);
    expect(g.snapshot().flame).toBe(58.5);
    expect(g.snapshot().lit).toBe(lightRadius(58.5));
  });

  it("a wisp left outside the light dims and goes out, without scoring", () => {
    const { g, c, w } = lit();
    put(w, c.x + 12, c.y);
    for (let i = 0; i < 4; i++) g.step();
    expect(g.snapshot().wisps[0]!.dim).toBeCloseTo(0.8);
    expect(g.outs).toEqual([]);
    g.step();
    expect(g.outs).toEqual([{ tick: 5, wisp: w.id }]);
    expect(g.away.has(w.id)).toBe(true);
    expect(g.scores[0]).toBe(0);
    expect(g.snapshot().outs).toEqual([{ tick: 5, wisp: w.id }]);
  });

  it("a wisp in the light never dims, and one brought back into it starts again", () => {
    const { g, c, w } = lit();
    put(w, c.x + 8, c.y);
    for (let i = 0; i < 12; i++) g.step();
    expect(g.dark.has(w.id)).toBe(false);
    put(w, c.x + 12, c.y);
    for (let i = 0; i < 3; i++) g.step();
    expect(g.dark.get(w.id)).toBe(3);
    put(w, c.x + 8, c.y);
    g.step();
    expect(g.dark.has(w.id)).toBe(false);
  });

  it("a staff on a dimming wisp brings its light back", () => {
    const { g, c, rook, w } = lit();
    put(w, c.x, c.y + 12);
    for (let i = 0; i < 3; i++) g.step();
    expect(g.dark.get(w.id)).toBe(3);
    rook.pos = rook.prev = pt(c.x, c.y + 6);
    g.command(1, { action: { kind: "staff", wisp: w.id } });
    for (let i = 0; i < 3; i++) g.step();
    expect(g.dark.has(w.id)).toBe(false);
    expect(g.outs).toEqual([]);
  });

  it("the light shrinks with the flame, so a wisp that was lit is left in the dark", () => {
    const { g, c, w } = lit();
    put(w, c.x + 8, c.y);
    g.step();
    expect(g.dark.has(w.id)).toBe(false);
    g.flame = 20;
    g.step();
    expect(g.dark.get(w.id)).toBe(1);
  });

  it("a wisp held in the ground stays lit when the hold is a helping one", () => {
    const { g, c, w } = lit();
    put(w, c.x + 12, c.y);
    g.rooted.set(w.id, 1);
    g.rootedLit = true;
    for (let i = 0; i < 12; i++) g.step();
    expect(g.outs).toEqual([]);
    expect(g.dark.has(w.id)).toBe(false);
    expect(g.snapshot().rootLit).toBe(true);
  });

  it("with no flame set, nothing dims", () => {
    const { g, c, w } = lit();
    g.flame = null;
    put(w, c.x + 12, c.y);
    for (let i = 0; i < 12; i++) g.step();
    expect(g.away.has(w.id)).toBe(false);
    expect(g.snapshot().flame).toBeUndefined();
  });
});

describe("the glass", () => {
  it("the crater is glass that reaches the brazier's rim, clear of the brazier itself", () => {
    const b = shrineById(DYING.craterShrine).board, base = shrineById(DYING.shrine).board;
    const tiles = craterTiles(base);
    expect(tiles.length).toBeGreaterThan(30);
    for (const p of tiles) expect(b.tile(p)).toBe(Tile.Rime);
    expect(tiles.some((p) => b.inBankZone(p))).toBe(true);
    // The Kindling ground itself is untouched.
    expect(base.tiles.includes(Tile.Rime)).toBe(false);
  });

  it("a wisp on the glass slides to the brazier and banks itself, from anywhere on it", () => {
    const base = shrineById(DYING.shrine).board;
    for (const p of craterTiles(base)) {
      const { g, w } = lit(DYING.craterShrine);
      g.slideHome = true;
      g.dimTicks = 0;
      if (g.board.inBankZone(p)) continue;
      put(w, p.x, p.y);
      for (let i = 0; i < 12 && g.scores[0] === 0; i++) g.step();
      expect(g.scores[0], `from ${p.x},${p.y}`).toBe(1);
    }
  });

  it("the glass takes a wisp out of his staff", () => {
    const { g, c, rook, w } = lit(DYING.craterShrine);
    g.slideHome = true;
    put(w, c.x, c.y - 6);
    rook.pos = rook.prev = pt(c.x + 6, c.y - 6);
    g.command(1, { action: { kind: "staff", wisp: w.id } });
    g.step();
    g.step();
    // It went toward the fire, not toward him.
    expect(w.pos.x).toBe(c.x);
    expect(w.pos.y).toBeGreaterThan(c.y - 6);
  });
});

function play(stand: Stand | null, seed = 99, max = 3000) {
  let s = seed;
  const room = new DyingRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  const lines: StoryLine[] = [], parts: string[] = [], shrines: string[] = [];
  let hush = 0;
  room.connect((m: ServerMsg) => {
    if (m.t === "say") lines.push(...m.lines);
    if (m.t === "room") {
      const p = m.room.story!.dying!.part;
      if (parts[parts.length - 1] !== p) (parts.push(p), shrines.push(m.room.shrine));
    }
  }).message(JSON.stringify({ t: "hello", name: "Rook" }));
  const seen = lines.length;
  let n = 0;
  while (room.state.phase !== "results" && n < max) {
    const before = lines.length;
    room.onTick();
    n++;
    if (room.state.part === "embers" || room.state.part === "landing") hush += lines.length - before;
  }
  return { room, lines, parts, shrines, opening: lines.slice(0, seen), hush };
}

describe("runs 6 and 7, the dying brazier", () => {
  it("an idle player's run 6 lasts 80 ticks, and no run 6 lasts longer than 150", () => {
    const idle = play("idle", 5, 400);
    expect(idle.room.lasted).toBe(DYING.six.minTicks);
    const best = play("juggle", 5);
    expect(best.room.lasted).toBeGreaterThan(DYING.six.minTicks);
    expect(best.room.lasted).toBeLessThanOrEqual(DYING.six.maxTicks);
  });

  it("run 6 cannot be won: the flame is down to embers by its end however he plays", () => {
    for (const stand of ["juggle", "hold"] as Stand[]) {
      const { room } = play(stand, 31);
      expect(room.curve[room.lasted + DYING.embers.fall - 1]).toBeLessThanOrEqual(DYING.embers.level + 0.01);
    }
  });

  it("plays through as one piece: run 6, embers, the landing, run 7, the fire roaring", () => {
    const { room, parts, shrines, lines, hush } = play("hold");
    expect(parts).toEqual(["six", "embers", "landing", "seven", "roar"]);
    expect(shrines).toEqual([DYING.shrine, DYING.shrine, DYING.shrine, DYING.craterShrine, DYING.craterShrine]);
    expect(room.state.phase).toBe("results");
    expect(room.state.game.flame).toBe(100);
    // Nobody speaks from the embers until she has landed.
    expect(hush).toBe(0);
    const said = lines.map((l) => l.text);
    expect(said[0]).toBe("It's low, Rook. Feed it. Nearest first.");
    expect(said).toContain("Budge up, Rook.");
    expect(said).toContain("That one's yours, Rook. At my age?");
    expect(said[said.length - 1]).toBe("There. That'll hold.");
    // Rook has no line, and nothing is ever said about losing or sinking.
    expect(lines.every((l) => l.who === "Hesta")).toBe(true);
    expect(JSON.stringify([said, room.state.end])).not.toMatch(/sink|lost|lose|fail/i);
  });

  it("the landing puts Rook and the wisps clear of the crater, and loses none", () => {
    let s = 77;
    const room = new DyingRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), "idle");
    room.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    while (room.state.part !== "landing") room.onTick();
    // He walks onto the very spot.
    const g0 = room.state.game, c = g0.board.center;
    g0.players[0]!.pos = pt(c.x + DYING.landing.at[0], c.y + DYING.landing.at[1]);
    const had = g0.wisps.filter((w) => !g0.away.has(w.id)).length;
    while ((room.state.part as string) !== "seven") room.onTick();
    const g = room.state.game, at = pt(c.x + DYING.landing.at[0], c.y + DYING.landing.at[1]);
    const rook = g.players[0]!, hesta = g.players[1]!;
    expect(Math.hypot(rook.pos.x - at.x, rook.pos.y - at.y)).toBeGreaterThanOrEqual(DYING.landing.blast - 0.8);
    expect(g.board.tile(rook.pos)).toBe(Tile.Floor);
    expect(hesta.pos).toEqual(at);
    const live = g.wisps.filter((w) => !g.away.has(w.id));
    expect(live.length).toBeGreaterThanOrEqual(had);
    for (const w of live) expect(g.board.tile(w.pos)).toBe(Tile.Floor);
  });

  it("in run 7 Hesta holds the far wisps, never moves, and lets go when Rook takes hold", () => {
    let s = 123;
    const room = new DyingRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), "idle");
    room.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    while (room.state.part !== "seven") room.onTick();
    for (let i = 0; i < 20; i++) room.onTick();
    const g = room.state.game, hesta = g.players[1]!, rook = g.players[0]!;
    const c = g.board.center, far = g.wisps.filter((w) => !g.away.has(w.id) && Math.hypot(w.pos.x - c.x, w.pos.y - c.y) > lightRadius(g.flame!));
    expect(far.length).toBeGreaterThanOrEqual(2);
    expect(g.rooted.size).toBe(Math.min(DYING.seven.holds, far.length));
    expect([...g.rooted.values()].every((id) => id === hesta.id)).toBe(true);
    const at = { ...hesta.pos };
    // Left alone for a long while, nothing she holds goes out.
    for (let i = 0; i < 60; i++) room.onTick();
    expect(room.lostSeven).toBe(0);
    expect(hesta.pos).toEqual(at);
    const id = [...g.rooted.keys()][0]!, w = g.wisps[id]!;
    rook.pos = rook.prev = g.nearestFree(pt(Math.round((w.pos.x + g.board.center.x) / 2), Math.round((w.pos.y + g.board.center.y) / 2)), 0);
    g.command(1, { action: { kind: "staff", wisp: id } });
    room.onTick();
    room.onTick();
    expect(g.rooted.has(id)).toBe(false);
  });

  it("she falters once the fire is nearly full, holds nothing after, and the last wisps are his", () => {
    const { room, lines } = play("hold", 2024);
    expect(room.state.faltered).toBe(true);
    expect(room.state.game.rooted.size).toBe(0);
    const i = lines.findIndex((l) => l.text.startsWith("That one's yours"));
    expect(i).toBeGreaterThan(0);
    expect(lines.slice(i + 1).map((l) => l.text)).toEqual(["There. That'll hold."]);
  });

  it("she remarks on the fire only if he kept it alive a long time", () => {
    expect(play("idle", 9, 400).lines.some((l) => l.text.startsWith("Still warm"))).toBe(false);
    const long = play("juggle", 9);
    expect(long.room.lasted).toBeGreaterThanOrEqual(DYING.seven.warmAfter);
    expect(long.lines.some((l) => l.text.startsWith("Still warm"))).toBe(true);
  });
});
