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
