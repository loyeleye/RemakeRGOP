import { describe, expect, it } from "vitest";
import { Tile, pt } from "../src/engine/board.js";
import { TICK_MS, type Game, type Wisp } from "../src/engine/game.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { SHIP, SHIP_DECK, shipLight } from "../src/engine/shiphome.js";
import { STILLS } from "../src/engine/stills.js";
import { ShipRoom, type Stand } from "../src/server/shiphome.js";

function open(seed: number, stand: Stand | null = "hold") {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new ShipRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const lines = () => msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  const toPlay = () => {
    while (room.state.phase === "countdown") room.onTick();
  };
  const run = (max = 6000) => {
    for (let n = 0; n < max && room.state.phase !== "results"; n++) room.onTick();
  };
  return { room, conn, msgs, lines, toPlay, run };
}
const onBoard = (g: Game) => g.wisps.filter((w) => !g.away.has(w.id));
/** Put a wisp on the deck, loose, at a place in tiles from the lamp. */
function stage(g: Game, w: Wisp, x: number, y: number) {
  const c = g.board.center;
  g.away.delete(w.id);
  w.pos = w.prev = pt(c.x + x, c.y + y);
  w.target = null;
  w.holder = null;
}

describe("Run 10: the ship home", () => {
  it("the board is a deck with the lamp amidships, sky all round it, and the hooded figure at the stern", () => {
    const sh = shrineById(SHIP.shrine), b = sh.board, c = b.center;
    expect(sh.deck).toBe(true);
    expect(b.tile(c)).toBe(Tile.Brazier);
    for (let y = -SHIP_DECK.hl - 3; y <= SHIP_DECK.hl + 3; y++)
      for (let x = -SHIP_DECK.hw - 3; x <= SHIP_DECK.hw + 3; x++) {
        const on = Math.abs(x) <= SHIP_DECK.hw && Math.abs(y) <= SHIP_DECK.hl;
        if (!on) expect(b.tile(pt(c.x + x, c.y + y))).toBe(Tile.Edge);
        else expect(b.tile(pt(c.x + x, c.y + y))).not.toBe(Tile.Edge);
      }
    expect((sh.props ?? []).some((p) => p.kind === "ship-figure" && p.x === c.x + SHIP.figure[0] && p.y === c.y + SHIP.figure[1])).toBe(true);
    // The wisps' lanes are clear of the lamp, so none goes in by itself.
    for (const x of SHIP.lanes) expect(Math.abs(x)).toBeGreaterThan(2);
  });

  it("lasts its fixed length whatever is banked, has no result, and says only Rook's two lines over three views", () => {
    for (const seed of [11, 4242]) {
      const { room, lines, run } = open(seed);
      run();
      expect(room.state.phase).toBe("results");
      expect(room.ticks).toBe(SHIP.ticks);
      expect(room.restarts).toBe(0);
      expect(room.state.end).toMatchObject({ cut: true, summary: "", lines: [] });
      expect(room.stillsShown).toEqual(["r10-0", "r10-1", "r10-2"]);
      for (const id of room.stillsShown) expect(STILLS[id]).toBeDefined();
      const said = lines().filter((l) => l.text);
      expect(said.map((l) => l.text)).toEqual(["Faster.", "That's her lantern. Why is it on the water?"]);
      expect(said.every((l) => l.who === "Rook")).toBe(true);
      // A careful hand closes on the patch and is never nearer than it can be.
      expect(room.nearest).toBeGreaterThanOrEqual(SHIP.patch.nearest);
      expect(room.state.lead).toBeLessThan(SHIP.patch.start);
    }
  });

  it("the third view comes inside the last fifteen seconds, and the second at half way with no words", () => {
    const { room, msgs, run } = open(77);
    const at: Record<string, number> = {};
    let seen = 0;
    for (let n = 0; n < 6000 && room.state.phase !== "results"; n++) {
      room.onTick();
      for (; seen < msgs.length; seen++) {
        const m = msgs[seen]!;
        if (m.t === "say") for (const l of m.lines) if (l.still) at[l.still.id] = room.state.phase === "countdown" ? -1 : room.state.game.tick;
      }
    }
    run();
    expect(at["r10-0"]).toBe(-1);
    expect(Math.abs(at["r10-1"]! - SHIP.ticks * SHIP.stills.half)).toBeLessThanOrEqual(2);
    expect(msgs.flatMap((m) => (m.t === "say" ? m.lines : [])).find((l) => l.still?.id === "r10-1")!.text).toBe("");
    expect(at["r10-2"]).toBeGreaterThanOrEqual(SHIP.ticks - Math.ceil(15000 / TICK_MS));
  });

  it("the wind takes a loose wisp one tile toward the stern every `wind` ticks, and off it", () => {
    const { room, toPlay } = open(5, "idle");
    toPlay();
    const g = room.state.game, c = g.board.center;
    const w = g.wisps[0]!;
    stage(g, w, 4, 0);
    const y0 = w.pos.y;
    for (let i = 0; i < SHIP.wind * 4; i++) room.onTick();
    expect(w.pos.x).toBe(c.x + 4);
    expect(w.pos.y).toBe(y0 + 4);
    // Off the stern: gone, and the patch draws away by `lose` (and its own drift).
    stage(g, w, 4, SHIP_DECK.hl);
    const lost = room.lost, lead = room.state.lead;
    for (let i = 0; i < SHIP.wind; i++) room.onTick();
    expect(g.away.has(w.id)).toBe(true);
    expect(room.lost).toBe(lost + 1);
    expect(room.state.lead).toBeCloseTo(lead + SHIP.patch.lose + SHIP.patch.drift * SHIP.wind, 5);
  });

  it("a wisp he holds is not the wind's, and one he has let go of is again", () => {
    const { room, conn, toPlay } = open(9, null);
    toPlay();
    const g = room.state.game, c = g.board.center;
    const rook = g.players[0]!;
    const w = g.wisps[0]!;
    // Right in front of him, so his staff holds it where it is.
    stage(g, w, rook.pos.x - c.x + 1, rook.pos.y - c.y);
    const act = (action: object) => conn.message(JSON.stringify({ t: "act", action }));
    act({ kind: "staff", wisp: w.id });
    const y0 = w.pos.y;
    for (let i = 0; i < SHIP.wind * 3; i++) room.onTick();
    expect(w.pos.y).toBe(y0);
    act({ kind: "idle" });
    for (let i = 0; i < SHIP.wind * 3 + 1; i++) room.onTick();
    expect(w.pos.y).toBeGreaterThanOrEqual(y0 + 2);
  });

  it("a bank brings the patch nearer by `gain`", () => {
    const { room, toPlay } = open(3, "idle");
    toPlay();
    const g = room.state.game;
    const w = g.wisps[0]!;
    // On the lamp's rim: it goes in by itself after its two ticks there.
    stage(g, w, 2, 0);
    const lead = room.state.lead, t0 = g.tick;
    for (let i = 0; i < 6 && room.banked === 0; i++) room.onTick();
    expect(room.banked).toBe(1);
    expect(room.state.lead).toBeCloseTo(lead + SHIP.patch.drift * (g.tick - t0) - SHIP.patch.gain, 5);
  });

  it("nobody playing: the patch goes out of sight, the lamp gutters, and it is the bow again with nothing said", () => {
    const { room, lines, toPlay } = open(21, "idle");
    toPlay();
    const said = lines().length;
    let ticks = 0;
    while (room.restarts === 0 && ticks++ < 2000) {
      if (room.state.gutterAt >= 0) expect(onBoard(room.state.game)).toHaveLength(0);
      room.onTick();
    }
    expect(room.restarts).toBe(1);
    // Within the run's own length, so it can be met.
    expect(ticks).toBeLessThan(SHIP.ticks);
    expect(room.state.lead).toBe(SHIP.patch.start);
    expect(room.state.game.tick).toBe(0);
    expect(room.state.phase).toBe("playing");
    // No line for a restart, and "Faster." is not said again.
    expect(lines().slice(said).filter((l) => l.text)).toHaveLength(0);
  });

  it("once home is in sight the patch cannot be lost, and his last ticks are the rail", () => {
    const { room, conn, toPlay } = open(8, "idle");
    toPlay();
    const g = room.state.game, home = Math.ceil((SHIP.endSec * 1000) / TICK_MS);
    // Straight to the last stretch, with the patch nearly gone.
    g.tick = SHIP.ticks - home - 1;
    (room as unknown as { lead: number }).lead = SHIP.patch.gone - 0.2;
    while (room.state.phase !== "results") {
      room.onTick();
      const v = room.storyView().ship!;
      if (v.over !== undefined) {
        // Nothing he asks for is taken once he is going over the rail.
        conn.message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x: g.board.center.x, y: g.board.center.y + 6 } } }));
        expect(g.players[0]!.action.kind).toBe("idle");
      }
    }
    expect(room.restarts).toBe(0);
    expect(room.state.gutterAt).toBe(-1);
    expect(room.storyView().ship!.home).toBe(1);
    expect(room.storyView().ship!.over).toBe(SHIP.railTicks);
  });

  it("the sea's light goes from night to first light, slowly at first, and the bell is only from half way", () => {
    expect(shipLight(0)).toBe(0);
    expect(shipLight(1)).toBe(1);
    expect(shipLight(0.5)).toBeLessThan(0.5);
    const { room, toPlay } = open(2);
    toPlay();
    let before = 0, after = 0;
    while (room.state.phase !== "results") {
      room.onTick();
      const v = room.storyView().ship!;
      if (v.bell) v.tick < SHIP.ticks * SHIP.bell.from ? before++ : after++;
    }
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
  });
});
