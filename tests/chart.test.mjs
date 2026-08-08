import { describe, it, expect } from "vitest";
import { CHART_RANGES, rangePoints, axisTicks } from "../src/shared.js";

// Questões individuais para os períodos do gráfico e as marcas dos eixos.
describe("CHART_RANGES / rangePoints", () => {
  it("inclui os períodos pedidos", () => {
    const keys = CHART_RANGES.map((r) => r[0]);
    for (const k of ["1d", "3d", "2s", "3s", "2m", "3m", "6m"]) expect(keys).toContain(k);
  });

  it("1D = 2 pontos (mínimo para desenhar linha)", () => {
    expect(rangePoints("1d")).toBe(2);
  });

  it("3 dias = 3 pontos", () => {
    expect(rangePoints("3d")).toBe(3);
  });

  it("2 semanas = 10, 3 semanas = 15", () => {
    expect(rangePoints("2s")).toBe(10);
    expect(rangePoints("3s")).toBe(15);
  });

  it("2/3/6 meses = 44/66/132", () => {
    expect(rangePoints("2m")).toBe(44);
    expect(rangePoints("3m")).toBe(66);
    expect(rangePoints("6m")).toBe(132);
  });

  it("chave desconhecida -> 260 (fallback)", () => {
    expect(rangePoints("xx")).toBe(260);
  });

  it("rótulos são todos strings não vazias", () => {
    for (const [, label] of CHART_RANGES) { expect(typeof label).toBe("string"); expect(label.length).toBeGreaterThan(0); }
  });
});

describe("axisTicks (valores dos eixos)", () => {
  it("devolve n marcas incluindo min e max", () => {
    const t = axisTicks(10, 20, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBe(10);
    expect(t[4]).toBe(20);
  });

  it("marcas igualmente espaçadas", () => {
    const t = axisTicks(0, 100, 5);
    expect(t).toEqual([0, 25, 50, 75, 100]);
  });

  it("n=1 devolve só o min", () => {
    expect(axisTicks(5, 9, 1)).toEqual([5]);
  });

  it("min=max devolve todos iguais", () => {
    expect(axisTicks(7, 7, 3)).toEqual([7, 7, 7]);
  });
});
