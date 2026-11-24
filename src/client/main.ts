// Lanternfall client: home screen, lobby, and the round itself.

import { Tile, type Board, type Pt } from "../engine/board.js";
import { Game, PULL_REACH, PUSH_REACH, ROUND_TICKS, TICK_MS, tideIn, type Action, type GameSnapshot, type Guild } from "../engine/game.js";
import { SHRINES, ringNote, shrineById, shrineFor } from "../engine/maps.js";
import { faceOf as faceFile } from "../engine/moods.js";
import { FLAMES, FLAME_COLORS, type BotDebug, type BotLevelName, type LobbyPlayer, type ClientMsg, type Flame, type RoomView, type ServerMsg, type StoryLine, type StoryView } from "../engine/protocol.js";
import { Room } from "../server/room.js";
import { LessonRoom } from "../server/lesson.js";
import { GrannyRoom, lineTicks } from "../server/granny.js";
import { stillMs } from "../engine/stills.js";
import { StillsPanel } from "./stills.js";
import { alarmCards } from "./alarm.js";
import { RaceRoom } from "../server/race.js";
import { DyingRoom } from "../server/dying.js";
import { SieveRoom } from "../server/sieve.js";
import { DYING } from "../engine/dying.js";
import { PondRoom } from "../server/pond.js";
import { JobRoom } from "../server/job.js";
import { WALKS } from "../engine/walks.js";
import { loadProgress, reach, resetProgress } from "./progress.js";
import { StoryRoom } from "../server/story.js";
import { Kitchen } from "./kitchen.js";
import { ENDING, ENDING_CUTS, endingCut, KindlingEnding, lanternCard, setEndingCut } from "./ending.js";
import * as sound from "./sound.js";
import { CAST_SCALE, Camera, GUILD_COLORS, GUILD_NAMES, World, drawMinimap, drawOverlay, loadModels, type DrawState } from "./view3d.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ connection

interface Link {
  send(m: ClientMsg): void;
  close(): void;
}

let link: Link | null = null;
let me = -1;
let room: RoomView | null = null;
let snap: GameSnapshot | null = null;
let prevSnap: GameSnapshot | null = null;
let snapAt = 0;
let tickMs = TICK_MS;
let practice = false;
let currentCode = "";

function onServer(m: ServerMsg) {
  switch (m.t) {
    case "welcome":
      me = m.you;
      if (!practice && currentCode) {
        try {
          sessionStorage.setItem(`lf-token-${currentCode}`, m.token);
        } catch {
          /* storage blocked */
        }
      }
      break;
    case "room": {
      const was = room?.phase;
      room = m.room;
      if (room.phase === "lobby" && was !== "lobby") {
        snap = prevSnap = null;
      }
      if (room.phase === "countdown" && was !== "countdown") cam.follow = true;
      if (room.story) storyPhaseSound(was);
      placeView(!!room.story?.pond, !!room.story?.pond?.leaving);
      openKitchen();
      noteProgress();
      render();
      break;
    }
    case "tick":
      prevSnap = snap && snap.tick === m.snap.tick - 1 ? snap : null;
      // Banked wisps waiting to come back (Granny's rim, run 4's waves) aren't on the board.
      if (m.snap.wisps.some((w) => w.away)) m.snap = { ...m.snap, wisps: m.snap.wisps.filter((w) => !w.away) };
      snap = m.snap;
      debugTick(m.snap, m.bots ?? []);
      snapAt = performance.now();
      tickMs = m.tickMs;
      for (const b of m.snap.banks) bankFlash(b.guild);
      if (room?.story) storyTickSound(m.snap);
      renderHud();
      break;
    case "say":
      for (const l of m.lines) sayLine(l);
      break;
    case "error":
      toast(m.message);
      break;
    case "pong":
      break;
  }
}

function connectOnline(code: string, name: string) {
  practice = false;
  currentCode = code;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?room=${code}`);
  let open = false;
  ws.onopen = () => {
    open = true;
    let token: string | undefined;
    try {
      token = sessionStorage.getItem(`lf-token-${code}`) || undefined;
    } catch {
      /* storage blocked */
    }
    ws.send(JSON.stringify({ t: "hello", name, token } satisfies ClientMsg));
  };
  ws.onmessage = (e) => onServer(JSON.parse(String(e.data)) as ServerMsg);
  ws.onclose = () => {
    if (link?.close !== closeIt) return;
    toast(open ? "Disconnected. Reconnecting…" : "Couldn't reach the room.");
    setTimeout(() => link?.close === closeIt && connectOnline(code, name), 1500);
  };
  const closeIt = () => ws.close();
  link = { send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)), close: closeIt };
  history.replaceState(null, "", `?room=${code}`);
}

/** Solo practice runs the same Room in the page, with no server at all. */
function connectPractice(name: string) {
  practice = true;
  const r = new Room("SOLO");
  const conn = r.connect((m) => queueMicrotask(() => onServer(m)));
  link = { send: (m) => conn.message(JSON.stringify(m)), close: () => conn.close() };
  link.send({ t: "hello", name });
  link.send({ t: "bot", guild: 1, level: botLevel() });
}

let storyRoom: LessonRoom | StoryRoom | GrannyRoom | PondRoom | JobRoom | RaceRoom | DyingRoom | SieveRoom | null = null;

/** A story run runs in the page too, like Practice: run 1 (the Grand Kindling), run 2 (Lumi's lesson) or run 3 (Granny's game). */
function connectStory(name: string, run: 1 | 2 | 3 | 4 | 5 | 6 | 8 | "pond" = 1, walk = 1) {
  practice = true;
  jumped = false;
  callMode = false;
  const r = run === "pond" ? new PondRoom(undefined, undefined, walk) : run === 8 ? sieveRoom() : run === 6 ? dyingRoom() : run === 5 ? new RaceRoom() : run === 4 ? new JobRoom() : run === 3 ? new GrannyRoom() : run === 2 ? new LessonRoom() : new StoryRoom();
  storyRoom = r;
  const conn = r.connect((m) => queueMicrotask(() => onServer(m)));
  link = { send: (m) => conn.message(JSON.stringify(m)), close: () => conn.close() };
  const hello = () => link?.send({ t: "hello", name: name || "Rook" });
  // Run 2 opens on Lumi's unlit lantern, where the eye was, before play.
  if (run === 2) {
    lanternCard(hello);
    // Hold the first lines until the picture has faded, so none plays under it.
    talkHold = performance.now() + (ENDING.lantern.hold + ENDING.lantern.fade) * 1000;
  }
  // Run 6 opens on the alarm: five held pictures, then the board.
  else if (run === 6 && !new URLSearchParams(location.search).has("noalarm")) {
    // The board is asked for early, under Lumi's shot, and its countdown waits out the rest of the alarm, in silence.
    const six = r as DyingRoom;
    talkHold = performance.now() + 60000;
    alarmUp = true;
    alarmDrawn = 0;
    alarmCards((leftMs) => ((six.lead = Math.ceil(leftMs / TICK_MS)), hello()), (skipped) => {
      alarmUp = false;
      if (skipped) six.cutLead();
      if (snap && room?.story?.dying) dyingSound(room.story.dying, snap);
      // Her first line waits for the picture to go, then comes at once.
      talkHold = performance.now() + DYING.alarm.fadeMs;
      if (talkQueue.length) nextTalk();
    });
  }
  else hello();
}

// ------------------------------------------------------------------ story dialog and barks

// Lines at the bells (play is stopped) get a dialog box with a portrait. Lines during play are
// barks that never block: by the wisp they're about, by Hesta's ring, or in a corner chip. A bark
// shows the moment it's said and replaces the one before; a late "Now." is worse than none.

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&${({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" } as Record<string, string>)[c]};`);
/** Lines are plain text; *word* is said with weight. */
const lineHtml = (t: string) => esc(t).replace(/\*([^*]+)\*/g, "<em>$1</em>");
/** The portrait for a line, by speaker and mood, or "" for speakers without one. */
const faceOf = (l: { who: string; text: string; mood?: string }) => {
  const f = faceFile(l.who, l.text, l.mood);
  return f ? `faces/${f}.webp` : "";
};
const faceHtml = (l: StoryLine) => (faceOf(l) ? `<img class="face" src="${faceOf(l)}" alt="" />` : "");

const talkQueue: StoryLine[] = [];
let talkTimer = 0;
let typeTimer = 0;
/** No dialog starts before this time (while run 2's opening picture is up). */
let talkHold = 0;
let typing: { l: StoryLine; shown: number; at: number } | null = null;

interface Bark {
  el: HTMLElement;
  until: number;
  /** What it points at: a wisp, Hesta's ring, or nothing (the corner chip). */
  wisp?: number;
  ring?: boolean;
  player?: number;
  /** A line about nothing in particular, over its speaker's model (Lumi or Hesta on the rim, or a player). */
  speaker?: string;
  last?: { x: number; y: number };
}
const barks: Record<"bark" | "chip", Bark | null> = { bark: null, chip: null };

/** Reaction stills over the map (engine/stills.ts). */
const stills = new StillsPanel(() => sound.paper());
let stillTimers: number[] = [];
let miniAlpha = 1;

/** A line that comes with a still: the panel shows it and its words as the caption, and it gets no bubble or box of its own. */
function stillLine(l: StoryLine) {
  const c = l.still!;
  const ms = stillMs(c.id, l.text ? lineTicks(l) * TICK_MS : 0);
  // The corner farther from the wisp on his staff, or else from the event.
  const mine = snap?.players.find((p) => p.id === me);
  const held = mine?.beam != null ? snap?.wisps.find((w) => w.id === mine.beam) : null;
  const from = held ? cam.toScreen(held.x + 0.5, held.y + 0.5, 1) : c.at ? cam.toScreen(c.at.x + 0.5, c.at.y + 0.5, 0) : null;
  stills.show({ cue: c, caption: l.text, who: l.who, ms }, from);
  if (l.text && l.who) sound.speak(l.who, l.text);
  return ms;
}

/** Ordinary bubbles that came while a still was up: they wait until it has gone, so there is one place to read (gameplay thread). */
const heldBarks: StoryLine[] = [];
let heldNext = 0;
function releaseBarks(now: number) {
  if (!heldBarks.length || stills.up || now < heldNext) return;
  const l = heldBarks.shift()!;
  heldNext = now + Math.max(2000, l.text.length * 60);
  sayLine(l, true);
}

function sayLine(l: StoryLine, released = false) {
  if (l.still && !l.talk) return void stillLine(l);
  if (!released && !l.talk && room?.phase === "playing" && l.who && (stills.up || heldBarks.length)) return void heldBarks.push(l);
  if (l.talk || room?.phase !== "playing" || !l.who) return talk(l);
  // A line about nothing in particular sits over its speaker's model when they're on the field.
  const speaker = l.wisp == null && !l.ring && l.player == null ? speakerAt(l.who) && l.who.toLowerCase() : undefined;
  const anchored = l.wisp != null || l.ring || l.player != null || !!speaker;
  const el = $(anchored ? "bark" : "chip");
  el.className = `bark${anchored ? "" : " chip"} ${l.who.toLowerCase()}`;
  const img = el.querySelector("img")!;
  const face = faceOf(l);
  if (face) img.src = face;
  img.hidden = !face;
  el.querySelector("span")!.innerHTML = (face ? "" : `<b>${esc(l.who)}</b> `) + lineHtml(l.text);
  el.hidden = false;
  // Restart the fade-in.
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  barks[anchored ? "bark" : "chip"] = { el, until: performance.now() + Math.max(2000, l.text.length * 60), wisp: l.wisp, ring: l.ring, player: l.player, speaker: speaker || undefined };
  sound.speak(l.who, l.text, l.who === "Hesta" && l.wisp != null);
  if (!anchored) placeBarks(performance.now());
}

/** Each frame: keep barks on what they point at, and fade them when their time is up. */
function placeBarks(now: number) {
  for (const k of ["bark", "chip"] as const) {
    const b = barks[k];
    if (!b) continue;
    if (now > b.until) {
      b.el.classList.add("fade");
      if (now > b.until + 350) {
        b.el.hidden = true;
        barks[k] = null;
      }
      continue;
    }
    if (k === "chip" || !snap) continue;
    let at: { x: number; y: number } | null = null;
    if (b.wisp != null) {
      const w = snap.wisps.find((q) => q.id === b.wisp);
      if (w) at = { x: w.x, y: w.y };
    } else if (b.player != null) {
      const q = snap.players.find((p) => p.id === b.player);
      if (q) at = { x: q.x, y: q.y };
    } else if (b.speaker) {
      at = speakerAt(b.speaker);
    } else if (b.ring) {
      const st = room?.story;
      const mine = snap.players.find((p) => p.id === me);
      at = st?.ring ?? (mine ? { x: mine.x, y: mine.y } : null);
    }
    at ??= b.last ?? null;
    if (!at) continue;
    b.last = { ...at };
    const c = "h" in at ? cam.toScreen(at.x, at.y, at.h as number) : cam.toScreen(at.x + 0.5, at.y + 0.5, 1.4);
    // Keep it on screen, even when what it points at isn't.
    const r = b.el.getBoundingClientRect();
    const x = Math.max(r.width / 2 + 8, Math.min(innerWidth - r.width / 2 - 8, c.x));
    const y = Math.max(r.height + 60, Math.min(innerHeight - 8, c.y - 10));
    b.el.style.left = `${x}px`;
    b.el.style.top = `${y}px`;
  }
}

function talk(l: StoryLine) {
  talkQueue.push(l);
  if (!talkTimer && !typing) nextTalk();
}

function nextTalk() {
  clearTimeout(talkTimer);
  talkTimer = 0;
  const wait = talkHold - performance.now();
  if (wait > 0 && talkQueue.length) {
    talkTimer = window.setTimeout(nextTalk, wait);
    return;
  }
  const el = $("dialog");
  const l = talkQueue.shift();
  if (!l) {
    el.hidden = true;
    typing = null;
    callHint();
    return;
  }
  if (l.still) {
    // In the bells: the still in place of the box, for as long as it takes to say.
    el.hidden = true;
    stillLine(l);
    talkTimer = window.setTimeout(nextTalk, Math.max(1800, lineTicks(l) * TICK_MS));
    return;
  }
  el.hidden = false;
  el.className = l.who ? "" : "tell";
  const face = $<HTMLImageElement>("dialog-face");
  const src = faceOf(l);
  face.hidden = !src;
  if (src) face.src = src;
  const name = $("dialog-name");
  name.textContent = l.who;
  name.className = l.who.toLowerCase();
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  // Start the clock on the first frame the box is actually drawn: the first frames of a round can
  // stall (the scene builds), and a line must not type out and expire unseen behind that.
  const t = (typing = { l, shown: 0, at: Infinity });
  $("dialog-text").textContent = "";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (typing !== t) return;
      t.at = performance.now();
      if (l.who) sound.speak(l.who, l.text);
      typeOn();
    }),
  );
}

/** The line types on, then stays a moment and moves on by itself. A tap skips ahead. */
function typeOn() {
  const t = typing;
  if (!t) return;
  // About 50 letters a second, by the clock, so a slow frame doesn't slow the text.
  t.shown = Math.min(t.l.text.length, Math.max(t.shown, Math.floor(((performance.now() - t.at) / 1000) * 50)));
  const shown = t.l.text.slice(0, t.shown);
  $("dialog-text").innerHTML = lineHtml(shown).replace(/\*/g, "");
  if (t.shown < t.l.text.length) {
    typeTimer = window.setTimeout(typeOn, 30);
    return;
  }
  $("dialog-text").innerHTML = lineHtml(t.l.text);
  typing = null;
  // Time to read it, whether or not another line is waiting (a tap moves on sooner).
  talkTimer = window.setTimeout(nextTalk, Math.max(1800, t.l.text.length * 45));
}

$("dialog").onclick = () => {
  if (typing) {
    clearTimeout(typeTimer);
    typing.shown = typing.l.text.length - 1;
    typeOn();
  } else nextTalk();
};

function clearCaptions() {
  talkQueue.length = 0;
  clearTimeout(talkTimer);
  clearTimeout(typeTimer);
  talkTimer = 0;
  typing = null;
  $("dialog").hidden = true;
  for (const k of ["bark", "chip"] as const) {
    barks[k] = null;
    $(k).hidden = true;
  }
}

function botLevel(): "easy" | "medium" | "hard" {
  const v = $<HTMLSelectElement>("bot-level").value;
  return v === "easy" || v === "hard" ? v : "medium";
}

function leave() {
  const l = link;
  link = null;
  l?.close();
  room = null;
  snap = prevSnap = null;
  clearCaptions();
  for (const t of stillTimers) clearTimeout(t);
  stillTimers = [];
  heldBarks.length = 0;
  stills.clear();
  inPlace = false;
  jumped = false;
  placeFade?.remove();
  placeFade = null;
  skyBase = null;
  stopStorySound();
  try {
    history.replaceState(null, "", location.pathname);
  } catch {
    /* sandboxed page */
  }
  render();
}

// ------------------------------------------------------------------ screens

/** Set while a walk opened from the testing menu is up: it doesn't count as progress. */
let jumped = false;

/** Saved progress from what's on screen: a walk reached, or a run finished. */
function noteProgress() {
  const st = room?.story;
  if (!st || jumped) return;
  const w = st.pond?.walk;
  if (w) {
    const walk = WALKS.find((x) => x.n === w)!;
    reach({ walk: w, next: walk.after + 1 });
  }
  if (room!.phase === "results" && st.end) {
    if (st.run === "The Grand Kindling") reach({ next: 2 });
    else if (st.end.lines[0]?.text === "So I'm coming tomorrow.") reach({ next: 3 });
    else if (st.run === "A job") reach({ next: 5 });
    else if (st.run === "The race") reach({ next: 6 });
    // Runs 6 and 7 are one piece: both are done when it ends.
    else if (st.run === "The dying brazier") reach({ next: 8 });
    else if (st.run === "A harder job") reach({ next: 9 });
    else if (storyRoom instanceof GrannyRoom || st.run === "Granny's game") reach({ next: 4 });
  }
  renderProgress();
}

/**
 * The look across the water, as Rook first steps out of his door (maps thread): the camera eases out and over to
 * frame Rook, the statue and the falls, holds, then comes back to him. Any tap or key ends it.
 */
const LOOK = { wait: 900, out: 1800, hold: 3200, back: 1400, within: 40 };
let lookBeat: { at: number; from: { cx: number; cy: number; scale: number } | null; to?: { cx: number; cy: number; scale: number } } | null = null;
function endLook() {
  if (!lookBeat) return;
  if (lookBeat.from) {
    cam.scale = Math.min(cam.w, cam.h) / 17;
    cam.follow = true;
  }
  lookBeat = null;
}
function stepLook(now: number, props: { kind: string; x: number; y: number }[], me: { x: number; y: number } | undefined) {
  const L = lookBeat;
  if (!L || now < L.at || !me) return;
  if (!L.from) {
    // The statue, and the nearest of the falls and the Offering stone to it.
    const near = (kind: string) => {
      const all = props.filter((p) => p.kind === kind);
      const st = props.find((p) => p.kind === "statue") ?? me;
      return all.sort((a, b) => Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y)).slice(0, 1);
    };
    const sights = [...near("statue"), ...near("falls"), ...near("offering")];
    // Only where the statue is across the water from his door (the horseshoe island), not a walk away.
    const statue = sights.find((p) => p.kind === "statue");
    if (!statue || Math.hypot(statue.x - me.x, statue.y - me.y) > LOOK.within) return void (lookBeat = null);
    const xs = [me.x, ...sights.map((p) => p.x)], ys = [me.y, ...sights.map((p) => p.y)];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const home = Math.min(cam.w, cam.h) / 17;
    // Room round the edges, and more height: the tilt squashes the ground and the top is far.
    const scale = Math.min(home, cam.w / (x1 - x0 + 8), cam.h / ((y1 - y0 + 8) * 1.25));
    L.from = { cx: cam.cx, cy: cam.cy, scale: cam.scale };
    L.to = { cx: (x0 + x1) / 2 + 0.5, cy: (y0 + y1) / 2 + 0.5, scale };
    cam.follow = false;
  }
  const t = now - L.at, ease = (k: number) => k * k * (3 - 2 * k);
  const f = L.from!, to = L.to!;
  const homeAt = { cx: me.x + 0.5, cy: me.y + 0.5, scale: Math.min(cam.w, cam.h) / 17 };
  let a = f, b = to, k = 1;
  if (t < LOOK.out) k = ease(t / LOOK.out);
  else if (t < LOOK.out + LOOK.hold) k = 1;
  else if (t < LOOK.out + LOOK.hold + LOOK.back) (a = to), (b = homeAt), (k = ease((t - LOOK.out - LOOK.hold) / LOOK.back));
  else return endLook();
  cam.cx = a.cx + (b.cx - a.cx) * k;
  cam.cy = a.cy + (b.cy - a.cy) * k;
  // Zoom in log space so the ease reads even.
  cam.scale = Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * k);
}

/** Run 8, the first fall: the camera goes to the well and looks down it, with the sound cut, and comes back. */
let wellLook: { from: { cx: number; cy: number; scale: number; follow: boolean }; k: number; to: { x: number; y: number } } | null = null;
function stepWellLook(look: { x: number; y: number } | undefined) {
  if (!wellLook && !look) return;
  if (!wellLook) {
    wellLook = { from: { cx: cam.cx, cy: cam.cy, scale: cam.scale, follow: cam.follow }, k: 0, to: look! };
    cam.follow = false;
    sound.windOff(0.15);
  }
  const L = wellLook;
  L.k += ((look ? 1 : 0) - L.k) * 0.09;
  if (!look && L.k < 0.02) {
    cam.cx = L.from.cx;
    cam.cy = L.from.cy;
    cam.scale = L.from.scale;
    cam.follow = L.from.follow;
    wellLook = null;
    if (room?.story?.sieve) sound.wind(2);
    return;
  }
  cam.cx = L.from.cx + (L.to.x + 0.5 - L.from.cx) * L.k;
  cam.cy = L.from.cy + (L.to.y + 0.5 - L.from.cy) * L.k;
  cam.scale = L.from.scale * (1 + 1.1 * L.k);
}

/** The walking map: a closer camera that follows Rook, and a short fade out when Hesta's game starts. */
let inPlace = false;
let placeFade: HTMLElement | null = null;
function placeView(place: boolean, leaving: boolean) {
  if (place && !inPlace) {
    cam.scale = Math.min(cam.w, cam.h) / 17;
    cam.follow = true;
    // The first walk that starts at his door (walk 2): as Rook steps out, the camera eases out to
    // show the statue across the water.
    if (room?.story?.pond?.walk === 2) lookBeat = { at: performance.now() + LOOK.wait, from: null };
  }
  if (leaving && !placeFade) {
    placeFade = document.createElement("div");
    placeFade.className = "fade-black quick";
    document.body.appendChild(placeFade);
    const f = placeFade;
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.add("on")));
  }
  if (!place && inPlace) {
    lookBeat = null;
    // Back to fitting the board for the game, and the fade lifts on it.
    cam.scale = 0;
    const f = placeFade;
    placeFade = null;
    if (f) {
      setTimeout(() => f.classList.remove("on"), 150);
      setTimeout(() => f.remove(), 900);
    }
  }
  inPlace = place;
}

/** Run 2 won: Lumi's last line plays over the pond, then a short fade, and Rook is free to walk it. */
let toPond: unknown = null;
function lessonToPond(): boolean {
  const end = room?.story?.end;
  if (!end || !(storyRoom instanceof LessonRoom) || end.lines[0]?.text !== "So I'm coming tomorrow.") return false;
  if (toPond === end) return true;
  toPond = end;
  clearCaptions();
  talk(end.lines[0]!);
  const fade = document.createElement("div");
  fade.className = "fade-black";
  document.body.appendChild(fade);
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => fade.classList.add("on"), 2600)));
  setTimeout(() => {
    const l = link;
    link = null;
    l?.close();
    clearCaptions();
    stopStorySound();
    connectStory(playerName(), "pond");
    setTimeout(() => {
      fade.classList.remove("on");
      setTimeout(() => fade.remove(), 900);
    }, 300);
  }, 3600);
  return true;
}

function render() {
  const phase = room?.phase;
  if (ending && phase !== "results") {
    ending.stop();
    ending = null;
  }
  $("home").hidden = !!room;
  $("lobby").hidden = phase !== "lobby";
  $("play").hidden = !room || phase === "lobby";
  $("results").hidden = phase !== "results";
  if (!room) return;
  // Run 2 won goes straight on to the free walk, with no results panel in between.
  if (phase === "results" && lessonToPond()) {
    $("results").hidden = true;
    $("play").hidden = false;
    return renderHud();
  }
  if (phase === "lobby") renderLobby();
  if (phase === "results") renderResults();
  if (ending) $("results").hidden = true;
  renderHud();
}

const BOT_LEVEL_LABELS: Record<BotLevelName, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** A bot's own level picker and co-op switch. Only the host can change them; co-op needs a guildmate. */
function botControls(p: LobbyPlayer, host: boolean, alone: boolean): HTMLElement {
  const box = document.createElement("span");
  box.className = "bot-set";
  const level = p.botLevel ?? "medium";
  if (!host) {
    box.textContent = `${BOT_LEVEL_LABELS[level]}${p.coop && !alone ? " · co-op" : ""}`;
    return box;
  }
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", `${p.name} level`);
  for (const l of Object.keys(BOT_LEVEL_LABELS) as BotLevelName[]) sel.add(new Option(BOT_LEVEL_LABELS[l], l, false, l === level));
  sel.onchange = () => link?.send({ t: "botset", id: p.id, level: sel.value as BotLevelName });
  const lab = document.createElement("label");
  lab.className = "bot-coop" + (alone ? " off" : "");
  lab.title = alone ? "Co-op needs a guildmate" : "Play as a team with its guild";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!p.coop;
  cb.disabled = alone;
  cb.onchange = () => link?.send({ t: "botset", id: p.id, coop: cb.checked });
  lab.append(cb, " co-op");
  box.append(sel, lab);
  return box;
}

function renderLobby() {
  if (!room) return;
  const mine = room.players.find((p) => p.id === me);
  const host = room.host === me;
  $("room-code").textContent = practice ? "Practice" : room.code;
  $("share").hidden = practice;
  for (const g of [0, 1, 2, 3] as Guild[]) {
    document.getElementById(`team-${g}`)?.toggleAttribute("hidden", g >= room.teams);
    const ul = $(`guild-${g}`);
    ul.replaceChildren(
      ...room.players
        .filter((p) => p.guild === g)
        .map((p) => {
          const li = document.createElement("li");
          const dot = document.createElement("span");
          dot.className = "flame-dot";
          dot.style.background = FLAME_COLORS[p.flame];
          li.append(dot, p.name + (p.id === me ? " (you)" : "") + (p.id === room!.host ? " ★" : ""));
          if (!p.connected) li.classList.add("away");
          if (p.bot) li.append(botControls(p, host, room!.players.filter((q) => q.guild === g).length < 2));
          return li;
        }),
    );
    $(`join-${g}`).toggleAttribute("disabled", mine?.guild === g);
  }
  $("flames").replaceChildren(
    ...FLAMES.map((f) => {
      const b = document.createElement("button");
      b.className = "flame" + (mine?.flame === f ? " on" : "");
      b.style.setProperty("--c", FLAME_COLORS[f]);
      b.title = f;
      b.setAttribute("aria-label", `${f} flame`);
      b.onclick = () => link?.send({ t: "flame", flame: f });
      return b;
    }),
  );
  const teams = $<HTMLSelectElement>("teams");
  teams.disabled = !host;
  teams.value = String(room.teams);
  const sel = $<HTMLSelectElement>("shrine");
  sel.disabled = !host;
  sel.value = room.shrine;
  const picked = shrineById(room.shrine);
  $("shrine-blurb").textContent = `${picked.blurb} ${ringNote(picked.rings)}`;
  $("start").hidden = !host;
  document.querySelectorAll<HTMLElement>(".host-only").forEach((el) => (el.hidden = !host));
  $("wait-host").hidden = host;
}

function renderResults() {
  $("story-end").hidden = !room?.story;
  if (room?.story) return renderStoryEnd();
  $("again").textContent = "Back to the lobby";
  if (!room?.lastScores) return;
  const scores = room.lastScores;
  const mine = room.players.find((p) => p.id === me)?.guild;
  const top = Math.max(...scores);
  const leaders = scores.flatMap((s, g) => (s === top ? [g] : []));
  const winner = leaders.length === 1 ? leaders[0]! : null;
  $("result-title").textContent =
    winner === null
      ? scores.length === 2 ? "A tie at the brazier" : `A tie: ${leaders.map((g) => GUILD_NAMES[g]).join(" and ")}`
      : `${GUILD_NAMES[winner]} wins` + (practice ? "" : mine === winner ? " — well lit!" : "");
  $("result-score").innerHTML = scores.map((s, g) => `<b style="color:${GUILD_COLORS[g]}">${s}</b>`).join(" – ");
  $("again").hidden = room.host !== me;
}

let shownEnd: unknown = null;
/** Rook's kitchen (from walk 2): his door raises the pond's count, and each rise opens the still. */
let kitchen: Kitchen | null = null;
let kitchenSeen = 0;
function openKitchen() {
  const pond = room?.story?.pond;
  const n = pond?.kitchen ?? 0;
  if (!pond || n < kitchenSeen) kitchenSeen = 0;
  if (!pond) {
    kitchen?.close();
    return;
  }
  if (n > kitchenSeen && !kitchen) kitchen = new Kitchen(pond.walk ?? 2, faceHtml, () => (kitchen = null));
  kitchenSeen = n;
}

/** Run 1's ending cutscene, while it plays (and on its title screen). */
let ending: KindlingEnding | null = null;

/** The Kindling's ending: the total, how bright the sky got, and the last lines, one by one. */
function renderStoryEnd() {
  const st = room!.story!, end = st.end;
  $("again").textContent = "Play again";
  $("again").hidden = false;
  // Run 1 ends on the cutscene in place of this panel.
  if (end && end.sky !== undefined) {
    if (ending?.end !== end) {
      ending?.stop();
      clearCaptions();
      ending = new KindlingEnding(end, {
        html: (l) => `${faceHtml(l)}<span><b class="${l.who.toLowerCase()}">${esc(l.who)}</b> ${lineHtml(l.text)}</span>`,
        speak: (l) => sound.speak(l.who, l.text, false),
        playAgain: () => link?.send({ t: "lobby" }),
        leave,
      });
    }
    return;
  }
  if (!end || shownEnd === end) return;
  shownEnd = end;
  clearCaptions();
  $("result-title").textContent = st.run;
  $("result-score").innerHTML = end.summary ? `<span class="blurb">${esc(end.summary)}</span>` : `<b style="color:${GUILD_COLORS[0]}">${end.banked}</b> <span class="blurb">wisps banked · Kes's island ${end.kes}</span>`;
  const fill = $("sky-fill");
  fill.style.width = "0";
  (fill.parentElement as HTMLElement).hidden = end.sky === undefined;
  const sky = end.sky ?? 0;
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${Math.round(sky * 100)}%`)));
  $("end-lines").replaceChildren(
    ...end.lines.map((l, i) => {
      const li = document.createElement("li");
      if (!l.who) li.className = "tell";
      li.innerHTML = (l.who ? `${faceHtml(l)}<b class="${l.who.toLowerCase()}">${esc(l.who)}</b>` : "") + lineHtml(l.text);
      li.style.animationDelay = `${0.6 + i * 1.8}s`;
      // A still comes with its line as the line comes up (the line is on the card, so no caption).
      if (l.still) stillTimers.push(window.setTimeout(() => stills.show({ cue: l.still!, caption: "", who: "", ms: stillMs(l.still!.id, lineTicks(l) * TICK_MS) }, null), (0.6 + i * 1.8) * 1000));
      return li;
    }),
  );
}

// ------------------------------------------------------------------ story sound

let musicFor = -1;
let pullFrom = 0;

/** Lumi's bell at each movement's countdown (three rings at the end), with the music fading under it. */
function storyPhaseSound(was: string | undefined) {
  const phase = room!.phase;
  // The dying brazier has no bell and no music: only the fire. The Sieve has only the wind.
  if (room!.story?.dying) return;
  if (room!.story?.sieve) {
    if (phase === "countdown" && was !== "countdown") sound.wind(3);
    if (phase === "results" && was !== "results") sound.pullHum(null);
    return;
  }
  if (phase === "countdown" && was !== "countdown") {
    sound.stopMusic();
    musicFor = -1;
    sound.handBell(1);
  }
  if (phase === "results" && was !== "results") {
    sound.pullHum(null);
    // Run 1's music plays on under the ending (the emotion test ducks and cuts it there; the old
    // ending lets it go slowly from here). Run 2's stops.
    const run1 = room!.story?.end?.sky !== undefined;
    if (!run1) sound.stopMusic();
    else if (!ENDING.music) sound.stopMusic(sound.SOUND.endMusicFade);
    else sound.playEndingMusic(ENDING.music.pieceAt);
    sound.handBell(3);
  }
}

/** Per-tick story sounds: banks, Kes's island, and Rook's staff (catch, hum, slip). */
function storyTickSound(s: GameSnapshot) {
  const st = room!.story!;
  if (st.dying) dyingSound(st.dying, s);
  else if (st.sieve) void 0;
  else if (room!.phase === "playing" && musicFor !== st.movement) {
    musicFor = st.movement;
    sound.playMusic(st.movement); // starts on a tick, so the beat lines up with the 600 ms steps
  }
  const prev = prevSnap;
  const board = shrineFor(room!.shrine, room!.teams).board;
  const half = board.width / 2;
  for (const b of s.banks) {
    if (b.guild !== 0) continue;
    const holder = prev?.wisps.find((w) => w.id === b.wisp)?.holder ?? null;
    const crew = holder !== null && holder !== me ? s.players.find((p) => p.id === holder) : undefined;
    if (crew) sound.bankChime(s.tick, "crew", (crew.x - board.center.x) / half);
    else sound.bankChime(s.tick, "rook");
  }
  if (prev && (s.scores[1] ?? 0) > (prev.scores[1] ?? 0)) sound.kesChime();
  // Hesta stones the wisps: the boulder sound, once for all of them.
  if (prev && s.wisps.some((w) => w.rooted) && !prev.wisps.some((w) => w.rooted)) sound.stoneCast();
  // Kes strings a wisp: a small crackle.
  if (prev && (s.string?.length ?? 0) > (prev.string?.length ?? 0)) sound.stormJoin();
  const mine = s.players.find((p) => p.id === me);
  const was = prev?.players.find((p) => p.id === me);
  if (!mine) return;
  if (mine.slipped && !was?.slipped) sound.slipKnock();
  if (s.stops?.some((b) => b.player === me)) sound.bankPlop();
  const w = mine.beam !== null ? s.wisps.find((x) => x.id === mine.beam) : undefined;
  const dist = (x: { x: number; y: number }) => Math.hypot(x.x - board.center.x, x.y - board.center.y);
  if (w && room!.phase === "playing") {
    if (was?.beam !== mine.beam) {
      sound.catchClick();
      pullFrom = Math.max(1, dist(w));
    }
    sound.pullHum(1 - dist(w) / pullFrom);
  } else sound.pullHum(null);
}

let dyingPart = "";
let dyingLurch = 0;
let dyingStill = -1;
let dyingCometOn = true;

/** Run 8 with the first pull (a test), its third take, the tug; ?pull=2 in the address plays the second take (v112), ?pull=1 the first (v111), ?nopull=1 none (v108). */
function sieveRoom() {
  const r = new SieveRoom();
  const q = new URLSearchParams(location.search);
  if (q.has("nopull")) r.pullMode = "off";
  else if (q.get("pull") === "1") r.pullMode = "quiet";
  else if (q.get("pull") === "2") r.pullMode = "loud";
  // Reaction stills: picture 4 (the tug itself) is off unless asked for; all of them off with ?nostills.
  if (q.has("still4")) r.stillFour = true;
  if (q.has("nostills")) r.stillsOn = false;
  else stills.preload("r8-");
  return r;
}

/** Run 8's pull: the sound of the wind-up, the snap and the silence; the eye opens out to the whole island while it holds, and comes back. */
let pullSeen = "";
let pullView: { scale: number; follow: boolean; k: number; at: number } | null = null;
function stepPull(pull: NonNullable<StoryView["sieve"]>["pull"], board: Board) {
  const ph = pull?.phase ?? "";
  if (ph !== pullSeen) {
    if (ph === "wind") sound.pullWind((pull!.left * tickMs) / 1000);
    if (ph === "hold") {
      sound.pullSnap();
      setTimeout(() => sound.hush((pull!.left * tickMs) / 1000 - 0.15), 150);
      sound.windOff(0.1);
    }
    // The tug: a draw that rises for the whole of it and cuts off dead, then nothing.
    if (ph === "tug") sound.pullDraw((pull!.left * tickMs) / 1000), sound.windOff(0.6);
    if (ph === "after" && pullSeen === "tug") sound.hush((pull!.left * tickMs) / 1000);
    if ((pullSeen === "hold" || pullSeen === "after") && room?.story?.sieve) sound.wind(1.5);
    pullSeen = ph;
  }
  // The tug keeps the eye on him and only eases out a little, and back.
  const tug = ph === "tug" || ph === "after";
  if (tug || pullView?.k === -1) {
    if (!pullView) pullView = { scale: cam.scale, follow: cam.follow, k: -1, at: performance.now() };
    const V = pullView;
    cam.scale += ((tug ? V.scale * 0.82 : V.scale) - cam.scale) * 0.03;
    if (!tug && Math.abs(cam.scale - V.scale) < 0.2) (cam.scale = V.scale), (pullView = null);
    return;
  }
  const open = ph === "hold";
  if (!pullView && !open) return;
  if (!pullView) (pullView = { scale: cam.scale, follow: cam.follow, k: 0, at: performance.now() }), (cam.follow = false);
  const V = pullView;
  // The second take: close on the staged wisp for the snap, then open out to the whole island.
  const close = open && pull?.loud && pull.focus && performance.now() - V.at < 750 ? pull.focus : null;
  if (close) {
    cam.scale += (V.scale * 1.6 - cam.scale) * 0.25;
    cam.cx += (close.x + 0.5 - cam.cx) * 0.25;
    cam.cy += (close.y + 0.5 - cam.cy) * 0.25;
    return;
  }
  V.k += ((open ? 1 : 0) - V.k) * 0.12;
  const whole = cam.fitScale(board) * 0.92;
  cam.scale += ((open ? whole : V.scale) - cam.scale) * 0.12;
  cam.cx += (board.width / 2 - cam.cx) * 0.12 * V.k;
  cam.cy += (board.height / 2 + 0.5 - cam.cy) * 0.12 * V.k;
  if (!open && V.k < 0.02 && Math.abs(cam.scale - V.scale) < 0.3) (cam.scale = V.scale), (cam.follow = V.follow), (pullView = null);
}

/** Runs 6 and 7 with Ladi's switches: add ?calls=1 (Lumi calls), ?noback=1 (her line gives nothing back) or ?nocloud=1 (the cloud never reaches Rook) to the address to try the other way. */
function dyingRoom() {
  const r = new DyingRoom();
  const q = new URLSearchParams(location.search);
  if (q.has("calls")) r.switches.lumiCalls = true;
  if (q.has("noback")) r.switches.lineGivesBack = false;
  if (q.has("nocloud")) r.switches.cloudOverRook = false;
  if (q.has("stillsonly")) r.switches.cometOnMap = false;
  if (q.has("nocrowd")) r.switches.crowdShown = false;
  dyingCometOn = r.switches.cometOnMap;
  return r;
}

/**
 * Runs 6 and 7. Run 6 is loud: Lumi's alarm bell, steady, the fire as loud as it is high, and the
 * timbers at each lurch. At the bottom they go one at a time, and her bell is the last. Then the
 * rush from above, the strike under the pictures, and in run 7 each lift.
 */
/** The alarm's pictures are up: the run under them makes no sound yet. */
let alarmUp = false;
let alarmDrawn = 0;
function dyingSound(d: NonNullable<StoryView["dying"]>, s: GameSnapshot) {
  if (alarmUp) return;
  const flame = s.flame ?? 0;
  const after = d.part !== "six" && d.part !== "bottom" && d.part !== "stills";
  if (d.part !== dyingPart) {
    if (d.part === "six") dyingLurch = d.lurch ?? 0;
    dyingPart = d.part;
  }
  if ((d.lurch ?? 0) !== dyingLurch) {
    dyingLurch = d.lurch ?? 0;
    sound.lurchGroan(after);
  }
  // The shrine's great bell, every four ticks; Lumi's hand bell at her post inside it, between its strokes.
  if (d.great && s.tick % 4 === 0) sound.greatBell();
  if (d.bell && s.tick % 2 === 1) sound.handBell(1);
  // Run 7 ends on her ordinary three rings, once the island is clear.
  if (d.part === "after" && dyingRung !== d.part) sound.handBell(3);
  dyingRung = d.part;
  // The rush from above: on to the strike, which comes after the first picture and the comet's fall on the map.
  const toStrike = room?.story?.dying && (DYING.bottom.ticks - DYING.bottom.orange) + (dyingCometOn ? DYING.landingShow.faces + DYING.landingShow.comet : 3);
  if (d.orange && d.part === "bottom" && !dyingOrange) sound.cometFall((toStrike || 5) * (tickMs / 1000));
  dyingOrange = !!d.orange;
  sound.fireBed(d.fire ? flame : null);
}
let dyingOrange = false;
let dyingRung = "";

/** Run 6: the eye once came in with the cloud; it now keeps the whole ground in view, with the village at its edge. Kept so a zoom left over is undone. */
let dyingZoomed = false;
let dyingFramed = false;
function dyingZoom(d: NonNullable<StoryView["dying"]> | undefined, board: Board) {
  if (!d) return void (dyingZoomed = dyingFramed = false);
  const fit = cam.fitScale(board);
  // Once, as the run opens at the island view: back a little, to take in the terrace past the north edge.
  if (!dyingFramed) {
    dyingFramed = true;
    if (!cam.compact && Math.abs(cam.scale - fit) < 0.5) cam.scale = fit * DYING.terrace.viewZoom;
  }
  const closing = d.part === "six" || d.part === "bottom" || d.part === "stills";
  if (!closing) {
    if (!dyingZoomed) return;
    cam.scale += (fit - cam.scale) * 0.06;
    if (Math.abs(cam.scale - fit) < 0.2) (cam.scale = fit), (dyingZoomed = false);
    return;
  }
  // Not now the village stands at the island's edge: they would go out of the picture. The whole ground stays in view.
  const want = fit;
  if (want > fit * 1.02) dyingZoomed = true;
  if (dyingZoomed) cam.scale += (want - cam.scale) * 0.03;
}

/** The held pictures: the three of the landing, and the island clear of the cloud. Plain dark cards with the picture's name until the cutscene thread's pictures exist. */
/** The landing's drawn pictures, fetched and kept as the run opens, so each is there the moment it is called. */
const dyingArt = new Map<string, HTMLImageElement>();
function dyingCard(d: NonNullable<StoryView["dying"]> | undefined) {
  const el = $("still");
  // Fetched as the run opens, so a picture is there the moment it is called.
  if (d && !dyingArt.size)
    for (const f of [...DYING.stills.files, DYING.risen.file]) {
      const img = new Image();
      img.alt = "";
      img.src = `stills/${f}.webp`;
      void img.decode?.().catch(() => {});
      dyingArt.set(f, img);
    }
  const n = !d ? -1 : d.still !== undefined ? d.still : d.part === "risen" ? 3 : -1;
  if (n === dyingStill) return;
  dyingStill = n;
  el.hidden = n < 0;
  if (n < 0) return;
  const name = n === 3 ? DYING.risen.name : DYING.stills.names[n]!;
  el.innerHTML = `<div><small>picture to come</small><b>${esc(name)}</b></div>`;
  // The drawn picture over the card, when there is one.
  const file = n < 3 ? DYING.stills.files[n] : DYING.risen.file;
  const img = file ? dyingArt.get(file) : undefined;
  if (img?.complete && img.naturalWidth) el.append(img);
  else if (img) img.onload = () => dyingStill === n && el.append(img);
  el.classList.remove("in", "inout");
  el.style.animationDuration = "";
  void el.offsetWidth;
  // A picture held for a set time fades in and out again, onto the map (Ladi, 24 Nov).
  const up = d!.stillTicks ?? (n === 3 ? DYING.risen.ticks : 0);
  if (up) (el.style.animationDuration = `${(up * tickMs) / 1000}s`), el.classList.add("inout");
  else el.classList.add("in");
  // The strike lands under her picture.
  if (n === 2) {
    sound.cometStrike();
    // Seen on the map, it lands with a flash before her picture comes up.
    if (d!.stillTicks) {
      const f = $("flash");
      f.classList.remove("go");
      void f.offsetWidth;
      f.classList.add("go");
    }
  }
}

function stopStorySound() {
  sound.pullHum(null);
  sound.fireBed(null);
  sound.windOff(0.5);
  dyingPart = "";
  dyingCard(undefined);
  sound.stopMusic(0.3);
  musicFor = -1;
}

function renderHud() {
  if (!room) return;
  const s = snap;
  for (let g = 0; g < 4; g++) {
    const el = $(`score-${g}`);
    el.hidden = g >= room.teams;
    el.textContent = String(s?.scores[g] ?? 0);
  }
  const story = room.story;
  $("score-1").classList.toggle("kes", !!story);
  $("mute").hidden = !story;
  $("call").hidden = !story?.canCall;
  callHint();
  if (story) {
    const rv = story.rival;
    $("score-1").hidden = !rv;
    // The free walk on the pond: no score and no clock, just the place's name.
    if (story.pond) {
      $("score-0").hidden = true;
      $("ticks").textContent = story.title;
      return renderPad(s);
    }
    // The dying brazier: nothing to count and no clock.
    if (story.dying || story.sieve) {
      $("score-0").hidden = true;
      $("ticks").textContent = "";
      return renderPad(s);
    }
    if (rv) $("score-1").textContent = `${cam.compact ? rv.short : rv.name} ${rv.score}`;
    if (room.phase === "countdown") {
      $("ticks").textContent = `🔔 ${story.title}`;
      return renderPad(s);
    }
  }
  const len = room.roundTicks ?? ROUND_TICKS;
  const left = s ? len - s.tick : len;
  const tide = shrineFor(room.shrine, room.teams).gimmicks.tide;
  const tideNote = tide && s && room.phase !== "countdown" ? ` · tide ${tideIn(s.tick + 1, tide) ? "in" : "out"} (${tide - ((s.tick + 1) % tide)})` : "";
  $("ticks").textContent = (story ? `${story.title} · ` : "") + (room.phase === "countdown" ? `Starts in ${room.countdown}` : story?.note ?? `${left} ticks · ${fmtTime((left * tickMs) / 1000)}${tideNote}`);
  renderPad(s);
}

function renderPad(s: GameSnapshot | null) {
  const p = s?.players.find((q) => q.id === me);
  $("mode").textContent = p?.mode === "push" ? "Push" : "Pull";
  $("mode").classList.toggle("push", p?.mode === "push");
  $("run").textContent = $("run2").textContent = p?.run === false ? "Walk" : "Run";
  $("run2").classList.toggle("walking", p?.run === false);
  const staff = $("staff");
  staff.textContent = p?.mode === "push" ? "Push" : "Pull";
  staff.classList.toggle("push", p?.mode === "push");
  $("mode").textContent = p?.mode === "push" ? "→ Pull" : "→ Push";
  if (!document.body.classList.contains("touch")) $("mode").textContent = p?.mode === "push" ? "Push" : "Pull";
}

const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function bankFlash(g: Guild) {
  const el = $(`score-${g}`);
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

let toastTimer = 0;
function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 3500);
}

// ------------------------------------------------------------------ input

const canvas = $<HTMLCanvasElement>("board");
const overlay = $<HTMLCanvasElement>("overlay");
const g = overlay.getContext("2d")!;
const cam = new Camera();
let world: World | null = null;
let hoverWisp: number | null = null;
let minimapRect = { x: 0, y: 0, w: 0, h: 0 };

function act(m: Omit<Extract<ClientMsg, { t: "act" }>, "t">) {
  if (room?.phase !== "playing") return;
  link?.send({ t: "act", ...m });
  // Optimistic HUD for the toggles; the next tick confirms.
  const p = snap?.players.find((q) => q.id === me);
  if (p && m.toggleMode) p.mode = p.mode === "pull" ? "push" : "pull";
  if (p && m.toggleRun) p.run = !p.run;
  renderHud();
}

/** What a tap at a screen point means: a wisp (with a generous radius) or a tile to walk to. */
function targetAt(sx: number, sy: number): { action: Action; wisp: number | null } | null {
  if (!snap || !room) return null;
  const t = cam.toTile(sx, sy);
  const p = snap.players.find((q) => q.id === me);
  const radius = cam.compact ? 1.3 : 0.9;
  // On a phone the focused wisp always has a finger-sized target, however far out you've zoomed.
  if (document.body.classList.contains("touch")) {
    const f = padFocus ? snap.wisps.find((w) => w.id === padWisp) : undefined;
    if (f) {
      const c = cam.toScreen(f.x + 0.5, f.y + 0.5, 0.75);
      if (Math.hypot(c.x - sx, c.y - sy) <= FOCUS_TAP_PX) return { action: { kind: "staff", wisp: f.id }, wisp: f.id };
    }
  }
  // A wisp the story marks (one the crew left, or Lumi's call) gets the focused wisp's finger-sized target, on any device.
  const mk = room.story?.mark ? snap.wisps.find((w) => w.id === room!.story!.mark!.wisp) : undefined;
  if (mk) {
    const c = cam.toScreen(mk.x + 0.5, mk.y + 0.5, 0.75);
    if (Math.hypot(c.x - sx, c.y - sy) <= bigTapRadius()) return { action: { kind: "staff", wisp: mk.id }, wisp: mk.id };
  }
  // Big taps (O on a laptop): every wisp gets a finger-sized circle on screen, nearest wins.
  if (bigTaps) {
    let near: { id: number; d: number } | null = null;
    for (const w of snap.wisps) {
      const c = cam.toScreen(w.x + 0.5, w.y + 0.5, 0.75);
      const d = Math.hypot(c.x - sx, c.y - sy);
      const usable = p && (p.mode === "push" || w.guild === p.guild);
      const score = d - (usable ? 6 : 0);
      if (d <= bigTapRadius() && (!near || score < near.d)) near = { id: w.id, d: score };
    }
    if (near) return { action: { kind: "staff", wisp: near.id }, wisp: near.id };
  }
  let best: { id: number; d: number } | null = null;
  for (const w of snap.wisps) {
    const d = Math.hypot(w.x + 0.5 - t.x, w.y + 0.5 - t.y);
    // Prefer wisps your staff can affect right now.
    const usable = p && (p.mode === "push" || w.guild === p.guild);
    const score = d - (usable ? 0.4 : 0);
    if (d <= radius && (!best || score < best.d)) best = { id: w.id, d: score };
  }
  if (best) return { action: { kind: "staff", wisp: best.id }, wisp: best.id };
  // The free walk on the pond: people (and Lumi's lantern) can be tapped. A tap on one sends their tile.
  const pond = room.story?.pond;
  if (pond) {
    let hit: { at: Pt; d: number } | null = null;
    const places = (shrineFor(room.shrine, room.teams).props ?? []).filter((q) => !["fence", "post", "bench"].includes(q.kind));
    const things = [...snap.players.filter((q) => q.id !== me).map((q) => ({ at: { x: q.x, y: q.y }, h: 0.9 })), { at: pond.lantern, h: 0.3 }, ...places.map((q) => ({ at: { x: q.x, y: q.y }, h: 0.6 }))];
    for (const th of things) {
      const c = cam.toScreen(th.at.x + 0.5, th.at.y + 0.5, th.h);
      const d = Math.hypot(c.x - sx, c.y - sy);
      if (d <= Math.max(bigTapRadius(), cam.scale * 0.9) && (!hit || d < hit.d)) hit = { at: th.at, d };
    }
    if (hit) return { action: { kind: "walk", to: hit.at }, wisp: null };
  }
  const tile: Pt = { x: Math.floor(t.x), y: Math.floor(t.y) };
  const board = shrineFor(room.shrine, room.teams).board;
  if (!board.inside(tile)) return null;
  // A tap on a wall or pool still walks as close to it as the path allows.
  return { action: { kind: "walk", to: tile }, wisp: null };
}

/** Radius in CSS pixels of the focused wisp's tap target: a 56 px circle, above the 44-48 px minimum. */
const FOCUS_TAP_PX = 28;

/** Big taps: O switches every wisp to a large, ringed click target (and back). */
let bigTaps = false;
/** A big tap target's radius in CSS pixels: never under the focus target, and never smaller than a normal click. */
const bigTapRadius = () => Math.max(FOCUS_TAP_PX, cam.scale * (cam.compact ? 1.3 : 0.9));

const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
let pinch: { d: number; scale: number } | null = null;
let dragged = false;
let lastTap = 0;

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: cam.scale };
  }
});

canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === "mouse") hoverWisp = targetAt(e.clientX, e.clientY)?.wisp ?? null;
    return;
  }
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    cam.scale = pinch.scale * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinch.d);
    dragged = true;
    return;
  }
  if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 12) dragged = true;
  if (dragged) {
    cam.follow = false;
    cam.cx -= dx / cam.scale;
    cam.cy -= dy / cam.scale;
  }
});

const endPointer = (e: PointerEvent) => {
  endLook();
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!p || dragged) return;
  const { x, y } = p;
  // Mini-map tap: pan there.
  const r = minimapRect;
  if (cam.compact && x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h && room) {
    const b = shrineFor(room.shrine, room.teams).board;
    cam.cx = ((x - r.x) / r.w) * b.width;
    cam.cy = ((y - r.y) / r.h) * b.height;
    cam.follow = false;
    return;
  }
  const now = performance.now();
  if (now - lastTap < 300 && cam.compact) {
    cam.follow = true;
    cam.phoneZoom();
  }
  lastTap = now;
  if (callMode && room?.story?.canCall && room.phase === "playing") {
    const t = cam.toTile(x, y);
    link?.send({ t: "call", x: Math.floor(t.x), y: Math.floor(t.y) });
    setCallMode(false);
    return;
  }
  const t = targetAt(x, y);
  if (t) act({ action: t.action });
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", (e) => {
  pointers.delete(e.pointerId);
  pinch = null;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    cam.scale *= Math.exp(-e.deltaY / 400);
  },
  { passive: false },
);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  endLook();
  if (room?.phase !== "playing" || (e.target as HTMLElement).tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if (k === "`") return void (toggleDebug(), e.preventDefault());
  if (room.story?.canCall && (k === "c" || (k === "escape" && callMode))) return void (setCallMode(k === "c" ? !callMode : false), e.preventDefault());
  if (k === "o") {
    bigTaps = !bigTaps;
    toast(bigTaps ? "Big taps on: every wisp has a larger target. O to turn off" : "Big taps off");
  } else if (k === "q") act({ toggleMode: true });
  else if (k === "r") act({ toggleRun: true });
  else if (k === " " || k === "s") act({ action: { kind: "idle" } });
  else if (k === "c") cam.follow = true;
  else if (k === "+" || k === "=" || k === "-" || k === "_") cam.scale *= k === "-" || k === "_" ? 1 / 1.25 : 1.25;
  else if (k.startsWith("arrow")) {
    const step = 120 / Math.max(1, cam.scale);
    cam.follow = false;
    if (k === "arrowleft") cam.cx -= step;
    else if (k === "arrowright") cam.cx += step;
    else if (k === "arrowup") cam.cy -= step;
    else cam.cy += step;
  } else return;
  e.preventDefault();
});

$("mode").onclick = () => act({ toggleMode: true });
$("run").onclick = () => act({ toggleRun: true });
$("run2").onclick = () => act({ toggleRun: true });

// ------------------------------------------------------------------ touch pad
// A stick to walk and buttons to work the staff, so you can play without tapping the map.

const touchQuery = window.matchMedia("(pointer: coarse)");
const setTouch = () => document.body.classList.toggle("touch", touchQuery.matches);
touchQuery.addEventListener?.("change", setTouch);
setTouch();

/** The wisp the pad's Staff button works on. */
let padWisp: number | null = null;
/** Whether the pad keeps a wisp in focus at all (long-press Next to switch it off or on). */
let padFocus = true;

/** Wisps your staff can work in the current mode, nearest first. */
function padChoices() {
  const p = snap?.players.find((q) => q.id === me);
  if (!snap || !p) return [];
  const rivals = snap.wisps.some((w) => w.guild !== p.guild);
  return snap.wisps
    .filter((w) => w.rim === 0 && (p.mode === "push" ? !rivals || w.guild !== p.guild : w.guild === p.guild))
    .map((w) => ({ id: w.id, d: Math.max(Math.abs(w.x - p.x), Math.abs(w.y - p.y)) }))
    .sort((a, b) => a.d - b.d);
}

/** Keeps the pad's wisp valid: if it's gone or the wrong kind, take the nearest one. */
function padTarget(): number | null {
  if (!padFocus) return null;
  const c = padChoices();
  if (!c.some((w) => w.id === padWisp)) padWisp = c[0]?.id ?? null;
  return padWisp;
}

// Long-press Next to switch focus off (no wisp is picked out) or back on.
let nextHold = 0;
let nextLong = false;
const nextBtn = $("next");
nextBtn.addEventListener("pointerdown", () => {
  nextLong = false;
  clearTimeout(nextHold);
  nextHold = window.setTimeout(() => {
    nextLong = true;
    padFocus = !padFocus;
    nextBtn.classList.toggle("off", !padFocus);
    navigator.vibrate?.(30);
    toast(padFocus ? "Focus on: Next picks a wisp" : "Focus off. Long-press Next to turn it back on");
  }, 550);
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) nextBtn.addEventListener(ev, () => clearTimeout(nextHold));
nextBtn.addEventListener("contextmenu", (e) => e.preventDefault());
$("next").onclick = () => {
  // The click that ends a long press doesn't also step to the next wisp.
  if (nextLong) return void (nextLong = false);
  if (!padFocus) {
    padFocus = true;
    nextBtn.classList.remove("off");
  }
  const c = padChoices();
  if (!c.length) return;
  const i = c.findIndex((w) => w.id === padWisp);
  padWisp = c[(i + 1) % c.length]!.id;
};
$("staff").onclick = () => {
  const w = padTarget();
  if (w !== null) act({ action: { kind: "staff", wisp: w } });
};

const stick = $("stick");
const knob = stick.querySelector<HTMLElement>(".knob")!;
let stickDir: [number, number] | null = null;
let stickTimer = 0;
const stickWalk = () => {
  const p = snap?.players.find((q) => q.id === me);
  if (!p || !stickDir || !room) return;
  const b = shrineFor(room.shrine, room.teams).board;
  const to = { x: Math.max(0, Math.min(b.width - 1, p.x + stickDir[0] * 3)), y: Math.max(0, Math.min(b.height - 1, p.y + stickDir[1] * 3)) };
  act({ action: { kind: "walk", to } });
};
const stickMove = (e: PointerEvent) => {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2 - 20;
  const len = Math.hypot(dx, dy);
  if (len > max) [dx, dy] = [(dx / len) * max, (dy / len) * max];
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  if (len < 14) return void (stickDir = null);
  // Snap to the 8 directions you can step in.
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const dir: [number, number] = [Math.round(Math.cos((a * Math.PI) / 4)), Math.round(Math.sin((a * Math.PI) / 4))];
  const changed = !stickDir || stickDir[0] !== dir[0] || stickDir[1] !== dir[1];
  stickDir = dir;
  if (changed) stickWalk();
};
stick.addEventListener("pointerdown", (e) => {
  stick.setPointerCapture(e.pointerId);
  stick.classList.add("held");
  cam.follow = true;
  stickMove(e);
  clearInterval(stickTimer);
  stickTimer = window.setInterval(stickWalk, 200);
});
stick.addEventListener("pointermove", (e) => {
  if (stick.classList.contains("held")) stickMove(e);
});
const stickEnd = () => {
  if (!stick.classList.contains("held")) return;
  stick.classList.remove("held");
  knob.style.transform = "";
  clearInterval(stickTimer);
  const p = snap?.players.find((q) => q.id === me);
  // Let go and you stop where you are.
  if (stickDir && p) act({ action: { kind: "walk", to: { x: p.x, y: p.y } } });
  stickDir = null;
};
stick.addEventListener("pointerup", stickEnd);
stick.addEventListener("pointercancel", stickEnd);
$("recenter").onclick = () => {
  cam.follow = true;
  if (cam.compact) cam.phoneZoom();
};

// ------------------------------------------------------------------ home + lobby wiring

const nameInput = $<HTMLInputElement>("name");
try {
  nameInput.value = localStorage.getItem("lf-name") ?? "";
} catch {
  /* storage blocked */
}
const playerName = () => {
  const n = nameInput.value.trim().slice(0, 16);
  try {
    localStorage.setItem("lf-name", n);
  } catch {
    /* private mode */
  }
  return n;
};

$("create").onclick = async () => {
  try {
    const r = await fetch("/api/rooms", { method: "POST" });
    const { code } = (await r.json()) as { code: string };
    connectOnline(code, playerName());
  } catch {
    toast("Couldn't make a room. Is the server running?");
  }
};
$("join-form").onsubmit = (e) => {
  e.preventDefault();
  const code = $<HTMLInputElement>("code").value.toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 4) return toast("Room codes are 4 letters.");
  connectOnline(code, playerName());
};
$("practice").onclick = () => connectPractice(playerName());
$("story").onclick = () => connectStory(playerName());
$("story2").onclick = () => connectStory(playerName(), 2);
$("story3").onclick = () => connectStory(playerName(), 3);
$("story4").onclick = () => connectStory(playerName(), 4);
$("story5").onclick = () => connectStory(playerName(), 5);
$("story6").onclick = () => connectStory(playerName(), 6);
$("story8").onclick = () => connectStory(playerName(), 8);
$("story-pond").onclick = () => connectStory(playerName(), "pond");
// Saved progress: continue from where this browser got to, jump to any walk, or start over.
function renderProgress() {
  const p = loadProgress();
  const nextWalk = WALKS.find((w) => w.after === p.next - 1 && w.n > p.walk);
  $("story-continue").textContent = p.walk === 0 && p.next === 1 ? "Story: start" : nextWalk ? `Story: continue (walk ${nextWalk.n})` : `Story: continue (run ${p.next})`;
  $("progress-note").textContent = `Saved here: walk ${p.walk || "none yet"}, next run ${p.next}.`;
}
$("story-continue").onclick = () => {
  const p = loadProgress();
  const nextWalk = WALKS.find((w) => w.after === p.next - 1 && w.n > p.walk);
  if (nextWalk) return connectStory(playerName(), "pond", nextWalk.n);
  if (p.next >= 1 && p.next <= 8) return connectStory(playerName(), (p.next === 7 ? 6 : p.next) as 1 | 2 | 3 | 4 | 5 | 6 | 8);
  // Runs 9 on aren't built: the latest walk reached.
  connectStory(playerName(), "pond", Math.max(1, p.walk));
};
$<HTMLSelectElement>("walk-pick").replaceChildren(
  ...WALKS.map((w) => {
    const o = document.createElement("option");
    o.value = String(w.n);
    o.textContent = `Walk ${w.n}: ${w.title} (after run ${w.after})`;
    return o;
  }),
);
$("walk-go").onclick = () => {
  connectStory(playerName(), "pond", Number($<HTMLSelectElement>("walk-pick").value) || 1);
  // A jump to test a walk doesn't move saved progress on.
  jumped = true;
};
{
  const pick = $<HTMLSelectElement>("ending-pick");
  pick.replaceChildren(
    ...ENDING_CUTS.map((c) => Object.assign(document.createElement("option"), { value: c.id, textContent: c.name })),
  );
  pick.value = endingCut();
  pick.onchange = () => setEndingCut(pick.value);
}
{
  // Testing: walk round water when a wisp is tapped across it (Ladi, judging by feel). Saved per browser.
  const box = $<HTMLInputElement>("walk-round");
  const KEY = "lanternfall.walkRound";
  try {
    const v = new URLSearchParams(location.search).get("walkround") ?? localStorage.getItem(KEY);
    if (v !== null) Game.walkRound = v !== "0";
  } catch {}
  box.checked = Game.walkRound;
  box.onchange = () => {
    Game.walkRound = box.checked;
    try {
      localStorage.setItem(KEY, box.checked ? "1" : "0");
    } catch {}
  };
}
$("progress-reset").onclick = () => {
  resetProgress();
  renderProgress();
};
renderProgress();
// Run 2: call Rook to a spot. The next tap on the ground is the call.
let callMode = false;
function setCallMode(on: boolean) {
  callMode = on;
  $("call").classList.toggle("on", on);
  canvas.style.cursor = on ? "crosshair" : "";
  callHint();
}
$("call").onclick = () => setCallMode(!callMode);
/** Until her first call, say how calling works; in call mode, say what the next tap does. */
function callHint() {
  const st = room?.story;
  const can = !!st?.canCall && room?.phase === "playing";
  // Only once Rook has finished asking ("Tell me where to stand.").
  const fresh = can && !st?.called && $("dialog").hidden;
  const el = $("hint");
  el.hidden = !can || (!callMode && !fresh);
  if (!el.hidden) {
    // A tooltip hanging from the Call button.
    const r = $("call").getBoundingClientRect();
    el.style.top = `${r.bottom + 12}px`;
    el.style.right = `${Math.max(8, innerWidth - r.right - 8)}px`;
    el.style.setProperty("--arrow", `${Math.max(14, innerWidth - (r.left + r.width / 2) - Math.max(8, innerWidth - r.right - 8))}px`);
  }
  $("call").classList.toggle("nudge", fresh && !callMode);
  const touch = document.body.classList.contains("touch");
  // Run 4 turns it round: Rook sends Lumi.
  const who = st?.callWho;
  const where = who ? `${who} should go` : "Rook should stand";
  const btn = who ? `📣 Send ${who}` : "📣 Call";
  $("call").textContent = btn;
  $("call").setAttribute("aria-label", who ? `Send ${who} to a spot` : "Call Rook to a spot");
  el.textContent = callMode
    ? `${touch ? "Tap" : "Click"} the ground where ${where}.`
    : touch ? `Tap ${btn}, then tap where ${where}.` : `Press C or click ${btn}, then click where ${where}.`;
}
sound.unlockOnFirstInput();
const muteBtn = $("mute");
const showMute = () => {
  muteBtn.textContent = sound.isMuted() ? "🔇" : "🔊";
  muteBtn.setAttribute("aria-label", sound.isMuted() ? "Sound on" : "Sound off");
};
showMute();
muteBtn.onclick = () => {
  sound.setMuted(!sound.isMuted());
  showMute();
};
$("start").onclick = () => link?.send({ t: "start" });
$<HTMLSelectElement>("teams").onchange = (e) => {
  const n = Number((e.target as HTMLSelectElement).value);
  link?.send({ t: "teams", teams: n });
  // Practice: give each new rival guild a bot.
  if (practice && room) for (let g = room.teams; g < n; g++) link?.send({ t: "bot", guild: g as Guild, level: botLevel() });
};
for (const g of [0, 1, 2, 3] as Guild[]) {
  $(`join-${g}`).onclick = () => link?.send({ t: "guild", guild: g });
  $(`bot-${g}`).onclick = () => link?.send({ t: "bot", guild: g, level: botLevel() });
  $(`unbot-${g}`).onclick = () => link?.send({ t: "bot", guild: g, remove: true });
}
$("again").onclick = () => link?.send({ t: "lobby" });
$("leave").onclick = leave;
$("leave2").onclick = leave;
$("leave3").onclick = leave;
$("share").onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${room?.code}`;
  try {
    if (navigator.share) await navigator.share({ title: "Lanternfall", text: `Join my Lanternfall room ${room?.code}`, url });
    else {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied.");
    }
  } catch {
    /* cancelled */
  }
};
const shrineSel = $<HTMLSelectElement>("shrine");
shrineSel.replaceChildren(
  ...SHRINES.map((s) => {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name;
    return o;
  }),
);
shrineSel.onchange = () => link?.send({ t: "shrine", shrine: shrineSel.value });

// ------------------------------------------------------------------ frame loop

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cam.w = window.innerWidth;
  cam.h = window.innerHeight;
  overlay.width = Math.round(cam.w * dpr);
  overlay.height = Math.round(cam.h * dpr);
  overlay.style.width = canvas.style.width = `${cam.w}px`;
  overlay.style.height = canvas.style.height = `${cam.h}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  world?.resize(cam.w, cam.h, dpr);
  cam.scale = 0; // re-fit on next frame
}
window.addEventListener("resize", resize);
resize();

function frame(now: number) {
  requestAnimationFrame(frame);
  if (!room || room.phase === "lobby" || !snap) return;
  // Under the alarm's pictures the board is drawn a few times, to have it built, and then left alone until they go.
  if (alarmUp && ++alarmDrawn > 4) return;
  const shrine = shrineFor(room.shrine, room.teams);
  if (!world) {
    world = new World(canvas, cam);
    world.resize(cam.w, cam.h, window.devicePixelRatio || 1);
    // For looking things over in a headless browser.
    if (new URLSearchParams(location.search).has("dbg")) (window as unknown as { __world: World }).__world = world;
  }
  cam.board = shrine.board;
  if (cam.scale === 0) {
    if (cam.compact) cam.phoneZoom();
    else cam.fitBoard(shrine.board);
  }
  const t = Math.min(1, (now - snapAt) / tickMs);
  const mine = snap.players.find((p) => p.id === me);
  if (lookBeat) stepLook(now, shrine.props ?? [], mine);
  stepWellLook(room?.story?.sieve?.look);
  dyingCard(room?.story?.dying);
  if (room?.story?.sieve || pullView) stepPull(room?.story?.sieve?.pull, shrine.board);
  dyingZoom(room?.story?.dying, shrine.board);
  // A still up over something that matters: the view eases a little the other way.
  {
    const held = mine?.beam != null ? snap.wisps.find((w) => w.id === mine.beam) : null;
    const c = shrine.board.center;
    stills.step([{ x: c.x + 0.5, y: c.y + 0.5 }, held ? { x: held.x + 0.5, y: held.y + 0.5 } : null], (p) => cam.toScreen(p.x, p.y, 0.5), cam.scale);
  }
  if (cam.follow && mine) {
    if (cam.compact || cam.zoomedIn) {
      const tx = mine.px + (mine.x - mine.px) * t + 0.5 + stills.shove.x;
      const ty = mine.py + (mine.y - mine.py) * t + 0.5 + stills.shove.y;
      cam.cx += (tx - cam.cx) * 0.2;
      cam.cy += (ty - cam.cy) * 0.2;
    } else {
      cam.cx = shrine.board.width / 2 + stills.shove.x;
      // Runs 6 and 7: a little north, so Hesta's terrace and the village on it are in the picture.
      cam.cy = shrine.board.height / 2 + 0.5 + stills.shove.y - (room.story?.dying ? DYING.terrace.viewNorth : 0);
    }
  }
  cam.clamp(shrine.board);
  const flames = new Map<number, Flame>(room.players.map((p) => [p.id, p.flame]));
  const mark = room.story?.mark?.wisp ?? null;
  if (mark !== null && mark !== lastMark && document.body.classList.contains("touch")) {
    padWisp = mark;
    padFocus = true;
  }
  lastMark = mark;
  const lit = document.body.classList.contains("touch") ? padTarget() : hoverWisp;
  if (document.body.classList.contains("touch")) {
    const p = snap.players.find((q) => q.id === me);
    const w = snap.wisps.find((q) => q.id === lit);
    const reach = p?.mode === "push" ? PUSH_REACH : PULL_REACH;
    $("staff").classList.toggle("far", !p || !w || Math.max(Math.abs(w.x - p.x), Math.abs(w.y - p.y)) > reach);
  }
  // The ending: leftover wisps lift off and stream into the brazier, and the camera looks up.
  let drawSnap = snap, drawPrev = prevSnap;
  cam.lift = ending?.lift(now) ?? 0;
  if (ending) {
    const c = shrine.board.center, e = ending;
    const wisps = snap.wisps.flatMap((w, i) => {
      const k = e.stream(i, now);
      if (k >= 1) return [];
      const x = w.x + (c.x - w.x) * k, y = w.y + (c.y - w.y) * k;
      return [{ ...w, x, y, px: x, py: y, holder: null }];
    });
    drawSnap = drawPrev = { ...snap, wisps };
  }
  const st: DrawState = { shrine, prev: drawPrev, snap: drawSnap, t, me, flames, cast: castOf(), hoverWisp: lit, now, watchers: (lastWatchers = watchersFor(shrine.board)), steps: stepsFor(shrine.board), lantern: room?.story?.pond?.lantern, light: room?.story?.pond?.light, dying: room?.story?.dying, sieve: room?.story?.sieve, walk: room?.story?.pond?.walk };
  world.render(st);
  drawOverlay(g, cam, st);
  // On touch, ring the wisp the Staff button will work on.
  const lw = lit !== null && document.body.classList.contains("touch") ? snap.wisps.find((q) => q.id === lit) : null;
  if (lw) {
    const x = lw.px + (lw.x - lw.px) * t + 0.5, y = lw.py + (lw.y - lw.py) * t + 0.5;
    const c = cam.toScreen(x, y, 0.75);
    const r = Math.max(16, cam.scale * 0.8);
    g.save();
    g.strokeStyle = mine?.mode === "push" ? "#ff8a8a" : "#ffffffcc";
    g.lineWidth = 2.5;
    g.setLineDash([6, 5]);
    g.lineDashOffset = -now / 60;
    g.beginPath();
    g.arc(c.x, c.y, r, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  if (bigTaps) drawBigTaps(g, mine?.mode === "push", mine?.guild, lit, t, now);
  drawTide(g, shrine, now);
  if (room.story) drawStory(g, t, now);
  releaseBarks(now);
  // On a phone the still's band lies over the minimap: it fades out while one is up.
  miniAlpha += ((stills.up ? 0 : 1) - miniAlpha) * 0.15;
  if (cam.compact && !ending && miniAlpha > 0.02) {
    const w = Math.min(120, cam.w * 0.3);
    minimapRect = { x: cam.w - w - 10, y: 64, w, h: w };
    g.save();
    g.globalAlpha = miniAlpha;
    drawMinimap(g, cam, st, minimapRect);
    g.restore();
  } else if (cam.compact) minimapRect = { x: 0, y: 0, w: 0, h: 0 };
}
requestAnimationFrame(frame);

/** Run 1: Lumi and Hesta stand at the island's north edge, facing the camera, watching Rook's kindling. */
/** The watchers drawn last frame (Lumi and Hesta on the rim in run 1). */
let lastWatchers: DrawState["watchers"];
/** Where a speaker's head is on the field, for a bubble over them: a watcher, else a player playing them. */
function speakerAt(who: string): { x: number; y: number; h: number } | null {
  const cast = who.toLowerCase();
  const head = 2.1 * (CAST_SCALE[cast] ?? 1);
  const w = lastWatchers?.find((q) => q.cast === cast);
  if (w) return { x: w.x, y: w.y, h: head };
  const inCrowd = room?.story?.dying ? world?.crowdAt(cast) : null;
  if (inCrowd) return { ...inCrowd, h: cast === "sefa" ? 3.1 : head };
  const id = [...(castOf() ?? [])].find(([, c]) => c === cast)?.[0];
  const p = id != null && id !== me ? snap?.players.find((q) => q.id === id) : undefined;
  return p ? { x: p.x + 0.5, y: p.y + 0.5, h: head } : null;
}

function watchersFor(b: Board): DrawState["watchers"] {
  if (!(storyRoom instanceof StoryRoom) || !room?.story) return undefined;
  // Just past the northernmost floor tile in their column, on the island's rim.
  const edge = (x: number) => {
    let y = 0;
    while (y < b.height && b.tile({ x, y }) !== Tile.Floor) y++;
    return { x: x + 0.5, y: y - WATCH_EDGE };
  };
  return [
    { cast: "lumi", ...edge(b.center.x - 2) },
    { cast: "hesta", ...edge(b.center.x + 2) },
  ];
}
/** Run 1 only: the stair Hesta leaves by, from the middle of the plaza's north edge. For looks: not walkable. */
function stepsFor(b: Board): DrawState["steps"] {
  if (!(storyRoom instanceof StoryRoom) || !room?.story) return undefined;
  const x = b.center.x;
  let y = 0;
  while (y < b.height && b.tile({ x, y }) !== Tile.Floor) y++;
  return { x: x + 0.5, y: y - STEPS_EDGE };
}
/** How far past the plaza's edge (in tiles) the steps start. */
const STEPS_EDGE = 0.6;

/** How far past the plaza's edge (in tiles) Lumi and Hesta stand. */
const WATCH_EDGE = 1.7;

/** Story runs: who each player is, for their character model. In run 1 you are Rook. */
function castOf(): Map<number, string> | undefined {
  if (!room?.story) return undefined;
  const m = new Map<number, string>();
  for (const p of room.players) {
    const name = p.name.toLowerCase();
    const who = ["rook", "lumi", "wick", "moth", "kes", "hesta", "nell", "sefa"].find((n) => name.startsWith(n));
    if (who) m.set(p.id, who);
  }
  if (room.story.run === "The Grand Kindling") m.set(me, "rook");
  return m;
}

/** The last story mark seen, so a new one takes the phone's focus once. */
let lastMark: number | null = null;

/** Exposure before the ending lit the sky, to put back afterwards. */
let skyBase: number | null = null;

/** Story marks: Hesta's ring on the ground, the wisp Lumi is calling, and the sky lighting at the end. */
/** Each pool's tile edges nearest the brazier: "the fire side" (run 4's route line), worked out once per board. */
const fireSides = new WeakMap<object, { x: number; y: number }[]>();
function fireSideOf(b: Board) {
  let out = fireSides.get(b);
  if (out) return out;
  out = [];
  const c = b.center;
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      if (b.tile({ x, y }) !== Tile.Floor) continue;
      // Ground next to a pool, on the pool's side facing the fire.
      const sx = Math.sign(c.x - x), sy = Math.sign(c.y - y);
      const back = { x: x - sx, y: y - (Math.abs(x - c.x) > Math.abs(y - c.y) ? 0 : sy) };
      if (b.inside(back) && b.tile(back) === Tile.Water && Math.hypot(x - c.x, y - c.y) > 6) out.push({ x, y });
    }
  fireSides.set(b, out);
  return out;
}

/**
 * A clocked tide, read at a glance: chevrons on every pool tile that run in toward the brazier
 * while the tide comes in and out while it goes out, brightest just after it turns. In run 4 the
 * fire side of each pool glows faintly too, since Hesta's route sends Lumi there.
 */
function drawTide(g: CanvasRenderingContext2D, shrine: ReturnType<typeof shrineFor>, now: number) {
  const tide = shrine.gimmicks.tide;
  if (!tide || !snap || room?.phase === "lobby") return;
  const b = shrine.board, c = b.center;
  const tickNow = snap.tick + 1;
  const comingIn = tideIn(tickNow, tide);
  const since = tickNow % tide;
  const fresh = Math.max(0, 1 - since / 6);
  g.save();
  const flow = ((now / 900) % 1) * 0.5;
  g.lineWidth = 2;
  g.strokeStyle = comingIn ? `rgba(150, 235, 255, ${0.45 + 0.4 * fresh})` : `rgba(170, 180, 205, ${0.3 + 0.3 * fresh})`;
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      if (b.tile({ x, y }) !== Tile.Water || (x + y) % 2) continue;
      let dx = Math.sign(c.x - x), dy = Math.sign(c.y - y);
      if (Math.abs(x - c.x) > Math.abs(y - c.y) * 1.5) dy = 0;
      else if (Math.abs(y - c.y) > Math.abs(x - c.x) * 1.5) dx = 0;
      if (!comingIn) (dx = -dx), (dy = -dy);
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const o = flow - 0.25;
      const tip = cam.toScreen(x + 0.5 + ux * (0.2 + o), y + 0.5 + uy * (0.2 + o), 0.04);
      const l = cam.toScreen(x + 0.5 - ux * 0.1 + uy * 0.22 + ux * o, y + 0.5 - uy * 0.1 - ux * 0.22 + uy * o, 0.04);
      const r = cam.toScreen(x + 0.5 - ux * 0.1 - uy * 0.22 + ux * o, y + 0.5 - uy * 0.1 + ux * 0.22 + uy * o, 0.04);
      g.beginPath();
      g.moveTo(l.x, l.y);
      g.lineTo(tip.x, tip.y);
      g.lineTo(r.x, r.y);
      g.stroke();
    }
  // Run 4: the pool the next wave comes up on shimmers, a few ticks ahead.
  const sh = room?.story?.shimmer;
  if (sh) {
    for (const p of sh) {
      const k = 0.5 + 0.5 * Math.sin(now / 140 + p.x * 0.9 + p.y * 1.3);
      const q = cam.toScreen(p.x + 0.5, p.y + 0.5, 0.05);
      g.fillStyle = `rgba(235, 250, 255, ${0.15 + 0.4 * k})`;
      g.beginPath();
      g.arc(q.x, q.y, Math.max(3, cam.scale * (0.18 + 0.14 * k)), 0, Math.PI * 2);
      g.fill();
    }
    // Off screen: an arrow at the edge points to it.
    if (sh.length) {
      const mx = sh.reduce((a, p) => a + p.x, 0) / sh.length + 0.5, my = sh.reduce((a, p) => a + p.y, 0) / sh.length + 0.5;
      edgeArrow(g, cam.toScreen(mx, my, 0.05), "#e8f8ff");
    }
  }
  if (room?.story?.callWho) {
    g.fillStyle = "rgba(255, 170, 80, 0.4)";
    for (const p of fireSideOf(b)) {
      const q = cam.toScreen(p.x + 0.5, p.y + 0.5, 0.03);
      g.beginPath();
      g.arc(q.x, q.y, Math.max(3, cam.scale * 0.28), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function drawStory(g: CanvasRenderingContext2D, t: number, now: number) {
  placeBarks(performance.now());
  const st = room?.story;
  if (!st || !snap || !world) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  if (st.ring && room!.phase === "playing") {
    const cx = st.ring.x + 0.5, cy = st.ring.y + 0.5;
    g.save();
    for (const [r, a, w] of [[0.62, 0.95, 3], [0.62 + 0.25 * pulse, 0.5 * (1 - pulse), 2]] as const) {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const ang = (i / 40) * Math.PI * 2;
        const p = cam.toScreen(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0.02);
        if (i) g.lineTo(p.x, p.y);
        else g.moveTo(p.x, p.y);
      }
      g.strokeStyle = `rgba(255, 214, 120, ${a})`;
      g.lineWidth = w;
      g.shadowColor = "#ffd36a";
      g.shadowBlur = 12;
      g.stroke();
    }
    g.restore();
    edgeArrow(g, cam.toScreen(cx, cy, 0.02), "#ffd36a");
  }
  // Run 2: the halfway mark between two pulling one wisp, and the spot Rook was called to.
  const groundRing = (cx: number, cy: number, r: number, color: string, dash: number[]) => {
    g.save();
    g.beginPath();
    for (let i = 0; i <= 32; i++) {
      const ang = (i / 32) * Math.PI * 2;
      const p = cam.toScreen(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0.02);
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    }
    g.setLineDash(dash);
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.shadowColor = color;
    g.shadowBlur = 10;
    g.stroke();
    g.restore();
  };
  if (st.halfway && room!.phase === "playing") {
    const hx = st.halfway.x + 0.5, hy = st.halfway.y + 0.5;
    groundRing(hx, hy, 0.35 + 0.1 * pulse, "rgba(140, 220, 255, 0.95)", []);
    // A cross at the centre: the point the wisp heads for.
    const c = cam.toScreen(hx, hy, 0.02);
    g.save();
    g.strokeStyle = "rgba(140, 220, 255, 0.95)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c.x - 6, c.y);
    g.lineTo(c.x + 6, c.y);
    g.moveTo(c.x, c.y - 6);
    g.lineTo(c.x, c.y + 6);
    g.stroke();
    g.restore();
  }
  // Where the partner was sent: white for Rook (run 2), Lumi's frost blue (run 4).
  if (st.called && room!.phase === "playing") groundRing(st.called.x + 0.5, st.called.y + 0.5, 0.5 + (st.callWho ? 0.08 * pulse : 0), st.callWho ? "rgba(140, 220, 255, 0.95)" : "rgba(255, 255, 255, 0.8)", [5, 5]);
  const cw = st.mark ? snap.wisps.find((w) => w.id === st.mark!.wisp) : null;
  if (cw) {
    // The plain focus circle, at the size of its tap target.
    const x = cw.px + (cw.x - cw.px) * t + 0.5, y = cw.py + (cw.y - cw.py) * t + 0.5;
    const c = cam.toScreen(x, y, 0.75);
    g.save();
    g.strokeStyle = "#ffffffcc";
    g.lineWidth = 2.5;
    g.setLineDash([6, 5]);
    g.lineDashOffset = -now / 60;
    g.beginPath();
    g.arc(c.x, c.y, bigTapRadius(), 0, Math.PI * 2);
    g.stroke();
    g.restore();
    edgeArrow(g, c, "#ffffffcc");
  }
  // The ending: the camera pulls out and the sky brightens with the score.
  const r = world.renderer;
  if (st.end && room!.phase === "results") {
    if (skyBase === null) skyBase = r.toneMappingExposure;
    const goal = skyBase * (1 + 0.9 * (st.end.sky ?? 0.3));
    r.toneMappingExposure += (goal - r.toneMappingExposure) * 0.02;
    cam.follow = false;
    cam.scale *= 0.997;
  } else if (skyBase !== null) {
    r.toneMappingExposure = skyBase;
    skyBase = null;
  }
}

/** When a story mark is off screen, an arrow at the edge points the way to it. */
function edgeArrow(g: CanvasRenderingContext2D, p: { x: number; y: number }, col: string) {
  const m = 36;
  if (p.x >= m && p.y >= m + 40 && p.x <= cam.w - m && p.y <= cam.h - m) return;
  const cx = cam.w / 2, cy = cam.h / 2;
  const a = Math.atan2(p.y - cy, p.x - cx);
  // Where the line from the centre meets the inset edge of the screen.
  const sx = (cam.w / 2 - m) / Math.abs(Math.cos(a) || 1e-6), sy = (cam.h / 2 - m - 40) / Math.abs(Math.sin(a) || 1e-6);
  const d = Math.min(sx, sy);
  const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = col;
  g.shadowColor = col;
  g.shadowBlur = 10;
  g.beginPath();
  g.moveTo(14, 0);
  g.lineTo(-8, -10);
  g.lineTo(-8, 10);
  g.closePath();
  g.fill();
  g.restore();
}

/** Big taps: a dashed ring around each wisp showing its click target. Ones your staff can work now are bright; the hovered one is solid. */
function drawBigTaps(g: CanvasRenderingContext2D, push: boolean, guild: number | undefined, hover: number | null, t: number, now: number) {
  if (!snap) return;
  const r = bigTapRadius();
  g.save();
  g.lineWidth = 2;
  for (const w of snap.wisps) {
    const x = w.px + (w.x - w.px) * t + 0.5, y = w.py + (w.y - w.py) * t + 0.5;
    const c = cam.toScreen(x, y, 0.75);
    const usable = push || w.guild === guild;
    const on = w.id === hover;
    g.strokeStyle = push ? (usable ? "#ff8a8ad0" : "#ff8a8a50") : usable ? "#ffffffe0" : "#ffffff55";
    g.lineWidth = on ? 3.5 : 2.5;
    g.setLineDash(on ? [] : [5, 5]);
    g.lineDashOffset = -now / 80;
    g.beginPath();
    g.arc(c.x, c.y, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

loadModels();
render();

const urlCode = new URLSearchParams(location.search).get("room");
if (urlCode && /^[a-z]{4}$/i.test(urlCode)) {
  $<HTMLInputElement>("code").value = urlCode.toUpperCase();
  if (nameInput.value) connectOnline(urlCode.toUpperCase(), playerName());
}

// Read-only hook for the browser smoke test (tools/smoke.cjs).
(window as unknown as { lanternfall: object }).lanternfall = {
  snap: () => snap,
  room: () => room,
  me: () => me,
  toScreen: (x: number, y: number, h = 0) => cam.toScreen(x, y, h),
  /** Show a story line as if the run said it (for checking dialog and barks). */
  say: (l: StoryLine) => sayLine(l),
  /** What a click at this screen point would do. */
  tap: (x: number, y: number) => targetAt(x, y),
  /** The story run in the page, for jumping to its end in tests. */
  story: () => storyRoom,
};

// ------------------------------------------------------------------ debug overlay
// Press ` during a round to see each bot's level, role, half or home square and what it's
// doing, with a log of the changes.

const debugLog: string[] = [];
const lastBot = new Map<number, string>();
let lastMode = "";
let lastDebugTick = 0;

function toggleDebug() {
  const d = $("debug");
  d.hidden = !d.hidden;
}

function debugTick(s: GameSnapshot, bots: BotDebug[]) {
  const t = `t${String(s.tick).padStart(3, "0")}`;
  const log = (line: string) => {
    debugLog.push(`${t} ${line}`);
    if (debugLog.length > 400) debugLog.splice(0, debugLog.length - 400);
  };
  // A new round: start the log afresh.
  if (s.tick < lastDebugTick) {
    lastBot.clear();
    lastMode = "";
    debugLog.length = 0;
  }
  lastDebugTick = s.tick;
  const shrine = room ? shrineFor(room.shrine, room.teams) : null;
  const c = shrine?.board.center ?? { x: 0, y: 0 };
  const off = (x: number, y: number) => `(${x - c.x >= 0 ? "+" : ""}${x - c.x},${y - c.y >= 0 ? "+" : ""}${y - c.y})`;
  const you = s.players.find((p) => p.id === me);
  if (you) {
    const mode = `${you.mode}${you.run ? " running" : ""}`;
    if (mode !== lastMode) log(`you: ${mode}`);
    lastMode = mode;
  }
  for (const b of s.banks) log(`banked: ${GUILD_NAMES[b.guild] ?? b.guild} wisp ${b.wisp}`);
  for (const b of bots) {
    const head = `${b.name} [${b.level}] ${b.role}${b.half ? " " + b.half + " half" : ""}${b.home ? " home " + b.home : ""}${b.team ? " with " + b.team : ""}`;
    const was = lastBot.get(b.id);
    const now = `${head} | ${b.intent}`;
    if (was !== now) {
      if (!was || was.split(" | ")[0] !== head) log(`${b.name}: ${head.slice(b.name.length + 1)}`);
      if (b.intent && (!was || was.split(" | ")[1] !== b.intent)) log(`${b.name}: ${b.intent}`);
    }
    lastBot.set(b.id, now);
  }
  const d = $("debug");
  if (d.hidden) return;
  const lines = [`tick ${s.tick}  scores ${s.scores.join(" : ")}`];
  if (you) lines.push(`you: ${off(you.x, you.y)} ${you.mode}${you.run ? " running" : ""}, guild ${GUILD_NAMES[you.guild] ?? you.guild}`);
  for (const b of bots) {
    const p = s.players.find((q) => q.id === b.id);
    lines.push(`${b.name} [${b.level}, ${GUILD_NAMES[b.guild] ?? b.guild}] at ${p ? off(p.x, p.y) : "?"}`);
    lines.push(`  ${b.role}${b.half ? ", " + b.half + " half" : ""}${b.home ? ", home square " + b.home : ""}${b.team ? ", teamed with " + b.team : ""}`);
    lines.push(`  ${b.intent || "-"}`);
  }
  $("debug-state").textContent = lines.join("\n");
  const l = $("debug-log");
  const atEnd = l.scrollTop + l.clientHeight >= l.scrollHeight - 4;
  l.textContent = debugLog.join("\n");
  if (atEnd) l.scrollTop = l.scrollHeight;
}
