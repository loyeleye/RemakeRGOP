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
function playRun(seed: number, lumi: "answer" | "ignore" | "bot" = "bot") {
  const msgs: ServerMsg[] = [];
  let s = seed;
  const room = new StoryRoom(manualClock(), () => (s = (s * 48271) % 2147483647));
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  /** Who held each banked wisp: 1 is Rook, 2 is Wick (feeds Rook), 3 is Moth (owns the far side). */
  const bankers: (number | null)[] = [];
  /** Each wisp Lumi has called, in order. */
  const called: number[] = [];
  /** Who held each wisp banked in the relay. */
  const relayBankers: (number | null)[] = [];
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
        // Keep pulling while it's coming home; otherwise take a resting wisp he can bank from here.
        const cur = rook.action.kind === "staff" ? game.wisps[rook.action.wisp] : undefined;
        const curOk = cur && banksFrom(game.board, rook.pos, cur.pos) && !(samePt(cur.pos, cur.prev) && rook.beam === cur.id && !cur.target);
        const w = curOk ? cur : game.wisps.find((q) => q !== cur && !q.target && banksFrom(game.board, rook.pos, q.pos));
        if (ring && !samePt(rook.pos, ring)) cmd = rook.action.kind === "walk" ? null : { action: { kind: "walk", to: ring } };
        else if (w && !(rook.action.kind === "staff" && rook.action.wisp === w.id)) cmd = { action: { kind: "staff", wisp: w.id } };
      } else {
        cmd = botCommand(game, 1, BOT_MEDIUM, () => 0.5);
        const call = room.state.call;
        // A Rook who answers takes her call at once; one who ignores her never touches it.
        if (call !== null && lumi === "answer" && !(rook.action.kind === "staff" && rook.action.wisp === call)) cmd = { action: { kind: "staff", wisp: call } };
        if (call !== null && lumi === "ignore") {
          if (cmd?.action?.kind === "staff" && cmd.action.wisp === call) cmd = { action: { kind: "idle" } };
          if (rook.action.kind === "staff" && rook.action.wisp === call) cmd = { action: { kind: "idle" } };
        }
      }
      if (cmd) conn.message(JSON.stringify({ t: "act", ...cmd }));
    }
    const before = new Map(room.state.game.wisps.map((w) => [w.id, w.holder]));
    room.onTick();
    const c = room.state.call;
    if (c !== null && c !== called.at(-1)) called.push(c);
    if (room.state.phase === "playing" || room.state.phase === "countdown") {
      const g = room.state.game;
      for (const b of g.banks) {
        bankers.push(before.get(b.wisp) ?? null);
        if (room.state.movement === 1) relayBankers.push(before.get(b.wisp) ?? null);
      }
    }
  }
  return { room, msgs, bankers, called, relayBankers };
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
    const lumi: string[] = [];
    for (const seed of [11, 12, 13]) {
      const { room, msgs, bankers, called, relayBankers } = playRun(seed);
      const st = room.state;
      expect(st.phase).toBe("results");
      expect(st.end).toBeDefined();
      expect(st.end!.lines.at(-2)!.text).toMatch(/I counted/);
      // The crew feed Rook: they don't bank for themselves.
      // Wick feeds Rook and never banks for himself; Moth banks the far side.
      expect(bankers.filter((b) => b === 2)).toEqual([]);
      expect(bankers.filter((b) => b === 3).length).toBeGreaterThan(0);
      // Rook banks the most: the crew bring them to him, and Moth only banks what he can't reach.
      const rookRelay = relayBankers.filter((b) => b === 1).length;
      expect(rookRelay).toBeGreaterThan(relayBankers.filter((b) => b === 3).length);
      expect(rookRelay).toBeGreaterThanOrEqual(10);
      if (process.env.STATS) console.log(seed, "rook", bankers.filter((b) => b === 1).length, "moth", bankers.filter((b) => b === 3).length, "other", bankers.filter((b) => b !== 1 && b !== 3).length, "total", room.state.end!.banked);
      const said = msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
      expect(said.some((l) => l.who === "Lumi" && /^Dad\./.test(l.text))).toBe(true);
      lumi.push(...said.filter((l) => l.who === "Lumi").map((l) => l.text));
      // Lumi's calls move on: an ignored call never stays on the same wisp.
      expect(new Set(called).size).toBeGreaterThan(1);
      expect(said.some((l) => l.who === "Hesta" && /Now/.test(l.text))).toBe(true);
    }
    // When he banks a different wisp she sometimes concedes, and when he leaves one she calls another.
    expect(lumi.some((t) => /^\.\.\.Fine|^Fine\./.test(t) || /Forget it|Never mind/.test(t))).toBe(true);
    expect(lumi.some((t) => /not saying it again/.test(t))).toBe(false);
  });

  it("keeps Lumi's calls few, and her complaints to three or four a round", () => {
    for (const style of ["answer", "ignore", "bot"] as const) {
      for (const seed of [11, 12, 13, 14, 15]) {
        const { room, msgs } = playRun(seed, style);
        const said = msgs.flatMap((m) => (m.t === "say" ? m.lines : [])).filter((l) => l.who === "Lumi");
        const nudges = said.filter((l) => /\*/.test(l.text)).length;
        if (process.env.STATS) console.log(style, seed, "calls", room.state.calls, "misses", room.state.strikes, "nudges", nudges, "lumi lines", said.length);
        expect(room.state.calls).toBeLessThanOrEqual(9);
        expect(room.state.strikes).toBeLessThanOrEqual(4);
      }
    }
  });
});
