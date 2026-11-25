import { describe, expect, it } from "vitest";
import { Tile, pt } from "../src/engine/board.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { LO_POOLS, RESCUE, loStrip, rescueCloudTicks } from "../src/engine/rescue.js";
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
/** The build before the brightest-thing rule (v155): the patch on the cloud's clock, and a lamp that leaks. */
const clock = (r: RescueRoom) => (r.patchAim = "clock");

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
      const { room, lines, toPlay } = open(seed, "hold", clock);
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
      // It comes on its clock, so a quick hand meets it once or twice and a slower one three times; and once more at the end to sit by the stones.
      expect(crossings).toBeGreaterThanOrEqual(2);
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
    const { room, toPlay } = open(11, null, clock);
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

  it("the lamp does not keep its light: left unfed its newest pip flickers and goes out, then another; a wisp in time keeps it, a lifted boat is safe, and the switch turns it off", () => {
    const { room, lines, toPlay } = open(11, null, clock);
    toPlay();
    const g = room.state.game, c = g.board.center, L = RESCUE.lamp;
    const view = () => room.storyView().rescue!;
    const feed = () => {
      let w = g.wisps.find((q) => q.guild === 0 && !g.away.has(q.id));
      while (!w) room.onTick(), (w = g.wisps.find((q) => q.guild === 0 && !g.away.has(q.id)));
      w.pos = w.prev = pt(c.x + L.at[0], c.y + L.at[1] - 3);
      w.target = w.holder = null;
      room.onTick();
    };
    feed();
    feed();
    expect(room.state.fill[0]).toBe(2);
    // Quiet until the last few ticks, then the newest pip flickers.
    for (let n = 0; n < L.hold - L.flicker - 1; n++) room.onTick();
    expect(view().lamp!.gutter).toBeUndefined();
    room.onTick();
    expect(view().lamp!.gutter).toBe(L.flicker);
    for (let n = 0; n < L.flicker; n++) room.onTick();
    // It goes out, and Kes says why, once, as a line that stays up.
    expect(room.state.fill[0]).toBe(1);
    expect(room.pipsLost).toBe(1);
    expect(view().lamp!.went).toBe(g.tick);
    expect(view().left).toBe(RESCUE.boats * RESCUE.perBoat - 1);
    for (let n = 0; n < L.drip; n++) room.onTick();
    expect(room.state.fill[0]).toBe(0);
    expect(lines().filter((l) => l.text === "It won't keep in this cloud! Fill it in one go!")).toHaveLength(1);
    // Empty, it has nothing to lose.
    for (let n = 0; n < L.hold + L.drip; n++) room.onTick();
    expect(room.pipsLost).toBe(2);
    // A wisp in time starts its clock again.
    feed();
    for (let n = 0; n < L.hold - 2; n++) room.onTick();
    feed();
    for (let n = 0; n < L.hold - 2; n++) room.onTick();
    expect(room.state.fill[0]).toBe(2);
    expect(room.pipsLost).toBe(2);
    // Filled, the boat lifts, and a lifted boat keeps what it has.
    feed();
    feed();
    expect(room.state.lifted).toBe(1);
    for (let n = 0; n < L.hold + 2 * L.drip; n++) room.onTick();
    expect(room.state.fill[0]).toBe(RESCUE.perBoat);
    expect(room.pipsLost).toBe(2);
    // On its switch the lamp keeps its light, as in the build before.
    const held = open(11, null, (r) => ((r.lampMode = "holds"), (r.patchAim = "clock")));
    held.toPlay();
    const hg = held.room.state.game, w = hg.wisps.find((q) => q.guild === 0)!;
    w.pos = w.prev = pt(hg.board.center.x + L.at[0], hg.board.center.y + L.at[1] - 3);
    held.room.onTick();
    for (let n = 0; n < L.hold + 2 * L.drip; n++) held.room.onTick();
    expect(held.room.state.fill[0]).toBe(1);
    expect(held.room.pipsLost).toBe(0);
    expect(held.room.storyView().rescue!.lamp!.gutter).toBeUndefined();
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
    expect(lines().map((l) => l.text)).toContain("Two at the stones, Rook!");
    expect(room.storyView().rescue!.drop).toEqual({ x: c.x + D.at[0], y: c.y + D.at[1], r: D.r });
    // With nobody to put them in she brings no more: the same two wait, and nothing is banked.
    for (let n = 0; n < 60; n++) room.onTick();
    expect(room.setDowns).toBe(RESCUE.hers);
    expect(room.kesBanks).toBe(0);
    expect(room.state.banked).toBe(0);
  });

  it("the patch goes for the biggest gathering of loose light, swells over it and stays a moment; play stops once on the full-screen still before the first", () => {
    const { room, conn, lines, toPlay } = open(4321, null, (r) => (r.patchAim = "react"));
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

  it("the patch comes on the cloud's clock, never on how many are in: each crossing is told for a while first, the still comes early in the first tell, and it aims at the gathering as it sets out", () => {
    const { room, conn, lines, toPlay } = open(4321, null, clock);
    toPlay();
    const g = room.state.game, c = g.board.center, C = RESCUE.patch.clock;
    const mine = g.wisps.filter((w) => w.guild === 0);
    const put = (w: (typeof g.wisps)[number], x: number, y: number) => ((w.pos = w.prev = pt(c.x + x, c.y + y)), (w.target = null), (w.holder = null));
    put(mine[0]!, -1, -12);
    put(mine[1]!, 1, -13);
    put(mine[2]!, 0, -14);
    for (const w of g.wisps) if (w.guild === 1) g.away.set(w.id, 1e9);
    // However many are in, nothing comes before its time.
    inside(room).bankedN = 11;
    const due = Math.round(C.at[0]! * rescueCloudTicks());
    while (g.tick < due - 1) {
      room.onTick();
      expect(room.state.patch).toBeNull();
      expect(room.storyView().rescue!.tell).toBeUndefined();
    }
    room.onTick();
    expect(room.storyView().rescue!.tell).toEqual({ left: C.tell, of: C.tell, n: 1 });
    expect(room.state.patch).toBeNull();
    // The still, a couple of ticks into the tell: play holds, and a tap goes on.
    for (let n = 0; n < C.hold; n++) room.onTick();
    expect(room.state.holdLeft).toBeGreaterThan(0);
    expect(lines().find((l) => l.text === "Rook. What is that.")!.still).toEqual({ id: RESCUE.hold.id, full: true });
    const held = g.tick;
    room.onTick();
    expect(g.tick).toBe(held);
    conn.message(JSON.stringify({ t: "on" }));
    // He moves them while it is told: it goes for where they are when it sets out.
    put(mine[0]!, -1, -19);
    put(mine[1]!, 1, -20);
    put(mine[2]!, 0, -21);
    let ticks = 0;
    while (!room.state.patch && ticks++ < 40) room.onTick();
    expect(g.tick - due).toBeGreaterThanOrEqual(C.tell);
    expect(g.tick - due).toBeLessThanOrEqual(C.tell + 2);
    expect(room.storyView().rescue!.tell).toBeUndefined();
    expect(room.state.patch!.y).toBe(c.y - 20 + 0.5);
    expect(room.state.patch!.n).toBe(1);
    // The second is told at its own time, with her word at the first cold lamp.
    while (room.state.patch) room.onTick();
    const next = Math.round(C.at[1]! * rescueCloudTicks());
    while (g.tick <= next) room.onTick();
    expect(room.storyView().rescue!.tell!.n).toBe(2);
    for (let n = 0; n < 8; n++) room.onTick();
    expect(lines().map((l) => l.text)).toContain("It's coming back!");
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

  it("the pause is three pictures with static between the second and third, and they fit the time play is held", () => {
    const H = RESCUE.hold, ms = H.frames.reduce((n, f) => n + f.ms, 0) + H.static.ms;
    expect(H.frames.map((f) => f.id)).toEqual(["r9-what-is-that-1", "r9-what-is-that-2", "r9-what-is-that-3"]);
    expect(H.static.after).toBe(1);
    expect(ms).toBeLessThanOrEqual(H.ticks * 600);
    expect(ms).toBeGreaterThan((H.ticks - 1) * 600);
  });

  describe("the rule: it goes for the brightest thing", () => {
    type Bait = { tell: { k: number; left: number } | null; toldAt: number; said: Set<string>; fill: number[]; sipAt: number };
    const bait = (room: RescueRoom) => room as unknown as Bait;
    const stage = (seed = 2024) => {
      const o = open(seed, null);
      o.toPlay();
      const g = o.room.state.game, c = g.board.center, L = RESCUE.lamp, D = RESCUE.drop;
      // Its first visit is behind it, and no other comes until the test calls one.
      inside(o.room).crossings = 1;
      bait(o.room).toldAt = 1e9;
      const put = (w: (typeof g.wisps)[number], x: number, y: number) => ((w.pos = w.prev = pt(c.x + x, c.y + y)), (w.target = null), (w.holder = null));
      const mine = () => g.wisps.filter((w) => w.guild === 0 && !g.away.has(w.id));
      /** His loose wisps: this many at the stones, the rest far off and apart. */
      const lay = (atStones: number) => mine().forEach((w, i) => (i < atStones ? put(w, D.at[0] + (i % 2), D.at[1] + Math.floor(i / 2)) : put(w, -14 + i * 7, -24)));
      /** A warning about to end, with the still and the lesson out of the way. */
      const tellNow = () => (bait(o.room).said.add("what"), bait(o.room).said.add("rule"), (bait(o.room).tell = { k: 0, left: 3 }));
      return { ...o, g, c, L, D, put, mine, lay, tellNow, view: () => o.room.storyView().rescue! };
    };

    it("it is the run's own rule, and the lamp does not leak under it", () => {
      const { room, L, mine, put, view } = stage();
      expect(room.patchAim).toBe("bait");
      put(mine()[0]!, L.at[0], L.at[1] - 2);
      room.onTick();
      expect(room.state.fill[0]).toBe(1);
      for (let n = 0; n < L.hold + 2 * L.drip; n++) room.onTick();
      expect(room.state.fill[0]).toBe(1);
      expect(room.pipsLost).toBe(0);
      expect(view().lamp!.gutter).toBeUndefined();
    });

    it("the lamp takes one wisp and then nothing for a while: the next waits in its light, the ring is told, and it goes in by itself", () => {
      const { room, L, mine, put, view } = stage();
      const B = RESCUE.patch.bait;
      const [a, b] = mine();
      put(a!, L.at[0], L.at[1] - 2);
      put(b!, L.at[0] + 1, L.at[1] - 2);
      room.onTick();
      expect(room.state.fill[0]).toBe(1);
      expect(view().lamp!.sip).toEqual({ left: B.sip, of: B.sip, n: 1 });
      for (let n = 0; n < B.sip - 1; n++) room.onTick();
      expect(room.state.fill[0]).toBe(1);
      expect(view().lamp!.sip!.left).toBe(1);
      room.onTick();
      expect(room.state.fill[0]).toBe(2);
    });

    it("more at the stones than in the lamp and it takes the stones: the boat keeps its light and Kes says so", () => {
      const { room, g, L, lay, put, mine, tellNow, lines, view } = stage();
      put(mine()[0]!, L.at[0], L.at[1] - 2);
      room.onTick();
      expect(room.state.fill[0]).toBe(1);
      lay(2);
      tellNow();
      room.onTick();
      // Told all through the warning: what it is turned for, and how bright that is.
      expect(view().tell!.to).toMatchObject({ kind: "heap", n: 2 });
      const before = room.lostToPatch;
      let sat = false;
      for (let n = 0; n < 80 && (room.state.patch || bait(room).tell); n++) room.onTick(), (sat ||= !!view().lamp!.sat);
      for (let n = 0; n < 12; n++) room.onTick();
      expect(sat).toBe(false);
      expect(room.lostToPatch - before).toBeGreaterThanOrEqual(2);
      expect(room.state.fill[0]).toBeGreaterThanOrEqual(1);
      expect(room.pipsLost).toBe(0);
      expect(lines().some((l) => l.text === "It took the stones. Boat's still lit. Go!")).toBe(true);
      expect(g.tick).toBeGreaterThan(0);
    });

    it("as many in the lamp as at the stones and it sits on the boat: the pips go out one by one, the lamp is cold a while after, and nobody is harmed", () => {
      const { room, g, L, lay, put, mine, tellNow, lines, view } = stage();
      const B = RESCUE.patch.bait;
      for (let k = 0; k < 2; k++) {
        put(mine()[0]!, L.at[0], L.at[1] - 2);
        room.onTick();
        for (let n = 0; n < B.sip; n++) room.onTick();
      }
      expect(room.state.fill[0]).toBe(2);
      lay(2);
      tellNow();
      room.onTick();
      expect(view().tell!.to).toMatchObject({ kind: "lamp", n: 2 });
      let satFor = 0, offAt = -1;
      const went: number[] = [];
      for (let n = 0; n < 120 && (room.state.patch || bait(room).tell); n++) {
        room.onTick();
        const v = view();
        if (v.lamp!.sat) satFor++, expect(v.lamp!.dark).toBe(true);
        if (v.lamp!.went === g.tick) went.push(g.tick);
        if (offAt < 0 && v.lamp!.cold === 0) offAt = g.tick;
        // Nobody is hurt, and nobody is shown lost: Rook plays on, and Kes is only ever dark.
        expect(room.state.phase).toBe("playing");
      }
      for (let n = 0; n < 12; n++) room.onTick();
      expect(satFor).toBeGreaterThanOrEqual(2 * B.drink);
      expect(went).toHaveLength(2);
      expect(went[1]! - went[0]!).toBe(B.drink);
      expect(room.state.fill[0]).toBe(0);
      expect(room.pipsLost).toBe(2);
      expect(room.state.lifted).toBe(0);
      expect(lines().some((l) => l.text === "It's on the boat. Rook, it's on the boat!")).toBe(true);
      expect(lines().some((l) => l.text === "They're all right. They're all right. The lamp's cold. Again!")).toBe(true);
      // Cold: it takes nothing for a while after the patch has moved off it.
      expect(offAt).toBeGreaterThan(0);
      expect(bait(room).sipAt).toBeGreaterThanOrEqual(offAt + B.cold);
    });

    it("a lifted boat is never touched", () => {
      const { room, L, put, mine, lay, tellNow } = stage();
      bait(room).fill[0] = RESCUE.perBoat - 1;
      put(mine()[0]!, L.at[0], L.at[1] - 2);
      room.onTick();
      expect(room.state.lifted).toBe(1);
      lay(0);
      tellNow();
      for (let n = 0; n < 120 && (room.state.patch || bait(room).tell); n++) room.onTick();
      expect(room.state.fill[0]).toBe(RESCUE.perBoat);
      expect(room.state.lifted).toBe(1);
    });

    it("its first visit goes to the lamp if anything is in it, and then Kes says the rule once; nothing he reads says bait, offer, give or feed", () => {
      const { room, lines, msgs, toPlay } = open(7919, "bait");
      toPlay();
      for (let n = 0; n < 1400 && room.state.phase === "playing"; n++) room.onTick();
      const said = lines().map((l) => l.text);
      expect(said.filter((t) => t === "It goes for the brightest thing. Leave more at the stones than there is in the lamp!")).toHaveLength(1);
      expect(said.indexOf("It's on the boat. Rook, it's on the boat!")).toBeGreaterThanOrEqual(0);
      expect(said.indexOf("It's on the boat. Rook, it's on the boat!")).toBeLessThan(said.indexOf("It goes for the brightest thing. Leave more at the stones than there is in the lamp!"));
      const read = [...said, ...msgs.flatMap((m) => (m.t === "room" ? (m.room.story?.rescue?.caption ?? []) : []))];
      for (const t of read) expect(t).not.toMatch(/\b(bait|offer|offering|give|feed)\b/i);
      for (const t of read) expect(t).not.toMatch(/\bsink/i);
      expect(said).not.toContain("It went for the heap. Don't let mine sit!");
      expect(said).not.toContain("It won't keep in this cloud! Fill it in one go!");
    });

    it("bringing everything straight in does not win before the cloud; leaving more at the stones than is in the lamp does, with the patch taking a large share", () => {
      let poured = 0, left = 0;
      for (const seed of [7919, 15838, 23757]) {
        const a = open(seed, "hold");
        a.toPlay();
        for (let n = 0; n < 700 && a.room.state.phase === "playing" && a.room.restarts === 0; n++) a.room.onTick();
        if (a.room.restarts === 0 && a.room.state.phase === "results") poured++;
        const b = open(seed, "bait");
        b.toPlay();
        for (let n = 0; n < 700 && b.room.state.phase === "playing" && b.room.restarts === 0; n++) b.room.onTick();
        if (b.room.restarts === 0 && b.room.state.phase === "results") {
          left++;
          expect(b.room.lostToPatch / (b.room.wispsIn + b.room.lost)).toBeGreaterThan(0.4);
        }
      }
      expect(poured).toBe(0);
      expect(left).toBeGreaterThanOrEqual(2);
    });
  });
});
