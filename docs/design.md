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

Every brazier stands inside a square ring of archways (`rings` on each shrine, `ringWalls` in
`maps.ts`). Pillars block walking, wisps and sight, so a wisp has to come in through a gap. Each
style is drawn along one side and turned 90° for the others, so it is fair to 2 or 4 guilds:

| Style | Layout | Plays | Islands |
|---|---|---|---|
| gates | pillars all round, a 3-wide gate mid-side | tight | Old Bastion (radius 6) |
| open | gates plus open corners | loose | Crystal Spire, Blossom Garden |
| diagonals | mid-sides walled, corners open | medium | Tidepool Steps, Cascade Falls |
| pillared | open, with a lone pillar on each corner | medium | Misty Stones, Castle Rise |
| pinwheel | gates pushed off centre, the same way round | medium, no straight shot across | Ember Quarry, Night Glade |
| colonnade | a pillar on every other tile | loose, many narrow ways in | Moss Hollow, Glacier |
| two rings | outer gates (radius 9), inner diagonals (radius 5) | very tight | Sunwell Terrace |

A blocked wisp slides along the obstacle on the axis it still has further to go; if that's a tie
it stops, so no direction is favoured on four-guild islands. The perfect-aim bot banks, alone in
a round: about 4 on Sunwell Terrace, 5 on Old Bastion and Misty Stones, 7 to 9 on most islands,
and 10 on Moss Hollow (it banked 9 to 24 before the archways and bigger islands).

## Tiles

| Tile | Walk | Wisp | Sight |
|---|---|---|---|
| Floor | ✓ | ✓ | ✓ |
| Shrine wall `#` | ✗ | ✗ | ✗ |
| Boulder `o` | ✗ | ✗ | ✓ |
| Pool `~` | ✗ | ✓ | ✓ |
| Brazier (3×3) | ✗ | ✓ | ✓ |
| Open sky (past the island's edge) | ✗ | ✗ | ✓ |
| Ice `*` | slides | ✓ | ✓ |

**Ice.** A lamplighter who starts a tick on ice slides one tile the way they last stepped, and
that slide is their whole tick. They keep sliding until they leave the ice or something blocks
them, then their order carries on. Wisps float over ice as if it were floor.

## Islands

Twelve shrines, each with its own arena shape (round glade, wide atoll, hourglass, six-point star,
long strip, cross, four-petal clover, bastioned square, diagonal ridge, jagged floe, and two big
low-scoring ones: a ruined fortress and a terrace with two rings of arches) and a
layout drawn for that shape, plus its own island look (`src/client/themes.ts`): palette, sky, light, what
its walls and boulders are drawn as, set pieces on the far verge and the lower tiers, and
drifting particles.

| Shrine | Island | Walls `#` | Boulders `o` | Set pieces | Particles |
|---|---|---|---|---|---|
| Moss Hollow | Grove | monoliths | boulders | trees, a pond tier | pollen |
| Tidepool Steps | Lagoon | monoliths | boulders | palms, streams | |
| Ember Quarry | Volcano | basalt monoliths | boulders | a volcano with lava runs, lava pools | embers |
| Crystal Spire | Crystal | crystal clusters | small crystals | giant crystals | sparkles |
| Cascade Falls | Cascade | monoliths | boulders | rock crags with waterfalls | mist |
| Misty Stones | Misty | standing stones | standing stones | stone blocks in pools, blue mist | mist |
| Blossom Garden | Blossom | monoliths | flower beds | giant flowers | petals |
| Castle Rise | Castle | ramparts | boulders | a small castle, towers | |
| Night Glade | Night | glowing trees | boulders | a giant glowing tree, glowing ponds | fireflies |
| Glacier | Glacier | ice spires | ice rocks | ice peaks, ice patches you slide on | snow |
| Old Bastion | Bastion (big) | ramparts | boulders | towers and broken ramparts, sunset | pollen |
| Sunwell Terrace | Sunwell (big) | monoliths | boulders | palms, stone blocks, golden sky | sparkles |

Shrines are drawn as the northern half in ASCII (`src/engine/maps.ts`). The southern half is
that drawing turned 180°, with Dawn and Dusk swapped, so neither guild gets the better side.
New shrines are new drawings. The drawing is scaled up 1.5x when the shrine is built (`MAP_SCALE`):
pools, ice and walls grow, while spawns, starts and boulders stay single tiles at their scaled
spots. Then the archway ring is added; any spawn or start inside it moves out along its ray.

**Three or four guilds** play on the shrine's four-way version (`shrineFor(id, teams)`). One
quarter of the two-guild layout (west of the centre column, from the brazier row up) is turned
90° three times, and Dawn's spawns and start in it become Dusk's, Tide's and Grove's in turn.
If that quarter has fewer than two spawns, the source is turned a quarter first. The coastline
is the wider of the shape and the shape turned 90°, so it is the same from all four sides. With
three guilds one side stays empty.

Each shrine is an island. Its `isle` setting gives a coastline: a radius per angle built from
a base superellipse (stretched and turned as needed), big even "waves" that make the shape
(k=2 an hourglass, 4 a cross or clover, 6 a star), and small coves and headlands. Every tile whose centre falls outside the coastline becomes open
sky, and the grid is cropped to the land plus one ring of sky.
The coastline uses only even harmonics, so it is identical turned 180°. A coastline that
would cut off a spawn or start is rejected when the shrine is built. The renderer lays the
flagstones, the parapet and the island mesh along the same coastline, so what you see is
exactly where you can go.

## Multiplayer

- The host picks 2, 3 or 4 guilds in the lobby (`{t: "teams"}`), up to 4 lamplighters each.
  New players join the smallest guild. Dropping to fewer guilds moves people off the guilds
  that went; bots that don't fit leave. The room view carries `teams`, and `lastScores` has one
  score per guild. Tide reuses Dusk's robe and Grove reuses Dawn's, re-dyed.
- The server is authoritative. Clients send commands (`act`) whenever they like. The room
  applies the latest command per player on each tick and broadcasts a full snapshot. A snapshot
  is small: at most 16 players and 8 wisps. Clients draw each move between the previous and
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
- **More shrines:** twelve islands are in. New maps are data plus a theme. Ideas: a shrine with
  two braziers, one with a narrow wall maze.
- **Cosmetics:** lantern flames exist now (6 colours, visual only). Next: robe trims and staff
  heads as Sogni sprites.

## Licensing note

yongyi781/great-orb-project has no license. Its author has told Ladi it's fine to use it
non-commercially. To keep selling the game possible, Lanternfall's engine is written from the
rules alone, and none of that repo's code, maps or art is copied.
