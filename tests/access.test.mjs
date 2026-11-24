// npm test: the demo access rules, with an in-memory stand-in for Netlify Blobs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reserve, settle, checkCode, handleAdmin, claimFeedback, publicConfig, normCode, dayKey } from "../server/access.js";

function memStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
const S = "secret";
const mk = async (st, o = {}) => (await handleAdmin(st, { action: "create", minutes: 20, days: 30, ...o })).body.code;

test("a new store needs a code and has the defaults", async () => {
  const st = memStore(); const c = await publicConfig(st, true);
  assert.equal(c.needsCode, true); assert.equal(c.maxMinutes, 5); assert.equal(c.live, true);
  assert.equal((await reserve(st, { code: "", character: "interview", ip: "1" }, S)).status, 401);
});

test("a guest code reserves time and gets the unused part back", async () => {
  const st = memStore(); const c = await mk(st, { label: "Dr. Smith" });
  assert.match(c.code, /^LS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await checkCode(st, c.code.toLowerCase())).minutesLeft, 20);
  const t0 = new Date("2026-12-01T15:00:00Z");
  const r = await reserve(st, { code: c.code, character: "interview", ip: "1" }, S, t0);
  assert.equal(r.ok, true); assert.equal(r.seconds, 300);
  assert.equal((await st.get("code/" + c.code)).usedSec, 300);
  const s = await settle(st, r.ticket, S, {}, t0.getTime() + 120_000);   // two minutes later
  assert.equal(s.used, 130); assert.equal(s.refund, 170);
  assert.equal((await st.get("code/" + c.code)).usedSec, 130);
  assert.equal((await st.get("day/" + dayKey(t0))).seconds, 130);
  assert.equal((await settle(st, r.ticket, S, {}, t0.getTime() + 999_999)).already, true);   // only once
  assert.equal((await st.get("code/" + c.code)).usedSec, 130);
});

test("a failed start costs nothing", async () => {
  const st = memStore(); const c = await mk(st);
  const r = await reserve(st, { code: c.code, character: "customer", ip: "1" }, S);
  await settle(st, r.ticket, S, { failed: true });
  const after = await st.get("code/" + c.code); assert.equal(after.usedSec, 0); assert.equal(after.sessions, 0);
});

test("the last minutes of an allowance give a shorter conversation, then the code is used up", async () => {
  const st = memStore(); const c = await mk(st, { minutes: 7 });
  const t = new Date("2026-12-01T15:00:00Z");
  const a = await reserve(st, { code: c.code, character: "interview", ip: "1" }, S, t); assert.equal(a.seconds, 300);
  const b = await reserve(st, { code: c.code, character: "interview", ip: "2" }, S, t); assert.equal(b.seconds, 120);
  const d = await reserve(st, { code: c.code, character: "interview", ip: "3" }, S, t); assert.equal(d.ok, false); assert.match(d.error, /no minutes left/);
});

test("the daily ceiling holds across codes", async () => {
  const st = memStore(); await handleAdmin(st, { action: "settings", settings: { dailyMinutes: 8 } });
  const a = await mk(st), b = await mk(st), t = new Date("2026-12-01T15:00:00Z");
  assert.equal((await reserve(st, { code: a.code, character: "smalltalk", ip: "1" }, S, t)).seconds, 300);
  assert.equal((await reserve(st, { code: b.code, character: "smalltalk", ip: "2" }, S, t)).seconds, 180);
  const c = await reserve(st, { code: b.code, character: "smalltalk", ip: "3" }, S, t); assert.equal(c.status, 429); assert.match(c.error, /resting until tomorrow/);
  assert.equal((await publicConfig(st, true, t)).restingToday, true);
});

test("one network is limited per hour", async () => {
  const st = memStore(); await handleAdmin(st, { action: "settings", settings: { perIpHour: 2, dailyMinutes: 999 } });
  const c = await mk(st, { minutes: 999 }), t = new Date("2026-12-01T15:00:00Z");
  for (let i = 0; i < 2; i++) assert.equal((await reserve(st, { code: c.code, character: "interview", ip: "9.9.9.9" }, S, t)).ok, true);
  assert.equal((await reserve(st, { code: c.code, character: "interview", ip: "9.9.9.9" }, S, t)).status, 429);
  assert.equal((await reserve(st, { code: c.code, character: "interview", ip: "9.9.9.9" }, S, new Date(t.getTime() + 3600_000))).ok, true);
});

test("switched off, expired and paused", async () => {
  const st = memStore(); const c = await mk(st, { days: 1 });
  await handleAdmin(st, { action: "update", code: c.code, update: { active: false } });
  assert.match((await checkCode(st, c.code)).error, /switched off/);
  await handleAdmin(st, { action: "update", code: c.code, update: { active: true } });
  const later = new Date(Date.now() + 5 * 86400000);
  assert.match((await reserve(st, { code: c.code, character: "interview", ip: "1" }, S, later)).error, /expired/);
  await handleAdmin(st, { action: "update", code: c.code, update: { extendDays: 30 } });
  assert.equal((await reserve(st, { code: c.code, character: "interview", ip: "1" }, S, later)).ok, true);
  await handleAdmin(st, { action: "settings", settings: { paused: true } });
  assert.equal((await reserve(st, { code: c.code, character: "interview", ip: "2" }, S, later)).status, 503);
});

test("open mode lets visitors in without a code, inside the same limits", async () => {
  const st = memStore(); await handleAdmin(st, { action: "settings", settings: { open: true } });
  assert.equal((await publicConfig(st, true)).needsCode, false);
  const r = await reserve(st, { code: "", character: "storyteller", ip: "1" }, S); assert.equal(r.ok, true);
});

test("coaching notes: one set per real conversation", async () => {
  const st = memStore(); const c = await mk(st);
  const r = await reserve(st, { code: c.code, character: "interview", ip: "1" }, S);
  assert.equal((await claimFeedback(st, r.ticket, S)).ok, true);
  assert.equal((await claimFeedback(st, r.ticket, S)).status, 409);
  assert.equal((await claimFeedback(st, r.ticket.slice(0, -2) + "xx", S)).status, 401);   // a forged ticket
});

test("the Studio overview, custom codes, adding minutes and deleting", async () => {
  const st = memStore();
  assert.equal((await handleAdmin(st, { action: "create", code: "acog smith" })).body.code.code, "ACOGSMITH");   // spaces are removed
  assert.equal((await handleAdmin(st, { action: "create", code: "no!" })).status, 400);
  const c = await mk(st, { code: "ACOG-SMITH", minutes: 10 }); assert.equal(c.code, "ACOG-SMITH");
  assert.equal((await handleAdmin(st, { action: "create", code: "acog-smith" })).status, 409);
  const u = (await handleAdmin(st, { action: "update", code: "acog-smith", update: { addMinutes: 15 } })).body.code; assert.equal(u.allowanceMin, 25);
  const o = (await handleAdmin(st, { action: "overview" })).body; assert.equal(o.codes.length, 2); assert.equal(o.days.length, 14);
  await handleAdmin(st, { action: "delete", code: "ACOG-SMITH" });
  assert.equal((await handleAdmin(st, { action: "overview" })).body.codes.length, 1);
  assert.equal(normCode(" ab-cd "), "AB-CD");
});
