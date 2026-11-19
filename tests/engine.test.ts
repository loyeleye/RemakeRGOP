import { describe, expect, it } from "vitest";
import { Board, Mover, Tile, pt } from "../src/engine/board.js";
import { Game, ROUND_TICKS, flingOffset, type JoinSpec } from "../src/engine/game.js";
import { SHRINES, ringWalls, SHRINE_DEFS, mirrorRows, buildShrine, shrineFor, type Shrine } from "../src/engine/maps.js";

/** An empty 27x27 shrine with the given wisp spawns. */
function openShrine(dawnSpawns = [pt(13, 3)], duskSpawns = [pt(13, 23)]): Shrine {
  const rows = Array.from({ length: 27 }, (_, y) =>
    y === 0 || y === 26 ? "#".repeat(27) : "#" + ".".repeat(25) + "#",
  );
  const shrine = buildShrine({ id: "t", name: "t", blurb: "", rows: rows.slice(0, 14), scale: 1, rings: [] });
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
      for (const start of s.starts.flat()) {
        for (const spawn of s.wispSpawns.flat()) {
          const path = s.board.walkPath(start, spawn, true);
          const end = path.at(-1) ?? start;
          expect(Math.max(Math.abs(end.x - spawn.x), Math.abs(end.y - spawn.y)), `${s.id}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("are islands: open sky round the edge, the same coastline for both guilds", () => {
    for (const s of SHRINES) {
      const b = s.board;
      expect(b.tile(pt(0, 0)), s.id).toBe(Tile.Edge);
      for (let y = 0; y < b.height; y++)
        for (let x = 0; x < b.width; x++)
          expect(b.tile(pt(x, y)) === Tile.Edge, `${s.id} (${x},${y})`).toBe(b.tile(pt(b.width - 1 - x, b.height - 1 - y)) === Tile.Edge);
    }
  });

  it("play point-symmetric too, after scaling up and adding the archways", () => {
    for (const s of SHRINES) {
      const b = s.board;
      for (let y = 0; y < b.height; y++)
        for (let x = 0; x < b.width; x++) expect(b.tile(pt(x, y)), `${s.id} (${x},${y})`).toBe(b.tile(pt(b.width - 1 - x, b.height - 1 - y)));
      const flip = (p: { x: number; y: number }) => `${b.width - 1 - p.x},${b.height - 1 - p.y}`;
      expect(s.wispSpawns[1]!.map(flip).sort(), s.id).toEqual(s.wispSpawns[0]!.map((p) => `${p.x},${p.y}`).sort());
    }
  });

  it("have four-way versions that are the same from all four sides", () => {
    for (const s of SHRINES) {
      const f = shrineFor(s.id, 4);
      const b = f.board;
      expect(b.width, s.id).toBe(b.height);
      const N = b.width - 1;
      // Turning a quarter: (x, y) -> (N - y, x) on screen, and guild k's tiles become guild k+1's.
      const turn = (p: { x: number; y: number }) => `${N - p.y},${p.x}`;
      for (let y = 0; y <= N; y++)
        for (let x = 0; x <= N; x++) expect(b.tile(pt(N - y, x)), `${s.id} (${x},${y})`).toBe(b.tile(pt(x, y)));
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        expect(f.wispSpawns[k]!.map(turn).sort(), `${s.id} guild ${k}`).toEqual(f.wispSpawns[next]!.map((p) => `${p.x},${p.y}`).sort());
        expect(f.starts[k]!.map(turn).sort()).toEqual(f.starts[next]!.map((p) => `${p.x},${p.y}`).sort());
      }
      expect(shrineFor(s.id, 3).wispSpawns).toHaveLength(3);
    }
  });

  it("ring the brazier with archways: pillars where the style says, walkable gaps between", () => {
    for (const s of [...SHRINES, ...SHRINES.map((x) => shrineFor(x.id, 4))]) {
      const b = s.board, c = b.center;
      expect(s.rings.length, s.id).toBeGreaterThan(0);
      const walls = new Set(s.rings.flatMap(ringWalls).map((p) => `${p.x},${p.y}`));
      for (const r of s.rings)
        for (let dy = -r.radius; dy <= r.radius; dy++)
          for (let dx = -r.radius; dx <= r.radius; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r.radius) continue;
            const t = b.tile(pt(c.x + dx, c.y + dy));
            expect(t, `${s.id} ${s.teams} (${dx},${dy})`).toBe(walls.has(`${dx},${dy}`) ? Tile.Wall : Tile.Floor);
          }
    }
  });

  it("archway styles are the same turned a quarter", () => {
    for (const style of ["gates", "open", "diagonals", "pillared", "pinwheel", "colonnade"] as const) {
      const w = new Set(ringWalls({ radius: 6, style }).map((p) => `${p.x},${p.y}`));
      for (const k of w) {
        const [x, y] = k.split(",").map(Number) as [number, number];
        expect(w.has(`${-y},${x}`), `${style} ${k}`).toBe(true);
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
  it("lets sight cross open sky but nobody walk or float into it", () => {
    const b = new Board(3, 1, [Tile.Floor, Tile.Edge, Tile.Floor]);
    expect(b.passable(pt(1, 0), Mover.Walker)).toBe(false);
    expect(b.passable(pt(1, 0), Mover.Wisp)).toBe(false);
    expect(b.canSee(pt(0, 0), pt(2, 0))).toBe(true);
  });

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

describe("ice", () => {
  it("slides you the way you last stepped until you leave it", () => {
    const shrine = openShrine();
    const W = shrine.board.width;
    for (const x of [6, 7, 8]) shrine.board.tiles[5 * W + x] = Tile.Ice;
    const g = new Game(shrine, duo, 1);
    const p = g.players[0]!;
    p.pos = pt(4, 5);
    p.run = false;
    g.command(1, { action: { kind: "walk", to: pt(6, 5) } });
    g.step(); // (5,5)
    g.step(); // onto the ice at (6,5)
    expect(p.pos).toEqual(pt(6, 5));
    g.step();
    expect(p.pos).toEqual(pt(7, 5));
    expect(p.slid).toBe(true);
    g.step();
    expect(p.pos).toEqual(pt(8, 5));
    g.step(); // off the ice at (9,5)
    expect(p.pos).toEqual(pt(9, 5));
    g.step(); // on plain floor and idle: stays put
    expect(p.pos).toEqual(pt(9, 5));
    expect(p.slid).toBe(false);
  });

  it("stops a slide at a wall", () => {
    const shrine = openShrine();
    const W = shrine.board.width;
    shrine.board.tiles[5 * W + 6] = Tile.Ice;
    shrine.board.tiles[5 * W + 7] = Tile.Wall;
    const g = new Game(shrine, duo, 1);
    const p = g.players[0]!;
    p.pos = pt(5, 5);
    p.run = false;
    g.command(1, { action: { kind: "walk", to: pt(6, 5) } });
    g.step();
    g.step();
    expect(p.pos).toEqual(pt(6, 5));
    expect(p.slid).toBe(false);
  });
});
