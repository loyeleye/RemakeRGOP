# Story paintings

Drop each painting here as `<slot>.webp`. Until a file exists, the game shows a labelled placeholder
card in its place. Keep the important part in the middle square: the game runs on upright phones and
on wide screens. Timing lives in `src/client/ending.ts` (`ENDING`).

| Slot | What | Notes |
|---|---|---|
| kindling-ring | Fairy Ring from above at night, brazier lit | Paint at full brightness; the game dims it for lower scores |
| kindling-sky | The whole sky, every island lit | Wider than the screen (it pans left), and taller (it slides up on the way down) |
| kindling-cloud-1 to -3 | Cloud layers, transparent background | Slide up past the view at different speeds; 1 is nearest |
| kindling-eye-1, -2, -3 | The eye shut, a slit, open | Black around it; one eye, nothing else |
| kindling-eye-glint | Fairy Ring's light in the eye's reflection, transparent background | Its opacity follows the score |
| lesson-lantern | Lumi's unlit lantern on the kitchen table, morning | The lantern sits where the eye was, centre of the frame |
