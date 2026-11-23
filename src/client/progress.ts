// Saved story progress, in this browser only: the furthest walk reached and the next run.
// For testing it can be reset, and any walk can be opened from the menu.

export interface Progress {
  /** The furthest walk reached (0: none yet). */
  walk: number;
  /** The next run to play (1 to 10). */
  next: number;
}

const KEY = "lanternfall.progress";
const FRESH: Progress = { walk: 0, next: 1 };

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Progress> | null;
    if (p && Number.isInteger(p.walk) && Number.isInteger(p.next)) return { walk: p.walk!, next: p.next! };
  } catch {
    /* storage blocked or bad: start fresh */
  }
  return { ...FRESH };
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: progress lasts this page only */
  }
}

/** Something was reached: keep the furthest of each. */
export function reach(p: Partial<Progress>): Progress {
  const now = loadProgress();
  const out = { walk: Math.max(now.walk, p.walk ?? 0), next: Math.max(now.next, p.next ?? 0) };
  save(out);
  return out;
}

export function resetProgress(): Progress {
  save({ ...FRESH });
  return { ...FRESH };
}
