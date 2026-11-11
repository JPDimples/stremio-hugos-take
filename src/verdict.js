// Hugo's verdict engine — pure functions, no I/O, no network.
// Given TMDB details for a title, pick Hugo's deadpan one-liner and a
// paw rating (1-5, derived from TMDB's vote average when enough people
// have voted). First matching rule wins.

const GENRE = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCI_FI: 878,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
};

const RULES = [
  { test: (g) => g.has(GENRE.HORROR), line: "Horror. Hard pass — Tammy's rules apply to me too." },
  { test: (g) => g.has(GENRE.ROMANCE) && g.has(GENRE.COMEDY), line: "A rom-com. Tammy's already seen it twice." },
  { test: (g) => g.has(GENRE.ROMANCE), line: "Tammy will love this one. You will survive it. Probably." },
  { test: (g, d) => d.vote_average >= 8 && d.vote_count >= 100, line: "Genuinely good. Watch it before someone spoils it for you." },
  { test: (g, d) => d.vote_average > 0 && d.vote_average < 5 && d.vote_count >= 50, line: "Life's too short. Skip it and go for a walk instead." },
  { test: (g) => g.has(GENRE.ACTION), line: "Explosions, chases, zero thinking required. Perfect Friday night." },
  { test: (g) => g.has(GENRE.COMEDY), line: "Actually funny. Rare, these days." },
  { test: (g) => g.has(GENRE.DRAMA), line: "A proper drama. Bring tea. You'll need it." },
  { test: (g) => g.has(GENRE.DOCUMENTARY), line: "You'll learn something. That's not a threat." },
  { test: (g) => g.has(GENRE.CRIME), line: "Someone's getting caught. Probably not you." },
  { test: (g) => g.has(GENRE.THRILLER), line: "Edge of the sofa stuff. Don't watch it alone at 2am." },
  { test: (g) => g.has(GENRE.SCI_FI), line: "Spaceships and questionable science. Hugo approves." },
  { test: (g) => g.has(GENRE.FAMILY), line: "One for the whole crew. Even Nevaeh would like this one." },
  { test: (g) => g.has(GENRE.ANIMATION), line: "A cartoon. Yes, adults are allowed." },
  { test: (g) => g.has(GENRE.FANTASY), line: "Swords, magic, and a map you'll never follow. Enjoy." },
  { test: (g) => g.has(GENRE.MYSTERY), line: "Hugo worked it out in ten minutes. See if you can." },
  { test: () => true, line: "Worth a look. Hugo has spoken." },
];

export function verdict(details) {
  const genres = new Set((details.genres || []).map((g) => g.id));
  const rule = RULES.find((r) => r.test(genres, details));
  const paws =
    details.vote_count >= 20
      ? Math.max(1, Math.min(5, Math.round((details.vote_average || 0) / 2)))
      : null;
  return { line: rule.line, paws };
}

export function buildDescription(details) {
  const { line, paws } = verdict(details);
  const overview = (details.overview || "").trim();
  const head =
    paws === null
      ? `Hugo's Take: ${line}`
      : `Hugo's Take: ${line}\nHugo rates it ${paws}/5 paws.`;
  return overview ? `${head}\n\n${overview}` : head;
}
