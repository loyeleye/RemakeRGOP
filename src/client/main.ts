// Lanternfall client: home screen, lobby, and the round itself.

import type { Pt } from "../engine/board.js";
import { PULL_REACH, PUSH_REACH, ROUND_TICKS, TICK_MS, type Action, type GameSnapshot, type Guild } from "../engine/game.js";
import { SHRINES, ringNote, shrineById, shrineFor } from "../engine/maps.js";
import { FLAMES, FLAME_COLORS, type ClientMsg, type Flame, type RoomView, type ServerMsg } from "../engine/protocol.js";
import { Room } from "../server/room.js";
import { Camera, GUILD_COLORS, GUILD_NAMES, World, drawMinimap, drawOverlay, loadModels, type DrawState } from "./view3d.js";

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
      render();
      break;
    }
    case "tick":
      prevSnap = snap && snap.tick === m.snap.tick - 1 ? snap : null;
      snap = m.snap;
      snapAt = performance.now();
      tickMs = m.tickMs;
      for (const b of m.snap.banks) bankFlash(b.guild);
      renderHud();
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
  try {
    history.replaceState(null, "", location.pathname);
  } catch {
    /* sandboxed page */
  }
  render();
}

// ------------------------------------------------------------------ screens

function render() {
  const phase = room?.phase;
  $("home").hidden = !!room;
  $("lobby").hidden = phase !== "lobby";
  $("play").hidden = !room || phase === "lobby";
  $("results").hidden = phase !== "results";
  if (!room) return;
  if (phase === "lobby") renderLobby();
  if (phase === "results") renderResults();
  renderHud();
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

function renderHud() {
  if (!room) return;
  const s = snap;
  for (let g = 0; g < 4; g++) {
    const el = $(`score-${g}`);
    el.hidden = g >= room.teams;
    el.textContent = String(s?.scores[g] ?? 0);
  }
  const left = s ? ROUND_TICKS - s.tick : ROUND_TICKS;
  $("ticks").textContent = room.phase === "countdown" ? `Starts in ${room.countdown}` : `${left} ticks · ${fmtTime((left * tickMs) / 1000)}`;
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
  let best: { id: number; d: number } | null = null;
  for (const w of snap.wisps) {
    const d = Math.hypot(w.x + 0.5 - t.x, w.y + 0.5 - t.y);
    // Prefer wisps your staff can affect right now.
    const usable = p && (p.mode === "push" || w.guild === p.guild);
    const score = d - (usable ? 0.4 : 0);
    if (d <= radius && (!best || score < best.d)) best = { id: w.id, d: score };
  }
  if (best) return { action: { kind: "staff", wisp: best.id }, wisp: best.id };
  const tile: Pt = { x: Math.floor(t.x), y: Math.floor(t.y) };
  const board = shrineFor(room.shrine, room.teams).board;
  if (!board.inside(tile)) return null;
  // A tap on a wall or pool still walks as close to it as the path allows.
  return { action: { kind: "walk", to: tile }, wisp: null };
}

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
  if (room?.phase !== "playing" || (e.target as HTMLElement).tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if (k === "q") act({ toggleMode: true });
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

$("next").onclick = () => {
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
  const shrine = shrineFor(room.shrine, room.teams);
  if (!world) {
    world = new World(canvas, cam);
    world.resize(cam.w, cam.h, window.devicePixelRatio || 1);
  }
  cam.board = shrine.board;
  if (cam.scale === 0) {
    if (cam.compact) cam.phoneZoom();
    else cam.fitBoard(shrine.board);
  }
  const t = Math.min(1, (now - snapAt) / tickMs);
  const mine = snap.players.find((p) => p.id === me);
  if (cam.follow && mine) {
    if (cam.compact || cam.zoomedIn) {
      const tx = mine.px + (mine.x - mine.px) * t + 0.5;
      const ty = mine.py + (mine.y - mine.py) * t + 0.5;
      cam.cx += (tx - cam.cx) * 0.2;
      cam.cy += (ty - cam.cy) * 0.2;
    } else {
      cam.cx = shrine.board.width / 2;
      cam.cy = shrine.board.height / 2 + 0.5;
    }
  }
  cam.clamp(shrine.board);
  const flames = new Map<number, Flame>(room.players.map((p) => [p.id, p.flame]));
  const lit = document.body.classList.contains("touch") ? padTarget() : hoverWisp;
  if (document.body.classList.contains("touch")) {
    const p = snap.players.find((q) => q.id === me);
    const w = snap.wisps.find((q) => q.id === lit);
    const reach = p?.mode === "push" ? PUSH_REACH : PULL_REACH;
    $("staff").classList.toggle("far", !p || !w || Math.max(Math.abs(w.x - p.x), Math.abs(w.y - p.y)) > reach);
  }
  const st: DrawState = { shrine, prev: prevSnap, snap, t, me, flames, hoverWisp: lit, now };
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
  if (cam.compact) {
    const w = Math.min(120, cam.w * 0.3);
    minimapRect = { x: cam.w - w - 10, y: 64, w, h: w };
    drawMinimap(g, cam, st, minimapRect);
  }
}
requestAnimationFrame(frame);

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
  toScreen: (x: number, y: number) => cam.toScreen(x, y),
};
