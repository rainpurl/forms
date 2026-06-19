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

## Forms grid, form fonts, and brand studio

The homepage shows forms as a grid of cards, each previewing the form's title in its own font. Inside a form, the title now matches the form's chosen font. The builder has a new Brand studio panel (swatch icon) for saving a logo, font, and colors as a reusable kit you can apply to any form in one click, including an optional custom Google font. The drag to reorder crash is fixed, and the side panel now uses a palette icon for Theme and a gear icon for Form settings.

One time setup: brand kits need a new brand_kits table. Paste the new CREATE TABLE at the bottom of schema.sql into your D1 console once.

## Scheduling, payments, e-signature, embedding, and per-response PDFs

The builder has new question types for Scheduling (Calendly), Payment (Stripe, PayPal, or any payment link), and E-signature (DocuSign PowerForm). Each works by pasting a provider link; scheduling can embed inline, while payment and e-signature open the provider, which handles the transaction or signing securely. The Share button now also gives a copyable iframe embed code so the form can be placed on any web page. In a form's Responses tab, each response can be exported individually as a themed PDF (per row and from the response detail), in addition to the existing aggregate report.

## Dark mode polish, toggle, fonts, and export branding

Dark mode now themes the Overview card and the builder. The light/dark toggle sits next to the logo and appears in both the top bar and the builder. App chrome (including homepage card titles) uses the Mozilla font; only the form preview and public form use the form's chosen font. The settings icon is a proper gear. Homepage cards are ordered by most recent response and show when the latest response arrived. In PDF exports, an uploaded form logo replaces the zetetiq mark, and the footer reads powered by zetetiq.

## Native scheduling and document signing

Meeting signup and Document to sign are now native question types. Meeting signup lets people book one of your time slots (with per slot capacity) without leaving the form, like a built in Calendly. Document to sign lets you upload an image or PDF and have people fill in fields and draw a signature inside zetetiq, instead of using DocuSign. Both save everything with the response and on the per-response PDF. Payments remain a payment link opened from a button, since card handling is best left to the payment provider.

## Native file uploads

A File upload question type lets forms collect attachments. Files are stored in Cloudflare R2. Choose accepted types, a max size, and single or multiple files. Respondents upload in place; the owner downloads each file from the responses view through an owner only link (files are namespaced per form and access checked). Setup: create a Cloudflare R2 bucket and add a Pages Functions R2 binding named FILES. Without it, the type still appears and uploads show a friendly not set up message. The upload endpoint works only while a form is open and enforces a size cap.

## Multi-section surveys

Organize a form into sections. Add a Section from the question menu; it starts a new page with a title and optional description shown to respondents. Questions after a section card belong to it, up to the next section. Reorder or remove sections like questions. A Randomize section order setting presents sections in random order per respondent. Sections are organizational only and never appear in CSV, analytics, or webhooks.

## Skip logic and branching

Input questions can branch the respondent forward. In the question editor, the Skip logic panel adds rules: if the answer is / is not / contains / is answered / is empty, then go to a later section or end the survey. Rules are checked top to bottom; targets are later sections only (forward, no loops). Back follows the real path, and questions on skipped pages are not required. Works together with display logic and sections.

## Piped text

Weave an earlier answer into later text. Write a reference like a question label in double braces, for example Thanks, {{Your name}}. References work in question text, section titles and descriptions, text and graphic blocks, and the thank-you screen, and the thank-you settings include an insert answer picker. References resolve by question label or id, and an unanswered reference shows nothing.

## Per-option quotas

Cap how many people can pick a multiple choice option. Each choice on the question card has a number box; set a limit or leave it blank for none. On the public form a full choice is shown but not selectable (dimmed and marked Full in a list, (full) in a dropdown), with counts computed live from responses. Renaming a choice keeps its limit. Enforcement is soft (like the response cap), and if every choice on a required question fills, respondents cannot finish it.

## White-label and branding

In Form settings, the Branding and white-label section lets you hide the powered by zetetiq footer, set a custom browser tab title and favicon, and add custom CSS. Custom CSS applies to the public form only and targets its class names (.fcard, .ftitle, .fdesc, .opt, .finput, .submit). Title, favicon, and CSS apply on load and are cleaned up on exit.

## Image choice

Pick from a grid of images instead of text. Each choice has an image and an optional caption; set one to six columns and allow single or multiple answers. The stored answer is the caption (or Choice N), so captions make for readable analytics and exports.

## Number

A numeric input with a minimum, maximum, step, optional decimals, and a prefix or suffix such as a currency or percent symbol. Validation enforces the range and whole numbers when decimals are off. Analytics shows average, min, and max.

## Drill-down

Cascading dropdowns where each pick reveals the next level (for example Country then State then City). Build the choices as a tree and name each level. Changing a parent clears its children, and a required question must be drilled to a leaf. The answer is stored as the full path (Europe / France).

## Scoring and quiz mode

Enable scoring in Form settings to turn a form into a quiz. A points box then appears for each choice on multiple choice and image choice questions. The score is computed server-side on submit, optionally shown on the thank-you screen (You scored X out of Y), exported as score and max_score columns, and summarized in analytics (average, highest, count). Per question, the maximum is the best single choice for single-answer questions and the sum of positive choices for multiple-answer ones. Renaming an option keeps its points.
## Schedulers, e-sign, and embedding

New schedule and New esign in the top bar create a standalone meeting scheduler or signable document (real forms, tagged and shareable, with a dashboard badge). Drop one into any form with the Embedded item question: pick a scheduler or e-sign document and it embeds inline. The booking or signature is recorded on the embedded item, and the embed is excluded from the host form's analytics, export, and webhook.

## Landing page

Signed-out visitors now see a full landing page: a hero with a form mock, a feature grid, the full list of question types, a differentiators band, a how-it-works, and calls to action, all themed for light and dark. Continue with Google and Admin login work as before; signed-in visitors get a Go to dashboard button instead.

## Carry forward

On a multiple choice or rank order question, open Carry forward and reuse an earlier multiple choice question's choices: carry the ones the respondent selected, the ones they did not, or all of them. The later question's choices are built from that earlier answer. If nothing carries over, the question shows a note and does not block submission.

## Custom font

The Theme panel takes a Google Fonts name (for example Poppins). It now applies on the live form as well as the builder preview.

## Scheduler and e-sign panels

Schedulers and e-sign documents are set up inside the form editor, not from the top bar. The editor's left rail has Scheduler and E-sign panels next to Questions, Theme, Brand, and Settings. Each adds and configures that capability in the current form, with a live preview on the right. The top bar has a single New form button. The Embedded item question now lets you embed any of your forms.

## Side by side

A grid question where each row is an item and each column is its own dropdown scale, so people rate every item across several dimensions at once. Set the items (one per line) and the columns (each with a label and comma separated choices) in the Side by side editor panel. It exports as a readable string and shows a per item and column breakdown in analytics. There are now twenty-four question types.

## Hot spot

Upload an image and have people tap or click a point on it (for example, where something is or how they feel about a region). The answer is the point's position in percent, and analytics overlays every response as a heatmap on the image. There are now twenty-five question types.

## MaxDiff (best and worst)

List a set of items and respondents pick the single best and the single worst. Analytics shows a preference score per item (chosen best minus chosen worst). There are now twenty-six question types.

## A/B testing

Turn on an experiment in form settings (two to four variants). Each respondent is randomly assigned a variant, which is recorded with their response, shown in analytics, and included in CSV exports. Set a question's variant under its Advanced panel to show it only to that group.

## Field mapping and the API

Give any question an export field name under Advanced and it becomes the column name in CSV exports and the key in webhook and API payloads. Each form can also generate an API key to fetch its schema and submit responses programmatically: GET and POST against /api/v1/forms/{id}, authenticated with a bearer token or key parameter.

## Multiple languages

Open the Translations panel (the globe in the builder) to offer your form in more than one language. Add languages by code and name; the first is the default. Pick a target language and translate each string, leaving any field blank to fall back to the default. Respondents get a language picker at the top of the form, and switching translates titles, questions, choices, the thank-you screen, and the buttons while keeping their answers.

## An Other choice

For single-select multiple choice, turn on Add an Other choice with a write-in. Respondents who pick Other get a text box, and what they type is saved as their answer.

## Pattern validation

Text questions can validate against a custom pattern (a regular expression) with your own error message, on top of the built-in email, phone, and number checks.

## Disqualifying respondents

In a question's skip logic, choose Disqualify (screen out) as the destination to end the survey for people who do not qualify. They see a screen-out message you set under Form settings, and the response is still recorded so you can measure how many were screened out.

## Limiting how many can be chosen

For multi-select multiple choice you can set a minimum and a maximum number of choices. Respondents cannot tick more than the maximum, and they are reminded if they pick fewer than the minimum.

## Fields on a document

For a document to sign that is an image, you can place fields exactly where they belong: pick a field and click the spot on the document. Placed fields appear right on the page for the signer; anything you do not place still shows in a list below.
