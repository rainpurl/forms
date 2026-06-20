# zetetiq

A forms and surveys builder on Cloudflare Pages, Pages Functions, D1, Workers AI, and R2. The app is a single compiled index.html with an ESM backend at functions/api/[[path]].js.

## Plans
free, education and nonprofits, pro, premium, and enterprise. Free covers all question types with limits (5 forms, 100 responses per form, 5 MB uploads, no export). Education matches pro at no cost and is automatic with a .edu sign in. Pro is 9 per month, premium is 35 per month, enterprise is by contact. See docs/HANDOFF.md for the full feature matrix, the required D1 migration, and the admin approval flow.

## Setup
1. Create the D1 database and run schema.sql (or, on an existing database, the migration in schema.sql).
2. Bind DB (D1), AI (Workers AI, named exactly AI), and FILES (R2) in the Pages project.
3. Set the variables: SESSION_SECRET, ADMIN_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY, MAIL_FROM, ADMIN_EMAIL, CRON_SECRET.
4. Upload the files and deploy. Redeploy after any variable, binding, or schema change.

The admin signs in at /admin with ADMIN_PASSWORD. Everyone else signs in with Google.
