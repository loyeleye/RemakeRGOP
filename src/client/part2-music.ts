// Part 2's crew music: Ladi's Mureka takes as the gameplay thread cut them (gameplay/audio/part2/README.md;
// Ladi, 27 Nov 3:07 PM "All start on a phrase. No words." and 3:08 PM "Both yard tunes are fine. Let's go
// with A."). Mureka's terms for selling are not confirmed (CREDITS.md). One beat is one tick at 100 a
// minute; a bar is 2.4 s.
//
// The camp walk: the yard tune loops, the low note (a C under a tune in D) very quietly under it; on a tap
// that doesn't add up the tune drops to about an eighth for two beats while the low note comes up.
// Run 2: the work song thin, middle and full, moving on at a 4-bar line as the brazier fills; at full its
// last phrase with the cheer. The levels and the switch points are the build's and the gameplay thread's
// guesses, for Ladi's ear.

import type { StoryView } from "../engine/protocol.js";
import { audioOut } from "./sound.js";

type Camp = NonNullable<StoryView["camp"]>;
type Run2 = NonNullable<StoryView["run2"]>;

export const PART2_MUSIC = {
  camp: { tune: 0.5, low: 0.06, duck: 1 / 8, lowUp: 0.35, beats: 2, beatSec: 0.6 },
  /** Run 2's loops, and the bank each starts at (the gameplay thread's picks): -2 at 5, -3 at 11. */
  run2: { gain: 0.55, at: [0, 5, 11], lineSec: 9.6, endGain: 0.6 },
};

const FILES = ["p2-camp.mp3", "p2-low-note.wav", "p2-run2-1.mp3", "p2-run2-2.mp3", "p2-run2-3.mp3", "p2-run2-end.mp3"] as const;
type File = (typeof FILES)[number];

const bufs = new Map<File, AudioBuffer>();
const asked = new Set<File>();
function want(c: AudioContext, f: File) {
  if (asked.has(f)) return bufs.get(f) ?? null;
  asked.add(f);
  fetch(`music/${f}`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((a) => c.decodeAudioData(a))
    .then((b) => bufs.set(f, b))
    .catch(() => {
      /* missing: that part plays without it */
    });
  return null;
}

interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
  t0: number;
  f: File;
}

function start(c: AudioContext, bus: GainNode, f: File, gain: number, loop: boolean, at = c.currentTime): Voice | null {
  const b = bufs.get(f);
  if (!b) return null;
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = b;
  src.loop = loop;
  g.gain.value = gain;
  src.connect(g).connect(bus);
  src.start(at);
  src.onended = () => (src.disconnect(), g.disconnect());
  return { src, g, t0: at, f };
}

function stop(c: AudioContext, v: Voice | null, fade = 0.4, at = c.currentTime) {
  if (!v) return;
  v.g.gain.setTargetAtTime(0, at, fade / 3);
  try {
    v.src.stop(at + fade);
  } catch {
    /* already stopped */
  }
}

class Player {
  bus: GainNode;
  voices: Voice[] = [];
  constructor(
    public c: AudioContext,
    out: GainNode,
  ) {
    this.bus = c.createGain();
    this.bus.connect(out);
  }
  silence(fade = 0.6) {
    for (const v of this.voices) stop(this.c, v, fade);
    this.voices = [];
    const bus = this.bus;
    setTimeout(() => bus.disconnect(), fade * 1000 + 3000);
  }
}

// ------------------------------------------------------------------ the camp walk

let camp: (Player & { tune?: Voice | null; low?: Voice | null; wrong?: number }) | null = null;

/** Each tick of the camp walk: the yard tune and the low note under it; a tap that doesn't add up ducks the tune. With no walk, it fades. */
export function campMusic(c: Camp | undefined) {
  const o = audioOut();
  if (!c || !o) {
    camp?.silence();
    camp = null;
    return;
  }
  const M = PART2_MUSIC.camp;
  const tune = want(o.c, "p2-camp.mp3"), low = want(o.c, "p2-low-note.wav");
  if (!tune || !low) return;
  camp ??= new Player(o.c, o.o);
  if (!camp.tune) {
    camp.tune = start(o.c, camp.bus, "p2-camp.mp3", M.tune, true);
    camp.low = start(o.c, camp.bus, "p2-low-note.wav", M.low, true);
    camp.voices = [camp.tune, camp.low].filter((v): v is Voice => !!v);
    camp.wrong = c.wrong;
  }
  if (c.wrong !== undefined && c.wrong !== camp.wrong) {
    camp.wrong = c.wrong;
    const a = o.c.currentTime, hold = M.beats * M.beatSec;
    camp.tune?.g.gain.setTargetAtTime(M.tune * M.duck, a, 0.03);
    camp.tune?.g.gain.setTargetAtTime(M.tune, a + hold, 0.15);
    camp.low?.g.gain.setTargetAtTime(M.lowUp, a, 0.05);
    camp.low?.g.gain.setTargetAtTime(M.low, a + hold, 0.25);
  }
}

// ------------------------------------------------------------------ run 2

let run2: (Player & { loop?: Voice | null; part?: number; next?: number; ended?: boolean }) | null = null;

/** Each tick of run 2: the work song, a fuller loop at each step from the next 4-bar line; at full its last phrase. With no run, it fades. */
export function run2Music(r: Run2 | undefined) {
  const o = audioOut();
  if (!r || !o) {
    run2?.silence(0.3);
    run2 = null;
    return;
  }
  const M = PART2_MUSIC.run2, files: File[] = ["p2-run2-1.mp3", "p2-run2-2.mp3", "p2-run2-3.mp3"];
  const ready = [...files, "p2-run2-end.mp3" as File].map((f) => want(o.c, f)).every(Boolean);
  if (!ready) return;
  run2 ??= new Player(o.c, o.o);
  const p = run2, c = o.c;
  if (r.end) {
    if (!p.ended) {
      p.ended = true;
      stop(c, p.loop ?? null, 0.05);
      const e = start(c, p.bus, "p2-run2-end.mp3", M.endGain, false);
      p.voices = e ? [e] : [];
      p.loop = null;
    }
    return;
  }
  const part = M.at.filter((b) => r.filled >= b).length - 1;
  if (!p.loop) {
    p.part = part;
    p.loop = start(c, p.bus, files[part]!, M.gain, true);
    p.voices = p.loop ? [p.loop] : [];
    return;
  }
  // A fuller loop: from its top, at the current one's next 4-bar line.
  if (part > (p.part ?? 0) && p.next === undefined) {
    const into = (c.currentTime - p.loop.t0) % M.lineSec, at = c.currentTime + (M.lineSec - into);
    p.next = part;
    stop(c, p.loop, 0.02, at);
    const nv = start(c, p.bus, files[part]!, M.gain, true, at);
    p.loop = nv;
    p.voices = nv ? [nv] : [];
    p.part = part;
    setTimeout(() => run2 === p && (p.next = undefined), (at - c.currentTime) * 1000);
  }
}
