import { describe, expect, it } from "vitest";
import { Mover, Tile, pt } from "../src/engine/board.js";
import { TICK_MS, type Game, type Wisp } from "../src/engine/game.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { SHIP, SHIP_DECK, SHIP_SEA, inDraw, inSea, onDeck, shipLanes, shipLight, shipReach } from "../src/engine/shiphome.js";
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
  it("the board is a deck with the lamp amidships, the cloud sea round it where only wisps go, and the man at the stern", () => {
    const sh = shrineById(SHIP.shrine), b = sh.board, c = b.center;
    expect(sh.deck).toBe(true);
    expect(b.tile(c)).toBe(Tile.Brazier);
    for (let y = SHIP_SEA.y0 - 2; y <= SHIP_SEA.y1 + 2; y++)
      for (let x = -SHIP_SEA.hw - 1; x <= SHIP_SEA.hw + 1; x++) {
        const t = b.tile(pt(c.x + x, c.y + y));
        if (onDeck(x, y)) expect(t === Tile.Edge || t === Tile.Well).toBe(false);
        else expect(t).toBe(inSea(x, y) ? Tile.Well : Tile.Edge);
      }
    expect((sh.props ?? []).some((p) => p.kind === "ship-figure" && p.x === c.x + SHIP.figure[0] && p.y === c.y + SHIP.figure[1])).toBe(true);
    // The wisps' lanes are out in the cloud on both sides, from `off[0]` to `off[1]` tiles past the rail.
    expect(shipLanes()).toHaveLength(2 * (SHIP.off[1] - SHIP.off[0] + 1));
    for (const x of shipLanes()) {
      expect(Math.abs(x) - SHIP_DECK.hw).toBeGreaterThanOrEqual(SHIP.off[0]);
      expect(Math.abs(x) - SHIP_DECK.hw).toBeLessThanOrEqual(SHIP.off[1]);
    }
  });

  it("the wisps show in the cloud ahead and slide back past the ship: left alone, none is ever on the deck", () => {
    const { room, toPlay } = open(13, "idle");
    toPlay();
    const g = room.state.game, c = g.board.center;
    let seen = 0;
    for (let n = 0; n < 60; n++) {
      room.onTick();
      for (const w of onBoard(g)) {
        seen++;
        expect(onDeck(w.pos.x - c.x, w.pos.y - c.y)).toBe(false);
        expect(shipLanes()).toContain(w.pos.x - c.x);
      }
    }
    expect(seen).toBeGreaterThan(20);
    // They are spread over the whole width, most of them beyond the two lanes he can take from amidships, and none stays where it showed.
    const xs = onBoard(g).map((w) => Math.abs(w.pos.x - c.x));
    expect(Math.max(...xs)).toBeGreaterThan(SHIP_DECK.hw + SHIP.off[1] - 4);
    for (let n = 0; n < 40; n++) room.onTick();
    expect(room.lost).toBeGreaterThan(3);
    expect(g.pullReach).toBe(SHIP.reach);
  });

  it("on a screen held upright the lanes stop sooner, and nothing shows beyond them", () => {
    const { room, toPlay } = open(13, "idle");
    room.far = SHIP.offNarrow;
    toPlay();
    const g = room.state.game, c = g.board.center;
    for (let n = 0; n < 80; n++) {
      room.onTick();
      for (const w of onBoard(g)) expect(Math.abs(w.pos.x - c.x)).toBeLessThanOrEqual(SHIP_DECK.hw + SHIP.offNarrow);
    }
    expect(room.storyView().ship!.far).toBe(SHIP_DECK.hw + SHIP.offNarrow);
  });

  it("the leeway: from the two tiles along a rail he reaches everything out over it, and from the middle only the two nearest lanes", () => {
    const hw = SHIP_DECK.hw, far = hw + SHIP.off[1], near = hw + SHIP.off[0];
    for (const x of [hw, hw - SHIP.railLeeway]) {
      expect(shipReach(x, 0, far, 0)).toBe(true);
      expect(shipReach(-x, 0, -far, 0)).toBe(true);
      // Not one too far ahead or astern of him, and nothing over the other rail.
      expect(shipReach(x, 0, far, SHIP.reach + 1)).toBe(false);
      expect(shipReach(x, 0, -near, 0)).toBe(false);
    }
    expect(shipReach(hw - SHIP.railLeeway - 1, 0, far, 0)).toBe(false);
    const fromMiddle = shipLanes().filter((x) => shipReach(0, 0, x, 0));
    expect(fromMiddle.sort((a, z) => a - z)).toEqual([-near - 1, -near, near, near + 1]);
    // The room plays by it.
    const { room, conn, toPlay } = open(17, null);
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!;
    const w = g.wisps[0]!;
    rook.pos = pt(c.x + hw - SHIP.railLeeway, c.y);
    stage(g, w, far, 0);
    expect(g.inReach(rook, w)).toBe(true);
    rook.pos = pt(c.x, c.y + 4);
    expect(g.inReach(rook, w)).toBe(false);
    conn.close();
  });

  it("he hauls one from the farthest lane to the rail in a few ticks, and from there the lamp takes it and banks it", () => {
    const { room, conn, toPlay } = open(17, null);
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!;
    const w = g.wisps[0]!;
    const far = SHIP_DECK.hw + SHIP.off[1];
    rook.pos = pt(c.x + SHIP_DECK.hw, c.y + 6);
    stage(g, w, far, 6);
    expect(g.board.passable(w.pos, Mover.Walker)).toBe(false);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    let ticks = 0;
    while (!inDraw(w.pos.x - c.x, w.pos.y - c.y) && ticks++ < 20) room.onTick();
    // `haul` tiles a tick, whatever the wind is doing: about two seconds from the farthest lane.
    expect(ticks).toBeLessThanOrEqual(Math.ceil(SHIP.off[1] / SHIP.haul) + 2);
    expect(w.pos.y).toBe(rook.pos.y);
    // His staff comes off it, he does nothing more, and it is banked.
    room.onTick();
    expect(rook.action.kind).toBe("idle");
    expect(rook.beam).toBe(null);
    const t0 = g.tick;
    while (room.banked === 0 && g.tick - t0 < 12) room.onTick();
    expect(room.banked).toBe(1);
  });

  it("?nodraw: a hauled wisp lies where he left it, out of the wind, until he pulls it again", () => {
    const { room, toPlay } = open(9, null);
    room.draws = false;
    toPlay();
    const g = room.state.game;
    const w = g.wisps[0]!;
    stage(g, w, SHIP_DECK.hw, -3);
    const at = { ...w.pos };
    for (let i = 0; i < 10; i++) room.onTick();
    expect(w.pos).toEqual(at);
    expect(room.banked).toBe(0);
  });

  it("lasts its fixed length whatever is banked, has no result, and says only Rook's two lines over three views", () => {
    for (const seed of [11, 4242]) {
      const { room, lines, run } = open(seed, "rails");
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
      // A careful hand ends closer to the patch than he started, and is never nearer than it can be.
      expect(room.nearest).toBeGreaterThanOrEqual(SHIP.patch.nearest);
      expect(room.state.lead).toBeLessThan(SHIP.patch.start);
      // Wisps are lost astern however well he plays.
      expect(room.lost).toBeGreaterThan(10);
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

  it("the wind carries a loose wisp toward the stern, and past it", () => {
    const { room, toPlay } = open(5, "idle");
    toPlay();
    const g = room.state.game, c = g.board.center;
    const w = g.wisps[0]!;
    stage(g, w, 9, 0);
    const y0 = w.pos.y;
    // At the start it is `wind[0]` tiles a tick, in whole steps as they come due.
    for (let i = 0; i < 8; i++) room.onTick();
    expect(w.pos.x).toBe(c.x + 9);
    expect(w.pos.y).toBe(y0 + Math.floor(8 * SHIP.wind[0]));
    // Past the stern: gone, the page is told where it went, and the patch draws away by `lose` (and its own drift).
    stage(g, w, 9, SHIP_DECK.hl + SHIP.astern);
    const lost = room.lost, lead = room.state.lead;
    for (let i = 0; i < 3 && room.lost === lost; i++) room.onTick();
    expect(g.away.has(w.id)).toBe(true);
    expect(room.lost).toBe(lost + 1);
    expect(room.storyView().ship!.lost).toEqual([{ x: 9, tick: g.tick }]);
    expect(room.state.lead - lead).toBeGreaterThan(SHIP.patch.lose);
    expect(room.state.lead - lead).toBeLessThan(SHIP.patch.lose + 3 * SHIP.patch.drift[1] * SHIP.patch.pull[1]);
  });

  it("running to the rails beats standing amidships by a clear margin", () => {
    const banks = (stand: Stand) => [11, 4242, 77].reduce((n, seed) => {
      const { room, run } = open(seed, stand);
      run();
      return n + room.banked;
    }, 0);
    expect(banks("rails")).toBeGreaterThan(banks("hold") * 1.3);
  });

  it("the lull: for a while they come seldom and the patch draws well away however he plays", () => {
    const L = SHIP.lull, from = Math.round(SHIP.ticks * L.at);
    for (const seed of [11, 4242]) {
      const { room, toPlay } = open(seed, "rails");
      toPlay();
      const g = room.state.game;
      while (g.tick < from) room.onTick();
      const before = room.state.lead;
      while (g.tick < from + L.ticks) room.onTick();
      expect(room.state.lead - before).toBeGreaterThan(1);
      expect(room.restarts).toBe(0);
    }
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
    // Its own drift over those ticks is small beside it.
    expect(lead - room.state.lead).toBeLessThanOrEqual(SHIP.patch.gain);
    expect(lead - room.state.lead).toBeGreaterThan(SHIP.patch.gain - (g.tick - t0) * SHIP.patch.drift[1] * SHIP.patch.pull[1]);
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
