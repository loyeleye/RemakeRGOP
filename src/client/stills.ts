// The reaction-stills panel (engine/stills.ts): a picture fades in over an upper corner of the map
// while play goes on, holds, and fades out. It takes no taps. Each run calls it through `still` on
// its lines; this file only shows them. A drawn picture is loaded from stills/<id>.webp when there
// is one; until then a paper card says who is in it and what their faces do.

import { STILL, STILLS, type StillCue } from "../engine/stills.js";

type Pt = { x: number; y: number };

export interface StillShow {
  cue: StillCue;
  /** The line, shown on the panel's lower edge ("" for none). */
  caption: string;
  who: string;
  /** Fade to fade. */
  ms: number;
}

/** Pictures that turned out not to be drawn yet, so they aren't asked for again. */
const missing = new Set<string>();

export class StillsPanel {
  private root: HTMLDivElement;
  private card: HTMLDivElement | null = null;
  private until = 0;
  /** Which corner it is in while it's up ("left", "right" or "top" on a portrait screen). */
  private side: "left" | "right" | "top" = "right";
  /** How far the view is eased away so it covers nothing that matters (tiles), and where it's heading. */
  shove = { x: 0, y: 0 };
  private shoveTo = { x: 0, y: 0 };
  private at: Pt | null = null;

  constructor(
    private paper: () => void,
    private base = "stills/",
  ) {
    this.root = document.createElement("div");
    this.root.id = "stills";
    this.root.setAttribute("aria-live", "polite");
    document.body.append(this.root);
  }

  get up() {
    return this.card !== null && performance.now() < this.until;
  }

  /**
   * Shows a still. `from` is the screen point it should keep away from (the wisp on his staff, or
   * else the event): the panel takes the upper corner farther from it. A sequence cross-fades in
   * place, in the same corner.
   */
  show(s: StillShow, from: Pt | null) {
    const now = performance.now();
    const portrait = innerHeight > innerWidth;
    const inPlace = !!s.cue.seq && this.up;
    if (!inPlace) this.side = portrait ? "top" : from && from.x > innerWidth / 2 ? "left" : "right";
    this.at = s.cue.at ?? null;
    this.root.className = this.side;
    const old = this.card;
    const card = document.createElement("div");
    card.className = "still";
    // A slight tilt, the same for the same picture.
    let h = 0;
    for (const ch of s.cue.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    card.style.setProperty("--tilt", `${((h % 7) - 3) * 0.35}deg`);
    card.style.setProperty("--in", `${STILL.inMs}ms`);
    card.style.setProperty("--out", `${STILL.outMs}ms`);
    const info = STILLS[s.cue.id];
    const art = document.createElement("div");
    art.className = "art";
    const ph = document.createElement("div");
    ph.className = "ph";
    ph.innerHTML = `<small>${esc(s.cue.id)}</small><b>${esc(info?.who ?? s.cue.id)}</b><span>${esc(info?.faces ?? "")}</span>`;
    art.append(ph);
    if (!missing.has(s.cue.id)) {
      const img = new Image();
      img.alt = "";
      img.onload = () => ((ph.hidden = true), art.append(img));
      img.onerror = () => missing.add(s.cue.id);
      img.src = `${this.base}${s.cue.id}.webp`;
    }
    card.append(art);
    if (s.caption) {
      const cap = document.createElement("p");
      cap.className = "cap";
      cap.innerHTML = s.who ? `<b class="${esc(s.who.toLowerCase())}">${esc(s.who)}</b> ${esc(s.caption)}` : esc(s.caption);
      card.append(cap);
    }
    this.root.append(card);
    this.card = card;
    this.until = now + s.ms;
    requestAnimationFrame(() => card.classList.add("in"));
    if (old) {
      old.classList.remove("in");
      old.classList.add("gone");
      setTimeout(() => old.remove(), STILL.outMs + 50);
    }
    // One soft paper sound as it comes, never for a sequence's next picture.
    if (!inPlace) this.paper();
    const stay = s.ms - STILL.outMs;
    window.setTimeout(() => {
      if (this.card !== card) return;
      card.classList.remove("in");
      card.classList.add("gone");
      window.setTimeout(() => {
        card.remove();
        if (this.card === card) (this.card = null), (this.at = null);
      }, STILL.outMs + 50);
    }, Math.max(0, stay));
  }

  /** Takes it down at once (leaving a run). */
  clear() {
    this.root.replaceChildren();
    this.card = null;
    this.at = null;
    this.shoveTo = { x: 0, y: 0 };
  }

  /** Where the panel is on screen, for the cover test. */
  private rect() {
    const r = this.card?.getBoundingClientRect();
    return r && r.width > 0 ? { x0: r.left - 12, y0: r.top - 12, x1: r.right + 12, y1: r.bottom + 12 } : null;
  }

  /**
   * Each frame: if the panel would cover something that matters (the brazier, his wisp, the
   * event's well), the view eases a little the other way; when it's gone, back. Never a jump.
   * `screen` turns a tile into a screen point; `scale` is pixels a tile.
   */
  step(keep: (Pt | null)[], screen: (p: Pt) => Pt, scale: number) {
    const r = this.up ? this.rect() : null;
    let dx = 0, dy = 0;
    if (r) {
      const pts = [...keep, this.at ? { x: this.at.x + 0.5, y: this.at.y + 0.5 } : null];
      for (const p of pts) {
        if (!p) continue;
        const s = screen(p);
        if (s.x < r.x0 || s.x > r.x1 || s.y < r.y0 || s.y > r.y1) continue;
        // Out the panel's open side: down for the top band, else away across.
        if (this.side === "top") dy = Math.min(dy, -(r.y1 - s.y) / scale);
        else if (this.side === "left") dx = Math.min(dx, -(r.x1 - s.x) / scale);
        else dx = Math.max(dx, (s.x - r.x0) / scale);
      }
      // A little, not a lot.
      dx = Math.max(-4, Math.min(4, dx + this.shove.x));
      dy = Math.max(-4, Math.min(4, dy + this.shove.y));
      this.shoveTo = { x: dx, y: dy };
    } else this.shoveTo = { x: 0, y: 0 };
    this.shove.x += (this.shoveTo.x - this.shove.x) * 0.06;
    this.shove.y += (this.shoveTo.y - this.shove.y) * 0.06;
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
