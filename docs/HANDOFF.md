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
- A scheduling question in booking mode has an Availability choice: Specific times (the original manual slot list) or A time window. With a time window the owner sets a date range, the days of the week, daily hours (12 hour pickers), and a slot length, and respondents pick a time inside it. Both modes render the same booker: a month calendar where only days that have availability are selectable, plus a list of valid time slots for the chosen day with a 12h and 24h toggle. Respondents can only ever pick a real in window time, so they never hit a validation error. Times are still validated on the server, so a forged time outside the window, off the slot grid, in the past, or over capacity is rejected.
- Calendar free/busy blocking (Google and Outlook): a person connects a calendar from two places, the account menu and the scheduling question's Connected calendars section (both render the same connect control). zetetiq stores only a refresh token and the account email per provider in users.calendar (one JSON column holding google and outlook). On any public form with a time window scheduling question, the owner's busy times are fetched (Google free/busy, and Microsoft Graph calendarView which works for both personal and work accounts), merged, and those slots are removed automatically. The whole path degrades gracefully: if nothing is connected, a token is missing, the column does not exist, or a provider errors, busy is empty and every slot shows, so booking and sign in never break. Apple Calendar is shown as a coming soon placeholder (iCloud has no clean free/busy API).

### Calendar setup (full steps)
Run this migration in D1 once before any calendar connects: ALTER TABLE users ADD COLUMN calendar TEXT;  (a fresh database from schema.sql already has it). This single JSON column holds both Google and Outlook. Without it, connecting reports a migration error and no blocking happens, but nothing else breaks. The OAuth round trips and the live free/busy lookups can only be verified on the deployed site, not in the headless tests.

Google Calendar:
1. In the Google Cloud Console (Google Auth Platform), in the same project and OAuth client used for sign in, enable the Google Calendar API under APIs and Services, Library.
2. On the consent screen, under Data Access, add the scope https://www.googleapis.com/auth/calendar.freebusy.
3. Under Clients, open the OAuth client and add the redirect URI https://YOUR-DOMAIN/api/calendar/google/callback (the sign in callback /api/auth/google/callback stays as well). It reuses GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, no new variables.
4. Publishing status: keep it In production, not Testing. In Testing mode Google refresh tokens expire after 7 days and calendar blocking silently stops; In production they persist. An unverified production app shows an OAuth user cap (default 100) that only limits how many people can connect a calendar while the app is unverified. Sign in and form responses are not capped. To go past 100 calendar connections, verify the app through the Verification Center.
5. Error 403 access_denied means the consent screen is in Testing without your account under Test users, or in production with the sensitive scope unverified. Add yourself as a test user or use In production, retry, then click Advanced and continue past the unverified warning.

Outlook and Microsoft 365 (optional):
1. At portal.azure.com open App registrations, then New registration. Name it zetetiq (this name shows on the consent screen).
2. Supported account types: Accounts in any organizational directory and personal Microsoft accounts (multitenant plus personal). This matches the common sign in endpoint and lets both work and outlook.com accounts connect.
3. Redirect URI: platform Web, value https://YOUR-DOMAIN/api/calendar/outlook/callback.
4. From the Overview page, copy the Application (client) ID into the variable MS_CLIENT_ID.
5. Certificates and secrets, New client secret, set an expiry, then copy the secret Value (not the Secret ID) into MS_CLIENT_SECRET. The value is shown only once.
6. API permissions, Add a permission, Microsoft Graph, Delegated permissions, add Calendars.Read and offline_access. No admin consent is needed for personal accounts.
7. In Cloudflare add MS_CLIENT_ID and MS_CLIENT_SECRET (Production, mark the secret as a secret) and redeploy. Until both are set, Connect Outlook reports that it is not configured.

Credential maintenance (important):
- The Microsoft client secret expires; Azure caps the lifetime at 24 months. Before it expires, create a new client secret under Certificates and secrets, update MS_CLIENT_SECRET in Cloudflare, and redeploy. Once a secret expires, Connect Outlook and Outlook busy blocking stop working until it is rotated; Google and sign in are unaffected.
- The Google client secret does not expire on a fixed schedule, but if you ever rotate it, update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Cloudflare and redeploy.

## Stripe billing (self serve paid plans, now wired)
Pro ($9 per month) and Premium ($35 per month) are purchasable through Stripe Checkout. Card details go to Stripe, never to zetetiq, so there is no PCI burden. Education and nonprofit stay on the apply flow (the free Pro level granted by an admin), and Enterprise stays contact based. Free users see Upgrade to Pro and Upgrade to Premium on the dashboard plan bar; paid users see Manage billing, which opens the Stripe customer portal to change or cancel. A signed webhook flips the user's plan: completing checkout sets the plan to pro or premium, and a cancelled, unpaid, or deleted subscription drops them back to free. Plan changes from Stripe and from the admin both write the same plan column.

### Stripe setup
Run this migration once: ALTER TABLE users ADD COLUMN billing TEXT;  (a fresh database from schema.sql already has it). The live round trips can only be verified on the deployed site.
1. Create a Stripe account at dashboard.stripe.com. Do the first run in Test mode (the toggle near the top) before going live.
2. Create two recurring Products with monthly Prices: Pro at 9.00 per month and Premium at 35.00 per month. Open each Price and copy its ID (it starts with price_).
3. Developers, API keys: copy the Secret key (sk_test_ in test mode, sk_live_ in live mode).
4. Developers, Webhooks, Add endpoint. URL https://YOUR-DOMAIN/api/billing/webhook. Select these events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted. After creating it, copy the Signing secret (it starts with whsec_).
5. Settings, Billing, Customer portal: turn the customer portal on and save once, or the Manage billing link will error.
6. In Cloudflare add four variables (mark the key and secret as secret): STRIPE_SECRET_KEY (sk_...), STRIPE_WEBHOOK_SECRET (whsec_...), STRIPE_PRICE_PRO (the Pro price_ ID), STRIPE_PRICE_PREMIUM (the Premium price_ ID). Redeploy. Until the secret key and price IDs are set, the Upgrade buttons report that billing is not set up and nothing breaks.
7. Going live: switch Stripe to live mode, recreate the Products and Prices and the webhook endpoint there, and swap all four variables for their live values (sk_live_, the live whsec_, and the live price_ IDs), then redeploy. Test and live mode have separate keys, prices, and webhooks.

### Billing notes
- The webhook is verified with the Stripe signature (HMAC SHA-256 over the timestamp and the raw request body); forged or tampered requests are rejected, so keep STRIPE_WEBHOOK_SECRET private.
- No payment data is stored in zetetiq; it keeps only the Stripe customer and subscription ids and the resulting plan, in the billing column.

## Deferred (next session)
- A proper programmatic interface translation (locale files) as an alternative to the Google website widget.
- Apple Calendar free/busy (no Apple OAuth calendar API; only iCloud CalDAV with an app specific password, left as a coming soon placeholder).

## Deploy
Upload index.html and functions/api/[[path]].js, run the schema migration in D1, set ADMIN_EMAIL, then redeploy (Deployments, Retry). Existing variables: SESSION_SECRET, ADMIN_PASSWORD, GOOGLE_CLIENT_ID and SECRET, RESEND_API_KEY and MAIL_FROM, CRON_SECRET. Optional for Outlook calendar: MS_CLIENT_ID and MS_CLIENT_SECRET (the Microsoft secret expires within 24 months and must be rotated, see Calendar setup). Optional for Stripe billing: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_PREMIUM (see Stripe setup). Bindings: DB (D1), AI (Workers AI, named exactly AI), FILES (R2).

## Build recipe (for whoever rebuilds index.html)
Extract the single text/babel script from src/app.source.html and transform it with Babel using the react preset and runtime classic (the automatic runtime produces a blank page). Reassemble the shell, inject the boot splash and the resilient React loader (unpkg with a jsDelivr fallback), and strip the app source comment from the deployed file. Verify there is no import statement and no jsx-runtime reference, then node --check the backend.
