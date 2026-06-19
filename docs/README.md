# zetetiq

A self-hosted forms builder on Cloudflare. Build a form, theme it, share a clean link, and read back responses, analytics, and an AI written summary. It runs entirely on Cloudflare free tiers.

The product is named zetetiq, all lowercase. It is live at zetetiq.pages.dev, zetetiq.katr.es, and forms.katr.es. The Pages project and those domains keep the older zetetiq spelling with a c, which is fine and separate from the app name.

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
- Custom domains zetetiq.katr.es and forms.katr.es added to the project.
- There is intentionally no `wrangler.toml`. With Git based deploys it would override the dashboard settings and cause conflicts, so all configuration lives in the dashboard.

## Logging in

Open the site, click Admin login, and enter your `ADMIN_PASSWORD`. Google sign in is not wired yet, so admin is the only account for now.

## How the AI summaries stay free

Workers AI gives 10,000 neurons per day at no cost. Summaries are cached and only regenerate when the underlying responses change, so normal use stays well inside the free tier. Each summary has a Refresh button to force an update. If the AI binding is ever missing or a call fails, the summary falls back to plain counts instead of breaking. The full explanation is in `docs/HANDOFF.md`.

## What works now

The builder is laid out like a survey editor: pick a question to edit its settings in the left panel, and type the question and its choices directly on the page in the center. Preview shows the live form, and Publish saves it.


Admin login, the dashboard, the form builder with live preview and theming (three colors and a font), pretty share links, response collection with automatic location and device capture, per form responses and analytics, CSV export, open and close, edit, delete, and AI summaries on both the dashboard and every form. Question types in this phase are Multiple Choice, Text Entry, Text and Graphic, Slider, and NPS. The roadmap for what comes next is in `docs/HANDOFF.md`.


## Google sign in setup

The "Continue with Google" button uses the OAuth 2.0 code flow. Until you set two secrets it stays inactive and shows "Google sign in is not set up yet." To turn it on:

1. In Google Cloud Console, create an OAuth client: APIs and Services, Credentials, Create credentials, OAuth client ID, Application type Web application.
2. Under Authorized redirect URIs, add one entry per domain you use, each ending in /api/auth/google/callback:
   - https://zetetiq.pages.dev/api/auth/google/callback
   - https://zetetiq.katr.es/api/auth/google/callback
   - https://forms.katr.es/api/auth/google/callback
3. Configure the OAuth consent screen (External). While it is in Testing, add yourself and any early users under Test users, or publish the app.
4. Copy the Client ID and Client secret.
5. In the Cloudflare Pages project, Settings, Variables and secrets, add two secrets for Production: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Add them to Preview too if you use preview deploys.
6. Redeploy. New people who sign in with Google get their own account and their own forms. Admin login with the password still works alongside it.

The users table already has a google_id column (see schema.sql). If your live D1 predates it, run: ALTER TABLE users ADD COLUMN google_id TEXT;

## Export report

On the Responses tab, next to Download CSV, Export report builds a themed one-page PDF: a header in the form's primary color, total responses, an aggregate per question (most and least selected, ranked-choice final order, averages, distributions), and a short audience section. It loads a small PDF library from a CDN the first time it runs.

## Logo and favicon

A recolorable inline-SVG Logo component stands in for the wordmark everywhere it appears (top nav, builder, the splash, the loading screen, and the public form footer), and a placeholder SVG favicon is set in the document head. The Logo uses currentColor, so it takes the color of wherever it sits. To drop in the real artwork, replace the body of the Logo component in the source with the provided SVG and swap the favicon href in the head. Keep currentColor on the paths you want to recolor.

## Logo, favicon, fonts, and after-submission options

The provided logo and favicon are built in. The logo recolors via currentColor and is stored in one place (the LOGO_SVG constant in the source); the favicon is set in the page head. Form font choices read Sans (default, Figtree), Serif, Monospace, Slab, and zetetiq (the Mozilla font) without showing the underlying font names. In the builder Theme panel you can upload a header image (shown at the top of the form, downscaled and stored with the form). In Form settings, After submission lets you set the thank-you heading, message, and an optional button, in addition to the redirect URL. The public footer reads built by zetetiq and links to zetetiq.pages.dev; change that link if your live domain differs.

## Latest additions

This build adds conditional display logic, a one-question-at-a-time conversational mode, hidden fields that capture URL values, automatic UTM and time-to-complete capture, an outbound webhook that posts a clean JSON payload on each submission, and starter templates for new forms. It also themes the PDF report with the form colors, fonts, and logo, adds a Copy link button and a live theme preview in the editor, shows powered by zetetiq on the thank-you screen, enlarges the navbar logo, and gives the favicon a high-contrast background. Export buttons appear in both the Responses and Analytics tabs.

## Response intelligence

Adaptive follow-up questions (a per-question toggle that asks one clarifying question based on a text answer and saves it with the response), an open-text Tone read in the Analytics tab, and the existing Overview summary. These use the Workers AI binding and are shown with plain names, never labeled AI. They need the AI binding on the Pages project and degrade gracefully when it is absent.

## Signature

The Signature question type lets people sign with a finger or mouse. Signatures are saved with the response as an image and need no external storage. They appear as an image in the response detail, as [signature] in CSV and webhook output, and are counted in the report.

## Availability and limits

In a form's settings you can set a response limit (a cap on total responses) and optional open and close date-times. The form stops accepting responses when the cap is reached or after the close time, and shows respondents a message explaining why. This is enforced on the server, so it holds even against direct posts.

## Report fonts and theme presets

The PDF report matches the form font (Figtree, Roboto Slab, or Mozilla Text), not only the colors, by embedding the real font at export time with a safe fallback. The theme panel also has one-click presets that set the palette and font together.

## Dark mode, navigation, and templates

A light/dark toggle in the top bar defaults to the visitor's system setting and is remembered per browser; the public form always stays light. The top bar spans the full width with the logo at the far left, a large New form button in the center, and account actions at the right. The dashboard shows one-click starter templates when the user has fewer than ten forms.
