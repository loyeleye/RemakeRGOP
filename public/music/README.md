# Story music

Drop the Grand Kindling's three tracks here as `kindling-1`, `kindling-2` and `kindling-3`
(`.mp3`, `.ogg`, `.m4a` or `.wav`). Each loops for its movement and fades out under Lumi's bell.
A missing file plays silence. Tempo 100 BPM, D major, 4/4 (one beat per 600 ms tick).
Record each track and its licence in CREDITS.md.

The ending's own piece goes here as `kindling-ending` (same file types). When it's there, it starts
at the last bell of run 1, once and at full, in place of the third track (which then fades out in
0.3 s). The ending doesn't duck it (the piece carries its own shape) but still cuts it dead at the
rim, so the eye always lands in silence even if the file runs long. Plan in
story/cutscene-emotion-brief.md, section A. To line it up without re-exporting, change `pieceAt` in
the ENDING tables (client/ending.ts): when the file's 0 s plays, in seconds from the bell (negative
skips into it). Without the file, the third track plays on, ducked under Lumi's count and cut at
the rim.
