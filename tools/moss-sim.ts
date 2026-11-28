// Measurements for optional run 3a, Moss Hollow: stand-ins play Rook on a few seeds.
//   npx tsx tools/moss-sim.ts [seeds] [stand,...] [key=value ...]
// stand: smart (bare ones while they are bare, then where a stroke frees the most, and sends Lumi),
// solo (the same, never sending her), singles (never cuts into a patch), blind (cuts the nearest
// moss), thick (cuts the thickest first), idle.
// Keys: each=1, log=1, and any path into MOSS (strokes=10, creep=14, rise.every=12).
import { MOSS } from "../src/engine/mosshollow.js";
import { MossRoom, type Stand } from "../src/server/mosshollow.js";

const seeds = Number(process.argv[2] ?? 30), stands = (process.argv[3] ?? "smart,solo,singles,blind,thick,idle").split(",") as Stand[];
const opts = Object.fromEntries(process.argv.slice(4).map((a) => a.split("=") as [string, string]));
for (const [k, v] of Object.entries(opts)) {
  if (["each", "log"].includes(k)) continue;
  const path = k.split("."), last = path.pop()!;
  let at = MOSS as unknown as Record<string, unknown>;
  for (const part of path) at = at[part] as Record<string, unknown>;
  at[last] = Number(v);
}
const M = MOSS;
console.log(`target ${M.target}, strokes ${M.strokes}, reach ${M.reach}, creep ${M.creep}, thicken ${M.thicken} to ${M.singleMax}, rise ${M.rise.n} every ${M.rise.every}, Lumi ${M.lumiSends} sends, a tear every ${M.lumiTear}`);
for (const stand of stands) {
  let won = 0, ticks = 0, taken = 0, strokes = 0, lumi = 0, crept = 0, singles = 0, patches = 0, quick = 1e9, slow = 0, allTicks = 0;
  const ends = new Map<number, number>();
  for (let k = 1; k <= seeds; k++) {
    let s = k * 7919;
    const room = new MossRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
    room.stand = stand;
    const said: string[] = [];
    room.connect((m) => m.t === "say" && said.push(...m.lines.map((l) => `${room.state.game?.tick ?? 0}:${l.who} ${l.text.slice(0, 24)}`))).message(JSON.stringify({ t: "hello", name: "Rook" }));
    const marks: string[] = [];
    let was = -1;
    for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) {
      room.onTick();
      const st = room.state;
      if (st.taken !== was) (was = st.taken), marks.push(`${st.game.tick}:${st.taken}/${st.strokes}`);
    }
    const st = room.state, g = st.game, win = st.record?.won ?? false;
    allTicks += g.tick;
    if (win) (won++, (ticks += g.tick), (quick = Math.min(quick, g.tick)), (slow = Math.max(slow, g.tick)));
    taken += st.taken; strokes += st.strokes; lumi += st.tally.lumiFreed; crept += st.tally.crept; singles += st.tally.cutSingles; patches += st.tally.cutPatches;
    ends.set(st.taken, (ends.get(st.taken) ?? 0) + 1);
    if (opts.each) console.log(`seed ${k}: ${win ? "won" : "short"} at ${g.tick} with ${st.taken} (strokes ${st.strokes}, Lumi freed ${st.tally.lumiFreed}, crept ${st.tally.crept}) | ${marks.join(" ")}`);
    if (opts.log) console.log("   " + said.join(" | "));
  }
  const m = (n: number, of = seeds) => (of ? (n / of).toFixed(1) : "-");
  console.log(`${stand}: won ${won}/${seeds}${won ? `, in ${m(ticks, won)} ticks (${quick} to ${slow})` : ""}; all end at ${m(allTicks)}; taken ${m(taken)}, strokes ${m(strokes)} (singles ${m(singles)}, patches ${m(patches)}), Lumi freed ${m(lumi)}, mossed over ${m(crept)}; ends ${[...ends].sort((a, b) => a[0] - b[0]).map(([e, n]) => `${e} x${n}`).join(", ")}`);
}
