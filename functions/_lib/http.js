export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

export async function readJson(request) {
  try { return await request.json(); }
  catch { throw new HttpError(400, "Body harus berupa JSON yang valid."); }
}

export const num = (v) => (v === null || v === undefined ? 0 : Number(v));
export const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);

export function needNumber(v, label, { min = 0 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw new HttpError(400, `${label} harus angka ${min === 0 ? "0 atau lebih" : "lebih dari " + min}.`);
  return n;
}
