# zetetiq handoff

zetetiq is a forms and surveys builder (a Qualtrics alternative). Cloudflare Pages (static) plus Pages Functions (catch all /api/*), D1 (binding DB), Workers AI (binding AI), R2 (binding FILES). The whole app is a single React file compiled to a static index.html, with an ESM backend at functions/api/[[path]].js. Rain uploads files through the GitHub web interface and manages Cloudflare in the dashboard.

Spelling is always "zetetiq", lowercase q, everywhere. The product is never described as self hosted in the interface. No em or en dashes and no AI terminology in user visible text. Sentence case, clinical voice.

## Files in this package
- index.html: the compiled app (do not hand edit; it is built from src/app.source.html).
- functions/api/[[path]].js: the backend (this is the source, edited in place).
- schema.sql: the D1 schema, including the new plan columns and a migration block.
- _routes.json, _redirects: Pages config.
- src/app.source.html: the editable React source (single Babel script).
- docs/brand-preview.html: a standalone visual reference of the palette and components.

## Plans and tiers (live in this build)
Stored on users.plan (free, edu, pro, premium, enterprise). The admin account is always treated as enterprise.

- free: all 27 question types, up to 5 forms, 100 responses per form, 5 MB uploads. No CSV or PDF export, no removing the footer, no custom CSS, no pro features.
- education and nonprofits (edu): the same as pro, at no cost. Automatic for anyone who signs in with a .edu address. Others apply from their dashboard and an admin approves.
- pro (9 per month): up to 100 forms, 1,000 responses per form, 10 MB uploads, CSV and PDF export, remove the footer, white label.
- premium (35 per month): unlimited forms and responses, 1 GB uploads, custom CSS and styling, priority support.
- enterprise (contact): premium plus team support and SSO.

Enforcement is in the backend: form creation cap, per form response cap, upload size cap, export gating, footer and custom CSS gating on the public form, and a proFeatures flag for the pro and above features (custom font, brand studio, export field name, A/B testing, favicon). The free response cap is interpreted per form. There is no payment processor wired (Stripe would be the next step); for now an admin sets paid tiers manually from the admin console, which doubles as the manual grant path after an off platform payment.

Applications: a logged in user applies from the dashboard (education or nonprofit, with an organization name and an optional note). This stores users.plan_request and emails the admin through Resend. The admin console lists pending applications with approve and decline, and has a per user plan selector in the users table.

### Required migration (run once in D1)
The users table gained plan columns. On an existing database, run:
  ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free';
  ALTER TABLE users ADD COLUMN plan_request TEXT;
A brand new database created from schema.sql already has them. Until the migration runs, non admin users fall back to free (the admin is unaffected). Set the ADMIN_EMAIL variable so application emails have a recipient; it falls back to the address parsed from MAIL_FROM.

## This batch (also live)
- Fonts simplified to two built in choices: Sans (Inter, default) and Serif (IBM Plex Serif). The custom font field is pro and above. The brand studio is pro and above. PDF export already matches: serif maps to Times and sans maps to the embedded Inter face, with a Helvetica fallback.
- Export field name, A/B testing, and favicon are pro and above.
- Star rating glyphs are recessed (carved text shadow).
- The account control is now a floating dropdown below the Account button (it was a centered modal that clipped at the top). It holds the username editor and an interface language selector. The language selector uses Google's free website translate widget; verify it live, since it cannot be exercised in the headless tests. The navbar "hey name" was removed.
- The logged in home heading is now a time based greeting (good morning, good afternoon, or good evening, with the first name) instead of "your forms".
- Every near white surface is now #f5f2f0 (paper, card, and former pure whites). Borders, hovers, dark theme text, and the colored accents were left as functional values.
- The date picker can drill into month and year grids, so picking a birthday is a few taps.
- The question picker is reorganized: a top section "Scheduling and signing" with 1-on-1 meeting, Calendar, Calendar group, and Document e-sign; a "Basic questions" section with multiple choice, phone, email, short text, long text, and rank order; everything else under the Advanced toggle. Phone, email, short text, and long text are presets of the text entry type (with validation or paragraph mode preset).
- The zetetiq wordmark in the navbar is recessed with a single soft shadow, which also removes the doubled look on the dots of the i and the q.

## Scheduler time window and calendar free/busy (now live)
- A scheduling question in booking mode now has an Availability choice: Specific times (the original manual slot list) or A time window. With a time window the owner sets a date range, the days of the week, daily hours, and a slot length, and respondents pick a time inside it. A "let people pick any time in the window" toggle switches from fixed slots to a free date and time picker. Times are validated again on the server so a forged time outside the window, off the slot grid, in the past, or over capacity is rejected.
- Google Calendar free/busy blocking: a person connects their Google Calendar from the account menu (Connect Google Calendar). zetetiq stores only a refresh token and the account email in users.calendar. On any public form that has a time window scheduling question, the owner's busy times are fetched through the Google free/busy API and those slots are removed automatically. The whole path degrades gracefully: if the calendar is not connected, the token is missing, the column does not exist, or Google returns an error, busy is treated as empty and every slot is shown, so booking and sign in never break.

### Calendar setup (needed before the connect button works)
1. Run the new migration in D1: ALTER TABLE users ADD COLUMN calendar TEXT;  (a brand new database from schema.sql already has it). Without it, connecting reports a migration error and no busy blocking happens, but nothing else breaks.
2. In the Google Cloud Console for the same OAuth client used for sign in: enable the Google Calendar API, add the scope https://www.googleapis.com/auth/calendar.freebusy to the consent screen, and register the redirect URI https://YOUR-DOMAIN/api/calendar/google/callback. It reuses GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; no new variables.
3. The OAuth round trip and the live free/busy lookup can only be verified on the deployed site, not in the headless tests.

## Deferred (next session)
- A proper programmatic interface translation (locale files) as an alternative to the Google website widget.
- A payment processor for self serve paid upgrades (paid tiers are still set by an admin).

## Deploy
Upload index.html and functions/api/[[path]].js, run the schema migration in D1, set ADMIN_EMAIL, then redeploy (Deployments, Retry). Existing variables: SESSION_SECRET, ADMIN_PASSWORD, GOOGLE_CLIENT_ID and SECRET, RESEND_API_KEY and MAIL_FROM, CRON_SECRET. Bindings: DB (D1), AI (Workers AI, named exactly AI), FILES (R2).

## Build recipe (for whoever rebuilds index.html)
Extract the single text/babel script from src/app.source.html and transform it with Babel using the react preset and runtime classic (the automatic runtime produces a blank page). Reassemble the shell, inject the boot splash and the resilient React loader (unpkg with a jsDelivr fallback), and strip the app source comment from the deployed file. Verify there is no import statement and no jsx-runtime reference, then node --check the backend.
