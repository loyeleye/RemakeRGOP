# Joins every single-file clip of one speaker named in src/client/voice-lines.ts ("voice/<who>-*.mp3")
# into public/voice/<who>.mp3 and points those lines at time ranges in it ("#t=a,b"), the same way
# tools/voice-sprites.py joins a folder, so the preview stays under its file limit. Removes the
# single files it joined. Run node tools/voice-durations.mjs after.
#   python3 tools/voice-join.py lumi
import os, re, subprocess, sys

RATE, LEAD, TAIL = 44100, 0.3, 0.8
who = sys.argv[1]
path = "src/client/voice-lines.ts"
src = open(path).read()
pat = re.compile(r'"voice/(' + re.escape(who) + r'-[^"#]+\.mp3)"')
files = []
for m in pat.finditer(src):
    if m.group(1) not in files:
        files.append(m.group(1))
pcm, out = bytearray(), {}
for f in files:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f"public/voice/{f}", "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"], capture_output=True, check=True).stdout
    pcm += bytes(int(RATE * LEAD) * 2)
    start = len(pcm) / 2 / RATE
    pcm += raw
    end = len(pcm) / 2 / RATE
    pcm += bytes(int(RATE * TAIL) * 2)
    out[f] = f"voice/{who}.mp3#t={max(0, start - 0.08):.2f},{end + 0.12:.2f}"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-i", "-", "-codec:a", "libmp3lame", "-b:a", "96k", f"public/voice/{who}.mp3"], input=bytes(pcm), check=True)
src = pat.sub(lambda m: f'"{out[m.group(1)]}"', src)
open(path, "w").write(src)
for f in files:
    os.remove(f"public/voice/{f}")
print(who, len(files), "clips joined,", os.path.getsize(f"public/voice/{who}.mp3") // 1024, "KB")
