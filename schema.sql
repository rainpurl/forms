-- forms.katr.es D1 schema
-- Run once against your D1 database (see README for how).

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  google_id    TEXT UNIQUE,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  plan         TEXT DEFAULT 'free',   -- free | edu | pro | premium | enterprise
  plan_request TEXT,                  -- JSON: { kind, org, note, status, at } for education/nonprofit applications
  calendar     TEXT,                  -- JSON: { google: {...}, outlook: {...} } for free/busy blocking
  billing      TEXT,                  -- JSON: { customer, subscription, status, plan, at } for Stripe subscriptions
  stripe_account TEXT,                -- connected Stripe account id (acct_...) for collecting respondent payments
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- MIGRATION for existing databases (run these two once if the users table already exists;
-- they are safe to skip on a brand new database created from the block above):
--   ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free';
--   ALTER TABLE users ADD COLUMN stripe_account TEXT;
--   ALTER TABLE users ADD COLUMN plan_request TEXT;
--   ALTER TABLE users ADD COLUMN calendar TEXT;   -- only needed for Google and Outlook free/busy blocking
--   ALTER TABLE users ADD COLUMN billing TEXT;    -- only needed for Stripe subscriptions

CREATE TABLE IF NOT EXISTS forms (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  slug        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  theme       TEXT NOT NULL,   -- JSON: {primary, secondary, accent, font}
  schema      TEXT NOT NULL,   -- JSON: { questions: [...], settings: {...} }
  is_open     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_owner_slug ON forms(owner_id, slug);
CREATE INDEX IF NOT EXISTS idx_forms_owner ON forms(owner_id);

CREATE TABLE IF NOT EXISTS responses (
  id          TEXT PRIMARY KEY,
  form_id     TEXT NOT NULL,
  data        TEXT NOT NULL,   -- JSON: { questionId: answer }
  meta        TEXT,            -- JSON: { country, city, region, browser, os, viewport, ... }
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (form_id) REFERENCES forms(id)
);
CREATE INDEX IF NOT EXISTS idx_responses_form ON responses(form_id);
CREATE INDEX IF NOT EXISTS idx_responses_created ON responses(form_id, created_at);

-- Cache for Workers AI summaries so we only spend neurons when data changes.
-- key examples: 'dash:<userId>', 'form:<formId>'
CREATE TABLE IF NOT EXISTS ai_summaries (
  key         TEXT PRIMARY KEY,
  summary     TEXT NOT NULL,
  signature   TEXT NOT NULL,   -- changes when underlying data changes
  model       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brand_kits (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brand_owner ON brand_kits (owner_id);

-- Teams / organizations (enterprise shared workspaces).
CREATE TABLE IF NOT EXISTS orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  owner_id    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS org_members (
  org_id      TEXT,
  user_id     TEXT,
  role        TEXT DEFAULT 'member',   -- owner | admin | member
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members (user_id);
CREATE TABLE IF NOT EXISTS org_invites (
  id          TEXT PRIMARY KEY,
  org_id      TEXT,
  email       TEXT,
  role        TEXT DEFAULT 'member',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON org_invites (email);

-- Forms can belong to a team (shared with all members). NULL = personal.
-- Migration on existing databases:
--   ALTER TABLE forms ADD COLUMN org_id TEXT;
