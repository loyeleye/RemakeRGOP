import { describe, expect, it, vi } from "vitest";

// A pretend audio context: records what plays and stops.
const log: string[] = [];
class FakeParam {
  value = 1;
  setValueAtTime() {}
  setTargetAtTime() {}
  linearRampToValueAtTime() {}
  cancelScheduledValues() {}
}
class FakeNode {
  context = ctx;
  gain = new FakeParam();
  pan = new FakeParam();
  connect(n: FakeNode) {
    return n;
  }
  disconnect() {}
}
const ctx = {
  currentTime: 0,
  createGain: () => new FakeNode(),
  createStereoPanner: () => new FakeNode(),
  createBufferSource() {
    const s = new FakeNode() as FakeNode & { buffer: { n: string } | null; loop: boolean; onended: null; start: () => void; stop: () => void };
    s.buffer = null;
    s.loop = false;
    s.onended = null;
    s.start = () => log.push(`play ${s.buffer!.n}${s.loop ? " loop" : ""}`);
    s.stop = () => log.push(`stop ${s.buffer!.n}`);
    return s;
  },
  decodeAudioData: (b: ArrayBuffer) => Promise.resolve({ n: new TextDecoder().decode(b).replace("p2-off-", "") }),
};
vi.mock("../src/client/sound.js", () => ({ SOUND: { musicGain: 0.45 }, audioOut: () => ({ c: ctx, o: new FakeNode() }) }));
const names = ["step", "limp", "wake", "alert", "eat", "drink", "eye-turn", "gaze", "catch", "loss", "strike", "hurt", "tear", "light-land", "bolt", "bolt-land", "ward", "stun", "held", "hop", "land", "knockdown", "kill"].map((n) => `p2-off-${n}`);
globalThis.fetch = (() => Promise.resolve({ ok: true, json: () => Promise.resolve(Object.fromEntries(names.map((n) => [n, btoa(n)]))) })) as unknown as typeof fetch;
const { offspringSfx } = await import("../src/client/offspring-sfx.js");

type F = Parameters<typeof offspringSfx>[0] & object;
let tick = 0;
const base = () => ({ run: 4, part: "play", tick, it: { x: 0, y: 0, face: 0, after: "her", inside: 5, held: false, wound: 0 }, her: { x: 5, y: 0, light: 3, full: 10, glow: 1, doing: "rest", left: 0, of: 0 }, fen: { x: 6, y: 0, light: 1 }, banked: 0, wisps: 10, asleep: [], cycle: 2, catches: 0, down: 0, pulling: 0 });
const go = async (patch: (f: ReturnType<typeof base>) => object = (f) => f) => {
  tick++;
  offspringSfx(patch(base()) as unknown as F, true);
  await new Promise((r) => setTimeout(r, 0));
};

describe("the offspring's sounds", () => {
  it("plays what it does as it does it, and the kill at the end", async () => {
    await go(); // the pack loads
    await go();
    log.length = 0;
    // It walks: a step every other tick.
    for (let k = 1; k <= 4; k++) await go((f) => ({ ...f, it: { ...f.it, x: k } }));
    expect(log.filter((l) => l === "play step").length).toBe(2);
    log.length = 0;
    // Its eye turns, then the gaze holds; it lets go early: the gaze is cut.
    await go((f) => ({ ...f, it: { ...f.it, x: 4 }, eye: { left: 3, of: 3, cone: 35, r: 6 } }));
    await go((f) => ({ ...f, it: { ...f.it, x: 4 }, eye: { left: 0, of: 3, cone: 35, r: 6, gaze: 5, hold: 5 } }));
    await go((f) => ({ ...f, it: { ...f.it, x: 4 } }));
    expect(log).toEqual(["play eye-turn", "play gaze", "stop gaze"]);
    log.length = 0;
    // Struck: the hit and its cry. A tear. Then its jump, and the far landing.
    await go((f) => ({ ...f, it: { ...f.it, x: 4, wound: 1, crawl: true } }));
    await go((f) => ({ ...f, it: { ...f.it, x: 4, wound: 1, inside: 4, crawl: true } }));
    const t0 = tick + 1;
    await go((f) => ({ ...f, it: { ...f.it, x: 4, inside: 4 }, bolt: { from: { x: 4, y: 0 }, to: { x: 14, y: 0 }, t0, ticks: 3, away: 12 } }));
    for (let k = 0; k < 3; k++) await go((f) => ({ ...f, it: { ...f.it, x: 14, inside: 4, leap: { from: { x: 4, y: 0 }, to: { x: 14, y: 0 }, t0, ticks: 3 } }, bolt: { from: { x: 4, y: 0 }, to: { x: 14, y: 0 }, t0, ticks: 3, away: 12 } }));
    expect(log).toEqual(["play strike", "play hurt", "play tear", "play bolt", "play bolt-land"]);
    log.length = 0;
    offspringSfx(undefined, false, { won: true, caught: false });
    expect(log).toEqual(["play kill"]);
  });
});
