// /api/session: the live demo.
//   { list: true }                    -> what the page needs (is a code needed, are demos on)
//   { check: true, code }             -> checks a guest code, spends nothing
//   { character, code, sdp }          -> reserves time, then starts a live voice conversation; returns its ticket
//   { end: ticket, failed? }          -> the conversation ended: unused time goes back
//   { record: { demo, i }, password, sdp } -> Studio only: records one sample line (refused once that demo is locked)
import { getStore } from "@netlify/blobs";
import { CHARACTERS, recordInstructions } from "../../server/characters.js";
import { publicConfig, checkCode, reserve, settle, adminOk } from "../../server/access.js";
import { isLocked } from "../../server/samples.js";
import { env, json, store, secret, clientIp, readBody } from "../../server/shared.js";

export default async (request, context) => {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  const body = await readBody(request); if (!body) return json(400, { error: "The request could not be read." });
  const key = env("OPENAI_API_KEY");
  let st; try { st = store(); } catch (err) { return json(503, { error: "Storage is not available on this site.", detail: String(err?.message || err) }); }

  if (body.list) return json(200, { characters: Object.keys(CHARACTERS), ...(await publicConfig(st, !!key)) });
  if (body.end) { const r = await settle(st, body.end, secret(), { failed: !!body.failed }); return json(r.ok ? 200 : r.status, r); }
  if (!key) return json(503, { error: "Live demos are not switched on yet." });
  if (body.check) { const r = await checkCode(st, body.code); return json(r.ok ? 200 : r.status, r); }

  const sdp = body.sdp;
  if (typeof sdp !== "string" || !sdp.trim() || sdp.length > 60000) return json(400, { error: "The connection offer is missing." });

  // Studio: record one sample line. The line comes from the script on the server, never from the browser.
  if (body.record) {
    if (!adminOk(body.password, env("ADMIN_PASSWORD"))) { await new Promise((ok) => setTimeout(ok, 900)); return json(401, { error: "That password is not correct." }); }
    const demo = String(body.record.demo || ""), instructions = recordInstructions(demo, +body.record.i);
    if (!instructions) return json(400, { error: "That line does not exist." });
    if (await isLocked(getStore({ name: "linfini-samples", consistency: "strong" }), demo)) return json(409, { error: "This demo's samples are already recorded and locked." });
    return openLive(key, instructions, CHARACTERS[demo].voice, sdp, { demo, i: +body.record.i });
  }

  const id = String(body.character || ""), ch = CHARACTERS[id];
  if (!ch) return json(400, { error: "Choose a character first." });
  const r = await reserve(st, { code: body.code, character: id, ip: clientIp(request, context) }, secret());
  if (!r.ok) return json(r.status, { error: r.error });
  const res = await openLive(key, ch.instructions, ch.voice, sdp, { character: id, seconds: r.seconds, ticket: r.ticket });
  if (res.status !== 201) await settle(st, r.ticket, secret(), { failed: true });   // the conversation never started: nothing is spent
  return res;
};

async function openLive(key, instructions, voice, sdp, extra) {
  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        session: { model: env("LIVE_MODEL") || "gpt-live-1", instructions, audio: { output: { voice } }, delegation: { type: "client" } },
        transport: { type: "webrtc", sdp },
      }),
    });
  } catch (err) { return json(502, { error: "The voice service could not be reached.", detail: String(err?.message || err) }); }
  const text = await upstream.text();
  if (!upstream.ok) {
    let detail = text.slice(0, 800); try { detail = JSON.parse(text)?.error?.message || detail; } catch { /* raw */ }
    return json(502, { error: "The voice service refused the session.", status: upstream.status, detail });
  }
  let data; try { data = JSON.parse(text); } catch { return json(502, { error: "The voice service sent an unexpected reply." }); }
  return json(201, { session: { id: data?.session?.id ?? null }, transport: data?.transport, ...extra });
}

export const config = { path: "/api/session" };
