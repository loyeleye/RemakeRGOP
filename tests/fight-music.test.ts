import { describe, expect, it, vi } from "vitest";

// A pretend audio clock: records what starts, stops and changes gain, and when.
const log: string[] = [];
let now = 0;
class FakeParam {
  value = 1;
  constructor(private name: () => string) {}
  setValueAtTime(v: number, t: number) {
    log.push(`${this.name()} set ${v} @${t.toFixed(2)}`);
  }
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
    const s = new FakeNode() as FakeNode & { buffer: { n: string } | null; loop: boolean; start: (at: number, o?: number, len?: number) => void; stop: () => void };
    s.buffer = null;
    s.loop = false;
    s.start = (at, _o, len) => log.push(`start ${s.buffer!.n}${s.loop ? " loop" : ""}${len ? ` ${len.toFixed(1)}s` : ""} @${at.toFixed(2)}`);
    s.stop = () => log.push(`stop ${s.buffer!.n}`);
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
const view = (run: 3 | 4, part: F["part"], inside: number, wound = 0) => ({ run, part, it: { inside, wound } }) as unknown as F;
const tick = async (f: F | undefined, playing = true) => {
  fightMusic(f, playing);
  await new Promise((r) => setTimeout(r, 0));
  now += 0.6;
};

describe("Runs 3 and 4's music", () => {
  it("starts on the first pull, thins as it eats, flares, locks on strikes and stops dead at the end", async () => {
    await tick(view(3, "open", 0));
    await tick(view(3, "open", 0));
    expect(log.filter((l) => l.startsWith("start"))).toEqual([]);
    await tick(view(3, "play", 0));
    const t0 = 1.2 + 0.05;
    expect(log.filter((l) => l.startsWith("start"))).toEqual(["p2-run3-knock", "p2-run3-heart", "p2-run3-breath", "p2-run3-tone"].map((n) => `start ${n} loop @${t0.toFixed(2)}`));
    log.length = 0;
    // Eats four: the tone goes at the next bar line; the knock stays.
    await tick(view(3, "play", 4));
    expect(log).toEqual([`p2-run3-tone set 1 @${(t0 + 2.4).toFixed(2)}`, `p2-run3-tone ramp 0 @${(t0 + 2.415).toFixed(2)}`]);
    log.length = 0;
    await tick(view(3, "play", 10));
    await tick(view(3, "flare", 10));
    expect(log.some((l) => l.startsWith("start p2-flare-chord @"))).toBe(true);
    expect(log.some((l) => l.startsWith("start p2-flare-far-knocks loop"))).toBe(true);
    expect(log.some((l) => l.startsWith("start p2-flare-note loop"))).toBe(true);
    log.length = 0;
    await tick(view(4, "play", 10));
    expect(log[0]).toBe("stop p2-flare-note");
    expect(log.filter((l) => l.startsWith("start"))).toEqual(expect.arrayContaining([expect.stringMatching(/^start p2-run4-her loop/), expect.stringMatching(/^start p2-run4-him loop/)]));
    log.length = 0;
    // Three strikes: locked for 1, 2 and 4 bars.
    for (let s = 0; s < 3; s++) {
      await tick(view(4, "play", 10, 1));
      for (let k = 0; k < 30; k++) await tick(view(4, "play", 10, 0));
    }
    expect(log.filter((l) => l.startsWith("start p2-run4-locked")).map((l) => l.split(" ")[2])).toEqual(["2.4s", "4.8s", "9.6s"]);
    log.length = 0;
    await tick(view(4, "kill", 0), false);
    expect(log.filter((l) => l.startsWith("stop")).sort()).toEqual(["p2-flare-far-knocks", "p2-run3-knock", "p2-run3-breath", "p2-run3-heart", "p2-run3-tone", "p2-run4-her", "p2-run4-him", "p2-run4-locked", "p2-flare-chord"].map((n) => `stop ${n}`).sort());
  });
});
