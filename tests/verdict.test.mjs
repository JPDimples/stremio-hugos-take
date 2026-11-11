// Unit tests for Hugo's verdict engine. Run: node tests/verdict.test.mjs
import assert from "node:assert/strict";
import { verdict, buildDescription } from "../src/verdict.js";

const base = (over) => ({
  genres: [],
  vote_average: 7.0,
  vote_count: 500,
  overview: "A test synopsis.",
  ...over,
});

let n = 0;
const check = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok ${n}. ${name}`);
};

check("horror beats everything", () => {
  const v = verdict(base({ genres: [{ id: 27, name: "Horror" }, { id: 35, name: "Comedy" }] }));
  assert.equal(v.line, "Horror. Hard pass — Tammy's rules apply to me too.");
});

check("rom-com", () => {
  const v = verdict(base({ genres: [{ id: 10749, name: "Romance" }, { id: 35, name: "Comedy" }] }));
  assert.equal(v.line, "A rom-com. Tammy's already seen it twice.");
});

check("romance without comedy", () => {
  const v = verdict(base({ genres: [{ id: 10749, name: "Romance" }, { id: 18, name: "Drama" }] }));
  assert.equal(v.line, "Tammy will love this one. You will survive it. Probably.");
});

check("high rating", () => {
  const v = verdict(base({ genres: [{ id: 18, name: "Drama" }], vote_average: 9.3, vote_count: 20000 }));
  assert.equal(v.line, "Genuinely good. Watch it before someone spoils it for you.");
  assert.equal(v.paws, 5);
});

check("low rating", () => {
  const v = verdict(base({ genres: [{ id: 28, name: "Action" }], vote_average: 4.1, vote_count: 300 }));
  assert.equal(v.line, "Life's too short. Skip it and go for a walk instead.");
  assert.equal(v.paws, 2);
});

check("action", () => {
  const v = verdict(base({ genres: [{ id: 28, name: "Action" }], vote_average: 7.1 }));
  assert.equal(v.line, "Explosions, chases, zero thinking required. Perfect Friday night.");
});

check("family", () => {
  const v = verdict(base({ genres: [{ id: 10751, name: "Family" }, { id: 16, name: "Animation" }] }));
  assert.equal(v.line, "One for the whole crew. Even Nevaeh would like this one.");
});

check("too few votes means no paws", () => {
  const v = verdict(base({ genres: [{ id: 18, name: "Drama" }], vote_count: 5 }));
  assert.equal(v.paws, null);
});

check("description format: verdict + paws + synopsis", () => {
  const d = buildDescription(base({ genres: [{ id: 35, name: "Comedy" }], vote_average: 7.0 }));
  assert.ok(d.startsWith("Hugo's Take: Actually funny. Rare, these days.\nHugo rates it 4/5 paws.\n\nA test synopsis."));
});

check("description without overview is just the verdict", () => {
  const d = buildDescription(base({ genres: [], overview: "" }));
  assert.equal(d, "Hugo's Take: Worth a look. Hugo has spoken.\nHugo rates it 4/5 paws.");
});

console.log(`verdict tests passed (${n})`);
