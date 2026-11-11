# Hugo's Take — Stremio meta addon

A Stremio **meta** addon: Hugo the yeti gives his deadpan verdict on every
movie and show, right on the detail page. No catalogs — this one adds to
what's already there.

When you open a title, the detail page's description starts with:

    Hugo's Take: Tammy will love this one. You will survive it. Probably.
    Hugo rates it 4/5 paws.

    <the normal synopsis>

Plus one link in the detail page's Links section: "More Hugo on YouTube".

## How it works

- The addon runs as a Cloudflare Worker (free tier). Stremio calls
  `/meta/movie/tt1234567.json` or `/meta/series/tt1234567.json`.
- The Worker resolves the IMDb id through TMDB (free key, stored as a
  Worker secret — never in code), fetches the title's details, and picks
  Hugo's verdict from a rule bank (`src/verdict.js`): horror, rom-com,
  romance, high/low ratings, action, comedy, drama, documentary, crime,
  thriller, sci-fi, family, animation, fantasy, mystery — first match wins.
- The paw rating (1–5) comes from TMDB's vote average, only when at least
  20 people have voted.
- The name, poster, runtime and genres come from the same TMDB data
  Cinemeta uses, so the detail page looks the same — plus Hugo's line.
- If TMDB has no match or the fetch fails, the Worker answers 404, so
  Stremio just uses the other addons' meta. Nothing breaks.

## Deploy (repo owner)

Needs a free Cloudflare account (no card for the free tier) and a free
TMDB API key (the same key used for the catalog addons).

1. `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN` — a token with the
   "Edit Cloudflare Workers" template).
2. `npx wrangler secret put TMDB_API_KEY` and paste the key.
3. `npx wrangler deploy` — note the URL it prints, e.g.
   `https://hugos-take.<your-subdomain>.workers.dev`.

## Install in Stremio

Paste the Worker URL + `/manifest.json` into Stremio → Addons → Add addon:

    https://hugos-take.<your-subdomain>.workers.dev/manifest.json

## Test

    npm test

Runs the verdict unit tests and the handler tests (the network is mocked,
so no key or Cloudflare account is needed for tests). To try it live
locally: put the key in `.dev.vars` as `TMDB_API_KEY=...` (git-ignored)
and run `npx wrangler dev`, then open
`http://localhost:8787/meta/movie/tt0111161.json`.
