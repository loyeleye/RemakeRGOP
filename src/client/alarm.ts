// The alarm before run 6 (story/runs6-7-reimagined.md, section 1): five short shots, full screen,
// about seventeen seconds in all, and none of them still (Ladi, 24 Nov). The kitchen's cups and lamp
// swing; the falls drop into the cloud; down the lake the brazier's fire fails while the village
// run; from the side the island's heart flickers and the cloud comes up over it; Lumi is at the
// door. The shrine's great bell tolls through all five. The layers are the gameplay thread's drafts
// (project files gameplay/stills/run6/alarm-layers/), picked up by name from public/stills/alarm/,
// on a 1024 by 768 stage. The order, the lengths and every other number are in DYING.alarm.

import { DYING } from "../engine/dying.js";
import * as sound from "./sound.js";

const W = 1024, H = 768;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Shot {
  el: HTMLDivElement;
  cam: HTMLDivElement;
  /** As the shot comes up: its sounds, by `at` (ms into the shot). */
  start?: (at: (ms: number, f: () => void) => void, sec: number) => void;
  /** Each frame, `t` seconds into the shot. */
  step?: (t: number) => void;
}

/** A value along a list of [time, value] points, straight between them. */
function along(pts: readonly (readonly [number, number])[], t: number) {
  let a = pts[0]!;
  for (const b of pts) {
    if (t < b[0]) return a[1] + ((b[1] - a[1]) * (t - a[0])) / Math.max(1e-6, b[0] - a[0]);
    a = b;
  }
  return a[1];
}

/**
 * Plays the alarm. `ready` is called once, DYING.alarm.readyMs before the end (or when it is skipped),
 * to have the board built under the last shot; `then` once, as that shot starts to fade.
 */
export function alarmCards(ready: () => void, then: () => void) {
  const A = DYING.alarm;
  const el = document.createElement("div");
  el.id = "alarm";
  el.style.setProperty("--fade", `${A.fadeMs}ms`);
  const stage = document.createElement("div");
  stage.className = "stage";
  el.append(stage);
  const fit = () => stage.style.setProperty("--s", String(Math.min(innerWidth / W, innerHeight / H)));
  fit();
  addEventListener("resize", fit);

  const imgs: HTMLImageElement[] = [];
  const layer = (file: string, x = 0, y = 0, origin = "") => {
    const img = new Image();
    img.alt = "";
    img.style.left = `${x}px`;
    img.style.top = `${y}px`;
    if (origin) img.style.transformOrigin = origin;
    img.src = `stills/${file}.webp`;
    imgs.push(img);
    return img;
  };

  const build: Record<string, (cam: HTMLDivElement) => Pick<Shot, "start" | "step">> = {
    // The cups on their hooks and the lamp on its chain start still and swing wider, each at its own rate.
    kitchen(cam) {
      const K = A.kitchen;
      const lamp = layer("alarm/alarm1-lamp", K.lamp[0], K.lamp[1], "50% 0");
      const cups = K.cups.map(([x, y], i) => layer(`alarm/alarm1-cup-${i + 1}`, x, y, "50% 0"));
      cam.append(layer("alarm/alarm1-kitchen-empty"), lamp, ...cups);
      return {
        start(at) {
          at(150, () => sound.lurchGroan());
          for (const ms of K.clinks) at(ms, () => sound.cupClink());
        },
        step(t) {
          const k = Math.min(1, t / K.build);
          lamp.style.transform = `rotate(${(k * K.lampSwing * Math.sin(t * K.lampRate * Math.PI * 2)).toFixed(2)}deg)`;
          cups.forEach((c, i) => (c.style.transform = `rotate(${(k * K.swing * Math.sin(t * K.rates[i]! * Math.PI * 2 + i)).toFixed(2)}deg)`));
        },
      };
    },
    // The lake going off the lip straight into the cloud; the roar is short and muffled.
    falls(cam) {
      cam.append(layer("alarm/alarm2-falls"));
      return { start: (at, sec) => at(0, () => sound.alarmFalls(sec)) };
    },
    // Three frames in which only the brazier differs: it gutters, and ends low. The village are heard.
    lake(cam) {
      const frames = { low: layer("alarm/alarm3-fire-low"), mid: layer("alarm/alarm3-fire-mid"), tall: layer("alarm/alarm3-fire-tall") };
      cam.append(frames.low, frames.mid, frames.tall);
      return {
        start: (at, sec) => at(0, () => sound.alarmChatter(sec)),
        step(t) {
          let now: keyof typeof frames = "tall";
          for (const [s, f] of A.lake.fire) if (t >= s) now = f;
          frames.mid.style.opacity = now === "low" ? "0" : "1";
          frames.tall.style.opacity = now === "tall" ? "1" : "0";
        },
      };
    },
    // The heart under the rock flickers and goes dim; then the cloud comes up over the island.
    side(cam) {
      const S = A.side;
      const dim = layer("alarm/alarm4-heart-dim"), cloud = layer("alarm/alarm4-cloud-front", 0, 0);
      cam.append(layer("alarm/alarm4-heart-bright"), dim, cloud);
      return {
        start(at) {
          at(S.flickerMs, () => (sound.lurchGroan(), sound.alarmRumble(S.riseMs / 1000)));
        },
        step(t) {
          const f = (t * 1000) / S.flickerMs;
          dim.style.opacity = along(S.flicker, f).toFixed(2);
          const r = Math.max(0, Math.min(1, (t * 1000 - S.flickerMs) / S.riseMs));
          const e = r * r * (3 - 2 * r);
          cloud.style.transform = `translateY(${(S.from + (S.to - S.from) * e).toFixed(1)}px)`;
        },
      };
    },
    lumi(cam) {
      cam.append(layer("r6-alarm-5"));
      return { start: (at) => at(A.lineAfterMs, () => say.classList.add("on")) };
    },
  };

  const say = document.createElement("p");
  say.className = "say";
  say.innerHTML = `<b class="${esc(A.line.who.toLowerCase())}">${esc(A.line.who)}</b> ${esc(A.line.text)}`;
  const shots: Shot[] = A.shots.map((s) => {
    const pic = document.createElement("div");
    pic.className = "pic";
    pic.innerHTML = `<div class="ph"><small>picture to come</small><b>${esc(s.name)}</b></div>`;
    const cam = document.createElement("div");
    cam.className = "cam";
    pic.append(cam);
    stage.append(pic);
    return { el: pic, cam, ...build[s.id]!(cam) };
  });
  const skip = document.createElement("button");
  skip.className = "skip";
  skip.textContent = "Skip";
  el.append(say, skip);
  document.body.append(el);

  const timers: number[] = [];
  const at = (ms: number, f: () => void) => void timers.push(window.setTimeout(f, ms));
  const starts: number[] = [];
  let total = 0;
  for (const s of A.shots) starts.push(total), (total += s.ms);
  let over = false, asked = false, t0 = 0, frame = 0;
  const ask = () => {
    if (!asked) (asked = true), ready();
  };
  const end = () => {
    if (over) return;
    over = true;
    for (const t of timers) clearTimeout(t);
    removeEventListener("resize", fit);
    ask();
    then();
    el.classList.add("gone");
    window.setTimeout(() => (cancelAnimationFrame(frame), el.remove()), A.fadeMs + 80);
  };
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const now = performance.now() - t0;
    shots.forEach((s, i) => {
      const t = now - starts[i]!, ms = A.shots[i]!.ms;
      if (t < -50 || t > ms + A.fadeMs + 100) return;
      s.step?.(Math.max(0, t) / 1000);
      // A slow push in, all through the shot.
      s.cam.style.transform = `scale(${(1 + (A.shots[i]!.push * Math.max(0, t)) / (ms + A.fadeMs)).toFixed(4)})`;
    });
  };
  const go = () => {
    if (over || t0) return;
    t0 = performance.now();
    shots.forEach((s, i) => {
      // The new one fades in over the old, which is taken away under it once it is covered.
      at(starts[i]! + 20, () => s.el.classList.add("on"));
      if (i > 0) at(starts[i]! + A.fadeMs + 60, () => shots[i - 1]!.el.classList.remove("on"));
      s.start?.((ms, f) => at(starts[i]! + ms, f), A.shots[i]!.ms / 1000);
    });
    // The great bell, rung over and over, through all of it; run 6's own takes over from it.
    for (let t = A.bellFromMs; t < total; t += A.bellEveryMs) at(t, () => sound.greatBell(A.bellFar + ((A.bellNear - A.bellFar) * t) / total));
    at(Math.max(0, total - A.readyMs), ask);
    at(total, end);
    tick();
  };
  skip.onclick = () => (sound.alarmQuiet(), end());
  // Not before its pictures are there (or two seconds, whichever is first).
  void Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 2000))]).then(go);
}
