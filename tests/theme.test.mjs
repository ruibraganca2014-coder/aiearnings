import { describe, it, expect } from "vitest";
import { THEME_LABELS, THEME_COLORS, themeColor } from "../src/shared.js";

// Questões individuais para as cores das áreas/temas (pontos coloridos nas tabelas).
describe("themeColor / THEME_COLORS", () => {
  it("devolve a cor de um tema conhecido", () => {
    expect(themeColor("ai")).toBe("#7C9CF0");
  });

  it("devolve cor cinza para tema desconhecido", () => {
    expect(themeColor("xyz")).toBe("#8CA3B3");
  });

  it("devolve cor cinza para valor nulo/indefinido", () => {
    expect(themeColor(null)).toBe("#8CA3B3");
    expect(themeColor(undefined)).toBe("#8CA3B3");
  });

  it("todos os rótulos de tema têm uma cor definida", () => {
    for (const key of Object.keys(THEME_LABELS)) {
      expect(THEME_COLORS[key], "sem cor para " + key).toBeTruthy();
    }
  });

  it("todas as cores são hex válidas", () => {
    for (const [key, c] of Object.entries(THEME_COLORS)) {
      expect(c, key).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("finance -> Finanças com a cor certa", () => {
    expect(THEME_LABELS.finance).toBe("Finanças");
    expect(themeColor("finance")).toBe("#8FA8B8");
  });
});
