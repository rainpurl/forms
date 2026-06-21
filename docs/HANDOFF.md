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

## Custom domain (zetetiq.com)
The app reads the request origin for every redirect, so OAuth callbacks, Stripe return URLs, and share links all switch to whatever domain serves the page. Almost nothing in the code is hardcoded. Steps to move to zetetiq.com:

1. Cloudflare Pages: open the Pages project, go to Custom domains, add zetetiq.com (and www.zetetiq.com if you want it). If the domain DNS is on Cloudflare it configures automatically. Both zetetiq.com and the old pages.dev address will serve the same app.
2. Google Cloud (OAuth client): under Authorized JavaScript origins add https://zetetiq.com. Under Authorized redirect URIs add both https://zetetiq.com/api/auth/google/callback (sign in) and https://zetetiq.com/api/calendar/google/callback (calendar). Keep the pages.dev entries too so both domains keep working.
3. Microsoft Azure (app registration): add the redirect URI https://zetetiq.com/api/calendar/outlook/callback. Keep the pages.dev one too.
4. Stripe: the checkout success and cancel URLs and the billing portal return URL are built from the origin, so they switch to zetetiq.com automatically when checkout starts there. The webhook endpoint in the Stripe dashboard can stay on pages.dev (it still reaches the app) or you can add or switch it to https://zetetiq.com/api/billing/webhook.
5. Code: the only hardcoded links were the footer "powered by" and the landing footer; both now point to https://zetetiq.com. Redeploy after uploading the new index.html. No environment variable or schema changes are needed.

Sign in works the same from the navbar and the homepage buttons (identical handler, both go to /api/auth/google/start). If the homepage button does not complete on the live site, it is the Google redirect URI for the new domain, so confirm the auth callback above is registered.

## Latest changes (also live)
Builder polish and e-sign placement improvements.
- The Add a question dialog no longer has the gray divider lines, and the advanced question types are now just a third section you scroll to rather than hidden behind a toggle. The whole dialog scrolls as one list.
- For document e-signing, new fields (text boxes, checkboxes, circles, signatures) start at a smaller default size, so they need less resizing.
- The Place fields on the document button is now a large, full width primary button so it is easy to find.
- In the placement view, the field palette is now pinned to the top: as you scroll down a long document, the row of field types stays in view so you do not have to scroll back up to grab one.

Only index.html changed this release. Upload index.html and redeploy. No backend change and no migration.

## Previous release
Reordering questions in the builder was rebuilt from scratch. Dragging a question by its handle now picks the card up and moves it with the cursor, the other cards slide out of the way to open a gap, and the card settles into its new slot when you let go. The new engine uses pointer capture on the handle, so the drag keeps tracking even if the cursor moves quickly or leaves the card, and it works the same with a mouse or on a touch screen. The handle is also larger and clearer now.

Only index.html changed this release. Upload index.html and redeploy. No backend change and no migration.

## Previous release: respondent payments
This release adds respondent payments: form owners can collect money from the people who fill out a form, paid out to the owner's own Stripe account.

### Respondent payments (Stripe Connect)
- The owner connects their Stripe account once from Account then Payments (Connect Stripe). This uses Stripe Connect, so payments go straight to the owner's Stripe balance and zetetiq does not take a cut.
- Per form, in Settings then Payments, turn on "Require a payment to submit this form" and set an amount, currency, and a short label. The toggle only appears once Stripe is connected.
- Respondents fill out the form, then are sent to Stripe's hosted checkout to pay. Their response is saved immediately as unpaid and flips to paid once the payment completes (confirmed both by the return from checkout and by webhook). The owner sees a Paid or Unpaid chip on each response and the amount in the response detail.
- There is also a separate, older payment question type that just shows a button linking to a payment link you make yourself; that is unchanged. The new Settings option is the integrated pay-to-submit flow.

Setup, one time:
1. In the Stripe Dashboard, enable Connect and copy the platform's OAuth client id (starts with ca_). In Connect settings, add the redirect URI https://zetetiq.com/api/connect/callback (and the pages.dev equivalent if used).
2. In Cloudflare Pages, add an environment variable STRIPE_CONNECT_CLIENT_ID set to that ca_ value. (The existing STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are reused.)
3. On the existing Stripe webhook endpoint, make sure it also listens to events on connected accounts so checkout.session.completed from a respondent's payment is delivered. The return-from-checkout confirmation works even without this, but the webhook is the reliable backstop.
4. Run the database migration below and redeploy.

Migration (D1):
  ALTER TABLE forms ADD COLUMN org_id TEXT;   -- only if not already added for teams
  ALTER TABLE users ADD COLUMN stripe_account TEXT;
The stripe_account column is the only new one this release. It is also in schema.sql.

Upload index.html and functions/api/[[path]].js, add STRIPE_CONNECT_CLIENT_ID, run the migration, and redeploy.

### Still open (larger items, not done)
True SAML or OIDC single sign-on for Enterprise, Apple/iCloud and Exchange calendar free/busy, and maintained-string localization. Possible payment follow-ons: letting respondents choose a quantity, variable amounts, applying a platform fee, and refund handling from the response view.

## Recent changes
- Custom form link (slug). In form Settings there is now a "Link" field showing your username prefix and an editable slug, the part after /username/ in the form's web address. It accepts letters, numbers, and hyphens. Saving applies it; if the slug collides with another of your forms it gets a numeric suffix and the field updates to show the real one. Works on first publish and on later edits. The previous link stops working once changed.
- Per-day availability hours for time-window scheduling. In the scheduler builder, the time window section has a "Set different hours for each day" toggle. With it on, each selected weekday gets its own From and To hours, so you can offer, say, Monday 9 to 5 and Saturday 8 to 12. With it off it behaves as before with one window for all days. The respondent's available slots and the server-side slot validation both honor the per-day hours.

Both of these touched the backend, so index.html and functions/api/[[path]].js both need uploading and a redeploy. No database change (slug column already exists; the per-day hours live inside the form schema JSON).
## Recent changes
- Reverted the colored button experiment. The radial center-to-edge gradient looked wrong, so the blue primary and red danger buttons are back to the simple recessed look at rest (matching the white controls), lifting on hover and pressing on click.
- Email is confirmed working end to end. The earlier bounces were stale, generated before the Cloudflare destination address finished verifying; a fresh send after verification settled delivers normally.

## Recent changes
- Colored buttons (the blue primary and red danger) no longer use the inset recessed look. At rest they now have a radial gradient: the full color sits in the center and fades into the surface color by the edges, with a soft raised bevel so they still read as buttons. On hover they fill to the solid darker color and lift; on click they press in. Text stays light over the colored core. The gradient stops (color holds to about 42 percent, fades to the surface by the edge) are easy to retune in the ".btn.primary" and ".btn.danger" rules if the fade should be stronger or weaker.

## Recent changes
- Support links to support@zetetiq.com are now in three places: a "Contact support" button in the account menu (the top right dropdown), a "Support" link in the landing page footer, and the "Contact us about Enterprise" line already in the upgrade picker. All are plain mailto links.
- The Enterprise pricing card (the "Let's talk" tier) now has a "Connect" button that opens an email to support@zetetiq.com with an Enterprise enquiry subject line.
- Email is operational: receiving via Cloudflare Email Routing and sending as support@zetetiq.com via Gmail with Resend SMTP are set up and working.

## Recent changes
- The top navigation bar is now a single recessed bar with no gray underline. The inset bevel gives it a carved look that matches the inputs and the plan bar. The builder top bar was updated the same way for consistency.
- Plan bar: there is now an "Upgrade" button right next to the plan name for anyone who is not already on Premium or Enterprise (so Free, Education, and Pro all see it, including Education users who previously had no upgrade path). Clicking it opens a small picker. Free sees Pro and Premium, Education and Pro see Premium, and there is a line to email support@zetetiq.com about Enterprise. The picker uses the existing Stripe checkout. The separate upgrade buttons that used to sit on the right of the plan bar were folded into this picker; the right side now keeps the education or nonprofit apply link and Manage billing.

## Recent changes
- Admin console now shows a "Question type usage" panel above the applications list. It lists every question type used across all forms, with a bar and a count, sorted from most to least used. The labels match the builder names.
- Admin console users table has an Actions column with a Delete button on each non-admin user. It asks for confirmation, then removes that user along with all of their forms, responses, and uploaded files. The admin account cannot be deleted.
- Pricing: the second card is now titled "EDU/Non-profit" with no eyebrow badge, the description reads "Free for students, educators, and 501 (c) 3 non profits.", and it lists "Dedicated support" as a perk.
- Removed the "free for early users" and "while zetetiq is getting started" wording from the landing page (the differentiator card, the subheading, and the closing call to action).

### Support email (support@zetetiq.com) for free
You can send and receive at support@zetetiq.com at no cost by combining two free services.

Receiving (Cloudflare Email Routing, free):
1. In the Cloudflare dashboard, open the zetetiq.com zone, go to Email, Email Routing, and enable it. Cloudflare adds the needed MX and TXT records automatically since the domain is already on Cloudflare.
2. Under Routing rules, add a custom address support@zetetiq.com and set the destination to your real inbox (for example your Gmail). Confirm the verification email Cloudflare sends to that inbox.
3. Optionally add a catch-all so anything @zetetiq.com forwards to you.
Incoming mail to support@zetetiq.com now lands in your inbox. Cloudflare Email Routing only forwards, it does not send.

Sending as support@zetetiq.com (Gmail "Send mail as", free):
Cloudflare cannot send, so use a free SMTP relay. The simplest path reuses the Resend account already set up for this app:
1. In Resend, add and verify zetetiq.com as a sending domain (add the DKIM and SPF records Resend shows to Cloudflare DNS).
2. In Resend, create an SMTP credential. Resend SMTP host is smtp.resend.com, port 587 (STARTTLS), username "resend", password is the API key.
3. In Gmail, Settings, Accounts and import, "Send mail as", Add another email address. Enter Name and support@zetetiq.com, untick "Treat as an alias" if you want replies to come from support@. For SMTP use the Resend host, port 587, username resend, password the API key. Gmail sends a confirmation to support@zetetiq.com, which arrives via the Cloudflare forwarding you set up, click the link.
Now Gmail can compose and reply as support@zetetiq.com, and replies to received mail will go out from that address. A free alternative SMTP if you prefer not to use Resend is Brevo, which has a free tier with SMTP.

Optional, transactional sender: once zetetiq.com is verified in Resend you can also change the MAIL_FROM environment variable to a zetetiq.com address (for example "zetetiq <support@zetetiq.com>") so the app's own emails come from the domain. Redeploy after changing it.

The "Dedicated support" perk on the EDU/Non-profit plan is a promise to those users, so support@zetetiq.com is the address to publish for it.

## Troubleshooting: "550 5.1.1 Address does not exist" when emailing support@zetetiq.com

This bounce comes from Cloudflare's mail server (route1.mx.cloudflare.net), which means DNS and MX are pointed at Cloudflare correctly and the problem is only that Email Routing has no active route for support@zetetiq.com right now. Sending from support@ is unaffected. Fix it in the Cloudflare dashboard, zetetiq.com zone, Email, Email Routing:

1. Confirm Email Routing status shows Enabled (not a setup banner).
2. Open the Destination addresses tab. The Gmail you forward to must show Verified. If it shows Pending, resend the verification and click the link in that Gmail. Cloudflare will not deliver to an unverified destination.
3. Open the Routing rules tab, Custom addresses. There must be a row for support@zetetiq.com with action Send to your verified Gmail and the toggle on. If it is missing, create it. If it exists but is off, enable it. If its destination is unverified, do step 2 first.
4. Most robust safety net: enable the Catch-all address (Routing rules, Catch-all) pointed at the same verified Gmail, so any address at zetetiq.com forwards even without a specific custom row.
5. Wait a minute for the change to take effect, then send a fresh test to support@zetetiq.com.

Likely cause here: the support@ custom address was removed or disabled, or the earlier Gmail confirmation arrived via a catch-all that was later turned off. Recreating or enabling the support@ rule (or the catch-all) resolves it.

## Recent changes
- Document e-sign placement is back in a large centered modal. The side panel has an upload and a "Place fields on the document" button; clicking it opens a wide modal with the document and the field palette, so there is room to drop fields precisely. Drag a field type onto the document, or click a type then click a spot. Placed fields can be dragged to move and dragged by the corner dot to resize, and default to a standard size per type.
- Field types are now text box, circle, checkbox, and signature. The X option was removed and the old "Check" is labelled "Checkbox".
- The signature box (draw or type) is a screen-centered modal, so clicking a signature field opens it in the middle of the viewport rather than wherever the field sits, which matters for long or multipage PDFs.
- Form makers can download a filled copy of the document from a response. In Responses, open a response and use "Download filled document" under a document e-sign answer. It composites the typed text, marks, and signatures (drawn, or typed in the cursive font) at their positions and saves a PDF, for image documents and PDFs including multipage. Generation runs in the browser with the response open.
- Theming: booking time slots and the form back button no longer have a gray border, they use the plain recessed look. Blue and red buttons are now simply recessed at rest like the white controls, with the raised white lip removed; they lift on hover and press on click. Red delete buttons no longer turn white with white text on hover.
- Connecting Outlook now shows "Outlook Calendar connected" instead of the Google message.

## Recent changes
- The loading and boot wordmark no longer has the doubled look. It was a background-colored glyph with two offset shadows (light below and dark above), which read as two ghosts. It is now a faint visible glyph with a single soft highlight, so it reads as gently carved instead of doubled. The same single-shadow treatment was applied to the navbar and builder wordmark.
- The current plan and limits bar now sits to the right of the good morning greeting instead of on its own row below it.
- Footer links point to zetetiq.com (see the custom domain section above).
- The homepage hero sits above the decorative mockup in the stacking order, in case that element was ever intercepting clicks on the sign in button.

## Recent changes
- Document e-sign was rebuilt around an inline drag-and-drop editor. Add a document (image or PDF) and it shows in a large preview with a field palette right above it: text box, circle, check, x, and signature. Drag a field type onto the document, or click a type then click where it goes; drag a placed field to move it, and use the small red x to remove it. The old separate place-fields modal and the side list of fields are gone, and a new e-sign starts with no fields so you place exactly what you need.
- Signing supports drawn or typed signatures. The person clicks a signature field, then either draws with a finger or mouse, or switches to the Type tab and types their name, which renders in the Monsieur La Doulaise cursive font. Typed signatures show in that same cursive font in the responses view; drawn ones show as the captured image.
- Field behavior on the document: text box renders in Inter, circle, check, and x are click-to-toggle marks, and signature opens the draw-or-type panel. Older forms built with the previous field model (labelled text, long, date, checkbox) still render in a list below the document for backward compatibility.
- Drag positioning, canvas drawing, and the cursive font can only be confirmed on the live deploy. The headless tests cover structure, placing and removing fields, the toggle marks, the signature panel tabs, and the typed preview.
- The favicon is now the brand blue (it was an off brand purple) with more padding around the glyph.
- On a form overview page: the View form button is no longer underlined, and the share-link box is a recessed off-white well instead of the old gray.
- Recent control polish that is also live: the theme toggle is carved into the page rather than a bordered square, the blue primary buttons lost their harsh white top rim, every builder toggle is a uniform size, and the recessed wordmark is deeper and now also appears in the builder top bar.

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
