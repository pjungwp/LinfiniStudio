// /api/feedback: coaching notes for a finished practice conversation. One set per conversation ticket.
//   { ticket, character, transcript } -> starts the notes in the background and returns an id
//   { ticket, poll: id }              -> progress; when finished, the notes (then deleted at OpenAI)
import { CHARACTERS, FEEDBACK_SCHEMA, feedbackInstructions } from "../../server/characters.js";
import { claimFeedback, readTicket } from "../../server/access.js";
import { env, json, store, secret, readBody } from "../../server/shared.js";

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  const key = env("OPENAI_API_KEY"); if (!key) return json(503, { error: "Live demos are not switched on yet." });
  const body = await readBody(request); if (!body) return json(400, { error: "The request could not be read." });
  if (!readTicket(body.ticket, secret())) return json(401, { error: "Coaching notes need a finished demo conversation." });
  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" }, api = "https://api.openai.com/v1/responses";

  if (body.poll) {
    const id = String(body.poll);
    if (!/^resp_[A-Za-z0-9_-]{4,200}$/.test(id)) return json(400, { error: "That id is not valid." });
    let r, data;
    try { r = await fetch(`${api}/${id}`, { headers }); data = await r.json().catch(() => null); }
    catch (err) { return json(502, { error: "The coaching service could not be reached." }); }
    if (!r.ok || !data) return json(502, { error: "The coaching service did not answer.", status: r.status });
    if (data.status === "queued" || data.status === "in_progress") return json(200, { status: data.status });
    const text = (data.output || []).flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("");
    try { await fetch(`${api}/${id}`, { method: "DELETE", headers }); } catch { /* best effort */ }
    return json(200, { status: data.status, text, error: data.error?.message ?? null });
  }

  const id = String(body.character || "");
  if (!CHARACTERS[id]?.feedback) return json(400, { error: "This conversation has no coaching notes." });
  const transcript = String(body.transcript ?? "").slice(0, 60000);
  if (transcript.trim().length < 40) return json(400, { error: "The conversation was too short for coaching notes." });
  const claim = await claimFeedback(store(), body.ticket, secret()); if (!claim.ok) return json(claim.status, { error: claim.error });

  const base = { model: env("FEEDBACK_MODEL") || "gpt-5.6-terra", instructions: feedbackInstructions(id), input: `TRANSCRIPT\n\n${transcript}`, background: true, store: true, max_output_tokens: 6000 };
  const fmt = { format: { type: "json_schema", name: "linfini_coaching", strict: true, schema: FEEDBACK_SCHEMA } };
  const variants = [{ ...base, reasoning: { effort: env("FEEDBACK_EFFORT") || "low" }, text: fmt }, { ...base, text: fmt }, { ...base, text: { format: { type: "json_object" } } }];
  let r;
  try { for (const payload of variants) { r = await fetch(api, { method: "POST", headers, body: JSON.stringify(payload) }); if (r.status !== 400) break; } }
  catch (err) { return json(502, { error: "The coaching service could not be reached." }); }
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.id) return json(502, { error: "The coaching service refused the request.", detail: data?.error?.message ?? null });
  return json(200, { id: data.id, status: data.status });
};

export const config = { path: "/api/feedback" };
