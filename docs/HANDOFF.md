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

## Response intelligence (no AI wording on screen)

Three capabilities use Workers AI behind the scenes and are surfaced with plain names, never the word AI. They all degrade gracefully: if the AI binding is not configured or a call fails, the form and dashboard work normally and these features simply stay quiet.

Overview: the existing dashboard summary card. It reads recent responses and writes a few plain sentences. Cached per form in the ai_summaries table.

Follow-up questions: a per-text-question toggle in the question editor (Conversation, Ask a follow-up based on the answer). When a respondent answers that question and moves on, the form asks one short clarifying question generated from their answer, they can answer it inline, and the question and answer are saved in the response metadata (visible in the response detail and included in the webhook). The endpoint is POST /api/public/:id/followup. It is public because respondents are not signed in, so it caps the input length and only responds when the named question has follow-ups enabled. For a high-traffic public form you may want to add a rate limit at the edge.

Tone: a card in the Analytics tab that reads the open-text answers and shows an overall split of positive, neutral, and negative plus a one-line read. Cached per form (key tone:formId). Only appears when the form has text questions and at least one response.

All three require the Workers AI binding named AI on the Pages project. The model is configurable with the AI_MODEL variable and defaults to a small Llama model.

## Signature question type

A new question type, Signature, lets a respondent sign with a finger or mouse on a small canvas. The drawing is saved as a PNG data URL inside the response data, so it needs no external file storage (unlike a general file upload, which would require object storage such as R2). It validates like any other question when set to force a response. In the responses table the signature shows as an image in the response detail. In CSV exports and webhook payloads it is written as the placeholder [signature] rather than the long data string, and the printable report counts how many responses were signed. There are now fourteen question types.

Note: very large or high-resolution signatures are unlikely since the pad is small, but the image still lives in the response row in D1, which is fine at normal volume.

## Availability and limits

The form settings panel has an Availability and limits section with three controls. Response limit caps the total number of responses (0 means unlimited). Opens at and Closes at are optional date and time fields; they use the editor's local timezone in the picker and are stored as UTC. The server computes a single availability state when the public form is loaded and again when a response is submitted, so a response cannot slip in after the limit or close time even if someone posts directly to the endpoint. When a form is unavailable the respondent sees a plain message that matches the reason: not open yet (with the open time if set), closed, or has reached its response limit.

The server returns this as an availability object on the public form load, with open true or false and a reason of scheduled, ended, full, or closed. The manual open and closed toggle still works as before and takes priority. One caveat at high concurrency: the count and insert are two steps, so a burst of simultaneous submissions right at the cap could exceed it by a small margin. For normal volume this is not a concern.

## PDF report fonts and theme presets

The printable report now renders in the form's actual font, not just its colors. When the report is generated it fetches the matching TrueType file and embeds it in the PDF: Figtree for Sans, Roboto Slab for Slab, and Mozilla Text for the zetetiq font (Sans and Slab include a real bold weight; the Mozilla font is a single weight). Serif maps to Times and Monospace to Courier, which are built into PDF. The fonts load from a public CDN at export time and are cached by the browser; if a font cannot be fetched the report falls back to a standard PDF font so export never fails. The header band still uses the theme primary color, bars use the accent color, and body text now follows the theme secondary color.

The theme panel has a Presets row with six one-click looks (Indigo, Forest, Slate, Sunset, Berry, Editorial). Each sets the primary, secondary, accent, and font together, and the live preview, the form, and the PDF all follow.

## Dark mode and navigation

There is a light and dark mode toggle (sun and moon icon) in the top bar. It defaults to the visitor's operating system setting on first load, and once they choose a mode the choice is saved in the browser and used on later visits. Dark mode applies to the app shell (dashboard, builder, landing). The public form and the builder's live preview always stay light, so a respondent sees the form the way the owner designed it regardless of their own system setting.

The top navigation bar now spans the full width of the screen: the zetetiq mark sits in the far left corner, a large New form button sits in the center, and the theme toggle, greeting, and Log out sit at the far right. The duplicate New form button that used to sit above the forms table has been removed since the bar now carries it.

Internally, dark mode is driven by a data-theme attribute on the page root and a set of CSS variable overrides. Form rendering resets those variables back to the light palette on its own container, which is why the form stays light even inside a dark builder.

## Homepage templates

On the dashboard, when the user has fewer than ten forms, a Start from a template section appears with the four starter templates (Customer feedback, Contact form, Event RSVP, Quick poll). Clicking one creates the form on the server and opens it in the builder. The section hides automatically once the user has ten or more forms.

## Card grid, brand studio, and the drag fix

The forms homepage is now a grid of cards instead of a table. Each card shows the status, response count, slug, and date, and the form title is rendered in that form's own font for a quick visual preview.

Inside a form, the title now uses the form's selected font as well, instead of a separate display font, so the form reads as one consistent typeface.

Brand studio is a new option in the builder side panel (the swatch icon, between Theme and Form settings). It lets you save a reusable brand kit made of a logo, a font, and primary, secondary, and accent colors. Saved kits are listed at the top of the panel, and Apply drops the kit's colors, font, and logo onto the current form in one click. Kits are stored per account on the server.

The font field in a brand kit offers the built in font choices, plus an optional Custom font box where you can type any Google Fonts family name (for example Poppins). When set, that font is loaded from Google Fonts and used throughout the form. The printable report falls back to a standard font for arbitrary custom fonts, since it embeds a fixed set of typefaces.

IMPORTANT, one time database step: brand kits use a new table called brand_kits. Open your D1 database console and run the new CREATE TABLE statement that is now at the bottom of schema.sql (the brand_kits table and its index). Until you do, saving a brand kit will fail.

The drag to reorder crash is fixed. Reordering a question by dragging used to throw a map is not a function error because the reorder helper was accidentally storing a function in place of the question list. The helper now always keeps the question list as a proper array, so dragging, the move up and down buttons, duplicate, and delete all behave correctly.

The side panel icons were updated: the Theme button now uses an artist palette icon and the Form settings button now uses a gear icon.

## Scheduling, payments, e-signature, embedding, and per-response PDFs

Three new question types are available in the builder, alongside the existing ones:

Scheduling lets people book a time. Paste a Calendly link (or any scheduler) in the question's left panel. With Show the scheduler inline turned on, the booking widget is embedded right in the form (this works with Calendly). For schedulers that block embedding, turn it off to show an Open scheduler button instead.

Payment collects money through a payment link. Create a payment link in Stripe, PayPal, or a similar provider, paste it in, and optionally set an amount label and button text. The form shows a payment button that opens the provider, which handles the transaction securely. No card details ever touch this app.

E-signature (DocuSign) sends people to a document to review and sign. In DocuSign, create a PowerForm, paste its URL, and the form shows a Review and sign button. Signing happens on DocuSign. This is separate from the draw-it-yourself Signature field, which captures a simple drawn signature inside the form.

For all three, the heading and description are edited directly on the question card, and the link and options are set in the left panel. These are action blocks: the form does not record whether the booking, payment, or signing was completed, since that happens on the provider. If you need to react to a submission elsewhere, the webhook setting under Form settings still fires on every form submission.

Sharing now includes embedding. The Share button in the builder toolbar opens a panel with the form's public link and a ready to paste embed code. The embed code is an iframe you can drop into any web page to show the form inline. Both have one click copy buttons.

Every response can be exported individually as a PDF. In a form's Responses tab there is a PDF button on each response row, and an Export PDF button at the top of the response detail. The PDF is themed with the form's colors and font and includes the answers, any drawn signature, the follow-up answers, and the submission location and device. The aggregate Export report PDF that summarizes all responses is unchanged.

## Dark mode polish, toggle placement, fonts, and export branding

Dark mode now covers the parts that were still showing light: the automated Overview card and the form builder surfaces (the question block headers, the rail's active button, the page break highlight, the analytics bar tracks, badges, and the loading shimmer) all follow the theme.

The light and dark toggle now sits right next to the logo. It appears in the top navigation bar (dashboard and form pages) and also in the form builder's top bar, so it is reachable from everywhere in the app.

Fonts outside the form are now consistently the Mozilla typeface. The homepage cards used to show each form's own font on its title, which looked out of place; the card titles now use the Mozilla headline font like the rest of the app. The form preview and the public form still use whatever font the form is set to.

The form settings icon in the builder rail is now a clear gear instead of the previous shape that read like a sun.

The homepage cards are ordered by most recent response, so the forms getting activity rise to the top. Each card shows when its latest response arrived, for example Latest response on Jun 10 at 3:24 PM, or No responses yet for forms that have not been filled in.

Exports are now branded to the form. If a form has an uploaded logo (set as the header image, including from a brand kit), that logo replaces the zetetiq mark in the top corner of the PDF report and the per-response PDFs, shown on a clean white chip so it reads well on the colored header. Forms without an uploaded logo keep the zetetiq mark. The export footer now reads powered by zetetiq.

## Native scheduling and document signing (built into zetetiq)

Two question types are now real zetetiq features rather than links out to other services. There is nothing to connect, no third party account, and respondents never leave your form.

Meeting signup. Add a Meeting signup question to let people book one of your time slots, similar to a Calendly link but hosted by zetetiq. In the builder you set a meeting title, a duration, and a location or video link, then add the times you are available (a date and time picker with an Add button). Each time can hold a set number of people (the capacity field), so popular slots fill up. On the public form the respondent sees the meeting details and your open times grouped by day, and taps one to book it. Times that are full or in the past are shown but cannot be picked. The booked time is saved with the response, shown in the responses table, and printed on the per-response PDF.

Document to sign. Add a Document to sign question to upload a document and have people fill it out and sign it inside zetetiq, instead of sending them to DocuSign. Upload an image or a PDF; the respondent views it and then completes the fields you define below it. Fields can be short text, long text, a date, a checkbox, or a signature drawn with a finger or mouse. The default fields are full name, signature, and date, and you can add or remove fields. Everything the respondent enters, including the drawn signature, is saved with the response, shown in the responses view, and included on the per-response PDF.

Payments stay as an embed. Collecting money still uses a payment link (Stripe, PayPal, or similar) opened from a button, because handling card details directly carries security and compliance burden that is better left to the payment provider. The owner sets the link, an amount label, and the button text.

## Native file uploads (Cloudflare R2)

There is now a File upload question type, so forms can collect attachments (resumes, photos, documents, and so on). Files are stored in Cloudflare R2, kept separate from the form data in D1.

In the builder you choose which file types to accept (any, images, PDF, documents, spreadsheets, or images and PDF), set a maximum size in megabytes, and optionally allow multiple files. On the public form the respondent gets a drop zone, picks a file, and it uploads in place with a friendly status while it transfers. The file name appears with a remove option.

Uploaded files are saved with the response. In the responses view and on each response, the owner sees a download link for every uploaded file. Downloads are owner only: each file is stored under a key namespaced to its form, and the download endpoint checks that the signed in owner owns that form before serving the file.

Setup required: this feature needs a Cloudflare R2 bucket bound to the project as FILES. Create an R2 bucket in the Cloudflare dashboard, then in Pages, Settings, Functions, add an R2 bucket binding with the variable name FILES pointing to that bucket. Until that binding exists, the File upload type still appears, but uploads show a friendly message saying file storage is not set up yet (the rest of the form keeps working).

Notes and limits. The public upload endpoint accepts files only while the form is open and enforces a server side size cap (25 MB by default, on top of the per question limit you set). Because respondents are anonymous, the upload endpoint is public by necessity; the form being open plus the size cap are the main guards against abuse. CSV and PDF exports show the file name; the actual file is reached through the owner only download link in the responses view.

## Multi-section surveys

Forms can now be organized into sections, similar to blocks in other survey tools. Add a Section from the question menu (it appears alongside Page break and the other types). A section starts a new page and can carry a title and an optional description, both shown to the respondent at the top of that page.

In the builder a section appears as a labeled card with editable title and description fields, in line with your questions. Everything after a section card, up to the next section card, belongs to that section. The questions before the first section form an untitled opening section. Sections are reordered or removed the same way as questions, using the drag handle and the remove button.

On the public form each section is its own page (page breaks still work to split a long section into several pages), and the section title and description appear above its questions. There is a Randomize section order setting in Form settings that presents the sections in a random order for each respondent, which is useful for reducing order effects.

Sections are purely organizational: they never appear as columns in the CSV, as questions in the analytics, or in webhook payloads. One thing to know: dragging a section card moves the section boundary, it does not carry the questions under it along with it, so to move a whole group you move the section marker and then the questions as needed.

## Skip logic and branching

Any input question can now branch the respondent forward based on their answer. In the question editor there is a Skip logic panel where you add rules of the form: if the answer is, is not, contains, is answered, or is empty, then go to a later section or end the survey. Rules are checked from top to bottom and the first match wins.

When the respondent moves on from a page, the rules on that page are evaluated. A matching rule either jumps ahead to the chosen section (skipping everything in between) or finishes the survey early. Targets are limited to sections that come later in the form, so branches always move forward and cannot loop.

Navigation stays sane: the Back button follows the actual path the respondent took, so it returns to the page they came from rather than re-showing a section that was skipped. Questions on skipped pages are treated as not required, so a branch that jumps past required questions still lets the respondent submit. This pairs with display logic (show or hide a single question) and with sections, giving both question level and section level control over the flow.

Note: the page counter shows linear position and does not try to predict the shortened path a branch produces.

## Piped text

You can now weave an earlier answer into text shown later in the same response, so a form can address people by what they told you. A reference looks like a question label wrapped in double braces, for example writing Thanks, {{Your name}} produces Thanks, Ada once someone answers the question labelled Your name.

References work in question text, section titles and descriptions, text and graphic blocks, and the thank-you screen. On the thank-you settings there is an insert answer picker that drops the right reference in for you, and you can also type a reference by hand anywhere. References resolve by the question label, or by its internal id, and a reference to a question that has not been answered yet simply shows nothing.

This pairs naturally with branching: you can route someone to a section and greet them there using an answer they already gave.

## Per-option quotas

Multiple choice questions can now cap how many people pick a given choice. On the question card, each choice has a small number box next to it: set a number to limit that choice, or leave it blank for no limit.

On the public form, a choice that has reached its limit is shown but cannot be selected. In a list it is dimmed and marked Full; in a dropdown it reads (full) and is disabled. The counts are live, computed from the responses received so far, so choices close automatically as they fill.

Renaming a choice keeps its limit attached to it. This works for both single and multiple selection and for the dropdown display.

Two things to know. Enforcement is soft, like the overall response cap and the meeting slot capacity: the count and the new submission are not a single atomic step, so a burst of simultaneous submissions could push a choice slightly over its limit. And if every choice on a required question fills up, respondents cannot complete that question, so for tightly capped forms it is worth pairing option limits with the overall response cap in Form settings or watching the totals.

## White-label and custom branding

Public forms can now be fully branded under Form settings, in a new section called Branding and white-label.

There is a toggle to hide the powered by zetetiq footer on the public form and the thank-you and closed screens. There is a browser tab title field, so the form can show its own title in the browser tab instead of the default. There is a favicon upload, so the form shows a custom icon in the browser tab. And there is a custom CSS box for advanced styling.

Custom CSS applies to the public form only, never to the builder or dashboard. It targets the same class names the public form uses, such as .fcard for the card, .ftitle and .fdesc for the title and description, .opt for choice rows, .finput for inputs, and .submit for the submit button. The title, favicon, and CSS are applied when the form loads and cleaned up when the visitor leaves, so they never leak into the rest of the app.

## Image choice question

A new question type where respondents pick from a grid of images rather than text. Each choice has an image upload and an optional caption, and you can set how many columns the grid uses (one to six). It supports either a single answer or multiple answers, like multiple choice.

Images are downscaled on upload to keep forms light. The stored answer is the caption, or Choice N if there is no caption, so add captions if you want readable analytics and exports. Analytics shows a bar chart of how often each choice was picked.

## Number question

A numeric input with validation. You can set a minimum, a maximum, and a step, choose whether decimals are allowed, and add a prefix or suffix (for example a dollar sign before or a percent sign after). There is also a placeholder field.

On submit it checks that the value is a valid number, is within the range, and is a whole number when decimals are turned off. Analytics shows the average, minimum, and maximum across responses.

## Drill-down question

Cascading dropdowns, where each choice reveals the next level. A common use is Country then State then City. You build the choices as a tree in the left panel: type a top-level option, then use the plus button on its row to add the options that appear once it is picked, and so on to any depth. Each level can be given a name (such as Country or State) that labels its dropdown.

On the form, picking an option reveals the next dropdown; changing a higher-level choice clears the lower ones. When the question is required, the respondent must drill all the way to a final option with no further choices. The stored answer is the full path (for example Europe / France), which is what appears in exports, and analytics shows a bar chart of the most common full paths.

## Scoring and quiz mode

Forms can now be scored, turning them into quizzes or assessments. Enable it under Form settings in the Scoring section. There is a second toggle to show the score on the thank-you screen.

Once scoring is on, a Scoring panel appears in the editor for multiple choice and image choice questions, with a points box for each choice. Set the points a choice is worth (they can be negative). For a single-answer question the most a respondent can earn is the highest single choice; for a multiple-answer question it is the sum of all the positive choices, so a respondent earns points for each correct pick.

The score is calculated on the server when the form is submitted, so it cannot be tampered with from the browser. It is stored with the response, returned to the thank-you screen when that option is on (shown as You scored X out of Y), added to the CSV export as score and max_score columns, and summarized in analytics as a Quiz scores card with the average, the highest, and the number of scored responses. Renaming a multiple choice option keeps its points (and its quota) attached. Only multiple choice and image choice are scored for now; other types contribute nothing to the total.

## Dark mode on forms

The light and dark theme now extends to the form: both the builder preview and the public form follow the theme (the toggle in the top bar, which also remembers a visitor's choice and respects their system setting). Previously the form area was always light. The form keeps its own accent color in either mode; only the surfaces and text switch.

The one exception is embedded forms. When a form is opened in embed mode (the URL carries embed=1, which is how the embed question loads it) it always renders light with a transparent background and no footer, so it blends into whatever page is hosting it.

## Schedulers, e-sign documents, and embedding

The top bar now has two buttons next to New form: New schedule and New esign. New schedule creates a form pre-built as a meeting scheduler (a time-slot question); New esign creates one pre-built as a signable document (an upload-and-sign question). These are ordinary forms tagged with a kind, so they are shareable on their own, show a small Scheduler or E-sign badge on the dashboard, and collect their own responses.

Once you have made one, you can drop it into any other form with the new Embedded item question. In the question editor, pick one of your schedulers or e-sign documents from the list (only those two kinds appear, not regular forms), and optionally give it a heading. On the public form it renders inline in an iframe that loads the chosen item in embed mode. Because it is a real embed, the booking or signature is recorded on the embedded item, not on the host form. The Embedded item question is not counted in the host form's analytics, export, or webhook.

Technically: kind lives in schema.settings.kind (schedule or esign), so no database change was needed. listForms now also returns kind (via json_extract) for the dashboard badge and the embed picker. The embed question stores embedUser, embedSlug, embedTitle, and embedKind, and the renderer builds the iframe src as /{embedUser}/{embedSlug}?embed=1.

## Landing page

The pre-sign-in page is now a full marketing landing page rather than a bare login card. It has a top bar (wordmark, theme toggle, sign in), a hero with a headline, subtext, the Continue with Google and Admin login actions, and a small themed mock of a form. Below that are a twelve-card feature grid, a row of all twenty-three question type names (pulled live from the type registry so it never drifts), a what-makes-it-different band (self-hosted, your data, no buzzwords, free for early users), a three-step how-it-works, a closing call to action, and a footer linking to zetetiq.pages.dev.

It is built from the existing app design tokens, so it themes for light and dark automatically and uses the Mozilla fonts like the rest of the app chrome. When someone is already signed in, the login actions are replaced with Go to dashboard. The admin login modal and the Google sign-in flow are unchanged. The component lives in the Landing function with a small LIcon helper for the feature icons; copy avoids em dashes and the word for machine intelligence per the brand rules.

## Carry forward

Multiple choice and rank order questions can now reuse an earlier multiple choice question's choices. In the question editor there is a Carry forward section: turn on Use choices from an earlier question, pick which earlier multiple choice question to pull from, and choose whether to carry the choices the respondent selected, the ones they did not select, or all choices shown. The later question's options (for multiple choice) or items (for rank order) are then built from that earlier answer at fill time, so the options set on the question directly are ignored.

If nothing applies, for example they selected nothing and you carried the selected ones, the question shows a short note and is skipped for validation so the form is not blocked. The choices update live if the respondent changes the earlier answer on the same page. Implementation: a carryItems(q, answers, questions) helper resolves the list; the form renderer swaps it into options or items before rendering, and the validation and request-response checks skip a carry question whose resolved list is empty. Source questions are limited to multiple choice for now.

## Custom font

The Theme panel now has a Custom font field that takes a Google Fonts name such as Poppins. Previously a custom font could only be set through a saved brand kit, and it only showed in the builder preview. Now it can be set directly, and it is also applied on the live public form: the font is loaded on the public page and used in the form's font stack. The font name lives in theme.customFont and is loaded with the existing loadGoogleFont helper, which de-duplicates link tags.

## Scheduler and e-sign as editor panels (supersedes the top-bar buttons)

The earlier approach of New schedule and New esign buttons in the top bar has been removed. The top bar is back to a single New form button. Instead, the form editor's left rail now has two extra panels next to Questions, Theme, Brand studio, and Form settings: a Scheduler panel and an E-sign panel.

Each panel works on the current form. If the form has no scheduling question yet, the Scheduler panel shows a short explanation and an Add a scheduler button that inserts one; once it exists, the panel shows a heading field and the full slot and capacity editor, with an Open in questions shortcut. The E-sign panel behaves the same way for a document to sign (add, then upload the document and place fields). While either panel is open the canvas on the right shows the live form preview, so you see the scheduler or document as you configure it. On mobile, both also appear in the Tools menu.

These panels simply find or create the relevant question (scheduling or document_sign) in the current form and reuse the existing SchedulingControls and DocumentControls, so there is no separate data model. The kind tag, dashboard badges, and blankForm seeding from the old approach are left in place but are no longer reachable from the UI.

The Embedded item question, which used to be limited to schedulers and e-sign documents, now lists all of your forms so you can embed any form into another. Its help text was updated to match.

## Side by side question type

A new question type, side by side, brings the question count to twenty-four. It is a grid where each row is an item and each column is its own dropdown with its own choices, so respondents rate every item across several dimensions at once (for example Importance and Satisfaction). In the editor the Side by side panel has a rows box, one item per line, and a list of columns, each with a label and a comma separated set of choices, plus Add column and Remove column.

The answer is stored as a nested object, item label to a map of column label to chosen value. To make that readable everywhere, both the backend formatAnswer and the frontend answerToText were extended to render a nested object as item: (column=value, column=value); ordinary flat objects like the matrix answer are unchanged. In analytics it shows a compact table of the most common answer for each item and column, and the summary report lists the same per item. The CSV export carries the flattened string in the question's single column. Rows and columns are keyed by their labels in the answer, like the matrix type, so renaming a row or column starts a fresh column of data.

## Hot spot question type

A new question type, hot spot, brings the count to twenty-five. The owner uploads an image and respondents tap or click a single point on it. The answer is stored as a position in percent of the image width and height, so it stays correct at any display size. The renderer shows the image with a crosshair cursor and drops a pin where the person clicks; tapping again moves it.

In analytics the question shows a heatmap: the image with a translucent dot for every response, so overlapping clicks read as hotter areas. The image is stored as a data URL in the form like other image features, the click handler converts the cursor position against the image's bounding box into a clamped 0 to 100 coordinate, and validation requires a point when the question is required. The editor panel is a single image upload plus the usual response toggles.

## MaxDiff question type

A best and worst (MaxDiff) type brings the count to twenty-six. The owner lists items; the respondent picks the single best and the single worst from the set. The renderer is a three column table (Best radio, item, Worst radio); picking an item as best clears it from worst and vice versa, so the same item can never be both. Validation, when required, asks for a best and a worst that differ. In analytics each item gets a preference score equal to times chosen best minus times chosen worst, drawn as a sorted bar chart, and the PDF report carries the same scores.

## A/B testing (experiments)

Form settings now include an experiment toggle and a variant count of two to four. When it is on, each respondent is assigned a random variant letter (A, B, ...) once on load and it travels with their submission into the response metadata. Any question can be set, under its Advanced panel, to show only in a chosen variant; the form renderer hides questions whose variant does not match the visitor's. Analytics gain an A/B variants card showing how responses split, and the CSV export gains a variant column. The variant assignment is purely client side and recorded server side, with no separate table.

## Field mapping for exports (CRM keys)

Each input question can carry an export field name (letters, numbers, underscore) under its Advanced panel. When set, it becomes the column header in CSV exports and the key in two machine readable payloads: a new mapped object in the webhook payload (export name to answer) and the question key in the programmatic API schema. This lets a CRM or downstream system map answers by a stable name rather than the human label.

## Programmatic API

A form can generate an API key from its settings (Integrations, Programmatic API). Two server to server endpoints accept it. GET /api/v1/forms/{formId} returns the form's title and its input questions (id, export key, type, label, required) plus settings with the key stripped. POST /api/v1/forms/{formId}/responses with a JSON body of the shape { data: { questionId: value } } records a response, running the same scoring, availability, and webhook path as a normal submission. Both authenticate by Authorization: Bearer KEY or a key query parameter. The key check reads settings.apiKey on the form; revoking clears it. No CORS headers are sent, so this is intended for server to server use, not browser fetches from another origin.

## Multilingual forms

A form can be offered in several languages. Settings carry multilingual (bool), languages (an array of {code, label} where the first is the default), and translations (a map of language code to a flat key to string map). Translation keys are title, desc, q:<id>:label, q:<id>:desc, q:<id>:opt:<i>, q:<id>:item:<i>, q:<id>:row:<i>, q:<id>:col:<i>, endTitle, endMessage, and ui:back / ui:next / ui:submit. localizeForm(form, lang) returns a copy of the form with those strings swapped for the chosen language, falling back to the default text wherever a translation is blank; formStrings(form) lists every translatable string for the editor. The public form shows a language picker at the top of the card whenever more than one language is defined, and switching re-renders titles, descriptions, question labels, choices, matrix rows and columns, the thank-you screen, and the navigation buttons. Switching keeps answers, since they are keyed by question id. In the builder a globe icon opens a Translations panel (mode i18n) for managing languages and entering translations per target language. Exports and webhooks keep using the default-language labels and keys, so column names stay stable across languages. Limitations in this version: the closed-form message and inline validation messages are not translated, drill-down levels and signed-document field labels are not translated, choice translations are keyed by index so reordering choices can misalign them, and the builder canvas preview shows the default language.

## Multiple choice Other (write-in)

Single-select multiple choice (list display, not dropdown) can include an Other choice with a free-text box, controlled by q.allowOther with an optional q.otherLabel. When the respondent selects Other a write-in field appears and the typed text becomes the stored answer (a value that is not one of the defined choices). A required question treats an empty Other selection as unanswered. The write-in is stored as a plain string, so it flows through CSV, webhooks, and the API like any other answer and appears in analytics as its own value. Multi-select Other is not implemented in this version.

## Custom pattern validation

Text entry questions gain a Custom pattern validation option: q.validation set to pattern with q.pattern holding a regular expression and q.patternMessage the message shown when the input does not match. Validation runs on the client before submission; an invalid regular expression is caught and ignored so a bad pattern never blocks a respondent. Empty optional fields still pass.

## Disqualification (screen out)

Skip logic gains a Disqualify (screen out) target alongside the existing End of survey target. When a rule sends a respondent there, the form submits immediately and shows a dedicated screen-out message taken from settings.screenoutTitle and settings.screenoutMessage (with sensible defaults), rather than the normal thank-you, and the score and end button are hidden. The skipped-questions confirmation is bypassed since the early exit is intentional. The response is still recorded so screen-out rates can be analyzed, flagged with meta.disqualified set to true; the client sends disqualified in the submission body and the backend stores it. A redirect URL is skipped for a screen-out so the message is shown. Settings has a Disqualification section with the heading and message fields. Surfacing a screen-out count in analytics and the CSV is a future enhancement; the flag is stored now.

## Minimum and maximum choices

Multi-select multiple choice supports a minimum and a maximum number of choices through q.minSel and q.maxSel (0 means no limit), edited in the question controls when multiple answers are allowed. The renderer prevents checking beyond the maximum (unchecking is always allowed), and validation enforces the minimum when the question is required or the respondent has selected at least one option, and the maximum always. Messages read like Please select at least 2 and Please select no more than 3.

## Placing fields on a signed document

Document-sign fields can be positioned directly on an image document instead of only listed beneath it. Each field may carry x and y as percentages of the document plus a placed flag. In the question controls, when the document is an image, a Position on the document section shows the document; you pick a field then click where it should sit, and click a pin to remove it. On the public form, placed fields render as overlays anchored at their coordinates (compact inputs for text and date, a checkbox for check, a small signature pad for signature), while any unplaced fields and all fields on a PDF document continue to appear in the list below. PDF documents are not supported for coordinate placement in this version because overlays over the PDF viewer are unreliable; their fields stay in the list.

## Embedded data from the URL

Hidden field questions capture a value with no visible input. With source set to url they read a named URL query parameter (q.key) when the form loads, falling back to q.value if the parameter is absent; with source set to fixed they store q.value directly. The captured value is submitted with the response like any answer, which is useful for passing campaign tags or identifiers through a link such as a form URL ending in ?source=newsletter.

## Conjoint (choice based)

A conjoint question (the twenty-seventh type) presents bundles of attribute levels and asks the respondent to choose their preferred bundle across several tasks. The question carries attributes (each with a name and a list of levels), a number of tasks, options per task (two to four), and an optional None choice. Profiles are generated by a seeded pseudo-random sequence keyed to the question id, so the design is fixed and identical for every respondent in this version, with distinct profiles within a task where the attribute space allows. The renderer shows each task as a small table of attribute rows by option columns with a Choose control per option; the answer is an array with one entry per task, each entry being the chosen profile as a map of attribute name to level, or a None marker. Required means every task must be answered. Analytics counts how often each level appeared in a chosen bundle, shown as per-attribute bars in the dashboard and in the PDF report. The answer is keyed by attribute name (consistent with how the app keys other text-based answers), so renaming an attribute after responses arrive can de-align older data. Full part-worth utility estimation is out of scope; this is a count-based summary.

## Exclusive None choice

Multi-select multiple choice can offer an exclusive choice through q.noneOption with a label in q.noneLabel (default None of the above), shown when multiple answers are allowed. Selecting it clears every other selection, and selecting any normal choice clears it. When it is selected the question counts as answered and the minimum and maximum choice checks are bypassed, since it is a complete standalone answer.

## Screen-out reporting

The disqualified flag recorded for screen-outs is now surfaced. The dashboard analytics show a Screen-outs card with the count and the share of responses, and the CSV export adds a disqualified column (yes or no) whenever any response in the set was screened out. Screen-out responses are surfaced rather than hidden, so screen-out rates are visible without changing the stored data.

## Relative response dates

Dashboard form cards show the latest response time relative to now via fmtAgo: today and yesterday for those two days, then a count like 4 days ago up to 60 days, after which it shows the full date. The card reads Last response followed by that phrase.

## More starting templates

FORM_TEMPLATES now includes ten starting points: customer feedback, contact form, event RSVP, quick poll, job application (with a resume upload), event registration, an NPS survey, lead capture, a scored quiz (points plus scoring on), and a support satisfaction form. They appear in the Start your form chooser and anywhere templates are listed.

## Basic and advanced question types

The Add a question picker first shows a short list of common types defined in BASIC_TYPES (multiple choice, text, number, NPS, star rating, matrix, date, rank order, file upload, page break, section, and info text). An Advanced question types toggle reveals the remaining specialized types (image choice, hot spot, side by side, MaxDiff, conjoint, constant sum, contact fields, drill down, slider, signature, scheduling, payment, document sign, embed, and hidden field). The full set is unchanged; this only changes how the picker is organized.

## Drag and drop (pointer based)

Reordering questions in the builder uses a pointer based drag rather than native HTML5 drag. On pointer down on the handle the card lifts and follows the pointer with no browser ghost image; the other cards slide open a gap with a transform transition to show where the card will land; on release the order is committed. A FLIP layout effect animates any remaining position changes, and it is suppressed for the commit frame so the cards settle without a jump. Touch is supported because the handle sets touch-action none. The drag computes the target index from the pointer position against the cards' midpoints, so varying card heights are handled.

## Landing copy: no self-hosting claims

The landing no longer describes the product as self-hosted. The Self-hosted value card became Private by default (no ads or third-party tracking), the data card now talks about exporting responses as CSV or PDF, the file uploads line dropped the storage bucket mention, the hero eyebrow reads Experience management simplified, and the hero subheading dropped you run yourself.

## Themed dropdowns and color picker

The root sets color-scheme (light on the default theme, dark on the dark theme) so native controls such as select option lists, date and time pickers, and scrollbars render in the active theme rather than always light. The color picker swatch wrapper uses the card background variable instead of a hardcoded white, so it sits correctly in dark mode. The custom menu popovers already used theme variables.

## Scheduling and e-sign get their own page

In the step builder (the non-conversational path), a scheduling question or a document sign question is forced onto its own page: a page boundary is inserted before and after it so it is never combined with other questions. Conversational mode already placed every question on its own step. This is why the booking and signing experiences each stand alone for the respondent.

## Scheduling configuration

The scheduling question now carries a full configuration set, edited from its dedicated left panel: meetingType (one_on_one, group, collective, round_robin); capacity (spots per slot for group or seminar); hosts (name and email list, used for collective and round robin); calendars (booleans for google, outlook, office365, icloud, exchange); bufferBefore and bufferAfter in minutes; dailyCap (max meetings per day); minNotice in hours; timezoneAuto; reminders (a list of {channel email or sms, value, unit minutes/hours/days}); followup ({enabled, message, link}); and video (none, zoom, meet, teams, webex). The make default seeds one host-less one on one with a 24 hour email reminder.

On the booking page the renderer applies the parts that are computable in the browser: it shows times in the visitor's detected time zone when timezoneAuto is on, hides any slot that falls inside the minimum notice window, shows spots left and a Full state for group slots using the live booking counts, surfaces the chosen video provider and a Group session tag in the meeting card, and notes round robin or collective host matching. Slots are still entered manually.

External pieces are configured but require connection to function: pulling busy times from Google, Outlook, Office 365, iCloud, or Exchange; generating real Zoom, Meet, Teams, or Webex links; and actually sending email or SMS reminders and follow-ups. These need the relevant accounts and credentials wired up on the backend; until then they are stored as settings and degrade gracefully (no link or message is sent, and availability is driven only by the manually entered slots). Buffer times, the daily cap, and round robin rotation are stored and intended to apply once calendar sync is connected.

## Add to calendar on confirmation

After someone books a time, the thank-you screen shows a booking card with the chosen day and time, the meeting title and duration, the location, and the video provider when set, plus an Add to calendar button. The button builds a standard .ics file in the browser (buildICS produces a VCALENDAR with a VEVENT whose DTSTART is the slot and DTEND is the slot plus the meeting duration, escaping commas and semicolons) and downloads it via a Blob, so it works without any external service and opens in any calendar app. The booking card only shows for non-screened-out responses that answered a scheduling question.

## Server-side scheduling enforcement

submitResponse now validates scheduling answers on the server before recording, so the booking page checks are no longer only advisory. For each scheduling question that was answered it confirms the chosen start matches a defined slot (otherwise slot_invalid), rejects a time in the past (slot_past), rejects a time inside the minimum notice window (slot_too_soon), and counts existing bookings for that slot to reject one that is at or over capacity (slot_full), using the per-slot capacity or the group capacity default. Each rejection returns HTTP 409 with the error code, and the public form turns these into clear messages such as asking the visitor to choose another time. The capacity count is read at submit time, so under heavy concurrency it is still close to but not a hard atomic guarantee.

## Completion time analytics

The analytics tab shows a Time to complete card with the average and median seconds taken to finish, plus how many responses were timed. It reads meta.seconds, which the renderer records as the elapsed time from first paint to submit, and skips responses without a timing. Values are formatted as seconds under a minute and minutes and seconds above.

## Search and filter responses

The responses tab has a search box plus a status filter and, when A/B testing is on, a variant filter. Search matches the query against every answer in a response and against the location and device, all lowercased. Status filters to completed or screened-out using meta.disqualified. The variant filter matches meta.variant. The count line shows how many of the total are visible, and the table shows a short message when nothing matches. Export still covers the full set, not just the filtered view.

## Limit to one response per browser

A new setting, oneResponse, makes the public form remember that this browser already submitted. On a successful non-screened-out submit the form writes a per-form key into localStorage (zq-done-<formId>), and on load it shows a short You already responded screen instead of the form when that key is present. It is a light client-side check that a visitor can bypass by clearing browser data, which is stated in the setting hint, and it never blocks anyone who has not submitted.

## PDF rendering for signed documents

Signed documents that are PDFs now render page by page instead of in a bare iframe. A PdfDoc component lazy-loads PDF.js from cdnjs (pdf.min.js plus the matching worker), opens the data URL with getDocument, and draws each page onto its own canvas stacked vertically. Fields can be positioned directly on any page: the field model gained an optional page index (defaulting to page zero, which keeps image placement unchanged), and DocumentControls renders the PDF pages with click-to-place, storing page plus x and y percent per field. On the public form, placed fields overlay the correct page using the same percent coordinates, and unplaced fields still list below.

PDF.js is loaded from a CDN at view time, so it needs network access. If the library fails to load or a PDF cannot be parsed, PdfDoc reports an error and the renderer falls back to the previous iframe with every field shown in the list below, and the builder shows a short notice instead of inline placement. Canvas rendering itself is exercised in real browsers; the structure, paging, overlays, positioning, placement math, and fallback were verified in tests with PDF.js mocked.

## Beveled / imprint theming

The flat one pixel lines were replaced with a soft beveled, pressed into paper look. Four CSS variables (bevel raise, press, inset, soft) hold layered box shadows and are themed per context: light values at the app root and inside the form scope and embed, darker values under the dark theme for both the app and the form. Raised elements (buttons, cards, calendar chips, the add question items, slot rows) carry a top highlight with a faint drop; pressed elements (inputs, selects, textareas, toggle tracks, segment groups) carry an inner shadow. Buttons and the form submit and call to action depress on click. Selected options and slot buttons read as pushed in. Toggle knobs sit raised in their inset groove. Because the variables are defined for light, dark, and embedded contexts, the texture follows the theme everywhere.

## Group availability poll

Scheduling now has two modes, chosen with a segmented control at the top of the question editor. Booking page is the existing one host picks a slot flow. Group availability poll is a When2meet style overlap finder. The model rides in the question JSON, so no schema change: mode, pollMode (specific dates or repeating weekdays), dates, weekdays, dateOnly, startHour, endHour, slotMinutes, ifNeeded, hideResponses.

Editor (PollConfig): pick specific calendar dates (add and remove chips) or days of the week; set a daily time window with a start hour, end hour, and a one hour or thirty minute slot size; turn the hourly grid off entirely with days only polling; allow an if needed paint state; and hide individual responses from participants.

Public form (PollRenderer): the participant enters their name, then clicks and drags to paint when they are free across a grid of time rows by date or weekday columns. The drag uses pointer events with touch action disabled, so it paints on touchscreens as well as with a mouse, and the grid scrolls horizontally when there are many columns. When if needed is enabled, a second paint mode marks suboptimal but acceptable times. Times are labelled in the visitor's own time zone and the zone is named under the grid. Below the grid, unless responses are hidden, a color coded heatmap shows the same layout with cell shading by how many people are free; hovering a cell lists exactly who is free. The heatmap reflects everyone who has responded as of page load.

Backend: the public form GET aggregates poll responses per poll question into total, per slot counts, per slot if needed counts, and a people list of names with their picks; when responses are hidden the people list is omitted but the counts remain so the heatmap still works. A poll answer is stored like any other response in the response JSON as name, available slot keys, and maybe slot keys. Slot keys are the date (or d plus weekday index) optionally followed by T and the time, so date only polls collapse to one key per column.

Verified in tests: the paint grid renders the right rows by columns, drag paints multiple cells, the heatmap renders with correct density and counts, the editor switches modes and shows the weekday picker, and the backend returns correct totals and counts and respects hidden responses.

Deferred and honestly out of scope this round. External connections (not built, would need credentials wired in Cloudflare): two way calendar autofill and multiple account overlay from Google, Outlook, or Apple; direct calendar booking that injects the final event onto everyone's calendars; automated email alerts when a participant responds. Live behavior: the heatmap refreshes on page load and after a submit rather than updating in real time across other open tabs. Advanced poll features not yet built: per participant local password plus self service editing of a prior submission, sub group filtering of the heatmap, poll duplication, and CSV export of the raw availability matrix. The core poll (config, paint grid, heatmap, time zone, if needed, hidden responses, dates and weekdays and days only) is complete.

## Settings cog icon

The gear icon in the builder toolbar was a malformed transcription with uneven teeth. It was replaced with the clean Feather settings path (one path plus a center circle), so it renders as a proper symmetric cog.

## Advanced poll features

Four self contained additions on top of the group availability poll, all verified in tests:

Question duplication (already wired through the card menu Duplicate action) was hardened: it now deep copies the question with a JSON round trip and regenerates the ids of nested items (fields, slots, hosts, reminders, attributes), so a duplicated poll, signing document, or scheduling block is fully independent of the original and no longer shares child ids. This covers poll duplication (clone the grid parameters into a fresh question).

Sub group filtering on the heatmap: when individual responses are shown and more than one person has responded, a row of name chips appears above the group heatmap. Selecting one or more names recomputes the heatmap density and the hover lists from just that subset; an Everyone chip clears the filter. This is computed on the client from the people list the public endpoint returns.

CSV availability matrix: on the form dashboard Responses tab, when the form has a poll question, an Availability grid CSV button downloads a matrix built client side. Rows are the poll slots, columns are participants, cells are Yes or If needed or blank, and a final column counts how many are available per slot. Built by a pure buildPollMatrix helper that was unit tested.

Password protected entry and self service editing: a participant may set an optional password with their name. On submit the password is hashed (SHA-256) before storage; the plaintext is never persisted. A submission with the same name updates the existing response in place rather than adding a duplicate, but only when the password matches; a mismatch is rejected with name_locked and the public form shows a clear message. A poll-load endpoint lets a participant pull their previous availability back into the grid to edit it (the Load mine button), returning a locked flag if the password does not match. Identity is keyed on the first poll question's name within the form.

Backend surface added: POST /api/public/:formId/poll-load, a sha256hex helper, and an upsert path in submitResponse (UPDATE existing row vs INSERT new) that also strips the raw password and stores only its hash under pw inside the answer. The poll aggregation already omits pw from the people list, so hashes never leak to participants.

Still deferred (need external connections): two way calendar autofill and multi account overlay, direct calendar booking, and email alerts. The password is a local poll password to stop others overwriting a name; it is not account authentication and is intentionally low stakes.

## Response management and form duplication

Three data management additions, all verified in tests.

Response deletion: the Responses tab now has a Delete button on every row (with a confirm) and a Clear all button next to the export controls. They call DELETE /api/forms/:id/responses/:rid and DELETE /api/forms/:id/responses, both owner checked. The row list updates in place after a single delete, and Clear all empties the list.

Form duplication: the form view has a Duplicate button that calls POST /api/forms/:id/duplicate. The copy gets a fresh id and a unique slug, the title gains a (copy) suffix, the theme and full schema are carried over, and it is created closed (a draft) so it does not go live on a half ready duplicate. After duplicating, the app navigates to the new form.

Poll finalize: for a group poll, the Responses tab shows a Group poll panel listing the most available time slots (counted from the submitted availability) with a Set as final button on each. Choosing one writes finalSlot onto the poll question through the normal form update, and a Clear option removes it. The public poll then shows a Confirmed banner with the chosen time at the top of the grid. A fmtPollSlot helper renders any slot key shape (specific date with or without time, repeating weekday with or without time). This is the in app half of finalizing a poll; pushing the confirmed event onto external calendars still needs calendar connections and remains deferred.

Backend surface added: DELETE /api/forms/:id/responses/:rid, DELETE /api/forms/:id/responses, and POST /api/forms/:id/duplicate.

## Touch ranking, saved drafts, and quiz review

Three additions this round, all verified in tests.

Rank order on the public form is now pointer based instead of HTML5 drag, so it works on touchscreens. The grip uses onPointerDown with touch action disabled; a window pointermove finds the target row by comparing the pointer Y to each row midpoint (via a refs array and getBoundingClientRect) and reorders live, committing on pointerup. The up and down arrow buttons remain for keyboard and click reordering. The builder reorder was already pointer based; this brings the respondent side in line.

Save and resume: in progress answers are now saved to the visitor's own device (localStorage, keyed zq-draft plus the form id) as they type, and restored automatically on return with a small banner and a Start over button that clears the draft and resets hidden field defaults. The draft is cleared on a successful submit. It is off in preview and only runs on the live form. This is local to the device and not synced to the server.

Quiz answer review: a new setting, shown with scoring, reveals correct answers and explanations on the thank you screen. Multiple choice questions gained an optional explanation field in the scoring section. After submitting, each scored question shows the respondent's answer, a correct or incorrect mark, the correct option(s), and the explanation. Correctness is computed by quizReview: the correct options are those carrying the maximum positive points; a single select answer is correct when it earns the max, and a multi select answer must match the full set of top options.

No backend changes this round; all three are client side.

## Character limits, matrix N/A, and date bounds

Three input controls this round, all verified with unit and render tests. No backend changes.

Text entry gained a maximum length alongside the existing minimum. When set above zero it caps the input with a maxLength attribute and shows a live character counter (current over limit) under the field; the validate function also rejects anything over the cap as a safety net for pasted or programmatic input. Set it in the question's Validation section.

Matrix questions gained an optional N/A column. Turn on Add an N/A column in the matrix settings and a separated N/A choice appears at the end of every row. Picking it counts as an answer, so it satisfies a required matrix; the value is stored as N/A and flows through exports like any other selection.

Date questions gained earliest and latest bounds. Set them in the date question controls and the picker enforces them with min and max attributes, with the validate function rejecting out of range dates and naming the bound in the message. Bounds are absolute calendar dates and string compared in ISO form.

Note: number entry (min, max, step, decimals, prefix, suffix) and constant sum (total enforcement) were already complete and were left as is.

## Brand refresh, full bevel pass, and motion

A visual overhaul this round. No behaviour or backend changes; it is palette, depth, and animation.

Brand colours moved to sand #DDD4C4 and blue #5C88CD. The blue is the primary accent (buttons, links, focus, active states); the sand is the warm page background, with warm off-white cards lifting off it. The light palette, the dark palette (now a warm charcoal rather than cool indigo), the form preview and embed neutrals, and the default new-form theme were all moved onto this. A standalone brand-preview.html in this folder shows the palette and the beveled components side by side in both themes.

The bevel system was reworked so it replaces borders rather than sitting on top of them. Across the app and the form surfaces, chrome elements (buttons, icon buttons, the brand toggle, inputs, selects, text areas, toggles, cards, question cards, segmented controls, chips, add-question items, menus, and the form options, NPS buttons and inputs) drop their one pixel border and define their edge with the bevel instead: a light top highlight and a soft warm shadow below for raised pieces, and a recessed inset for wells. Data grids, table dividers and dashed separators keep their lines, since those are structural rather than control chrome. The light-mode/dark-mode toggle now reads as stamped into the page (a recessed inset) and the toggle switches have a clearly domed knob over a recessed track.

A motion layer was added on top. Interactive elements transition smoothly; buttons lift on hover and push in on press; the toggle knob slides on a slight spring and squishes when pressed; the theme toggle icon turns a little on hover; stars scale on hover; menus and modals animate in (scale and fade from their origin); and each form step fades up as it appears. Everything is gated behind prefers-reduced-motion, which collapses transitions and animations for visitors who ask their system to reduce motion, so it stays practical and accessible.

Motion and bevel are driven by CSS custom properties (the ease curves, durations, the focus ring, and the four bevel shadows) defined per theme, so future tuning is one place.

## Themed controls, tooltips, and the language sub-menu

UI work this round; no backend changes.

Every native dropdown is gone. A single Select component now backs all 35 dropdowns across the app and the public form. It reads the option children it is given, renders a beveled button that opens a themed list (matching the rest of the app, light and dark, with the selected row highlighted), closes on outside click or Escape, and reports changes through the same onChange shape the old selects used, so call sites did not have to change beyond the tag name. In the public form the highlight uses the form's own accent colour.

The colour picker no longer uses the browser control. It is a beveled swatch palette plus a hex field in a themed popover, so it looks the same in both modes and on every platform. A full spectrum picker can be added later if you want arbitrary colours beyond the palette and hex.

Icon buttons now show a themed tooltip that follows the cursor on hover, instead of the browser's default. A small effect at the app root watches for any element carrying a title (or data-tip), shows a dark card near the pointer with that text, suppresses the native tooltip while hovering, and restores it on leave or click. It is keyboard and pointer safe and cleans up after itself.

Language and translation settings are no longer a separate panel. They are a collapsible sub-menu inside Form settings: a Languages and translation row that expands to the full language list, add-language controls, and the per-string translation editor. The standalone translations rail button was removed.

The bevel was also crisped this pass based on feedback that raised pieces felt a little heavy: a brighter top highlight and a lighter, less brown bottom edge and drop, so buttons and cards read closer to the segmented Booking / Group poll control. The brand-preview.html in this folder reflects the change. Bevel strength remains a small set of per-theme variables if further tuning is wanted.

Still to come on the theming request: themed date and time pickers (a calendar popover and a time list), which are larger custom widgets and are next.

## Off-white background, natural pop, stamped cards

Visual tuning this round; no backend changes.

The page background moved from the darker sand to a warm off-white. The builder background, which was still a leftover lavender, now uses the same off-white, and its rail and panel dividers were softened from hard borders into the bevel language. A stray purple highlight on the active builder rail icon is now the brand blue.

Raised elements were reworked to pop more naturally. Instead of a dark bottom inset line, buttons now carry a top sheen (a soft light gradient over the top of the surface) plus a real, soft drop shadow beneath, so they read as lifted off the page rather than embossed into it. The sheen is a per-theme variable and is removed the moment a control is pressed or shows an active or recessed state, so pressing still reads as pushing in. Recessed things (text fields, pressed buttons, the segmented control) were already right and were left alone.

Homepage cards (every form card and every template card) are now stamped into the page: no border, the same colour as the background, recessed by the inset bevel, with no hover lift. They read as wells in the surface rather than floating tiles.

Ghost buttons are flat at rest and gain the stamped-in inset look only on hover (and a deeper press on click), so they feel pressable without competing with solid buttons.

Copy changes: the landing tagline is now Human-centered Experience Management, and the footer carries a copyright line, (c) 2026 Zetetiq XM.

The brand-preview.html in this folder was updated to show the off-white background, the new natural pop on buttons, the ghost-on-hover behaviour, and a stamped homepage card.

## Themed date and time pickers

The last native browser controls are gone. No backend changes.

A DateField component now backs every date input across the app and the public form (the date question, the form-field date kind, the poll date adder, and the earliest/latest bounds in date settings). It shows a beveled field with the date formatted in words and a small calendar glyph, and opens a themed month calendar with weekday headers, previous and next month navigation, the selected day and today marked, a Clear action, and out-of-range days disabled when minimum or maximum bounds are set. In the public form the selected day uses the form's own accent colour. It reports changes in the same shape the native input did, so call sites only changed by name.

A DateTimeField backs the date-and-time inputs (the scheduling slot adder and the form open and close times). It opens the same calendar with a time row beneath it. The time row is a TimeField built from three themed dropdowns (hour, minute in five-minute steps plus whatever exact minute is already stored, and AM or PM), so the whole picker is themed and consistent in both light and dark, with no operating-system date or time popups anywhere.

The calendar and the time selects reuse the existing themed Select and bevel system, so they match the rest of the app, animate in like the other popovers, close on outside click or Escape, and respect reduced motion.

This completes the themed-control request: dropdowns, the colour picker, and now date and time are all in-app rather than browser controls.

## Sheen removed

The top sheen gradient on raised controls was removed on feedback that it was too much. It was a single per-theme variable, now set to none, so raised buttons keep their lift from the soft drop shadow and the crisp top highlight only, with no gloss. The variable remains in place if a faint sheen is ever wanted again.

## Recessed controls, crash fix, debossed loading mark, and dark mode contrast

This turn made the resting state of the whole interface flush and recessed, with action buttons popping out only on interaction, and fixed a crash on the response detail view.

Button system. Every control now sits recessed at rest, carrying the inset bevel. Action buttons, the primary and danger buttons, the icon buttons, the Google button, and the form submit, call to action, navigation, slot, and NPS buttons rise on hover, lifting one pixel with the raised bevel and a soft drop, then press back in on click. Ghost buttons stay invisible at rest and pop out the same way on hover. Inputs, selects, color triggers, and date fields stay recessed at all times, since they are fields rather than actions. Answer options sit recessed and press in when selected. The blue focus ring was removed from buttons and from the select, color, and date triggers, so the bevel itself is the only edge; keyboard focus is still shown through the bevel rather than a blue outline. Real text inputs keep their focus ring for accessibility. There is a matching block at the end of the style sheet labelled v6.

Sand to off-white, finished. The remaining warm sand values were swept to the off-white family across the app and the brand preview. The hover tone, the two line tones, and the form and embed surfaces all moved off sand. Dark mode was left as is, since its palette was never sand.

Response detail crash, fixed. Opening an individual response that contained a group availability poll threw React error 31, objects are not valid as a React child, with keys available, maybe, name, and pw. The cause was `fmtSlot`, which on being handed a poll answer object ran `new Date` on it, got an invalid date, and returned the object itself, which then rendered as a child. A new `fmtPollAnswer` formats a poll answer into a readable line, for example a name then Available and Maybe lists. `fmtSlot` now guards against objects and delegates to it, and the response detail, the table preview cells, and the search text all route poll answers through it. Verified that `fmtSlot` of a poll object now returns a string and that a plain slot string still formats as before.

Overview card themed. The dashboard and form summary card, labelled Overview, is now a recessed bevel well using the card surface in both light and dark. The earlier hardcoded near black background in dark mode was removed, and the one pixel border was replaced by the inset bevel so it matches the rest of the recessed interface.

Dark mode contrast pass. Several controls still carried leftover light purple backgrounds from an earlier palette. In dark mode these painted a light surface under light text, which read as invisible. The table row hover, the question title focus, the choice input focus and placeholder, the add question hover, the trash box header, the form ghost button hover, and the Google button hover were all moved to the themed hover and soft ink variables, which flip correctly in dark mode. The poll heatmap count was given a light value in dark mode so it stays legible on the green tint.

Loading mark, debossed. When the app is loading it now shows the zetetiq wordmark in the same color as the background, carved in with a light lower edge and a dark upper edge so it reads as pressed into the page. There is an initial boot splash with the wordmark, shown before the app mounts and cleared automatically when it does, and the same recessed mark is used for the in app loading states. The same debossed treatment was applied to the wordmark on PDF report exports, drawn in two tones taken from the form's primary color rather than in flat white. If a header image logo is set, the report still shows that image instead.

Theme toggle on the form. The light and dark toggle is now present while filling out a form, fixed at the top right, on the main fill view and the thank you view. It is hidden in embed mode. It controls the same app theme, and the form surface already restyles for dark mode.

Note on what can only be confirmed live. The recessed resting look and the strength of the hover pop, the depth of the debossed loading mark in both modes, the emboss on the PDF wordmark, and the dark mode contrast across every screen are visual matters best judged on the live deploy. All are small variable or value tweaks if any need nudging.

## Calendar sync and email reminders

This turn added two ways to get bookings into a calendar, plus email confirmations and reminders. None of it requires Google OAuth, so it works inside the no terminal, dashboard only setup.

Calendar subscription feed. Under a form's settings, in Notifications and calendar, the owner can turn on Publish a calendar subscription of bookings. That generates a random token, stored in the form settings as `calToken`, and shows a feed URL of the form `https://your-domain/api/cal/FORMID/TOKEN/booked.ics`. The owner adds that URL once as a subscribed calendar in Google Calendar (Other calendars, From URL), Apple Calendar (File, New Calendar Subscription), or Outlook (Add calendar, Subscribe from web). Every booking made on that form then shows up in their calendar as an event with the meeting title, time, location, and the respondent's name, refreshed on the calendar app's own schedule. The endpoint is public but unguessable, gated on the token, and returns 404 for a wrong or missing token. Each respondent still gets an Add to calendar button on the confirmation screen as before. The route lives in the backend as `calendarFeed`, and the event list is built by `bookingEventsFrom` and `buildBookingICS`.

Email confirmations and owner notifications. These send at submit time through Resend, a transactional email service with a free tier. They are wired with `context.waitUntil` so they never slow down the response. In the same settings section: Notify this email on new responses sends the owner a short email on every submission, and for bookings it includes the meeting details. Email a confirmation to people who book a time sends the respondent a confirmation with the meeting details and a calendar invite attached as an .ics file. The respondent's email is found automatically as the first email address in their answers, for example from a contact form field, so no extra configuration is needed. The sending helper is `mailSend`, and the submit hook is `notifyOnSubmit`.

Reminders. Turn on Send a reminder before booked meetings and set the hours before. Because Cloudflare Pages has no built in scheduler, reminders are sent by an endpoint that an external scheduler calls on a timer: `GET https://your-domain/api/cron/reminders?key=CRON_SECRET`. Each call scans bookings that start within the lead window and have not been reminded yet, sends a reminder email with the invite, and marks the response so it is never reminded twice. The endpoint requires the `CRON_SECRET` to match and returns 401 otherwise. A free service like cron-job.org pointed at that URL every fifteen or thirty minutes is enough, or a small Cloudflare cron Worker. The handler is `cronReminders`.

Setup, all in the Cloudflare dashboard. Add three secrets under the Pages project, Settings, Environment variables: `RESEND_API_KEY` from a Resend account, `MAIL_FROM` as the from address such as `zetetiq <bookings@yourdomain.com>` using a domain you verify in Resend (without it Resend only allows its test sender), and `CRON_SECRET` as any long random string that you also put in the cron URL. If `RESEND_API_KEY` is missing, all email features quietly do nothing and the rest of the app is unaffected. The calendar feed needs no secrets.

Verified with stubbed email and a fake database: the feed returns a valid calendar with the right event and attendee and 404s on a bad token, a booking submission fires both the owner notice and the attendee confirmation with the invite attached, the reminder endpoint sends once for a soon meeting and sets the reminded flag, rejects a wrong key with 401, and does not re-send on a second run.

What is still possible later. Two way Google or Microsoft calendar sync with real free busy, so the owner's existing busy times remove slots and bookings write directly onto their calendar, needs OAuth credentials wired into Cloudflare and is the natural next step once the Google sign in stub is finished. SMS reminders would need a provider like Twilio with its own key and per message cost.
