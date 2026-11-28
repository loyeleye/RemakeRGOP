import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  // Tests of run 4's rounds of holds (OFFSPRING.hunt off, v291) switch the hunt off; every test ends with the defaults back.
  // The dark (OFFSPRING.dark) hides its body from the view: tests of the rest switch it off.
  beforeEach(() => {
    OFFSPRING.dark.on = 0;
  });
  afterEach(() => {
    OFFSPRING.dark.on = 1;
    OFFSPRING.hunt.on = 1;
    OFFSPRING.hunt.block = 0;
    OFFSPRING.it.daze1 = 0;
    OFFSPRING.her.regen4 = 0.2;
    OFFSPRING.it.eatBanked4 = 4;
    OFFSPRING.it.size = 5;
  });
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
    OFFSPRING.hunt.on = 0;
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
    p.me.pos = p.me.prev = pt(p.c.x - 2, p.c.y);
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
    // The save, shown (Ladi, 27 Nov 10:57 PM): he goes down, it is knocked back and dazed, the dark lifts, her save is spent.
    const v = p.room.storyView(), f = v.fight!, H = OFFSPRING.her;
    expect(f.save).toMatchObject({ tick: f.tick, until: f.tick + H.saveDaze });
    expect(Math.hypot(f.save!.to.x - f.save!.from.x, f.save!.to.y - f.save!.from.y)).toBeGreaterThan(1);
    expect(p.room.state.down).toBe(H.save.down);
    expect(f.thrown).toMatchObject({ tick: f.tick, ticks: H.save.down });
    expect(v.opt?.strip.some((c) => c.label === "Her save: spent" && c.n === 0)).toBe(true);
    for (let i = 0; i < 30 && p.room.state.phase === "playing"; i++) p.tick();
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.again4);
    p.send({ t: "lobby" });
    expect(p.room.state.run).toBe(4);
    expect(p.room.state.inside).toBe(10);
  });

  const atFire = (p: ReturnType<typeof play>) => Math.hypot(p.c.x - p.x.it.x, p.c.y - p.x.it.y) <= OFFSPRING.it.reachBrazier + OFFSPRING.it.size / 2 + 0.1;
  const behindIt = (p: ReturnType<typeof play>) => {
    const it = p.x.it;
    p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * 3), Math.round(it.y - Math.sin(it.face) * 3));
  };

  it("the kill: all ten in the brazier holds its eye, it drinks at the fire for nothing, and the shard in its back there ends it", () => {
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
    // Away from the fire a strike does nothing (Ladi, 27 Nov 10:03 PM: the kill comes only while it drinks).
    p.x.it.x = p.c.x + 9;
    p.x.it.y = p.c.y;
    behindIt(p);
    p.send({ t: "fight", hit: true });
    expect(p.room.storyView().fight!.dying).toBeUndefined();
    for (let i = 0; i < 60 && !(atFire(p) && p.room.storyView().fight!.it.eating); i++) p.tick();
    expect(atFire(p)).toBe(true);
    expect(p.room.storyView().fight!.it.eating).toBe(true);
    expect(p.room.state.banked).toBe(10);
    behindIt(p);
    p.send({ t: "fight", shard: true });
    p.tick();
    p.send({ t: "fight", hit: true });
    // Its death plays out first (OFFSPRING.death): nothing moves, a tap changes nothing, then the card.
    const D = OFFSPRING.death, f0 = p.room.storyView().fight!;
    expect(p.room.state.phase).toBe("playing");
    expect(f0.dying).toEqual({ t0: f0.tick, ticks: D.ticks });
    const at = { x: p.x.it.x, y: p.x.it.y };
    p.tick(D.ticks - 1);
    p.send({ t: "fight", hit: true });
    expect(p.room.state.phase).toBe("playing");
    expect(p.x.it).toMatchObject(at);
    p.tick();
    expect(p.room.state.phase).toBe("results");
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.won);
  });

  it("reaching the boy in run 4: it feeds on him for its ticks, nothing else moves, then the card", () => {
    const p = play(4);
    p.x.teach.pulled = true;
    p.x.her.left = 0;
    p.tick();
    p.room.debug("drain");
    const D = OFFSPRING.her.fenDrain, f0 = p.room.storyView().fight!;
    expect(f0.drain).toEqual({ t0: f0.tick, ticks: D.ticks });
    expect(f0.it.hidden).toBeUndefined();
    const at = { x: p.x.it.x, y: p.x.it.y };
    p.tick(D.ticks - 1);
    expect(p.room.state.phase).toBe("playing");
    expect(p.x.it).toMatchObject(at);
    p.tick();
    expect(p.room.state.phase).toBe("results");
    expect(p.room.state.end?.summary).toBe(OFFSPRING.card.again4);
    expect(p.room.lostTo).toBe("fen");
  });

  it("the tenth banked with the wound open does not end it: the wound shuts, and the kill is a strike while it drinks", () => {
    const p = play(4);
    for (const id of [...p.x.inside].slice(1)) (p.x.inside.delete(id), p.x.banked.add(id));
    const b0 = p.x.it;
    p.me.pos = p.me.prev = pt(Math.round(b0.x - Math.cos(b0.face) * 3), Math.round(b0.y - Math.sin(b0.face) * 3));
    p.send({ t: "fight", shard: true });
    p.tick();
    p.send({ t: "fight", hit: true });
    expect(p.room.state.wound).toBe(true);
    p.me.pos = p.me.prev = pt(p.c.x - 2, p.c.y);
    const last = [...p.x.inside][0]!;
    p.send({ t: "fight", hit: true });
    p.tick(OFFSPRING.wound.pull + 1);
    // Torn out, it lies loose (hunt.home 0): he pulls it to the fire like any light.
    expect(p.x.inside.has(last)).toBe(false);
    p.send({ t: "act", action: { kind: "staff", wisp: last } });
    for (let i = 0; i < 40 && p.room.state.part !== "kill"; i++) p.tick();
    expect(p.room.state.part).toBe("kill");
    p.tick();
    expect(p.room.state.phase).toBe("playing");
    expect(p.room.state.wound).toBe(false);
    for (let i = 0; i < 80 && !atFire(p); i++) p.tick();
    expect(atFire(p)).toBe(true);
    behindIt(p);
    p.send({ t: "fight", hit: true });
    p.tick(OFFSPRING.death.ticks + 1);
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
    OFFSPRING.hunt.on = 0;
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
    // Left out when she lets go, there is no dazed gap (Ladi, 27 Nov 3:51 PM): it is free at once.
    for (let i = 0; i < 20 && p.x.her.doing === "hold"; i++) p.tick();
    p.tick();
    expect(p.x.it.dazed).toBeLessThanOrEqual(p.g.tick);
  });

  it("on a retry of run 4, hints only: no orders from her", () => {
    OFFSPRING.hunt.on = 0;
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
    OFFSPRING.hunt.on = 0;
    // The landing, not the gap after round 1: keep it standing through the gap, as the old daze did.
    OFFSPRING.it.daze1 = 15;
    // And her old, quicker recharge, so the wind-up comes inside the loop.
    OFFSPRING.her.regen4 = 0.5;
    OFFSPRING.it.eatBanked4 = 2;
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
    OFFSPRING.it.daze1 = 0;
  });

  it("round 1's hold ends after three pulls, and a landing on him knocks him aside", () => {
    OFFSPRING.hunt.on = 0;
    // The landing, not the gap after round 1: keep it standing through the gap, as the old daze did.
    OFFSPRING.it.daze1 = 15;
    // And her old, quicker recharge, so the wind-up comes inside the loop.
    OFFSPRING.her.regen4 = 0.5;
    OFFSPRING.it.eatBanked4 = 2;
    const p = play(4), b0 = p.x.it;
    p.me.pos = p.me.prev = pt(Math.round(b0.x - Math.cos(b0.face) * 3), Math.round(b0.y - Math.sin(b0.face) * 3));
    p.send({ t: "fight", shard: true });
    p.tick();
    p.send({ t: "fight", hit: true });
    p.me.pos = p.me.prev = pt(p.c.x - 2, p.c.y);
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
    OFFSPRING.it.daze1 = 0;
  });

  it("waiting just behind where it lands is safe: the landing knocks down only under its body", () => {
    // The landing's geometry as it was set up, at its old size.
    OFFSPRING.it.size = 3;
    OFFSPRING.hunt.on = 0;
    // The landing, not the gap after round 1: keep it standing through the gap, as the old daze did.
    OFFSPRING.it.daze1 = 15;
    // And her old, quicker recharge, so the wind-up comes inside the loop.
    OFFSPRING.her.regen4 = 0.5;
    OFFSPRING.it.eatBanked4 = 2;
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
    OFFSPRING.it.daze1 = 0;
  });

  it("out of her hold it jumps now and then to a random spot or onto a lit wisp, never near Rook, and not while it eats at the brazier", () => {
    // At its old size: at 5 the yard has few spots clear of him to land on in 120 ticks.
    OFFSPRING.it.size = 3;
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
      let downSeen = 0, thrown: NonNullable<ReturnType<typeof p.room.storyView>["fight"]>["thrown"];
      for (let i = 0; i < 4; i++) (p.tick(), (downSeen = Math.max(downSeen, p.room.state.down)), (thrown ??= p.room.storyView().fight!.thrown));
      if (on) {
        expect(downSeen).toBe(OFFSPRING.knockdown.down);
        // The view has his flight, from where he stood to where he fell, for the ticks he is down.
        expect(thrown).toMatchObject({ from: was, to: { x: p.me.pos.x, y: p.me.pos.y }, ticks: OFFSPRING.knockdown.down });
        expect(Math.abs(p.me.pos.y - was.y)).toBeGreaterThanOrEqual(2);
      } else (expect(downSeen).toBe(0), expect(thrown).toBeUndefined());
    }
    OFFSPRING.knockdown.on = 1;
  });

  it("from round 2 the wound stays open, loose, after her hold while the shard is out: it crawls, he pulls only within reach, and a cover or a catch shuts it", () => {
    OFFSPRING.hunt.on = 0;
    const p = play(4), W = OFFSPRING.wound;
    p.tick(20);
    // Round 2's hold, nearly spent, the wound open and the shard out.
    p.x.teach.pulled = true;
    p.x.cycle = 2;
    p.x.her.doing = "hold";
    p.x.her.left = 1;
    p.x.it.held = true;
    p.x.shard.shown = true;
    p.x.shard.glow = 3;
    p.x.wound.open = true;
    p.tick();
    expect(p.x.her.doing).toBe("rest");
    expect(p.x.wound.open).toBe(true);
    expect(p.room.storyView().fight!.teach?.hint).toBe("loose");
    expect(p.lines.some((l) => l.text === OFFSPRING.teach.say.loose)).toBe(true);
    // It crawls at wound.crawl while loose.
    const a = { x: p.x.it.x, y: p.x.it.y };
    p.tick();
    expect(Math.hypot(p.x.it.x - a.x, p.x.it.y - a.y)).toBeLessThanOrEqual(W.crawl + 1e-6);
    // Out of reach, a tap pulls nothing, and the wound's mark is not live.
    const it = p.x.it, far = W.reach + OFFSPRING.it.size / 2 + 2;
    const out = [pt(Math.round(it.x + far), Math.round(it.y)), pt(Math.round(it.x - far), Math.round(it.y)), pt(Math.round(it.x), Math.round(it.y + far)), pt(Math.round(it.x), Math.round(it.y - far))].find((q) => p.g.board.inside(q) && p.g.board.tile(q) === Tile.Floor)!;
    p.me.pos = p.me.prev = out;
    const before = p.x.inside.size;
    p.send({ t: "fight", hit: true });
    p.tick(W.pull);
    expect(p.x.inside.size).toBe(before);
    expect(p.room.storyView().opt?.hit?.live).toBe(false);
    // And not silently: the "too far" hint.
    expect(p.room.storyView().fight!.teach?.hint).toBe("far");
    // Covering the shard shuts it.
    p.send({ t: "fight", shard: true });
    p.tick();
    expect(p.x.shard.shown).toBe(false);
    expect(p.x.wound.open).toBe(false);
  });

  it("the run button works in the fight: he starts walking and can switch to running and back", () => {
    for (const run of [3, 4] as const) {
      const p = play(run);
      expect(p.me.run).toBe(false);
      p.send({ t: "act", toggleRun: true });
      p.tick();
      expect(p.me.run).toBe(true);
      p.send({ t: "act", toggleRun: true });
      p.tick();
      expect(p.me.run).toBe(false);
    }
  });

  describe("the hunt (OFFSPRING.hunt, the gameplay thread's trial)", () => {
    /** Run 4, past round 1's stun: it walks free, and Rook stands `d` tiles behind it. */
    const loose = (d = 2.5) => {
      const p = play(4);
      p.x.teach.pulled = p.x.teach.homed = p.x.teach.eyed = true;
      p.x.her.left = 0;
      p.tick();
      const it = p.x.it;
      p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * d), Math.round(it.y - Math.sin(it.face) * d));
      return p;
    };

    it("pinned against the brazier with him right across it, it leaps over the fire to his side (off with hunt.overFire 0)", () => {
      const hop = OFFSPRING.hop.on;
      OFFSPRING.hop.on = 0;
      for (const over of [2, 0]) {
        OFFSPRING.hunt.overFire = over;
        const p = loose(), c = p.c;
        p.send({ t: "fight", hit: true });
        p.x.wound.open = false;
        p.x.it.x = c.x - 3.2;
        p.x.it.y = c.y;
        p.x.it.face = 0;
        const me = pt(c.x + 5, c.y);
        let leapt = false;
        for (let i = 0; i < 6; i++) (p.me.pos = p.me.prev = me), (p.x.shard.shown = true), p.tick(), (leapt ||= !!p.x.it.leap);
        expect(leapt).toBe(over > 0);
        if (over) {
          p.tick(OFFSPRING.hunt.overTicks + 1);
          expect(p.x.it.x).toBeGreaterThan(c.x + 2);
        } else expect(p.x.it.x).toBeLessThan(c.x - 2.5);
      }
      OFFSPRING.hunt.overFire = 2;
      OFFSPRING.hop.on = hop;
    });

    it("her four hunt lines (Ladi's pick), each once, the first time its hint shows", () => {
      const p = play(4), H = OFFSPRING.teach.huntSay;
      for (let i = 0; i < 12; i++) p.tick();
      expect(p.room.storyView().fight!.teach?.hint).toBe("strike");
      expect(p.lines.filter((l) => l.text === H.strike).length).toBe(1);
      expect(p.lines.some((l) => l.text === OFFSPRING.teach.say.strike)).toBe(false);
      for (let i = 0; i < 6; i++) p.tick();
      expect(p.lines.filter((l) => l.text === H.strike).length).toBe(1);
    });

    it("strikes from behind whenever it isn't looking, held or not, and each pull flings a light that lies loose and lit, to be pulled to the fire", () => {
      const p = loose();
      expect(p.x.it.held).toBe(false);
      expect(p.room.storyView().fight!.it.strike).toBe(2);
      p.send({ t: "fight", hit: true });
      expect(p.x.wound.open).toBe(true);
      expect(p.x.shard.shown).toBe(true);
      const n = p.x.inside.size;
      p.send({ t: "fight", hit: true });
      let flung: { id: number; to: { x: number; y: number } } | undefined;
      for (let i = 0; i < OFFSPRING.wound.pull + 1 && !flung; i++) (p.tick(), (flung = p.room.storyView().fight!.flung?.[0]));
      expect(p.x.inside.size).toBe(n - 1);
      expect(flung).toBeDefined();
      const w = p.g.wisps[flung!.id]!;
      expect(w.pos).toMatchObject(flung!.to);
      // Not on its way home by itself: ordinary loose light (hunt.home 0), lit, to be pulled and banked.
      expect(p.x.torn.has(flung!.id)).toBe(false);
      expect(p.g.noBank.has(flung!.id)).toBe(false);
      expect(p.x.lit.has(flung!.id)).toBe(true);
      // His first pull on it is the "home" step done.
      p.x.teach.homed = false;
      p.me.pos = p.me.prev = pt(w.pos.x, w.pos.y);
      p.send({ t: "act", action: { kind: "staff", wisp: flung!.id } });
      expect(p.x.teach.homed).toBe(true);
    });

    it("the wound shuts after a few tears and it jumps to safety, far from him, for a while; her blast stuns it for a few ticks, not a long hold", () => {
      const p = loose();
      p.send({ t: "fight", hit: true });
      for (let k = 0; k < OFFSPRING.hunt.tears && p.x.wound.open; k++) {
        // Stand at its back each time: the fling, not his place, decides where the light lands.
        const it = p.x.it;
        p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * 2.5), Math.round(it.y - Math.sin(it.face) * 2.5));
        p.send({ t: "fight", hit: true });
        p.tick(OFFSPRING.wound.pull + 1);
      }
      expect(p.x.wound.open).toBe(false);
      // Its jump: away from him, seen all the way, a trail left until it is back.
      const H = OFFSPRING.hunt, f = p.room.storyView().fight!;
      expect(p.room.stats.bolts).toBe(1);
      expect(f.bolt).toBeDefined();
      const me = p.me.pos, to = f.bolt!.to;
      expect(Math.hypot(to.x - me.x, to.y - me.y)).toBeGreaterThanOrEqual(H.boltMin - 2);
      p.tick(H.boltTicks + 1);
      expect(Math.hypot(p.x.it.x - to.x, p.x.it.y - to.y)).toBeLessThan(0.01);
      const at = { x: p.x.it.x, y: p.x.it.y };
      p.tick(H.away - 4);
      expect(Math.hypot(p.x.it.x - at.x, p.x.it.y - at.y)).toBeLessThan(0.01);
      expect(p.room.storyView().fight!.bolt).toBeDefined();
      p.tick(8);
      expect(p.room.storyView().fight!.bolt).toBeUndefined();
      const q = play(4);
      expect(q.x.her.doing).toBe("hold");
      expect(q.x.her.left).toBeLessThanOrEqual(OFFSPRING.hunt.stun);
    });

    it("its eye: it faces him with the shard out, takes its ticks to turn, and catches him only if he is still in its cone", () => {
      const E = OFFSPRING.eye;
      for (const dodge of [false, true]) {
        const p = loose(2);
        p.send({ t: "fight", hit: true });
        // Wound shut by hand: it turns on the lit shard.
        p.x.wound.open = false;
        let seen = 0;
        for (let i = 0; i < 30 && !p.room.storyView().fight!.eye; i++) {
          // Keep him in front of it and near, shard lit.
          const it = p.x.it;
          p.me.pos = p.me.prev = pt(Math.round(it.x + Math.cos(it.face) * 2.5), Math.round(it.y + Math.sin(it.face) * 2.5));
          p.tick();
        }
        const f = p.room.storyView().fight!;
        expect(f.eye).toMatchObject({ of: E.ticks, cone: E.cone });
        expect(p.room.storyView().opt!.cone).toBeDefined();
        seen = f.eye!.left;
        expect(seen).toBeGreaterThan(0);
        const before = p.room.state.catches;
        if (dodge) {
          // Out round its back.
          const it = p.x.it;
          p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * 3), Math.round(it.y - Math.sin(it.face) * 3));
        }
        for (let i = 0; i < E.ticks + 1; i++) p.tick();
        expect(p.room.state.catches > before).toBe(!dodge);
      }
    });

    it("its gaze holds after the eye turns, sweeping after him: stepping back into it is a catch", () => {
      const E = OFFSPRING.eye;
      const p = loose(2);
      p.send({ t: "fight", hit: true });
      p.x.wound.open = false;
      for (let i = 0; i < 30 && !p.room.storyView().fight!.eye; i++) {
        const it = p.x.it;
        p.me.pos = p.me.prev = pt(Math.round(it.x + Math.cos(it.face) * 2.5), Math.round(it.y + Math.sin(it.face) * 2.5));
        p.tick();
      }
      // Round its back while the eye turns: no catch when it has turned.
      const it = p.x.it, back = () => (p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * 3), Math.round(it.y - Math.sin(it.face) * 3)));
      back();
      const before = p.room.state.catches;
      for (let i = 0; i < E.ticks; i++) p.tick();
      expect(p.room.state.catches).toBe(before);
      expect(p.room.storyView().fight!.eye).toMatchObject({ left: 0, hold: E.hold });
      expect(p.room.storyView().opt!.cone!.k).toBe(1);
      // Into its front with the gaze still on: caught.
      p.me.pos = p.me.prev = pt(Math.round(it.x + Math.cos(it.face) * 3), Math.round(it.y + Math.sin(it.face) * 3));
      p.tick();
      expect(p.room.state.catches).toBe(before + 1);
    });

    it("the gaze catches him only with the cone he was shown, and only once", () => {
      const E = OFFSPRING.eye;
      const p = loose(2);
      p.send({ t: "fight", hit: true });
      p.x.wound.open = false;
      for (let i = 0; i < 30 && !p.room.storyView().fight!.eye; i++) {
        const it = p.x.it;
        p.me.pos = p.me.prev = pt(Math.round(it.x + Math.cos(it.face) * 2.5), Math.round(it.y + Math.sin(it.face) * 2.5));
        p.tick();
      }
      const it = p.x.it, before = p.room.state.catches;
      // Just outside the shown cone's edge, where one sweep would reach him: not caught on that tick.
      const at = (deg: number) => {
        const a = it.face + (deg * Math.PI) / 180;
        p.me.pos = p.me.prev = pt(Math.round(it.x + Math.cos(a) * 4), Math.round(it.y + Math.sin(a) * 4));
        let off = Math.atan2(p.me.pos.y - it.y, p.me.pos.x - it.x) - it.face;
        while (off > Math.PI) off -= 2 * Math.PI;
        while (off < -Math.PI) off += 2 * Math.PI;
        return Math.abs(off) * 180 / Math.PI;
      };
      for (let i = 0; i < E.ticks; i++) {
        // Keep him a little outside the cone as it is drawn now, each tick.
        let deg = E.cone + 6;
        while (at(deg) <= E.cone + 1) deg += 2;
        p.tick();
        expect(p.room.state.catches).toBe(before);
      }
      // Into the middle of its gaze: caught once, and the look ends.
      for (let i = 0; i < E.hold; i++) {
        at(0);
        p.tick();
      }
      expect(p.room.state.catches).toBe(before + 1);
      expect(p.room.storyView().fight!.eye).toBeUndefined();
    });

    it("in the dark nothing of it shows unless a light has it; its eye shows at any distance", () => {
      OFFSPRING.dark.on = 1;
      const D = OFFSPRING.dark, half = OFFSPRING.it.size / 2;
      const p = loose(2);
      // Right behind it: Rook's own ring has it.
      expect(p.room.storyView().fight!.it.hidden).toBeUndefined();
      expect(p.room.storyView().fight!.it.strike).toBe(2);
      // Far off in the dark, shard covered: nothing of it, no line to what it is after, no place to tap.
      const it = p.x.it, c = p.c;
      it.x = c.x - 9;
      it.y = c.y + 6;
      p.me.pos = p.me.prev = pt(c.x + 8, c.y - 6);
      const f = p.room.storyView().fight!;
      expect(f.it.hidden).toBe(true);
      expect(f.it.to).toBeUndefined();
      expect(f.it.strike).toBeUndefined();
      expect(p.room.storyView().opt!.hit).toBeUndefined();
      // Rook's pool first, at his light's reach from its body edge; and where it is to be heard from.
      expect(f.dark!.pools[0]).toMatchObject({ k: "rook", r: D.rook + half });
      expect(f.dark!.hear.d).toBeCloseTo(Math.hypot(17, 12) - half, 5);
      expect(f.dark!.flood).toBeUndefined();
      // Its eye turning: the eye and cone show, its body still doesn't.
      (p.room as unknown as { eye: number }).eye = 2;
      expect(p.room.seen()).toBe(true);
      expect(p.room.seen(false)).toBe(false);
      expect(p.room.storyView().fight!.eye).toBeDefined();
      expect(p.room.storyView().fight!.it.hidden).toBe(true);
      // Her hold fills the yard.
      (p.room as unknown as { eye: number }).eye = 0;
      p.x.it.held = true;
      expect(p.room.storyView().fight!.it.hidden).toBeUndefined();
      expect(p.room.storyView().fight!.dark!.flood).toBe(true);
    });

    it("away after its jump it is untouchable, and her charge waits until it is back", () => {
      const H = OFFSPRING.hunt;
      const p = loose();
      p.send({ t: "fight", hit: true });
      for (let k = 0; k < H.tears && p.x.wound.open; k++) {
        const it = p.x.it;
        p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * 2.5), Math.round(it.y - Math.sin(it.face) * 2.5));
        p.send({ t: "fight", hit: true });
        p.tick(OFFSPRING.wound.pull + 1);
      }
      expect(p.room.stats.bolts).toBe(1);
      p.tick(H.boltTicks + 1);
      const f = p.room.storyView().fight!;
      expect(f.safe).toBeDefined();
      // Right behind it, a tap does nothing but show it turned aside.
      const it = p.x.it;
      p.me.pos = p.me.prev = pt(Math.round(it.x - Math.cos(it.face) * 2.5), Math.round(it.y - Math.sin(it.face) * 2.5));
      expect(p.room.storyView().fight!.it.strike).toBeUndefined();
      p.send({ t: "fight", hit: true });
      expect(p.x.wound.open).toBe(false);
      expect(p.room.storyView().fight!.safe!.ward).toBeDefined();
      // Her light stands still, and her ring says she waits.
      const light = p.x.her.light;
      p.tick(3);
      expect(p.x.her.light).toBe(light);
      expect(p.room.storyView().opt!.feet![0]!.paused).toBeGreaterThan(0);
      // Back: her light moves again (it rises, or drains while it is after her).
      p.tick(H.away);
      expect(p.room.storyView().fight!.safe).toBeUndefined();
      p.tick(2);
      expect(p.x.her.light).not.toBe(light);
    });

    it("with hunt.block on, the fire is shut while it stands at the brazier", () => {
      OFFSPRING.hunt.block = 1;
      const p = loose();
      const c = p.c;
      p.x.it.x = c.x + 1;
      p.x.it.y = c.y;
      expect(p.room.storyView().fight!.shut).toBe(true);
      p.x.it.x = c.x + 8;
      expect(p.room.storyView().fight!.shut).toBeUndefined();
    });
  });
});
