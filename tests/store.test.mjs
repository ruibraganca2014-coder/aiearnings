import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// DATA_DIR temporário + password fixa ANTES de importar o store (lê env no load).
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "ee-store-"));
process.env.ADMIN_PASSWORD = "segredo123";

let store;
beforeAll(async () => { store = await import("../store.mjs"); });

describe("store: picks", () => {
  it("write/read round-trip", () => {
    store.writePicks({ AAA: { ticker: "AAA", show: true } });
    expect(store.readPicks().AAA.ticker).toBe("AAA");
  });

  it("publishedPicks devolve só show=true", () => {
    store.writePicks({
      AAA: { ticker: "AAA", show: true, probUp: 60 },
      BBB: { ticker: "BBB", show: false },
      CCC: { ticker: "CCC", show: true },
    });
    const pub = store.publishedPicks();
    expect(Object.keys(pub).sort()).toEqual(["AAA", "CCC"]);
    expect(pub.BBB).toBeUndefined();
  });
});

describe("store: ledger + settings", () => {
  it("ledger write/read", () => {
    store.writeLedger({ trades: [{ ticker: "AAA" }], stats: { n: 1 } });
    expect(store.readLedger().stats.n).toBe(1);
  });
  it("settings write/read", () => {
    store.writeSettings({ saldo: 2777, capitalBase: 2500 });
    expect(store.readSettings().saldo).toBe(2777);
  });
});

describe("store: auth", () => {
  it("login errado → sem token", () => {
    expect(store.login("errada").ok).toBe(false);
  });
  it("login certo → token válido", () => {
    const r = store.login("segredo123");
    expect(r.ok).toBe(true);
    expect(store.validToken(r.token)).toBe(true);
    expect(store.validToken("lixo")).toBe(false);
  });
});

describe("store: emails", () => {
  it("valida formato", () => {
    expect(store.addEmail("nao-email").ok).toBe(false);
    expect(store.addEmail("a@b.com").ok).toBe(true);
    expect(store.readEmails().some((x) => x.email === "a@b.com")).toBe(true);
  });
});
