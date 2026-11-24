// Reaction stills (Ladi's method, 24 Nov): still pictures of people's faces and of events fade in
// and out in a panel over the map while play goes on. Any run can call one by putting `still` on a
// line it says (the line becomes the panel's caption and gets no bubble of its own), or on a line
// with no text for a picture alone. The panel is the gameplay thread's draft
// (gameplay/run8-stills-panel.md); the pictures are the story thread's (story/run8-reaction-stills.md).
// Until a picture is drawn, the panel shows a paper card saying who is in it and what their faces do.
// A drawn picture is picked up by name from public/stills/<id>.webp.

export const STILL = {
  /** Fade in, the shortest hold, fade out (ms). */
  inMs: 400,
  holdMs: 2500,
  outMs: 600,
  /** A still with a spoken line holds for the line's length and this much more, if that is longer. */
  afterLineMs: 1000,
  /** Between the end of one still and the start of the next, unless the next is part of a sequence. */
  gapMs: 8000,
  /** Landscape: the panel's share of the screen's width (4:3). Portrait: a band across the top, this share of the height. */
  width: 0.3,
  band: 0.24,
} as const;

export interface StillCard {
  /** Who is in it (or "The event", for a picture with no face). */
  who: string;
  /** One line on their faces, for the placeholder card. */
  faces: string;
  /** Held this much longer than the others (ms). */
  extraMs?: number;
  /** The first of a sequence: stays up until the next replaces it, so the panel never blinks off between them, but no longer than this (ms, fade to fade). */
  untilNextMs?: number;
}

/** How a line calls a still. */
export interface StillCue {
  id: string;
  /** Part of a sequence: cross-fades in place over the one before, with no gap. */
  seq?: boolean;
  /** In a sequence: the still it follows, which gets its shortest hold first if it has a line. */
  after?: string;
  /** The line stays a bubble over its speaker, and the picture comes alone, with no caption. Nothing uses it now: Ladi tried it on Rook's "Granny?" (24 Nov) and went back to the caption. */
  bubble?: boolean;
  /** The tile the event is about (a well), which the panel must not cover. */
  at?: { x: number; y: number };
}

export const STILLS: Record<string, StillCard> = {
  // Run 8, the Sieve. Faces in the cutscene thread's terms: eyes, brows, mouth.
  "r8-1": { who: "Tilda, half length", faces: "Steady. Eyes level, a little narrowed; brows flat; mouth shut." },
  "r8-2": { who: "Tilda in front, Rook beside her, looking down at the far well", faces: "She is tired, eyes half lidded. He frowns at the well, brows pulled together." },
  "r8-3": { who: "Tilda, a hand held flat at a wisp's height", faces: "Matter-of-fact, almost bored." },
  "r8-4": { who: "The event: his wisp at the end of a thin, shaking beam, over a black pit", faces: "No face." },
  "r8-5": { who: "Tilda near, Rook behind her braced on his staff", faces: "She is lost: eyes wide, brows up, mouth open. He looks back at her, eyes wide, mouth just open.", untilNextMs: 6000 },
  "r8-6": { who: "The same two, turned", faces: "She looks at him, waiting, mouth shut tight. He looks down at his staff, brows pulled hard together." },
  "r8-7": { who: "Rook alone, head a little tilted", faces: "Listening: eyes up and aside, brows raised, mouth a little open.", extraMs: 1000 },
  "r8-8": { who: "The cutters in a row, hats in hand, backs to the wells", faces: "No faces." },
  "r8-9": { who: "Tilda, arms round the book, watching him", faces: "Shut. She has stopped expecting him to fix it." },
  "r8-10": { who: "Her hands on the book, the page of sixteens, the pen stopping", faces: "No face." },
  "r8-11a": { who: "Tilda, straight at us", faces: "Asking: eyes on us, wet but no tears; brows up in the middle; mouth open." },
  "r8-11b": { who: "Rook, half turned to the skiff", faces: "No answer: eyes sliding away, brows down, mouth open with nothing coming." },
};

/** How long a still is up, fade to fade (ms), given how long its line takes to say (0 for none). */
export function stillMs(id: string, lineMs: number) {
  const hold = Math.max(STILL.holdMs, lineMs > 0 ? lineMs + STILL.afterLineMs : 0) + (STILLS[id]?.extraMs ?? 0);
  return Math.max(STILL.inMs + hold + STILL.outMs, STILLS[id]?.untilNextMs ?? 0);
}
