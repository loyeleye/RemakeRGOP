// Measurements for optional run 2, Lumi's lesson with Kes: stand-ins play Lumi on a few seeds.
//   npx tsx tools/cove-sim.ts [seeds] [stand] [key=value ...]
// stand: smart (stands where the most will be in reach, and walks to what is left on wet stone),
// near (the nearest pool with anything in it), stay (one stone, always), wander (a stone at
// random each tide), idle. Keys: each=1, log=1, and any path into COVE (tide.in=12, reach=10).
import { COVE, coveTicks } from "../src/engine/cove.js";
import { CoveRoom, type Stand } from "../src/server/cove.js";

const seeds = Number(process.argv[2] ?? 30), stands = (process.argv[3] ?? "smart,near,stay,wander").split(",") as Stand[];
const opts = Object.fromEntries(process.argv.slice(4).map((a) => a.split("=") as [string, string]));
for (const [k, v] of Object.entries(opts)) {
  if (["each", "log"].includes(k)) continue;
  const path = k.split("."), last = path.pop()!;
  let at = COVE as unknown as Record<string, unknown>;
  for (const part of path) at = at[part] as Record<string, unknown>;
  at[last] = v.includes(",") ? v.split(",").map(Number) : Number(v);
}
console.log(`light ${coveTicks()} ticks (${Math.round(coveTicks() * 0.6)} s), tide in ${COVE.tide.in} out ${COVE.tide.out}, ${COVE.tides} tides, reach ${COVE.reach}, ${COVE.rich}+${COVE.singles} wisps`);
for (const stand of stands) {
  let won = 0, ticks = 0, landed = 0, pulled = 0, walked = 0, tides = 0, quick = 1e9, slow = 0;
  const ends = new Map<number, number>();
  for (let k = 1; k <= seeds; k++) {
    let s = k * 7919;
    const room = new CoveRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
    room.stand = stand;
    const said: string[] = [];
    room.connect((m) => m.t === "say" && said.push(...m.lines.map((l) => `${room.state.game?.tick ?? 0}:${l.who} ${l.text.slice(0, 24)}`))).message(JSON.stringify({ t: "hello", name: "Lumi" }));
    const marks: string[] = [];
    let was = -1;
    for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) {
      room.onTick();
      const st = room.state;
      if (st.landed !== was) (was = st.landed), marks.push(`${st.game.tick}:${st.landed}${st.isIn ? "" : "f"}`);
    }
    const st = room.state, g = st.game, win = st.record?.won ?? false;
    if (win) (won++, (ticks += g.tick), (tides += st.tally.tides), (quick = Math.min(quick, g.tick)), (slow = Math.max(slow, g.tick)));
    landed += st.landed; pulled += st.tally.pulled; walked += st.tally.walked;
    ends.set(st.landed, (ends.get(st.landed) ?? 0) + 1);
    if (opts.each) console.log(`seed ${k}: ${win ? "won" : "light went"} at ${g.tick} with ${st.landed} | ${marks.join(" ")}`);
    if (opts.log) console.log("   " + said.join(" | "));
  }
  const m = (n: number, of = seeds) => (of ? (n / of).toFixed(1) : "-");
  console.log(`${stand}: won ${won}/${seeds}${won ? `, in ${m(ticks, won)} ticks (${quick} to ${slow}), on tide ${m(tides, won)}` : ""}; landed ${m(landed)} (${m(pulled)} over water, ${m(walked)} on foot); ends ${[...ends].sort((a, b) => a[0] - b[0]).map(([e, n]) => `${e} x${n}`).join(", ")}`);
}
