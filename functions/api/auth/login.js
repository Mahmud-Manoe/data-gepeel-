import { makeSession, passwordOk, sessionCookie } from "../../_lib/auth.js";
import { HttpError, json, readJson } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  const { password } = await readJson(request);
  if (!(await passwordOk(password, env.APP_PASSWORD))) throw new HttpError(401, "Password salah.");
  const token = await makeSession(env);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(request, token) });
}
