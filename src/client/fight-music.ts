// Runs 3 and 4's music (the gameplay thread's stems, gameplay/audio/part2/, 27 Nov): loops started
// together on a tick and switched by gain at bar lines, as the fight goes. All the stems come in one
// file (music/p2-fight.pack.json, base64 .wav by name) so the preview page stays under its file
// count. Every loop is a whole number of ticks long, so `loop` keeps it on the grid. The numbers in
// FIGHT_MUSIC are the gameplay thread's drafts.

import type { StoryView } from "../engine/protocol.js";
import { SOUND, audioOut } from "./sound.js";

type Fight = NonNullable<StoryView["fight"]>;

export const FIGHT_MUSIC = {
  /** One tick, and one bar (4 ticks), in seconds. */
  tick: 0.6,
  bar: 2.4,
  /** How long a layer takes to come in or go out (s). */
  ramp: 0.015,
  /** Run 3: each layer plays until it has eaten this many (the knock always). */
  run3: { breath: 9, heart: 7, tone: 4 },
  /** The flare's held note starts this many ticks after the chord. */
  noteAfter: 2,
  /** Run 4: bars of the locked line for the first strike, the second, and the third on. */
  locks: [1, 2, 4],
};

const STEMS = ["p2-run3-knock", "p2-run3-heart", "p2-run3-breath", "p2-run3-tone", "p2-flare-chord", "p2-flare-note", "p2-flare-far-knocks", "p2-run4-her", "p2-run4-him", "p2-run4-locked"] as const;
type Stem = (typeof STEMS)[number];

let buffers: Partial<Record<Stem, AudioBuffer>> | null = null;
let asked = false;
function load(c: AudioContext) {
  if (asked) return;
  asked = true;
  fetch("music/p2-fight.pack.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))))
    .then((b64s) =>
      Promise.all(
        STEMS.filter((n) => b64s[n]).map((n) =>
          c.decodeAudioData(Uint8Array.from(atob(b64s[n]!), (ch) => ch.charCodeAt(0)).buffer).then((b) => [n, b] as const),
        ),
      ),
    )
    .then((es) => (buffers = Object.fromEntries(es)))
    .catch(() => {
      /* missing: the fight plays without music */
    });
}

interface Layer {
  src: AudioBufferSourceNode;
  g: GainNode;
  on: boolean;
}

/** One fight's music, from its first loop to the silence. */
class Score {
  layers = new Map<Stem, Layer>();
  /** When bar 1 started (audio clock). */
  t0: number;
  run3 = false;
  flared = false;
  run4 = false;
  strikes = 0;
  wound = false;
  /** When the last locked line ends. */
  lockEnd = 0;
  bus: GainNode;
  constructor(
    private c: AudioContext,
    out: GainNode,
    private b: Partial<Record<Stem, AudioBuffer>>,
  ) {
    this.t0 = c.currentTime + 0.05;
    this.bus = c.createGain();
    this.bus.gain.value = SOUND.musicGain;
    this.bus.connect(out);
  }
  /** The next bar line from now. */
  nextBar() {
    const B = FIGHT_MUSIC.bar, k = Math.ceil((this.c.currentTime + 0.02 - this.t0) / B);
    return this.t0 + Math.max(0, k) * B;
  }
  /** The next tick from now, on the same grid. */
  nextTick() {
    const T = FIGHT_MUSIC.tick, k = Math.ceil((this.c.currentTime + 0.02 - this.t0) / T);
    return this.t0 + Math.max(0, k) * T;
  }
  /** Start a stem at `at`, looping or once (for `len` seconds when given), heard or silent. */
  play(n: Stem, at: number, loop: boolean, on = true, len?: number) {
    const buf = this.b[n];
    if (!buf) return;
    this.cut(n);
    const src = this.c.createBufferSource(), g = this.c.createGain();
    src.buffer = buf;
    src.loop = loop;
    g.gain.value = on ? 1 : 0;
    src.connect(g).connect(this.bus);
    if (len !== undefined) src.start(at, 0, len);
    else src.start(at);
    this.layers.set(n, { src, g, on });
  }
  /** Bring a looping layer in or out at `at`, with the short ramp. */
  set(n: Stem, on: boolean, at: number) {
    const l = this.layers.get(n);
    if (!l || l.on === on) return;
    l.on = on;
    l.g.gain.setValueAtTime(on ? 0 : 1, at);
    l.g.gain.linearRampToValueAtTime(on ? 1 : 0, at + FIGHT_MUSIC.ramp);
  }
  /** Stop a stem dead. */
  cut(n: Stem) {
    const l = this.layers.get(n);
    if (!l) return;
    try {
      l.src.stop();
    } catch {
      /* not started */
    }
    l.src.disconnect();
    l.g.disconnect();
    this.layers.delete(n);
  }
  silence() {
    for (const n of [...this.layers.keys()]) this.cut(n);
    this.bus.disconnect();
  }

  step(f: Fight) {
    const M = FIGHT_MUSIC;
    if (f.run === 3 && !this.run3 && f.part !== "open") {
      // From the first pull: the whole bed together.
      this.run3 = true;
      for (const n of ["p2-run3-knock", "p2-run3-heart", "p2-run3-breath", "p2-run3-tone"] as const) this.play(n, this.t0, true);
    }
    if (this.run3 && f.run === 3) {
      const eaten = f.it.inside, at = this.nextBar();
      this.set("p2-run3-breath", eaten < M.run3.breath, at);
      this.set("p2-run3-heart", eaten < M.run3.heart, at);
      this.set("p2-run3-tone", eaten < M.run3.tone, at);
    }
    if (f.part === "flare" && !this.flared) {
      // Her flare: the chord once, the held note after it, and the far knocks from now on.
      this.flared = true;
      const at = this.nextTick();
      if (!this.run3) this.play("p2-run3-knock", this.t0, true);
      for (const n of ["p2-run3-heart", "p2-run3-breath", "p2-run3-tone"] as const) this.set(n, false, at);
      this.play("p2-flare-chord", at, false);
      this.play("p2-flare-far-knocks", at, true);
      this.play("p2-flare-note", at + M.noteAfter * M.tick, true);
    }
    if (f.run === 4 && f.part !== "flare" && !this.run4) {
      this.run4 = true;
      // He has the shard: the held note stops dead. A run 4 begun on its own (again) starts its knocks now.
      this.cut("p2-flare-note");
      if (!this.layers.has("p2-run3-knock")) this.play("p2-run3-knock", this.t0, true);
      if (!this.layers.has("p2-flare-far-knocks")) this.play("p2-flare-far-knocks", this.t0, true);
      const at = this.layers.size > 2 || this.flared ? this.nextBar() : this.t0;
      this.play("p2-run4-her", at, true);
      this.play("p2-run4-him", at, true);
      this.wound = f.it.wound > 0;
    }
    if (this.run4) {
      const open = f.it.wound > 0;
      if (open && !this.wound) {
        // A strike: at the next bar line the two lines lock together, longer each time, then come back.
        const bars = M.locks[Math.min(this.strikes, M.locks.length - 1)]!, len = bars * M.bar;
        let at = this.nextBar();
        while (at < this.lockEnd - 0.01) at += M.bar;
        this.strikes++;
        this.set("p2-run4-her", false, at);
        this.set("p2-run4-him", false, at);
        this.play("p2-run4-locked", at, false, true, len);
        this.lockEnd = at + len;
        // Back on after it, scheduled now (the gain flags say off until then).
        const her = this.layers.get("p2-run4-her"), him = this.layers.get("p2-run4-him");
        for (const l of [her, him]) {
          if (!l) continue;
          l.g.gain.setValueAtTime(0, at + len);
          l.g.gain.linearRampToValueAtTime(1, at + len + M.ramp);
          l.on = true;
        }
      }
      this.wound = open;
    }
  }
}

let score: Score | null = null;

/**
 * Each tick of a story room: the fight's music, while a fight is being played. Anything else (the
 * countdown, the results, another board) is silence, so the kill's last press stops it dead.
 */
export function fightMusic(f: Fight | undefined, playing: boolean) {
  const o = audioOut();
  if (o && f) load(o.c);
  if (!f || !playing || !o) {
    if (score) (score.silence(), (score = null));
    return;
  }
  if (!buffers) return;
  // Run 3's opening pull is quiet: the grid starts with the music.
  if (!score && f.run === 3 && f.part === "open") return;
  score ??= new Score(o.c, o.o, buffers);
  score.step(f);
}
