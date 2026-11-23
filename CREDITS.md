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
| faces/hesta.webp, faces/lumi.webp (story portraits) | Draft crops from the art thread's character sheets (project files `gameplay/faces/`), resized to 160 px WebP |

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
| voice/hesta-now.mp3 | Gacrux (Gemini TTS), from `gameplay/voice/run1/final/hesta-now.wav`, loudness-matched and encoded to MP3 | Hesta's "Now." |
