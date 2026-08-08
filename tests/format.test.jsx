// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { eur, fmtPrice, probColor } from "../src/TraderSite.jsx";

// Questões individuais para os formatadores de preço/valor e cor de probabilidade.
describe("fmtPrice", () => {
  it("valor nulo -> travessão", () => {
    expect(fmtPrice(null)).toBe("—");
  });

  it("USD usa $", () => {
    expect(fmtPrice(100, "USD").startsWith("$")).toBe(true);
  });

  it("EUR usa €", () => {
    expect(fmtPrice(100, "EUR").startsWith("€")).toBe(true);
  });

  it("GBP usa £", () => {
    expect(fmtPrice(100, "GBP").startsWith("£")).toBe(true);
  });

  it("moeda desconhecida usa o código + espaço", () => {
    expect(fmtPrice(100, "BRL").startsWith("BRL ")).toBe(true);
  });

  it("sem moeda assume USD ($)", () => {
    expect(fmtPrice(100).startsWith("$")).toBe(true);
  });
});

describe("eur", () => {
  it("positivo sem sinal de menos", () => {
    expect(eur(50)).not.toContain("−");
    expect(eur(50)).toContain("€");
  });

  it("negativo com sinal −", () => {
    expect(eur(-50).startsWith("−")).toBe(true);
  });

  it("zero -> €0", () => {
    expect(eur(0)).toBe("€0");
  });

  it("arredonda (sem casas decimais)", () => {
    expect(eur(12.6)).toBe("€13");
  });
});

describe("probColor", () => {
  it("nulo -> cinza", () => {
    expect(probColor(null)).toBe("#8CA3B3");
  });

  it(">=55 -> verde", () => {
    expect(probColor(55)).toBe("#2FA37A");
  });

  it("<=45 -> vermelho", () => {
    expect(probColor(45)).toBe("#C8553D");
  });

  it("entre 46 e 54 -> dourado", () => {
    expect(probColor(50)).toBe("#D6A445");
  });
});
