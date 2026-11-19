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
  shrine.spawnField = [];
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
          // Walk it as a lamplighter would: re-planning after every slide across ice.
          let end = start;
          for (let leg = 0; leg < 40; leg++) {
            const path = s.board.walkPath(end, spawn, true);
            if (path.length === 0) break;
            for (const step of path) {
              const d = pt(Math.sign(step.x - end.x), Math.sign(step.y - end.y));
              end = s.board.tile(step) === Tile.Ice ? s.board.slideEnd(step, d) : step;
              if (s.board.tile(step) === Tile.Ice) break;
            }
          }
          expect(Math.max(Math.abs(end.x - spawn.x), Math.abs(end.y - spawn.y)), `${s.id}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("are islands: open sky round the edge, the same coastline for both guilds", () => {
    for (const s of SHRINES.filter((x) => !x.arms)) {
      const b = s.board;
      expect(b.tile(pt(0, 0)), s.id).toBe(Tile.Edge);
      for (let y = 0; y < b.height; y++)
        for (let x = 0; x < b.width; x++)
          expect(b.tile(pt(x, y)) === Tile.Edge, `${s.id} (${x},${y})`).toBe(b.tile(pt(b.width - 1 - x, b.height - 1 - y)) === Tile.Edge);
    }
  });

  it("play point-symmetric too, after scaling up and adding the archways", () => {
    for (const s of SHRINES.filter((x) => !x.arms)) {
      const b = s.board;
      for (let y = 0; y < b.height; y++)
        for (let x = 0; x < b.width; x++) expect(b.tile(pt(x, y)), `${s.id} (${x},${y})`).toBe(b.tile(pt(b.width - 1 - x, b.height - 1 - y)));
      const flip = (p: { x: number; y: number }) => `${b.width - 1 - p.x},${b.height - 1 - p.y}`;
      expect(s.wispSpawns[1]!.map(flip).sort(), s.id).toEqual(s.wispSpawns[0]!.map((p) => `${p.x},${p.y}`).sort());
    }
  });

  it("have four-way versions that are the same from all four sides", () => {
    for (const s of SHRINES.filter((x) => !x.arms)) {
      const f = shrineFor(s.id, 4);
      const b = f.board;
      expect(b.width, s.id).toBe(b.height);
      const N = b.width - 1;
      // Turning a quarter: (x, y) -> (N - y, x) on screen, and guild k's tiles become guild k+1's.
      const turn = (p: { x: number; y: number }) => `${N - p.y},${p.x}`;
      for (let y = 0; y <= N; y++)
        for (let x = 0; x <= N; x++) {
          // A crystal mirror turned a quarter lies along the other diagonal.
          const t = b.tile(pt(x, y));
          const turned = t === Tile.CrystalA ? Tile.CrystalB : t === Tile.CrystalB ? Tile.CrystalA : t;
          expect(b.tile(pt(N - y, x)), `${s.id} (${x},${y})`).toBe(turned);
        }
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
            // A gate can stand in a gap or in the wall line: it's either.
            if (b.tile(pt(c.x + dx, c.y + dy)) === Tile.Gate) continue;
            expect(b.tile(pt(c.x + dx, c.y + dy)), `${s.id} ${s.teams} (${dx},${dy})`).toBe(walls.has(`${dx},${dy}`) ? Tile.Wall : Tile.Floor);
          }
    }
  });

  it("archway styles are the same turned a quarter", () => {
    for (const style of ["gates", "open", "diagonals", "pillared", "pinwheel", "colonnade", "posts"] as const) {
      const w = new Set(ringWalls({ radius: 6, style }).map((p) => `${p.x},${p.y}`));
      for (const k of w) {
        const [x, y] = k.split(",").map(Number) as [number, number];
        expect(w.has(`${-y},${x}`), `${style} ${k}`).toBe(true);
      }
    }
  });

  it("spawn wisps from a shared field that's the same turned 180 degrees", () => {
    for (const s of SHRINES.filter((x) => !x.arms)) {
      const b = s.board;
      expect(s.spawnField.length, s.id).toBeGreaterThan(20);
      const set = new Set(s.spawnField.map((p) => `${p.x},${p.y}`));
      for (const p of s.spawnField) expect(set.has(`${b.width - 1 - p.x},${b.height - 1 - p.y}`), s.id).toBe(true);
    }
  });

  it("tentacle islands keep every arm joined to the core", () => {
    for (const s of SHRINES.filter((x) => x.arms)) {
      const b = s.board;
      const land = b.tiles.filter((t) => t !== Tile.Edge).length;
      expect(land, s.id).toBeGreaterThan(3000);
      expect(s.spawnField.length).toBeGreaterThan(1000);
      // Clutter never seals off a spawn: a lamplighter can walk within reach of each one.
      const W = b.width;
      const seen = new Uint8Array(W * b.height);
      const q = [s.starts[0]![0]!];
      seen[q[0]!.y * W + q[0]!.x] = 1;
      for (let i = 0; i < q.length; i++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = pt(q[i]!.x + dx, q[i]!.y + dy);
            if (b.canStep(q[i]!, dx, dy, Mover.Walker) && !seen[n.y * W + n.x]) {
              seen[n.y * W + n.x] = 1;
              q.push(n);
            }
          }
      const near = (p: { x: number; y: number }) => {
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (seen[(p.y + dy) * W + p.x + dx]) return true;
        return false;
      };
      const cut = s.spawnField.filter((p) => !near(p));
      expect(cut, s.id).toEqual([]);
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
      { id: 2, guild: 1, name: "C" },
    ];
    const g = new Game(openShrine([pt(13, 6)], [pt(20, 23)]), roster, 1, 1);
    g.players[0]!.pos = pt(13, 9);
    g.players[1]!.pos = pt(13, 2);
    g.players[1]!.mode = "push";
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step();
    expect(g.wisps[0]!.holder).toBe(1);
    g.command(2, { action: { kind: "staff", wisp: 0 } });
    g.step();
    expect(g.players[1]!.slipped).toBe(true);
    expect(g.wisps[0]!.holder).toBe(1);
  });

  it("a wisp flung into a crystal is turned off its mirror and flies straight on", () => {
    const shrine = openShrine([pt(6, 6)], [pt(20, 23)]);
    // A "\\" mirror two tiles east of the wisp: heading east, it turns south.
    shrine.board.tiles[6 * 27 + 8] = Tile.CrystalB;
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(12, 6);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step();
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(7, 6));
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(7, 7));
    expect(g.players[0]!.action.kind).toBe("idle");
    // Eight tiles straight south in all, then it stops.
    for (let i = 0; i < 10; i++) g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(7, 14));
    expect(g.wisps[0]!.skate).toBeNull();
  });

  it("a pull beats the ice, and a wisp let go on ice skates on until it leaves it", () => {
    const shrine = openShrine([pt(6, 6)], [pt(20, 23)]);
    for (let x = 7; x <= 10; x++) shrine.board.tiles[6 * 27 + x] = Tile.Ice;
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(14, 6);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step();
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(7, 6));
    // Still held: it goes where it's pulled, here two tiles east, then stops being pulled.
    g.command(1, { action: { kind: "idle" } });
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(8, 6));
    // Let go: it skates on east and stops just off the end of the ice.
    for (let i = 0; i < 5; i++) g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(11, 6));
    expect(g.wisps[0]!.skate).toBeNull();
    // Grab one that's skating and it comes your way instead.
    const h = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    h.players[0]!.pos = pt(14, 6);
    h.command(1, { action: { kind: "staff", wisp: 0 } });
    h.step();
    h.step();
    h.command(1, { action: { kind: "idle" } });
    h.step();
    h.step();
    expect(h.wisps[0]!.pos).toEqual(pt(9, 6));
    h.players[0]!.pos = pt(9, 12);
    h.command(1, { action: { kind: "staff", wisp: 0 } });
    h.step();
    h.step();
    // It skates one more tile while your staff takes hold, then comes your way.
    expect(h.wisps[0]!.pos).toEqual(pt(10, 7));
  });

  it("a lamplighter who steps onto ice slides on until something stops them or they're off it", () => {
    const shrine = openShrine();
    for (let x = 5; x <= 9; x++) shrine.board.tiles[13 * 27 + x] = Tile.Ice;
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(4, 13);
    g.command(1, { action: { kind: "walk", to: pt(5, 13) } });
    g.step();
    expect(g.players[0]!.pos).toEqual(pt(5, 13));
    for (let i = 0; i < 5; i++) g.step();
    expect(g.players[0]!.pos).toEqual(pt(10, 13));
  });

  it("a wisp crossing a petal bed moves two tiles a tick", () => {
    const shrine = openShrine([pt(6, 6)], [pt(20, 23)]);
    for (let x = 7; x <= 12; x++) shrine.board.tiles[6 * 27 + x] = Tile.Bloom;
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(16, 6);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step();
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(8, 6));
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(10, 6));
  });

  it("the tide carries a loose wisp on a pool in, then out", () => {
    const shrine = openShrine([pt(6, 13)], [pt(20, 23)]);
    for (let x = 4; x <= 9; x++) shrine.board.tiles[13 * 27 + x] = Tile.Water;
    shrine.gimmicks = { tide: 3 };
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(2, 2);
    g.step(); // tick 1 (in): toward the brazier at (13, 13)
    g.step(); // tick 2 (in)
    expect(g.wisps[0]!.pos).toEqual(pt(8, 13));
    g.step(); // tick 3 (out)
    g.step(); // tick 4 (out)
    expect(g.wisps[0]!.pos).toEqual(pt(6, 13));
  });

  it("a wisp flying into a moon pond comes out of its twin across the brazier", () => {
    const shrine = openShrine([pt(6, 6)], [pt(20, 23)]);
    shrine.board.tiles[6 * 27 + 8] = Tile.Water;
    shrine.board.tiles[20 * 27 + 18] = Tile.Water;
    shrine.gimmicks = { ponds: true };
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(12, 6);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.step();
    g.step();
    g.step();
    // Into the pond at (8, 6), out of (18, 20) still heading east, and let go.
    expect(g.wisps[0]!.pos).toEqual(pt(18, 20));
    expect(g.players[0]!.action.kind).toBe("idle");
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(19, 20));
  });

  it("portcullises open and shut by the clock, east and west first", () => {
    const def = SHRINE_DEFS.find((d) => d.id === "castle-rise")!;
    const g = new Game(buildShrine(def), duo, 1);
    const c = g.board.center;
    expect(g.board.tile(pt(c.x + 5, c.y))).toBe(Tile.Gate);
    expect(g.board.tile(pt(c.x, c.y + 5))).toBe(Tile.Wall);
    for (let i = 0; i < 10; i++) g.step();
    expect(g.board.tile(pt(c.x + 5, c.y))).toBe(Tile.Wall);
    expect(g.board.tile(pt(c.x, c.y + 5))).toBe(Tile.Gate);
    // The shared shrine board is never touched.
    expect(SHRINES.find((s) => s.id === "castle-rise")!.board.tile(pt(c.x, c.y + 5))).toBe(Tile.Gate);
  });

  it("an erupting vent flings a wisp on it toward the brazier", () => {
    const shrine = openShrine([pt(6, 13)], [pt(20, 23)]);
    shrine.board.tiles[13 * 27 + 6] = Tile.Vent;
    shrine.gimmicks = { vents: 2 };
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(2, 2);
    g.step(); // tick 1: nothing
    g.step(); // tick 2: erupts, first step
    expect(g.wisps[0]!.pos).toEqual(pt(7, 13));
    g.step();
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(9, 13));
  });

  it("moss holds a wisp back, and tapping the wisp again tears the moss away", () => {
    const shrine = openShrine([pt(13, 4)], [pt(20, 23)]);
    shrine.board.tiles[6 * 27 + 13] = Tile.Moss;
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(13, 12);
    const tap = () => {
      g.command(1, { action: { kind: "staff", wisp: 0 } });
      g.step();
    };
    tap(); // the wisp comes up against the moss and stops there
    g.step();
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(13, 5));
    expect(g.board.tile(pt(13, 6))).toBe(Tile.Moss);
    // Three taps while it's held back tear the tuft away.
    tap();
    tap();
    expect(g.board.tile(pt(13, 6))).toBe(Tile.Moss);
    tap();
    expect(g.board.tile(pt(13, 6))).toBe(Tile.Floor);
    g.step();
    g.step();
    expect(g.wisps[0]!.pos.y).toBeGreaterThan(6);
    // You can walk through it all the same.
    expect(g.board.passable(pt(13, 6), Mover.Walker)).toBe(true);
  });

  it("moss grows through the round, the same on both sides", () => {
    const def = SHRINE_DEFS.find((d) => d.id === "moss-hollow")!;
    const g = new Game(buildShrine(def), duo, 3);
    const count = () => g.board.tiles.filter((t) => t === Tile.Moss).length;
    const before = count();
    for (let i = 0; i < 120; i++) g.step();
    expect(count()).toBeGreaterThan(before);
    const b = g.board, W = b.width, H = b.height;
    for (let i = 0; i < W * H; i++) if (b.tiles[i] === Tile.Moss) expect(b.tiles[W * H - 1 - i]).toBe(Tile.Moss);
  });

  it("mist hides a wisp inside it from the staff", () => {
    const def = SHRINE_DEFS.find((d) => d.id === "misty-stones")!;
    const g = new Game(buildShrine(def), duo, 1);
    const c = g.board.center;
    const fogged = (x: number, y: number) => !!g.board.fog?.[y * g.board.width + x];
    // At tick 0 a bank sits due east of the brazier: you can't see through it.
    expect(fogged(c.x + 9, c.y)).toBe(true);
    expect(g.board.canSee(pt(c.x + 5, c.y), pt(c.x + 13, c.y))).toBe(false);
    // It drifts on: an eighth of a lap later the east lies between two banks, clear.
    for (let i = 0; i < 19; i++) g.step();
    expect(fogged(c.x + 9, c.y)).toBe(false);
  });

  it("standing on a pressure plate opens that quarter's shortcut gates, and only while you stand there", () => {
    const def = SHRINE_DEFS.find((d) => d.id === "old-bastion")!;
    const g = new Game(buildShrine(def), duo, 1);
    const c = g.board.center;
    const gate = pt(c.x - 6, c.y - 6);
    expect(g.board.tile(gate)).toBe(Tile.Wall);
    // The middle arches are open without anyone on a plate, so a lone lamplighter can score.
    expect(g.board.tile(pt(c.x, c.y - 6))).toBe(Tile.Floor);
    g.players[0]!.pos = pt(c.x - 9, c.y - 9);
    g.step();
    expect(g.board.tile(gate)).toBe(Tile.Gate);
    expect(g.board.tile(pt(c.x + 6, c.y + 6))).toBe(Tile.Wall);
    g.players[0]!.pos = pt(c.x - 9, c.y - 12);
    g.step();
    expect(g.board.tile(gate)).toBe(Tile.Wall);
  });

  it("a wisp left on a sun glyph is relayed toward the brazier", () => {
    const shrine = openShrine([pt(13, 2)], [pt(20, 23)]);
    shrine.board.tiles[2 * 27 + 13] = Tile.Glyph;
    shrine.gimmicks = { glyphs: 6 };
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(2, 24);
    g.step();
    g.step();
    // 4 tiles in, two a tick, straight down toward the brazier.
    expect(g.wisps[0]!.pos).toEqual(pt(13, 6));
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(13, 6));
  });

  it("a stream carries a loose wisp clockwise round the brazier", () => {
    const shrine = openShrine([pt(13, 6)], [pt(20, 23)]);
    for (let x = 10; x <= 16; x++) shrine.board.tiles[6 * 27 + x] = Tile.Water;
    shrine.gimmicks = { current: "swirl" };
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 1, 1);
    g.players[0]!.pos = pt(2, 2);
    g.step();
    g.step();
    // North of the brazier, clockwise is east.
    expect(g.wisps[0]!.pos).toEqual(pt(15, 6));
  });

  it("teammates pulling one wisp pull it toward the point between them", () => {
    const roster: JoinSpec[] = [
      { id: 1, guild: 0, name: "A" },
      { id: 2, guild: 0, name: "C" },
    ];
    const g = new Game(openShrine([pt(13, 6)], [pt(20, 23)]), roster, 1, 1);
    // One due south, one due east of it: alone each would pull it straight; together it goes
    // diagonally toward the point between them.
    g.players[0]!.pos = pt(13, 12);
    g.players[1]!.pos = pt(19, 6);
    g.command(1, { action: { kind: "staff", wisp: 0 } });
    g.command(2, { action: { kind: "staff", wisp: 0 } });
    g.step();
    expect(g.wisps[0]!.target).toEqual(pt(15, 8));
    g.step();
    expect(g.wisps[0]!.pos).toEqual(pt(14, 7));
    // Opposite sides: a tug of war, and it stays put.
    const h = new Game(openShrine([pt(13, 6)], [pt(20, 23)]), roster, 1, 1);
    h.players[0]!.pos = pt(13, 10);
    h.players[1]!.pos = pt(13, 2);
    h.command(1, { action: { kind: "staff", wisp: 0 } });
    h.command(2, { action: { kind: "staff", wisp: 0 } });
    h.step();
    h.step();
    expect(h.wisps[0]!.pos).toEqual(pt(13, 6));
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
