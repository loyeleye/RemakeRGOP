// The walks between runs on the home island (story plan: story/part1-between-runs.md, a draft).
// One map, five times of day. Each walk says its light, who is about and where, what they say
// when tapped (placeholders until the story thread writes them), and what tap starts what's next.
// Positions are named places on the island (see PondRoom's anchors), so they move with the map.

/** Named places on the walking island. */
export type Anchor = "door" | "falls" | "landing" | "stall" | "shrine" | "chair" | "pond" | "kindling" | "path";

export type Light = "afternoon" | "morning" | "sunset" | "night" | "dusk";

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
  /** Tiles from their place (east, south), to stand clear of something there (walk 7: off the landing's posts, onto the grass). */
  off?: [number, number];
  /** Where they face while standing (walk 7: Maudie toward the landing). */
  look?: Anchor;
  /** Where they go on their own once the walk's `first` talk is done (walk 7: Lumi runs home). */
  then?: Anchor;
  /** An exchange said on the first tap, one line after another, who by who (Kes's challenge in walk 7); later taps say `lines`. */
  talk?: { who: string; text: string }[];
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
  /** Someone to talk to before `go` is the way on (walk 7's Kes), with the goal shown until then. */
  first?: { name: string; goal: string };
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
  // Between runs 4 and 5 (story/gap4-5-walk-beats.md, 25 Nov): two walks with a night between them.
  // The shape is Ladi's (talk to Kes at the landing, go home, talk to Kes again the next day); every
  // line here but the first four of Kes's exchange is the story thread's draft, not seen by Ladi. Walk
  // 7's sunset tint is Ladi's, to signal the end of the day.
  {
    n: 7, title: "Sunset", light: "sunset", after: 4, next: 5, go: "Lumi", start: "landing",
    first: { name: "Kes", goal: "Talk to Kes" }, goal: "Go home", ask: "Turn in for the night?",
    people: [
      // Ladi (25 Nov): Kes a little onto the grass, Lumi by her for the talk, Moth off the anchor post;
      // after the talk Lumi runs home on her own.
      {
        name: "Kes", at: "landing", off: [4, -1], stay: true, lines: ["Tomorrow, then. The Fell. Bring the referee."],
        talk: [
          { who: "Kes", text: "You took my pupil on a job." },
          { who: "Rook", text: "She's my daughter." },
          { who: "Kes", text: "She was going to be my pupil. Race you for her." },
          { who: "Lumi", text: "I'm not a prize. I'm the referee." },
          { who: "Kes", text: "Tomorrow, then. The Fell. Bring the referee." },
        ],
      },
      // Ladi: near enough to watch, far enough not to be part of it, facing the dock.
      { name: "Maudie", at: "landing", off: [9, -5], look: "landing", stay: true, lines: ["Ten years that girl ate at my table. Her and Ros.", "I know that look on her.", "Go on in. That child's asleep on her feet."] },
      { name: "Moth", at: "landing", stay: true, lines: ["Both stops before supper. Granny will say she planned it."] },
      { name: "Hesta", at: "chair", stay: true, lines: ["Back already? I'd barely shut my eyes."] },
      { name: "Nell", at: "pond", lines: ["Did they pay you?"] },
      { name: "Sefa", at: "pond", lines: ["Did you see a fish?"] },
      { name: "Lumi", at: "landing", off: [4, 0], then: "door", stay: true, lines: ["Marit said 'Thank you, Lumi.' You heard her."], talk: [{ who: "Lumi", text: "Marit said 'Thank you, Lumi.' You heard her." }, { who: "Rook", text: "I heard her." }] },
    ],
  },
  {
    n: 8, title: "The next morning", light: "morning", after: 4, next: 5, go: "Kes", start: "door", goal: "Talk to Kes", ask: "Cross to Kite Fell?",
    people: [
      { name: "Kes", at: "landing", stay: true, lines: ["There he is. Get in. I'm steering."] },
      { name: "Lumi", at: "landing", stay: true, lines: ["You're late."] },
      { name: "Maudie", at: "path", stay: true, lines: ["Ros planted these the spring Lumi came.", "Wrong blue. She said so every year and never pulled them up.", "They came up the winter she was ill, too. In the snow. She laughed at that."] },
      { name: "Hesta", at: "chair", stay: true, lines: ["..."] },
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
