import { WALKS } from "../src/engine/walks.js";
import { describe, expect, it } from "vitest";
import type { ServerMsg } from "../src/engine/protocol.js";
import { PondRoom } from "../src/server/pond.js";

const manualClock = () => ({ every: () => () => {} });

function open() {
  let s = 7;
  const msgs: ServerMsg[] = [];
  const room = new PondRoom(manualClock(), () => (s = (s * 48271) % 2147483647));
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const said = () => msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  const tap = (x: number, y: number) => conn.message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x, y } } }));
  const answer = (yes: boolean) => conn.message(JSON.stringify({ t: "answer", yes }));
  return { room, msgs, said, tap, answer };
}

describe("The pond, between runs", () => {
  it("has no wisps, and Hesta and the children gather on the far side", () => {
    const { room } = open();
    for (let i = 0; i < 80; i++) room.onTick();
    const g = room.state.game;
    expect(g.wisps.length).toBe(0);
    const at = (name: string) => g.players.find((p) => p.name === name)!.pos;
    expect(at("Hesta")).toEqual(room.spots.gather.hesta);
    expect(at("Sefa")).toEqual(room.spots.gather.sefa);
    expect(at("Lumi")).toEqual(room.spots.gather.lumi);
  });

  it("won't start Granny's game before Hesta reaches the pond: she has a line instead, a random one, then round in turn", () => {
    const { room, said, tap } = open();
    const asked = () => (room as unknown as { asking: unknown }).asking;
    const hestaAt = () => room.state.game.players.find((p) => p.name === "Hesta")!.pos;
    const atPond = () => { const h = hestaAt(), g = room.spots.gather.hesta; return h.x === g.x && h.y === g.y; };
    const early = () => said().filter((l) => l.who === "Hesta").map((l) => l.text);
    for (let i = 0; i < 6; i++) room.onTick();
    const LINES = ["Not here, dear. At the pond. The little ones are waiting.", "These knees get there when they get there.", "Hands off the honey drops. I've counted them."];
    // Tap her (wherever she is now) until she has answered three times, all before she reaches the pond.
    for (let i = 0; i < 200 && early().length < 3 && !atPond(); i++) {
      const before = early().length;
      const h = hestaAt();
      tap(h.x, h.y);
      for (let j = 0; j < 40 && early().length === before && !atPond(); j++) room.onTick();
    }
    const got = early();
    expect(asked()).toBeFalsy();
    expect(got.length).toBeGreaterThanOrEqual(2);
    const first = LINES.indexOf(got[0]!);
    expect(first).toBeGreaterThanOrEqual(0);
    got.forEach((t, i) => expect(t).toBe(LINES[(first + i) % 3]));
  });

  it("answers a tap from afar once Rook has walked up, and tapping Hesta starts Granny's game", () => {
    const { room, said, tap, answer } = open();
    for (let i = 0; i < 80; i++) room.onTick();
    tap(room.spots.lantern.x, room.spots.lantern.y);
    for (let i = 0; i < 40 && !said().some((l) => l.text.startsWith("Lumi's lantern")); i++) room.onTick();
    expect(said().some((l) => l.who === "Rook" && l.text.startsWith("Lumi's lantern"))).toBe(true);
    const h = room.state.game.players.find((p) => p.name === "Hesta")!.pos;
    tap(h.x, h.y);
    // It asks first (Ladi, 25 Nov): nothing starts until he says yes.
    const asked = () => (room as unknown as { asking: unknown }).asking;
    for (let i = 0; i < 40 && !asked(); i++) room.onTick();
    expect(asked()).toBeTruthy();
    for (let i = 0; i < 20; i++) room.onTick();
    expect(room.state.granny).toBeFalsy();
    answer(true);
    for (let i = 0; i < 40 && !room.state.granny; i++) room.onTick();
    const granny = room.state.granny!;
    expect(granny).toBeTruthy();
    // Everyone starts in a proper place, spread round the brazier, and nobody shares a tile.
    const g = granny.state.game, c = g.board.center;
    for (const p of g.players) expect(Math.hypot(p.pos.x - c.x, p.pos.y - c.y)).toBeLessThan(8);
    expect(new Set(g.players.map((p) => `${p.pos.x},${p.pos.y}`)).size).toBe(5);
    expect(granny.state.phase).toBe("countdown");
  });
});

describe("The later walks", () => {
  it("places each walk's people on open ground and says what's not built yet", () => {
    for (const n of [2, 3, 4, 5]) {
      const msgs: ServerMsg[] = [];
      let s = 3;
      const room = new PondRoom(manualClock(), () => (s = (s * 48271) % 2147483647), n);
      const conn = room.connect((m) => msgs.push(m));
      conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
      const g = room.state.game;
      expect(g.players.length).toBe(1 + room.walkDef.people.length);
      expect(new Set(g.players.map((p) => `${p.pos.x},${p.pos.y}`)).size).toBe(g.players.length);
      for (const p of g.players) expect(g.board.passable(p.pos, 2)).toBe(true);
      room.onTick();
    }
  });
  it("in a later walk, people the story doesn't need wander; the rest stay put", () => {
    let s = 7;
    const room = new PondRoom(manualClock(), () => (s = (s * 48271) % 2147483647), 2);
    room.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    const at = (name: string) => ({ ...room.state.game.players.find((p) => p.name === name)!.pos });
    const nell0 = at("Nell"), hesta0 = at("Hesta");
    let moved = false;
    for (let i = 0; i < 80; i++) {
      room.onTick();
      const n = at("Nell");
      if (n.x !== nell0.x || n.y !== nell0.y) moved = true;
    }
    expect(moved).toBe(true);
    expect(at("Hesta")).toEqual(hesta0);
  });
  it("in walk 2, tapping the skiff goes on to the first job (run 4)", () => {
    let s = 7;
    const room = new PondRoom(manualClock(), () => (s = (s * 48271) % 2147483647), 2);
    const conn = room.connect(() => {});
    conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
    const skiff = room.state.game.shrine.props!.find((p) => p.kind === "skiff")!;
    conn.message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x: skiff.x, y: skiff.y } } }));
    const asked = () => (room as unknown as { asking: unknown }).asking;
    for (let i = 0; i < 200 && !asked(); i++) room.onTick();
    // "Not yet" leaves him on the walk; asked again, a yes goes.
    conn.message(JSON.stringify({ t: "answer", yes: false }));
    for (let i = 0; i < 20; i++) room.onTick();
    expect(room.state.job).toBeFalsy();
    conn.message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x: skiff.x, y: skiff.y } } }));
    for (let i = 0; i < 200 && !asked(); i++) room.onTick();
    conn.message(JSON.stringify({ t: "answer", yes: true }));
    for (let i = 0; i < 200 && !room.state.job; i++) room.onTick();
    expect(room.state.job).toBeTruthy();
    expect(room.state.job!.state.stop).toBe(0);
  });
  it("from walk 2, Rook's door opens the kitchen (walk 1 just says a line)", () => {
    const kitchenAfterDoor = (walk: number) => {
      let s = 7;
      const msgs: ServerMsg[] = [];
      const room = new PondRoom(manualClock(), () => (s = (s * 48271) % 2147483647), walk);
      const conn = room.connect((m) => msgs.push(m));
      conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
      const h = room.state.game.shrine.house!;
      conn.message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x: h.x + 1, y: h.y + 1 } } }));
      for (let i = 0; i < 200; i++) room.onTick();
      const rooms = msgs.flatMap((m) => (m.t === "room" ? [m.room] : []));
      return rooms.at(-1)?.story?.pond?.kitchen ?? 0;
    };
    expect(kitchenAfterDoor(2)).toBe(1);
    expect(kitchenAfterDoor(1)).toBe(0);
  });
});

describe("Walk 3's ordinary morning", () => {
  it("offers Moth's two jobs after her lines, opens the one picked, and Maudie's yes goes on", () => {
    let s = 7;
    const room = new PondRoom(manualClock(), () => (s = (s * 48271) % 2147483647), 6);
    room.chain = true;
    const conn = room.connect(() => {});
    conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
    const r = room as unknown as { asking: { choices: string[] } | null; optional?: { id: string }; done: boolean; answer: (t: { name: string; at: () => { x: number; y: number } }) => void };
    r.answer({ name: "Moth", at: () => ({ x: 0, y: 0 }) });
    expect(r.asking).toBeNull();
    for (let i = 0; i < 12 && !r.asking; i++) room.onTick();
    expect(r.asking!.choices).toEqual(["Moss Hollow", "Tidepool Steps"]);
    conn.message(JSON.stringify({ t: "answer", yes: true, pick: 1 }));
    for (let i = 0; i < 6 && !r.optional; i++) room.onTick();
    expect(r.optional!.id).toBe("o3b");
    r.answer({ name: "Maudie", at: () => ({ x: 0, y: 0 }) });
    expect(r.asking).toBeTruthy();
    conn.message(JSON.stringify({ t: "answer", yes: true }));
    expect(r.done).toBe(true);
  });
});

describe("The walks between runs 4 and 5", () => {
  const make = (n: number) => {
    let s = 7;
    const room = new PondRoom(manualClock(), () => (s = (s * 48271) % 2147483647), n);
    room.chain = true;
    const conn = room.connect(() => {});
    conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
    const r = room as unknown as { asking: { choices: string[] } | null; done: boolean; goal: () => string | null; answer: (t: { name: string; at: () => { x: number; y: number } }) => void };
    const tap = (name: string) => r.answer({ name, at: () => ({ x: 0, y: 0 }) });
    // Everything said, kept (the room sends its lines on and clears them).
    const said: string[] = [];
    const rs = room as unknown as { say: (who: string, text: string, still?: string) => void };
    const say = rs.say.bind(room);
    const lines: { text: string; still?: { id: string } }[] = [];
    const rl = room as unknown as { lines: typeof lines };
    rs.say = (who: string, text: string, still?: string) => (said.push(text), say(who, text, still), lines.push(rl.lines.at(-1)!));
    return { room, conn, r, tap, said, lines };
  };
  it("walk 7: Lumi is not the way on until Kes has had her say; then home", () => {
    const { room, conn, r, tap, said } = make(7);
    expect(r.goal()).toBe("Talk to Kes");
    tap("Lumi");
    expect(r.asking).toBeNull();
    tap("Kes");
    for (let i = 0; i < 30; i++) room.onTick();
    expect(said).toContain("Tomorrow, then. The Fell. Bring the referee.");
    expect(r.asking).toBeNull();
    expect(r.goal()).toBe("Go home");
    tap("Lumi");
    for (let i = 0; i < 12 && !r.asking; i++) room.onTick();
    expect(said.at(-1)).toBe("I heard her.");
    expect(r.asking).toBeTruthy();
    conn.message(JSON.stringify({ t: "answer", yes: true }));
    expect(r.done).toBe(true);
  });
  it("walk 9, the morning before run 8: it opens in his kitchen, Lumi's first line has her picture, and Moth asks after his talk", () => {
    const { room, conn, r, tap, said, lines } = make(9);
    expect((room as unknown as { kitchen: number }).kitchen).toBe(1);
    expect(r.goal()).toBe("Talk to Moth at the sky skiff");
    tap("Lumi");
    for (let i = 0; i < 30; i++) room.onTick();
    expect(lines.find((l) => l.text === "You packed one bag.")?.still?.id).toBe("w9-lumi-door");
    expect(said).toContain("I'll count how long you take.");
    tap("Moth");
    for (let i = 0; i < 40 && !r.asking; i++) room.onTick();
    expect(said.at(-1)).toBe("You tell her.");
    expect(r.asking).toBeTruthy();
    conn.message(JSON.stringify({ t: "answer", yes: true }));
    expect(r.done).toBe(true);
  });
  it("walk 5, after run 8, starts by the sky skiff at the landing", () => {
    expect(WALKS.find((w) => w.n === 5)!.start).toBe("landing");
  });
  it("walk 8: Kes asks before the crossing", () => {
    const { conn, r, tap } = make(8);
    tap("Kes");
    expect(r.asking).toBeTruthy();
    conn.message(JSON.stringify({ t: "answer", yes: true }));
    expect(r.done).toBe(true);
  });
});
