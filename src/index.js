// Hugo's Take — Stremio meta addon, running on Cloudflare Workers (free tier).
//
// Stremio calls:
//   GET /manifest.json                 -> the addon manifest
//   GET /meta/movie/tt1234567.json    -> { meta: {...} } for a movie
//   GET /meta/series/tt1234567.json   -> { meta: {...} } for a series
//
// How it works: Stremio shows the meta from the addon at the TOP of the
// user's addon list, so a meta addon only gets seen when it sits above
// Cinemeta. This Worker therefore does not compete with Cinemeta — it
// enriches it. For each title it fetches Cinemeta's own meta (free public
// API, no key) and returns the SAME object — same poster, cast, IMDb
// rating, and for series the same episode list — with two additions:
// Hugo's verdict prepended to the description, and a "More Hugo on
// YouTube" link. If Cinemeta has no match, it falls back to TMDB (free
// key, stored as a Worker secret, never in code) and builds the meta
// from there. If both fail, it answers 404 so Stremio just uses the
// other addons' meta. Nothing breaks either way.

import { buildDescription, verdict, verdictForCinemeta } from "./verdict.js";

const TMDB = "https://api.themoviedb.org/3";
const CINEMETA = "https://v3-cinemeta.strem.io";
const IMG = "https://image.tmdb.org/t/p";
const YOUTUBE = "https://www.youtube.com/@MrJparnham";

const MANIFEST = {
  id: "community.hugos-take",
  version: "1.1.0",
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
<p>Install it in Stremio from: <code>/manifest.json</code> — then move it
to the top of your addon list so its meta is the one Stremio shows.</p>
<p>More Hugo on YouTube: <a href="${YOUTUBE}">@MrJparnham</a></p>
</body></html>`;

const YOUTUBE_LINK = {
  name: "More Hugo on YouTube",
  category: "Hugo",
  url: YOUTUBE,
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function tmdb(path, params, key) {
  const url = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  return fetchJson(url.toString());
}

// Enrich a Cinemeta meta object in place: verdict on top of the
// description, YouTube link appended. Everything else is untouched.
function enrichCinemeta(meta) {
  const { line, paws } = verdictForCinemeta(meta);
  const overview = (meta.description || "").trim();
  const head =
    paws === null
      ? `Hugo's Take: ${line}`
      : `Hugo's Take: ${line}\nHugo rates it ${paws}/5 paws.`;
  meta.description = overview ? `${head}\n\n${overview}` : head;
  meta.links = [...(meta.links || []), YOUTUBE_LINK];
  return meta;
}

// Fallback path: build the meta from TMDB (same data Cinemeta uses).
async function metaFromTmdb(type, imdbId, key) {
  const found = await tmdb(
    `/find/${imdbId}`,
    { external_source: "imdb_id" },
    key
  );
  const hits = found
    ? type === "movie"
      ? found.movie_results || []
      : found.tv_results || []
    : [];
  if (!hits.length) return null;
  const details = await tmdb(
    `/${type === "movie" ? "movie" : "tv"}/${hits[0].id}`,
    {},
    key
  );
  if (!details) return null;

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
    links: [YOUTUBE_LINK],
  };
  for (const k of Object.keys(meta)) {
    if (meta[k] === undefined) delete meta[k];
  }
  return meta;
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

    // Primary path: enrich Cinemeta's own meta.
    const cinemeta = await fetchJson(
      `${CINEMETA}/meta/${type}/${imdbId}.json`
    );
    if (cinemeta && cinemeta.meta) {
      return json({ meta: enrichCinemeta(cinemeta.meta) });
    }

    // Fallback: build it from TMDB.
    if (env.TMDB_API_KEY) {
      const meta = await metaFromTmdb(type, imdbId, env.TMDB_API_KEY);
      if (meta) return json({ meta });
    }

    return new Response("{}", { status: 404 });
  },
};
