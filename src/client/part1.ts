// Arc 1, Part 1, played through: one piece after another, from before run 1 to the Offering, with no
// trip back to the menu (gameplay/part1-assembly-brief.md; the audit is gameplay/part1-chain.md).
// A piece is a run, a walk, or a card. A card stands in for a scene that is not built yet: it says so,
// and how much of it Ladi has ruled. Where a gap is part built, the built part is a walk or the
// opening of a run (run 2's lantern picture, run 6's alarm), and cards stand in for the rest.
// His place is kept in this browser.

export type Run = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10;

export interface Piece {
  /** The piece's id (the brief's numbering, a letter for a part of a gap), for ?part1= and the saved place. */
  id: string;
  /** What the player sees it called on the menu's Continue button. */
  name: string;
  kind: "run" | "walk" | "card";
  run?: Run;
  walk?: number;
  /** A card: its heading and one line on what it will be, and how much of it is ruled. */
  card?: { heading: string; summary: string; ruled: string; optional?: true; end?: true };
  /**
   * A card piece shown as held pictures in place of its card, where the pictures exist (the card's
   * words stay here: take this field off and the piece is its card again). "kitchen": the kitchen
   * picture, then Lumi's unlit lantern, then on. The gameplay thread's call, not Ladi's: the pictures
   * are his, the scene's content is draft, so it carries a DRAFT mark.
   */
  scene?: "kitchen" | "supper" | "evening" | "glow" | "dream";
}

/**
 * The morning after run 1 (story/part1-cutscene-brief.md, 1a): Lumi's lantern on the table (run 2's
 * old opening, the cut from the eye; that picture is still the early draft), then three pictures Ladi
 * approved on 24 Nov: Lumi counting at the table with Rook at the stove, with the two lines he approved
 * (25 Nov, 1:19 AM); Rosalind's cup straightened; Lumi at the door with his staff. Then run 2.
 * How long each holds is the build's.
 */
export const MORNING = {
  fade: 0.8,
  pictures: [
    { slot: "morning-2", hold: 3, lines: [{ who: ["Rook"], text: "Next Kindling. We light it together." }, { who: ["Lumi"], text: "If you're not late." }] },
    { slot: "morning-3", hold: 4.5 },
    { slot: "morning-4", hold: 4.5 },
  ] as { slot: string; hold: number; lines?: { who: string[]; text: string }[] }[],
  /** Seconds each line holds, and the pause after it. */
  line: 3.5,
  gap: 0.6,
};

/**
 * The evening after run 3 (story/part1-between-runs.md, run 3 to run 4): two pictures, the children's
 * honey drops by the pond at sunset with Lumi's "Best of three. No rocks." and Hesta's "No promises.",
 * then the kitchen table at night with nobody in it. Then walk 2. The scene and both lines are the
 * story thread's draft; the pictures are the cutscene thread's pick on Ladi's word to finish without
 * waiting (25 Nov), not seen by him. How long each holds is the build's.
 */
export const EVENING = {
  fade: 0.8,
  pictures: [
    { slot: "evening-1", hold: 2.5, lines: [{ who: ["Lumi"], text: "Best of three. No rocks." }, { who: ["Hesta"], text: "No promises." }] },
    { slot: "evening-2", hold: 4.5 },
  ] as { slot: string; hold: number; lines?: { who: string[]; text: string }[] }[],
  line: 3.2,
  gap: 0.6,
  /** Seconds the first picture holds before anyone speaks. */
  lead: 1.5,
};

/**
 * The dream, before run 1 (the cutscene thread's set 1, production/story/dream/final/README.md): eight
 * pictures, all that thread's picks; Ladi has seen only the rough storyboard. Wordless until the last:
 * picture 7 goes to white, then a cut to Lumi standing over him, "You're late." (Ladi, 25 Nov, 1:07 AM;
 * the first line in the game). Holds are the cutscene thread's.
 */
export const DREAM = {
  fade: 0.7,
  pictures: [
    { slot: "dream-1-run", hold: 3 },
    { slot: "dream-2-stone", hold: 3 },
    { slot: "dream-3-boat", hold: 3.5 },
    { slot: "dream-4-hands", hold: 2.5 },
    { slot: "dream-5-face", hold: 3 },
    { slot: "dream-6-hesta", hold: 4 },
    { slot: "dream-7-lantern", hold: 2.5 },
  ],
  /** Seconds: picture 7 going to white, the white held, then picture 8 with the line. */
  white: 1.5,
  whiteHold: 1,
  wake: { slot: "dream-8-wake", hold: 3, lead: 0.5, line: { who: ["Lumi"], text: "You're late." } },
};

/**
 * The glow test, before run 6 (story/part1-cutscene-brief.md, section 2): seven wide pictures, the
 * cutscene thread's final set (production/story/part1/glowtest/final/README.md). Six are Ladi's (23 and
 * 24 Nov); picture 5, Rook proud, is the cutscene thread's pick, not seen by him. Mabry's captions are
 * the story thread's drafts, unvoiced, not seen by Ladi: she does not say "Lovely." after Lumi, and the
 * silence in picture 7 ends on one clap from off frame. A `layer` fades a light over the picture under
 * it (`over`: on top of the previous picture, not after a cut). How long each holds is the cutscene
 * thread's, stretched in picture 1 so both of Mabry's lines fit.
 */
export const GLOW = {
  /** Seconds: the cross-fade between pictures, each caption, the pause before it. */
  fade: 0.5,
  line: 2.2,
  gap: 0.4,
  pictures: [
    { slot: "gt-1-wide", hold: 4, lines: [{ who: ["Mabry"], text: "Nell. Both hands, dear." }, { who: ["Mabry"], text: "Lovely. Next." }] },
    { slot: "gt-2-lumi-dark", hold: 2.5, lines: [{ who: ["Mabry"], text: "Lumi." }] },
    { slot: "gt-3-glow-layer", over: true, layer: 1, hold: 1.5 },
    { slot: "gt-4-flood-nolight", cut: true, hold: 0 },
    { slot: "gt-4-flood-layer", over: true, layer: 0.4, hold: 3 },
    { slot: "gt-5-rook-proud", hold: 2 },
    { slot: "gt-6-hesta", hold: 3.5 },
    { slot: "gt-7-silence", hold: 2.5 },
  ] as { slot: string; hold: number; lines?: { who: string[]; text: string }[]; over?: true; layer?: number; cut?: true }[],
  /** After the clap: the hold, then the fade out with Mabry's last line over it. */
  clapTail: 0.8,
  out: 1.6,
  last: { who: ["Mabry"], text: "...Lovely. Next." },
};

/**
 * Supper, after run 7 (story/part1-cutscene-brief.md, 1c): one picture, Lumi's glow breathing on it,
 * and Dawn's creed said like grace. The picture is Ladi's ("Looks good", 25 Nov, 1:27 AM) and so are
 * the creed's four lines (25 Nov, 1:11 AM). The glow's breathing is his idea: about 60 to 100 percent
 * over four to six seconds. How long each line holds is the build's.
 */
export const SUPPER = {
  /**
   * Who says what is the story thread's DRAFT (25 Nov), not ruled by Ladi: Lumi leads, each says the
   * half of line two that is about them, and they say the last line together. The words are the four
   * he approved, unchanged; only line two is split at its full stop.
   */
  creed: [
    { who: ["Lumi"], text: "The sun gave light, and light is owed." },
    { who: ["Lumi"], text: "The bright were born to carry it." },
    { who: ["Rook"], text: "The rest were born to carry them." },
    { who: ["Rook"], text: "What the dark asks for, we give with open hands." },
    { who: ["Rook", "Lumi"], text: "No light goes out alone." },
  ],
  /** Seconds: the picture's fade, the hold before the first line, each line, the pause between lines, the hold after the last. */
  fade: 0.8,
  lead: 2.5,
  line: 4.5,
  gap: 0.7,
  tail: 3,
  /** The glow: its low point (of 1) and the seconds from low to full. */
  glow: { low: 0.6, rise: 5 },
};

const DRAFT = "Draft: not ruled by Ladi yet.";

export const PART1: Piece[] = [
  // Shown as its eight pictures (DREAM); take `scene` off and it is its card again.
  { id: "0", name: "Before run 1", kind: "card", scene: "dream", card: { heading: "Before run 1: the dream", summary: "The dream. Then Rook wakes to Lumi standing over him with his staff: \"You're late.\" Cut to the Kindling ground at night.", ruled: "Part ruled: the dream is in the bible, and how he wakes is Ladi's. The dream's pictures are not painted yet." } },
  { id: "1", name: "Run 1, the Kindling", kind: "run", run: 1 },
  { id: "1-2", name: "The kitchen, morning", kind: "card", scene: "kitchen", card: { heading: "The kitchen, morning", summary: "Lumi's lantern on the table. Lumi counting what it still needs, Rook at the stove: \"Next Kindling. We light it together.\" \"If you're not late.\" Rosalind's cup. Lumi at the door with his staff.", ruled: "Ruled: pictures 2 to 4 and the two lines are Ladi's. Picture 1, the lantern, is still the early draft." } },
  { id: "2", name: "Run 2, Lumi's lesson", kind: "run", run: 2 },
  { id: "2-3", name: "Walk 1, the pond", kind: "walk", walk: 1 },
  { id: "3", name: "Run 3, Granny's game", kind: "run", run: 3 },
  // Shown as its two pictures (EVENING); take `scene` off and it is its card again.
  { id: "3-4a", name: "The evening", kind: "card", scene: "evening", card: { heading: "Evening", summary: "Two pictures: honey drops at the pond; the kitchen table at night.", ruled: DRAFT } },
  { id: "3-4", name: "Walk 2, the morning of the job", kind: "walk", walk: 2 },
  { id: "4", name: "Run 4, the job", kind: "run", run: 4 },
  { id: "4-5", name: "The skiff home", kind: "card", card: { heading: "The skiff home", summary: "The skiff comes back to the home landing. Kes is waiting and challenges him. Maudie watches the three of them leave. The skiff crosses to Kite Fell.", ruled: "Part ruled: the race being on Kite Fell is Ladi's. The scene is draft." } },
  { id: "5", name: "Run 5, the race", kind: "run", run: 5 },
  // Walk 3's first state, walk number 6 in engine/walks.ts. Its old card is kept in case it is ever wanted again.
  { id: "5-6a", name: "Walk 3, an ordinary morning", kind: "walk", walk: 6, card: { heading: "Walk 3, first state: an ordinary morning", summary: "Nell, Kes and Moth offer the optional runs. Tapping Maudie at his door turns it into the festival morning and closes them for good.", ruled: "Part ruled: the two states, Maudie's tap and talking to the person are Ladi's. The lines are to be judged in game.", optional: true } },
  { id: "5-6", name: "Walk 3, the festival morning", kind: "walk", walk: 3 },
  // Shown as its seven pictures (GLOW); take `scene` off and it is its card again.
  { id: "5-6b", name: "The glow test", kind: "card", scene: "glow", card: { heading: "The glow test", summary: "Mabry's shrine: the glow test. Then the alarm at night (its pictures open run 6).", ruled: "Part ruled: the glow test is in the bible; its pictures are being settled with Ladi. The island going down into cloud is Ladi's pick." } },
  { id: "6", name: "Runs 6 and 7, the dying brazier", kind: "run", run: 6 },
  { id: "7-8a", name: "Supper", kind: "card", scene: "supper", card: { heading: "Supper", summary: "One picture: Rook and Lumi say Dawn's creed, Lumi on the bench beside him.", ruled: "Ruled: the supper is in the bible, and the picture, Lumi's seat and the creed's four lines are Ladi's." } },
  { id: "7-8", name: "Walk 4, night", kind: "walk", walk: 4 },
  { id: "7-8b", name: "Hesta's hands, and morning", kind: "card", card: { heading: "Hesta's hands, and morning", summary: "Hesta on the terrace is shaking, her hands burned, and laughs it off. Cut to morning: Lumi at the door with the staff and no bag.", ruled: "Part ruled: Hesta's hands are in the bible. The rest is draft." } },
  { id: "8", name: "Run 8, the Sieve", kind: "run", run: 8 },
  { id: "8-9", name: "Walk 5, dusk", kind: "walk", walk: 5 },
  { id: "8-9b", name: "The beacon and the send-off", kind: "card", card: { heading: "The beacon and the send-off", summary: "The beacon lights on the low one. At the landing Hesta plots the course, Kes goes, Lumi stays, and Hesta lights the unfinished lantern.", ruled: "Part ruled: the send-off is in the bible. The lines and the lantern being lit are draft. A storyboard only." } },
  { id: "9", name: "Run 9, the rescue", kind: "run", run: 9 },
  { id: "9-10", name: "The stranger's ship", kind: "card", card: { heading: "Eight pictures, before the ship", summary: "The shadow heading for home. Kes: \"Then come on.\" The dream, one beat. The stranger: \"I know a shorter way.\" Kes: \"Race you home, then.\" Rook: \"...\" Kes: \"Go. I'm right behind you.\" His back as he boards.", ruled: "Part ruled: the shadow as his reason and Kes's line after the joke are Ladi's. The wording and the pictures are draft." } },
  { id: "10", name: "Run 10, the ship home", kind: "run", run: 10 },
  { id: "11", name: "The Offering", kind: "card", card: { heading: "The Offering, at first light", summary: "The end of Part 1.", ruled: "Part ruled: in the bible, and \"at first light\" is Ladi's. A storyboard only.", end: true } },
];

export const pieceIndex = (id: string) => PART1.findIndex((p) => p.id === id);

/** The optional runs a walk card can open (walk 3's first state). */
export const OPTIONAL_RUNS = [
  { id: "o1", label: "Granny's rematch", who: "Nell" },
  { id: "o2", label: "Lumi's lesson with Kes", who: "Kes" },
  { id: "o3c", label: "Kes's rematch on the Fell", who: "Kes" },
  { id: "o3a", label: "Moss Hollow", who: "Moth" },
  { id: "o3b", label: "Tidepool Steps", who: "Moth" },
] as const;

const KEY = "lanternfall.part1";

/** The piece he is on (its index), or -1 if Part 1 was never started here. */
export function loadPlace(): number {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at?: string } | null;
    const i = v?.at ? pieceIndex(v.at) : -1;
    return i;
  } catch {
    return -1;
  }
}

/** The furthest piece he has reached (its index), kept through "Start again", or -1. */
export function loadFar(): number {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at?: string; far?: string } | null;
    return Math.max(v?.far ? pieceIndex(v.far) : -1, v?.at ? pieceIndex(v.at) : -1);
  } catch {
    return -1;
  }
}

export function savePlace(i: number) {
  try {
    if (i < 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ at: PART1[i]!.id, far: PART1[Math.max(i, loadFar())]!.id }));
  } catch {
    /* storage blocked: the place lasts this page only */
  }
}

/**
 * The menu buttons that open one run on its own, and the piece that has to be reached before each
 * shows while Part 1 is under way (brief rule 5: nothing the story has not shown appears early).
 * The optional runs show from the walk that offers them.
 */
export const MENU_RUNS: { button: string; piece: string }[] = [
  { button: "story", piece: "1" },
  { button: "story2", piece: "2" },
  { button: "story3", piece: "3" },
  { button: "story4", piece: "4" },
  { button: "story5", piece: "5" },
  { button: "story6", piece: "6" },
  { button: "story8", piece: "8" },
  { button: "story9", piece: "9" },
  { button: "story10", piece: "10" },
  { button: "story-o1", piece: "3-4" },
  { button: "story-o2", piece: "5-6a" },
  { button: "story-o3c", piece: "5-6a" },
  { button: "story-o3a", piece: "5-6a" },
  { button: "story-o3b", piece: "5-6a" },
];

/** Which piece a finished run is, by its title (runs 6 and 7 are one piece). */
export function pieceOfRun(title: string): number {
  const run: Record<string, Run> = { "The Grand Kindling": 1, "Lumi's lesson": 2, "Granny's game": 3, "A job": 4, "The race": 5, "The dying brazier": 6, "A harder job": 8, "The rescue": 9, "The ship home": 10 };
  const r = run[title];
  return r === undefined ? -1 : PART1.findIndex((p) => p.kind === "run" && p.run === r);
}

/** The walk piece for a walk number. */
export const pieceOfWalk = (n: number) => PART1.findIndex((p) => p.kind === "walk" && p.walk === n);
