import { describe, expect, it } from "vitest";
import { faceOf } from "../src/engine/moods.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { REMATCH, cheatOf, type Cheat } from "../src/engine/rematch.js";
import { RematchRoom, type Stand } from "../src/server/rematch.js";

function open(seed: number, stand: Stand | null, cheat: Cheat | null = null, setup?: (room: RematchRoom) => void) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const room = new RematchRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
  room.stand = stand;
  room.cheatPick = cheat;
  setup?.(room);
  const conn = room.connect((m) => msgs.push(m));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const lines = () => msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  const play = () => {
    for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) room.onTick();
    return room.state;
  };
  return { room, conn, msgs, lines, play };
}

describe("Optional run 1: Granny's rematch", () => {
  it("opens on its goal, said and held as a caption, and shows the three counts for the whole run", () => {
    const { room, lines } = open(7919, "ignore");
    while (room.state.phase !== "playing") room.onTick();
    room.onTick();
    const o = room.storyView().opt!;
    expect(o.id).toBe("o1");
    expect(lines()[0]).toMatchObject({ who: "Hesta", text: "First to five, and I start on one. Old lady's rules." });
    expect(o.caption![0]).toEqual({ who: "Hesta", text: "First to five, and I start on one. Old lady's rules." });
    expect(o.caption![1]!.text).toBe(`Wall says ${REMATCH.wallStart}. Beat ${REMATCH.wallStart}!`);
    expect(o.strip.map((c) => [c.label, c.n, c.of, c.tone])).toEqual([["The children", 0, 5, "us"], ["Granny", 1, 5, "her"], ["The wall", REMATCH.wallStart, 4, "chalk"]]);
    // The goal's caption is up for six seconds, and the strip is there on every tick after.
    for (let n = 0; n < REMATCH.goalTicks + 2; n++) room.onTick();
    expect(room.storyView().opt!.caption?.some((c) => c.who === "Hesta" && c.text.startsWith("First to five"))).toBeFalsy();
    expect(room.storyView().opt!.strip).toHaveLength(3);
  });

  it("she always wins by one or two, and the children never reach five", () => {
    for (const cheat of REMATCH.cheats)
      for (const stand of ["ignore", "smart", "idle"] as Stand[])
        for (const seed of [7919, 15838]) {
          const st = open(seed, stand, cheat).play();
          expect(st.phase).toBe("results");
          const [kids, hers] = st.game.scores as [number, number];
          expect(hers).toBe(REMATCH.target);
          expect(kids).toBeLessThan(REMATCH.target);
          expect(st.game.tick).toBeLessThan(REMATCH.ticks);
        }
  }, 30000);

  it("each cheat is a choice: read it and the children end on four, walk into it and they end lower", () => {
    for (const cheat of REMATCH.cheats) {
      let read = 0, walked = 0, n = 0;
      for (let k = 1; k <= 6; k++) {
        const smart = open(k * 7919, "smart", cheat).play(), plain = open(k * 7919, "ignore", cheat).play();
        read += smart.game.scores[0]!;
        walked += plain.game.scores[0]!;
        n++;
        if (smart.outcome === "dodged") expect(smart.game.scores[0]).toBe(REMATCH.target - 1);
      }
      // Ignoring the choice costs something, on every cheat.
      expect(read / n).toBeGreaterThan(walked / n + 0.5);
    }
  }, 30000);

  it("her cheats take turns from one rematch to the next, and each has its own face and line", () => {
    expect([0, 1, 2, 3].map(cheatOf)).toEqual(["hold", "goal", "nap", "hold"]);
    const hold = open(7919, "ignore", "hold");
    hold.play();
    expect(hold.lines().some((l) => l.text === "Rock's allowed. I checked." && l.mood === "grinning")).toBe(true);
    const goal = open(7919, "ignore", "goal");
    goal.play();
    expect(goal.lines().some((l) => l.text === "My pond. It was always over there.")).toBe(true);
    const nap = open(7919, "idle", "nap");
    nap.play();
    expect(nap.lines().some((l) => l.text === "Resting my eyes." && l.mood === "dozing")).toBe(true);
    expect(faceOf("Hesta", "Resting my eyes.", "dozing")).toBe("hesta-dozing");
    expect(faceOf("Hesta", "Rock's allowed. I checked.", "grinning")).toBe("hesta-grinning");
    // Without a mood named, her run 3 faces are as they were.
    expect(faceOf("Hesta", "Resting my eyes.")).toBe("hesta-neutral");
  });

  it("the marks on the board are told: her eye on a wisp, the moved goal with its warning, and her nap", () => {
    const seen = { eye: false, tell: false, live: false, nap: false, x2: false };
    for (const [cheat, stand] of [["hold", "ignore"], ["goal", "ignore"], ["nap", "idle"]] as [Cheat, Stand][]) {
      const { room } = open(15838, stand, cheat);
      for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) {
        room.onTick();
        const o = room.storyView().opt!;
        if (o.eye) (seen.eye = true), expect(room.state.game.wisps[o.eye.wisp]!.guild).toBe(0);
        if (o.goal && !o.goal.live) (seen.tell = true), expect(o.goal.of).toBe(REMATCH.goal.tell);
        if (o.goal?.live) (seen.live = true), expect(o.goal.left).toBeLessThanOrEqual(REMATCH.goal.ticks);
        if (o.nap) (seen.nap = true), expect(o.strip[1]!.badge).toBe("zzz"), (seen.x2 ||= o.strip[0]!.badge === "x2");
      }
    }
    expect(seen).toEqual({ eye: true, tell: true, live: true, nap: true, x2: true });
  });

  it("the wall keeps the children's best: a better score is chalked up and the next rematch starts from it, with her next cheat", () => {
    const { room, conn, play } = open(7919, "smart", null);
    expect(room.wall).toBe(REMATCH.wallStart);
    const first = play();
    const kids = first.game.scores[0]!;
    expect(kids).toBe(REMATCH.target - 1);
    expect(first.record).toEqual({ best: kids, was: REMATCH.wallStart, won: true, count: 1, fours: 1 });
    expect(room.storyView().opt!.record).toEqual({ id: "o1", best: kids, won: true, count: 1, fours: 1 });
    expect(room.storyView().end!.summary).toContain(`A new best on the wall: ${kids}.`);
    expect(room.wall).toBe(kids);
    // Again: the second cheat, the wall where it was left, and no new best to be had.
    conn.message(JSON.stringify({ t: "lobby" }));
    expect(room.state.cheat).toBe("goal");
    const second = play();
    expect(second.record).toMatchObject({ was: kids, won: false, count: 2 });
    expect(room.storyView().end!.summary).toContain(`The wall still says ${kids}.`);
    // Four again: the wall's tally of times at four goes up, and Nell says so.
    if (second.game.scores[0] === REMATCH.target - 1) {
      expect(second.record).toMatchObject({ fours: 2 });
      expect(room.storyView().end!.lines[0]!.text).toBe("Four again! That's two times, Granny!");
      expect(room.storyView().opt!.strip[2]!.badge).toBe("2x");
    }
    // Nothing the player reads says "lost" or "sink".
    for (const l of room.storyView().end!.lines) expect(l.text).not.toMatch(/\b(lost|lose|sink)/i);
  });

  it("on her switch she plays it straight and can be beaten", () => {
    let beaten = 0;
    for (let k = 1; k <= 8; k++) if (open(k * 7919, "smart", null, (r) => (r.beatable = true)).play().game.scores[0] === REMATCH.target) beaten++;
    expect(beaten).toBeGreaterThan(0);
  }, 30000);
});
