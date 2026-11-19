# 07 · The altars and their maps

Each altar is its own arena. The full tile maps, spawn points and angle heat maps are generated
into [maps/](maps/README.md) from the Vief's Trapdoor emulator's data (see [sources](sources.md)).
This page summarises each one in words.

All six free altars share the same core: a 3 × 3 altar, a 5 × 5 scoring zone, 8 pillars making
one-tile gaps on each cardinal, and 4 corner rocks (see [06](06-angles-and-geometry.md#the-common-layout-every-altar-shares)).
They differ in the outer arena.

| # | Altar | Size class | Spawn points | Spawn distance from centre (min-max, mean) | Notable terrain | Map |
|---|---|---|---|---|---|---|
| 1 | Air | small | 190 | 4-9, 6.2 | Open ring bounded by water; one lone barrier at (−3,−6), probably the tree the Guide mentions (inferred) | [air](maps/air.md) |
| 2 | Mind | **large** | 520 | 7-16, 11.6 | Maze of thin walls (about 100 wall tiles) and mini-pillars; open clearing round the altar, spawns in the outer ring | [mind](maps/mind.md) |
| 3 | Water | small | 331 | 4-15, 8.4 | Irregular island in water; arms reaching 15 tiles east and south; water inside the arena | [water](maps/water.md) |
| 4 | Earth | **large** | 316 | 8-16, 12.2 | Many rocks (165 rock tiles) and boulders; spawns far out | [earth](maps/earth.md) |
| 5 | Fire | small | 180 | 4-11, 6.5 | Extra rocks at (±5,±5); lava ("water" tiles) along the south and north-east edges | [fire](maps/fire.md) |
| 6 | Body | small to medium | 246 | 4-16, 7.1 | Heart-shaped arena with "veins" (barrier tiles) that block orbs; a western lobe | [body](maps/body.md) |
| 7 | Chaos | ? | ? | ? | Members only; has ladders (climbing them abandons the game, fandom wiki) | not in data |
| 8 | Nature | ? | ? | ? | Members only | not in data |

Size class: AnroyRS (2022) says "half the altars are gonna be big altars like the Earth altar...
another half are going to be small altars like this fire altar, water altar, air altar". Heather M's
Mind guide calls Mind "a large altar with lots of angles". The spawn distances confirm it.

## Air (altar 1)

* The first altar of every game and the most open. Spawns are 4 to 9 tiles out, so most orbs are
  within reach of a home square.
* A team on all four home squares can score about **87%** of spawn points without moving
  ([maps](maps/README.md)).
* Hazard: tap-repelling an orb behind the **tree** can leave it unreachable (RS Wiki Guide).
* Upstream test names mention a "portal angle" on Air (the exit-portal area) and pillar-numbered
  glitch-repel spots ("pillar #3", "pillar #5").
* Theoretical solo maximum 98 (RS Wiki trivia). Best recorded solo score found: 44 (ThePuu4, 2026).

## Mind (altar 2)

* The biggest free altar, with 520 spawn points in a walled ring 7 to 16 tiles out, and a clear area
  round the altar. Thin walls and mini-pillars make the outer ring a maze.
* Only about 14% of spawns can be scored from a home square without moving. Most orbs must be
  fetched: walk out, pull the orb through the maze into a home-square angle, and let a teammate
  finish.
* Known glitch: Mind can have 4 or 5 orbs of each colour at once instead of 3 (RS Wiki).
* Upstream test: "Mind scoring trick at (−13,−5)".
* Theoretical solo maximum 48 (RS Wiki trivia).

## Water (altar 3)

* A small central area on an irregular island, with arms reaching 15 tiles east (to (15,−4)) and south (to (1,−15)).
* Water tiles inside the arena let orbs be **pushed out where players cannot follow**. This is one
  of the three altars (Water, Fire, Chaos) where a repelled orb can become "dead" (RS Wiki Guide).
* About 58% of spawns can be scored from home squares without moving.

## Earth (altar 4)

* A large altar full of rocks. Rocks block movement but **not sight**, so orbs are often visible but
  stuck behind boulders.
* Spawns are 8 to 16 tiles out. Only about 10% can be scored from a home square without moving, the
  lowest of all six.
* AnroyRS: Earth is "the bigger one", with "clearly... walls and rocks".

## Fire (altar 5)

* Small and fast (spawns 4 to 11 out), with four extra rocks at (±5, ±5) that make diagonal angles
  awkward.
* Lava edges ("water" tiles) are why Fire is a dead-orb altar.
* Trivia: a barrier placed over the Fire altar's flames puts the fire out (fandom wiki).
* About 79% of spawns can be scored from the four home squares. Best recorded solo: 42 (ThePuu4).

## Body (altar 6)

* A heart-shaped arena whose "veins" are barrier tiles. "You can't tell which veins... will block
  your orbs" (AnroyRS). It is the last free altar.
* About 74% of spawns can be scored from home squares, but the western lobe reaches 16 tiles out.

## Chaos (altar 7, members)

* Not in the emulator data, and no text source describes its layout. It is one of the three altars
  where a repelled orb can be lost for good (RS Wiki Guide).
* It has **ladders**. Climbing them counts as abandoning the game (fandom wiki copy).
* **To capture:** play it and record tile positions, or take positions from the Wrestling Science
  and ThePuu4 videos ([videos.md](videos.md)).

## Nature (altar 8, members)

* Not in the emulator data and not described in text. Best recorded solo score: 42 (ThePuu4,
  2026).

## How to add Chaos and Nature

The JSON format is documented in [data/README.md](../data/README.md). Add a `chaos.json` /
`nature.json` with a 53 × 53 `rows` grid and a `spawns` list, add the name to `ALTARS` in
`tools/gop_engine.py`, and run `python3 tools/angle_atlas.py`.

Next: [08 · Scoring and rewards](08-scoring-and-rewards.md).
