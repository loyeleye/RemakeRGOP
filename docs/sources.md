# Sources

Every page cites these by short name. All web pages were read on **19 November 2026** unless noted.
"Read via" says how: most pages were fetched and extracted by a research assistant, and the
emulator was cloned and read directly.

## Primary community sources

| Short name | Source | What it gave | Read via |
|---|---|---|---|
| **Emulator** / Vief's Trapdoor | [github.com/yongyi781/great-orb-project](https://github.com/yongyi781/great-orb-project), HEAD `fbd9766` (17 Dec 2023). Altar maps from `src/GOP/Scripts/Engine/AltarData.ts` at commit `073b074` (14 Jul 2016) | The tick engine (`GopBoard.ts`, `Orb.ts`, `Player.ts`, `GameState.ts`), the six free altar maps and spawn lists, and the tests naming glitch-repel and orb-drag | Cloned and read in full |
| **RS Wiki** | [The Great Orb Project](https://runescape.wiki/w/The_Great_Orb_Project) | Rules, timers, tokens, update history, trivia | Fetched |
| **RS Wiki Guide** | [The Great Orb Project/Guide](https://runescape.wiki/w/The_Great_Orb_Project/Guide) (rev. 37050130, 21 May 2026) | Tick mechanics, taps, prototicks, control, positioning | Fetched |
| RS Wiki item and NPC pages | [Runecrafting Guild](https://runescape.wiki/w/Runecrafting_Guild), [Runecrafting guild token](https://runescape.wiki/w/Runecrafting_guild_token), [Runecrafting Guild Rewards](https://runescape.wiki/w/Runecrafting_Guild_Rewards), [Green attractor](https://runescape.wiki/w/Green_attractor), [Yellow attractor](https://runescape.wiki/w/Yellow_attractor), Green/Yellow repeller and barrier generator, [Green orb](https://runescape.wiki/w/Green_orb), Yellow orb, [Wizard Acantha](https://runescape.wiki/w/Wizard_Acantha), Wizard Vief, [Omni-talisman](https://runescape.wiki/w/Omni-talisman), [Activity bar](https://runescape.wiki/w/Activity_bar), [Game tick](https://runescape.wiki/w/Game_tick), [Template:The Great Orb Project](https://runescape.wiki/w/Template:The_Great_Orb_Project), the 8 altar pages | Items, IDs, prices, NPC roles | Fetched |
| **Fandom wiki** | [runescape.fandom.com/wiki/The_Great_Orb_Project](https://runescape.fandom.com/wiki/The_Great_Orb_Project) and the 2010 mirror [misc.thefullwiki.org/The_Great_Orb_Project](http://misc.thefullwiki.org/The_Great_Orb_Project) ("up to date as of February 07, 2010") | Older rules, formats (50/50, crashers), token rates | Fetched |

## Guides and news

| Short name | Source | Notes |
|---|---|---|
| **Jagex news** | [Runecrafting guild and game - for all players](https://secure.runescape.com/m=news/runecrafting-guild-and-game---for-all-players), 12 Aug 2008 | Official release post |
| **Tip.It** | [tip.it/runescape/pages/view/great_orb_project.htm](https://www.tip.it/runescape/pages/view/great_orb_project.htm), by "tryto", updated 10 Nov 2014 | Rules, robe stats, omni-talisman XP table |
| **RuneHQ** | [runehq.com/minigame/the-great-orb-project](https://www.runehq.com/minigame/the-great-orb-project), entered 2 Sep 2008, updated 18 Nov 2012 | Rules, rewards table, tips |
| **2011.rs KB** | [2011.rs/kb/the_great_orb_project](https://www.2011.rs/kb/the_great_orb_project) | Archive of the official RuneScape Knowledge Base article |
| **Carousers** | [carousers.org/activities/great-orb-project](https://carousers.org/activities/great-orb-project) ("Amy's Quick GOP guide", 2015) | Orb-path advice |

## Videos

See [videos.md](videos.md). Spoken content was read from YouTube transcripts. The commentated
videos quoted are AnroyRS (`svnoU6JmD-s`), DailyRsFix (`Wc6AOOjYoLQ`), HowToPlayRunescape
(`uajqyO04FOE`) and AOROX (`t-yK3-TXQHw`).

## Could not be read

* `great-orb-project.fandom.com` (a dedicated GOP fan wiki, including its "Tick" page): the site
  refused automated requests.
* Sal's RuneScape Forum GOP thread: refused.
* RS Wiki image files (GOP screenshots): the image server returned errors.
* Every silent angle video (see [videos.md](videos.md)).

## Licence status of reused material

* **Emulator code** is not copied into this repository. `tools/gop_engine.py` is an independent
  Python re-implementation of the rules it encodes, written to document them. The upstream
  repository has **no licence file**, so by default its code is all rights reserved.
* **Map data** in `data/altars/*.json` is converted from the emulator's `AltarData.ts`. It describes
  Jagex's arena layouts as transcribed by the emulator's author. ❓ No licence covers it. Fine for
  study, but **ask the author (GitHub `yongyi781`) before shipping it in a product**, and note that
  the layouts themselves are Jagex's design.
* RS Wiki text is CC BY-NC-SA 3.0. Quotes here are short and attributed.
* RuneScape, Jagex and all game names are trademarks of Jagex Ltd. This knowledge base is a fan
  reference.
