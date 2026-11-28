// Part 2, the wake to the cage lights: the gameplay thread's DRAFT sound pack (28 Nov,
// gameplay/audio/part2/sfx-wake-to-run2/, its README the cue sheet). ElevenLabs sound effects, shipped
// only inside music/p2-sfx-wake-to-run2.pack.json (base64 by name), never as loose files, and never
// used as a voice reference. None of it has been heard by Ladi; the gains are the build's guesses.
//
// The camp walk has two loops: the cook's fire, louder the nearer Rook stands to it, and the
// nightshades' hush when he stands at the light's edge by them.

import type { StoryView } from "../engine/protocol.js";
import { audioOut } from "./sound.js";

type Camp = NonNullable<StoryView["camp"]>;

export const PART2_SFX = {
  /** The whole pack's level. */
  gain: 0.8,
  /** Each loop at full (build's guesses, for Ladi's ear). */
  gains: { "camp-fire": 0.55, "shade-hush": 0.5 } as Record<string, number>,
  /** The fire is full within `full` tiles and gone past `gone` (build). */
  fire: { full: 2, gone: 12 },
  /** The hush is full within `full` tiles of a nightshade and gone past `gone` (README: within 3; build: a tile more, as the gate's reach). */
  hush: { full: 1.5, gone: 5 },
  /** How fast a loop follows him (s). */
  follow: 0.25,
};

const NAMES = ["wreck-air", "shade-hush", "snuff", "ember-catch", "flame-tone", "lamps-come", "camp-fire", "gate-bar", "cart-latch", "fizz", "cheer", "light-lines", "cage-light", "hands"] as const;
type Name = (typeof NAMES)[number];

let buffers: Partial<Record<Name, AudioBuffer>> | null = null;
let asked = false;
function load(c: AudioContext) {
  if (asked) return;
  asked = true;
  fetch("music/p2-sfx-wake-to-run2.pack.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))))
    .then((b64s) =>
      Promise.all(
        NAMES.filter((n) => b64s[`p2-sfx-${n}`]).map((n) =>
          c.decodeAudioData(Uint8Array.from(atob(b64s[`p2-sfx-${n}`]!), (ch) => ch.charCodeAt(0)).buffer).then((b) => [n, b] as const),
        ),
      ),
    )
    .then((es) => (buffers = Object.fromEntries(es)))
    .catch(() => {
      /* missing: Part 2 plays without these sounds */
    });
}

/** 1 within `full`, 0 past `gone`, eased between. */
export function closeness(d: number, r: { full: number; gone: number }) {
  const t = Math.max(0, Math.min(1, (r.gone - d) / (r.gone - r.full)));
  return t * t;
}

interface Loop {
  src: AudioBufferSourceNode;
  g: GainNode;
}

class CampSfx {
  bus: GainNode;
  loops: Partial<Record<Name, Loop>> = {};
  constructor(
    private c: AudioContext,
    out: GainNode,
    private b: Partial<Record<Name, AudioBuffer>>,
  ) {
    this.bus = c.createGain();
    this.bus.gain.value = PART2_SFX.gain;
    this.bus.connect(out);
  }
  /** A loop held at `level` of its own gain, started silent the first time it is asked for. */
  hold(n: Name, level: number) {
    let l = this.loops[n];
    if (!l) {
      const buf = this.b[n];
      if (!buf) return;
      const src = this.c.createBufferSource(), g = this.c.createGain();
      src.buffer = buf;
      src.loop = true;
      g.gain.value = 0;
      src.connect(g).connect(this.bus);
      src.start();
      l = this.loops[n] = { src, g };
    }
    l.g.gain.setTargetAtTime((PART2_SFX.gains[n] ?? 1) * level, this.c.currentTime, PART2_SFX.follow / 3);
  }
  step(c: Camp) {
    const S = PART2_SFX, h = c.hear;
    if (!h) return;
    this.hold("camp-fire", closeness(h.fire, S.fire));
    this.hold("shade-hush", closeness(h.shade, S.hush));
  }
  silence() {
    const a = this.c.currentTime;
    for (const l of Object.values(this.loops)) {
      l.g.gain.setTargetAtTime(0, a, 0.1);
      try {
        l.src.stop(a + 0.5);
      } catch {
        /* already stopped */
      }
    }
    const bus = this.bus;
    setTimeout(() => bus.disconnect(), 1000);
  }
}

let camp: CampSfx | null = null;

/** Each frame of the camp walk: its loops. With no walk, they fade out. */
export function campSfx(c: Camp | undefined) {
  const o = audioOut();
  if (o && c) load(o.c);
  if (!c || !o) {
    camp?.silence();
    camp = null;
    return;
  }
  if (!buffers) return;
  camp ??= new CampSfx(o.c, o.o, buffers);
  camp.step(c);
}
