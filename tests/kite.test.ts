import { describe, expect, it } from "vitest";
import { Mover, Tile, pt } from "../src/engine/board.js";
import { KITE, KT_VANES, ktTile, ktVaneAt } from "../src/engine/kite.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { KiteRoom, type Stand } from "../src/server/kite.js";

function play(seed: number, stand: Stand | null = "smart") {
  let s = seed * 7919;
  const room = new KiteRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
  room.stand = stand;
  const lines: StoryLine[] = [];
  const conn = room.connect((m: ServerMsg) => m.t === "say" && lines.push(...m.lines));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) room.onTick();
  };
  for (let i = 0; i < 200 && room.state.phase === "countdown"; i++) tick();
  const toEnd = () => {
    for (let i = 0; i < 3000 && room.state.phase !== "results"; i++) tick();
    return room.state;
  };
  return { room, lines, tick, toEnd, conn };
}

describe("optional run 3c: Kes's rematch on the Fell", () => {
  it("the course runs over open ground to both vanes, and both marks can be walked to from where he starts", () => {
    const b = shrineById(KITE.shrine).board, c = b.center;
    for (const arm of ["n", "s"] as const) {
      // Past the west rim, nearly every tile of the course up to the vane is one a wisp can be on.
      let open = 0, all = 0;
      for (let s = 12; s <= ktVaneAt(arm); s += 1) {
        const [x, y] = ktTile(arm, s, 0);
        all++;
        if (b.passable(pt(c.x + x, c.y + y), Mover.Wisp)) open++;
      }
      expect(open / all).toBeGreaterThan(0.9);
      const [mx, my] = KT_VANES[arm].mark, mark = pt(c.x + mx, c.y + my);
      expect(b.tile(mark)).toBe(Tile.Floor);
      const path = b.walkPath(pt(c.x + KITE.rookAt[0], c.y + KITE.rookAt[1]), mark);
      expect(path[path.length - 1]).toEqual(mark);
    }
  });

  it("opens with the goal from Lumi and Kes, held as captions, a score for each, and a count at each vane", () => {
    const { room, lines } = play(1, "idle");
    expect(lines[0]).toMatchObject({ who: "Lumi", text: "First to six. No shoving. No blaming the wind." });
    expect(lines[1]).toMatchObject({ who: "Kes", text: "Wind's up. They come by once, Rook. Miss it and it's mine." });
    const o = room.storyView().opt!;
    expect(o.id).toBe("o3c");
    expect(o.noPush).toBe(true);
    expect(o.caption?.map((c) => c.who)).toEqual(["Lumi", "Kes"]);
    expect(o.strip).toMatchObject([{ label: "Rook", n: 0, of: 6, tone: "us" }, { label: "Kes", n: 0, of: 6, tone: "her" }]);
    expect(o.vanes).toHaveLength(2);
    expect(o.vanes!.map((v) => v.n).sort()).toEqual([KITE.gust.lone, KITE.gust.rich]);
  });

  it("his staff takes hold only from a vane's mark: a tap from by the fire walks him to that arm's mark, and says why once", () => {
    const { room, tick } = play(2, null);
    tick(6);
    const g = room.state.game, me = g.players.find((p) => p.id === 1)!, c = g.board.center;
    const w = g.wisps.find((q) => !g.away.has(q.id) && room.state.course.has(q.id))!, arm = room.state.course.get(w.id)!.arm;
    const tap = () => room.connect(() => {}).message(JSON.stringify({ t: "act", action: { kind: "staff", wisp: w.id } }));
    tap();
    const hints = () => (room.storyView().opt!.caption ?? []).filter((c) => c.who === "" && /only holds from the mark/.test(c.text)).length;
    expect(hints()).toBe(1);
    tick();
    expect(me.action.kind).toBe("walk");
    const [mx, my] = KT_VANES[arm].mark;
    if (me.action.kind === "walk") expect(Math.max(Math.abs(me.action.to.x - c.x - mx), Math.abs(me.action.to.y - c.y - my))).toBeLessThanOrEqual(1);
    tick(2);
    tap();
    expect(hints()).toBe(1);
    expect(room.state.score[0]).toBe(0);
  });

  it("a wisp nobody takes goes past the vanes and off the edge, and is gone for good", () => {
    const { room, tick } = play(3, "idle");
    const g = room.state.game;
    // Kes takes what comes by her vane; what comes down the other arm blows away.
    tick(KITE.gust.every * 3);
    expect(room.state.tally.off).toBeGreaterThan(0);
    // Gone for good: nothing is left lying on the Fell, and every wisp still about is on the wind or in a staff.
    for (const w of g.wisps) if (!g.away.has(w.id)) expect(room.state.course.has(w.id) || w.holder !== null).toBe(true);
  });

  it("Kes takes the vane he is not at", () => {
    const { room, tick } = play(4, "stay");
    tick(40);
    expect(room.state.hisArm).toBe("n");
    expect(room.state.kesArm).toBe("s");
  });

  it("first to six wins it, with Kes's lines; the record is kept and a first win is marked", () => {
    const { room, lines, toEnd } = play(5, "smart");
    const st = toEnd();
    expect(st.score[0]).toBe(KITE.target);
    expect(st.end!.summary).toBe(`Rook 6, Kes ${st.score[1]}.`);
    expect(st.end!.lines.map((l) => l.text)).toEqual(["The wind helped you.", "It helped us both.", "It likes me better."]);
    expect(st.record).toMatchObject({ best: 6, won: true, count: 1 });
    expect(room.storyView().opt!.record).toMatchObject({ id: "o3c", best: 6, won: true });
    expect(lines.map((l) => l.text)).toContain("Left or right, Rook. I'll take what you don't.");
  }, 30000);

  it("when Kes gets there first, nobody says he lost", () => {
    const { toEnd } = play(6, "idle");
    const st = toEnd();
    expect(st.score[1]).toBe(KITE.target);
    expect(st.end!.lines.map((l) => l.text)).toEqual(["Tomorrow, then. I'll bring less wind.", "She won't."]);
    expect(`${st.end!.summary} ${st.end!.lines.map((l) => l.text).join(" ")}`).not.toMatch(/lost|lose|fail/i);
    expect(st.record).toMatchObject({ won: false, count: 1 });
  }, 30000);

  it("ignoring the choice costs: reading the gusts wins every time, one vane or a vane at random about half the time", () => {
    const wins = (stand: Stand) => {
      let n = 0;
      for (let k = 1; k <= 10; k++) if (play(k, stand).toEnd().record?.won) n++;
      return n;
    };
    expect(wins("smart")).toBe(10);
    expect(wins("stay")).toBeLessThanOrEqual(7);
    expect(wins("wander")).toBeLessThanOrEqual(7);
  }, 90000);
});
