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
- **Stremio shows the meta from the addon at the top of your addon
  list**, so a meta addon only gets seen when it sits above Cinemeta.
  This Worker therefore does not compete with Cinemeta — it enriches
  it. For each title it fetches Cinemeta's own meta (free public API,
  no key) and returns the SAME object — same poster, cast, IMDb rating,
  and for series the same episode list — with two additions: Hugo's
  verdict prepended to the description, and a "More Hugo on YouTube"
  link. **After installing, drag Hugo's Take to the top of your addon
  list in Stremio** (Addons page) so its meta is the one Stremio shows.
- The verdict comes from a rule bank (`src/verdict.js`): horror,
  rom-com, romance, high/low ratings, action, comedy, drama,
  documentary, crime, thriller, sci-fi, family, animation, fantasy,
  mystery — first match wins. The paw rating (1–5) comes from the
  IMDb rating. If Cinemeta has no match, the Worker falls back to TMDB
  (free key, stored as a Worker secret — never in code) and builds the
  meta from there.
- If both sources fail, the Worker answers 404, so Stremio just uses
  the other addons' meta. Nothing breaks either way.

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
