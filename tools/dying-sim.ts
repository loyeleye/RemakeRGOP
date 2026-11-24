// Runs 6 and 7 measurements: how long a juggling, a holding and an idle stand-in for the player
// last in run 6, the juggler's flame curve, how long run 7 takes, and how often a wisp goes out in
// run 7 after Hesta's falter. npx tsx tools/dying-sim.ts [games]
import { DyingRoom, type Stand } from "../src/server/dying.js";
import { TICK_MS } from "../src/engine/game.js";

const N = Number(process.argv[2] ?? 100);
for (const stand of ["juggle", "hold", "idle"] as Stand[]) {
  let lasted = 0, min = 1e9, max = 0, seven = 0, lost = 0, lostAny = 0, lostAll = 0, stuck = 0, banks6 = 0, back = 0, lost6 = 0;
  const curve: number[] = [], cn: number[] = [];
  for (let i = 0; i < N; i++) {
    let s = 1000 + i * 7 + stand.length * 100000;
    const room = new DyingRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
    room.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    let n = 0, b6 = 0;
    // An idle player never finishes run 7; that is as it should be.
    while (room.state.phase !== "results" && n < 3000) {
      if (room.state.part === "six") b6 = room.state.game.scores[0]!;
      room.onTick(), n++;
    }
    lasted += room.lasted; back += room.gaveBack; lost6 += room.lost6; min = Math.min(min, room.lasted); max = Math.max(max, room.lasted); banks6 += b6;
    room.curve.forEach((f, t) => { curve[t] = (curve[t] ?? 0) + f; cn[t] = (cn[t] ?? 0) + 1; });
    if (room.state.phase !== "results") { stuck++; continue; }
    seven += room.sevenTicks; lost += room.lostLate; lostAll += room.lostSeven; if (room.lostLate) lostAny++;
  }
  const done = Math.max(1, N - stuck);
  console.log(`${stand}: run 6 lasts ${(lasted / N).toFixed(0)} ticks (${min} to ${max}), ${(banks6 / N).toFixed(1)} banks, ${(lost6 / N).toFixed(1)} lost in cloud, ${(back / N).toFixed(1)} given back; run 7 ${(seven / done).toFixed(0)} ticks (${(((seven / done) * TICK_MS) / 1000).toFixed(0)} s); wisps out in run 7 ${(lostAll / done).toFixed(2)} a game, after the falter ${(lost / done).toFixed(2)} a game, in ${Math.round((100 * lostAny) / done)}% of games; unfinished ${stuck}`);
  if (stand === "juggle") console.log("   flame every 10 ticks: " + curve.map((f, t) => [t, f / cn[t]!] as const).filter(([t]) => (t + 1) % 10 === 0).map(([t, f]) => `${t + 1}:${f.toFixed(0)}`).join(" "));
}
