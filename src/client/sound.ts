// Story sound, made in code with WebAudio (no audio files), plus a slot for music files.
// "A pull is a held breath and a bank is the breath out." Every chime is in D major
// pentatonic, so it sits in tune with the music (100 BPM, D major: one beat per 600 ms tick).
// Browsers only allow sound after a tap or key press, so nothing plays before the first one.
// All the numbers that set the feel are in SOUND.

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
  // Hesta's "Now." in place of her two-note cue ("Now.", "Now, Rook.", "...left you one. Now."), not "Now pull."
  { who: "Hesta", match: /(^|\. )Now[.,]/, src: "voice/hesta-now.mp3" },
];

/** A line appears: its clip if it has one, else Hesta's "Now" cue or the speaker's babble. */
export function speak(who: string, text: string, now = false) {
  const v = VOICE.find((c) => c.who === who && c.match.test(text));
  if (v) {
    if (!out()) return;
    const a = new Audio(v.src);
    a.volume = SOUND.volume;
    a.muted = muted;
    void a.play().catch(() => {});
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
