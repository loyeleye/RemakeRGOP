// Sun Eater eye, run 1 ending (from the cutscene art thread's production/story/v3/eye/eye-rig.js; layers in
// public/story/eye/ as WebP). Dark wet lens (Ladi, 22 Nov 2026). Canvas 2D, no dependencies.
// Usage: const eye = await loadEye('path/to/eye/'); eye.draw(ctx, sizePx, tSeconds, heart01);
// heart01 = how bright the player's heart is in the reflection (0..1, from the score tier).
// The scene runs 0..EYE_DURATION seconds and cuts to black at 11.3 s. All numbers are in a 768 px frame.
export const EYE_DURATION = 12.0;
/** When it snaps to the centre and fixes on the islands (the low note), and when it cuts to black. */
export const EYE_FIX = 8.86, EYE_CUT = 11.3;
const P_SEARCH = 250, P_LOCK = 312;
const O: Keys = [[0,0],[2.4,0],[3.3,0.17],[3.8,0.17],[4.0,0],[4.5,0],[5.3,1],[6.75,1],[6.84,0],[6.92,0],[7.05,1],[8.0,1],[8.07,0],[8.15,1],[8.27,1],[8.34,0],[8.43,1],[20,1]];
const DX: Keys = [[0,-125],[4.5,-125],[5.1,-125],[6.7,135],[7.0,135],[8.0,-70],[8.75,-78],[8.86,0],[20,0]];
const DY: Keys = [[0,50],[5.1,50],[6.7,-25],[7.0,-25],[8.0,72],[8.75,76],[8.86,0],[20,0]];
const PP: Keys = [[0,P_SEARCH],[8.9,P_SEARCH],[9.6,P_LOCK],[20,P_LOCK]];
const BR: Keys = [[0,0],[0.8,0],[2.4,0.6],[5.3,0.92],[8.8,0.95],[9.5,1.0],[11.3,1.0],[11.32,0],[20,0]];
const ZM: Keys = [[0,1.0],[8.86,1.0],[11.3,1.09],[20,1.09]];
const RG: Keys = [[0,0.85],[8.86,0.85],[9.6,1.0],[20,1.0]];
const ease = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
type Keys = number[][];
function kf(t: number, k: Keys): number {
  if (t <= k[0]![0]!) return k[0]![1]!;
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, v0] = k[i] as [number, number], [t1, v1] = k[i + 1] as [number, number];
    if (t <= t1) return v0 + (v1 - v0) * ease(t1 > t0 ? (t - t0) / (t1 - t0) : 1);
  }
  return k[k.length - 1]![1]!;
}
const img = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
export type Eye = Awaited<ReturnType<typeof loadEye>>;
export async function loadEye(base = './') {
  const [ring, iris, refl, heart] = await Promise.all(
    ['eye-ring.webp', 'eye-iris.webp', 'eye-reflection.webp', 'eye-reflection-heart.webp'].map((n) => img(base + n)));
  return { draw: (ctx: CanvasRenderingContext2D, size: number, t: number, heart01 = 1) => draw(ctx, size, t, heart01, ring!, iris!, refl!, heart!) };
}
function lidPath(ctx: CanvasRenderingContext2D, edgeMid: number, edgeSide: number, top: boolean) {
  // a parabola y = edgeMid + (edgeSide - edgeMid) * u^2 across the frame, closed off above or below
  const yEnd = top ? -400 : 1168;
  ctx.beginPath(); ctx.moveTo(-200, yEnd);
  for (let x = -200; x <= 968; x += 16) { const u = (x - 384) / 384; ctx.lineTo(x, edgeMid + (edgeSide - edgeMid) * u * u); }
  ctx.lineTo(968, yEnd); ctx.closePath();
}
type Img = HTMLImageElement;
function draw(ctx: CanvasRenderingContext2D, size: number, t: number, heart01: number, ring: Img, iris: Img, refl: Img, heart: Img) {
  const o = kf(t, O), dx = kf(t, DX), dy = kf(t, DY), P = kf(t, PP), bright = kf(t, BR), zoom = kf(t, ZM), rg = kf(t, RG);
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  if (bright <= 0) { ctx.restore(); return; }
  ctx.scale(size / 768, size / 768);
  ctx.translate(384, 384); ctx.scale(zoom, zoom); ctx.translate(-384, -384);
  ctx.drawImage(ring, 0.3 * dx, 0.3 * dy, 768, 768);          // pale ring drifts a little with the gaze
  ctx.drawImage(iris, dx, dy, 768, 768);                        // iris follows the gaze
  const px = 384 + dx, py = 384 + dy;
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, P, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgb(3,3,8)'; ctx.fillRect(0, 0, 768, 768);
  const d = Math.hypot(dx, dy);
  const aRef = Math.min(1, (1 - ease((d - 28) / (115 - 28))) * rg);   // hearts show when the gaze is near the middle
  if (aRef > 0) {
    ctx.globalAlpha = aRef; ctx.drawImage(refl, 0, 0, 768, 768);     // reflection stays fixed to the screen
    ctx.globalAlpha = aRef * heart01; ctx.drawImage(heart, 0, 0, 768, 768);
    ctx.globalAlpha = 1;
  }
  const g = ctx.createRadialGradient(px, py, Math.max(0, P - 46), px, py, P);  // wet dark rim inside the pupil
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 768, 768);
  ctx.restore();
  // lids: closed seam 500 - 70u^2; open upper 26 + 120u^2, open lower 748 - 105u^2
  const oL = Math.pow(o, 0.8);
  const up = [430 + (146 - 430) * o, 500 + (26 - 500) * o];          // [at the sides, at the middle]
  const lo = [430 + (643 - 430) * oL, 500 + (748 - 500) * oL];
  ctx.fillStyle = 'rgb(3,3,6)'; ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 30 * size / 768 * zoom;
  lidPath(ctx, up[1]!, up[0]!, true); ctx.fill();
  lidPath(ctx, lo[1]!, lo[0]!, false); ctx.fill();
  ctx.shadowBlur = 0;
  if (bright < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - bright})`; ctx.fillRect(-100, -100, 968, 968); }
  ctx.restore();
}
