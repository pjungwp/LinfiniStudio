// Starts a live voice conversation with one L'Infini Studio character.
// The browser sends its WebRTC offer and which character; this function adds the character's
// instructions (kept on the server) and the API key, and returns the answer.
import { CHARACTERS } from "../../server/characters.js";

const env = (k) => globalThis.Netlify?.env?.get?.(k) ?? globalThis.Deno?.env?.get?.(k) ?? globalThis.process?.env?.[k];
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: "The request could not be read." }); }

  const key = env("OPENAI_API_KEY"), code = env("DEMO_CODE");
  // The cast list and whether a demo code is needed: always available, no key used.
  if (body?.list) return json(200, { characters: Object.keys(CHARACTERS), needsCode: !!code, live: !!key, maxMinutes: +(env("DEMO_MINUTES") || 5) });
  if (!key) return json(503, { error: "Live demos are not switched on yet." });
  if (code && String(body?.code ?? "").trim().toLowerCase() !== String(code).trim().toLowerCase()) return json(401, { error: "That demo code is not correct." });
  if (body?.check) return json(200, { ok: true });

  const id = String(body?.character || "");
  const ch = CHARACTERS[id];
  if (!ch) return json(400, { error: "Choose a character first." });
  const sdp = body?.sdp;
  if (typeof sdp !== "string" || !sdp.trim() || sdp.length > 60000) return json(400, { error: "The connection offer is missing." });

  const model = env("LIVE_MODEL") || "gpt-live-1";
  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        session: { model, instructions: ch.instructions, audio: { output: { voice: ch.voice } }, delegation: { type: "client" } },
        transport: { type: "webrtc", sdp },
      }),
    });
  } catch (err) {
    return json(502, { error: "The voice service could not be reached.", detail: String(err?.message || err) });
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    let detail = text.slice(0, 800);
    try { detail = JSON.parse(text)?.error?.message || detail; } catch { /* keep raw text */ }
    return json(502, { error: "The voice service refused the session.", status: upstream.status, detail });
  }
  let data;
  try { data = JSON.parse(text); } catch { return json(502, { error: "The voice service sent an unexpected reply." }); }
  return json(201, { session: { id: data?.session?.id ?? null }, transport: data?.transport, character: id });
};

export const config = { path: "/api/session" };
