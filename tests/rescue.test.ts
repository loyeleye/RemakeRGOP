import { describe, expect, it } from "vitest";
import { Tile, pt } from "../src/engine/board.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { LO_POOLS, RESCUE, loStrip } from "../src/engine/rescue.js";
import { RescueRoom, type Stand } from "../src/server/rescue.js";

function open(seed: number, stand: Stand | null = "hold") {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new RescueRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const lines = () => msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  const toPlay = () => {
    while (room.state.phase === "countdown") room.onTick();
  };
  return { room, conn, msgs, lines, toPlay };
}
/** The room's own parts, for staging a moment. */
type Inside = { launch(n: 1 | 2, row: number): void; crossings: number; stand: Stand | null; kesHold: boolean };
const inside = (room: RescueRoom) => room as unknown as Inside;

describe("Run 9: the rescue, on the low one", () => {
  it("the low one is three strips cut by two pools, and the bank is the slip at the landing, south of all of it", () => {
    const sh = shrineById(RESCUE.shrine), b = sh.board, c = b.center;
    expect(sh.landing).toBe(true);
    for (const p of LO_POOLS) for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) expect(b.tile(pt(c.x + x, c.y + y))).toBe(Tile.Water);
    // Open ground on each strip, and across both necks.
    for (const x of [-10, 0, 10]) expect(b.tile(pt(c.x + x, c.y - 20 + (x === 0 ? 4 : 0)))).toBe(Tile.Floor);
    for (const y of [-38, -7]) for (const x of [-5, 5]) expect(b.tile(pt(c.x + x, c.y + y))).toBe(Tile.Floor);
    expect(b.tile(c)).toBe(Tile.Brazier);
    // Nothing of the island lies south of the slip, and a walker can get from Rook's start to its side.
    for (let y = c.y + 3; y < b.height; y++) for (let x = 0; x < b.width; x++) expect(b.tile(pt(x, y))).toBe(Tile.Edge);
    const path = b.walkPath(sh.starts[0]![0]!, pt(c.x - 2, c.y));
    expect(path[path.length - 1]).toEqual(pt(c.x - 2, c.y));
  });

  it("a careful hand fills three boats before the cloud is at the landing, and the patch crosses twice on the way", () => {
    let won = 0;
    for (const seed of [7919, 15838, 23757, 31676]) {
      const { room, lines, toPlay } = open(seed);
      toPlay();
      let crossings = 0, had = false, lifts = 0;
      for (let n = 0; n < 1200 && room.state.phase === "playing"; n++) {
        room.onTick();
        if (!!room.state.patch && !had) crossings++;
        had = !!room.state.patch;
        lifts = Math.max(lifts, room.state.lifted);
        // No wisp is ever on a pool, and nothing is counted past twelve.
        const g = room.state.game;
        for (const w of g.wisps) if (!g.away.has(w.id)) expect(g.board.tile(w.pos)).not.toBe(Tile.Water);
      }
      expect(room.state.phase).toBe("results");
      expect(lifts).toBe(RESCUE.boats);
      expect(room.state.fill).toEqual([RESCUE.perBoat, RESCUE.perBoat, RESCUE.perBoat]);
      expect(crossings).toBe(2);
      if (room.restarts === 0) won++;
      const said = lines().map((l) => l.text);
      expect(said[0]).toBe("Little ones on the first boat. We'll keep.");
      expect(said).toContain("First boat's away!");
      expect(said).toContain("Rook. What is that.");
      expect(said).toContain("It's coming back. Get them off the neck!");
      expect(said.slice(-2)).toEqual(["That's all of them. Rook, that's all of them.", "You keep looking over there. Go on."]);
      // Hesta is not on the low one, and nobody is told they lost.
      expect(lines().some((l) => l.who === "Hesta")).toBe(false);
      expect(room.stillsShown[0]).toBe("r9-0");
      expect(room.stillsShown[room.stillsShown.length - 1]).toBe("r9-3");
      expect(room.state.end?.lines).toEqual([]);
    }
    // Tuned generously: the stand-in wins first time on nearly every seed.
    expect(won).toBeGreaterThanOrEqual(3);
  });

  it("with nobody at Rook's staff the cloud reaches the landing: it starts again there with Kes's word, and nobody is shown lost", () => {
    const { room, lines, toPlay } = open(4242, "idle");
    toPlay();
    let steps = 0, last = RESCUE.cloud.start as number;
    while (room.restarts === 0 && steps++ < 900) {
      room.onTick();
      const at = room.state.game.cloudAt!;
      // The cloud never goes back out.
      if (room.restarts === 0) expect(at).toBeLessThanOrEqual(last);
      last = at;
    }
    expect(room.restarts).toBe(1);
    expect(room.state.phase).toBe("playing");
    expect(room.state.game.cloudAt).toBe(RESCUE.cloud.start);
    expect(room.state.fill).toEqual([0, 0, 0]);
    expect(lines().map((l) => l.text)).toContain("Cloud got the landing first.");
  });

  it("a loose wisp the patch covers is gone when it has passed; one already on his staff comes out the other side; and he cannot start a pull inside it", () => {
    const { room, conn, toPlay } = open(99, null);
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!;
    const [held, loose, later] = g.wisps.filter((w) => w.guild === 0);
    const row = c.y - 22;
    const place = (w: (typeof g.wisps)[number], x: number, y: number) => ((w.pos = w.prev = pt(c.x + x, y)), (w.target = null), (w.holder = null));
    // All three in the band it will cross (rows row - 1 to row + 5), Rook just below his own.
    place(held!, 0, row + 3);
    place(loose!, -10, row + 2);
    place(later!, 10, row + 3);
    rook.pos = rook.prev = pt(c.x, row + 5);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: held!.id } }));
    room.onTick();
    room.onTick();
    expect(rook.beam).toBe(held!.id);
    inside(room).launch(1, row + 2);
    let sawLooseUnder = false, refused = false, heldUnder = false;
    for (let n = 0; n < 60 && room.state.patch; n++) {
      const p = room.state.patch!;
      if (p.warn <= 0 && Math.hypot(held!.pos.x + 0.5 - p.x, held!.pos.y + 0.5 - p.y) <= p.r) heldUnder = true;
      if (Math.hypot(loose!.pos.x + 0.5 - p.x, loose!.pos.y + 0.5 - p.y) <= p.r && p.warn <= 0 && !g.away.has(loose!.id)) sawLooseUnder = true;
      // While the far one is under it, he tries to take it: nothing.
      if (!refused && p.warn <= 0 && Math.hypot(later!.pos.x + 0.5 - p.x, later!.pos.y + 0.5 - p.y) <= p.r && !g.away.has(later!.id)) {
        conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: later!.id } }));
        room.onTick();
        expect(rook.action.kind === "staff" && rook.action.wisp === later!.id).toBe(false);
        refused = true;
        continue;
      }
      room.onTick();
    }
    expect(sawLooseUnder).toBe(true);
    expect(refused).toBe(true);
    // The loose ones are not there any more (another comes later in their place); his was never taken.
    expect(room.lostToPatch).toBeGreaterThanOrEqual(2);
    expect(room.state.taken.size).toBe(0);
    expect(heldUnder).toBe(true);
    expect(g.away.has(held!.id)).toBe(false);
    expect(rook.beam).toBe(held!.id);
  });

  it("when it covers Kes her glow goes dark and her string drops; her glow is back the moment it has passed, and Rook is as he was", () => {
    const { room, lines, toPlay } = open(31676);
    toPlay();
    const g = room.state.game, kes = g.players[1]!, rook = g.players[0]!;
    for (let n = 0; n < 400 && g.string.length < 2; n++) room.onTick();
    expect(g.string.length).toBeGreaterThanOrEqual(2);
    inside(room).crossings = 1;
    inside(room).launch(2, kes.pos.y);
    inside(room).kesHold = true;
    const at = { ...kes.pos }, rookRun = rook.run, rookMode = rook.mode;
    let dark = 0, strungWhileDark = 0, after = false;
    for (let n = 0; n < 80 && room.state.patch; n++) {
      room.onTick();
      if (room.state.kesDark) {
        dark++;
        strungWhileDark += g.string.length;
        // She is not moved or harmed.
        expect(kes.pos).toEqual(at);
      } else if (dark) after = true;
    }
    expect(dark).toBeGreaterThan(0);
    expect(strungWhileDark).toBe(0);
    expect(after).toBe(true);
    expect(room.storyView().rescue!.dark).toBeUndefined();
    expect(rook.run).toBe(rookRun);
    expect(rook.mode).toBe(rookMode);
    expect(lines().map((l) => l.text)).toContain("My string...");
  });

  it("his pull stops at a pool's bank, and Kes calls it the first time only", () => {
    const { room, conn, lines, toPlay } = open(5, null);
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!;
    const w = g.wisps.find((q) => q.guild === 0)!;
    const y = c.y - 20;
    w.pos = w.prev = pt(c.x - 9, y);
    rook.pos = rook.prev = pt(c.x - 1, y);
    expect(loStrip(-9)).toBe(0);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    for (let n = 0; n < 12; n++) room.onTick();
    // Still on the west strip, at the water's edge or walking round: never on the water, never across it by the straight line.
    expect(g.board.tile(w.pos)).not.toBe(Tile.Water);
    const said = lines().filter((l) => l.text === "Not over the water! Walk it round!");
    expect(said.length).toBeLessThanOrEqual(1);
  });

  it("the other patch, on its switch, carries loose wisps off with it", () => {
    const { room, toPlay } = open(77, null);
    room.patchMode = "drag";
    toPlay();
    const g = room.state.game, c = g.board.center;
    const w = g.wisps.find((q) => q.guild === 0)!;
    const row = c.y - 22;
    w.pos = w.prev = pt(c.x - 10, row);
    inside(room).launch(1, row);
    let carried = 0;
    const x0 = w.pos.x;
    for (let n = 0; n < 60 && room.state.patch; n++) {
      room.onTick();
      if (!g.away.has(w.id)) carried = Math.max(carried, w.pos.x - x0);
    }
    expect(carried).toBeGreaterThan(0);
    expect(room.lostToPatch).toBeGreaterThanOrEqual(1);
    expect(room.storyView().rescue!.patch).toBeUndefined();
  });
});
