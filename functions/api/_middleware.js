import { HttpError, json } from "../_lib/http.js";

export async function onRequest(ctx) {
  try {
    // Auth disabled - allow all requests
    return await ctx.next();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Terjadi kesalahan di server." }, 500);
  }
}