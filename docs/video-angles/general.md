# GOP angles: General techniques, cross-altar videos, simulator and Cosmic(?) clips

Coordinates: the altar centre is (0,0), +x is east, +y is north. Scoring zone is -2..2. Home squares are N (0,2), E (2,0), S (0,-2) and W (-2,0). Rows come from reading video frames, so each row's confidence is about tile placement. Full per-video notes are in `raw/<id>.md` on the capture machine (not in this repo).

Sources: Hl74rVXj2PI (Great Orb Project. Advanced Tricks & Angles - Part 1), fDK9WtB3-08 (Great Orb Project. Advanced Tricks & Angles - Part 2), PPXA-Xg9qFM (Great Orb Project - Some nice to know angles)

## Patterns

**How orbs move:** each attract or repel moves an orb one tile per orb-tick toward or away from the player. Orbs follow RuneScape's step rule: **diagonal first until lined up on one axis with the target, then straight.** They are blocked by arch legs, corner rocks and walls, and slide around them ("curve"). So an "angle" is an orb/player pair whose diagonal leg ends in a gap: the one-tile arch gaps at (0,±4)/(±4,0), or the diagonal slots between an arch leg and a corner rock, around (±2,±4)/(±4,±2). An orb scores as soon as it reaches the zone edge, so standing on the far home square works. Clicking and then walking off does not cancel the pull. Players move at 2× orb speed (fDK9WtB3-08 caption).

**Vocabulary from the captions:**
- **tap**: a single short attract.
- **hold / hold for N (ticks)**: a sustained attract for N ticks.
- **step**: move one tile before clicking to change the angle.
- **back step**: step away from the orb.
- **set**: park an orb on a chosen tile for later or for a partner.
- **OAO** = "Orb Altar Orb" (spelled out in Wq7IcH74YdU): click orb, click the altar or ground to stop yourself walking toward the orb, then click the orb again. This meters the pull a fixed amount per cycle. "a few OAO's", "4x OAO".
- **tap ground**: cancel an attract by clicking the floor ("No need to tap ground" means a second attract click works instead).
- **run off / walk on**: walking instead of running changes how far you drag and how many ticks a repel lasts ("turning walk "on" here, will allow you to repel for 2 ticks instead of 3").
- **wand swap / Change-wand**: right-click the orb → "Change-wand", or replace the attractor with the repeller. The game message "You cannot remove the attractor wand, except by replacing it with the repeller wand." marks it.
- **fake-repel** (also the joke name "pseudostratified epithelial tissue repel"): attract an orb sitting behind a side arch, then swap and repel it in from beside the leg.
- **repel trick**: attract the orb to you, step so the orb is between you and an arch gap, then repel it straight through. It also lets you premove without the orb curving round a rock.
- **prototick**: "The 1 tick period after moving your character that you cannot manipulate an orb."
- **premove**: "Rare cases where you can move before manipulating an orb and avoid the prototick."
- **dead / deaded**: "Clicking an orb the same tick that it spawns causing the orb animation to run in order to catch up to its actual location."
- **orb tick**: an orb taking a shorter route, so the next orb spawns sooner.
- **multi-orb**: group 2–3 orbs so one click scores them together.
- **coording**: duo/trio role split (N/S, E/W, E/W/S). "centre spot" means your home square.
- **offstep**: a tile next to your home square.

**Strategy (Wrestling Science Parts 1–2):** grouping orbs and multi-orbing saves ticks and matters most when soloing. Drag yourself into position by clicking a far orb rather than walking, which avoids the prototick. Work orbs from the side so they don't curve round corner rocks. Use the action bar to repel instead of tapping. Single-orb solo scores are for when time is short or partners are busy. Count paths in orb-steps: one Water method enters in 5 steps against 6 for the "usual" way. One Fire angle takes 9 ticks against 10.

**Orientation warning for anyone re-reading these videos:** each arena's four stone structures look alike (an arch face-on, a long block end-on), so "stone at the top of the screen" says nothing about north. Use the minimap compass, a coordinate card, or a fixed landmark (Air: the white portal disc at about (-3,-6)). Many guides keep the camera facing W, E or S.

**Simulator:** Icy001's GOP program (in Hl74rVXj2PI) draws the Air layout exactly as the KB model: pillars (±1,±4)/(±4,±1), gaps, corner rocks (±3,±3). It adds an obstacle near (-3,-6), which is the Air portal, and a boundary about 7–8 tiles out. Its rows are the best-measured multi-orb example.

**Cosmic(?)**: fDK9WtB3-08 shows an unnamed grey checkered arena with purple-swirl maze walls, probably Cosmic. Those rows are kept here.

## Angles (15 rows)

| video | time | altar | player tile | orb tile | wand | outcome | on-screen caption | confidence |
|---|---|---|---|---|---|---|---|---|
| Hl74rVXj2PI | 7:05 | simulator (Icy001's GOP program, Air layout) | (0,2), N home (game code "{2 1 (0,2)r}") | W orb (-6,-1) (clicked) and SW orb (-6,-4). An idle orb at (-3,5) | sequence shown in game code: "*BB*AAA*BB" | by tick 7 both orbs sit together at ~(-3,0)/(-3,-1), heading into the W side and entering together. "Scored ticks 7" | "The idea here will be illustrated on Icy001's Great Orb Project program for clarity." | medium |
| Hl74rVXj2PI | 7:20 | simulator | (0,2) | same two orbs; one at the W gap (-4,0), the other at ~(-6,-4) | conventional: game code "{2 1 (0,2)r}*AAA*B", then "{2 1 (0,2)r}*AAA*BB[5]" | second orb enters 1 tick later than with the trick | "In the next clip, those same orbs will be scored conventionally, but you'll notice that the 2nd orb will enter 1 tick later." | medium |
| fDK9WtB3-08 | 3:28 | Cosmic? | (1,4)-ish, just S of the N arch (tilted camera, altar bottom of screen) | behind a maze wall to the N (~(3,10)), circled green at 3:25 | attract (3:28); orb then dragged S past the arch | orb comes through the arch toward the player (3:31); result not shown | (green circle around orb behind wall, no text) | low |
| fDK9WtB3-08 | 3:34 | Cosmic? | (1,-2)-ish, S/SE of altar (tilted camera) | far W/NW along the maze wall (~(-8,3)) | attract (3:34) | not shown | (none) | low |
| fDK9WtB3-08 | 4:31 | Cosmic? | NE of altar about (2,1) (camera tilted) | N, behind maze walls (~(3,8)) | attract (4:31), then repel 2 ticks with walk on (4:34-4:37) | orb brought S to the altar's NE side (4:37); scores | "Note that turning walk "on" here, will allow you to repel for 2 ticks instead of 3." | low |
| fDK9WtB3-08 | 4:46 | Cosmic? | W/NW of altar about (-3,1) | far NW in the maze (~(-8,6)) | attract (4:46, 4:49); wait for the curve, then attract again | orb curves around the arch/walls, then is brought to the altar; player at altar "Craft-rune Altar" (4:58) | "Remember to wait for the orb to finish curving before attracting or else you're seriously fucked." (4:52-4:55) | low |
| fDK9WtB3-08 | 5:01 | Cosmic? | (1,-1) by altar, then moves NE into the maze (5:04-5:10) | NE in the maze near the wall (~(6,6)) | attract (wand-swap message 5:01/5:07), then repel (5:13) | orb pushed back SW toward the altar (5:13); result not shown | (none) | low |
| fDK9WtB3-08 | 6:25 | Cosmic? | NW part of the maze, ~2 tiles S of the orb, beside a wall stub | NW corner of the maze against the outer wall (~(-9,6)) | attract (6:25); the player uses a wall stub as an obstacle to premove | orb dragged S/E toward the altar (6:28-6:31); the player arrives at the altar before it (6:34) | "Use the obstacle to premove. Doing so saves 1 tick." (6:25-6:28) | low |
| fDK9WtB3-08 | 6:37 | Cosmic? | NE of altar at about (2,4) (tilted camera) | E/NE against the outer wall (~(9,5)) | attract + wand swap (message 6:37, 6:40), then repel | orb pushed W toward the altar (6:43-6:46); result not shown before cut | (none) | low |
| fDK9WtB3-08 | 7:38 | Cosmic? | (0,2) N home | N, beyond the N arch, 2 orbs (~(-2,6) and (0,6)) | attract (7:38), player walks N through the arch (7:41) | orbs pulled S. Player ends N of the arch (7:44-7:47) with orbs at about (0,4) and (-2,2) | (none) | low |
| fDK9WtB3-08 | 7:50 | Cosmic? | (2,0) E side, then NE (7:53-7:59) | far SE (7:50) / N in the maze (7:53) | attract ("Choose Option / Attract Yellow orb / Change-wand Yellow orb" menu, 7:50) + wand swap | orb dragged toward altar's E/NE side (8:02) | (none) | low |
| fDK9WtB3-08 | 9:53 | Cosmic? | (2,0) E home; teammate at (2,2) | E/NE beyond E stone (~(7,1)) | attract (9:53-9:59), then repel (10:02, wand at orb on E side of altar) | orb into altar from the E (10:05) | "The next is 1 tick faster than repositioning yourself to score from here. Therefore useful when short on time." (red box at about (0,2)) | medium-low |
| fDK9WtB3-08 | 11:05 | Cosmic? | (2,-1)/(1,-1) SE by altar | NE/N in the maze (~(3,9)) | attract (11:08) | orb dragged S to about (3,5) (11:11), then by the altar's NE (11:14) | "Set it up to be multi-orbed from south or repel it in from north." (11:11-11:14) | low |
| fDK9WtB3-08 | 12:26 | Cosmic? | (-1,-2) SW of altar | SW far (~(-6,-6)) | attract (12:29), wand swap (12:32), then attract/repel (12:35-12:38) | orb pulled NE to W of altar (12:38); player at altar "Craft-rune Altar" (12:44) | (none) | low |
| fDK9WtB3-08 | 12:47 | Cosmic? | (-1,-2) SW, behind the S/SW stone | (-3,-3) at the W end of the S stone, then a new orb SE (~(3,-4)) at 12:50 | repel (12:47), attract (12:50) | first orb scores; second not shown | (none) | low |

## Hl74rVXj2PI: Great Orb Project. Advanced Tricks & Angles - Part 1

### Captions (in order, verbatim)

Title cards (yellow text on an abstract background):
- 0:00–0:07: "6 Great Orb years ago Jij and others from Lily's clan chat made, what was meant to be, a preview video called "Great Orb Project Guide - Showing Tricks & Angles.""
- 0:09–0:15: "Following the September 11th terrorist attacks on the Pentagon and World Trade Center, plans to release the full video were no longer an immediate priority."
- 0:16–0:21: "As result, the full video was never completed." (first line fades out first; at 0:21 only "never completed." remains)
- 0:27–0:30: "In honor of their Great Orb memory, we will be completing that video."
- 0:33: "Great Orb Project: Advanced Tricks, Angles, and Strategies (2016)"
- 0:36–0:39: "Brought to you by WorldStarHipHop.com"

White captions over the Wizards' Tower lobby:
- 0:45: "This guide will be broken down into 3 parts:"
- 0:48–0:51: "Part 1 will consist of patterns for setting up and scoring 2 orbs, assuming that your partner is manipulating the 3rd."
- 0:54–1:03: "Part 2 will consist of scoring a single orb in the fastest way possible. This is only useful (and should generally be avoided) unless you are short on time or if your partner is manipulating the other 2 orbs with the intent of scoring them both."
- 1:06: "Part 3 will consist of defense tactics, angles and strategies!" [followed by an off-topic aside, omitted]
- 1:15–1:18: "Part 1) The idea here is that finding a way to score a group of 2 or 3 orbs in the fastest way possible will (usually) result in a higher end score than finding the fastest way to score orbs in groups of 1."
- 1:24–1:30: "This is because grouping orbs together allows you to multi-orb which ultimately saves "ticks""
- 1:27 (footnote, lower right): ""tik/ [speaker icon] "- (1) -the name of Runescape's 0.6 second time unit (2) One of the many side effects of Clarens' daily psychaitric medication(s)."
- 1:33–1:39: "This is especially important when soloing, but gets less important  the more players that are on your team."

Gameplay captions:
- 1:45–1:51: "If you're coording east and west on air, and you notice your partner is busy scoring  2 other orbs, you may have, in the past, attempted to score this orb while waiting." ("2" underlined. Red circles around the word "this" and the E orb)
- 1:54–1:57: "The only problem is, by going here to score, you put yourself 1 extra tick away from your ideal center spot, and also prevent yourself from scoring a north east spawn." ("here" underlined red with a red tile marker; "ideal" underlined green with a green tile marker)
- 2:00: (no text, red crossed lines drawn over the W side of the arena)
- 2:03–2:06: "By using the pseudostratified epithelial tissue repel angle shown, you are 1 tick closer to the ideal spot, and make it possible to score certain eastern orbs without moving."
- 2:21–2:27: "The same angle can also be applied from an offstep by making a small adjustment. / This situation, unlike the other, will mostly presents itself when soloing."
- 2:45–2:54: "This situation, like the previous, mostly occurs during soloing. However, if this were, say, body, and the northern orb had not yet spawned, this trick would place you at your coording spot (south) sooner.  Thus, (lol, "thus") you'd be able to score the northern orb faster." ("northern" underlined green, the N orb green-circled)
- 3:12–3:18: "In this situation, you can use this space to drag you in an ideal spot for scoring both orbs. This same idea has another use, which will be shown later. [joke omitted]" ("this space" in orange, with an orange arrow drawn and red circles/arrow on the two SE orbs)
- 3:30–3:33: "You may have noticed that the first orb I clicked, took a different route than it usually does." (red boxes trace the orb's path)
- 3:39–3:48: "This is known as an "orb tick." By this orb taking a shorter route, the next orb will appear sooner."
- 3:57: "Fastest way to score two orbs lined up on different pillars"
- 4:15–4:18: "Saves 2 ticks because it allows you to multi-orb without the pillar orb having to curve."
- 4:24–4:30: "Very similar to the previous, allows you to save 3 goddamn more ticks than the traditional method because it can be premoved as well." ("3 goddamn more ticks" in italics)
- 4:36–4:48: (no text, an image of a stag-headed figure beside a girl in red)
- 4:53–4:56: "Another fake-repel angle, this is useful while duoing east/west in air, as it helps you arrive back to the center spot faster."
- 5:11–5:14: "It can also be done from an offstep but requires you to walk on either the first or last tick"
- 5:20–5:23: "This next trick is useful because it puts you in a position to multiorb two orbs which is usually is faster than scoring one orb at a time" ("two" in green)
- 5:29–5:35: "It also allows this orb to avoid this corner since you will be manipulating it from the west rather than the north. Because it does not have to curve around the corner, it will enter the orb sooner, saving time." ("this orb" in green, "this corner" in red, with a red square on the NW corner rock)
- 5:47–5:50: "This next fucker is helpful because it allows you to multiorb this far orb even though it is not usually multiorbable, saving ticks." ("this far orb" in green)
- 6:11–6:17: "Useful when coording North/South on fire. Allows you to return to center south spot and avoid the prototick delay associated with manually moving your character." ("prototick" underlined)
- 6:17–6:23 (footnote): "Pro-to-tik/ 1)The 1 tick period after moving your character that you cannot manipulate an orb. 2) [joke omitted]" (6:23–6:29 then shows a painting of a wide-eyed man in a suit, with no text)
- 6:32: "This trick is useful when you need to be moved toward the east to score the other orbs." (Body, single frame, no click visible)
- 6:38: "This spot allows you to skip the delay that is often associated with tapping. Most useful when on an off-step." ("This spot" in green, green square on the ground)
- 6:50: "This next maneuver is only to be done when very short time. It allows both orbs being manipulated to enter before time runs out."
- 6:59–7:02: "The idea here will be illustrated on Icy001's Great Orb Project program for clarity."
- 7:05–7:08 (simulator UI): "Tick: 2 of 199 / Score: 0 / Estimated score: 0", "-7 ticks", "+7 ticks", "Save", "Scored ticks", "Game code {2 1 (0,2)r}*BB" → at tick 7 "{2 1 (0,2)r}*BB*AAA*BB"
- 7:14: "In the next clip, those same orbs will be scored conventionally, but you'll notice that the 2nd orb will enter 1 tick later."
- 7:17–7:20 (simulator UI): "Game code {2 1 (0,2)r}" → "{2 1 (0,2)r}*AAA*B"
- 7:23 (zoomed UI): "Scored ticks 7" / "Game code {2 1 (0,2)r}*AAA*BB[5]"
- 7:29: (no text, a painting of an egg-headed cook holding a pan of bacon)
- 7:39–7:54: "These next few maneuvers allow you to drag yourself into a position where you can score both orbs at once."
- 8:30–8:33: "This move allows this orb to curve and take a shorter route to reach the altar." ("this orb" in green)
- 8:33–8:39: "Traditionally it is done by tapping. However, as an alternative, you can use the action bar to repel. This spares you from the delay associated with tapping and allows you to multiorb, saving time."
- 8:45–8:48: "This is a neat little algorithm that Yongyi often uses to score when there are spawns in the North east and North west regions of earth altar."
- 9:18–9:24: "That's it for Part 1 (Multiorb scoring tricks).  Sorry for the lack of organization. My cat attacked me while I was collecting, converting, editing, and processing clips. She is a very naughty." (second sentence onward in italics. "That's it for" is partly cut off at the top of the frame)
- 9:27–9:36: "Quick thanks to everyone who helped me gather everything I needed for Part 1! / Sayoscaping / m x799 / Puniashu / Icy001 / Z Drag0na / poif"
- 9:42–9:51: "Be sure to watch Timo's guide if you are unfamiliar with some of the terms or strategies shown here. You should be comfortable with everything in that video before watching our 3 part series. Check the description for a link."
- 9:54: "A lot of the angles shown need a special sequence of keys to press at a precise time. Those can also be found in the description."
- 10:00–10:06: "Click here for Part 2"

## fDK9WtB3-08: Great Orb Project. Advanced Tricks & Angles - Part 2

### Captions

These are verbatim, in order. Timestamps are the frames where each caption is visible. Typos are kept as they appear on screen (for example "japenese", "sitten", "re-clicking the on", "preformed").

- **0:00-0:15:** black screen, no text.
- **0:18-0:27 (title card):** "Part 2: As stated earlier, this will consist of angles that you ought to perform when your partner(s) are prepared to score the other 2 orbs, or when you only have enough time left for one orb to go in."
- **0:48-0:51:** "This angle also works on the spawn 1 space southwest... The only difference is that you're required to hold for 2 ticks instead of 1."
- **1:57-2:01:** "As opposed to taking 4 ticks to manipulate the orb, this takes 3, however, places you in a poor position."
- **2:04-2:07:** "It can also be used as a way to score while bringing you closer to the 2nd orb." A red arrow is drawn at 2:07, pointing SW toward the second orb.
- **2:16-2:19:** "Worth using for this orb, as well."
- **2:28-2:31:** "If you paid attention, you noticed that my character actually returned to the center spot before the next orb". [an off-topic joke word is underlined] and "before" is italic.
- **2:31-2:34:** [off-topic joke pop-up omitted]
- **2:34-2:40:** "This is because players are able to move 2x an orb's speed. (You can consider it a walking NPC)." "walking" is italic.
- **2:40-2:49:** "So, if you are ever confined to a single orb for whatever reason (bad spawns, short time, or duo partner is a ball hog) you can solo an orb like this and always make it back to the ideal position before the next one spawns."
- **2:58:** "Most people know that it can be assisted to a northern partner by holding for 2 ticks."
- **3:01-3:07:** "However, if that partner is, for whatever reason, busy or you're low on time while soloing, it can be solo scored by toggling walk during the drag, premoving south, and double tapping."
- **3:13-3:22:** "This might seem like a lot of unnecessary movement, but the end result is that the orb will enter the altar at the same speed as passing it to your partner would have taken! In addition, you'll have enough time to run back to center position before the next orb spawns."
- **3:25:** a green circle is drawn around an orb hidden behind a maze wall on the Cosmic(?) altar. No text.
- **3:40-3:43:** "Note that this trick only works from south."
- **3:52:** path-counter tiles "3", "4", "5!" are drawn on the orb's path.
- **3:55-4:01:** "Compared to the "usual" way, the method shown in the previous 2 clips is faster since the path that the orb takes to enter the altar involves one less space..."
- **4:10-4:13:** red path-counter tiles "1", "2" and "6!".
- **4:34-4:37:** "Note that turning walk "on" here, will allow you to repel for 2 ticks instead of 3."
- **4:52-4:55:** "Remember to wait for the orb to finish curving before attracting or else you're seriously fucked."
- **5:16-5:22:** "This repel trick allows you to premove the orb. Premoving without the repel trick results in "ruining" the orb by curving it around the rock and making it take longer to score." "premove" is underlined.
- **5:25-5:31 (dictionary pop-up):** "Premove /pri moov/ (noun) - 1) Rare cases where you can move before manipulating an orb and avoid the prototick. 2) [joke omitted]" It is followed by images of wave-equation formulas.
- **5:58-6:16 (three captions added one at a time):**
  - "(1) Depending on where your next spawns appear, you can tap this orb and end up here, with a prototick."
  - "(2) Toggle run off, to return to the centerspot here."
  - "(3) Toggle run on, to be dragged 2 spaces to the east, here." "on" is italic.
  - Each "here" is a coloured link.
- **6:16-6:19:** "It's a good spawn because it provides you with options. Depending on where your next orb appears, you have the option of getting there faster in all 3 cases." "options" is italic.
- **6:25-6:28:** "Use the obstacle to premove. Doing so saves 1 tick."
- **6:49-7:35:** horse stock footage, no text.
- **8:20-8:23:** "This repel trick allows you to either (1) set it up for north, (2) hold for 3 ticks and score it from south yourself, (3) or repel it in if short on time."
- **8:26-8:44:** "This is a useful angle to perform since the south player on fire is usually the one busy with all the orbs. This can help take some of that burden off. It is superior to the traditional method (shown next) because it takes only 9 ticks to perform and enters the altar 2 orb ticks faster. It is also superior to setting it up for south because it enters the altar 1 orb tick faster than if your partner was to score it from the center spot."
- **8:56-8:59:** "This angle is inferior because it takes 10 ticks to perform and 1 extra orb tick to enter than the previous."
- **9:11-9:14:** "This is a useful way to setup this spawn if north is busy."
- **9:20-9:26:** "This next move is useful when trioing (E/W/S). East will usually be more busy than south, so you can make east's job easier by setting this portal spawn if s/he's occupied with another orb. It takes the same amount of ticks to go in if east were to score it."
- **9:32-9:35:** "It is superior to going here because this method can be deaded." A red box marks the "here" tile, "here" is a red link, and "deaded" is underlined.
- **9:38-9:41 (dictionary pop-up):** "Dead /ded/ (adj) 1) Clicking an orb the same tick that it spawns causing the orb animation to run in order to catch up to its actual location. 2) When ya homeboy tell a funny joke and you lack the proper emoji to express your amusement."
- **9:44-9:50:** "This spawn can also be deaded from south. Therefore faster than east going here to score. However, it must be received by the east since you can't score it yourself." An orange box marks "here".
- **9:53-9:59:** "The next is 1 tick faster than repositioning yourself to score from here. Therefore useful when short on time." A red box marks "here".
- **10:14-10:20:** "Similar to the previous. Take note that you are not manually (yellow click) moving to the south spot to repel. You are simply re-clicking the on the 3rd tick while using your repeller on the action bar."
- **10:41-10:59:** thought-bubble gag images: equations, a figure, and a face. No text.
- **11:11-11:14:** "Set it up to be multi-orbed from south or repel it in from north."
- **12:59-13:11:** meme animation (blue face), no text.
- **13:17-13:20:** "If you ever find yourself out of position while duoing, rather than pre-moving back to center, go here and hold for two. This will allow you to score south western orbs without losing a tick." The caption uses coloured words: "here" is a link, "hold for two" is green, and "south western orbs" is yellow and underlined.
- **13:23-13:26 (title card):** "A few helpful premovements."
- **13:52-13:55:** "On water and earth, going west can increase your range."
- **14:22:** a drawing (sketch of a figure), no text.
- **14:31-14:37:** "That's it for part 2 (single orb scoring). Once again, check the description if you're not sure how I preformed a certain angle."
- **14:46-15:52:** "Click here for Part 3".

## PPXA-Xg9qFM: Great Orb Project - Some nice to know angles

### Captions

There are no title cards and no captions apart from these five (I checked by scanning the video at 2 fps for white text):

- 4:42-4:45 (Earth): "No need to tap ground."
- 5:12-5:14 (Fire): "Can use this angle with any altar."
- 6:00-6:02 (Body): "Repel first then switch to attract."
- 6:14-6:15 (Body): "Might be useful for soloing or when your partner is busy."
- 6:28-6:29 (Body): "Same angle as the one shown on fire."

Other on-screen text (mouseover, not guide captions): `Attract Yellow orb`, `Attract Green orb` (5:29), `Use Air altar` (0:03), `Use Mind altar` (0:24, 1:18), `Use Water altar` (2:08, 2:23), `Use Earth altar` (3:52, 4:04, 4:10), `Use Body altar` (6:35).
