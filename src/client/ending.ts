// The Grand Kindling's ending, and the picture that opens Lumi's lesson. Built from paintings that
// don't exist yet: each slot loads public/story/<slot>.webp if it's there, and shows a labelled
// placeholder card if not, so the timing can be judged now. The brief is the run 1 ending design
// card (project files gameplay/run1-ending-cutscene.md).

import type { StoryLine } from "../engine/protocol.js";
import { EYE_CUT, EYE_FIX, loadEye, type Eye } from "./eye-rig.js";
import * as sound from "./sound.js";

/** The ending as first built: the music fades slowly from the last bell, the sky holds about 6 s,
 *  and the wind comes in before the rim. Kept so it is one switch away: ?ending=old, or the
 *  testing menu on the home screen (ENDING_CUTS). */
const ENDING_OLD = {
  /** Lines: Lumi's bell, Hesta's "Look up, Rook.", and Lumi's count over the sky. */
  lineAt: [0.2, 3.4, 15.5],
  lineFor: 4.5,
  /** Leftover wisps lift off and stream into the brazier, one after another. */
  stream: { from: 0.6, each: 0.25, fly: 1.6 },
  /** The game camera lifts off the board and tilts up. */
  lift: { from: 4, to: 9 },
  ring: { in: 8, inFor: 1.5, pull: 1 },
  sky: { in: 13, inFor: 1.5, panTo: 21.5 },
  /** Over Fairy Ring's rim and down its underside, the veins leading to its heart. */
  underside: { in: 20.5, inFor: 1.2, to: 26 },
  /** Below it all: the hearts overhead shrink to points as the clouds slide past; then dark. */
  hearts: { in: 25.5, inFor: 1, to: 31 },
  descent: { from: 26.5, to: 31, wind: 20 },
  dark: 31,
  /** The eye (client/eye-rig.ts, its own 11.3 s of timing): it starts in the dark, opens, looks
   *  around, blinks, and fixes on the islands (the low note), then cuts to black. */
  eye: 31,
  title: 44,
  buttons: 46,
  /** Music: null keeps the old slow fade from the last bell (main.ts, SOUND.endMusicFade). */
  /** pieceAt: when music/kindling-ending's own 0 s plays, in seconds from the bell. Negative skips
   *  into the file, positive waits; for lining its swell up with the sky without re-exporting. */
  music: null as null | { duck: number; duckTo: number; duckFor: number; cut: number; cutFor: number; pieceAt: number },
  /** The new order only: the crew's faces, before the sky and with Lumi's count, and Fairy Ring
   *  pulling away after them (ring.to, scaling from ring.pull to 1). Null keeps the old order. */
  faces: null as null | { one: number; two: number },
  /** Lumi's lantern before run 2: how long it holds before play, and its fade. */
  lantern: { hold: 4, fade: 1.2, matchScale: 2.7, beat: 0.5, ease: 2.5 },
};

/** The emotion test, step 1 (story/cutscene-emotion-brief.md): the music stays at full through
 *  "Look up, Rook." and the sky, drops to a third just before Lumi's count (1.5 s of no words, then
 *  her line, then the picture held 2 s), and cuts dead as the view goes over the rim. Wind only from
 *  there. The sky holds about 9.5 s. Everything from the rim on is 3.5 s later than before. */
const ENDING_TEST: typeof ENDING_OLD = {
  ...ENDING_OLD,
  lineAt: [0.2, 3.4, 19.5],
  sky: { in: 13, inFor: 1.5, panTo: 25 },
  underside: { in: 24, inFor: 1.2, to: 29.5 },
  hearts: { in: 29, inFor: 1, to: 34.5 },
  descent: { from: 30, to: 34.5, wind: 24 },
  dark: 34.5,
  eye: 34.5,
  title: 47.5,
  buttons: 49.5,
  music: { duck: 17.5, duckTo: 0.33, duckFor: 0.5, cut: 24, cutFor: 0.4, pieceAt: 0 },
};

/** The emotion test, step 2: the new order, about 60 s. Last bell; "Look up, Rook." as the camera
 *  lifts; a hard cut to the crew's faces (kindling-faces-1, 4 s); the sky cross-fades in and holds
 *  9 s with no words; the music drops and it cuts to kindling-faces-2 for Lumi's count; then Fairy
 *  Ring, pulling away; over the rim the music stops, and the rest runs as before. Cuts on picture
 *  changes, cross-fades into the sky and the dark. */
const ENDING_ORDER: typeof ENDING_OLD = {
  ...ENDING_OLD,
  lineAt: [0.2, 3.4, 26],
  lift: { from: 4, to: 9 },
  faces: { one: 9.5, two: 24.5 },
  sky: { in: 13.5, inFor: 1.5, panTo: 24.5 },
  ring: { in: 30.5, inFor: 0, pull: 1.3 },
  underside: { in: 35, inFor: 0.05, to: 40.5 },
  hearts: { in: 40, inFor: 1, to: 45.5 },
  descent: { from: 41, to: 45.5, wind: 35 },
  dark: 45.5,
  eye: 45.5,
  title: 58.5,
  buttons: 60.5,
  music: { duck: 24, duckTo: 0.33, duckFor: 0.5, cut: 35, cutFor: 0.4, pieceAt: 0 },
};

/** The three cuts, for the testing menu on the home screen. */
export const ENDING_CUTS = [
  { id: "test", name: "Music test (old order, music held)", cut: ENDING_TEST },
  { id: "order", name: "New order (faces, sky, count, ring; faces are placeholders)", cut: ENDING_ORDER },
  { id: "old", name: "As first built", cut: ENDING_OLD },
] as const;
const CUT_KEY = "lanternfall.endingCut";

/** Which ending plays: ?ending=old|test|order, else the one picked on the home screen, else the music
 *  test. The new order becomes the default once kindling-faces-1 and -2 are painted (two labelled
 *  placeholder cards mid-ending read worse than the original). */
export function endingCut(): (typeof ENDING_CUTS)[number]["id"] {
  let id: string | null = null;
  try {
    id = new URLSearchParams(location.search).get("ending") ?? localStorage.getItem(CUT_KEY);
  } catch {
    /* private window */
  }
  return ENDING_CUTS.find((c) => c.id === id)?.id ?? "test";
}

/** Seconds from the last bell. Change the timing here. */
export let ENDING = ENDING_CUTS.find((c) => c.id === endingCut())!.cut;

export function setEndingCut(id: string) {
  const c = ENDING_CUTS.find((x) => x.id === id);
  if (!c) return;
  ENDING = c.cut;
  try {
    localStorage.setItem(CUT_KEY, id);
  } catch {
    /* private window */
  }
}

/** The underside's two hearts (Ladi's painting): the small one under the Kindling ground catches a
 *  beat ahead of the big one at the tip (the story thread). Seconds after the underside comes in.
 *  focus: where across the painting the view is centred, from the small heart to the tip, for
 *  screens narrower than the picture; it starts moving across at `across`. */
const TWO_HEARTS = { small: [0.6, 2], big: 2, focus: [0.3, 0.64], across: 1.5 };

const SEEN = "lanternfall.kindlingEnd";
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (k: number) => k * k * (3 - 2 * k);

/** A picture slot: the painting if it exists, else a placeholder card that says which slot it is. */
export function card(slot: string, cls: string, inner = "") {
  const el = document.createElement("div");
  el.className = `card ${cls}`;
  el.innerHTML = `${inner}<i class="ph">placeholder · ${slot}</i>`;
  const img = new Image();
  img.onload = () => {
    el.style.backgroundImage = `url(story/${slot}.webp)`;
    el.classList.add("real");
  };
  img.src = `story/${slot}.webp`;
  return el;
}

/** How bright Fairy Ring burns: the four sky tiers. */
export const skyTier = (sky: number) => (sky >= 0.9 ? 3 : sky >= 0.55 ? 2 : sky >= 0.25 ? 1 : 0);

export interface EndingHooks {
  /** The caption's HTML for a line: portrait, name and text. */
  html(l: StoryLine): string;
  speak(l: StoryLine): void;
  playAgain(): void;
  leave(): void;
  /** The title card's main button, if not "Play again" (Part 1's chain: "Continue"). */
  againLabel?: string;
}

export class KindlingEnding {
  readonly root = document.createElement("div");
  private t0 = performance.now();
  private raf = 0;
  private fired = new Set<string>();
  private els: Record<string, HTMLElement> = {};
  private caption: HTMLElement;
  private skipAt: number | null = null;
  private skipOffset = 0;
  private readonly skippable: boolean;
  private eye: Eye | null = null;
  /** Fairy Ring's heart: one of the four tiers. */
  private heart = 1;

  constructor(
    readonly end: { sky?: number; lines: StoryLine[] },
    private hooks: EndingHooks,
  ) {
    const sky = end.sky ?? 0;
    const r = this.root;
    r.id = "ending";
    const islands = ["#ffb24a", "#7fd3ff", "#9cf29a", "#ff7a6b", "#d6a8ff", "#ffe68a", "#7fffe0"]
      .map((c, i) => `radial-gradient(circle at ${8 + i * 14}% ${38 + ((i * 37) % 30)}%, ${c} 0 0.6%, ${c}66 1.6%, transparent 5%)`)
      .join(",");
    const add = (k: string, el: HTMLElement) => r.appendChild((this.els[k] = el));
    add("ring", card("kindling-ring", "ring", `<div class="lamp"></div>`));
    add("sky", card("kindling-sky", "sky"));
    add("faces1", card("kindling-faces-1", "faces"));
    add("faces2", card("kindling-faces-2", "faces"));
    add("underside", card("kindling-underside", "underside", `<div class="tip"></div>`));
    add("heartSmall", card("kindling-heart-small", "heart"));
    add("heartBig", card("kindling-heart-big", "heart", `<div class="spark"></div>`));
    add("back", Object.assign(document.createElement("div"), { className: "black" }));
    add("hearts", card("kindling-hearts", "hearts"));
    // Fairy Ring's heart among them, as bright as the score (the same layer lights it in the eye).
    add("mine", card("kindling-eye-glint", "hearts-glint"));
    this.els.sky!.style.setProperty("--isles", islands);
    for (const n of [1, 2, 3]) add(`cloud${n}`, card(`kindling-cloud-${n}`, `cloud c${n}`));
    add("black", Object.assign(document.createElement("div"), { className: "black" }));
    const cv = document.createElement("canvas");
    cv.className = "eye";
    add("eye", cv);
    loadEye("story/eye/").then((eye) => (this.eye = eye)).catch(() => {});
    add("out", Object.assign(document.createElement("div"), { className: "black" }));
    const title = document.createElement("div");
    title.className = "title";
    title.innerHTML = `<h1>Lanternfall</h1><div class="btns"><button class="big again">${hooks.againLabel ?? "Play again"}</button><button class="ghost leave">Leave</button></div>`;
    title.querySelector<HTMLButtonElement>(".again")!.onclick = () => hooks.playAgain();
    title.querySelector<HTMLButtonElement>(".leave")!.onclick = () => hooks.leave();
    add("title", title);
    this.caption = document.createElement("div");
    this.caption.className = "caption";
    r.appendChild(this.caption);
    // Not skippable the first time; from then on, hold to skip.
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN) === "1";
    } catch {
      /* private window */
    }
    this.skippable = seen;
    if (seen) {
      const hint = document.createElement("div");
      hint.className = "skip";
      hint.textContent = "Hold to skip";
      add("skip", hint);
      const down = () => (this.skipAt = performance.now());
      const up = () => (this.skipAt = null);
      r.addEventListener("pointerdown", down);
      r.addEventListener("pointerup", up);
      r.addEventListener("pointercancel", up);
      addEventListener("keydown", this.onKey);
      addEventListener("keyup", up);
    }
    // Brightness follows the score: Fairy Ring's painting, and its light in the eye.
    this.els.ring!.style.filter = `brightness(${0.4 + 0.2 * skyTier(sky)}) saturate(${0.7 + 0.1 * skyTier(sky)})`;
    this.heart = 0.25 + 0.25 * skyTier(sky);
    document.body.appendChild(r);
    document.body.classList.add("in-ending");
    this.loop();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!e.repeat && (e.key === " " || e.key === "Escape" || e.key === "Enter")) this.skipAt = performance.now();
  };

  /** Seconds into the ending. */
  time(now = performance.now()) {
    return (now - this.t0) / 1000 + this.skipOffset;
  }

  /** How far each leftover wisp has flown into the brazier (0 to 1), by its order. */
  stream(i: number, now?: number) {
    const s = ENDING.stream;
    return ease(ramp(this.time(now), s.from + i * s.each, s.from + i * s.each + s.fly));
  }

  /** How far the game camera has lifted and tilted up (0 to 1). */
  lift(now?: number) {
    return ease(ramp(this.time(now), ENDING.lift.from, ENDING.lift.to));
  }

  private once(k: string, t: number, at: number, f: () => void) {
    if (t >= at && !this.fired.has(k)) {
      this.fired.add(k);
      f();
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.skippable && this.skipAt !== null && now - this.skipAt > 800 && this.time(now) < ENDING.title) {
      this.skipOffset += ENDING.title - this.time(now);
      for (const k of ["wind", "eyeStart", "eye", "eyeCut"]) this.fired.add(k);
      sound.windOff(0.5);
      sound.eyeDroneOff(0.5);
      sound.stopMusic(0.5);
      this.caption.hidden = true;
    }
    this.apply(this.time(now));
  };

  private apply(t: number) {
    const E = ENDING, e = this.els;
    const op = (k: string, v: number) => (e[k]!.style.opacity = String(v));
    // Lines, one at a time, at the bottom of the screen.
    this.end.lines.forEach((l, i) => {
      const at = E.lineAt[i];
      if (at === undefined) return;
      this.once(`line${i}`, t, at, () => {
        this.caption.innerHTML = this.hooks.html(l);
        this.caption.hidden = false;
        this.caption.style.animation = "none";
        void this.caption.offsetWidth;
        this.caption.style.animation = "";
        this.hooks.speak(l);
      });
    });
    const lastLine = Math.max(...E.lineAt.filter((a) => t >= a), -99);
    this.caption.classList.toggle("fade", t > lastLine + E.lineFor);
    // Fairy Ring, then the sky crossfading over it with a slow pan.
    const F = E.faces;
    const overRim = E.underside.in + E.underside.inFor;
    if (!F) {
      op("ring", ramp(t, E.ring.in, E.ring.in + E.ring.inFor) * (1 - ramp(t, E.sky.in + E.sky.inFor, E.sky.in + E.sky.inFor + 0.1)));
      op("sky", ramp(t, E.sky.in, E.sky.in + E.sky.inFor) * (1 - ramp(t, overRim, overRim + 0.1)));
      op("faces1", 0);
      op("faces2", 0);
    } else {
      // The new order: hard cuts between pictures, except the sky, which cross-fades in.
      const skyFull = E.sky.in + E.sky.inFor;
      op("faces1", t >= F.one && t < skyFull ? 1 : 0);
      op("sky", t < F.two ? ramp(t, E.sky.in, skyFull) : 0);
      op("faces2", t >= F.two && t < E.ring.in ? 1 : 0);
      op("ring", t >= E.ring.in && t < overRim + 0.1 ? 1 : 0);
      // Fairy Ring pulls away: it starts close and eases back to the whole ring.
      e.ring!.style.transform = `scale(${E.ring.pull - (E.ring.pull - 1) * ease(ramp(t, E.ring.in, E.underside.in))})`;
    }
    const pan = ease(ramp(t, E.sky.in, E.sky.panTo));
    const down = ease(ramp(t, E.descent.from, E.descent.to));
    e.sky!.style.transform = `translate(${(0.5 - pan) * 12}%, 0)`;
    // Over the rim and down the underside to the heart, which burns as bright as the score.
    const U = E.underside, H = E.hearts;
    const under = ramp(t, U.in, U.in + U.inFor) * (1 - ramp(t, H.in, H.in + H.inFor));
    op("underside", under);
    const slide = ease(ramp(t, U.in, U.to));
    // Down the painting, and across it where the screen is narrower than the picture: from the
    // small heart under the Kindling ground to the big one at the tip. (Top to bottom as well, so
    // a screen wider than the picture is tall still ends on the tip.)
    const T = TWO_HEARTS, box = e.underside!.getBoundingClientRect();
    const size = Math.max(box.width, box.height), spare = size - box.width;
    const focus = T.focus[0]! + (T.focus[1]! - T.focus[0]!) * ease(ramp(t, U.in + T.across, U.to));
    const px = spare > 1 ? clamp((focus * size - box.width / 2) / spare) * 100 : 50;
    for (const k of ["underside", "heartSmall", "heartBig"]) {
      e[k]!.style.transform = `translateY(${-slide * 37.5}%)`;
      e[k]!.style.backgroundPosition = `${px.toFixed(2)}% ${(slide * 100).toFixed(2)}%`;
    }
    op("heartSmall", under * this.heart * ramp(t, U.in + T.small[0]!, U.in + T.small[1]!));
    op("heartBig", under * this.heart * ramp(t, U.in + T.big, U.to - 0.5));
    // From below: the hearts overhead shrink to points as the view sinks away.
    const hIn = ramp(t, H.in, H.in + H.inFor);
    op("back", hIn);
    op("hearts", hIn);
    op("mine", hIn * this.heart);
    for (const k of ["hearts", "mine"]) {
      e[k]!.style.transform = `scale(${1.5 - ease(ramp(t, H.in, H.to)) * 1.1})`;
      e[k]!.style.filter = `brightness(${1 - ramp(t, H.to - 2.5, H.to) * 0.6})`;
    }
    // The clouds slide up past the view at different speeds as it sinks.
    [1.0, 1.5, 2.2].forEach((speed, i) => {
      const k = ramp(t, E.descent.from + i * 0.6, E.descent.to);
      e[`cloud${i + 1}`]!.style.transform = `translateY(${(1 - k * speed) * 100}%)`;
      op(`cloud${i + 1}`, k > 0 && k * speed < 2 ? 0.9 : 0);
    });
    this.once("wind", t, E.descent.wind, () => sound.wind(E.music ? 1.5 : 4));
    // The emotion test's music: a third under Lumi's count, then cut dead at the rim. Ladi's ending
    // piece (music/kindling-ending), once it exists, isn't ducked (it shapes itself) but is still cut.
    if (E.music) {
      const M = E.music;
      this.once("duck", t, M.duck, () => sound.duckMusic(M.duckTo, M.duckFor));
      // The cut at the rim always happens, piece or not: the eye's note needs the silence.
      this.once("cut", t, M.cut, () => sound.stopMusic(M.cutFor));
    }
    op("black", ramp(t, E.descent.to - 1.5, E.dark));
    // The eye. It draws its own black before and after; the low note lands as it fixes on the islands.
    const et = t - E.eye;
    op("eye", et >= 0 && et < EYE_CUT + 0.5 ? 1 : 0);
    if (et >= 0 && et < EYE_CUT + 0.5) this.drawEye(et);
    this.once("eyeStart", t, E.eye, () => (sound.windOff(3), sound.eyeDrone()));
    this.once("eyeCut", t, E.eye + EYE_CUT, () => sound.eyeDroneOff());
    this.once("eye", t, E.eye + EYE_FIX, () => sound.eyeNote());
    op("out", t >= E.eye + EYE_CUT ? 1 : 0);
    op("title", ramp(t, E.title, E.title + 1.5));
    e.title!.classList.toggle("ready", t >= E.buttons);
    if (e.skip) op("skip", t > 1 && t < E.title - 1 ? 0.6 : 0);
    this.once("seen", t, E.title, () => {
      try {
        localStorage.setItem(SEEN, "1");
      } catch {
        /* private window */
      }
    });
  }

  /** One frame of the eye, square, as big as the --eye size (black fills the rest). */
  private drawEye(et: number) {
    const cv = this.els.eye as HTMLCanvasElement;
    const css = cv.getBoundingClientRect().width;
    const px = Math.round(css * Math.min(2, devicePixelRatio || 1));
    if (cv.width !== px) cv.width = cv.height = px;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    if (this.eye) this.eye.draw(ctx, px, et, this.heart);
    else (ctx.fillStyle = "#000"), ctx.fillRect(0, 0, px, px);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    removeEventListener("keydown", this.onKey);
    sound.windOff(0.5);
    sound.eyeDroneOff(0.5);
    this.root.remove();
    document.body.classList.remove("in-ending");
  }
}

/**
 * The one thing that moves in the lantern picture (cutscene brief, 1a): dust drifting in the morning
 * sun, a few dozen soft motes, slow, thickest in the light from the upper left. Nothing with reduced motion.
 * Returns a stop.
 */
function dust(el: HTMLElement): () => void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const cv = document.createElement("canvas");
  cv.className = "dust";
  el.appendChild(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) return () => cv.remove();
  const N = 46, motes = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, vx: (Math.random() - 0.3) * 0.006, vy: (Math.random() - 0.6) * 0.004, ph: Math.random() * Math.PI * 2 }));
  let raf = 0, last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const w = (cv.width = cv.clientWidth * devicePixelRatio), h = (cv.height = cv.clientHeight * devicePixelRatio);
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      m.ph += dt * 0.7;
      m.x += (m.vx + Math.sin(m.ph) * 0.002) * dt * 3;
      m.y += (m.vy + Math.cos(m.ph * 0.8) * 0.0015) * dt * 3;
      if (m.x < -0.02) m.x = 1.02;
      if (m.x > 1.02) m.x = -0.02;
      if (m.y < -0.02) m.y = 1.02;
      if (m.y > 1.02) m.y = -0.02;
      // Brighter where the sun comes in (the upper left), and each one twinkles a little as it turns.
      const sun = Math.max(0, 1 - Math.hypot(m.x - 0.25, m.y - 0.3) * 1.4);
      const a = (0.15 + 0.55 * sun) * (0.6 + 0.4 * Math.sin(m.ph * 2.3));
      ctx.fillStyle = `rgba(255, 240, 205, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.r * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => (cancelAnimationFrame(raf), cv.remove());
}

/** Run 2 opens on one picture: Lumi's unlit lantern on the kitchen table, where the eye was. */
export function lanternCard(then: () => void) {
  const el = card("lesson-lantern", "lantern", `<div class="table"></div><div class="unlit"></div>`);
  el.id = "opening";
  // A match cut from the eye: it opens close on the globe, sitting where the locked pupil was
  // (pupil ~0.44 of the eye's frame, globe ~0.164 of the lantern's), then eases out to the table.
  el.style.transform = `scale(${ENDING.lantern.matchScale})`;
  document.body.appendChild(el);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.transition = `transform ${ENDING.lantern.ease}s ease-in-out ${ENDING.lantern.beat}s`;
      el.style.transform = "scale(1)";
    }),
  );
  const stopDust = dust(el);
  setTimeout(() => {
    then();
    window.setTimeout(stopDust, ENDING.lantern.fade * 1000 + 50);
    el.style.transition = `opacity ${ENDING.lantern.fade}s`;
    el.style.transform = "scale(1)";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), ENDING.lantern.fade * 1000 + 50);
  }, ENDING.lantern.hold * 1000);
}
