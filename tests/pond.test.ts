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
  return { room, msgs, said, tap };
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

  it("answers a tap from afar once Rook has walked up, and tapping Hesta starts Granny's game", () => {
    const { room, said, tap } = open();
    for (let i = 0; i < 80; i++) room.onTick();
    tap(room.spots.lantern.x, room.spots.lantern.y);
    for (let i = 0; i < 40 && !said().some((l) => l.text.startsWith("Lumi's lantern")); i++) room.onTick();
    expect(said().some((l) => l.who === "Rook" && l.text.startsWith("Lumi's lantern"))).toBe(true);
    const h = room.state.game.players.find((p) => p.name === "Hesta")!.pos;
    tap(h.x, h.y);
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
