import { describe, it, expect } from "vitest";
import { fmtName } from "../src/shared.js";

// Questões individuais para o formatador de nomes de empresas (CAPS → Capitalizado),
// mantendo nomes já bem formatados intactos e preservando siglas/sufixos legais.
describe("fmtName", () => {
  it("deixa nome já capitalizado intacto", () => {
    expect(fmtName("Intuitive Machines, Inc.")).toBe("Intuitive Machines, Inc.");
  });

  it("capitaliza nome todo em maiúsculas", () => {
    expect(fmtName("BROOKFIELD CORPORATION")).toBe("Brookfield Corporation");
  });

  it("capitaliza palavra única", () => {
    expect(fmtName("TENCENT")).toBe("Tencent");
  });

  it("capitaliza duas palavras", () => {
    expect(fmtName("CHINA MOBILE")).toBe("China Mobile");
  });

  it("preserva sufixo legal A/S", () => {
    expect(fmtName("ORSTED A/S")).toBe("Orsted A/S");
  });

  it("preserva sigla FPO e ticker entre parêntesis", () => {
    expect(fmtName("CWLTH BANK FPO [CBA]")).toBe("Cwlth Bank FPO [CBA]");
  });

  it("capitaliza sufixo INC mas mantém sigla RWE", () => {
    expect(fmtName("CLOUDFLARE INC CLASS A")).toBe("Cloudflare Inc Class A");
    expect(fmtName("GILEAD SCIENCES, INC")).toBe("Gilead Sciences, Inc");
  });

  it("preserva tokens com dígitos", () => {
    expect(fmtName("RWE AG I")).toBe("RWE AG I");
  });

  it("não altera nome misto com minúsculas", () => {
    expect(fmtName("A.P. Møller - Mærsk B A/S")).toBe("A.P. Møller - Mærsk B A/S");
  });

  it("colapsa espaços múltiplos", () => {
    expect(fmtName("E.ON SE     N")).toBe("E.On SE N");
  });

  it("string vazia devolve vazio", () => {
    expect(fmtName("")).toBe("");
  });

  it("nulo/indefinido devolve string vazia", () => {
    expect(fmtName(null)).toBe("");
    expect(fmtName(undefined)).toBe("");
  });
});
