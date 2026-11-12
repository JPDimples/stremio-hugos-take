// Hugo's Take — Stremio meta + catalog addon, running on Cloudflare
// Workers (free tier).
//
// Stremio calls (config is optional everywhere — no config means the
// defaults, so old installs keep working exactly as before):
//   GET /manifest.json                       -> the addon manifest
//   GET /meta/movie/tt1234567.json          -> { meta: {...} }
//   GET /meta/series/tt1234567.json         -> { meta: {...} }
//   GET /catalog/movie/hugos-picks.json     -> { metas: [...] }
//   GET /catalog/series/hugos-picks.json    -> { metas: [...] }
//   GET /configure                          -> settings page (HTML form)
//
// Settings (the Stremio way): the addon is configurable. The
// /configure page builds a manifest URL with the chosen config encoded
// as base64url JSON in the first path segment, e.g.
//   https://hugos-take.example.workers.dev/eyJzdHlsZSI6InRhbW15In0/manifest.json
// The same config segment works on /meta/ and /catalog/ calls, and a
// ?config=<base64url> query parameter works too. No config anywhere
// means the defaults: sarcastic deadpan, Hugo, paws on, horror on.
//
// How it works: Stremio shows the meta from the addon at the TOP of
// the user's addon list, so a meta addon only gets seen when it sits
// above Cinemeta. This Worker therefore does not compete with
// Cinemeta — it enriches it. For each title it fetches Cinemeta's own
// meta (free public API, no key) and returns the SAME object — same
// poster, cast, IMDb rating, and for series the same episode list —
// with two additions: the verdict prepended to the description, and a
// "More Hugo on YouTube" link. If Cinemeta has no match, it falls
// back to TMDB (free key, stored as a Worker secret, never in code)
// and builds the meta from there. If both fail, it answers 404 so
// Stremio just uses the other addons' meta. Nothing breaks either way.
//
// The picks shelf ("Hugo's 5-paw picks") is a catalog built from TMDB
// discover: vote average 8.0+, at least 1,000 votes, best first. It
// respects the config — family-safe (or horror off) leaves horror out
// entirely — and every item carries its verdict as its description.
// TMDB responses are cached for a day, so the shelf stays fast and
// free-tier friendly.

import {
  buildDescription,
  buildHead,
  verdictForCinemeta,
  normalizeConfig,
  DEFAULT_CONFIG,
  MASCOT_NAMES,
} from "./verdict.js";

const TMDB = "https://api.themoviedb.org/3";
const CINEMETA = "https://v3-cinemeta.strem.io";
const IMG = "https://image.tmdb.org/t/p";
const YOUTUBE = "https://www.youtube.com/@MrJparnham";
const VERSION = "1.2.0";

function buildManifest(config) {
  return {
    id: "community.hugos-take",
    version: VERSION,
    name: "Hugo's Take",
    description:
      "Hugo the yeti gives his deadpan verdict on every movie and show, right on the detail page. Plus a link to more Hugo on YouTube — and a Hugo's 5-paw picks shelf.",
    logo: "https://raw.githubusercontent.com/JPDimples/stremio-hugos-take/main/logo.png",
    resources: ["meta", "catalog"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [
      { type: "movie", id: "hugos-picks", name: "Hugo's 5-paw picks" },
      { type: "series", id: "hugos-picks", name: "Hugo's 5-paw picks" },
    ],
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}

const YOUTUBE_LINK = {
  name: "More Hugo on YouTube",
  category: "Hugo",
  url: YOUTUBE,
};

function youtubeLinkFor(config) {
  const name = MASCOT_NAMES[config.mascot] || "Hugo";
  return { name: `More ${name} on YouTube`, category: name, url: YOUTUBE };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// ---- config transport -------------------------------------------------

function b64urlEncode(obj) {
  const s = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  try {
    let padded = str.replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4) padded += "=";
    const s = atob(padded);
    return JSON.parse(decodeURIComponent(escape(s)));
  } catch {
    return null;
  }
}

// Pull the config out of the request: a base64url JSON first path
// segment, or a ?config= query parameter. Anything else (or nothing)
// means the defaults.
function configFromUrl(url) {
  const q = url.searchParams.get("config");
  if (q) return normalizeConfig(b64urlDecode(q));
  const seg = url.pathname.split("/").filter(Boolean)[0];
  if (seg && seg !== "manifest.json" && seg !== "meta" && seg !== "catalog" && seg !== "configure") {
    const decoded = b64urlDecode(seg);
    if (decoded && typeof decoded === "object") return normalizeConfig(decoded);
  }
  return { ...DEFAULT_CONFIG };
}

// Strip a leading config segment from a pathname, if one is there.
function stripConfigSegment(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return pathname;
  const first = parts[0];
  if (first === "manifest.json" || first === "meta" || first === "catalog" || first === "configure") {
    return pathname;
  }
  if (b64urlDecode(first) && typeof b64urlDecode(first) === "object") {
    return "/" + parts.slice(1).join("/");
  }
  return pathname;
}

// ---- settings page ----------------------------------------------------

function configurePage(url, config) {
  const c = config;
  const radio = (name, value, label, checked) =>
    `<label><input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}> ${label}</label><br>`;
  const check = (name, label, checked) =>
    `<label><input type="checkbox" name="${name}" value="1"${checked ? " checked" : ""}> ${label}</label><br>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hugo's Take — Settings</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Hugo's Take — Settings</h1>
<p>Pick how Hugo's Take talks to you, then copy the install link it
gives you into Stremio. Your current install keeps working as it is
until you install the new link — nothing here changes it.</p>
<form method="get" action="/configure">
<h2>Verdict style</h2>
${radio("style", "sarcastic", "Sarcastic deadpan (default) — Hugo at his driest", c.style === "sarcastic")}
${radio("style", "tammy", "Tammy mode — verdicts through Tammy's eyes", c.style === "tammy")}
${radio("style", "family", "Family-safe — gentle lines, no edge", c.style === "family")}
<h2>Mascot voice</h2>
${radio("mascot", "hugo", "Hugo (default)", c.mascot === "hugo")}
${radio("mascot", "liam", "Liam — the cheerful orange apprentice", c.mascot === "liam")}
${radio("mascot", "masie", "Masie — the gothic pin-up", c.mascot === "masie")}
<h2>Extras</h2>
${check("paws", "Show the paw rating (1–5 paws)", c.paws)}
${check("horror", "Show verdicts on horror titles", c.horror)}
<p><button type="submit">Get my install link</button></p>
</form>
<p>More Hugo on YouTube: <a href="${YOUTUBE}">@MrJparnham</a></p>
</body></html>`;
}

function configureResultPage(url, config) {
  const encoded = b64urlEncode(config);
  const manifestUrl = `${url.origin}/${encoded}/manifest.json`;
  const stremioUrl = `stremio://${url.host}/${encoded}/manifest.json`;
  const summary = [
    `Style: ${config.style}`,
    `Mascot: ${config.mascot}`,
    `Paw rating: ${config.paws ? "on" : "off"}`,
    `Horror verdicts: ${config.horror ? "on" : "off"}`,
  ].join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hugo's Take — Your install link</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Your Hugo's Take settings are ready</h1>
<p>${summary}</p>
<p><strong>Install link (paste into Stremio → Addons → Add addon):</strong></p>
<p><code style="word-break:break-all">${manifestUrl}</code></p>
<p><a href="${stremioUrl}">Install in Stremio</a> (opens the Stremio app if it is installed)</p>
<p>After installing, drag Hugo's Take to the top of your addon list so
its verdicts are the ones Stremio shows. Your old install keeps
working until you replace it.</p>
<p><a href="/configure">Change the settings</a></p>
</body></html>`;
}

const INFO_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Hugo's Take</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Hugo's Take</h1>
<p>A Stremio meta addon. Hugo the yeti gives his deadpan verdict on every
movie and show, right on the detail page — plus a Hugo's 5-paw picks
shelf on Discover.</p>
<p>Install it in Stremio from: <code>/manifest.json</code> — then move it
to the top of your addon list so its meta is the one Stremio shows.</p>
<p>Settings (verdict style, mascot, paw rating, horror): <a href="/configure">/configure</a></p>
<p>More Hugo on YouTube: <a href="${YOUTUBE}">@MrJparnham</a></p>
</body></html>`;

// ---- data fetching ----------------------------------------------------

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
// When the verdict is skipped (horror off), the description is left
// alone and only the link is added.
function enrichCinemeta(meta, config) {
  const { line, paws, skipped, label } = verdictForCinemeta(
    meta,
    meta.id || "",
    config
  );
  if (!skipped) {
    const overview = (meta.description || "").trim();
    const name = MASCOT_NAMES[config.mascot] || "Hugo";
    const head =
      paws === null
        ? `${label}: ${line}`
        : `${label}: ${line}\n${name} rates it ${paws}/5 paws.`;
    meta.description = overview ? `${head}\n\n${overview}` : head;
  }
  meta.links = [...(meta.links || []), youtubeLinkFor(config)];
  return meta;
}

// Fallback path: build the meta from TMDB (same data Cinemeta uses).
async function metaFromTmdb(type, imdbId, key, config) {
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
    description: buildDescription(details, imdbId, config),
    releaseInfo: (details.release_date || details.first_air_date || "").slice(0, 4),
    runtime: runtime ? `${runtime} min` : undefined,
    genres: (details.genres || []).map((g) => g.name),
    links: [youtubeLinkFor(config)],
  };
  for (const k of Object.keys(meta)) {
    if (meta[k] === undefined) delete meta[k];
  }
  return meta;
}

// Picks shelf: TMDB discover, best rated first. One page of 20.
// Respects the config: family-safe (or horror off) leaves horror out.
async function catalogPicks(type, config, key, skip = 0) {
  const page = Math.floor(skip / 20) + 1;
  const path = type === "movie" ? "/discover/movie" : "/discover/tv";
  const params = {
    sort_by: "vote_average.desc",
    "vote_count.gte": 1000,
    "vote_average.gte": 8.0,
    include_adult: "false",
    page: String(page),
  };
  if (config.style === "family" || !config.horror) {
    params.without_genres = "27";
  }
  const data = await tmdb(path, params, key);
  const results = (data && data.results) || [];
  const metas = [];
  for (const item of results) {
    const tmdbId = item.id;
    const ext = await tmdb(
      `/${type === "movie" ? "movie" : "tv"}/${tmdbId}/external_ids`,
      {},
      key
    );
    const imdbId = ext && ext.imdb_id;
    if (!imdbId) continue;
    const details = {
      genres: (item.genre_ids || []).map((id) => ({ id })),
      vote_average: item.vote_average || 0,
      vote_count: item.vote_count || 0,
      title: item.title || item.name || "",
      release_date: item.release_date || "",
      first_air_date: item.first_air_date || "",
      overview: item.overview || "",
    };
    const head = buildHead(details, imdbId, config);
    if (head === null) continue; // skipped (horror off)
    const meta = {
      id: imdbId,
      type,
      name: details.title,
      poster: item.poster_path ? `${IMG}/w500${item.poster_path}` : undefined,
      background: item.backdrop_path
        ? `${IMG}/w1280${item.backdrop_path}`
        : undefined,
      description: head,
      releaseInfo: (details.release_date || details.first_air_date || "").slice(0, 4),
      imdbRating: details.vote_average
        ? details.vote_average.toFixed(1)
        : undefined,
    };
    for (const k of Object.keys(meta)) {
      if (meta[k] === undefined) delete meta[k];
    }
    metas.push(meta);
  }
  return { metas };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = configFromUrl(url);
    const path = stripConfigSegment(url.pathname);

    if (path === "/manifest.json") return json(buildManifest(config));

    if (path === "/configure") {
      if (url.searchParams.has("style") || url.searchParams.has("mascot")) {
        const picked = normalizeConfig({
          style: url.searchParams.get("style") || undefined,
          mascot: url.searchParams.get("mascot") || undefined,
          paws: url.searchParams.has("paws"),
          horror: url.searchParams.has("horror"),
        });
        return html(configureResultPage(url, picked));
      }
      return html(configurePage(url, config));
    }

    if (path === "/" || path === "/index.html") {
      return html(INFO_HTML);
    }

    const cm = path.match(/^\/catalog\/(movie|series)\/hugos-picks\.json$/);
    if (cm) {
      if (!env.TMDB_API_KEY) return json({ metas: [] });
      const skip = parseInt(url.searchParams.get("skip") || "0", 10) || 0;
      const data = await catalogPicks(cm[1], config, env.TMDB_API_KEY, skip);
      return json(data);
    }

    const m = path.match(/^\/meta\/(movie|series)\/(tt\d+)\.json$/);
    if (!m) return new Response("Not found", { status: 404 });
    const [, type, imdbId] = m;

    // Primary path: enrich Cinemeta's own meta.
    const cinemeta = await fetchJson(
      `${CINEMETA}/meta/${type}/${imdbId}.json`
    );
    if (cinemeta && cinemeta.meta) {
      return json({ meta: enrichCinemeta(cinemeta.meta, config) });
    }

    // Fallback: build it from TMDB.
    if (env.TMDB_API_KEY) {
      const meta = await metaFromTmdb(type, imdbId, env.TMDB_API_KEY, config);
      if (meta) return json({ meta });
    }

    return new Response("{}", { status: 404 });
  },
};
