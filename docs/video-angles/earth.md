# GOP angles: Earth altar

Coordinates: the altar centre is (0,0), +x is east, +y is north. Scoring zone is -2..2. Home squares are N (0,2), E (2,0), S (0,-2) and W (-2,0). Rows come from reading video frames, so each row's confidence is about tile placement. Full per-video notes are in `raw/<id>.md` on the capture machine (not in this repo).

Sources: Hl74rVXj2PI (Great Orb Project. Advanced Tricks & Angles - Part 1), fDK9WtB3-08 (Great Orb Project. Advanced Tricks & Angles - Part 2), PPXA-Xg9qFM (Great Orb Project - Some nice to know angles), XAEHx_SrboM (GOP Earth Altar Guide)

## Patterns

**Layout:** at the altar itself the KB model holds: four trilithon arches and corner rocks at (±3,±3) (XAEHx_SrboM 3:14–3:24). But the altar sits in a brown **cave** where raised rock plateaus (mesas), stalagmite clusters and chasm edges (black void) fill the outer arena. None of those are in the model, and they decide most Earth angles. Orbs spawn 8–12+ tiles out among the plateaus. The minimap shows holes in the floor. Most Earth clips have the altar off-screen, so tiles are rough.

**Recurring angles:**
- **Shepherding loop** (XAEHx_SrboM): (1) "step and attract the orb" to bring it beside you. (2) Step one tile to change the angle, then repel to "set" it. (3) Repel with short taps so it bends round a plateau corner instead of sticking ("As you repel, tap to make the orb go around the corner"; "tap twice" unsticks a pinned orb). (4) A final straight repel to score. Change-wand swaps happen constantly.
- **Run on/off matters:** walking scores an orb round the outside of an arch leg, while "Leave run on this time" sends the same line through the arch's middle gap.
- **At the altar:** from S home, pull an orb from outside the NW corner through the west gap (-4,0). "Requires a few OAO's".
- **Repel trick for premoving** (fDK9WtB3-08): "Premoving without the repel trick results in "ruining" the orb by curving it around the rock". From E home beside the E stone, a far NE orb is repel-tricked so it goes straight in.
- **Yongyi's NE+NW algorithm** (Hl74rVXj2PI): when spawns are NE and NW, attract the NE one plus a wand swap from outside the W arch, then attract the NW one from inside the N arch.
- **Long drags** (fDK9WtB3-08): a cave spawn far S/SW is attracted 1–2 ticks, then repelled in once it is beside the player. "This angle also works on the spawn 1 space southwest... The only difference is that you're required to hold for 2 ticks instead of 1." Also: "On water and earth, going west can increase your range."
- **Tawin11** (PPXA-Xg9qFM): single attracts from near the altar on orbs 8–11 tiles out (SE, S, NW, W). "No need to tap ground": re-attract instead.

## Angles (43 rows)

| video | time | altar | player tile | orb tile | wand | outcome | on-screen caption | confidence |
|---|---|---|---|---|---|---|---|---|
| Hl74rVXj2PI | 8:51 | Earth | player outside the W-side trilithon, ~(-5,0) (rotated camera) | NE spawn (Choose Option → Attract at 8:51; "Attract Yellow orb" at 8:54) and NW spawn ~(-8,1) | attract + wand swap (message at 8:54), then attract the NW orb from inside the N trilithon at 9:00 | Yongyi's routine for NE+NW spawns. At 9:03 an orb is at ~(2,-1), near the player on the S/E side | "This is a neat little algorithm that Yongyi often uses to score when there are spawns in the North east and North west regions of earth altar." | low |
| fDK9WtB3-08 | 0:33 | Earth | far S/SW of altar in the cave (~(-2,-12)?) | spawn a few tiles N of player, in the cave (~(-1,-8)?) | attract (0:33), then repel (0:42) once the orb is past/beside the player | orb repelled toward the altar; at 0:45 it is at the altar ring (scores) | (none during clip; next caption refers to it) | low |
| fDK9WtB3-08 | 0:54 | Earth | same lane as previous, far S of altar | the spawn "1 space southwest" of the previous one | attract held 2 ticks, then repel (1:00) (wand-swap message shown at 0:54/0:57) | orb repelled toward altar (result off-screen, presumably scores) | "This angle also works on the spawn 1 space southwest... The only difference is that you're required to hold for 2 ticks instead of 1." (0:48-0:51) | low |
| fDK9WtB3-08 | 1:09 | Earth | in the cave W/SW of the altar, next to a teammate | orb NE of player in the cave (~5 tiles) | attract (1:09, 1:12) / repel chain through the cave (1:15-1:27) | orb dragged to the altar; player arrives at the S/W side of the altar and clicks "Craft-rune Altar" (1:36); orb at W/NW of ring | (none) | low |
| fDK9WtB3-08 | 4:19 | Earth | in the cave, ~8+ tiles from altar (tilted camera) | NE of player ~5 tiles | attract / wand swap | orb dragged toward altar (4:25-4:28) | (none) | low |
| fDK9WtB3-08 | 5:16 | Earth | (2,0) E home, beside the E stone | far NE in the cave (spawn off-screen top right) | repel trick, then premove; attract at 5:31 | orb is not curved around the rock and goes straight in (per caption) | "This repel trick allows you to premove the orb. Premoving without the repel trick results in "ruining" the orb by curving it around the rock and making it take longer to score." (5:16-5:22) | low-medium |
| fDK9WtB3-08 | 5:34 | Earth | NW of altar in the cave (~(-3,6)) | NE of player ~5 tiles (~(2,9)) | attract + wand swap (message shown) | not shown (cut) | (none) | low |
| fDK9WtB3-08 | 5:43 | Earth | (0,-2) S home at 5:43, then (2,1) E side (5:46), then (1,2) N side (5:49) | NW, beyond the N arch on the cave rim (~(-6,8)) | attract (5:49-5:52, wand pointing NW) | orb pulled toward the N/NW of ring; player clicks "Craft-rune Altar" (5:49) | (none) | low |
| fDK9WtB3-08 | 8:05 | Earth | E of altar ~(5,1) (tilted camera) | NE ~(8,5) on cave rim | attract (8:05 menu, 8:08), wand swap (8:11) | not shown (cut) | (none) | low |
| fDK9WtB3-08 | 11:44 | Earth | (-2,-1), SW of altar | NW (~(-6,5)) | attract (11:44) + wand swap; player walks NW then repels (11:47) | orb pushed SE toward altar; at the altar W edge at 11:50 (scores) | (none) | low-medium |
| fDK9WtB3-08 | 13:49 | Earth | (0,-2) S home, then walks W/NW (13:52-14:01) to about (2,0)/(1,0) | NW, beyond the N arch on the rim (~(-6,6)) | attract (13:49) | orb pulled to about (-2,3) (14:01) | "On water and earth, going west can increase your range." (13:52-13:55) | low-medium |
| PPXA-Xg9qFM | 2:46 | Earth (north = screen left at click) | near altar | (9,-5) | attract | comes in to E side ~(7,0) then (4,0) by 2:58: scores (likely) | | low |
| PPXA-Xg9qFM | 3:01 | Earth (north = screen left) | near altar, S | (11,-4) | attract (`Attract Yellow orb` 3:04) | ends E of altar ~(5,-1) at 3:13, into zone: scores (likely) | | low |
| PPXA-Xg9qFM | 3:16 | Earth (north = screen right) | S side of altar, approx (0,-2) | (-4,-8) | attract (`Attract Yellow orb` 3:22) | moves to ~(0,-5) by 3:28; re-clicked at 3:31 (next row) | | low |
| PPXA-Xg9qFM | 3:31 | Earth (north = screen right) | approx (0,-2) | (-1,-8) | attract | comes straight N to ~(1,-2) at 3:40: scores | | low |
| PPXA-Xg9qFM | 4:04 | Earth (camera rotated) | near altar; clicks altar repeatedly (3:52, 4:04, 4:10 "Use Earth altar") | south of altar, beside two green orbs | attract | orb drawn N past the green orbs toward S home by 4:10: scores (likely) | | low |
| PPXA-Xg9qFM | 4:22 | Earth | near altar | (-9,8) NW | attract (`Attract Yellow orb`) | (-7,4) at 4:28, then (-4,2) at 4:31: NW corner of zone, scores (likely) | | low |
| PPXA-Xg9qFM | 4:34 | Earth | near altar | (-8,3) | attract, then attract again at 4:43 with orb at ~(-6,0) | second attract pulls it to the W side of the altar: scores | "No need to tap ground." | medium |
| PPXA-Xg9qFM | 4:49 | Earth (north = screen left) | near altar | (6,-10) SE | attract (`Attract Yellow orb` 4:49 and 4:52) | (3,-6) at 4:55, then (0,-3) at 4:58: S home, scores | | low |
| XAEHx_SrboM | 0:12 | Earth | outer arena, in a channel between plateaus (altar off-screen, roughly 10+ tiles away) | adjacent, 2-3 tiles to screen-right of the player | repel | Orb is lined up, then pushed | "line and repel" | low |
| XAEHx_SrboM | 0:14 | Earth | same | same | wand swap (menu: "Choose Option / Attract Yellow orb / Change-wand Yellow orb / Walk here / Examine Yellow orb / Cancel") | 0:16-0:22: the orb travels away to screen top-left and out of view (toward the altar side) | | low |
| XAEHx_SrboM | 0:24 | Earth | outer arena, open patch between plateaus | far, screen bottom-left, then upper-right (camera turned) | attract after stepping one tile | Orb is pulled next to the player (0:28) | "step and attract the orb" | low |
| XAEHx_SrboM | 0:30 | Earth | stepped one tile | adjacent | repel ("set" the orb), then step | Orb parks in a new position (0:32-0:34) | "repel to set the orb and step again" | low |
| XAEHx_SrboM | 0:36 | Earth | beside a plateau corner | adjacent, pushed past the plateau corner | repel with short taps | The orb bends around the plateau corner (0:38) | "As you repel, tap to make the orb go around the corner" | low |
| XAEHx_SrboM | 0:40 | Earth | same | around the corner, screen top-right | repel | Orb travels to the altar (0:42 view shows it at the altar stones), so it scores | "then repel to score" | medium |
| XAEHx_SrboM | 0:46 | Earth | outer arena, under a plateau | adjacent | wand swap ("Change-wand Yellow orb" highlighted) | Setup for the next push | "This is a bit tricky at first" | low |
| XAEHx_SrboM | 0:50 | Earth | same, beside stalagmites | adjacent, screen-left | repel | 0:52-0:58: the orb moves off toward screen top; the counter's pie timer turns red | "but, practice makes perfect =)" | low |
| XAEHx_SrboM | 1:00 | Earth | outer arena near the chasm edge (dark void to screen-right) | ~4 tiles screen-right against the cliff | attract / repel ("another angle shot") | 1:02-1:04: the orb is brought next to the player on the other side | "another angle shot" | low |
| XAEHx_SrboM | 1:06 | Earth | beside a plateau | adjacent | repel with taps | The orb goes around the plateau corner | "tap to make the orb go around the corner" | low |
| XAEHx_SrboM | 1:10 | Earth | same | around the corner | repel | 1:12: the orb is far off at screen top-left (toward the altar); presumed to score | "repel to score" | low |
| XAEHx_SrboM | 1:14 | Earth | outer arena, open ground between plateaus | ~4 tiles screen-right | attract after a step | Orb comes to the player (1:20) | "step and attract" | low |
| XAEHx_SrboM | 1:22 | Earth | same | adjacent, screen up-right | repel with a tap, then step | Orb is repositioned | "tap repel then step" | low |
| XAEHx_SrboM | 1:26 | Earth | same | adjacent | repel with taps | Orb gets around the plateau corner; it leaves view to screen-right (1:30), presumed to score | "tap to get around corner, then score" | low |
| XAEHx_SrboM | 1:36 | Earth | outer arena, open ground | stuck against a plateau, screen top | repel, tapped twice | The orb comes unstuck (1:38-1:40) | "tap twice to get the orb unstuck" | low |
| XAEHx_SrboM | 1:42 | Earth | moved to line up | screen top, near a plateau | repel | Orb travels off; presumed to score | "then line and repel to score" | low |
| XAEHx_SrboM | 1:52 | Earth | outer arena by the west(?) chasm edge (wider view with minimap) | ~2 tiles screen-left | attract, then wand swap at 1:54 ("Change-wand Yellow orb" menu) | Orb is next to the player | "attract" | low |
| XAEHx_SrboM | 1:56 | Earth | stepped | adjacent | repel tapped twice | Orb is repositioned | "step and tap repel twice" | low |
| XAEHx_SrboM | 2:00 | Earth | stepped again | adjacent | repel | 2:02-2:06: the orb goes up-right toward the altar side; presumed to score | "step again and repel to score" | low |
| XAEHx_SrboM | 2:10 | Earth | outer arena below a long ridge | ~4 tiles screen-right | attract, step, then repel (2:14 menu with "Change-wand") | 2:16-2:22: the orb is pushed screen up-left, out of view; presumed to score | "Simple angle shot" / "attract, step, repel to score" | low |
| XAEHx_SrboM | 2:24 | Earth | outer arena between two plateaus, with the player walking (run off) | ~6 tiles screen-left | attract, step, repel | 2:32-2:40: the orb passes outside the pillar and scores. Altar pillars are visible at screen top-right (2:24). | "Requires walking to be on" / "attract, step then repel" / "This will score the orb on the outside of the pillar" | low |
| XAEHx_SrboM | 2:46 | Earth | same spot as the previous row (run on) | screen up-left | repel with taps (2:50 menu with "Change-wand") | Orb goes around the plateau corner (2:52), then repel to score. 2:58-3:00: it enters through the middle gap of the arch (altar arch visible, orb at the lintel), so it scores. | "Leave run on this time" / "repel to make the orb go around the corner" / "then repel to score" / "This will allow the orb to go through the middle instead of the outside" | low/medium |
| XAEHx_SrboM | 3:04 | Earth | outer arena by the chasm edge, near the NW(?) corner of the altar (arch visible screen top-right) | ~4 tiles screen up-left against a plateau | attract, line up, then repel | 3:10-3:12: the orb is pushed screen up-right toward the arch; presumed to score | "How to score this orb?" / "attract, line, then repel to score" | low |
| XAEHx_SrboM | 3:14 | Earth | (0,-2), S home, just north of the south arch | ~(-7,3), outside NW past the corner rock (-3,3) | attract taps (the player alternately clicks the orb and the altar, which shows red-X click markers on the altar) | 3:18-3:23: the orb creeps SE; 3:23.5-3:24 it crosses the west side at the gap (-4,0) and is inside the zone at ~(-3,0)/(-2,-1). Presumed to score. Counter pie red. | "Requires a few OAO's to be done in order to do this trick" | medium |

## XAEHx_SrboM: GOP Earth Altar Guide

### Captions
- 0:02-0:04: "Great Orb Project Guide (Earth Altar)"
- 0:06-0:08: "The Earth Altar Guide is a collection of angles that will help you when playing on the Earth Altar"
- 0:12: "line and repel"
- 0:24-0:26: "step and attract the orb"
- 0:30-0:32: "repel to set the orb and step again"
- 0:36-0:38: "As you repel, tap to make the orb go around the corner"
- 0:40-0:42: "then repel to score"
- 0:46: "This is a bit tricky at first"
- 0:50: "but, practice makes perfect =)"
- 1:00-1:02: "another angle shot"
- 1:06-1:08: "tap to make the orb go around the corner"
- 1:10-1:12: "repel to score"
- 1:14-1:16: "step and attract"
- 1:22-1:24: "tap repel then step"
- 1:26-1:28: "tap to get around corner, then score"
- 1:34-1:38: "tap twice to get the orb unstuck"
- 1:42-1:44: "then line and repel to score"
- 1:52: "attract"
- 1:56: "step and tap repel twice"
- 2:00-2:02: "step again and repel to score"
- 2:08-2:10: "Simple angle shot"
- 2:12-2:14: "attract, step, repel to score"
- 2:24-2:26: "Requires walking to be on"
- 2:30-2:32: "attract, step then repel"
- 2:36-2:38: "This will score the orb on the outside of the pillar"
- 2:46-2:48: "Leave run on this time"
- 2:50-2:52: "repel to make the orb go around the corner"
- 2:54-2:56: "then repel to score"
- 2:58-3:00: "This will allow the orb to go through the middle instead of the outside"
- 3:04: "How to score this orb?"
- 3:06-3:08: "attract, line, then repel to score"
- 3:14-3:16: "Requires a few OAO's to be done in order to do this trick"
- 3:29-3:31: "Jagex Ltd. are the creators of Runescape"
- 3:29-3:33: "People who have helped with this video:"
- 3:33-3:43: "Ares flaro", "Teknolla G", "Didiee", "Lordsyy", "Kelv Devine"
- 3:43-3:47: "Thank you for Watching!"
