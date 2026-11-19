import { describe, expect, it } from "vitest";
import { Game, ROUND_TICKS, COUNTDOWN_TICKS } from "../src/engine/game.js";
import { SHRINES, shrineFor } from "../src/engine/maps.js";
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

  it("seats up to four guilds and plays them on the four-way island", () => {
    const clock = manualClock();
    const room = new Room("ABCD", clock, () => 5);
    const a = client(room);
    a.send({ t: "hello", name: "Ada" });
    a.send({ t: "teams", teams: 4 });
    for (const g of [1, 2, 3]) a.send({ t: "bot", guild: g, hard: true });
    a.send({ t: "bot", guild: 4 }); // no such guild: ignored
    let view = a.last("room")!.room;
    expect(view.teams).toBe(4);
    expect(view.players.map((p) => p.guild)).toEqual([0, 1, 2, 3]);
    const b = client(room);
    b.send({ t: "hello", name: "Bo" });
    expect(a.last("room")!.room.players.at(-1)!.guild).toBe(0); // all tied: first guild
    a.send({ t: "start" });
    for (let i = 0; i < COUNTDOWN_TICKS + ROUND_TICKS; i++) clock.fire();
    view = a.last("room")!.room;
    expect(view.phase).toBe("results");
    expect(view.lastScores).toHaveLength(4);
    expect(view.lastScores!.slice(1).every((n) => n > 0)).toBe(true);
  });

  it("moves players off guilds that go away when the host picks fewer", () => {
    const room = new Room("ABCD", manualClock());
    const a = client(room);
    a.send({ t: "hello", name: "Ada" });
    a.send({ t: "teams", teams: 3 });
    a.send({ t: "guild", guild: 2 });
    expect(a.last("room")!.room.players[0]!.guild).toBe(2);
    a.send({ t: "teams", teams: 2 });
    const view = a.last("room")!.room;
    expect(view.teams).toBe(2);
    expect(view.players[0]!.guild).toBeLessThan(2);
    a.send({ t: "teams", teams: 7 }); // ignored
    expect(a.last("room")!.room.teams).toBe(2);
  });
});

describe("the bot banks wisps on every shrine", () => {
  const solo = { pushy: 0, sloppiness: 0 };
  for (const shrine of SHRINES) {
    it(`${shrine.name}: banks alone round the archways, but not too fast`, () => {
      const g = new Game(shrine, [{ id: 1, guild: 0, name: "A" }], 3);
      for (let t = 0; t < ROUND_TICKS; t++) {
        const cmd = botCommand(g, 1, solo);
        if (cmd) g.command(1, cmd);
        g.step();
      }
      expect(g.scores[0]).toBeGreaterThanOrEqual(3);
      expect(g.scores[0]).toBeLessThanOrEqual(11);
    });
    it(`${shrine.name}: every guild scores in a four-guild round`, () => {
      const four = shrineFor(shrine.id, 4);
      const roster = [0, 1, 2, 3].map((g) => ({ id: g + 1, guild: g as 0 | 1 | 2 | 3, name: `B${g}` }));
      const g = new Game(four, roster, 3);
      for (let t = 0; t < ROUND_TICKS; t++) {
        for (const r of roster) {
          const cmd = botCommand(g, r.id, solo);
          if (cmd) g.command(r.id, cmd);
        }
        g.step();
      }
      for (const n of g.scores) expect(n).toBeGreaterThanOrEqual(2);
    });
  }
});
