import { json } from "../../_lib/http.js";
import { sessionCookie } from "../../_lib/auth.js";

export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(request, "") });
}
