import { describe, expect, it } from "vitest";
import { BOT_HARD, BOT_MEDIUM, botCommand } from "../src/engine/bot.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { RUN2 } from "../src/engine/run2.js";
import { Run2Room } from "../src/server/run2.js";

function play(seed: number, rook: "medium" | "hard" | "idle", max = 1500) {
  const room = new Run2Room({ every: () => () => {} }, () => seed);
  const lines: StoryLine[] = [];
  room.connect((m: ServerMsg) => m.t === "say" && lines.push(...m.lines)).message(JSON.stringify({ t: "hello" }));
  let s = seed * 7919 + 13;
  const rand = () => (s = (s * 48271) % 2147483647) / 2147483647;
  let t = 0;
  while (!room.state.end && t < max) {
    const g = room.state.game;
    if (rook !== "idle") {
      const cmd = botCommand(g, 1, rook === "hard" ? BOT_HARD : BOT_MEDIUM, rand);
      if (cmd) g.command(1, cmd);
    }
    room.onTick();
    t++;
  }
  return { room, lines, t };
}

describe("Part 2, run 2", () => {
  it("fills on the sixteenth bank, Rook banking most of it; past warm the crew's lights fizz", () => {
    const shares: number[] = [], secs: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { room, t } = play(seed, "medium");
      expect(room.state.filled).toBe(RUN2.banks);
      expect(room.state.end).not.toBeNull();
      shares.push(room.state.rookBanks / RUN2.banks);
      secs.push((t * 600) / 1000);
    }
    const av = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    // The gameplay thread's test players: about 93 s and 84% for an average player.
    expect(av(shares)).toBeGreaterThan(0.6);
    expect(av(secs)).toBeGreaterThan(50);
    expect(av(secs)).toBeLessThan(160);
  });

  it("a Rook who does nothing: the crew reach warm and stop there", () => {
    const { room } = play(3, "idle", 600);
    expect(room.state.filled).toBe(RUN2.warm);
    expect(room.state.end).toBeNull();
  });

  it("Outrider's lines on the 1st, 8th and 15th banks, the lamp hand's on the 3rd; every line carries the draft mark", () => {
    const { lines } = play(2, "hard");
    for (const o of RUN2.outrider) expect(lines.some((l) => l.text === o.line.text && l.who === "Outrider")).toBe(true);
    expect(lines.some((l) => l.text === RUN2.lampHand.line.text)).toBe(true);
    expect(lines.every((l) => l.draft)).toBe(true);
    // Barks never twice in a row.
    const barks = lines.filter((l) => RUN2.barks.includes(l.text)).map((l) => l.text);
    for (let i = 1; i < barks.length; i++) expect(barks[i]).not.toBe(barks[i - 1]);
  });

  it("how it ends: he walks for the cart, the lines run on his second step, the bars light, two take his arms, done", () => {
    const { room } = play(4, "hard");
    const g = room.state.game, c = g.board.center;
    // The player's taps do nothing now.
    room.connect(() => {}).message(JSON.stringify({ t: "act", action: { kind: "walk", to: { x: c.x + 8, y: c.y - 8 } } }));
    for (let i = 0; i < 80 && !room.state.end?.done; i++) room.onTick();
    const e = room.state.end!;
    expect(e.lines).toBeDefined();
    expect(e.lit).toBeGreaterThan(e.lines!);
    expect(e.held).toBeDefined();
    expect(e.done).toBe(true);
    const rook = g.players.find((p) => p.id === 1)!.pos;
    expect({ x: rook.x - c.x, y: rook.y - c.y }).toEqual({ x: RUN2.end.held[0], y: RUN2.end.held[1] });
    expect(room.storyView().run2?.end?.done).toBe(true);
  });
});
