// Hugo's Take — Stremio meta addon, running on Cloudflare Workers (free tier).
//
// Stremio calls:
//   GET /manifest.json                 -> the addon manifest
//   GET /meta/movie/tt1234567.json    -> { meta: {...} } for a movie
//   GET /meta/series/tt1234567.json   -> { meta: {...} } for a series
//
// For each title the Worker resolves the IMDb id through TMDB (free key,
// stored as a Worker secret, never in code), fetches the details, and
// returns a meta object whose description starts with Hugo's verdict.
// The core fields (name, poster, description, runtime, genres) come from
// the same TMDB data Cinemeta uses, so the detail page looks the same —
// plus Hugo's line on top. If TMDB has no match or the fetch fails, the
// Worker answers 404 so Stremio just uses the other addons' meta.

import { buildDescription } from "./verdict.js";

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const YOUTUBE = "https://www.youtube.com/@MrJparnham";

const MANIFEST = {
  id: "community.hugos-take",
  version: "1.0.0",
  name: "Hugo's Take",
  description:
    "Hugo the yeti gives his deadpan verdict on every movie and show, right on the detail page. Plus a link to more Hugo on YouTube.",
  logo: "https://raw.githubusercontent.com/JPDimples/stremio-hugos-take/main/logo.png",
  resources: ["meta"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: { configurable: false, configurationRequired: false },
};

const INFO_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Hugo's Take</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Hugo's Take</h1>
<p>A Stremio meta addon. Hugo the yeti gives his deadpan verdict on every
movie and show, right on the detail page.</p>
<p>Install it in Stremio from: <code>/manifest.json</code></p>
<p>More Hugo on YouTube: <a href="${YOUTUBE}">@MrJparnham</a></p>
</body></html>`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

async function tmdb(path, params, key) {
  const url = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  const res = await fetch(url.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!res.ok) return null;
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/manifest.json") return json(MANIFEST);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(INFO_HTML, {
        headers: { "content-type": "text/html" },
      });
    }

    const m = url.pathname.match(/^\/meta\/(movie|series)\/(tt\d+)\.json$/);
    if (!m) return new Response("Not found", { status: 404 });
    const [, type, imdbId] = m;
    if (!env.TMDB_API_KEY) return new Response("{}", { status: 500 });

    const found = await tmdb(
      `/find/${imdbId}`,
      { external_source: "imdb_id" },
      env.TMDB_API_KEY
    );
    const hits = found
      ? type === "movie"
        ? found.movie_results || []
        : found.tv_results || []
      : [];
    if (!hits.length) return new Response("{}", { status: 404 });

    const details = await tmdb(
      `/${type === "movie" ? "movie" : "tv"}/${hits[0].id}`,
      {},
      env.TMDB_API_KEY
    );
    if (!details) return new Response("{}", { status: 404 });

    const runtime =
      details.runtime ||
      (details.episode_run_time && details.episode_run_time[0]) ||
      null;

    const meta = {
      id: imdbId,
      type,
      name: details.title || details.name,
      poster: details.poster_path
        ? `${IMG}/w500${details.poster_path}`
        : undefined,
      background: details.backdrop_path
        ? `${IMG}/w1280${details.backdrop_path}`
        : undefined,
      description: buildDescription(details),
      releaseInfo: (details.release_date || details.first_air_date || "").slice(0, 4),
      runtime: runtime ? `${runtime} min` : undefined,
      genres: (details.genres || []).map((g) => g.name),
      links: [
        {
          name: "More Hugo on YouTube",
          category: "Hugo",
          url: YOUTUBE,
        },
      ],
    };
    for (const k of Object.keys(meta)) {
      if (meta[k] === undefined) delete meta[k];
    }
    return json({ meta });
  },
};
