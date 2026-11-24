// /api/admin: the Studio page (public/studio.html). Every request carries the Studio password (ADMIN_PASSWORD).
import { adminOk, handleAdmin } from "../../server/access.js";
import { env, json, store, readBody } from "../../server/shared.js";

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  const pw = env("ADMIN_PASSWORD");
  if (!pw) return json(503, { error: "The Studio is not set up yet. Add ADMIN_PASSWORD in Netlify's environment variables, then redeploy." });
  const body = await readBody(request); if (!body) return json(400, { error: "The request could not be read." });
  if (!adminOk(body.password, pw)) { await new Promise((ok) => setTimeout(ok, 900)); return json(401, { error: "That password is not correct." }); }
  if (body.action === "login") return json(200, { ok: true });
  let st; try { st = store(); } catch (err) { return json(503, { error: "Storage is not available on this site.", detail: String(err?.message || err) }); }
  try { const out = await handleAdmin(st, body); return json(out.status, out.body); }
  catch (err) { return json(500, { error: "The Studio ran into a problem.", detail: String(err?.message || err) }); }
};

export const config = { path: "/api/admin" };
