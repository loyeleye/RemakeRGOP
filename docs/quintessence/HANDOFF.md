# Handoff: the Quintessence reference and `tools/rpgm-dump`

This is for whoever picks this up next, whether that is you or a Claude session in this repo. It covers
what exists, where it lives, how to rebuild it and how to use it. It was made on 2026-11-20 from the
user's local copy of *Quintessence* chapters 1–11 (`Quintessence_C1-11-SETUP`, RPG Maker XP).

## In one paragraph

*Quintessence* is an RPG Maker XP game. `tools/rpgm-dump/rpgm_dump.rb` turns its `Data` folder into
Markdown: every scene's dialogue, the story flags, the mechanics database and the Ruby scripts. The
raw dump is the original game's writing, so it stays **out of git** in `reference/`. Committed to the
repo are the tool and two summaries written in our own words: [story-beats.md](story-beats.md) and
[mechanics.md](mechanics.md). Read those first. Go to the raw dump only for details or quotes you
need while studying.

## Ground rules (same as the GOP knowledge base)

1. **Study only.** Lanternfall's story, characters, names, maps and systems are original. Nothing
   from the dump (dialogue, names, map layouts, stats, art or audio) is copied into `src/`, `public/`
   or the game design docs.
2. **Never commit `reference/`.** It's in `.gitignore`, and the repo is public. Check `git status`
   before every commit that touches nearby files.
3. **Summaries stay in our own words.** If you extend `story-beats.md` or `mechanics.md`, paraphrase
   and keep any quotes very short. Don't paste blocks of game dialogue into committed files.
4. **Mark guesses.** Anything inferred and not seen directly in the data gets *(unclear)*.

## What lives where

| Path | In git? | What |
|---|---|---|
| `tools/rpgm-dump/rpgm_dump.rb` | yes | The dumper (Ruby, no gems). |
| `tools/rpgm-dump/README.md` | yes | How to run it and what each output is. |
| `docs/quintessence/story-beats.md` | yes | The plot of chapters 1–11, chapter by chapter, plus the cast. |
| `docs/quintessence/mechanics.md` | yes | Battle system, transformations, mini-games, collectibles and engine tweaks. |
| `docs/quintessence/HANDOFF.md` | yes | This file. |
| `reference/quintessence/` | **no** | The raw dump. Rebuild it with the command below. |

## Rebuild the raw dump

You need Ruby 2.7+. On Windows, [RubyInstaller](https://rubyinstaller.org/) is fine. From the repo root:

```bash
ruby tools/rpgm-dump/rpgm_dump.rb "C:\Users\12487\Downloads\Quintessence_C1-11-SETUP\Data" reference/quintessence
```

It takes about a second. If you only have the shipped game (a `Game.rgssad` archive and no `Data`
folder), unpack the archive first with an RGSS extractor (for example RGSS-Extractor or one of its forks).
When a new chapter comes out, run the command against the new `Data` folder. The output folder is
rewritten in place.

Expected result for chapters 1–11: 461 maps, 20 regions plus common events, about 110k words of
dialogue, a 901-scene timeline, 9 mechanics files and 108 scripts (18 custom).

## Using the dump (a reading order for Claude)

The dump is too long to read in one go: the `dialogue/` files alone are about 110k words. Load it
piece by piece:

1. `reference/quintessence/README.md` is the index, with each region's word count.
2. To follow the plot or check a beat, read `timeline.md` (story scenes in rough play order) or one
   `dialogue/NN-region.md` file.
3. To see what triggers what, use `flags.md`. Every switch and variable is listed with where it is set
   and where it's needed. The developer's flag names are descriptive ("Chap3 Started", "Kardian Petal
   Conv Over").
4. To understand a scene's logic, open the same region file in `story/`.
5. For mechanics, start with `mechanics/` and `story/90-common-events.md` (the real battle and
   transformation systems are common events), then `scripts/README.md`.

Useful searches: `grep -n "Lunair (" reference/quintessence/dialogue/*.md` follows one speaker.
`grep -n '"Chapter\|CHAPTER\|Chap' reference/quintessence/flags.md` lists the chapter markers.

## How the tool works (to extend it)

It's a single file, organised by class:

| Class | Job |
|---|---|
| `Table`, `Color`, `Tone` and the `RPG::*` stubs | Let `Marshal.load` read RGSS data without RPG Maker. Classes it doesn't know are created on the fly (`RpgmDump.load`). |
| `Db` | Loads every database file and turns IDs into names (actors, items, switches and so on). |
| `TextCleaner` | Message codes: `\name[]` becomes the speaker, `\f[]` the mood, `\N[]` an actor's name and `\V[I/W/A/S n]` an item, weapon, armor or skill name. Other codes are removed. |
| `EventRenderer` | One `case` over event-command codes (101 text, 102 choice, 111 if, 121 switch …). **Add a new command here.** |
| `StoryWriter` | Region files (top-level folders of the map tree) and the list of story scenes for the timeline. |
| `TimelineWriter`, `FlagWriter` | `timeline.md` and `flags.md`. |
| `MechanicsWriter` | Generic database dump: non-default fields only, IDs resolved, stats sampled by level. |
| `ScriptWriter` | Unpacks `Scripts.rxdata` and marks the scripts that aren't stock XP. |

To test a change, run it on the real data and compare the output (`diff -r`). There is no Ruby test
setup in this repo, so the Vitest suite doesn't cover the tool.

## Known gotchas

* **The timeline's order is a heuristic.** It sorts scenes by switch number. That works because the
  developer mostly added switches in story order, but content rewritten later gets high numbers. The
  Chapter 1 deer hunt and intro use S565–S599, so most of their scenes appear near the end of `timeline.md`. Check
  `flags.md` when two scenes look swapped.
* **Duplicate maps:** the game copies maps for seasons and story states (for example Gaurav Town 97/213
  and Korbin in winter), so some scenes appear twice.
* `Data/Copy of Scripts.rxdata` is a developer backup, and the tool ignores it.
* Speaker names depend on this game's AMS message script. On other games, lines may have no
  speaker. VX/Ace games show the face graphic's file name instead.
* The `Enemies` and `Troops` tables are mostly stock RPG Maker. Real fights are map events with
  HP-bar common events.

## Open threads

* Confirm the *(unclear)* points in `story-beats.md` by reading the matching `dialogue/` and `story/`
  sections. The main ones: what happened to Serai in the Aerian facility, exactly how the cure fails
  and leaves Lunair a hawk, Vikon's fate in Chapter 10, and why Reivier takes the Quintessence again.
* Chapter 11 ends partway through. Re-run the tool and extend the summaries when later chapters are
  released.
* If Lanternfall borrows ideas, write them up as **original design notes** in `docs/design.md`. The
  last section of `mechanics.md` lists a few candidates (wind-pushed projectiles, swapping between two
  characters, abilities earned by collecting forms).
