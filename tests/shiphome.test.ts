import { describe, expect, it } from "vitest";
import { Mover, Tile, pt } from "../src/engine/board.js";
import { TICK_MS, type Game, type Wisp } from "../src/engine/game.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { SHIP, SHIP_DECK, SHIP_SEA, bankCovers, inDraw, inSea, onDeck, shipKindLanes, shipLanes, shipLight, shipReach } from "../src/engine/shiphome.js";
import { STILLS } from "../src/engine/stills.js";
import { ShipRoom, type Stand } from "../src/server/shiphome.js";

type Inner = { fire: number; lead: number; big: Set<number>; bank: { side: number; front: number } | null; bankAt: number; line: number | null };
const inner = (room: ShipRoom) => room as unknown as Inner;

function open(seed: number, stand: Stand | null = "rails", setup: (room: ShipRoom) => void = () => {}) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new ShipRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  setup(room);
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
    // A few are alongside from the first tick, so there is something to haul at once.
    expect(onBoard(g).length).toBeGreaterThanOrEqual(3);
    let seen = 0, lost = 0, widest = 0;
    const kinds = shipKindLanes();
    for (let n = 0; n < 60; n++) {
      room.onTick();
      lost = Math.max(lost, room.lost);
      for (const w of onBoard(g)) {
        seen++;
        const x = w.pos.x - c.x;
        expect(onDeck(x, w.pos.y - c.y)).toBe(false);
        // Small ones down the lanes near a rail, big ones far out, and nothing between.
        expect(inner(room).big.has(w.id) ? kinds.big : kinds.small).toContain(x);
        widest = Math.max(widest, Math.abs(x));
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect(widest).toBeGreaterThan(SHIP_DECK.hw + SHIP.off[1] - 6);
    expect(lost).toBeGreaterThan(1);
    expect(g.pullReach).toBe(SHIP.reach);
  });

  it("on a screen held upright the lanes stop sooner, and nothing shows beyond them", () => {
    const { room, toPlay } = open(13, "idle", (r) => (r.far = SHIP.offNarrow));
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

  it("a haul: a big one from the farthest lane takes about three seconds to the hull's side, sliding astern all the while, and then the lamp takes it and banks it for three", () => {
    const { room, conn, toPlay } = open(17, null);
    room.banksOn = false;
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!;
    for (const w of onBoard(g)) g.away.set(w.id, 1e9);
    const w = g.wisps[9]!;
    const far = SHIP_DECK.hw + SHIP.off[1];
    rook.pos = pt(c.x + SHIP_DECK.hw, c.y);
    stage(g, w, far, -6);
    inner(room).big.add(w.id);
    expect(g.board.passable(w.pos, Mover.Walker)).toBe(false);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    let ticks = 0;
    const y0 = w.pos.y;
    while (!inDraw(w.pos.x - c.x, w.pos.y - c.y) && ticks++ < 20) {
      room.onTick();
      if (ticks === 2) expect(room.storyView().ship!.line).toBe(w.id);
    }
    expect(ticks).toBeGreaterThanOrEqual(SHIP.kinds.ticks[1]);
    expect(ticks).toBeLessThanOrEqual(SHIP.kinds.ticks[1] + 2);
    // It came straight in, and slid astern with the rest while it came.
    expect(w.pos.y).toBeGreaterThan(y0 + 1);
    // His staff comes off it, he does nothing more, and it is banked: the fire is fed for three.
    room.onTick();
    expect(rook.action.kind).toBe("idle");
    expect(rook.beam).toBe(null);
    const t0 = g.tick;
    let before = inner(room).fire;
    while (room.banked === 0 && g.tick - t0 < 12) (before = inner(room).fire), room.onTick();
    expect(room.banked).toBe(1);
    expect(inner(room).fire - before).toBeGreaterThan(SHIP.kinds.worth[1] * SHIP.speed.feed - SHIP.speed.burn[0] - SHIP.speed.burn[1] - 1e-9);
    conn.close();
  });

  it("a small one near the hull is aboard in a tick or two, and is worth one", () => {
    const { room, conn, toPlay } = open(17, null);
    room.banksOn = false;
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!;
    for (const w of onBoard(g)) g.away.set(w.id, 1e9);
    const w = g.wisps[9]!;
    rook.pos = pt(c.x + SHIP_DECK.hw, c.y);
    stage(g, w, shipKindLanes().small.at(-1)!, -2);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    let ticks = 0;
    while (!inDraw(w.pos.x - c.x, w.pos.y - c.y) && ticks++ < 20) room.onTick();
    expect(ticks).toBeLessThanOrEqual(SHIP.kinds.ticks[0] + 1);
    conn.close();
  });

  it("if he walks the line drops, and one that slides to the stern on his line is lost all the same", () => {
    const { room, conn, toPlay } = open(17, null);
    room.banksOn = false;
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!;
    for (const w of onBoard(g)) g.away.set(w.id, 1e9);
    const w = g.wisps[9]!;
    const far = SHIP_DECK.hw + SHIP.off[1];
    rook.pos = pt(c.x + SHIP_DECK.hw, c.y);
    stage(g, w, far, -4);
    inner(room).big.add(w.id);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    room.onTick();
    room.onTick();
    expect(room.storyView().ship!.line).toBe(w.id);
    const x = w.pos.x;
    expect(x).toBeLessThan(c.x + far);
    // He walks: it is left where it is, loose, and comes no nearer.
    conn.message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x: c.x, y: c.y + 5 } } }));
    for (let i = 0; i < 3; i++) room.onTick();
    expect(room.storyView().ship!.line).toBeUndefined();
    expect(w.pos.x).toBe(x);
    expect(g.away.has(w.id)).toBe(false);
    // Taken late, right at the stern: the slide has it before it is over the rail.
    rook.pos = pt(c.x + SHIP_DECK.hw, c.y + SHIP_DECK.hl);
    rook.action = { kind: "idle" };
    stage(g, w, far, SHIP_DECK.hl + SHIP.astern);
    inner(room).big.add(w.id);
    const lost = room.lost;
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    for (let i = 0; i < 6 && room.lost === lost; i++) room.onTick();
    expect(room.lost).toBe(lost + 1);
    expect(room.banked).toBe(0);
    expect(rook.action.kind).toBe("idle");
    conn.close();
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
      expect(room.lost).toBeGreaterThan(5);
    }
  });

  it("the third view comes inside the last fifteen seconds, and the second at half way with no words", () => {
    const { room, msgs, run } = open(77, "rails");
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

  it("speed is the difficulty: the fire burns down, a bank feeds it, and the hotter it burns the faster the wisps slide and the faster he gains", () => {
    const { room, toPlay } = open(5, "idle");
    room.banksOn = false;
    toPlay();
    const g = room.state.game, c = g.board.center, I = inner(room), Sp = SHIP.speed;
    for (const w of onBoard(g)) g.away.set(w.id, 1e9);
    expect(room.storyView().ship!.fire).toBe(Sp.start);
    // Burning down, with nothing banked.
    const f0 = I.fire;
    room.onTick();
    expect(I.fire).toBeCloseTo(f0 - Sp.burn[0] - Sp.burn[1] * f0, 9);
    // How far a loose one slides in ten ticks with the fire low, and with it high.
    const slid = (fire: number) => {
      const w = g.wisps[9]!;
      stage(g, w, 9, -8);
      const y0 = w.pos.y;
      for (let i = 0; i < 10; i++) (I.fire = fire), room.onTick();
      expect(w.pos.x).toBe(c.x + 9);
      g.away.set(w.id, 1e9);
      return w.pos.y - y0;
    };
    const slow = slid(0.1), fast = slid(0.95);
    expect(slow).toBeGreaterThanOrEqual(Math.floor(10 * Sp.wind[0]));
    expect(fast).toBeGreaterThan(slow * 2);
    // Above what holds his distance he gains on the patch; below it he falls behind.
    I.fire = 0.95;
    let lead = room.state.lead;
    room.onTick();
    expect(room.state.lead).toBeLessThan(lead);
    I.fire = 0.2;
    lead = room.state.lead;
    room.onTick();
    expect(room.state.lead).toBeGreaterThan(lead);
    // One past the stern is gone, and the page is told where it went.
    const w = g.wisps[9]!;
    stage(g, w, 9, SHIP_DECK.hl + SHIP.astern);
    const lost = room.lost;
    for (let i = 0; i < 3 && room.lost === lost; i++) room.onTick();
    expect(g.away.has(w.id)).toBe(true);
    expect(room.lost).toBe(lost + 1);
    expect(room.storyView().ship!.lost).toEqual([{ x: 9, tick: g.tick }]);
  });

  it("a cloud bank comes down one side at a time: what it lies over is hidden and cannot be taken, and a haul in the air under it is torn loose", () => {
    const { room, conn, toPlay } = open(31, null);
    toPlay();
    const g = room.state.game, c = g.board.center, rook = g.players[0]!, I = inner(room), B = SHIP.bank;
    for (const w of onBoard(g)) g.away.set(w.id, 1e9);
    // Keep the patch in sight while nobody feeds the lamp.
    const hold = () => ((I.fire = 0.7), (I.lead = SHIP.patch.start));
    // The first is seen `warn` ticks before its front reaches the cloud the wisps are in.
    let ticks = 0;
    while (!room.storyView().ship!.bank && ticks++ < 40) hold(), room.onTick();
    const first = room.storyView().ship!.bank!;
    expect(g.tick).toBeGreaterThanOrEqual(B.first);
    expect(SHIP_SEA.y0 - first.front).toBeGreaterThanOrEqual((B.warn - 1) * B.speed);
    const side = first.side;
    // A big one far out on that side, level with him: he takes it while the bank is still ahead.
    const w = g.wisps[9]!;
    rook.pos = pt(c.x + side * SHIP_DECK.hw, c.y);
    while (I.bank!.front < -B.speed) hold(), room.onTick();
    stage(g, w, side * (SHIP_DECK.hw + SHIP.off[1]), 0);
    I.big.add(w.id);
    expect(g.inReach(rook, w)).toBe(true);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    const lost = room.lost;
    for (let i = 0; i < 4 && room.lost === lost; i++) hold(), room.onTick();
    // The bank reached it before it was aboard: torn off his line, and the page is told where.
    expect(room.torn).toBe(1);
    expect(room.lost).toBe(lost + 1);
    expect(room.storyView().ship!.lost!.at(-1)!.y).toBeDefined();
    expect(rook.action.kind).toBe("idle");
    // One lying under it is hidden, out of his reach, and a staff asked onto it is not taken.
    const o = g.wisps[10]!;
    stage(g, o, side * (SHIP_DECK.hw + 3), I.bank!.front - 6);
    expect(bankCovers(I.bank, o.pos.x - c.x, o.pos.y - c.y)).toBe(true);
    expect(room.storyView().ship!.hid).toContain(o.id);
    rook.pos = pt(c.x + side * SHIP_DECK.hw, o.pos.y);
    expect(g.inReach(rook, o)).toBe(false);
    conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: o.id } }));
    expect(rook.action.kind).toBe("idle");
    // The other side is clear of it.
    stage(g, o, -side * (SHIP_DECK.hw + 3), o.pos.y - c.y);
    expect(room.storyView().ship!.hid ?? []).not.toContain(o.id);
    g.away.set(o.id, 1e9);
    // It passes astern. The next may already be seen coming, but it is still well ahead of the cloud the wisps are in: never two over it at once.
    let passed = false;
    for (let n = 0; n < 60 && !passed; n++) {
      hold();
      room.onTick();
      const now = room.storyView().ship!.bank;
      passed = !now || now.front < first.front + B.speed;
      if (passed && now) expect(now.front).toBeLessThanOrEqual(SHIP_SEA.y0 - (B.warn - 1) * B.speed);
    }
    expect(passed).toBe(true);
    conn.close();
  });

  it("each part can be turned off by itself, and the long run asked for", () => {
    const { room, toPlay, run } = open(11, "rails", (r) => ((r.speedOn = r.banksOn = r.haulsOn = false), (r.len = SHIP.ticksLong)));
    toPlay();
    let banks = 0;
    for (let n = 0; n < 150; n++) {
      room.onTick();
      const v = room.storyView().ship!;
      expect(v.fire).toBeUndefined();
      expect(v.big).toBeUndefined();
      if (v.bank) banks++;
    }
    expect(banks).toBe(0);
    run();
    expect(room.ticks).toBe(SHIP.ticksLong);
    expect(room.storyView().ship!.ticks).toBe(SHIP.ticksLong);
  });

  it("staying at one rail loses the patch more often than crossing the deck", () => {
    const tries = (stand: Stand) => [1, 2, 3, 4, 5, 6, 7, 8].reduce((n, k) => {
      const { room, run } = open(k * 7919, stand);
      run();
      return n + room.restarts;
    }, 0);
    expect(tries("port")).toBeGreaterThan(tries("rails") + 1);
  });

  it("running to the rails keeps the patch in sight where standing amidships loses it", () => {
    const tries = (stand: Stand) => [11, 4242, 77].reduce((n, seed) => {
      const { room, toPlay } = open(seed, stand);
      toPlay();
      for (let n = 0; n < 240; n++) room.onTick();
      return n + room.restarts;
    }, 0);
    expect(tries("hold")).toBeGreaterThan(tries("rails") + 2);
  });

  it("a wisp that goes into the lamp feeds the fire for what it is worth", () => {
    const { room, toPlay } = open(3, "idle");
    room.banksOn = false;
    toPlay();
    const g = room.state.game, I = inner(room), Sp = SHIP.speed;
    for (const w of onBoard(g)) g.away.set(w.id, 1e9);
    const w = g.wisps[9]!;
    // On the lamp's rim: it goes in by itself after its two ticks there.
    stage(g, w, 2, 0);
    let before = I.fire;
    for (let i = 0; i < 6 && room.banked === 0; i++) (before = I.fire), room.onTick();
    expect(room.banked).toBe(1);
    expect(I.fire).toBeCloseTo(before - Sp.burn[0] - Sp.burn[1] * before + Sp.feed * SHIP.kinds.worth[0], 9);
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
    const { room, toPlay } = open(2, "rails");
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
