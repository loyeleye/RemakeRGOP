import { describe, expect, it } from "vitest";
import { Tile, pt } from "../src/engine/board.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { LO_POOLS, RESCUE, loStrip } from "../src/engine/rescue.js";
import { RescueRoom, type Stand } from "../src/server/rescue.js";

function open(seed: number, stand: Stand | null = "hold", setup?: (room: RescueRoom) => void) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new RescueRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  setup?.(room);
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const lines = () => msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  const toPlay = () => {
    while (room.state.phase === "countdown") room.onTick();
  };
  return { room, conn, msgs, lines, toPlay };
}
/** The room's own parts, for staging a moment. */
type Inside = { launch(n: 1 | 2, row: number): void; crossings: number; stand: Stand | null; kesHold: boolean; bankedN: number; said: Set<string> };
const inside = (room: RescueRoom) => room as unknown as Inside;

describe("Run 9: the rescue, on the low one", () => {
  it("the low one is three strips cut by two pools, and the bank is the slip at the landing, south of all of it", () => {
    const sh = shrineById(RESCUE.shrine), b = sh.board, c = b.center;
    expect(sh.landing).toBe(true);
    for (const p of LO_POOLS) for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) expect(b.tile(pt(c.x + x, c.y + y))).toBe(Tile.Water);
    // Open ground on each strip, and across both necks.
    for (const x of [-12, 0, 12]) expect(b.tile(pt(c.x + x, c.y - 15 + (x === 0 ? 3 : 0)))).toBe(Tile.Floor);
    for (const y of [-27, -7]) for (const x of [-7, 7]) expect(b.tile(pt(c.x + x, c.y + y))).toBe(Tile.Floor);
    expect(b.tile(c)).toBe(Tile.Brazier);
    // Nothing of the island lies south of the slip, and a walker can get from Rook's start to its side.
    for (let y = c.y + 3; y < b.height; y++) for (let x = 0; x < b.width; x++) expect(b.tile(pt(x, y))).toBe(Tile.Edge);
    const path = b.walkPath(sh.starts[0]![0]!, pt(c.x - 3, c.y));
    expect(path[path.length - 1]).toEqual(pt(c.x - 3, c.y));
  });

  it("a careful hand fills three boats before the cloud is at the landing: every wisp goes in by his pull, some by way of Kes's stones, and the patch crosses on the way", () => {
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
      // Two or three times, and once more at the end to sit by the stones.
      expect(crossings).toBeGreaterThanOrEqual(3);
      expect(crossings).toBeLessThanOrEqual(4);
      // Kes never banks; what she set down, he put in.
      expect(room.kesBanks).toBe(0);
      expect(room.setDowns).toBeGreaterThan(0);
      expect(room.viaKes).toBeGreaterThan(0);
      expect(room.viaKes).toBeLessThanOrEqual(room.setDowns);
      if (room.restarts === 0) won++;
      const said = lines().map((l) => l.text);
      expect(said[0]).toBe("The low one. The next island over, and the cloud is taking it.");
      expect(said[1]).toBe("Little ones on the first boat. We'll keep.");
      expect(said[2]).toBe(RESCUE.goal);
      expect(said[3]).toBe(RESCUE.part);
      expect(said).toContain("First boat's away!");
      expect(said).toContain("Second's away! One more!");
      expect(said).toContain("Rook. What is that.");
      expect(said).toContain("It went for the heap. Don't let mine sit!");
      expect(said.some((t) => /stones/i.test(t))).toBe(true);
      expect(room.stillsShown).toContain(RESCUE.hold.id);
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

  it("the docked boat's lamp is the bank: a wisp of his that comes into its light flies in, one of hers does not, and the fourth lifts the boat", () => {
    const { room, toPlay } = open(11, null);
    toPlay();
    const g = room.state.game, c = g.board.center, L = RESCUE.lamp;
    const mine = g.wisps.filter((w) => w.guild === 0), hers = g.wisps.find((w) => w.guild === 1)!;
    const put = (w: (typeof g.wisps)[number], x: number, y: number) => ((w.pos = w.prev = pt(c.x + x, c.y + y)), (w.target = null), (w.holder = null));
    // Just outside its light: nothing. Inside: gone into the lamp on the next tick, and seen flying.
    put(mine[0]!, L.at[0], L.at[1] - 5);
    put(hers, L.at[0] + 1, L.at[1] - 2);
    room.onTick();
    expect(room.state.fill[0]).toBe(0);
    put(mine[0]!, L.at[0], L.at[1] - 3);
    room.onTick();
    expect(room.state.fill[0]).toBe(1);
    expect(g.away.has(mine[0]!.id)).toBe(true);
    expect(room.storyView().rescue!.flew).toHaveLength(1);
    expect(g.away.has(hers.id)).toBe(false);
    expect(room.storyView().rescue!.left).toBe(RESCUE.boats * RESCUE.perBoat - 1);
    // Three more and the boat lifts; while the next slides in the lamp is dark and takes nothing.
    for (let k = 0; k < 3; k++) {
      const w = g.wisps.filter((q) => q.guild === 0 && !g.away.has(q.id))[0]!;
      put(w, L.at[0] - 2, L.at[1] - 2);
      room.onTick();
      if (k < 2) for (let n = 0; n < RESCUE.pause + 2; n++) room.onTick();
    }
    expect(room.state.lifted).toBe(1);
    expect(room.storyView().rescue!.lamp!.dark).toBe(true);
    const w = g.wisps.filter((q) => q.guild === 0 && !g.away.has(q.id))[0];
    if (w) {
      put(w, L.at[0] + 2, L.at[1] - 2);
      room.onTick();
      expect(room.state.fill[1]).toBe(0);
      for (let n = 0; n < RESCUE.lamp.swap; n++) room.onTick();
      expect(room.state.fill[1]).toBe(1);
    }
  });

  it("Kes strings hers on the far side, walks them to the stones and sets them down for him: they are his to pull from then, and she never banks", () => {
    const { room, lines, toPlay } = open(7919, "idle");
    toPlay();
    const g = room.state.game, c = g.board.center, D = RESCUE.drop;
    for (let n = 0; n < 120 && room.setDowns === 0; n++) room.onTick();
    expect(room.setDowns).toBe(RESCUE.hers);
    const set = g.wisps.filter((w) => room.state.setDown.has(w.id));
    expect(set).toHaveLength(RESCUE.hers);
    for (const w of set) {
      expect(w.guild).toBe(0);
      expect(room.state.hers.has(w.id)).toBe(true);
      expect(Math.hypot(w.pos.x - c.x - D.at[0], w.pos.y - c.y - D.at[1])).toBeLessThanOrEqual(4);
      // Not in the lamp's light: they wait for his pull.
      expect(Math.hypot(w.pos.x - c.x - RESCUE.lamp.at[0], w.pos.y - c.y - RESCUE.lamp.at[1])).toBeGreaterThan(RESCUE.lamp.take);
    }
    expect(g.string).toEqual([]);
    expect(lines().map((l) => l.text)).toContain("Three at the stones, Rook!");
    expect(room.storyView().rescue!.drop).toEqual({ x: c.x + D.at[0], y: c.y + D.at[1], r: D.r });
    // With nobody to put them in she brings no more: the same three wait, and nothing is banked.
    for (let n = 0; n < 60; n++) room.onTick();
    expect(room.setDowns).toBe(RESCUE.hers);
    expect(room.kesBanks).toBe(0);
    expect(room.state.banked).toBe(0);
  });

  it("the patch goes for the biggest gathering of loose light, swells over it and stays a moment; play stops once on the full-screen still before the first", () => {
    const { room, conn, lines, toPlay } = open(4321, null);
    toPlay();
    const g = room.state.game, c = g.board.center, P = RESCUE.patch;
    const mine = g.wisps.filter((w) => w.guild === 0);
    const put = (w: (typeof g.wisps)[number], x: number, y: number) => ((w.pos = w.prev = pt(c.x + x, c.y + y)), (w.target = null), (w.holder = null));
    // Three of his together on the middle strip, well away from the lamp; hers parked off the board.
    put(mine[0]!, -1, -12);
    put(mine[1]!, 1, -13);
    put(mine[2]!, 0, -14);
    for (const w of g.wisps) if (w.guild === 1) g.away.set(w.id, 1e9);
    const at = room.gathering()!;
    expect(at.n).toBe(3);
    expect(at.row).toBe(c.y - 13);
    inside(room).bankedN = P.at[0]!;
    room.onTick();
    const p = room.state.patch!;
    expect(p).toBeTruthy();
    expect(p.y).toBe(c.y - 13 + 0.5);
    // For three it comes at its middle size and its fastest.
    expect(p.r).toBe(P.react.sizes[1]! / 2);
    expect(p.speed).toBe(P.react.speeds[2]);
    // The still: the game holds for its ticks, and a tap goes on early.
    let held = 0, tick = -1, big = 0, lingered = 0;
    for (let n = 0; n < 80 && room.state.patch; n++) {
      room.onTick();
      if (room.state.holdLeft > 0) {
        if (tick < 0) tick = g.tick;
        expect(g.tick).toBe(tick);
        expect(room.storyView().rescue!.hold!.id).toBe(RESCUE.hold.id);
        if (++held === 2) conn.message(JSON.stringify({ t: "on" }));
      }
      const q = room.state.patch;
      if (q) (big = Math.max(big, q.r)), (lingered += q.phase === "linger" ? 1 : 0);
    }
    for (let n = 0; n < 12; n++) room.onTick();
    expect(held).toBe(2);
    expect(lines().map((l) => l.text)).toContain("Rook. What is that.");
    expect(lines().find((l) => l.text === "Rook. What is that.")!.still).toEqual({ id: RESCUE.hold.id, full: true });
    // It swelled to its looming size over them, stayed, and all three are gone.
    expect(big).toBe(P.react.sizes[2]! / 2);
    expect(lingered).toBe(P.react.linger);
    expect(room.lostToPatch).toBe(3);
    expect(lines().map((l) => l.text)).toContain("It went for the heap. Don't let mine sit!");
  });

  it("while the patch is over the docked boat its lamp is dark and takes nothing", () => {
    const { room, toPlay } = open(2024, null);
    toPlay();
    const g = room.state.game, c = g.board.center, L = RESCUE.lamp;
    inside(room).said.add("what");
    inside(room).launch(1, c.y + L.at[1]);
    const w = g.wisps.find((q) => q.guild === 0)!;
    let dark = 0;
    let placed = false;
    for (let n = 0; n < 60 && room.state.patch; n++) {
      // A wisp of his set down in the lamp's light just as the patch comes over it.
      const q = room.state.patch!;
      if (!placed && q.warn <= 1 && Math.abs(c.x + L.at[0] + 0.5 - (q.x + q.dx / 2)) <= q.dx / 2 + 1) (placed = true), (w.pos = w.prev = pt(c.x + L.at[0], c.y + L.at[1] - 1)), (w.target = null);
      room.onTick();
      if (room.storyView().rescue!.lamp!.dark) dark++;
    }
    expect(placed).toBe(true);
    expect(dark).toBeGreaterThan(0);
    expect(room.state.fill[0]).toBe(0);
    expect(room.lostToPatch).toBeGreaterThanOrEqual(1);
  });

  it("the first build's rules stay on their switches: Kes banks her own and the patch keeps to its two fixed lines", () => {
    const { room, lines, toPlay } = open(7919, "hold", (r) => ((r.kesMode = "banks"), (r.patchAim = "line")));
    toPlay();
    let crossings = 0, had = false;
    for (let n = 0; n < 1500 && room.state.phase === "playing"; n++) {
      room.onTick();
      if (!!room.state.patch && !had) crossings++;
      had = !!room.state.patch;
    }
    expect(room.state.phase).toBe("results");
    expect(crossings).toBe(2);
    expect(room.kesBanks).toBeGreaterThan(0);
    expect(room.setDowns).toBe(0);
    expect(room.stillsShown).not.toContain(RESCUE.hold.id);
    const said = lines().map((l) => l.text);
    expect(said).toContain("Near side's yours. I'll string the far side over.");
    expect(said).toContain("It's coming back. Get them off the neck!");
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
    const row = c.y - 16;
    const place = (w: (typeof g.wisps)[number], x: number, y: number) => ((w.pos = w.prev = pt(c.x + x, y)), (w.target = null), (w.holder = null));
    // All three in the band it will cross (rows row - 1 to row + 5), Rook just below his own.
    place(held!, 0, row + 3);
    place(loose!, -12, row + 2);
    place(later!, 12, row + 3);
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
    const y = c.y - 15;
    w.pos = w.prev = pt(c.x - 11, y);
    rook.pos = rook.prev = pt(c.x - 1, y);
    expect(loStrip(-11)).toBe(0);
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
    const row = c.y - 14;
    w.pos = w.prev = pt(c.x - 12, row);
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
