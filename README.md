# Lanternfall

Two lamplighter guilds, **Dawn** and **Dusk**, steer drifting wisps into a shrine's brazier with
lodestone staffs that pull or push. Every 0.6 s is one tick, and a round lasts 200 ticks (about
2 minutes). You can play 1v1 up to 4v4 in a browser on a phone or a computer, and fill empty
seats with bots.

The game is original. Its tick-based engine is inspired by the rules of RuneScape's Great Orb
Project minigame: a fixed tick clock, wisps that step one tile per tick, line-of-sight reach,
attract/repel, and rules for who holds a contested wisp. No code, maps or art come from that
game or from [yongyi781/great-orb-project](https://github.com/yongyi781/great-orb-project).
See [docs/design.md](docs/design.md).

## Play locally

```bash
npm install
npm start            # http://localhost:8787
```

To play from a phone on the same Wi-Fi, open `http://<your-computer's-LAN-IP>:8787`.
**Create a room** shows a 4-letter code and an **Invite** link. **Practice alone** runs a whole
round in the page against a bot, with no server needed.

### Controls

| | Phone | Desktop |
|---|---|---|
| Reach for a wisp | tap it (or near it) | click it |
| Walk | tap the ground | click the ground |
| Pull / Push | right thumb button | **Q** |
| Run / Walk | left thumb button | **R** |
| Stop | | **Space** |
| Look around | drag, pinch, or tap the mini-map | wheel to zoom |
| Back to me | double-tap or ◎ | **C** or ◎ |

## Deploy (Cloudflare)

`npm run cf:deploy` publishes a Worker with one Durable Object per room code. That object runs
the authoritative 600 ms clock. Static files come from `dist/`. `npm run cf:dev` runs the same
setup locally.

## Code

| Path | What |
|---|---|
| `src/engine/` | The deterministic tick engine (`game.ts`), the grid (`board.ts`), the shrines (`maps.ts`), the bot (`bot.ts`) and the wire protocol. Shared by the server, the client and the tests. |
| `src/server/room.ts` | One room (lobby, countdown, round, results), independent of the transport. |
| `src/server/node.ts` | Node server: static files plus `ws`. |
| `cloudflare/worker.ts` | Worker plus the `RoomObject` Durable Object. |
| `src/client/` | Canvas client: camera, touch input, HUD and lobby. |
| `public/sprites/` | Sprites generated with Sogni (see [CREDITS.md](CREDITS.md)). |
| `tests/` | Vitest: engine rules, shrines, room flow, and bot rounds on every shrine. |
| `tools/smoke.cjs` | Playwright smoke test: a desktop player and a phone player in one room. |

```bash
npm test          # engine + room tests
npm run typecheck
```
