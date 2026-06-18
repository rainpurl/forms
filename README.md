# forms.katr.es

A self-hosted forms builder. Build a form, theme it, share a clean link, and read back responses, analytics, and an AI written summary. Everything runs on Cloudflare's free tiers.

## What this is

A single project that deploys to Cloudflare Pages with no build step:

- `index.html`: the entire app, a single file React build loaded from a CDN. No bundler, no `npm run build`.
- `functions/api/[[path]].js`: one catch-all Pages Function that serves every `/api/*` route.
- `schema.sql`: the D1 (SQLite) database schema.
- `_routes.json` and `_redirects`: route the API and the single page app correctly.
- `wrangler.toml`: local config and binding names.

## Architecture

| Concern | Service | Free tier headroom |
| --- | --- | --- |
| Static hosting | Cloudflare Pages | Unlimited requests |
| API | Pages Functions | 100,000 requests/day |
| Database | Cloudflare D1 | 5 GB, 5M reads/day, 100K writes/day |
| AI summaries | Workers AI | 10,000 neurons/day |
| File uploads (later) | Cloudinary | 25 monthly credits |

D1 was chosen over Workers KV because KV's free tier allows only 1,000 writes per day, which a form that collects responses would exhaust quickly. D1 gives 100,000 writes per day and real relational queries for analytics and CSV export.

## Deploy

### 1. Put the files in a GitHub repo

Create a new repository and upload everything in this folder at the repo root. The structure must stay as is:

```
/index.html
/schema.sql
/wrangler.toml
/_routes.json
/_redirects
/functions/api/[[path]].js
```

### 2. Create the Pages project

In the Cloudflare dashboard, go to Workers and Pages, create a Pages project, and connect the GitHub repo. Settings:

- Framework preset: None
- Build command: leave empty
- Build output directory: `.` (a single dot, the repo root)

Deploy once. The site will load, but the API will error until the database and bindings exist. That is expected.

### 3. Create the D1 database and load the schema

With Wrangler installed locally (`npm i -g wrangler`, then `wrangler login`):

```
wrangler d1 create forms
wrangler d1 execute forms --file=schema.sql --remote
```

Copy the `database_id` that the create command prints and paste it into `wrangler.toml`.

If you prefer the dashboard: create a D1 database named `forms`, open its console, and paste the contents of `schema.sql`.

### 4. Add bindings in the Pages project

In the Pages project under Settings, then Functions, then Bindings (set these for Production, and Preview if you use it):

- D1 database binding: variable name `DB`, database `forms`.
- Workers AI binding: variable name `AI`. This is what powers the summaries and keeps them free.

### 5. Set environment variables

Under Settings, then Environment variables, add:

- `SESSION_SECRET`: a long random string. This signs the login session cookie. Mark it encrypted. Generate one with `openssl rand -hex 32`.
- `ADMIN_PASSWORD`: the admin login password. The code falls back to `rain` if this is unset, so set it to something real before sharing the URL.
- `AI_MODEL` (optional): defaults to `@cf/meta/llama-3.1-8b-instruct`, which is free. You can switch to a smaller, cheaper model like `@cf/meta/llama-3.2-3b-instruct` to stretch the neuron budget further.

Redeploy after setting variables so the Functions pick them up.

### 6. Point the domain

Add `forms.katr.es` as a custom domain on the Pages project.

## How the AI summaries stay free

Workers AI gives 10,000 neurons per day at no cost. A roughly 500 token summary from an 8B model costs about 400 to 600 neurons, so a naive design that regenerated on every page load would burn the daily allowance in 15 to 25 views.

This app avoids that:

- Every summary is cached in the `ai_summaries` table, keyed by `dash:<userId>` for the dashboard and `form:<formId>` for each form.
- The cache stores a signature derived from the underlying data (form count, total responses, latest response time for the dashboard; response count and last edit time for a form). The model is only called when that signature changes, meaning when responses actually come in or a form is edited.
- A manual Refresh button on each summary forces a regeneration by passing `?refresh=1`.
- If the `AI` binding is missing or a call fails, the endpoint returns a plain non-AI summary instead of breaking. The card shows "Workers AI offline" and still displays the basic counts.
- Forms with zero responses never call the model at all. They return a static placeholder.

In normal use this means a few model calls per day, far inside the free tier.

## What is built now (phase 1)

Working end to end:

- Admin login (password based), session cookie, dashboard, and per form dashboard.
- Form builder with live preview, theming (primary, secondary, and accent colors plus a font choice of Figtree, Georgia Pro, Space Mono, or Roboto Slab), reordering, duplicating, and deleting questions.
- Pretty share URLs. Admin forms are at `/<form-title>`. User forms are at `/<username>/<form-title>`.
- Response collection with automatic capture of approximate location (country, city, region from Cloudflare), browser, OS, viewport, and referrer.
- Per form: responses table with a detail view, analytics (totals, responses by day, by country, by browser), CSV export, open and close toggle, edit, and delete.
- AI summaries at the top of the dashboard and every form dashboard.

Question types in this phase: Multiple Choice (single, multi, dropdown), Text Entry (single line or paragraph, with email, phone, number, and minimum length validation), Text and Graphic blocks, Slider, and Net Promoter Score. Meta Info is captured automatically on every response.

Flow features in this phase: Force Response, Request Response, Response Validation, and Randomization (both option order and question order).

The question types are registered in an extensible map (`QTYPES`) in `index.html`, so later types plug in without touching the rest of the app.

## Roadmap

The full Qualtrics style set is large. Here is how the remaining items map to later phases.

| Phase | Question types | Flow and logic |
| --- | --- | --- |
| 1 (done) | Multiple Choice, Text Entry, Text/Graphic, Slider, NPS, Meta Info | Force Response, Request Response, Response Validation, Randomization |
| 2 | Matrix, Form Field, Rank Order, Side by Side, Constant Sum, Pick Group and Rank, Drill Down, Calendar, Autocomplete | Display Logic, Skip Logic, Branch Logic, Embedded Data, Piped Text, Carry Forward |
| 3 | Signature, File Upload, Hot Spot, Heat Map, Highlight, Timing, Captcha, Location Selector | Loop and Merge, block level randomization |

Phase 2 logic (display, skip, and branch) needs a small rules engine evaluated inside the shared `FormRenderer`. Phase 3 adds the question types that need canvas or image interaction and the heavier flow features.

## File uploads (deferred to phase 3)

When the File Upload question type is added, uploads will go to Cloudinary using an unsigned upload preset. The browser uploads directly to Cloudinary, and only the returned `secure_url` is stored in the response data, so no large files touch D1.

Two limits to keep in mind on Cloudinary's free plan: images are capped at 10 MB each, and exceeding the monthly free quota suspends the account and makes assets temporarily inaccessible rather than billing for overage. That is acceptable for moderate form usage but worth watching.

## Notes and caveats

- Georgia Pro is a licensed font and is not free to embed. The serif option uses the stack `'Georgia Pro', Georgia, 'Times New Roman', serif`, so it renders in Georgia Pro on machines that have it and falls back to system Georgia everywhere else.
- The whole app, including the public form, is one file compiled in the browser by Babel. This is intentional for zero build deployment. Once the feature set grows past phase 2, the right move is to convert to a Vite build that Cloudflare compiles on deploy, and to split the public form renderer into its own smaller bundle so respondents do not download the admin code.
- Google sign in is stubbed. The button is present and the backend has a placeholder route, to be wired in a later step. Admin login is fully working now.
- This code is written and syntax checked but has not been run against the live Cloudflare runtime yet. Expect a small fix or two on the first deploy, most likely around binding names or the D1 `database_id`.

## Local development

```
wrangler pages dev . --d1 DB=forms --ai AI
```

The session cookie is marked Secure. Browsers treat `localhost` as a secure context, so login works locally without HTTPS.
