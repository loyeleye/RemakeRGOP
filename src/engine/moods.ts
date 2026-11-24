// Which portrait goes with a line. A line can name its mood; otherwise these rules pick one.

// Lumi's open-mouth faces are rare on purpose (four in the whole game, Ladi, 23 Nov 2026). In runs 1
// and 2 there is one: "delight-flash", when her tide pull first works, and only a line naming it gets it.
export const MOODS: Record<string, readonly string[]> = {
  Hesta: ["neutral", "approving", "firm"],
  Lumi: ["neutral", "calling", "delighted", "grudging", "smug", "unimpressed", "delight-flash"],
  Rook: ["neutral", "warm", "proud", "baffled"],
  Nell: ["neutral", "curious", "delighted", "determined", "sheepish", "worried"],
  Kes: ["neutral", "smug", "challenging", "wistful", "gracious"],
  Sefa: ["neutral", "awed", "eager", "grin", "impatient", "indignant", "sheepish"],
  Tilda: ["neutral", "tired", "lost", "asking", "watching"],
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
  ["Rook", /^(That's it\.|Just like that\.)/, "proud"],
  ["Rook", /^How did you do that\?/, "baffled"],
  ["Rook", /^(Yes, ma'am\.|See\?|Now you're the boss|Let's call it)/, "warm"],
  // Tilda (run 8, Ladi: "Tilda needs her face in her bark bubbles"). Which face goes with which line
  // is the gameplay thread's mapping, not ruled by Ladi; it all lives in these five rows. The count
  // lines ("Ten.") are watching; anything not named here is tired.
  ["Tilda", /^(You're Rook\. I'm Tilda\.|A tired one drops\.|They don't wander\.)/, "neutral"],
  ["Tilda", /^(There\. That's what I sent for you about\.|Don't look\. We don't\.|The book says |(\d+|[A-Z][a-z]+(-[a-z]+)?)\.$)/, "watching"],
  ["Tilda", /^They('ve never done| don't do) that\./, "lost"],
  ["Tilda", /^(I can't do that\. I can only hold one\.|Is it me\?|Then what is it\?)/, "asking"],
  ["Tilda", /./, "tired"],
];

/**
 * Portraits held back until they're redrawn, and what shows in their place, as "who-mood" names.
 * Lumi's faces are quiet and closed-mouth in this run (Ladi, 23 Nov 2026); the redraws are in.
 */
export const FACE_STANDIN: Record<string, string> = {};

/** The portrait file's name for a line ("lumi-smug"), or null if the speaker has none. */
export function faceOf(who: string, text: string, mood?: string): string | null {
  const m = moodOf(who, text, mood);
  if (!m) return null;
  const f = `${who.toLowerCase()}-${m}`;
  return FACE_STANDIN[f] ?? f;
}

/** The mood for a line, or null if the speaker has no portraits. */
export function moodOf(who: string, text: string, mood?: string): string | null {
  const moods = MOODS[who];
  if (!moods) return null;
  if (mood && moods.includes(mood)) return mood;
  for (const [w, re, m] of RULES) if (w === who && re.test(text)) return m;
  return "neutral";
}
