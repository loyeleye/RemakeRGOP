# Lanternfall design notes

## The tick

Everything happens in `Game.step()`, once per 600 ms tick, in this order:

1. **Wisps move.** Each wisp with a target steps one tile toward it (diagonals allowed, no corner
   cutting). If the diagonal is blocked it slides along the axis it still has further to go
   (a tie stops it). Otherwise it stops. A wisp on
   the **rim** (within 2 tiles of the brazier centre) stops. After 1 tick there, staffs on it let
   go. After 2 ticks it is **banked** for its guild and respawns on a random tile of the shrine's **spawn field**.
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
| open | gates plus open corners | loose | Crystal Spire, Blossom Garden, Fairy Ring |
| diagonals | mid-sides walled, corners open | medium | Tidepool Steps, Cascade Falls |
| pillared | open, with a lone pillar on each corner | medium | Misty Stones, Castle Rise |
| pinwheel | gates pushed off centre, the same way round | medium, no straight shot across | Ember Quarry, Night Glade |
| colonnade | a pillar on every other tile | loose, many narrow ways in | Moss Hollow, Glacier |
| two rings | outer gates (radius 9), inner diagonals (radius 5) | very tight | Sunwell Terrace |

A blocked wisp slides along the obstacle on the axis it still has further to go; if that's a tie
it stops, so no direction is favoured on four-guild islands.

## Scoring rate (tuned toward the Great Orb Project)

Each guild has **3 wisps** (`WISPS_PER_GUILD`), like GOP's 3 orbs per colour. Wisps appear on a
**spawn field** shared by every guild: every floor tile a set distance from the brazier centre
that a wisp could be pulled in from (`spawnBand`, default 6 to 10 tiles; Old Bastion 14 to 30,
Sunwell Terrace 16 to 90). GOP does the same with about 200 fixed spawn tiles per altar, many
4 to 9 tiles out, which is why a GOP expert barely walks. The drawn `a`/`b` marks are kept as a
fallback.

**Fairy Ring** is the record map: a small round glade, the open archway style, four boulders
and nothing else, with wisps spawning only 6 to 8 tiles out (`spawnBand: [6, 8]`). The
ceiling is about 98: a round is 200 ticks, you can touch one wisp per tick, and even the
closest spawn needs 2 touches (2 tiles each) to reach the rim, after which it banks by itself
while you work the next. With average spawn luck it's more like 60 to 70. The greedy tapping
bot gets about 30.

**Bot levels** (`BOT_LEVELS`; the host picks one in the lobby for new bots):

- **Easy:** plays like Medium, but stops to think for a random 3 to 12 ticks before each new
  move.
- **Medium:** pulls only, along the 4 straight directions whenever a straight pull helps,
  dawdles often, never pushes.
- **Hard:** walks to the best spot for its nearest wisp and holds it in, and pushes a rival wisp
  that's about to bank, but half its decisions are Medium ones. It never taps: juggling
  several wisps with taps is a human-only trick.

  With other Hard bots in its guild it plays as a team (only Hard bots do). Half of them,
  rounded up, hold home squares: tiles in or by the court that the most spawns can be pulled
  across the brazier from. A home-square bot pulls in whatever it can bank from there and waits
  while a teammate is bringing one, and otherwise goes and fetches one itself. The rest fetch:
  each sticks to one wisp nobody else is working on, and pulls it where a home square can
  finish it if that's quicker. Like the rest of Hard's judgment the teamwork lapses: 70% of
  its decisions are solo ones. That leaves a pair of Hard bots banking about 1.25 times what
  two solo Hard bots do (with no lapses it was about 1.8 times).

  A team of two coords by halves on the smaller shrines, like pairs do in the orb game: each
  takes the half of the shrine opposite the other and moves about inside the archways there.
  At the start the bot heads straight for the far side, across the brazier from where its
  guild starts (split along whichever axis its partner is further out on).
  From its half it pulls in wisps on its partner's side, over the rim. A wisp on its own side
  that's out of its partner's reach it pulls in until the partner can reach it, so the partner
  never has to leave their half. If its partner lingers (5 ticks) somewhere that calls for a
  different split, on its half, or clearly out to the north or south when they're splitting
  east-west (or the other way round), it adapts and takes the half opposite them.
  On the big shrines (Old Bastion, Sunwell Terrace), where wisps appear far out, it uses home
  squares and fetching instead. A Hard bot teamed with a person never lapses out of teamwork,
  and it never goes after a wisp a teammate is pulling.

Alone over a round, Easy banks about 2 to 5 on the regular islands, Medium 7 to 12, Hard 9 to
16. On Old Bastion and Sunwell Terrace, Easy banks about 1 and the others 2 to 5. A human who
taps can beat Hard.

The perfect bot (taps, no mistakes) **taps**: from where it stands it touches whichever of its wisps
is about to stop and would get closer to banking, so several stay moving, and it walks only
when none can be brought in from there. Alone, over a round, it banks about 20 to 27 on the
small open islands (Blossom Garden, Crystal Spire, Misty Stones, Moss Hollow, Castle Rise), 12
to 21 on the rest, and 4 to 6 on Old Bastion and Sunwell Terrace. GOP records for a solo
human are 42 to 44 on small altars; a human who learns the angles should beat the bot.

## Tiles

| Tile | Walk | Wisp | Sight |
|---|---|---|---|
| Floor | ✓ | ✓ | ✓ |
| Shrine wall `#` | ✗ | ✗ | ✗ |
| Boulder `o` | ✗ | ✗ | ✓ |
| Pool `~` | ✗ | ✓ | ✓ |
| Brazier (3×3) | ✗ | ✓ | ✓ |
| Open sky (past the island's edge) | ✗ | ✗ | ✓ |
| Ice `*` | slides | skates | ✓ |
| Rime `%` | ✓ | skates | ✓ |
| Crystal mirror `/` `\` | ✗ | turned | ✓ |

**Ice.** A lamplighter who steps onto ice loses their footing: each tick they slide one tile the
way they were going, glancing off things like a wisp, until something stops them or they're off
the ice; then their order carries on. Paths plan for it: a step onto ice counts as the whole slide.

**Skating (experimental).** A pull beats the ice: while a staff is on a wisp it goes where it's
pulled, ice or not. The tick nobody touches a wisp on ice, it skates on the way it last moved,
glancing off scenery, until it leaves the ice or stops. Rime (unused for now) is frosted ice that
boots grip, so it only affects wisps.

**Crystal mirrors (experimental).** A thin mirror on its tile's diagonal. A wisp that would step
into one is turned off the mirror (heading east into `\` turns south), takes its first step the
new way, and flies straight on for up to 8 tiles (or until something stops it or it reaches the
rim); every staff on it lets go.

**Team pull (experimental).** When teammates pull the same wisp on the same tick, it heads for
the average of their positions, at the normal speed. A teammate who loses reach or sight walks to
get it back as usual, and drops out of the average until they touch it again.

## Shrine gimmicks (experimental)

| Shrine | Gimmick |
|---|---|
| Tidepool Steps | A third of wisps appear far out (11 to 15 tiles) and some appear right on the pools. Big tide pools sit on the way in at the corners and outside each wall, and each wall has a 3-tile gate in the middle as well as the open corners. The tide turns every 20 ticks (the HUD shows which way and how long). While it comes in, a loose wisp on a pool drifts a tile a tick toward the brazier; while it goes out, away. |
| Blossom Garden | Petal paths (`+`) out from each gate and corner: a wisp crossing one moves 2 tiles a tick. |
| Night Glade | Half the wisps appear far out (10 to 14 tiles from the brazier). Linked moon ponds: a wisp that flies into one comes out of its twin across the brazier, still heading the same way, flies 3 tiles on and is let go. |
| Cascade Falls | The stream runs clockwise round the brazier: a loose wisp on water drifts a tile a tick along it. |
| Ember Quarry | Vents (`^`) in a pinwheel on each arm erupt every 5 ticks: a wisp sitting on one is thrown 6 tiles toward the brazier, out of every staff's grip. |
| Castle Rise | Portcullises (`=`) in the east and west archways open for 10 ticks, then those shut and the north and south ones open. A shut portcullis is a wall. |
| Misty Stones | Four mist banks drift round the brazier (a lap every 150 ticks). You can't see a wisp through or inside one from more than 2 tiles off, so you can't reach it. Walkers and wisps pass through. |
| Moss Hollow | Moss (`&`) holds wisps back like a boulder, but you walk through it. Each fresh tap on a wisp it's holding back tears at the tuft in the way; the second tap clears it. Every 6 ticks moss spreads or takes root somewhere out in the field (the same on every side), up to 64 tufts. |
| Old Bastion | Each closed corner of the gatehouse has a shortcut gate (`=`) that opens while someone stands on that quarter's pressure plate (`_`). The middle arches are always open, so you never need a plate to score. |
| Sunwell Terrace | Bands of sun glyphs cross the arms every 10 wisp moves from 20 out. A wisp left resting on one is relayed 8 tiles in, two a tick, the short way toward the brazier. |

## Glancing angles (experimental)

In the Great Orb Project about 3 in 4 scoring pulls from a home square bounce off scenery on the
way in (Air, Fire, Body and Water measured with `tools/gop_engine.py`); on our open archways it
was about 1 in 4 to 1 in 3. Three shrines try a different fix each:

| Shrine | Mechanic | Shots that glance | Home-square coverage |
|---|---|---|---|
| Fairy Ring | toadstool deflectors on the court diagonals (3, 3), posts beside each gate | 59% | 100% |
| Crystal Spire | 8 crystal mirrors out among the spawns at (7, 2), angled to send a wisp in through a gate: 77% of spawns can be banked with a mirror shot from somewhere | 40% | 71% |
| Glacier | a round sheet of ice round the rim (radius 4.6; the court's corners stay dry). Let go of a wisp on it and it skates; step on it and so do you | - | - |

Glacier also sends 1 wisp in 5 to a farther band (10 to 14 tiles out).

## Islands

Thirteen shrines, each with its own arena shape (round glade, wide atoll, hourglass, six-point star,
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
| Fairy Ring | Fairy (moonlit) | pink columns with star lanterns | glowing hydrangeas | glittering blossom trees, mushroom lamps, hyacinths, the moon, shooting stars; star lanterns crown the archways | sparkles |
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

**Sunwell Terrace** is a kraken: a small core with five long arms (`arms` in `isle`) that curl
out up to about 50 tiles, so most wisps spawn far down an arm and a team has to relay them home.
It isn't symmetric; what keeps it fair is that every guild shares the same spawn field. Each arm
splits and rejoins (`forks`), and some arms are bridged to their neighbours (`links`), so bringing
a wisp in is a run of small route choices:

- **Forks:** where an arm splits, one branch is the short way but cluttered with boulders, short
  walls and ice (`clutter`), and the other is longer and clear. A wisp on the cluttered branch
  needs angled pulls round the obstacles; on the clear one it needs more pulls.
- **Bridges:** four links join neighbouring arms near their far ends, so a far wisp can be
  brought round through a neighbouring arm, or a teammate can cut across to meet it.
- Loops leave holes of open sky inside the island; the renderer traces them from the same
  coastline and draws a curb round each.

Clutter is scattered with a fixed seed, and a test checks that every spawn tile stays within
walking reach.

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
- On touch screens a pad replaces the old thumb buttons, so you can play without tapping the
  map: a stick on the left walks you in 8 directions (let go to stop), and on the right a big
  Staff button works the ringed wisp, Next picks another, and Pull/Push and Run/Walk toggle.
  The ringed wisp is the nearest you can work in the current mode until you pick one.
  Tapping the map still works.
- On a computer: scroll or + / − to zoom, drag or arrow keys to look around, C to come back.

## Roadmap (agreed with Ladi: core first, these as follow-up PRs)

- **Story mode:** solo chapters on story-only shrines with their own twists (bank N wisps in T
  ticks, a wandering rival, moving pools). `bot.ts` is the starting point for opponents.
- **More shrines:** thirteen islands are in. New maps are data plus a theme. Ideas: a shrine with
  two braziers, one with a narrow wall maze.
- **Cosmetics:** lantern flames exist now (6 colours, visual only). Next: robe trims and staff
  heads as Sogni sprites.

## Licensing note

yongyi781/great-orb-project has no license. Its author has told Ladi it's fine to use it
non-commercially. To keep selling the game possible, Lanternfall's engine is written from the
rules alone, and none of that repo's code, maps or art is copied.
