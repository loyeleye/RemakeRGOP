// The shrine grid: tiles, movement rules, line of sight and walking paths.
// x grows to the east, y grows to the south, (0,0) is the north-west corner.

export interface Pt {
  x: number;
  y: number;
}

export const pt = (x: number, y: number): Pt => ({ x, y });
export const samePt = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
export const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

export enum Tile {
  Floor = 0,
  /** Solid shrine wall: blocks walking, wisps and the staff's reach. */
  Wall = 1,
  /** Boulder: blocks walking and wisps, but a staff can reach over it. */
  Rock = 2,
  /** Shallow pool: lamplighters can't wade it, wisps float over it. */
  Water = 3,
  /** The brazier itself: nobody stands in it; wisps that reach its rim are banked. */
  Brazier = 4,
}

/** Who is moving: decides which tiles are passable. */
export enum Mover {
  Sight,
  Wisp,
  Walker,
}

/** Offsets in the order paths try them: straight steps first, then diagonals. */
export const DIRS: readonly Pt[] = [
  pt(-1, 0), pt(1, 0), pt(0, -1), pt(0, 1),
  pt(-1, -1), pt(1, -1), pt(-1, 1), pt(1, 1),
];

export class Board {
  readonly center: Pt;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly tiles: Tile[],
  ) {
    this.center = pt(Math.floor(width / 2), Math.floor(height / 2));
  }

  inside(p: Pt) {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  tile(p: Pt): Tile {
    return this.inside(p) ? this.tiles[p.y * this.width + p.x]! : Tile.Wall;
  }

  passable(p: Pt, who: Mover): boolean {
    const t = this.tile(p);
    switch (t) {
      case Tile.Wall:
        return false;
      case Tile.Rock:
        return who === Mover.Sight;
      case Tile.Water:
      case Tile.Brazier:
        return who !== Mover.Walker;
      default:
        return true;
    }
  }

  /**
   * Can something at p take one step of (dx, dy)? Diagonal steps may not cut a corner:
   * both straight neighbours have to be open as well as the destination.
   */
  canStep(p: Pt, dx: number, dy: number, who: Mover): boolean {
    if ((dx === 0 && dy === 0) || Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
    const to = pt(p.x + dx, p.y + dy);
    if (!this.inside(to) || !this.passable(to, who)) return false;
    if (dx !== 0 && dy !== 0) {
      return this.passable(pt(p.x + dx, p.y), who) && this.passable(pt(p.x, p.y + dy), who);
    }
    return true;
  }

  /** The rim around the brazier where a wisp is banked: within 2 tiles of the centre. */
  inBankZone(p: Pt) {
    return Math.abs(p.x - this.center.x) <= 2 && Math.abs(p.y - this.center.y) <= 2;
  }

  /**
   * The tiles a line from a to b crosses, in order, a included. Diagonal moves are split
   * into a straight step and then the diagonal, so a corner between two walls blocks the
   * line.
   */
  lineTiles(a: Pt, b: Pt): Pt[] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    const out: Pt[] = [a];
    for (let i = 1; i <= n; i++) {
      const fx = a.x + (dx * i) / n;
      const fy = a.y + (dy * i) / n;
      out.push(pt(roundSym(fx, a.x), roundSym(fy, a.y)));
    }
    return out;
  }

  /**
   * Clear line of sight between a and b: nothing solid strictly between them and no
   * corner squeezed between two solid tiles. A line traced from either end counts, so
   * sight is always mutual.
   */
  canSee(a: Pt, b: Pt): boolean {
    return this.traceClear(a, b) || this.traceClear(b, a);
  }

  private traceClear(a: Pt, b: Pt): boolean {
    const line = this.lineTiles(a, b);
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1]!;
      const q = line[i]!;
      const last = i === line.length - 1;
      if (!last && !this.passable(q, Mover.Sight)) return false;
      if (q.x !== p.x && q.y !== p.y) {
        // A diagonal hop is blocked only if both corners are solid.
        const c1 = this.passable(pt(q.x, p.y), Mover.Sight);
        const c2 = this.passable(pt(p.x, q.y), Mover.Sight);
        if (!c1 && !c2) return false;
      }
    }
    return true;
  }

  /**
   * Shortest walking path (8-way, no corner cutting) from `from` toward `to`, not including
   * `from`. If `to` can't be reached, walks to the reachable tile closest to it. With
   * `stopAdjacent`, the path ends on a tile next to `to` (used to approach a wisp).
   */
  walkPath(from: Pt, to: Pt, stopAdjacent = false): Pt[] {
    const W = this.width;
    const key = (p: Pt) => p.y * W + p.x;
    const parent = new Map<number, number>();
    parent.set(key(from), -1);
    const queue: Pt[] = [from];
    let best = from;
    let bestD = dist2(from, to);
    const done = (p: Pt) => (stopAdjacent ? cheb(p, to) <= 1 && !samePt(p, to) : samePt(p, to));
    if (done(from)) return [];
    let found: Pt | null = null;
    for (let qi = 0; qi < queue.length && !found; qi++) {
      const cur = queue[qi]!;
      for (const d of DIRS) {
        const nx = pt(cur.x + d.x, cur.y + d.y);
        const k = key(nx);
        if (parent.has(k) || !this.canStep(cur, d.x, d.y, Mover.Walker)) continue;
        parent.set(k, key(cur));
        queue.push(nx);
        if (done(nx)) {
          found = nx;
          break;
        }
        const dd = dist2(nx, to);
        if (dd < bestD) {
          bestD = dd;
          best = nx;
        }
      }
    }
    const end = found ?? best;
    const path: Pt[] = [];
    for (let k = key(end); k !== key(from); k = parent.get(k)!) {
      path.push(pt(k % W, Math.floor(k / W)));
    }
    return path.reverse();
  }
}

function dist2(a: Pt, b: Pt) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function roundSym(v: number, origin: number) {
  const f = Math.floor(v);
  const frac = v - f;
  if (Math.abs(frac - 0.5) < 1e-9) return v > origin ? f : f + 1;
  return Math.round(v);
}
