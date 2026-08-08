import { describe, it, expect } from "vitest";
import { fmtDay, WD } from "../src/shared.js";

// Questões individuais para helpers de data/dia da semana.
describe("fmtDay", () => {
  it("ISO válido -> DD/MM", () => {
    expect(fmtDay("2026-08-09")).toBe("09/08");
  });

  it("preenche com zero à esquerda", () => {
    expect(fmtDay("2026-01-05")).toBe("05/01");
  });

  it("string inválida devolve o próprio valor", () => {
    expect(fmtDay("xpto")).toBe("xpto");
  });
});

describe("WD (dias da semana)", () => {
  it("tem 7 dias", () => {
    expect(WD).toHaveLength(7);
  });

  it("índice 0 é Domingo", () => {
    expect(WD[0]).toBe("Domingo");
  });

  it("índice 1 é Segunda", () => {
    expect(WD[1]).toBe("Segunda");
  });

  it("índice 6 é Sábado", () => {
    expect(WD[6]).toBe("Sábado");
  });
});
