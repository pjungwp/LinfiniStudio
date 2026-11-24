// /api/samples: the recorded sample lines.
//   GET  ?demo=<id>&i=<line>&v=<version>     -> the audio clip (public; cached)
//   POST { action: "list" }                  -> which demos have samples (public)
//   POST { password, action: "save" | "lock" | "delete", demo, ... }  -> the Studio's recorder
import { getStore } from "@netlify/blobs";
import { listSamples, saveClip, lockDemo, deleteDemo, readClip } from "../../server/samples.js";
import { adminOk } from "../../server/access.js";
import { env, json, readBody } from "../../server/shared.js";

const store = () => getStore({ name: "linfini-samples", consistency: "strong" });

export default async (request) => {
  let st; try { st = store(); } catch (err) { return json(503, { error: "Storage is not available on this site." }); }
  if (request.method === "GET") {
    const q = new URL(request.url).searchParams, clip = await readClip(st, q.get("demo"), q.get("i"));
    if (!clip) return new Response("Not found", { status: 404 });
    return new Response(clip.data, { status: 200, headers: { "content-type": clip.mime, "cache-control": q.get("v") ? "public, max-age=31536000, immutable" : "no-store", "accept-ranges": "none" } });
  }
  if (request.method !== "POST") return json(405, { error: "Use GET or POST." });
  const body = await readBody(request); if (!body) return json(400, { error: "The request could not be read." });
  if (body.action === "list") return json(200, { samples: await listSamples(st) });
  if (!adminOk(body.password, env("ADMIN_PASSWORD"))) { await new Promise((ok) => setTimeout(ok, 900)); return json(401, { error: "That password is not correct." }); }
  const out = body.action === "save" ? await saveClip(st, body) : body.action === "lock" ? await lockDemo(st, body.demo) : body.action === "delete" ? await deleteDemo(st, body.demo) : { status: 400, body: { error: "Unknown action." } };
  return json(out.status, out.body);
};

export const config = { path: "/api/samples" };
