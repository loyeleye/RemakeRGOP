// Measurements for run 10: a stand-in plays Rook on a few seeds.
// npx tsx tools/ship-sim.ts [seeds] [hold|idle] [key=value ...]   e.g. wind=2 patch.gain=0.3 stand.sloppiness=0.4
import { SHIP } from "../src/engine/shiphome.js";
import { ShipRoom, type Stand } from "../src/server/shiphome.js";

for (const kv of process.argv.slice(4)) {
  const [k, v] = kv.split("=");
  const path = k!.split(".");
  let o = SHIP as unknown as Record<string, unknown>;
  for (const part of path.slice(0, -1)) o = o[part] as Record<string, unknown>;
  o[path.at(-1)!] = Number(v);
}

const seeds = Number(process.argv[2] ?? 12), stand = (process.argv[3] ?? "hold") as Stand;
for (let k = 1; k <= seeds; k++) {
  let s = k * 7919;
  const room = new ShipRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  room.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
  const trace: string[] = [];
  let all = 0, firstLoss = -1;
  for (let n = 0; n < 4000 && room.state.phase !== "results"; n++) {
    room.onTick();
    all++;
    if (room.restarts && firstLoss < 0) firstLoss = all;
    if (room.state.phase === "playing" && room.state.game.tick % 25 === 0) trace.push(room.state.lead.toFixed(1));
  }
  console.log(`seed ${k}: ${room.state.phase} ticks ${all} restarts ${room.restarts}${firstLoss >= 0 ? ` (first at ${firstLoss})` : ""} banked ${room.banked} lost ${room.lost} nearest ${room.nearest.toFixed(1)} farthest ${room.farthest.toFixed(1)} lead ${trace.slice(-8).join(" ")}`);
}
