import { describe, expect, it } from "vitest";
import { Board, Tile, pt } from "../src/engine/board.js";
import { Game, ROUND_TICKS, flingOffset, type JoinSpec } from "../src/engine/game.js";
import { SHRINES, SHRINE_DEFS, mirrorRows, buildShrine, type Shrine } from "../src/engine/maps.js";

/** An empty 27x27 shrine with the given wisp spawns. */
function openShrine(dawnSpawns = [pt(13, 3)], duskSpawns = [pt(13, 23)]): Shrine {
  const rows = Array.from({ length: 27 }, (_, y) =>
    y === 0 || y === 26 ? "#".repeat(27) : "#" + ".".repeat(25) + "#",
  );
  const shrine = buildShrine({ id: "t", name: "t", blurb: "", rows: rows.slice(0, 14) });
  shrine.wispSpawns = [dawnSpawns, duskSpawns];
  shrine.starts = [[pt(3, 13)], [pt(23, 13)]];
  return shrine;
}

const duo: JoinSpec[] = [
  { id: 1, guild: 0, name: "A" },
  { id: 2, guild: 1, name: "B" },
];

describe("shrines", () => {
  it("are point-symmetric with guilds swapped", () => {
    for (const def of SHRINE_DEFS) {
      const rows = mirrorRows(def.rows);
      const swap: Record<string, string> = { a: "b", b: "a", "1": "2", "2": "1" };
      const H = rows.length;
      const W = rows[0]!.length;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const ch = rows[y]![x]!;
          if (ch === "B") continue;
          const opp = rows[H - 1 - y]![W - 1 - x]!;
          expect(swap[ch] ?? ch, `${def.id} (${x},${y})`).toBe(opp);
        }
    }
  });

  it("let every start reach every spawn's neighbourhood", () => {
    for (const s of SHRINES) {
      for (const start of [...s.starts[0], ...s.starts[1]]) {
        for (const spawn of [...s.wispSpawns[0], ...s.wispSpawns[1]]) {
          const path = s.board.walkPath(start, spawn, true);
          const end = path.at(-1) ?? start;
          expect(Math.max(Math.abs(end.x - spawn.x), Math.abs(end.y - spawn.y)), `${s.id}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("have a 3x3 brazier at the centre", () => {
    for (const s of SHRINES) {
      expect(s.board.tile(s.board.center)).toBe(Tile.Brazier);
      expect(s.board.tile(pt(s.board.center.x + 1, s.board.center.y + 1))).toBe(Tile.Brazier);
    }
  });
});

describe("board", () => {
  const W = 9;
  const mk = (walls: [number, number][]) => {
    const tiles = Array<Tile>(W * W).fill(Tile.Floor);
    for (const [x, y] of walls) tiles[y * W + x] = Tile.Wall;
    return new Board(W, W, tiles);
  };

  it("sight is symmetric", () => {
    const b = mk([[4, 4], [2, 6], [5, 2]]);
    for (let i = 0; i < 400; i++) {
      const a = pt(i % 9, Math.floor(i / 9) % 9);
      const c = pt((i * 7) % 9, (i * 5) % 9);
      expect(b.canSee(a, c)).toBe(b.canSee(c, a));
    }
  });

  it("a wall blocks sight, a boulder doesn't", () => {
    const b = mk([[4, 4]]);
    expect(b.canSee(pt(1, 4), pt(7, 4))).toBe(false);
    b.tiles[4 * W + 4] = Tile.Rock;
    expect(b.canSee(pt(1, 4), pt(7, 4))).toBe(true);
  });

  it("walkers don't cut corners", () => {
    const b = mk([[4, 3], [3, 4]]);
    expect(b.canStep(pt(3, 3), 1, 1, 2)).toBe(false);
    const path = b.walkPath(pt(3, 3), pt(4, 4));
    expect(path.length).toBeGreaterThan(1);
  });
});

describe("flingOffset", () => {
  it("pulls up to 2 tiles toward the lamplighter", () => {
    expect(flingOffset(pt(0, 0), pt(6, 0), "pull")).toEqual(pt(-2, 0));
    expect(flingOffset(pt(0, 0), pt(6, 6), "pull")).toEqual(pt(-2, -2));
    expect(flingOffset(pt(0, 0), pt(6, 3), "pull")).toEqual(pt(-2, -1));
    expect(flingOffset(pt(0, 0), pt(6, 1), "pull")).toEqual(pt(-2, 0));
  });
  it("never pulls past the tile in front of you", () => {
    expect(flingOffset(pt(0, 0), pt(2, 0), "pull")).toEqual(pt(-1, 0));
    expect(flingOffset(pt(0, 0), pt(1, 1), "pull")).toEqual(pt(0, 0));
  });
  it("pushes the opposite way", () => {
    expect(flingOffset(pt(0, 0), pt(2, 0), "push")).toEqual(pt(2, 0));
    expect(flingOffset(pt(0, 0), pt(3, 6), "push")).toEqual(pt(1, 2));
  });
});

describe("game", () => {
  it("a pull moves the wisp on the next tick, and holding keeps it coming", () => {
    const g = new Game(openShrine([pt(13, 3)], [pt(20, 23)]), [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(13, 10);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step(); // touch: target set
    expect(g.wisps[0]!.pos).toEqual(pt(13, 3));
    expect(g.wisps[0]!.target).toEqual(pt(13, 5));
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(13, 4));
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(13, 5));
  });

  it("walks into reach, steadies a tick, then touches", () => {
    const g = new Game(openShrine([pt(13, 2)], [pt(20, 23)]), [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(13, 15); // 13 away
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step(); // runs 2 tiles -> 13,13? brazier blocks; walks around
    expect(g.players[0]!.moved).toBe(true);
    let touchedAt = -1;
    for (let i = 0; i < 6 && touchedAt < 0; i++) {
      g.step();
      if (g.wisps[0]!.target) touchedAt = g.tick;
    }
    expect(touchedAt).toBeGreaterThan(0);
    expect(g.players[0]!.moved).toBe(false);
  });

  it("banks a wisp after two ticks on the rim and respawns it", () => {
    const g = new Game(openShrine([pt(13, 3)], [pt(20, 23)]), duo, 7, 1);
    g.wisps[0]!.pos = pt(13, 10);
    g.wisps[0]!.target = pt(13, 11);
    g.step(); // moves onto rim (13,11)
    expect(g.board.inBankZone(g.wisps[0]!.pos)).toBe(true);
    g.step(); // rim 1
    expect(g.scores[0]).toBe(0);
    g.step(); // rim 2 -> banked
    expect(g.scores).toEqual([1, 0]);
    expect(g.wisps[0]!.pos).toEqual(pt(13, 3));
    expect(g.banks).toHaveLength(1);
  });

  it("pull ignores rival wisps, push works on them", () => {
    const g = new Game(openShrine([pt(5, 5)], [pt(13, 4)]), duo, 1, 1);
    const a = g.players[0]!;
    a.pos = pt(13, 9);
    g.command(1, { action: { kind: "staff", wisp: 1 } });
    g.step();
    expect(g.wisps[1]!.target).toBeNull();
    expect(a.action.kind).toBe("idle");
    g.command(1, { toggleMode: true, action: { kind: "staff", wisp: 1 } });
    g.step();
    expect(a.mode).toBe("push");
    expect(g.wisps[1]!.target).toEqual(pt(13, 2));
  });

  it("a wisp in flight can't be taken by a second lamplighter", () => {
    const roster: JoinSpec[] = [
      { id: 1, guild: 0, name: "A" },
      { id: 2, guild: 0, name: "C" },
    ];
    const g = new Game(openShrine([pt(13, 6)], [pt(20, 23)]), roster, 1, 1);
    g.players[0]!.pos = pt(13, 9);
    g.players[1]!.pos = pt(13, 2);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step();
    expect(g.wisps[0]!.holder).toBe(1);
    g.command(2, { action: { kind: "staff", wisp: 0 } });
    g.step();
    expect(g.players[1]!.slipped).toBe(true);
    expect(g.wisps[0]!.holder).toBe(1);
  });

  it("is deterministic and ends after the round", () => {
    const run = () => {
      const g = new Game(SHRINES[1]!, duo, 42);
      for (let t = 0; t < ROUND_TICKS + 5; t++) {
        if (t % 7 === 0) g.command(1, { action: { kind: "staff", wisp: t % 2 } });
        if (t % 5 === 0) g.command(2, { action: { kind: "staff", wisp: 2 + (t % 2) } });
        g.step();
      }
      return JSON.stringify(g.snapshot());
    };
    const a = run();
    expect(a).toBe(run());
    expect(JSON.parse(a).tick).toBe(ROUND_TICKS);
  });
});
