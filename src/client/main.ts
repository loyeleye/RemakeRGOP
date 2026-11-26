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
import { RescueRoom } from "../server/rescue.js";
import { RESCUE } from "../engine/rescue.js";
import { ShipRoom } from "../server/shiphome.js";
import { SHIP, SHIP_DECK, shipReach } from "../engine/shiphome.js";
import { DYING } from "../engine/dying.js";
import { PondRoom, answersTap } from "../server/pond.js";
import { JobRoom } from "../server/job.js";
import { WALKS } from "../engine/walks.js";
import { loadOpt, loadProgress, reach, resetOpts, resetProgress, saveOpt } from "./progress.js";
import { RematchRoom } from "../server/rematch.js";
import { REMATCH } from "../engine/rematch.js";
import { CoveRoom } from "../server/cove.js";
import { COVE } from "../engine/cove.js";
import { KiteRoom } from "../server/kite.js";
import { TidepoolRoom } from "../server/tidepool.js";
import { TIDEPOOL } from "../engine/tidepool.js";
import { MossRoom } from "../server/mosshollow.js";
import { MOSS } from "../engine/mosshollow.js";
import { KITE } from "../engine/kite.js";
import { VOICE_SECONDS } from "../engine/voice-durations.js";
import { CONTROLS, hintSeen, markHint, resetHints } from "./controls.js";
import { StoryRoom } from "../server/story.js";
import { Kitchen } from "./kitchen.js";
import { DREAM, EVENING, GLOW, HELD, MENU_RUNS, MORNING, OPTIONAL_RUNS, PART1, SUPPER, loadFar, loadPlace, pieceIndex, pieceOfRun, pieceOfWalk, savePlace, type Piece } from "./part1.js";
import { card as storyCard, ENDING, KindlingEnding, lanternCard } from "./ending.js";
import { buildTesting } from "./testing.js";
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
      noteOpt();
      chainWatch();
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

let storyRoom: LessonRoom | StoryRoom | GrannyRoom | PondRoom | JobRoom | RaceRoom | DyingRoom | SieveRoom | RescueRoom | ShipRoom | RematchRoom | CoveRoom | KiteRoom | TidepoolRoom | MossRoom | null = null;

/** The walkable map, at the speed on trial: ?walkspeed=1.5, 2 or 2.5 shortens the map's beat; with &only=rook only his stride is longer. */
function pondRoom(walk: number) {
  const r = new PondRoom(undefined, undefined, walk);
  r.chain = chainAt >= 0 && chainBack === null;
  const q = new URLSearchParams(location.search), f = Number(q.get("walkspeed"));
  if ([1.5, 2, 2.5].includes(f)) {
    if (q.get("only") === "rook") r.rookStride = f;
    else r.beatMs = TICK_MS / f;
  }
  return r;
}

/**
 * Optional run 1, Granny's rematch. The pond wall's score and how many rematches there have been
 * are kept in this browser. Switches: ?cheat=hold, goal or nap picks her cheat (they take turns
 * otherwise); ?granny=beatable lets her lose, for comparison; ?reward=1 shows the placeholder
 * pop-up on a first win.
 */
function rematchRoom() {
  const r = new RematchRoom();
  const q = new URLSearchParams(location.search), rec = loadOpt(REMATCH.id);
  r.wall = Math.max(REMATCH.wallStart, rec.best);
  r.count = rec.count;
  r.fours = rec.fours ?? 0;
  const cheat = q.get("cheat");
  if (cheat === "hold" || cheat === "goal" || cheat === "nap") r.cheatPick = cheat;
  if (q.get("granny") === "beatable") r.beatable = true;
  optSeen = null;
  return r;
}

/**
 * Optional run 2, Lumi's lesson with Kes. Her best (wisps landed in one lesson) and how many
 * lessons there have been are kept in this browser. Any number in COVE can be set from the link to
 * judge it by feel: ?cove=tide.in:10,tide.out:14,reach:10 and so on.
 */
function coveRoom() {
  const r = new CoveRoom();
  const q = new URLSearchParams(location.search), rec = loadOpt(COVE.id);
  for (const part of (q.get("cove") ?? "").split(",").filter(Boolean)) {
    const [k, v] = part.split(":"), path = (k ?? "").split("."), last = path.pop()!;
    let at = COVE as unknown as Record<string, unknown>;
    for (const step of path) at = (at?.[step] ?? {}) as Record<string, unknown>;
    if (typeof at[last] === "number" && Number.isFinite(Number(v))) at[last] = Number(v);
  }
  r.best = rec.best;
  r.count = rec.count;
  optSeen = null;
  return r;
}

/**
 * Optional run 3c, Kes's rematch on the Fell. His best (wisps taken in one rematch) and how many
 * there have been are kept in this browser. Any number in KITE can be set from the link to judge
 * it by feel: ?kite=wind:1.2,gust.every:36,reach:8 and so on.
 */
function kiteRoom() {
  const q = new URLSearchParams(location.search), rec = loadOpt(KITE.id);
  for (const part of (q.get("kite") ?? "").split(",").filter(Boolean)) {
    const [k, v] = part.split(":"), path = (k ?? "").split("."), last = path.pop()!;
    let at = KITE as unknown as Record<string, unknown>;
    for (const step of path) at = (at?.[step] ?? {}) as Record<string, unknown>;
    if (typeof at[last] === "number" && Number.isFinite(Number(v))) at[last] = Number(v);
  }
  const r = new KiteRoom();
  r.best = rec.best;
  r.count = rec.count;
  optSeen = null;
  return r;
}

/**
 * Optional run 3b, Tidepool Steps, Marit's tide job. His best (wisps taken in one job) and how
 * many there have been are kept in this browser. Any number in TIDEPOOL can be set from the link
 * to judge it by feel: ?tidepool=tide.out:16,reach:5 and so on (lists such as rise are not).
 */
function tidepoolRoom() {
  const q = new URLSearchParams(location.search), rec = loadOpt(TIDEPOOL.id);
  for (const part of (q.get("tidepool") ?? "").split(",").filter(Boolean)) {
    const [k, v] = part.split(":"), path = (k ?? "").split("."), last = path.pop()!;
    let at = TIDEPOOL as unknown as Record<string, unknown>;
    for (const step of path) at = (at?.[step] ?? {}) as Record<string, unknown>;
    if (typeof at[last] === "number" && Number.isFinite(Number(v))) at[last] = Number(v);
  }
  const r = new TidepoolRoom();
  r.best = rec.best;
  r.count = rec.count;
  optSeen = null;
  return r;
}

/**
 * Optional run 3a, Moss Hollow, Garrick's moss job. His best and how many there have been are kept
 * in this browser. Any number in MOSS can be set from the link to judge it by feel:
 * ?moss=strokes:10,creep:14,rise.every:12 and so on (the lists of patches and singles are not).
 */
function mossRoom() {
  const q = new URLSearchParams(location.search), rec = loadOpt(MOSS.id);
  for (const part of (q.get("moss") ?? "").split(",").filter(Boolean)) {
    const [k, v] = part.split(":"), path = (k ?? "").split("."), last = path.pop()!;
    let at = MOSS as unknown as Record<string, unknown>;
    for (const step of path) at = (at?.[step] ?? {}) as Record<string, unknown>;
    if (typeof at[last] === "number" && Number.isFinite(Number(v))) at[last] = Number(v);
  }
  const r = new MossRoom();
  r.best = rec.best;
  r.count = rec.count;
  optSeen = null;
  return r;
}

/** Which playing of an optional run has had its record kept (its count), so that each is kept once. */
let optSeen: number | null = null;

/**
 * A first win of an optional run. Nothing is given yet (Ladi, 24 Nov): this is where a reward
 * will be handed over. With ?reward=1 a placeholder pop-up shows that one is coming.
 */
function rewardEarned(runId: string) {
  if (new URLSearchParams(location.search).get("reward") !== "1") return;
  const el = $("reward");
  el.dataset.run = runId;
  el.hidden = false;
  window.setTimeout(() => (el.hidden = true), 5200);
}

/** An optional run has ended: its score is kept, and a first win earns its reward. */
function noteOpt() {
  const rec = room?.story?.opt?.record;
  if (!rec || rec.count === optSeen || room!.phase !== "results") return;
  optSeen = rec.count;
  if (saveOpt(rec.id, { best: rec.best, won: rec.won, count: rec.count, fours: rec.fours })) rewardEarned(rec.id);
}

/** A story run runs in the page too, like Practice: run 1 (the Grand Kindling), run 2 (Lumi's lesson) or run 3 (Granny's game). */
function connectStory(name: string, run: 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | "pond" | "o1" | "o2" | "o3a" | "o3b" | "o3c" = 1, walk = 1) {
  practice = true;
  jumped = false;
  callMode = false;
  sound.preloadVoices();
  const r = run === "o3a" ? mossRoom() : run === "o3b" ? tidepoolRoom() : run === "o3c" ? kiteRoom() : run === "o2" ? coveRoom() : run === "o1" ? rematchRoom() : run === "pond" ? pondRoom(walk) : run === 10 ? shipRoom() : run === 9 ? rescueRoom() : run === 8 ? sieveRoom() : run === 6 ? dyingRoom() : run === 5 ? new RaceRoom() : run === 4 ? new JobRoom() : run === 3 ? new GrannyRoom() : run === 2 ? new LessonRoom() : new StoryRoom();
  // ?nostills: every run's reaction stills off (runs 8 to 10 also read it where they are built).
  if ("stillsOn" in r && new URLSearchParams(location.search).has("nostills")) r.stillsOn = false;
  // Run 5 after walk 7, where Kes's challenge was said: its opening leaves those lines out.
  if (run === 5 && chainAt > 0 && PART1[chainAt - 1]?.id.startsWith("4-5")) (r as RaceRoom).openSaid = true;
  storyRoom = r;
  runHints = { walkSince: 0, reminded: false, misses: 0, rescued: false };
  const conn = r.connect((m) => queueMicrotask(() => onServer(m)));
  link = { send: (m) => conn.message(JSON.stringify(m)), close: () => conn.close() };
  const hello = () => link?.send({ t: "hello", name: name || "Rook" });
  // Run 2 opens on Lumi's unlit lantern, where the eye was, before play.
  if (run === 2 && lanternShown) {
    // Reached through Part 1's kitchen scene, which has just shown the lantern: no second showing.
    lanternShown = false;
    hello();
    talkHold = performance.now() + ENDING.lantern.fade * 1000;
  } else if (run === 2) {
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
  /** Run 9: when its speaker went into the patch, for holding its time over; and when the static cut it off. */
  darkAt?: number;
  cutAt?: number;
  who?: string;
  text?: string;
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
  // A line that stays a bubble: the picture comes alone, and the bubble says it.
  stills.show({ cue: c, caption: c.bubble ? "" : l.text, who: l.who, ms }, from);
  if (l.text && l.who && !c.bubble && !l.quiet) sound.speak(l.who, l.text);
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
  // The one still that fills the screen and stops play: up until the room goes on (rescueSound takes it down). A tap goes on.
  if (l.still?.full) {
    // Run 9's pause is three pictures, with a burst of static (the same one that cuts Kes off in play) between the second and third.
    stills.full(l.still.id, l.who, l.text, () => link?.send({ t: "on" }), l.still.id === RESCUE.hold.id ? { frames: RESCUE.hold.frames, static: RESCUE.hold.static, onStatic: () => sound.staticBurst(RESCUE.hold.static.ms / 1000) } : undefined);
    sound.paper();
    if (l.text && l.who && !l.quiet) sound.speak(l.who, l.text);
    return;
  }
  if (l.still && !l.talk) {
    stillLine(l);
    if (!l.still.bubble || !l.text) return;
    // Its bubble goes up with its picture, not after it.
    released = true;
  }
  if (!released && !l.talk && room?.phase === "playing" && l.who && (stills.up || heldBarks.length)) return void heldBarks.push(l);
  if (l.talk || room?.phase !== "playing" || !l.who) return talk(l);
  // A line about nothing in particular sits over its speaker's model when they're on the field.
  const speaker = l.wisp == null && !l.ring && l.player == null ? speakerAt(l.who) && l.who.toLowerCase() : undefined;
  const anchored = l.wisp != null || l.ring || l.player != null || !!speaker;
  const el = $(anchored ? "bark" : "chip");
  el.className = `bark${anchored ? "" : " chip"}${l.thought ? " thought" : ""} ${l.who.toLowerCase()}`;
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
  barks[anchored ? "bark" : "chip"] = { el, until: performance.now() + Math.max(2000, l.text.length * 60, (VOICE_SECONDS[`${l.who}|${l.text}`] ?? 0) * 1000 + 400), wisp: l.wisp, ring: l.ring, player: l.player, speaker: speaker || undefined, who: l.who, text: l.text };
  if (!l.quiet && !l.thought) sound.speak(l.who, l.text, l.who === "Hesta" && l.wisp != null, !!l.over);
  if (!anchored) placeBarks(performance.now());
}

// The static's picture: grey noise made here once, until the cutscene thread's tiling texture is in.
{
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const im = g.createImageData(64, 64);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.floor(Math.random() * 256);
      (im.data[i] = im.data[i + 1] = v), (im.data[i + 2] = Math.min(255, v + 14)), (im.data[i + 3] = 255);
    }
    g.putImageData(im, 0, 0);
    document.documentElement.style.setProperty("--static", `url(${c.toDataURL()})`);
  }
}

/**
 * Run 9 (Ladi, 24 Nov): static when the shadow goes over Kes and cuts off her lines. The moment it
 * covers her: a hard burst, in which her bubble and her name break up; then a low hiss for as long
 * as she is under it. Out again, the hiss stops dead and she finishes what she was saying.
 * `staticCut`: who is under it, and when the burst ends.
 */
let staticCut: { player: number; who: string; until: number } | null = null;
/** Her clip took up where it stopped (so the line is not said again). */
let staticResumed = false;
function stepStatic(now: number) {
  const under = room?.phase === "playing" ? room.story?.rescue?.dark?.find((id) => id !== me) : undefined;
  if (under !== undefined && !staticCut) {
    const who = room!.players.find((p) => p.id === under)?.name ?? "";
    staticCut = { player: under, who, until: now + sound.SOUND.static.burst * 1000 };
    sound.cutVoice(who);
    sound.staticBurst();
  } else if (under === undefined && staticCut) {
    sound.staticHiss(false);
    staticResumed = sound.cutVoice(null);
    staticCut = null;
  }
  if (staticCut && now >= staticCut.until) sound.staticHiss(true);
}

/** Each frame: keep barks on what they point at, and fade them when their time is up. */
function placeBarks(now: number) {
  stepStatic(now);
  for (const k of ["bark", "chip"] as const) {
    const b = barks[k];
    if (!b) continue;
    // Run 9: inside the patch her bubble is not seen, and what she was saying waits until she is out.
    // It breaks up in static for the burst that cuts her off (see stepStatic), and is then gone.
    const dark = k === "bark" && b.player != null && b.player === staticCut?.player;
    const burst = dark && now < staticCut!.until;
    if (dark) b.cutAt = now;
    b.el.classList.toggle("static", burst);
    b.el.style.visibility = dark && !burst ? "hidden" : "";
    if (dark) {
      b.until += now - (b.darkAt ?? now);
      b.darkAt = now;
      if (!burst) continue;
    } else if (b.cutAt !== undefined) {
      // She is out: she finishes the line.
      b.cutAt = undefined;
      if (b.who && b.text && room?.phase === "playing" && !staticResumed) sound.speak(b.who, b.text);
    }
    if (!dark) b.darkAt = undefined;
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
      if (l.who && !l.quiet) sound.speak(l.who, l.text);
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
  // Long enough to read, and for its voice to finish: a line that comes while a clip still plays is not voiced.
  talkTimer = window.setTimeout(nextTalk, Math.max(1800, t.l.text.length * 45, (VOICE_SECONDS[`${t.l.who}|${t.l.text}`] ?? 0) * 1000 + 250));
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

function leave(keepUrl = false) {
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
  shipCut(false);
  stopStorySound();
  if (!keepUrl) {
    // Back to the menu: Part 1's chain is left (its place is kept).
    chainAt = -1;
    chainBack = null;
    try {
      history.replaceState(null, "", location.pathname);
    } catch {
      /* sandboxed page */
    }
  }
  render();
  renderPart1();
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
    else if (st.run === RESCUE.run) reach({ next: 10 });
    else if (st.run === SHIP.run) reach({ next: 11 });
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
  // On as soon as it is fully black (0.8 s after it starts), and back out once the pond has drawn
  // its first frame, quickly, so the black lasts as little as the building takes (gameplay thread: under a second).
  setTimeout(() => {
    const l = link;
    link = null;
    l?.close();
    clearCaptions();
    stopStorySound();
    connectStory(playerName(), "pond");
    let n = 0;
    const out = () => {
      if (++n < 3) return void requestAnimationFrame(out);
      fade.classList.add("quick");
      fade.classList.remove("on");
      setTimeout(() => fade.remove(), 600);
    };
    requestAnimationFrame(out);
  }, 3420);
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
  // Run 10 has no result: it cuts to black and goes back to the menu.
  if (phase === "results" && room.story?.end?.cut) {
    $("results").hidden = true;
    shipDone();
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
let kitchenWalk = 0;
function openKitchen() {
  const pond = room?.story?.pond;
  const n = pond?.kitchen ?? 0;
  // A new walk counts from nothing (walk 8 opens with the still up: WALKS' inside).
  if (pond && pond.walk !== kitchenWalk) (kitchenWalk = pond.walk ?? 0), (kitchenSeen = 0);
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
  $("again").textContent = chainAgainLabel() ?? "Play again";
  $("again").hidden = false;
  // Run 1 ends on the cutscene in place of this panel.
  if (end && end.sky !== undefined) {
    if (ending?.end !== end) {
      ending?.stop();
      clearCaptions();
      ending = new KindlingEnding(end, {
        html: (l) => `${faceHtml(l)}<span><b class="${l.who.toLowerCase()}">${esc(l.who)}</b> ${lineHtml(l.text)}</span>`,
        speak: (l) => sound.speak(l.who, l.text, false),
        playAgain: () => (chainAt >= 0 ? chainOn() : link?.send({ t: "lobby" })),
        leave: () => leave(),
        ...(chainAt >= 0 ? { againLabel: "Continue" } : {}),
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
  if (room!.story?.sieve || room!.story?.rescue || room!.story?.ship) {
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
  else if (st.rescue) rescueSound(st.rescue);
  else if (st.ship) shipSound(st.ship);
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
  if (q.get("still4") === "0") r.stillFour = false;
  if (q.has("nostills")) r.stillsOn = false;
  else stills.preload("r8-");
  return r;
}

/**
 * Run 9, the rescue, reworked from Ladi's notes. Switches: ?patch=react (the default: the patch
 * goes for light and swells over a heap), ?patch=seek (goes for light at one size), ?patch=line
 * (the first build's fixed lines), ?patch=drag (the first sketch's carrying-off); ?kes=banks (the
 * first build's Kes, who banked her own); ?flare=1 (a try: three in quick succession give a pip
 * more); ?nostills leaves the pictures out, the one that stops play too.
 */
function rescueRoom() {
  const r = new RescueRoom();
  const q = new URLSearchParams(location.search);
  const aim = q.get("patch");
  if (aim === "drag") r.patchMode = "drag";
  // The rule: it goes for the brightest thing (bait, the run's own). ?patch=clock is the build before it (v155).
  if (aim === "bait" || aim === "clock" || aim === "react" || aim === "seek" || aim === "line") r.patchAim = aim;
  // How long the lamp waits between two wisps (14 ticks is the run's own; ?sip=10 to compare, 0 for none).
  const sip = q.get("sip");
  if (sip !== null && Number(sip) >= 0 && Number(sip) <= 30) (RESCUE.patch.bait as { sip: number }).sip = Math.round(Number(sip));
  const clock = (q.get("clock") ?? "").split(",").map(Number);
  if (clock.length === 3 && clock.every((n) => n > 0 && n < 1)) (RESCUE.patch.clock as { at: readonly number[] }).at = clock;
  if (q.get("kes") === "banks") r.kesMode = "banks";
  if (q.get("kes") === "still") r.kesIdle = "still";
  if (q.get("flare") === "1") r.flareOn = true;
  const lamp = q.get("lamp");
  if (lamp === "holds" || lamp === "leaks") r.lampMode = lamp;
  rescueHeard = { flew: "", lifted: 0, fill: 0, gutter: false, went: -9, told: false };
  if (q.has("nostills")) r.stillsOn = false;
  else stills.preload("r9-");
  patchHeard = 0;
  return r;
}

/**
 * Run 10, the ship home. The wisps are spread over the whole width of the cloud in view, so on a
 * screen held upright, which shows less to the sides, the lanes stop sooner (SHIP.offNarrow).
 * Switches: ?speed=0, ?banks=0 and ?hauls=0 each turn one part of the game off (SHIP's header says
 * what each is); ?len=200 is the long run (120 ticks is the run's own); ?far=10 sets the farthest lane (tiles off the rail, 4 to 30; 20 is the run's own); ?reach=10 or 12 sets how
 * far his pull reaches from the middle of the deck (8 is the run's own); ?nodraw leaves a hauled
 * wisp lying at the rail for him to pull again; ?wind=0.75 or 1.25 (anything from 0.5 to 1.5)
 * makes the wind that much of what it is; ?nostills leaves the three views over the bow out.
 */
function shipRoom() {
  const r = new ShipRoom();
  const q = new URLSearchParams(location.search), wind = Number(q.get("wind"));
  if (wind >= 0.5 && wind <= 1.5) r.windScale = wind;
  const reach = Number(q.get("reach"));
  if ([8, 10, 12].includes(reach)) r.reach = reach;
  const far = Number(q.get("far"));
  r.far = far >= 4 && far <= SHIP.offMax ? Math.round(far) : innerHeight > innerWidth ? SHIP.offNarrow : SHIP.off[1];
  if (q.has("nodraw")) r.draws = false;
  // The three parts of the game, each to be felt by turning it off, and the run's length.
  if (q.get("speed") === "0") r.speedOn = false;
  if (q.get("banks") === "0") r.banksOn = false;
  if (q.get("hauls") === "0") r.haulsOn = false;
  const len = Number(q.get("len"));
  if (len >= 60 && len <= SHIP.ticksLong) r.len = Math.round(len);
  if (q.has("nostills")) r.stillsOn = false;
  else stills.preload("r10-");
  shipCut(false);
  return r;
}

/** Run 10's sounds: the wind and the lamp, and from half way one slow stroke of the bell from home, a little nearer each time. */
function shipSound(r: NonNullable<StoryView["ship"]>) {
  if (r.bell) sound.greatBell(0.22 + 0.2 * r.home);
  // A cloud bank: a low rush from its side, growing as its front comes down on the ship, and falling away as it goes astern.
  const b = r.bank;
  if (b && r.gutter === undefined) {
    const coming = Math.max(0, Math.min(1, 1 - (-SHIP_DECK.hl - b.front) / 46)), going = Math.max(0, Math.min(1, (b.front - b.len - SHIP_DECK.hl) / -30 + 1));
    sound.cloudRush(b.front < -SHIP_DECK.hl ? 0.12 + 0.6 * coming : Math.min(1, 0.72 + 0.28 * going) * going, b.side * 0.8);
  } else sound.cloudRush(0);
  // A big one going in is heard as three.
  if ((r.fed ?? 0) > 1) sound.feedChime(r.fed!);
  // He goes over the rail: the picture cuts before he lands.
  if (r.over !== undefined) shipCut(true);
}

/** Run 10's end: no result screen. A quick cut to black as he goes over the rail, held a moment, and then the menu. */
let shipFade: HTMLElement | null = null;
let shipLeft: ReturnType<typeof setTimeout> | null = null;
function shipCut(on: boolean) {
  sound.cloudRush(null);
  if (!on) {
    if (shipLeft) clearTimeout(shipLeft);
    shipLeft = null;
    shipFade?.remove();
    shipFade = null;
    return;
  }
  if (shipFade) return;
  const f = (shipFade = document.createElement("div"));
  f.className = "fade-black quick";
  document.body.appendChild(f);
  // Black as he clears the rail, which is the last of the run's ticks.
  setTimeout(() => f.classList.add("on"), Math.max(0, SHIP.railTicks * tickMs - 650));
}
/** The run is over: hold the black, then back to the menu. (The Offering, which it cuts to, is not in the build yet.) */
function shipDone() {
  if (shipLeft) return;
  shipCut(true);
  shipFade?.classList.add("on");
  shipLeft = setTimeout(() => {
    shipLeft = null;
    const f = shipFade;
    shipFade = null;
    // In Part 1's chain, nothing between it and the Offering.
    if (chainAt >= 0) chainOn();
    else leave();
    setTimeout(() => f?.classList.remove("on"), 200);
    setTimeout(() => f?.remove(), 1100);
  }, 1600);
}

/**
 * Run 9's sounds: a chime as each wisp goes into the lamp (climbing with the pips), a horn as a
 * boat lifts, the wind and one low sound as the lamps on the patch's course begin to gutter, and
 * while it is on the board the music thinned to one low note. Also takes the full-screen still down
 * when the room goes on.
 */
let patchHeard = 0;
let rescueHeard = { flew: "", lifted: 0, fill: 0, gutter: false, went: -9, told: false };
function rescueSound(r: NonNullable<StoryView["rescue"]>) {
  if (stills.fullUp && !r.hold) stills.fullOff();
  const last = r.flew?.[r.flew.length - 1], key = last ? `${last.tick}:${last.x}:${last.y}` : "";
  const fill = r.boats.reduce((a, b) => a + b, 0);
  // A restart (the boats empty again), not a pip guttering out.
  if (r.lifted < rescueHeard.lifted || (fill === 0 && rescueHeard.fill > 1)) rescueHeard = { flew: "", lifted: 0, fill: 0, gutter: false, went: -9, told: false };
  // The lamp does not keep its light: a sputter as the newest pip starts to flicker, and a small falling note as it goes.
  const gutter = r.lamp?.gutter !== undefined;
  if (gutter && !rescueHeard.gutter) sound.lampGutter();
  rescueHeard.gutter = gutter;
  // (Nothing is heard of a pip that goes out under the patch: the strip shows it, and that is all.)
  if (r.lamp?.went !== undefined && r.lamp.went !== rescueHeard.went) (rescueHeard.went = r.lamp.went), r.lamp.sat || r.lamp.dark || sound.pipOut();
  if (key && key !== rescueHeard.flew) sound.pipChime(((fill - 1) % r.perBoat + r.perBoat) % r.perBoat);
  rescueHeard.flew = key || rescueHeard.flew;
  rescueHeard.fill = fill;
  if (r.lifted > rescueHeard.lifted || (r.ending !== undefined && r.ending >= 0 && rescueHeard.lifted < r.boats.length)) sound.boatHorn(), (rescueHeard.lifted = r.ending !== undefined && r.ending >= 0 ? r.boats.length : r.lifted);
  // Told on its clock: the music thins from the first cold lamp (the low note takes over when it is on the board).
  const told = !!r.tell;
  if (told !== rescueHeard.told) {
    rescueHeard.told = told;
    if (told) sound.duckMusic(0.4, 1.5);
    else if (!r.patch) sound.duckMusic(1, 1.2);
  }
  // On the board (not in its warning, not sitting at the end): the low note.
  sound.patchDrone(!!r.patch && r.patch.warn <= 0 && !r.patch.sit && !r.hold);
  if (!r.patch || r.patch.sit) return void (patchHeard = 0);
  if (patchHeard === r.patch.n) return;
  patchHeard = r.patch.n;
  sound.lurchGroan();
  sound.wind(6);
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

/** A walk's goal line, and its "Play ...?" question with two buttons (the room waits for the answer; walking off is a no). */
let askShown = "";
function renderWalkGoal(pond: NonNullable<RoomView["story"]>["pond"] | undefined) {
  const goal = $("walk-goal");
  const text = pond?.goal && !pond.leaving && !pond.done ? pond.goal : "";
  goal.hidden = !text;
  if (goal.textContent !== text) goal.textContent = text;
  const box = $("walk-ask");
  const a = pond?.ask;
  box.hidden = !a;
  const key = a ? `${a.text}|${a.choices.join("|")}|${a.no}` : "";
  if (!a || key === askShown) return void (askShown = key);
  askShown = key;
  box.querySelector("p")!.textContent = a.text;
  const btns = box.querySelector(".btns")!;
  btns.replaceChildren();
  a.choices.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "big yes";
    b.textContent = c;
    b.onclick = () => link?.send({ t: "answer", yes: true, pick: i });
    btns.append(b);
  });
  const no = document.createElement("button");
  no.className = "ghost no";
  no.textContent = a.no;
  no.onclick = () => link?.send({ t: "answer", yes: false });
  btns.append(no);
  btns.classList.toggle("many", a.choices.length > 1);
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
  renderWalkGoal(story?.pond);
  $("score-1").classList.toggle("kes", !!story);
  $("mute").hidden = !story;
  $("call").hidden = !story?.canCall;
  // In an optional run the strip takes the middle of the top row; on a narrow screen the Send button goes under it.
  document.body.classList.toggle("opt-call", !!story?.canCall && !!story?.opt);
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
    // (An optional run counts on its own strip, which is drawn over the board.)
    if (story.dying || story.sieve || story.rescue || story.ship || story.opt) {
      $("score-0").hidden = true;
      if (story.opt) $("score-1").hidden = true;
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
  // The button always says which he is doing; a press changes it.
  const walking = p?.run === false;
  $("run").textContent = walking ? "🚶 Walking" : "🏃 Running";
  $("run2").textContent = walking ? "Walking" : "Running";
  for (const id of ["run", "run2"]) {
    $(id).classList.toggle("walking", walking);
    $(id).setAttribute("aria-label", walking ? "Walking. Press to run" : "Running. Press to walk");
  }
  const staff = $("staff");
  staff.textContent = p?.mode === "push" ? "Push" : "Pull";
  staff.classList.toggle("push", p?.mode === "push");
  $("mode").textContent = p?.mode === "push" ? "→ Pull" : "→ Push";
  if (!document.body.classList.contains("touch")) $("mode").textContent = p?.mode === "push" ? "Push" : "Pull";
  $("mode").style.display = room?.story?.opt?.noPush ? "none" : "";
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
  if (m.toggleMode && room.story?.opt?.noPush) return;
  link?.send({ t: "act", ...m });
  // Optimistic HUD for the toggles; the next tick confirms.
  const p = snap?.players.find((q) => q.id === me);
  if (p && m.toggleMode) p.mode = p.mode === "pull" ? "push" : "pull";
  if (p && m.toggleRun) p.run = !p.run;
  renderHud();
}

/** What a tap at a screen point means: a wisp (with a generous radius) or a tile to walk to. */
/** What a tap at this spot does; `tap` is false for a hover, which only asks. */
function targetAt(sx: number, sy: number, tap = false): { action: Action; wisp: number | null } | null {
  if (!snap || !room) return null;
  const t = cam.toTile(sx, sy);
  const p = snap.players.find((q) => q.id === me);
  const radius = cam.compact ? 1.3 : 0.9;
  // On a phone the focused wisp always has a finger-sized target, however far out you've zoomed.
  if (document.body.classList.contains("touch")) {
    const f = snap.wisps.find((w) => w.id === padWisp);
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
  // Focus mode: every wisp gets a finger-sized circle on screen, and the nearer centre wins.
  if (focusMode) {
    let near: { id: number; d: number } | null = null;
    for (const w of snap.wisps) {
      const c = cam.toScreen(w.x + 0.5, w.y + 0.5, 0.75);
      const d = Math.hypot(c.x - sx, c.y - sy);
      const usable = p && (p.mode === "push" || w.guild === p.guild);
      const score = d - (usable ? CONTROLS.focus.usablePx : 0);
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
    // Small things that answer (the statue, the skiff, her chair) get a finger-sized target. A house,
    // or any place more than a tile wide and deep, counts only where it is drawn: a tap on the path
    // beside it is a tap on the path (Ladi). Lamps, barrels and trees say nothing and take no taps.
    const home = shrineFor(room.shrine, room.teams), props = home.props ?? [];
    const kindAt = new Map(props.map((q) => [`${q.x},${q.y}`, q.kind]));
    const same = (q: { x: number; y: number; kind: string }, dx: number, dy: number) => kindAt.get(`${q.x + dx},${q.y + dy}`) === q.kind;
    const big = (q: { x: number; y: number; kind: string }) => (same(q, 1, 0) || same(q, -1, 0)) && (same(q, 0, 1) || same(q, 0, -1));
    const places = props.filter((q) => answersTap(q.kind) && !big(q));
    const things = [...snap.players.filter((q) => q.id !== me).map((q) => ({ at: { x: q.x, y: q.y }, h: 0.9 })), { at: pond.lantern, h: 0.3 }, ...places.map((q) => ({ at: { x: q.x, y: q.y }, h: 0.6 }))];
    for (const th of things) {
      const c = cam.toScreen(th.at.x + 0.5, th.at.y + 0.5, th.h);
      const d = Math.hypot(c.x - sx, c.y - sy);
      if (d <= Math.max(bigTapRadius(), cam.scale * 0.9) && (!hit || d < hit.d)) hit = { at: th.at, d };
    }
    if (hit) return { action: { kind: "walk", to: hit.at }, wisp: null };
    // A house or other big place, tapped on the model itself: one of its tiles, and the walk tells him which side to go to.
    const place = world?.placeAt(sx, sy);
    const on = place === "house" ? home.house && { x: home.house.x + Math.floor(home.house.w / 2), y: home.house.y + Math.floor(home.house.h / 2) } : place ? props.find((q) => q.kind === place) : null;
    if (on) return { action: { kind: "walk", to: { x: on.x, y: on.y } }, wisp: null };
  }
  // Run 10: a tap on the ferryman (about his middle) does not walk Rook anywhere; it is answered, and he does not turn.
  const ferry = ferryAt();
  if (ferry) {
    const c = cam.toScreen(ferry.x, ferry.y, 0.9);
    if (Math.hypot(c.x - sx, c.y - sy) <= Math.max(bigTapRadius(), cam.scale * 0.8)) return tap && ferryTold(), null;
  }
  const tile: Pt = { x: Math.floor(t.x), y: Math.floor(t.y) };
  const board = shrineFor(room.shrine, room.teams).board;
  if (!board.inside(tile)) return null;
  // A tap on a wall or pool still walks as close to it as the path allows.
  return { action: { kind: "walk", to: tile }, wisp: null };
}

/** Radius in CSS pixels of the focused wisp's tap target: a 56 px circle, above the 44-48 px minimum. */
const FOCUS_TAP_PX = 28;

/** Focus mode: every wisp has a large, ringed target. O on a keyboard, a long press on Next on a phone. It lasts the session. */
let focusMode = false;
/** On a phone: Next has become the Focus button (a long press on it changes it, and changes it back). */
let focusBtn = false;
function setFocusMode(on: boolean) {
  focusMode = on;
  if (on && document.body.classList.contains("touch")) focusBtn = true;
  if (on) markHint("focus");
  renderFocusBtn();
  toast(on ? "Focus mode on" : "Focus mode off");
}
const FOCUS_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="4.6 3.6" stroke-linecap="round"/><circle class="dot" cx="16" cy="16" r="5"/></svg><span>Focus</span>`;
function renderFocusBtn() {
  const b = $("next");
  b.classList.toggle("focus", focusBtn);
  b.classList.toggle("off", focusBtn && !focusMode);
  // The focus button's icon is the ring focus mode draws round each wisp, with a wisp in it: lit when it is on, hollow when off.
  const face = focusBtn ? "focus" : "next";
  if (b.dataset.face !== face) {
    b.dataset.face = face;
    if (focusBtn) b.innerHTML = FOCUS_ICON;
    else b.textContent = "Next";
  }
  b.setAttribute("aria-label", focusBtn ? `Focus mode ${focusMode ? "on" : "off"}. Hold for Next` : "Next wisp. Hold for focus mode");
}
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
  const t = targetAt(x, y, true);
  if (t) {
    noteTap(t.wisp, x, y);
    act({ action: t.action });
  }
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
  if (k === "o") setFocusMode(!focusMode);
  else if (k === "q") act({ toggleMode: true });
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
  const c = padChoices();
  if (!c.some((w) => w.id === padWisp)) padWisp = c[0]?.id ?? null;
  return padWisp;
}

// A long press on Next makes it the Focus button, with focus mode on; a long press on that gives Next back.
let nextHold = 0;
let nextLong = false;
const nextBtn = $("next");
nextBtn.addEventListener("pointerdown", () => {
  nextLong = false;
  clearTimeout(nextHold);
  nextHold = window.setTimeout(() => {
    nextLong = true;
    focusBtn = !focusBtn;
    navigator.vibrate?.(30);
    setFocusMode(focusBtn);
  }, CONTROLS.focus.holdMs);
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) nextBtn.addEventListener(ev, () => clearTimeout(nextHold));
nextBtn.addEventListener("contextmenu", (e) => e.preventDefault());
$("next").onclick = () => {
  // The click that ends a long press doesn't also count as a tap.
  if (nextLong) return void (nextLong = false);
  // As the Focus button, a tap switches focus mode off and on.
  if (focusBtn) return setFocusMode(!focusMode);
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
$("story9").onclick = () => connectStory(playerName(), 9);
$("story10").onclick = () => connectStory(playerName(), 10);
$("story-o1").onclick = () => connectStory(playerName(), "o1");
$("story-o2").onclick = () => connectStory(playerName(), "o2");
$("story-o3c").onclick = () => connectStory(playerName(), "o3c");
$("story-o3b").onclick = () => connectStory(playerName(), "o3b");
$("story-o3a").onclick = () => connectStory(playerName(), "o3a");
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
  if (p.next >= 1 && p.next <= 10) return connectStory(playerName(), (p.next === 7 ? 6 : p.next) as 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10);
  // What comes after run 10 isn't built: the latest walk reached.
  connectStory(playerName(), "pond", Math.max(1, p.walk));
};
// ------------------------------------------------------------------ Part 1, played through

/** The piece of Part 1 on screen (its index in PART1), or -1 outside the chain. */
let chainAt = -1;
/** An optional run opened from a walk or a walk's card: the piece to come back to. */
let chainBack: number | null = null;
/** The walk's hand-on and optional asks already acted on. */
let chainDone = false;
let chainOptN = 0;

/** Open a piece of Part 1: a run, a walk, or a card for what is not built yet. */
function playPiece(i: number) {
  const p = PART1[i];
  if (!p) return leave();
  if (link) leave(true);
  chainAt = i;
  chainBack = null;
  chainDone = false;
  chainOptN = 0;
  savePlace(i);
  renderPart1();
  $("chain-card").hidden = true;
  if (p.kind === "card") return p.scene === "kitchen" ? kitchenScene(p) : p.scene === "supper" ? supperScene(p) : p.scene === "evening" ? eveningScene(p) : p.scene === "glow" ? glowScene(p) : p.scene === "dream" ? dreamScene(p) : p.scene === "held" && HELD[p.id] ? heldScene(p) : chainCard(p);
  if (p.kind === "walk") return connectStory(playerName(), "pond", p.walk);
  connectStory(playerName(), p.run!);
}

/** On to the next piece. */
function chainOn() {
  playPiece(chainAt + 1);
}

/** Back from an optional run to the piece it was opened from. */
function chainReturn() {
  const i = chainBack ?? chainAt;
  playPiece(i);
}

/** What the results card's main button does in the chain (null outside it). */
function chainAgainLabel(): string | null {
  if (chainAt < 0) return null;
  if (chainBack !== null) return "Back to the walk";
  // Run 2 not won: it is played again (won, it goes on into the walk by itself).
  if (room?.story?.run === "Lumi's lesson") return "Try again";
  return "Continue";
}

/** Keeps the saved place with what is on screen (a walk starts its run, run 2 goes on into walk 1), and acts on a walk's last tap and its optional asks. */
function chainWatch() {
  if (chainAt < 0 || chainBack !== null) return;
  const st = room?.story;
  if (!st) return;
  const pond = st.pond;
  if (pond?.walk) {
    const i = pieceOfWalk(pond.walk);
    if (i >= 0 && i !== chainAt) (chainAt = i), (chainDone = false), (chainOptN = 0), savePlace(i), renderPart1();
    if (pond.done && !chainDone) {
      chainDone = true;
      // After walk 7 a night passes, shown, before the next morning's walk opens under it.
      if (WALKS.find((w) => w.n === pond.walk)?.night) nightPass(() => chainAt >= 0 && chainOn());
      else window.setTimeout(() => chainAt >= 0 && chainOn(), 1400);
    }
    if (pond.optional && pond.optional.n > chainOptN) {
      chainOptN = pond.optional.n;
      const id = pond.optional.id as "o1";
      window.setTimeout(() => chainOptional(id), 1200);
    }
    return;
  }
  const i = st.run ? pieceOfRun(st.run) : -1;
  if (i >= 0 && i !== chainAt) (chainAt = i), savePlace(i), renderPart1();
}

/**
 * A night going by, over the screen (Ladi, 26 Nov: "a quick transition to show a day passed"): the
 * sunset goes to night, a moon crosses under the stars, and first light comes up. What comes next is
 * opened under it halfway (`then`), and the night lifts off it.
 */
const NIGHT = { open: 1400, total: 3800, lift: 700 };
function nightPass(then: () => void) {
  const el = document.createElement("div");
  el.id = "night-pass";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="stars"></div><div class="moon"></div><div class="dawn"></div>`;
  document.body.appendChild(el);
  window.setTimeout(then, NIGHT.open);
  window.setTimeout(() => el.classList.add("out"), NIGHT.total);
  window.setTimeout(() => el.remove(), NIGHT.total + NIGHT.lift);
}

/** An optional run, from a walk or its card: it comes back to the same piece. */
function chainOptional(id: "o1" | "o2" | "o3a" | "o3b" | "o3c") {
  const back = chainAt;
  if (link) leave(true);
  chainAt = back;
  chainBack = back;
  $("chain-card").hidden = true;
  connectStory(playerName(), id);
}

/** A card for a piece that is not built: its heading, what it will be, how much is ruled, and Continue. */
function chainCard(p: Piece) {
  const c = p.card!, el = $("chain-card");
  const opts = c.optional
    ? `<div class="opts"><b>Offered here (until Maudie's tap):</b>${OPTIONAL_RUNS.map((o) => `<button class="ghost opt" data-id="${o.id}">${esc(o.label)} <span class="soon">${esc(o.who)}</span></button>`).join("")}</div>`
    : "";
  el.innerHTML = `<div class="card"><div class="tags"><span class="nb">Not built yet</span><span>Draft</span><span>Part 1, ${esc(p.id)}</span></div><h2>${esc(c.heading)}</h2><p>${esc(c.summary)}</p><p class="ruled">${esc(c.ruled)}</p>${opts}<div class="btns"><button class="big go">${c.end ? "End of Part 1" : "Continue"}</button><button class="ghost out">Leave</button></div></div>`;
  el.hidden = false;
  el.querySelector<HTMLButtonElement>(".go")!.onclick = () => {
    if (!c.end) return chainOn();
    el.hidden = true;
    leave();
  };
  el.querySelector<HTMLButtonElement>(".out")!.onclick = () => {
    el.hidden = true;
    leave();
  };
  el.querySelectorAll<HTMLButtonElement>(".opt").forEach((b) => (b.onclick = () => chainOptional(b.dataset.id as "o1")));
}

/** Set by the kitchen scene as it hands on, so run 2 does not open on the lantern a second time. */
let lanternShown = false;
/** One caption line of a gap scene: who says it (faces and names) and the words, spoken by each. */
function sceneLine(el: HTMLElement, line: { who: string[]; text: string }, quiet = false) {
  const faces = line.who.map((w) => faceHtml({ who: w, text: line.text })).join("");
  el.innerHTML = `<span class="who">${faces}<b>${esc(line.who.join(" and "))}</b></span><span>${esc(line.text)}</span>`;
  el.classList.add("on");
  if (!quiet) line.who.forEach((w, i) => sound.speak(w, line.text, false, i > 0));
}

/**
 * Gap 1-2, the morning after run 1, as its pictures (MORNING in client/part1.ts): Lumi's lantern on the
 * table (run 2's opening picture, shown here in its place), then the kitchen pictures one after another,
 * the first with Rook's and Lumi's two lines, no taps, then run 2 (which skips its own lantern).
 */
function kitchenScene(p: Piece) {
  const M = MORNING;
  const el = document.createElement("div");
  el.id = "gap-scene";
  el.className = "morning";
  el.innerHTML = `<p class="creed" aria-live="polite"></p><button class="ghost small out" aria-label="Leave">✕</button>`;
  const pics = M.pictures.map((m) => storyCard(m.slot, "pic"));
  el.prepend(...pics);
  const timers: number[] = [];
  const at = (sec: number, f: () => void) => timers.push(window.setTimeout(f, sec * 1000));
  let left = false;
  const here = () => !left && chainAt === pieceIndex(p.id);
  const caption = el.querySelector<HTMLElement>(".creed")!;
  lanternCard(() => {
    if (!here()) return;
    // The lantern fades off the first kitchen picture, already up underneath it.
    document.body.appendChild(el);
    el.classList.add("on", "now");
    pics[0]!.classList.add("on");
    // Nothing is said until the lantern has gone.
    let t = ENDING.lantern.fade;
    M.pictures.forEach((m, i) => {
      if (i > 0) at(t, () => (pics[i - 1]!.classList.remove("on"), pics[i]!.classList.add("on")));
      t += i > 0 ? M.fade : 0;
      for (const line of m.lines ?? []) {
        at(t + M.gap, () => sceneLine(caption, line));
        at(t + M.gap + M.line, () => caption.classList.remove("on"));
        t += M.gap + M.line;
      }
      t += m.hold;
    });
    at(t, () => el.classList.add("out"));
    at(t + M.fade, () => {
      if (!here()) return el.remove();
      lanternShown = true;
      chainOn();
      let n = 0;
      const out = () => {
        if (++n < 3) return void requestAnimationFrame(out);
        el.classList.remove("on");
        window.setTimeout(() => el.remove(), 700);
      };
      requestAnimationFrame(out);
    });
  });
  el.querySelector<HTMLButtonElement>(".out")!.onclick = () => {
    left = true;
    timers.forEach((x) => clearTimeout(x));
    el.remove();
    leave();
  };
}

/**
 * Gap 3-4's evening: its two pictures cross-fading, the two lines as captions with faces and voices,
 * no taps, then on to walk 2 (the morning walk's styles). Marked draft: nothing in it is Ladi's yet.
 */
function eveningScene(p: Piece) {
  const M = EVENING, el = document.createElement("div");
  el.id = "gap-scene";
  el.className = "morning";
  el.innerHTML = `<div class="tags"><span class="nb">Draft</span><span>Scene and pictures not ruled by Ladi</span></div><p class="creed" aria-live="polite"></p><button class="ghost small out" aria-label="Leave">✕</button>`;
  const pics = M.pictures.map((m) => storyCard(m.slot, "pic"));
  el.prepend(...pics);
  document.body.appendChild(el);
  const timers: number[] = [];
  const at = (sec: number, f: () => void) => timers.push(window.setTimeout(f, sec * 1000));
  const here = () => chainAt === pieceIndex(p.id);
  const caption = el.querySelector<HTMLElement>(".creed")!;
  requestAnimationFrame(() => requestAnimationFrame(() => (el.classList.add("on"), pics[0]!.classList.add("on"))));
  let t = M.fade + M.lead;
  M.pictures.forEach((m, i) => {
    if (i > 0) at(t, () => (pics[i - 1]!.classList.remove("on"), pics[i]!.classList.add("on")));
    t += i > 0 ? M.fade : 0;
    for (const line of m.lines ?? []) {
      at(t + M.gap, () => sceneLine(caption, line));
      at(t + M.gap + M.line, () => caption.classList.remove("on"));
      t += M.gap + M.line;
    }
    t += m.hold;
  });
  at(t, () => el.classList.add("out"));
  at(t + M.fade, () => {
    if (!here()) return el.remove();
    chainOn();
    window.setTimeout(() => (el.classList.remove("on"), window.setTimeout(() => el.remove(), 700)), 100);
  });
  el.querySelector<HTMLButtonElement>(".out")!.onclick = () => {
    timers.forEach((x) => clearTimeout(x));
    el.remove();
    leave();
  };
}

/**
 * A scene that is only held pictures (HELD in client/part1.ts, by piece id): each cross-fades in, its
 * lines as captions with faces and voices, no taps, then on. Tagged with what Ladi has not seen.
 */
function heldScene(p: Piece) {
  const H = HELD[p.id]!, el = document.createElement("div");
  el.id = "gap-scene";
  el.className = H.shape ? `morning ${H.shape}` : "morning";
  el.innerHTML = `<div class="tags"><span class="nb">Draft</span><span>${esc(H.tag)}</span></div><p class="creed" aria-live="polite"></p><button class="ghost small out" aria-label="Leave">✕</button>`;
  const pics = H.pictures.map((m) => storyCard(m.slot, "pic"));
  el.prepend(...pics);
  document.body.appendChild(el);
  const timers: number[] = [];
  const at = (sec: number, f: () => void) => timers.push(window.setTimeout(f, sec * 1000));
  const here = () => chainAt === pieceIndex(p.id);
  const caption = el.querySelector<HTMLElement>(".creed")!;
  // A shaking picture: its layer flicked between nothing and about 60 percent, a few pixels off, every
  // 90 to 120 ms, while it is up (none with reduced motion).
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let shaking = 0;
  const shake = (i: number) => {
    window.clearTimeout(shaking);
    const m = H.pictures[i]!;
    if (!m.shake || still) return;
    const layer = storyCard(m.shake, "glow shake");
    pics[i]!.appendChild(layer);
    const flick = () => {
      if (!pics[i]!.classList.contains("on")) return layer.remove();
      const on = Math.random() < 0.6;
      layer.style.opacity = on ? String(0.35 + Math.random() * 0.25) : "0";
      layer.style.transform = on ? `translate(${(Math.random() < 0.5 ? -1 : 1) * (2 + Math.random())}px, ${(Math.random() - 0.5) * 2}px)` : "";
      shaking = window.setTimeout(flick, 90 + Math.random() * 30);
    };
    flick();
  };
  const show = (i: number) => {
    const m = H.pictures[i]!;
    if (m.fade) for (const x of [pics[i - 1]!, pics[i]!]) x.style.transitionDuration = `${m.fade}s`;
    if (m.cut) for (const x of [pics[i - 1]!, pics[i]!]) x.style.transition = "none";
    pics[i - 1]?.classList.remove("on");
    pics[i]!.classList.add("on");
    if (m.cut) requestAnimationFrame(() => requestAnimationFrame(() => [pics[i - 1]!, pics[i]!].forEach((x) => (x.style.transition = ""))));
    if (m.hush) sound.fallsBedOff();
    shake(i);
  };
  if (H.bed === "falls") sound.fallsBed();
  requestAnimationFrame(() => requestAnimationFrame(() => (el.classList.add("on"), show(0))));
  let t = H.fade + H.lead;
  H.pictures.forEach((m, i) => {
    if (i > 0) at(t, () => show(i));
    t += i > 0 && !m.cut ? m.fade ?? H.fade : 0;
    for (const line of m.lines ?? []) {
      // Long enough to read, and to hear its clip out.
      const len = Math.max(H.line, line.text.length * 0.055, (VOICE_SECONDS[`${line.who[0]}|${line.text}`] ?? 0) + 0.5);
      at(t + H.gap, () => sceneLine(caption, line, line.quiet));
      at(t + H.gap + len, () => caption.classList.remove("on"));
      t += H.gap + len;
    }
    t += m.hold;
  });
  at(t, () => el.classList.add("out"));
  at(t + H.fade, () => {
    sound.fallsBedOff(1);
    if (!here()) return el.remove();
    window.clearTimeout(shaking);
    // The end of Part 1: its name on the black, then the menu.
    if (p.card?.end) {
      caption.classList.remove("stay");
      caption.innerHTML = `<span>End of Part 1</span>`;
      caption.classList.add("on", "fin");
      at(3.5, () => caption.classList.remove("on"));
      at(4.3, () => (el.remove(), leave()));
      return;
    }
    chainOn();
    window.setTimeout(() => (el.classList.remove("on"), window.setTimeout(() => el.remove(), 700)), 100);
  });
  el.querySelector<HTMLButtonElement>(".out")!.onclick = () => {
    timers.forEach((x) => clearTimeout(x));
    sound.fallsBedOff(0.3);
    el.remove();
    leave();
  };
}

/**
 * Before run 1, the dream (DREAM in client/part1.ts): seven pictures cross-fading, the last going to
 * white, then a cut to Lumi over him with the game's first line, then run 1. Tagged: every picture is
 * the cutscene thread's pick, not seen by Ladi as a final.
 */
function dreamScene(p: Piece) {
  const D = DREAM, el = document.createElement("div");
  el.id = "gap-scene";
  el.className = "morning four3";
  el.innerHTML = `<div class="tags"><span class="nb">Draft</span><span>Pictures not seen by Ladi</span></div><div class="white"></div><p class="creed" aria-live="polite"></p><button class="ghost small out" aria-label="Leave">✕</button>`;
  const pics = D.pictures.map((m) => storyCard(m.slot, "pic"));
  const wake = storyCard(D.wake.slot, "pic wake");
  el.prepend(...pics, wake);
  document.body.appendChild(el);
  const white = el.querySelector<HTMLElement>(".white")!;
  white.style.transitionDuration = `${D.white}s`;
  const timers: number[] = [];
  const at = (sec: number, f: () => void) => timers.push(window.setTimeout(f, sec * 1000));
  const here = () => chainAt === pieceIndex(p.id);
  const caption = el.querySelector<HTMLElement>(".creed")!;
  requestAnimationFrame(() => requestAnimationFrame(() => (el.classList.add("on"), pics[0]!.classList.add("on"))));
  let t = D.fade;
  D.pictures.forEach((m, i) => {
    if (i > 0) at(t, () => (pics[i - 1]!.classList.remove("on"), pics[i]!.classList.add("on")));
    t += (i > 0 ? D.fade : 0) + m.hold;
  });
  at(t, () => white.classList.add("on"));
  t += D.white + D.whiteHold;
  // The cut from white: no fade on the way in, and the white is gone at once.
  at(t, () => {
    pics.forEach((x) => x.classList.remove("on"));
    for (const x of [wake, white]) x.style.transition = "none";
    wake.classList.add("on");
    white.classList.remove("on");
  });
  at(t + D.wake.lead, () => sceneLine(caption, D.wake.line));
  t += Math.max(D.wake.hold, D.wake.lead + 2.5);
  at(t - 0.6, () => caption.classList.remove("on"));
  at(t, () => ((wake.style.transition = ""), el.classList.add("out")));
  at(t + D.fade, () => {
    if (!here()) return el.remove();
    chainOn();
    window.setTimeout(() => (el.classList.remove("on"), window.setTimeout(() => el.remove(), 700)), 100);
  });
  el.querySelector<HTMLButtonElement>(".out")!.onclick = () => {
    timers.forEach((x) => clearTimeout(x));
    el.remove();
    leave();
  };
}

/**
 * Gap 5-6's glow test (GLOW in client/part1.ts): seven wide pictures, the lights faded in over the
 * picture under them (a screen blend, as the painter built them), Mabry's unvoiced captions over the
 * first two, then the silence, one clap from off frame, and out to run 6. Tagged: picture 5 and the
 * captions are not seen by Ladi.
 */
function glowScene(p: Piece) {
  const G = GLOW, el = document.createElement("div");
  el.id = "gap-scene";
  el.className = "morning wide";
  el.innerHTML = `<div class="tags"><span class="nb">Draft</span><span>Picture 5 (Rook) and Mabry's lines not seen by Ladi</span></div><p class="creed" aria-live="polite"></p><button class="ghost small out" aria-label="Leave">✕</button>`;
  const pics = G.pictures.map((m) => {
    const c = storyCard(m.slot, m.over ? "pic layer" : "pic");
    if (m.layer) c.style.transitionDuration = `${m.layer}s`;
    return c;
  });
  el.prepend(...pics);
  document.body.appendChild(el);
  const timers: number[] = [];
  const at = (sec: number, f: () => void) => timers.push(window.setTimeout(f, sec * 1000));
  const here = () => chainAt === pieceIndex(p.id);
  const caption = el.querySelector<HTMLElement>(".creed")!;
  let shown: HTMLElement[] = [];
  const show = (i: number) => {
    const m = G.pictures[i]!, c = pics[i]!;
    if (m.over) return (c.classList.add("on"), shown.push(c));
    if (m.cut) {
      // A hard cut: no fade either way, then the fades come back for whatever follows.
      for (const x of [...shown, c]) x.style.transition = "none";
      shown.forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
      const was = shown;
      requestAnimationFrame(() => requestAnimationFrame(() => [...was, c].forEach((x) => (x.style.transition = ""))));
    } else {
      shown.forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
    }
    shown = [c];
  };
  requestAnimationFrame(() => requestAnimationFrame(() => (el.classList.add("on"), show(0))));
  let t = 0.8;
  G.pictures.forEach((m, i) => {
    if (i > 0) at(t, () => show(i));
    t += i === 0 || m.cut ? 0 : m.layer ?? G.fade;
    let said = 0;
    for (const line of m.lines ?? []) {
      at(t + said + G.gap, () => sceneLine(caption, line, true));
      at(t + said + G.gap + G.line, () => caption.classList.remove("on"));
      said += G.gap + G.line;
    }
    t += Math.max(m.hold, said + G.gap);
  });
  at(t, () => sound.clap());
  t += G.clapTail;
  at(t, () => (el.classList.add("out"), sceneLine(caption, G.last, true), caption.classList.add("stay")));
  at(t + G.out + G.line * 0.6, () => caption.classList.remove("on", "stay"));
  at(t + G.out + G.line * 0.6 + 0.7, () => {
    if (!here()) return el.remove();
    chainOn();
    window.setTimeout(() => (el.classList.remove("on"), window.setTimeout(() => el.remove(), 700)), 100);
  });
  el.querySelector<HTMLButtonElement>(".out")!.onclick = () => {
    timers.forEach((x) => clearTimeout(x));
    el.remove();
    leave();
  };
}

/**
 * Gap 7-8's supper as its picture: Lumi's glow drawn over it and breathing slowly (a screen blend,
 * which matches the painter's baked picture at full strength), the creed one line at a time as
 * captions with who says it and their voices, no taps, then on to walk 4.
 */
function supperScene(p: Piece) {
  const S = SUPPER, el = document.createElement("div");
  el.id = "gap-scene";
  el.className = "supper";
  el.style.setProperty("--glow-low", String(S.glow.low));
  el.style.setProperty("--glow-rise", `${S.glow.rise}s`);
  el.innerHTML = `<div class="tags"><span class="nb">Draft</span><span>Who says each line</span></div><p class="creed" aria-live="polite"></p><button class="ghost small out" aria-label="Leave">✕</button>`;
  const pic = storyCard("supper", "pic");
  pic.appendChild(storyCard("supper-glow", "glow"));
  el.prepend(pic);
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on")));
  const creed = el.querySelector<HTMLElement>(".creed")!;
  const timers: number[] = [];
  const at = (sec: number, f: () => void) => timers.push(window.setTimeout(f, sec * 1000));
  let t = S.fade + S.lead;
  for (const line of S.creed) {
    // Each line with its speaker's face and name, like any other line; the last has both.
    at(t, () => sceneLine(creed, line));
    at(t + S.line, () => creed.classList.remove("on"));
    t += S.line + S.gap;
  }
  // The picture goes to black (the scene stays up, so the menu never shows), then the walk comes up under it.
  at(t + S.tail, () => el.classList.add("out"));
  at(t + S.tail + S.fade, () => {
    if (chainAt !== pieceIndex(p.id)) return el.remove();
    chainOn();
    let n = 0;
    const out = () => {
      if (++n < 3) return void requestAnimationFrame(out);
      el.classList.remove("on");
      window.setTimeout(() => el.remove(), 700);
    };
    requestAnimationFrame(out);
  });
  el.querySelector<HTMLButtonElement>(".out")!.onclick = () => {
    timers.forEach((x) => clearTimeout(x));
    el.remove();
    leave();
  };
}

/** The menu's Part 1 buttons: Play, or Continue with the piece's name, and Start again. */
function renderPart1() {
  const at = loadPlace();
  $("part1").textContent = at < 0 ? "Play Part 1" : `Continue Part 1: ${PART1[at]!.name}`;
  $("part1-again").hidden = at < 0;
  // Once Part 1 is under way, a run's own button waits until the story has reached it (the testing
  // panel's box shows them all).
  const far = loadFar(), all = $<HTMLInputElement>("show-runs").checked;
  for (const r of MENU_RUNS) $(r.button).hidden = !all && far >= 0 && pieceIndex(r.piece) > far;
}
{
  const box = $<HTMLInputElement>("show-runs");
  const KEY = "lanternfall.showRuns";
  try {
    box.checked = localStorage.getItem(KEY) === "1";
  } catch {}
  box.onchange = () => {
    try {
      localStorage.setItem(KEY, box.checked ? "1" : "0");
    } catch {}
    renderPart1();
  };
}
$("part1").onclick = () => playPiece(Math.max(0, loadPlace()));
$("part1-again").onclick = () => playPiece(0);
renderPart1();
// The testing panel: every option the address can carry, as controls (client/testing.ts).
buildTesting((id) => playPiece(pieceIndex(id)));
{
  // ?part1=<piece>: straight into Part 1 at that piece (its id in client/part1.ts, such as 5-6 or 9-10).
  const at = new URLSearchParams(location.search).get("part1");
  if (at !== null && pieceIndex(at) >= 0) window.setTimeout(() => playPiece(pieceIndex(at)), 0);
}

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
// (The ending's cut and walking round water are in the testing panel's table, client/testing.ts.)
$("progress-reset").onclick = () => {
  resetProgress();
  resetOpts();
  resetHints();
  savePlace(-1);
  renderPart1();
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
$("again").onclick = () => {
  const how = chainAgainLabel();
  if (how === "Continue") return chainOn();
  if (how === "Back to the walk") return chainReturn();
  link?.send({ t: "lobby" });
};
$("leave").onclick = () => leave();
$("leave2").onclick = () => leave();
$("leave3").onclick = () => leave();
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
      // Run 9: once the last lamp is full the eye goes to the boat in the slip, and stays on it.
      const boat = room.story?.rescue?.ending !== undefined ? shrine.board.center : null;
      const tx = (boat ? boat.x : mine.px + (mine.x - mine.px) * t) + 0.5 + stills.shove.x;
      let ty = (boat ? boat.y - 1 : mine.py + (mine.y - mine.py) * t) + 0.5 + stills.shove.y;
      // Run 10: the eye sits a little ahead of him, and at the end goes forward as far as it can with him still in the picture, so home is seen.
      const ship = room.story?.ship;
      if (ship) {
        const ahead = ty - SHIP.phoneAhead;
        const k = Math.min(1, Math.max(0, ship.home * 2.5)), e = k * k * (3 - 2 * k);
        const bowEye = shrine.board.center.y - SHIP_DECK.hl - 8, half = cam.h / cam.scale / 2;
        ty = ahead + (Math.min(ahead, Math.max(bowEye, ty - (half - 3))) - ahead) * e;
      }
      cam.cx += (tx - cam.cx) * 0.2;
      cam.cy += (ty - cam.cy) * 0.2;
    } else {
      const fr = shrine.board.frame;
      cam.cx = (fr ? fr.x + fr.w / 2 : shrine.board.width / 2) + stills.shove.x;
      // Runs 6 and 7: a little north, so Hesta's terrace and the village on it are in the picture.
      cam.cy = (fr ? fr.y + fr.h / 2 : shrine.board.height / 2) + 0.5 + stills.shove.y - (room.story?.dying ? DYING.terrace.viewNorth : 0);
    }
  }
  cam.clamp(shrine.board);
  const flames = new Map<number, Flame>(room.players.map((p) => [p.id, p.flame]));
  const mark = room.story?.mark?.wisp ?? null;
  if (mark !== null && mark !== lastMark && document.body.classList.contains("touch")) {
    padWisp = mark;
  }
  lastMark = mark;
  const lit = document.body.classList.contains("touch") ? padTarget() : hoverWisp;
  if (document.body.classList.contains("touch")) {
    const p = snap.players.find((q) => q.id === me);
    const w = snap.wisps.find((q) => q.id === lit);
    const ship = room?.story?.ship, c = shrine.board.center;
    const reach = p?.mode === "push" || !ship ? (p?.mode === "push" ? PUSH_REACH : room?.story?.opt?.reach ?? PULL_REACH) : ship.reach;
    const near = !!p && !!w && (ship && p.mode !== "push" ? shipReach(p.x - c.x, p.y - c.y, w.x - c.x, w.y - c.y, reach) : Math.max(Math.abs(w.x - p.x), Math.abs(w.y - p.y)) <= reach);
    $("staff").classList.toggle("far", !near);
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
  const st: DrawState = { shrine, prev: drawPrev, snap: drawSnap, t, me, flames, cast: castOf(), hoverWisp: lit, now, watchers: (lastWatchers = watchersFor(shrine.board)), staticOn: staticCut && now < staticCut.until ? staticCut.player : undefined, steps: stepsFor(shrine.board), lantern: room?.story?.pond?.lantern, light: room?.story?.pond?.light, dying: room?.story?.dying, sieve: room?.story?.sieve, rescue: room?.story?.rescue, opt: room?.story?.opt, ship: room?.story?.ship, walk: room?.story?.pond?.walk, looks: room?.story?.pond?.looks };
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
  if (focusMode) drawBigTaps(g, mine?.mode === "push", mine?.guild, lit, t, now);
  hintsFrame(now);
  drawTide(g, shrine, now);
  if (room.story) drawStory(g, t, now);
  releaseBarks(now);
  // On a phone the still's band lies over the minimap: it fades out while one is up.
  // And in run 10's last seconds, when home comes in where it lies.
  miniAlpha += ((stills.up || (room.story?.ship?.home ?? 0) > 0 ? 0 : 1) - miniAlpha) * 0.15;
  if (cam.compact && !ending && miniAlpha > 0.02) {
    // As wide as this, and a board taller than it is wide gets up to half as tall again.
    const side = Math.min(120, cam.w * 0.3), mb = shrine.board, mk = Math.min(side / mb.width, (side * 1.5) / mb.height);
    const w = mk * mb.width;
    minimapRect = { x: cam.w - w - 10, y: 64, w, h: mk * mb.height };
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
/** Run 10: where the ferryman stands in the prow, in board tiles (the middle of him, not a tile's corner). */
function ferryAt(): { x: number; y: number } | null {
  if (!room?.story?.ship) return null;
  const c = shrineFor(room.shrine, room.teams).board.center;
  return { x: c.x + 0.5 + SHIP.figure[0], y: c.y + 0.5 + SHIP.figure[1] };
}

/** A tap on the ferryman: he keeps his back to us and says nothing; a line of narration sits over him instead (Ladi, 26 Nov). */
function ferryTold() {
  const el = $("bark");
  el.className = "bark tell";
  el.querySelector("img")!.hidden = true;
  el.querySelector("span")!.innerHTML = lineHtml(SHIP.ferryTap);
  el.hidden = false;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  barks.bark = { el, until: performance.now() + 3200, speaker: "the ferryman" };
}

function speakerAt(who: string): { x: number; y: number; h: number } | null {
  const cast = who.toLowerCase();
  if (cast === "the ferryman") {
    const f = ferryAt();
    return f && { ...f, h: 2.1 * (CAST_SCALE.ferryman ?? 1) };
  }
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
    const who = ["rook", "lumi", "wick", "moth", "kes", "hesta", "nell", "sefa", "maudie", "mabry", "orrin"].find((n) => name.startsWith(n));
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

/** Focus mode: a dashed ring around each wisp showing its tap target. Ones your staff can work now are bright; the hovered one is solid. */
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

// ------------------------------------------------------------------ control hints
// One line of help at a time, with the button it is about pulsing. Play never stops for one.

type HintId = "focus" | "run" | "walking" | "rescue";
let hintUp: { id: HintId; until: number; btn: HTMLElement | null } | null = null;
let lastHintAt = -1e9;
/** This run: when he started walking, whether he has been reminded, the misses in a row, and whether the focus hint has come back. */
let runHints = { walkSince: 0, reminded: false, misses: 0, rescued: false };

function showHint(id: HintId, text: string, btn: HTMLElement | null) {
  const now = performance.now();
  if (hintUp || now - lastHintAt < CONTROLS.hints.gapMs) return false;
  const el = $("tip");
  el.textContent = text;
  el.hidden = false;
  btn?.classList.add("nudge");
  hintUp = { id, until: now + CONTROLS.hints.showMs, btn };
  return true;
}
function hideHint() {
  if (!hintUp) return;
  hintUp.btn?.classList.remove("nudge");
  $("tip").hidden = true;
  lastHintAt = performance.now();
  hintUp = null;
}
const focusHintText = (touch: boolean) => (touch ? "Wisps hard to tap? Hold Next for focus mode." : "Wisps hard to click? Press O for focus mode.");

function hintsFrame(now: number) {
  const touch = document.body.classList.contains("touch");
  const p = snap?.players.find((q) => q.id === me);
  const playing = room?.phase === "playing";
  // A hint goes when its time is up, or when he has done the thing.
  if (hintUp) {
    const done = hintUp.id === "run" ? p?.run === false : hintUp.id === "walking" ? p?.run !== false : focusMode;
    if (now >= hintUp.until || !playing || done) hideHint();
  }
  if (!playing || !p || !snap) return;
  const st = room!.story, runBtn = touch ? $("run2") : $("run");
  if (storyRoom instanceof StoryRoom && st) {
    // Run 1, as soon as there are wisps to pull: how to get bigger targets.
    if (st.movement === 0 && !hintSeen("focus") && !focusMode && $("dialog").hidden && snap.wisps.some((w) => w.guild === p.guild && w.rim === 0)) {
      if (showHint("focus", focusHintText(touch), touch ? $("next") : null)) markHint("focus");
    }
    // Run 1's coordination part, where he holds a side: walking is for exact spots.
    if (st.movement === 1 && !hintSeen("run")) {
      if (p.run === false) markHint("run");
      else if (showHint("run", touch ? "Need an exact spot? Tap Running to walk." : "Need an exact spot? Press R to walk.", runBtn)) markHint("run");
    }
  }
  // The runs against a clock: left on Walk, he is told once.
  const timed = storyRoom instanceof RaceRoom || storyRoom instanceof DyingRoom || storyRoom instanceof RescueRoom || storyRoom instanceof ShipRoom;
  if (timed && p.run === false) {
    if (!runHints.walkSince) runHints.walkSince = now;
    else if (!runHints.reminded && now - runHints.walkSince >= CONTROLS.hints.walkAfterMs && showHint("walking", touch ? "Walking. Tap to run." : "Walking. Press R to run.", runBtn)) runHints.reminded = true;
  } else runHints.walkSince = 0;
}

/** A tap on the board: on a wisp, or not. Misses close to a wisp, three in a row, bring the focus hint back once a run. */
function noteTap(wisp: number | null, sx: number, sy: number) {
  if (wisp !== null) {
    runHints.misses = 0;
    // In focus mode Next no longer steps through them, so a tapped wisp is the one the Staff button works.
    if (focusMode) padWisp = wisp;
    return;
  }
  if (!snap) return;
  const at = cam.toTile(sx, sy);
  const near = snap.wisps.some((w) => Math.hypot(w.x + 0.5 - at.x, w.y + 0.5 - at.y) <= CONTROLS.hints.missTiles);
  runHints.misses = near ? runHints.misses + 1 : 0;
  if (runHints.misses < CONTROLS.hints.misses || runHints.rescued || focusMode) return;
  const touch = document.body.classList.contains("touch");
  if (showHint("rescue", focusHintText(touch), touch ? $("next") : null)) (runHints.rescued = true), (runHints.misses = 0);
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
  tap: (x: number, y: number) => targetAt(x, y, true),
  /** The story run in the page, for jumping to its end in tests. */
  story: () => storyRoom,
  /** The camera (for pictures: set follow false and cx, cy to look somewhere). */
  cam: () => cam,
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
