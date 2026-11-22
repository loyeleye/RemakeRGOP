# Credits

All art was generated with Sogni AI on 2026-11-19 under Ladi's Sogni Unlimited Pro plan, with
subscription-only billing so no Spark was spent. Sources are in the project files under
`sogni/lanternfall/`, `sogni/lanternfall/3d/` and `sogni/lanternfall/controls/` and `sogni/lanternfall/fairy-ring/`.

| File | Model |
|---|---|
| models/dawn.glb, dusk.glb, brazier.glb, monolith.glb, boulder.glb | Concept art from z_image_turbo_bf16, then pixal3d_int8_i23d (image to 3D). Shrunk with `tools/models.sh` (512px WebP textures, meshopt). |
| textures/floor-*.webp (one per island, plus floor-volcano for Ember Quarry; floor-fairy-ring added later the same day) | krea2_turbo_fp8_scaled (seamless floor textures), resized with `tools/textures.py` |
| sprites/wall.png | krea2_turbo_fp8_scaled (seamless stone) |
| textures/ink/floor-night-glade.webp, textures/ink/floor-blossom-garden.webp (darkened after rendering), sprites/ink/wall.png (demo only, used when the ink look is switched on with `?ink`) | krea2_identity_edit_v1_2, redrawn from the plain floor and wall textures on 2026-11-22, subscription-only billing |
| ui/*.webp (phone stick and buttons) | z_image_turbo_bf16, cropped to a circle with an alpha mask |
| sprites/brazier.png, sprites/wisp-dawn.png (logo and favicon) | z_image_turbo_bf16, background removed with birefnet_image_background_removal_fp16 |

The sky, cloud sea, fire, embers, light pillar, water and wisps are drawn in code with shaders.
