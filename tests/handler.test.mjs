// Handler tests for the Worker — the network is fully mocked, so no
// TMDB key or Cloudflare account is needed. Run: node tests/handler.test.mjs
import assert from "node:assert/strict";
import worker from "../src/index.js";

// Canned Cinemeta responses, keyed by "type/id".
const CINEMETA = {
  "movie/tt0111161": {
    meta: {
      id: "tt0111161",
      type: "movie",
      name: "The Shawshank Redemption",
      poster: "https://images.metahub.space/poster/medium/tt0111161/img",
      background: "https://images.metahub.space/background/medium/tt0111161/img",
      description:
        "Imprisoned in the 1940s for the double murder of his wife and her lover, upstanding banker Andy Dufresne begins a new life at the Shawshank prison.",
      releaseInfo: "1994",
      imdbRating: "9.3",
      runtime: "142 min",
      genres: ["Drama", "Crime"],
      cast: ["Tim Robbins", "Morgan Freeman"],
      director: ["Frank Darabont"],
      links: [],
    },
  },
  "series/tt0903747": {
    meta: {
      id: "tt0903747",
      type: "series",
      name: "Breaking Bad",
      poster: "https://images.metahub.space/poster/medium/tt0903747/img",
      description:
        "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.",
      releaseInfo: "2008-2013",
      imdbRating: "9.5",
      runtime: "49 min",
      genres: ["Crime", "Drama", "Thriller"],
      cast: ["Bryan Cranston", "Aaron Paul"],
      links: [],
      videos: [
        {
          id: "tt0903747:1:1",
          title: "Pilot",
          season: 1,
          episode: 1,
          released: "2008-01-20T00:00:00.000Z",
          overview: "Walter White turns to crime.",
        },
        {
          id: "tt0903747:1:2",
          title: "Cat's in the Bag...",
          season: 1,
          episode: 2,
          released: "2008-01-27T00:00:00.000Z",
        },
      ],
    },
  },
  "movie/tt0098635": {
    meta: {
      id: "tt0098635",
      type: "movie",
      name: "When Harry Met Sally...",
      description:
        "During the 12 years between their first meeting and ultimately getting married, Harry and Sally develop an unusual relationship.",
      releaseInfo: "1989",
      imdbRating: "7.7",
      runtime: "96 min",
      genres: ["Comedy", "Drama", "Romance"],
      cast: ["Billy Crystal", "Meg Ryan"],
      links: [],
    },
  },
};

// Canned TMDB responses (fallback path), keyed by path.
const TMDB = {
  "/find/tt0133093": {
    movie_results: [{ id: 603 }],
    tv_results: [],
  },
  "/movie/603": {
    id: 603,
    title: "The Matrix",
    overview: "A hacker learns the truth about his reality.",
    poster_path: "/matrix.jpg",
    backdrop_path: "/matrix-bg.jpg",
    release_date: "1999-03-31",
    runtime: 136,
    vote_average: 8.7,
    vote_count: 26000,
    genres: [{ id: 28, name: "Action" }, { id: 878, name: "Science Fiction" }],
  },
  "/find/tt9999999": { movie_results: [], tv_results: [] },
};

globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.hostname === "v3-cinemeta.strem.io") {
    const key = u.pathname.replace("/meta/", "").replace(".json", "");
    const data = CINEMETA[key];
    return { ok: data !== undefined, status: data !== undefined ? 200 : 404, json: async () => data };
  }
  if (u.hostname === "api.themoviedb.org") {
    const data = TMDB[u.pathname.replace("/3", "")];
    return { ok: data !== undefined, status: data !== undefined ? 200 : 404, json: async () => data };
  }
  return { ok: false, status: 404, json: async () => null };
};

const env = { TMDB_API_KEY: "test-key" };
const call = (path) => worker.fetch(new Request(`https://hugos-take.test${path}`), env);

let n = 0;
const check = async (name, fn) => {
  await fn();
  n += 1;
  console.log(`  ok ${n}. ${name}`);
};

await check("manifest serves v1.1.1", async () => {
  const res = await call("/manifest.json");
  const m = await res.json();
  assert.equal(m.id, "community.hugos-take");
  assert.equal(m.version, "1.1.1");
  assert.deepEqual(m.resources, ["meta"]);
});

await check("movie meta enriches Cinemeta: verdict + paws, everything else kept", async () => {
  const res = await call("/meta/movie/tt0111161.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.equal(meta.id, "tt0111161");
  assert.equal(meta.name, "The Shawshank Redemption");
  assert.equal(meta.imdbRating, "9.3");
  assert.equal(meta.runtime, "142 min");
  assert.deepEqual(meta.cast, ["Tim Robbins", "Morgan Freeman"]);
  assert.ok(meta.description.startsWith(
    "Hugo's Take: Genuinely good. Watch it before someone spoils it for you.\nHugo rates it 5/5 paws.\n\nImprisoned in the 1940s"
  ));
  assert.deepEqual(meta.links, [
    { name: "More Hugo on YouTube", category: "Hugo", url: "https://www.youtube.com/@MrJparnham" },
  ]);
});

await check("series meta keeps the episode list", async () => {
  const res = await call("/meta/series/tt0903747.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.equal(meta.name, "Breaking Bad");
  assert.equal(meta.videos.length, 2);
  assert.equal(meta.videos[0].id, "tt0903747:1:1");
  assert.equal(meta.videos[0].title, "Pilot");
  assert.ok(meta.description.startsWith("Hugo's Take: Genuinely good."));
});

await check("rom-com verdict from Cinemeta genres", async () => {
  const res = await call("/meta/movie/tt0098635.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.ok(meta.description.startsWith(
    "Hugo's Take: A rom-com. Tammy's already seen it twice.\nHugo rates it 4/5 paws."
  ));
});

await check("Cinemeta miss falls back to TMDB", async () => {
  const res = await call("/meta/movie/tt0133093.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.equal(meta.name, "The Matrix");
  assert.ok(meta.description.startsWith("Hugo's Take: Genuinely good."));
});

await check("unknown in both returns 404 so other addons' meta stands", async () => {
  const res = await call("/meta/movie/tt9999999.json");
  assert.equal(res.status, 404);
});

await check("bad path returns 404", async () => {
  const res = await call("/catalog/movie/top.json");
  assert.equal(res.status, 404);
});

console.log(`handler tests passed (${n})`);
