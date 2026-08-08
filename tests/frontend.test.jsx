// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Featured, StockModal, eur, probColor } from "../src/TraderSite.jsx";
import { exchOf, fmtDay } from "../src/shared.js";

describe("helpers", () => {
  it("eur formata euros", () => {
    expect(eur(1000)).toContain("€");
    expect(eur(-50)).toContain("−");
  });
  it("probColor: verde/vermelho/dourado", () => {
    expect(probColor(60)).toBe("#2FA37A");
    expect(probColor(40)).toBe("#C8553D");
    expect(probColor(50)).toBe("#D6A445");
    expect(probColor(null)).toBe("#8CA3B3");
  });
  it("exchOf distingue EUA de estrangeiro", () => {
    expect(exchOf("AAPL")).toBe("EUA");
    expect(exchOf("MC.PA")).not.toBe("EUA");
  });
  it("fmtDay devolve string", () => {
    expect(typeof fmtDay("2026-08-10")).toBe("string");
  });
});

describe("Featured", () => {
  const picks = {
    AAA: { ticker: "AAA", name: "Alpha Inc", show: true, probUp: 60, ev: 5, history: [{ d: "2026-01-01", c: 10 }, { d: "2026-01-02", c: 11 }] },
    EU: { ticker: "MC.PA", name: "LVMH", show: true, probUp: 70 }, // estrangeiro → filtrado
    HID: { ticker: "BBB", name: "Beta", show: false, probUp: 55 }, // não publicado
  };
  it("mostra só EUA publicados, com probabilidade", () => {
    render(<Featured picks={picks} suspenso={false} />);
    expect(screen.getAllByText("AAA").length).toBeGreaterThan(0);
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.queryByText("MC.PA")).toBeNull(); // estrangeiro fora
    expect(screen.queryByText("BBB")).toBeNull();    // show:false fora
  });
  it("clique chama onDetail", () => {
    const onDetail = vi.fn();
    const { container } = render(<Featured picks={picks} suspenso={false} onDetail={onDetail} />);
    fireEvent.click(container.querySelector(".ts-feat--clk"));
    expect(onDetail).toHaveBeenCalledWith(expect.objectContaining({ ticker: "AAA" }));
  });
  it("suspenso → badge SUSPENSO", () => {
    render(<Featured picks={picks} suspenso={true} />);
    expect(screen.getAllByText("SUSPENSO").length).toBeGreaterThan(0);
  });
});

describe("StockModal", () => {
  const pick = { ticker: "AAA", name: "Alpha Inc", probUp: 62, ev: 4.5, price: 100, gapAvg: 2, momentum: 1.5, rsi: 55, research: { financial: "Receita a crescer.", market: "Setor forte." } };
  it("mostra métricas e fecha", () => {
    const onClose = vi.fn();
    render(<StockModal pick={pick} onClose={onClose} />);
    expect(screen.getAllByText("AAA").length).toBeGreaterThan(0);
    expect(screen.getByText("62%")).toBeTruthy();
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalled();
  });
  it("abre texto da pesquisa aprofundada", () => {
    render(<StockModal pick={pick} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Análise financeira"));
    expect(screen.getByText("Receita a crescer.")).toBeTruthy();
  });
});
