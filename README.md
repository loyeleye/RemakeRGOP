# RemakeRGOP: the Great Orb Project knowledge base

A complete, beginner-friendly reference for **The Great Orb Project** (GOP), the team
Runecrafting minigame in RuneScape (released 12 August 2008). It covers the full ruleset, the
tick-level game engine, every altar map with its angles, and the objectives and rewards. It is
written so that someone who has never played RuneScape can understand the game, and so that
someone building a remake has every rule in one place.

## Read in this order

| # | Page | What it covers |
|---|---|---|
| 00 | [Start here: RuneScape basics](docs/00-start-here.md) | Tiles, ticks, Runecrafting, F2P vs members |
| 01 | [What the Great Orb Project is](docs/01-overview.md) | One-paragraph summary, key facts, story, game flow |
| 02 | [Getting there, joining and teams](docs/02-joining-and-teams.md) | The Guild, requirements, lobby rules, leaving penalties |
| 03 | [Equipment](docs/03-equipment.md) | Hat, attractor, repeller, barrier generator |
| 04 | [Round flow and timers](docs/04-round-flow-and-timers.md) | Altar order, every timer in seconds and ticks, HUD, activity bar |
| 05 | [The tick engine](docs/05-tick-engine.md) | What is documented, then the exact engine rules: board, tick order, the angle rule, orb stepping, sight, control, prototicks |
| 06 | [Angles and geometry](docs/06-angles-and-geometry.md) | Why there are exactly 16 headings, the shared pillar layout, how to read the angle maps |
| 07 | [The altars and their maps](docs/07-altars-and-maps.md) | All 8 altars compared |
| 08 | [Scoring, objectives and rewards](docs/08-scoring-and-rewards.md) | Tokens, essence, XP, the reward shop |
| 09 | [Strategy](docs/09-strategy.md) | Beginner to advanced, team play, defence, records |
| 10 | [History and trivia](docs/10-history-and-trivia.md) | Dated update history, community, trivia |
| 11 | [Contradictions and open questions](docs/11-open-questions.md) | Where sources disagree and what nobody has documented |
| | [Glossary](docs/glossary.md) · [Sources](docs/sources.md) · [Video index](docs/videos.md) | |

## Maps and angle atlas

[docs/maps/](docs/maps/README.md) has a generated page for each free altar (Air, Mind, Water,
Earth, Fire, Body). Each one has the real tile map with every orb spawn point, a heat map for each
of the four home squares showing how many ticks it takes to score an orb from every tile, and a
four-player coverage map. [docs/maps/angle-rule.md](docs/maps/angle-rule.md) shows the 16 headings
an orb can take.

## How it was built

* **Text sources:** the RuneScape Wiki (main article, player-written Guide, item and NPC pages),
  the fandom wiki, Tip.It, RuneHQ, the archived official Knowledge Base, Jagex's 2008 news post,
  a clan guide, and YouTube commentary. See [docs/sources.md](docs/sources.md).
* **Engine and maps:** the community emulator *Vief's Trapdoor*
  ([yongyi781/great-orb-project](https://github.com/yongyi781/great-orb-project)), whose rules were
  reverse-engineered by GOP players. [tools/gop_engine.py](tools/gop_engine.py) re-implements those
  rules in Python for documentation. [tools/angle_atlas.py](tools/angle_atlas.py) generates every
  map.
* **Honesty markers:** every page separates what a source says from what is derived (worked out
  from sourced numbers) and what is **inferred** (a reasoned guess). Conflicts are logged in
  [11](docs/11-open-questions.md).

## Regenerate the maps

```sh
python3 tools/gop_engine.py     # self-test
python3 tools/angle_atlas.py    # rewrites docs/maps/
```

Python 3.9+ and the standard library only. To re-extract the map data from upstream, see
[data/README.md](data/README.md).

## Known gaps

* The members altars **Chaos** and **Nature** have no map data anywhere in text or the emulator.
* Most angle-guide videos are silent, so their specific angles are indexed in
  [docs/videos.md](docs/videos.md) but not transcribed.
* Barrier timing, activity-bar drain rates and essence rounding are undocumented.

## Licence note

The map data is derived from an upstream repository with no licence file, and it describes Jagex's
arenas. The emulator's author has told the project owner informally that non-commercial use is fine.
Commercial use still needs separate permission. See
[docs/sources.md](docs/sources.md#licence-status-of-reused-material). RuneScape is a trademark of Jagex Ltd. This is a fan
reference.
