# rpgm-dump

Turns an RPG Maker XP, VX or VX Ace game's `Data` folder into Markdown that you and Claude can
read: the story, the flags that decide the order of the story beats, the mechanics database and the game's
Ruby scripts. First used on *Quintessence* (RPG Maker XP, chapters 1–11) as a study reference.

## Run it

You need Ruby 2.7 or newer and nothing else. On Windows, use [RubyInstaller](https://rubyinstaller.org/)
or WSL.

1. If the game ships a packed archive (`Game.rgssad`, `.rgss2a` or `.rgss3a`), unpack it first with an
   RGSS extractor so that you have a `Data` folder of `.rxdata` / `.rvdata` / `.rvdata2` files.
2. Run:

```bash
ruby tools/rpgm-dump/rpgm_dump.rb "path/to/Game/Data" reference/quintessence
```

`reference/` is in `.gitignore`. The dump is the original game's own writing and data, so it stays on
your machine and is never committed. Run the tool again on new data, for example a later chapter, to refresh the dump.

## What you get

| Path | Holds |
|---|---|
| `README.md` | Index: every region with its map count and dialogue word count, plus links to the rest. Start here. |
| `dialogue/NN-region.md` | Only the story: lines as `Speaker (mood): text`, choices and their branches, party changes, battles, transfers. Each event page is tagged with the flags it needs. |
| `story/NN-region.md` | The same events in full: branches, flag changes, item and gold changes, common-event calls, script calls and developer comments. |
| `timeline.md` | Story scenes (cutscenes and flag-setting pages) in rough play order, sorted by the switches they need and set. Side chatter is left out. |
| `flags.md` | Every switch and variable, with where it is set and which pages need or check it. Follow it to put the beats in order. |
| `mechanics/*.md` | Actors (stats by level), classes (skills learned), skills, items, weapons, armors, enemies (stats, actions, weaknesses), states, troops and system terms. IDs are replaced with names, and default values are left out. |
| `scripts/` | Each Ruby script as a `.rb` file, plus `README.md`, which marks the scripts that are not stock RPG Maker XP. Custom systems live there. |

Regions are the top-level folders of the game's map tree (for example *Korbin Village* and *Flash Backs*).
Lines in brackets, `[ like this ]`, are a character's inner thoughts. Speaker names and moods come from the
`\name[...]` and `\f[...]` codes of the game's message script. A name in parentheses, such as `(Lunair)`,
is how the game itself labels that speaker.

## Using it with Claude

For Quintessence, the committed summaries and the full handoff are in
[docs/quintessence/](../../docs/quintessence/HANDOFF.md).

Point Claude at `reference/<game>/README.md` first. Then load one `dialogue/` file at a time: the full
Quintessence dump is too long to read in one pass. For a mechanic, read the matching `mechanics/` file. If the
game builds that system out of events, as Quintessence does with its key-driven action battles (skill
descriptions say `Battle-key: 'Q'`), also read `story/90-common-events.md` and the custom scripts.

Keep the repo's rule from the GOP knowledge base: the dump is a reference to study. Lanternfall's own
story and systems are written fresh, and no dialogue, maps or data are copied into the game.

## Limits

- Only Show Text, choices and the common story commands are rendered. Movement routes, sound effects and
  screen effects are skipped.
- `flags.md` lists the places a flag is set. It does not simulate the game, so a page that needs two
  flags, or that a script call unlocks, may still need a look at `story/`.
- The speaker and mood labels rely on this game's message script (`\name[]` / `\f[]`). On VX/Ace games,
  the face graphic's file name is shown instead.
