// Login sederhana satu password (APP_PASSWORD) dengan cookie sesi bertanda tangan HMAC.
// Untuk banyak pengguna / SSO, pakai Cloudflare Access di depan aplikasi ini.
const enc = new TextEncoder();
const COOKIE = "gpl_session";
const MAX_AGE = 60 * 60 * 12; // 12 jam

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

async function sha(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))); }

export async function passwordOk(input, expected) {
  const [a, b] = await Promise.all([sha(String(input ?? "")), sha(String(expected ?? ""))]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function makeSession(env) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = String(exp);
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

export async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [payload, sig] = decodeURIComponent(m[1]).split(".");
  if (!payload || !sig) return false;
  if (!(await passwordOk(sig, await hmac(env.SESSION_SECRET, payload)))) return false;
  return Number(payload) > Math.floor(Date.now() / 1000);
}

export function sessionCookie(request, token) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? MAX_AGE : 0}${secure}`;
}
