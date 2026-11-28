// Optional run 3a, Moss Hollow, the moss job (Garrick): the numbers that set its feel, in one place.
// Drafts, to be judged by playing (gameplay/optional-runs-prototype-brief.md, card O3a).
// Rook, with Lumi to send; Garrick by his fire; Hesta a voice. Garrick wants nine for the brazier.
// The island does one thing: moss grows over a wisp that lies still, and a wisp under moss cannot
// be pulled until the moss is cut away, one staff stroke at a time. The limit: Lumi counts his
// strokes, so many for the whole job. A pull is not a stroke; a cut into moss is. The choice: cut
// into a thick old patch that holds several at once, or run for the bare singles before the moss
// takes them (it does, if they lie long). Lumi, sent, tears at the moss with her hands: slowly, and
// only twice. The board is run 4's (maps.ts "moss-hollow"); offsets are tiles from the brazier,
// x east, y south.

export interface MossPatch {
  /** Where its first wisp lies; the rest lie next to it (east, then south, then south-east). */
  at: readonly [number, number];
  /** How many wisps it holds. */
  n: number;
  /** Strokes it takes to cut away. */
  cover: number;
  /** Garrick's old patch: clearing it is what he hoped for. */
  old?: boolean;
}

export const MOSS = {
  id: "o3a",
  run: "Moss Hollow",
  title: "Moss Hollow",
  shrine: "moss-hollow",
  bellTicks: 4,
  /** Garrick's count. */
  target: 9,
  /** Lumi's count: strokes for the whole job. */
  strokes: 8,
  /** How far his staff reaches (the game's usual pull is 10): the glade is small. */
  reach: 7,
  /** A bare wisp left lying this many ticks (unheld, not moving) is taken by the moss: a cover of one. */
  creep: 12,
  /** Moss over a single thickens by one this often, up to `singleMax`. */
  thicken: 16,
  singleMax: 3,
  /** The patches, there from the start. The old one is the rich one; one looks as thick and hides one. */
  patches: [
    { at: [11, -3], n: 3, cover: 4, old: true },
    { at: [-12, 4], n: 2, cover: 3 },
    { at: [3, 15], n: 1, cover: 4 },
  ] as readonly MossPatch[],
  /** Mossed singles there from the start, and their cover. */
  mossed: [[-8, -9], [8, 9]] as readonly (readonly [number, number])[],
  mossedCover: 2,
  /** Bare singles there from the start, out in the glade. */
  bare: [[-14, -2], [14, 6], [-4, -15]] as readonly (readonly [number, number])[],
  /** More come up bare, out in the glade (at least `far` tiles from the fire), one every `every` ticks, `n` of them in all. */
  rise: { every: 14, n: 6, far: 8 },
  /** Lumi, sent: how many times, how near a patch she has to be to tear at it, and a tear every so many ticks. */
  lumiSends: 2,
  lumiTear: 6,
  lumiNear: 1.5,
  /** A job left standing ends here, unannounced (4 minutes): only a player who has stopped playing meets it. */
  giveUp: 400,
  /** The goal stays up this long as a caption (6 seconds). */
  goalTicks: 10,
  /** A line that names the choice stays up this long. */
  landTicks: 10,
  /** Where they stand at the start (south-west of the fire), and where Garrick waits. */
  rook: [-2, 7] as const,
  lumi: [-1, 7] as const,
  garrick: [-4, 6] as const,
};

/** The number words for Garrick's and Lumi's counts. */
export const MOSS_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
export const mossWord = (n: number) => MOSS_WORDS[n] ?? String(n);
