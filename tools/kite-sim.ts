// Measurements for optional run 3c, Kes's rematch on Kite Fell: stand-ins play Rook on a few seeds.
//   npx tsx tools/kite-sim.ts [seeds] [stand,...] [key=value ...]
// stand: smart (the vane the most are coming to that he can be in time for), late (smart, but
// only looks once a gust is at the split), stay (the north vane, always), wander (a vane at
// random each gust), idle. Keys: each=1, log=1, and any path into KITE (wind=1.2, gust.every=36).
import { KITE } from "../src/engine/kite.js";
import { KiteRoom, type Stand } from "../src/server/kite.js";

const seeds = Number(process.argv[2] ?? 30), stands = (process.argv[3] ?? "smart,late,stay,wander").split(",") as Stand[];
const opts = Object.fromEntries(process.argv.slice(4).map((a) => a.split("=") as [string, string]));
for (const [k, v] of Object.entries(opts)) {
  if (["each", "log"].includes(k)) continue;
  const path = k.split("."), last = path.pop()!;
  let at = KITE as unknown as Record<string, unknown>;
  for (const part of path) at = at[part] as Record<string, unknown>;
  at[last] = v.includes(",") ? v.split(",").map(Number) : Number(v);
}
console.log(`first to ${KITE.target}, wind ${KITE.wind}, a gust of ${KITE.gust.rich}+${KITE.gust.lone} every ${KITE.gust.every} ticks, reach ${KITE.reach}, Kes presses at +${KITE.kes.press}, quick ${KITE.kes.quick}`);
for (const stand of stands) {
  let won = 0, ticks = 0, his = 0, hers = 0, off = 0, past = 0, pressed = 0, quick = 1e9, slow = 0, open = 0;
  const ends = new Map<string, number>();
  for (let k = 1; k <= seeds; k++) {
    let s = k * 7919;
    const room = new KiteRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
    room.stand = stand;
    const said: string[] = [];
    room.connect((m) => m.t === "say" && said.push(...m.lines.map((l) => `${room.state.game?.tick ?? 0}:${l.who} ${l.text.slice(0, 22)}`))).message(JSON.stringify({ t: "hello", name: "Rook" }));
    const marks: string[] = [];
    let was = "";
    for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) {
      room.onTick();
      const st = room.state, now = st.score.join("-");
      if (now !== was) (was = now), marks.push(`${st.game.tick}:${now}`);
    }
    const st = room.state, g = st.game, win = st.record?.won ?? false;
    if (st.phase !== "results") open++;
    if (win) won++;
    ticks += g.tick; quick = Math.min(quick, g.tick); slow = Math.max(slow, g.tick);
    his += st.score[0]; hers += st.score[1]; off += st.tally.off; past += st.tally.past; pressed += st.tally.pressed;
    const key = st.score.join("-");
    ends.set(key, (ends.get(key) ?? 0) + 1);
    if (opts.each) console.log(`seed ${k}: ${st.score.join("-")} at ${g.tick}, rich ${st.rich.join("")}, Kes came over ${st.tally.pressed} | ${marks.join(" ")}`);
    if (opts.log) console.log("   " + said.join(" | "));
  }
  const m = (n: number) => (n / seeds).toFixed(1);
  console.log(`${stand}: won ${won}/${seeds}${open ? `, unfinished ${open}` : ""}; ${m(ticks)} ticks (${quick} to ${slow}), ${Math.round((ticks / seeds) * 0.6)} s; Rook ${m(his)}, Kes ${m(hers)}; off the edge ${m(off)}, by his vane ${m(past)}, Kes came over ${m(pressed)}; ends ${[...ends].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e} x${n}`).join(", ")}`);
}
