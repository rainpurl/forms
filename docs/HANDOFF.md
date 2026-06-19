# zetetiq, project handoff

Hand this document, plus the zip it came in, to a new chat to continue work without re-explaining anything. Read this file first, then `src/app.source.html` (the editable app) and `functions/api/[[path]].js` (the backend).

Standing instruction for any assistant working on this project: keep this handoff document current and include an updated copy with every response.

## What zetetiq is

A self-hosted, Qualtrics style forms builder. Build a form, theme it, share a clean link, collect responses, view analytics, and read an AI written summary. Everything runs on Cloudflare free tiers.

Owner: Rain, handle Katresai. Live at zetetiq.pages.dev, zetetiq.katr.es, and forms.katr.es, all the same Cloudflare Pages project.

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

`index.html` is compiled output. Do not hand edit it.

The editable app is `src/app.source.html`, a single file with a `<script type="text/babel">` block written in React JSX. After any edit to the source you must recompile it into `index.html`.

The compile must use the classic JSX runtime. The automatic runtime emits `import { jsx } from "react/jsx-runtime"`, which cannot resolve in a plain browser and leaves a blank page. This already caused one blank page incident, so always force `runtime: "classic"`.

Build recipe, Node only, no browser build tool:

1. `npm install @babel/standalone --no-save`
2. Read `src/app.source.html`, extract the contents of the `<script type="text/babel">...</script>` block.
3. Compile it with `Babel.transform(jsx, { presets: [["react", { runtime: "classic" }]], compact: false })`.
4. Write a new `index.html` that keeps the original `<head>` and the body shell up to the first script tag, then appends:
   - `<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin></script>`
   - `<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin></script>`
   - a plain `<script>` containing the compiled JS, then `</script></body></html>`.
5. Verify the output contains `React.createElement`, contains no `import` and no `jsx-runtime`, and passes `node --check` on the extracted script.

The emitted script section also wraps the app in a `boot()` function and adds two resilience pieces: a capturing `window` error listener that prints any startup error into the page (so a failure shows a readable message instead of a blank screen), and a loader that uses unpkg as the primary CDN with an automatic jsDelivr fallback. Keep both. Copy the exact template from the current `index.html`.

The build script is a dozen lines and is fully reproducible from this recipe.

## Deploy and update process, web only

Rain does not use a terminal. The live deploy is a GitHub repo connected to the Pages project, and Pages rebuilds on every commit to the production branch.

To change the app:

1. The assistant edits `src/app.source.html` and recompiles to `index.html` using the recipe above.
2. Rain uploads the new `index.html` to the repo through the GitHub website: Add file, Upload files, drag, Commit. The same filename overwrites the old one.
3. Pages auto redeploys in about a minute. Hard refresh to clear the cached page.

Setup already completed: Pages build settings are Framework None, no build command, output dir `/`. Bindings `DB` (D1, database `forms`) and `AI` (Workers AI) are set in the dashboard. Secrets `SESSION_SECRET` and `ADMIN_PASSWORD` are encrypted env vars. The D1 schema was loaded by pasting `schema.sql` into the D1 Console. The console errors with "Requests without any query are not supported" if the SQL has comment lines or a trailing blank line, so it must be clean.

There is intentionally no `wrangler.toml`. When present with Git deploys it overrides dashboard config and caused conflicts. All config lives in the dashboard.

## File inventory

- `index.html`, the compiled app, the file that goes live.
- `_routes.json`, `{"version":1,"include":["/api/*"]}` so only /api/* hits Functions and everything else is static.
- `_redirects`, `/*  /index.html  200`, the SPA fallback so client routes resolve.
- `schema.sql`, the D1 schema, pasted into the D1 Console once.
- `functions/api/[[path]].js`, the entire backend.
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

The builder uses a panel and canvas layout modeled on the Qualtrics editor, in the zetetiq palette. A slim left rail switches the left panel between three modes: edit the selected question, theme, and form settings. When a question is selected, the left panel shows its structural controls (`MCControls`, `TextControls`, `SliderControls`, `NpsControls`, `MatrixControls`, `RankControls`, `ConstantSumControls`, `FormFieldControls`, `DateControls`, `StarControls`) plus a Question type dropdown that converts the question to another type, keeping the text, required, and request fields. The center canvas (`CanvasCard`) is where the question text and, for multiple choice, the option text (`MCCanvas`) are edited inline. The top toolbar has a Tools menu, a saved at note, a status badge, Preview, and Publish, where Publish saves. The older `QTYPES[type].Editor` is no longer rendered by the builder; the left panel controls replace it. `QTYPES[type].Renderer` is still used, by `FormRenderer`, for both the preview and the public form.

The builder now supports drag and drop reordering: each question card and page break has a grip handle, and dragging it over another card drops it into that position. The "..." menu keeps Move up and Move down as a fallback. Deleting a question sends it to a Trash section at the very bottom of the canvas, where each item has a Restore button and there is an Empty trash action. Trash is session only: it lives in component state and is gone on refresh or navigation, and it is never part of the saved schema. The Add new question control opens a centered scrollable modal listing every type, which fixes the old upward menu that was clipped at the top of the page.

Implemented in phase 1: `multiple_choice` (one answer or multiple answers via a `multi` flag, shown as a list or a dropdown via a `display` flag, optional choice randomize), `text_entry` (short or long, with email, phone, number, and minimum length validation), `text_graphic` (static heading, text, image, not an input), `slider` (min, max, step, end labels), `nps` (0 to 10). Also added: `matrix` (a grid of statements rated on one scale; one or multiple answers per row; value is an object keyed by statement text), `rank_order` (order items with up and down; value is the ordered array of item texts), `constant_sum` (numeric inputs that must add to a target total, optional unit; value is an object keyed by item text), `form_field` (several labeled text fields in one question; value is an object keyed by field label), `date` (calendar picker; value is an ISO date string), and `star_rating` (1 to N stars; value is a number). In the builder, the lists inside matrix, rank order, constant sum, and form field (rows, columns, items, fields) are edited inline on the question, while structural settings live in the left panel. Object-shaped answers export to CSV as readable "label: value | label: value" cells. `page_break` (not an input) splits the form into pages: `FormRenderer` groups questions into pages at each page break and shows Back and Next with a progress bar and a "Page X of N" label, validating the current page before advancing and jumping to the first page with an error on submit. A form with no page break renders as a single page exactly as before. Meta info is captured automatically on submit, and approximate location comes from Cloudflare `request.cf`.

Flow features in phase 1: Force Response (required), Request Response (a soft confirm on skip), Response Validation, and Randomization (both option order and whole question order through the form setting `randomizeQuestions`). Redirect on completion is a form setting (`settings.redirectUrl`): when set, a respondent who submits is sent to that URL instead of the thank-you screen; a missing scheme is prefixed with https. Question order randomization shuffles within each page when page breaks are present.

## Logo, fonts, header image, end of form

The real artwork is now in. The full logo SVG lives in a single LOGO_SVG constant just above the Logo component, with all its fills set to currentColor, and the Logo component injects it so it recolors to whatever color it sits on (nav, builder, splash, loading screen, and the public-form footer). The size prop sets the lockup height. To replace it later, swap the LOGO_SVG string. The favicon in the head is the provided mark, recolored to the brand purple for visibility.

Form font options are now labelled without naming the font: Sans (default), Serif, Monospace, Slab, and zetetiq. The mappings: Sans is Figtree (now loaded from Google Fonts), Serif and Monospace and Slab are unchanged, and zetetiq is the Mozilla font. The form default stays Sans.

A header image can be uploaded per form (Theme panel). The file is downscaled in the browser to about 1000px wide, flattened onto white, and stored as a JPEG data URL in settings.headerImage; uploads over roughly 900KB are rejected with a message. It renders full width at the top of the form, the builder canvas, and the thank-you page. There is a Remove control.

The post-submission page is customizable beyond the redirect URL. New form settings: endTitle, endMessage, endButtonLabel, and endButtonUrl. If a redirect URL is set it still wins; otherwise the respondent sees the themed thank-you page with the custom heading, message, and an optional button that links out. The public-form footer now reads built by zetetiq and links to https://zetetiq.pages.dev (note: the current live deploy is zetetiq.pages.dev, so point this at whatever domain is actually live).

## Branding, sign in, and reports

The wordmark is now a recolorable inline-SVG Logo component (currentColor) used in the nav, builder, splash, loading screen, and public-form footer, with a placeholder SVG favicon in the head. Swapping in the real artwork means replacing the body of the Logo component and the favicon href. The splash tagline reads: Build a query, theme it your way, and share a clean link. Experience management via zetetiq is 100% free for early users.

Google sign in is implemented as a real OAuth 2.0 authorization code flow in the backend: GET /api/auth/google/start sets a short-lived g_state cookie and redirects to Google; GET /api/auth/google/callback verifies the state, exchanges the code at oauth2.googleapis.com/token, reads the id_token claims, upserts a users row keyed by google_id, signs the same HMAC session cookie used by admin, and redirects to /dashboard. It needs the secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; without them the start route redirects back with google_error=setup and the button shows an inactive message. Setup steps are in the README.

No part of the UI says AI anymore. The former summary card is now titled Overview and never shows an offline badge; it always renders the summary text the backend returns. Workers AI, if its binding is configured, still enriches that text server-side, but it is optional and never surfaced. The Responses tab has an Export report button next to Download CSV that produces a themed one-page PDF of the aggregates using a CDN-loaded PDF library.

## Analytics, aggregated

The Analytics tab computes per question aggregates in the browser from the raw responses, so no backend change was needed. Multiple choice shows option counts with the most and least selected called out. Matrix shows the most common answer per statement. Rank order shows the final ranking by average position, where position one is best. Constant sum shows the average allocation per item. Star rating shows the average and the distribution. Slider shows average, min, and max. NPS shows the score with promoter, passive, and detractor counts. Date shows the earliest and latest. Text and form field show a response count. The audience charts (by day, country, browser) still come from the server analytics endpoint.

## AI summaries, how they stay free

Workers AI gives 10,000 neurons per day free, and an 8B summary costs roughly 400 to 600, so naive per load generation would exhaust it in 15 to 25 views. So each summary is cached in `ai_summaries` keyed by `dash:<uid>` or `form:<id>`, with a signature of the underlying data. For the dashboard the signature is form count plus total responses plus latest response time. For a form it is response count plus the form `updated_at`. The model runs only when the signature changes. A Refresh button forces regeneration through `?refresh=1`. Forms with zero responses never call the model. If the AI binding is missing or a call fails, the endpoints return a plain non AI summary and the card shows "Workers AI offline". The model defaults to `@cf/meta/llama-3.1-8b-instruct`, which is free, and `AI_MODEL` can switch it, for example to the cheaper `@cf/meta/llama-3.2-3b-instruct`. All model output runs through `cleanText()`, which strips markdown and converts em and en dashes, so Rain's no em dash rule applies even to AI text.

## Rain's style rules, apply to all code, UI copy, and docs

- No em dashes anywhere. Use commas, periods, and colons. This is a hard rule and is enforced in code and even on AI output. En dashes are also avoided.
- Sentence case. Clinical, editorial voice. Specific over clever.
- Brand: off-white background with a blue-purple accent (`#5b4fe0`, darker `#4536c9`) on a near-black violet ink `#1b1830`. The logo and large display type use Mozilla Headline; the rest of the site uses Mozilla Text. Both load from Google Fonts. (This replaced the earlier burnt-orange and Fraunces/Figtree look.)
- Form fonts offered to end users: sans is Mozilla Text, serif is Georgia Pro (licensed, not embedded, falls back to system Georgia), mono is the system monospace stack, slab is Roboto Slab. The default new-form theme uses the blue-purple accent.
- Stack preference: vanilla or single file React on Cloudflare Pages with D1 or KV and GitHub, web based deploys, no terminal.

## Known issues and gotchas

- Compiled versus source. Never edit `index.html` directly. Edit `src/app.source.html` and recompile with the classic runtime.
- Repo layout. The deployable files must sit at the repository root. `index.html` at the root is the only page Cloudflare serves. If they are nested in a subfolder, uploads do not replace the root file and the site keeps serving the old one. This caused a stuck deploy until the layout was flattened.
- The D1 Console rejects comments and trailing blank lines. Paste clean SQL only.
- The public form currently loads the whole app bundle, so a respondent's browser also downloads the admin code. This is acceptable for now. Split the public renderer into its own smaller bundle if respondent load size becomes a concern.
- Georgia Pro is licensed, so the serif option renders as system Georgia for anyone without the font.
- Note on names: the product is zetetiq with a q, but the Cloudflare Pages project and existing domains use zetetiq with a c (zetetiq.pages.dev, zetetiq.katr.es), plus forms.katr.es. Renaming the project or adding a zetetiq.katr.es domain is optional and separate from the app.
- No real user accounts yet, since Google is stubbed. Admin is the only account.

## Roadmap, all 23 question types and 11 logic features mapped

| Phase | Question types | Flow and logic |
| --- | --- | --- |
| 1, done | Multiple Choice, Text Entry, Text/Graphic, Slider, NPS, Meta Info | Force Response, Request Response, Response Validation, Randomization |
| 2 | Matrix, Form Field, Rank Order, Side by Side, Constant Sum, Pick Group and Rank, Drill Down, Calendar, Autocomplete | Display Logic, Skip Logic, Branch Logic, Embedded Data, Piped Text, Carry Forward |
| 3 | Signature, File Upload via Cloudinary, Hot Spot, Heat Map, Highlight, Timing, Captcha, Location Selector | Loop and Merge, block level randomization |

Phase 2 logic needs a small rules engine evaluated inside `FormRenderer`. Phase 3 adds the canvas and image interaction question types and the heavier flow features. Cloudinary file upload plan: an unsigned upload preset, the browser uploads directly to Cloudinary, and only the returned `secure_url` is stored in the response data. Images cap at 10 MB, and exceeding the free quota suspends the account rather than billing for overage.

## How to continue in a new chat

Attach the zip and paste this file. Tell the assistant to read `docs/HANDOFF.md` first, then `src/app.source.html` and `functions/api/[[path]].js`. Make changes in the source, recompile to `index.html` with the classic runtime recipe, return the updated `index.html`, and return an updated copy of this handoff document.

## Smart flow, integrations, and templates

Display logic: any input question can be shown only when an earlier answer matches. Set it in the question editor under Display logic (choose the earlier question, is / is not / contains, and a value). Hidden questions are skipped and not validated. The evaluator is qVisible in the source.

Conversational mode: a form setting that presents one question at a time. It reuses the paginated renderer, one step per question, and skips steps whose only question is hidden by logic.

Hidden fields: a question type that is never shown to the person. It captures a value from a URL parameter (for example utm_source) or a fixed value, and is stored with the response. Configure the field name and source in the editor.

Metadata and webhook: on submit the form also records time to complete (seconds) and any utm_* parameters from the URL. If a webhook URL is set in Form settings, the backend POSTs a JSON payload on each submission with event, the survey id, a respondent block (email and nps when present), the responses, and metadata (utm_source, time_to_complete_seconds, country, browser, and captured hidden fields). It is fire and forget, so a failing webhook never blocks a submission.

Starter templates: new forms open with a chooser offering Blank plus Customer feedback, Contact form, Event RSVP, and Quick poll, so no one starts on an empty canvas.

## Reporting, branding, and editor polish

PDF report: Export report (PDF) is themed with the form colors (primary for the header band, accent for the bars) and maps the form font to the closest PDF face. The zetetiq logo is rasterized in white and placed in the header band. The export buttons live in both the Responses and Analytics tabs and are full sized.

Editor: there is a Copy link button next to Preview and Publish (it copies the public form link once the form is published). While the Theme tab is open, the canvas shows a live form preview that updates as you change colors, font, or the header image.

Footer and logo: the public footer now reads powered by zetetiq and links to zetetiq.pages.dev, and it also appears on the thank-you screen. The navbar logo is larger. The favicon now sits on a solid brand-colored rounded square with a white mark so it stays visible on light and dark browser tabs.

## Reorder animation and naming

The question list reorders live while dragging (cards shift to make room) and glides into place with a FLIP animation, which also runs when you use the Move up and Move down menu actions. The dragged card shows as a dashed placeholder, and the grip uses a grab cursor. Touch and keyboard users can reorder with the Move up and Move down actions.

Naming is settled: the product is spelled zetetiq with a q everywhere, and the footer and reports use that spelling. If your live domain currently uses the older spelling, point it at the zetetiq name so the powered by link resolves.
