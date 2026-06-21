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
  if (path[0] === "calendar" && path.length === 3 && path[2] === "start" && method === "GET") return calendarStart(path[1], request, env);
  if (path[0] === "calendar" && path.length === 3 && path[2] === "callback" && method === "GET") return calendarCallback(path[1], request, env);
  if (path[0] === "calendar" && path.length === 3 && path[2] === "disconnect" && method === "POST") return calendarDisconnect(path[1], request, env);
  if (p === "billing/checkout" && method === "POST") return billingCheckout(request, env);
  if (p === "billing/portal" && method === "POST") return billingPortal(request, env);
  if (p === "billing/webhook" && method === "POST") return billingWebhook(request, env);
  if (p === "connect/start" && method === "GET") return connectStart(request, env);
  if (p === "connect/callback" && method === "GET") return connectCallback(request, env);
  if (p === "connect/disconnect" && method === "POST") return connectDisconnect(request, env);
  if (p === "me" && method === "GET") return me(request, env);
  if (p === "me/username" && method === "POST") return updateUsername(request, env);
  if (p === "plan/apply" && method === "POST") return applyPlan(request, env);
  if (p === "summary" && method === "GET") return dashSummary(request, env);
  if (p === "org" && method === "GET") return orgGet(request, env);
  if (p === "org" && method === "POST") return orgCreate(request, env);
  if (p === "org/invite" && method === "POST") return orgInvite(request, env);
  if (p === "org/invite/cancel" && method === "POST") return orgInviteCancel(request, env);
  if (p === "org/member/remove" && method === "POST") return orgMemberRemove(request, env);
  if (p === "org/member/role" && method === "POST") return orgMemberRole(request, env);

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
  if (path[0] === "public" && path.length === 3 && path[2] === "poll-load" && method === "POST") {
    return pollLoad(path[1], request, env);
  }
  if (path[0] === "public" && path.length === 3 && path[2] === "upload" && method === "POST") {
    return uploadFile(path[1], request, env);
  }
  if (path[0] === "public" && path.length === 3 && path[2] === "pay-confirm" && method === "POST") {
    return payConfirm(path[1], request, env);
  }
  // GET /api/cal/:formId/:token/booked.ics  (calendar subscription feed)
  if (path[0] === "cal" && path.length === 4 && path[3] === "booked.ics" && method === "GET") {
    return calendarFeed(path[1], path[2], env);
  }
  // GET|POST /api/cron/reminders?key=CRON_SECRET  (external scheduler hits this)
  if (path[0] === "cron" && path[1] === "reminders" && (method === "GET" || method === "POST")) {
    return cronReminders(request, env, context);
  }

  // ---- forms (auth required) ----
  if (path[0] === "v1" && path[1] === "forms" && path.length === 3 && method === "GET") {
    return apiGetForm(path[2], request, env);
  }
  if (path[0] === "v1" && path[1] === "forms" && path.length === 4 && path[3] === "responses" && method === "POST") {
    return apiSubmit(path[2], request, env, context);
  }

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
    if (path.length === 3 && path[2] === "responses" && method === "DELETE") return deleteAllResponses(user, id, env);
    if (path.length === 4 && path[2] === "responses" && method === "DELETE") return deleteResponse(user, id, path[3], env);
    if (path.length === 3 && path[2] === "duplicate" && method === "POST") return duplicateForm(user, id, env);
    if (path.length === 3 && path[2] === "analytics" && method === "GET") return analytics(user, id, env);
    if (path.length === 3 && path[2] === "export" && method === "GET") return exportCsv(user, id, env);
    if (path.length === 3 && path[2] === "summary" && method === "GET") return formSummary(user, id, request, env);
    if (path.length === 3 && path[2] === "tone" && method === "GET") return toneRead(user, id, request, env);
    if (path.length === 3 && path[2] === "file" && method === "GET") return serveFile(user, id, request, env);
  }

  if (path[0] === "admin" && path[1] === "overview" && path.length === 2 && method === "GET") {
    return adminOverview(request, env);
  }
  if (path[0] === "admin" && path[1] === "applications" && path.length === 2 && method === "GET") {
    return adminApplications(request, env);
  }
  if (path[0] === "admin" && path[1] === "plan" && path.length === 2 && method === "POST") {
    return adminSetPlan(request, env);
  }
  if (path[0] === "admin" && path[1] === "delete-user" && path.length === 2 && method === "POST") {
    return adminDeleteUser(request, env);
  }

  if (path[0] === "brand-kits") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (path.length === 1 && method === "GET") return listBrandKits(user, env);
    if (path.length === 1 && method === "POST") return createBrandKit(user, request, env);
    if (path.length === 2 && method === "DELETE") return deleteBrandKit(user, path[1], env);
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
  const res = json({ user: Object.assign({}, publicUser(payload), { plan: "enterprise", limits: planLimits("enterprise") }) });
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
  if (user.uid === "admin") return json({ user: Object.assign({}, publicUser(user), { plan: "enterprise", limits: planLimits("enterprise") }) });
  let row = null; try { row = await env.DB.prepare("SELECT plan, email, plan_request, stripe_account FROM users WHERE id = ?").bind(user.uid).first(); } catch (e) {}
  let plan = effectivePlan(row && row.plan, row && row.email);
  if (plan === "edu" && row && (!row.plan || row.plan === "free")) { try { await env.DB.prepare("UPDATE users SET plan = 'edu' WHERE id = ?").bind(user.uid).run(); } catch (e) {} }
  const pr = (row && row.plan_request) ? safeParse(row.plan_request, null) : null;
  let calendars = { google: { connected: false, email: null }, outlook: { connected: false, email: null } };
  try { const cr = await env.DB.prepare("SELECT calendar FROM users WHERE id = ?").bind(user.uid).first(); const conn = (cr && cr.calendar) ? safeParse(cr.calendar, null) : null; if (conn){ if (conn.google && conn.google.refresh_token) calendars.google = { connected: true, email: conn.google.email || null }; if (conn.outlook && conn.outlook.refresh_token) calendars.outlook = { connected: true, email: conn.outlook.email || null }; } } catch (e) {}
    let billing = { active: false, portal: false, plan: null, status: null };
  try { const br = await env.DB.prepare("SELECT billing FROM users WHERE id = ?").bind(user.uid).first(); const b = (br && br.billing) ? safeParse(br.billing, null) : null; if (b){ billing = { active: (b.status === "active" || b.status === "trialing"), portal: !!b.customer, plan: b.plan || null, status: b.status || null }; } } catch (e) {}
  try { await processInvites(env, { uid: user.uid, email: row && row.email }); } catch (e) {}
  let org = null; try { org = await getUserOrg(env, user.uid); } catch (e) {}
  const payments = { connected: !!(row && row.stripe_account) };
  return json({ user: Object.assign({}, publicUser(user), { plan, limits: planLimits(plan), planRequest: (pr && pr.status === "pending") ? pr : null, calendars, billing, org, payments }) });
}

async function currentUser(request, env) {
  const token = readCookie(request, "session");
  if (!token) return null;
  const u = await verifyToken(secret(env), token);
  if (u && u.uid && u.uid !== "admin") { try { u.orgIds = await getUserOrgIds(env, u.uid); } catch (e) { u.orgIds = []; } }
  return u;
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
    const uname = await uniqueUsername(env, usernameFromEmail(email || newId), newId);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, username, name, email, google_id, is_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind(newId, uname, name, email, sub).run();
    if (isEduEmail(email)) { try { await env.DB.prepare("UPDATE users SET plan = 'edu' WHERE id = ?").bind(newId).run(); } catch (e) {} }
    row = { id: newId, username: uname, name };
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
/* Calendar connect (Google + Outlook free/busy, isolated + graceful)  */
/* ------------------------------------------------------------------ */
function calProviderOk(p){ return p === "google" || p === "outlook"; }

async function calendarStart(provider, request, env){
  const user = await currentUser(request, env);
  if (!user) return redirectTo("/dashboard?calendar=login");
  if (!calProviderOk(provider)) return redirectTo("/dashboard?calendar=denied");
  const origin = new URL(request.url).origin;
  const state = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, "");
  const stateCookie = `gc_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
  if (provider === "google"){
    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) return redirectTo("/dashboard?calendar=setup");
    const auth = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: clientId,
      redirect_uri: origin + "/api/calendar/google/callback",
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy openid email",
      state,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    }).toString();
    return redirectTo(auth, [stateCookie]);
  }
  // outlook (Microsoft identity platform)
  const msId = env.MS_CLIENT_ID;
  if (!msId) return redirectTo("/dashboard?calendar=setup");
  const auth = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + new URLSearchParams({
    client_id: msId,
    response_type: "code",
    redirect_uri: origin + "/api/calendar/outlook/callback",
    response_mode: "query",
    scope: "offline_access openid email https://graph.microsoft.com/Calendars.Read",
    state,
    prompt: "consent",
  }).toString();
  return redirectTo(auth, [stateCookie]);
}

async function calendarCallback(provider, request, env){
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return redirectTo("/dashboard?calendar=denied");
  const cookieState = readCookie(request, "gc_state");
  if (!code || !state || !cookieState || state !== cookieState) return redirectTo("/dashboard?calendar=state");
  const user = await currentUser(request, env);
  if (!user) return redirectTo("/dashboard?calendar=login");
  if (!calProviderOk(provider)) return redirectTo("/dashboard?calendar=denied");
  const origin = url.origin;
  let refresh = "", email = "";
  if (provider === "google"){
    const clientId = env.GOOGLE_CLIENT_ID, clientSecret = env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return redirectTo("/dashboard?calendar=setup");
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: origin + "/api/calendar/google/callback", grant_type: "authorization_code" }).toString(),
      });
      const tok = await r.json();
      refresh = (tok && tok.refresh_token) || "";
      try { if (tok && tok.id_token){ const c = decodeJwtPayload(tok.id_token); email = (c && c.email) || ""; } } catch (e) {}
    } catch (e) { return redirectTo("/dashboard?calendar=token"); }
  } else {
    const msId = env.MS_CLIENT_ID, msSecret = env.MS_CLIENT_SECRET;
    if (!msId || !msSecret) return redirectTo("/dashboard?calendar=setup");
    try {
      const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: msId, client_secret: msSecret, redirect_uri: origin + "/api/calendar/outlook/callback", grant_type: "authorization_code", scope: "offline_access openid email https://graph.microsoft.com/Calendars.Read" }).toString(),
      });
      const tok = await r.json();
      refresh = (tok && tok.refresh_token) || "";
      try { if (tok && tok.id_token){ const c = decodeJwtPayload(tok.id_token); email = (c && (c.email || c.preferred_username)) || ""; } } catch (e) {}
    } catch (e) { return redirectTo("/dashboard?calendar=token"); }
  }
  if (!refresh) return redirectTo("/dashboard?calendar=noref");
  let conn = {};
  try { const cr = await env.DB.prepare("SELECT calendar FROM users WHERE id = ?").bind(user.uid).first(); conn = (cr && cr.calendar) ? (safeParse(cr.calendar, {}) || {}) : {}; } catch (e) { return redirectTo("/dashboard?calendar=migrate"); }
  conn[provider] = { refresh_token: refresh, email, connected_at: new Date().toISOString() };
  try { await env.DB.prepare("UPDATE users SET calendar = ? WHERE id = ?").bind(JSON.stringify(conn), user.uid).run(); }
  catch (e) { return redirectTo("/dashboard?calendar=migrate"); }
  const clear = "gc_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
  return redirectTo("/dashboard?calendar=connected&cal=" + provider, [clear]);
}

async function calendarDisconnect(provider, request, env){
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!calProviderOk(provider)) return json({ error: "bad_request" }, 400);
  try {
    const cr = await env.DB.prepare("SELECT calendar FROM users WHERE id = ?").bind(user.uid).first();
    const conn = (cr && cr.calendar) ? (safeParse(cr.calendar, {}) || {}) : {};
    delete conn[provider];
    const left = Object.keys(conn).length ? JSON.stringify(conn) : null;
    await env.DB.prepare("UPDATE users SET calendar = ? WHERE id = ?").bind(left, user.uid).run();
  } catch (e) {}
  return json({ ok: true });
}

async function googleAccessToken(env, refreshToken){
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
    });
    const t = await r.json();
    return (t && t.access_token) || null;
  } catch (e) { return null; }
}

async function googleCreateEvents(env, ownerId, schema, data){
  try {
    const events = bookingEventsFrom(schema, data);
    if (!events.length) return;
    const cr = await env.DB.prepare("SELECT calendar FROM users WHERE id = ?").bind(ownerId).first();
    const conn = (cr && cr.calendar) ? safeParse(cr.calendar, null) : null;
    if (!conn || !conn.google || !conn.google.refresh_token) return;
    const token = await googleAccessToken(env, conn.google.refresh_token);
    if (!token) return;
    const email = findRespondentEmail(data);
    const name = findRespondentName(data);
    for (const e of events){
      const end = new Date(e.start.getTime() + e.durationMin * 60000);
      const descParts = [e.video ? (e.video + " meeting") : "", name ? ("Booked by " + name) : ""].filter(Boolean);
      const ev = { summary: e.summary, start: { dateTime: e.start.toISOString() }, end: { dateTime: end.toISOString() } };
      if (e.location) ev.location = e.location;
      if (descParts.length) ev.description = descParts.join(". ");
      if (email) ev.attendees = [{ email: email }];
      const su = email ? "all" : "none";
      try {
        await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=" + su, {
          method: "POST",
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(ev),
        });
      } catch (e2) {}
    }
  } catch (e) {}
}

async function msAccessToken(env, refreshToken){
  try {
    const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token", scope: "offline_access openid email https://graph.microsoft.com/Calendars.Read" }).toString(),
    });
    const t = await r.json();
    return (t && t.access_token) || null;
  } catch (e) { return null; }
}

async function googleBusy(env, conn, timeMin, timeMax){
  try {
    const rt = conn && conn.google && conn.google.refresh_token;
    if (!rt) return [];
    const at = await googleAccessToken(env, rt);
    if (!at) return [];
    const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST", headers: { "Authorization": "Bearer " + at, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: "primary" }] }),
    });
    const j = await r.json();
    const prim = j && j.calendars && j.calendars.primary;
    const busy = (prim && prim.busy) || [];
    return busy.map((b)=>({ start: b.start, end: b.end })).filter((b)=> b.start && b.end);
  } catch (e) { return []; }
}

async function outlookBusy(env, conn, timeMin, timeMax){
  try {
    const o = conn && conn.outlook;
    const rt = o && o.refresh_token;
    if (!rt) return [];
    const at = await msAccessToken(env, rt);
    if (!at) return [];
    // calendarView works for both personal and work/school accounts (getSchedule is unreliable on consumer accounts)
    const qs = new URLSearchParams({ startDateTime: timeMin, endDateTime: timeMax, "$select": "start,end,showAs,isCancelled", "$top": "250", "$orderby": "start/dateTime" });
    const r = await fetch("https://graph.microsoft.com/v1.0/me/calendarView?" + qs.toString(), {
      headers: { "Authorization": "Bearer " + at, "Prefer": 'outlook.timezone="UTC"' },
    });
    const j = await r.json();
    const items = (j && j.value) || [];
    const toIso = (dt)=>{ try { let str = (dt && dt.dateTime) || ""; if (!str) return null; if (!/[Zz]|[+\-]\d\d:?\d\d$/.test(str)) str += "Z"; const d = new Date(str); return isNaN(d.getTime()) ? null : d.toISOString(); } catch (e) { return null; } };
    return items
      .filter((it)=> !it.isCancelled && (it.showAs == null || it.showAs === "busy" || it.showAs === "oof" || it.showAs === "tentative" || it.showAs === "workingElsewhere"))
      .map((it)=>({ start: toIso(it.start), end: toIso(it.end) }))
      .filter((b)=> b.start && b.end);
  } catch (e) { return []; }
}

// Owner's busy intervals [{start,end}] across all connected calendars over [timeMin,timeMax], or [] on any failure.
async function getOwnerBusy(env, ownerId, timeMin, timeMax){
  try {
    const row = await env.DB.prepare("SELECT calendar FROM users WHERE id = ?").bind(ownerId).first();
    const conn = (row && row.calendar) ? safeParse(row.calendar, null) : null;
    if (!conn) return [];
    const [g, o] = await Promise.all([ googleBusy(env, conn, timeMin, timeMax), outlookBusy(env, conn, timeMin, timeMax) ]);
    return g.concat(o);
  } catch (e) { return []; }
}

/* ------------------------------------------------------------------ */
/* Stripe billing (Checkout subscriptions + signed webhook + portal)   */
/* ------------------------------------------------------------------ */
async function stripeApi(env, path, paramsObj, acct){
  const headers = { "Authorization": "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" };
  if (acct) headers["Stripe-Account"] = acct;
  const r = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers, body: new URLSearchParams(paramsObj).toString() });
  return r.json();
}
async function stripeGet(env, path, acct){
  const headers = { "Authorization": "Bearer " + env.STRIPE_SECRET_KEY };
  if (acct) headers["Stripe-Account"] = acct;
  const r = await fetch("https://api.stripe.com/v1/" + path, { method: "GET", headers });
  return r.json();
}
function timingEqual(a, b){ if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function stripeVerify(secret, payload, header){
  try {
    if (!secret || !header) return false;
    const parts = {}; header.split(",").forEach((kv)=>{ const i = kv.indexOf("="); if (i > 0){ const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1).trim(); (parts[k] = parts[k] || []).push(v); } });
    const t = parts.t && parts.t[0]; const v1 = parts.v1 || [];
    if (!t || !v1.length) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(t + "." + payload));
    const hex = Array.from(new Uint8Array(mac)).map((b)=> b.toString(16).padStart(2, "0")).join("");
    return v1.some((v)=> timingEqual(v, hex));
  } catch (e) { return false; }
}
async function setBilling(env, uid, info){
  if (!uid || uid === "admin") return;
  const billing = JSON.stringify({ customer: info.customer || "", subscription: info.subscription || "", status: info.status || "active", plan: info.plan, at: new Date().toISOString() });
  try { await env.DB.prepare("UPDATE users SET plan = ?, billing = ? WHERE id = ?").bind(info.plan, billing, uid).run(); } catch (e) {}
}
async function clearBilling(env, uid, customer, subscription, status){
  if (!uid || uid === "admin") return;
  const billing = JSON.stringify({ customer: customer || "", subscription: subscription || "", status: status || "canceled", plan: "free", at: new Date().toISOString() });
  try { await env.DB.prepare("UPDATE users SET plan = 'free', billing = ? WHERE id = ?").bind(billing, uid).run(); } catch (e) {}
}

async function billingCheckout(request, env){
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.uid === "admin") return json({ error: "admin_fixed" }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "billing_unconfigured" }, 503);
  const body = await readJson(request) || {};
  const plan = body.plan === "premium" ? "premium" : (body.plan === "pro" ? "pro" : null);
  if (!plan) return json({ error: "bad_request" }, 400);
  const price = plan === "premium" ? env.STRIPE_PRICE_PREMIUM : env.STRIPE_PRICE_PRO;
  if (!price) return json({ error: "price_unconfigured" }, 503);
  const origin = new URL(request.url).origin;
  let cust = "", email = "";
  try { const row = await env.DB.prepare("SELECT email, billing FROM users WHERE id = ?").bind(user.uid).first(); email = (row && row.email) || ""; const b = (row && row.billing) ? safeParse(row.billing, null) : null; cust = (b && b.customer) || ""; } catch (e) {}
  const params = {
    "mode": "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    "success_url": origin + "/dashboard?billing=success",
    "cancel_url": origin + "/dashboard?billing=cancel",
    "client_reference_id": user.uid,
    "allow_promotion_codes": "true",
    "metadata[uid]": user.uid,
    "metadata[plan]": plan,
    "subscription_data[metadata][uid]": user.uid,
    "subscription_data[metadata][plan]": plan,
  };
  if (cust) params["customer"] = cust; else if (email) params["customer_email"] = email;
  const sess = await stripeApi(env, "checkout/sessions", params);
  if (sess && sess.url) return json({ url: sess.url });
  return json({ error: "stripe_error", detail: (sess && sess.error && sess.error.message) || "unknown" }, 502);
}

async function billingPortal(request, env){
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "billing_unconfigured" }, 503);
  let cust = "";
  try { const row = await env.DB.prepare("SELECT billing FROM users WHERE id = ?").bind(user.uid).first(); const b = (row && row.billing) ? safeParse(row.billing, null) : null; cust = (b && b.customer) || ""; } catch (e) {}
  if (!cust) return json({ error: "no_customer" }, 400);
  const origin = new URL(request.url).origin;
  const sess = await stripeApi(env, "billing_portal/sessions", { "customer": cust, "return_url": origin + "/dashboard" });
  if (sess && sess.url) return json({ url: sess.url });
  return json({ error: "stripe_error" }, 502);
}

async function connectStart(request, env){
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.uid === "admin") return json({ error: "admin_fixed" }, 400);
  if (!env.STRIPE_CONNECT_CLIENT_ID) return redirectTo("/dashboard?connect=unconfigured");
  const url = new URL(request.url);
  let ret = url.searchParams.get("return") || "/dashboard";
  if (!/^\/[A-Za-z0-9/_-]*$/.test(ret)) ret = "/dashboard";
  let email = "";
  try { const er = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(user.uid).first(); email = (er && er.email) || ""; } catch (e) {}
  const state = crypto.randomUUID();
  const redirectUri = url.origin + "/api/connect/callback";
  const auth = "https://connect.stripe.com/oauth/authorize?response_type=code&client_id=" + encodeURIComponent(env.STRIPE_CONNECT_CLIENT_ID) + "&scope=read_write&redirect_uri=" + encodeURIComponent(redirectUri) + "&state=" + encodeURIComponent(state) + (email ? ("&stripe_user[email]=" + encodeURIComponent(email)) : "");
  const cookie = "cstate=" + encodeURIComponent(state + "|" + ret) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600";
  return redirectTo(auth, [cookie]);
}
async function connectCallback(request, env){
  const user = await currentUser(request, env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const ck = readCookie(request, "cstate") || "";
  const clear = "cstate=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
  const parts = decodeURIComponent(ck).split("|");
  const cstate = parts[0]; const ret = (parts[1] && /^\/[A-Za-z0-9/_-]*$/.test(parts[1])) ? parts[1] : "/dashboard";
  if (!user) return redirectTo("/dashboard?connect=login", [clear]);
  if (url.searchParams.get("error")) return redirectTo(ret + "?connect=denied", [clear]);
  if (!code || !state || !cstate || state !== cstate) return redirectTo(ret + "?connect=state", [clear]);
  try {
    const tok = await fetch("https://connect.stripe.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_secret: env.STRIPE_SECRET_KEY, code: code, grant_type: "authorization_code" }).toString() });
    const data = await tok.json();
    if (data && data.stripe_user_id){
      await env.DB.prepare("UPDATE users SET stripe_account = ? WHERE id = ?").bind(data.stripe_user_id, user.uid).run();
      return redirectTo(ret + "?connect=connected", [clear]);
    }
  } catch (e) {}
  return redirectTo(ret + "?connect=error", [clear]);
}
async function connectDisconnect(request, env){
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  let acct = "";
  try { const r = await env.DB.prepare("SELECT stripe_account FROM users WHERE id = ?").bind(user.uid).first(); acct = (r && r.stripe_account) || ""; } catch (e) {}
  if (acct && env.STRIPE_CONNECT_CLIENT_ID){ try { await fetch("https://connect.stripe.com/oauth/deauthorize", { method: "POST", headers: { "Authorization": "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.STRIPE_CONNECT_CLIENT_ID, stripe_user_id: acct }).toString() }); } catch (e) {} }
  try { await env.DB.prepare("UPDATE users SET stripe_account = NULL WHERE id = ?").bind(user.uid).run(); } catch (e) {}
  return json({ ok: true });
}
async function payConfirm(formId, request, env){
  const body = await readJson(request) || {};
  const sid = String(body.session || "");
  if (!sid || !env.STRIPE_SECRET_KEY) return json({ paid: false });
  const fr = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(formId).first();
  if (!fr) return json({ paid: false });
  const ar = await env.DB.prepare("SELECT stripe_account FROM users WHERE id = ?").bind(fr.owner_id).first();
  const acct = ar && ar.stripe_account; if (!acct) return json({ paid: false });
  const sess = await stripeGet(env, "checkout/sessions/" + encodeURIComponent(sid), acct);
  if (!sess || sess.error) return json({ paid: false });
  const paid = sess.payment_status === "paid" || sess.status === "complete";
  const rid = sess.metadata && sess.metadata.response_id;
  if (paid && rid){
    try { const r = await env.DB.prepare("SELECT meta FROM responses WHERE id = ? AND form_id = ?").bind(rid, formId).first(); if (r){ const m = safeParse(r.meta, {}); m.payment = Object.assign({}, m.payment, { status: "paid", paidAt: new Date().toISOString() }); await env.DB.prepare("UPDATE responses SET meta = ? WHERE id = ?").bind(JSON.stringify(m), rid).run(); } } catch (e) {}
  }
  return json({ paid: !!paid });
}

async function billingWebhook(request, env){
  const sig = request.headers.get("stripe-signature") || "";
  const raw = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "unconfigured" }, 503);
  const ok = await stripeVerify(env.STRIPE_WEBHOOK_SECRET, raw, sig);
  if (!ok) return json({ error: "bad_signature" }, 400);
  let evt = null; try { evt = JSON.parse(raw); } catch (e) { return json({ error: "bad_json" }, 400); }
  const type = evt && evt.type;
  const obj = (evt && evt.data && evt.data.object) || {};
  try {
    if (type === "checkout.session.completed"){
      if (obj.metadata && obj.metadata.response_id){
        const rid = obj.metadata.response_id;
        try { const rr = await env.DB.prepare("SELECT meta FROM responses WHERE id = ?").bind(rid).first(); if (rr){ const mm = safeParse(rr.meta, {}); mm.payment = Object.assign({}, mm.payment, { status: "paid", paidAt: new Date().toISOString() }); await env.DB.prepare("UPDATE responses SET meta = ? WHERE id = ?").bind(JSON.stringify(mm), rid).run(); } } catch (e) {}
      } else {
        const uid = obj.client_reference_id || (obj.metadata && obj.metadata.uid);
        const plan = (obj.metadata && obj.metadata.plan) || "";
        if (uid && (plan === "pro" || plan === "premium")) await setBilling(env, uid, { plan, customer: obj.customer || "", subscription: obj.subscription || "", status: "active" });
      }
    } else if (type === "customer.subscription.created" || type === "customer.subscription.updated"){
      const uid = obj.metadata && obj.metadata.uid;
      const plan = (obj.metadata && obj.metadata.plan) || "";
      const status = obj.status || "";
      const active = status === "active" || status === "trialing";
      if (uid){
        if (active && (plan === "pro" || plan === "premium")) await setBilling(env, uid, { plan, customer: obj.customer || "", subscription: obj.id || "", status });
        else if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") await clearBilling(env, uid, obj.customer || "", obj.id || "", status);
      }
    } else if (type === "customer.subscription.deleted"){
      const uid = obj.metadata && obj.metadata.uid;
      if (uid) await clearBilling(env, uid, obj.customer || "", obj.id || "", "canceled");
    }
  } catch (e) {}
  return json({ received: true });
}

/* ------------------------------------------------------------------ */
/* forms CRUD                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Teams / organizations (enterprise shared workspaces)                */
/* ------------------------------------------------------------------ */
async function getUserOrgIds(env, uid){
  try { const r = await env.DB.prepare("SELECT org_id FROM org_members WHERE user_id = ?").bind(uid).all(); return (r.results || []).map((x)=> x.org_id); } catch (e) { return []; }
}
async function getUserOrg(env, uid){
  try {
    const m = await env.DB.prepare("SELECT m.org_id AS id, m.role AS role, o.name AS name, o.owner_id AS ownerId FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY (m.role = 'owner') DESC, m.added_at ASC LIMIT 1").bind(uid).first();
    return m ? { id: m.id, name: m.name, role: m.role, isOwner: m.ownerId === uid } : null;
  } catch (e) { return null; }
}
async function processInvites(env, user){
  if (!user || !user.email) return;
  try {
    const inv = await env.DB.prepare("SELECT id, org_id, role FROM org_invites WHERE lower(email) = lower(?)").bind(user.email).all();
    for (const i of (inv.results || [])){
      await env.DB.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)").bind(i.org_id, user.uid, i.role || "member").run();
      await env.DB.prepare("DELETE FROM org_invites WHERE id = ?").bind(i.id).run();
    }
  } catch (e) {}
}
function canForm(own, user){
  if (!own) return false;
  if (own.owner_id === user.uid) return true;
  if (own.org_id && user && Array.isArray(user.orgIds) && user.orgIds.indexOf(own.org_id) >= 0) return true;
  return false;
}
function orgAdminGuard(org){ return !!(org && (org.role === "owner" || org.role === "admin")); }

async function orgGet(request, env){
  const user = await currentUser(request, env); if (!user) return json({ error: "unauthorized" }, 401);
  const org = await getUserOrg(env, user.uid);
  if (!org) return json({ org: null });
  let members = [], invites = [];
  try { const mr = await env.DB.prepare("SELECT m.user_id AS id, m.role AS role, u.name AS name, u.username AS username, u.email AS email FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY (m.role='owner') DESC, m.added_at ASC").bind(org.id).all(); members = mr.results || []; } catch (e) {}
  if (orgAdminGuard(org)){ try { const ir = await env.DB.prepare("SELECT email, role FROM org_invites WHERE org_id = ? ORDER BY created_at ASC").bind(org.id).all(); invites = ir.results || []; } catch (e) {} }
  return json({ org: { id: org.id, name: org.name, role: org.role, isOwner: org.isOwner }, members, invites });
}
async function orgCreate(request, env){
  const user = await currentUser(request, env); if (!user) return json({ error: "unauthorized" }, 401);
  const plan = await getUserPlan(env, user.uid); if (!planLimits(plan).team && user.uid !== "admin") return json({ error: "plan_required" }, 403);
  const existing = await getUserOrg(env, user.uid); if (existing) return json({ error: "exists", org: existing }, 409);
  const body = await readJson(request) || {};
  const name = ((body.name || "My team").toString().slice(0, 120).trim()) || "My team";
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO orgs (id, name, owner_id) VALUES (?, ?, ?)").bind(id, name, user.uid).run();
    await env.DB.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')").bind(id, user.uid).run();
  } catch (e) { return json({ error: "create_failed" }, 500); }
  return json({ ok: true, org: { id, name, role: "owner", isOwner: true } });
}
async function orgInvite(request, env){
  const user = await currentUser(request, env); if (!user) return json({ error: "unauthorized" }, 401);
  const org = await getUserOrg(env, user.uid); if (!orgAdminGuard(org)) return json({ error: "forbidden" }, 403);
  const body = await readJson(request) || {};
  const email = (body.email || "").toString().trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "bad_email" }, 400);
  const role = (body.role === "admin") ? "admin" : "member";
  try { const ex = await env.DB.prepare("SELECT 1 FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND lower(u.email) = ?").bind(org.id, email).first(); if (ex) return json({ error: "already_member" }, 409); } catch (e) {}
  try {
    const u = await env.DB.prepare("SELECT id FROM users WHERE lower(email) = ?").bind(email).first();
    if (u){ await env.DB.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)").bind(org.id, u.id, role).run(); return json({ ok: true, joined: true }); }
    await env.DB.prepare("DELETE FROM org_invites WHERE org_id = ? AND lower(email) = ?").bind(org.id, email).run();
    await env.DB.prepare("INSERT INTO org_invites (id, org_id, email, role) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), org.id, email, role).run();
  } catch (e) { return json({ error: "invite_failed" }, 500); }
  try { if (env.RESEND_API_KEY) await mailSend(env, { to: email, subject: "You have been added to a team on zetetiq", html: "<p>" + htmlEscape(user.name || "A teammate") + " added you to their team on zetetiq. Sign in with this email address to see the shared forms.</p>" }); } catch (e) {}
  return json({ ok: true, invited: true });
}
async function orgInviteCancel(request, env){
  const user = await currentUser(request, env); if (!user) return json({ error: "unauthorized" }, 401);
  const org = await getUserOrg(env, user.uid); if (!orgAdminGuard(org)) return json({ error: "forbidden" }, 403);
  const body = await readJson(request) || {};
  const email = (body.email || "").toString().trim().toLowerCase();
  try { await env.DB.prepare("DELETE FROM org_invites WHERE org_id = ? AND lower(email) = ?").bind(org.id, email).run(); } catch (e) {}
  return json({ ok: true });
}
async function orgMemberRemove(request, env){
  const user = await currentUser(request, env); if (!user) return json({ error: "unauthorized" }, 401);
  const org = await getUserOrg(env, user.uid); if (!org) return json({ error: "forbidden" }, 403);
  const body = await readJson(request) || {};
  const target = (body.userId || "").toString();
  const isSelf = target === user.uid;
  if (!isSelf && !orgAdminGuard(org)) return json({ error: "forbidden" }, 403);
  try {
    const tm = await env.DB.prepare("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?").bind(org.id, target).first();
    if (tm && tm.role === "owner") return json({ error: "cannot_remove_owner" }, 400);
    await env.DB.prepare("DELETE FROM org_members WHERE org_id = ? AND user_id = ?").bind(org.id, target).run();
  } catch (e) {}
  return json({ ok: true });
}
async function orgMemberRole(request, env){
  const user = await currentUser(request, env); if (!user) return json({ error: "unauthorized" }, 401);
  const org = await getUserOrg(env, user.uid); if (!orgAdminGuard(org)) return json({ error: "forbidden" }, 403);
  const body = await readJson(request) || {};
  const target = (body.userId || "").toString();
  const role = (body.role === "admin") ? "admin" : "member";
  try {
    const tm = await env.DB.prepare("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?").bind(org.id, target).first();
    if (tm && tm.role === "owner") return json({ error: "cannot_change_owner" }, 400);
    await env.DB.prepare("UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?").bind(role, org.id, target).run();
  } catch (e) {}
  return json({ ok: true });
}

async function listForms(user, env) {
  const orgIds = Array.isArray(user.orgIds) ? user.orgIds : [];
  const cols = `f.id, f.slug, f.title, f.is_open, f.created_at, f.org_id, f.owner_id, u.username,
            json_extract(f.theme,'$.font') AS font, json_extract(f.theme,'$.customFont') AS customFont, json_extract(f.schema,'$.settings.kind') AS kind,
            (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS responses,
            (SELECT MAX(r.created_at) FROM responses r WHERE r.form_id = f.id) AS last_response`;
  let q, binds;
  if (orgIds.length){ const ph = orgIds.map(()=> "?").join(","); q = `SELECT ${cols} FROM forms f JOIN users u ON u.id = f.owner_id WHERE f.owner_id = ? OR f.org_id IN (${ph}) ORDER BY last_response DESC, f.created_at DESC`; binds = [user.uid].concat(orgIds); }
  else { q = `SELECT ${cols} FROM forms f JOIN users u ON u.id = f.owner_id WHERE f.owner_id = ? ORDER BY last_response DESC, f.created_at DESC`; binds = [user.uid]; }
  const { results } = await env.DB.prepare(q).bind(...binds).all();
  (results || []).forEach((row)=>{ row.shared = !!row.org_id; row.mine = row.owner_id === user.uid; });
  return json({ forms: results || [] });
}

async function createForm(user, request, env) {
  const _plan = await getUserPlan(env, user.uid); const _lim = planLimits(_plan);
  if (_lim.maxForms !== Infinity) { const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM forms WHERE owner_id = ?").bind(user.uid).first(); if (((cnt && cnt.c) || 0) >= _lim.maxForms) return json({ error: "plan_limit", limit: "forms", max: _lim.maxForms, plan: _plan }, 403); }
  const body = await readJson(request) || {};
  const title = (body.title || "Untitled form").toString().slice(0, 200);
  const slug = (typeof body.slug === "string" && body.slug.trim())
    ? await uniqueSlugFrom(env, user.uid, slugify(body.slug), null)
    : await uniqueSlug(env, user.uid, title);
  const id = crypto.randomUUID();
  const theme = JSON.stringify(body.theme || defaultTheme());
  const schema = JSON.stringify(body.schema || { questions: [], settings: { randomizeQuestions: false } });

  let orgId = null;
  if (typeof body.org_id === "string" && body.org_id){ const ids = Array.isArray(user.orgIds) ? user.orgIds : await getUserOrgIds(env, user.uid); if (ids.indexOf(body.org_id) >= 0) orgId = body.org_id; }
  await env.DB.prepare(
    `INSERT INTO forms (id, owner_id, slug, title, description, theme, schema, is_open, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(id, user.uid, slug, title, body.description || "", theme, schema, orgId).run();

  return json({ id, slug });
}

async function getForm(user, id, env) {
  const row = await env.DB.prepare(
    `SELECT f.*, u.username FROM forms f JOIN users u ON u.id = f.owner_id WHERE f.id = ?`
  ).bind(id).first();
  if (!canForm(row, user)) return json({ error: "not_found" }, 404);
  return json({ form: Object.assign(hydrateForm(row), { org_id: row.org_id || null, mine: row.owner_id === user.uid }) });
}

async function updateForm(user, id, request, env) {
  const own = await env.DB.prepare("SELECT owner_id, org_id FROM forms WHERE id = ?").bind(id).first();
  if (!canForm(own, user)) return json({ error: "not_found" }, 404);

  const body = await readJson(request) || {};
  const sets = [];
  const vals = [];
  if (typeof body.title === "string") { sets.push("title = ?"); vals.push(body.title.slice(0, 200)); }
  if (typeof body.description === "string") { sets.push("description = ?"); vals.push(body.description); }
  if (body.theme) { sets.push("theme = ?"); vals.push(JSON.stringify(body.theme)); }
  if (body.schema) { sets.push("schema = ?"); vals.push(JSON.stringify(body.schema)); }
  if (typeof body.is_open === "boolean") { sets.push("is_open = ?"); vals.push(body.is_open ? 1 : 0); }
  let newSlug = null;
  if (typeof body.slug === "string" && body.slug.trim()) {
    const cur = await env.DB.prepare("SELECT slug, schema FROM forms WHERE id = ?").bind(id).first();
    newSlug = await uniqueSlugFrom(env, own.owner_id, slugify(body.slug), id);
    sets.push("slug = ?"); vals.push(newSlug);
    if (cur && cur.slug && cur.slug !== newSlug) {
      let schemaObj = body.schema ? body.schema : safeParse(cur.schema, {});
      schemaObj = schemaObj || {}; schemaObj.settings = schemaObj.settings || {};
      const prev = Array.isArray(schemaObj.settings.prevSlugs) ? schemaObj.settings.prevSlugs.slice() : [];
      if (prev.indexOf(cur.slug) < 0) prev.unshift(cur.slug);
      schemaObj.settings.prevSlugs = prev.filter((x)=> x !== newSlug).slice(0, 10);
      const si = sets.indexOf("schema = ?");
      if (si >= 0) vals[si] = JSON.stringify(schemaObj);
      else { sets.push("schema = ?"); vals.push(JSON.stringify(schemaObj)); }
    }
  }
  if (typeof body.org_id !== "undefined" && own.owner_id === user.uid){
    if (body.org_id === null || body.org_id === ""){ sets.push("org_id = ?"); vals.push(null); }
    else if (typeof body.org_id === "string"){ const ids = Array.isArray(user.orgIds) ? user.orgIds : await getUserOrgIds(env, user.uid); if (ids.indexOf(body.org_id) >= 0){ sets.push("org_id = ?"); vals.push(body.org_id); } }
  }
  sets.push("updated_at = datetime('now')");

  if (sets.length === 1) return json({ ok: true }); // nothing but timestamp
  vals.push(id);
  await env.DB.prepare(`UPDATE forms SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true, slug: newSlug });
}

async function deleteForm(user, id, env) {
  const own = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!own || own.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  await env.DB.prepare("DELETE FROM responses WHERE form_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM forms WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function deleteResponse(user, id, rid, env) {
  const own = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!own || own.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  await env.DB.prepare("DELETE FROM responses WHERE id = ? AND form_id = ?").bind(rid, id).run();
  return json({ ok: true });
}

async function deleteAllResponses(user, id, env) {
  const own = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!own || own.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  await env.DB.prepare("DELETE FROM responses WHERE form_id = ?").bind(id).run();
  return json({ ok: true });
}

async function duplicateForm(user, id, env) {
  const row = await env.DB.prepare("SELECT * FROM forms WHERE id = ?").bind(id).first();
  if (!row || row.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  const title = ((row.title || "Untitled form") + " (copy)").slice(0, 200);
  const slug = await uniqueSlug(env, user.uid, title);
  const nid = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO forms (id, owner_id, slug, title, description, theme, schema, is_open)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).bind(nid, user.uid, slug, title, row.description || "", row.theme || "{}", row.schema || "{}").run();
  return json({ id: nid, slug });
}

/* ------------------------------------------------------------------ */
/* public form + responses                                             */
/* ------------------------------------------------------------------ */

function formAvailability(isOpen, settings, count) {
  if (!isOpen) return { open: false, reason: "closed" };
  const now = Date.now();
  const opensAt = settings.opensAt ? Date.parse(settings.opensAt) : NaN;
  const closesAt = settings.closesAt ? Date.parse(settings.closesAt) : NaN;
  if (!isNaN(opensAt) && now < opensAt) return { open: false, reason: "scheduled", opensAt: settings.opensAt };
  if (!isNaN(closesAt) && now > closesAt) return { open: false, reason: "ended" };
  const cap = parseInt(settings.responseCap, 10);
  if (cap > 0 && typeof count === "number" && count >= cap) return { open: false, reason: "full" };
  return { open: true, reason: null };
}

async function listBrandKits(user, env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, data, created_at FROM brand_kits WHERE owner_id = ? ORDER BY created_at DESC"
  ).bind(user.uid).all();
  const kits = (results || []).map((r) => ({ id: r.id, name: r.name, created_at: r.created_at, ...safeParse(r.data, {}) }));
  return json({ kits });
}

async function createBrandKit(user, request, env) {
  const body = await readJson(request) || {};
  const name = String(body.name || "Untitled kit").slice(0, 80);
  const data = JSON.stringify({
    logo: typeof body.logo === "string" ? body.logo : null,
    font: body.font || "sans",
    customFont: String(body.customFont || "").slice(0, 60),
    primary: body.primary || "#5b4fe0",
    secondary: body.secondary || "#1b1830",
    accent: body.accent || "#5b4fe0",
  });
  const id = "bk_" + ((globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, "").slice(0, 10) : Math.random().toString(36).slice(2, 12));
  await env.DB.prepare(
    "INSERT INTO brand_kits (id, owner_id, name, data, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).bind(id, user.uid, name, data).run();
  return json({ id });
}

async function deleteBrandKit(user, id, env) {
  await env.DB.prepare("DELETE FROM brand_kits WHERE id = ? AND owner_id = ?").bind(id, user.uid).run();
  return json({ ok: true });
}

async function publicForm(username, slug, env) {
  let row = await env.DB.prepare(
    `SELECT f.id, f.owner_id, f.slug, f.title, f.description, f.theme, f.schema, f.is_open, u.username, u.name
     FROM forms f JOIN users u ON u.id = f.owner_id
     WHERE lower(u.username) = lower(?) AND f.slug = ?`
  ).bind(String(username||"").trim(), slug).first();
  if (!row) {
    const u = await env.DB.prepare("SELECT id, name, username FROM users WHERE lower(username) = lower(?)").bind(String(username||"").trim()).first();
    if (u) {
      const fr = await env.DB.prepare("SELECT id, owner_id, slug, title, description, theme, schema, is_open FROM forms WHERE owner_id = ?").bind(u.id).all();
      for (const f of (fr.results || [])) {
        const sc = safeParse(f.schema, null);
        const prev = (sc && sc.settings && Array.isArray(sc.settings.prevSlugs)) ? sc.settings.prevSlugs : [];
        if (prev.indexOf(slug) >= 0) { row = Object.assign({}, f, { username: u.username, name: u.name }); break; }
      }
    }
  }
  if (!row) return json({ error: "not_found" }, 404);

  const schema = safeParse(row.schema, { questions: [], settings: {} });
  const settings = schema.settings || {}; schema.settings = settings;
  { const _ol = planLimits(await getUserPlan(env, row.owner_id)); if (!_ol.whiteLabel) settings.hideBranding = false; if (!_ol.customCss && settings.customCss) settings.customCss = ""; }
  let count = null;
  const cap = parseInt(settings.responseCap, 10);
  if (cap > 0) { const cr = await env.DB.prepare("SELECT COUNT(*) AS c FROM responses WHERE form_id = ?").bind(row.id).first(); count = (cr && cr.c) || 0; }
  const availability = formAvailability(!!row.is_open, settings, count);
  let bookings = null, optionCounts = null, poll = null;
  const schedQs = (schema.questions || []).filter((qq)=> qq && qq.type === "scheduling");
  const quotaQs = (schema.questions || []).filter((qq)=> qq && qq.type === "multiple_choice" && qq.quotas && Object.keys(qq.quotas).length);
  const pollQs = (schema.questions || []).filter((qq)=> qq && qq.type === "scheduling" && qq.mode === "poll");
  if (schedQs.length || quotaQs.length || pollQs.length){
    if (schedQs.length){ bookings = {}; schedQs.forEach((qq)=>{ bookings[qq.id] = {}; }); }
    if (quotaQs.length){ optionCounts = {}; quotaQs.forEach((qq)=>{ optionCounts[qq.id] = {}; }); }
    if (pollQs.length){ poll = {}; pollQs.forEach((qq)=>{ poll[qq.id] = { total:0, counts:{}, maybeCounts:{}, people: qq.hideResponses ? null : [] }; }); }
    const rsp = await env.DB.prepare("SELECT data FROM responses WHERE form_id = ?").bind(row.id).all();
    (rsp.results || []).forEach((rr)=>{
      const dd = safeParse(rr.data, {});
      schedQs.forEach((qq)=>{ const vv = dd[qq.id]; if (typeof vv === "string" && vv){ bookings[qq.id][vv] = (bookings[qq.id][vv] || 0) + 1; } });
      quotaQs.forEach((qq)=>{ const vv = dd[qq.id]; if (Array.isArray(vv)){ vv.forEach((o)=>{ optionCounts[qq.id][o] = (optionCounts[qq.id][o] || 0) + 1; }); } else if (typeof vv === "string" && vv){ optionCounts[qq.id][vv] = (optionCounts[qq.id][vv] || 0) + 1; } });
      pollQs.forEach((qq)=>{ const vv = dd[qq.id]; if (vv && typeof vv === "object" && !Array.isArray(vv)){ const p = poll[qq.id]; p.total++; const av = Array.isArray(vv.available) ? vv.available : []; av.forEach((k)=>{ p.counts[k] = (p.counts[k] || 0) + 1; }); const mb = Array.isArray(vv.maybe) ? vv.maybe : []; mb.forEach((k)=>{ p.maybeCounts[k] = (p.maybeCounts[k] || 0) + 1; }); if (p.people) p.people.push({ name: String(vv.name || "").slice(0, 80), available: av, maybe: mb }); } });
    });
  }
  let busy = [];
  try {
    const winQs = (schema.questions || []).filter((qq)=> qq && qq.type === "scheduling" && qq.availMode === "window");
    if (winQs.length){
      const nowB = new Date();
      let maxEnd = new Date(nowB.getTime() + 30*86400000);
      winQs.forEach((qq)=>{ if (qq.windowEnd){ const e = new Date(qq.windowEnd + "T23:59:59"); if (!isNaN(e.getTime()) && e > maxEnd) maxEnd = e; } });
      busy = await getOwnerBusy(env, row.owner_id, nowB.toISOString(), maxEnd.toISOString());
    }
  } catch (e) { busy = []; }
  return json({
    form: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      theme: safeParse(row.theme, defaultTheme()),
      schema,
      is_open: !!row.is_open,
      owner: { username: row.username, name: row.name },
    },
    availability,
    bookings,
    optionCounts,
    poll,
    busy,
  });
}

function scoreQuestionPoints(q, data){
  const pts = q.points || {};
  const vals = Array.isArray(data) ? data : (data === undefined || data === null || data === "" ? [] : [data]);
  if (q.type === "multiple_choice"){
    let score = 0; vals.forEach((v)=>{ const p = Number(pts[v]); if (!isNaN(p)) score += p; });
    const all = (q.options || []).map((o)=> Number(pts[o]) || 0);
    const max = q.multi ? all.filter((p)=> p > 0).reduce((a,b)=> a + b, 0) : Math.max(0, ...all);
    return { score, max };
  }
  if (q.type === "image_choice"){
    const opts = q.options || [];
    const vp = {}; opts.forEach((opt, i)=>{ vp[opt.label || ("Choice " + (i + 1))] = Number(pts[opt.id]) || 0; });
    let score = 0; vals.forEach((v)=>{ const p = vp[v]; if (typeof p === "number" && !isNaN(p)) score += p; });
    const all = opts.map((opt)=> Number(pts[opt.id]) || 0);
    const max = q.multi ? all.filter((p)=> p > 0).reduce((a,b)=> a + b, 0) : Math.max(0, ...all);
    return { score, max };
  }
  return { score: 0, max: 0 };
}
function scoreResponse(schema, data){
  const qs = (schema.questions || []).filter((q)=> q && (q.type === "multiple_choice" || q.type === "image_choice") && q.points && Object.keys(q.points).length);
  let score = 0, max = 0;
  qs.forEach((q)=>{ const r = scoreQuestionPoints(q, data[q.id]); score += r.score; max += r.max; });
  return { score: Math.round(score * 100) / 100, max: Math.round(max * 100) / 100, scored: qs.length };
}

async function submitResponse(formId, request, env, context) {
  const form = await env.DB.prepare("SELECT id, owner_id, is_open, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form) return json({ error: "not_found" }, 404);
  {
    const _ol = planLimits(await getUserPlan(env, form.owner_id));
    if (_ol.maxResp !== Infinity) { const cr = await env.DB.prepare("SELECT COUNT(*) AS c FROM responses WHERE form_id = ?").bind(formId).first(); if (((cr && cr.c) || 0) >= _ol.maxResp) return json({ error: "response_limit" }, 403); }
  }
  {
    const schemaA = safeParse(form.schema, { questions: [], settings: {} });
    const settingsA = schemaA.settings || {};
    let countA = null;
    const capA = parseInt(settingsA.responseCap, 10);
    if (capA > 0) { const cr = await env.DB.prepare("SELECT COUNT(*) AS c FROM responses WHERE form_id = ?").bind(formId).first(); countA = (cr && cr.c) || 0; }
    const availA = formAvailability(!!form.is_open, settingsA, countA);
    if (!availA.open) return json({ error: "form_closed", reason: availA.reason }, 403);
  }

  const body = await readJson(request) || {};
  const data = body.data && typeof body.data === "object" ? body.data : {};

  {
    const schemaV = safeParse(form.schema, { questions: [] });
    const schedV = (schemaV.questions || []).filter((q) => q && q.type === "scheduling");
    if (schedV.length) {
      const nowV = Date.now();
      let bookedCounts = null;
      for (const q of schedV) {
        const chosen = data[q.id];
        if (typeof chosen !== "string" || !chosen) continue;
        const slots = Array.isArray(q.slots) ? q.slots : [];
        let slot = slots.find((sl) => sl.start === chosen);
        if (!slot && q.availMode === "window") {
          if (!validWindowTime(q, chosen)) return json({ error: "slot_invalid", question: q.id }, 409);
          slot = { start: chosen, capacity: (q.meetingType === "group" ? (q.capacity || 1) : 1) };
        }
        if (!slot) return json({ error: "slot_invalid", question: q.id }, 409);
        const start = new Date(chosen).getTime();
        if (!isNaN(start)) {
          if (start < nowV) return json({ error: "slot_past", question: q.id }, 409);
          const minMs = (q.minNotice || 0) * 3600000;
          if (start < nowV + minMs) return json({ error: "slot_too_soon", question: q.id }, 409);
        }
        const mt = q.meetingType || "one_on_one";
        const cap = (slot.capacity == null) ? (mt === "group" ? (q.capacity || 1) : 1) : slot.capacity;
        if (cap > 0) {
          if (bookedCounts === null) {
            const rr = await env.DB.prepare("SELECT data FROM responses WHERE form_id = ?").bind(formId).all();
            bookedCounts = {};
            (rr.results || []).forEach((row) => { const dd = safeParse(row.data, {}); schedV.forEach((qq) => { const vv = dd[qq.id]; if (typeof vv === "string" && vv) { const k = qq.id + "\u0001" + vv; bookedCounts[k] = (bookedCounts[k] || 0) + 1; } }); });
          }
          const used = bookedCounts[q.id + "\u0001" + chosen] || 0;
          if (used >= cap) return json({ error: "slot_full", question: q.id }, 409);
        }
        if (!isNaN(start) && q.calendars && (q.calendars.google || q.calendars.outlook || q.calendars.office365)) {
          try {
            const durMs = (q.duration || q.slotMinutes || 30) * 60000;
            const ownerBusy = await getOwnerBusy(env, form.owner_id, new Date(start).toISOString(), new Date(start + durMs).toISOString());
            if (Array.isArray(ownerBusy) && ownerBusy.some((b)=>{ const bs = new Date(b.start).getTime(), be = new Date(b.end).getTime(); return !isNaN(bs) && !isNaN(be) && start < be && (start + durMs) > bs; })) return json({ error: "slot_busy", question: q.id }, 409);
          } catch (e) {}
        }
      }
    }
  }

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
    variant: typeof body.variant === "string" ? body.variant.slice(0, 4) : null,
    disqualified: body.disqualified === true,
  };

  const id = crypto.randomUUID();
  let scoreInfo = null;
  try {
    const schemaS = safeParse(form.schema, {});
    if (schemaS.settings && schemaS.settings.scoring){ scoreInfo = scoreResponse(schemaS, data); meta.score = scoreInfo.score; meta.maxScore = scoreInfo.max; }
  } catch (e) {}
  let pollUpsertId = null;
  try {
    const schemaP = safeParse(form.schema, { questions: [] });
    const pollQ = (schemaP.questions || []).find((q)=> q && q.type === "scheduling" && q.mode === "poll");
    if (pollQ){
      const ans = data[pollQ.id];
      if (ans && typeof ans === "object" && !Array.isArray(ans)){
        const rawPw = String(ans.password || ""); delete ans.password;
        ans.pw = rawPw ? await sha256hex(rawPw) : "";
        const nm = String(ans.name || "").trim().toLowerCase();
        if (nm){
          const ex = await env.DB.prepare("SELECT id, data FROM responses WHERE form_id = ?").bind(formId).all();
          for (const row of (ex.results || [])){
            const dd = safeParse(row.data, {}); const a2 = dd[pollQ.id];
            if (a2 && typeof a2 === "object" && String(a2.name || "").trim().toLowerCase() === nm){
              const exPw = String(a2.pw || "");
              if (exPw && exPw !== ans.pw) return json({ error: "name_locked", question: pollQ.id }, 409);
              pollUpsertId = row.id; break;
            }
          }
        }
      }
    }
  } catch (e) {}
  const respId = pollUpsertId || id;
  if (pollUpsertId){
    await env.DB.prepare("UPDATE responses SET data = ?, meta = ? WHERE id = ?").bind(JSON.stringify(data), JSON.stringify(meta), pollUpsertId).run();
  } else {
    await env.DB.prepare("INSERT INTO responses (id, form_id, data, meta) VALUES (?, ?, ?, ?)").bind(id, formId, JSON.stringify(data), JSON.stringify(meta)).run();
  }

  try {
    const schema = safeParse(form.schema, {});
    const settings = (schema && schema.settings) || {};
    if (settings.webhookUrl && context && context.waitUntil) {
      context.waitUntil(fireWebhook(settings.webhookUrl, formId, data, meta, (schema && schema.questions) || []));
    }
  } catch (e) {}

  try {
    const schemaE = safeParse(form.schema, {});
    const settingsE = (schemaE && schemaE.settings) || {};
    if (context && context.waitUntil && (settingsE.notifyEmail || settingsE.confirmEmail)) {
      context.waitUntil(notifyOnSubmit(env, formId, schemaE, settingsE, data, meta, respId));
    }
    if (context && context.waitUntil && bookingEventsFrom(schemaE, data).length) {
      context.waitUntil(googleCreateEvents(env, form.owner_id, schemaE, data));
    }
  } catch (e) {}

  let paymentUrl = null;
  try {
    const schemaPay = safeParse(form.schema, {});
    const pay = (schemaPay.settings && schemaPay.settings.payment) || null;
    if (pay && pay.enabled && env.STRIPE_SECRET_KEY && !pollUpsertId){
      const ar = await env.DB.prepare("SELECT stripe_account FROM users WHERE id = ?").bind(form.owner_id).first();
      const acct = ar && ar.stripe_account;
      const amount = Math.round(parseFloat(pay.amount) * 100);
      if (acct && amount >= 50){
        const cur = (pay.currency || "usd").toLowerCase();
        const origin = new URL(request.url).origin;
        const pubRow = await env.DB.prepare("SELECT f.slug, u.username FROM forms f JOIN users u ON u.id = f.owner_id WHERE f.id = ?").bind(formId).first();
        const path = pubRow ? ("/" + ((pubRow.username && pubRow.username !== "admin") ? (pubRow.username + "/") : "") + pubRow.slug) : "/";
        const params = {
          "mode": "payment",
          "line_items[0][price_data][currency]": cur,
          "line_items[0][price_data][unit_amount]": String(amount),
          "line_items[0][price_data][product_data][name]": String(pay.label || form.title || "Payment").slice(0, 120),
          "line_items[0][quantity]": "1",
          "success_url": origin + path + "?paid={CHECKOUT_SESSION_ID}",
          "cancel_url": origin + path + "?pay_cancel=1",
          "metadata[response_id]": respId,
          "metadata[form_id]": formId,
          "payment_intent_data[metadata][response_id]": respId,
        };
        const sess = await stripeApi(env, "checkout/sessions", params, acct);
        if (sess && sess.url){
          paymentUrl = sess.url;
          meta.payment = { status: "pending", amount, currency: cur, session: sess.id, at: new Date().toISOString() };
          await env.DB.prepare("UPDATE responses SET meta = ? WHERE id = ?").bind(JSON.stringify(meta), respId).run();
        }
      }
    }
  } catch (e) {}

  return json({ ok: true, id: respId, score: scoreInfo ? scoreInfo.score : null, maxScore: scoreInfo ? scoreInfo.max : null, payment_url: paymentUrl });
}

async function pollLoad(formId, request, env){
  const form = await env.DB.prepare("SELECT id, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form) return json({ error: "not_found" }, 404);
  const body = await readJson(request) || {};
  const qid = String(body.questionId || "");
  const nm = String(body.name || "").trim().toLowerCase();
  const rawPw = String(body.password || "");
  if (!qid || !nm) return json({ found: false });
  const pwHash = rawPw ? await sha256hex(rawPw) : "";
  const rr = await env.DB.prepare("SELECT data FROM responses WHERE form_id = ?").bind(formId).all();
  for (const row of (rr.results || [])){
    const dd = safeParse(row.data, {}); const a = dd[qid];
    if (a && typeof a === "object" && String(a.name || "").trim().toLowerCase() === nm){
      const exPw = String(a.pw || "");
      if (!exPw || exPw !== pwHash) return json({ found: true, locked: true });
      return json({ found: true, available: Array.isArray(a.available) ? a.available : [], maybe: Array.isArray(a.maybe) ? a.maybe : [] });
    }
  }
  return json({ found: false });
}
function apiKeyFromReq(request){
  const a = request.headers.get("authorization") || "";
  const m = a.match(/Bearer\s+(.+)/i);
  if (m) return m[1].trim();
  try { return new URL(request.url).searchParams.get("key") || ""; } catch (e) { return ""; }
}
async function apiGetForm(formId, request, env){
  const form = await env.DB.prepare("SELECT id, slug, title, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form) return json({ error: "not_found" }, 404);
  const schema = safeParse(form.schema, { questions: [], settings: {} });
  const key = (schema.settings && schema.settings.apiKey) || "";
  if (!key || apiKeyFromReq(request) !== key) return json({ error: "unauthorized" }, 401);
  const skip = { text_graphic: 1, page_break: 1, block: 1, embed: 1 };
  const settings = { ...(schema.settings || {}) };
  delete settings.apiKey;
  const questions = (schema.questions || []).filter((q)=> q && !skip[q.type]).map((q)=>({
    id: q.id, key: q.exportKey || null, type: q.type, label: q.label || q.heading || null, required: !!q.required,
  }));
  return json({ form: { id: form.id, slug: form.slug, title: form.title, questions, settings } });
}
async function apiSubmit(formId, request, env, context){
  const form = await env.DB.prepare("SELECT id, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form) return json({ error: "not_found" }, 404);
  const schema = safeParse(form.schema, { settings: {} });
  const key = (schema.settings && schema.settings.apiKey) || "";
  if (!key || apiKeyFromReq(request) !== key) return json({ error: "unauthorized" }, 401);
  return submitResponse(formId, request, env, context);
}

async function fireWebhook(url, formId, data, meta, questions){
  try {
    const inputs = (questions || []).filter((q)=> q && q.type !== "text_graphic" && q.type !== "page_break" && q.type !== "hidden_field" && q.type !== "block" && q.type !== "embed");
    const responses = inputs.map((q)=>({ question: q.label || q.id, answer: formatAnswer(data[q.id]) }));
    const emailQ = inputs.find((q)=> q.type === "text_entry" && q.validation === "email" && data[q.id]);
    const npsQ = inputs.find((q)=> q.type === "nps" && data[q.id] !== undefined && data[q.id] !== null);
    const hidden = (questions || []).filter((q)=> q && q.type === "hidden_field");
    const fields = {};
    hidden.forEach((q)=>{ if (q.key) fields[q.key] = data[q.id]; });
    const mapped = {};
    inputs.forEach((q)=>{ if (q.exportKey) mapped[q.exportKey] = formatAnswer(data[q.id]); });
    const payload = {
      event: "form_submission",
      data: {
        survey_id: formId,
        respondent: {
          email: emailQ ? data[emailQ.id] : null,
          nps_score: npsQ ? data[npsQ.id] : null,
        },
        responses,
        mapped,
        metadata: {
          utm_source: (meta.utm && meta.utm.source) || null,
          time_to_complete_seconds: typeof meta.seconds === "number" ? meta.seconds : null,
          country: meta.country || null,
          browser: meta.browser || null,
          fields,
          followups: meta.followups || [],
          variant: meta.variant || null,
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
  const form = await env.DB.prepare("SELECT owner_id, org_id FROM forms WHERE id = ?").bind(id).first();
  if (!canForm(form, user)) return json({ error: "not_found" }, 404);

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
  const form = await env.DB.prepare("SELECT owner_id, org_id FROM forms WHERE id = ?").bind(id).first();
  if (!canForm(form, user)) return json({ error: "not_found" }, 404);

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
  if (!planLimits(await getUserPlan(env, user.uid)).export) return json({ error: "plan_limit", limit: "export" }, 403);
  const form = await env.DB.prepare(
    "SELECT owner_id, title, schema FROM forms WHERE id = ?"
  ).bind(id).first();
  if (!form || form.owner_id !== user.uid) return json({ error: "not_found" }, 404);

  const schema = safeParse(form.schema, { questions: [] });
  const questions = (schema.questions || []).filter((q) => q.type !== "text_graphic" && q.type !== "page_break" && q.type !== "block" && q.type !== "embed");
  const scoring = !!(schema.settings && schema.settings.scoring);
  const experiment = !!(schema.settings && schema.settings.experiment);

  const { results } = await env.DB.prepare(
    "SELECT id, data, meta, created_at FROM responses WHERE form_id = ? ORDER BY created_at ASC"
  ).bind(id).all();

  const anyDisq = (results || []).some((r) => { const m = safeParse(r.meta, {}); return m.disqualified === true; });

  const header = ["response_id", "submitted_at", "country", "city", "region", "browser", "os"];
  questions.forEach((q) => header.push(q.exportKey || q.label || q.heading || q.id));
  if (scoring) { header.push("score"); header.push("max_score"); }
  if (experiment) header.push("variant");
  if (anyDisq) header.push("disqualified");

  const lines = [header.map(csvCell).join(",")];
  for (const r of (results || [])) {
    const data = safeParse(r.data, {});
    const meta = safeParse(r.meta, {});
    const row = [
      r.id, r.created_at, meta.country || "", meta.city || "",
      meta.region || "", meta.browser || "", meta.os || "",
    ];
    questions.forEach((q) => row.push(formatAnswer(data[q.id])));
    if (scoring) { row.push(meta.score != null ? meta.score : ""); row.push(meta.maxScore != null ? meta.maxScore : ""); }
    if (experiment) row.push(meta.variant || "");
    if (anyDisq) row.push(meta.disqualified ? "yes" : "no");
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

async function uploadFile(formId, request, env) {
  if (!env.FILES) return json({ error: "storage_unconfigured" }, 501);
  const form = await env.DB.prepare("SELECT id, owner_id, is_open, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form) return json({ error: "not_found" }, 404);
  const schemaA = safeParse(form.schema, { questions: [], settings: {} });
  const settingsA = schemaA.settings || {};
  let countA = null; const capA = parseInt(settingsA.responseCap, 10);
  if (capA > 0) { const cr = await env.DB.prepare("SELECT COUNT(*) AS c FROM responses WHERE form_id = ?").bind(formId).first(); countA = (cr && cr.c) || 0; }
  const availA = formAvailability(!!form.is_open, settingsA, countA);
  if (!availA.open) return json({ error: "form_closed" }, 403);
  let file;
  try { const fd = await request.formData(); file = fd.get("file"); } catch (e) { return json({ error: "bad_request" }, 400); }
  if (!file || typeof file === "string") return json({ error: "no_file" }, 400);
  const maxMb = planLimits(await getUserPlan(env, form.owner_id)).uploadMb; // plan-based cap (client compresses images to fit first)
  if (file.size && file.size > maxMb * 1024 * 1024) return json({ error: "too_large", maxMb }, 413);
  const safe = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
  const key = "uploads/" + formId + "/" + crypto.randomUUID() + "-" + safe;
  try {
    const buf = await file.arrayBuffer();
    await env.FILES.put(key, buf, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  } catch (e) { return json({ error: "store_failed", detail: String(e && e.message || e) }, 500); }
  return json({ key, name: file.name || safe, size: file.size || 0, type: file.type || "" });
}

async function serveFile(user, id, request, env) {
  if (!env.FILES) return json({ error: "storage_unconfigured" }, 501);
  const own = await env.DB.prepare("SELECT owner_id FROM forms WHERE id = ?").bind(id).first();
  if (!own || own.owner_id !== user.uid) return json({ error: "not_found" }, 404);
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (key.indexOf("uploads/" + id + "/") !== 0) return json({ error: "forbidden" }, 403);
  const obj = await env.FILES.get(key);
  if (!obj) return json({ error: "not_found" }, 404);
  const headers = new Headers();
  const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream";
  headers.set("Content-Type", ct);
  const fname = (key.split("/").pop() || "file").replace(/^[0-9a-fA-F-]{36}-/, "");
  const disp = url.searchParams.get("download") ? "attachment" : "inline";
  headers.set("Content-Disposition", disp + '; filename="' + fname.replace(/"/g, "") + '"');
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(obj.body, { status: 200, headers });
}

function formatAnswer(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && v.indexOf("data:image") === 0) return "[signature]";
  if (v && typeof v === "object" && v.key && v.name) return v.name;
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" && x.name) ? x.name : x).join("; ");
  if (typeof v === "object") return Object.keys(v).map((k) => { const val = v[k]; if (val && typeof val === "object" && !Array.isArray(val)) return k + ": (" + Object.keys(val).map((c)=> c + "=" + val[c]).join(", ") + ")"; return k + ": " + (Array.isArray(val) ? val.join("/") : val); }).join(" | ");
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

function usernameFromEmail(email) {
  return String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 28);
}
const RESERVED_USERNAMES = new Set(["admin","dashboard","builder","login","api","assets","favicon","robots","new","me","public","auth","cron","cal","v1","logout","account","settings"]);
function validUsername(u) {
  return typeof u === "string" && /^[a-z0-9_-]{4,30}$/.test(u) && !RESERVED_USERNAMES.has(u);
}
async function uniqueUsername(env, base, excludeUid) {
  base = String(base || "").replace(/[^a-z0-9_-]/g, "").slice(0, 28) || "user";
  while (base.length < 4) base += "0";
  let cand = base, n = 1;
  while (true) {
    if (cand.length < 4 || RESERVED_USERNAMES.has(cand)) { n += 1; cand = base + n; continue; }
    const hit = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(cand).first();
    if (!hit || (excludeUid && hit.id === excludeUid)) return cand;
    n += 1; cand = base + n;
  }
}

async function updateUsername(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.uid === "admin") return json({ error: "admin_fixed" }, 400);
  const body = await readJson(request) || {};
  const desired = String(body.username || "").toLowerCase().trim();
  if (!validUsername(desired)) return json({ error: "invalid_username" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(desired).first();
  if (existing && existing.id !== user.uid) return json({ error: "taken" }, 409);
  await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(desired, user.uid).run();
  const payload = { uid: user.uid, username: desired, name: user.name, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  const token = await makeToken(secret(env), payload);
  const res = json({ ok: true, user: publicUser(payload) });
  res.headers.append("Set-Cookie", sessionCookie(token));
  return res;
}

/* ------------------------------------------------------------------ */
/* plans and tiers                                                     */
/* ------------------------------------------------------------------ */
const PLANS = {
  free:       { maxForms: 5,        maxResp: 100,      uploadMb: 5,    export: false, whiteLabel: false, customCss: false, proFeatures: false, priority: false, team: false, sso: false, zeffy: false },
  edu:        { maxForms: 100,      maxResp: 1000,     uploadMb: 10,   export: true,  whiteLabel: true,  customCss: false, proFeatures: true,  priority: false, team: false, sso: false, zeffy: false },
  nonprofit:  { maxForms: 100,      maxResp: 1000,     uploadMb: 10,   export: true,  whiteLabel: true,  customCss: false, proFeatures: true,  priority: false, team: false, sso: false, zeffy: true  },
  pro:        { maxForms: 100,      maxResp: 1000,     uploadMb: 10,   export: true,  whiteLabel: true,  customCss: false, proFeatures: true,  priority: false, team: false, sso: false, zeffy: false },
  premium:    { maxForms: Infinity, maxResp: Infinity, uploadMb: 1024, export: true,  whiteLabel: true,  customCss: true,  proFeatures: true,  priority: true,  team: false, sso: false, zeffy: false },
  enterprise: { maxForms: Infinity, maxResp: Infinity, uploadMb: 1024, export: true,  whiteLabel: true,  customCss: true,  proFeatures: true,  priority: true,  team: true,  sso: true,  zeffy: false },
};
function planLimits(plan){ return PLANS[plan] || PLANS.free; }
function isEduEmail(email){ return /\.edu(\.[a-z]{2,3})?$/i.test(String(email || "").trim().toLowerCase()); }
function effectivePlan(plan, email){ plan = plan || "free"; if (plan === "free" && isEduEmail(email)) plan = "edu"; return plan; }
async function getUserPlan(env, uid){
  if (uid === "admin") return "enterprise";
  try {
    const row = await env.DB.prepare("SELECT plan, email FROM users WHERE id = ?").bind(uid).first();
    let plan = effectivePlan(row && row.plan, row && row.email);
    if (plan === "edu" && row && (!row.plan || row.plan === "free")) { try { await env.DB.prepare("UPDATE users SET plan = 'edu' WHERE id = ?").bind(uid).run(); } catch (e) {} }
    return plan;
  } catch (e) { return "free"; }
}
function adminEmail(env){
  if (env.ADMIN_EMAIL) return env.ADMIN_EMAIL;
  const m = String(env.MAIL_FROM || "").match(/<([^>]+)>/);
  return (m && m[1]) || String(env.MAIL_FROM || "").trim() || "";
}

async function applyPlan(request, env){
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.uid === "admin") return json({ error: "admin_fixed" }, 400);
  const body = await readJson(request) || {};
  const kind = body.kind === "nonprofit" ? "nonprofit" : "education";
  const org = String(body.org || "").slice(0, 160);
  const note = String(body.note || "").slice(0, 600);
  const reqObj = { kind, org, note, status: "pending", at: new Date().toISOString() };
  try { await env.DB.prepare("UPDATE users SET plan_request = ? WHERE id = ?").bind(JSON.stringify(reqObj), user.uid).run(); }
  catch (e) { return json({ error: "not_available" }, 500); }
  const to = adminEmail(env);
  if (to) {
    const label = kind === "nonprofit" ? "Nonprofit" : "Education";
    const html = `<p>A user has applied for ${label} status on zetetiq.</p>` +
      `<p><b>Name:</b> ${user.name || ""}<br/><b>Username:</b> ${user.username || ""}<br/><b>Type:</b> ${label}<br/><b>Organization:</b> ${org || "(none)"}</p>` +
      (note ? `<p><b>Note:</b> ${note}</p>` : "") +
      `<p>Open the admin console to approve or decline.</p>`;
    try { await mailSend(env, { to, subject: `New ${label} application from ${user.name || user.username}`, html }); } catch (e) {}
  }
  return json({ ok: true });
}

async function adminApplications(request, env){
  const user = await currentUser(request, env);
  if (!user || user.role !== "admin") return json({ error: "forbidden" }, 403);
  let rows = [];
  try { const r = await env.DB.prepare("SELECT id, username, name, email, plan, plan_request FROM users WHERE plan_request IS NOT NULL").all(); rows = r.results || []; } catch (e) {}
  const apps = rows.map((u)=>{ const pr = u.plan_request ? safeParse(u.plan_request, null) : null; return (pr && pr.status === "pending") ? { uid: u.id, username: u.username, name: u.name, email: u.email, plan: u.plan || "free", request: pr } : null; }).filter(Boolean);
  return json({ applications: apps });
}

async function adminSetPlan(request, env){
  const user = await currentUser(request, env);
  if (!user || user.role !== "admin") return json({ error: "forbidden" }, 403);
  const body = await readJson(request) || {};
  const uid = String(body.uid || "");
  const plan = ["free","edu","nonprofit","pro","premium","enterprise"].indexOf(body.plan) >= 0 ? body.plan : null;
  if (!uid || !plan || uid === "admin") return json({ error: "bad_request" }, 400);
  let pr = null;
  try { const row = await env.DB.prepare("SELECT plan_request FROM users WHERE id = ?").bind(uid).first(); pr = (row && row.plan_request) ? safeParse(row.plan_request, null) : null; } catch (e) {}
  const newReq = pr ? JSON.stringify(Object.assign({}, pr, { status: plan === "free" ? "denied" : "approved" })) : null;
  try { await env.DB.prepare("UPDATE users SET plan = ?, plan_request = ? WHERE id = ?").bind(plan, newReq, uid).run(); }
  catch (e) { return json({ error: "not_available" }, 500); }
  return json({ ok: true, plan });
}

async function adminDeleteUser(request, env){
  const user = await currentUser(request, env);
  if (!user || user.role !== "admin") return json({ error: "forbidden" }, 403);
  const body = await readJson(request) || {};
  const uid = String(body.uid || "");
  if (!uid || uid === "admin") return json({ error: "bad_request" }, 400);
  let target = null;
  try { target = await env.DB.prepare("SELECT id, is_admin FROM users WHERE id = ?").bind(uid).first(); } catch (e) {}
  if (!target) return json({ error: "not_found" }, 404);
  if (target.is_admin) return json({ error: "forbidden" }, 403);
  let formIds = [];
  try { const fr = await env.DB.prepare("SELECT id FROM forms WHERE owner_id = ?").bind(uid).all(); formIds = (fr.results || []).map((r)=> r.id); } catch (e) {}
  for (const fid of formIds){
    try { await env.DB.prepare("DELETE FROM responses WHERE form_id = ?").bind(fid).run(); } catch (e) {}
    try { await env.DB.prepare("DELETE FROM ai_summaries WHERE form_id = ?").bind(fid).run(); } catch (e) {}
  }
  try { await env.DB.prepare("DELETE FROM forms WHERE owner_id = ?").bind(uid).run(); } catch (e) {}
  try { await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid).run(); }
  catch (e) { return json({ error: "not_available" }, 500); }
  try {
    if (env.FILES && formIds.length){
      for (const fid of formIds){
        for (const pre of [fid + "/", "uploads/" + fid + "/"]){
          let cursor; let guard = 0;
          do { const res = await env.FILES.list({ prefix: pre, limit: 1000, cursor }); for (const o of (res.objects || [])){ try { await env.FILES.delete(o.key); } catch (e2) {} } cursor = res.truncated ? res.cursor : undefined; guard++; } while (cursor && guard < 50);
        }
      }
    }
  } catch (e) {}
  return json({ ok: true });
}

function validWindowTime(q, chosen){
  if (typeof chosen !== "string") return false;
  const d = new Date(chosen); if (isNaN(d)) return false;
  const ymd = chosen.slice(0,10);
  if (q.windowStart && ymd < q.windowStart) return false;
  if (q.windowEnd && ymd > q.windowEnd) return false;
  const wds = (Array.isArray(q.weekdays) && q.weekdays.length) ? q.weekdays : [0,1,2,3,4,5,6];
  const wd = new Date(ymd + "T00:00:00Z").getUTCDay();
  if (wds.indexOf(wd) < 0) return false;
  let sh = q.startHour == null ? 9 : q.startHour;
  let eh = q.endHour == null ? 17 : q.endHour;
  if (q.perDayHours && q.dayHours && q.dayHours[wd]){ const dh = q.dayHours[wd]; if (dh.s != null) sh = dh.s; if (dh.e != null) eh = dh.e; }
  const hh = parseInt(chosen.slice(11,13), 10), mm = parseInt(chosen.slice(14,16), 10);
  if (isNaN(hh) || isNaN(mm)) return false;
  const mins = hh*60 + mm;
  if (mins < sh*60 || mins >= eh*60) return false;
  if (!q.freePick){ const step = Math.max(5, q.slotMinutes || 60); if (((mins - sh*60) % step) !== 0) return false; }
  return true;
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

async function uniqueSlugFrom(env, ownerId, base, exceptId) {
  base = slugify(base);
  let slug = base;
  let n = 1;
  while (true) {
    const hit = exceptId
      ? await env.DB.prepare("SELECT 1 FROM forms WHERE owner_id = ? AND slug = ? AND id != ?").bind(ownerId, slug, exceptId).first()
      : await env.DB.prepare("SELECT 1 FROM forms WHERE owner_id = ? AND slug = ?").bind(ownerId, slug).first();
    if (!hit) return slug;
    n += 1;
    slug = `${base}-${n}`;
    if (n > 300) return `${base}-${Date.now()}`;
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

async function sha256hex(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(str)));
  return Array.from(new Uint8Array(buf)).map((b)=> b.toString(16).padStart(2, "0")).join("");
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

/* ---- calendar subscription feed, email notifications, and reminders ---- */
function _icsEsc(t){ return String(t == null ? "" : t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function _p2(n){ return String(n).padStart(2, "0"); }
function _icsStamp(d){ return d.getUTCFullYear() + _p2(d.getUTCMonth() + 1) + _p2(d.getUTCDate()) + "T" + _p2(d.getUTCHours()) + _p2(d.getUTCMinutes()) + _p2(d.getUTCSeconds()) + "Z"; }
function htmlEscape(t){ return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function stripHtmlTags(h){ return String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function fmtWhenUTC(d){ try { return d.toUTCString().replace(" GMT", " UTC"); } catch (e){ return d.toISOString(); } }
function bookingEventsFrom(schema, data){
  const qs = (schema && schema.questions) || []; const out = [];
  qs.forEach((q)=>{ if (!q || q.type !== "scheduling") return; const v = data[q.id]; if (typeof v !== "string" || !v) return; const start = new Date(v); if (isNaN(start.getTime())) return;
    const dur = (q.duration && q.duration > 0) ? q.duration : 30;
    const vl = { zoom:"Zoom", meet:"Google Meet", teams:"Microsoft Teams", webex:"Webex" };
    out.push({ uid: (q.id + "-" + start.getTime()), start, durationMin: dur, summary: (q.meetingTitle || q.label || "Meeting"), location: (q.location || ""), video: (q.video && q.video !== "none") ? (vl[q.video] || "Video") : "", attendee: "" });
  });
  return out;
}
function buildBookingICS(events, calName){
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//zetetiq//calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + _icsEsc(calName || "Bookings")];
  const stamp = _icsStamp(new Date());
  (events || []).forEach((e)=>{ const end = new Date(e.start.getTime() + e.durationMin * 60000);
    lines.push("BEGIN:VEVENT", "UID:" + e.uid + "@zetetiq", "DTSTAMP:" + stamp, "DTSTART:" + _icsStamp(e.start), "DTEND:" + _icsStamp(end), "SUMMARY:" + _icsEsc(e.summary));
    if (e.location) lines.push("LOCATION:" + _icsEsc(e.location));
    const desc = [e.video ? (e.video + " meeting") : "", e.attendee ? ("With " + e.attendee) : ""].filter(Boolean).join(". ");
    if (desc) lines.push("DESCRIPTION:" + _icsEsc(desc));
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function findRespondentEmail(data){
  const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; const vals = [];
  Object.keys(data || {}).forEach((k)=>{ const v = data[k]; if (typeof v === "string") vals.push(v); else if (v && typeof v === "object" && !Array.isArray(v)) Object.keys(v).forEach((kk)=>{ if (typeof v[kk] === "string") vals.push(v[kk]); }); });
  for (const v of vals){ const t = v.trim(); if (rx.test(t)) return t; }
  return null;
}
function findRespondentName(data){
  const keys = Object.keys(data || {});
  for (const k of keys){ const v = data[k]; if (v && typeof v === "object" && !Array.isArray(v)){ for (const kk of Object.keys(v)){ if (/name/i.test(kk) && typeof v[kk] === "string" && v[kk].trim()) return v[kk].trim(); } } }
  return "";
}
async function mailSend(env, opts){
  if (!env || !env.RESEND_API_KEY) return { ok: false, skipped: true };
  const from = env.MAIL_FROM || "zetetiq <onboarding@resend.dev>";
  const body = { from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text || stripHtmlTags(opts.html) };
  if (opts.ics){ let content = ""; try { content = btoa(unescape(encodeURIComponent(opts.ics))); } catch (e){ content = ""; } if (content) body.attachments = [{ filename: opts.icsName || "invite.ics", content }]; }
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status };
  } catch (e){ return { ok: false, error: String(e && e.message || e) }; }
}
async function calendarFeed(formId, token, env){
  const form = await env.DB.prepare("SELECT id, title, schema FROM forms WHERE id = ?").bind(formId).first();
  if (!form) return new Response("Not found", { status: 404 });
  const schema = safeParse(form.schema, { questions: [], settings: {} });
  const settings = schema.settings || {};
  if (!settings.calFeed || !settings.calToken || settings.calToken !== token) return new Response("Not found", { status: 404 });
  const rr = await env.DB.prepare("SELECT data FROM responses WHERE form_id = ?").bind(formId).all();
  let events = [];
  (rr.results || []).forEach((row)=>{ const dd = safeParse(row.data, {}); const evs = bookingEventsFrom(schema, dd); const who = findRespondentName(dd) || findRespondentEmail(dd) || ""; evs.forEach((e)=>{ e.attendee = who; }); events = events.concat(evs); });
  const ics = buildBookingICS(events, (form.title || "Bookings") + " bookings");
  return new Response(ics, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=\"booked.ics\"", "Cache-Control": "no-cache" } });
}
async function notifyOnSubmit(env, formId, schema, settings, data, meta, respId){
  try {
    if (!env || !env.RESEND_API_KEY) return;
    if (meta && meta.disqualified) return;
    const events = bookingEventsFrom(schema, data);
    const isBooking = events.length > 0;
    const formRow = await env.DB.prepare("SELECT title FROM forms WHERE id = ?").bind(formId).first();
    const title = (formRow && formRow.title) || "your form";
    const name = findRespondentName(data);
    const email = findRespondentEmail(data);
    if (settings.notifyEmail){
      let h = "<p>A new response was submitted to " + htmlEscape(title) + ".</p>";
      if (isBooking) h += "<p>Booking: " + events.map((e)=> htmlEscape(e.summary) + " on " + htmlEscape(fmtWhenUTC(e.start))).join("<br>") + "</p>";
      if (name) h += "<p>Name: " + htmlEscape(name) + "</p>";
      if (email) h += "<p>Email: " + htmlEscape(email) + "</p>";
      await mailSend(env, { to: settings.notifyEmail, subject: (isBooking ? "New booking: " : "New response: ") + title, html: h });
    }
    if (settings.confirmEmail && isBooking && email){
      const ics = buildBookingICS(events.map((e)=>{ const c = Object.assign({}, e); c.attendee = name || ""; return c; }), title);
      const when = events.map((e)=> htmlEscape(e.summary) + " on " + htmlEscape(fmtWhenUTC(e.start))).join("<br>");
      const h = "<p>" + (name ? ("Hi " + htmlEscape(name) + ",") : "Hi,") + "</p><p>Your booking is confirmed.</p><p>" + when + "</p><p>A calendar invite is attached. Times are shown in UTC.</p>";
      await mailSend(env, { to: email, subject: "Your booking is confirmed", html: h, ics, icsName: "booking.ics" });
    }
  } catch (e){}
}
async function cronReminders(request, env, context){
  const key = (()=>{ try { return new URL(request.url).searchParams.get("key"); } catch (e){ return null; } })();
  if (!env || !env.CRON_SECRET || key !== env.CRON_SECRET) return json({ error: "unauthorized" }, 401);
  if (!env.RESEND_API_KEY) return json({ ok: true, sent: 0, note: "mail not configured" });
  const now = Date.now();
  const forms = await env.DB.prepare("SELECT id, title, schema FROM forms").all();
  let sent = 0, scanned = 0;
  for (const f of (forms.results || [])){
    const schema = safeParse(f.schema, { questions: [], settings: {} });
    const settings = schema.settings || {};
    if (!settings.reminders) continue;
    const leadMs = (parseInt(settings.reminderHours, 10) || 24) * 3600000;
    const rr = await env.DB.prepare("SELECT id, data, meta FROM responses WHERE form_id = ?").bind(f.id).all();
    for (const row of (rr.results || [])){
      const data = safeParse(row.data, {});
      const m = safeParse(row.meta, {});
      if (m && m.reminded) continue;
      const events = bookingEventsFrom(schema, data);
      if (!events.length) continue;
      scanned++;
      const due = events.filter((e)=>{ const t = e.start.getTime(); return t > now && (t - now) <= leadMs; });
      if (!due.length) continue;
      const email = findRespondentEmail(data);
      if (!email) continue;
      const name = findRespondentName(data);
      const when = due.map((e)=> htmlEscape(e.summary) + " on " + htmlEscape(fmtWhenUTC(e.start))).join("<br>");
      const ics = buildBookingICS(due.map((e)=>{ const c = Object.assign({}, e); c.attendee = name || ""; return c; }), (f.title || "Reminder"));
      const res = await mailSend(env, { to: email, subject: "Reminder: upcoming meeting", html: "<p>" + (name ? ("Hi " + htmlEscape(name) + ",") : "Hi,") + "</p><p>This is a reminder of your upcoming meeting.</p><p>" + when + "</p>", ics, icsName: "reminder.ics" });
      if (res && res.ok !== false){ m.reminded = true; m.remindedAt = new Date().toISOString(); await env.DB.prepare("UPDATE responses SET meta = ? WHERE id = ?").bind(JSON.stringify(m), row.id).run(); sent++; }
    }
  }
  return json({ ok: true, sent, scanned });
}

/* ---- admin console: system-wide overview (admin only) ---- */
async function r2UsageByForm(env){
  const map = {};
  if (!env || !env.FILES) return { map, total: 0, available: false };
  let cursor = undefined, total = 0, guard = 0;
  try {
    do {
      const res = await env.FILES.list({ limit: 1000, cursor });
      (res.objects || []).forEach((o)=>{ const parts = String(o.key || "").split("/"); const fid = parts[0] === "uploads" ? (parts[1] || "") : parts[0]; const sz = o.size || 0; if (fid) map[fid] = (map[fid] || 0) + sz; total += sz; });
      cursor = res.truncated ? res.cursor : undefined; guard++;
    } while (cursor && guard < 50);
  } catch (e) { return { map, total, available: false }; }
  return { map, total, available: true };
}
async function adminOverview(request, env){
  const user = await currentUser(request, env);
  if (!user || user.role !== "admin") return json({ error: "forbidden" }, 403);
  const usersRes = await env.DB.prepare("SELECT id, username, name, email, is_admin, created_at FROM users").all();
  const formsRes = await env.DB.prepare("SELECT id, owner_id, slug, title, is_open, schema, created_at, updated_at FROM forms").all();
  const rcRes = await env.DB.prepare("SELECT form_id, COUNT(*) AS c, MAX(created_at) AS last FROM responses GROUP BY form_id").all();
  const rc = {}; (rcRes.results || []).forEach((r)=>{ rc[r.form_id] = { c: r.c || 0, last: r.last || null }; });
  const usage = await r2UsageByForm(env);
  let planMap = {}; try { const pr = await env.DB.prepare("SELECT id, plan FROM users").all(); (pr.results || []).forEach((r)=>{ planMap[r.id] = r.plan; }); } catch (e) {}
  const users = (usersRes.results || []).map((u)=>({ id: u.id, username: u.username, name: u.name, email: u.email, isAdmin: !!u.is_admin, plan: u.is_admin ? "enterprise" : effectivePlan(planMap[u.id], u.email), created_at: u.created_at, forms: [], formCount: 0, responseCount: 0, storageBytes: 0, lastResponseAt: null }));
  const byId = {}; users.forEach((u)=>{ byId[u.id] = u; });
  let totalResponses = 0, openForms = 0; const qtypes = {};
  (formsRes.results || []).forEach((f)=>{
    const r = rc[f.id] || { c: 0, last: null };
    const sb = usage.map[f.id] || 0;
    totalResponses += r.c; if (f.is_open) openForms++;
    const fo = { id: f.id, slug: f.slug, title: f.title, isOpen: !!f.is_open, created_at: f.created_at, updated_at: f.updated_at, responses: r.c, lastResponseAt: r.last, storageBytes: sb };
    const owner = byId[f.owner_id];
    if (owner){ owner.forms.push(fo); owner.formCount++; owner.responseCount += r.c; owner.storageBytes += sb; if (r.last && (!owner.lastResponseAt || r.last > owner.lastResponseAt)) owner.lastResponseAt = r.last; }
    try { const sc = safeParse(f.schema, null); const qs = (sc && Array.isArray(sc.questions)) ? sc.questions : []; qs.forEach((q)=>{ const tp = q && q.type; if (tp) qtypes[tp] = (qtypes[tp] || 0) + 1; }); } catch (e) {}
  });
  users.forEach((u)=> u.forms.sort((a, b)=> (b.responses - a.responses) || (String(b.updated_at) > String(a.updated_at) ? 1 : -1)));
  users.sort((a, b)=> (b.responseCount - a.responseCount) || (b.formCount - a.formCount));
  const questionTypes = Object.keys(qtypes).map((k)=>({ type: k, count: qtypes[k] })).sort((a, b)=> b.count - a.count);
  const totalQuestions = questionTypes.reduce((acc, x)=> acc + x.count, 0);
  const totals = { users: users.length, forms: (formsRes.results || []).length, responses: totalResponses, openForms, storageBytes: usage.total, storageAvailable: usage.available, questions: totalQuestions };
  return json({ totals, users, questionTypes });
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

  const maxResp = forms.reduce((a, f) => Math.max(a, f.responses || 0), 0);
  if (!(forms.length > 5 || maxResp > 15)) {
    return json({ summary: `${forms.length} forms, ${total} total responses. Your most active form is "${forms[0].title}" with ${forms[0].responses}.`, generated: false });
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
  if (total <= 15) {
    return json({ summary: `${total} response${total === 1 ? "" : "s"} collected so far. Open the analytics tab for the full breakdown.`, generated: false });
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
  const models = [env.AI_MODEL, "@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.1-8b-instruct-fast"].filter(Boolean);
  let lastErr = "ai_unavailable";
  for (const model of models) {
    try {
      const out = await env.AI.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        max_tokens: maxTokens || 240,
        temperature: 0.3,
      });
      let text = "";
      if (typeof out === "string") text = out;
      else if (out) {
        text = out.response || out.result || out.output_text || out.text ||
          (out.choices && out.choices[0] && ((out.choices[0].message && out.choices[0].message.content) || out.choices[0].text)) || "";
      }
      text = cleanText(text);
      if (text) return { text, model };
      lastErr = "empty_response";
    } catch (e) { lastErr = String((e && e.message) || e); }
  }
  return { error: lastErr };
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
