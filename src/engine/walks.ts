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
  /** Where Rook starts. */
  start: Anchor;
}

export const WALKS: Walk[] = [
  { n: 1, title: "The pond, afternoon", light: "afternoon", after: 2, next: 3, people: [], go: "Hesta", start: "pond" },
  {
    n: 2, title: "Morning, before the job", light: "morning", after: 3, next: 4, go: "skiff", start: "door",
    people: [
      { name: "Lumi", at: "door", lines: ["I won. So I'm coming.", "I packed. Don't look in the bag."] },
      { name: "Moth", at: "landing", lines: ["Two islands called for you. Granny has the route."] },
      { name: "Hesta", at: "chair", stay: true, lines: ["I was resting my eyes.", "East, then the long way round the reef. Don't argue."] },
      { name: "Nell", at: "pond", lines: ["Rematch? Lumi says no rocks this time."] },
      { name: "Sefa", at: "pond", lines: ["Is it the best of three now?"] },
    ],
  },
  {
    n: 3, title: "Festival morning", light: "morning", after: 5, next: 6, go: "Mabry", start: "door",
    people: [
      { name: "Lumi", at: "path", lines: ["Do I look bright? Don't answer that."] },
      { name: "Maudie", at: "door", lines: ["Hold still, your collar's all wrong."] },
      { name: "Orrin", at: "stall", stay: true, lines: ["More panes in. She says they're crooked."] },
      { name: "Hesta", at: "stall", stay: true, lines: ["They're crooked, Orrin."] },
      { name: "Kes", at: "path", lines: ["Good luck today, Sparkbug."] },
      { name: "Mabry", at: "shrine", lines: ["Come in, both of you."] },
    ],
  },
  {
    n: 4, title: "Night", light: "night", after: 7, next: 8, go: "Hesta", start: "door",
    people: [{ name: "Hesta", at: "chair", lines: ["Couldn't sleep either?"] }],
  },
  {
    n: 5, title: "Dusk", light: "dusk", after: 8, next: 9, go: "Mabry", start: "door",
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
