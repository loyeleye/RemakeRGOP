# Quintessence: mechanics

How *Quintessence* (RPG Maker XP, chapters 1–11) plays, summarised in our own words from a dump of its
database, events and scripts (`tools/rpgm-dump`; see [HANDOFF.md](HANDOFF.md)). It is a study reference:
Lanternfall's systems are designed fresh.

**The key fact:** almost none of the real gameplay uses RPG Maker's stock systems. Battles,
transformations and mini-games are all built out of **map events and common events**, with a few
custom Ruby scripts. The `Enemies` and `Troops` tables are mostly RPG Maker's default monster list
(Ghost, Basilisk … Seraphim, with a 100,000-HP "Ghost" used as a dummy), so don't read balance from
them. Read `story/90-common-events.md` and the custom scripts instead.

## Battle system: real-time, on the map

* Fights happen **on the field map, in real time**. Common events handle starting a battle (*ENTER
  BATTLE*, *battle: INITIATE*), HP bars for the player and mobs, position tracking, hit checks for
  arrows, powder and traps, knock-outs and a *Victory Check* that awards EXP.
* **A two-character party with one active character.** Only the active character (shown by the
  portrait at the bottom right) can use skills. **A** switches who is active. Each character has
  attacks on **Q** and **W** and a support skill on **S**.

| Character | Q | W | S |
|---|---|---|---|
| Reivier | **Aimed Shot**: arrow projectile, damages on contact | **Vikon's Trap**: a placed trap that cripples whoever steps on it (from the Chapter 1 deer hunt) | |
| Lunair | **Combustive Powder**: explodes on contact, hitting the target and enemies around it | **Venom Gust**: 4×4 area of poison, **pushed by the wind** | **Half-Shift**: shift to heal fully, then a cooldown |
| Kardian | | | **Kardian's Remedy**: heal |

* **Wind:** a HUD arrow shows the wind direction (a common event changes it), and wind shifts where
  Venom Gust lands. This is the main bit of battlefield physics.
* **Growth:** EXP comes after a fight. Levelling up teaches skills (Venom Gust arrives a few levels in)
  and can double a skill's effect (Reivier's trap).
* **States:** mostly stock (Knockout, Stun, Venom, Sleep, Paralyze …) plus custom ones: *Fleas*
  (from a wolf form), *Lead* and *Immune*. In the Chapter 9 golem fight the golems stay immune until
  the player finds what can damage them (shots, then a "big shot").
* A risk-free **tutorial arena** teaches all of this, and an orb exits it. The game often prompts the
  player to save.

## Transformation (the Quintessence)

* **The story rule:** shape-shifting needs a piece of the target: a strand of hair or a feather.
* **Human forms** are used for stealth and story (Serai, Heath, guards). In the guard-bypass
  mini-game the player holds six guards' hairs mapped to **A S D Z X C**. Each guard knows one of the
  others by sight, so you must not be in that guard's form within about 3 tiles of him. An eye icon
  lights up while you are being watched, and shifting then gets you caught.
* **Animal forms** (from Chapter 7) are items, each with its own uses on the map and in battle. You
  collect them by beating animals: Charcoal Wolf, Auburn Wolf, Black Hawk (feather), White
  (Siberian) Tiger and Bear. To shift, **hold Z**, move the cursor with **X** and release.
  Abilities seen in the events: a wolf's claw/bite and snarl, fleas as an attack, the hawk's
  flight (landing rules, crossing gaps) and riding or feeding the tiger. Each form changes
  movement speed.
* **Half-shift** is the heal: you shift partway and back to mend your wounds.

## Mini-games and puzzles (by chapter)

| Where | What |
|---|---|
| Ch 1 deer hunt | Two characters corner a buck. **Z** switches whose turn it is, **X** places or picks up the trap (only its holder can) and **WASD** pans the camera. The buck moves "smartly" away from you. |
| Ch 2 escape from Aeria | Stealth: get past patrolling guards. |
| Ch 3 flooded valley | Find wood and float across. |
| Ch 4 Gaurav Town | Hunt for the thief, a hidden tunnel entrance (log puzzles) and a jail-break plan. |
| Ch 5–6 Aeria | Guard bypass by transforming (above), the city districts with side quests (a music box for Sherry), a prison break with waves of guards, and a horse-riding escape. |
| Ch 4/7 travel | Driving the wagon, with Lunair able to take turns. |
| Ch 8 winter carnival | A timed whack-a-mole hammer game (score tiers pay coins or tokens; hitting far more than there were targets disqualifies you), a haunted cave, a fortune teller and token prizes. |
| Ch 9–10 | Crate-pushing and fire-lighting puzzles, moving platforms and diagonal jumps, light puzzles and a two-golem battle with Eshe (big-shot phase). Also "illusion" scenes (rats, snakes, a ghost) played on the villagers. |
| Ch 11 | Underwater swimming in bubble suits, with an air meter, plants you can breathe from and gathering shellfish. |

## Economy, items and collectibles

* Coins and shops, ordinary healing items (Potion, High Potion, Full Potion), food you can pick up
  and quest items.
* **Music boxes** are collectible tunes, each a song title: *To Realize* (the Prion folk song tied to
  the Lunair and Huey promise), *Promise*, *Envy*, *Drift* and *River of Echoes*. They tie the music
  to the story.
* An **"octology"** of collectible items (*Monoessence*, *Diessence*, *Triessence* and
  *Quatessence* so far). Carnival tokens, teddies, mushrooms and the Sheriff's hat are side-quest
  rewards.

## Presentation and engine customisations

* **Message system (AMS script):** a name box above the message (`\name[...]`), portrait faces with
  many moods (`\f[...]`), text pop-ups over characters and inline item and skill names.
* **Party followers** ("Caterpillar" script), a **custom menu** (MENU-CMS) and a cursor script, a
  **weather** script and faster walking speeds.
* **Time of day and seasons:** per-area common events tint the screen by time. Korbin has separate
  autumn and winter copies of its maps for the later chapters.
* **Flashbacks** are their own map group. A common event switches to a black-and-white window
  skin, which appears to be used for them.

## Ideas that might carry over to Lanternfall (as inspiration, not copies)

* **Wind that pushes a projectile** is a simple, readable environmental rule. It fits Lanternfall's
  drifting wisps.
* **Switching characters with one key** gives each player two kits without adding buttons.
* **Collect-a-form abilities** as rewards that change how you move across the map.
* **Score tiers with a cheat guard** (the carnival's "too many hits" rule).
