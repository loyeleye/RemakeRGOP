# Joins each folder of rendered voice clips into one file, so the page fetches a few files in
# place of a hundred (the preview holds at most 512 files). Each clip sits between short
# silences; the page plays it by a time range on the joined file ("voice/<group>.mp3#t=a,b").
#   python3 tools/voice-sprites.py <final dir> <group> [<group> ...]
# Reads <final dir>/<group>/manifest.json (who, text, file; stock entries have stock: true),
# writes public/voice/<group>.mp3 and tools/voice-sprites/<group>.json ({file: "#t=a,b"}).
import json, subprocess, sys, os

RATE, LEAD, TAIL = 44100, 0.3, 0.8
final, groups = sys.argv[1], sys.argv[2:]
for group in groups:
    entries = json.load(open(os.path.join(final, group, "manifest.json")))
    pcm, at, out = bytearray(), {}, {}
    for e in entries:
        f = e["file"]
        if f in at:
            continue
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(final, group, f), "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"], capture_output=True, check=True).stdout
        pcm += bytes(int(RATE * LEAD) * 2)
        start = len(pcm) / 2 / RATE
        pcm += raw
        end = len(pcm) / 2 / RATE
        pcm += bytes(int(RATE * TAIL) * 2)
        at[f] = (start, end)
        # A little before it starts (in the silence) to a little after it ends.
        out[f] = f"#t={max(0, start - 0.08):.2f},{end + 0.12:.2f}"
    dest = f"public/voice/{group}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-i", "-", "-codec:a", "libmp3lame", "-b:a", "80k", dest], input=bytes(pcm), check=True)
    json.dump(out, open(f"tools/voice-sprites/{group}.json", "w"), indent=1)
    print(group, len(out), "clips", f"{len(pcm) / 2 / RATE:.1f} s", os.path.getsize(dest) // 1024, "KB")
