// Runs 3 and 4's music (the gameplay thread's stems, gameplay/audio/part2/, 27 Nov): loops started
// together on a tick and switched by gain at bar lines, as the fight goes. All the stems come in one
// file (music/p2-fight.pack.json, base64 .wav by name) so the preview page stays under its file
// count. Every loop is a whole number of ticks long, so `loop` keeps it on the grid. The numbers in
// FIGHT_MUSIC are the gameplay thread's drafts.
//
// The game ticks on the page's timer and the music on the audio clock, and the two can run at
// slightly different speeds (in a headless Chromium here the audio clock ran 0.4% slow: 0.74 s
// behind after 300 ticks). So the player keeps its own music time, compares each tick's arrival
// with where the grid says it should be, and when they part by more than `drift.start` it nudges
// every source's speed, by at most `drift.most`, until they are back within `drift.stop`.

import type { StoryView } from "../engine/protocol.js";
import { SOUND, audioOut } from "./sound.js";

type Fight = NonNullable<StoryView["fight"]>;

export const FIGHT_MUSIC = {
  /** One tick, and one bar (4 ticks), in seconds. */
  tick: 0.6,
  bar: 2.4,
  /** How long a layer takes to come in or go out (s). */
  ramp: 0.015,
  /** Run 3: each layer plays until it has eaten this many (the knock always, from the start of the fight). */
  run3: { breath: 9, heart: 7, tone: 4 },
  /** The flare's held note starts this many ticks after the chord, and holds until he first shows the shard in run 4, or this many ticks. */
  noteAfter: 2,
  noteHold: 10,
  /** Run 4: bars of the locked line for the first strike, the second, and the third on (it ends sooner, at a bar line, if the wound closes). */
  locks: [1, 2, 4],
  /** Keeping in step with the ticks: how many ticks a reading looks back over, the error (s) that starts a nudge and the one that ends it, the largest change of speed, and how many seconds a nudge aims to take back the error in. */
  drift: { window: 10, start: 0.04, stop: 0.01, most: 0.01, over: 4 },
  /** The dark: the knock panned by how far east or west of him it is (full `pan` at `panAt` tiles), eased in over `ease` s. Its gain is `nearness`. */
  hearing: { pan: 0.8, panAt: 8, ease: 0.15, near: 3, farAt: 15, far: 0.2 },
  /** The music's level under its eye and gaze (0.63 is about 4 dB down). */
  duck: 0.63,
};

/** The gameplay thread's distance curve for hearing it (and for Rook's light shuddering, with the sound off too): 1 within `near` tiles, falling to `far` at `farAt` or more. */
export function nearness(d: number) {
  const H = FIGHT_MUSIC.hearing;
  return d <= H.near ? 1 : d >= H.farAt ? H.far : 1 - ((1 - H.far) * (d - H.near)) / (H.farAt - H.near);
}

const STEMS = ["p2-run3-knock", "p2-run3-heart", "p2-run3-breath", "p2-run3-tone", "p2-flare-chord", "p2-flare-note", "p2-flare-far-knocks", "p2-run4-her", "p2-run4-him", "p2-run4-locked"] as const;
type Stem = (typeof STEMS)[number];
const BED = ["p2-run3-heart", "p2-run3-breath", "p2-run3-tone"] as const;
const LINES = ["p2-run4-her", "p2-run4-him"] as const;

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

/** One fight's music, from its first knock to the silence. Times called `m` are music time (seconds from bar 1). */
class Score {
  layers = new Map<Stem, Layer>();
  /** One-shots left to play out, still stopped dead with the rest. */
  spent: AudioBufferSourceNode[] = [];
  /** The audio clock against music time: from audio time `a` (music time `m`) the music runs at `r`. */
  seg: { a: number; m: number; r: number };
  /** The fight's tick at bar 1; how late the last few ticks arrived on the grid, the least of the first few (the fixed delay), and how far off it is now. */
  tick0: number;
  lates: number[] = [];
  base: number | null = null;
  err = 0;
  bed = false;
  /** The dark: the knock is its sound, louder the nearer it is and panned to where it is. */
  near: { g: GainNode; pan: StereoPannerNode | null } | null = null;
  flared = false;
  run4 = false;
  shown = false;
  strikes = 0;
  wound = false;
  /** The locked line now playing or due: when it ends, and whether her and his lines are already on their way back. */
  lock: { end: number; back: boolean } | null = null;
  bus: GainNode;
  constructor(
    private c: AudioContext,
    out: GainNode,
    private b: Partial<Record<Stem, AudioBuffer>>,
    tick: number,
  ) {
    this.seg = { a: c.currentTime + 0.05, m: 0, r: 1 };
    this.tick0 = tick;
    this.bus = c.createGain();
    this.bus.gain.value = SOUND.musicGain;
    this.bus.connect(out);
  }
  now() {
    return this.pos(this.c.currentTime);
  }
  pos(a: number) {
    return this.seg.m + (a - this.seg.a) * this.seg.r;
  }
  /** The audio time of music time m (at today's speed). */
  at(m: number) {
    return this.seg.a + (m - this.seg.m) / this.seg.r;
  }
  /** The next bar line, and the next tick, from now (music time). */
  nextBar() {
    const B = FIGHT_MUSIC.bar;
    return Math.max(0, Math.ceil((this.now() + 0.02) / B)) * B;
  }
  nextTick() {
    const T = FIGHT_MUSIC.tick;
    return Math.max(0, Math.ceil((this.now() + 0.02) / T)) * T;
  }
  /** Start a stem at music time m, looping or once (for `len` seconds of it when given), heard or silent. */
  play(n: Stem, m: number, loop: boolean, on = true, len?: number) {
    const buf = this.b[n];
    if (!buf) return;
    // A one-shot still sounding (a lock a new one waits on) plays out; anything else stops.
    const old = this.layers.get(n);
    if (len !== undefined && old && !old.src.loop) (this.spent.push(old.src), this.layers.delete(n));
    this.cut(n);
    const src = this.c.createBufferSource(), g = this.c.createGain();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = this.seg.r;
    g.gain.value = on ? 1 : 0;
    if (n === "p2-run3-knock") {
      // The knock goes through its own gain and pan (the dark: where it is).
      if (!this.near) {
        const ng = this.c.createGain(), pan = typeof this.c.createStereoPanner === "function" ? this.c.createStereoPanner() : null;
        if (pan) ng.connect(pan).connect(this.bus);
        else ng.connect(this.bus);
        this.near = { g: ng, pan };
      }
      src.connect(g).connect(this.near.g);
    } else src.connect(g).connect(this.bus);
    const a = Math.max(this.c.currentTime, this.at(m));
    if (len !== undefined) src.start(a, 0, len);
    else src.start(a);
    this.layers.set(n, { src, g, on });
  }
  /** Bring a layer in or out at music time m, with the short ramp. */
  set(n: Stem, on: boolean, m: number) {
    const l = this.layers.get(n);
    if (!l || l.on === on) return;
    l.on = on;
    const a = this.at(m);
    l.g.gain.setValueAtTime(on ? 0 : 1, a);
    l.g.gain.linearRampToValueAtTime(on ? 1 : 0, a + FIGHT_MUSIC.ramp);
  }
  /** Stop a stem dead (at music time m, or now). */
  cut(n: Stem, m?: number) {
    const l = this.layers.get(n);
    if (!l) return;
    if (m !== undefined) {
      try {
        l.src.stop(this.at(m));
      } catch {
        /* already stopping */
      }
      return;
    }
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
    for (const src of this.spent)
      try {
        src.stop();
      } catch {
        /* done */
      }
    this.bus.disconnect();
  }
  /** Change every source's speed from now. */
  rate(r: number) {
    if (r === this.seg.r) return;
    const a = this.c.currentTime;
    this.seg = { a, m: this.pos(a), r };
    for (const l of this.layers.values()) l.src.playbackRate.setValueAtTime(r, a);
  }
  /**
   * This tick arrived now: how far is the music from where the grid says, and nudge its speed if too
   * far. A tick can arrive late (the page busy drawing) but never early, so the reading is the least
   * lateness over the last `window` ticks, against the least over the first `window`.
   */
  keepStep(tick: number) {
    const D = FIGHT_MUSIC.drift, late = this.now() - (tick - this.tick0) * FIGHT_MUSIC.tick;
    this.lates.push(late);
    if (this.lates.length > D.window) this.lates.shift();
    const least = Math.min(...this.lates);
    if (this.base === null) {
      if (this.lates.length === D.window) this.base = least;
      return;
    }
    const e = (this.err = least - this.base), nudging = this.seg.r !== 1;
    if (Math.abs(e) > D.start || (nudging && Math.abs(e) > D.stop)) this.rate(1 - Math.max(-D.most, Math.min(D.most, e / D.over)));
    else if (nudging) this.rate(1);
  }

  /** The dark: the knock's gain by its distance, and its pan by where it is beside him (the screen is north up), eased over a tick. */
  hear(f: Fight) {
    if (!this.near) return;
    const h = f.dark?.hear, a = this.c.currentTime, M = FIGHT_MUSIC.hearing;
    const g = h ? nearness(h.d) : 1, p = h ? Math.max(-1, Math.min(1, h.dx / M.panAt)) * M.pan : 0;
    this.near.g.gain.setTargetAtTime(g, a, M.ease);
    this.near.pan?.pan.setTargetAtTime(p, a, M.ease);
  }

  step(f: Fight) {
    const M = FIGHT_MUSIC;
    this.keepStep(f.tick);
    this.hear(f);
    if (f.run === 3) {
      if (!this.layers.has("p2-run3-knock")) this.play("p2-run3-knock", 0, true);
      // From the first bank (the fight past its opening pull): the rest of the bed, at the next bar line.
      if (!this.bed && f.part !== "open") {
        this.bed = true;
        const m = this.nextBar();
        for (const n of BED) this.play(n, m, true);
      }
      if (this.bed && f.part !== "flare") {
        const eaten = f.it.inside, m = this.nextBar();
        this.set("p2-run3-breath", eaten < M.run3.breath, m);
        this.set("p2-run3-heart", eaten < M.run3.heart, m);
        this.set("p2-run3-tone", eaten < M.run3.tone, m);
      }
    }
    if (f.part === "flare" && !this.flared) {
      // Her flare: the chord once, the far knocks from now on, and the held note after the chord.
      this.flared = true;
      const m = this.nextTick(), note = m + M.noteAfter * M.tick;
      for (const n of BED) this.set(n, false, m);
      this.play("p2-flare-chord", m, false);
      this.play("p2-flare-far-knocks", m, true);
      this.play("p2-flare-note", note, true);
      this.cut("p2-flare-note", note + M.noteHold * M.tick);
    }
    if (f.run === 4 && f.part !== "flare") {
      if (!this.run4) {
        this.run4 = true;
        // Run 4 begun on its own (again): its knocks with it, from bar 1. After the flare: the two lines at the next bar line.
        if (!this.layers.has("p2-run3-knock")) this.play("p2-run3-knock", 0, true);
        if (!this.layers.has("p2-flare-far-knocks")) this.play("p2-flare-far-knocks", 0, true);
        const m = this.flared ? this.nextBar() : 0;
        for (const n of LINES) this.play(n, m, true);
        this.wound = f.it.wound > 0;
      }
      // He shows the shard: it's his, and the held note stops dead.
      if (f.shard?.shown && !this.shown) (this.shown = true), this.cut("p2-flare-note");
      this.stepLocks(f.it.wound > 0);
    }
  }

  /** A strike locks her line and his together at the next bar line, longer each time; they part again after it, or at the first bar line after the wound closes. */
  stepLocks(open: boolean) {
    const M = FIGHT_MUSIC;
    if (open && !this.wound) {
      const bars = M.locks[Math.min(this.strikes, M.locks.length - 1)]!, len = bars * M.bar;
      this.strikes++;
      // A strike while the last lock is still sounding waits for it, and keeps the lines away.
      let m = this.nextBar();
      if (this.lock && this.lock.end > this.now()) {
        m = Math.max(m, this.lock.end);
        if (this.lock.back) for (const n of LINES) this.hold(n);
      } else for (const n of LINES) this.set(n, false, m);
      this.play("p2-run4-locked", m, false, true, len);
      this.lock = { end: m + len, back: false };
    }
    if (!open && this.wound && this.lock && !this.lock.back) {
      const m = this.nextBar();
      if (m < this.lock.end - 0.01) {
        this.lock.end = m;
        this.cut("p2-run4-locked", m);
      }
    }
    this.wound = open;
    // The lock's last bar line is next: the two lines come back on it.
    if (this.lock && !this.lock.back && this.lock.end <= this.nextBar() + 0.01) {
      this.lock.back = true;
      for (const n of LINES) this.set(n, true, this.lock.end);
    }
  }
  /** Undo a line's scheduled return: it stays off. */
  hold(n: Stem) {
    const l = this.layers.get(n);
    if (!l) return;
    const a = this.c.currentTime;
    l.g.gain.cancelScheduledValues(a);
    l.g.gain.setValueAtTime(0, a);
    l.on = false;
  }
}

let score: Score | null = null;

/** Its eye turning and its gaze: the music ducks (`duck` of its level) so they cut through (the gameplay thread's guess, about 4 dB). */
let ducked = false;
export function duckFightMusic(on: boolean) {
  if (!score || on === ducked) return;
  ducked = on;
  score.bus.gain.setTargetAtTime(SOUND.musicGain * (on ? FIGHT_MUSIC.duck : 1), score.bus.context.currentTime, 0.08);
}

/** The fight tick the knock's bar 1 fell on (it knocks every 2 ticks from there), while the music plays; null without it. */
export function knockClock() {
  return score ? score.tick0 : null;
}

/**
 * Each tick of a story room: the fight's music, while a fight is being played. Anything else (the
 * countdown, the results, another board) is silence, so the kill's last press stops it dead.
 */
export function fightMusic(f: Fight | undefined, playing: boolean) {
  const o = audioOut();
  if (o && f) load(o.c);
  if (!f || !playing || !o) {
    if (score) (score.silence(), (score = null), (ducked = false));
    return;
  }
  if (!buffers) return;
  score ??= new Score(o.c, o.o, buffers, f.tick);
  score.step(f);
}
