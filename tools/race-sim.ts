// Run 5 measurements: how often a holding and a juggling stand-in for the player win each heat,
// and how long the heats take. npx tsx tools/race-sim.ts [games]
import { RaceRoom, type Stand } from "../src/server/race.js";
import { TICK_MS } from "../src/engine/game.js";

const N = Number(process.argv[2] ?? 100);
for (const stand of ["hold", "juggle"] as Stand[]) {
  const won = [0, 0, 0], ticks = [0, 0, 0];
  let total = 0, race = 0, stuck = 0;
  const rate = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    let s = 1000 + i * 7 + (stand === "hold" ? 0 : 500000);
    const room = new RaceRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
    const conn = room.connect(() => {});
    conn.message(JSON.stringify({ t: "hello", name: "Rook" }));
    let n = 0;
    while (room.state.phase !== "results" && n < 4000) room.onTick(), n++;
    if (room.state.phase !== "results") { stuck++; continue; }
    room.state.heatWon.forEach((w, h) => { if (w === 0) won[h]!++; ticks[h]! += room.heatTicks[h]!; });
    room.travel.forEach((t, h) => { rate[h * 2]! += t[0] / room.heatTicks[h]!; rate[h * 2 + 1]! += t[1] / room.heatTicks[h]!; });
    total += n;
    if (room.state.end!.summary!.includes("Rook takes it")) race++;
  }
  const done = N - stuck;
  console.log(`${stand}: Rook wins heat 1 ${pc(won[0]!, done)}, heat 2 ${pc(won[1]!, done)}, heat 3 ${pc(won[2]!, done)}; race ${pc(race, done)}; heats ${ticks.map((t) => (t / done).toFixed(0)).join("/")} ticks; whole run ${((total / done) * TICK_MS / 60000).toFixed(1)} min; stuck ${stuck}`);
  console.log(`   wisp travel, tiles a tick: Rook ${[0, 2, 4].map((k) => (rate[k]! / done).toFixed(2)).join("/")}, Kes ${[1, 3, 5].map((k) => (rate[k]! / done).toFixed(2)).join("/")} (heats 1/2/3)`);
}
function pc(a: number, b: number) { return `${Math.round((100 * a) / Math.max(1, b))}%`; }
