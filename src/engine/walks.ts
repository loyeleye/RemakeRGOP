// The walks between runs on the home island (story plan: story/part1-between-runs.md, a draft).
// One map, five times of day. Each walk says its light, who is about and where, what they say
// when tapped (placeholders until the story thread writes them), and what tap starts what's next.
// Positions are named places on the island (see PondRoom's anchors), so they move with the map.

/** Named places on the walking island. */
export type Anchor = "door" | "falls" | "landing" | "stall" | "shrine" | "chair" | "pond" | "kindling" | "path";

export type Light = "afternoon" | "morning" | "night" | "dusk";

export interface WalkPerson {
  name: string;
  at: Anchor;
  /** Lines when tapped, in turn. */
  lines: string[];
  /**
   * Stays put at their place (Ladi: the ones the story needs, or who'd sit or keep a stall).
   * Everyone else wanders about near it. The walk's `go` person always stays.
   */
  stay?: true;
  /**
   * Offers optional runs (walk 3's ordinary morning): a tap says `lines`, then asks `ask` with one
   * button for each run, and a "Not now". The pick says its `then` lines and opens its run.
   */
  offer?: { lines: { who: string; text: string }[]; ask: string; runs: { label: string; run: "o1" | "o2" | "o3a" | "o3b" | "o3c"; then?: { who: string; text: string }[] }[] };
  /** Said over their head now and then while he is not close (Maudie's "When you've finished playing."). */
  idle?: string;
}

export interface Walk {
  n: number;
  title: string;
  light: Light;
  /** The run this walk comes after, and the one it leads to. */
  after: number;
  next: number;
  /** Who is about (Rook is the player; walk 1 scripts its own arrivals). */
  people: WalkPerson[];
  /** Who or what to tap to go on: a person's name or a place. */
  go: string;
  /** The goal shown on screen, and the question asked before the tap on `go` goes on (gameplay placeholders, not story lines). */
  goal: string;
  ask: string;
  /** Where Rook starts. */
  start: Anchor;
}

export const WALKS: Walk[] = [
  { n: 1, title: "The pond, afternoon", light: "afternoon", after: 2, next: 3, people: [], go: "Hesta", start: "pond", goal: "Talk to Hesta", ask: "Play Granny's game?" },
  {
    n: 2, title: "Morning, before the job", light: "morning", after: 3, next: 4, go: "skiff", start: "door", goal: "Take the skiff at the landing", ask: "Set out on the job?",
    people: [
      { name: "Lumi", at: "door", lines: ["I won. So I'm coming.", "I packed. Don't look in the bag."] },
      { name: "Moth", at: "landing", lines: ["Two islands called for you. Granny has the route."] },
      { name: "Hesta", at: "chair", stay: true, lines: ["I was resting my eyes.", "East, then the long way round the reef. Don't argue."] },
      { name: "Nell", at: "pond", lines: ["Rematch? Lumi says no rocks this time."] },
      { name: "Sefa", at: "pond", lines: ["Is it the best of three now?"] },
    ],
  },
  // Walk 3's first state (story/part1-optional-runs-lines.md, "State 1" and "Each optional run starts
  // and stops with a person"): an ordinary morning, Rook alone in work clothes, the optional runs on
  // offer from the people they belong to, and Maudie at his door as the way on, which closes them for
  // good (Ladi, 24 Nov). Its own number (6) so it is a walk of its own in Part 1's chain; it is not a
  // sixth time of day. All the lines are the story thread's drafts, unvoiced.
  {
    n: 6, title: "An ordinary morning", light: "morning", after: 5, next: 6, go: "Maudie", start: "door",
    goal: "Talk to Maudie at your door when you're ready", ask: "Get ready for the festival? Nobody will offer a game after this.",
    people: [
      { name: "Maudie", at: "door", stay: true, idle: "When you've finished playing.", lines: ["It's time. Hold still."] },
      { name: "Nell", at: "pond", lines: ["Granny said only if you say yes."], offer: { lines: [{ who: "Sefa", text: "Rematch!" }, { who: "Nell", text: "Granny said only if you say yes." }], ask: "Play Granny's rematch?", runs: [{ label: "Play", run: "o1", then: [{ who: "Hesta", text: "If I must. Bring the bag." }] }] } },
      { name: "Sefa", at: "pond", lines: ["Rematch!"], offer: { lines: [{ who: "Sefa", text: "Rematch!" }, { who: "Nell", text: "Granny said only if you say yes." }], ask: "Play Granny's rematch?", runs: [{ label: "Play", run: "o1", then: [{ who: "Hesta", text: "If I must. Bring the bag." }] }] } },
      { name: "Hesta", at: "pond", stay: true, lines: [] },
      { name: "Kes", at: "falls", lines: ["A lesson for the Captain? Or shall I beat you on the Fell. Wind's up."], offer: { lines: [{ who: "Kes", text: "A lesson for the Captain? Or shall I beat you on the Fell. Wind's up." }], ask: "Which one?", runs: [{ label: "Lumi's lesson with Kes", run: "o2", then: [{ who: "Kes", text: "Off you go, Rook, you're busy." }, { who: "Lumi", text: "Go on, Dad." }] }, { label: "Race Kes on the Fell", run: "o3c" }] } },
      { name: "Lumi", at: "falls", lines: ["Go on, Dad."] },
      { name: "Moth", at: "landing", stay: true, lines: ["Garrick says it's grown back. He says bring the small one."], offer: { lines: [{ who: "Moth", text: "Garrick says it's grown back. He says bring the small one." }, { who: "Moth", text: "And Marit says the tide owes her eight. Her words." }], ask: "Which job?", runs: [{ label: "Moss Hollow", run: "o3a" }, { label: "Tidepool Steps", run: "o3b" }] } },
      { name: "Orrin", at: "stall", stay: true, lines: ["Send the small one round with it. I need the frame."] },
    ],
  },
  {
    n: 3, title: "Festival morning", light: "morning", after: 5, next: 6, go: "Mabry", start: "door", goal: "Go to Mabry at the shrine", ask: "Go into the shrine with Mabry?",
    people: [
      { name: "Lumi", at: "path", lines: ["Do I look bright? Don't answer that."] },
      { name: "Maudie", at: "door", lines: ["Hold still, your collar's all wrong."] },
      { name: "Orrin", at: "stall", stay: true, lines: ["More panes in. She says they're crooked."] },
      { name: "Hesta", at: "stall", stay: true, lines: ["They're crooked, Orrin."] },
      { name: "Kes", at: "path", lines: ["Good luck today, Captain."] },
      { name: "Mabry", at: "shrine", lines: ["Come in, both of you."] },
    ],
  },
  {
    n: 4, title: "Night", light: "night", after: 7, next: 8, go: "Hesta", start: "door", goal: "Find Hesta on the terrace", ask: "Sit with Hesta?",
    people: [{ name: "Hesta", at: "chair", lines: ["Couldn't sleep either?"] }],
  },
  {
    n: 5, title: "Dusk", light: "dusk", after: 8, next: 9, go: "Mabry", start: "door", goal: "Go to Mabry at the shrine", ask: "Go to the shrine with Mabry?",
    people: [
      { name: "Mabry", at: "shrine", lines: ["We will speak of the Offering. Not here."] },
      { name: "Kes", at: "shrine", stay: true, lines: ["Old men arguing. Don't worry about it."] },
      { name: "Maudie", at: "door", lines: ["Keep her close tonight."] },
      { name: "Lumi", at: "door", lines: ["Are the lamps going to be all right?"] },
      { name: "Orrin", at: "stall", stay: true, lines: ["No jokes tonight, Rook."] },
      { name: "Hesta", at: "chair", stay: true, lines: ["..."] },
      { name: "Nell", at: "pond", lines: ["Are the lamps going to be all right?"] },
    ],
  },
];

export const walkByN = (n: number) => WALKS.find((w) => w.n === n) ?? WALKS[0]!;
