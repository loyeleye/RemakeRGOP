// Measurements for run 9: stand-ins play Rook on a few seeds.
//   npx tsx tools/rescue-sim.ts [seeds] [stand] [key=value ...]
// stand: hold (brings each wisp straight in), heap (heaps three near the lamp first), wary (heaps
// only while the patch is away), idle. Keys: patch=react|seek|line, kes=supply|banks, sloppy=0.08,
// log=1 (what was said), and any path into RESCUE (cloud.every=50).
import { RESCUE } from "../src/engine/rescue.js";
import { RescueRoom, type Stand } from "../src/server/rescue.js";

const seeds = Number(process.argv[2] ?? 12), stand = (process.argv[3] ?? "hold") as Stand;
const opts = Object.fromEntries(process.argv.slice(4).map((a) => a.split("=") as [string, string]));
for (const [k, v] of Object.entries(opts)) {
  if (["patch", "kes", "log", "sloppy", "each", "flare"].includes(k)) continue;
  const path = k.split("."), last = path.pop()!;
  let at = RESCUE as unknown as Record<string, unknown>;
  for (const part of path) at = at[part] as Record<string, unknown>;
  at[last] = v.includes(",") ? v.split(",").map(Number) : Number(v);
}
if (opts.sloppy) (RESCUE.stand as { sloppiness: number }).sloppiness = Number(opts.sloppy);
let first = 0, ticks = 0, restarts = 0, lost = 0, toPatch = 0, via = 0, set = 0, crossings = 0, done = 0;
for (let k = 1; k <= seeds; k++) {
  let s = k * 7919;
  const room = new RescueRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  if (opts.patch) room.patchAim = opts.patch as "react" | "seek" | "line";
  if (opts.kes) room.kesMode = opts.kes as "supply" | "banks";
  if (opts.flare) room.flareOn = opts.flare === "1";
  const said: string[] = [];
  room.connect((m) => m.t === "say" && said.push(...m.lines.map((l) => `${room.state.game.tick}:${l.text.slice(0, 22)}`))).message(JSON.stringify({ t: "hello", name: "Rook" }));
  const marks: string[] = [];
  let had = false, total = 0, lostAll = 0, patchAll = 0;
  for (let n = 0; n < 4000 && room.state.phase !== "results"; n++) {
    const before = room.restarts, t0 = room.ticks, l0 = room.lost, p0 = room.lostToPatch;
    room.onTick();
    if (room.restarts > before) (total += t0), (lostAll += l0), (patchAll += p0);
    const st = room.state;
    if (!!st.patch !== had) (had = !!st.patch), marks.push(`${had ? "in" : "out"}@${st.game.tick}(${room.lostToPatch}${had ? ` r${st.patch!.r} v${st.patch!.speed}` : ""})`);
  }
  const st = room.state;
  if (st.phase === "results") done++;
  if (room.restarts === 0 && st.phase === "results") first++;
  ticks += room.ticks; restarts += room.restarts; lost += room.lost + lostAll; toPatch += room.lostToPatch + patchAll; via += room.viaKes; set += room.setDowns; crossings += st.crossings;
  if (opts.each) console.log(`seed ${k}: ${st.phase} ticks ${room.ticks} restarts ${room.restarts} banked ${st.banked} via Kes ${room.viaKes}/${room.setDowns} lost ${room.lost} (patch ${room.lostToPatch}) cloud ${st.game.cloudAt} patch ${marks.join(" ")}`);
  if (opts.log) console.log("   " + said.join(" | "));
}
const m = (n: number) => (n / seeds).toFixed(1);
console.log(`${stand}: won first try ${first}/${seeds}, finished ${done}, winning-run ticks ${m(ticks)}, restarts ${m(restarts)}, lost ${m(lost)} (patch ${m(toPatch)}), via Kes ${m(via)} of ${m(set)} set down, crossings ${m(crossings)}`);
