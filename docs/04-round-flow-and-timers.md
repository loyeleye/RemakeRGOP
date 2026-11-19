# 04 · Round flow and every timer

All times are given in seconds and in ticks (1 tick = 0.6 s). "Documented" numbers come from the
sources in [sources.md](sources.md). Numbers worked out from them are marked **(derived)**, and
guesses are marked **(inferred)**.

## Altar order

Every game visits the altars in a fixed order and always starts at Air:

| # | Altar | Who plays it |
|---|---|---|
| 1 | Air | Everyone |
| 2 | Mind | Everyone |
| 3 | Water | Everyone |
| 4 | Earth | Everyone |
| 5 | Fire | Everyone |
| 6 | Body | Everyone |
| 7 | Chaos | Members worlds only |
| 8 | Nature | Members worlds only |

Free players on a members world are not penalised when the game moves on to altars they cannot use
(update of 8 July 2009).

## The timer table

| Timer | Seconds | Ticks | Status |
|---|---|---|---|
| Lobby countdown once teams are valid | 60 | 100 | Documented |
| Lobby portal stays open | 20 | ~33 | Single source (2011.rs KB) |
| One altar round, first orb spawn to last orb vanishing | 120 | 200 | Documented: "There are always 2 minutes (200 ticks) from when the first orbs spawn until the altar ends" |
| Ticks in which you can attract or repel | 117.6 | 196 | Documented (Guide). Trivia section says 199; see below |
| Opposing-orb window closes | last 30 | last 50 | Documented. "Last quarter" on the attractor item pages (= last 30 s of 120 s) |
| Own-colour-only window | final 30 | ticks 150-199 (derived) | Derived |
| Delay before a scored orb's replacement spawns | 0.6 | 1 | Documented (Guide) |
| Break between altars | 15 | 25 | Documented |
| Exit portal appears after the round | "a few seconds" | ? | Documented, vague |
| Stragglers dragged into next altar | 30 after the next round starts | 50 | Documented |
| Full free game | 810 (13 min 30 s) | 1,350 | Documented; = 6 × (200 + 25) (derived) |
| Full members game | 1,080 (18 min) | 1,800 | Documented; = 8 × (200 + 25) (derived) |
| Activity bar runs dry | 120 to 180 of inactivity | 200 to 300 | RS Wiki *Activity bar* page |
| Abandon penalty | 600 F2P / 900 P2P, falling to 60 | 1,000 / 1,500 → 100 | Documented |
| Moving 90° around a small altar | 1.8 | 3 | Documented (Guide) |
| Changing sides of a large altar | up to 12+ | "upward of 20" | Documented (Guide) |

### Why 196, 199 or 200 playable ticks?

The RS Wiki says three different things. The game is 200 ticks long. The Guide says "There are 196
playable ticks where you can attract or repel orbs". The trivia's theoretical-maximum calculation
uses **199 playable ticks**. The simplest reading that fits all three (inferred):

* tick 0: orbs spawn. You cannot have clicked one yet, so tick 0 is not playable.
* ticks 1-199: the orb exists (199 ticks, the trivia's number).
* Input needs a little time to take effect: clicking, the wand animation, the orb's first
  movement. The Guide's own count of useful input ticks is 196. A 3-tick difference matches its
  separate "prototick" delay figures, but that is not confirmed.

The emulator settles the simulated length: `GameState.defaults.ticksPerAltar = 199`, and the
first click lands on tick 1 and moves the orb on tick 2 ([05 §2.2](05-tick-engine.md#22-order-of-work-inside-one-tick-gamestatestep)).
A remake should still make these numbers constants it can tune: `ROUND_TICKS = 200`,
`FIRST_INPUT_TICK = 1`, `LAST_INPUT_TICK = 196`.

## One altar, tick by tick (derived timeline)

```text
tick   0  ├─ 3 green + 3 yellow orbs spawn at random fixed spawn points
          │   (activity bars resume)
tick   1  ├─ first tick a click can register
          │
          │   OPEN PLAY: attract/repel any colour, place/destroy barriers
          │
tick 150  ├─ last 30 s begin: wands now affect ONLY your own colour
          │   (barriers still work for both teams)
          │
tick 196  ├─ last tick an attract/repel can take effect (Guide)
tick 200  ├─ round over: last orbs disappear, higher score wins the altar
          │   essence paid to everyone, activity bars pause and reset
          │   "Your team has claimed the altar!" / "...has lost the altar."
          │
          │   BREAK (15 s = 25 ticks): craft your essence at the altar
          │   purple exit portal appears in the altar after a few seconds
tick 225  ├─ next altar's tick 0
tick 275  └─ anyone still at the old altar is dragged into the new one
```

## The heads-up display (HUD)

From RuneHQ and Tip.It (descriptions of in-game screenshots):

* **Bottom right circle:** time left in the round and the number of orbs each team has scored.
* **Top bar:** one slot per altar in the game. Each finished altar shows the winner's colour (a
  green or yellow starburst), and a draw shows as neither.
* **Activity bar:** your personal activity meter (see below).

## The activity bar

The anti-idling meter. From the RS Wiki *The Great Orb Project* and *Activity bar* pages:

* It drains slowly all the time.
* It refills when you attract or repel an orb, or create or destroy a barrier.
* When it empties you are removed from the game, sent to the Guild, scolded by Wizard Elriss
  (2011.rs KB), and you get the abandonment penalty.
* It resets and pauses at each break and restarts with the next altar.
* "2 to 3 minutes of inactivity will result in the freeloading player being kicked out." Because
  the bar resets each altar and an altar lasts only 2 minutes, inferred: an idle player is
  probably only kicked if the inactivity carries across the reset, or the drain is faster than the
  page implies. Recorded in [11](11-open-questions.md).

## End of an altar

1. **Winner:** the team with more orbs scored. Equal scores are a **draw**.
2. **Essence for everyone:** `team score - half of the other team's score + 1`, minimum 1 (RS Wiki;
   rounding not documented). Rune essence on free worlds and pure essence on members worlds. If your
   pack is full, the extra drops on the ground.
3. **Crafting:** craft the essence at the altar during the break. Runes crafted inside GOP give
   **double** base XP. Runecrafting gloves or bonus XP double it again (3× with either for a
   winner, per the RS Wiki wording). An Explorer's ring (2-4) gives its usual extra runes at the
   elemental altars.
4. **Exit portal:** a purple portal appears in the altar. Step in to go to the next altar. After the
   last altar the portal returns you to the Guild.
5. **Voice lines:** "Your team has claimed the altar!", "Your team has lost the altar.", and at the
   end "Your team was victorious!" or "Your team was beaten...". Vief says "HUGE FAILURE" after a
   zero-altar loss.

Next: [05 · The tick engine](05-tick-engine.md).
