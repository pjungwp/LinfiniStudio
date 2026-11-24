// npm test: sample recordings and the demo scripts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { saveClip, lockDemo, deleteDemo, listSamples, readClip, isLocked, fidelity } from "../server/samples.js";
import { CHARACTERS, recordInstructions } from "../server/characters.js";
const { DEMOS, CATEGORIES, aiLines } = globalThis.LINFINI_DEMOS;

function memStore() {
  const m = new Map(), meta = new Map();
  return {
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, structuredClone(v)); },
    async set(k, v, o = {}) { m.set(k, v); meta.set(k, o.metadata || {}); },
    async getWithMetadata(k) { return m.has(k) ? { data: m.get(k), metadata: meta.get(k) } : null; },
    async delete(k) { m.delete(k); meta.delete(k); },
    async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
const wav = Buffer.from("RIFF....WAVEfmt fake audio bytes").toString("base64");

test("nine demos, three per category, each with a private character, a voice and recordable lines", () => {
  assert.equal(Object.keys(DEMOS).length, 9);
  for (const c of CATEGORIES) assert.equal(Object.values(DEMOS).filter((d) => d.category === c.id).length, 3);
  for (const [id, d] of Object.entries(DEMOS)) {
    assert.ok(CHARACTERS[id]?.instructions.length > 200, id); assert.ok(d.voice, id);
    const lines = aiLines(id); assert.ok(lines.length >= 4, id);
    for (const l of lines) { const ins = recordInstructions(id, l.i); assert.ok(ins.includes(l.ai.replace(/"/g, "'")), id); assert.ok(l.ai.length <= 240, `${id} line ${l.i} is long`); }
    assert.equal(recordInstructions(id, 1), null);            // line 1 is always the visitor's: never recorded
  }
  assert.match(recordInstructions("lang-korean", 0), /native speaker/);
  assert.match(CHARACTERS["talk-joker"].instructions, /988/);
  assert.equal(CHARACTERS["talk-mentor"].feedback, false); assert.equal(CHARACTERS["interview-health"].feedback, true);
});

test("record, lock, then nothing more can be saved until deleted", async () => {
  const st = memStore(), id = "interview-tech", lines = aiLines(id);
  assert.equal((await lockDemo(st, id)).status, 400);
  for (const l of lines.slice(0, -1)) assert.equal((await saveClip(st, { demo: id, i: l.i, audio: wav, mime: "audio/wav", transcript: l.ai, fidelity: 0.97 })).status, 200);
  assert.match((await lockDemo(st, id)).body.error, /1 line/);
  await saveClip(st, { demo: id, i: lines.at(-1).i, audio: wav, mime: "audio/wav", fidelity: 0.4 });
  assert.equal((await lockDemo(st, id)).status, 200); assert.equal(await isLocked(st, id), true);
  assert.equal((await saveClip(st, { demo: id, i: lines[0].i, audio: wav, mime: "audio/wav" })).status, 409);
  const ls = (await listSamples(st))[id]; assert.equal(ls.locked, true); assert.deepEqual(ls.low, [lines.at(-1).i]); assert.ok(ls.v > 0);
  const clip = await readClip(st, id, lines[0].i); assert.equal(clip.mime, "audio/wav"); assert.ok(clip.data.byteLength > 10);
  await deleteDemo(st, id); assert.equal(await isLocked(st, id), false); assert.equal(await readClip(st, id, lines[0].i), null);
});

test("bad input is refused", async () => {
  const st = memStore();
  assert.equal((await saveClip(st, { demo: "interview-tech", i: 1, audio: wav, mime: "audio/wav" })).status, 400);       // a visitor line
  assert.equal((await saveClip(st, { demo: "nope", i: 0, audio: wav, mime: "audio/wav" })).status, 400);
  assert.equal((await saveClip(st, { demo: "interview-tech", i: 0, audio: wav, mime: "text/html" })).status, 400);
  assert.equal((await saveClip(st, { demo: "interview-tech", i: 0, audio: "", mime: "audio/wav" })).status, 400);
  assert.equal(await readClip(st, "interview-tech", "../x"), null);
});

test("fidelity works across scripts", () => {
  assert.ok(fidelity("Hello is 你好.", "hello is 你好") > 0.9);
  assert.ok(fidelity("감사합니다", "감사합니다!") > 0.9);
  assert.ok(fidelity("Thank you is ありがとう", "Something else entirely") < 0.3);
});
