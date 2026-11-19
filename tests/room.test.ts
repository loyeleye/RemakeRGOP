import { describe, expect, it } from "vitest";
import { Game, ROUND_TICKS, COUNTDOWN_TICKS } from "../src/engine/game.js";
import { SHRINES } from "../src/engine/maps.js";
import { botCommand } from "../src/engine/bot.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { Room, type Clock } from "../src/server/room.js";

const manualClock = (): Clock & { fire(): void } => {
  let fn: (() => void) | null = null;
  return {
    every(_ms, f) {
      fn = f;
      return () => (fn = null);
    },
    fire() {
      fn?.();
    },
  };
};

function client(room: Room) {
  const inbox: ServerMsg[] = [];
  const conn = room.connect((m) => inbox.push(m));
  const send = (m: object) => conn.message(JSON.stringify(m));
  const last = <T extends ServerMsg["t"]>(t: T) => inbox.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  return { inbox, send, last, conn };
}

describe("room", () => {
  it("runs lobby -> countdown -> round -> results", () => {
    const clock = manualClock();
    const room = new Room("ABCD", clock, () => 5);
    const a = client(room);
    const b = client(room);
    a.send({ t: "hello", name: "Ada" });
    b.send({ t: "hello", name: "Bo" });
    expect(a.last("room")!.room.players.map((p) => p.guild)).toEqual([0, 1]);
    b.send({ t: "start" }); // not host: ignored
    expect(a.last("room")!.room.phase).toBe("lobby");
    a.send({ t: "shrine", shrine: "ember-quarry" });
    a.send({ t: "start" });
    expect(b.last("room")!.room.phase).toBe("countdown");
    for (let i = 0; i < COUNTDOWN_TICKS; i++) clock.fire();
    expect(b.last("room")!.room.phase).toBe("playing");
    a.send({ t: "act", action: { kind: "staff", wisp: 0 } });
    a.send({ t: "act", action: { kind: "staff", wisp: 999 } }); // invalid: dropped
    for (let i = 0; i < ROUND_TICKS; i++) clock.fire();
    expect(a.last("tick")!.snap.tick).toBe(ROUND_TICKS);
    expect(a.last("room")!.room.phase).toBe("results");
    a.send({ t: "lobby" });
    expect(b.last("room")!.room.phase).toBe("lobby");
  });

  it("lets a player reconnect with their token mid-round", () => {
    const clock = manualClock();
    const room = new Room("ABCD", clock, () => 5);
    const a = client(room);
    a.send({ t: "hello", name: "Ada" });
    const token = a.last("welcome")!.token;
    a.send({ t: "start" });
    a.conn.close();
    const stranger = client(room);
    stranger.send({ t: "hello", name: "Late" });
    expect(stranger.last("error")).toBeDefined();
    const back = client(room);
    back.send({ t: "hello", name: "Ada", token });
    expect(back.last("welcome")!.you).toBe(a.last("welcome")!.you);
    expect(back.last("tick")).toBeDefined();
  });

  it("caps guilds at 4", () => {
    const room = new Room("ABCD", manualClock());
    const cs = Array.from({ length: 9 }, () => client(room));
    cs.forEach((c, i) => c.send({ t: "hello", name: `P${i}` }));
    const players = cs[0]!.last("room")!.room.players;
    expect(players).toHaveLength(8);
    expect(cs[8]!.last("error")).toBeDefined();
  });
});

describe("the bot banks wisps on every shrine", () => {
  for (const shrine of SHRINES) {
    it(shrine.name, () => {
      const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 3);
      for (let t = 0; t < ROUND_TICKS; t++) {
        const cmd = botCommand(g, 1, { pushy: 0, sloppiness: 0 });
        if (cmd) g.command(1, cmd);
        g.step();
      }
      expect(g.scores[0]).toBeGreaterThanOrEqual(4);
    });
  }
});
