import { describe, expect, it } from "vitest";
import { pt } from "../src/engine/board.js";
import { Game } from "../src/engine/game.js";
import { JOB } from "../src/engine/job.js";
import { shrineById } from "../src/engine/maps.js";
import type { ServerMsg } from "../src/engine/protocol.js";
import { JobRoom, LUMI_ID } from "../src/server/job.js";

const manualClock = () => ({ every: () => () => {} });

/** Play the run with a Medium bot as Rook; `plan` sends Lumi. */
function play(seed: number, plan: (r: JobRoom, stop: number, tick: number) => void) {
  let s = seed;
  const msgs: ServerMsg[] = [];
  const r = new JobRoom(manualClock(), () => (s = (s * 48271) % 2147483647), true);
  r.connect((m) => msgs.push(m)).message(JSON.stringify({ t: "hello", name: "Rook" }));
  const stop1: number[] = [];
  for (let i = 0; i < 1500 && r.state.phase !== "results"; i++) {
    r.onTick();
    const st = r.state;
    if (st.phase === "playing") plan(r, st.stop, st.game.tick);
    if (st.stop === 0) stop1[0] = st.game.tick;
  }
  const said = msgs.flatMap((m) => (m.t === "say" ? m.lines : []));
  return { r, said, stop1: stop1[0]! };
}

const sendWell = (r: JobRoom, stop: number, t: number) => {
  const c = r.state.game.board.center;
  // Stop 1: once, to the thicket.
  if (stop === 0) {
    if (t === 1 && !r.state.sends) r.sendLumi(pt(c.x + 8, c.y));
    return;
  }
  // Stop 2: to each wave's pool, on its fire side, as soon as it shimmers.
  const to = r.state.nextPool ?? r.state.wavePool;
  if (to && sentFor.get(r) !== to) {
    sentFor.set(r, to);
    r.sendLumi(to.fire);
  }
};
const sentFor = new WeakMap<JobRoom, unknown>();

describe("Run 4: A job", () => {
  it("sent to the thicket and the fire side, she and a Medium Rook finish both stops", () => {
    let clean = 0;
    for (const seed of [3, 11, 29, 101, 7]) {
      const { r, said, stop1 } = play(seed, sendWell);
      console.log(`seed ${seed}: stop 1 done at ${stop1}/${JOB.stops[0].ticks}, stop 2 at ${r.state.game.tick}/${JOB.stops[1].ticks}, restarts ${r.state.restarts}, from water ${r.state.fromWater}`);
      expect(r.state.phase).toBe("results");
      if (r.state.restarts === 0) clean++;
      expect(r.state.fromWater).toBeGreaterThanOrEqual(JOB.stops[1].onWater);
      expect(said.some((l) => l.who === "Marit" && l.text === "Thank you, Lumi.")).toBe(true);
      expect(said.findIndex((l) => l.text === "She said my name.")).toBeGreaterThan(said.findIndex((l) => l.text === "Thank you, Lumi."));
    }
    expect(clean).toBeGreaterThanOrEqual(4);
  });

  it("a send walks her there, barks, and shows where she was sent", () => {
    const { r } = play(5, () => {});
    expect(r.state.restarts).toBeGreaterThan(0);
    let s = 9;
    const room = new JobRoom(manualClock(), () => (s = (s * 48271) % 2147483647));
    const msgs: ServerMsg[] = [];
    room.connect((m) => msgs.push(m)).message(JSON.stringify({ t: "hello", name: "Rook" }));
    for (let i = 0; i < JOB.bellTicks + 1; i++) room.onTick();
    const c = room.state.game.board.center;
    room.sendLumi(pt(c.x + 8, c.y));
    for (let i = 0; i < 25; i++) room.onTick();
    const lumi = room.state.game.players.find((p) => p.id === LUMI_ID)!;
    expect(lumi.pos).toEqual(room.state.sentTo);
    expect(msgs.flatMap((m) => (m.t === "say" ? m.lines : [])).some((l) => l.who === "Lumi" && JOB.lines.sent.includes(l.text as never))).toBe(true);
    expect(room.storyView().called).toEqual(room.state.sentTo);
  });
});

describe("Tidepool Steps' waves", () => {
  it("come one pool at a time, never on the same side twice running, and one send isn't enough", () => {
    let s = 21;
    const r = new JobRoom(manualClock(), () => (s = (s * 48271) % 2147483647), true);
    r.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    const sides: number[] = [];
    let sent = false;
    for (let i = 0; i < 2500 && r.state.restarts === 0; i++) {
      r.onTick();
      const st = r.state, c = st.game.board.center;
      if (st.phase !== "playing") continue;
      if (st.stop === 0) {
        if (st.game.tick === 1 && !st.sends) r.sendLumi(pt(c.x + 8, c.y));
        continue;
      }
      if (st.wavePool && sides.at(-1) !== st.wavePool.side + 10 * st.wave) sides.push(st.wavePool.side + 10 * st.wave);
      // Only the first wave's pool, once.
      if (!sent && st.wavePool) (sent = true), r.sendLumi(st.wavePool.fire);
      // The shimmer shows where the next comes up, before it does.
      if (st.nextPool) expect(r.storyView().shimmer).toEqual(st.nextPool.tiles);
    }
    expect(r.state.restarts).toBe(1);
    expect(r.state.stop).toBe(1);
    const bySide = sides.map((v) => v % 10);
    expect(bySide.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < bySide.length; i++) expect(bySide[i]).not.toBe(bySide[i - 1]);
  });

  it("Rook's pull slips on a wisp out on a big pool", () => {
    let s = 5;
    const r = new JobRoom(manualClock(), () => (s = (s * 48271) % 2147483647));
    r.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    (r as unknown as { startStop(n: number, again: boolean): void }).startStop(1, false);
    for (let i = 0; i < JOB.bellTicks + JOB.stops[1].waves.firstAt + 1; i++) r.onTick();
    const g = r.state.game;
    const w = g.wisps.find((q) => q.guild === 0 && !g.away.has(q.id))!;
    const rook = g.players.find((p) => p.id === 1)!;
    const bank = r.state.wavePool!.fire;
    rook.pos = rook.prev = bank;
    g.command(1, { action: { kind: "staff", wisp: w.id } });
    const at = w.pos;
    r.onTick();
    r.onTick();
    expect(rook.slipped).toBe(true);
    expect(w.pos).toEqual(at);
  });
});

describe("Lumi's tide pull with the clocked tide", () => {
  it("draws a pool's wisps faster with the tide than against it", () => {
    const moved = (startTick: number) => {
      const g = new Game(shrineById("tidepool-steps"), [{ id: 1, guild: 0, name: "Lumi" }], 1, [3, 0], 999);
      g.tidePuller = 1;
      g.tideStaysWet = true;
      const c = g.board.center;
      const lumi = g.players[0]!;
      lumi.pos = lumi.prev = pt(c.x - 8, c.y);
      // Three wisps out on the west pool's far side.
      const spots = [pt(c.x - 17, c.y - 2), pt(c.x - 17, c.y), pt(c.x - 17, c.y + 2)];
      g.wisps.forEach((w, i) => (w.pos = w.prev = spots[i]!));
      g.tick = startTick;
      let total = 0;
      for (let i = 0; i < 6; i++) {
        g.command(1, { action: { kind: "staff", wisp: 0 } });
        const before = g.wisps.slice(1).map((w) => w.pos.x);
        g.step();
        total += g.wisps.slice(1).reduce((a, w, k) => a + Math.abs(w.pos.x - before[k]!), 0);
      }
      return total;
    };
    const tide = shrineById("tidepool-steps").gimmicks.tide!;
    expect(moved(0)).toBeGreaterThan(moved(tide) * 2);
  });
});
