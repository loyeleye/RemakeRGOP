// Outlines of a smooth 2D field: the curve where field(x, y) = 0, traced by marching squares.
// Used to lay flagstones and the parapet along islands whose edge isn't one radius per angle.

export interface P2 {
  x: number;
  y: number;
}

/**
 * The longest closed loop where f = 0 inside [x0, x1] x [y0, y1], sampled every `step`.
 * Inside is f < 0. The loop runs counter-clockwise in (x, y).
 */
export function contourLoop(f: (x: number, y: number) => number, x0: number, y0: number, x1: number, y1: number, step: number): P2[] {
  const nx = Math.ceil((x1 - x0) / step) + 1, ny = Math.ceil((y1 - y0) / step) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = f(x0 + i * step, y0 + j * step);
  // Edge ids: horizontal edge (i,j)-(i+1,j) = 2*(j*nx+i); vertical (i,j)-(i,j+1) = 2*(j*nx+i)+1.
  const point = new Map<number, P2>();
  const at = (e: number): P2 => {
    let p = point.get(e);
    if (p) return p;
    const k = e >> 1, i = k % nx, j = Math.floor(k / nx);
    const a = v[k]!, b = e & 1 ? v[k + nx]! : v[k + 1]!;
    const t = a / (a - b);
    p = e & 1 ? { x: x0 + i * step, y: y0 + (j + t) * step } : { x: x0 + (i + t) * step, y: y0 + j * step };
    point.set(e, p);
    return p;
  };
  const next = new Map<number, number>();
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const bl = v[k]! < 0, br = v[k + 1]! < 0, tl = v[k + nx]! < 0, tr = v[k + nx + 1]! < 0;
      const bottom = 2 * k, top = 2 * (k + nx), left = 2 * k + 1, right = 2 * (k + 1) + 1;
      const code = (bl ? 1 : 0) | (br ? 2 : 0) | (tr ? 4 : 0) | (tl ? 8 : 0);
      // Segments go with inside on the left.
      const seg = (a: number, b: number) => next.set(a, b);
      switch (code) {
        case 1: seg(left, bottom); break;
        case 2: seg(bottom, right); break;
        case 3: seg(left, right); break;
        case 4: seg(right, top); break;
        case 5: seg(left, top); seg(right, bottom); break;
        case 6: seg(bottom, top); break;
        case 7: seg(left, top); break;
        case 8: seg(top, left); break;
        case 9: seg(top, bottom); break;
        case 10: seg(top, right); seg(bottom, left); break;
        case 11: seg(top, right); break;
        case 12: seg(right, left); break;
        case 13: seg(right, bottom); break;
        case 14: seg(bottom, left); break;
      }
    }
  let best: P2[] = [];
  const used = new Set<number>();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop: P2[] = [];
    let e: number | undefined = start;
    while (e !== undefined && !used.has(e)) {
      used.add(e);
      loop.push(at(e));
      e = next.get(e);
    }
    if (loop.length > best.length) best = loop;
  }
  return best;
}
