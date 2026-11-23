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
  /**
   * The pull: a faint, airy shimmer (a high D and A that slowly breathe, over a whisper of
   * wind), with a soft echo. It brightens a little as the wisp nears the brazier.
   */
  humGain: 0.035,
  /** The wind's pitch far out, and at the brazier. */
  airFrom: 900,
  airTo: 1800,
  /** Music volume, and how long it fades under Lumi's bell. */
  musicGain: 0.5,
  musicFade: 1.5,
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

/** The staff takes hold: a soft pluck. */
export function catchClick() {
  strike(1174.66, 0.12, 0, [
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

// The pull: a quiet, mystical shimmer while Rook holds a pull.
let hum: { stop: (at: number) => void; g: GainNode; air: BiquadFilterNode; shine: GainNode } | null = null;

/** Shimmer while pulling; `near` is 0 far out to 1 at the brazier. Null stops it. */
export function pullHum(near: number | null) {
  const s = out();
  if (!s) return;
  const { c, o } = s;
  if (near === null) {
    if (hum) {
      const h = hum;
      hum = null;
      h.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.12);
      h.stop(c.currentTime + 1.2);
    }
    return;
  }
  if (!hum) {
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(SOUND.humGain, t, 0.25);
    // A soft echo, darkened, so it hangs in the air.
    const dly = c.createDelay(1);
    dly.delayTime.value = 0.27;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const dark = c.createBiquadFilter();
    dark.type = "lowpass";
    dark.frequency.value = 2400;
    g.connect(o);
    g.connect(dly).connect(dark).connect(fb).connect(dly);
    dark.connect(o);
    const nodes: AudioScheduledSourceNode[] = [];
    // The shimmer: D5 and A5, each breathing slowly at its own rate, with a slight waver.
    const shine = c.createGain();
    shine.gain.value = 0.55;
    shine.connect(g);
    for (const [f, rate, pan] of [
      [587.33, 0.23, -0.25],
      [880.0, 0.31, 0.25],
      [1174.66, 0.17, 0],
    ] as const) {
      const x = c.createOscillator();
      x.type = "sine";
      x.frequency.value = f;
      const vib = c.createOscillator();
      vib.frequency.value = 4.5;
      const vibAmt = c.createGain();
      vibAmt.gain.value = f * 0.002;
      vib.connect(vibAmt).connect(x.frequency);
      const amp = c.createGain();
      amp.gain.value = f > 1000 ? 0.12 : 0.3;
      const lfo = c.createOscillator();
      lfo.frequency.value = rate;
      const lfoAmt = c.createGain();
      lfoAmt.gain.value = amp.gain.value * 0.8;
      lfo.connect(lfoAmt).connect(amp.gain);
      const p = c.createStereoPanner();
      p.pan.value = pan;
      x.connect(amp).connect(p).connect(shine);
      for (const n of [x, vib, lfo]) {
        n.start(t);
        nodes.push(n);
      }
    }
    // The wind: looped noise through a narrow band that rises as the wisp comes home.
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const air = c.createBiquadFilter();
    air.type = "bandpass";
    air.Q.value = 9;
    air.frequency.value = SOUND.airFrom;
    const airG = c.createGain();
    airG.gain.value = 0.5;
    src.connect(air).connect(airG).connect(g);
    src.start(t);
    nodes.push(src);
    hum = { g, air, shine, stop: (at) => nodes.forEach((n) => n.stop(at)) };
  }
  const k = Math.max(0, Math.min(1, near));
  hum.air.frequency.setTargetAtTime(SOUND.airFrom + (SOUND.airTo - SOUND.airFrom) * k, c.currentTime, 0.3);
  hum.shine.gain.setTargetAtTime(0.45 + 0.35 * k, c.currentTime, 0.3);
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
