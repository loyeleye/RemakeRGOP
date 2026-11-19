# 03 · Equipment: the hat, the two wands and the barrier generator

Every player gets exactly the same four items on joining. Nobody can bring an advantage in from
outside except their Runecrafting level, which some guides say affects wand push and pull (see
the end of this page).

## Runecrafter hat (team identifier)

A goggled hat in your team's colour, which marks your team. It is auto-equipped. Its reward
versions (bought later) also come in **blue**, but blue is never a team colour.

## Attractor (the "pull" wand)

| Property | Value | Source |
|---|---|---|
| Item names | Green attractor (ID 13645), Yellow attractor (ID 13643) | RS Wiki |
| Examine | "Attracts Runecrafting energy orbs in the rune altars." | RS Wiki |
| Reach | Orbs **up to 10 tiles** away | RS Wiki main page and Guide |
| Equip | Wielded in the weapon slot, auto-equipped on joining | RS Wiki |
| Destroy | Leaves the game (also how you change teams in the lobby) | RS Wiki |
| Listed weapon speed | 4 ticks (yellow attractor infobox); not shown for green | RS Wiki |

What it does: each tick you hold it on an orb, the orb is aimed at a tile **up to 2 tiles towards
you**, along one of 16 headings (see the [tick engine](05-tick-engine.md#23-the-angle-rule-where-a-click-sends-an-orb)). The Guide says it reaches "all orbs up to 10 tiles away
in all directions" provided they are not hidden from you.

> The 4-tick "speed" in the yellow attractor's infobox is the generic weapon-speed field. Nothing
> in any GOP source says pulling only happens every 4 ticks, and the Guide describes an instruction
> **every tick**. Treat the infobox number as a template default, not a GOP mechanic (inferred).

## Repeller (the "push" wand)

| Property | Value | Source |
|---|---|---|
| Item names | Green repeller (ID 13646), Yellow repeller (ID 13644) | RS Wiki |
| Examine | "Repels Runecrafting energy orbs in the rune altars." | RS Wiki |
| Reach | RS Wiki Guide: "will only repel orbs that are at most 8 tiles away from you" (click reach 9). Emulator: click reach 8, push cancelled at 8+, so **7 tiles** in practice | RS Wiki Guide; emulator ([05 §2.6](05-tick-engine.md#26-line-of-sight-and-reach-getlineofsight-findobstacle-canreach)) |
| Equip | Swap from inventory, or right-click an orb and choose **Change-wand** | 2011.rs KB |

What it does: each tick, it tells the orb to move 2 tiles **directly away from you**. You use it two
ways:

1. **Offence:** stand on the far side of your orb and push it into the altar.
2. **Defence:** push the other team's orbs away from the altar (only until the last 30 seconds).

On some altars a hard push can send an orb somewhere it can never be pulled back from (a "dead
orb"). Only the Water, Fire and Chaos altars have this. On Air, a tap-repel can lodge an orb behind
a tree (RS Wiki Guide; repeller trivia; fandom wiki).

## Barrier generator

| Property | Value | Source |
|---|---|---|
| Item names | Green barrier generator (13647), Yellow barrier generator (13648) | RS Wiki |
| Examine | "It creates barriers." | RS Wiki |
| Options | **Make-barrier**, **Destroy** | RS Wiki |
| Effect | A temporary field **on the tile you stand on** that blocks **all orbs and all players** | RS Wiki; 2011.rs KB |
| Limit | **One barrier per player**; placing a new one removes your old one | RS Wiki; fandom wiki |
| Removing | Anyone can destroy any barrier. Your own team's takes **one** try. The other team's "may take several tries" | RS Wiki |
| Cannot place | Next to the altar; next to an exit portal ("Please do not block the exit.") | RS Wiki; updates of 25 Feb 2009 and 2 Nov 2010 |

Barrier rules worth knowing:

* A barrier does **not** stop an orb that is **already being pulled or pushed** when the barrier
  goes up (Tip.It; RuneHQ; 2011.rs KB). It stops orbs moving freely, and orbs given new
  instructions afterwards.
* Players are blocked too. You must click to pass through your own barrier, says the fandom wiki.
* Barriers work best in **choke points**, such as gaps between standing stones, rather than in open
  ground (Tip.It; RuneHQ).
* Placing or destroying a barrier refills your activity bar, but barriers **alone do not earn you
  tokens** for an altar. You must attract or repel at least one orb (RS Wiki).
* Since 2 September 2009, a barrier placed while moving stays where it was placed. Since
  2 November 2010, barriers no longer push players into walls, and you cannot sneak one next to the
  altar by running.
* Trivia: a barrier over the Fire altar's flames puts the fire out (fandom wiki).

## Does Runecrafting level matter?

Two older sources say yes. RuneHQ says the push and pull "velocity" depends on Runecrafting level,
and the 2011.rs KB says wand reach depends on it. The current RS Wiki and its Guide give **fixed**
numbers (1 tile per tick, 10 and 8 tile reach) and never mention level, and the emulator's engine
has no level input at all. This knowledge base therefore treats level as having **no effect**. The
older claim is logged in [11](11-open-questions.md).

## The 2011.rs "one square" claim

The 2011.rs KB says that when you use your wands on the **other team's** orbs, "the orb will only
ever move one square". No other source says this, and the RS Wiki says opposing orbs can be attracted
or repelled normally until the last 30 seconds. Recorded in [11](11-open-questions.md).

Next: [04 · Round flow and timers](04-round-flow-and-timers.md).
