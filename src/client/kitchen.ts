// Rook's kitchen, from walk 2 (story/part1-lore-beats.md, beat 2; Ladi picked "Kitchen as a tappable
// still"). Tapping his door shows one picture full screen, with three things to tap, each once a walk:
// Rosalind's portrait (no words; her close-up if it's painted), her cup, and Lumi's lantern. Lumi
// answers from the doorway in bubbles, not voiced. The house stays a closed model.

import type { StoryLine } from "../engine/protocol.js";
import { card } from "./ending.js";

/** The three things, as boxes on the picture (percent of its width and height). The picture is square
 *  and shown whole (black either side), so the boxes hold on any screen. From the cutscene art thread's
 *  draft (kitchen-tappable-walk2-draft-2.png, 1536 px): portrait 496,636–690,856; cup 655,485–785,625;
 *  lantern 910,720–1155,1130. */
const px = (x0: number, y0: number, x1: number, y1: number) => [x0 / 15.36, y0 / 15.36, (x1 - x0) / 15.36, (y1 - y0) / 15.36] as const;
export const KITCHEN = {
  slot: "walk-kitchen",
  /** Rosalind's close-up, shown for `for` seconds if story/walk-kitchen-portrait.webp exists. */
  portrait: { slot: "walk-kitchen-portrait", for: 4, fade: 0.8 },
  /** How long a bubble stays up. */
  bubbleFor: 3.5,
  spots: [
    { id: "portrait", label: "Rosalind's portrait", box: px(496, 636, 690, 856), line: null },
    { id: "cup", label: "Her cup", box: px(655, 485, 785, 625), line: "Don't. That one stays on its hook." },
    { id: "lantern", label: "The lantern", box: px(910, 720, 1155, 1130), line: "It was Mum's. It used to sit in the window." },
  ],
} as const;

/** Which of the three Rook has already tapped, by walk: once each, per walk. */
const used = new Map<number, Set<string>>();

export class Kitchen {
  readonly root = document.createElement("div");
  private bubble: HTMLElement;
  private timer = 0;

  constructor(
    private walk: number,
    private faceHtml: (l: StoryLine) => string,
    private onClose: () => void,
  ) {
    const r = this.root;
    r.id = "kitchen";
    const pic = card(KITCHEN.slot, "pic");
    r.appendChild(pic);
    const done = used.get(walk) ?? new Set<string>();
    used.set(walk, done);
    for (const s of KITCHEN.spots) {
      const b = document.createElement("button");
      b.className = "spot";
      b.setAttribute("aria-label", s.label);
      const [x, y, w, h] = s.box;
      Object.assign(b.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
      b.innerHTML = `<i class="ph">${s.label}</i>`;
      b.onclick = (e) => {
        e.stopPropagation();
        if (done.has(s.id)) return;
        done.add(s.id);
        b.classList.add("used");
        if (s.line) this.say({ who: "Lumi", text: s.line });
        else this.showPortrait();
      };
      if (done.has(s.id)) b.classList.add("used");
      pic.appendChild(b);
    }
    this.bubble = document.createElement("div");
    this.bubble.className = "bark lumi kbubble";
    this.bubble.hidden = true;
    r.appendChild(this.bubble);
    const back = document.createElement("button");
    back.className = "ghost small back";
    back.textContent = "← Outside";
    back.onclick = () => this.close();
    r.appendChild(back);
    addEventListener("keydown", this.onKey, true);
    document.body.appendChild(r);
    requestAnimationFrame(() => r.classList.add("in"));
  }

  private onKey = (e: KeyboardEvent) => {
    // The game's keys don't walk Rook about behind the picture.
    e.stopImmediatePropagation();
    if (e.key === "Escape" || e.key === "Backspace") this.close();
  };

  /** Lumi, from the doorway: a bubble at the bottom left, as in the walks (not voiced). */
  private say(l: StoryLine) {
    this.bubble.innerHTML = `${this.faceHtml(l)}<span>${l.text}</span>`;
    this.bubble.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.bubble.hidden = true), KITCHEN.bubbleFor * 1000);
  }

  /** Her portrait: no words. Her close-up over the kitchen for a few seconds, if it's painted. */
  private showPortrait() {
    const P = KITCHEN.portrait;
    const img = new Image();
    img.onload = () => {
      const el = document.createElement("div");
      el.className = "close-up";
      el.style.backgroundImage = `url(${img.src})`;
      this.root.appendChild(el);
      requestAnimationFrame(() => el.classList.add("in"));
      setTimeout(() => {
        el.style.transition = `opacity ${P.fade}s`;
        el.classList.remove("in");
        setTimeout(() => el.remove(), P.fade * 1000 + 50);
      }, P.for * 1000);
    };
    img.src = `story/${P.slot}.webp`;
  }

  close() {
    clearTimeout(this.timer);
    removeEventListener("keydown", this.onKey, true);
    this.root.remove();
    this.onClose();
  }
}
