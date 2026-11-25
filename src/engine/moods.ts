// Which portrait goes with a line. A line can name its mood; otherwise these rules pick one.

// Lumi's open-mouth faces are rare on purpose (four in the whole game, Ladi, 23 Nov 2026). In runs 1
// and 2 there is one: "delight-flash", when her tide pull first works, and only a line naming it gets it.
export const MOODS: Record<string, readonly string[]> = {
  // "grinning" and "dozing" are the optional run's (Granny's rematch): only a line that names them gets them.
  Hesta: ["neutral", "approving", "firm", "grinning", "dozing"],
  // "proud" is the optional run's (Lumi's lesson with Kes), as "teaching" is Kes's: only a line that names them gets them.
  Lumi: ["neutral", "calling", "delighted", "grudging", "smug", "unimpressed", "delight-flash", "proud"],
  // "shocked" is run 10's (a draft face, 25 Nov): only the line that names it gets it.
  Rook: ["neutral", "warm", "proud", "baffled", "shocked"],
  Nell: ["neutral", "curious", "delighted", "determined", "sheepish", "worried"],
  Kes: ["neutral", "smug", "challenging", "wistful", "gracious", "alarmed", "bereft", "teaching"],
  // The two old people on the low one (run 9). First drafts from the cast thread, not approved by Ladi; he has no line yet.
  "Sefa's grandmother": ["talking", "steady", "soft"],
  "Sefa's grandfather": ["neutral"],
  Sefa: ["neutral", "awed", "eager", "grin", "impatient", "indignant", "sheepish"],
  Tilda: ["neutral", "tired", "lost", "asking", "watching"],
  // The neighbours on the walks and the two keepers (the cast thread's bubble faces, brought in on
  // 25 Nov when Ladi asked why Orrin's bubble had none). "talking" is each one's open-mouth face:
  // only a line that names it gets it.
  Orrin: ["neutral", "talking", "amused", "grave"],
  Maudie: ["neutral", "talking", "fond", "worried"],
  Moth: ["neutral", "talking", "grave"],
  Garrick: ["neutral", "talking", "pleased"],
  Marit: ["neutral", "talking", "satisfied"],
};

const RULES: [who: string, match: RegExp, mood: string][] = [
  ["Hesta", /^(That's it\.|Clean\.|Good\.|That's the way\.|That's the where|Good\. You heard)/, "approving"],
  ["Hesta", /^(Hold still|Back to your square|Stay there)/, "firm"],
  ["Lumi", /^(\.\.\.)?Fine\. (That one|I suppose)/, "grudging"],
  ["Lumi", /^(Dad\. I know\.|I didn't ask for any\.|Forget it\.|Never mind|Fine\. Ignore me\.)/, "unimpressed"],
  ["Lumi", /^(I pulled\.|I don't need pointers\.|You didn't ignore me once)/, "smug"],
  ["Lumi", /^(So I'm coming tomorrow\.|First light!|That's the last bell!)/, "delighted"],
  ["Lumi", /^(Dad\.|Okay\.|[A-Z][a-z]+(-[a-z]+)? one)/, "calling"],
  ["Nell", /^(No fair!|I'm on Lumi's side)/, "determined"],
  ["Nell", /^(A hundred and ten\?|Lumi says you're good|Rematch\?)/, "curious"],
  ["Nell", /^Are the lamps going to be all right\?/, "worried"],
  ["Nell", /more!$/, "determined"],
  ["Sefa", /^(That's cheating!|She's not even running!)/, "indignant"],
  ["Sefa", /^How did you do that\?/, "awed"],
  ["Sefa", /^(We need four!|Are you playing\?)/, "impatient"],
  ["Sefa", /^(Are you a hundred\?|Is it the best of three)/, "grin"],
  ["Sefa", /more!$/, "eager"],
  // Kes (run 5): neutral and smug are close at this size, so anything at all teasing is smug (cast thread).
  ["Kes", /^(You took my pupil|She was going to be my pupil|Two nothing's no fun|Last one takes it)/, "challenging"],
  ["Kes", /^(Rosie would have|Constantly\.)/, "wistful"],
  ["Kes", /^You worked for that\./, "gracious"],
  ["Kes", /^(Whatever you say|Good\.|There he is\.|I pulled\.|Did you see that\?|They like company|You hold on too long|I know\. It's annoying\.|Same time next week|Nice\.|Don't get used to it)/, "smug"],
  // Run 9, the rescue (the gameplay thread checks this mapping; the two Kes faces are placeholders being re-framed).
  ["Kes", /^(Rook\. What is that\.|There's nothing up there\.|It's coming back|(The l|L)amp's gone dark|It went for the heap|It won't keep in this cloud|It goes for the brightest thing|Too few at the stones|It's on the boat|It took the stones|These two stay at the stones)/, "alarmed"],
  ["Kes", /^(My string|They're gone\.|I'm all right\.|They're all right\.)/, "bereft"],
  ["Sefa's grandmother", /^Little ones on the first boat/, "steady"],
  ["Sefa's grandmother", /^You keep looking over there/, "soft"],
  ["Sefa's grandmother", /./, "talking"],
  ["Rook", /^(That's it\.|Just like that\.)/, "proud"],
  ["Rook", /^How did you do that\?/, "baffled"],
  // Run 10's last line: his shocked face (Ladi asked for it, 25 Nov; the face itself is a draft he has not judged).
  ["Rook", /^That's Lumi's lantern\./, "shocked"],
  ["Rook", /^(Yes, ma'am\.|See\?|Now you're the boss|Let's call it)/, "warm"],
  // Tilda (run 8, Ladi: "Tilda needs her face in her bark bubbles"). Which face goes with which line
  // is the gameplay thread's mapping, not ruled by Ladi; it all lives in these five rows. The count
  // lines ("Ten.") are watching; anything not named here is tired.
  ["Tilda", /^(You're Rook\. I'm Tilda\.|A tired one drops\.|They don't wander\.)/, "neutral"],
  ["Tilda", /^(There\. That's what I sent for you about\.|Don't look\. We don't\.|The book says |(\d+|[A-Z][a-z]+(-[a-z]+)?)\.$)/, "watching"],
  ["Tilda", /^They('ve never done| don't do) that\./, "lost"],
  ["Tilda", /^(I can't do that\. I can only hold one\.|Is it me\?|Then what is it\?)/, "asking"],
  ["Tilda", /./, "tired"],
  // The neighbours and the keepers. Which face goes with which line is the build's mapping, not ruled by Ladi.
  ["Orrin", /^More panes in\./, "amused"],
  ["Orrin", /^No jokes tonight/, "grave"],
  ["Maudie", /^Hold still, your collar/, "fond"],
  ["Maudie", /^Keep her close tonight/, "worried"],
  ["Garrick", /^(That's the old patch\. Good\.|That's the jar I owe her|That'll hold till spring|And this is Rosalind's girl)/, "pleased"],
  ["Marit", /^(Patience\. Good\.|As agreed|Thank you, Lumi\.|For the lamplighter, then\.)/, "satisfied"],
];

/**
 * Portraits held back until they're redrawn, and what shows in their place, as "who-mood" names.
 * Lumi's faces are quiet and closed-mouth in this run (Ladi, 23 Nov 2026); the redraws are in.
 */
export const FACE_STANDIN: Record<string, string> = {};

/** Speakers whose portrait files go by a shorter name than the one over their lines. */
const FACE_NAME: Record<string, string> = { "Sefa's grandmother": "grandmother", "Sefa's grandfather": "grandfather" };

/** The portrait file's name for a line ("lumi-smug"), or null if the speaker has none. */
export function faceOf(who: string, text: string, mood?: string): string | null {
  const m = moodOf(who, text, mood);
  if (!m) return null;
  const f = `${FACE_NAME[who] ?? who.toLowerCase()}-${m}`;
  return FACE_STANDIN[f] ?? f;
}

/** The mood for a line, or null if the speaker has no portraits. */
export function moodOf(who: string, text: string, mood?: string): string | null {
  const moods = MOODS[who];
  if (!moods) return null;
  if (mood && moods.includes(mood)) return mood;
  for (const [w, re, m] of RULES) if (w === who && re.test(text)) return m;
  return moods.includes("neutral") ? "neutral" : moods[0]!;
}
