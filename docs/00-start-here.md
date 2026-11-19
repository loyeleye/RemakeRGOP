# 00 · Start here: RuneScape basics you need first

This knowledge base assumes you have **never played RuneScape**. This page gives you the handful of
RuneScape ideas that the Great Orb Project (GOP) is built on. Skip it if you already play.

## What RuneScape is

RuneScape is an online role-playing game made by Jagex, running since 2001. The version that has
the Great Orb Project today is the main game, now called **RuneScape 3** (RS3). The Great Orb
Project is **not** in Old School RuneScape. Players have **skills** (Mining, Magic, Runecrafting...)
that go from level 1 to 99, and you raise a skill by gaining **experience points (XP)** in it.

## The world is a grid of tiles

Everything in RuneScape stands on a square **tile** (also called a "square"). Players, monsters and
the GOP orbs always occupy whole tiles. Directions are usually given as compass points: north is
"up" on the minimap.

```text
   NW  N  NE
     \ | /
  W --[ ]-- E      one tile and its 8 neighbours
     / | \
   SW  S  SE
```

* A **cardinal** move is north, south, east or west.
* A **diagonal** move is NE, NW, SE or SW. In RuneScape a diagonal step costs the same as a
  straight step, so the distance between two tiles is the larger of the east-west gap and the
  north-south gap (mathematicians call this *Chebyshev distance*). A tile 10 east and 4 north of you
  is 10 tiles away.

## The game runs in ticks

The server does not run continuously. It updates the whole world once every **game tick**:

> "The game tick, also known as the server cycle, is the fundamental unit of time used in
> RuneScape, equal to 0.6 seconds." (RuneScape Wiki, *Game tick*)

| Real time | Ticks |
|---|---|
| 0.6 s | 1 |
| 1 s | 1.67 |
| 15 s | 25 |
| 30 s | 50 |
| 1 min | 100 |
| 2 min | 200 |

Everything in GOP happens on tick boundaries: orbs move one tile per tick, your clicks are read once
per tick, and a round is exactly 200 ticks. When this knowledge base says "a 3-tick move" it means
about 1.8 seconds. A walking player moves 1 tile per tick, and a running player moves 2.

## Runecrafting, altars, talismans and essence

**Runecrafting** is the skill of making magic *runes* (Air runes, Fire runes...). You take blank
stones called **rune essence** (or **pure essence** for paying members) to an **altar** of the right
element and "craft" them into runes, which earns Runecrafting XP. Each altar normally sits inside
ruins that you can only enter with the matching **talisman** or **tiara**.

GOP is the Runecrafting skill's minigame. Its arenas are the *insides* of eight of these altars,
and its prizes are mostly Runecrafting gear.

## Free players and members

RuneScape is free to play, with a paid **membership** that unlocks more content. GOP is open to
both. Free players ("F2P") play 6 altars per game, and members ("P2P", pay-to-play) play 8. Some
rewards are members-only. Free worlds give rune essence, and member worlds give pure essence.

## Minigames and worlds

A **minigame** is a self-contained game inside RuneScape with its own rules and reward currency.
RuneScape runs many copies of its world, called **worlds**, and players pick one. Jagex suggested
World 60 (members) and World 61 (free) as the GOP worlds (update of 2 September 2008).

## Words you will see a lot

| Word | Meaning |
|---|---|
| GOP | The Great Orb Project |
| Tick | 0.6 s, one server update |
| Tile / square | One grid cell |
| Orb | The green or yellow ball of energy you steer |
| Altar | The target in the middle of each arena |
| Attract / repel | Pull an orb towards you, or push it away |
| Tap | Attract or repel for exactly one tick (moves the orb 2 tiles) |
| Angle | A place to stand relative to an orb and the altar so that pulling or pushing sends the orb in |

The full list is in the [glossary](glossary.md).

Next: [01 · What the Great Orb Project is](01-overview.md).
