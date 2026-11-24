// Sample recordings: one short audio clip per character line, recorded once from the Studio page.
// Keys: meta/<demo> (JSON) · audio/<demo>/<line index> (the clip, with { mime } metadata)
// A demo is "locked" once every line is saved: from then on nothing can be recorded or replaced for it,
// unless the samples are deleted on purpose from the Studio.
import "../public/demos.js";
const { DEMOS, aiLines } = globalThis.LINFINI_DEMOS;

const MIMES = ["audio/wav", "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"];
const MAX_BYTES = 3_000_000;   // about a minute of trimmed 24 kHz mono WAV
const get = async (store, k) => { try { return (await store.get(k, { type: "json" })) ?? null; } catch { return null; } };
const blank = (demo) => ({ demo, lines: {}, locked: false, recordedAt: null, v: 0 });

export async function isLocked(store, demo) { return !!(await get(store, "meta/" + demo))?.locked; }

// What the page and the Studio need: which demos have samples, and how far recording has got.
export async function listSamples(store) {
  const out = {};
  for (const id of Object.keys(DEMOS)) {
    const m = (await get(store, "meta/" + id)) || blank(id), need = aiLines(id).map((l) => l.i);
    out[id] = { locked: m.locked, recordedAt: m.recordedAt, v: m.v, have: need.filter((i) => m.lines[i]), need,
      lead: Object.fromEntries(Object.entries(m.lines).map(([i, l]) => [i, l.lead || 0])),
      low: Object.entries(m.lines).filter(([, l]) => l.fidelity !== null && l.fidelity < 0.6).map(([i]) => +i) };
  }
  return out;
}

export async function saveClip(store, { demo, i, audio, mime, transcript, fidelity, lead }) {
  const line = aiLines(demo).find((l) => l.i === +i);
  if (!line) return { status: 400, body: { error: "That line does not exist." } };
  const m = (await get(store, "meta/" + demo)) || blank(demo);
  if (m.locked) return { status: 409, body: { error: "This demo's samples are already recorded and locked." } };
  const type = String(mime || "").split(";")[0].trim().toLowerCase();
  if (!MIMES.includes(type)) return { status: 400, body: { error: "That audio format is not supported." } };
  let buf; try { buf = Buffer.from(String(audio || ""), "base64"); } catch { buf = null; }
  if (!buf?.length || buf.length > MAX_BYTES) return { status: 400, body: { error: "The recording is empty or too large." } };
  await store.set(`audio/${demo}/${+i}`, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), { metadata: { mime: type } });
  m.lines[+i] = { mime: type, bytes: buf.length, transcript: String(transcript || "").slice(0, 600), fidelity: Number.isFinite(+fidelity) ? +(+fidelity).toFixed(2) : null,
    lead: Math.max(0, Math.min(8000, Math.round(+lead || 0))), at: new Date().toISOString() };   // lead: silence before the voice starts, skipped on playback
  await store.setJSON("meta/" + demo, m);
  return { status: 200, body: { ok: true, line: +i } };
}

export async function lockDemo(store, demo) {
  const m = await get(store, "meta/" + demo); if (!m) return { status: 400, body: { error: "Nothing has been recorded for this demo yet." } };
  const missing = aiLines(demo).map((l) => l.i).filter((i) => !m.lines[i]);
  if (missing.length) return { status: 400, body: { error: `${missing.length} line(s) still need recording.` } };
  m.locked = true; m.recordedAt = new Date().toISOString(); m.v = Date.now();
  await store.setJSON("meta/" + demo, m); return { status: 200, body: { ok: true, recordedAt: m.recordedAt } };
}

export async function deleteDemo(store, demo) {
  if (!DEMOS[demo]) return { status: 400, body: { error: "Unknown demo." } };
  for (const l of aiLines(demo)) await store.delete(`audio/${demo}/${l.i}`);
  await store.delete("meta/" + demo); return { status: 200, body: { ok: true } };
}

export async function readClip(store, demo, i) {
  if (!DEMOS[demo] || !/^\d{1,2}$/.test(String(i))) return null;
  const r = await store.getWithMetadata(`audio/${demo}/${+i}`, { type: "arrayBuffer" });
  return r?.data ? { data: r.data, mime: r.metadata?.mime || "audio/webm" } : null;
}

// How closely the spoken transcript matches the script (0–1), by shared letter pairs; works for any script.
export function fidelity(script, said) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const pairs = (s) => { const out = new Map(); for (let k = 0; k < s.length - 1; k++) { const p = s.slice(k, k + 2); out.set(p, (out.get(p) || 0) + 1); } return out; };
  const a = pairs(norm(script)), b = pairs(norm(said)); let hit = 0, n = 0;
  for (const [p, c] of a) { n += c; hit += Math.min(c, b.get(p) || 0); }
  for (const c of b.values()) n += c;
  return n ? (2 * hit) / n : 0;
}
