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
  "movie/tt0076759": {
    meta: {
      id: "tt0076759",
      type: "movie",
      name: "Star Wars",
      description: "Luke Skywalker joins forces with a Jedi Knight.",
      releaseInfo: "1977",
      imdbRating: "8.6",
      runtime: "121 min",
      genres: ["Action", "Adventure", "Fantasy"],
      cast: ["Mark Hamill"],
      links: [],
    },
  },
  "movie/tt0081505": {
    meta: {
      id: "tt0081505",
      type: "movie",
      name: "The Shining",
      description: "A family heads to an isolated hotel for the winter.",
      releaseInfo: "1980",
      imdbRating: "8.4",
      runtime: "146 min",
      genres: ["Horror", "Drama"],
      cast: ["Jack Nicholson"],
      links: [],
    },
  },
};

// Canned TMDB responses (fallback path + catalog), keyed by path.
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
  "/discover/movie": {
    results: [
      {
        id: 278,
        title: "The Shawshank Redemption",
        overview: "Imprisoned in the 1940s...",
        poster_path: "/shaw.jpg",
        backdrop_path: "/shaw-bg.jpg",
        release_date: "1994-09-23",
        vote_average: 9.3,
        vote_count: 28000,
        genre_ids: [18, 80],
      },
      {
        id: 27205,
        title: "Inception",
        overview: "A thief who steals corporate secrets.",
        poster_path: "/incep.jpg",
        backdrop_path: "/incep-bg.jpg",
        release_date: "2010-07-16",
        vote_average: 8.8,
        vote_count: 36000,
        genre_ids: [28, 878],
      },
      {
        id: 999,
        title: "No IMDb Id Here",
        overview: "This one has no external IMDb id.",
        poster_path: "/none.jpg",
        release_date: "2020-01-01",
        vote_average: 9.0,
        vote_count: 5000,
        genre_ids: [18],
      },
    ],
  },
  "/movie/278/external_ids": { imdb_id: "tt0111161" },
  "/movie/27205/external_ids": { imdb_id: "tt1375666" },
  "/movie/999/external_ids": { imdb_id: null },
  "/discover/tv": {
    results: [
      {
        id: 1396,
        name: "Breaking Bad",
        overview: "A chemistry teacher turns to crime.",
        poster_path: "/bb.jpg",
        backdrop_path: "/bb-bg.jpg",
        first_air_date: "2008-01-20",
        vote_average: 9.5,
        vote_count: 14000,
        genre_ids: [80, 18],
      },
    ],
  },
  "/tv/1396/external_ids": { imdb_id: "tt0903747" },
};

globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.hostname === "v3-cinemeta.strem.io") {
    const key = u.pathname.replace("/meta/", "").replace(".json", "");
    const data = CINEMETA[key];
    // Fresh copy every time: the Worker mutates the meta in place,
    // and sharing one object across tests would leak verdicts.
    const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
    return { ok: copy !== undefined, status: copy !== undefined ? 200 : 404, json: async () => copy };
  }
  if (u.hostname === "api.themoviedb.org") {
    const data = TMDB[u.pathname.replace("/3", "")];
    const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
    return { ok: copy !== undefined, status: copy !== undefined ? 200 : 404, json: async () => copy };
  }
  return { ok: false, status: 404, json: async () => null };
};

const env = { TMDB_API_KEY: "test-key" };
const call = (path) => worker.fetch(new Request(`https://hugos-take.test${path}`), env);

// base64url of {"style":"tammy","mascot":"liam","paws":false,"horror":true}
const TAMMY_LIAM_B64 = Buffer.from(
  JSON.stringify({ style: "tammy", mascot: "liam", paws: false, horror: true })
).toString("base64url");

let n = 0;
const check = async (name, fn) => {
  await fn();
  n += 1;
  console.log(`  ok ${n}. ${name}`);
};

await check("manifest serves v1.2.0, configurable, meta + catalog", async () => {
  const res = await call("/manifest.json");
  const m = await res.json();
  assert.equal(m.id, "community.hugos-take");
  assert.equal(m.version, "1.2.0");
  assert.deepEqual(m.resources, ["meta", "catalog"]);
  assert.deepEqual(m.behaviorHints, { configurable: true, configurationRequired: false });
  assert.deepEqual(m.catalogs, [
    { type: "movie", id: "hugos-picks", name: "Hugo's 5-paw picks" },
    { type: "series", id: "hugos-picks", name: "Hugo's 5-paw picks" },
  ]);
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
  assert.ok(meta.description.startsWith("Hugo's Take: "));
  assert.ok(meta.description.includes("Hugo rates it 5/5 paws."));
  assert.ok(meta.description.includes("Imprisoned in the 1940s"));
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
  assert.ok(meta.description.startsWith("Hugo's Take: "));
});

await check("rom-com verdict from Cinemeta genres", async () => {
  const res = await call("/meta/movie/tt0098635.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.ok(meta.description.startsWith("Hugo's Take: "));
  assert.ok(meta.description.includes("Hugo rates it 4/5 paws."));
});

await check("Cinemeta miss falls back to TMDB", async () => {
  const res = await call("/meta/movie/tt0133093.json");
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.equal(meta.name, "The Matrix");
  assert.ok(meta.description.startsWith("Hugo's Take: "));
});

await check("unknown in both returns 404 so other addons' meta stands", async () => {
  const res = await call("/meta/movie/tt9999999.json");
  assert.equal(res.status, 404);
});

await check("bad path returns 404", async () => {
  const res = await call("/catalog/movie/top.json");
  assert.equal(res.status, 404);
});

await check("configure page serves the settings form", async () => {
  const res = await call("/configure");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes("Verdict style"));
  assert.ok(text.includes("Mascot voice"));
  assert.ok(text.includes("Sarcastic deadpan"));
  assert.ok(text.includes("Tammy mode"));
  assert.ok(text.includes("Family-safe"));
  assert.ok(text.includes("Show the paw rating"));
  assert.ok(text.includes("Show verdicts on horror titles"));
});

await check("configure with choices returns an install link with the config", async () => {
  const res = await call("/configure?style=tammy&mascot=liam&horror=1");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes("Style: tammy"));
  assert.ok(text.includes("Mascot: liam"));
  assert.ok(text.includes("Paw rating: off"));
  assert.ok(text.includes("Horror verdicts: on"));
  assert.ok(text.includes("/manifest.json"));
  assert.ok(text.includes("stremio://"));
});

await check("config in the manifest URL changes the meta verdict", async () => {
  const res = await call(`/${TAMMY_LIAM_B64}/meta/movie/tt0098635.json`);
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.ok(meta.description.startsWith("Liam's Take: "));
  assert.ok(!meta.description.includes("paws"));
  assert.deepEqual(meta.links, [
    { name: "More Liam on YouTube", category: "Liam", url: "https://www.youtube.com/@MrJparnham" },
  ]);
});

await check("config in the manifest URL is honoured by the manifest itself", async () => {
  const res = await call(`/${TAMMY_LIAM_B64}/manifest.json`);
  assert.equal(res.status, 200);
  const m = await res.json();
  assert.equal(m.id, "community.hugos-take");
  assert.equal(m.version, "1.2.0");
});

await check("horror verdicts off leaves a horror description untouched", async () => {
  const horrorOffB64 = Buffer.from(
    JSON.stringify({ style: "sarcastic", mascot: "hugo", paws: true, horror: false })
  ).toString("base64url");
  const res = await call(`/${horrorOffB64}/meta/movie/tt0081505.json`);
  assert.equal(res.status, 200);
  const { meta } = await res.json();
  assert.equal(meta.description, "A family heads to an isolated hotel for the winter.");
  assert.ok(meta.links.some((l) => l.name === "More Hugo on YouTube"));
});

await check("picks shelf for movies returns top-rated titles with verdicts", async () => {
  const res = await call("/catalog/movie/hugos-picks.json");
  assert.equal(res.status, 200);
  const { metas } = await res.json();
  // 3 discover results, one has no IMDb id and is dropped
  assert.equal(metas.length, 2);
  assert.equal(metas[0].id, "tt0111161");
  assert.equal(metas[0].name, "The Shawshank Redemption");
  assert.ok(metas[0].description.startsWith("Hugo's Take: "));
  assert.ok(metas[0].description.includes("Hugo rates it 5/5 paws."));
  assert.equal(metas[1].id, "tt1375666");
  assert.equal(metas[1].name, "Inception");
});

await check("picks shelf for series works too", async () => {
  const res = await call("/catalog/series/hugos-picks.json");
  assert.equal(res.status, 200);
  const { metas } = await res.json();
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt0903747");
  assert.equal(metas[0].name, "Breaking Bad");
  assert.ok(metas[0].description.startsWith("Hugo's Take: "));
});

await check("picks shelf with family-safe config still serves", async () => {
  const familyB64 = Buffer.from(
    JSON.stringify({ style: "family", mascot: "hugo", paws: true, horror: false })
  ).toString("base64url");
  const res = await call(`/${familyB64}/catalog/movie/hugos-picks.json`);
  assert.equal(res.status, 200);
  const { metas } = await res.json();
  assert.equal(metas.length, 2);
  assert.ok(metas[0].description.startsWith("Hugo's Take: "));
});

await check("catalog without a TMDB key returns an empty shelf, not an error", async () => {
  const res = await worker.fetch(
    new Request("https://hugos-take.test/catalog/movie/hugos-picks.json"),
    {}
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { metas: [] });
});

console.log(`handler tests passed (${n})`);
