// The fight's debug menu (Part 2, runs 3 and 4; a prototype tool, never for players: switch it
// off before any release). Ladi asked for it on 27 Nov at 10:36 PM ("Can you add a debug menu?"),
// after having to type ?fight=it.size:4 into a link to make the offspring bigger. The gameplay
// thread drew up what goes in it. Every change lands in OFFSPRING at once, which the room in this
// page reads each tick; the few numbers read only when a fight is built say so, and take a reload.
// It opens from the Debug button in the fight's top corner, or the \ key, and the fight stands
// still while it is open (the pause box). ?nodebug hides it.

import { OFFSPRING } from "../engine/offspring.js";
import type { FightRoom } from "../server/offspring.js";
import { FIGHT_MUTE } from "./fight-music.js";
import { FIGHT_SOUNDS, playFightSound } from "./offspring-sfx.js";
import { tuneKeys } from "./testing.js";

/** One tick of the fight, in seconds. */
const TICK_S = 0.6;

/** The fight's own numbers, as the page loaded them (before any ?fight= in the link). */
const OWN = new Map(tuneKeys(OFFSPRING));

interface Dial {
  path: string;
  label: string;
  /** ticks: shown and typed in seconds. onoff: a checkbox (1 on, 0 off). */
  unit?: "ticks" | "onoff";
  /** Read only when the fight is built: it needs a reload. */
  reload?: true;
  step?: number;
}

/** The common dials, in plain words (the gameplay thread's list). */
const DIALS: Dial[] = [
  { path: "it.size", label: "Its size, in tiles", reload: true, step: 0.5 },
  { path: "it.speed", label: "Its top speed (tiles a tick, full of light)", step: 0.1 },
  { path: "it.slow", label: "Its speed when empty", step: 0.1 },
  { path: "wound.crawl", label: "Its crawl, hurt (tiles a tick)", step: 0.1 },
  { path: "hunt.tears", label: "Tears before it jumps away", step: 1 },
  { path: "hunt.away", label: "Time it stays away", unit: "ticks" },
  { path: "hunt.safe", label: "Can't be struck while away", unit: "onoff" },
  { path: "hunt.fling", label: "How far torn light is flung (tiles)", step: 1 },
  { path: "eye.ticks", label: "Eye turn, before it locks", unit: "ticks" },
  { path: "eye.hold", label: "Gaze hold", unit: "ticks" },
  { path: "eye.cone", label: "Cone width (degrees)", step: 5 },
  { path: "dark.on", label: "The dark in run 4", unit: "onoff", reload: true },
  { path: "dark.glow", label: "Afterglow", unit: "ticks" },
  { path: "hop.on", label: "Its hops", unit: "onoff" },
  { path: "knockdown.on", label: "Its knockdown", unit: "onoff" },
  { path: "her.regen4", label: "Solenne's charge a tick (run 4)", step: 0.05 },
  { path: "hunt.stun", label: "Her stun", unit: "ticks" },
  { path: "it.eatLoose", label: "Time to eat a loose light", unit: "ticks" },
  { path: "it.eatBanked4", label: "Time to drink from the brazier (run 4)", unit: "ticks" },
  { path: "death.ticks", label: "The kill scene's length", unit: "ticks" },
];
/** In the full list too, these take a reload (read when the fight is built). */
const RELOAD = new Set(["it.size", "dark.on", "start", "shrine", "wisps", "bellTicks"]);

function getAt(path: string): number {
  let at: unknown = OFFSPRING;
  for (const s of path.split(".")) at = (at as Record<string, unknown>)?.[s];
  return at as number;
}
function setAt(path: string, v: number) {
  const steps = path.split("."), last = steps.pop()!;
  let at = OFFSPRING as unknown as Record<string, unknown>;
  for (const s of steps) at = at[s] as Record<string, unknown>;
  if (typeof at[last] === "number" && Number.isFinite(v)) at[last] = v;
}

/** The ?fight= value for every number now changed from the fight's own (and where it starts). */
function fightParam(start: 3 | 4 | null) {
  const out = [...OWN].filter(([k, v]) => getAt(k) !== v).map(([k]) => `${k}:${+getAt(k).toFixed(4)}`);
  if (start === 4) out.unshift("start:4");
  return out.join(",");
}
function linkNow(start: 3 | 4 | null) {
  const q = new URLSearchParams(location.search);
  q.delete("part2");
  const p = fightParam(start);
  if (p) q.set("fight", p);
  else q.delete("fight");
  const s = q.toString().replace(/%2C/gi, ",").replace(/%3A/gi, ":");
  return `${location.origin}${location.pathname}${s ? `?${s}` : ""}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props;
  Object.assign(e, rest);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

const CSS = `
#fdbg-btn { position: fixed; top: 52px; left: 8px; z-index: 30; font: 600 12px system-ui, sans-serif; padding: 4px 10px; border-radius: 6px; border: 1px solid #ffffff44; background: #14121ccc; color: #f1e6c8; cursor: pointer; }
#fdbg { position: fixed; top: 52px; left: 8px; z-index: 31; width: min(380px, calc(100vw - 16px)); max-height: calc(100vh - 70px); overflow-y: auto; background: #0e0c14f2; color: #e8e0cc; border: 1px solid #ffffff33; border-radius: 10px; font: 13px/1.35 system-ui, sans-serif; padding: 8px 10px 12px; box-sizing: border-box; }
#fdbg[hidden], #fdbg-btn[hidden] { display: none; }
#fdbg h3 { margin: 12px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #d9b86a; }
#fdbg .fd-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
#fdbg .fd-head b { font-size: 14px; }
#fdbg .fd-row { display: grid; grid-template-columns: 1fr 86px; gap: 8px; align-items: center; padding: 3px 0; }
#fdbg .fd-row label { overflow-wrap: anywhere; }
#fdbg .fd-row small { display: block; opacity: 0.55; font-size: 11px; }
#fdbg .fd-row.changed label { color: #ffd890; }
#fdbg input[type=number] { width: 100%; box-sizing: border-box; background: #1c1926; color: inherit; border: 1px solid #ffffff33; border-radius: 4px; padding: 3px 5px; font: inherit; }
#fdbg input[type=checkbox] { justify-self: start; width: 18px; height: 18px; }
#fdbg .fd-flags label { display: flex; gap: 8px; align-items: center; padding: 2px 0; margin: 0; min-height: 0; }
#fdbg button { min-height: 0; min-width: 0; width: auto; }
#fdbg input[type=checkbox] { margin: 0; }
#fdbg .fd-btns { display: flex; flex-wrap: wrap; gap: 6px; }
#fdbg button { font: 12px system-ui, sans-serif; padding: 5px 9px; border-radius: 6px; border: 1px solid #ffffff44; background: #221f2e; color: #f1e6c8; cursor: pointer; }
#fdbg button:hover { background: #2e2a3d; }
#fdbg .fd-sounds button { padding: 4px 7px; font-size: 11px; }
#fdbg details summary { cursor: pointer; margin: 12px 0 4px; color: #d9b86a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
#fdbg .fd-note { opacity: 0.6; font-size: 11px; margin: 4px 0; }
#fdbg .fd-status { min-height: 1.2em; font-size: 11px; color: #a9d8a0; margin: 6px 0 0; }
`;

/**
 * Starts the menu. `fight` says which fight room is on now (null when none is), so the button
 * shows only in the fight.
 */
export function initFightDebug(fight: () => FightRoom | null) {
  if (new URLSearchParams(location.search).has("nodebug")) return;
  document.head.append(el("style", { textContent: CSS }));
  const btn = el("button", { id: "fdbg-btn", type: "button", textContent: "Debug" });
  btn.hidden = true;
  const box = el("div", { id: "fdbg" });
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Fight debug menu");
  document.body.append(btn, box);
  // Taps and keys in the menu are its own, not the fight's.
  for (const ev of ["pointerdown", "pointerup", "click", "wheel", "touchstart"] as const) box.addEventListener(ev, (e) => e.stopPropagation());
  box.addEventListener("keydown", (e) => e.key !== "Escape" && e.key !== "\\" && e.stopPropagation());

  const status = el("p", { class: "fd-status" });
  status.setAttribute("aria-live", "polite");
  const say = (s: string) => {
    status.textContent = s;
    window.setTimeout(() => status.textContent === s && (status.textContent = ""), 3500);
  };
  const refreshers: (() => void)[] = [];
  const refresh = () => refreshers.forEach((f) => f());

  /** A number box (or a checkbox) on one of OFFSPRING's numbers. */
  const row = (path: string, label: string, unit?: Dial["unit"], step?: number, reload?: boolean) => {
    const own = OWN.get(path) ?? getAt(path);
    const id = `fdbg-${path.replace(/\./g, "-")}`;
    const sub = [unit === "ticks" ? `seconds (${own} ticks is its own: ${+(own * TICK_S).toFixed(2)} s)` : `its own: ${own}`, reload ? "takes a reload" : ""].filter(Boolean).join(", ");
    const lab = el("label", { htmlFor: id }, label, el("small", {}, `${path}, ${sub}`));
    const r = el("div", { class: "fd-row" });
    let input: HTMLInputElement;
    if (unit === "onoff") {
      input = el("input", { type: "checkbox", id });
      input.onchange = () => (setAt(path, input.checked ? 1 : 0), refresh());
      refreshers.push(() => ((input.checked = getAt(path) > 0), r.classList.toggle("changed", getAt(path) !== own)));
    } else {
      input = el("input", { type: "number", id, step: String(unit === "ticks" ? 0.6 : step ?? "any"), inputMode: "decimal" });
      input.onchange = () => {
        const v = Number(input.value);
        if (input.value.trim() === "" || !Number.isFinite(v)) return refresh();
        setAt(path, unit === "ticks" ? Math.max(0, Math.round(v / TICK_S)) : v);
        refresh();
      };
      refreshers.push(() => {
        const v = getAt(path);
        if (document.activeElement !== input) input.value = String(unit === "ticks" ? +(v * TICK_S).toFixed(2) : v);
        r.classList.toggle("changed", v !== own);
      });
    }
    r.append(lab, input);
    return r;
  };

  const room = () => fight();
  const start = () => room()?.run ?? null;

  // The head: close, and pause.
  const close = el("button", { type: "button", textContent: "Close" });
  close.onclick = () => show(false);
  const head = el("div", { class: "fd-head" }, el("b", {}, "Fight debug"), close);

  const flag = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const c = el("input", { type: "checkbox" });
    c.onchange = () => set(c.checked);
    refreshers.push(() => (c.checked = get()));
    return el("label", {}, c, label);
  };
  const flags = el(
    "div",
    { class: "fd-flags" },
    flag("Pause the fight while this is open", () => pauseOnOpen, (v) => ((pauseOnOpen = v), (room() && (room()!.dbg.paused = v && !box.hidden)))),
    flag("See it through the dark", () => !!room()?.dbg.see, (v) => room() && (room()!.dbg.see = v)),
    flag("Can't be caught", () => !!room()?.dbg.safe, (v) => room() && (room()!.dbg.safe = v)),
    flag("Mute the music", () => FIGHT_MUTE.music, (v) => (FIGHT_MUTE.music = v)),
    flag("Mute its sounds", () => FIGHT_MUTE.sounds, (v) => (FIGHT_MUTE.sounds = v)),
  );

  const act = (label: string, f: () => void) => {
    const b = el("button", { type: "button", textContent: label });
    b.onclick = f;
    return b;
  };
  const run = (cmd: "restart3" | "restart4" | "win" | "lose", done: string) => () => {
    const r = room();
    if (!r) return say("No fight is on.");
    r.debug(cmd);
    say(done);
  };
  const actions = el(
    "div",
    { class: "fd-btns" },
    act("Restart run 3", run("restart3", "Run 3 again, with these numbers.")),
    act("Restart run 4", run("restart4", "Run 4 again, with these numbers.")),
    act("Win now", run("win", "Its death plays, then the card.")),
    act("Lose now", run("lose", "The card for another try.")),
    act("Reload with these", () => location.assign(linkNow(start()))),
  );

  const dials = el("div", {}, ...DIALS.map((d) => row(d.path, d.label, d.unit, d.step, d.reload)));
  const all = el("details", {}, el("summary", {}, "All numbers"), el("p", { class: "fd-note" }, "Every number in the fight (OFFSPRING). One tick is 0.6 s; these are in ticks and tiles as the code keeps them."));
  all.addEventListener("toggle", () => {
    if (!all.open || all.dataset.built) return;
    all.dataset.built = "1";
    for (const [k] of OWN) all.append(row(k, k, undefined, undefined, RELOAD.has(k) || RELOAD.has(k.split(".")[0]!)));
    refresh();
  });

  const sounds = el("div", { class: "fd-btns fd-sounds" }, ...FIGHT_SOUNDS.map((n) => act(n, () => !playFightSound(n) && say("Sounds still loading, or none for that one. Try again in a moment."))));

  const copy = act("Copy link", () => {
    const u = linkNow(start());
    const ok = () => say("Link copied, with every changed number.");
    navigator.clipboard?.writeText(u).then(ok, () => window.prompt("Copy this link", u));
    if (!navigator.clipboard) window.prompt("Copy this link", u);
  });
  const reset = act("Reset numbers", () => {
    for (const [k, v] of OWN) setAt(k, v);
    refresh();
    say("Back to the fight's own numbers (restart for the ones read at the start).");
  });

  box.append(
    head,
    flags,
    el("h3", {}, "Actions"),
    actions,
    el("h3", {}, "Common dials"),
    el("p", { class: "fd-note" }, "Changes take effect at once, except those marked \"takes a reload\". Gold means changed."),
    dials,
    all,
    el("h3", {}, "Sound board"),
    sounds,
    el("h3", {}, "Share"),
    el("div", { class: "fd-btns" }, copy, reset),
    status,
  );

  let pauseOnOpen = true;
  function show(on: boolean) {
    box.hidden = !on;
    btn.hidden = on || !room();
    const r = room();
    if (r) r.dbg.paused = on && pauseOnOpen;
    if (on) refresh();
  }
  btn.onclick = () => show(true);
  window.addEventListener("keydown", (e) => {
    if (e.key === "\\" && room()) (show(box.hidden), e.preventDefault());
    else if (e.key === "Escape" && !box.hidden) show(false);
  });
  // The button only while a fight is on; a fight left with the menu open is not left paused.
  let was: FightRoom | null = null;
  window.setInterval(() => {
    const r = room();
    if (r !== was) {
      if (was) was.dbg.paused = false;
      was = r;
      if (!r) box.hidden = true;
      else if (!box.hidden) r.dbg.paused = pauseOnOpen;
    }
    btn.hidden = !r || !box.hidden;
  }, 400);
}
