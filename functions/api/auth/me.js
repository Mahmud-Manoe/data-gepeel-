import { isAuthenticated } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  return json({ authenticated: await isAuthenticated(request, env) });
}
