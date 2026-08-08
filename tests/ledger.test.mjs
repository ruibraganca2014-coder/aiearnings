import { describe, it, expect, vi, beforeAll } from "vitest";
import * as XLSX from "xlsx";

// Mock do Yahoo (ISIN → ticker) para o parser não bater na rede.
vi.mock("yahoo-finance2", () => {
  const MAP = { US0000000001: "AAA", US0000000002: "BBB" };
  return {
    default: class {
      constructor() {}
      async search(isin) { const s = MAP[isin]; return { quotes: s ? [{ symbol: s }] : [] }; }
    },
  };
});

let parseDegiro;
beforeAll(async () => { ({ parseDegiro } = await import("../ledger.mjs")); });

const HEADER = ["Data", "Hora", "Data Valor", "Produto", "ISIN", "Descrição", "T.", "Mudança", "", "Saldo", "", "ID da Ordem"];
// linha por posição: 0 data,1 hora,2 dataVal,3 produto,4 isin,5 desc,6 fx,7 moeda,8 montante,9 moedaSaldo,10 saldo,11 oid
const row = (date, hora, produto, isin, desc, fx, cur, amount, oid) =>
  [date, hora, date, produto, isin, desc, fx, cur, amount, "EUR", 0, oid];

// Um round-trip: compra (custo EUR) + venda (proventos EUR), com câmbio + comissões.
function tradeRows(oidBuy, oidSell, produto, isin, buyDate, sellDate, buyPx, sellPx, costEur, procEur, fx) {
  return [
    // COMPRA
    row(buyDate, "15:30", produto, isin, `Compra 10 ${produto}@${buyPx} USD (${isin})`, null, "USD", -buyPx * 10, oidBuy),
    row(buyDate, "15:30", produto, isin, "Levantamento de divisa", null, "EUR", -costEur, oidBuy),
    row(buyDate, "15:30", produto, isin, "Levantamento de divisa", fx, "USD", -buyPx * 10, oidBuy),
    row(buyDate, "15:30", produto, isin, "Comissões de transação DEGIRO e/ou taxas de terceiros", null, "EUR", -2, oidBuy),
    // VENDA
    row(sellDate, "16:00", produto, isin, `Venda 10 ${produto}@${sellPx} USD (${isin})`, null, "USD", sellPx * 10, oidSell),
    row(sellDate, "16:00", produto, isin, "Crédito de divisa", null, "EUR", procEur, oidSell),
    row(sellDate, "16:00", produto, isin, "Crédito de divisa", fx, "USD", sellPx * 10, oidSell),
    row(sellDate, "16:00", produto, isin, "Comissões de transação DEGIRO e/ou taxas de terceiros", null, "EUR", -2, oidSell),
  ];
}

function buildBuffer(rows) {
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumo da carteira");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseDegiro", () => {
  it("um round-trip com ganho: P/L, pct, comissões, câmbio", async () => {
    // AAA: compra custo 900€, venda 1080€ → +180€ (+20%)
    const buf = buildBuffer(tradeRows("O1", "O2", "TEST AAA", "US0000000001", "01-08-2026", "02-08-2026", 100, 120, 900, 1080, 1.11));
    const r = await parseDegiro(buf, 2500);
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.ticker).toBe("AAA");
    expect(t.pl).toBeCloseTo(180, 1);
    expect(t.pct).toBeCloseTo(20, 1);
    expect(t.holdDays).toBe(1);
    expect(t.fxBuy).toBe(1.11);
    expect(r.stats.n).toBe(1);
    expect(r.stats.wins).toBe(1);
    expect(r.stats.winRate).toBe(100);
    expect(r.stats.totalPL).toBeCloseTo(180, 1);
    expect(r.stats.fees).toBeCloseTo(-4, 1);        // 2 comissões de 2€
    expect(r.stats.netPL).toBeCloseTo(176, 1);      // 180 - 4
    expect(r.stats.totalCost).toBeCloseTo(4, 1);
    expect(r.stats.lossCount).toBe(0);
    expect(r.stats.stopCount).toBe(0);
  });

  it("ganho + perda: winRate, melhor/pior, lossCount", async () => {
    const rows = [
      ...tradeRows("O1", "O2", "TEST AAA", "US0000000001", "01-08-2026", "02-08-2026", 100, 120, 900, 1080, 1.11), // +20%
      ...tradeRows("O3", "O4", "TEST BBB", "US0000000002", "03-08-2026", "04-08-2026", 100, 88, 1000, 880, 1.10),  // -12%
    ];
    const r = await parseDegiro(buildBuffer(rows), 2500);
    expect(r.trades).toHaveLength(2);
    expect(r.stats.n).toBe(2);
    expect(r.stats.wins).toBe(1);
    expect(r.stats.winRate).toBe(50);
    expect(r.stats.lossCount).toBe(1);
    expect(r.stats.best.ticker).toBe("AAA");
    expect(r.stats.worst.ticker).toBe("BBB");
    expect(r.stats.worst.pct).toBeLessThan(0);
  });

  it("stopCount conta perdas <= -10%", async () => {
    const rows = tradeRows("O1", "O2", "TEST BBB", "US0000000002", "01-08-2026", "02-08-2026", 100, 85, 1000, 850, 1.10); // -15%
    const r = await parseDegiro(buildBuffer(rows), 2500);
    expect(r.stats.stopCount).toBe(1);
  });

  it("curva de equity = base + P/L acumulado", async () => {
    const buf = buildBuffer(tradeRows("O1", "O2", "TEST AAA", "US0000000001", "01-08-2026", "02-08-2026", 100, 120, 900, 1080, 1.11));
    const r = await parseDegiro(buf, 2500);
    expect(r.equity.length).toBeGreaterThanOrEqual(2);
    expect(r.equity[0].saldo).toBeCloseTo(2500, 1);
    expect(r.equity[r.equity.length - 1].saldo).toBeCloseTo(2680, 1); // 2500 + 180
  });

  it("ignora cash-sweep / depósitos (não são trades)", async () => {
    const rows = [
      row("01-08-2026", "07:00", "", "", "Depósitos na sua Conta Caixa na flatexDEGIRO Bank SE: 2500 EUR", null, "EUR", 2500, ""),
      row("01-08-2026", "07:00", "", "", "Degiro Cash Sweep Transfer", null, "EUR", -2500, ""),
      ...tradeRows("O1", "O2", "TEST AAA", "US0000000001", "01-08-2026", "02-08-2026", 100, 120, 900, 1080, 1.11),
    ];
    const r = await parseDegiro(buildBuffer(rows), 2500);
    expect(r.trades).toHaveLength(1); // só o round-trip, sweep/depósito ignorados
  });
});
