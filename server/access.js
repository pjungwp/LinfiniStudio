// Demo access: guest codes, allowances, the daily ceiling and the per-network limit.
// Pure rules over a small store interface, so they can be tested without Netlify:
//   store.get(key, { type: "json" }) · store.setJSON(key, value) · store.delete(key) · store.list({ prefix }) -> { blobs: [{ key }] }
// Keys: settings · code/<CODE> · day/<YYYY-MM-DD> · ip/<hash>/<YYYYMMDDHH> · t/<ticket id> (one per conversation)
//
// How minutes are counted. Starting a conversation reserves its full length (up to the guest's remaining minutes and
// the day's remaining minutes) straight away. When it ends, the page reports back and the unused part is returned,
// based on the time that actually passed on the server's clock. If the page never reports back, the reservation stands:
// mistakes always fall on the side of spending less.
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DEFAULT_SETTINGS = { open: false, paused: false, dailyMinutes: 60, maxMinutes: 5, perIpHour: 6 };
const TZ = "America/New_York";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O or 1/I

export const dayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hourKey = (d = new Date()) => d.toISOString().slice(0, 13).replace(/\D/g, "");
export const normCode = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
const validCode = (c) => /^[A-Z0-9-]{4,32}$/.test(c);
const clampInt = (v, lo, hi, dflt) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };

const get = async (store, k) => { try { return (await store.get(k, { type: "json" })) ?? null; } catch { return null; } };
const set = (store, k, v) => store.setJSON(k, v);
const keys = async (store, prefix) => ((await store.list({ prefix }))?.blobs || []).map((b) => b.key);

export async function getSettings(store) { return { ...DEFAULT_SETTINGS, ...((await get(store, "settings")) || {}) }; }

export function newCode() {
  const b = randomBytes(8); let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `LS-${s.slice(0, 4)}-${s.slice(4)}`;
}
function codeState(c, now = Date.now()) {
  if (!c) return "unknown";
  if (!c.active) return "off";
  if (c.expires && now > Date.parse(c.expires + "T23:59:59" + "-05:00")) return "expired";
  if (c.usedSec >= c.allowanceMin * 60 - 30) return "used up";
  return "ok";
}
const remainingSec = (c) => Math.max(0, Math.round(c.allowanceMin * 60 - c.usedSec));
const GUEST_MSG = { unknown: "That guest code is not correct.", off: "That guest code has been switched off.", expired: "That guest code has expired.", "used up": "That guest code has no minutes left." };

/* ---------- tickets: a signed note of one conversation's reservation ---------- */
export function signTicket(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}
export function readTicket(ticket, secret) {
  const [body, sig] = String(ticket || "").split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}
export const ipHash = (ip, secret) => createHash("sha256").update(secret + "|" + String(ip || "unknown")).digest("hex").slice(0, 16);

/* ---------- guests ---------- */
// What the page needs before showing the cast.
export async function publicConfig(store, live, now = new Date()) {
  const s = await getSettings(store), d = (await get(store, "day/" + dayKey(now))) || { seconds: 0 };
  return { needsCode: !s.open, live: live && !s.paused, paused: s.paused, maxMinutes: s.maxMinutes, restingToday: d.seconds >= s.dailyMinutes * 60 - 60 };
}

// Checks a guest code without spending anything.
export async function checkCode(store, raw) {
  const s = await getSettings(store);
  if (s.paused) return { ok: false, status: 503, error: "Live demos are paused at the moment." };
  if (s.open && !normCode(raw)) return { ok: true, minutesLeft: null };
  const c = await get(store, "code/" + normCode(raw)), st = codeState(c);
  if (st !== "ok") return { ok: false, status: 401, error: GUEST_MSG[st] };
  return { ok: true, minutesLeft: Math.floor(remainingSec(c) / 60), label: c.label || "" };
}

// Reserves time for one conversation. Returns { ok, seconds, ticket } or { ok:false, status, error }.
export async function reserve(store, { code: raw, character, ip }, secret, now = new Date()) {
  const s = await getSettings(store);
  if (s.paused) return { ok: false, status: 503, error: "Live demos are paused at the moment." };
  const code = normCode(raw);
  let c = null;
  if (code || !s.open) {
    c = await get(store, "code/" + code); const st = codeState(c, now.getTime());
    if (st !== "ok") return { ok: false, status: 401, error: GUEST_MSG[st] };
  }
  const dk = dayKey(now), day = (await get(store, "day/" + dk)) || { seconds: 0, sessions: 0, refused: 0 };
  const dayLeft = s.dailyMinutes * 60 - day.seconds;
  if (dayLeft < 60) { day.refused = (day.refused || 0) + 1; await set(store, "day/" + dk, day); return { ok: false, status: 429, error: "Live demos are resting until tomorrow. Please come back then." }; }
  const ipk = `ip/${ipHash(ip, secret)}/${hourKey(now)}`, hits = (await get(store, ipk)) || { n: 0 };
  if (hits.n >= s.perIpHour) return { ok: false, status: 429, error: "That's a lot of conversations in one hour. Please try again a little later." };

  const seconds = Math.min(s.maxMinutes * 60, dayLeft, c ? remainingSec(c) : Infinity);
  if (seconds < 60) return { ok: false, status: 401, error: GUEST_MSG["used up"] };
  hits.n++; await set(store, ipk, hits);
  day.seconds += seconds; day.sessions = (day.sessions || 0) + 1; await set(store, "day/" + dk, day);
  if (c) { c.usedSec += seconds; c.sessions = (c.sessions || 0) + 1; c.lastUsed = now.toISOString(); await set(store, "code/" + code, c); }
  const id = now.getTime().toString(36) + randomBytes(4).toString("hex");
  const rec = { id, code: c ? code : "OPEN", label: c?.label || "Open demo", character, day: dk, reserved: seconds, start: now.getTime(), charged: null, feedback: false };
  await set(store, "t/" + id, rec);
  return { ok: true, seconds, ticket: signTicket({ id, code: rec.code, day: dk, res: seconds, t: rec.start }, secret) };
}

// The conversation ended (or never started): keep what was used, return the rest.
export async function settle(store, ticket, secret, { failed = false } = {}, now = Date.now()) {
  const p = readTicket(ticket, secret); if (!p) return { ok: false, status: 400, error: "That ticket is not valid." };
  const rec = await get(store, "t/" + p.id); if (!rec || rec.charged !== null) return { ok: true, already: true };
  const used = failed ? 0 : Math.min(p.res, Math.max(0, Math.ceil((now - p.t) / 1000) + 10));   // the server's clock, plus a little for connecting
  const refund = p.res - used;
  rec.charged = used; rec.end = now; await set(store, "t/" + p.id, rec);
  if (refund > 0) {
    const dk = "day/" + p.day, day = await get(store, dk); if (day) { day.seconds = Math.max(0, day.seconds - refund); await set(store, dk, day); }
    if (p.code !== "OPEN") { const ck = "code/" + p.code, c = await get(store, ck); if (c) { c.usedSec = Math.max(0, c.usedSec - refund); if (failed) c.sessions = Math.max(0, (c.sessions || 1) - 1); await set(store, ck, c); } }
  }
  return { ok: true, used, refund };
}

// Coaching notes: one set per conversation, only for a real ticket.
export async function claimFeedback(store, ticket, secret) {
  const p = readTicket(ticket, secret); if (!p) return { ok: false, status: 401, error: "Coaching notes need a finished demo conversation." };
  const rec = await get(store, "t/" + p.id); if (!rec) return { ok: false, status: 401, error: "That conversation could not be found." };
  if (rec.feedback) return { ok: false, status: 409, error: "Coaching notes for this conversation were already written." };
  rec.feedback = true; await set(store, "t/" + p.id, rec); return { ok: true };
}

/* ---------- the Studio (admin) ---------- */
export function adminOk(given, password) {
  if (!password) return false;
  const a = createHash("sha256").update(String(given ?? "")).digest(), b = createHash("sha256").update(String(password)).digest();
  return timingSafeEqual(a, b);
}

export async function handleAdmin(store, body, now = new Date()) {
  const a = body?.action;
  if (a === "overview") {
    const s = await getSettings(store);
    const codes = [];
    for (const k of await keys(store, "code/")) { const c = await get(store, k); if (c) codes.push({ ...c, state: codeState(c, now.getTime()), remainingMin: +(remainingSec(c) / 60).toFixed(1) }); }
    codes.sort((x, y) => String(y.created).localeCompare(String(x.created)));
    const days = [];
    for (let i = 0; i < 14; i++) { const k = dayKey(new Date(now.getTime() - i * 86400000)); const d = (await get(store, "day/" + k)) || { seconds: 0, sessions: 0, refused: 0 }; days.push({ day: k, ...d }); }
    const tk = (await keys(store, "t/")).sort().reverse();
    const recent = []; for (const k of tk.slice(0, 40)) { const r = await get(store, k); if (r) recent.push(r); }
    await prune(store, tk, now);
    return { status: 200, body: { settings: s, codes, days, recent } };
  }
  if (a === "settings") {
    const cur = await getSettings(store), v = body.settings || {};
    const next = {
      open: v.open === undefined ? cur.open : !!v.open, paused: v.paused === undefined ? cur.paused : !!v.paused,
      dailyMinutes: clampInt(v.dailyMinutes ?? cur.dailyMinutes, 0, 1440, cur.dailyMinutes),
      maxMinutes: clampInt(v.maxMinutes ?? cur.maxMinutes, 1, 30, cur.maxMinutes),
      perIpHour: clampInt(v.perIpHour ?? cur.perIpHour, 1, 100, cur.perIpHour),
    };
    await set(store, "settings", next); return { status: 200, body: { settings: next } };
  }
  if (a === "create") {
    let code = normCode(body.code) || newCode();
    if (!validCode(code)) return { status: 400, body: { error: "Codes use 4–32 letters, numbers or dashes." } };
    if (await get(store, "code/" + code)) return { status: 409, body: { error: "That code already exists." } };
    const days = clampInt(body.days, 0, 3650, 30);
    const c = { code, label: String(body.label || "").slice(0, 80), note: String(body.note || "").slice(0, 300), allowanceMin: clampInt(body.minutes, 1, 6000, 20), usedSec: 0, sessions: 0,
      created: now.toISOString(), expires: days ? dayKey(new Date(now.getTime() + days * 86400000)) : null, active: true, lastUsed: null };
    await set(store, "code/" + code, c); return { status: 200, body: { code: c } };
  }
  const code = normCode(body?.code), ck = "code/" + code, c = await get(store, ck);
  if (["update", "delete"].includes(a) && !c) return { status: 404, body: { error: "That code was not found." } };
  if (a === "update") {
    const u = body.update || {};
    if (u.label !== undefined) c.label = String(u.label).slice(0, 80);
    if (u.note !== undefined) c.note = String(u.note).slice(0, 300);
    if (u.active !== undefined) c.active = !!u.active;
    if (u.addMinutes) c.allowanceMin = clampInt(c.allowanceMin + +u.addMinutes, 1, 6000, c.allowanceMin);
    if (u.minutes !== undefined) c.allowanceMin = clampInt(u.minutes, 1, 6000, c.allowanceMin);
    if (u.extendDays) { const base = c.expires && Date.parse(c.expires) > now.getTime() ? new Date(c.expires + "T12:00:00Z") : now; c.expires = dayKey(new Date(base.getTime() + clampInt(u.extendDays, 1, 3650, 30) * 86400000)); }
    if (u.expires !== undefined) c.expires = u.expires && /^\d{4}-\d{2}-\d{2}$/.test(u.expires) ? u.expires : null;
    if (u.resetUsage) { c.usedSec = 0; c.sessions = 0; }
    await set(store, ck, c); return { status: 200, body: { code: { ...c, state: codeState(c, now.getTime()), remainingMin: +(remainingSec(c) / 60).toFixed(1) } } };
  }
  if (a === "delete") { await store.delete(ck); return { status: 200, body: { ok: true } }; }
  return { status: 400, body: { error: "Unknown action." } };
}

// Housekeeping: network counters older than two days, conversation records older than 60 days.
async function prune(store, ticketKeys, now) {
  const cutoffH = hourKey(new Date(now.getTime() - 2 * 86400000));
  for (const k of await keys(store, "ip/")) if (k.split("/")[2] < cutoffH) await store.delete(k);
  const cutoffT = (now.getTime() - 60 * 86400000).toString(36);
  for (const k of ticketKeys) if (k.slice(2, 2 + cutoffT.length) < cutoffT) await store.delete(k);
}
