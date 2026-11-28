// Measurements for optional run 3b, Tidepool Steps: stand-ins play Rook on a few seeds.
//   npx tsx tools/tidepool-sim.ts [seeds] [stand,...] [key=value ...]
// stand: smart (waits where the next lot will be left, low or high, and sends Lumi), solo (the
// same, never sending her), low (waits on the court), climb (always the highest), idle.
// Keys: each=1, log=1, and any path into TIDEPOOL (tide.out=14, reach=3, seed=0,1,1,1,0).
import { TIDEPOOL, tidepoolTicks } from "../src/engine/tidepool.js";
import { TidepoolRoom, type Stand } from "../src/server/tidepool.js";

const seeds = Number(process.argv[2] ?? 30), stands = (process.argv[3] ?? "smart,solo,low,climb").split(",") as Stand[];
const opts = Object.fromEntries(process.argv.slice(4).map((a) => a.split("=") as [string, string]));
for (const [k, v] of Object.entries(opts)) {
  if (["each", "log"].includes(k)) continue;
  const path = k.split("."), last = path.pop()!;
  let at = TIDEPOOL as unknown as Record<string, unknown>;
  for (const part of path) at = at[part] as Record<string, unknown>;
  at[last] = v.includes(",") ? v.split(",").map(Number) : Number(v);
}
const T = TIDEPOOL;
console.log(`${tidepoolTicks()} ticks (${Math.round(tidepoolTicks() * 0.6)} s), first in ${T.tide.firstIn}, out ${T.tide.out}, in ${T.tide.in}, ${T.tides} tides out, rise ${T.rise.join(",")} (${T.rich} rich), seed ${T.seed.join(",")}, reach ${T.reach}, target ${T.target}`);
for (const stand of stands) {
  let won = 0, ticks = 0, taken = 0, rook = 0, lumi = 0, off = 0, high = 0, quick = 1e9, slow = 0;
  const steps = [0, 0, 0, 0, 0, 0];
  const ends = new Map<number, number>();
  for (let k = 1; k <= seeds; k++) {
    let s = k * 7919;
    const room = new TidepoolRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
    room.stand = stand;
    const said: string[] = [];
    room.connect((m) => m.t === "say" && said.push(...m.lines.map((l) => `${room.state.game?.tick ?? 0}:${l.who} ${l.text.slice(0, 24)}`))).message(JSON.stringify({ t: "hello", name: "Rook" }));
    const marks: string[] = [];
    let was = -1;
    for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) {
      room.onTick();
      const st = room.state;
      if (st.taken !== was) (was = st.taken), marks.push(`${st.game.tick}:${st.taken}`);
    }
    const st = room.state, g = st.game, win = st.record?.won ?? false;
    if (win) (won++, (ticks += g.tick), (quick = Math.min(quick, g.tick)), (slow = Math.max(slow, g.tick)));
    taken += st.taken; rook += st.tally.rook; lumi += st.tally.lumi; off += st.tally.off; high += st.tally.high;
    st.tally.steps.forEach((n, i) => (steps[i]! += n));
    ends.set(st.taken, (ends.get(st.taken) ?? 0) + 1);
    if (opts.each) console.log(`seed ${k}: ${win ? "won" : "short"} at ${g.tick} with ${st.taken} (lumi ${st.tally.lumi}, off ${st.tally.off}, sends ${st.tally.sends}) | ${marks.join(" ")}`);
    if (opts.log) console.log("   " + said.join(" | "));
  }
  const m = (n: number, of = seeds) => (of ? (n / of).toFixed(1) : "-");
  console.log(`${stand}: won ${won}/${seeds}${won ? `, in ${m(ticks, won)} ticks (${quick} to ${slow})` : ""}; taken ${m(taken)} (Rook ${m(rook)}, Lumi ${m(lumi)}), off the bottom ${m(off)}, by step ${steps.map((n) => m(n)).join("/")}; ends ${[...ends].sort((a, b) => a[0] - b[0]).map(([e, n]) => `${e} x${n}`).join(", ")}`);
}
