// Kite Fell, Kes's island, where run 5 (the race) is played. Maps thread, draft 2 (24 Nov 2026):
// project files sogni/lanternfall/production/places/kes-island/kes-island-draft-2.py and
// kes-island-props-2.json. Tiles, x east, y south, the origin at the race brazier. Rook's half is
// west, Kes's east. Everything solid sits outside the race oval.

/** The race ground: a plain oval, 51 x 33 tiles. */
export const KF_OVAL = { rx: 25, ry: 16 };
const CA = 34, CB = 24;
const HALF_W = 45, HALF_H = 35;
export const KF_SIZE = { w: HALF_W * 2 + 1, h: HALF_H * 2 + 1 };

const wob = (a: number, amp: number) => (amp * (Math.sin(3 * a + 1.3) + 0.6 * Math.sin(5 * a + 0.4) + 0.4 * Math.sin(8 * a + 2.9))) / 2;
export const kfRace = (x: number, y: number) => (x / KF_OVAL.rx) ** 2 + (y / KF_OVAL.ry) ** 2 <= 1;
/** The coast: a wobbly oval, with a lobe on the north side for Kes's yard. */
const coast = (x: number, y: number) => {
  const k = 1 + wob(Math.atan2(y, x), 0.05);
  return (x / CA) ** 2 + (y / CB) ** 2 <= k * k || ((x - 3) / 15) ** 2 + ((y + 25) / 9) ** 2 <= 1;
};
/** Planks out over the sky, east, toward home. */
const landing = (x: number, y: number) => x >= 33 && x <= 38 && y >= 4 && y <= 6;
export const kfLand = (x: number, y: number) => coast(x, y) || landing(x, y);

/** About how far (x, y) is outside the land, in tiles, negative on land (the landing has its own plateaus). */
export function kfCoast(x: number, y: number) {
  const oval = (px: number, py: number, a: number, b: number, k: number) => {
    const g = Math.hypot(px / a, py / b) || 1e-6;
    return (g - k) / (Math.hypot(px / (a * a), py / (b * b)) / g);
  };
  return Math.min(oval(x, y, CA, CB, 1 + wob(Math.atan2(y, x), 0.05)), oval(x - 3, y + 25, 15, 9, 1)) - 0.5;
}
/** How far the coast is from the brazier at each angle. */
export function kfOutline(a: number) {
  let r = 10;
  while (r < 60 && coast(Math.cos(a) * r, Math.sin(a) * r)) r += 0.25;
  return r;
}
/** No plateaus under the landing: its planks hang out over the sky. (An empty list still keeps the cliff tight to the edge.) */
export const KF_LOBES: { x: number; y: number; r: number }[] = [];
/** Home, in view to the east and lower than here. */
export const KF_FAR = [{ x: 95, y: 4, r: 16, drop: 7 }];
/** Where Lumi stands to referee: her stand, south, on the halfway line. */
export const KF_REFEREE = { x: 0, y: 17 };

/** A point on the margin between the race oval and the coast, `f` of the way out (the draft's own rule). */
function rim(deg: number, f = 0.6): [number, number] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const r1 = 1 / Math.hypot(c / (KF_OVAL.rx + 2), s / (KF_OVAL.ry + 2));
  let r2 = r1;
  while (coast(r2 * c, r2 * s)) r2 += 0.25;
  r2 -= 1.5;
  const r = r1 + (r2 - r1) * f;
  // Python rounds halves to even; these never land on a half.
  return [Math.round(r * c), Math.round(r * s)];
}

/** The island as map rows, the turns its models need, and Rosie's streamer. */
export function kiteFellRows(): { rows: string[]; turns: Record<string, number>; flags: { x: number; y: number }[] } {
  const X = (x: number) => x + HALF_W, Y = (y: number) => y + HALF_H;
  const g: string[][] = Array.from({ length: KF_SIZE.h }, (_, by) =>
    Array.from({ length: KF_SIZE.w }, (_, bx) => {
      const x = bx - HALF_W, y = by - HALF_H;
      if (coast(x, y)) return ".";
      return landing(x, y) ? ";" : " ";
    }),
  );
  const put = (x: number, y: number, ch: string, what: string, over = ".") => {
    const v = g[Y(y)]?.[X(x)];
    if (v === undefined || !over.includes(v)) throw new Error(`kite-fell: ${what} at ${x},${y} is not on open ground`);
    g[Y(y)]![X(x)] = ch;
  };
  const outside = (x: number, y: number, what: string) => {
    if ((x / (KF_OVAL.rx + 2)) ** 2 + (y / (KF_OVAL.ry + 2)) ** 2 <= 1) throw new Error(`kite-fell: ${what} at ${x},${y} is on the race ground`);
  };
  const solid = (x: number, y: number, ch: string, what: string) => (outside(x, y, what), put(x, y, ch, what));
  const turns: Record<string, number> = {};

  // The halfway line (chalk, walkable): pale flags until it has its own look.
  for (let y = -KF_OVAL.ry; y <= KF_OVAL.ry; y++) if (kfRace(0, y) && Math.abs(y) > 1) put(0, y, ":", "halfway line");
  // Lumi's referee stand, south, on the halfway line.
  put(KF_REFEREE.x, KF_REFEREE.y, "8", "referee stand", ".:");
  // Start marks: Rook west, Kes east.
  for (const [x0, who] of [[-24, "1"], [23, "2"]] as const)
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(x0 + i, -1 + j, i === (who === "1" ? 1 : 0) && j === 1 ? who : ":", "start mark");
  // Kes's house, one storey, door south, facing the race.
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) solid(-3 + i, -30 + j, "5", "Kes's house");
  solid(4, -24, "C", "chair");
  turns.chair = 0;
  solid(7, -27, "l", "lamp post");
  solid(10, -30, "Y", "wash post");
  solid(14, -30, "Y", "wash post");
  // Wind vanes on the rim, wind-bent trees, wind-cut rocks.
  for (const d of [200, 330, 140, 40]) solid(...rim(d), "6", "wind vane");
  for (const [d, f] of [[215, 0.7], [320, 0.75], [150, 0.7]] as const) solid(...rim(d, f), "7", "tree");
  for (const [x, y] of [[-33, 2], [4, 23], rim(250, 0.7)] as const) solid(x, y, "#", "rock");
  // Streamers: seven storm violet, and the one nearest Kes's house in Rosalind's blue.
  const st = [165, 235, 300, 15, 115, 65, 190, 345].map((d) => rim(d, 0.45));
  const blue = st.reduce((b, q, i) => (q[0] ** 2 + (q[1] + 27) ** 2 < st[b]![0] ** 2 + (st[b]![1] + 27) ** 2 ? i : b), 0);
  st.forEach((q, i) => solid(q[0], q[1], i === blue ? "y" : "u", "streamer"));
  // The skiff, tied at the end of the landing.
  put(37, 7, "K", "skiff", " ");
  // The landing runs east here: its lamp post at the sky end.
  turns.landing = 0;
  return { rows: g.map((r) => r.join("")), turns, flags: [[-23, 0], [23, 0]].map(([x, y]) => ({ x: X(x!), y: Y(y!) })) };
}
