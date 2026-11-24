// Story sound, made in code with WebAudio (no audio files), plus a slot for music files.
// "A pull is a held breath and a bank is the breath out." Every chime is in D major
// pentatonic, so it sits in tune with the music (100 BPM, D major: one beat per 600 ms tick).
// Browsers only allow sound after a tap or key press, so nothing plays before the first one.
// All the numbers that set the feel are in SOUND.

import { VOICE_LINES } from "./voice-lines.js";

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
  { who: "Rook", match: /^How did you do that\?$/, src: "voice/rook-how.mp3" },
  { who: "Rook", match: /^Let's call it for now\. We can try again tomorrow\.$/, src: "voice/rook-call-it.mp3" },
];

/** The voice clip playing now. One voice at a time: a line that comes while it plays stays silent. */
let voicing: HTMLAudioElement | null = null;
const voiceBusy = () => voicing != null && !voicing.ended && !voicing.paused;

/** A line appears: its clip if it has one, else Hesta's "Now" cue or the speaker's babble. */
export function speak(who: string, text: string, now = false) {
  // Someone is still talking: don't talk over them (the text still shows).
  if (voiceBusy()) return;
  // An exact whole-line clip wins; then a pattern; else the babble.
  const src = VOICE_LINES[`${who}|${text}`] ?? VOICE.find((c) => c.who === who && c.match.test(text))?.src;
  if (src) {
    if (!out()) return;
    const a = new Audio(src);
    a.volume = SOUND.volume;
    a.muted = muted;
    voicing = a;
    const done = () => { if (voicing === a) voicing = null; };
    a.addEventListener("ended", done);
    a.addEventListener("error", done);
    void a.play().catch(done);
    return;
  }
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
  for (let k = 0; k < n; k++) {
    const f = pool[Math.floor(Math.random() * pool.length)]!;
    strike(f, SOUND.babbleGain * (hesta ? 1.3 : 1), hesta ? 0.15 : -0.15, [
      [1, 1, hesta ? 0.09 : 0.06],
      [2, 0.2, 0.04],
    ], undefined, s.c.currentTime + k * gap);
  }
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
