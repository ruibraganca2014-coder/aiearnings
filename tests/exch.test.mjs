import { describe, it, expect } from "vitest";
import { EXCH, exchOf } from "../src/shared.js";

// Questões individuais para o mapeamento de bolsas (etiquetas homogéneas por sufixo do ticker).
describe("exchOf / EXCH", () => {
  it("ticker sem sufixo -> EUA", () => {
    expect(exchOf("AAPL")).toBe("EUA");
  });

  it("sufixo .AX -> Austrália", () => {
    expect(exchOf("CBA.AX")).toBe("Austrália");
  });

  it("sufixo .TO -> Toronto", () => {
    expect(exchOf("BN.TO")).toBe("Toronto");
  });

  it("sufixo .DE -> Xetra", () => {
    expect(exchOf("RWE.DE")).toBe("Xetra");
  });

  it("sufixo .HE -> Helsínquia", () => {
    expect(exchOf("SAMPO.HE")).toBe("Helsínquia");
  });

  it("sufixo desconhecido -> EUA (fallback)", () => {
    expect(exchOf("ABC.ZZ")).toBe("EUA");
  });

  it("valor nulo/indefinido -> EUA", () => {
    expect(exchOf(null)).toBe("EUA");
    expect(exchOf(undefined)).toBe("EUA");
  });

  it("todas as etiquetas de bolsa são strings não vazias", () => {
    for (const [k, v] of Object.entries(EXCH)) {
      expect(typeof v, k).toBe("string");
      expect(v.length, k).toBeGreaterThan(0);
    }
  });
});
