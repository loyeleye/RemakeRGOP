# Credits

All art was generated with Sogni AI on 2026-11-19 under Ladi's Sogni Unlimited Pro plan, with
subscription-only billing so no Spark was spent. Sources are in the project files under
`sogni/lanternfall/`, `sogni/lanternfall/3d/` and `sogni/lanternfall/controls/`.

| File | Model |
|---|---|
| models/dawn.glb, dusk.glb, brazier.glb, monolith.glb, boulder.glb | Concept art from z_image_turbo_bf16, then pixal3d_int8_i23d (image to 3D). Shrunk with `tools/models.sh` (512px WebP textures, meshopt). |
| textures/floor-*.webp (one per island, plus floor-volcano for Ember Quarry) | krea2_turbo_fp8_scaled (seamless floor textures), resized with `tools/textures.py` |
| sprites/wall.png | krea2_turbo_fp8_scaled (seamless stone) |
| ui/*.webp (phone stick and buttons) | z_image_turbo_bf16, cropped to a circle with an alpha mask |
| sprites/brazier.png, sprites/wisp-dawn.png (logo and favicon) | z_image_turbo_bf16, background removed with birefnet_image_background_removal_fp16 |

The sky, cloud sea, fire, embers, light pillar, water and wisps are drawn in code with shaders.
