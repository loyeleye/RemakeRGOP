// Drawing the shrine on a canvas, and the camera that maps screen pixels to tiles.

import { Tile, type Board } from "../engine/board.js";
import { PULL_REACH, PUSH_REACH, type GameSnapshot } from "../engine/game.js";
import type { Shrine } from "../engine/maps.js";
import { FLAME_COLORS, type Flame } from "../engine/protocol.js";

export const GUILD_COLORS = ["#ffcf5a", "#b07cff"] as const;
export const GUILD_NAMES = ["Dawn", "Dusk"] as const;

const SPRITES = [
  "dawn-lamplighter",
  "dusk-lamplighter",
  "wisp-dawn",
  "wisp-dusk",
  "brazier",
  "rock",
  "pillar",
  "floor-moss-hollow",
  "floor-tidepool-steps",
  "floor-ember-quarry",
  "water",
  "wall",
] as const;
type SpriteName = (typeof SPRITES)[number];
const img: Partial<Record<SpriteName, HTMLImageElement>> = {};

export function loadSprites() {
  for (const n of SPRITES) {
    const i = new Image();
    i.src = `sprites/${n}.png`;
    i.onload = () => (img[n] = i);
  }
}

const ready = (n: SpriteName) => {
  const i = img[n];
  return i && i.complete && i.naturalWidth > 0 ? i : null;
};

export class Camera {
  /** Pixels per tile. */
  scale = 24;
  /** Tile coordinate at the centre of the screen. */
  cx = 13;
  cy = 13;
  follow = true;
  w = 0;
  h = 0;

  get compact() {
    return Math.min(this.w, this.h) < 640;
  }

  fitBoard(board: Board) {
    const pad = this.compact ? 0 : 1;
    this.scale = Math.min(this.w / (board.width + pad), (this.h - 60) / (board.height + pad));
  }

  /** Phone default: about 13 tiles across the short side. */
  phoneZoom() {
    this.scale = Math.min(this.w, this.h) / 13;
  }

  toTile(sx: number, sy: number) {
    return {
      x: (sx - this.w / 2) / this.scale + this.cx,
      y: (sy - this.h / 2) / this.scale + this.cy,
    };
  }

  toScreen(tx: number, ty: number) {
    return {
      x: (tx - this.cx) * this.scale + this.w / 2,
      y: (ty - this.cy) * this.scale + this.h / 2,
    };
  }

  clamp(board: Board) {
    const minScale = Math.min(this.w / (board.width + 2), this.h / (board.height + 2));
    this.scale = Math.max(minScale * 0.9, Math.min(this.scale, Math.min(this.w, this.h) / 6));
    const hw = this.w / 2 / this.scale;
    const hh = this.h / 2 / this.scale;
    const fit = (c: number, half: number, size: number) =>
      half * 2 >= size ? size / 2 : Math.max(half, Math.min(size - half, c));
    this.cx = fit(this.cx, hw, board.width);
    this.cy = fit(this.cy, hh, board.height);
  }
}

export interface DrawState {
  shrine: Shrine;
  prev: GameSnapshot | null;
  snap: GameSnapshot;
  /** 0..1 progress from the previous tick to this one. */
  t: number;
  me: number;
  flames: Map<number, Flame>;
  hoverWisp: number | null;
  now: number;
}

let floorCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** The static shrine (floor, pools, walls, boulders) baked once per shrine and tile size. */
function bakeFloor(shrine: Shrine, s: number): HTMLCanvasElement {
  const key = `${shrine.id}:${s}:${!!ready(`floor-${shrine.id}` as SpriteName)}:${!!ready("water")}:${!!ready("wall")}:${!!ready("rock")}:${!!ready("pillar")}`;
  if (floorCache?.key === key) return floorCache.canvas;
  const b = shrine.board;
  const c = document.createElement("canvas");
  c.width = Math.ceil(b.width * s);
  c.height = Math.ceil(b.height * s);
  const g = c.getContext("2d")!;
  const floor = ready(`floor-${shrine.id}` as SpriteName);
  const fallback = { "moss-hollow": "#41633a", "tidepool-steps": "#c9b98a", "ember-quarry": "#7a4a35" }[shrine.id] ?? "#555";
  g.fillStyle = fallback;
  g.fillRect(0, 0, c.width, c.height);
  if (floor) paintPattern(g, floor, 0, 0, c.width, c.height, s * 6);
  // Faint grid so tiles are countable.
  g.strokeStyle = "rgba(0,0,0,0.08)";
  g.lineWidth = 1;
  for (let x = 0; x <= b.width; x++) line(g, x * s, 0, x * s, c.height);
  for (let y = 0; y <= b.height; y++) line(g, 0, y * s, c.width, y * s);
  const water = ready("water");
  const wall = ready("wall");
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const t = b.tiles[y * b.width + x];
      const px = x * s;
      const py = y * s;
      if (t === Tile.Water) {
        g.save();
        g.beginPath();
        g.rect(px, py, s, s);
        g.clip();
        g.fillStyle = "#3f9fa8";
        g.fillRect(px, py, s, s);
        if (water) paintPattern(g, water, 0, 0, c.width, c.height, s * 4);
        g.restore();
      } else if (t === Tile.Wall) {
        const edge = x === 0 || y === 0 || x === b.width - 1 || y === b.height - 1;
        g.save();
        g.beginPath();
        g.rect(px, py, s, s);
        g.clip();
        g.fillStyle = edge ? "#2a2a33" : "#5d5f6b";
        g.fillRect(px, py, s, s);
        if (wall && !edge) paintPattern(g, wall, 0, 0, c.width, c.height, s * 3);
        g.restore();
        if (!edge) {
          const p = ready("pillar");
          if (p) drawSprite(g, p, px + s / 2, py + s, s * 1.5);
          else {
            g.fillStyle = "rgba(0,0,0,0.35)";
            g.fillRect(px, py + s * 0.8, s, s * 0.2);
          }
        }
      } else if (t === Tile.Rock) {
        const r = ready("rock");
        if (r) drawSprite(g, r, px + s / 2, py + s * 0.95, s * 1.15);
        else {
          g.fillStyle = "#777";
          g.beginPath();
          g.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  // Bank rim: the 5x5 square around the brazier.
  const cx = b.center.x;
  const cy = b.center.y;
  g.fillStyle = "rgba(255,210,120,0.13)";
  g.fillRect((cx - 2) * s, (cy - 2) * s, 5 * s, 5 * s);
  g.strokeStyle = "rgba(255,220,150,0.5)";
  g.setLineDash([s / 4, s / 6]);
  g.lineWidth = Math.max(1, s / 16);
  g.strokeRect((cx - 2) * s, (cy - 2) * s, 5 * s, 5 * s);
  g.setLineDash([]);
  floorCache = { key, canvas: c };
  return c;
}

export function draw(g: CanvasRenderingContext2D, cam: Camera, st: DrawState) {
  const s = cam.scale;
  const b = st.shrine.board;
  g.fillStyle = "#14121c";
  g.fillRect(0, 0, cam.w, cam.h);
  const o = cam.toScreen(0, 0);
  g.drawImage(bakeFloor(st.shrine, s), Math.round(o.x), Math.round(o.y));

  const lerp = (a: number, z: number) => a + (z - a) * Math.min(1, st.t);
  const at = (x: number, y: number) => cam.toScreen(x + 0.5, y + 0.5);

  // Brazier, with a flicker.
  const bz = ready("brazier");
  const c = at(b.center.x, b.center.y);
  const glow = 0.55 + 0.1 * Math.sin(st.now / 140);
  const grad = g.createRadialGradient(c.x, c.y, s * 0.5, c.x, c.y, s * 3.2);
  grad.addColorStop(0, `rgba(255,170,60,${glow})`);
  grad.addColorStop(1, "rgba(255,120,30,0)");
  g.fillStyle = grad;
  g.fillRect(c.x - s * 4, c.y - s * 4, s * 8, s * 8);
  if (bz) drawSprite(g, bz, c.x, c.y + s * 1.6, s * 3.4);

  const me = st.snap.players.find((p) => p.id === st.me);

  // My reach, as a faint square.
  if (me) {
    const r = me.mode === "pull" ? PULL_REACH : PUSH_REACH;
    const mx = lerp(me.px, me.x);
    const my = lerp(me.py, me.y);
    // The reach square, clipped to the shrine.
    const x0 = Math.max(0, mx - r);
    const y0 = Math.max(0, my - r);
    const x1 = Math.min(b.width, mx + r + 1);
    const y1 = Math.min(b.height, my + r + 1);
    const tl = cam.toScreen(x0, y0);
    g.strokeStyle = me.mode === "pull" ? "rgba(255,240,180,0.25)" : "rgba(255,140,140,0.25)";
    g.lineWidth = 1;
    g.setLineDash([4, 6]);
    g.strokeRect(tl.x, tl.y, (x1 - x0) * s, (y1 - y0) * s);
    g.setLineDash([]);
    if (me.walkTo) {
      const w = at(me.walkTo.x, me.walkTo.y);
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(w.x, w.y, s * 0.3, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // Draw back-to-front by y.
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  const wispPos = new Map<number, { x: number; y: number }>();
  for (const w of st.snap.wisps) {
    const pw = st.prev?.wisps.find((q) => q.id === w.id);
    // A respawned wisp jumps; don't slide it across the shrine.
    const jump = !pw || Math.abs(pw.x - w.x) > 2 || Math.abs(pw.y - w.y) > 2;
    const x = jump ? w.x : lerp(w.px, w.x);
    const y = jump ? w.y : lerp(w.py, w.y);
    wispPos.set(w.id, { x, y });
    items.push({
      y,
      draw: () => {
        const p = at(x, y);
        const bob = Math.sin(st.now / 300 + w.id) * s * 0.08;
        const col = GUILD_COLORS[w.guild];
        const halo = g.createRadialGradient(p.x, p.y + bob, 0, p.x, p.y + bob, s * 1.1);
        halo.addColorStop(0, hexA(col, 0.55));
        halo.addColorStop(1, hexA(col, 0));
        g.fillStyle = halo;
        g.fillRect(p.x - s * 1.2, p.y - s * 1.2 + bob, s * 2.4, s * 2.4);
        const sp = ready(w.guild === 0 ? "wisp-dawn" : "wisp-dusk");
        const size = s * (w.rim > 0 ? 0.9 - 0.2 * w.rim : 0.95);
        if (sp) drawSprite(g, sp, p.x, p.y + size / 2 + bob, size);
        else {
          g.fillStyle = col;
          g.beginPath();
          g.arc(p.x, p.y + bob, size / 2.4, 0, Math.PI * 2);
          g.fill();
        }
        if (st.hoverWisp === w.id) {
          g.strokeStyle = "#fff";
          g.lineWidth = 2;
          g.beginPath();
          g.arc(p.x, p.y + bob, s * 0.62, 0, Math.PI * 2);
          g.stroke();
        }
      },
    });
  }
  for (const pl of st.snap.players) {
    const x = lerp(pl.px, pl.x);
    const y = lerp(pl.py, pl.y);
    const flame = FLAME_COLORS[st.flames.get(pl.id) ?? "amber"];
    // Beam first, under everyone.
    if (pl.beam !== null) {
      const wp = wispPos.get(pl.beam);
      if (wp) {
        const a = at(x, y - 0.6);
        const z = at(wp.x, wp.y);
        g.strokeStyle = pl.slipped ? "rgba(200,200,200,0.35)" : pl.mode === "pull" ? hexA(flame, 0.8) : "rgba(255,110,110,0.85)";
        g.lineWidth = Math.max(2, s / 9);
        g.setLineDash(pl.mode === "push" ? [s / 4, s / 5] : []);
        g.lineDashOffset = -st.now / 30;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(z.x, z.y);
        g.stroke();
        g.setLineDash([]);
      }
    }
    items.push({
      y,
      draw: () => {
        const p = at(x, y);
        g.fillStyle = "rgba(0,0,0,0.3)";
        g.beginPath();
        g.ellipse(p.x, p.y + s * 0.38, s * 0.42, s * 0.16, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = flame;
        g.lineWidth = pl.id === st.me ? 3 : 1.5;
        g.beginPath();
        g.ellipse(p.x, p.y + s * 0.38, s * 0.46, s * 0.19, 0, 0, Math.PI * 2);
        g.stroke();
        const sp = ready(pl.guild === 0 ? "dawn-lamplighter" : "dusk-lamplighter");
        if (sp) drawSprite(g, sp, p.x, p.y + s * 0.45, s * 1.5);
        else {
          g.fillStyle = GUILD_COLORS[pl.guild];
          g.fillRect(p.x - s * 0.3, p.y - s * 0.6, s * 0.6, s);
        }
        // Lantern flame tint (the cosmetic).
        const lx = p.x - s * 0.33;
        const ly = p.y - s * (pl.guild === 0 ? 0.86 : 0.68);
        const fg = g.createRadialGradient(lx, ly, 0, lx, ly, s * 0.32);
        fg.addColorStop(0, hexA(flame, 0.95));
        fg.addColorStop(1, hexA(flame, 0));
        g.fillStyle = fg;
        g.fillRect(lx - s * 0.4, ly - s * 0.4, s * 0.8, s * 0.8);
        // Name tag.
        const fs = Math.max(10, Math.min(14, s * 0.42));
        g.font = `600 ${fs}px system-ui, sans-serif`;
        g.textAlign = "center";
        g.fillStyle = "rgba(0,0,0,0.55)";
        const label = pl.name + (pl.id === st.me ? " (you)" : "");
        const tw = g.measureText(label).width + 8;
        g.fillRect(p.x - tw / 2, p.y - s * 1.15 - fs, tw, fs + 4);
        g.fillStyle = GUILD_COLORS[pl.guild];
        g.fillText(label, p.x, p.y - s * 1.15);
      },
    });
  }
  items.sort((a, z) => a.y - z.y).forEach((i) => i.draw());
}

/** Small overview of the whole shrine for phones. Returns its screen rect for hit-testing. */
export function drawMinimap(g: CanvasRenderingContext2D, cam: Camera, st: DrawState, rect: { x: number; y: number; w: number; h: number }) {
  const b = st.shrine.board;
  const k = rect.w / b.width;
  g.save();
  g.globalAlpha = 0.85;
  g.fillStyle = "#1d1b26";
  g.fillRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6);
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const t = b.tiles[y * b.width + x];
      g.fillStyle = t === Tile.Wall ? "#4a4a55" : t === Tile.Water ? "#3f9fa8" : t === Tile.Rock ? "#888" : t === Tile.Brazier ? "#ff9a3a" : "#3b5233";
      g.fillRect(rect.x + x * k, rect.y + y * k, Math.ceil(k), Math.ceil(k));
    }
  for (const w of st.snap.wisps) {
    g.fillStyle = GUILD_COLORS[w.guild];
    g.beginPath();
    g.arc(rect.x + (w.x + 0.5) * k, rect.y + (w.y + 0.5) * k, Math.max(2, k * 0.7), 0, Math.PI * 2);
    g.fill();
  }
  for (const p of st.snap.players) {
    g.fillStyle = p.id === st.me ? "#fff" : GUILD_COLORS[p.guild];
    g.fillRect(rect.x + p.x * k, rect.y + p.y * k, Math.max(2, k), Math.max(2, k));
  }
  // The camera's view.
  const tl = cam.toTile(0, 0);
  const br = cam.toTile(cam.w, cam.h);
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 1;
  g.strokeRect(rect.x + Math.max(0, tl.x) * k, rect.y + Math.max(0, tl.y) * k, (Math.min(b.width, br.x) - Math.max(0, tl.x)) * k, (Math.min(b.height, br.y) - Math.max(0, tl.y)) * k);
  g.restore();
}

function drawSprite(g: CanvasRenderingContext2D, i: HTMLImageElement, cx: number, bottom: number, size: number) {
  const r = i.naturalWidth / i.naturalHeight;
  const w = r >= 1 ? size : size * r;
  const h = r >= 1 ? size / r : size;
  g.drawImage(i, cx - w / 2, bottom - h, w, h);
}

function paintPattern(g: CanvasRenderingContext2D, i: HTMLImageElement, x: number, y: number, w: number, h: number, cell: number) {
  for (let py = y; py < y + h; py += cell) for (let px = x; px < x + w; px += cell) g.drawImage(i, px, py, cell, cell);
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  g.beginPath();
  g.moveTo(x1 + 0.5, y1 + 0.5);
  g.lineTo(x2 + 0.5, y2 + 0.5);
  g.stroke();
}

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
