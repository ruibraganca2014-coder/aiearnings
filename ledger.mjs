// Parser do extrato "Conta Corrente" da DEGIRO (.xls/.xlsx) → round-trips, curva de equity e estatísticas.
// Fonte estruturada (não visão): produto, ISIN, quantidade, preço USD, câmbio EUR/USD, comissões, saldo EUR.
import * as XLSX from "xlsx";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const NV = { validateResult: false };
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// 'DD-MM-YYYY' + 'HH:MM' → ordenável / ISO
const toISO = (d) => { const m = String(d).match(/(\d{2})-(\d{2})-(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const keyOf = (d, h) => toISO(d) + "T" + (String(h || "00:00")).padStart(5, "0");
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

// cache ISIN→ticker (memória do processo)
const _isin = new Map();
async function resolveTicker(isin, name) {
  if (!isin) return null;
  if (_isin.has(isin)) return _isin.get(isin);
  let sym = null;
  try {
    const r = await yf.search(isin, {}, NV);
    const q = (r.quotes || []).find((x) => x.symbol);
    if (q) sym = q.symbol;
  } catch { /* offline / falha → fica null */ }
  _isin.set(isin, sym);
  return sym;
}

// Lê o buffer do ficheiro DEGIRO e devolve linhas normalizadas.
// Colunas (por posição, cabeçalho tem células fundidas):
// 0 Data · 1 Hora · 2 DataValor · 3 Produto · 4 ISIN · 5 Descrição · 6 Câmbio · 7 Moeda · 8 Montante · 9 MoedaSaldo · 10 Saldo · 11 IDOrdem
function rowsFromBuffer(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  return raw.slice(1).map((r) => ({
    date: r[0], hora: r[1], produto: String(r[3] || "").trim(), isin: String(r[4] || "").trim(),
    desc: String(r[5] || ""), fx: typeof r[6] === "number" ? r[6] : null, cur: String(r[7] || ""),
    amount: typeof r[8] === "number" ? r[8] : (parseFloat(String(r[8]).replace(",", ".")) || null),
    saldoCur: String(r[9] || ""), saldo: typeof r[10] === "number" ? r[10] : null, oid: String(r[11] || ""),
  })).filter((r) => r.date);
}

// Junta as linhas de uma mesma ordem (Compra/Venda + divisa EUR + comissão + divisa USD com câmbio).
function ordersFrom(rows) {
  const by = new Map();
  for (const r of rows) {
    const m = r.desc.match(/^(Compra|Venda)\s+(\d+)\s+(.+?)@([\d.,]+)\s+(USD|EUR)/i);
    const isTrade = !!m;
    if (!r.oid && !isTrade) continue;
    const oid = r.oid || (keyOf(r.date, r.hora) + ":" + r.produto);
    if (!by.has(oid)) by.set(oid, { oid, isin: r.isin, name: r.produto, dateISO: toISO(r.date), key: keyOf(r.date, r.hora), side: null, qty: 0, pxUSD: 0, eur: 0, fx: null, comm: 0 });
    const o = by.get(oid);
    if (r.isin && !o.isin) o.isin = r.isin;
    if (r.produto && !o.name) o.name = r.produto;
    if (isTrade) {
      o.side = /compra/i.test(m[1]) ? "buy" : "sell";
      o.qty = parseInt(m[2], 10);
      o.pxUSD = parseFloat(m[4].replace(",", "."));
      o.dateISO = toISO(r.date); o.key = keyOf(r.date, r.hora);
    }
    if (/divisa/i.test(r.desc) && r.cur === "EUR" && r.amount != null) o.eur += r.amount; // fluxo de caixa EUR (compra<0 / venda>0)
    if (/divisa/i.test(r.desc) && r.cur === "USD" && r.fx != null) o.fx = r.fx;            // câmbio EUR/USD
    if (/comiss/i.test(r.desc) && r.amount != null) o.comm += r.amount;                    // comissão (-2 €)
  }
  return [...by.values()].filter((o) => o.side).sort((a, b) => a.key.localeCompare(b.key));
}

// FIFO por ISIN: casa vendas com compras anteriores → round-trips com P/L realizado em EUR.
function roundTrips(orders) {
  const open = new Map(); // isin → [{qty, eurPerShare, fx, dateISO, name}]
  const trips = [];
  for (const o of orders) {
    const eurPer = o.qty ? Math.abs(o.eur) / o.qty : 0;
    if (o.side === "buy") {
      if (!open.has(o.isin)) open.set(o.isin, []);
      open.get(o.isin).push({ qty: o.qty, eurPer, fx: o.fx, dateISO: o.dateISO, name: o.name, pxUSD: o.pxUSD });
    } else {
      let remaining = o.qty;
      const lots = open.get(o.isin) || [];
      while (remaining > 0 && lots.length) {
        const lot = lots[0];
        const q = Math.min(remaining, lot.qty);
        const cost = lot.eurPer * q, proc = eurPer * q, pl = proc - cost;
        trips.push({
          isin: o.isin, name: o.name || lot.name, ticker: null,
          buyDate: lot.dateISO, sellDate: o.dateISO, holdDays: Math.max(0, daysBetween(lot.dateISO, o.dateISO)),
          qty: q, buyPx: r2(lot.pxUSD), sellPx: r2(o.pxUSD), fxBuy: lot.fx, fxSell: o.fx,
          cost: r2(cost), proceeds: r2(proc), pl: r2(pl), pct: cost ? r1((pl / cost) * 100) : 0,
        });
        lot.qty -= q; remaining -= q;
        if (lot.qty <= 0) lots.shift();
      }
    }
  }
  return trips;
}

// Curva de equity do MÉTODO: capital base + P/L realizado acumulado por trade fechado.
// (O saldo de caixa da DEGIRO oscila com cash-sweep e não representa o valor da conta.)
function equityCurve(trips, base) {
  const asc = [...trips].sort((a, b) => a.sellDate.localeCompare(b.sellDate));
  let acc = base;
  const pts = [{ date: asc[0]?.buyDate || null, saldo: r2(base) }].filter((p) => p.date);
  for (const t of asc) { acc += t.pl; pts.push({ date: t.sellDate, saldo: r2(acc) }); }
  return pts;
}

function statsFrom(trips, rows) {
  const n = trips.length;
  const wins = trips.filter((t) => t.pl > 0).length;
  const lossCount = trips.filter((t) => t.pct < 0).length;   // vendidos a perder
  const stopCount = trips.filter((t) => t.pct <= -10).length; // atingiram o stop −10%
  const totalPL = r2(trips.reduce((s, t) => s + t.pl, 0));
  const avgPct = n ? r1(trips.reduce((s, t) => s + t.pct, 0) / n) : null;
  const avgHold = n ? r1(trips.reduce((s, t) => s + t.holdDays, 0) / n) : null;
  const best = n ? trips.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = n ? trips.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  let fees = 0, conn = 0;
  for (const r of rows) {
    if (/comiss/i.test(r.desc) && r.amount != null) fees += r.amount;
    if (/conectividade/i.test(r.desc) && r.amount != null) conn += r.amount;
  }
  const fxAll = trips.flatMap((t) => [t.fxBuy, t.fxSell]).filter((x) => x != null);
  const avgFx = fxAll.length ? r2(fxAll.reduce((s, x) => s + x, 0) / fxAll.length) : null;
  const totalCost = r2(-(fees + conn)); // taxas como valor positivo (€ gastos)
  const costPerTrade = n ? r2(totalCost / n) : null;
  const pctStd = n > 1 ? r1(Math.sqrt(trips.reduce((s, t) => s + (t.pct - avgPct) ** 2, 0) / n)) : null; // consistência (desvio dos %)
  return {
    n, wins, winRate: n ? Math.round((wins / n) * 100) : null, totalPL,
    netPL: r2(totalPL + fees + conn), avgPct, avgHold,
    best: best && { ticker: best.ticker, name: best.name, pct: best.pct },
    worst: worst && { ticker: worst.ticker, name: worst.name, pct: worst.pct },
    fees: r2(fees), conn: r2(conn), totalCost, costPerTrade, pctStd, avgFx, lossCount, stopCount,
  };
}

// Ponto de entrada: buffer → { trades, equity, stats, updated }. Resolve tickers via Yahoo (tolerante a falha).
export async function parseDegiro(buf, base = 2500) {
  const rows = rowsFromBuffer(buf);
  const orders = ordersFrom(rows);
  const trips = roundTrips(orders);
  const isins = [...new Set(trips.map((t) => t.isin).filter(Boolean))];
  const map = {};
  await Promise.all(isins.map(async (i) => { map[i] = await resolveTicker(i, ""); }));
  for (const t of trips) t.ticker = map[t.isin] || null;
  const equity = equityCurve(trips, base);
  const stats = statsFrom(trips, rows);
  trips.sort((a, b) => b.sellDate.localeCompare(a.sellDate)); // mais recente primeiro
  return { trades: trips, equity, stats, updated: new Date().toISOString() };
}
