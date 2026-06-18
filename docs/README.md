# Zetetic

A self-hosted forms builder on Cloudflare. Build a form, theme it, share a clean link, and read back responses, analytics, and an AI written summary. It runs entirely on Cloudflare free tiers.

Live at zetetic.pages.dev, zetetic.katr.es, and forms.katr.es.

## What is in this package

- `deploy/` contains the files that make up the live site. This is what lives in the GitHub repo.
- `src/app.source.html` is the editable source of the app. The deployed `deploy/index.html` is compiled from this file. Do not edit `deploy/index.html` by hand.
- `docs/README.md` is this file.
- `docs/HANDOFF.md` is the full technical state, written so you can hand it to a new chat and continue work without re-explaining anything.

## Updating the live site (all through the web, no terminal)

1. Ask a chat to make the change. It edits `src/app.source.html` and recompiles `deploy/index.html`.
2. On GitHub, open your repo, click Add file then Upload files, drag the new file in, and click Commit. The same filename replaces the old one.
3. Cloudflare Pages redeploys on its own in about a minute. Watch the Deployments tab.
4. Reload the site with a hard refresh, which is Cmd+Shift+R on a Mac or Ctrl+Shift+R on Windows.

## One time setup (already done, recorded here for reference)

- Pages project connected to the GitHub repo. Build settings are Framework None, no build command, output directory `/`.
- A D1 database named `forms`, bound to the project as `DB`. Schema loaded by pasting `deploy/schema.sql` into the D1 Console. The console rejects comments and trailing blank lines, so the SQL must be clean.
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
