// Handler único da API — usado pelo Vite (dev) e pelo server.mjs (produção).
import { realQuote, realCalendar, realResearch, realPrices, extractDoc } from "./yahooReal.mjs";
import { readPicks, writePicks, publishedPicks, readPositions, writePositions, readEmails, addEmail, readHistory, writeHistory, readTrades, writeTrades, login, validToken } from "./store.mjs";

const API_PREFIXES = ["/api/picks", "/api/auth", "/api/positions", "/api/emails", "/api/history", "/api/extract", "/api/trades", "/api/yahoo/"];
export const isApi = (url) => API_PREFIXES.some((p) => url.startsWith(p));

const bodyJSON = (req) => new Promise((resolve) => {
  let s = "", done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
  req.on("data", (c) => (s += c));
  req.on("end", () => { try { fin(JSON.parse(s || "{}")); } catch { fin({}); } });
  req.on("error", () => fin({}));
  req.on("close", () => fin({}));
});
const bearer = (req) => (req.headers["authorization"] || "").replace(/^Bearer /, "");

// Devolve true se tratou o pedido; false se não é rota de API.
export async function handleApi(req, res) {
  if (!isApi(req.url)) return false;
  const u = new URL(req.url, "http://localhost");
  const send = (obj, code = 200) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
  const auth = () => validToken(bearer(req));
  try {
    // ---- auth ----
    if (u.pathname === "/api/auth/login" && req.method === "POST") {
      const { password } = await bodyJSON(req);
      const r = login(password);
      return send(r, r.ok ? 200 : 401), true;
    }
    // ---- picks ----
    if (u.pathname === "/api/picks" && req.method === "GET") return send(publishedPicks()), true;
    if (u.pathname === "/api/picks/all" && req.method === "GET") {
      if (!auth()) return send({ error: "não autenticado" }, 401), true;
      return send(readPicks()), true;
    }
    if (u.pathname === "/api/picks" && req.method === "POST") {
      if (!auth()) return send({ error: "não autenticado" }, 401), true;
      const { picks } = await bodyJSON(req);
      if (!picks || typeof picks !== "object") return send({ error: "picks inválido" }, 400), true;
      writePicks(picks); return send({ ok: true }), true;
    }
    // ---- positions ----
    if (u.pathname === "/api/positions" && req.method === "GET") return send(readPositions()), true;
    if (u.pathname === "/api/positions" && req.method === "POST") {
      if (!auth()) return send({ error: "não autenticado" }, 401), true;
      const { positions } = await bodyJSON(req);
      if (!Array.isArray(positions)) return send({ error: "positions inválido" }, 400), true;
      writePositions(positions); return send({ ok: true }), true;
    }
    // ---- emails ----
    if (u.pathname === "/api/emails" && req.method === "POST") {
      const { email } = await bodyJSON(req);
      return send(addEmail(email)), true;
    }
    if (u.pathname === "/api/emails" && req.method === "GET") {
      if (!auth()) return send({ error: "não autenticado" }, 401), true;
      return send(readEmails()), true;
    }
    // ---- history ----
    if (u.pathname === "/api/history" && req.method === "GET") return send(readHistory()), true;
    if (u.pathname === "/api/history" && req.method === "POST") {
      if (!auth()) return send({ error: "não autenticado" }, 401), true;
      const { history } = await bodyJSON(req);
      if (!Array.isArray(history)) return send({ error: "history inválido" }, 400), true;
      writeHistory(history); return send({ ok: true }), true;
    }
    // ---- trades ----
    if (u.pathname === "/api/trades" && req.method === "GET") return send(readTrades()), true;
    if (u.pathname === "/api/trades" && req.method === "POST") {
      if (!auth()) return send({ error: "não autenticado" }, 401), true;
      const { trades } = await bodyJSON(req);
      if (!Array.isArray(trades)) return send({ error: "trades inválido" }, 400), true;
      writeTrades(trades); return send({ ok: true }), true;
    }
    // ---- extract (IA) ----
    if (u.pathname === "/api/extract" && req.method === "POST") {
      if (!auth()) return send({ error: "não autenticado" }, 401), true;
      const { image, mime } = await bodyJSON(req);
      return send(await extractDoc(image, mime)), true;
    }
    // ---- yahoo ----
    if (u.pathname === "/api/yahoo/price") return send(await realPrices(u.searchParams.get("symbols"))), true;
    if (u.pathname === "/api/yahoo/quote") return send(await realQuote(u.searchParams.get("symbol"), { llm: u.searchParams.get("llm") === "1" })), true;
    if (u.pathname === "/api/yahoo/calendar") return send(await realCalendar(u.searchParams.get("from"), u.searchParams.get("to"))), true;
    if (u.pathname === "/api/yahoo/research") return send(await realResearch(u.searchParams.get("symbol"), u.searchParams.get("type"))), true;
    if (u.pathname === "/api/yahoo/logo") { res.statusCode = 404; res.end(""); return true; }
    if (u.pathname === "/api/yahoo/post") return send({ short: "", long: "" }), true;
    if (u.pathname === "/api/yahoo/image") return send({ image: "" }), true;
    if (u.pathname === "/api/yahoo/publish") return send({ fb: { ok: false, error: "sem tokens Meta" } }), true;

    return send({ error: "rota desconhecida" }, 404), true;
  } catch (e) {
    return send({ error: String(e.message || e) }, 500), true;
  }
}
