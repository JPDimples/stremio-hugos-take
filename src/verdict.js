// Hugo's verdict engine — pure functions, no I/O, no network.
// Given title details, pick Hugo's sarcastic deadpan one-liner and a
// paw rating (1-5, derived from the IMDb rating when enough people
// have voted).
//
// Variety: every rule carries several lines and the pick is
// deterministic per title (hash of the IMDb id + the rule key), so the
// same film always says the same thing, but browsing feels fresh.
//
// Config (see src/index.js): { style, mascot, paws, horror }
//   style: "sarcastic" (default), "tammy", "family"
//   mascot: "hugo" (default), "liam", "masie"
//   paws: show the paw rating (default true)
//   horror: show verdicts on horror titles (default true)
// A rule may carry style-specific lines (tammy / family) and
// mascot-specific lines (liam / masie). Where a rule has no lines for
// the chosen style or mascot, the sarcastic Hugo lines are used, so
// every combination always has something to say.

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

export const MASCOT_NAMES = { hugo: "Hugo", liam: "Liam", masie: "Masie" };

// Every rule: first matching rule wins. Rules are checked in this
// order: relationship and rating first, then runtime / era / sequel,
// then genre, then the fallback.
const RULES = [
  {
    key: "romcom",
    test: (g) => g.has(GENRE.ROMANCE) && g.has(GENRE.COMEDY),
    lines: {
      sarcastic: [
        "A rom-com. Tammy's already seen it twice.",
        "A rom-com. Tammy cried, you pretended not to.",
        "A rom-com. Two hours of people almost talking to each other.",
        "A rom-com. Tammy picked it. You don't get a vote.",
      ],
      tammy: [
        "Tammy's already seen it twice, and she's watching it again tonight.",
        "Tammy's pick. She laughed, she cried, she'll quote it for a week.",
        "Tammy says this one is a keeper. Tammy is always right.",
      ],
      family: [
        "A sweet one. Tammy will love it, and so will you.",
        "A gentle rom-com. Everyone's happy by the end, promise.",
        "A cosy one for a quiet night in together.",
      ],
    },
    mascot: {
      liam: [
        "A rom-com! Tammy's already got the popcorn out.",
        "A rom-com, and a good one. I laughed the whole way through.",
      ],
      masie: [
        "A rom-com. Even I cried. Don't tell anyone.",
        "A rom-com with actual charm. Rare. Enjoy it.",
      ],
    },
  },
  {
    key: "romance",
    test: (g) => g.has(GENRE.ROMANCE),
    lines: {
      sarcastic: [
        "Tammy will love this one. You will survive it. Probably.",
        "A romance. Tammy's in charge of the remote for this one.",
        "A romance. Bring tissues. Not for you. For Tammy. Obviously.",
        "Love, longing, and at least one dramatic airport scene.",
      ],
      tammy: [
        "Tammy will love this one. She already does.",
        "Tammy's film. She picked it, she adores it, end of discussion.",
        "Tammy cried twice. She says that's a five-star review.",
      ],
      family: [
        "A love story with a happy ending. Tammy will adore it.",
        "A warm one. Best watched together, blankets optional.",
        "Romance, minus the awkward bits. A safe pick for everyone.",
      ],
    },
    mascot: {
      liam: [
        "A romance! Tammy will love this one. You will survive it. Probably.",
        "A love story. I'm not crying, you're crying.",
      ],
      masie: [
        "A romance. Dark hair, dramatic lighting, feelings. I approve.",
        "A love story with style. Tammy will adore it.",
      ],
    },
  },
  {
    key: "high-rating",
    test: (g, d) => d.vote_average >= 8 && d.vote_count >= 100,
    lines: {
      sarcastic: [
        "Genuinely good. Watch it before someone spoils it for you.",
        "Rated that high for a reason. Stop scrolling and watch it.",
        "Top shelf. Hugo rarely says this, so listen.",
        "Everyone agrees on this one. That almost never happens.",
      ],
      tammy: [
        "Tammy's kind of film. She'll be talking about it for days.",
        "Rated that high for a reason. Tammy already knew.",
        "A proper favourite. Tammy gives it full marks too.",
      ],
      family: [
        "A genuinely great one. Worth the whole family's time.",
        "Highly rated and easy to love. A safe bet for movie night.",
        "One of the best. Even Hugo can't find anything to complain about.",
      ],
    },
  },
  {
    key: "low-rating",
    test: (g, d) => d.vote_average > 0 && d.vote_average < 5 && d.vote_count >= 50,
    lines: {
      sarcastic: [
        "Life's too short. Skip it and go for a walk instead.",
        "Rated that low for a reason. Hugo has warned you.",
        "Two hours you'll never get back. The walk is free.",
        "The critics were right. For once.",
      ],
      tammy: [
        "Tammy fell asleep halfway. Tammy never falls asleep.",
        "Tammy says skip it. Tammy is always right.",
        "Even Tammy gave up on this one. That's your answer.",
      ],
      family: [
        "Not one of the good ones. Pick something else tonight.",
        "Low rated for a reason. There are better films waiting.",
        "Hugo says skip it. Trust Hugo on this one.",
      ],
    },
  },
  {
    key: "long-runtime",
    test: (g, d) => (d.runtimeMinutes || 0) >= 170,
    lines: {
      sarcastic: [
        "Nearly three hours. Bring snacks and a cushion.",
        "It's a long one. Your sofa is about to earn its keep.",
        "Three hours. The plot had better be worth it.",
        "Long film. Plan a break in the middle or your legs will file a complaint.",
      ],
      family: [
        "A long one. Snacks ready, comfy seats, no rush.",
        "Settle in, this one's a marathon, not a sprint.",
      ],
    },
  },
  {
    key: "classic",
    test: (g, d) => (d.year || 9999) <= 1979,
    lines: {
      sarcastic: [
        "Older than your knees, and holding up better.",
        "A classic. They don't make them like this anymore. Mostly because they can't.",
        "Made before CGI did all the work. Respect.",
        "Old, gold, and still better than most of what's new.",
      ],
      family: [
        "A classic. The kind everyone should see at least once.",
        "An old favourite. Still holds up beautifully.",
      ],
    },
  },
  {
    key: "new-release",
    test: (g, d) => (d.year || 0) >= 2025,
    lines: {
      sarcastic: [
        "Fresh out of the cinema. Spoilers are already everywhere.",
        "Brand new. You haven't seen it yet and neither has anyone worth trusting.",
        "So new the popcorn's still warm.",
      ],
      family: [
        "Brand new. Fresh off the big screen and ready for you.",
        "Hot off the press. Be the first of your friends to see it.",
      ],
    },
  },
  {
    key: "sequel",
    test: (g, d) =>
      /(?:\b2\b|\bII\b|\bIII\b|\bIV\b|part\s*2|returns|chapter\s*\d|reloaded|revolutions|resurrection|rise of|dawn of)\b/i.test(
        d.title || ""
      ),
    lines: {
      sarcastic: [
        "Another one. The studio needed a new boat.",
        "The sequel. Same story, bigger budget, louder explosions.",
        "They made another. Hope is a dangerous thing.",
        "Part two. The first one was better. It usually is.",
      ],
      family: [
        "Back for another round. The gang's all here.",
        "The next chapter. If you liked the first, you'll like this.",
      ],
    },
  },
  {
    key: "action",
    test: (g) => g.has(GENRE.ACTION),
    lines: {
      sarcastic: [
        "Explosions, chases, zero thinking required. Perfect Friday night.",
        "Things blow up. People run. Hugo approves.",
        "Ninety minutes of noise and nonsense. Glorious.",
        "Action. The plot is optional and everyone knows it.",
      ],
    },
  },
  {
    key: "comedy",
    test: (g) => g.has(GENRE.COMEDY),
    lines: {
      sarcastic: [
        "Actually funny. Rare, these days.",
        "Funny on purpose. Imagine that.",
        "You'll laugh. Hugo almost did.",
        "A comedy that remembers to be funny. Novel concept.",
      ],
      family: [
        "A proper laugh. Safe for the whole room.",
        "Funny for everyone, not just the grown-ups.",
      ],
    },
    mascot: {
      liam: [
        "Actually funny! I laughed so hard I nearly fell off the sofa.",
        "A comedy that delivers. Big laughs, zero thinking.",
      ],
      masie: [
        "Actually funny. Rare, these days. Even I laughed.",
        "Dark humour, done right. Hugo almost smiled.",
      ],
    },
  },
  {
    key: "drama",
    test: (g) => g.has(GENRE.DRAMA),
    lines: {
      sarcastic: [
        "A proper drama. Bring tea. You'll need it.",
        "Heavy stuff. The acting's good, the mood is not.",
        "A drama. Feelings will be felt, like it or not.",
        "Serious film. No explosions to hide behind.",
      ],
      tammy: [
        "Tammy's kind of drama. Tissues on standby.",
        "A proper drama. Tammy was invested from the first scene.",
      ],
      family: [
        "A thoughtful drama. Worth a quiet evening.",
        "A proper story, well told. Give it your full attention.",
      ],
    },
  },
  {
    key: "documentary",
    test: (g) => g.has(GENRE.DOCUMENTARY),
    lines: {
      sarcastic: [
        "You'll learn something. That's not a threat.",
        "Real life, somehow stranger than the fiction.",
        "A documentary. Hugo is now an expert on this topic.",
        "True story. Arguably better than the made-up ones.",
      ],
    },
  },
  {
    key: "crime",
    test: (g) => g.has(GENRE.CRIME),
    lines: {
      sarcastic: [
        "Someone's getting caught. Probably not you.",
        "Crime, lies, and one detective who saw it coming.",
        "A crime story. Hugo worked it out in ten minutes.",
        "Heists, cons, and people lying to each other's faces. Lovely.",
      ],
    },
  },
  {
    key: "thriller",
    test: (g) => g.has(GENRE.THRILLER),
    lines: {
      sarcastic: [
        "Edge of the sofa stuff. Don't watch it alone at 2am.",
        "Tense. Hugo checked the locks twice.",
        "A thriller. Your heart rate will do the exercise for you.",
        "Nobody is who they say they are. Obviously.",
      ],
    },
  },
  {
    key: "sci-fi",
    test: (g) => g.has(GENRE.SCI_FI),
    lines: {
      sarcastic: [
        "Spaceships and questionable science. Hugo approves.",
        "The future, as imagined by people who've never fixed a printer.",
        "Sci-fi. The science is dodgy, the fun is real.",
        "Aliens, robots, or both. Hugo is in.",
      ],
    },
  },
  {
    key: "family",
    test: (g) => g.has(GENRE.FAMILY),
    lines: {
      sarcastic: [
        "One for the whole crew. Even Nevaeh would like this one.",
        "Family film. Nevaeh approved, and she has standards.",
        "Everyone can watch this one. Even you.",
        "A family night pick. Popcorn mandatory, arguing optional.",
      ],
      tammy: [
        "Tammy loves this one. So does Nevaeh. That's the whole review.",
        "A family favourite. Tammy and Nevaeh both give it top marks.",
      ],
      family: [
        "One for the whole crew. Even Nevaeh would like this one.",
        "A family film everyone can enjoy together.",
        "Perfect for movie night. Nevaeh approved.",
      ],
    },
    mascot: {
      liam: [
        "One for the whole crew! Even Nevaeh would like this one.",
        "A family film, and a good one. Movie night sorted.",
      ],
      masie: [
        "One for the whole crew. Even Nevaeh would like this one.",
        "Family film, done right. Rare. Enjoy it.",
      ],
    },
  },
  {
    key: "animation",
    test: (g) => g.has(GENRE.ANIMATION),
    lines: {
      sarcastic: [
        "A cartoon. Yes, adults are allowed.",
        "Animated. The drawings do the acting and they're better at it.",
        "A cartoon with a better script than most live-action films.",
        "Drawn, not filmed. Somehow still more believable.",
      ],
      family: [
        "A lovely animated one. Great for the whole family.",
        "Beautiful animation, good story, happy ending.",
      ],
    },
  },
  {
    key: "fantasy",
    test: (g) => g.has(GENRE.FANTASY),
    lines: {
      sarcastic: [
        "Swords, magic, and a map you'll never follow. Enjoy.",
        "Fantasy. Someone's destiny is involved. It always is.",
        "Dragons, probably. Hugo didn't check, but assume dragons.",
        "Magic and quests. TheChosen One has arrived, again.",
      ],
    },
  },
  {
    key: "mystery",
    test: (g) => g.has(GENRE.MYSTERY),
    lines: {
      sarcastic: [
        "Hugo worked it out in ten minutes. See if you can.",
        "A mystery. The butler did it. Hugo won't say which butler.",
        "Clues everywhere. Hugo spotted the twist before the opening credits.",
        "Someone's lying. Hugo knows who. You don't. Yet.",
      ],
    },
  },
  {
    key: "horror",
    test: (g) => g.has(GENRE.HORROR),
    lines: {
      sarcastic: [
        "Scary. Hugo hid behind the sofa. Hugo is a yeti.",
        "Horror. Sleep with the light on. Hugo will deny everything.",
        "Jump scares and bad decisions. Classic.",
        "Terrifying. Tammy watched it through her fingers.",
      ],
      tammy: [
        "Tammy watched it through her fingers. She says it's great.",
        "Spooky, but Tammy loved it. She screamed twice, in a good way.",
      ],
      family: [
        "A spooky one. Lights on, blanket ready, grown-up nearby.",
        "Scary stuff. Best for the brave, and not before bed.",
      ],
    },
    mascot: {
      masie: [
        "Horror. Finally, something with atmosphere. I loved it.",
        "Dark, creepy, and proud of it. My kind of film.",
      ],
    },
  },
  {
    key: "fallback",
    test: () => true,
    lines: {
      sarcastic: [
        "Worth a look. Hugo has spoken.",
        "Hugo watched it so you don't have to guess.",
        "It exists. Hugo has notes.",
        "Give it a go. Worst case, there's always the walk.",
      ],
      tammy: [
        "Tammy says give it a try. Tammy is always right.",
        "Worth a look. Tammy's already added it to the list.",
      ],
      family: [
        "Worth a look. A solid pick for tonight.",
        "Give it a go. Hugo thinks you'll enjoy it.",
      ],
    },
    mascot: {
      liam: [
        "Worth a look! Liam has spoken.",
        "Give it a go. I reckon you'll enjoy this one.",
      ],
      masie: [
        "Worth a look. Masie has spoken.",
        "Give it a go. Dark or light, it's got something.",
      ],
    },
  },
];

// djb2 hash — small, deterministic, no dependencies.
export { RULES };

export function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export const DEFAULT_CONFIG = {
  style: "sarcastic",
  mascot: "hugo",
  paws: true,
  horror: true,
};

export function normalizeConfig(input) {
  const c = { ...DEFAULT_CONFIG };
  if (!input || typeof input !== "object") return c;
  if (["sarcastic", "tammy", "family"].includes(input.style)) c.style = input.style;
  if (["hugo", "liam", "masie"].includes(input.mascot)) c.mascot = input.mascot;
  if (typeof input.paws === "boolean") c.paws = input.paws;
  if (typeof input.horror === "boolean") c.horror = input.horror;
  return c;
}

export function takeLabel(config) {
  const name = MASCOT_NAMES[config.mascot] || "Hugo";
  return `${name}'s Take`;
}

function pickLine(rule, imdbId, config) {
  // Mascot-specific lines win when they exist for this rule.
  const mascotLines =
    config.mascot !== "hugo" &&
    rule.mascot &&
    rule.mascot[config.mascot];
  let lines = null;
  if (mascotLines) {
    lines = mascotLines;
  } else if (rule.lines[config.style]) {
    lines = rule.lines[config.style];
  } else {
    lines = rule.lines.sarcastic;
  }
  const seed = imdbId ? `${imdbId}:${rule.key}` : rule.key;
  return lines[hashString(seed) % lines.length];
}

export function verdict(details, imdbId = "", config = DEFAULT_CONFIG) {
  const cfg = normalizeConfig(config);
  const genres = new Set((details.genres || []).map((g) => g.id));
  const yearFromDate = (s) => {
    const m = /^(\d{4})/.exec(s || "");
    return m ? parseInt(m[1], 10) : 0;
  };
  const d = {
    vote_average: details.vote_average || 0,
    vote_count: details.vote_count || 0,
    runtimeMinutes: details.runtimeMinutes || details.runtime || 0,
    year:
      details.year ||
      yearFromDate(details.release_date) ||
      yearFromDate(details.first_air_date) ||
      0,
    title: details.title || details.name || "",
  };
  // Horror verdicts off: no verdict at all for horror titles.
  if (!cfg.horror && genres.has(GENRE.HORROR)) {
    return { line: null, paws: null, skipped: true, label: takeLabel(cfg) };
  }
  const rule = RULES.find((r) => r.test(genres, d));
  const line = pickLine(rule, imdbId, cfg);
  const paws =
    cfg.paws && d.vote_count >= 20
      ? Math.max(1, Math.min(5, Math.round(d.vote_average / 2)))
      : null;
  return { line, paws, skipped: false, label: takeLabel(cfg) };
}

const NAME_TO_ID = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  "Science Fiction": 878,
  "Sci-Fi": 878,
  Thriller: 53,
  War: 10752,
  Western: 37,
};

export function verdictForCinemeta(meta, imdbId = "", config = DEFAULT_CONFIG) {
  const rating = parseFloat(meta.imdbRating) || 0;
  const runtimeMatch = /(\d+)\s*min/.exec(meta.runtime || "");
  const yearMatch = /^(\d{4})/.exec(meta.releaseInfo || "");
  const details = {
    genres: (meta.genres || [])
      .map((name) => ({ id: NAME_TO_ID[name] }))
      .filter((g) => g.id !== undefined),
    vote_average: rating,
    // an IMDb rating is by definition based on many votes
    vote_count: rating > 0 ? 1000 : 0,
    runtimeMinutes: runtimeMatch ? parseInt(runtimeMatch[1], 10) : 0,
    year: yearMatch ? parseInt(yearMatch[1], 10) : 0,
    title: meta.name || "",
  };
  return verdict(details, imdbId || meta.id || "", config);
}

// Full description head: verdict line + paw rating, or just the
// synopsis when the verdict was skipped (horror off).
export function buildDescription(details, imdbId = "", config = DEFAULT_CONFIG) {
  const cfg = normalizeConfig(config);
  const { line, paws, skipped, label } = verdict(details, imdbId, cfg);
  const overview = (details.overview || "").trim();
  if (skipped) return overview;
  const head =
    paws === null
      ? `${label}: ${line}`
      : `${label}: ${line}\n${MASCOT_NAMES[cfg.mascot] || "Hugo"} rates it ${paws}/5 paws.`;
  return overview ? `${head}\n\n${overview}` : head;
}

// Short head only (no synopsis), used for the picks-shelf catalog.
export function buildHead(details, imdbId = "", config = DEFAULT_CONFIG) {
  const cfg = normalizeConfig(config);
  const { line, paws, skipped, label } = verdict(details, imdbId, cfg);
  if (skipped) return null;
  return paws === null
    ? `${label}: ${line}`
    : `${label}: ${line}\n${MASCOT_NAMES[cfg.mascot] || "Hugo"} rates it ${paws}/5 paws.`;
}
