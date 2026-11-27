// The testing panel on the home screen: every switch the page reads from its address (?part1=7-8a,
// ?nopull and the rest), as a real control, so that nobody has to type a link. OPTIONS below is the
// whole list, and the panel is built from it: adding a switch is one line there. Each control only
// builds the link; a run sees an option once the page is loaded with it (Apply). The two marked
// `saved` (the ending and walking round water) are also remembered in this browser and take effect
// at once, as they always have.
// What each switch does is in the function that reads it (main.ts, client/ending.ts).

import { Game } from "../engine/game.js";
import { COVE } from "../engine/cove.js";
import { KITE } from "../engine/kite.js";
import { MOSS } from "../engine/mosshollow.js";
import { OFFSPRING } from "../engine/offspring.js";
import { TIDEPOOL } from "../engine/tidepool.js";
import { RESCUE } from "../engine/rescue.js";
import { SHIP } from "../engine/shiphome.js";
import { ENDING_CUTS, endingCut, setEndingCut } from "./ending.js";
import { PART1 } from "./part1.js";

export type Section = "jump" | "run1" | "run6" | "run8" | "run9" | "run10" | "rematch" | "cove" | "moss" | "tidepool" | "kite" | "p2fight" | "walks" | "other";

/** The panel's sections after Jump to and Story progress, in order. */
export const SECTIONS: { id: Exclude<Section, "jump">; title: string }[] = [
  { id: "run1", title: "Run 1, the Kindling" },
  { id: "run6", title: "Runs 6 and 7, the dying brazier" },
  { id: "run8", title: "Run 8, the Sieve" },
  { id: "run9", title: "Run 9, the rescue" },
  { id: "run10", title: "Run 10, the ship home" },
  { id: "rematch", title: "Optional: Granny's rematch" },
  { id: "cove", title: "Optional: Lumi's lesson with Kes" },
  { id: "moss", title: "Optional: Moss Hollow" },
  { id: "tidepool", title: "Optional: Tidepool Steps" },
  { id: "kite", title: "Optional: Kes's rematch on the Fell" },
  { id: "p2fight", title: "Part 2, runs 3 and 4: the offspring fight" },
  { id: "walks", title: "Walks between runs" },
  { id: "other", title: "Other" },
];

/** A setting kept in this browser as well as in the link: what it is now, and how to keep a new value. */
interface Saved {
  /** The value it has when nothing is set; it is left out of the link. */
  def: string;
  get(): string;
  set(v: string): void;
}

export interface Opt {
  /** The parameter in the address. */
  key: string;
  /** What it does, in a plain sentence. */
  label: string;
  section: Section;
  /**
   * flag: a checkbox. choice: a select (the first value is the run's own and is left out of the
   * link). number: a number box. list: a text box. tune: one number box for each number in `of`,
   * written as key:value,key:value.
   */
  kind: "flag" | "choice" | "number" | "list" | "tune";
  /** flag: the value it is written with (key=on), and only that value ticks it. Without it the bare key is written, and any value ticks it. */
  on?: string;
  /** flag: the value written when it is not ticked (only for a saved flag that is on by default). */
  off?: string;
  /** choice: [value, what it means]. */
  values?: readonly (readonly [string, string])[];
  /** number: the range the run accepts, and the step. */
  min?: number;
  max?: number;
  step?: number;
  /** number, list: what the run uses when the box is empty (shown greyed in it). */
  placeholder?: string;
  /** A second line under the label. */
  hint?: string;
  /** tune: the run's own numbers. */
  of?: object;
  saved?: Saved;
  /** The element's id, for an option something else finds by id. */
  id?: string;
  /** choice: a Go button beside it, which plays the pick now (a Part 1 piece, or where the Part 2 fight starts). */
  go?: true;
}

const WALK_ROUND_KEY = "lanternfall.walkRound";
const walkRound: Saved = {
  def: "1",
  get: () => (Game.walkRound ? "1" : "0"),
  set: (v) => {
    Game.walkRound = v !== "0";
    try {
      localStorage.setItem(WALK_ROUND_KEY, Game.walkRound ? "1" : "0");
    } catch {}
  },
};
const ending: Saved = { def: "test", get: () => endingCut(), set: (v) => setEndingCut(v) };

export const OPTIONS: Opt[] = [
  { section: "jump", key: "part1", kind: "choice", go: true, id: "part1-pick", label: "Part 1 piece", hint: "Go plays it now. In the link, the page opens straight into it.", values: [["", "None, open the menu"], ...PART1.map((p) => [p.id, `${p.name} (${p.id})`] as const)] },
  { section: "jump", key: "part2", kind: "choice", go: true, id: "part2-pick", label: "Part 2: the offspring fight", hint: "A prototype on placeholder shapes. Go plays it now, with the numbers set below.", values: [["", "None, open the menu"], ["3", "Run 3, from the first pull"], ["4", "Run 4, from her flare"]] },

  { section: "run1", key: "ending", kind: "choice", id: "ending-pick", saved: ending, label: "Which cut of the ending plays", hint: "Remembered in this browser too.", values: ENDING_CUTS.map((c) => [c.id, c.name] as const) },

  { section: "run6", key: "noalarm", kind: "flag", label: "Skip the alarm pictures and start on the board" },
  { section: "run6", key: "calls", kind: "flag", label: "Lumi takes over the calls when Hesta's voice cuts off (ruled out, kept to compare)" },
  { section: "run6", key: "noback", kind: "flag", label: "Hesta's line gives nothing back (normally it returns the wisps lost near the end of run 6)" },
  { section: "run6", key: "nocloud", kind: "flag", label: "The cloud never reaches Rook at the bottom" },
  { section: "run6", key: "stillsonly", kind: "flag", label: "Play the three comet pictures alone, without the comet landing on the map" },
  { section: "run6", key: "nocrowd", kind: "flag", label: "Hide the village watching from Hesta's terrace" },

  { section: "run8", key: "pull", kind: "choice", label: "Which take of the pull plays", values: [["", "The tug, the third take (the run's own)"], ["2", "The second take (v112)"], ["1", "The first take (v111)"]] },
  { section: "run8", key: "nopull", kind: "flag", label: "No pull at all (v108). This wins over the take above." },

  { section: "run9", key: "patch", kind: "choice", label: "Where the dark patch goes", values: [["", "For the brightest light, the lamp too (the run's own)"], ["clock", "On a clock he can read (the build before, v155)"], ["react", "For light, swelling over a heap"], ["seek", "For light, at one size"], ["line", "Along the first build's fixed lines"], ["drag", "It carries wisps off (the first sketch)"]] },
  { section: "run9", key: "sip", kind: "number", min: 0, max: 30, step: 1, placeholder: String(RESCUE.patch.bait.sip), label: "Ticks the lamp waits between two wisps (0 for no wait)" },
  { section: "run9", key: "clock", kind: "list", placeholder: RESCUE.patch.clock.at.join(","), label: "When the three crossings are told, as parts of the cloud's way", hint: "Three numbers between 0 and 1, with commas." },
  { section: "run9", key: "kes", kind: "choice", label: "What Kes does", values: [["", "Sets hers down at the stones for Rook, and keeps busy (the run's own)"], ["banks", "Banks her own, as in the first build"], ["still", "Waits where her next pair comes up when she has nothing to do"]] },
  { section: "run9", key: "lamp", kind: "choice", label: "The docked lamp, with a patch rule other than the run's own", values: [["", "Loses its pips unless it is fed in time"], ["holds", "Keeps its pips"]] },
  { section: "run9", key: "flare", kind: "flag", on: "1", label: "Three wisps in quick succession give a pip more (a try)" },

  { section: "run10", key: "speed", kind: "flag", on: "0", label: "Turn speed off: the lamp's fire no longer sets how fast the ship and the wisps go" },
  { section: "run10", key: "banks", kind: "flag", on: "0", label: "Turn the cloud banks off (they sweep down one side and hide wisps)" },
  { section: "run10", key: "hauls", kind: "flag", on: "0", label: "Turn hauls off (big wisps far out are worth more but slow to bring in)" },
  { section: "run10", key: "len", kind: "number", min: 60, max: SHIP.ticksLong, step: 1, placeholder: String(SHIP.ticks), label: `Length of the run in ticks (${SHIP.ticksLong} is the long one)` },
  { section: "run10", key: "far", kind: "number", min: 4, max: SHIP.offMax, step: 1, placeholder: String(SHIP.off[1]), label: `Farthest lane, in tiles off the rail (the run's own is ${SHIP.off[1]}, or ${SHIP.offNarrow} on a screen held upright)` },
  { section: "run10", key: "reach", kind: "choice", label: "How far his pull reaches from the middle of the deck", values: [["", `${SHIP.reach} tiles (the run's own)`], ["10", "10 tiles"], ["12", "12 tiles"]] },
  { section: "run10", key: "wind", kind: "number", min: 0.5, max: 1.5, step: 0.05, placeholder: "1", label: "Wind, as a share of the run's own (0.5 to 1.5)" },
  { section: "run10", key: "nodraw", kind: "flag", label: "A hauled wisp lies at the rail for him to pull again" },

  { section: "rematch", key: "cheat", kind: "choice", label: "Granny's cheat", values: [["", "Each in turn, one a rematch (the run's own)"], ["hold", "The earth hold"], ["goal", "My pond, the goal moves"], ["nap", "Nap time"]] },
  { section: "rematch", key: "granny", kind: "flag", on: "beatable", label: "Granny plays it straight and can lose, for comparison" },

  { section: "cove", key: "cove", kind: "tune", of: COVE, label: "The run's numbers" },
  { section: "moss", key: "moss", kind: "tune", of: MOSS, label: "The run's numbers" },
  { section: "tidepool", key: "tidepool", kind: "tune", of: TIDEPOOL, label: "The run's numbers" },
  { section: "kite", key: "kite", kind: "tune", of: KITE, label: "The run's numbers" },

  { section: "p2fight", key: "fight", kind: "tune", of: OFFSPRING, label: "The fight's numbers", hint: "it.size is how many tiles across it is (try 4). knockdown.on: 0 turns the knockdown off. One tick is 0.6 s." },

  { section: "walks", key: "walkspeed", kind: "choice", label: "Walking speed on the walks", values: [["", "Normal"], ["1.5", "1.5 times"], ["2", "Twice"], ["2.5", "2.5 times"]] },
  { section: "walks", key: "only", kind: "flag", on: "rook", label: "Only Rook's stride is longer; the walk's beat stays as it is" },

  { section: "other", key: "walkround", kind: "flag", on: "1", off: "0", id: "walk-round", saved: walkRound, label: "Tapping a wisp across water walks you round it", hint: "Remembered in this browser too." },
  { section: "other", key: "nostills", kind: "flag", label: "Leave the pictures out of runs 8, 9 and 10" },
  { section: "other", key: "reward", kind: "flag", on: "1", label: "Show the placeholder reward on an optional run's first win" },
  { section: "other", key: "dbg", kind: "flag", label: "Expose the 3D world as window.__world, for checks in a headless browser" },
];

/** Parameters the page reads that the panel leaves alone (a room code joins a room). */
const LEFT_OUT = new Set(["room"]);

/** Every number in a run's numbers, by its path (tide.in), with the run's own value. Lists are left out, as the run leaves them. */
export function tuneKeys(of: object, path = ""): [string, number][] {
  const out: [string, number][] = [];
  for (const [k, v] of Object.entries(of)) {
    if (typeof v === "number") out.push([path + k, v]);
    else if (v && typeof v === "object" && !Array.isArray(v)) out.push(...tuneKeys(v, `${path}${k}.`));
  }
  return out;
}

/** The value of each option the address sets (saved ones aside), as it would be written: "" for a bare flag. Anything else it holds comes back as `extra`. */
export function readQuery(search: string) {
  const q = new URLSearchParams(search), values = new Map<string, string>();
  for (const o of OPTIONS) {
    const v = q.get(o.key);
    if (v === null || o.saved) continue;
    if (o.kind === "flag") {
      if (o.on === undefined) values.set(o.key, "");
      else if (v === o.on) values.set(o.key, v);
    } else if (o.kind === "choice") {
      if (v && o.values?.some(([x]) => x === v)) values.set(o.key, v);
    } else if (v.trim()) values.set(o.key, v.trim());
  }
  const known = new Set(OPTIONS.map((o) => o.key));
  const extra = [...q].filter(([k]) => !known.has(k) && !LEFT_OUT.has(k));
  return { values, extra };
}

/** A query string, keeping commas and colons as they are so that it reads as Ladi types it. */
export function writeQuery(pairs: Iterable<readonly [string, string]>) {
  const enc = (s: string) => encodeURIComponent(s).replace(/%2C/gi, ",").replace(/%3A/gi, ":");
  const out = [...pairs].map(([k, v]) => (v === "" ? enc(k) : `${enc(k)}=${enc(v)}`)).join("&");
  return out ? `?${out}` : "";
}

/** tune: key:value pairs as a map, keeping only the keys the run has. */
function readTune(v: string, keys: Set<string>) {
  const m = new Map<string, string>();
  for (const part of v.split(",")) {
    const [k, x] = part.split(":");
    if (k && keys.has(k) && x !== undefined && x.trim() !== "") m.set(k, x.trim());
  }
  return m;
}

// ---------------------------------------------------------------- the panel

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props;
  Object.assign(e, rest);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

/** The parameter, small and muted beside a label, as it is written in a link. */
const keyTag = (o: Opt) => el("code", { class: "t-key" }, o.kind === "flag" && o.on !== undefined && !o.saved ? `${o.key}=${o.on}` : o.key);

interface Control {
  opt: Opt;
  /** What it writes into the link, or null for nothing. */
  value(): string | null;
  /** Show a value (null: as the run has it). */
  show(v: string | null): void;
}

let uid = 0;

function control(o: Opt, onGo: (key: string, value: string) => void): { c: Control; row: HTMLElement } {
  const text = (forId?: string) => {
    const t = el(forId ? "label" : "span", { class: "t-text" }, o.label, " ", keyTag(o));
    if (forId) (t as HTMLLabelElement).htmlFor = forId;
    return t;
  };
  const hint = () => (o.hint ? [el("span", { class: "t-hint" }, o.hint)] : []);
  const id = o.id ?? `t-${o.key}-${++uid}`;
  if (o.kind === "flag") {
    const box = el("input", { type: "checkbox", id });
    const on = o.on ?? "";
    const c: Control = {
      opt: o,
      value: () => (box.checked ? on : (o.off ?? null)),
      show: (v) => (box.checked = v !== null && v === on),
    };
    const row = el("div", { class: "t-row t-flag" }, box, el("div", { class: "t-label" }, text(id), ...hint()));
    return { c, row };
  }
  if (o.kind === "choice") {
    const sel = el("select", { id }, ...(o.values ?? []).map(([v, t]) => el("option", { value: v }, t)));
    const c: Control = { opt: o, value: () => sel.value || null, show: (v) => (sel.value = v ?? o.values?.[0]?.[0] ?? "") };
    let field: HTMLElement = sel;
    if (o.go) {
      const go = el("button", { type: "button", className: "small", textContent: "Go" });
      const sync = () => (go.disabled = !sel.value);
      sel.addEventListener("change", sync);
      go.setAttribute("aria-label", `Play ${o.label}`);
      go.onclick = () => sel.value && onGo(o.key, sel.value);
      field = el("div", { class: "t-pair" }, sel, go);
      queueMicrotask(sync);
      c.show = (v) => ((sel.value = v ?? ""), sync());
    }
    return { c, row: el("div", { class: "t-row" }, text(id), ...hint(), field) };
  }
  if (o.kind === "number" || o.kind === "list") {
    const box = el("input", { id, type: o.kind === "number" ? "number" : "text", inputMode: "decimal", placeholder: o.placeholder ?? "", autocomplete: "off" });
    if (o.min !== undefined) box.min = String(o.min);
    if (o.max !== undefined) box.max = String(o.max);
    if (o.step !== undefined) box.step = String(o.step);
    const c: Control = { opt: o, value: () => box.value.trim() || null, show: (v) => (box.value = v ?? "") };
    return { c, row: el("div", { class: "t-row" }, text(id), ...hint(), box) };
  }
  // tune: a box for each of the run's numbers, its own value greyed in it.
  const keys = tuneKeys(o.of ?? {});
  const boxes = keys.map(([k, v]) => [k, el("input", { type: "number", inputMode: "decimal", step: "any", placeholder: String(v), autocomplete: "off", id: `${id}-${k}` })] as const);
  const known = new Set(keys.map(([k]) => k));
  const c: Control = {
    opt: o,
    value: () => boxes.filter(([, b]) => b.value.trim()).map(([k, b]) => `${k}:${b.value.trim()}`).join(",") || null,
    show: (v) => {
      const m = readTune(v ?? "", known);
      for (const [k, b] of boxes) b.value = m.get(k) ?? "";
    },
  };
  const grid = el("div", { class: "t-tune" }, ...boxes.map(([k, b]) => el("label", { htmlFor: b.id }, el("span", {}, k), b)));
  const row = el("div", { class: "t-row" }, el("span", { class: "t-text" }, o.label, " ", keyTag(o)), ...hint(), el("span", { class: "t-hint" }, "Fill in a box to change that number. An empty box keeps the run's own, shown greyed."), grid);
  return { c, row };
}

/**
 * Build the panel into #progress (index.html holds its frame, Story progress and the walk picker,
 * which main.ts wires). `play` plays a Jump to pick now: a Part 1 piece by its id, as ?part1= does,
 * or the Part 2 fight from run 3 or 4, as ?part2= does.
 */
export function buildTesting(play: (key: string, value: string) => void) {
  // As before: the address, else this browser, says whether tapping across water walks round it.
  try {
    const v = new URLSearchParams(location.search).get("walkround") ?? localStorage.getItem(WALK_ROUND_KEY);
    if (v !== null) Game.walkRound = v !== "0";
  } catch {}

  const panel = document.getElementById("progress") as HTMLDetailsElement;
  const url = document.getElementById("t-url") as HTMLTextAreaElement;
  const status = document.getElementById("t-status")!;
  const apply = document.getElementById("t-apply") as HTMLButtonElement;
  const base = `${location.origin}${location.pathname}`;
  const loaded = readQuery(location.search);
  let extra = loaded.extra;
  const controls: Control[] = [];
  const counts = new Map<Section, HTMLElement>();

  const go = (key: string, value: string) => {
    // Nothing else changed: play it here. Otherwise load the page with the options set, which opens it.
    // (Only the pick itself is written: two Jump to picks in one link would open the first.)
    const jumps = OPTIONS.filter((x) => x.go).map((x) => x.key);
    if (query(jumps) === start) play(key, value);
    else location.assign(base + query(jumps.filter((k) => k !== key)));
  };
  // Jump to's own options go under its heading, above the walk picker.
  let after: Element = document.querySelector("#t-jump h3")!;
  for (const o of OPTIONS.filter((x) => x.section === "jump")) {
    const { c, row } = control(o, go);
    controls.push(c);
    after.after(row);
    after = row;
  }
  const runs = document.getElementById("t-runs")!;
  for (const s of SECTIONS) {
    const count = el("span", { class: "t-count" });
    const body = el("div", { class: "t-rows" });
    for (const o of OPTIONS.filter((x) => x.section === s.id)) {
      const { c, row } = control(o, go);
      controls.push(c);
      body.append(row);
    }
    counts.set(s.id, count);
    runs.append(el("details", { class: "t-sec" }, el("summary", {}, el("span", {}, s.title), count), body));
  }

  /** The query the controls make, leaving out the keys given. */
  function query(skip: string[] = []) {
    const pairs: [string, string][] = [];
    for (const c of controls) {
      const v = c.value();
      if (v === null || skip.includes(c.opt.key) || (c.opt.saved && v === c.opt.saved.def)) continue;
      pairs.push([c.opt.key, v]);
    }
    return writeQuery([...pairs, ...extra]);
  }
  function refresh() {
    url.value = base + query();
    for (const [s, n] of counts) {
      const k = controls.filter((c) => c.opt.section === s && c.value() !== null && !(c.opt.saved && c.value() === c.opt.saved.def)).length;
      n.textContent = k ? `${k} set` : "";
    }
    const changed = query() !== startAll;
    apply.classList.toggle("ready", changed);
    status.textContent = changed ? "Changed. Apply reloads the page with these options." : location.search ? "These are the options this page was opened with." : "";
  }

  for (const c of controls) c.show(c.opt.saved ? c.opt.saved.get() : (loaded.values.get(c.opt.key) ?? null));
  const start = query(OPTIONS.filter((x) => x.go).map((x) => x.key)), startAll = query();
  refresh();
  // A section with something set opens, so that what is set shows.
  for (const d of runs.querySelectorAll<HTMLDetailsElement>("details.t-sec")) d.open = !!d.querySelector(".t-count")!.textContent;

  panel.addEventListener("input", refresh);
  panel.addEventListener("change", (e) => {
    const c = controls.find((x) => x.opt.saved && (e.target as HTMLElement).id === x.opt.id);
    if (c) c.opt.saved!.set(c.value() ?? c.opt.saved!.def);
    refresh();
  });
  url.onfocus = () => url.select();
  document.getElementById("t-copy")!.onclick = async () => {
    const text = base + query();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      url.focus();
      url.select();
      document.execCommand("copy");
    }
    status.textContent = "Link copied.";
  };
  apply.onclick = () => location.assign(base + query());
  document.getElementById("t-clear")!.onclick = () => {
    extra = [];
    for (const c of controls) {
      c.show(c.opt.saved ? c.opt.saved.def : null);
      if (c.opt.saved) c.opt.saved.set(c.opt.saved.def);
    }
    refresh();
    status.textContent = query() === startAll ? "Nothing is set." : "Cleared. Apply reloads the page with no options.";
  };

  // The panel stays open across a reload once it has been opened (closed the first time).
  const OPEN_KEY = "lanternfall.testingOpen";
  try {
    panel.open = localStorage.getItem(OPEN_KEY) === "1";
  } catch {}
  panel.addEventListener("toggle", () => {
    try {
      localStorage.setItem(OPEN_KEY, panel.open ? "1" : "0");
    } catch {}
  });
}
