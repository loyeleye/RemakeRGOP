# 05 · The tick engine

This page explains, tick by tick, how the game decides where every orb goes. It is split into:

1. **What is documented**, with sources and exact quotes.
2. **The emulator's engine**: the exact rules used by *Vief's Trapdoor*
   ([yongyi781/great-orb-project](https://github.com/yongyi781/great-orb-project)), a community
   GOP emulator. GOP players reverse-engineered these rules from the live game, and they agree with
   the documented facts. This is the model that [tools/gop_engine.py](../tools/gop_engine.py)
   re-implements and that draws every map in [maps/](maps/README.md). Remaining guesses are
   marked **(inferred)**.

Jagex never published the engine. The two best descriptions are the RuneScape Wiki's
[The Great Orb Project/Guide](https://runescape.wiki/w/The_Great_Orb_Project/Guide), written by
experienced players from their own testing, and the emulator's source code. References like
`Orb.ts` below point to files in `src/GOP/Scripts/Engine/` of that repository (commit `fbd9766`,
December 2023).

---

## Part 1 · What is documented

### 1.1 Orbs on the field

| Rule | Source |
|---|---|
| "There are 3 orbs of each colour at a time." Six orbs on the field in total. | RS Wiki |
| Glitch: at Mind there can be 4 or 5 of each colour. | RS Wiki |
| Orbs appear at random among **about 200 fixed spawn points per altar**. | RS Wiki ("200"), fandom ("ca. 200") |
| "Orbs respawn once they touch the altar." | RS Wiki |
| "Once an orb reaches the altar, there is a delay of one tick before the next orb spawns." | RS Wiki Guide |
| An orb scores when it reaches the **1-tile ring around the altar** ("the 1-grid square around the altar"; Tip.It: "any square touching it"). | RS Wiki; Tip.It; RuneHQ |
| Orbs are not drawn on your screen beyond **15 tiles**. | RS Wiki Guide |
| Respawn locations: RuneHQ says "arena edges". The RS Wiki says random fixed points. Both can be true if most spawn points are near the edges. | RuneHQ; RS Wiki |

### 1.2 How a wand moves an orb

> "Each tick you repel or attract an orb, you send an instruction to the orb to move two tiles
> toward you." (Guide, attract; repel is the same, away from you)

> "The orb moves at the rate of one tile per tick, and the instructions do not stack." If you stop,
> the orb moves "2 tiles further, unless obstructed." (Guide)

> A single-tick input is a **tap**, which "sends the orb two tiles." (Guide)

What follows from this (confirmed by the emulator, Part 2):

* Holding a wand on an orb moves it **1 tile per tick**, every tick, while you hold.
* The "two tiles" is a **target**, not a speed. Each click aims the orb at a tile at most 2 tiles
  away (§2.3). Holding re-aims it every tick, so the target never runs out. The instructions "do
  not stack" because a new aim replaces the old one.
* Letting go leaves the orb walking to its last target: at most 2 more tiles.
* A tap therefore moves an orb up to 2 tiles over 2 ticks for 1 tick of your time. That frees you
  for a tick, and is the basis of most advanced play.
* The orb moves on the tick **after** your click, because orbs are processed before players in each
  tick (§2.2).

```text
tick:            t1      t2      t3      t4      t5
you:           [click] [hold]  [hold]  [stop]
orb moves:       -       1       1       1       1   -> up to 4 tiles for 3 ticks of holding

tap:           [tap]   [stop]
orb moves:       -       1       1               -> up to 2 tiles for 1 tick of input
```

### 1.3 Reach and sight

| Rule | Source |
|---|---|
| Attract reaches orbs up to **10 tiles** away, "in all directions" if unobstructed. | RS Wiki; Guide |
| Repel "will only repel orbs that are at most **8 tiles** away from you" (Guide also mentions a click reach of 9). | Guide |
| "In order to be able to move an orb, you must be able to see the orb from your position." | Guide |
| Line of sight "used to be symmetrically rotational until the RuneTek 5 update sometime in 2009. Now they are player-symmetric." and "Angles are now different depending on whether the orb is east of you or west of you." | Guide |

The emulator explains what this means (§2.6). The line-of-sight routine is built for one octant
and reflected into the others, and it has hard-coded tie-break quirks. So an orb at "6 east, 1
north" and one at "6 west, 1 north" are checked through different tiles.

### 1.4 Who controls an orb

> "The first player to touch an orb of their colour controls the orb." (Guide)

* If two players touch it on the same tick, it goes to the one with **higher priority in the
  player queue** (the order in which the server processes players).
* An orb that is moving but uncontrolled goes to the **lowest-priority** player. The Guide says
  this can happen when an orb is released next to a barrier.
* After the controller lets go, "another player may attempt to take control of it after two ticks
  have elapsed".
* Control of stuck orbs is "not completely understood".
* Carousers' clan guide: if an orb gets stuck, **let go**, or your teammates cannot act on it.

### 1.5 Obstacles and stuck orbs

* "Attracting from the wrong position will cause orbs to become stuck." (Guide)
* Orbs travel in straight lines: "Orbs move along direct (perfectly straight) paths." When they meet
  an obstacle they "bounce" and either keep going roughly the right way, go the wrong way, or get
  stuck (Carousers guide).
* **Pillar dragging:** some orbs next to pillars can be reached, but the tile they want to move into
  cannot. Holding the wand on such an orb **drags you** towards it. Tapping avoids this (Guide).
* Barriers block orbs that are moving freely, but not ones already being moved when the barrier
  goes up (see [03](03-equipment.md)).
* **Dead orbs:** pushed out of reach where nobody can pull them back. This happens only at Water,
  Fire and Chaos, and behind the tree at Air (Guide; repeller trivia).

### 1.6 Players and time

* The best standing spots are the **four cardinal tiles next to the altar** (directly N, E, S or W
  of its middle). Off-centre spots are worse (Guide).
* Moving **90°** round a small altar costs **3 ticks**. Changing sides of a large altar can cost
  "an upward of 20 ticks" (Guide).
* "Prototick" is the Guide's coined word for the delays between consecutive actions.
* Theoretical maximum solo scores: **98** at Air and **48** at Mind, assuming 199 playable ticks
  and one tile per tick. The Wiki says this is "extremely unlikely".
* Recorded real solo scores on YouTube (ThePuu4, 2026): **44** at Air, **42** at Nature, **42** at
  Fire, and 169 orbs over a whole free game (212 over a members game).

### 1.7 The 30-second rule

Until the last 30 seconds you can attract or repel **either** colour. After that you can only move
your own colour. Barriers keep working for everybody (RS Wiki; RuneHQ; 2011.rs KB).

---

## Part 2 · The engine, rule by rule (from the emulator)

### 2.1 The board

* Each altar is a **53 × 53** grid of tiles, with the altar centre at (0,0). x grows east and y
  grows north (`GopBoard.ts`, `AltarData.ts`).
* Each tile has one of nine types (`Enums.ts`, `GopBoard.isPassable`):

| Code | Tile | Blocks players | Blocks orbs | Blocks sight |
|---|---|---|---|---|
| 0 | Floor | no | no | no |
| 1 | Barrier (pillars, trees, solid walls) | yes | yes | yes |
| 2 | Rock (includes the altar itself) | yes | yes | **no** |
| 3 | Water (the arena edge, rivers, lava) | yes | **no** | no |
| 4 | WallW: a thin wall on the tile's west edge | edge | edge | edge |
| 5 | WallS: a thin wall on the tile's south edge | edge | edge | edge |
| 6 | WallSW: both | edge | edge | edge |
| 7 | Mini-pillar 1: blocks diagonal steps into it where dx = −dy | diag | diag | no |
| 8 | Mini-pillar 2: blocks diagonal steps into it where dx = dy | diag | diag | no |

* **The altar** is the solid 3 × 3 block |x| ≤ 1, |y| ≤ 1 (`isInAltar`). It is made of rock, so
  you can see across it but nothing can pass through it.
* **The scoring zone** is the 5 × 5 square |x| ≤ 2, |y| ≤ 2, corners included
  (`isAdjacentToAltar`). An orb anywhere in it has "touched the altar".
* **A player is next to the altar** on the same 5 × 5 square minus its 4 corners
  (`isPlayerAdjacentToAltar`). The 4 **home squares** are (0,2), (2,0), (0,−2) and (−2,0).
* Water is why orbs can become "dead": orbs can be pushed out over water, but players cannot follow.

### 2.2 Order of work inside one tick (`GameState.step`)

```text
currentTick += 1
for each orb:    orb.wasTouchedThisTick = false; orb.step()     # orbs move FIRST
for each player: player.step()                                  # then players act, in index order
```

Because orbs move before players act, **a click on tick t moves the orb on tick t+1**. That is the
"one tick of latency" every GOP player feels. Player index order is the "player queue" the RS Wiki
Guide talks about, and a lower index means higher priority.

`GameState.defaults.ticksPerAltar = 199`, which matches the RS Wiki trivia's "199 playable ticks".

### 2.3 The angle rule: where a click sends an orb

When you attract or repel, the orb is given a **target tile**, not a direction
(`Player.attractSuccess`, `GopBoard.getOrbOffset`). The target is the orb's position plus an
offset that depends only on the slope between you and the orb:

```text
diff = player - orb                  m = |diff.y / diff.x|     (m = infinity if diff.x == 0)
sx, sy = sign(diff.x), sign(diff.y)

m > 2        -> offset (0,     2*sy)      "V"  straight
1 < m <= 2   -> offset (sx,    2*sy)      "v"  steep knight
m == 1       -> offset (2*sx,  2*sy)      "X"  diagonal
1/2 <= m < 1 -> offset (2*sx,  sy)        "h"  shallow knight
m < 1/2      -> offset (2*sx,  0)         "H"  straight

attract: offset.x = absmin(offset.x, diff.x - sx); offset.y likewise
         (never aim past the tile next to you)
repel:   offset = -offset   (no clamp), and cancelled if the orb is 8+ tiles away
target = orb + offset
```

This gives **16 possible headings** (4 straight, 4 diagonal, 8 knight-like), and nothing else.
Every "angle" in GOP is a way of standing so that one of these 16 targets, followed by the stepping
rule below, carries the orb into the scoring zone. The full picture is in
[maps/angle-rule.md](maps/angle-rule.md).

The Guide's "instruction to move two tiles" is this rule: every offset is at most 2 tiles in each
axis. Holding the wand re-aims the orb every tick, so a held orb never runs out of target. A **tap**
(one tick) aims it once. The orb then walks to that target, up to 2 tiles, and stops.

### 2.4 How an orb steps (`Orb.step`)

```text
if target == position: target = none
if position is in the 5x5 scoring zone:
    target = none; deadTime += 1
    on deadTime >= 1: every player attracting this orb is made idle
    on deadTime >= 2: orb respawns at a random spawn point, team score += 1
elif target is set:
    step = (clamp(target.x - x, -1, 1), clamp(target.y - y, -1, 1))
    if the diagonal/straight step is blocked:
        try (step.x, 0), else try (0, step.y), else stop (target = none)
    move one tile
if nobody touched the orb this tick and it is not Free:
    controlState advances Controlled -> Wait1 -> Wait2 -> Free
```

What this means:

* **Speed:** one tile per tick, always. There is no Runecrafting-level effect in the engine.
* **Knight offsets make doglegs.** A target of (1,2) is reached as one diagonal step and then one
  straight step.
* **Sliding:** a blocked diagonal turns into a straight slide along the obstacle. That is the
  "bounce" the Carousers guide describes, and the reason orbs slide round the altar's corners into
  the zone.
* **Scoring takes two extra ticks.** An orb that enters the zone on tick t has `deadTime` 1 on t+1
  and scores and respawns on t+2. The Guide's "one tick delay before the next orb spawns" is that
  last tick. The upstream test "Simple scoring: 1-away" checks this: a player on (2,0) clicks an orb
  at (2,−4) once, and the point lands on tick 5 (click t1, moves t2 and t3, zone t3, dead t4,
  scored t5). [tools/gop_engine.py](../tools/gop_engine.py) reproduces it in its self-test.
* **Orbs park next to you.** Attract never aims past the tile next to you. So an orb pulled straight
  at a player standing on a home square stops on the tile beside them, which is **outside** the
  zone if it came from behind them. Hence the Carousers rule "do not get between orbs and the altar".
  You score orbs that arrive **along the altar's side** or **across** it, not ones from behind you.

### 2.5 Diagonal steps and corners (`GopBoard.canMove`)

* A straight step west from tile p is allowed if neither p nor the tile to its west is impassable,
  and p has no west wall. South works the same way. North and east are the south/west tests run
  from the neighbouring tile.
* A diagonal step (orbs and players) needs **all four** edge tests round the corner to pass: the
  destination's two inward edges and the two side tiles' edges. So an orb cannot cut a corner past
  a pillar.
* Mini-pillars block one diagonal orientation into their tile but allow straight moves through it.
* Sight uses a looser diagonal test: a corner blocks sight only when **both** routes round it are
  walled.
* If an orb or player starts **on** an impassable tile (for example a freshly placed barrier), the
  tile is treated as floor for that step, so you can always step off.

### 2.6 Line of sight and reach (`getLineOfSight`, `findObstacle`, `canReach`)

* **Reach:** attract up to **10** tiles (king-move distance). With the repeller, `canReach` allows
  clicks up to **8**, but `attractSuccess` cancels the push if the orb is **8 or more** tiles away.
  So repel only moves orbs up to **7** tiles from you. The RS Wiki Guide's numbers ("9 reach, repels
  at most 8") are one higher than the emulator's on both counts. Recorded in [11](11-open-questions.md).
* You cannot attract an orb on your own tile.
* **Sight:** the server walks a Bresenham-style list of tiles from you to the orb and checks each
  step with the sight version of `canMove`. Pure straight lines and exact diagonals are simple.
  Every other line is first rotated or reflected into the octant 0 < dy < dx, which is where the
  asymmetry comes from. That routine also has two hard-coded quirks: runs of 6 with rise 1 or 5,
  and runs of 10 with rise 1, 3, 7 or 9, choose the other tile at an exact half-way tie. Mirror-image
  targets therefore pass through different tiles. This is the Guide's "player-symmetric" sight:
  "Angles are now different depending on whether the orb is east of you or west of you."
* Rock does **not** block sight, so you can see (and pull) orbs across the altar and past boulders.
  Barriers (pillars, trees) and walls do.

### 2.7 Control and priority (`Player.isAttractIneffective`)

Each orb has a `controlState`: **Free**, **Controlled**, **Wait1** or **Wait2**.

```text
your click on an orb is IGNORED ("ineffective") if:
    someone else controls it, AND it is not Free, AND
      (it is still moving)                                     -> ignored
      or (it has stopped, it is not yet Wait2, and that player has a lower index than you)
otherwise your click takes control: controller = you, state = Controlled
each tick nobody touches it, the state advances Controlled -> Wait1 -> Wait2 -> Free
```

In plain words:

* The first player to touch an orb owns it while it is moving.
* Once it stops, a higher-priority (lower-index) teammate can take it at once. A lower-priority
  one must wait until it reaches Wait2, two untouched ticks later. That is the Guide's "another
  player may attempt to take control of it after two ticks have elapsed".
* A click that is ignored is remembered (`attractIneffective`) until you click again. Clicking
  someone else's orb therefore wastes your hold, which is why guides say "let go of a stuck orb".

### 2.8 Players: walking, dragging and the prototick (`Player.step`, `Player.stepAttract`)

* **Walking:** a player follows a breadth-first shortest path, 1 tile per tick walking or 2 running
  (`getPlayerPath`, `stepMove`). Running is toggled by an inter-tick action `{r}`.
* **Clicking an orb you cannot reach** (out of range or out of sight) makes you walk towards the tile
  where you clicked it. If you come within reach this tick, the attract is **forced** on the next
  tick. That is the **orb-drag** behaviour: a player is pulled across the map by an orb. "Pillar
  dragging" is the case where the orb is reachable but keeps slipping out of sight behind a pillar.
* **The prototick:** if you moved this tick, your attract is delayed one tick
  (`delayAttractFromMoving`). On the very first tick of a hold (`holdLength == 1`) a second flag
  (`delayAttractFromPrototick`) is set, so the hold's second tick does not issue a fresh order
  unless it is the same orb you already control. These one-tick gaps are the Guide's
  "prototicks", the reason a quick move-and-click costs one more tick than it looks like it should.
* **Changing wands** (`{q}`) flips attract/repel between ticks. If the orb you are holding is out of
  reach for the new wand, the engine does one "pre-attract" step before the change. Upstream tests
  call the tricks built on this **glitch-repel**: "Glitchrepel scoring: pillar #3",
  "Glitchrepel scoring: 5-away", "Glitchrepel should attract from old position". They are the
  "repel trick" variations in Wrestling Science's *Advanced Tricks & Angles* videos. The tests show
  the player sliding 2 tiles round the altar while the orb is still being worked.

### 2.9 Spawning

* Each altar has a fixed list of spawn tiles: Air 190, Mind 520, Water 331, Earth 316, Fire 180,
  Body 246 (from the emulator's map data). That matches the RS Wiki's "about 200 per altar" for the
  small altars. Mind's list is far longer.
* A respawning orb picks a random entry from that list. The emulator uses a seeded Mersenne
  Twister, so practice games can be replayed. **(Inferred)** the real game's choice is plain
  uniform random.
* Three orbs per colour are on the field at once.

### 2.10 What the emulator does not model

* Barriers: the emulator has a `Barrier` tile type but no placing or breaking. Barrier behaviour
  comes from the RS Wiki and guides ([03](03-equipment.md)). **(Inferred)** a placed barrier is a
  Barrier tile (blocks everything) that an orb ignores while its current target was set before the
  barrier went up.
* The opposing team. Solo and co-op practice are modelled, and the 30-second colour lock is not.
* The activity bar, essence and tokens.
* Chaos and Nature altars (members). Only the six free altars are in the data.

Next: [06 · Angles and geometry](06-angles-and-geometry.md).
