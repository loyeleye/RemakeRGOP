// The alarm before run 6 (story/runs6-7-reimagined.md, section 1): five held pictures, full screen,
// each cross-fading slowly into the next, about forty seconds in all. The house timbers, then the
// shrine's great bell from far off, growing; no line until Lumi's on the last picture. The pictures
// are the gameplay thread's first drafts, picked up by name from public/stills/<file>.webp, and every
// number is in DYING.alarm; until a picture is drawn, a plain card with its name stands in.

import { DYING } from "../engine/dying.js";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Plays the alarm. `then` is called once, as the last picture starts to fade (or when it is skipped),
 * so the board is under it as it goes. `sound.bell` takes how loud (0 to 1).
 */
export function alarmCards(sound: { groan(): void; bell(level: number): void }, then: () => void) {
  const A = DYING.alarm;
  const el = document.createElement("div");
  el.id = "alarm";
  el.style.setProperty("--fade", `${A.fadeMs}ms`);
  el.style.setProperty("--hold", `${A.holdMs + A.fadeMs}ms`);
  const pics = A.files.map((f, i) => {
    const pic = document.createElement("div");
    pic.className = "pic";
    pic.innerHTML = `<div class="ph"><small>picture to come</small><b>${esc(A.names[i]!)}</b></div>`;
    const img = new Image();
    img.alt = "";
    img.onload = () => pic.append(img);
    img.src = `stills/${f}.webp`;
    el.append(pic);
    return pic;
  });
  const say = document.createElement("p");
  say.className = "say";
  say.innerHTML = `<b class="${esc(A.line.who.toLowerCase())}">${esc(A.line.who)}</b> ${esc(A.line.text)}`;
  const skip = document.createElement("button");
  skip.className = "skip";
  skip.textContent = "Skip";
  el.append(say, skip);
  document.body.append(el);

  const timers: number[] = [];
  const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
  const total = A.files.length * A.holdMs;
  pics.forEach((pic, i) => {
    // The new one fades in over the old, which is taken away under it once it is covered.
    at(i * A.holdMs + 30, () => pic.classList.add("on"));
    if (i > 0) at(i * A.holdMs + A.fadeMs + 60, () => pics[i - 1]!.classList.remove("on"));
  });
  at(A.groanMs, () => sound.groan());
  for (let t = A.bellFromMs; t < total; t += A.bellEveryMs) at(t, () => sound.bell(A.bellFar + ((A.bellNear - A.bellFar) * t) / total));
  at((A.files.length - 1) * A.holdMs + A.lineAfterMs, () => say.classList.add("on"));
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    for (const t of timers) clearTimeout(t);
    then();
    el.classList.add("gone");
    window.setTimeout(() => el.remove(), A.fadeMs + 80);
  };
  at(total, end);
  skip.onclick = end;
}
