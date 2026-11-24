// Shared by the three functions: settings, storage and replies.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

export const env = (k) => globalThis.Netlify?.env?.get?.(k) ?? globalThis.process?.env?.[k];
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const store = () => getStore({ name: "linfini-access", consistency: "strong" });
// Signs conversation tickets. Set TICKET_SECRET to rotate; otherwise derived from the API key.
export const secret = () => createHash("sha256").update("linfini|" + (env("TICKET_SECRET") || env("OPENAI_API_KEY") || "unset")).digest("hex");
export const clientIp = (request, context) => context?.ip || request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
export async function readBody(request) { try { return await request.json(); } catch { return null; } }
