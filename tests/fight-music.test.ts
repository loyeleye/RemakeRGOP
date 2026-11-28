import { describe, expect, it, vi } from "vitest";

// A pretend audio clock: records what starts, stops and changes gain, and when.
const log: string[] = [];
let now = 0;
class FakeParam {
  value = 1;
  constructor(private name: () => string) {}
  cancelScheduledValues(t: number) {
    log.push(`${this.name()} cancel @${t.toFixed(2)}`);
  }
  setValueAtTime(v: number, t: number) {
    log.push(`${this.name()} set ${v} @${t.toFixed(2)}`);
  }
  setTargetAtTime() {}
  linearRampToValueAtTime(v: number, t: number) {
    log.push(`${this.name()} ramp ${v} @${t.toFixed(2)}`);
  }
}
class FakeNode {
  connect(n: FakeNode) {
    return n;
  }
  disconnect() {}
}
const ctx = {
  get currentTime() {
    return now;
  },
  createGain() {
    const g = new FakeNode() as FakeNode & { gain: FakeParam; who: string };
    g.who = "bus";
    g.gain = new FakeParam(() => g.who);
    return g;
  },
  createBufferSource() {
    const s = new FakeNode() as FakeNode & { buffer: { n: string } | null; loop: boolean; playbackRate: FakeParam; start: (at: number, o?: number, len?: number) => void; stop: (at?: number) => void };
    s.buffer = null;
    s.playbackRate = new FakeParam(() => `rate ${s.buffer!.n}`);
    s.loop = false;
    s.start = (at, _o, len) => log.push(`start ${s.buffer!.n}${s.loop ? " loop" : ""}${len ? ` ${len.toFixed(1)}s` : ""} @${at.toFixed(2)}`);
    s.stop = (at?: number) => log.push(`stop ${s.buffer!.n}${at !== undefined ? ` @${at.toFixed(2)}` : ""}`);
    const connect = s.connect.bind(s);
    s.connect = (n: FakeNode) => (((n as unknown as { who: string }).who = s.buffer!.n), connect(n));
    return s;
  },
  decodeAudioData: (b: ArrayBuffer) => Promise.resolve({ n: new TextDecoder().decode(b) }),
};
vi.mock("../src/client/sound.js", () => ({ SOUND: { musicGain: 0.45 }, audioOut: () => ({ c: ctx, o: new FakeNode() }) }));

const { fightMusic } = await import("../src/client/fight-music.js");
const stems = ["p2-run3-knock", "p2-run3-heart", "p2-run3-breath", "p2-run3-tone", "p2-flare-chord", "p2-flare-note", "p2-flare-far-knocks", "p2-run4-her", "p2-run4-him", "p2-run4-locked"];
globalThis.fetch = (() => Promise.resolve({ ok: true, json: () => Promise.resolve(Object.fromEntries(stems.map((n) => [n, btoa(n)]))) })) as unknown as typeof fetch;

type F = Parameters<typeof fightMusic>[0] & object;
let t = 0;
const view = (run: 3 | 4, part: F["part"], inside: number, wound = 0, shown = false) => ({ run, part, tick: t, it: { inside, wound }, shard: { shown } }) as unknown as F;
/** One tick: the view arrives, then 0.6 s pass on the audio clock (times `slow`). */
const tick = async (f: F | undefined, playing = true, slow = 1) => {
  fightMusic(f, playing);
  await new Promise((r) => setTimeout(r, 0));
  now += 0.6 * slow;
  t++;
};
const starts = () => log.filter((l) => l.startsWith("start"));

describe("Runs 3 and 4's music", () => {
  it("knocks from the start, brings the bed in after the first bank, thins as it eats, flares, locks on strikes and stops dead at the end", async () => {
    await tick(view(3, "open", 0)); // the pack loads
    await tick(view(3, "open", 0));
    const t0 = 0.6 + 0.05;
    expect(starts()).toEqual([`start p2-run3-knock loop @${t0.toFixed(2)}`]);
    log.length = 0;
    await tick(view(3, "open", 0));
    await tick(view(3, "play", 0));
    // Bank on music time 1.2: the bed comes in on the next bar line, 2.4.
    expect(starts()).toEqual(["p2-run3-heart", "p2-run3-breath", "p2-run3-tone"].map((n) => `start ${n} loop @${(t0 + 2.4).toFixed(2)}`));
    log.length = 0;
    await tick(view(3, "play", 4));
    // It has eaten four before that bar line: the tone goes on it too.
    expect(log).toEqual([`p2-run3-tone set 1 @${(t0 + 2.4).toFixed(2)}`, `p2-run3-tone ramp 0 @${(t0 + 2.415).toFixed(2)}`]);
    log.length = 0;
    await tick(view(3, "play", 10));
    await tick(view(3, "flare", 10));
    expect(starts().map((l) => l.split(" @")[0])).toEqual(["start p2-flare-chord", "start p2-flare-far-knocks loop", "start p2-flare-note loop"]);
    // Held for 10 ticks at most.
    const noteAt = Number(starts()[2]!.split("@")[1]);
    expect(log).toContain(`stop p2-flare-note @${(noteAt + 6).toFixed(2)}`);
    log.length = 0;
    await tick(view(4, "play", 10));
    expect(starts().map((l) => l.split(" @")[0])).toEqual(["start p2-run4-her loop", "start p2-run4-him loop"]);
    await tick(view(4, "play", 10, 0, true));
    expect(log).toContain("stop p2-flare-note");
    log.length = 0;
    // The first strike locks for a bar; the third for 4, unless the wound closes first.
    await tick(view(4, "play", 10, 1));
    for (let k = 0; k < 12; k++) await tick(view(4, "play", 10, 0));
    await tick(view(4, "play", 10, 1));
    for (let k = 0; k < 12; k++) await tick(view(4, "play", 10, 1));
    for (let k = 0; k < 12; k++) await tick(view(4, "play", 10, 0));
    await tick(view(4, "play", 10, 1));
    await tick(view(4, "play", 10, 1));
    const closed = now;
    await tick(view(4, "play", 10, 0));
    for (let k = 0; k < 12; k++) await tick(view(4, "play", 10, 0));
    expect(starts().filter((l) => l.includes("locked")).map((l) => l.split(" ")[2])).toEqual(["2.4s", "4.8s", "9.6s"]);
    const early = log.filter((l) => /^stop p2-run4-locked @/.test(l));
    expect(early.length).toBe(1);
    expect(Number(early[0]!.split("@")[1]) - closed).toBeLessThan(2.4 + 0.6 + 0.01);
    log.length = 0;
    await tick(view(4, "kill", 0), false);
    expect(log.filter((l) => l.startsWith("stop")).length).toBeGreaterThanOrEqual(7);
    expect(log.filter((l) => l.startsWith("stop") && l.includes("@"))).toEqual([]);
  });

  it("nudges its speed when the audio clock runs slow, and stays within reach of the ticks", async () => {
    log.length = 0;
    // Run 4 again, on an audio clock 0.4% slow.
    for (let k = 0; k < 300; k++) await tick(view(4, "play", 10), true, 0.996);
    const rates = log.filter((l) => l.startsWith("rate p2-run4-her set")).map((l) => Number(l.split(" ")[3]));
    expect(rates.length).toBeGreaterThan(0);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.01);
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(1);
    expect(rates.some((r) => r > 1)).toBe(true);
  });
});
