# 11 · Contradictions and open questions

Where sources disagree, the main pages use the value marked ✅ and record the rest here. ❓ means
there is no good answer yet.

## Contradictions between sources

| Topic | Values found | Used |
|---|---|---|
| Repel reach | RS Wiki Guide: click reach 9, repels "at most 8". Emulator: click reach 8, push cancelled at 8+, so 7 in practice | ✅ Emulator for the engine; both listed |
| Playable ticks per altar | 200 (main article), 196 (Guide), 199 (Wiki trivia and emulator `ticksPerAltar`) | ✅ 200-tick round, 199 simulated |
| Opposing-orb cut-off | "Last 30 seconds" (main article, RuneHQ, KB) vs "last quarter of the altar" (attractor item pages) | ✅ Same thing: 30 s is a quarter of 120 s |
| Moving opposing orbs | 2011.rs KB: "the orb will only ever move one square". Everyone else: normal movement | ✅ Normal movement; ❓ the KB line may describe an old version |
| Runecrafting level effect | RuneHQ: push/pull velocity depends on level. 2011.rs KB: reach depends on level. RS Wiki and emulator: fixed values | ✅ No effect |
| Abandon penalty | RuneHQ: flat 15 min. RS Wiki: 10 min free / 15 min members, falling to 1 min | ✅ RS Wiki |
| Team assignment by generic wizard | RS Wiki: random team. Fandom/RuneHQ: least-populated team | ❓ Probably the smaller team when sizes differ |
| Lobby timer reset | RS Wiki: runs only if sizes differ by ≤ 1. Fandom: resets if one team leads by 2 | ✅ Same rule, two phrasings |
| Lobby portal open time | 2011.rs KB only: 20 s | ❓ Single source |
| Orb respawn location | RuneHQ: arena edges. RS Wiki: random fixed points. Emulator: random from a fixed list (mostly outer tiles on large altars) | ✅ Random from a fixed list |
| Scoring zone | Tip.It/RuneHQ: "adjacent/touching". RS Wiki: "1-grid square". Emulator: 5 × 5 square incl. corners | ✅ Emulator |
| Majority-bonus tie | RS Wiki: "split evenly". Fandom: 100/75 | ✅ Same thing |
| Members 50/50 tokens | 540 (RS Wiki, 2015 video, derived) vs 610 (2008 video) | ✅ 540 |
| Master robes bonus | Shop: +1% per piece, +1% set bonus (= 5%). Main article: +5% full set. RuneHQ: 0.4/0.8/0.6/0.6% | ✅ 5% full set |
| Runecrafting staff price | 10,000 (RS Wiki) vs not listed (RuneHQ, which lists 10,000 against the talisman staff) | ✅ 10,000 |
| Old robe stats | Tip.It: robes give Magic bonuses. RuneHQ/2011 KB: +2 to +3 "Runecrafting" | ❓ Historic; cosmetic today |
| Barrier limit | DailyRsFix: one at a time. AnroyRS: "a limit... within a certain period of time" | ✅ One at a time (RS Wiki); ❓ maybe also a cooldown |
| Floor of the Guild portal | "First floor" vs "second floor" | ✅ British vs American floor numbering; "top floor" |
| Activity bar timing | "2 to 3 minutes of inactivity" vs the bar resetting every 2-minute altar | ❓ Drain rate unknown |
| Omni-talisman XP | 13,605 (RS Wiki, 13 talismans) vs Tip.It's 12-talisman table summing to 13,606 | ❓ Minor |

## Open questions (nobody documents these)

1. **Chaos and Nature maps.** They are not in the emulator data. Nature now has a layout
   description from video ([07](07-altars-and-maps.md#nature-altar-8-members)), but no tile grid or
   spawn list. Chaos is still unknown: none of the 20 angle guides shows it.
2. **Barrier mechanics in detail:** how long a barrier lasts, the enemy break chance, any cooldown,
   and the exact rule for "an orb already being moved ignores it".
3. **Essence formula rounding:** is it floor(other / 2)?
4. **Activity bar** drain and refill amounts.
5. **The 30-second lock:** does it begin at tick 150 exactly?
6. **Tie-breaks in the player queue:** in the live game this is the server's player index. How that
   index is assigned in a GOP instance is unknown.
7. **The Mind 4-5 orb glitch:** what causes it.
8. **The 6 repel-trick variations** in Wrestling Science's videos are visual only. The emulator's
   glitch-repel tests capture some of them, but no text names all six.
9. **Pre-2009 (RuneTek 4) line of sight**, "symmetrically rotational", for historical accuracy.
10. **Mind scenery vs tiles.** The video guides show a round altar, a dolmen to the south and an
    irregular stone ring. The emulator's tile data has the shared pillars and corner rocks. Which
    tiles really block on Mind? One reader also saw orbs stop at the altar's edge without
    scoring, which hints that Mind's scoring zone may be smaller than 5 × 5.
11. **"Holding will not work well" on Air.** Everheather's West guide says a plain hold from W
    home on an orb at (1,±5) or (1,±6) works poorly, and recommends tapping with OAO instead. The
    engine's `hold()` scores those in 7 ticks. Either tapping is simply faster, or the live game
    differs from the emulator here.
12. **Arch lintels.** On Nature, two clicks suggest that orbs pass under the lintel at (±4,0). The
    emulator treats the gap as open floor, and no video shows an orb going through cleanly.

## How to resolve them

* For the engine: run Vief's Trapdoor locally (ASP.NET 8, see its README) and compare with recorded
  live footage tick by tick.
* For maps: the emulator's custom-altar editor writes the same JSON-style grid format as
  [data/](../data/README.md).
* For video-only knowledge: all 20 angle guides have now been read frame by frame
  ([video-angles/](video-angles/README.md)). Most tile positions there are estimates. Re-reading
  the low-confidence rows with a top-down camera, or in the emulator, would firm them up.
