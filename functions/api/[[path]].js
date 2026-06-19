// forms.katr.es API
// Single catch-all Cloudflare Pages Function. Handles every /api/* route.
// Bindings expected: env.DB (D1), env.SESSION_SECRET, env.ADMIN_PASSWORD.

export async function onRequest(context) {
  const { request, env, params } = context;
  const segments = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    if (method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    const res = await route(segments, method, request, env, context);
    return cors(res);
  } catch (err) {
    return cors(json({ error: "server_error", detail: String(err && err.message || err) }, 500));
  }
}

async function route(seg, method, request, env, context) {
  // seg[0] is always "api" because the function lives at /functions/api/.
  const path = seg.slice(0); // e.g. ["auth","admin"] for /api/auth/admin
  const p = path.join("/");

  // ---- auth ----
  if (p === "auth/admin" && method === "POST") return authAdmin(request, env);
  if (p === "auth/logout" && method === "POST") return authLogout();
  if (p === "auth/google/start" && method === "GET") return googleStart(request, env);
  if (p === "auth/google/callback" && method === "GET") return googleCallback(request, env);
  if (p === "me" && method === "GET") return me(request, env);
  if (p === "summary" && method === "GET") return dashSummary(request, env);

  // ---- public (no auth) ----
  // GET /api/public/:username/:slug
  if (path[0] === "public" && path.length === 3 && method === "GET") {
    return publicForm(path[1], path[2], env);
  }
  // POST /api/public/:formId/responses
  if (path[0] === "public" && path.length === 3 && path[2] === "responses" && method === "POST") {
    return submitResponse(path[1], request, env, context);
  }
  if (path[0] === "public" && path.length === 3 && path[2] === "followup" && method === "POST") {
    return followup(path[1], request, env);
  }

  // ---- forms (auth required) ----
  if (path[0] === "forms") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    if (path.length === 1 && method === "GET") return listForms(user, env);
    if (path.length === 1 && method === "POST") return createForm(user, request, env);

    const id = path[1];
    if (path.length === 2 && method === "GET") return getForm(user, id, env);
    if (path.length === 2 && method === "PUT") return updateForm(user, id, request, env);
    if (path.length === 2 && method === "DELETE") return deleteForm(user, id, env);
    if (path.length === 3 && path[2] === "responses" && method === "GET") return listResponses(user, id, env);
    if (path.length === 3 && path[2] === "analytics" && method === "GET") return analytics(user, id, env);
    if (path.length === 3 && path[2] === "export" && method === "GET") return exportCsv(user, id, env);
    if (path.length === 3 && path[2] === "summary" && method === "GET") return formSummary(user, id, request, env);
    if (path.length === 3 && path[2] === "tone" && method === "GET") return toneRead(user, id, request, env);
  }

  return json({ error: "not_found", path: p }, 404);
}

/* ------------------------------------------------------------------ */
/* auth                                                                */
/* ------------------------------------------------------------------ */

async function authAdmin(request, env) {
  const body = await readJson(request);
  const expected = env.ADMIN_PASSWORD || "rain";
  if (!body || body.password !== expected) {
    return json({ error: "invalid_password" }, 401);
  }
  // Ensure the admin user row exists.
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, username, name, email, is_admin) VALUES ('admin', 'admin', 'Rain', NULL, 1)"
  ).run();

  const payload = {
    uid: "admin",
    username: "admin",
    name: "Rain",
    role: "admin",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
  };
  const token = await makeToken(secret(env), payload);
  const res = json({ user: publicUser(payload) });
  res.headers.append("Set-Cookie", sessionCookie(token));
  return res;
}

function authLogout() {
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return res;
}

async function me(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ user: null }, 200);
  return json({ user: publicUser(user) });
}

async function currentUser(request, env) {
  const token = readCookie(request, "session");
  if (!token) return null;
  return verifyToken(secret(env), token);
}

function publicUser(p) {
  return { uid: p.uid, username: p.username, name: p.name, role: p.role };
}

/* ------------------------------------------------------------------ */
/* Google sign in (OAuth 2.0 authorization code flow)                  */
/* ------------------------------------------------------------------ */

function redirectTo(location, cookies) {
  const res = new Response(null, { status: 302, headers: { Location: location } });
  (cookies || []).forEach((c) => res.headers.append("Set-Cookie", c));
  return res;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
}

async function googleStart(request, env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) return redirectTo("/login?google_error=setup");
  const origin = new URL(request.url).origin;
  const redirectUri = origin + "/api/auth/google/callback";
  const state = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, "");
  const auth = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  }).toString();
  const stateCookie = `g_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
  return redirectTo(auth, [stateCookie]);
}

async function googleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (denied) return redirectTo("/login?google_error=denied");
  const cookieState = readCookie(request, "g_state");
  if (!code || !state || !cookieState || state !== cookieState) return redirectTo("/login?google_error=state");

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectTo("/login?google_error=setup");
  const redirectUri = url.origin + "/api/auth/google/callback";

  let claims = null;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
    });
    const tok = await tokenRes.json();
    if (!tok || !tok.id_token) return redirectTo("/login?google_error=token");
    claims = decodeJwtPayload(tok.id_token);
  } catch {
    return redirectTo("/login?google_error=token");
  }
  if (!claims || !claims.sub) return redirectTo("/login?google_error=token");

  const sub = String(claims.sub);
  const email = claims.email ? String(claims.email) : null;
  const name = claims.name ? String(claims.name) : (email || "User");

  let row = await env.DB.prepare("SELECT id, username, name FROM users WHERE google_id = ?").bind(sub).first();
  if (!row) {
    const newId = "g_" + sub;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, username, name, email, google_id, is_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind(newId, email || newId, name, email, sub).run();
    row = { id: newId, username: email || newId, name };
  }

  const payload = {
    uid: row.id,
    username: row.username,
    name: row.name,
    role: "user",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  };
  const token = await makeToken(secret(env), payload);
  const clearState = "g_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
  return redirectTo("/dashboard", [sessionCookie(token), clearState]);
}


/* ------------------------------------------------------------------ */
/* forms CRUD                                                          */
/* ------------------------------------------------------------------ */

async function listForms(user, env) {
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.slug, f.title, f.is_open, f.created_at, u.username,
            (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS responses
     FROM forms f JOIN users u ON u.id = f.owner_id
     WHERE f.owner_id = ?
     ORDER BY f.created_at DESC`
  ).bind(user.uid).all();
  return json({ forms: results || [] });
}

async function createForm(user, request, env) {
  const body = await readJson(request) || {};
  const title = (body.title || "Untitled form").toString().slice(0, 200);
  const slug = await uniqueSlug(env, user.uid, title);
  const id = crypto.randomUUID();
  const theme = JSON.stringify(body.theme || defaultTheme());
  const schema = JSON.stringify(body.schema || { questions: [], settings: { randomizeQuestions: false } });

  await env.DB.prepare(
    `INSERT INTO forms (id, owner_id, slug, title, description, theme, schema, is_open)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, user.uid, slug, title, body.description || "", theme, schema).run();

  return json({ id, slug });
}

async function getForm(user, id, env) {
  const row = await env.DB.prepare(
    `SELECT f.*, u.username FROM forms f JOIN users u ON u.id = f.owner_id WHERE f.id = ?`
  ).bind(id).first();
  if (!row || row.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  return json({ form: hydrateForm(row) });
}

async function updateForm(user, id, request, env) {
  const own = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!own || own.owner_id !== user.uid) return json({ error: "not_found" }, 404);

  const body = await readJson(request) || {};
  const sets = [];
  const vals = [];
  if (typeof body.title === "string") { sets.push("title = ?"); vals.push(body.title.slice(0, 200)); }
  if (typeof body.description === "string") { sets.push("description = ?"); vals.push(body.description); }
  if (body.theme) { sets.push("theme = ?"); vals.push(JSON.stringify(body.theme)); }
  if (body.schema) { sets.push("schema = ?"); vals.push(JSON.stringify(body.schema)); }
  if (typeof body.is_open === "boolean") { sets.push("is_open = ?"); vals.push(body.is_open ? 1 : 0); }
  sets.push("updated_at = datetime('now')");

  if (sets.length === 1) return json({ ok: true }); // nothing but timestamp
  vals.push(id);
  await env.DB.prepare(`UPDATE forms SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

async function deleteForm(user, id, env) {
  const own = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!own || own.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  await env.DB.prepare("DELETE FROM responses WHERE form_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM forms WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* public form + responses                                             */
/* ------------------------------------------------------------------ */

async function publicForm(username, slug, env) {
  const row = await env.DB.prepare(
    `SELECT f.id, f.title, f.description, f.theme, f.schema, f.is_open, u.username, u.name
     FROM forms f JOIN users u ON u.id = f.owner_id
     WHERE u.username = ? AND f.slug = ?`
  ).bind(username, slug).first();
  if (!row) return json({ error: "not_found" }, 404);

  return json({
    form: {
      id: row.id,
      title: row.title,
      description: row.description,
      theme: safeParse(row.theme, defaultTheme()),
      schema: safeParse(row.schema, { questions: [], settings: {} }),
      is_open: !!row.is_open,
      owner: { username: row.username, name: row.name },
    },
  });
}

async function submitResponse(formId, request, env, context) {
  const form = await env.DB.prepare("SELECT id, is_open, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form) return json({ error: "not_found" }, 404);
  if (!form.is_open) return json({ error: "form_closed" }, 403);

  const body = await readJson(request) || {};
  const data = body.data && typeof body.data === "object" ? body.data : {};

  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";
  const meta = {
    country: cf.country || null,
    city: cf.city || null,
    region: cf.region || cf.regionCode || null,
    timezone: cf.timezone || null,
    browser: detectBrowser(ua),
    os: detectOS(ua),
    ua,
    viewport: body.viewport || null,
    referrer: body.referrer || null,
    submittedAt: new Date().toISOString(),
    seconds: typeof body.seconds === "number" ? body.seconds : null,
    utm: body.utm && typeof body.utm === "object" ? body.utm : null,
    followups: Array.isArray(body.followups) ? body.followups.slice(0, 20) : null,
  };

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO responses (id, form_id, data, meta) VALUES (?, ?, ?, ?)"
  ).bind(id, formId, JSON.stringify(data), JSON.stringify(meta)).run();

  try {
    const schema = safeParse(form.schema, {});
    const settings = (schema && schema.settings) || {};
    if (settings.webhookUrl && context && context.waitUntil) {
      context.waitUntil(fireWebhook(settings.webhookUrl, formId, data, meta, (schema && schema.questions) || []));
    }
  } catch (e) {}

  return json({ ok: true, id });
}

async function fireWebhook(url, formId, data, meta, questions){
  try {
    const inputs = (questions || []).filter((q)=> q && q.type !== "text_graphic" && q.type !== "page_break" && q.type !== "hidden_field");
    const responses = inputs.map((q)=>({ question: q.label || q.id, answer: formatAnswer(data[q.id]) }));
    const emailQ = inputs.find((q)=> q.type === "text_entry" && q.validation === "email" && data[q.id]);
    const npsQ = inputs.find((q)=> q.type === "nps" && data[q.id] !== undefined && data[q.id] !== null);
    const hidden = (questions || []).filter((q)=> q && q.type === "hidden_field");
    const fields = {};
    hidden.forEach((q)=>{ if (q.key) fields[q.key] = data[q.id]; });
    const payload = {
      event: "form_submission",
      data: {
        survey_id: formId,
        respondent: {
          email: emailQ ? data[emailQ.id] : null,
          nps_score: npsQ ? data[npsQ.id] : null,
        },
        responses,
        metadata: {
          utm_source: (meta.utm && meta.utm.source) || null,
          time_to_complete_seconds: typeof meta.seconds === "number" ? meta.seconds : null,
          country: meta.country || null,
          browser: meta.browser || null,
          fields,
          followups: meta.followups || [],
        },
      },
    };
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) { /* webhook failures never block a submission */ }
}

/* ------------------------------------------------------------------ */
/* responses, analytics, csv                                           */
/* ------------------------------------------------------------------ */

async function listResponses(user, id, env) {
  const form = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!form || form.owner_id !== user.uid) return json({ error: "not_found" }, 404);

  const { results } = await env.DB.prepare(
    "SELECT id, data, meta, created_at FROM responses WHERE form_id = ? ORDER BY created_at DESC LIMIT 1000"
  ).bind(id).all();

  const responses = (results || []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    data: safeParse(r.data, {}),
    meta: safeParse(r.meta, {}),
  }));
  return json({ responses });
}

async function analytics(user, id, env) {
  const form = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!form || form.owner_id !== user.uid) return json({ error: "not_found" }, 404);

  const total = await env.DB.prepare("SELECT COUNT(*) AS c FROM responses WHERE form_id = ?").bind(id).first();
  const byDay = await env.DB.prepare(
    "SELECT date(created_at) AS k, COUNT(*) AS c FROM responses WHERE form_id = ? GROUP BY k ORDER BY k"
  ).bind(id).all();
  const byCountry = await env.DB.prepare(
    "SELECT COALESCE(json_extract(meta,'$.country'),'Unknown') AS k, COUNT(*) AS c FROM responses WHERE form_id = ? GROUP BY k ORDER BY c DESC"
  ).bind(id).all();
  const byBrowser = await env.DB.prepare(
    "SELECT COALESCE(json_extract(meta,'$.browser'),'Unknown') AS k, COUNT(*) AS c FROM responses WHERE form_id = ? GROUP BY k ORDER BY c DESC"
  ).bind(id).all();

  return json({
    total: (total && total.c) || 0,
    byDay: (byDay.results || []).map((r) => ({ date: r.k, count: r.c })),
    byCountry: (byCountry.results || []).map((r) => ({ name: r.k, count: r.c })),
    byBrowser: (byBrowser.results || []).map((r) => ({ name: r.k, count: r.c })),
  });
}

async function exportCsv(user, id, env) {
  const form = await env.DB.prepare(
    "SELECT owner_id, title, schema FROM forms WHERE id = ?"
  ).bind(id).first();
  if (!form || form.owner_id !== user.uid) return json({ error: "not_found" }, 404);

  const schema = safeParse(form.schema, { questions: [] });
  const questions = (schema.questions || []).filter((q) => q.type !== "text_graphic" && q.type !== "page_break");

  const { results } = await env.DB.prepare(
    "SELECT id, data, meta, created_at FROM responses WHERE form_id = ? ORDER BY created_at ASC"
  ).bind(id).all();

  const header = ["response_id", "submitted_at", "country", "city", "region", "browser", "os"];
  questions.forEach((q) => header.push(q.label || q.heading || q.id));

  const lines = [header.map(csvCell).join(",")];
  for (const r of (results || [])) {
    const data = safeParse(r.data, {});
    const meta = safeParse(r.meta, {});
    const row = [
      r.id, r.created_at, meta.country || "", meta.city || "",
      meta.region || "", meta.browser || "", meta.os || "",
    ];
    questions.forEach((q) => row.push(formatAnswer(data[q.id])));
    lines.push(row.map(csvCell).join(","));
  }

  const csv = "\uFEFF" + lines.join("\r\n"); // BOM so Excel reads UTF-8
  const safeTitle = (form.title || "form").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}-responses.csv"`,
    },
  });
}

function formatAnswer(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && v.indexOf("data:image") === 0) return "[signature]";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return Object.keys(v).map((k) => k + ": " + (Array.isArray(v[k]) ? v[k].join("/") : v[k])).join(" | ");
  return String(v);
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ------------------------------------------------------------------ */
/* helpers: forms                                                      */
/* ------------------------------------------------------------------ */

function hydrateForm(row) {
  return {
    id: row.id,
    owner_id: row.owner_id,
    username: row.username,
    slug: row.slug,
    title: row.title,
    description: row.description || "",
    theme: safeParse(row.theme, defaultTheme()),
    schema: safeParse(row.schema, { questions: [], settings: { randomizeQuestions: false } }),
    is_open: !!row.is_open,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function defaultTheme() {
  return { primary: "#BF5700", secondary: "#1A1A1A", accent: "#BF5700", font: "sans" };
}

function slugify(s) {
  return (s || "")
    .toString().toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "form";
}

async function uniqueSlug(env, ownerId, title) {
  const base = slugify(title);
  let slug = base;
  let n = 1;
  while (true) {
    const hit = await env.DB.prepare(
      "SELECT 1 FROM forms WHERE owner_id = ? AND slug = ?"
    ).bind(ownerId, slug).first();
    if (!hit) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/* ------------------------------------------------------------------ */
/* helpers: sessions (HMAC signed token in an httpOnly cookie)         */
/* ------------------------------------------------------------------ */

function secret(env) {
  return env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

function sessionCookie(token) {
  const maxAge = 60 * 60 * 24 * 30;
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function makeToken(sec, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(sec, body);
  return `${body}.${sig}`;
}

async function verifyToken(sec, token) {
  if (!token || token.indexOf(".") === -1) return null;
  const [body, sig] = token.split(".");
  const expected = await hmac(sec, body);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(sec, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(sec),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ */
/* helpers: misc                                                       */
/* ------------------------------------------------------------------ */

function detectBrowser(ua) {
  if (/edg/i.test(ua)) return "Edge";
  if (/opr|opera/i.test(ua)) return "Opera";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
}

function detectOS(ua) {
  if (/windows/i.test(ua)) return "Windows";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/android/i.test(ua)) return "Android";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return part.slice(idx + 1).trim();
  }
  return null;
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function cors(res) {
  // Same-origin app, so CORS is permissive only as a safety net.
  res.headers.set("Access-Control-Allow-Origin", res.headers.get("Access-Control-Allow-Origin") || "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

/* ------------------------------------------------------------------ */
/* AI summaries (Cloudflare Workers AI, cached by data signature)      */
/* ------------------------------------------------------------------ */

async function dashSummary(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  const { results } = await env.DB.prepare(
    `SELECT f.title, f.is_open,
            (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS responses
     FROM forms f WHERE f.owner_id = ? ORDER BY responses DESC`
  ).bind(user.uid).all();
  const forms = results || [];

  if (forms.length === 0) {
    return json({ summary: "No forms yet. Create your first form to start collecting responses.", generated: false });
  }

  const total = forms.reduce((a, f) => a + (f.responses || 0), 0);
  if (total === 0) {
    const plural = forms.length === 1 ? "" : "s";
    return json({ summary: `You have ${forms.length} form${plural} but no responses yet. Share a form link to start collecting.`, generated: false });
  }

  const last = await env.DB.prepare(
    `SELECT MAX(created_at) AS m FROM responses WHERE form_id IN (SELECT id FROM forms WHERE owner_id = ?)`
  ).bind(user.uid).first();
  const lastAt = (last && last.m) || "none";
  const signature = `${forms.length}|${total}|${lastAt}`;
  const key = `dash:${user.uid}`;

  if (!refresh) {
    const cached = await getCached(env, key, signature);
    if (cached) return json({ summary: cached.summary, generated: true, cached: true, created_at: cached.created_at });
  }

  const open = forms.filter((f) => f.is_open).length;
  const lines = forms.slice(0, 20)
    .map((f) => `- ${f.title}: ${f.responses} response(s), ${f.is_open ? "open" : "closed"}`)
    .join("\n");
  const userMsg =
`Account overview:
Total forms: ${forms.length} (${open} open, ${forms.length - open} closed)
Total responses across all forms: ${total}
Most recent response: ${lastAt}
Forms sorted by responses:
${lines}

Write a 2 to 3 sentence overview of this account's form activity for the owner's dashboard. Mention total response volume, the most active form, and anything notable. Plain text only.`;

  const ai = await runAI(env, dashSystem(), userMsg, 200);
  if (!ai || ai.error || !ai.text) {
    return json({
      summary: `${forms.length} forms, ${total} total responses. Your most active form is "${forms[0].title}" with ${forms[0].responses}.`,
      generated: false,
      ai_error: (ai && ai.error) || "ai_unavailable",
    });
  }
  await setCached(env, key, ai.text, signature, ai.model);
  return json({ summary: ai.text, generated: true, cached: false, model: ai.model });
}

async function formSummary(user, id, request, env) {
  const form = await env.DB.prepare(
    "SELECT owner_id, title, schema, updated_at FROM forms WHERE id = ?"
  ).bind(id).first();
  if (!form || form.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM responses WHERE form_id = ?").bind(id).first();
  const total = (totalRow && totalRow.c) || 0;
  if (total === 0) {
    return json({ summary: "No responses yet. Share this form to start collecting data.", generated: false });
  }

  const signature = `${total}|${form.updated_at}`;
  const key = `form:${id}`;
  if (!refresh) {
    const cached = await getCached(env, key, signature);
    if (cached) return json({ summary: cached.summary, generated: true, cached: true, created_at: cached.created_at });
  }

  const schema = safeParse(form.schema, { questions: [] });
  const questions = schema.questions || [];
  const textQs = questions
    .filter((q) => q.type === "text_entry")
    .map((q) => ({ id: q.id, label: q.label || q.id }));

  const byDay = await env.DB.prepare(
    "SELECT date(created_at) k, COUNT(*) c FROM responses WHERE form_id = ? GROUP BY k ORDER BY k"
  ).bind(id).all();
  const byCountry = await env.DB.prepare(
    "SELECT COALESCE(json_extract(meta,'$.country'),'Unknown') k, COUNT(*) c FROM responses WHERE form_id = ? GROUP BY k ORDER BY c DESC LIMIT 5"
  ).bind(id).all();

  let textSample = [];
  if (textQs.length) {
    const { results } = await env.DB.prepare(
      "SELECT data FROM responses WHERE form_id = ? ORDER BY created_at DESC LIMIT 60"
    ).bind(id).all();
    for (const r of (results || [])) {
      const d = safeParse(r.data, {});
      for (const q of textQs) {
        const v = d[q.id];
        if (v && typeof v === "string" && v.trim()) {
          textSample.push(`(${q.label}) ${v.trim().slice(0, 160)}`);
        }
      }
      if (textSample.length >= 25) break;
    }
  }

  const days = byDay.results || [];
  const first = days[0];
  const lastD = days[days.length - 1];
  const peak = days.slice().sort((a, b) => b.c - a.c)[0];
  const countriesLine = (byCountry.results || []).map((r) => `${r.k} (${r.c})`).join(", ") || "Unknown";

  const userMsg =
`Form title: ${form.title}
Total responses: ${total}
Date range: ${first ? first.k : "n/a"} to ${lastD ? lastD.k : "n/a"}
Peak day: ${peak ? peak.k + " with " + peak.c + " responses" : "n/a"}
Top countries: ${countriesLine}
${textSample.length ? "Sample open-text answers:\n" + textSample.join("\n") : "No open-text questions in this form."}

Write a 2 to 4 sentence summary of these form responses for the form owner. Cover response volume and timing, where responses come from, and any recurring themes in the open-text answers if present. Plain text only.`;

  const ai = await runAI(env, formSystem(), userMsg, 260);
  if (!ai || ai.error || !ai.text) {
    const range = first ? ` between ${first.k} and ${lastD.k}` : "";
    return json({
      summary: `${total} responses collected${range}. Top location: ${countriesLine}.`,
      generated: false,
      ai_error: (ai && ai.error) || "ai_unavailable",
    });
  }
  await setCached(env, key, ai.text, signature, ai.model);
  return json({ summary: ai.text, generated: true, cached: false, model: ai.model });
}

async function followup(formId, request, env) {
  const body = await readJson(request) || {};
  const answer = String(body.answer || "").trim().slice(0, 600);
  if (!answer) return json({ question: null });
  const form = await env.DB.prepare("SELECT is_open, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form || !form.is_open) return json({ question: null });
  const schema = safeParse(form.schema, {});
  const q = (schema.questions || []).find((x) => x.id === body.questionId);
  if (!q || q.type !== "text_entry" || !q.followUp) return json({ question: null });
  const sys = "You are conducting a brief, friendly interview. Given the question and the person's answer, write ONE short, specific follow-up question that digs into what they said. Keep it under 20 words. Plain text, no preamble, end with a question mark. If there is nothing meaningful to probe, reply with exactly NONE.";
  const userMsg = "Question: " + (q.label || "") + "\nAnswer: " + answer + "\n\nFollow-up question:";
  const ai = await runAI(env, sys, userMsg, 48);
  if (!ai || ai.error || !ai.text) return json({ question: null });
  const fq = String(ai.text).split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
  if (!fq || /^none\b/i.test(fq) || fq.length < 5) return json({ question: null });
  return json({ question: fq.slice(0, 160) });
}

async function toneRead(user, id, request, env) {
  const form = await env.DB.prepare("SELECT owner_id, schema, updated_at FROM forms WHERE id = ?").bind(id).first();
  if (!form || form.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const schema = safeParse(form.schema, {});
  const textQs = (schema.questions || []).filter((q) => q.type === "text_entry").map((q) => ({ id: q.id }));
  if (!textQs.length) return json({ tone: null, reason: "no_text" });
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM responses WHERE form_id = ?").bind(id).first();
  const total = (totalRow && totalRow.c) || 0;
  if (total === 0) return json({ tone: null, reason: "no_responses" });

  const signature = total + "|" + form.updated_at + "|tone";
  const key = "tone:" + id;
  if (!refresh) {
    const cached = await getCached(env, key, signature);
    if (cached) { const t = safeParse(cached.summary, null); if (t) return json({ tone: t, cached: true }); }
  }
  const { results } = await env.DB.prepare("SELECT data FROM responses WHERE form_id = ? ORDER BY created_at DESC LIMIT 80").bind(id).all();
  const samples = [];
  for (const r of (results || [])) {
    const d = safeParse(r.data, {});
    for (const q of textQs) { const v = d[q.id]; if (v && typeof v === "string" && v.trim()) samples.push(v.trim().slice(0, 200)); }
    if (samples.length >= 40) break;
  }
  if (!samples.length) return json({ tone: null, reason: "no_text" });
  const sys = "You analyze the overall tone of open-text survey answers. Output EXACTLY one line in this format: positive_count|neutral_count|negative_count|one short sentence. The three counts are integers that sum to the number of answers. No other text, no markdown.";
  const userMsg = "Number of answers: " + samples.length + "\nAnswers:\n" + samples.map((s, i) => (i + 1) + ". " + s).join("\n");
  const ai = await runAI(env, sys, userMsg, 80);
  if (!ai || ai.error || !ai.text) return json({ tone: null, reason: "unavailable" });
  const parts = String(ai.text).split("|");
  let tone;
  if (parts.length >= 4) {
    const p = parseInt(parts[0], 10), n = parseInt(parts[1], 10), neg = parseInt(parts[2], 10);
    tone = { positive: isNaN(p) ? null : p, neutral: isNaN(n) ? null : n, negative: isNaN(neg) ? null : neg, read: parts.slice(3).join("|").trim(), count: samples.length };
  } else {
    tone = { positive: null, neutral: null, negative: null, read: String(ai.text).trim().slice(0, 200), count: samples.length };
  }
  await setCached(env, key, JSON.stringify(tone), signature, ai.model);
  return json({ tone, cached: false });
}

function dashSystem() {
  return "You are an analytics assistant summarizing form activity for a dashboard. Be concise, factual, and neutral. Use plain prose with no markdown, no bullet points, no headings, and no em dashes. Do not invent numbers; only use what is provided.";
}

function formSystem() {
  return "You are an assistant summarizing survey responses for the form owner. Be concise, factual, and neutral. Summarize themes without exposing sensitive personal details verbatim where it can be avoided. Use plain prose with no markdown, no bullet points, no headings, and no em dashes. Do not invent numbers; only use what is provided.";
}

async function runAI(env, system, userMsg, maxTokens) {
  if (!env.AI || typeof env.AI.run !== "function") return null; // binding not configured yet
  const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
  try {
    const out = await env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: maxTokens || 240,
      temperature: 0.3,
    });
    const text = (out && (out.response || out.result || "")) || "";
    return { text: cleanText(text), model };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

function cleanText(t) {
  return String(t || "")
    .replace(/\u2014/g, ", ")  // em dash to comma
    .replace(/\u2013/g, "-")   // en dash to hyphen
    .replace(/[*_`#>]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function getCached(env, key, signature) {
  const row = await env.DB.prepare(
    "SELECT summary, signature, created_at FROM ai_summaries WHERE key = ?"
  ).bind(key).first();
  if (row && row.signature === signature) return row;
  return null;
}

async function setCached(env, key, summary, signature, model) {
  await env.DB.prepare(
    `INSERT INTO ai_summaries (key, summary, signature, model, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       summary = excluded.summary,
       signature = excluded.signature,
       model = excluded.model,
       created_at = excluded.created_at`
  ).bind(key, summary, signature, model || null).run();
}
