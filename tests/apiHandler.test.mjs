import { describe, it, expect, vi, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "ee-api-"));
process.env.ADMIN_PASSWORD = "pw";

// Yahoo e parser mockados (sem rede).
vi.mock("../yahooReal.mjs", () => ({
  realQuote: vi.fn(async () => ({ ticker: "AAA", name: "AAA Inc" })),
  realCalendar: vi.fn(async () => [{ ticker: "AAA", date: "2026-08-20", past: false }]),
  realResearch: vi.fn(async () => ({ text: "research" })),
  realPrices: vi.fn(async () => ({ AAA: 100 })),
  realTape: vi.fn(async () => [{ symbol: "AAA", price: 100, change: 1.2 }]),
  extractDoc: vi.fn(async () => ({ records: [] })),
}));
vi.mock("../ledger.mjs", () => ({
  parseDegiro: vi.fn(async () => ({ trades: [{ ticker: "AAA" }], equity: [], stats: { n: 1, winRate: 100 } })),
}));

let handleApi;
beforeAll(async () => { ({ handleApi } = await import("../apiHandler.mjs")); });

function mockReq(method, url, { body, token } = {}) {
  const L = {};
  const req = { method, url, headers: token ? { authorization: "Bearer " + token } : {}, on(e, cb) { L[e] = cb; return req; } };
  queueMicrotask(() => { if (body != null && L.data) L.data(JSON.stringify(body)); L.end && L.end(); });
  return req;
}
function mockRes() {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s; this._done && this._done(); } };
  res.done = new Promise((r) => (res._done = r));
  return res;
}
async function call(method, url, opts) {
  const res = mockRes();
  const handled = await handleApi(mockReq(method, url, opts), res);
  await res.done;
  return { handled, status: res.statusCode, json: JSON.parse(res.body || "null") };
}
async function login() { return (await call("POST", "/api/auth/login", { body: { password: "pw" } })).json.token; }

describe("apiHandler", () => {
  it("rota desconhecida fora de /api → não trata", async () => {
    const res = mockRes();
    expect(await handleApi({ method: "GET", url: "/index.html", headers: {}, on: () => {} }, res)).toBe(false);
  });

  it("GET /api/picks devolve publicados", async () => {
    const token = await login();
    await call("POST", "/api/picks", { token, body: { picks: { AAA: { ticker: "AAA", show: true }, ZZZ: { ticker: "ZZZ", show: false } } } });
    const r = await call("GET", "/api/picks");
    expect(r.status).toBe(200);
    expect(r.json.AAA).toBeDefined();
    expect(r.json.ZZZ).toBeUndefined(); // show:false não publica
  });

  it("POST /api/picks sem token → 401", async () => {
    const r = await call("POST", "/api/picks", { body: { picks: {} } });
    expect(r.status).toBe(401);
  });

  it("login errado → 401", async () => {
    const r = await call("POST", "/api/auth/login", { body: { password: "errada" } });
    expect(r.status).toBe(401);
    expect(r.json.ok).toBe(false);
  });

  it("GET /api/yahoo/tape usa realTape (mock)", async () => {
    const r = await call("GET", "/api/yahoo/tape?symbols=AAA");
    expect(r.status).toBe(200);
    expect(r.json[0].symbol).toBe("AAA");
  });

  it("POST /api/ledger com token → parseDegiro + guarda", async () => {
    const token = await login();
    const r = await call("POST", "/api/ledger", { token, body: { file: "data:app/xls;base64,AAAA", base: 2500 } });
    expect(r.status).toBe(200);
    expect(r.json.stats.n).toBe(1);
    const g = await call("GET", "/api/ledger");
    expect(g.json.stats.winRate).toBe(100);
  });

  it("POST /api/ledger sem token → 401", async () => {
    const r = await call("POST", "/api/ledger", { body: { file: "x" } });
    expect(r.status).toBe(401);
  });
});
