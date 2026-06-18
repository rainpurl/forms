# zetetiq, project handoff

Hand this document, plus the zip it came in, to a new chat to continue work without re-explaining anything. Read this file first, then `src/app.source.html` (the editable app) and `deploy/functions/api/[[path]].js` (the backend).

Standing instruction for any assistant working on this project: keep this handoff document current and include an updated copy with every response.

## What zetetiq is

A self-hosted, Qualtrics style forms builder. Build a form, theme it, share a clean link, collect responses, view analytics, and read an AI written summary. Everything runs on Cloudflare free tiers.

Owner: Rain, handle Katresai. Live at zetetic.pages.dev, zetetic.katr.es, and forms.katr.es, all the same Cloudflare Pages project.

## Current status

- Deployed and working on Cloudflare Pages.
- Admin login works. The password is the Cloudflare env var `ADMIN_PASSWORD`, which falls back to `rain` if unset.
- Google sign in is a stub. The button is present and the backend returns 501. Admin is the only account.
- Phase 1 feature set is complete. Phases 2 and 3 are not started.
- Branding is set to zetetiq, all lowercase. The browser tab title, the landing wordmark, the nav wordmark, and the public form footer all read zetetiq. The wordmark keeps a trailing period dot as a style touch.

## Architecture

| Layer | Tech | Notes |
| --- | --- | --- |
| Static hosting | Cloudflare Pages | serves index.html and assets |
| API | Pages Functions | one catch-all at functions/api/[[path]].js, handles /api/* |
| Database | Cloudflare D1 (SQLite) | binding name DB |
| AI summaries | Workers AI | binding name AI, cached to stay free |
| File uploads | Cloudinary | planned for phase 3, not built |

Project secrets and vars: `SESSION_SECRET` (HMAC key for the session cookie, encrypted), `ADMIN_PASSWORD` (encrypted), optional `AI_MODEL`.

## Critical build note, read before editing the app

`deploy/index.html` is compiled output. Do not hand edit it.

The editable app is `src/app.source.html`, a single file with a `<script type="text/babel">` block written in React JSX. After any edit to the source you must recompile it into `deploy/index.html`.

The compile must use the classic JSX runtime. The automatic runtime emits `import { jsx } from "react/jsx-runtime"`, which cannot resolve in a plain browser and leaves a blank page. This already caused one blank page incident, so always force `runtime: "classic"`.

Build recipe, Node only, no browser build tool:

1. `npm install @babel/standalone --no-save`
2. Read `src/app.source.html`, extract the contents of the `<script type="text/babel">...</script>` block.
3. Compile it with `Babel.transform(jsx, { presets: [["react", { runtime: "classic" }]], compact: false })`.
4. Write a new `deploy/index.html` that keeps the original `<head>` and the body shell up to the first script tag, then appends:
   - `<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin></script>`
   - `<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin></script>`
   - a plain `<script>` containing the compiled JS, then `</script></body></html>`.
5. Verify the output contains `React.createElement`, contains no `import` and no `jsx-runtime`, and passes `node --check` on the extracted script.

The emitted script section also wraps the app in a `boot()` function and adds two resilience pieces: a capturing `window` error listener that prints any startup error into the page (so a failure shows a readable message instead of a blank screen), and a loader that uses unpkg as the primary CDN with an automatic jsDelivr fallback. Keep both. Copy the exact template from the current `deploy/index.html`.

The build script is a dozen lines and is fully reproducible from this recipe.

## Deploy and update process, web only

Rain does not use a terminal. The live deploy is a GitHub repo connected to the Pages project, and Pages rebuilds on every commit to the production branch.

To change the app:

1. The assistant edits `src/app.source.html` and recompiles to `deploy/index.html` using the recipe above.
2. Rain uploads the new `deploy/index.html` to the repo through the GitHub website: Add file, Upload files, drag, Commit. The same filename overwrites the old one.
3. Pages auto redeploys in about a minute. Hard refresh to clear the cached page.

Setup already completed: Pages build settings are Framework None, no build command, output dir `/`. Bindings `DB` (D1, database `forms`) and `AI` (Workers AI) are set in the dashboard. Secrets `SESSION_SECRET` and `ADMIN_PASSWORD` are encrypted env vars. The D1 schema was loaded by pasting `deploy/schema.sql` into the D1 Console. The console errors with "Requests without any query are not supported" if the SQL has comment lines or a trailing blank line, so it must be clean.

There is intentionally no `wrangler.toml`. When present with Git deploys it overrides dashboard config and caused conflicts. All config lives in the dashboard.

## File inventory

- `deploy/index.html`, the compiled app, the file that goes live.
- `deploy/_routes.json`, `{"version":1,"include":["/api/*"]}` so only /api/* hits Functions and everything else is static.
- `deploy/_redirects`, `/*  /index.html  200`, the SPA fallback so client routes resolve.
- `deploy/schema.sql`, the D1 schema, pasted into the D1 Console once.
- `deploy/functions/api/[[path]].js`, the entire backend.
- `src/app.source.html`, the editable JSX source of the app.
- `docs/README.md`, the user facing deploy and update guide.
- `docs/HANDOFF.md`, this file.

## Data model, D1

- `users(id, username, name, email, google_id, is_admin, created_at)`. Admin is a fixed row: id `admin`, username `admin`, name `Rain`, is_admin 1, upserted on admin login.
- `forms(id, owner_id, slug, title, description, theme JSON {primary,secondary,accent,font}, schema JSON {questions:[], settings:{}}, is_open, created_at, updated_at)`. Unique index on (owner_id, slug). The slug is derived from the title at create and kept stable on update so shared links do not break.
- `responses(id, form_id, data JSON {questionId: answer}, meta JSON {country,city,region,timezone,browser,os,ua,viewport,referrer,submittedAt}, created_at)`.
- `ai_summaries(key PK, summary, signature, model, created_at)`. The key is `dash:<userId>` or `form:<formId>`.

## API surface, all under /api, JSON unless noted

Auth uses an HMAC signed httpOnly cookie named `session`, valid 30 days, signed with `SESSION_SECRET`.

- `POST /api/auth/admin {password}` sets the cookie and returns {user}. Checks `ADMIN_PASSWORD`, fallback `rain`.
- `POST /api/auth/logout` clears the cookie.
- `GET /api/me` returns {user} or {user:null}.
- `GET /api/auth/google/start` is a 501 stub.
- `GET /api/summary` returns the dashboard AI summary, auth required. `?refresh=1` forces regeneration.
- `GET /api/public/:username/:slug` returns {form}, no auth, theme and schema parsed, is_open boolean. Admin forms are fetched with username `admin`.
- `POST /api/public/:formId/responses {data, viewport, referrer}` returns {ok:true,id}. Returns 403 form_closed if the form is closed. Captures Cloudflare geo and user agent into meta.
- `GET /api/forms` returns {forms:[{id,slug,title,is_open,created_at,username,responses}]}, auth.
- `POST /api/forms {title,description,theme,schema}` returns {id,slug}, auth.
- `GET /api/forms/:id` returns a hydrated {form}, auth, owner only.
- `PUT /api/forms/:id {partial fields}` returns {ok}. It is partial safe, only provided fields update, so the open and close toggle can send just {is_open} without wiping content.
- `DELETE /api/forms/:id` returns {ok} and also deletes responses.
- `GET /api/forms/:id/responses` returns {responses:[{id,created_at,data,meta}]}.
- `GET /api/forms/:id/analytics` returns {total, byDay:[{date,count}], byCountry:[{name,count}], byBrowser:[{name,count}]}.
- `GET /api/forms/:id/export` returns CSV, text/csv with a BOM, skipping text_graphic questions.
- `GET /api/forms/:id/summary` returns the per form AI summary, auth, owner. `?refresh=1` forces.

Router reserved top level segments, both client and server: dashboard, builder, login, api, assets, favicon.ico, robots.txt. URL scheme: one non reserved segment is an admin public form at /slug. Two non reserved segments are a user public form at /username/slug.

## Question type registry

In the app, `QTYPES` is an object keyed by type, and `QTYPE_ORDER` lists them for the add menu. Each entry has `{label, hint, isInput, make(), summary(q), validate(q,value), Editor({q,update}), Renderer({q,value,onChange,error})}`. To add a type, add one entry plus its id to `QTYPE_ORDER`, and nothing else needs to change. `FormRenderer`, shared by the builder preview and the public form, and the CSV export both read `isInput` to decide what counts as an answer.

Implemented in phase 1: `multiple_choice` (single, multi, dropdown, optional option randomize), `text_entry` (short or long, with email, phone, number, and minimum length validation), `text_graphic` (static heading, text, image, not an input), `slider` (min, max, step, end labels), `nps` (0 to 10). Meta info is captured automatically on submit, and approximate location comes from Cloudflare `request.cf`.

Flow features in phase 1: Force Response (required), Request Response (a soft confirm on skip), Response Validation, and Randomization (both option order and whole question order through the form setting `randomizeQuestions`).

## AI summaries, how they stay free

Workers AI gives 10,000 neurons per day free, and an 8B summary costs roughly 400 to 600, so naive per load generation would exhaust it in 15 to 25 views. So each summary is cached in `ai_summaries` keyed by `dash:<uid>` or `form:<id>`, with a signature of the underlying data. For the dashboard the signature is form count plus total responses plus latest response time. For a form it is response count plus the form `updated_at`. The model runs only when the signature changes. A Refresh button forces regeneration through `?refresh=1`. Forms with zero responses never call the model. If the AI binding is missing or a call fails, the endpoints return a plain non AI summary and the card shows "Workers AI offline". The model defaults to `@cf/meta/llama-3.1-8b-instruct`, which is free, and `AI_MODEL` can switch it, for example to the cheaper `@cf/meta/llama-3.2-3b-instruct`. All model output runs through `cleanText()`, which strips markdown and converts em and en dashes, so Rain's no em dash rule applies even to AI text.

## Rain's style rules, apply to all code, UI copy, and docs

- No em dashes anywhere. Use commas, periods, and colons. This is a hard rule and is enforced in code and even on AI output. En dashes are also avoided.
- Sentence case. Clinical, editorial voice. Specific over clever.
- Accent color burnt orange `#BF5700`. UI type is Fraunces for display, Figtree for sans and UI, Space Mono for mono.
- Form fonts offered to end users: sans is Figtree, serif is Georgia Pro (licensed, not embedded, the stack falls back to system Georgia), mono is Space Mono, slab is Roboto Slab.
- Stack preference: vanilla or single file React on Cloudflare Pages with D1 or KV and GitHub, web based deploys, no terminal.

## Known issues and gotchas

- Compiled versus source. Never edit `deploy/index.html` directly. Edit `src/app.source.html` and recompile with the classic runtime.
- The D1 Console rejects comments and trailing blank lines. Paste clean SQL only.
- The public form currently loads the whole app bundle, so a respondent's browser also downloads the admin code. This is acceptable for now. Split the public renderer into its own smaller bundle if respondent load size becomes a concern.
- Georgia Pro is licensed, so the serif option renders as system Georgia for anyone without the font.
- Note on names: the product is zetetiq with a q, but the Cloudflare Pages project and existing domains use zetetic with a c (zetetic.pages.dev, zetetic.katr.es), plus forms.katr.es. Renaming the project or adding a zetetiq.katr.es domain is optional and separate from the app.
- No real user accounts yet, since Google is stubbed. Admin is the only account.

## Roadmap, all 23 question types and 11 logic features mapped

| Phase | Question types | Flow and logic |
| --- | --- | --- |
| 1, done | Multiple Choice, Text Entry, Text/Graphic, Slider, NPS, Meta Info | Force Response, Request Response, Response Validation, Randomization |
| 2 | Matrix, Form Field, Rank Order, Side by Side, Constant Sum, Pick Group and Rank, Drill Down, Calendar, Autocomplete | Display Logic, Skip Logic, Branch Logic, Embedded Data, Piped Text, Carry Forward |
| 3 | Signature, File Upload via Cloudinary, Hot Spot, Heat Map, Highlight, Timing, Captcha, Location Selector | Loop and Merge, block level randomization |

Phase 2 logic needs a small rules engine evaluated inside `FormRenderer`. Phase 3 adds the canvas and image interaction question types and the heavier flow features. Cloudinary file upload plan: an unsigned upload preset, the browser uploads directly to Cloudinary, and only the returned `secure_url` is stored in the response data. Images cap at 10 MB, and exceeding the free quota suspends the account rather than billing for overage.

## How to continue in a new chat

Attach the zip and paste this file. Tell the assistant to read `docs/HANDOFF.md` first, then `src/app.source.html` and `deploy/functions/api/[[path]].js`. Make changes in the source, recompile to `deploy/index.html` with the classic runtime recipe, return the updated `deploy/index.html`, and return an updated copy of this handoff document.
