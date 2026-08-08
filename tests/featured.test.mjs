import { describe, it, expect } from "vitest";
import { featuredList, FEATURED_MAX, canFeature } from "../src/shared.js";

// Questões individuais para a selecção das "Escolhas do trader" (até 3, ★ + publicadas).
const mk = (over) => ({ ticker: "X", featured: true, show: true, ...over });

describe("featuredList", () => {
  it("devolve vazio quando não há picks", () => {
    expect(featuredList(null)).toEqual([]);
    expect(featuredList({})).toEqual([]);
  });

  it("inclui só picks featured", () => {
    const r = featuredList({ A: mk({ ticker: "A" }), B: mk({ ticker: "B", featured: false }) });
    expect(r.map((p) => p.ticker)).toEqual(["A"]);
  });

  it("exclui picks não publicadas (show=false)", () => {
    const r = featuredList({ A: mk({ ticker: "A" }), B: mk({ ticker: "B", show: false }) });
    expect(r.map((p) => p.ticker)).toEqual(["A"]);
  });

  it("ordena por data de entrada (entryISO)", () => {
    const r = featuredList({
      A: mk({ ticker: "A", entryISO: "2026-08-13" }),
      B: mk({ ticker: "B", entryISO: "2026-08-10" }),
      C: mk({ ticker: "C", entryISO: "2026-08-11" }),
    });
    expect(r.map((p) => p.ticker)).toEqual(["B", "C", "A"]);
  });

  it("limita a FEATURED_MAX (3) mesmo com mais featured", () => {
    const picks = {};
    for (let i = 0; i < 6; i++) picks["T" + i] = mk({ ticker: "T" + i, entryISO: "2026-08-0" + i });
    const r = featuredList(picks);
    expect(r).toHaveLength(FEATURED_MAX);
    expect(r.map((p) => p.ticker)).toEqual(["T0", "T1", "T2"]);
  });

  it("respeita um max personalizado", () => {
    const picks = { A: mk({ ticker: "A" }), B: mk({ ticker: "B" }) };
    expect(featuredList(picks, 1)).toHaveLength(1);
  });

  it("FEATURED_MAX é 3", () => {
    expect(FEATURED_MAX).toBe(3);
  });
});

describe("canFeature (botão ★ até 3)", () => {
  it("permite ligar quando há espaço (count < max)", () => {
    expect(canFeature(false, 0)).toBe(true);
    expect(canFeature(false, 2)).toBe(true);
  });

  it("bloqueia ligar quando já está no máximo", () => {
    expect(canFeature(false, 3)).toBe(false);
  });

  it("permite sempre desligar, mesmo no máximo", () => {
    expect(canFeature(true, 3)).toBe(true);
  });

  it("respeita um max personalizado", () => {
    expect(canFeature(false, 1, 1)).toBe(false);
    expect(canFeature(false, 0, 1)).toBe(true);
  });
});
