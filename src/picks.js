// Curadoria via backend (ficheiro no servidor) + token de admin.
export const TOKEN_KEY = "ee_admin_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// público: só picks publicados
export async function fetchPublished() {
  try { const r = await fetch("/api/picks", { cache: "no-store" }); return r.ok ? await r.json() : {}; } catch { return {}; }
}
// admin: todos os picks (auth)
export async function fetchAll(token) {
  const r = await fetch("/api/picks/all", { cache: "no-store", headers: { Authorization: "Bearer " + token } });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
// admin: gravar mapa completo (auth)
export async function savePicks(token, picks) {
  const r = await fetch("/api/picks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ picks }) });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
// ---- posições abertas ----
export async function fetchPositions() {
  try { const r = await fetch("/api/positions", { cache: "no-store" }); return r.ok ? await r.json() : []; } catch { return []; }
}
export async function savePositions(token, positions) {
  const r = await fetch("/api/positions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ positions }) });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
export async function fetchPrices(symbols) {
  if (!symbols || !symbols.length) return {};
  try { const r = await fetch("/api/yahoo/price?symbols=" + encodeURIComponent(symbols.join(",")), { cache: "no-store" }); return r.ok ? await r.json() : {}; } catch { return {}; }
}

// dias abaixo do preço de compra (só conta enquanto submerso); helpers partilhados
export const daysBetween = (fromISO) => {
  const a = new Date(fromISO + "T00:00:00"); const b = new Date();
  if (isNaN(a)) return 0;
  return Math.max(0, Math.floor((b - a) / 864e5));
};

// ---- emails ----
export async function subscribeEmail(email) {
  const r = await fetch("/api/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  return r.json();
}
export async function fetchEmails(token) {
  const r = await fetch("/api/emails", { cache: "no-store", headers: { Authorization: "Bearer " + token } });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

// ---- histórico (via upload) ----
export async function fetchHistory() {
  try { const r = await fetch("/api/history", { cache: "no-store" }); return r.ok ? await r.json() : []; } catch { return []; }
}
export async function saveHistory(token, history) {
  const r = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ history }) });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
export async function extractDoc(token, image, mime) {
  const r = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ image, mime }) });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

// ---- track record ----
export async function fetchTrades() {
  try { const r = await fetch("/api/trades", { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function saveTrades(token, trades) {
  const r = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ trades }) });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

export async function login(password) {
  const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  return r.json();
}
