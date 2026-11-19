# Converts the Sogni floor renders (1024 PNG) into the 512 WebP textures the shrine uses.
# Usage: python3 tools/textures.py <dir with floor-<shrine>.png>
import sys, pathlib
from PIL import Image
src = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).resolve().parent.parent / "public" / "textures"
out.mkdir(parents=True, exist_ok=True)
for f in sorted(src.glob("floor-*.png")):
    Image.open(f).convert("RGB").resize((512, 512), Image.LANCZOS).save(out / (f.stem + ".webp"), quality=82)
    print(f.stem)
