// Measurements for optional run 1, Granny's rematch: stand-ins play Rook on a few seeds.
//   npx tsx tools/rematch-sim.ts [seeds] [stand] [key=value ...]
// stand: ignore (plays it straight, takes no notice of her cheat), smart (reads it), idle.
// Keys: cheat=hold|goal|nap, beatable=1, each=1, log=1, and any path into REMATCH (nap.ticks=10).
import { REMATCH, type Cheat } from "../src/engine/rematch.js";
import { RematchRoom, type Stand } from "../src/server/rematch.js";

const seeds = Number(process.argv[2] ?? 30), stand = (process.argv[3] ?? "ignore") as Stand;
const opts = Object.fromEntries(process.argv.slice(4).map((a) => a.split("=") as [string, string]));
for (const [k, v] of Object.entries(opts)) {
  if (["cheat", "beatable", "each", "log"].includes(k)) continue;
  const path = k.split("."), last = path.pop()!;
  let at = REMATCH as unknown as Record<string, unknown>;
  for (const part of path) at = at[part] as Record<string, unknown>;
  at[last] = v.includes(",") ? v.split(",").map(Number) : Number(v);
}
const cheats: Cheat[] = opts.cheat ? [opts.cheat as Cheat] : REMATCH.cheats;
for (const cheat of cheats) {
  let ticks = 0, done = 0, landed = 0, dodged = 0, none = 0, worst = 0, quick = 1e9, pushes = 0;
  const ends = new Map<string, number>();
  for (let k = 1; k <= seeds; k++) {
    let s = k * 7919;
    const room = new RematchRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647));
    room.stand = stand;
    room.cheatPick = cheat;
    room.beatable = opts.beatable === "1";
    const said: string[] = [];
    room.connect((m) => m.t === "say" && said.push(...m.lines.map((l) => `${room.state.game?.tick ?? 0}:${l.who} ${l.text.slice(0, 24)}`))).message(JSON.stringify({ t: "hello", name: "Rook" }));
    const marks: string[] = [];
    let was = "";
    for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) {
      room.onTick();
      const st = room.state, now = `${st.game.scores[0]}-${st.game.scores[1]}${st.stage === "on" ? "*" : ""}`;
      if (now !== was) (was = now), marks.push(`${st.game.tick}:${now}`);
    }
    const st = room.state, g = st.game;
    if (st.phase === "results") done++;
    ticks += g.tick; worst = Math.max(worst, g.tick); quick = Math.min(quick, g.tick); pushes += st.pushes;
    if (st.outcome === "landed") landed++;
    else if (st.outcome === "dodged") dodged++;
    else none++;
    const end = `${g.scores[0]}-${g.scores[1]}`;
    ends.set(end, (ends.get(end) ?? 0) + 1);
    if (opts.each) console.log(`seed ${k}: ${st.phase} ticks ${g.tick} ${end} ${st.outcome} | ${marks.join(" ")}`);
    if (opts.log) console.log("   " + said.join(" | "));
  }
  const m = (n: number) => (n / seeds).toFixed(1);
  console.log(`${cheat} / ${stand}: finished ${done}/${seeds}, ticks ${m(ticks)} (${quick} to ${worst}), read ${dodged}, walked into ${landed}, no cheat ${none}, her pushes ${m(pushes)}, ends ${[...ends].map(([e, n]) => `${e} x${n}`).join(", ")}`);
}
