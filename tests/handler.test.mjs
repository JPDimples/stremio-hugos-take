// Handler tests for the Worker — the network is fully mocked, so no
// TMDB key or Cloudflare account is needed. Run: node tests/handler.test.mjs
import assert from "node:assert/strict";
import worker from "../src/index.js";

// Canned TMDB responses, keyed by path.
const TMDB = {
  "/find/tt0111161": {
    movie_results: [{ id: 278 }],
    tv_results: [],
  },
  "/movie/278": {
    id: 278,
    title: "The Shawshank Redemption",
    overview: "Imprisoned in the 1940s for the double murder of his wife and her lover.",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "1994-09-23",
    runtime: 142,
    vote_average: 8.7,
    vote_count: 26000,
    genres: [{ id: 18, name: "Drama" }, { id: 80, name: "Crime" }],
  },
  "/find/tt0903747": {
    movie_results: [],
    tv_results: [{ id: 1396 }],
  },
  "/tv/1396": {
    id: 1396,
    name: "Breaking Bad",
    overview: "A chemistry teacher turns to cooking crystal meth.",
    poster_path: "/bb.jpg",
    backdrop_path: "/bb-bg.jpg",
    first_air_date: "2008-01-20",
    episode_run_time: [49],
    vote_average: 9.5,
    vote_count: 14000,
    genres: [{ id: 18, name: "Drama" }, { id: 80, name: "Crime" }],
  },
  "/find/tt9999999": { movie_results: [], tv_results: [] },
};

globalThis.fetch = async (url) => {
  const u = new URL(url);
  const data = TMDB[u.pathname.replace("/3", "")];
  return {
    ok: data !== undefined,
    status: data !== undefined ? 200 : 404,
    json: async () => data,
  };
};

const env = { TMDB_API_KEY: "test-key" };
const call = (path) => worker.fetch(new Request(`https://hugos-take.test${path}`), env);

let n = 0;
const check = async (name, fn) => {
  await fn();
  n += 1;
  console.log(`  ok ${n}. ${name}`);
};

await check("manifest serves the addon manifest", async () => {
  const res = await call("/manifest.json");
  const m = await res.json();
  assert.equal(m.id, "community.hugos-take");
  assert.deepEqual(m.resources, ["meta"]);
  assert.deepEqual(m.types, ["movie", "series"]);
});

await check("movie meta: verdict + paws + synopsis", async () => {
  const res = await call("/meta/movie/tt0111161.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.equal(meta.id, "tt0111161");
  assert.equal(meta.type, "movie");
  assert.equal(meta.name, "The Shawshank Redemption");
  assert.equal(meta.runtime, "142 min");
  assert.equal(meta.releaseInfo, "1994");
  assert.ok(meta.description.startsWith(
    "Hugo's Take: Genuinely good. Watch it before someone spoils it for you.\nHugo rates it 4/5 paws.\n\nImprisoned in the 1940s"
  ));
  assert.deepEqual(meta.links, [
    { name: "More Hugo on YouTube", category: "Hugo", url: "https://www.youtube.com/@MrJparnham" },
  ]);
});

await check("series meta: verdict, no poster crash", async () => {
  const res = await call("/meta/series/tt0903747.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.equal(meta.type, "series");
  assert.equal(meta.name, "Breaking Bad");
  assert.equal(meta.runtime, "49 min");
  assert.ok(meta.description.startsWith("Hugo's Take: Genuinely good."));
});

await check("unknown title returns 404 so other addons' meta stands", async () => {
  const res = await call("/meta/movie/tt9999999.json");
  assert.equal(res.status, 404);
});

await check("bad path returns 404", async () => {
  const res = await call("/catalog/movie/top.json");
  assert.equal(res.status, 404);
});

console.log(`handler tests passed (${n})`);
