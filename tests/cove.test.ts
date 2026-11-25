import { describe, expect, it } from "vitest";
import { Mover, Tile, pt } from "../src/engine/board.js";
import { COVE, CV_POOLS, CV_STONES, coveGround, coveTicks, coveTide } from "../src/engine/cove.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { CoveRoom, type Stand } from "../src/server/cove.js";

function play(seed: number, stand: Stand | null = "smart") {
  let s = seed * 7919;
  const room = new CoveRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
  room.stand = stand;
  const lines: StoryLine[] = [];
  const conn = room.connect((m: ServerMsg) => m.t === "say" && lines.push(...m.lines));
  conn.message(JSON.stringify({ t: "hello", name: "Lumi" }));
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) room.onTick();
  };
  // Through the bell.
  for (let i = 0; i < 200 && room.state.phase === "countdown"; i++) tick();
  const toEnd = () => {
    for (let i = 0; i < 2000 && room.state.phase !== "results"; i++) tick();
    return room.state;
  };
  return { room, lines, tick, toEnd, conn };
}

describe("optional run 2: Lumi's lesson with Kes", () => {
  it("the Cove: five pools, five standing stones, deep water in the middle, and flats the tide covers", () => {
    const sh = shrineById(COVE.shrine), b = sh.board, c = b.center;
    expect(b.tile(c)).toBe(Tile.Brazier);
    for (const p of CV_POOLS) expect(b.tile(pt(c.x + p.x, c.y + p.y))).toBe(Tile.Water);
    for (const [x, y] of CV_STONES) {
      expect(coveGround(x, y)).toBe("stone");
      expect(b.tile(pt(c.x + x, c.y + y))).toBe(Tile.Floor);
      expect(sh.tidal).not.toContain((c.y + y) * b.width + c.x + x);
    }
    expect(coveGround(17, 0)).toBe("deep");
    expect(coveGround(10, 6)).toBe("flat");
    expect(sh.tidal!.length).toBeGreaterThan(200);
    // With the tide out every stone can be walked to from where she starts, the one in the deep water by its ford.
    const from = pt(c.x + COVE.lumi[0], c.y + COVE.lumi[1]);
    for (const [x, y] of CV_STONES) {
      const path = b.walkPath(from, pt(c.x + x, c.y + y));
      expect(path.length).toBeGreaterThan(0);
      expect(path[path.length - 1]).toEqual(pt(c.x + x, c.y + y));
    }
  });

  it("the tide starts out, then is in and out in turn, and the light goes as the last one turns", () => {
    const T = COVE.tide;
    expect(coveTide(0)).toMatchObject({ in: false, n: 0 });
    expect(coveTide(T.firstOut)).toMatchObject({ in: true, n: 1, left: T.in });
    expect(coveTide(T.firstOut + T.in)).toMatchObject({ in: false, n: 1, left: T.out });
    expect(coveTide(T.firstOut + T.in + T.out)).toMatchObject({ in: true, n: 2 });
    expect(coveTide(coveTicks() - 1)).toMatchObject({ in: true, n: COVE.tides, left: 1 });
  });

  it("opens with the goal in Kes's mouth, held as a caption, and three strings of three in the strip", () => {
    const { room, lines } = play(1, "idle");
    expect(lines[0]).toMatchObject({ who: "Kes", text: "Three full strings before dark, Captain. They only cross when the tide's in.", talk: true });
    const o = room.storyView().opt!;
    expect(o.id).toBe("o2");
    expect(o.caption?.[0]?.text).toContain("Three full strings before dark");
    expect(o.strip[0]).toMatchObject({ n: 0, of: 9, group: 3 });
    expect(o.strip[1]!.tide).toMatchObject({ in: false });
    expect(o.strip[2]!.bar).toBeCloseTo(1, 1);
    // The first lot comes up by the fire: three in a west pool, one somewhere else.
    expect(o.pools!.map((p) => p.n).sort()).toEqual([0, 0, 0, 1, 3]);
    expect(o.pools![0]!.n + o.pools![1]!.n).toBe(3);
  });

  it("with the tide out the flats are stone, her staff reaches only what is at her feet, and nothing in a pool is hers", () => {
    const { room, tick } = play(2, "idle");
    const g = room.state.game, b = g.board, c = b.center;
    expect(room.state.isIn).toBe(false);
    expect(b.tile(pt(c.x + 10, c.y + 6))).toBe(Tile.Floor);
    expect(g.pullReach).toBe(COVE.feet);
    expect(g.waterLight).toBeNull();
    // She walks to the edge of the rich pool and takes hold of one in it: it slips, and nothing is landed.
    const w = g.wisps.find((q) => !g.away.has(q.id) && Math.hypot(q.pos.x - c.x - 5, Math.abs(q.pos.y - c.y) - 3) < 2.5)!;
    room.stand = null;
    const conn = room.connect(() => {});
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    tick(8);
    expect(room.state.isIn).toBe(false);
    expect(room.state.landed).toBe(0);
  });

  it("with the tide in the flats are water and a wisp in reach comes to her over it and is landed", () => {
    const { room, tick } = play(3, "smart");
    const g = room.state.game, b = g.board, c = b.center;
    tick(COVE.tide.firstOut + 1);
    expect(room.state.isIn).toBe(true);
    expect(b.tile(pt(c.x + 10, c.y + 6))).toBe(Tile.Water);
    expect(g.pullReach).toBe(COVE.reach);
    expect(b.passable(g.players[0]!.pos, Mover.Walker)).toBe(true);
    tick(COVE.tide.in - 2);
    expect(room.state.landed).toBeGreaterThanOrEqual(3);
    expect(room.storyView().opt!.strip[0]!.n).toBe(Math.min(9, room.state.landed));
  });

  it("a wisp left on the flats when the tide goes out lies on wet stone until she walks to it", () => {
    const { room, tick } = play(4, "idle");
    const g = room.state.game, b = g.board, c = b.center, me = g.players[0]!;
    tick(COVE.tide.firstOut + COVE.tide.in - 1);
    // One is put on a flat, as if her pull had left it there.
    const w = g.wisps.find((q) => !g.away.has(q.id))!;
    w.pos = w.prev = pt(c.x + 10, c.y + 6);
    tick(2);
    expect(room.state.isIn).toBe(false);
    expect(room.state.stranded).toContain(w.id);
    expect(room.storyView().opt!.stranded).toContain(w.id);
    room.stand = null;
    const conn = room.connect(() => {});
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    for (let i = 0; i < COVE.tide.out - 3 && room.state.landed === 0; i++) tick();
    expect(room.state.landed).toBe(1);
    expect(Math.max(Math.abs(me.pos.x - w.pos.x), Math.abs(me.pos.y - w.pos.y))).toBeLessThanOrEqual(1);
  });

  it("caught on the flats as the tide comes in, she is on dry ground", () => {
    const { room, tick } = play(5, "idle");
    const g = room.state.game, b = g.board, c = b.center, me = g.players[0]!;
    tick(COVE.tide.firstOut - 2);
    me.pos = me.prev = pt(c.x + 10, c.y + 6);
    tick(3);
    expect(room.state.isIn).toBe(true);
    expect(b.tile(me.pos)).toBe(Tile.Floor);
  });

  it("what she lands comes up again at the turn of the tide, most of it on another side of the cove", () => {
    const { room, tick } = play(6, "smart");
    tick(COVE.tide.firstOut + COVE.tide.in + 1);
    expect(room.state.landed).toBeGreaterThanOrEqual(3);
    const pools = room.storyView().opt!.pools!;
    // The rich pool is not one of the two by the fire this time.
    expect(pools[0]!.n).toBeLessThan(3);
    expect(pools[1]!.n).toBeLessThan(3);
    expect(Math.max(...pools.map((p) => p.n))).toBeGreaterThanOrEqual(3);
  });

  it("three full strings win it, with Kes's lines; the record is kept and a first win is marked", () => {
    const { room, lines, toEnd } = play(7, "smart");
    const st = toEnd();
    expect(st.landed).toBeGreaterThanOrEqual(9);
    expect(st.end!.banked).toBe(9);
    expect(st.end!.summary).toBe("Three full strings before dark.");
    expect(st.end!.lines.map((l) => l.text)).toEqual(["Three strings. I'd have stopped at two.", "I counted four.", "Captain."]);
    expect(st.record).toMatchObject({ best: 9, won: true, count: 1 });
    expect(room.storyView().opt!.record).toMatchObject({ id: "o2", best: 9, won: true });
    const said = lines.map((l) => l.text);
    expect(said).toContain("Ha! Do that again.");
    expect(said).toContain("That's one. Two to go.");
    expect(said).toContain("Two. One more.");
    expect(said).toContain("Tide's turning. Pick your pool.");
  }, 30000);

  it("when the light goes first, nobody says she lost", () => {
    const { toEnd } = play(8, "idle");
    const st = toEnd();
    expect(st.game.tick).toBe(coveTicks());
    expect(st.end!.lines.map((l) => l.text)).toEqual(["Light's gone. Tomorrow, Captain."]);
    expect(st.end!.summary).toBe("No full strings. The light went.");
    expect(`${st.end!.summary} ${st.end!.lines.map((l) => l.text).join(" ")}`).not.toMatch(/lost|lose|fail/i);
    expect(st.record).toMatchObject({ best: 0, won: false, count: 1 });
  }, 30000);

  it("ignoring the choice costs: standing where the wisps will be wins far more often than one stone, or a stone at random", () => {
    const wins = (stand: Stand) => {
      let n = 0;
      for (let k = 1; k <= 8; k++) if (play(k, stand).toEnd().record?.won) n++;
      return n;
    };
    const smart = wins("smart"), stay = wins("stay"), wander = wins("wander");
    expect(smart).toBe(8);
    expect(stay).toBeLessThanOrEqual(3);
    expect(wander).toBeLessThanOrEqual(4);
  }, 60000);
});
