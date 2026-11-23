# Credits

All art was generated with Sogni AI on 2026-11-19 under Ladi's Sogni Unlimited Pro plan, with
subscription-only billing so no Spark was spent. Sources are in the project files under
`sogni/lanternfall/`, `sogni/lanternfall/3d/` and `sogni/lanternfall/controls/` and `sogni/lanternfall/fairy-ring/`.

| File | Model |
|---|---|
| models/dawn.glb, dusk.glb, brazier.glb, monolith.glb, boulder.glb | Concept art from z_image_turbo_bf16, then pixal3d_int8_i23d (image to 3D). Shrunk with `tools/models.sh` (512px WebP textures, meshopt). |
| textures/floor-*.webp (one per island, plus floor-volcano for Ember Quarry; floor-fairy-ring added later the same day) | krea2_turbo_fp8_scaled (seamless floor textures), resized with `tools/textures.py` |
| sprites/wall.png | krea2_turbo_fp8_scaled (seamless stone) |
| ui/*.webp (phone stick and buttons) | z_image_turbo_bf16, cropped to a circle with an alpha mask |
| sprites/brazier.png, sprites/wisp-dawn.png (logo and favicon) | z_image_turbo_bf16, background removed with birefnet_image_background_removal_fp16 |
| faces/&lt;who&gt;-&lt;mood&gt;.webp (story portraits: Hesta 3 moods, Lumi 6, Rook 4, Nell 6, Sefa 7) | Mood faces (Lumi's calling, grudging and delighted redrawn closed-mouth on 2026-11-23) from the cast art thread (project files `sogni/lanternfall/production/<who>/face-*.png`, 2026-11-23), resized to 160 px WebP |
| models/rook.glb, lumi.glb, hesta.glb, wick.glb, moth.glb, nell.glb, sefa.glb (story characters) | The cast art thread's rigged and animated models (`production/<who>/<who>-rigged.glb`, 2026-11-23: idle, walk, run, pull, push clips), shipped as delivered (quantised, no meshopt): 570 to 815 KB each |
| story/eye/*.webp and src/client/eye-rig.ts (the eye in run 1's ending) | The cutscene art thread's eye rig and layers (`production/story/v3/eye/`), approved by Ladi on 2026-11-22; layers converted to WebP |
| story/*.webp (run 1's ending and run 2's opening pictures) | Drafts from the cast and cutscene art threads (`production/story/slots/` and `production/story/v3/`, 2026-11-23), not yet approved by Ladi; converted to WebP |
| story/walk-kitchen.webp (Rook's kitchen, walk 2) | The cutscene art thread's draft (`production/story/part1/kitchen/kitchen-tappable-walk2-draft-2.png`, 2026-11-23), not yet approved by Ladi; the lantern handle is to be fixed in the final; converted to WebP at 1280 px |
| faces/lumi-delight-flash.webp | First draft from the cast art thread; Lumi's one open-mouth face in runs 1 and 2 |
| models/rook-house.glb (4x4, Granny's board) and rook-house-big.glb (9x9, the walking island) | Concept from z_image_turbo_bf16, then pixal3d_int8_i23d (image to 3D), 2026-11-23, Sogni Unlimited plan, 0 Spark. Levelled, slimmed to 25k triangles and paint re-baked by the maps and places thread (project files sogni/lanternfall/production/places/rook-house/, rook-house-a.glb and rook-house-a-9x9-hd.glb; Ladi picked A). The 9x9 walking-island copy: concept upscaled with rtx_vsr_pro, then pixal3d_int8_i23d at shape 1536 / texture 4096, 0 Spark |

The sky, cloud sea, fire, embers, light pillar, water and wisps are drawn in code with shaders.


## Music

The Grand Kindling's music was generated with Mureka by Ladi and added on 2026-11-22. Each track had its
leading silence trimmed (0.1 to 0.4 s, so the first beat lands on the first tick), was loudness-matched to -18 LUFS, and was encoded to 160 kbps MP3 with ffmpeg. Sources are in the project files:
`kindling-run-1.wav`, `kindling-run-1 (1).wav`, `kindling-run-1 (2).wav` and an upload named
`kindling-run-1 3.wav`.

| File | Source render | Movement |
|---|---|---|
| music/kindling-1.mp3 | kindling-run-1 (2).wav | First light |
| music/kindling-2.mp3 | kindling-run-1 3.wav | The relay |
| music/kindling-3.mp3 | kindling-run-1 (1).wav | The crescendo |

`kindling-run-1.wav` is not used.

Licence: ❓ not confirmed. On 2026-11-23 Mureka's terms page (https://www.mureka.ai/terms-of-service)
returned 404. The homepage (https://www.mureka.ai) offers "full commercial rights" and says paid plans
"enjoy commercial licensing", but it doesn't say what the free plan allows or whether rights depend on
being subscribed when a track is made. Before the game is sold, the actual terms need reading, and it
needs checking which plan these tracks were made on.

## Voice

Voiced lines are Gemini text-to-speech stock voices, picked by Ladi and rendered by the design thread.
They are stand-ins until the game is distributed, and will be replaced or cleared before then.

| File | Voice | Line |
|---|---|---|
| voice/hesta-*.mp3, voice/lumi-*.mp3 (106 lines in runs 1 and 2, 24 more in run 3, 6 in run 4; run 4's "Now." reuses run 1's clip) | Sogni speech in copies of the Gacrux voice (Hesta) and the Autonoe voice raised 2 semitones (Lumi), Ladi's picks on 2026-11-23; from `gameplay/voice/final/run1`, `run2`, `run3`, `run4` and their manifest.json, 0 Spark. Terms for copied voices not yet checked: ❓ | One clip per line; Lumi's three "Fine" concessions share one "Ugh" |
| voice/hesta-look-up.mp3 | Gemini speech (gemini-2.5-pro-preview-tts, Gacrux voice) from the story thread's direction, take 3 of `gameplay/voice/final/run1/hesta-look-up-gemini/` (Ladi's pick, 2026-11-23), trimmed and levelled to her other clips. Gemini API terms for selling generated speech not yet read: ❓ | Hesta's "Look up, Rook." at the end of run 1 |
| voice/rook-*.mp3 (13 clips, with run 4's "I heard.") | Sogni speech in a copy of the Umbriel voice, lowered 1 semitone (Ladi's pick for Rook, 2026-11-23); from `gameplay/voice/run2/rook-umbriel/` as delivered (trimmed and levelled by the design thread), 2026-11-23. Terms for a copied voice not yet checked: ❓ | Rook's run 2 lines, one clip per line |
| models/fence.glb, washpost.glb, bench.glb, barrel.glb, woodpile.glb, flowerbed.glb (home island yard) | Concept from z_image_turbo_bf16, then pixal3d_int8_i23d, 2026-11-23, Sogni Unlimited plan, 0 Spark. Levelled, slimmed to 5k triangles and paint re-baked by the maps and places thread (project files sogni/lanternfall/production/places/home-island/). |
| textures/floor-home-island.webp (meadow), textures/path-home-island.webp (worn path, the darker "worn" version) | Seamless 1024 px paintings by the maps and places thread on the Sogni Unlimited plan, 2026-11-23 (project files sogni/lanternfall/production/places/home-island/) |
| models/hesta-house.glb, hesta-chair.glb | Concepts from z_image_turbo_bf16 (house upscaled with rtx_vsr_pro), then pixal3d_int8_i23d, 2026-11-23, Sogni Unlimited plan, 0 Spark. Levelled, slimmed and paint re-baked by the maps and places thread (project files sogni/lanternfall/production/places/hesta-house/). |
| models/skiff.glb, landing.glb, shrine.glb (from shrine-big.glb, 1.3x), stall.glb, kindling-brazier.glb (their brazier.glb), falls.glb (home island places) | Concepts from z_image_turbo_bf16, then pixal3d_int8_i23d (image to 3D), 2026-11-23, Sogni Unlimited plan, 0 Spark. Levelled, slimmed and paint re-baked by the maps and places thread (project files sogni/lanternfall/production/places/home-island-2/). |
| models/shrine-wall.glb, shade-tree.glb, lamp-pedestal.glb, spout-basin.glb (the shrine's yard) | Concepts from z_image_turbo_bf16, then pixal3d_int8_i23d (image to 3D), 2026-11-23, Sogni Unlimited plan, 0 Spark. Levelled, slimmed and paint re-baked by the maps and places thread (project files sogni/lanternfall/production/places/shrine-yard/). |
| models/willing-girl.glb, willing-girl-ribbons.glb (adult versions), statue-flowers.glb, lookout-post.glb, landing-rail.glb (lore spots) | Concepts from z_image_turbo_bf16 (ribbons variant edited with krea2_identity_edit_v1_2), then pixal3d_int8_i23d (image to 3D), 2026-11-23, Sogni Unlimited plan, 0 Spark. Levelled, slimmed and paint re-baked by the maps and places thread (project files sogni/lanternfall/production/places/lore-spots/). |
