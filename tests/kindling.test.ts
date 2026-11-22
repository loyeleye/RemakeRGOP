import { describe, expect, it } from "vitest";
import { botCommand, BOT_MEDIUM } from "../src/engine/bot.js";
import { samePt } from "../src/engine/board.js";
import { Game } from "../src/engine/game.js";
import { KINDLING, banksFrom, compass, ringSpot } from "../src/engine/kindling.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { StoryRoom } from "../src/server/story.js";

const manualClock = () => ({ every: () => () => {} });

/** Plays the whole run with a simple Rook: walk to the ring, pull; hold the home square; then play like a Medium bot. */
function playRun(seed: number) {
  const msgs: ServerMsg[] = [];
  let s = seed;
  const room = new StoryRoom(manualClock(), () => (s = (s * 48271) % 2147483647));
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const crewBanks: number[] = [];
  const holderAtBank = new Map<number, number | null>();
  for (let i = 0; i < 2000 && room.state.phase !== "results"; i++) {
    const { game, phase, movement, ring } = room.state;
    if (phase === "playing") {
      const rook = game.players.find((p) => p.id === 1)!;
      let cmd = null as ReturnType<typeof botCommand>;
      if (movement === 0) {
        const w = game.wisps[0]!;
        if (ring && !samePt(rook.pos, ring)) cmd = rook.action.kind === "walk" ? null : { action: { kind: "walk", to: ring } };
        else if (rook.action.kind !== "staff") cmd = { action: { kind: "staff", wisp: w.id } };
      } else if (movement === 1) {
        const w = game.wisps.find((q) => banksFrom(game.board, rook.pos, q.target ?? q.pos));
        if (ring && !samePt(rook.pos, ring)) cmd = rook.action.kind === "walk" ? null : { action: { kind: "walk", to: ring } };
        else if (w && !(rook.action.kind === "staff" && rook.action.wisp === w.id)) cmd = { action: { kind: "staff", wisp: w.id } };
      } else cmd = botCommand(game, 1, BOT_MEDIUM, () => 0.5);
      if (cmd) conn.message(JSON.stringify({ t: "act", ...cmd }));
    }
    const before = new Map(room.state.game.wisps.map((w) => [w.id, w.holder]));
    room.onTick();
    if (room.state.phase === "playing" || room.state.phase === "countdown") {
      const g = room.state.game;
      for (const b of g.banks) {
        holderAtBank.set(b.wisp, before.get(b.wisp) ?? null);
        if (before.get(b.wisp) !== 1) crewBanks.push(g.tick);
      }
    }
  }
  return { room, msgs, crewBanks };
}

describe("Game options for story runs", () => {
  it("takes a wisp count per guild and its own round length", () => {
    const shrine = shrineById("fairy-ring");
    const g = new Game(shrine, [{ id: 1, guild: 0, name: "a" }], 7, [2, 0], 30);
    expect(g.wisps.filter((w) => w.guild === 0)).toHaveLength(2);
    expect(g.wisps.filter((w) => w.guild === 1)).toHaveLength(0);
    for (let i = 0; i < 40; i++) g.step();
    expect(g.tick).toBe(30);
    expect(g.finished).toBe(true);
  });
});

describe("Grand Kindling", () => {
  it("rings a tile that banks the wisp in one pull", () => {
    const shrine = shrineById(KINDLING.shrine);
    for (const w of shrine.spawnField.slice(0, 30)) {
      const r = ringSpot(shrine.board, w, shrine.starts[0]![0]!);
      expect(r).not.toBeNull();
      expect(banksFrom(shrine.board, r!, w)).toBe(true);
    }
  });

  it("names directions from the brazier, north up the board", () => {
    const b = shrineById(KINDLING.shrine).board;
    expect(compass(b, { x: b.center.x, y: b.center.y - 5 })).toBe("north");
    expect(compass(b, { x: b.center.x + 5, y: b.center.y + 5 })).toBe("south-east");
  });

  it("plays all three movements to an ending that can't be failed", () => {
    for (const seed of [11, 12, 13]) {
      const { room, msgs, crewBanks } = playRun(seed);
      const st = room.state;
      expect(st.phase).toBe("results");
      expect(st.end).toBeDefined();
      expect(st.end!.lines.at(-2)!.text).toMatch(/I counted/);
      // The crew feed Rook: they don't bank for themselves.
      expect(crewBanks).toEqual([]);
      const said = msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
      expect(said.some((l) => l.who === "Lumi" && /^Dad\./.test(l.text))).toBe(true);
      expect(said.some((l) => l.who === "Hesta" && /Now/.test(l.text))).toBe(true);
    }
  });
});
