// The Grand Kindling's ending, and the picture that opens Lumi's lesson. Built from paintings that
// don't exist yet: each slot loads public/story/<slot>.webp if it's there, and shows a labelled
// placeholder card if not, so the timing can be judged now. The brief is the run 1 ending design
// card (project files gameplay/run1-ending-cutscene.md).

import type { StoryLine } from "../engine/protocol.js";
import { EYE_CUT, EYE_FIX, loadEye, type Eye } from "./eye-rig.js";
import * as sound from "./sound.js";

/** The ending as first built: the music fades slowly from the last bell, the sky holds about 6 s,
 *  and the wind comes in before the rim. Kept so the emotion test is one switch away: set
 *  `ENDING_TEST` to false, or open the page with ?ending=old. */
const ENDING_OLD = {
  /** Lines: Lumi's bell, Hesta's "Look up, Rook.", and Lumi's count over the sky. */
  lineAt: [0.2, 3.4, 15.5],
  lineFor: 4.5,
  /** Leftover wisps lift off and stream into the brazier, one after another. */
  stream: { from: 0.6, each: 0.25, fly: 1.6 },
  /** The game camera lifts off the board and tilts up. */
  lift: { from: 4, to: 9 },
  ring: { in: 8, inFor: 1.5 },
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
  music: null as null | { duck: number; duckTo: number; duckFor: number; cut: number; cutFor: number },
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
  music: { duck: 17.5, duckTo: 0.33, duckFor: 0.5, cut: 24, cutFor: 0.4 },
};

/** Which ending plays. true: the emotion test. false (or ?ending=old): the ending as first built. */
const USE_TEST = (() => {
  try {
    return new URLSearchParams(location.search).get("ending") !== "old";
  } catch {
    return true;
  }
})();

/** Seconds from the last bell. Change the timing here. */
export const ENDING = USE_TEST ? ENDING_TEST : ENDING_OLD;

const SEEN = "lanternfall.kindlingEnd";
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (k: number) => k * k * (3 - 2 * k);

/** A picture slot: the painting if it exists, else a placeholder card that says which slot it is. */
function card(slot: string, cls: string, inner = "") {
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
    add("underside", card("kindling-underside", "underside", `<div class="tip"></div>`));
    add("heart", card("kindling-heart", "heart", `<div class="spark"></div>`));
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
    title.innerHTML = `<h1>Lanternfall</h1><div class="btns"><button class="big again">Play again</button><button class="ghost leave">Leave</button></div>`;
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
    op("ring", ramp(t, E.ring.in, E.ring.in + E.ring.inFor) * (1 - ramp(t, E.sky.in + E.sky.inFor, E.sky.in + E.sky.inFor + 0.1)));
    op("sky", ramp(t, E.sky.in, E.sky.in + E.sky.inFor) * (1 - ramp(t, E.underside.in + E.underside.inFor, E.underside.in + E.underside.inFor + 0.1)));
    const pan = ease(ramp(t, E.sky.in, E.sky.panTo));
    const down = ease(ramp(t, E.descent.from, E.descent.to));
    e.sky!.style.transform = `translate(${(0.5 - pan) * 12}%, 0)`;
    // Over the rim and down the underside to the heart, which burns as bright as the score.
    const U = E.underside, H = E.hearts;
    const under = ramp(t, U.in, U.in + U.inFor) * (1 - ramp(t, H.in, H.in + H.inFor));
    op("underside", under);
    const slide = ease(ramp(t, U.in, U.to));
    for (const k of ["underside", "heart"]) e[k]!.style.transform = `translateY(${-slide * 37.5}%)`;
    op("heart", under * this.heart * ramp(t, U.in + 1, U.to - 0.5));
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
    // The emotion test's music: a third under Lumi's count, then cut dead at the rim.
    if (E.music) {
      const M = E.music;
      this.once("duck", t, M.duck, () => sound.duckMusic(M.duckTo, M.duckFor));
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
  setTimeout(() => {
    then();
    el.style.transition = `opacity ${ENDING.lantern.fade}s`;
    el.style.transform = "scale(1)";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), ENDING.lantern.fade * 1000 + 50);
  }, ENDING.lantern.hold * 1000);
}
