# 06 · Angles and geometry

"Angles" are what separate a beginner from a good GOP player. This page explains what an angle is,
why there are only 16 of them, and how to read the generated angle maps for every altar in
[maps/](maps/README.md).

## What players mean by "an angle"

An **angle** is a combination of *where you stand* and *where the orb is* such that pressing
attract (or repel) sends the orb into the scoring zone in a clean path, without it stalling on a
pillar or parking beside you. Guides teach angles as "stand here, click that orb, it goes in".
Examples:

* "Stand behind one of the pillars so that I can attract the green orb into this little archway"
  (AnroyRS, 2022 commentary, about 5:09).
* "Stand behind one of the [pillars] and then attract the orb to you diagonally" (same video,
  about 12:39).
* Tip.It: if an orb sits between the standing stones, attract it from the **opposite** side of the
  altar.
* Carousers: "Orbs move along direct (perfectly straight) paths", so first set the orb on a clean
  row or diagonal.

## Why there are exactly 16 headings

From the engine ([05 §2.3](05-tick-engine.md#23-the-angle-rule-where-a-click-sends-an-orb)): the
server does not aim the orb straight at you. It looks at the **slope** between you and the orb and
picks one of five buckets:

```text
slope |dy/dx|     orb is aimed at (relative to itself, toward you)
  > 2             (0, 2)    straight           V
  (1, 2]          (1, 2)    steep knight       v
  = 1             (2, 2)    diagonal           X
  [1/2, 1)        (2, 1)    shallow knight     h
  < 1/2           (2, 0)    straight           H
```

Mirror these into all four quadrants and you get 16 headings: N, S, E, W, the 4 diagonals, and 8
knight-like ones such as "2 north, 1 east". **Every angle in GOP is one of these 16 headings,
applied from a particular tile.** The bucket picture, with your possible standing tiles round an
orb, is in [maps/angle-rule.md](maps/angle-rule.md).

### How a knight heading moves

A knight target such as (1,2) is reached by one diagonal step and then one straight step (the
orb clamps each axis to ±1 per tick). If you keep holding, it is re-aimed every tick, so its path is
a staircase that drifts towards the straight or diagonal line through you:

```text
orb O at (3,6), you P at (0,0), holding attract (open ground)

 y
 6  . . . O        slope 6/3 = 2      -> "v": aim (−1,−2): step diagonal
 5  . . o .        slope 5/2 = 2.5    -> "V": aim ( 0,−2): step straight
 4  . . o .        slope 4/2 = 2      -> "v"
 3  . o . .        slope 3/1 = 3      -> "V"
 2  . o . .        slope 2/1 = 2      -> "v": aim clamped to (0,−1)
 1  . o . .        slope 1/1 = 1      -> "X", but clamped: stops beside you at (1,1)
 0  P . . .
    0 1 2 3  x
```

## The five geometric facts every angle relies on

1. **The scoring zone is a 5 × 5 square**, corners included, round a 3 × 3 altar. An orb only
   has to *touch* that square.
2. **Attract stops the orb next to you.** If you stand on the home square N (0,2) and pull an orb
   from the north, it parks at (0,3), outside the zone, and does not score. You score orbs that come
   **along the side** of the altar you are on, or **across** the altar. Hence "don't get between
   orbs and the altar".
3. **Blocked diagonals slide.** When a diagonal step is blocked, the orb tries the x step, then
   the y step. Orbs hitting the altar block from an angle slide along it into the zone. Orbs
   hitting a pillar from the wrong side stall.
4. **You can see across the altar.** The altar is "rock", which blocks movement but not sight. So
   from S (0,−2) you can attract orbs on the far (north) side, and they run into the altar and
   slide into the zone.
5. **Sight is not mirror-symmetric.** Thanks to the line-of-sight routine's octant reflections and
   tie-break quirks, a pillar can hide an orb that is "3 west, 6 north" while the mirror orb
   "3 east, 6 north" stays visible (or the reverse). Angles must be learned separately for each
   side.

## The common layout every altar shares

All six altars in the emulator data share the same core round the altar (coordinates with the
altar centre at (0,0)):

```text
          y
          5   .  .  .  .  .  .  .  .  .  .  .
          4   .  .  .  .  #  .  #  .  .  .  .      # = pillar (barrier: blocks orbs, players, sight)
          3   .  .  R  .  .  .  .  .  R  .  .      R = corner rock (blocks orbs/players, NOT sight)
          2   .  .  .  o  o  N  o  o  .  .  .      o = scoring zone (5x5, includes the N/E/S/W squares)
          1   .  #  .  o  A  A  A  o  .  #  .      A = altar (3x3 rock)
          0   .  .  .  W  A  A  A  E  .  .  .      N E S W = the four home squares
         -1   .  #  .  o  A  A  A  o  .  #  .
         -2   .  .  .  o  o  S  o  o  .  .  .
         -3   .  .  R  .  .  .  .  .  R  .  .
         -4   .  .  .  .  #  .  #  .  .  .  .
         -5   .  .  .  .  .  .  .  .  .  .  .
             -5 -4 -3 -2 -1  0  1  2  3  4  5   x
```

* **8 pillars** at (±1, ±4) and (±4, ±1). They make a one-tile **gap ("arch", "hole in the
  pillars")** on each cardinal line: (0, ±4) and (±4, 0).
* **4 corner rocks** at (±3, ±3).
* Fire adds 4 more rocks at (±5, ±5). Body adds a pillar at (5, −5).

This is why the classic advice is to pull orbs **through the gaps** and that the cardinal home
squares are best. An orb lined up with a gap and a home square on the far side has a clear straight
or knight path into the zone. An orb off that line clips a pillar or a corner rock. It also explains
**pillar dragging** (an orb hugging a pillar is in sight, but its next tile is not), and why
barriers are strongest in the gaps.

## Reading the per-altar angle maps

Each altar page in [maps/](maps/README.md) has:

1. **The real map**, from the emulator's data, with every spawn point marked `*`.
2. **Four heat maps**, one per home square. Each tile shows how many ticks it takes, from your
   first click, to score an orb sitting there **while you stand still and hold attract**. `#`
   means the orb is hidden from that square, and `x` means it never scores without you moving
   (it parks beside you or stalls on scenery).
3. **A team map** with the best of the four home squares, which is the typical four-player setup.
   `·` tiles need a walk, a relay or a repel.

The summary table in [maps/README.md](maps/README.md) shows how differently the altars play:

* **Small altars** (Air, Fire, Body, Water): a team on the four home squares can score most spawn
  points without moving (Air about 87%).
* **Large altars** (Mind, Earth): spawns sit 7 to 16 tiles out, behind walls and rocks. Only about
  10 to 14% can be scored from a home square without moving. These are the altars where players
  walk out, pull orbs into someone else's angle, and where "changing sides of a large altar can
  cost an upward of 20 ticks" (RS Wiki Guide). That matches AnroyRS: "Half the altars are gonna be
  big altars like the Earth altar".

## Repel geometry

Repel uses the same five buckets **reversed**, with no anti-overshoot clamp: the orb is aimed 2
tiles directly away from you along the bucketed heading. To score by repelling you must stand on
the far side of the orb so that the reversed heading points into the zone. Two facts from the
engine limit this:

* You can click an orb with the repeller up to 8 tiles away, but the push is **cancelled if the orb
  is 8 or more** tiles away. In practice a repel only moves orbs within 7 tiles.
* Repel is how orbs are pushed out over water (Water, Fire) or behind the Air tree to become
  "dead".

The advanced "repel tricks" (Wrestling Science counts 6 variations) use the wand-swap glitch
described in [05 §2.8](05-tick-engine.md#28-players-walking-dragging-and-the-prototick-playerstep-playerstepattract).

## Videos that show angles (no speech)

These are visual-only, so their content is not transcribed here. See [videos.md](videos.md) for
the full list with links, sorted by altar.
