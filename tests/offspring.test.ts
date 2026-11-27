import { describe, expect, it } from "vitest";
import { Tile, pt } from "../src/engine/board.js";
import { shrineById } from "../src/engine/maps.js";
import { OFFSPRING } from "../src/engine/offspring.js";
import type { ServerMsg, StoryLine } from "../src/engine/protocol.js";
import { moveWisp } from "../src/server/granny.js";
import { FightRoom } from "../src/server/offspring.js";

function play(start: 3 | 4 = 3, seed = 5) {
  let s = seed * 7919;
  const room = new FightRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), start);
  const lines: StoryLine[] = [];
  const conn = room.connect((m: ServerMsg) => m.t === "say" && lines.push(...m.lines));
  conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
  const send = (m: object) => conn.message(JSON.stringify(m));
  const tick = (n = 1) => {
    for (let i = 0; i < n && room.state.phase === "playing"; i++) room.onTick();
  };
  for (let i = 0; i < 20 && room.state.phase === "countdown"; i++) room.onTick();
  const g = room.state.game, c = g.board.center, me = g.players.find((p) => p.id === 1)!;
  const at = (x: number, y: number) => pt(c.x + x, c.y + y);
  return { room, lines, send, tick, g, c, me, at, x: room.inner };
}

/** The opening pull, done: the marked wisp pulled from where Rook starts, until it banks. */
function opened(start: 3 | 4 = 3) {
  const p = play(start);
  p.send({ t: "act", action: { kind: "staff", wisp: 0 } });
  for (let i = 0; i < 30 && p.room.state.part === "open"; i++) p.tick();
  return p;
}

describe("Part 2, runs 3 and 4: the offspring fight", () => {
  it("the yard: open ground round a dead brazier, everyone and the same ten wisps on open ground", () => {
    const b = shrineById(OFFSPRING.shrine).board, c = b.center;
    expect(b.tile(c)).toBe(Tile.Brazier);
    for (const [x, y] of [OFFSPRING.rook, OFFSPRING.solenne, OFFSPRING.fen, ...OFFSPRING.wisps]) expect(b.tile(pt(c.x + x!, c.y + y!))).toBe(Tile.Floor);
    const { g } = play();
    expect(g.wisps.length).toBe(10);
    expect(g.wisps.map((w) => [w.pos.x - g.board.center.x, w.pos.y - g.board.center.y])).toEqual(OFFSPRING.wisps.map(([x, y]) => [x, y]));
  });

  it("run 3 starts on the marked wisp: nothing moves until it is banked, then the offspring turns from her to the brazier", () => {
    const p = play();
    expect(p.room.storyView().mark?.wisp).toBe(0);
    const it0 = { ...p.room.state.it };
    p.tick(5);
    expect(p.room.state.it.x).toBe(it0.x);
    expect(p.room.state.part).toBe("open");
    p.send({ t: "act", action: { kind: "staff", wisp: 0 } });
    for (let i = 0; i < 30 && p.room.state.part === "open"; i++) p.tick();
    expect(p.room.state.part).toBe("play");
    expect(p.room.state.banked).toBe(1);
    // It is after the brazier, and turns before it goes (the turn is the tell).
    p.tick();
    expect(p.room.storyView().fight!.it.after).toBe("brazier");
    expect(p.room.storyView().fight!.her.light).toBeGreaterThanOrEqual(OFFSPRING.her.start3);
  });

  it("goes for food, nearest first: an asleep wisp at its front it can't see, but once he has pulled it, it beats the fire", () => {
    const p = opened();
    const it0 = p.x.it, w = p.g.wisps[3]!;
    moveWisp(w, pt(Math.round(it0.x + Math.cos(it0.face) * 2.5), Math.round(it0.y + Math.sin(it0.face) * 2.5)));
    p.tick();
    expect(p.room.storyView().fight!.it.after).toBe("brazier");
    expect(p.room.storyView().fight!.asleep).toContain(w.id);
    p.x.lit.add(w.id);
    p.tick();
    expect(p.room.storyView().fight!.it.after).toBe("wisp");
    expect(p.room.storyView().fight!.asleep).not.toContain(w.id);
    // And eats what it reaches, and it stays inside it.
    for (let i = 0; i < 12 && !p.g.away.has(w.id); i++) p.tick();
    expect(p.g.away.has(w.id)).toBe(true);
    expect(p.room.state.inside).toBeGreaterThanOrEqual(1);
  });

  it("her shove costs 2 and knocks it back 3 tiles; under 2 it reaches them and the card offers run 3 again", () => {
    const p = opened();
    const sol = p.g.players.find((q) => q.id === 2)!.pos;
    // Clear the yard, so she is all it can see.
    for (const w of p.g.wisps) if (!p.g.away.has(w.id)) p.g.away.set(w.id, 1e9);
    p.x.banked.clear();
    p.x.her.dipUntil = -1;
    p.x.it.x = sol.x - 4;
    p.x.it.y = sol.y;
    const before = p.x.her.light;
    for (let i = 0; i < 10 && p.x.her.light === before; i++) p.tick();
    expect(p.x.her.light).toBeCloseTo(before - OFFSPRING.her.shove, 5);
    expect(sol.x - p.x.it.x).toBeGreaterThanOrEqual(OFFSPRING.it.size / 2 + OFFSPRING.her.shoveAt + OFFSPRING.her.knock - 0.6);
    p.x.her.light = 1.5;
    p.tick(20);
    expect(p.room.state.phase).toBe("results");
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.again3);
    const text = JSON.stringify(p.room.state.end);
    expect(text).not.toMatch(/you lost|sink/i);
    p.send({ t: "lobby" });
    expect(p.room.state.run).toBe(3);
    expect(p.room.state.part).toBe("open");
  });

  it("the tenth wisp eaten: she flares whatever her light, and run 4 starts on the spot with all ten inside it", () => {
    const p = opened();
    p.x.her.light = 4;
    // Feed it everything: each loose wisp lit and set down at its eye, the banked one eaten from the brazier.
    for (let i = 0; i < 200 && p.room.state.run === 3; i++) {
      const loose = p.g.wisps.find((w) => !p.g.away.has(w.id));
      if (loose) p.x.lit.add(loose.id);
      if (loose) moveWisp(loose, pt(Math.round(p.x.it.x + Math.cos(p.x.it.face) * 2), Math.round(p.x.it.y + Math.sin(p.x.it.face) * 2)));
      // With nothing loose left, she dims to nothing so the fire is the most light, and it goes back for the banked one.
      p.x.her.light = loose ? 4 : 0;
      p.tick();
    }
    expect(p.room.state.run).toBe(4);
    const f = p.room.storyView().fight!;
    expect(f.it.inside).toBe(10);
    expect(f.banked).toBe(0);
    expect(f.her.light).toBe(OFFSPRING.her.afterBlast);
    expect(f.her.doing).toBe("hold");
    expect(f.it.held).toBe(true);
    expect(f.shard).toEqual({ shown: false, glow: 0, of: OFFSPRING.light.shard });
  });

  it("run 4: the wound opens only behind it with the shard uncovered, and a pull tears a wisp out that flies to him on its own", () => {
    // In front of it: no wound, even with the shard out (and the shard no longer shortens her hold).
    const a = play(4), f0 = a.x.it;
    a.me.pos = a.me.prev = pt(Math.round(f0.x + Math.cos(f0.face) * 3), Math.round(f0.y + Math.sin(f0.face) * 3));
    a.send({ t: "fight", shard: true });
    a.tick(2);
    expect(a.room.state.wound).toBe(false);
    expect(a.x.her.left).toBe(OFFSPRING.her.hold - 2);
    // Behind it, across the brazier, the shard out: the wound opens.
    const p = play(4);
    p.me.pos = p.me.prev = pt(p.c.x - 3, p.c.y);
    p.send({ t: "fight", shard: true });
    p.tick();
    expect(p.room.state.wound).toBe(true);
    p.send({ t: "fight", pull: true });
    p.tick(OFFSPRING.wound.pull);
    expect(p.room.state.inside).toBe(9);
    expect(p.me.action.kind).not.toBe("staff");
    expect(p.x.torn.size).toBe(1);
    expect(p.x.lit.size).toBeGreaterThanOrEqual(1);
    // It flies to him through the fire, and banks.
    for (let i = 0; i < 12 && p.room.state.banked === 0; i++) p.tick();
    expect(p.room.state.banked).toBe(1);
    // The hold ends and the wound shuts with it; in cycle 1 it then stands dazed.
    p.tick(OFFSPRING.her.hold);
    expect(p.room.state.wound).toBe(false);
    expect(p.x.her.doing).not.toBe("hold");
  });

  it("caught once, she saves him with one of her three lines; caught again, the card offers run 4 again", () => {
    const p = play(4);
    p.x.her.left = 0;
    p.tick();
    // Out of her hold, with only the shard to see, near him.
    for (const id of [...p.x.inside]) p.x.inside.delete(id);
    p.me.pos = p.me.prev = pt(Math.round(p.x.it.x) - 4, Math.round(p.x.it.y));
    p.send({ t: "fight", shard: true });
    // Cycle 1: it stands dazed first, then goes for the shard.
    p.tick(OFFSPRING.it.daze1 - 2);
    expect(p.room.state.catches).toBe(0);
    for (let i = 0; i < 30 && p.room.state.catches === 0; i++) p.tick();
    expect(p.room.state.catches).toBe(1);
    expect(p.x.her.light).toBe(OFFSPRING.her.afterSave);
    expect(OFFSPRING.saved).toContain(p.lines.at(-1)?.text);
    expect(p.lines.at(-1)?.who).toBe("Solenne");
    for (let i = 0; i < 30 && p.room.state.phase === "playing"; i++) p.tick();
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.again4);
    p.send({ t: "lobby" });
    expect(p.room.state.run).toBe(4);
    expect(p.room.state.inside).toBe(10);
  });

  it("the kill: all ten in the brazier holds its eye, she blasts at full, and the shard in its back ends it", () => {
    const p = play(4);
    for (const id of [...p.x.inside]) (p.x.inside.delete(id), p.x.banked.add(id));
    p.x.her.left = 0;
    p.tick();
    expect(p.room.state.part).toBe("kill");
    // It stares at the fire and eats nothing; she charges and blasts.
    for (let i = 0; i < 40 && p.x.her.doing !== "hold"; i++) p.tick();
    expect(p.x.her.doing).toBe("hold");
    expect(p.room.state.banked).toBe(10);
    const it0 = p.x.it;
    p.me.pos = p.me.prev = pt(Math.round(it0.x - Math.cos(it0.face) * 3), Math.round(it0.y - Math.sin(it0.face) * 3));
    p.send({ t: "fight", shard: true });
    p.tick(3);
    expect(p.room.state.phase).toBe("results");
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.won);
  });

  it("the kill also comes when the tenth banks with the wound already open", () => {
    const p = play(4);
    for (const id of [...p.x.inside].slice(1)) (p.x.inside.delete(id), p.x.banked.add(id));
    p.me.pos = p.me.prev = pt(p.c.x - 3, p.c.y);
    p.send({ t: "fight", shard: true });
    p.tick();
    expect(p.room.state.wound).toBe(true);
    p.send({ t: "fight", pull: true });
    for (let i = 0; i < 20 && p.room.state.phase === "playing"; i++) p.tick();
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.won);
  });

  it("slow when empty, faster the more it has eaten; and a shove dazes it", () => {
    const p = opened();
    for (const w of p.g.wisps) if (!p.g.away.has(w.id)) p.g.away.set(w.id, 1e9);
    p.x.banked.clear();
    const sol = p.g.players.find((q) => q.id === 2)!.pos;
    const step = (inside: number) => {
      p.x.inside.clear();
      for (let i = 0; i < inside; i++) p.x.inside.add(i);
      p.x.it.x = sol.x - 9;
      p.x.it.y = sol.y;
      p.x.it.face = 0;
      p.x.it.dazed = -1;
      const x0 = p.x.it.x;
      p.tick();
      return p.x.it.x - x0;
    };
    expect(step(0)).toBeCloseTo(OFFSPRING.it.slow, 5);
    expect(step(10)).toBeCloseTo(OFFSPRING.it.speed, 5);
    p.x.it.x = sol.x - 3;
    p.x.her.light = OFFSPRING.her.full;
    for (let i = 0; i < 5 && p.x.her.light === OFFSPRING.her.full; i++) p.tick();
    expect(p.x.it.dazed - p.g.tick).toBeGreaterThanOrEqual(OFFSPRING.it.shoveDaze - 1);
  });

  it("in its way: a run through his tile throws him clear and he is down three ticks (never hurt); off with knockdown.on 0", () => {
    for (const on of [1, 0]) {
      OFFSPRING.knockdown.on = on;
      const p = opened();
      for (const w of p.g.wisps) if (!p.g.away.has(w.id)) p.g.away.set(w.id, 1e9);
      p.x.banked.clear();
      p.x.her.dipUntil = -1;
      const sol = p.g.players.find((q) => q.id === 2)!.pos;
      p.x.it.x = sol.x - 9;
      p.x.it.y = sol.y;
      p.x.it.face = 0;
      p.me.pos = p.me.prev = pt(sol.x - 5, sol.y);
      const was = { ...p.me.pos };
      let downSeen = 0;
      for (let i = 0; i < 4; i++) (p.tick(), (downSeen = Math.max(downSeen, p.room.state.down)));
      if (on) {
        expect(downSeen).toBe(OFFSPRING.knockdown.down);
        expect(Math.abs(p.me.pos.y - was.y)).toBeGreaterThanOrEqual(2);
      } else expect(downSeen).toBe(0);
    }
    OFFSPRING.knockdown.on = 1;
  });
});
