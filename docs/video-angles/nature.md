# GOP angles: Nature altar

Coordinates: the altar centre is (0,0), +x is east, +y is north. Scoring zone is -2..2. Home squares are N (0,2), E (2,0), S (0,-2) and W (-2,0). Rows come from reading video frames, so each row's confidence is about tile placement. Full per-video notes are in `raw/<id>.md` on the capture machine (not in this repo).

Sources: qnzmh-vKISo (Puu4 - 42 Nature Score - Solo - Great Orb Project)

## Patterns

Source: one record solo game (Puu4, 42 points, green 0). There is no guide text, so rows come only from "Attract Yellow orb" mouseovers and the score counter.

**Layout summary (details in the "Nature arena layout" section below):**
- The inner ring matches the KB model: four 3-tile trilithons with legs at (±1,±4)/(±4,±1) and a lintel over the gap tile, small single-boulder corner rocks at (±3,±3), and a round altar about 3 tiles across.
- **Not in the model:**
  - a floating white **exit portal just outside the N stone at about (-1..0, 5..6)**;
  - a walkable dirt path ring at radius about 7–9;
  - boulder clusters (NW/W) and concentric rings of trees from about 10–12 tiles out;
  - one small pond far NNE at about (6..10, 17..20).
- **Orbs** appear at random, mostly 4–9 tiles out, with no fixed spawn spot. They drift into the forest as far as 15–20 tiles.

**Play pattern:** stand on a home square (mostly W (-2,0), sometimes N or E) and spam attract. Inside the arch ring nearly every orb has a clear line. Outside it, favour orbs whose line passes one of the eight diagonal channels between an arch end and a corner rock. If an orb is stuck behind a corner rock, walk a couple of tiles and re-click from a new angle. Far orbs on an axis were attracted and a point followed, which hints that the lintel gaps at (±4,0) let orbs through. This is unconfirmed.

**Caveat:** north comes from reading the RS3 compass's white spike as north. If that's wrong, mirror everything through the centre. Only the portal, pond and tree pattern would change, because the rest is 4-fold symmetric.

## Angles (10 rows)

| video | time | altar | player tile | orb tile | wand | outcome | on-screen caption | confidence |
|---|---|---|---|---|---|---|---|---|
| qnzmh-vKISo | 0:08 | Nature | (-2,0) W home | ~(5,-2), just outside the E stone's south end (SE gap) | attract | Score is 0 at 0:10 and 1 at 0:12. A short pull west along y≈-1 into the zone, so it probably scores. | | low |
| qnzmh-vKISo | 0:10 | Nature | (-2,0) | ~(5,5) to (4,4), NE, outside the NE corner rock | attract | Score reaches 2 by 0:14. Probably scores through the NE gap, but if the line runs exactly diagonal it would hit the (3,3) rock. | | low |
| qnzmh-vKISo | 0:42 | Nature | (-2,0) | ~(-3,6), on the dirt ring NNW, just beyond the portal | attract | By 0:44 it is at about (-3,1) and the score goes 12→14 (with one other orb). It comes down the lane at x≈-2, west of the N stone, and **scores**. | | medium |
| qnzmh-vKISo | 0:46 | Nature | (-2,0) | ~(7,-1), dirt ring due E, behind the E stone | attract | At 0:48 the player re-clicks an orb near (6,1) to (6,0). The score goes 14→15. My guess is the orb passes the (4,0) gap under the E arch's lintel and scores. That is not seen directly. | | low |
| qnzmh-vKISo | 0:48 | Nature | (-2,0) | ~(6,1), E, behind the E stone | attract (re-click) | The orb is still at about (6,1) at 0:50. The score goes 15→16 at 0:52. Result unclear: the orb is either stuck on the E stone or goes through the (4,0) gap. | | low |
| qnzmh-vKISo | 0:50 | Nature | (-2,0) | ~(3..4,-2), just inside the SE gap next to the E stone's south leg | attract | A short pull. The score goes 16→17 by 0:54, so it probably **scores**. | | low |
| qnzmh-vKISo | 0:56 | Nature | (0,2) N home | ~(-4..-5,-3..-4), outside the SW corner rock | attract | At 0:58 the orb sits in nearly the same place next to the SW rock (-3,-3). It looks **blocked by the corner rock**. The player then walks off the home square (waypoint flags at about (1..2,1)) to change the angle. | | low |
| qnzmh-vKISo | 1:00 | Nature | (2,0) E home | ~(-2,-4), just west of the S stone's west leg (-1,-4) | attract | It goes diagonally NE through (-1,-3) and (0,-2) into the zone. The score goes 19→20 by 1:02, so it **scores**. | | medium-low |
| qnzmh-vKISo | 1:24 | Nature | (2,0) | ~(-7,-3), far WSW on the dirt ring | attract | By 1:26 the orb has moved only a little (now at about (-6,-2)) and the player is walking west (waypoint flag). The score goes 28→29, but it is unclear which orb that was. | | low |
| qnzmh-vKISo | 2:06 | Nature | (-2,0) | ~(2..3,0..1), right next to the altar's NE/E side | attract | **Scores**. It is the last point, 41→42. The timer pie resets and the game ends. | | medium |

## qnzmh-vKISo: Puu4 - 42 Nature Score - Solo - Great Orb Project

### Captions

There are no guide captions, arrows or title cards. Below is the on-screen game UI text, in order, verbatim. It is not guide text, but it is kept for completeness.
- 0:00 to 2:12: "System update in 25:46" (and counting down). This is a server banner, present all video.
- 0:02 to 0:06: "Waiting for orbs to appear."
- 0:02, 0:06, 1:18, 1:52, 2:12: "Use Nature altar / +5 options" (mouseover).
- 0:04 to 0:08: the Divination interface "Divine charge" with a progress bar "0/60" and a "CANCEL" button. This is an unrelated skilling interface.
- 0:08, 0:10, 0:42, 0:46, 0:48, 0:50, 0:56, 1:00, 1:24, 2:06: "Attract Yellow orb / +3 options". At 1:24 it reads "+7 options".
- 1:50: dialog "CREATE NATURE RUNES?" with "1. Yes." / "2. No." The player had clicked the altar, which shows a teal tile highlight.
- 2:08 to 2:12: "Waiting for portal to open."
- The chat box shows only the player's own game messages ("Swapping wands.", "You enter the portal.", "You can't dive through something you can't walk through!", Grand Exchange and news lines). None of it is guide text.

### Nature arena layout

The coordinates are altar-centred: +x east, +y north, 1 unit = 1 tile, with north as defined above. Each item is marked with a confidence level and how it compares to the generic model.

**Central ring (inside the dirt path)**

| Item | Position | Confidence | vs generic model |
|---|---|---|---|
| Altar | A round stone platform with a boulder on top, about 3 tiles across, centred at (0,0). It is a circle, not a square. Its blocking footprint is presumably the 3x3 at -1..1. | high | Matches, though the visual is round |
| Scoring zone | Not drawn on the ground. Assumed to be the 5x5 at -2..2. The player always stands one tile off the platform, consistent with home squares (±2,0)/(0,±2). | medium | Assumed to match |
| N stone | A trilithon (two uprights plus a lintel), 3 tiles long, running E-W at y=4, x=-1..1. The uprights at (±1,4) are clearly visible with an open, dark gap between them at (0,4). | high on position, high that it is an arch | Matches the pillars (±1,4). The (0,4) gap is bridged by a lintel. |
| E stone | A trilithon running N-S at x=4, y=-1..1. Legs are visible from several camera angles (0:04, 0:12, 0:44). | high on position, high that it is an arch | Matches (4,±1) plus a lintel over (4,0) |
| S stone | A trilithon at y=-4, x=-1..1. From straight above it looks like a lying slab (1:36), but at 0:58 and 1:00 its two legs and the gap are visible. | high on position, medium that it is an arch | Matches |
| W stone | At x=-4, y=-1..1. It looks like a leaning or toppled trilithon: a long slab whose ends rest on uprights. From 1:00 and 1:24 it reads as an arch. | high on position, medium that it is an arch | Matches |
| Arch gaps (0,±4), (±4,0) | Open ground under the lintel. Two clicks are consistent with orbs going through the E gap (0:46) and W gap (1:24): a far orb on the axis line, with a point scored right after. Neither passage was seen directly, and a lintel might block orbs differently from players. | low | Same as the generic one-tile gaps, but roofed |
| Corner rocks | Four small, dark, round single-tile boulders at about (-3,3), (3,3), (-3,-3), (3,-3). The pixel measurements at 1:36 give (-2.9,2.4), (2.5,2.75), (-2.7,-3.0), (3.1,-2.6). The orb at 0:56 to 0:58 appears to stop against the SW rock. | high on existence, medium-high on tiles | Matches (±3,±3). These rocks are small, much smaller than the arches. |
| Diagonal openings | Between each arch end and its corner rock, the tiles around (±2,±4), (±4,±2), (±2,±3) and (±3,±2) are open grass. Most far orbs come in through these four diagonal channels. | medium | Matches |
| Inner clearing | Flat grass from the arches out to the dirt path. The only clutter is tiny brown mushroom/pebble decorations scattered over the grass, which look non-blocking: orbs and the player pass over them. | medium | No extra obstacles |

**Outer ring and beyond**

| Item | Position | Confidence | vs generic model |
|---|---|---|---|
| Portal (exit/entry) | A static white glowing sphere or halo, floating just outside the N stone on its west half, at about (-1..0, 5..6). The minimap shows a dome-shaped icon on the same bearing. The player enters here at 0:02, and "Waiting for portal to open." appears at the end. | medium on what it is, medium on the tile (±1, because it floats) | Not in the generic model. It sits in the N approach lane, so it may matter for N-side angles if it blocks (unknown). |
| Dirt path ring | A circular brown path of about 2 tiles width, at a radius of about 7-9 tiles from the centre. Its north side is about 7 tiles out and its west and south sides about 9, because of perspective. It is walkable: orbs sit on it and the player clicks orbs there. | medium | Not in the generic model. It is cosmetic ground, not an obstacle. |
| Edge of the clearing | Beyond the path, grass continues for a few tiles. Then come a dense ring of trees (dark squares on the minimap) and groups of grey boulders, about 10-12 tiles out. Many boulder clusters are visible NW and W of the path, at about (-9..-12, 3..8) in the 0:08 to 0:12 frames. | medium-low | Not in the model. The edges are irregular. |
| Trees | The minimap shows trees arranged in rough concentric rings with gaps, from about 11 tiles out to the edge of the minimap (20+ tiles). Many yellow and green orb dots appear among them on the minimap, out to about 15-20 tiles (for example yellow dots at about (-9,15) and (10,-16) at 1:36). So orbs float out into the forest, and the trees are probably the main obstacles out there. | medium (that orbs reach the forest), low (exact tree tiles) | Not in the model |
| Water | A single small pond, elongated and about 6x3 tiles, outside the clearing to the NNE, at roughly (6..10, 17..20) on the minimap at 1:36. On every minimap it stays on the same bearing relative to the portal icon. No other water was seen. | medium-low | Not in the model. It is far from the play area. |
| Map boundary | The minimap corners show lighter diagonal bands. These may be the arena's outer limit, roughly an octagon about 25 tiles out. | low | |

**Orb spawns and respawns**
- At 0:08 the first yellow orbs appear spread around the arches, at about 4-6 tiles from the centre (NE, E, NW and on the dirt ring).
- Throughout the game, new yellow orbs keep appearing at random places, mostly between radius 4 and the dirt path (5-9 tiles). Some are also inside the arch ring near the corner rocks. I could not see a fixed spawn spot. About 5-7 yellow orbs are visible at any time.
- Green orbs (no green player) drift slowly and spend most of the game on or just outside the dirt path and in the trees, mostly E, S and SE early on and N/NE later. They are never pulled in.
- An unidentified second character with green sparkles walks around outside the dirt path SE at 0:48 to 0:52 and N/NE at 0:56 to 1:00 and 1:24. It may be a spectator or a green player who never plays, since green stays at 0.
