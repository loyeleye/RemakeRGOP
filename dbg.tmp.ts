import { SHRINES } from "./src/engine/maps.ts";
import { Game } from "./src/engine/game.ts";
import { botCommand } from "./src/engine/bot.ts";
const s = SHRINES.find((x) => x.id === process.argv[2])!;
const g = new Game(s, [{ id: 1, guild: 0, name: "A" }], 3);
for (let t = 0; t < 60; t++) {
  const cmd = botCommand(g, 1, { pushy: 0, sloppiness: 0 });
  if (cmd) g.command(1, cmd);
  g.step();
  const p = g.players[0]!;
  if (t % 3 === 0) console.log(t, "me", p.pos, p.action.kind, JSON.stringify(p.action), "wisps", g.wisps.filter(w=>w.guild===0).map((w) => `${w.pos.x},${w.pos.y}`).join(" "), g.scores);
}
