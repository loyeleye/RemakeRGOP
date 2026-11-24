// Run 8 measurements: wisps lost and time taken for a juggling, a holding and an idle stand-in,
// and how often a wisp is lost over a well against over ground. npx tsx tools/sieve-sim.ts [games]
import { SieveRoom, type Stand } from "../src/server/sieve.js";
import { TICK_MS } from "../src/engine/game.js";

const N = Number(process.argv[2] ?? 100);
for (const stand of ["juggle", "hold", "idle"] as Stand[]) {
  let lost = 0, well = 0, ticks = 0, restarts = 0, done = 0, clean = 0;
  for (let i = 0; i < N; i++) {
    let s = 1000 + i * 7 + stand.length * 100000;
    const room = new SieveRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
    room.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    let n = 0;
    while (room.state.phase !== "results" && n < 1500) room.onTick(), n++;
    restarts += room.restarts;
    if (room.state.phase !== "results") continue;
    done++; lost += room.lost; well += room.lostWell; ticks += room.ticks; if (!room.restarts) clean++;
  }
  const d = Math.max(1, done);
  console.log(`${stand}: finished ${done}/${N} (${clean} first try, ${(restarts / N).toFixed(1)} restarts a game); final try: ${(lost / d).toFixed(1)} lost (${(well / d).toFixed(1)} over a well), ${(ticks / d).toFixed(0)} ticks (${(((ticks / d) * TICK_MS) / 1000).toFixed(0)} s)`);
}
