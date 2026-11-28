import { describe, expect, it } from "vitest";
import { pt, cheb } from "../src/engine/board.js";
import { Game } from "../src/engine/game.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { RACE } from "../src/engine/race.js";
import { RaceRoom, type Stand } from "../src/server/race.js";

const KES = 2;

/** Kes alone on the race ground with three wisps of hers in a row east of the fire, and her storm light. */
function storm() {
  const g = new Game(shrineById(RACE.shrine), [{ id: 1, guild: 0, name: "Rook" }, { id: KES, guild: 1, name: "Kes" }], 7, [1, 3], 400);
  g.stormLight = KES;
  g.noShove = true;
  const c = g.board.center, kes = g.players[1]!, mine = g.wisps.filter((w) => w.guild === 1);
  mine.forEach((w, i) => (w.pos = w.prev = pt(c.x + 12 + i * 2, c.y)));
  g.wisps[0]!.pos = g.wisps[0]!.prev = pt(c.x - 12, c.y);
  kes.pos = kes.prev = pt(c.x + 13, c.y + 1);
  return { g, c, kes, mine };
}
const touch = (g: Game, id: number, wisp: number) => (g.command(id, { action: { kind: "staff", wisp } }), g.step());

describe("the storm law", () => {
  it("strings her own wisps when she touches them from close by, up to three, in order", () => {
    const { g, mine, kes, c } = storm();
    touch(g, KES, mine[0]!.id);
    expect(g.string).toEqual([mine[0]!.id]);
    expect(g.stringEvents).toEqual([{ kind: "join", wisp: mine[0]!.id }]);
    touch(g, KES, mine[1]!.id);
    // The third is four tiles off: a touch from there pulls it but doesn't string it.
    touch(g, KES, mine[2]!.id);
    expect(g.string).toEqual([mine[0]!.id, mine[1]!.id]);
    kes.pos = pt(c.x + 15, c.y + 1);
    touch(g, KES, mine[2]!.id);
    expect(g.string).toEqual([mine[0]!.id, mine[1]!.id, mine[2]!.id]);
    expect(g.snapshot().string).toEqual(g.string);
  });

  it("only a storm light strings", () => {
    const { g, mine } = storm();
    g.stormLight = null;
    touch(g, KES, mine[0]!.id);
    expect(g.string).toEqual([]);
  });

  it("moves the whole string at the head's pace while she pulls the head; a banked head leaves it", () => {
    const { g, mine, kes, c } = storm();
    for (const w of mine) (kes.pos = pt(w.pos.x, w.pos.y + 1)), touch(g, KES, w.id);
    expect(g.string.length).toBe(3);
    // From the far side of the fire's rim, one staff on the head.
    kes.pos = kes.prev = pt(c.x + 3, c.y);
    for (let t = 0; t < 4; t++) touch(g, KES, g.string[0]!);
    const startX = mine.map((w) => w.pos.x);
    for (let t = 0; t < 4; t++) touch(g, KES, g.string[0]!);
    // Once it's under way, all three come a tile a tick.
    expect(mine.map((w, i) => startX[i]! - w.pos.x)).toEqual([4, 4, 4]);
    expect(g.stringLive).toBe(true);
    // The head reaches the rim and is banked: it leaves the string and the next one is the head.
    const [head, second, third] = mine;
    head!.pos = pt(c.x + 2, c.y);
    g.command(KES, { action: { kind: "idle" } });
    for (let t = 0; t < 3; t++) g.step();
    expect(g.scores[1]).toBe(1);
    expect(g.string).toEqual([second!.id, third!.id]);
  });

  it("stands still when she isn't pulling the head", () => {
    const { g, mine, kes } = storm();
    for (const w of mine) (kes.pos = pt(w.pos.x, w.pos.y + 1)), touch(g, KES, w.id);
    g.command(KES, { action: { kind: "idle" } });
    g.step();
    const at = mine.map((w) => w.pos.x);
    for (let t = 0; t < 4; t++) g.step();
    expect(mine.map((w) => w.pos.x)).toEqual(at);
    expect(g.stringLive).toBe(false);
  });

  it("breaks a link longer than six tiles, dropping that wisp and all behind it", () => {
    const { g, mine, kes } = storm();
    for (const w of mine) (kes.pos = pt(w.pos.x, w.pos.y + 1)), touch(g, KES, w.id);
    const [, second, third] = mine;
    second!.pos = pt(second!.pos.x + 8, second!.pos.y);
    g.command(KES, { action: { kind: "idle" } });
    g.step();
    expect(g.string).toEqual([mine[0]!.id]);
    expect(g.stringEvents.map((e) => e.wisp)).toEqual([second!.id, third!.id]);
    expect(cheb(second!.pos, mine[0]!.pos)).toBeGreaterThan(6);
  });

  it("no shoving: nobody's staff does anything to the other side's wisps", () => {
    const { g, mine } = storm();
    const at = { ...mine[0]!.pos };
    g.command(1, { action: { kind: "staff", wisp: mine[0]!.id }, toggleMode: true });
    for (let t = 0; t < 12; t++) g.step();
    expect(mine[0]!.pos).toEqual(at);
    expect(g.players[0]!.action.kind).toBe("idle");
  });
});

/** Play the whole race with a stand-in for the player. */
function playOut(seed: number, stand: Stand) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new RaceRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const strung: boolean[] = [];
  let ticks = 0;
  while (room.state.phase !== "results" && ticks < 4000) {
    room.onTick();
    ticks++;
    if (room.state.game.string.length) strung[room.state.heat] = true;
  }
  const said = msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  return { room, conn, ticks, said, strung, msgs };
}
const texts = (said: { text: string }[]) => said.map((l) => l.text);

describe("Run 5: the race with Kes", () => {
  it("plays three heats to an ending, whoever wins, and only the last heat decides", () => {
    for (const [seed, stand] of [[5, "hold"], [17, "juggle"], [40, "hold"], [77, "juggle"]] as const) {
      const { room, ticks, said, strung } = playOut(seed, stand);
      const st = room.state;
      console.log(`seed ${seed} (${stand}): heats ${st.heatWon.map((w) => (w ? "Kes" : "Rook")).join(", ")} in ${ticks} ticks`);
      expect(st.phase).toBe("results");
      expect(st.heatWon.length).toBe(3);
      expect(st.wins[0] + st.wins[1]).toBe(3);
      // Heat 1 is an even race: she doesn't string until heat 2.
      expect(strung[0]).toBeUndefined();
      expect(strung[1] && strung[2]).toBe(true);
      const t = texts(said);
      expect(t).toContain("She was going to be my pupil. Race you for her.");
      expect(t.filter((x) => x === "Go!").length).toBe(3);
      expect(t).toContain("I pulled.");
      expect(t).toContain("You hold on too long, Rook. You always have.");
      expect(t).toContain("Rosie would have tripped me by now.");
      const rookWon = st.heatWon[2] === 0;
      expect(st.end!.lines[0]!.text).toBe(rookWon ? "You worked for that." : "Same time next week? I'll go slower.");
      expect(st.end!.lines.at(-1)!.text).toBe("Good. Pick me, Captain.");
      expect(st.end!.summary).toContain(rookWon ? "Rook takes it" : "Kes takes it");
    }
  });

  it("a player who holds one wisp at a time loses to the string; one who juggles can win", () => {
    let hold = 0, juggle = 0;
    for (let i = 0; i < 6; i++) {
      if (playOut(100 + i * 13, "hold").room.state.heatWon[2] === 0) hold++;
      const j = playOut(300 + i * 13, "juggle");
      if (j.room.state.heatWon[2] === 0) juggle++;
      if (i === 0) expect(texts(j.said)).toContain("There he is.");
    }
    expect(hold).toBe(0);
    expect(juggle).toBeGreaterThanOrEqual(3);
  });

  it("the referee stops a shove at Kes's wisps, once a heat", () => {
    let s = 9;
    const msgs: ServerMsg[] = [];
    const room = new RaceRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
    const conn = room.connect((m) => msgs.push(m));
    conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
    while (room.state.phase !== "playing") room.onTick();
    const hers = room.state.game.wisps.find((w) => w.guild === 1)!;
    for (let i = 0; i < 3; i++) {
      conn.message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: hers.id }, toggleMode: i === 0 }));
      for (let t = 0; t < 6; t++) room.onTick();
    }
    const said = texts(msgs.flatMap((m) => (m.t === "say" ? m.lines : [])));
    expect(said.filter((x) => x === "No shoving. I said.").length).toBe(1);
    expect(room.state.game.players[0]!.action.kind).not.toBe("staff");
  });

  it("can be raced again from the ending", () => {
    const { room, conn } = playOut(21, "hold");
    conn.message(JSON.stringify({ t: "lobby" }));
    expect(room.state.phase).toBe("countdown");
    expect(room.state.heat).toBe(0);
    expect(room.state.wins).toEqual([0, 0]);
  });
});
