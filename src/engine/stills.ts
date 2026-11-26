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
  /** The line stays a bubble over its speaker, and the picture comes alone, with no caption. Ladi tried it on Rook's "Granny?" (24 Nov) and went back to the caption; run 10's last picture uses it (25 Nov), because Rook is not in it. */
  bubble?: boolean;
  /** The tile the event is about (a well), which the panel must not cover. */
  at?: { x: number; y: number };
  /** The one still that fills the screen and stops play (run 9's "What is that"): the room holds while it is up. */
  full?: boolean;
}

export const STILLS: Record<string, StillCard> = {
  // The morning walk before run 8 (walk 9): Lumi at the door with the staff and no bag, the hands scene's old last picture, cropped to 4:3 (story thread, 26 Nov).
  "w9-lumi-door": { who: "Lumi in the doorway, the staff in her hands, no bag", faces: "Set. Chin up, mouth shut, eyes on him." },
  // Runs 1 to 5 (story/runs1-5-stills.md): each run's first still, at a pause. Approved by Ladi (25 Nov).
  "r1-1": { who: "Hesta at the foot of the north steps, between the foot lamps, one hand cupped to call", faces: "Eyes creased and bright. Brows up. Mouth open, calling." },
  // Over Rook's line and Lumi's answer: the same picture, the caption changing.
  "r2-0": { who: "Lumi holding his staff, too long for her, at the pond's edge. Rook crouched beside her, hands off", faces: "Lumi: eyes on the water, brows down, mouth shut, chin up. Rook: eyes on her, brows up, a small closed smile." },
  "r3-0": { who: "Lumi in front, pointing back at Rook without looking, Rook behind her. Nell and Sefa shoulders at the edges", faces: "Lumi: eyes ahead, brows level, mouth shut, certain. Rook: brows up, a small smile." },
  "r3-2": { who: "Hesta looking across at Rook. The back of Lumi's head between them, tipped up toward her father", faces: "Hesta: eyes warm and on him, brows level, mouth shut in a smile. Rook: eyes down at his staff, one corner of his mouth up." },
  // 3.2, 4.2, 5.1 and 5.2 are the cutscene thread's pick, on Ladi's word to finish the set on its own judgment (25 Nov, 3:17 AM).
  "r4-2": { who: "Garrick turned to his fire, pleased. Lumi beside Rook, standing very straight", faces: "Garrick: eyes on the fire, creased, mouth open, talking. Lumi: eyes ahead, brows up, mouth pressed shut so as not to grin." },
  "r5-1": { who: "Kes and Rook facing each other. Lumi's hand and bell held up between them", faces: "Kes: chin up, one brow up, mouth shut in a smirk. Rook: eyes on Kes, brows level, mouth shut." },
  "r5-2": { who: "Kes looking at Lumi, and Lumi looking back. Rook a shoulder behind them, turned a little away", faces: "Kes: eyes soft, brows up in the middle, a small closed smile. Lumi: eyes wide, brows up, mouth shut." },
  // Moss Hollow only, over Garrick's two greeting lines.
  "r4-1": { who: "Garrick, half length, a working keeper on his own ground", faces: "Eyes level. Brows flat. Mouth shut, easy." },
  // Run 8, the Sieve. Faces in the cutscene thread's terms: eyes, brows, mouth.
  "r8-1": { who: "Tilda, half length", faces: "Steady. Eyes level, a little narrowed; brows flat; mouth shut." },
  "r8-2": { who: "Tilda in front, Rook beside her, looking down at the far well", faces: "She is tired, eyes half lidded. He frowns at the well, brows pulled together." },
  "r8-3": { who: "Tilda, a hand held flat at a wisp's height", faces: "Matter-of-fact, almost bored." },
  // Approved with the rest (25 Nov); shown at the first tug as a trial Ladi will judge in play.
  "r8-5": { who: "Tilda near, Rook behind her braced on his staff", faces: "She is lost: eyes wide, brows up, mouth open. He looks back at her, eyes wide, mouth just open.", untilNextMs: 6000 },
  "r8-6": { who: "The same two, turned", faces: "She looks at him, waiting, mouth shut tight. He looks down at his staff, brows pulled hard together." },
  "r8-7": { who: "Rook alone, head a little tilted", faces: "Concerned: brows raised and drawn together, mouth open as if he has just asked.", extraMs: 1000 },
  "r8-8": { who: "The cutters in a row, hats in hand, backs to the wells", faces: "No faces." },
  "r8-9": { who: "Tilda, arms round the book, watching him", faces: "Shut. She has stopped expecting him to fix it." },
  "r8-10": { who: "Her hands on the book, the page of sixteens, the pen stopping", faces: "No face." },
  "r8-11a": { who: "Tilda, straight at us", faces: "Asking: eyes on us, wet but no tears; brows up in the middle; mouth open." },
  "r8-11b": { who: "Rook, half turned to the skiff", faces: "No answer: eyes sliding away, brows down, mouth open with nothing coming." },
  // Run 9, the rescue (story/runs9-10-story-check.md). None is drawn yet: plain cards.
  "r9-what-is-that": { who: "The strip of the low one running away from us, its path lamps going out one after another toward us, the nearest still lit. In the cloud at the far end, a dark stain with a hard edge, already wider than the path. Kes in the foreground at one side, turned three-quarters away to look at it, her string of wisps slack in her hand", faces: "Her eyes wide and fixed on it, brows drawn together and up, mouth a little open. She is not screaming. She does not know what it is yet." },
  // The pause is three pictures now (Ladi, 24 Nov, 7:43 PM). The first, Kes close, carries the line: in draft with Ladi, so its card shows until it lands.
  "r9-what-is-that-1": { who: "Kes, close, turned to look up the island at something behind us. The line is hers", faces: "Her eyes wide and fixed on it, brows drawn together and up, mouth a little open. She does not know what it is yet." },
  "r9-what-is-that-2": { who: "The low one from the landing: the path lamps lit in the grass, the pools, the cold brazier, the houses, a boat away on the cloud", faces: "Nobody's face. Everything is as it should be." },
  "r9-what-is-that-3": { who: "The same view. The far right of it has gone dark: the houses and the lamps there are out, as if something stood over them", faces: "Nobody's face. There is nothing there to see." },
  "r9-0": { who: "Sefa's grandmother at the landing, her husband's shoulder behind her, boats and lamps beyond", faces: "Her eyes steady on Rook, brows level, mouth set, a small nod." },
  "r9-1": { who: "Kes looking straight up, a dark band of cloud round her boots", faces: "Eyes wide, brows pulled together, mouth a little open." },
  "r9-2": { who: "Kes and Rook side by side. Her glow is gone and she is looking at her empty hands", faces: "Kes: eyes wide, brows up in the middle, mouth open. Rook: brows down, eyes on her, mouth shut." },
  "r9-3": { who: "The grandmother at the rail, one hand on her husband's arm, looking past us at Rook", faces: "Her eyes soft, brows a little up, mouth closed, chin lifted toward home." },
  // Run 10, the ship home: the view over the bow, three times. Rook's face in profile at the edge, lit by the ship's lamp. Plain cards.
  // r10-0 and r10-1 approved by Ladi (25 Nov, 2:04 AM).
  "r10-0": { who: "Rook at the rail. Home far off: two glows under a storm cloud, the stain on the cloud between", faces: "Eyes fixed ahead, brows down and together, jaw set, mouth shut." },
  "r10-1": { who: "The home island from the boat: a small stone and light in the falls' mouth, the stain on the cloud below. Rook alarmed", faces: "Alarmed." },
  // Approved by Ladi (25 Nov, 1:57 AM). No Rook in it: his line is a bubble with his face over it.
  "r10-2": { who: "Close on Lumi's lit lantern on a wide flat stone, dark water all round, the lip of the falls along the bottom. No Rook", faces: "None. Rook's face is his bubble's portrait." },
};

/** How long a still is up, fade to fade (ms), given how long its line takes to say (0 for none). */
export function stillMs(id: string, lineMs: number) {
  const hold = Math.max(STILL.holdMs, lineMs > 0 ? lineMs + STILL.afterLineMs : 0) + (STILLS[id]?.extraMs ?? 0);
  return Math.max(STILL.inMs + hold + STILL.outMs, STILLS[id]?.untilNextMs ?? 0);
}
