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

  it("run 4: a tap on its back strikes only from behind it with the shard out, and a pull tears a wisp out that flies to him on its own", () => {
    // In front of it: a tap does nothing, even with the shard out.
    const a = play(4), f0 = a.x.it;
    a.me.pos = a.me.prev = pt(Math.round(f0.x + Math.cos(f0.face) * 3), Math.round(f0.y + Math.sin(f0.face) * 3));
    a.send({ t: "fight", shard: true });
    a.tick();
    expect(a.room.storyView().fight!.it.strike).toBe(1);
    a.send({ t: "fight", hit: true });
    a.tick();
    expect(a.room.state.wound).toBe(false);
    // Behind it, across the brazier, the shard out: its back glows to strike, and a tap opens the wound (never by itself).
    const p = play(4), b0 = p.x.it;
    p.me.pos = p.me.prev = pt(Math.round(b0.x - Math.cos(b0.face) * 3), Math.round(b0.y - Math.sin(b0.face) * 3));
    p.send({ t: "fight", shard: true });
    p.tick(2);
    expect(p.room.state.wound).toBe(false);
    expect(p.room.storyView().fight!.it.strike).toBe(2);
    p.send({ t: "fight", hit: true });
    expect(p.room.state.wound).toBe(true);
    // Then round the fire to pull, so the wisps fly through it.
    p.me.pos = p.me.prev = pt(p.c.x - 3, p.c.y);
    p.send({ t: "fight", hit: true });
    p.tick(OFFSPRING.wound.pull);
    expect(p.room.state.inside).toBe(9);
    expect(p.me.action.kind).not.toBe("staff");
    expect(p.x.torn.size + p.room.state.banked).toBe(1);
    // It flies to him through the fire (its back is at the fire's edge), and banks.
    for (let i = 0; i < 12 && p.room.state.banked === 0; i++) p.tick();
    expect(p.room.state.banked).toBe(1);
    // The hold ends and the wound shuts with it; in cycle 1 it then stands dazed.
    p.tick(OFFSPRING.her.hold);
    expect(p.room.state.wound).toBe(false);
    expect(p.x.her.doing).not.toBe("hold");
  });

  it("caught once, she saves him with one of her three lines; caught again, the card offers run 4 again", () => {
    const p = play(4);
    p.x.teach.pulled = true;
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
    p.x.teach.pulled = true;
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
    p.tick();
    p.send({ t: "fight", hit: true });
    expect(p.room.state.phase).toBe("results");
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.won);
  });

  it("the kill also comes when the tenth banks with the wound already open", () => {
    const p = play(4);
    for (const id of [...p.x.inside].slice(1)) (p.x.inside.delete(id), p.x.banked.add(id));
    const b0 = p.x.it;
    p.me.pos = p.me.prev = pt(Math.round(b0.x - Math.cos(b0.face) * 3), Math.round(b0.y - Math.sin(b0.face) * 3));
    p.send({ t: "fight", shard: true });
    p.tick();
    p.send({ t: "fight", hit: true });
    expect(p.room.state.wound).toBe(true);
    p.me.pos = p.me.prev = pt(p.c.x - 3, p.c.y);
    p.send({ t: "fight", hit: true });
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

  it("round 1 teaches the three steps: the hold waits for them, each with her order and a hint, and a mark where to stand", () => {
    const p = play(4), T = OFFSPRING.teach, said = () => p.lines.filter((l) => l.who === "Solenne").map((l) => l.text);
    p.tick(20);
    // The hold waits.
    expect(p.x.her.doing).toBe("hold");
    expect(p.x.her.left).toBe(OFFSPRING.her.hold);
    const f = () => p.room.storyView().fight!;
    expect(f().teach?.hint).toBe("show");
    expect(p.x.teach.said.has("show")).toBe(true);
    const stand = f().teach!.stand!;
    expect(p.room.storyView().opt?.stand).toEqual(stand);
    // On the mark, behind it; the shard out: the strike, her order only once he has waited.
    p.me.pos = p.me.prev = pt(stand.x, stand.y);
    p.send({ t: "fight", shard: true });
    p.tick();
    expect(f().teach?.hint).toBe("strike");
    expect(f().it.strike).toBe(2);
    expect(said()).not.toContain(T.say.strike);
    p.tick(T.wait);
    expect(said()).toContain(T.say.strike);
    p.send({ t: "fight", hit: true });
    p.tick();
    expect(f().teach?.hint).toBe("pull");
    // The mark moves past the fire, where the pulled wisps fly home through it.
    const there = f().teach!.stand!;
    expect(Math.hypot(there.x - stand.x, there.y - stand.y)).toBeGreaterThan(3);
    p.me.pos = p.me.prev = pt(there.x, there.y);
    p.send({ t: "fight", hit: true });
    p.tick(OFFSPRING.wound.pull);
    expect(p.room.state.banked + p.x.torn.size).toBeGreaterThanOrEqual(1);
    // The hold runs now, and near its end she says to cover the shard, her ring flashing.
    expect(f().teach?.stand).toBeUndefined();
    for (let i = 0; i < 20 && f().teach?.hint !== "cover"; i++) p.tick();
    expect(f().teach?.hint).toBe("cover");
    expect(said()).toContain(T.say.cover);
    expect(p.room.storyView().opt?.feet?.[0]?.flash).toBe(true);
    // Left out through the dazed gap, the shard snaps its eye to him.
    for (let i = 0; i < 20 && p.x.her.doing === "hold"; i++) p.tick();
    p.tick();
    const me = p.me.pos, it = p.x.it;
    expect(Math.abs(Math.atan2(me.y - it.y, me.x - it.x) - it.face)).toBeLessThan(1e-6);
    expect(said()).toContain(T.say.sees);
  });

  it("on a retry of run 4, hints only: no orders from her", () => {
    const p = play(4);
    p.x.teach.pulled = true;
    p.x.her.left = 0;
    p.tick();
    for (const id of [...p.x.inside]) p.x.inside.delete(id);
    p.me.pos = p.me.prev = pt(Math.round(p.x.it.x) - 4, Math.round(p.x.it.y));
    p.send({ t: "fight", shard: true });
    for (let i = 0; i < 200 && p.room.state.phase === "playing"; i++) {
      if (p.room.state.catches) p.x.it.dazed = -1;
      p.tick();
    }
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.again4);
    p.lines.length = 0;
    p.send({ t: "lobby" });
    for (let i = 0; i < 5 && p.room.state.phase !== "playing"; i++) p.room.onTick();
    p.tick();
    expect(p.room.storyView().fight!.teach).toMatchObject({ hint: "show", retry: true });
    expect(p.lines.filter((l) => Object.values(OFFSPRING.teach.say).includes(l.text))).toEqual([]);
  });

  it("before each blast her flare draws it: it leaps to her landing mark, and he can't strike from the brazier's far side", () => {
    const p = play(4);
    p.x.teach.pulled = true;
    p.x.her.left = 0;
    p.tick();
    // Rook waits on the brazier's edge; she recharges, flares, and it leaps over her wind-up.
    p.me.pos = p.me.prev = pt(p.c.x - 2, p.c.y);
    let leapt = false;
    let marked = false;
    for (let i = 0; i < 60 && p.room.state.cycle < 2; i++) {
      p.tick();
      if (p.room.storyView().fight!.it.leap) leapt = true;
      if (p.room.storyView().opt?.land) marked = true;
    }
    expect(marked).toBe(true);
    expect(p.room.state.cycle).toBe(2);
    expect(leapt).toBe(true);
    const sol = p.g.players.find((q) => q.id === 2)!.pos, it = p.x.it;
    expect(Math.hypot(sol.x - it.x, sol.y - it.y)).toBeCloseTo(OFFSPRING.cycles.at, 5);
    // The strike is from close behind it: not from the brazier's far side, where he pulls from.
    p.send({ t: "fight", shard: true });
    for (const [dx, dy] of [[-2, 0], [0, -2], [0, 2], [-1, -1], [-2, -1], [-2, 1]] as const) {
      p.me.pos = p.me.prev = pt(p.c.x + dx, p.c.y + dy);
      expect(p.room.storyView().fight!.it.strike).toBe(1);
    }
    p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * 2.5), Math.round(it.y - Math.sin(it.face) * 2.5));
    expect(p.room.storyView().fight!.it.strike).toBe(2);
  });

  it("round 1's hold ends after three pulls, and a landing on him knocks him aside", () => {
    const p = play(4), b0 = p.x.it;
    p.me.pos = p.me.prev = pt(Math.round(b0.x - Math.cos(b0.face) * 3), Math.round(b0.y - Math.sin(b0.face) * 3));
    p.send({ t: "fight", shard: true });
    p.tick();
    p.send({ t: "fight", hit: true });
    p.me.pos = p.me.prev = pt(p.c.x - 3, p.c.y);
    for (let n = 0; n < OFFSPRING.teach.pulls1; n++) {
      p.send({ t: "fight", hit: true });
      p.tick(OFFSPRING.wound.pull);
    }
    expect(p.x.her.left).toBeLessThanOrEqual(OFFSPRING.teach.coverAt);
    // Out of the hold; he waits right where it will land.
    p.send({ t: "fight", shard: true });
    for (let i = 0; i < 80 && p.x.her.doing !== "windup"; i++) p.tick();
    expect(p.x.her.doing).toBe("windup");
    const to = p.room.storyView().opt!.land!;
    p.me.pos = p.me.prev = pt(Math.round(to.x), Math.round(to.y));
    let down = 0;
    for (let i = 0; i < 5; i++) (p.tick(), (down = Math.max(down, p.room.state.down)));
    expect(down).toBe(OFFSPRING.knockdown.down);
    expect(Math.hypot(p.me.pos.x - to.x, p.me.pos.y - to.y)).toBeGreaterThan(OFFSPRING.it.size / 2);
  });

  it("waiting just behind where it lands is safe: the landing knocks down only under its body", () => {
    const p = play(4);
    p.x.teach.pulled = true;
    p.x.her.left = 0;
    p.tick();
    for (let i = 0; i < 80 && p.x.her.doing !== "windup"; i++) p.tick();
    const to = p.room.storyView().opt!.land!, sol = p.g.players.find((q) => q.id === 2)!.pos, a = Math.atan2(sol.y - to.y, sol.x - to.x);
    p.me.pos = p.me.prev = pt(Math.round(to.x - Math.cos(a) * 2), Math.round(to.y - Math.sin(a) * 2));
    let down = 0;
    for (let i = 0; i < 5; i++) (p.tick(), (down = Math.max(down, p.room.state.down)));
    expect(down).toBe(0);
  });

  it("out of her hold it jumps now and then to a random spot or onto a lit wisp, never near Rook, and not while it eats at the brazier", () => {
    const p = play(4);
    p.x.teach.pulled = true;
    p.x.her.left = 0;
    p.tick();
    p.x.it.dazed = -1;
    // Keep her short of a blast; count the jumps it makes on its own.
    let hops = 0, last = -1;
    for (let i = 0; i < 120 && p.room.state.phase === "playing"; i++) {
      p.x.her.light = 3;
      p.tick();
      const lp = p.room.storyView().fight!.it.leap;
      if (lp && lp.t0 !== last) {
        last = lp.t0;
        hops++;
        expect(Math.hypot(lp.to.x - p.me.pos.x, lp.to.y - p.me.pos.y)).toBeGreaterThan(OFFSPRING.it.size / 2 + OFFSPRING.hop.clear);
        expect(p.room.storyView().opt?.land).toBeTruthy();
      }
    }
    expect(hops).toBeGreaterThanOrEqual(3);
    // Off, none.
    OFFSPRING.hop.on = 0;
    const q = play(4);
    q.x.teach.pulled = true;
    q.x.her.left = 0;
    q.tick();
    let any = false;
    for (let i = 0; i < 80 && q.room.state.phase === "playing"; i++) (q.x.her.light = 3), q.tick(), (any ||= !!q.room.storyView().fight!.it.leap);
    expect(any).toBe(false);
    OFFSPRING.hop.on = 1;
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
