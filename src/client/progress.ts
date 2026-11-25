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

// The optional runs: for each, whether it has been won and the best score, in this browser only.

export interface OptRecord {
  /** The best score reached (for Granny's rematch, what the pond wall says). */
  best: number;
  /** Won at least once: a first win is what earns the run's reward. */
  won: boolean;
  /** Times played. */
  count: number;
  /** Granny's rematch: times the children reached four. */
  fours?: number;
}

const OPT_KEY = "lanternfall.optional";

function loadOpts(): Record<string, OptRecord> {
  try {
    const all = JSON.parse(localStorage.getItem(OPT_KEY) ?? "null") as Record<string, OptRecord> | null;
    if (all && typeof all === "object") return all;
  } catch {
    /* storage blocked or bad: nothing kept */
  }
  return {};
}

export function loadOpt(id: string): OptRecord {
  const r = loadOpts()[id];
  return r && Number.isFinite(r.best) && Number.isFinite(r.count) ? { best: r.best, won: !!r.won, count: r.count, fours: Number.isFinite(r.fours) ? r.fours : 0 } : { best: 0, won: false, count: 0, fours: 0 };
}

/** A run has ended: keep the better score. True if this was its first win. */
export function saveOpt(id: string, now: { best: number; won: boolean; count: number; fours?: number }): boolean {
  const all = loadOpts(), was = loadOpt(id);
  all[id] = { best: Math.max(was.best, now.best), won: was.won || now.won, count: Math.max(was.count, now.count), fours: Math.max(was.fours ?? 0, now.fours ?? 0) };
  try {
    localStorage.setItem(OPT_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: the record lasts this page only */
  }
  return now.won && !was.won;
}

export function resetOpts() {
  try {
    localStorage.removeItem(OPT_KEY);
  } catch {
    /* storage blocked */
  }
}
