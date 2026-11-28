// Focus mode and the control hints: every number in one place, and what this save has been told.
//
// Focus mode gives every wisp a finger-sized target with a ring round it. On a phone a long press
// on Next turns Next into the Focus button (a tap on it then switches focus mode off and on, and a
// long press gives Next back); on a keyboard it is the O key. One state for both.

export const CONTROLS = {
  focus: {
    /** A long press on Next: this many milliseconds. */
    holdMs: 550,
    /** Where two targets overlap the nearer centre wins; a wisp his staff can work now is this many pixels "nearer". */
    usablePx: 6,
  },
  hints: {
    /** How long a hint stays up, and the least time between two of them. */
    showMs: 5000,
    gapMs: 8000,
    /** Timed runs: on Walk this long with the clock live, he is reminded how to run (once a run). */
    walkAfterMs: 10000,
    /** This many taps in a row that miss, each within `missTiles` of a wisp, bring the focus hint back (once a run). */
    misses: 3,
    missTiles: 1.5,
  },
} as const;

/** Hints shown once per save. */
export type SavedHint = "focus" | "run";

const KEY = "lanternfall.hints";
function load(): Partial<Record<SavedHint, 1>> {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Record<SavedHint, 1>> | null) ?? {};
  } catch {
    return {};
  }
}
let seen = load();

export const hintSeen = (id: SavedHint) => seen[id] === 1;
export function markHint(id: SavedHint) {
  seen[id] = 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* storage blocked: it lasts this page only */
  }
}
/** With the story progress (the menu's reset): the hints come again. */
export function resetHints() {
  seen = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
