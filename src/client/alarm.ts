// The alarm before run 6 (story/runs6-7-reimagined.md, section 1): five short shots, full screen,
// about twenty seconds in all, and none of them still (Ladi, 24 Nov). The kitchen's cups and lamp
// swing; Lumi is at the door; the falls drop into the cloud; close on the Kindling ground the
// brazier's fire fails and its sparks dim; the island's heart dies and it goes down through the
// cloud, shedding rock. The shrine's great bell tolls through all five. The layers are the gameplay thread's drafts
// (project files gameplay/stills/run6/alarm-layers/), picked up by name from public/stills/alarm/,
// on a 1024 by 768 stage. The order, the lengths and every other number are in DYING.alarm.

import { DYING, alarmTimes } from "../engine/dying.js";
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
 * Plays the alarm. `ready` is called once, under Lumi's shot (or when it is skipped), to have the
 * board built where nothing is moving, with how long the alarm has left (ms); `then` once, as the
 * last shot starts to fade, with whether it was skipped.
 */
export function alarmCards(ready: (leftMs: number) => void, then: (skipped: boolean) => void) {
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
      // Each cup is cut out along its own outline (25 Nov: the old square cut-outs carried a piece of the next cup), and swings from its hook.
      const cups = K.cups.map(([x, y], i) => layer(`alarm/alarm1-cup-${i + 1}`, x, y, `${K.hooks[i]![0] - x}px ${K.hooks[i]![1] - y}px`));
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
    // Close on the Kindling ground: four frames of the one fire, strong, low, embers and out, cross-faded
    // down a list of marks, with sparks over the bowl that thin and go dull. The village are heard.
    brazier(cam) {
      const B = A.brazier;
      const frames = ["out", "embers", "low", "strong"].map((f) => layer(`alarm/alarm3-close-${f}`));
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const g = cv.getContext("2d");
      cam.append(...frames, cv);
      // The same sparks every time: each has its moment, its place over the bowl and how long it lives.
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const K = B.sparks;
      const sparks = Array.from({ length: K.count }, () => ({ born: K.until * (1 - Math.sqrt(1 - rnd())), x: K.at[0] + (rnd() * 2 - 1) * K.spread, life: 0.8 + rnd() * 0.7, sway: rnd() * 6.3, size: 1.6 + rnd() * 2.2 }));
      return {
        start: (at, sec) => at(0, () => sound.alarmChatter(sec)),
        step(t) {
          const level = along(B.fire, t);
          frames.forEach((f, i) => i && (f.style.opacity = Math.max(0, Math.min(1, level - (i - 1))).toFixed(2)));
          if (!g) return;
          g.clearRect(0, 0, W, H);
          for (const p of sparks) {
            const a = (t - p.born) / p.life;
            if (a < 0 || a > 1) continue;
            // Bright and yellow while the fire is up; fewer, redder and dimmer as it goes.
            const dull = Math.min(1, p.born / K.until);
            g.globalAlpha = (1 - a) * (1 - 0.55 * dull);
            g.fillStyle = `rgb(${Math.round(255 - 95 * dull)}, ${Math.round(205 - 160 * dull)}, ${Math.round(110 - 85 * dull)})`;
            g.beginPath();
            g.arc(p.x + Math.sin(p.sway + a * 5) * 9, K.at[1] - K.rise * (1 - (1 - a) * (1 - a)), p.size * (1 - 0.4 * a), 0, 6.3);
            g.fill();
          }
        },
      };
    },
    // The island going down: its heart flickers and dies, then it drops, shaking, shedding rock,
    // through three layers of cloud that drift at their own speeds.
    descent: (cam) => isleShot(cam, layer, A.shots.find((x) => x.id === "descent")!.ms / 1000, false),
    lumi(cam) {
      cam.append(layer("r6-alarm-5"));
      // Her line is up for her shot and goes with it.
      return { start: (at, sec) => (at(A.lineAfterMs, () => say.classList.add("on")), at(sec * 1000, () => say.classList.remove("on"))) };
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
    if (s.at) cam.style.transformOrigin = `${s.at[0]}px ${s.at[1]}px`;
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
  const ask = (leftMs: number) => {
    if (!asked) (asked = true), ready(leftMs);
  };
  const end = (skipped = false) => {
    if (over) return;
    over = true;
    for (const t of timers) clearTimeout(t);
    removeEventListener("resize", fit);
    ask(0);
    then(skipped);
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
    at(alarmTimes().readyAt, () => ask(total - alarmTimes().readyAt));
    at(total, () => end());
    tick();
  };
  skip.onclick = () => (sound.alarmQuiet(), end(true));
  // Not before its pictures are there (or two seconds, whichever is first).
  void Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 2000))]).then(go);
}

type Layer = (file: string, x?: number, y?: number, origin?: string) => HTMLImageElement;

/**
 * The island and its clouds (alarm shot 4). Going down (`up` false): its heart flickers and dies,
 * then it drops, shaking, shedding rock, through three layers of cloud that drift at their own
 * speeds. Coming up (`up`, the end of run 7: Ladi, 26 Nov, "reverse the descent showing the island
 * rising out of the clouds"): the same shot the other way, without the rock: it rises out of the
 * cloud, its heart flickers back to life once it is clear, and the Kindling brazier on top burns,
 * a small fire of its own (DYING.risenShot).
 */
function isleShot(cam: HTMLDivElement, layer: Layer, sec: number, up: boolean): Pick<Shot, "start" | "step"> {
  const A = DYING.alarm, D = A.descent, R = DYING.risenShot;
  const isle = document.createElement("div");
  isle.className = "isle";
  const w = D.island.size[0] * D.island.scale, h = D.island.size[1] * D.island.scale, left = (W - w) / 2;
  const bright = layer("alarm/shot4/island-bright");
  for (const img of [layer("alarm/shot4/island-dim"), bright]) (img.style.width = `${w}px`), (img.style.height = `${h}px`), isle.append(img);
  // The waterfall, down the island's near face and going with it: one strip repeated to below the screen, its water running.
  const fall = document.createElement("div");
  fall.className = "fall";
  const strip = layer("alarm/shot4/waterfall-strip");
  fall.style.backgroundImage = `url(${strip.src})`;
  fall.style.backgroundSize = `${D.fall.wide * D.island.scale}px ${D.fall.tall * D.island.scale}px`;
  fall.style.left = `${D.fall.at[0] * D.island.scale}px`;
  fall.style.top = `${D.fall.at[1] * D.island.scale}px`;
  fall.style.width = `${D.fall.wide * D.island.scale}px`;
  fall.style.height = `${H}px`;
  isle.append(fall);
  // The brazier's fire, coming up: drawn here each frame, over the bowl on the Kindling ground.
  let fire: CanvasRenderingContext2D | null = null;
  if (up) {
    const cv = document.createElement("canvas");
    cv.width = R.fire.box[0];
    cv.height = R.fire.box[1];
    cv.className = "fire";
    cv.style.left = `${R.fire.at[0] * D.island.scale - R.fire.box[0] / 2}px`;
    cv.style.top = `${R.fire.at[1] * D.island.scale - R.fire.box[1] + R.fire.base}px`;
    isle.append(cv);
    fire = cv.getContext("2d");
  }
  isle.style.left = `${left}px`;
  isle.style.top = `${D.island.top}px`;
  const clouds = D.clouds.map((c) => {
    const img = layer(`alarm/shot4/${c.file}`, 0, c.y);
    img.style.width = `${D.cloudSize[0] * c.scale}px`;
    img.style.height = `${D.cloudSize[1] * c.scale}px`;
    return img;
  });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const span = D.rocksUntil - D.dropAt;
  const smooth = (r: number) => (r = Math.max(0, Math.min(1, r))) * r * (3 - 2 * r);
  // How far below its place the island is: going down, from `dropAt` to the shot's end; coming up, from `drop` to nothing by `riseUntil`.
  const drop = (t: number) => (up ? D.drop * (1 - smooth(t / R.riseUntil)) : D.drop * smooth((t - D.dropAt) / (sec - D.dropAt)));
  // Each rock: when it lets go, where on the underside (left or right of the falls; it narrows to a point in the middle), and how it turns.
  const rocks = up
    ? []
    : Array.from({ length: D.rocks }, (_, i) => {
        const dx = (rnd() < 0.5 ? -1 : 1) * (D.under.clear + rnd() * (D.under.half - D.under.clear));
        const el = layer(`alarm/shot4/debris-${(i % 4) + 1}`);
        el.style.opacity = "0";
        return { el, at: D.dropAt + (span * (i + rnd() * 0.8)) / D.rocks, x: W / 2 + dx, dy: D.under.tip - Math.abs(dx) * D.under.slope, vx: dx * 0.25 + (rnd() * 2 - 1) * 20, spin: (rnd() * 2 - 1) * 540, size: 0.8 + rnd() * 0.9 };
      });
  cam.append(layer("alarm/shot4/sky"), ...clouds.filter((_, i) => D.clouds[i]!.behind), isle, ...rocks.map((r) => r.el), ...clouds.filter((_, i) => !D.clouds[i]!.behind));
  // The flames: tongues that each sway and lick up at their own pace, the same every time.
  const tongues = Array.from({ length: R.fire.tongues }, (_, i) => ({ x: (i / Math.max(1, R.fire.tongues - 1) - 0.5) * R.fire.wide, h: 0.6 + rnd() * 0.4, rate: 5 + rnd() * 4, ph: rnd() * 6.3 }));
  const drawFire = (t: number, lit: number) => {
    if (!fire) return;
    const g = fire, [bw, bh] = R.fire.box, cx = bw / 2, base = bh - R.fire.base;
    g.clearRect(0, 0, bw, bh);
    // The glow on the ground round the bowl.
    const glow = g.createRadialGradient(cx, base, 0, cx, base, R.fire.glow);
    glow.addColorStop(0, `rgba(255, 170, 70, ${(0.45 * lit).toFixed(2)})`);
    glow.addColorStop(1, "rgba(255, 140, 50, 0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, bw, bh);
    for (const [col, k] of [["255, 120, 40", 1], ["255, 200, 80", 0.68], ["255, 245, 190", 0.38]] as const) {
      g.fillStyle = `rgba(${col}, ${(0.95 * lit).toFixed(2)})`;
      for (const q of tongues) {
        const tall = R.fire.tall * k * q.h * (0.8 + 0.2 * Math.sin(t * q.rate + q.ph)) * (0.55 + 0.45 * lit);
        const half = (R.fire.wide / R.fire.tongues) * 0.9 * k + 1, x = cx + q.x * k, sway = Math.sin(t * q.rate * 0.7 + q.ph) * 1.5;
        g.beginPath();
        g.moveTo(x - half, base);
        g.quadraticCurveTo(x - half * 0.8, base - tall * 0.55, x + sway, base - tall);
        g.quadraticCurveTo(x + half * 0.8, base - tall * 0.55, x + half, base);
        g.fill();
      }
    }
  };
  return {
    start(at) {
      if (up) return;
      at(0, () => sound.alarmHiss(sec));
      at(D.dropAt * 1000, () => (sound.lurchGroan(), sound.alarmRumble(sec - D.dropAt)));
      for (const r of rocks) at(r.at * 1000, () => sound.rockCrack((r.x - W / 2) / (W / 2)));
    },
    step(t) {
      // Going down, the heart is bright and flickers out; coming up, it is dark until the island is clear, then flickers back.
      if (!up) bright.style.opacity = t * 1000 >= D.heartMs ? "0" : (1 - along(D.heart, (t * 1000) / D.heartMs)).toFixed(2);
      else {
        const u = (t - R.heartFrom) / (D.heartMs / 1000);
        bright.style.opacity = u <= 0 ? "0" : u >= 1 ? "1" : (1 - along(D.heart, 1 - u)).toFixed(2);
      }
      const y = drop(t), moving = up ? t < R.riseUntil : t > D.dropAt;
      const shake = moving ? (up ? R.shake : D.shake) : 0;
      isle.style.transform = `translate(${(shake * Math.sin(t * 53) * Math.sin(t * 7.1)).toFixed(1)}px, ${(y + shake * 0.7 * Math.sin(t * 61 + 1)).toFixed(1)}px)`;
      fall.style.backgroundPositionY = `${((D.fall.speed * t) % (D.fall.tall * D.island.scale)).toFixed(1)}px`;
      D.clouds.forEach((c, i) => (clouds[i]!.style.transform = `translateX(${(c.x + c.speed * t).toFixed(1)}px)`));
      drawFire(t, up ? R.fire.low + (1 - R.fire.low) * Math.max(0, Math.min(1, (t - R.heartFrom) / (D.heartMs / 1000))) : 0);
      for (const r of rocks) {
        const f = t - r.at;
        if (f < 0) continue;
        r.el.style.opacity = "1";
        // It leaves with the island's own fall, then gravity has it.
        const y0 = D.island.top + drop(r.at) + r.dy;
        r.el.style.transform = `translate(${(r.x + r.vx * f).toFixed(1)}px, ${(y0 + 40 * f + 0.5 * D.gravity * f * f).toFixed(1)}px) rotate(${(r.spin * f).toFixed(0)}deg) scale(${r.size.toFixed(2)})`;
      }
    },
  };
}

/**
 * The end of run 7: the island coming up out of the cloud, its heart lit again and the brazier
 * burning (isleShot, coming up), full screen for `sec` seconds. Returns its element (already on
 * the page) and a stop that takes it away.
 */
export function riseCard(sec: number): { el: HTMLDivElement; stop: () => void } {
  const el = document.createElement("div");
  el.id = "risen";
  const stage = document.createElement("div");
  stage.className = "stage";
  const cam = document.createElement("div");
  cam.className = "cam";
  stage.append(cam);
  el.append(stage);
  const fit = () => stage.style.setProperty("--s", String(Math.min(innerWidth / W, innerHeight / H)));
  fit();
  addEventListener("resize", fit);
  const layer: Layer = (file, x = 0, y = 0) => {
    const img = new Image();
    img.alt = "";
    img.style.left = `${x}px`;
    img.style.top = `${y}px`;
    img.src = `stills/${file}.webp`;
    return img;
  };
  const shot = isleShot(cam, layer, sec, true);
  document.body.append(el);
  const t0 = performance.now();
  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    shot.step?.((performance.now() - t0) / 1000);
  };
  tick();
  return {
    el,
    stop: () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", fit);
      el.remove();
    },
  };
}
