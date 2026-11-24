// Run 10: one line a stand-in, for a set of feel numbers. npx tsx tools/ship-sweep.ts [seeds] [key=value ...]
// Env: OFF=speed,banks,hauls (parts turned off), LEN=200, STAND=hold|rails|port|idle (hold stays amidships, rails runs to whichever rail, port never leaves the port rail), SLOPPY=0.08,0.5 (one line each), FAR=7 (the farthest lane, as on a phone held upright), NODRAW=1.
import { SHIP } from "../src/engine/shiphome.js";
import { ShipRoom, type Stand } from "../src/server/shiphome.js";

const seeds = Number(process.argv[2] ?? 8);
for (const kv of process.argv.slice(3)) {
  const [k, v] = kv.split("=");
  const path = k!.split(".");
  let o = SHIP as unknown as Record<string, unknown>;
  for (const part of path.slice(0, -1)) o = o[part] as Record<string, unknown>;
  o[path.at(-1)!] = Number(v);
}
for (const sloppy of (process.env.SLOPPY ?? "0.08,0.3,0.5,0.7").split(",").map(Number)) {
  (SHIP.stand as { sloppiness: number }).sloppiness = sloppy;
  const sl = sloppy;
  let restarts = 0, clean = 0, end = 0, near = 0, far = 0, banked = 0, lost = 0, torn = 0, fire = 0;
  const at: number[] = [0, 0, 0, 0, 0, 0];
  for (let k = 1; k <= seeds; k++) {
    let s = k * 7919;
    const room = new ShipRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), (process.env.STAND ?? "hold") as Stand);
    if (process.env.FAR) room.far = Number(process.env.FAR);
    room.sloppy = sl;
    if (process.env.NODRAW) room.draws = false;
    const off = (process.env.OFF ?? "").split(",");
    if (off.includes("speed")) room.speedOn = false;
    if (off.includes("banks")) room.banksOn = false;
    if (off.includes("hauls")) room.haulsOn = false;
    if (process.env.LEN) room.len = Number(process.env.LEN);
    room.connect(() => {}).message(JSON.stringify({ t: "hello", name: "Rook" }));
    for (let n = 0; n < 6000 && room.state.phase !== "results"; n++) {
      room.onTick();
      if (room.restarts === 0 && room.state.phase === "playing") [30, 60, 80, 100, 110, 118].forEach((t, i) => room.state.game.tick === t && (at[i]! += room.state.lead / seeds));
    }
    restarts += room.restarts;
    if (!room.restarts) clean++;
    end += room.state.lead / seeds;
    near += room.nearest / seeds;
    far += room.farthest / seeds;
    banked += room.banked / seeds;
    lost += room.lost / seeds;
    torn += room.torn / seeds;
    fire += room.fireSum / Math.max(1, room.ticks) / seeds;
  }
  console.log(`sloppy ${sloppy}: first try ${clean}/${seeds}, restarts ${restarts}, banked ${banked.toFixed(0)} lost ${lost.toFixed(0)} torn ${torn.toFixed(1)}, fire ${fire.toFixed(2)}, lead at 30/60/80/100/110/118 ${at.map((x) => x.toFixed(1)).join(" ")}, end ${end.toFixed(1)}, nearest ${near.toFixed(1)}, farthest ${far.toFixed(1)}`);
}
