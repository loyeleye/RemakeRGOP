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
type Run2 = NonNullable<StoryView["run2"]>;
type Run1 = NonNullable<StoryView["run1"]>;

export const PART2_SFX = {
  /** The whole pack's level. */
  gain: 0.8,
  /** Each loop at full (build's guesses, for Ladi's ear). */
  /** Run 1: the wreck's air (the quietest thing in the game), fading as the flame tone comes up; the hush full within `near` tiles of a nightshade and gone past 3 (the README). */
  run1: { air: 0.22, airUnderFlame: 0.4, tone: 0.5, hush: { full: 1, gone: 3 } },
  gains: { "wreck-air": 1, "flame-tone": 1, snuff: 0.7, "ember-catch": 0.8, "lamps-come": 0.8, hold: 0.8, mark: 0.8, "dark-close": 0.9, "camp-fire": 0.55, "shade-hush": 0.5, fizz: 0.7, cheer: 0.8, "light-lines": 0.9, "cage-light": 0.9, hands: 0.8 } as Record<string, number>,
  /** Run 2's cheer has voices in it (a small crowd, no words found): Ladi's to allow or drop. Off, the music's last phrase carries the end. */
  cheer: true,
  /** The fire is full within `full` tiles and gone past `gone` (build). */
  fire: { full: 2, gone: 12 },
  /** The hush is full within `full` tiles of a nightshade and gone past `gone` (the gameplay thread, 28 Nov: he can't get nearer than 2.8). */
  hush: { full: 3, gone: 7 },
  /** How fast a loop follows him (s). */
  follow: 0.25,
};

const NAMES = ["wreck-air", "shade-hush", "snuff", "ember-catch", "flame-tone", "lamps-come", "camp-fire", "gate-bar", "cart-latch", "fizz", "cheer", "light-lines", "cage-light", "hands", "hold", "mark", "dark-close"] as const;
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
  /** A sound once, now, at its own gain. */
  once(n: Name) {
    const buf = this.b[n];
    if (!buf) return;
    const src = this.c.createBufferSource(), g = this.c.createGain();
    src.buffer = buf;
    g.gain.value = PART2_SFX.gains[n] ?? 1;
    src.connect(g).connect(this.bus);
    src.start();
    src.onended = () => (src.disconnect(), g.disconnect());
  }
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

let run2: { sfx: CampSfx; last: Run2 | null } | null = null;

/** Each tick of run 2: a crew light fizzing past warm; at full the cheer, the lines of light, the cage taking it, the hands on him. */
export function run2Sfx(r: Run2 | undefined) {
  const o = audioOut();
  if (o && r) load(o.c);
  if (!r || !o) {
    run2?.sfx.silence();
    run2 = null;
    return;
  }
  if (!buffers) return;
  run2 ??= { sfx: new CampSfx(o.c, o.o, buffers), last: null };
  const p = run2.last, s = run2.sfx, e = r.end, pe = p?.end;
  run2.last = r;
  if (!p) return;
  if (r.fizz && r.fizz.tick !== p.fizz?.tick) s.once("fizz");
  if (e && !pe && PART2_SFX.cheer) s.once("cheer");
  if (e?.lines !== undefined && pe?.lines === undefined) s.once("light-lines");
  if (e?.lit !== undefined && pe?.lit === undefined) s.once("cage-light");
  if (e?.held !== undefined && pe?.held === undefined) s.once("hands");
}

let run1: { sfx: CampSfx; last: Run1 | null } | null = null;

/** Each tick of run 1: the wreck's air; the hush as one comes near; the snuff as one goes out; the ember as the brazier first catches, then the flame tone rising a step a bank; the lamps at the end. */
export function run1Sfx(r: Run1 | undefined) {
  const o = audioOut();
  if (o && r) load(o.c);
  if (!r || !o) {
    run1?.sfx.silence();
    run1 = null;
    return;
  }
  if (!buffers) return;
  run1 ??= { sfx: new CampSfx(o.c, o.o, buffers), last: null };
  const S = PART2_SFX.run1, p = run1.last, s = run1.sfx, closing = r.closing !== undefined;
  run1.last = r;
  const k = r.banks / r.of;
  s.hold("wreck-air", closing ? 0 : S.air * (1 - (1 - S.airUnderFlame) * k));
  s.hold("flame-tone", closing || r.banks === 0 ? 0 : S.tone * Math.max(1 / 7, k));
  s.hold("shade-hush", closing || r.end ? 0 : closeness(r.near, S.hush));
  if (!p) return;
  if (r.snuffed && r.snuffed.tick !== p.snuffed?.tick) s.once("snuff");
  if (r.banks === 1 && p.banks === 0) s.once("ember-catch");
  if (r.end?.lamps && !p.end?.lamps) s.once("lamps-come");
  // A nightshade takes hold (once a hold); each mark of warmth that goes; the dark closing over him.
  const held = new Set(p.shades.filter((q) => q.on).map((q) => q.id));
  if (r.shades.some((q) => q.on && !held.has(q.id))) s.once("hold");
  if (r.marked !== undefined && r.marked !== p.marked) s.once("mark");
  if (closing && p.closing === undefined) s.once("dark-close");
}
