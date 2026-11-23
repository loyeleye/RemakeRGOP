// The Grand Kindling's ending, and the picture that opens Lumi's lesson. Built from paintings that
// don't exist yet: each slot loads public/story/<slot>.webp if it's there, and shows a labelled
// placeholder card if not, so the timing can be judged now. The brief is the run 1 ending design
// card (project files gameplay/run1-ending-cutscene.md).

import type { StoryLine } from "../engine/protocol.js";
import * as sound from "./sound.js";

/** Seconds from the last bell. Change the timing here. */
export const ENDING = {
  /** Lines: Lumi's bell, Hesta's "Look up, Rook.", and Lumi's count over the sky. */
  lineAt: [0.2, 3.4, 15.5],
  lineFor: 4.5,
  /** Leftover wisps lift off and stream into the brazier, one after another. */
  stream: { from: 0.6, each: 0.25, fly: 1.6 },
  /** The game camera lifts off the board and tilts up. */
  lift: { from: 4, to: 9 },
  ring: { in: 8, inFor: 1.5 },
  sky: { in: 13, inFor: 1.5, panTo: 23 },
  /** Down through the clouds, as the sound thins to wind; then dark. */
  descent: { from: 22, to: 29, wind: 21.5 },
  dark: 29,
  /** The eye: shut, a slit, open (with the low note). */
  eye: [31, 33.5, 35.5],
  eyeOut: 40,
  title: 42,
  buttons: 44,
  /** Lumi's lantern before run 2: how long it holds before play, and its fade. */
  lantern: { hold: 3, fade: 1.2 },
};

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
    this.els.sky!.style.setProperty("--isles", islands);
    for (const n of [1, 2, 3]) add(`cloud${n}`, card(`kindling-cloud-${n}`, `cloud c${n}`));
    add("black", Object.assign(document.createElement("div"), { className: "black" }));
    for (const n of [1, 2, 3]) add(`eye${n}`, card(`kindling-eye-${n}`, `eye e${n}`, `<div class="lid"><div class="pupil"></div></div>`));
    add("glint", card("kindling-eye-glint", "glint", `<div class="spark"></div>`));
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
    this.els.ring!.style.filter = `brightness(${0.45 + 0.25 * skyTier(sky)}) saturate(${0.8 + 0.1 * skyTier(sky)})`;
    this.els.glint!.style.setProperty("--glint", String(0.25 + 0.75 * sky));
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
      for (const k of ["descent", "dark", "eye"]) this.fired.add(k);
      sound.windOff(0.5);
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
    op("sky", ramp(t, E.sky.in, E.sky.in + E.sky.inFor));
    const pan = ease(ramp(t, E.sky.in, E.sky.panTo));
    const down = ease(ramp(t, E.descent.from, E.descent.to));
    e.sky!.style.transform = `translate(${-pan * 22}%, ${-down * 60}%)`;
    e.sky!.style.filter = `brightness(${1 - down * 0.8})`;
    // The clouds slide up past the view at different speeds as it sinks.
    [1.0, 1.5, 2.2].forEach((speed, i) => {
      const k = ramp(t, E.descent.from + i * 0.6, E.descent.to);
      e[`cloud${i + 1}`]!.style.transform = `translateY(${(1 - k * speed) * 100}%)`;
      op(`cloud${i + 1}`, k > 0 && k * speed < 2 ? 0.9 : 0);
    });
    this.once("wind", t, E.descent.wind, () => sound.wind(4));
    op("black", ramp(t, E.descent.to - 1.5, E.dark));
    // The eye: shut, a slit, open.
    const [a, b, c] = E.eye as unknown as [number, number, number];
    op("eye1", ramp(t, a, a + 1) * (1 - ramp(t, b, b + 0.4)));
    op("eye2", ramp(t, b, b + 0.4) * (1 - ramp(t, c, c + 0.6)));
    op("eye3", ramp(t, c, c + 0.6));
    op("glint", ramp(t, c + 0.4, c + 2));
    this.once("eye", t, c, () => {
      sound.windOff(2);
      sound.eyeNote();
    });
    op("out", ramp(t, E.eyeOut, E.eyeOut + 1.2));
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

  stop() {
    cancelAnimationFrame(this.raf);
    removeEventListener("keydown", this.onKey);
    sound.windOff(0.5);
    this.root.remove();
    document.body.classList.remove("in-ending");
  }
}

/** Run 2 opens on one picture: Lumi's unlit lantern on the kitchen table, where the eye was. */
export function lanternCard(then: () => void) {
  const el = card("lesson-lantern", "lantern", `<div class="table"></div><div class="unlit"></div>`);
  el.id = "opening";
  document.body.appendChild(el);
  setTimeout(() => {
    then();
    el.style.transition = `opacity ${ENDING.lantern.fade}s`;
    el.style.opacity = "0";
    setTimeout(() => el.remove(), ENDING.lantern.fade * 1000 + 50);
  }, ENDING.lantern.hold * 1000);
}
