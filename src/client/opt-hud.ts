// The optional runs: what is drawn over the board for all of them (StoryView.opt). A strip at the
// top for the whole run, with one cell for each thing that is counted; under it, the lines that
// must land (the goal, and any line that names the choice), held as captions; and the marks a run
// puts on the board: who is looking at which wisp, a goal that has been moved, someone dozing.
// Block-outs, to be judged by playing (gameplay/optional-runs-prototype-brief.md).

import type { GameSnapshot as Snapshot } from "../engine/game.js";
import type { StoryView } from "../engine/protocol.js";

type Opt = NonNullable<StoryView["opt"]>;
interface Cam { w: number; h: number; compact: boolean; toScreen(tx: number, ty: number, h?: number): { x: number; y: number } }

/** How it looks, in one place. */
export const OPT_HUD = {
  /** A cell of the strip: its width, the gap between cells, and a pip's size. */
  cell: 112, gap: 8, pip: 5.4,
  us: "#ffd98a", her: "#d7c4ff", chalk: "#f3f1e8", unlit: "rgba(255,255,255,0.14)",
  /** Her eye on a wisp: the line's colour and dashes, and the ring's size on the wisp. */
  eye: { line: "rgba(215,196,255,0.9)", dash: [3, 6] as [number, number], ring: 19 },
  /** A moved goal: while it is being told, and once it counts. */
  goal: { tell: "rgba(215,196,255,0.85)", live: "rgba(255,217,138,0.95)", track: "rgba(255,255,255,0.18)" },
  nap: "rgba(215,196,255,0.95)",
};

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Tally marks, chalked: four strokes and a fifth across them. */
export function tallies(g: CanvasRenderingContext2D, x: number, y: number, n: number, h: number, color: string) {
  g.save();
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineWidth = Math.max(1.6, h * 0.14);
  const step = h * 0.42;
  for (let i = 0; i < n; i++) {
    const k = i % 5, x0 = x + Math.floor(i / 5) * step * 5.4;
    g.beginPath();
    if (k < 4) {
      // A hand's strokes: none quite upright.
      const lean = ((i * 7) % 3) - 1;
      g.moveTo(x0 + k * step + lean, y);
      g.lineTo(x0 + k * step - lean * 0.6, y + h);
    } else {
      g.moveTo(x0 - step * 0.4, y + h * 0.78);
      g.lineTo(x0 + 3 * step + step * 0.4, y + h * 0.2);
    }
    g.stroke();
  }
  g.restore();
}

/** A circle of `rad` tiles on the ground round a point, or a share of it starting at the top. */
function ground(g: CanvasRenderingContext2D, cam: Cam, tx: number, ty: number, rad: number, share = 1) {
  g.beginPath();
  const steps = Math.max(2, Math.ceil(48 * share));
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + ((share * i) / steps) * Math.PI * 2, q = cam.toScreen(tx + Math.cos(a) * rad, ty + Math.sin(a) * rad, 0.15);
    if (i) g.lineTo(q.x, q.y);
    else g.moveTo(q.x, q.y);
  }
  g.stroke();
}

export function drawOptHud(g: CanvasRenderingContext2D, cam: Cam, o: Opt, snap: Snapshot, t: number, now: number, bank: { x: number; y: number }) {
  const H = OPT_HUD, n = o.strip.length, k1 = Math.min(1, t);
  const at = (p: { x: number; y: number; px: number; py: number }) => ({ x: p.px + (p.x - p.px) * k1 + 0.5, y: p.py + (p.y - p.py) * k1 + 0.5 });
  g.save();

  // On the board, under everything else: her eye on a wisp.
  if (o.eye) {
    const w = snap.wisps.find((q) => q.id === o.eye!.wisp), from = snap.players.find((p) => p.id === o.eye!.from);
    if (w && from && !w.away) {
      const a0 = at(from), b0 = at(w), a = cam.toScreen(a0.x, a0.y, 1.7), b = cam.toScreen(b0.x, b0.y, 0.9);
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, beat = 0.5 + 0.5 * Math.sin(now / 420);
      g.strokeStyle = H.eye.line;
      g.lineWidth = 1.8;
      g.setLineDash(H.eye.dash);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x - ((b.x - a.x) / d) * (H.eye.ring + 3), b.y - ((b.y - a.y) / d) * (H.eye.ring + 3));
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 2.2;
      g.beginPath();
      g.arc(b.x, b.y, H.eye.ring + 2 * beat, 0, Math.PI * 2);
      g.stroke();
      // An eye over it: a lid and a pupil.
      const ex = b.x, ey = b.y - H.eye.ring - 13;
      g.beginPath();
      g.moveTo(ex - 10, ey);
      g.quadraticCurveTo(ex, ey - 9, ex + 10, ey);
      g.quadraticCurveTo(ex, ey + 9, ex - 10, ey);
      g.fillStyle = "rgba(10,8,20,0.75)";
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(ex, ey, 3, 0, Math.PI * 2);
      g.fillStyle = H.eye.line;
      g.fill();
    }
  }
  // A goal that has been moved: told with a dashed ring and a line from the fire, then a ring that counts while its time runs.
  if (o.goal) {
    const G = o.goal, gx = G.x + 0.5, gy = G.y + 0.5, share = Math.max(0, Math.min(1, (G.left - k1) / Math.max(1, G.of)));
    g.lineCap = "round";
    if (!G.live) {
      const a = cam.toScreen(bank.x + 0.5, bank.y + 0.5, 0.4), b = cam.toScreen(gx, gy, 0.15);
      g.strokeStyle = H.goal.tell;
      g.lineWidth = 2;
      g.setLineDash([6, 8]);
      g.lineDashOffset = -now / 50;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      ground(g, cam, gx, gy, G.r);
      g.setLineDash([]);
    } else {
      g.lineWidth = 3;
      g.strokeStyle = H.goal.track;
      ground(g, cam, gx, gy, G.r);
      g.strokeStyle = H.goal.live;
      g.shadowColor = H.goal.live;
      g.shadowBlur = 8;
      ground(g, cam, gx, gy, G.r, Math.max(0.02, share));
      g.shadowBlur = 0;
    }
  }
  // Someone dozing: a ring of the time left round them, and three small z's.
  if (o.nap) {
    const who = snap.players.find((p) => p.id === o.nap!.who);
    if (who) {
      const p0 = at(who), share = Math.max(0, Math.min(1, (o.nap.left - k1) / Math.max(1, o.nap.of))), top = cam.toScreen(p0.x, p0.y, 2.6);
      g.lineWidth = 3;
      g.lineCap = "round";
      g.strokeStyle = "rgba(255,255,255,0.18)";
      ground(g, cam, p0.x, p0.y, 1.3);
      g.strokeStyle = H.nap;
      ground(g, cam, p0.x, p0.y, 1.3, Math.max(0.02, share));
      g.fillStyle = H.nap;
      g.textAlign = "center";
      for (let i = 0; i < 3; i++) {
        const f = ((now / 1400 + i / 3) % 1 + 1) % 1;
        g.globalAlpha = Math.sin(f * Math.PI);
        g.font = `700 ${11 + i * 3}px system-ui, sans-serif`;
        g.fillText("z", top.x + 8 + i * 9 + f * 6, top.y - 4 - i * 9 - f * 10);
      }
      g.globalAlpha = 1;
    }
  }

  // The strip, fitted between the corner buttons.
  const room = cam.w - (cam.compact ? 230 : 150), wide = n * H.cell + (n - 1) * H.gap + 20;
  const k = Math.max(0.6, Math.min(1.15, room / wide)), W = wide * k, x0 = Math.max(52, Math.min((cam.w - W) / 2 - (cam.compact && cam.w > cam.h ? 30 : 0), cam.w - 112 - W)), y0 = 4, hgt = 50 * k;
  g.fillStyle = "rgba(10,8,20,0.62)";
  box(g, x0, y0, W, hgt, 12 * k);
  g.fill();
  o.strip.forEach((c, i) => {
    const cx = x0 + 10 * k + i * (H.cell + H.gap) * k, cw = H.cell * k, color = c.tone === "us" ? H.us : c.tone === "her" ? H.her : H.chalk;
    g.font = `600 ${Math.round(11 * k)}px system-ui, sans-serif`;
    g.textAlign = "left";
    g.fillStyle = "rgba(233,236,246,0.88)";
    g.fillText(c.label, cx, y0 + 16 * k);
    const py = y0 + 33 * k;
    if (c.tone === "chalk") tallies(g, cx + 3 * k, py - 9 * k, c.n, 17 * k, color);
    else
      for (let p = 0; p < c.of; p++) {
        const px = cx + H.pip * k + p * (H.pip * 2 + 4) * k, on = p < c.n;
        g.beginPath();
        g.arc(px, py, H.pip * k, 0, Math.PI * 2);
        g.fillStyle = on ? color : H.unlit;
        if (on) (g.shadowColor = color), (g.shadowBlur = 6 * k);
        g.fill();
        g.shadowBlur = 0;
        if (!on) (g.strokeStyle = "rgba(255,255,255,0.3)"), (g.lineWidth = 1), g.stroke();
      }
    if (c.badge) {
      g.font = `800 ${Math.round(12 * k)}px system-ui, sans-serif`;
      g.textAlign = "right";
      g.fillStyle = color;
      g.globalAlpha = 0.7 + 0.3 * Math.sin(now / 260);
      g.fillText(c.badge, cx + cw - 4 * k, y0 + 16 * k);
      g.globalAlpha = 1;
    }
  });

  // Lines that must land, under the strip: who, and what they said.
  let cy = y0 + hgt + 8;
  const tall = cam.compact && cam.h > cam.w, midX = tall ? (cam.w - 132) / 2 : cam.w / 2, maxW = tall ? cam.w - 160 : cam.w - 60;
  const fs = Math.max(13, Math.min(18, cam.w / 44));
  for (const [i, c] of (o.caption ?? []).entries()) {
    g.font = `${i === 0 ? 700 : 500} ${fs}px system-ui, sans-serif`;
    g.textAlign = "center";
    const rows: string[] = [];
    for (const w of `${c.who}: ${c.text}`.split(" ")) {
      const last = rows[rows.length - 1];
      if (last !== undefined && g.measureText(`${last} ${w}`).width <= maxW) rows[rows.length - 1] = `${last} ${w}`;
      else rows.push(w);
    }
    const tw = Math.max(...rows.map((r) => g.measureText(r).width)) + 26, th = rows.length * (fs + 5) + 10;
    g.fillStyle = "rgba(10,8,20,0.72)";
    box(g, midX - tw / 2, cy, tw, th, 10);
    g.fill();
    g.fillStyle = i === 0 ? "#ffe9c4" : "#d9cfff";
    rows.forEach((r, j) => g.fillText(r, midX, cy + 6 + (j + 1) * (fs + 5) - 6));
    cy += th + 6;
  }
  g.restore();
}
