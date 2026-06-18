# zetetiq

A self-hosted forms builder on Cloudflare. Build a form, theme it, share a clean link, and read back responses, analytics, and an AI written summary. It runs entirely on Cloudflare free tiers.

The product is named zetetiq, all lowercase. It is live at zetetic.pages.dev, zetetic.katr.es, and forms.katr.es. The Pages project and those domains keep the older zetetic spelling with a c, which is fine and separate from the app name.

The page loads React from a primary CDN with an automatic fallback to a second one, and if startup ever fails it shows a readable message in the page instead of a blank screen.

## What is in this package

The files the live site needs are at the top level, so they go straight into the root of your GitHub repo:

- `index.html`, the app, already compiled and ready to upload.
- `functions/api/[[path]].js`, the backend.
- `_routes.json` and `_redirects`, routing config.
- `schema.sql`, the database schema, kept for reference. It is already loaded into D1.

Two folders hold things the site does not strictly need:

- `src/app.source.html`, the editable source. The `index.html` above is compiled from this. Do not edit `index.html` by hand.
- `docs/`, this README and `HANDOFF.md`, the document you hand to a new chat to continue work.

## Putting this in your repo, a clean start

You cleared the repo, so start fresh.

1. Unzip this on your computer.
2. On GitHub, open your repo, click Add file then Upload files.
3. Drag in everything inside the zetetiq folder at once: `index.html`, the `functions` folder, `_routes.json`, `_redirects`, `schema.sql`, and the `src` and `docs` folders. The one thing that matters is that `index.html` lands at the top level of the repo, not inside a subfolder.
4. Commit.
5. Cloudflare Pages redeploys on its own. Watch the Deployments tab for Success, then hard refresh the site. The browser tab should now read zetetiq, which is how you know the new file is live.

Your Cloudflare settings, the database, the bindings, the secrets, and the domains, all live in the dashboard, not the repo, so they are untouched and you do not need to redo them.

## Updating the live site (all through the web, no terminal)

1. Ask a chat to make the change. It edits `src/app.source.html` and recompiles `index.html`.
2. On GitHub, open your repo, click Add file then Upload files, drag the new file in, and click Commit. The same filename replaces the old one.
3. Cloudflare Pages redeploys on its own in about a minute. Watch the Deployments tab.
4. Reload the site with a hard refresh, which is Cmd+Shift+R on a Mac or Ctrl+Shift+R on Windows.

## One time setup (already done, recorded here for reference)

- Pages project connected to the GitHub repo. Build settings are Framework None, no build command, output directory `/`.
- A D1 database named `forms`, bound to the project as `DB`. Schema loaded by pasting `schema.sql` into the D1 Console. The console rejects comments and trailing blank lines, so the SQL must be clean.
- Workers AI bound to the project as `AI`.
- Encrypted environment variables: `SESSION_SECRET` (a long random string) and `ADMIN_PASSWORD` (your admin password). Optional `AI_MODEL`.
- Custom domains zetetic.katr.es and forms.katr.es added to the project.
- There is intentionally no `wrangler.toml`. With Git based deploys it would override the dashboard settings and cause conflicts, so all configuration lives in the dashboard.

## Logging in

Open the site, click Admin login, and enter your `ADMIN_PASSWORD`. Google sign in is not wired yet, so admin is the only account for now.

## How the AI summaries stay free

Workers AI gives 10,000 neurons per day at no cost. Summaries are cached and only regenerate when the underlying responses change, so normal use stays well inside the free tier. Each summary has a Refresh button to force an update. If the AI binding is ever missing or a call fails, the summary falls back to plain counts instead of breaking. The full explanation is in `docs/HANDOFF.md`.

## What works now

Admin login, the dashboard, the form builder with live preview and theming (three colors and a font), pretty share links, response collection with automatic location and device capture, per form responses and analytics, CSV export, open and close, edit, delete, and AI summaries on both the dashboard and every form. Question types in this phase are Multiple Choice, Text Entry, Text and Graphic, Slider, and NPS. The roadmap for what comes next is in `docs/HANDOFF.md`.
