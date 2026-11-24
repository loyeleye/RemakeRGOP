// Measurements for run 9: a careful stand-in plays Rook on a few seeds. npx tsx tools/rescue-sim.ts [seeds] [stand]
import { RescueRoom, type Stand } from "../src/server/rescue.js";

const seeds = Number(process.argv[2] ?? 12), stand = (process.argv[3] ?? "hold") as Stand;
for (let k = 1; k <= seeds; k++) {
  let s = k * 7919;
  const room = new RescueRoom({ every: () => () => {} }, () => (s = (s * 48271) % 2147483647), stand);
  if (process.argv[4] === "drag") room.patchMode = "drag";
  const said: string[] = [];
  room.connect((m) => m.t === "say" && said.push(...m.lines.map((l) => `${room.state.game.tick}:${l.text.slice(0, 18)}`))).message(JSON.stringify({ t: "hello", name: "Rook" }));
  const marks: string[] = [];
  let had = false, crossed = 0;
  for (let n = 0; n < 3000 && room.state.phase !== "results"; n++) {
    room.onTick();
    const st = room.state;
    if (!!st.patch !== had) (had = !!st.patch), marks.push(`${had ? "in" : "out"}@${st.game.tick}(${room.lostToPatch})`);
    if (st.kesDark) crossed++;
  }
  const st = room.state;
  console.log(`seed ${k}: ${st.phase} ticks ${room.ticks} restarts ${room.restarts} banked ${st.game.scores.join("+")} lost ${room.lost} (patch ${room.lostToPatch}) kesDark ${crossed} cloud ${st.game.cloudAt} patch ${marks.join(" ")} stills ${room.stillsShown.join(",")}`);
  if (process.argv[5]) console.log("   " + said.join(" | "));
}
