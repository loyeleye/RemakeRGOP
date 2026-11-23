import { describe, expect, it } from "vitest";
import { BOT_MEDIUM, botCommand } from "../src/engine/bot.js";
import { GRANNY } from "../src/engine/granny.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { GrannyRoom } from "../src/server/granny.js";

const manualClock = () => ({ every: () => () => {} });

/** Play a whole game: the player plays like a Medium bot. */
function playOut(seed: number) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new GrannyRoom(manualClock(), () => (s = (s * 48271) % 2147483647));
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  let r = seed;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  let ticks = 0;
  const lead: number[] = [];
  while (room.state.phase !== "results" && ticks < GRANNY.ticks + 50) {
    if (room.state.phase === "playing") {
      const cmd = botCommand(room.state.game, 1, BOT_MEDIUM, rand);
      if (cmd?.action) conn.message(JSON.stringify({ t: "act", action: cmd.action, toggleMode: !!cmd.toggleMode }));
      const g = room.state.game;
      lead.push(g.scores[0]! - g.scores[1]!);
    }
    room.onTick();
    ticks++;
  }
  const said = msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  return { room, ticks, said, lead };
}

describe("Run 3: Granny's game", () => {
  it("always ends with Hesta winning ten to nine, after the earth hold", () => {
    for (const seed of [3, 11, 29, 101]) {
      const { room, ticks, said, lead } = playOut(seed);
      const g = room.state.game;
      console.log(`seed ${seed}: ${g.scores[0]}-${g.scores[1]} in ${ticks} ticks, pushes ${room.state.pushes}, biggest leads ${Math.max(...lead)} / ${Math.min(...lead)}`);
      expect(room.state.phase).toBe("results");
      expect(g.scores[1]).toBe(GRANNY.target);
      expect(g.scores[0]).toBe(GRANNY.target - 1);
      expect(room.state.holdWisp).not.toBeNull();
      expect(said.some((l) => l.text === "Dad hasn't got one.")).toBe(true);
      expect(said.some((l) => /element/i.test(l.text))).toBe(false);
    }
  });

  it("Hesta walks and never stands frozen for long", () => {
    const { room } = playOut(5);
    const hesta = room.state.game.players.find((p) => p.name === "Hesta")!;
    expect(hesta.run).toBe(false);
  });
});
