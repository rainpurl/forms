-- forms.katr.es D1 schema
-- Run once against your D1 database (see README for how).

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  google_id   TEXT UNIQUE,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

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
