# Angles read from the silent YouTube guides

Most GOP angle guides have no speech, so nothing in them could be quoted as text. On
19 November 2026 all 20 angle guides in [videos.md](../videos.md) were downloaded and cut into
frames: one frame on every scene change, plus at least one every 2–3 seconds, about 2,100 frames
in all. The frames were then read by eye. These pages are the result: **315 angle rows**, plus
every on-screen caption, copied word for word with its timestamp.

| Page | Rows | What's in it |
|---|---|---|
| [summary.md](summary.md) | | Coverage, confidence counts, the main findings |
| [general.md](general.md) | 15 | The guides' vocabulary (tap, hold, set, OAO, fake-repel, repel trick, prototick, premove, dead, orb tick), simulator clips, and a probable Cosmic arena |
| [air.md](air.md) | 60 | Everheather's East and West guides (grid diagrams, the most exact rows), ThePuu4 v2.0, Chris Rainey, the "Applying angles" puzzle |
| [mind.md](mind.md) | 83 | Four Mind guides plus Tawin11 |
| [water.md](water.md) | 30 | ThePuu4 solo, the puzzle, Wrestling Science clips |
| [earth.md](earth.md) | 43 | ThePuu4's plateau-shepherding guide, Wrestling Science, Tawin11 |
| [fire.md](fire.md) | 33 | ThePuu4, the puzzle, the orb-tick and coordination clips |
| [body.md](body.md) | 41 | ThePuu4, the puzzle, two-pillar repel |
| [nature.md](nature.md) | 10 | A 42-point record solo, plus the **first description of the Nature arena** |

## How to read a row

Every row lists the video and timestamp, the player's tile, the orb's tile, the wand action, the
outcome, the caption and a confidence. Coordinates use the knowledge base's system
([06](../06-angles-and-geometry.md)): the altar centre is (0,0), +x is east and +y is north.

* **Confidence describes the tiles, not the outcome.** Tiles were counted by eye under a rotating
  3D camera, often in 640×480 recordings, so most rows are marked *low*. Outcomes are more
  reliable, because each one was checked against the on-screen score counter.
* **The exact rows** come from two kinds of source. Everheather's 19×19 grid diagrams (the
  [Air East](https://www.youtube.com/watch?v=Z0lt3WxvFHM) and
  [Air West](https://www.youtube.com/watch?v=Wq7IcH74YdU) guides) give 13 high-confidence rows.
  The five "Applying angles" puzzles give exact start positions, on a card that uses this same
  coordinate system.
* **Orientation trap.** The four arches look alike, so a stone at the top of the screen does not
  mean north, and most guides film facing west, east or south. Rows were oriented by the minimap
  compass or by a fixed landmark (on Air, the portal disc at about (−3,−6)). Where the compass was
  hard to read, the row says so: a misread turns every tile in that clip by 90° or 180°.
* "Captions" are copied word for word, typos included. A few off-topic jokes in the Wrestling
  Science videos have been left out and marked as omitted.

## Checked against the engine

The Air rows from Everheather's grid diagrams were run through
[`tools/gop_engine.py`](../../tools/gop_engine.py)'s `hold()`, which models a player who clicks
once and holds without moving:

| Setup from the video | Engine result | Agrees? |
|---|---|---|
| E home (2,0), hold on (−1,±6) "from center" | scores on tick 7 | ✅ |
| E home (2,0), hold on (0,±5) through the gap | scores on tick 6 | ✅ |
| S home (0,−2), hold on (0,7); N home (0,2), hold on (0,−8) | score on ticks 8 and 9 | ✅ |
| E home, orb (−1,8): the guide says to step first | no score from (2,0): orb out of sight | ✅ (stepping is needed) |
| W home, orb (1,7): the guide says to step 1–2 tiles and use OAO | no score from (−2,0): out of sight | ✅ (a single hold fails) |
| Corner angle: player (−3,2), orb (−1,5), "then move to center and score" | orb parks next to the player at (−2,3) | ✅ (the guide's second step is needed) |
| Behind a W leg: player (−3,1), orb (−5,−1), "tap" | orb moves into the W gap (−4,0) and stops | ✅ (consistent with a tap set-up) |
| W home (−2,0), orb (1,±5) or (1,±6): "Holding the orb will not work well here" | a plain hold **scores** on tick 7 | ⚠️ The guide says tapping with OAO works better. The engine says a hold scores anyway. Tapping may just be faster, or the live game may differ. Logged in [11](../11-open-questions.md). |

Multi-step set-ups (step, tap, run off, OAO) need a step-by-step simulation. `hold()` doesn't
cover them, so they weren't checked.

## Findings that change the rest of the knowledge base

* **Nature arena, first description** ([nature.md](nature.md#nature-arena-layout)). It has the
  same inner ring as the free altars. A floating exit portal sits just north of the north arch, at
  about (−1..0, 5..6). Around that are a dirt path ring 7–9 tiles out, boulders and rings of trees
  from 10–12 tiles out, and a small pond far to the north-north-east. Orbs appear 4–9 tiles out
  with no fixed spawn spot. Summarised in [07](../07-altars-and-maps.md#nature-altar-8-members).
* **Mind looks different from its tile map.** The readers saw a round altar, a table-shaped
  dolmen directly south and an irregular ring of standing stones. They saw no clean pillars at
  (±1,±4) and no corner rocks at (±3,±3). The emulator's Mind data has exactly those blocking
  tiles, the same as Air. The likely explanation is that the scenery is decorative and the
  blocking tiles still follow the shared layout, but this is unconfirmed. Logged in
  [11](../11-open-questions.md).
* **A probable Cosmic arena.** Wrestling Science Part 2 includes clips from a grey, checkered
  arena with purple maze walls. That is not one of the eight GOP altars as documented, so its rows
  are kept apart in [general.md](general.md).
* **Players move at twice orb speed** (Wrestling Science caption), so after scoring a single orb
  you can always get back to your home square before the next one spawns.
