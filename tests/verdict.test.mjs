// Unit tests for Hugo's verdict engine. Run: node tests/verdict.test.mjs
import assert from "node:assert/strict";
import {
  verdict,
  verdictForCinemeta,
  buildDescription,
  buildHead,
  normalizeConfig,
  DEFAULT_CONFIG,
  RULES,
  hashString,
} from "../src/verdict.js";

const base = (over) => ({
  genres: [],
  vote_average: 7.0,
  vote_count: 500,
  overview: "A test synopsis.",
  ...over,
});

const linesFor = (key, style = "sarcastic") =>
  RULES.find((r) => r.key === key).lines[style];

let n = 0;
const check = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok ${n}. ${name}`);
};

check("every rule has at least 3 sarcastic lines", () => {
  for (const r of RULES) {
    assert.ok(
      r.lines.sarcastic.length >= 3,
      `${r.key} has ${r.lines.sarcastic.length} sarcastic lines`
    );
  }
});

check("pick is deterministic per title and rule", () => {
  const a = verdict(base({ genres: [{ id: 35, name: "Comedy" }] }), "tt1234567");
  const b = verdict(base({ genres: [{ id: 35, name: "Comedy" }] }), "tt1234567");
  assert.equal(a.line, b.line);
  // the pick matches the hash of id + rule key
  const expected =
    linesFor("comedy")[hashString("tt1234567:comedy") % linesFor("comedy").length];
  assert.equal(a.line, expected);
});

check("different titles can get different lines for the same rule", () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    seen.add(
      verdict(base({ genres: [{ id: 35, name: "Comedy" }] }), `tt100000${i}`).line
    );
  }
  assert.ok(seen.size > 1, `only one comedy line seen across 30 titles`);
});

check("horror gets a genre line like anything else", () => {
  const v = verdict(base({ genres: [{ id: 27, name: "Horror" }] }), "tt2000001");
  assert.ok(linesFor("horror").includes(v.line));
});

check("horror with comedy still reaches comedy when it matches first", () => {
  const v = verdict(
    base({ genres: [{ id: 27, name: "Horror" }, { id: 35, name: "Comedy" }] }),
    "tt2000002"
  );
  assert.ok(linesFor("comedy").includes(v.line));
});

check("horror verdicts off means no verdict for horror titles", () => {
  const v = verdict(
    base({ genres: [{ id: 27, name: "Horror" }] }),
    "tt2000003",
    { ...DEFAULT_CONFIG, horror: false }
  );
  assert.equal(v.skipped, true);
  assert.equal(v.line, null);
  assert.equal(buildDescription(base({ genres: [{ id: 27, name: "Horror" }], overview: "Spooky." }), "tt2000003", { ...DEFAULT_CONFIG, horror: false }), "Spooky.");
});

check("rom-com keeps Tammy's line in the pool", () => {
  assert.ok(linesFor("romcom").includes("A rom-com. Tammy's already seen it twice."));
  const v = verdict(
    base({ genres: [{ id: 10749, name: "Romance" }, { id: 35, name: "Comedy" }] }),
    "tt3000001"
  );
  assert.ok(linesFor("romcom").includes(v.line));
});

check("romance without comedy keeps the Tammy line in the pool", () => {
  assert.ok(linesFor("romance").includes("Tammy will love this one. You will survive it. Probably."));
  const v = verdict(
    base({ genres: [{ id: 10749, name: "Romance" }, { id: 18, name: "Drama" }] }),
    "tt3000002"
  );
  assert.ok(linesFor("romance").includes(v.line));
});

check("high rating", () => {
  const v = verdict(
    base({ genres: [{ id: 18, name: "Drama" }], vote_average: 9.3, vote_count: 20000 }),
    "tt4000001"
  );
  assert.ok(linesFor("high-rating").includes(v.line));
  assert.equal(v.paws, 5);
});

check("low rating", () => {
  const v = verdict(
    base({ genres: [{ id: 28, name: "Action" }], vote_average: 4.1, vote_count: 300 }),
    "tt4000002"
  );
  assert.ok(linesFor("low-rating").includes(v.line));
  assert.equal(v.paws, 2);
});

check("long runtime gets a runtime line", () => {
  const v = verdict(
    base({ genres: [{ id: 18, name: "Drama" }], vote_average: 7.0, runtime: 185 }),
    "tt5000001"
  );
  assert.ok(linesFor("long-runtime").includes(v.line));
});

check("classic era gets a classic line", () => {
  const v = verdict(
    base({ genres: [{ id: 18, name: "Drama" }], vote_average: 7.0, release_date: "1975-06-20" }),
    "tt5000002"
  );
  assert.ok(linesFor("classic").includes(v.line));
});

check("new release gets a new-release line", () => {
  const v = verdict(
    base({ genres: [{ id: 35, name: "Comedy" }], vote_average: 7.0, release_date: "2026-03-01" }),
    "tt5000003"
  );
  assert.ok(linesFor("new-release").includes(v.line));
});

check("sequel title gets a sequel line", () => {
  const v = verdict(
    base({ genres: [{ id: 28, name: "Action" }], vote_average: 7.0, title: "Big Trouble Part 2" }),
    "tt5000004"
  );
  assert.ok(linesFor("sequel").includes(v.line));
});

check("action", () => {
  const v = verdict(
    base({ genres: [{ id: 28, name: "Action" }], vote_average: 7.1 }),
    "tt6000001"
  );
  assert.ok(linesFor("action").includes(v.line));
});

check("family keeps the Nevaeh line in the pool", () => {
  assert.ok(linesFor("family").includes("One for the whole crew. Even Nevaeh would like this one."));
  const v = verdict(
    base({ genres: [{ id: 10751, name: "Family" }, { id: 16, name: "Animation" }] }),
    "tt6000002"
  );
  assert.ok(linesFor("family").includes(v.line));
});

check("too few votes means no paws", () => {
  const v = verdict(base({ genres: [{ id: 18, name: "Drama" }], vote_count: 5 }), "tt7000001");
  assert.equal(v.paws, null);
});

check("paws off means no paws line", () => {
  const v = verdict(
    base({ genres: [{ id: 18, name: "Drama" }] }),
    "tt7000002",
    { ...DEFAULT_CONFIG, paws: false }
  );
  assert.equal(v.paws, null);
  const d = buildDescription(
    base({ genres: [{ id: 18, name: "Drama" }] }),
    "tt7000002",
    { ...DEFAULT_CONFIG, paws: false }
  );
  assert.ok(!d.includes("paws"));
});

check("tammy style picks tammy lines where they exist", () => {
  const v = verdict(
    base({ genres: [{ id: 10749, name: "Romance" }, { id: 35, name: "Comedy" }] }),
    "tt8000001",
    { ...DEFAULT_CONFIG, style: "tammy" }
  );
  assert.ok(linesFor("romcom", "tammy").includes(v.line));
});

check("tammy style falls back to sarcastic where no tammy lines exist", () => {
  const v = verdict(
    base({ genres: [{ id: 28, name: "Action" }], vote_average: 7.1 }),
    "tt8000002",
    { ...DEFAULT_CONFIG, style: "tammy" }
  );
  assert.ok(linesFor("action").includes(v.line));
});

check("family style picks family lines where they exist", () => {
  const v = verdict(
    base({ genres: [{ id: 10751, name: "Family" }] }),
    "tt8000003",
    { ...DEFAULT_CONFIG, style: "family" }
  );
  assert.ok(linesFor("family", "family").includes(v.line));
});

check("liam mascot changes the label and picks liam lines where they exist", () => {
  const v = verdict(
    base({ genres: [{ id: 10751, name: "Family" }] }),
    "tt8000004",
    { ...DEFAULT_CONFIG, mascot: "liam" }
  );
  assert.equal(v.label, "Liam's Take");
  const liamLines = RULES.find((r) => r.key === "family").mascot.liam;
  assert.ok(liamLines.includes(v.line));
  const d = buildDescription(
    base({ genres: [{ id: 10751, name: "Family" }] }),
    "tt8000004",
    { ...DEFAULT_CONFIG, mascot: "liam" }
  );
  assert.ok(d.startsWith("Liam's Take: "));
  assert.ok(d.includes("Liam rates it"));
});

check("masie mascot changes the label", () => {
  const v = verdict(
    base({ genres: [{ id: 27, name: "Horror" }] }),
    "tt8000005",
    { ...DEFAULT_CONFIG, mascot: "masie" }
  );
  assert.equal(v.label, "Masie's Take");
  const masieLines = RULES.find((r) => r.key === "horror").mascot.masie;
  assert.ok(masieLines.includes(v.line));
});

check("unknown config values fall back to defaults", () => {
  const c = normalizeConfig({ style: "nope", mascot: "yeti", paws: "yes", horror: 1 });
  assert.deepEqual(c, DEFAULT_CONFIG);
});

check("description format: verdict + paws + synopsis", () => {
  const d = buildDescription(
    base({ genres: [{ id: 35, name: "Comedy" }], vote_average: 7.0 }),
    "tt9000001"
  );
  assert.ok(d.startsWith("Hugo's Take: "));
  assert.ok(d.includes("\nHugo rates it 4/5 paws.\n\nA test synopsis."));
  assert.ok(linesFor("comedy").some((l) => d.includes(l)));
});

check("description without overview is just the verdict", () => {
  const d = buildDescription(base({ genres: [], overview: "" }), "tt9000002");
  assert.ok(d.startsWith("Hugo's Take: "));
  assert.ok(d.includes("\nHugo rates it 4/5 paws."));
  assert.ok(!d.includes("A test synopsis."));
});

check("buildHead returns the verdict head only, null when skipped", () => {
  const h = buildHead(base({ genres: [{ id: 35, name: "Comedy" }] }), "tt9000003");
  assert.ok(h.startsWith("Hugo's Take: "));
  assert.ok(!h.includes("A test synopsis."));
  const skipped = buildHead(
    base({ genres: [{ id: 27, name: "Horror" }] }),
    "tt9000004",
    { ...DEFAULT_CONFIG, horror: false }
  );
  assert.equal(skipped, null);
});

check("verdictForCinemeta parses runtime and year from Cinemeta meta", () => {
  const v = verdictForCinemeta(
    {
      id: "tt5000001",
      name: "A Long Classic",
      imdbRating: "7.0",
      runtime: "185 min",
      releaseInfo: "1975",
      genres: ["Drama"],
    },
    "tt5000001"
  );
  assert.ok(linesFor("long-runtime").includes(v.line));
});

console.log(`verdict tests passed (${n})`);
