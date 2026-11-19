# Lanternfall design notes

## The tick

Everything happens in `Game.step()`, once per 600 ms tick, in this order:

1. **Wisps move.** Each wisp with a target steps one tile toward it (diagonals allowed, no corner
   cutting). If the diagonal is blocked it slides along x, then y. Otherwise it stops. A wisp on
   the **rim** (within 2 tiles of the brazier centre) stops. After 1 tick there, staffs on it let
   go. After 2 ticks it is **banked** for its guild and respawns at a random spawn of that guild.
2. **Lamplighters act**, in join order, on the latest command each one sent during the tick:
   - **Walk:** follow a shortest 8-way path, 1 tile per tick, or 2 when running.
   - **Staff on a wisp:** if the wisp is in reach (Chebyshev ≤ 10 for pull, ≤ 8 for push, with
     line of sight), touch it. Otherwise walk toward it. A tick spent walking can't touch, so
     after walking into reach the touch lands the tick after.
   - A **touch** sets the wisp's target up to 2 tiles along the line from the lamplighter. The
     line is snapped to 16 directions by its slope. A pull stops one tile short of the puller and
     a push goes the opposite way. Holding the action re-touches every tick.
3. **Control:** a touched wisp is *Held*. Each quiet tick moves it on through *Easing* and
   *Loose* to *Free*. A wisp in flight can't be taken by another lamplighter. A standing wisp
   goes to whoever joined the round first, until it has been loose for 2 ticks. A lamplighter who
   loses that tie *slips* and their staff does nothing until they click again.

Because staffs act after wisps move, a touch shows up as movement on the next tick. That
one-tick latency is what the 600 ms clock is about. Phones benefit too: a tap only has to arrive
before the next tick.

Pull works only on your own guild's wisps. Push works on any wisp. The usual play is to stand
on the rim across from a wisp and pull it over the brazier. A pull stops one tile short of
you, so pulling from the near side parks the wisp just outside the rim.

## Tiles

| Tile | Walk | Wisp | Sight |
|---|---|---|---|
| Floor | ✓ | ✓ | ✓ |
| Shrine wall `#` | ✗ | ✗ | ✗ |
| Boulder `o` | ✗ | ✗ | ✓ |
| Pool `~` | ✗ | ✓ | ✓ |
| Brazier (3×3) | ✗ | ✓ | ✓ |

Shrines are drawn as the northern half in ASCII (`src/engine/maps.ts`). The southern half is
that drawing turned 180°, with Dawn and Dusk swapped, so neither guild gets the better side.
New shrines are new drawings.

## Multiplayer

- The server is authoritative. Clients send commands (`act`) whenever they like. The room
  applies the latest command per player on each tick and broadcasts a full snapshot. A snapshot
  is small: at most 8 players and 4 wisps. Clients draw each move between the previous and
  current positions over the tick.
- The room (`src/server/room.ts`) doesn't depend on the transport. Node + `ws` runs it locally.
  Cloudflare runs one Durable Object per room code. The browser runs it for Practice.
- Reconnecting: each seat has a token kept in `sessionStorage`. Reloading mid-round takes the
  same seat back.

## Look

The shrine is a flagstone plaza on a floating plateau in a bright daytime sky. The plateau is
generated (`src/client/islands.ts`): an irregular outline with headlands, a grassy terrace
below the cliff, lower tiers stepping off its sides, ragged rock spires hanging underneath and
waterfalls pouring into the cloud sea. Smaller islands drift around it. Everything is smooth
shaded with enough segments that nothing reads as faceted. The brazier sits on a stepped dais.
Wisps are glowing orbs that cast their own light. Lamplighters, the brazier, the obelisks
(shrine walls) and the boulders are Sogni Pixal3D models; the floors are Sogni textures.
Everything else is procedural geometry and shaders. Bloom and ACES tone mapping give the glow.
Phones and low-core devices drop antialiasing and shadows, render bloom at half resolution
and build fewer islands.

The camera looks down at 56°. Zooming out past the plaza tips it toward the horizon (down to 28°) so you can take in the whole island. Taps are picked by casting a ray onto the ground plane, so touch
targeting works the same as it did in 2D.

## Phones

- Below 640 px on the short side, the camera follows you at about 13 tiles across. You can
  pinch to zoom, drag to look around, double-tap or ◎ to return, and tap the mini-map to jump.
- A tap within 1.3 tiles of a wisp counts as a tap on that wisp. Wisps your staff can affect
  right now win ties.
- Pull/Push and Run/Walk are thumb buttons.

## Roadmap (agreed with Ladi: core first, these as follow-up PRs)

- **Story mode:** solo chapters on story-only shrines with their own twists (bank N wisps in T
  ticks, a wandering rival, moving pools). `bot.ts` is the starting point for opponents.
- **More shrines:** new maps are data. Ideas: a shrine with two braziers, one with a narrow
  wall maze.
- **Cosmetics:** lantern flames exist now (6 colours, visual only). Next: robe trims and staff
  heads as Sogni sprites.

## Licensing note

yongyi781/great-orb-project has no license. Its author has told Ladi it's fine to use it
non-commercially. To keep selling the game possible, Lanternfall's engine is written from the
rules alone, and none of that repo's code, maps or art is copied.
