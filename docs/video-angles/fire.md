# GOP angles: Fire altar

Coordinates: the altar centre is (0,0), +x is east, +y is north. Scoring zone is -2..2. Home squares are N (0,2), E (2,0), S (0,-2) and W (-2,0). Rows come from reading video frames, so each row's confidence is about tile placement. Full per-video notes are in `raw/<id>.md` on the capture machine (not in this repo).

Sources: Hl74rVXj2PI (Great Orb Project. Advanced Tricks & Angles - Part 1), fDK9WtB3-08 (Great Orb Project. Advanced Tricks & Angles - Part 2), PPXA-Xg9qFM (Great Orb Project - Some nice to know angles), ZJGiT7n5lBs (GOP Fire Altar Guide), ppnU1UvvQwg (Applying angles ~ Fire altar #1 ~ GOP)

## Patterns

**Layout:** four stone arches (lintel over two legs) at N/E/S/W, with passable gaps, and small corner rocks at about (±3,±3). This matches the KB model; the top-down "Applying angles" map (ppnU1UvvQwg) is the best reference. **Lava rivers** run along the W and E sides and across the NE, and a bright yellow void bounds the island. Dead trees line the W/NW edge, where orbs spawn ("tree spawn"). Orbs spawn 6–9+ tiles out, beyond the arches.

**Recurring angles:**
- **Attract timing** (ZJGiT7n5lBs): "tap", "a little more than a tap" and "hold", often after a one-tile "step". Long pulls are staged: walk the orb along the outside (the lava strip N of the N arch, the tree line W/NW), then pull it in from E home ("step down one") or W home, lined up with an arch gap. The one repel angle is the repel trick through the S arch gap (2:02).
- **Orb tick** (Hl74rVXj2PI): two SE orbs at about (5,-2)/(7,-3) are attracted from N home. The first takes a short diagonal through the slot at about (4,-2), between the E arch leg (4,-1) and the SE corner rock (3,-3), so the next orb spawns sooner.
- **Coording N/S on Fire:** "the south player on fire is usually the one busy with all the orbs". From W home, an orb at the N end of the W stone (about (-4,3)) is held in, which takes "only 9 ticks … and enters the altar 2 orb ticks faster" than the traditional repel from the E side (fDK9WtB3-08). Clicking a far W orb returns you to the "center south spot" without the prototick (Hl74rVXj2PI).
- **Tap options** (fDK9WtB3-08, 5:55): tapping an orb just SE of the altar leaves you with three options depending on the next spawn: stay where you land ("with a prototick"), "Toggle run off" to return to centre, or "Toggle run on" to be dragged 2 tiles E.
- **NE diagonal** (PPXA-Xg9qFM): orb about (7,3)–(7,4), one attract, comes in to E home. "Can use this angle with any altar."
- **Puzzle solve** (ppnU1UvvQwg, A [-4,6], B [-8,-5], C [4,7], Player [-2,0]): pull the nearest orb A in from W home and stop it against the NW corner rock, then reach out to B and C. All scoring pulls are made from tiles hugging the W arch. Counter 1→4.

**Caveat:** the Fire guide's recording crops off the minimap, so north is inferred from the lava and tree landmarks matched to the top-down map.

## Angles (33 rows)

| video | time | altar | player tile | orb tile | wand | outcome | on-screen caption | confidence |
|---|---|---|---|---|---|---|---|---|
| Hl74rVXj2PI | 3:24 | Fire | starts N home (0,2). Partner at W home (-2,0). Player is dragged to ~(-2,1) | two SE orbs ~(5,-2) and ~(7,-3) (red-circled) | attract ("Choose Option → Attract Yellow orb" at 3:24), using "this space" to drag yourself into place, then multi-orb | first orb took a short diagonal route. Red boxes trace it from ~(6,-3) through the gap at ~(4,-2) between the E pillar (4,-1) and the SE corner rock (3,-3), then to ~(2,-1) and in. Caption calls this an "orb tick" (next orb spawns sooner) | "In this situation, you can use this space to drag you in an ideal spot for scoring both orbs. This same idea has another use, which will be shown later. [joke omitted]" / "You may have noticed that the first orb I clicked, took a different route than it usually does." / "This is known as an "orb tick." By this orb taking a shorter route, the next orb will appear sooner." | medium |
| Hl74rVXj2PI | 4:27 | Fire | ~(-1,-2), then (0,-2) S home | E orb ~(6,1) ("Attract Yellow orb" at 4:27 top and 4:30). Also a W orb ~(-6,-1) | attract + wand swap (message at 4:27–4:30); "premoved" | E orb is pulled in to ~(3,0) by 4:30 | "Very similar to the previous, allows you to save 3 goddamn more ticks than the traditional method because it can be premoved as well." | low |
| Hl74rVXj2PI | 6:08 | Fire | (0,-2), S home | far W orb ~(-10,-3) ("Attract Yellow orb" at 6:08). E orb ~(6,-1) also present | attract + wand swap (message at 6:11) | player stays at, or comes back to, the centre-south spot without the "prototick" delay of moving by hand | "Useful when coording North/South on fire. Allows you to return to center south spot and avoid the prototick delay associated with manually moving your character." | low |
| Hl74rVXj2PI | 8:30 | Fire (camera rotated) | ~(1,-1) | far NW orb ("this orb", green arc), "Attract Yellow orb" at 8:30–8:39 | repel via the action bar instead of tapping (per caption), then attract | orb curves and takes a shorter route to the altar. By 8:42 an orb is at the W side of the altar | "This move allows this orb to curve and take a shorter route to reach the altar." / "Traditionally it is done by tapping. However, as an alternative, you can use the action bar to repel. This spares you from the delay associated with tapping and allows you to multiorb, saving time." | low |
| fDK9WtB3-08 | 5:55 | Fire | (1,-1), SE of the altar edge | (2,-1)/(2,-2), just SE of player | tap (single click, "prototick") | orb goes in (gone by 5:58). Player ends at about (-1,-2) ("here", highlighted). Options shown: (2) run off goes back to the centre spot; (3) run on gets you dragged 2 spaces east | "(1) Depending on where your next spawns appear, you can tap this orb and end up here, with a prototick." / "(2) Toggle run off, to return to the centerspot here." / "(3) Toggle run on, to be dragged 2 spaces to the east, here." / "It's a good spawn because it provides you with options. Depending on where your next orb appears, you have the option of getting there faster in all 3 cases." | low-medium |
| fDK9WtB3-08 | 8:26 | Fire | (-2,0) W home | NW, at the N end of the W stone (~(-4,3)); move marker (x) at about (-4,5) | attract held (8:26-8:41); teammate at (2,0) | orb pulled into the ring (8:44); scores | "This is a useful angle to perform since the south player on fire is usually the one busy with all the orbs. This can help take some of that burden off. It is superior to the traditional method (shown next) because it takes only 9 ticks to perform and enters the altar 2 orb ticks faster. It is also superior to setting it up for south because it enters the altar 1 orb tick faster than if your partner was to score it from the center spot." | low-medium |
| fDK9WtB3-08 | 8:47 | Fire | E of altar at about (5,-1) (camera rotated) | NE/E (~(7,0)) | attract (8:47), then repel (8:50) | orb repelled toward the altar's E side (8:53) | (traditional method, compare caption above) | low |
| fDK9WtB3-08 | 8:56 | Fire | about (1,-1) by the altar, then (1,0) (camera rotated about 45 deg) | NE, far (~(6,6)) | attract ("Choose Option" menu 8:56; 8:59) | orb brought in (9:02-9:05) | "This angle is inferior because it takes 10 ticks to perform and 1 extra orb tick to enter than the previous." (8:56-8:59) | low |
| fDK9WtB3-08 | 11:29 | Fire | W/NW of altar at about (-5,1) (camera rotated) | NW (~(-6,5)); another orb at about (-1,0) | attract (11:29) + wand swap (11:32), repel (11:35) | orb repelled E toward altar (11:38) | (none) | low |
| fDK9WtB3-08 | 13:38 | Fire | (-2,0) W of altar (camera rotated ~45 deg) | NW (~(-5,5)) | attract (13:38) | orb pulled toward W stone (13:41-13:44); player premoves | (none) | low |
| PPXA-Xg9qFM | 4:59 | Fire | near altar | (7,4) NE | attract | (5,2) at 5:08 to (2,0) at 5:11: E home, scores | | medium |
| PPXA-Xg9qFM | 5:13 | Fire | near altar | (7,3) (same spot, repeated) | attract | same angle repeated; end not clearly shown | "Can use this angle with any altar." | low |
| PPXA-Xg9qFM | 5:20 | Fire | near altar | (0,4), in the N gap | attract (`Attract Yellow orb`) | result unclear (camera rotates at 5:23) | | low |
| PPXA-Xg9qFM | 5:23 | Fire (camera rotated) | near altar, E side | ~(11,1), green orb | attract on the green (enemy) orb (`Attract Green orb` 5:29) | green orb pulled W toward the altar's E side; purpose unclear (denial/blocking?) | | low |
| PPXA-Xg9qFM | 5:32 | Fire (north = screen down) | near altar | (-3,-10) S | attract (`Attract Yellow orb` 5:38) | comes N to (0,-3) by 5:47: S home, scores | | low |
| ZJGiT7n5lBs | 0:10 | Fire | (0,-2) S home, just off altar | ~(6,3) NE, outside the E arch near the trees ("tree spawn") | attract x2 ("OAO twice") | orb pulled in to ~(2,0), E side of the scoring zone (0:20). Seen as grabbed. | "tree spawn, simply do OAO twice to grab this orb" | low |
| ZJGiT7n5lBs | 0:24 | Fire | ~(-3,4) outside, in the NW corner gap between the N and W arches (rotated camera) | ~(-8,3) W/NW, by the lava and dead trees | attract (step, hold a bit longer than a tap). Menu shows "Attract Yellow orb". | orb drawn toward the player and stops outside near the NW corner. A partner would score it from there (0:30 shows the orb outside, beside a corner rock). | "step and hold the orb for alittle more than a tap" / "If you have a partner they would score the orb instead" | low |
| ZJGiT7n5lBs | 0:34 | Fire | ~(0,8), north of the arena on the strip under the lava river | ~(-4,8), W of the player along the lava edge | attract (step and tap) | orb moves 1-2 tiles E toward the player | "step and tap" | low |
| ZJGiT7n5lBs | 0:44 | Fire | ~(1,8), stepped once more | ~(-2,8) | attract (step, hold a bit longer than a tap) | orb drawn further E to ~(0,8), N of the N arch, ready for the next angle | "step and hold for alittle more than a tap" | low |
| ZJGiT7n5lBs | 0:56 | Fire | (2,0) E home, then one step S to (2,-1) | orb N of the N arch (left there by the previous rows) ~(0,7) | attract (hold). The beam points NW past the altar. | scores (the orb is pulled through the N arch gap into the zone) | "step down one and hold to score" | low |
| ZJGiT7n5lBs | 1:06 | Fire | ~(1,6), outside N of the N arch, near its E leg | ~(-1,8), by the lava N of the arena | attract (small tap) | orb nudged a little toward the arch line | "For this spot, you step here" / "and attract alittle" | low |
| ZJGiT7n5lBs | 1:14 | Fire | (2,1), inside, E side of the altar | same orb, N of the N arch | attract (step, hold a bit longer than a tap) | probably scores: the orb is not visible near the arch at 1:18 | "step and hold for alittle more than a tap" | low |
| ZJGiT7n5lBs | 1:24 | Fire | (2,1). At 1:26-1:28 the camera swings to the N arch and the player is shown near its E leg; 1:30 is back at (2,1). | ~(7,0), E of the E arch | attract (hold a bit longer than a tap). First way. | orb drawn W toward the E arch gap (4,0) and the zone. Result not clearly shown. | "One of two ways to reach this orb" / "hold for alittle more than a tap" | low |
| ZJGiT7n5lBs | 1:32 | Fire | (2,1) "this spot" (about the same tile, maybe (2,2)) | ~(7,0) E (another yellow orb is NE, ~(7,5)) | attract (hold longer). Second way. | not clearly shown | "Second way, hold for alittle more in this spot" | low |
| ZJGiT7n5lBs | 1:36 | Fire | ~(-5,4), NW outside, among the dead trees by the lava | ~(-7,4), W of the player | attract | orb pulled E toward the player. By 1:40-1:42 the player is back inside at (-2,1)/(-2,0), beaming N. | (none) | low |
| ZJGiT7n5lBs | 1:46 | Fire | (-2,1), W inside | ~(-6,7), NW outside | attract (step, tap or hold) | orb comes toward the NW corner / W arch | "Simply step, tap or hold the orb, whichever you prefer" | low |
| ZJGiT7n5lBs | 1:52 | Fire | moves round to ~(0,-2)/(1,-2), S of the altar (1:56) | same orb, now ~(-3,-1)/(-3,-2) SW of the altar | attract | scores (beam into the altar at 1:56-1:58) | "then proceed to score if you are alone" | low |
| ZJGiT7n5lBs | 2:02 | Fire | ~(0,-9), outside S of the S arch, near the lava pool | ~(2,-9), E of the player | attract, step, then repel | the orb is attracted next to the player, the player steps to line up, then repels it N. It travels N through the S arch gap (0,-4) (2:08-2:14) and scores. | "May be helpful at times" / "attract, step, and repel to score" | medium |
| ppnU1UvvQwg | 0:39 | Fire | (-2,0) W home (given) | A (-4,6) (given) | attract ("Attract Yellow orb", clicked twice around 0:39-0:41). There is a stray "Craft-rune Altar" click / "Create fire runes?" dialog at about 0:40. | A moves SE toward the player. By 0:42-0:44 it sits just outside the zone by the NW corner rock / W arch, ~(-3,2)-(-3,3). | "Orb A [-4,6]" (title card) | medium |
| ppnU1UvvQwg | 0:42 | Fire | ~(-2,0) | B (-8,-5) (given) | attract (click on B, again at about 0:46.5) | B creeps toward the W arch. The straight line from (-8,-5) to (-2,0) passes the W arch leg (-4,-1), so B probably stops against it outside. Final tile not readable. | "Orb B [-8,-5]" | low |
| ppnU1UvvQwg | 0:44 | Fire | ~(-2,0)/(-2,1) | C (4,7) (given) | attract ("Attract Yellow orb" mouseover on C) | C starts moving S/SW toward the N side of the arena. Final tile not readable. | "Orb C [4,7]" | low |
| ppnU1UvvQwg | 0:44.5-0:52 | Fire | ~(-2,1)/(-2,-1), stepping beside the W arch | orb A, by then just outside the W/NW edge of the zone | attract (short pulls; "Attract Yellow orb" on the orb beside the wall at 0:50) | scores. The yellow counter goes 1 -> 2 at about 0:52. | (none) | medium |
| ppnU1UvvQwg | 0:52-0:56 | Fire | ~(-2,0), beside the W arch | the remaining two orbs (B and C), staged by the earlier pulls | attract | both score. The counter reads 4 at 0:56 (started at 1), so all three orbs are scored. | (none) | low |

## ZJGiT7n5lBs: GOP Fire Altar Guide

### Captions
- 0:02 title card: "Great Orb Project Guide (Fire Altar)"
- 0:06-0:08 card: "The Fire Altar Guide is a collection of angles that will help you when playing on the Fire Altar"
- 0:10-0:14 "tree spawn, simply do OAO twice to grab this orb"
- 0:22 "step and hold the orb for alittle more than a tap"
- 0:26-0:28 "If you have a partner they would score the orb instead"
- 0:34-0:36 "step and tap"
- 0:42-0:46 "step and hold for alittle more than a tap"
- 0:52-0:54 "Helpful more in 1v1's i'd say"
- 0:56-0:58 "step down one and hold to score"
- 1:06 "For this spot, you step here"
- 1:08-1:10 "and attract alittle"
- 1:14-1:16 "step and hold for alittle more than a tap"
- 1:24-1:26 "One of two ways to reach this orb"
- 1:28-1:30 "hold for alittle more than a tap"
- 1:32-1:34 "Second way, hold for alittle more in this spot"
- 1:46-1:48 "Simply step, tap or hold the orb, whichever you prefer"
- 1:52-1:54 "then proceed to score if you are alone"
- 2:00-2:02 "May be helpful at times"
- 2:06-2:08 "attract, step, and repel to score"
- 2:16-2:20 end card: "Thank you for watching the Fire Altar Guide!"
- 2:20-2:22 "Jagex Ltd. are the creators of Runescape" / "People who helped with the making of this video:"
- 2:22-2:34 helper names: "Ares flaro", "Teknolla G", "Didiee", "Lordsyy", "Kelv Devine", "G_unitt10", "Ouranias", "Xplosion94", "Zijun660", "Maj n white"
- 2:34-2:36 "Thank you all for helping!"

## ppnU1UvvQwg: Applying angles ~ Fire altar #1 ~ GOP

### Captions
- 0:02-0:04 title card: "Applying angles" / "Fire altar #1"
- 0:08-0:16 card: "The solutions to the "puzzles" in these series are not necessarily the best solutions. It is just an example of how the three orbs could be scored by combining angles." (signed "Love ♥ Affair")
- 0:20-0:24 card: "Fire altar #1" / "Orb A [-4,6]" / "Orb B [-8,-5]" / "Orb C [4,7]" / "Player [-2,0]"
- 0:26-0:30 map overlay: labels "A", "B", "C", legend "Player" (red dot), "Orbs" (yellow dots)
- 0:32-0:38 gameplay overlay: letters "A", "B", "C" next to the three yellow orbs
