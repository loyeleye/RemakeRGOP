// Story sound, made in code with WebAudio (no audio files), plus a slot for music files.
// "A pull is a held breath and a bank is the breath out." Every chime is in D major
// pentatonic, so it sits in tune with the music (100 BPM, D major: one beat per 600 ms tick).
// Browsers only allow sound after a tap or key press, so nothing plays before the first one.
// All the numbers that set the feel are in SOUND.

import { VOICE_LINES, VOICE_STOCK } from "./voice-lines.js";

export const SOUND = {
  /** Master volume, 0 to 1. */
  volume: 0.8,
  /** Bank chimes climb the scale; a gap of this many ticks between banks starts again at the bottom. */
  streakGap: 10,
  /** Crewmates' banks, and Kes's island far away. */
  crewGain: 0.45,
  kesGain: 0.12,
  /** The pull cue: how loud, and how many seconds it takes to fade. */
  humGain: 0.05,
  pullCue: 1.1,
  /** The speakers' babble blips. */
  babbleGain: 0.05,
  /** Run 9's static: the hard burst (seconds, and how loud), and the low hiss while Kes is under the shadow. */
  static: { burst: 0.4, gain: 0.2, hiss: 0.03 },
  /** Music volume, and how long it fades under Lumi's bell. */
  musicGain: 0.45,
  musicFade: 1.5,
  /** The ending: wind under the descent, and how slowly the music lets go after the last bell. */
  windGain: 0.12,
  endMusicFade: 16,
  /** The eye's drone, before it swells into the fix. */
  eyeGain: 0.09,
};

/** D major pentatonic from D4 upward: D E F# A B, then the next octave. */
const PENTA = [293.66, 329.63, 369.99, 440.0, 493.88];
const note = (i: number) => PENTA[i % 5]! * 2 ** Math.floor(i / 5);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem("lf-muted") === "1";
} catch {
  /* storage blocked */
}

/** Start sound on the first tap, click or key (browsers block it before then). */
export function unlockOnFirstInput() {
  const go = () => {
    ensure();
    void ctx?.resume();
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, go, { capture: true });
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : SOUND.volume;
  master.connect(ctx.destination);
  return ctx;
}

/** A live context and output, or null if sound isn't running yet. */
function out(): { c: AudioContext; o: GainNode } | null {
  if (!ctx || !master || ctx.state !== "running") return null;
  return { c: ctx, o: master };
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("lf-muted", m ? "1" : "0");
  } catch {
    /* storage blocked */
  }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : SOUND.volume, ctx.currentTime, 0.05);
  if (music) music.muted = m;
  if (voicing) voicing.muted = m;
}

// ------------------------------------------------------------------ building blocks

function env(c: AudioContext, g: GainNode, peak: number, attack: number, decay: number, at = c.currentTime) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

/** A struck tone: a few sine partials with their own decays (glass, gong or bell by the ratios). */
function strike(freq: number, gain: number, pan: number, partials: [number, number, number][], dest?: AudioNode, at?: number) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const t = at ?? c.currentTime;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest ?? o);
  for (const [ratio, amp, decay] of partials) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    env(c, g, gain * amp, 0.004, decay, t);
    osc.connect(g).connect(p);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }
}

/** A short burst of filtered noise (the flame catching, a knock). */
function noise(gain: number, type: BiquadFilterType, freq: number, decay: number, pan = 0) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const len = Math.ceil(c.sampleRate * (decay + 0.05));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  env(c, g, gain, 0.01, decay);
  const p = c.createStereoPanner();
  p.pan.value = pan;
  src.connect(f).connect(g).connect(p).connect(o);
  src.start();
}

/** A low tone that drops in pitch: the whoomph under a bank. */
function thump(gain: number, pan = 0) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const osc = c.createOscillator();
  const g = c.createGain();
  const p = c.createStereoPanner();
  p.pan.value = pan;
  osc.frequency.setValueAtTime(110, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(48, c.currentTime + 0.35);
  env(c, g, gain, 0.01, 0.45);
  osc.connect(g).connect(p).connect(o);
  osc.start();
  osc.stop(c.currentTime + 0.6);
}

const GLASS: [number, number, number][] = [
  [1, 1, 1.6],
  [2.76, 0.35, 0.8],
  [5.4, 0.12, 0.4],
];
const HANDBELL: [number, number, number][] = [
  [1, 1, 2.2],
  [2.0, 0.5, 1.4],
  [3.01, 0.3, 0.9],
  [4.2, 0.15, 0.6],
];

// ------------------------------------------------------------------ the sounds

let streak = 0;
let lastBankTick = -999;

/**
 * A bank: a chime over a whoomph, one note higher than the last if it came soon after.
 * Rook's is bright and centred; a crewmate's is quieter and panned to their side.
 */
export function bankChime(tick: number, who: "rook" | "crew", pan = 0) {
  streak = tick - lastBankTick <= SOUND.streakGap ? streak + 1 : 0;
  lastBankTick = tick;
  const gain = who === "rook" ? 0.35 : 0.35 * SOUND.crewGain;
  strike(note(Math.min(streak, 9)), gain, who === "rook" ? 0 : pan, GLASS);
  thump(who === "rook" ? 0.35 : 0.15, who === "rook" ? 0 : pan);
  noise(who === "rook" ? 0.08 : 0.03, "lowpass", 500, 0.35, who === "rook" ? 0 : pan);
}

/** Kes's island scoring, far away: faint and muffled. */
export function kesChime() {
  const s = out();
  if (!s) return;
  const f = s.c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  f.connect(s.o);
  strike(note(Math.floor(Math.random() * 5) + 5), SOUND.kesGain, 0.6, GLASS, f);
}

/** The staff takes hold: a soft, low pluck under the pull cue. */
export function catchClick() {
  strike(587.33, 0.06, 0, [
    [1, 1, 0.06],
    [2, 0.4, 0.04],
  ]);
}

/** A pull that can't take hold: a short dull knock. */
export function slipKnock() {
  noise(0.18, "bandpass", 320, 0.09);
  thump(0.12);
}

/**
 * One clap from off frame (the glow test's end): a bright noise crack, a lower body under it, and
 * the room's echo after it, a little to one side.
 */
export function clap(pan = -0.3) {
  noise(0.5, "bandpass", 1400, 0.09, pan);
  noise(0.25, "lowpass", 700, 0.14, pan);
  window.setTimeout(() => noise(0.06, "bandpass", 1100, 0.25, -pan), 90);
}

/** A pull stopped at the water's edge (the laws of water): a soft, low plop with a little splash. */
let lastPlop = 0;
export function bankPlop() {
  const s = out();
  if (!s || s.c.currentTime - lastPlop < 1.2) return;
  lastPlop = s.c.currentTime;
  strike(196, 0.05, 0, [
    [1, 1, 0.12],
    [1.5, 0.3, 0.06],
  ]);
  noise(0.06, "lowpass", 700, 0.12);
}

/**
 * Hesta's stone cast: a boulder settling. A low thud as her fist shuts (0.3 s into the move), a
 * short grind of rock, and two small stones knocking after it. Plain and brief, not a quake.
 */
let lastStone = 0;
export function stoneCast() {
  const s = out();
  if (!s || s.c.currentTime - lastStone < 3) return;
  lastStone = s.c.currentTime;
  setTimeout(() => {
    thump(0.34);
    strike(62, 0.2, 0, [
      [1, 1, 0.5],
      [1.48, 0.35, 0.22],
    ]);
    noise(0.16, "lowpass", 320, 0.45);
    noise(0.05, "bandpass", 900, 0.12);
  }, 300);
  setTimeout(() => noise(0.07, "bandpass", 620, 0.07, -0.2), 520);
  setTimeout(() => noise(0.05, "bandpass", 480, 0.09, 0.25), 660);
}

/** Kes strings a wisp (run 5): a small dry crackle, three quick snaps. */
export function stormJoin() {
  const s = out();
  if (!s) return;
  noise(0.03, "highpass", 2600, 0.16);
  setTimeout(() => noise(0.025, "highpass", 3400, 0.12, 0.2), 55);
  setTimeout(() => noise(0.04, "bandpass", 1900, 0.1, -0.2), 120);
}

/** Lumi's hand bell; `rings` times, half a second apart. */
export function handBell(rings = 1) {
  const s = out();
  if (!s) return;
  for (let i = 0; i < rings; i++) strike(880, 0.25, -0.3, HANDBELL, undefined, s.c.currentTime + i * 0.5);
}

// The pull: one soft cue as the pull starts, which fades within about a second. Nothing
// keeps playing while he holds it.
let pulling = false;

/** Call every tick of a pull (`near` is unused now); null when it ends. The cue plays once per pull. */
export function pullHum(near: number | null) {
  if (near === null) {
    pulling = false;
    return;
  }
  if (pulling) return;
  pulling = true;
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const t = c.currentTime;
  // A low, warm swell (D4 and A4, sine), with a breath of soft, dark wind under it.
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(SOUND.humGain, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + SOUND.pullCue);
  const soft = c.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 1200;
  g.connect(soft).connect(o);
  for (const [f, amp] of [
    [293.66, 0.6],
    [440.0, 0.3],
  ] as const) {
    const x = c.createOscillator();
    x.type = "sine";
    x.frequency.setValueAtTime(f, t);
    x.frequency.exponentialRampToValueAtTime(f * 1.012, t + SOUND.pullCue);
    const a = c.createGain();
    a.gain.value = amp;
    x.connect(a).connect(g);
    x.start(t);
    x.stop(t + SOUND.pullCue + 0.1);
  }
  const len = Math.ceil(c.sampleRate * (SOUND.pullCue + 0.1));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const air = c.createBiquadFilter();
  air.type = "bandpass";
  air.frequency.value = 500;
  air.Q.value = 2;
  const ag = c.createGain();
  ag.gain.value = 0.25;
  src.connect(air).connect(ag).connect(g);
  src.start(t);
}

/**
 * Voiced clips for a few lines, in place of the babble. Empty until the clips are picked: add
 * { who: "Lumi", match: /^Dad\./, src: "voice/lumi-dad.mp3" } and the line plays the clip.
 */
export const VOICE: { who: string; match: RegExp; src: string }[] = [
  // Rook's run 2 lines, whole: Umbriel, lowered a semitone (Ladi's pick).
  { who: "Rook", match: /^How did you do that\?$/, src: "voice/rook-how.mp3" },
  { who: "Rook", match: /^Three wisps\. I won't point today\.$/, src: "voice/rook-three-wisps.mp3" },
  { who: "Rook", match: /^Where would I stand\?$/, src: "voice/rook-where-stand.mp3" },
  { who: "Rook", match: /^Remember, across the fire from\.\.\.$/, src: "voice/rook-remember.mp3" },
  { who: "Rook", match: /^That's it\.$/, src: "voice/rook-thats-it.mp3" },
  { who: "Rook", match: /^Just like that\.$/, src: "voice/rook-just-like-that.mp3" },
  { who: "Rook", match: /^This one's stuck\. Pull with me\.$/, src: "voice/rook-stuck.mp3" },
  { who: "Rook", match: /^See\? It comes to the middle of us\.$/, src: "voice/rook-middle.mp3" },
  { who: "Rook", match: /^Now you're the boss\. Tell me where to stand\.$/, src: "voice/rook-boss.mp3" },
  { who: "Rook", match: /^Yes, ma'am\.$/, src: "voice/rook-yes-maam.mp3" },
  { who: "Rook", match: /^First to three\. No help\.$/, src: "voice/rook-first-to-three.mp3" },
  { who: "Rook", match: /^Let's call it for now\. We can try again tomorrow\.$/, src: "voice/rook-call-it.mp3" },
];

/** The voice clip playing now. One voice at a time: a line that comes while it plays stays silent. */
let voicing: HTMLAudioElement | null = null;
/** Who the clip is, and the last babble with its speaker: so one speaker can be cut off (run 9's static). */
let voicingWho = "";
let babbling: { who: string; g: GainNode } | null = null;
/** The speaker whose voice the shadow has cut off, while it has. */
let cutWho: string | null = null;
const voiceBusy = () => voicing != null && !voicing.ended && (!voicing.paused || cutWho === voicingWho);

/** The joined voice files (tools/voice-sprites.py), fetched once each and kept in the page. */
const joinedFiles = new Map<string, Promise<string>>();
function joined(file: string): Promise<string> {
  let p = joinedFiles.get(file);
  if (!p) {
    p = fetch(file).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).then((b) => URL.createObjectURL(new Blob([b], { type: "audio/mpeg" })));
    p.catch(() => joinedFiles.delete(file));
    joinedFiles.set(file, p);
  }
  return p;
}
/** Fetch every joined voice file now, so the first line of a run is not kept waiting. */
export function preloadVoices() {
  const files = new Set<string>();
  for (const src of [...Object.values(VOICE_LINES), ...Object.values(VOICE_STOCK).flatMap((l) => l.map((c) => c.src))]) {
    const m = /^(.*)#t=/.exec(src);
    if (m) files.add(m[1]!);
  }
  for (const f of files) void joined(f).catch(() => {});
}

/** The last stock sound each speaker made, so the next is another. */
const lastStock = new Map<string, string>();
/** One of a speaker's stock sounds (VOICE_STOCK): one that suits the line if any does, not the one before; none if they have none. */
function stockFor(who: string, text: string): string | undefined {
  const all = VOICE_STOCK[who];
  if (!all?.length) return undefined;
  const fits = all.filter((c) => c.for?.test(text)), from = (fits.length ? fits : all).map((c) => c.src);
  const pick = from.length > 1 ? from.filter((f) => f !== lastStock.get(who)) : from;
  const src = pick[Math.floor(Math.random() * pick.length)]!;
  lastStock.set(who, src);
  return src;
}

/** A line appears: its clip if it has one, else Hesta's "Now" cue or the speaker's babble. */
export function speak(who: string, text: string, now = false, together = false) {
  // Someone is still talking: don't talk over them (the text still shows). `together` is for a line
  // two people say at once (the creed's last line at supper): the second voice joins the first.
  if (voiceBusy() && !together) return;
  // An exact whole-line clip wins; then a pattern; else the babble.
  const src = VOICE_LINES[`${who}|${text}`] ?? VOICE.find((c) => c.who === who && c.match.test(text))?.src ?? stockFor(who, text);
  if (src) {
    if (!out()) return;
    // A time range of a joined file (voice/<group>.mp3#t=a,b, tools/voice-sprites.py): the page seeks to a itself and stops at b.
    const range = /^(.*)#t=([\d.]+),([\d.]+)$/.exec(src);
    const a = new Audio(range ? undefined : src);
    a.volume = SOUND.volume;
    a.muted = muted;
    voicing = a;
    voicingWho = who;
    const done = () => { if (voicing === a) voicing = null; };
    a.addEventListener("ended", done);
    a.addEventListener("error", done);
    if (range) {
      const from = Number(range[2]), end = Number(range[3]);
      let timer = 0;
      const stop = () => {
        window.clearTimeout(timer);
        a.pause();
        done();
      };
      // To the millisecond while it plays (timeupdate alone comes only every quarter second or so).
      const arm = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (a.currentTime >= end - 0.03 ? stop() : arm()), Math.max(10, (end - a.currentTime) * 1000));
      };
      a.addEventListener("playing", arm);
      a.addEventListener("timeupdate", () => a.currentTime >= end - 0.02 && stop());
      a.addEventListener("pause", () => window.clearTimeout(timer));
      const go = () => {
        a.currentTime = from;
        if (cutWho !== who && voicing === a) void a.play().catch(done);
      };
      a.addEventListener("loadedmetadata", go, { once: true });
      // The joined file is held whole in the page, so that it can be played from anywhere in it (a server need not answer range requests).
      void joined(range[1]!).then((url) => (voicing === a ? (a.src = url) : undefined), done);
      return;
    }
    if (cutWho !== who) void a.play().catch(done);
    return;
  }
  if (cutWho === who) return;
  if (now) nowCue();
  else babble(who, text);
}

/**
 * Babble: short pitched blips as a line appears, one per word or so, in place of a voice.
 * Hesta's are low and slow; Lumi's high and quick. Quiet, under everything else.
 */
export function babble(who: string, text: string) {
  const s = out();
  if (!s) return;
  // Lumi is high and quick; the grown-ups (Hesta, Rook) low and slow.
  const hesta = who !== "Lumi";
  const words = text.split(/\s+/).filter(Boolean).length;
  const n = Math.min(hesta ? 5 : 7, Math.max(2, words));
  const gap = hesta ? 0.13 : 0.085;
  // Hesta: A3 to E4. Lumi: D5 to B5. Both from the pentatonic, so they sit in the music.
  const pool = hesta ? [220.0, 246.94, 293.66, 329.63] : [587.33, 659.25, 739.99, 880.0, 987.77];
  // Through a gain of its own, so that it can be cut off mid-word.
  const bus = s.c.createGain();
  bus.connect(s.o);
  babbling = { who, g: bus };
  for (let k = 0; k < n; k++) {
    const f = pool[Math.floor(Math.random() * pool.length)]!;
    strike(f, SOUND.babbleGain * (hesta ? 1.3 : 1), hesta ? 0.15 : -0.15, [
      [1, 1, hesta ? 0.09 : 0.06],
      [2, 0.2, 0.04],
    ], bus, s.c.currentTime + k * gap);
  }
}

// ------------------------------------------------------------------ static (run 9)

/**
 * A hard burst of static: the shadow going over Kes cuts her off with it, and it is the same sound
 * between the stills of the "What is that?" pause. Made here from noise: samples held for uneven
 * lengths, so it is the grit of a dead channel and not a hiss. Nowhere else.
 */
export function staticBurst(len = SOUND.static.burst) {
  const s = out();
  if (!s) return;
  const { c, o } = s, n = Math.ceil(c.sampleRate * len), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  let v = 0, hold = 0;
  for (let i = 0; i < n; i++) {
    if (hold-- <= 0) (v = Math.random() * 2 - 1), (hold = Math.floor(Math.random() * 6));
    d[i] = v;
  }
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
  src.buffer = buf;
  f.type = "highpass";
  f.frequency.value = 600;
  // Hard on, hard off.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(SOUND.static.gain, t + 0.004);
  g.gain.setValueAtTime(SOUND.static.gain, t + len - 0.006);
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(o);
  src.start(t);
}

let hissing: { src: AudioBufferSourceNode; g: GainNode } | null = null;
/** The low hiss for as long as she is under it. Off, it stops dead. */
export function staticHiss(on: boolean) {
  if (!on) {
    if (hissing) {
      hissing.g.gain.value = 0;
      try {
        hissing.src.stop();
      } catch {
        /* never started */
      }
      hissing = null;
    }
    return;
  }
  const s = out();
  if (hissing || !s) return;
  const { c, o } = s, buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  src.loop = true;
  f.type = "bandpass";
  f.frequency.value = 3800;
  f.Q.value = 0.5;
  g.gain.value = SOUND.static.hiss;
  src.connect(f).connect(g).connect(o);
  src.start();
  hissing = { src, g };
}

/**
 * Cut one speaker's voice off where it is (her clip stops, her babble goes silent), or with null let
 * them speak again. True if a clip of theirs took up where it stopped; if not, the page says the
 * line again.
 */
export function cutVoice(who: string | null): boolean {
  const was = cutWho;
  cutWho = who;
  if (who) {
    if (voicing && voicingWho === who) voicing.pause();
    if (babbling?.who === who) (babbling.g.gain.value = 0), (babbling = null);
    return false;
  }
  if (was && voicing && voicingWho === was && voicing.paused && !voicing.ended) {
    const a = voicing;
    void a.play().catch(() => { if (voicing === a) voicing = null; });
    return true;
  }
  return false;
}

/** Hesta's "Now": its own two rising notes, so the ear learns it. */
export function nowCue() {
  const s = out();
  if (!s) return;
  const t = s.c.currentTime;
  strike(440.0, 0.12, 0.15, [[1, 1, 0.18], [2, 0.25, 0.08]], undefined, t);
  strike(587.33, 0.14, 0.15, [[1, 1, 0.35], [2, 0.25, 0.12]], undefined, t + 0.12);
}

/** The eye opens: everything else cuts out, and one low note is held. */
export function eyeNote() {
  pullHum(null);
  stopMusic(0.3);
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 1.5);
  g.gain.setValueAtTime(0.18, c.currentTime + 7);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 10);
  g.connect(o);
  for (const f of [36.71, 73.42]) {
    const x = c.createOscillator();
    x.type = f < 50 ? "triangle" : "sine";
    x.frequency.value = f;
    x.connect(g);
    x.start();
    x.stop(c.currentTime + 10.5);
  }
}

// ------------------------------------------------------------------ music slot

let music: HTMLAudioElement | null = null;
const MUSIC_TYPES = ["mp3", "ogg", "m4a", "wav"];

/**
 * Play music/kindling-N for a movement, if the file exists (silence if not). It loops, since
 * a movement's length can vary. The old track fades out under Lumi's bell first.
 */
export function playMusic(movement: number) {
  stopMusic(SOUND.musicFade);
  endingPiece = false;
  const a = new Audio();
  a.loop = true;
  a.volume = 0;
  a.muted = muted;
  let i = 0;
  const next = () => {
    if (i >= MUSIC_TYPES.length) return;
    a.src = `music/kindling-${movement + 1}.${MUSIC_TYPES[i++]}`;
    a.load();
  };
  a.onerror = next;
  a.oncanplay = () => {
    a.oncanplay = null;
    if (music !== a) return;
    void a.play().catch(() => {});
    fadeTo(a, SOUND.musicGain, 0.4);
  };
  music = a;
  next();
}

/** Fade the music out over `sec` seconds. */
export function stopMusic(sec = SOUND.musicFade) {
  const a = music;
  music = null;
  if (a) fadeTo(a, 0, sec, () => a.pause());
}

/** Bring the music down to `share` of its usual volume over `sec`, and keep it playing. Not the
 *  ending piece, which carries its own shape. */
export function duckMusic(share: number, sec: number) {
  if (music && !endingPiece) fadeTo(music, SOUND.musicGain * share, sec);
}

let endingPiece = false;
/** True while the ending's own piece is playing (it shapes itself: no duck, no cut at the rim). */
export const endingPieceOn = () => endingPiece && music !== null;

/**
 * The run 1 ending's own piece, music/kindling-ending (Ladi's, about 60 s: story/cutscene-emotion-brief.md,
 * section A), from the last bell, once and at full; `at` is when its 0 s plays (negative skips in).
 * If the file isn't there, the crescendo track plays on and the ending ducks it instead. Both are
 * cut at the rim.
 */
export function playEndingMusic(at = 0) {
  const a = new Audio();
  a.loop = false;
  a.muted = muted;
  let i = 0;
  const next = () => {
    if (i >= MUSIC_TYPES.length) return;
    a.src = `music/kindling-ending.${MUSIC_TYPES[i++]}`;
    a.load();
  };
  a.onerror = next;
  a.oncanplay = () => {
    a.oncanplay = null;
    const old = music;
    if (old) fadeTo(old, 0, 0.3, () => old.pause());
    music = a;
    endingPiece = true;
    a.volume = SOUND.musicGain;
    // Line the file up with the bell: skip in, or wait, by how long it took to load too.
    const late = (performance.now() - t0) / 1000 - at;
    if (late >= 0) {
      a.currentTime = late;
      void a.play().catch(() => {});
    } else setTimeout(() => music === a && void a.play().catch(() => {}), -late * 1000);
  };
  const t0 = performance.now();
  next();
}

function fadeTo(a: HTMLAudioElement, to: number, sec: number, done?: () => void) {
  const from = a.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
    a.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  step();
}

// ------------------------------------------------------------------ the ending

let windStop: (() => void) | null = null;

/** Wind under the descent: soft looping noise through a slow, wandering lowpass. Fades in over `sec`. */
export function wind(sec = 4) {
  windOff(0.1);
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b = 0;
    // Brown-ish noise: a soft rush rather than hiss.
    for (let i = 0; i < len; i++) d[i] = b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.13;
  const depth = c.createGain();
  depth.gain.value = 260;
  lfo.connect(depth).connect(lp.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(SOUND.windGain, c.currentTime + sec);
  src.connect(lp).connect(g).connect(o);
  src.start();
  lfo.start();
  windStop = () => {
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + windFade);
    src.stop(t + windFade + 0.1);
    lfo.stop(t + windFade + 0.1);
  };
}

let windFade = 1;
export function windOff(sec = 1) {
  windFade = sec;
  windStop?.();
  windStop = null;
}

// ------------------------------------------------------------------ the dying brazier (runs 6 and 7)

let fire: { g: GainNode; lp: BiquadFilterNode; stop: () => void; next: number } | null = null;

/**
 * The brazier's own sound, as loud as the flame is high (0 to 100): a low rush with a few dry
 * crackles over it. `null` stops it at once (the silence in the embers).
 */
export function fireBed(flame: number | null) {
  const s = out();
  if (flame === null || !s) {
    fire?.stop();
    fire = null;
    return;
  }
  const { c, o } = s;
  if (!fire) {
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) d[i] = b = (b + 0.03 * (Math.random() * 2 - 1)) / 1.03;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    const g = c.createGain();
    g.gain.value = 0.0001;
    src.connect(lp).connect(g).connect(o);
    src.start();
    fire = { g, lp, next: 0, stop: () => (g.gain.setTargetAtTime(0.0001, c.currentTime, 0.04), src.stop(c.currentTime + 0.4)) };
  }
  const k = Math.max(0, Math.min(1, flame / 100));
  fire.g.gain.setTargetAtTime(0.5 + 5 * k, c.currentTime, 0.4);
  fire.lp.frequency.setTargetAtTime(180 + 700 * k, c.currentTime, 0.4);
  if (c.currentTime > fire.next) {
    fire.next = c.currentTime + 0.25 + Math.random() * (1.6 - k);
    noise(0.03 + 0.07 * k, "highpass", 1800 + Math.random() * 2400, 0.03, Math.random() * 0.6 - 0.3);
  }
}

let cloud: { g: GainNode; lp: BiquadFilterNode; p: StereoPannerNode; stop: () => void } | null = null;

/**
 * Run 10: a cloud bank coming down one side. A low rush with no beat in it, from the side it is on
 * (`pan`, -1 left to 1 right), as loud as it is near (`level`, 0 to 1). `null` stops it.
 */
export function cloudRush(level: number | null, pan = 0) {
  const s = out();
  if (level === null || !s) {
    cloud?.stop();
    cloud = null;
    return;
  }
  const { c, o } = s;
  if (!cloud) {
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) d[i] = b = (b + 0.03 * (Math.random() * 2 - 1)) / 1.03;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    const g = c.createGain();
    g.gain.value = 0.0001;
    const p = c.createStereoPanner();
    src.connect(lp).connect(g).connect(p).connect(o);
    src.start();
    cloud = { g, lp, p, stop: () => (g.gain.setTargetAtTime(0.0001, c.currentTime, 0.15), src.stop(c.currentTime + 1)) };
  }
  const k = Math.max(0, Math.min(1, level));
  cloud.g.gain.setTargetAtTime(0.0001 + 7 * k * k, c.currentTime, 0.35);
  cloud.lp.frequency.setTargetAtTime(140 + 520 * k, c.currentTime, 0.35);
  cloud.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), c.currentTime, 0.2);
}

/** Run 10: what a wisp is worth as it goes into the lamp: one soft glass note for each point, rising. */
export function feedChime(points: number) {
  const s = out();
  if (!s) return;
  for (let i = 0; i < Math.min(3, points); i++) strike(note(4 + i * 2), 0.11, 0, GLASS, undefined, s.c.currentTime + 0.05 + i * 0.13);
}

/** Run 9: a wisp goes into the boat's lamp. The note climbs with the pips, so the fourth is heard as the top. */
export function pipChime(pip: number) {
  const s = out();
  if (!s) return;
  strike(note(4 + Math.max(0, Math.min(5, pip)) * 2), 0.13, 0, GLASS, undefined, s.c.currentTime + 0.3);
}

/** Run 9: the lamp's newest pip starts to gutter. A few uneven sputters, once (a sound that kept repeating would mean an emergency). */
export function lampGutter() {
  if (!out()) return;
  for (const [ms, g, f] of [[0, 0.05, 2400], [140, 0.035, 3100], [330, 0.045, 2000], [470, 0.025, 3600], [760, 0.04, 2300]] as const) window.setTimeout(() => noise(g, "bandpass", f, 0.05, 0.1), ms);
}

/** Run 9: a pip goes out. The chime's note falling away, and a breath of air. */
export function pipOut() {
  const s = out();
  if (!s) return;
  const { c, o } = s, t = c.currentTime + 0.05;
  const osc = c.createOscillator(), gn = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(note(6), t);
  osc.frequency.exponentialRampToValueAtTime(note(6) * 0.5, t + 0.5);
  env(c, gn, 0.09, 0.02, 0.5, t);
  osc.connect(gn).connect(o);
  osc.start(t);
  osc.stop(t + 0.7);
  noise(0.04, "lowpass", 900, 0.3);
}

/** Run 9: a boat lifts. One long horn note and the fifth under it, soft at both ends. */
export function boatHorn() {
  const s = out();
  if (!s) return;
  const { c, o } = s, t = c.currentTime + 0.15, len = 1.9;
  for (const [f, g] of [[147, 0.2], [98, 0.14], [294, 0.035]] as const) {
    const osc = c.createOscillator(), gn = c.createGain(), lp = c.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f * 0.985, t);
    osc.frequency.linearRampToValueAtTime(f, t + 0.25);
    lp.type = "lowpass";
    lp.frequency.value = 620;
    env(c, gn, g, 0.22, len, t);
    osc.connect(lp).connect(gn).connect(o);
    osc.start(t);
    osc.stop(t + len + 0.4);
  }
}

/**
 * Run 9: the patch is on the board. The music thins to almost nothing and one low note stands
 * under everything; when it has gone the note stops and the music comes back a beat late. No beat
 * and no repeat in it (a repeating sound means an emergency here).
 */
let patchNote: { osc: OscillatorNode; gain: GainNode } | null = null;
export function patchDrone(on: boolean) {
  const s = out();
  if (on === !!patchNote) return;
  if (!on) {
    const n = patchNote!;
    patchNote = null;
    if (ctx) {
      n.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
      n.osc.stop(ctx.currentTime + 1.5);
    }
    window.setTimeout(() => duckMusic(1, 1.2), 600);
    return;
  }
  duckMusic(0.12, 0.8);
  if (!s) return;
  const { c, o } = s, osc = c.createOscillator(), gain = c.createGain(), lp = c.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.value = 49;
  lp.type = "lowpass";
  lp.frequency.value = 180;
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.setTargetAtTime(0.2, c.currentTime, 0.6);
  osc.connect(lp).connect(gain).connect(o);
  osc.start();
  patchNote = { osc, gain };
}

/** Everything drops out for `sec` seconds, at once, then comes back. (Run 8's pull.) */
export function hush(sec: number) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(0.0001, t);
  master.gain.setValueAtTime(0.0001, t + sec);
  master.gain.linearRampToValueAtTime(SOUND.volume, t + sec + 0.4);
}

/** A reaction still arriving: one soft brush of paper, under half a second, never repeated. */
export function paper() {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const t = c.currentTime, sec = 0.42;
  const len = Math.ceil(c.sampleRate * sec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(1500, t + sec);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
  src.connect(f).connect(g).connect(o);
  src.start(t);
  src.stop(t + sec + 0.05);
}

/** Run 8's pull, placeholder: a low suck of air as the rings close, rising to the snap. */
export function pullWind(sec: number) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const len = Math.ceil(c.sampleRate * sec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 3;
  f.frequency.setValueAtTime(900, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(120, c.currentTime + sec);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.35, c.currentTime + sec);
  src.connect(f).connect(g).connect(o);
  src.start();
}

/**
 * Run 8's tug, placeholder: a low inward draw of air under a deep tone, both rising for `sec`
 * seconds, then cut off dead (no tail), into silence.
 */
export function pullDraw(sec: number) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const t = c.currentTime;
  const len = Math.ceil(c.sampleRate * sec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 4;
  f.frequency.setValueAtTime(90, t);
  f.frequency.exponentialRampToValueAtTime(520, t + sec);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + sec);
  src.connect(f).connect(g).connect(o);
  const tone = c.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(42, t);
  tone.frequency.exponentialRampToValueAtTime(96, t + sec);
  const tg = c.createGain();
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.3, t + sec);
  tone.connect(tg).connect(o);
  src.start(t);
  tone.start(t);
  // Dead stop: no release.
  src.stop(t + sec);
  tone.stop(t + sec);
}

/** The snap: one dull knock. */
export function pullSnap() {
  if (!out()) return;
  thump(0.6);
  noise(0.25, "lowpass", 200, 0.18);
}

/**
 * The shrine's great bell, rung for an alarm: a heavy bronze strike with a long hum and a beat in
 * it, as loud as anything in the game. Through the whole of run 6.
 */
const GREAT: [number, number, number][] = [
  [0.5, 0.9, 5.5],
  [1, 1, 4.2],
  [1.19, 0.55, 3.2],
  [1.5, 0.45, 2.4],
  [2, 0.4, 1.8],
  [2.52, 0.25, 1.2],
  [3.01, 0.18, 0.9],
];
export function greatBell(level = 1) {
  const s = out();
  if (!s) return;
  strike(196, 0.42 * level, 0.15, GREAT);
  strike(197.6, 0.2 * level, -0.15, GREAT.slice(0, 3));
  // From far off (the alarm) it has no strike in it, only the ring.
  if (level < 0.5) return;
  thump(0.35 * level);
  noise(0.12 * level, "bandpass", 2600, 0.06, 0.1);
}

// The alarm before run 6 (client/alarm.ts): a sound for each shot, under the bell.

let alarmStops: (() => void)[] = [];
/** Cuts the alarm's held sounds short (it was skipped). */
export function alarmQuiet() {
  for (const f of alarmStops) f();
  alarmStops = [];
}

/** A held rush of soft noise through one filter, for `sec` seconds, in over `rise` and out over the last `fall`. */
function rush(sec: number, type: BiquadFilterType, freq: number, gain: number, rise = 0.3, fall = 0.6, q = 0.7) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const len = Math.ceil(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0, peak = 0;
  for (let i = 0; i < len; i++) (d[i] = b = (b + 0.03 * (Math.random() * 2 - 1)) / 1.03), (peak = Math.max(peak, Math.abs(b)));
  for (let i = 0; i < len; i++) d[i]! /= peak || 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain(), t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + rise);
  g.gain.setValueAtTime(gain, t + Math.max(rise, sec - fall));
  g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
  src.connect(f).connect(g).connect(o);
  src.start(t);
  src.stop(t + sec + 0.1);
  alarmStops.push(() => {
    const n = c.currentTime;
    g.gain.cancelScheduledValues(n);
    g.gain.setTargetAtTime(0.0001, n, 0.05);
  });
}

/** The falls going into the cloud: a short roar with the top taken off it. */
export function alarmFalls(sec: number) {
  rush(sec, "lowpass", 340, 0.32, 0.25, 0.8);
  rush(sec, "bandpass", 900, 0.05, 0.4, 0.8, 0.5);
}

/** The waterfall heard from off the island: a thin hiss that goes as the island goes under. */
export function alarmHiss(sec: number) {
  rush(sec, "bandpass", 2600, 0.05, 0.3, sec * 0.65, 0.6);
  rush(sec, "lowpass", 500, 0.12, 0.3, sec * 0.65);
}

/** The cloud coming up over the island: a low roll under everything. */
export function alarmRumble(sec: number) {
  rush(sec, "lowpass", 95, 0.6, 0.5, 0.9);
}

/** Rock breaking off the island's underside: a dry crack and the weight of it, from `pan` (-1 left to 1 right). */
export function rockCrack(pan = 0) {
  noise(0.09, "bandpass", 1400 + Math.random() * 900, 0.07, pan);
  noise(0.1, "lowpass", 260, 0.22, pan);
}

/** A cup knocking on its hook. */
export function cupClink() {
  strike(1750 + Math.random() * 500, 0.035, Math.random() * 0.6 - 0.3, [[1, 1, 0.11], [2.32, 0.4, 0.06], [3.9, 0.15, 0.04]]);
}

/**
 * People calling to each other along the lake path, too far off for words: a handful of voices,
 * each a buzz through two vowel bands, speaking in bursts of syllables with gaps between.
 */
export function alarmChatter(sec: number) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const t = c.currentTime;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, t);
  bus.gain.exponentialRampToValueAtTime(0.5, t + 0.4);
  bus.gain.setValueAtTime(0.5, t + Math.max(0.4, sec - 0.6));
  bus.gain.exponentialRampToValueAtTime(0.0001, t + sec);
  const top = c.createBiquadFilter();
  top.type = "lowpass";
  top.frequency.value = 2400;
  bus.connect(top).connect(o);
  for (let v = 0; v < 7; v++) {
    const osc = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
    osc.type = "sawtooth";
    const pitch = 105 + Math.random() * 150;
    osc.frequency.setValueAtTime(pitch, t);
    p.pan.value = Math.random() * 1.6 - 0.8;
    g.gain.setValueAtTime(0, t);
    // Syllables: a bump of sound every fifth of a second or so, the pitch moving with each, and a breath between phrases.
    let at = t + Math.random() * 0.5;
    while (at < t + sec - 0.2) {
      const n = 2 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n && at < t + sec - 0.2; k++) {
        const len = 0.09 + Math.random() * 0.1, loud = 0.05 + Math.random() * 0.07;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(loud, at + len * 0.3);
        g.gain.linearRampToValueAtTime(0, at + len);
        osc.frequency.setValueAtTime(pitch * (0.9 + Math.random() * 0.35), at);
        at += len + 0.02 + Math.random() * 0.06;
      }
      at += 0.25 + Math.random() * 0.6;
    }
    const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
    f1.type = f2.type = "bandpass";
    f1.frequency.value = 450 + Math.random() * 350;
    f2.frequency.value = 1100 + Math.random() * 700;
    f1.Q.value = 5;
    f2.Q.value = 7;
    osc.connect(f1).connect(g);
    osc.connect(f2).connect(g);
    g.connect(p).connect(bus);
    osc.start(t);
    osc.stop(t + sec + 0.1);
  }
  alarmStops.push(() => {
    const n = c.currentTime;
    bus.gain.cancelScheduledValues(n);
    bus.gain.setTargetAtTime(0.0001, n, 0.05);
  });
}

/** The ground lurches: the island's timbers and rock groan, and something heavy shifts. Up (run 7) it is shorter and rises. */
export function lurchGroan(up = false) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  thump(up ? 0.3 : 0.55);
  const t = c.currentTime, len = up ? 0.6 : 1.1;
  for (const [f, g] of [[58, 0.22], [87, 0.12], [131, 0.05]] as const) {
    const osc = c.createOscillator(), gn = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(up ? f * 0.8 : f * 1.25, t);
    osc.frequency.exponentialRampToValueAtTime(up ? f * 1.2 : f * 0.72, t + len);
    // A creak: the tone wavers as the wood gives.
    const wob = c.createOscillator(), wg = c.createGain();
    wob.frequency.value = 9 + f / 20;
    wg.gain.value = f * 0.06;
    wob.connect(wg).connect(osc.frequency);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    env(c, gn, g * (up ? 0.6 : 1), 0.08, len, t);
    osc.connect(lp).connect(gn).connect(o);
    osc.start(t);
    wob.start(t);
    osc.stop(t + len + 0.2);
    wob.stop(t + len + 0.2);
  }
  noise(up ? 0.08 : 0.2, "lowpass", 300, len);
  if (!up) for (let i = 0; i < 3; i++) setTimeout(() => noise(0.07, "bandpass", 500 + Math.random() * 600, 0.07, Math.random() * 1.4 - 0.7), 250 + i * 170);
}

/** The comet: a rising rush for `sec` seconds, then nothing (the strike is its own sound). */
export function cometFall(sec: number) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const len = Math.ceil(c.sampleRate * sec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(260, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(1500, c.currentTime + sec);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.5, c.currentTime + sec);
  src.connect(f).connect(g).connect(o);
  src.start();
}

/** The strike: a deep hit, a long rumble under it, and stones settling. */
export function cometStrike() {
  if (!out()) return;
  thump(0.7);
  strike(46, 0.5, 0, [
    [1, 1, 1.6],
    [1.5, 0.4, 0.9],
  ]);
  noise(0.5, "lowpass", 260, 1.8);
  noise(0.2, "bandpass", 1200, 0.25);
  for (let i = 0; i < 5; i++) setTimeout(() => noise(0.06, "bandpass", 400 + Math.random() * 500, 0.08, Math.random() * 1.2 - 0.6), 500 + i * 190 + Math.random() * 120);
}

let eyeStop: ((sec: number) => void) | null = null;

/**
 * Under the eye, while it searches: a low, beating drone (two sines a little out of tune), a thin
 * high tone that wavers in and out, and a slow breath of noise. Swells toward the moment it fixes.
 */
export function eyeDrone(sec = 2.5) {
  eyeDroneOff(0.05);
  const s = out();
  if (!s) return;
  const { c, o } = s;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(SOUND.eyeGain, t + sec);
  // Swell a little into the fix (EYE_FIX is ~8.9 s in).
  g.gain.setValueAtTime(SOUND.eyeGain, t + 6);
  g.gain.exponentialRampToValueAtTime(SOUND.eyeGain * 1.6, t + 8.8);
  g.connect(o);
  const stops: AudioScheduledSourceNode[] = [];
  const osc = (type: OscillatorType, f: number, gain: number, dest: AudioNode = g) => {
    const x = c.createOscillator();
    x.type = type;
    x.frequency.value = f;
    const xg = c.createGain();
    xg.gain.value = gain;
    x.connect(xg).connect(dest);
    x.start(t);
    stops.push(x);
    return { x, xg };
  };
  // The drone: D1-ish and a hair sharp of it, so it beats slowly; a tritone above, very quiet.
  osc("sine", 36.71, 0.9);
  osc("sine", 37.3, 0.7);
  osc("triangle", 51.91, 0.18);
  // The thin high tone, drifting in pitch and coming and going.
  const hi = osc("sine", 1174.7, 0.0);
  const wob = c.createOscillator();
  wob.frequency.value = 0.23;
  const wobD = c.createGain();
  wobD.gain.value = 14;
  wob.connect(wobD).connect(hi.x.frequency);
  wob.start(t);
  stops.push(wob);
  const trem = c.createOscillator();
  trem.frequency.value = 0.31;
  const tremD = c.createGain();
  tremD.gain.value = 0.035;
  trem.connect(tremD).connect(hi.xg.gain);
  trem.start(t);
  stops.push(trem);
  // A slow breath of low noise.
  const len = c.sampleRate * 3;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) d[i] = b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
  const n = c.createBufferSource();
  n.buffer = buf;
  n.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 160;
  bp.Q.value = 1.5;
  const ng = c.createGain();
  ng.gain.value = 0.5;
  const breath = c.createOscillator();
  breath.frequency.value = 0.17;
  const breathD = c.createGain();
  breathD.gain.value = 0.45;
  breath.connect(breathD).connect(ng.gain);
  n.connect(bp).connect(ng).connect(g);
  n.start(t);
  breath.start(t);
  stops.push(n, breath);
  eyeStop = (fade) => {
    const now = c.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    for (const x of stops) x.stop(now + fade + 0.05);
  };
}

/** The eye's drone stops: a hard cut at the cut to black, or a short fade on skip. */
export function eyeDroneOff(sec = 0.05) {
  eyeStop?.(sec);
  eyeStop = null;
}
