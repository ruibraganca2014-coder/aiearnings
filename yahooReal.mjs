// Backend Yahoo Finance REAL — calendário market-wide (todas as empresas US) + reações verdadeiras.
// Reação = janela de 1 dia à volta do anúncio, correta para BMO (pré-mercado) e AMC (after-market).
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const NV = { validateResult: false }; // não rebentar em tickers com schema atípico (ex. SPCX)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// cache TTL in-memory (guarda a promise → chamadas concorrentes deduplicam)
const _cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = fn();
  _cache.set(key, { t: Date.now(), v });
  try { return await v; } catch (e) { _cache.delete(key); throw e; }
}

// executa fn sobre items com no máximo `limit` em simultâneo (evita rebentar limites do Yahoo)
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const shiftDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const numOf = (x) => (typeof x === "number" && isFinite(x) ? x : (typeof x?.raw === "number" ? x.raw : null));

// Sinais FUNDAMENTAIS do Yahoo (v ∈ [-1,+1], + rótulo). Inclinam o lean além das reações passadas.
// beat-history · revisões de EPS · valuation (sell-the-news) · qualidade (receita/FCF).
function fundamentalSignals(qs, surprises) {
  const fd = qs.financialData || {}, sd = qs.summaryDetail || {};
  const t0 = qs.earningsTrend?.trend?.[0];
  const sig = [];
  const add = (key, label, v, raw) => sig.push({ key, label, v: r2(clamp(v, -1, 1)), raw });

  if (surprises.length) {
    const beatRate = surprises.filter((x) => x > 0).length / surprises.length;
    const avg = mean(surprises);
    add("beat", "Histórico de beat (EPS)", (beatRate - 0.5) * 1.4 + clamp(avg / 10, -0.3, 0.3),
      `${Math.round(beatRate * 100)}% bate · média ${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`);
  }
  const rev = t0?.epsRevisions;
  if (rev) {
    const up = numOf(rev.upLast30days) ?? 0, dn = numOf(rev.downLast30days) ?? 0;
    if (up + dn > 0) add("rev", "Revisões de EPS (30d)", (up - dn) / (up + dn), `${up}↑ / ${dn}↓`);
  }
  const pe = numOf(sd.forwardPE) ?? numOf(sd.trailingPE);
  if (pe && pe > 0) add("val", "Valuation (P/E fwd)", clamp((25 - pe) / 40, -1, 0.5), `${pe.toFixed(0)}×`);
  const rg = numOf(fd.revenueGrowth), fcf = numOf(fd.freeCashflow);
  if (rg != null) {
    let v = clamp(rg * 3, -1, 1);
    if (fcf != null) v += fcf > 0 ? 0.15 : -0.2;
    add("qual", "Qualidade (receita/FCF)", clamp(v, -1, 1), `receita ${(rg * 100).toFixed(0)}%${fcf != null ? ` · FCF ${fcf > 0 ? "+" : "−"}` : ""}`);
  }
  return sig;
}

// universo alargado multi-setor (ticker → tema) — datas forward via quote() em lote,
// porque o feed do calendário Yahoo está esparso à frente neste ambiente.
const UNIVERSE = {
  AAPL:"ai",MSFT:"cloud",GOOGL:"ai",AMZN:"consumer",META:"ai",NVDA:"semis",AVGO:"semis",AMD:"semis",TSLA:"ev",
  ORCL:"cloud",CRM:"cloud",ADBE:"cloud",NFLX:"consumer",INTC:"semis",QCOM:"semis",TXN:"semis",MU:"memory",
  AMAT:"semis",LRCX:"semis",KLAC:"semis",ARM:"semis",PLTR:"ai",SNOW:"cloud",NOW:"cloud",PANW:"cyber",CRWD:"cyber",
  ZS:"cyber",FTNT:"cyber",DDOG:"cloud",NET:"cyber",SMCI:"datacenter",DELL:"datacenter",ANET:"networking",
  CSCO:"networking",IBM:"cloud",MRVL:"semis",ON:"semis",MCHP:"semis",WDC:"storage",STX:"storage",HPE:"datacenter",
  JPM:"finance",BAC:"finance",WFC:"finance",C:"finance",GS:"finance",MS:"finance",USB:"finance",PNC:"finance",
  TFC:"finance",COF:"finance",SCHW:"finance",BLK:"finance",AXP:"finance",V:"finance",MA:"finance",PYPL:"crypto",
  COIN:"crypto",HOOD:"crypto",BX:"finance",KKR:"finance",SPGI:"finance",ICE:"finance",CB:"finance",MET:"finance",
  MTB:"finance",CFG:"finance",FITB:"finance",HBAN:"finance",KEY:"finance",CMA:"finance",RF:"finance",ALLY:"finance",
  UNH:"health",JNJ:"health",LLY:"health",PFE:"health",MRK:"health",ABBV:"health",TMO:"health",ABT:"health",
  DHR:"health",BMY:"health",AMGN:"health",GILD:"health",VRTX:"health",REGN:"health",MRNA:"health",ISRG:"health",
  CVS:"health",CI:"health",HUM:"health",MDT:"health",BSX:"health",SYK:"health",
  WMT:"consumer",COST:"consumer",HD:"consumer",LOW:"consumer",TGT:"consumer",NKE:"consumer",MCD:"consumer",
  SBUX:"consumer",KO:"consumer",PEP:"consumer",PG:"consumer",CL:"consumer",MDLZ:"consumer",PM:"consumer",MO:"consumer",
  DIS:"gaming",CMCSA:"consumer",ABNB:"consumer",BKNG:"consumer",MAR:"consumer",CMG:"consumer",LULU:"consumer",
  XOM:"powergrid",CVX:"powergrid",COP:"powergrid",SLB:"powergrid",EOG:"powergrid",OXY:"powergrid",
  CAT:"industrial",DE:"industrial",HON:"industrial",GE:"industrial",BA:"defense",LMT:"defense",RTX:"defense",
  NOC:"defense",GD:"defense",UNP:"industrial",UPS:"industrial",FDX:"industrial",MMM:"industrial",EMR:"industrial",
  ETN:"powergrid",NEE:"powergrid",DUK:"powergrid",SO:"powergrid",LIN:"minerals",FCX:"minerals",NUE:"minerals",
  ENPH:"solar",FSLR:"solar",PLD:"storage",AMT:"networking",SPG:"consumer",O:"finance",BRX:"consumer",
  SPCX:"defense",SPCE:"defense",RKLB:"defense",LUNR:"defense",
  // Euronext Lisboa (.LS)
  "GALP.LS":"powergrid","EDP.LS":"powergrid","EDPR.LS":"solar","JMT.LS":"consumer","BCP.LS":"finance","NOS.LS":"consumer","SON.LS":"consumer","CTT.LS":"industrial","ALTR.LS":"ai","SEM.LS":"minerals",
  // Londres (.L)
  "SHEL.L":"powergrid","BP.L":"powergrid","AZN.L":"health","GSK.L":"health","HSBA.L":"finance","ULVR.L":"consumer","RIO.L":"minerals","BATS.L":"consumer","DGE.L":"consumer","BARC.L":"finance","LSEG.L":"finance","VOD.L":"ai",
  // Paris (.PA)
  "MC.PA":"consumer","OR.PA":"consumer","TTE.PA":"powergrid","SAN.PA":"health","AIR.PA":"defense","BNP.PA":"finance","SU.PA":"industrial","AI.PA":"minerals","DG.PA":"industrial","RMS.PA":"consumer",
  // Amsterdão (.AS)
  "ASML.AS":"semis","PRX.AS":"ai","INGA.AS":"finance","AD.AS":"consumer","PHIA.AS":"health","HEIA.AS":"consumer","ADYEN.AS":"finance",
  // Xetra / Alemanha (.DE)
  "SAP.DE":"cloud","SIE.DE":"industrial","ALV.DE":"finance","DTE.DE":"ai","MBG.DE":"ev","BAS.DE":"minerals","BMW.DE":"ev","VOW3.DE":"ev","IFX.DE":"semis","MRK.DE":"health",
  // Milão (.MI)
  "RACE.MI":"consumer","ENEL.MI":"powergrid","ISP.MI":"finance","UCG.MI":"finance","ENI.MI":"powergrid","STLAM.MI":"ev","G.MI":"finance","PIRC.MI":"ev",
  // Madrid (.MC)
  "SAN.MC":"finance","BBVA.MC":"finance","IBE.MC":"powergrid","ITX.MC":"consumer","TEF.MC":"ai","REP.MC":"powergrid","AENA.MC":"industrial","CLNX.MC":"networking","FER.MC":"industrial",
};

// mapeia setor Yahoo → tema visual da app (para o ponto colorido)
const SECTOR_MAP = {
  "Technology": "ai", "Communication Services": "ai", "Financial Services": "finance",
  "Healthcare": "health", "Energy": "powergrid", "Industrials": "industrial",
  "Consumer Cyclical": "consumer", "Consumer Defensive": "consumer", "Utilities": "powergrid",
};

function rsi14(closes) {
  if (closes.length < 15) return null;
  const s = closes.slice(-15);
  let g = 0, l = 0;
  for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; if (d >= 0) g += d; else l -= d; }
  const ag = g / 14, al = l / 14;
  if (al === 0) return 100;
  return Math.round(100 - 100 / (1 + ag / al));
}
const sma = (a, n) => (a.length < n ? null : mean(a.slice(-n)));

async function dailyCloses(sym) {
  const period1 = new Date(Date.now() - 760 * 864e5);
  const res = await yf.chart(sym, { period1, interval: "1d" }, NV);
  const quotes = (res.quotes || []).filter((q) => q.close != null);
  return quotes.map((q) => ({ d: iso(q.date), close: q.close, open: q.open })).sort((a, b) => a.d.localeCompare(b.d));
}

// ---------- bolsas: fuso + horário local (via Intl, sem tabelas de offset manuais) ----------
const BUY_MARGIN = 5; // comprar 5 min antes do fecho
// open/close = minutos do dia na HORA LOCAL da bolsa
const EXCHANGES = {
  US: { tz: "America/New_York", open: 570, close: 960, label: "EUA" },
  LS: { tz: "Europe/Lisbon", open: 480, close: 990, label: "Lisboa" },
  L:  { tz: "Europe/London", open: 480, close: 990, label: "Londres" },
  PA: { tz: "Europe/Paris", open: 540, close: 1050, label: "Paris" },
  AS: { tz: "Europe/Amsterdam", open: 540, close: 1050, label: "Amsterdão" },
  DE: { tz: "Europe/Berlin", open: 540, close: 1050, label: "Xetra" },
  T:  { tz: "Asia/Tokyo", open: 540, close: 900, label: "Tóquio" },
  HK: { tz: "Asia/Hong_Kong", open: 570, close: 960, label: "Hong Kong" },
  MI: { tz: "Europe/Rome", open: 540, close: 1050, label: "Milão" },       // 09:00-17:30
  MC: { tz: "Europe/Madrid", open: 540, close: 1050, label: "Madrid" },    // 09:00-17:30
  TO: { tz: "America/Toronto", open: 570, close: 960, label: "Toronto" },  // 09:30-16:00
  SA: { tz: "America/Sao_Paulo", open: 600, close: 1020, label: "Brasil" },// 10:00-17:00
  NS: { tz: "Asia/Kolkata", open: 555, close: 930, label: "Índia" },       // 09:15-15:30
  KS: { tz: "Asia/Seoul", open: 540, close: 930, label: "Coreia" },        // 09:00-15:30
  AX: { tz: "Australia/Sydney", open: 600, close: 960, label: "Austrália" },// 10:00-16:00
};
const exchOf = (sym) => { const m = String(sym).toUpperCase().match(/\.([A-Z]+)$/); return (m && EXCHANGES[m[1]]) || EXCHANGES.US; };
// partes locais {day 'YYYY-MM-DD', min do dia} de um instante numa timezone IANA
function localParts(instant, tz) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(instant));
  const g = (t) => p.find((x) => x.type === t).value;
  let hh = g("hour"); if (hh === "24") hh = "00";
  return { day: `${g("year")}-${g("month")}-${g("day")}`, min: +hh * 60 + +g("minute") };
}
// instante UTC correspondente a (dia local, minuto local) numa timezone
function tzInstant(dayISO, minutes, tz) {
  const guess = Date.UTC(+dayISO.slice(0, 4), +dayISO.slice(5, 7) - 1, +dayISO.slice(8, 10), Math.floor(minutes / 60), minutes % 60);
  const lp = localParts(guess, tz);
  const utcMin = new Date(guess).getUTCHours() * 60 + new Date(guess).getUTCMinutes();
  let off = lp.min - utcMin;
  if (off > 720) off -= 1440; else if (off < -720) off += 1440;
  return guess - off * 60000;
}
// classificação do momento do anúncio na bolsa: BMO / AMC / intradia
const classifyWhen = (instant, exch = EXCHANGES.US) => { const min = localParts(instant, exch.tz).min; return min < exch.open ? "BMO" : min >= exch.close ? "AMC" : "intraday"; };
const nextBusinessDay = (dayISO) => { const t = new Date(dayISO + "T00:00:00Z"); do { t.setUTCDate(t.getUTCDate() + 1); } while (t.getUTCDay() === 0 || t.getUTCDay() === 6); return t.toISOString().slice(0, 10); };
const prevBusinessDay = (dayISO) => { const t = new Date(dayISO + "T00:00:00Z"); do { t.setUTCDate(t.getUTCDate() - 1); } while (t.getUTCDay() === 0 || t.getUTCDay() === 6); return t.toISOString().slice(0, 10); };

// Comprar ANTES do anúncio, ao fecho do dia de entrada (hora local da bolsa → mostrada em hora de Portugal).
// AMC → fecho do próprio dia; BMO/intradia → fecho da véspera.
function buyByInfo(instant, exch = EXCHANGES.US) {
  const lp = localParts(instant, exch.tz);
  const when = lp.min < exch.open ? "BMO" : lp.min >= exch.close ? "AMC" : "intraday";
  const entryDay = when === "AMC" ? lp.day : prevBusinessDay(lp.day);
  const utc = tzInstant(entryDay, exch.close - BUY_MARGIN, exch.tz);
  const buyBy = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(utc));
  return { when, buyBy, entryISO: entryDay };
}

const tradingIndex = (series, rISO) => {
  let idx = -1;
  for (let i = 0; i < series.length; i++) { if (series[i].d <= rISO) idx = i; else break; }
  return idx;
};

// PEAD — drift pós-resultados: entra no fecho do dia seguinte ao anúncio (T+1, já com o gap
// inicial refletido) e mantém PEAD_DAYS dias de trading (~1 mês). Devolve null se o drift ainda
// não completou (evento demasiado recente). É a "reação" que alimenta decisão e verificação.
const PEAD_DAYS = 20;
// entrada ANTES do anúncio (para estar posicionado):
// AMC (após fecho D) → comprar no fecho desse dia (i). BMO/intradia (pré-abertura D) → comprar na véspera (i-1).
const peadEntryIdx = (series, reportedDate, exch) => {
  const i = tradingIndex(series, iso(new Date(reportedDate)));
  if (i < 0) return -1;
  return classifyWhen(reportedDate, exch) === "AMC" ? i : i - 1;
};
// drift COMPLETO (T+1→T+20). null se ainda não fecharam 20 dias.
function driftReturn(series, reportedDate, exch) {
  const entry = peadEntryIdx(series, reportedDate, exch);
  if (entry < 0) return null;
  const exit = entry + PEAD_DAYS;
  if (exit >= series.length) return null;
  return r1(((series[exit].close - series[entry].close) / series[entry].close) * 100);
}
// drift PARCIAL (entrada → hoje, até 20 dias). Devolve { drift, days, complete }.
function peadDriftPartial(series, reportedDate, exch) {
  const entry = peadEntryIdx(series, reportedDate, exch);
  if (entry < 0 || entry >= series.length) return null;
  const exit = Math.min(entry + PEAD_DAYS, series.length - 1);
  const days = exit - entry;
  if (days < 1) return null; // ainda sem fecho após a entrada
  return { drift: r1(((series[exit].close - series[entry].close) / series[entry].close) * 100), days, complete: exit >= entry + PEAD_DAYS };
}
// GAP OVERNIGHT: comprar no fecho ANTES do anúncio → vender na abertura logo a seguir.
// AMC (após fecho D): fecho(D) → abertura(D+1). BMO/intradia (pré-abertura D): fecho(D-1) → abertura(D).
function overnightGap(series, reportedDate, exch) {
  const i = tradingIndex(series, iso(new Date(reportedDate)));
  if (i < 0) return null;
  const amc = classifyWhen(reportedDate, exch) === "AMC";
  const entryIdx = amc ? i : i - 1;   // fecho antes do anúncio
  const exitIdx = amc ? i + 1 : i;    // abertura logo a seguir
  if (entryIdx < 0 || exitIdx >= series.length) return null;
  const entry = series[entryIdx].close, exit = series[exitIdx].open;
  if (entry == null || exit == null) return null;
  return r1(((exit - entry) / entry) * 100);
}

// Movimento implícito REAL via straddle ATM da expiração logo após os resultados.
async function impliedFromOptions(sym, earningsISO) {
  const base = await yf.options(sym, {}, NV);
  const spot = base.quote?.regularMarketPrice;
  const exps = base.expirationDates || [];
  if (!spot || !exps.length) return null;
  const eMs = earningsISO ? new Date(earningsISO + "T00:00:00Z").getTime() : Date.now();
  const chosen = exps.find((d) => d.getTime() >= eMs) || exps[exps.length - 1];
  const chain = await yf.options(sym, { date: chosen }, NV);
  const opt = chain.options?.[0];
  if (!opt || !opt.calls?.length) return null;
  const mid = (o) => (o && o.bid != null && o.ask != null && o.ask > 0 ? (o.bid + o.ask) / 2 : o?.lastPrice);
  const strikes = opt.calls.map((c) => c.strike);
  const atm = strikes.reduce((a, b) => (Math.abs(b - spot) < Math.abs(a - spot) ? b : a), strikes[0]);
  const call = opt.calls.find((c) => c.strike === atm);
  const put = (opt.puts || []).find((p) => p.strike === atm);
  const sc = mid(call), sp = mid(put);
  if (sc == null || sp == null) return null;
  const move = r1(((sc + sp) / spot) * 100);
  const iv1 = (call?.impliedVolatility != null && put?.impliedVolatility != null)
    ? r2((call.impliedVolatility + put.impliedVolatility) / 2) : null;
  return {
    impliedMove: move, straddleMove: move, iv1, iv0: null,
    daysToExpiry: Math.round((chosen.getTime() - Date.now()) / 864e5),
    impliedSource: `straddle ATM ${atm} · expiração ${iso(chosen)} (Yahoo)`,
  };
}

// Análise LLM (Claude) — P(subir), P(beat), confiança, raciocínio. Lê ANTHROPIC_API_KEY do env.
// Sem chave → devolve null (feature dorme até configurares). Usa dados fundamentais como contexto.
const LLM_MODEL = process.env.EE_LLM_MODEL || "claude-haiku-4-5-20251001";
async function llmAnalyze(sym, ctx) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `És um analista de ações. Antes dos resultados de ${sym}, com estes dados reais:
${JSON.stringify(ctx, null, 1)}

Estratégia: comprar antes do anúncio e manter ~1 mês (apanha reação + drift PEAD).
Responde SÓ com um objeto JSON (sem markdown), em pt-PT no reasoning:
{"probUp": <0-100, prob. de subir no mês seguinte>, "probBeat": <0-100, prob. de bater a estimativa de EPS>, "confidence": <0-100>, "reasoning": "<1-2 frases>"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: LLM_MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e < 0) return null;
    const o = JSON.parse(text.slice(s, e + 1));
    return {
      probUp: Math.round(Number(o.probUp)), probBeat: Math.round(Number(o.probBeat)),
      confidence: Math.round(Number(o.confidence)), reasoning: String(o.reasoning || ""),
    };
  } catch { return null; }
}

async function _realQuote(sym, opts = {}) {
  sym = String(sym).toUpperCase();
  const [qs, series] = await Promise.all([
    yf.quoteSummary(sym, {
      modules: ["earnings", "calendarEvents", "price", "summaryDetail", "financialData", "assetProfile", "defaultKeyStatistics", "earningsTrend"],
    }, NV),
    dailyCloses(sym),
  ]);

  const quarterly = qs.earnings?.earningsChart?.quarterly || [];
  const closes = series.map((x) => x.close);
  const exch = exchOf(sym); // bolsa (fuso/horário) desta ação

  // reações = drift PEAD (T+1 → T+20 dias de trading); só trimestres cujo drift já completou.
  const reactions = [], reactionDates = [], reactionWhen = [], reactionIntraday = [], surprises = [];
  for (const q of quarterly) {
    if (!q.reportedDate) continue;
    const rx = driftReturn(series, q.reportedDate, exch);
    if (rx == null) continue; // drift ainda incompleto → não conta
    reactions.push(rx);
    reactionDates.push(iso(q.reportedDate));
    reactionWhen.push(classifyWhen(q.reportedDate, exch));
    reactionIntraday.push(false);
    if (q.surprisePct != null) surprises.push(Number(q.surprisePct));
  }

  // gap overnight (fecho pré-anúncio → abertura pós-anúncio) por trimestre (últimos ~8)
  const gaps = [], gapDates = [];
  for (const q of quarterly) {
    if (!q.reportedDate) continue;
    const g = overnightGap(series, q.reportedDate, exch);
    if (g == null) continue;
    gaps.push(g); gapDates.push(iso(q.reportedDate));
  }
  const gapUps = gaps.filter((g) => g > 0);
  const gapPctUp = gaps.length ? Math.round((gapUps.length / gaps.length) * 100) : null;
  const gapAvg = gaps.length ? r1(mean(gaps)) : null;

  // histórico de cotações (~1 ano diário) + datas de resultados para marcar no gráfico
  const history = series.slice(-260).map((x) => ({ d: x.d, c: r2(x.close) }));
  const earningsMarks = quarterly.filter((q) => q.reportedDate).map((q) => iso(q.reportedDate));

  const ups = reactions.filter((r) => r > 0);
  const s = std(reactions), m = mean(reactions);
  const price = qs.price?.regularMarketPrice ?? closes.at(-1) ?? null;
  const p50 = sma(closes, 50), p200 = sma(closes, 200);
  const trend = p50 && p200 && price
    ? (price > p50 && price > p200 ? "bullish" : price < p50 && price < p200 ? "bearish" : "neutral") : "";
  const mom = closes.length > 22 ? r1(((closes.at(-1) - closes.at(-22)) / closes.at(-22)) * 100) : null;
  const recKey = qs.financialData?.recommendationKey || "";
  const analyst = /buy/.test(recKey) ? "bullish" : /sell|underperform/.test(recKey) ? "bearish" : recKey ? "neutral" : "";
  const beatRate = surprises.length ? Math.round((surprises.filter((x) => x > 0).length / surprises.length) * 100) : null;
  const upPct = reactions.length ? Math.round((ups.length / reactions.length) * 100) : 50;
  const avgHist = reactions.length ? r1(mean(reactions.map(Math.abs))) : null;
  const earningsDateStr = qs.calendarEvents?.earnings?.earningsDate?.[0] ? iso(qs.calendarEvents.earnings.earningsDate[0]) : "";

  // sinais fundamentais → inclinam o probUp (blend 50/50 com a frequência empírica das reações)
  const signals = fundamentalSignals(qs, surprises);
  const fundV = signals.length ? mean(signals.map((x) => x.v)) : null;   // -1..+1
  const fundProb = fundV != null ? 50 + fundV * 25 : null;               // 25..75
  const probUp = fundProb != null ? Math.round(0.5 * upPct + 0.5 * fundProb) : upPct;
  const revSig = signals.find((x) => x.key === "rev");
  const qualSig = signals.find((x) => x.key === "qual");
  const estRevision = revSig ? (revSig.v > 0.2 ? "up" : revSig.v < -0.2 ? "down" : "flat") : "";
  const earningsQuality = qualSig ? (qualSig.v > 0.3 ? "high" : qualSig.v < 0 ? "low" : "medium") : "";

  let opt = null;
  try { opt = await impliedFromOptions(sym, earningsDateStr); } catch { opt = null; }

  // análise LLM (só quando pedida — análise individual, não a tabela dos 40)
  let llm = null;
  if (opts.llm) {
    llm = await llmAnalyze(sym, {
      driftsHistoricos: reactions, surpresasEPS: surprises, taxaBeat: beatRate,
      revisoesEstimativas: estRevision, qualidade: earningsQuality,
      valuationForwardPE: numOf(qs.summaryDetail?.forwardPE), crescimentoReceita: numOf(qs.financialData?.revenueGrowth),
      momentum1m: mom, analistas: analyst, tendencia: trend, movimentoImplicito: opt?.impliedMove ?? null,
    });
  }

  return {
    ticker: sym,
    name: qs.price?.longName || qs.price?.shortName || sym,
    price: price != null ? r2(price) : null,
    earningsDate: earningsDateStr,
    impliedMove: opt?.impliedMove ?? avgHist,
    impliedSource: opt?.impliedSource ?? "estimativa (média histórica das reações)",
    straddleMove: opt?.straddleMove ?? null,
    iv1: opt?.iv1 ?? null, iv0: opt?.iv0 ?? null, daysToExpiry: opt?.daysToExpiry ?? null,
    avgHist,
    pctUp: upPct, pctStrategyWin: upPct,
    avgStrategyReturn: reactions.length ? r1(m) : null,
    avgDayAfter: reactions.length ? r1(m) : null,
    beatRate,
    gaps, gapDates, gapN: gaps.length, gapPctUp, gapAvg, // gap overnight (fecho→abertura)
    history, earningsMarks, // cotações ~1 ano + datas de resultados

    reactions, reactionDates, reactionWhen, reactionIntraday, reactionN: reactions.length,
    reactionStd: reactions.length ? r1(s) : null,
    reactionLow: reactions.length ? r1(m - s) : null,
    reactionHigh: reactions.length ? r1(m + s) : null,
    reactionSkew: reactions.length && s ? r1(m / s) : null,
    reactionMin: reactions.length ? r1(Math.min(...reactions)) : null,
    reactionMax: reactions.length ? r1(Math.max(...reactions)) : null,
    momentum: mom,
    analyst, trend,
    rsi: rsi14(closes),
    estRevision, whisper: "", beatRaise: "", optionsSkew: "",
    earningsQuality, newsSentiment: "", peerReaction: "",
    sector: SECTOR_MAP[qs.assetProfile?.sector] || "other",
    website: qs.assetProfile?.website || "",
    lean: {
      direction: probUp > 55 ? "up" : probUp < 45 ? "down" : "uncertain",
      probUp,
      confidence: Math.min(75, reactions.length * 8 + signals.length * 8),
      signals, reactionLogic: null,
    },
    llm, news: null, newsTally: null, newsMethod: "", market: null,
    shortPct: qs.defaultKeyStatistics?.shortPercentOfFloat != null ? r1(qs.defaultKeyStatistics.shortPercentOfFloat * 100) : null,
    targetUpside: (qs.financialData?.targetMeanPrice && price) ? r1(((qs.financialData.targetMeanPrice - price) / price) * 100) : null,
    note: `Dados reais Yahoo · ${reactions.length} reações + ${signals.length} sinais fundamentais (beat, revisões, valuation, qualidade). Lean = 50% reações + 50% fundamentais.`,
    _estimated: false,
  };
}

// ---------- calendário market-wide (endpoint visualization do Yahoo) ----------
let _auth = null;
async function auth() {
  if (_auth) return _auth;
  let cookie = "";
  try { cookie = ((await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } })).headers.get("set-cookie") || "").split(";")[0]; } catch {}
  const crumb = await (await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } })).text();
  _auth = { cookie, crumb };
  return _auth;
}

// Todas as empresas US com resultados no intervalo [fromISO, toISO).
async function earningsFeed(fromISO, toISO, max = 500) {
  const { cookie, crumb } = await auth();
  const out = [];
  for (let offset = 0; offset < max; offset += 100) {
    const body = {
      sortType: "ASC", entityIdType: "earnings", sortField: "startdatetime",
      includeFields: ["ticker", "companyshortname", "startdatetime", "startdatetimetype"],
      query: { operator: "and", operands: [
        { operator: "gte", operands: ["startdatetime", fromISO] },
        { operator: "lt", operands: ["startdatetime", toISO] },
        { operator: "eq", operands: ["region", "us"] },
      ] },
      offset, size: 100,
    };
    const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/visualization?crumb=${encodeURIComponent(crumb)}`,
      { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) { _auth = null; break; }
    const j = await res.json();
    const doc = j.finance?.result?.[0]?.documents?.[0];
    const cols = (doc?.columns || []).map((c) => c.id);
    const rows = doc?.rows || [];
    for (const rw of rows) { const o = {}; cols.forEach((c, i) => (o[c] = rw[i])); out.push(o); }
    const total = j.finance?.result?.[0]?.total ?? 0;
    if (rows.length === 0 || offset + 100 >= total) break;
  }
  return out;
}

// só common stock US: sem preferenciais ("-" ou 5ª letra dupla), sem OTC estrangeiro (5 letras a acabar em F).
// dedupe por EMPRESA → fica o ticker mais curto (o common), removendo preferenciais tipo FITBI/HBANP.
function cleanFeed(rows) {
  const byCompany = new Map();
  for (const r of rows) {
    const t = String(r.ticker || "").toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(t)) continue;            // exclui "-" preferenciais e "." estrangeiros
    if (t.length === 5 && t.endsWith("F")) continue;  // OTC de empresa estrangeira (ordinary foreign)
    const name = r.companyshortname || t;
    const prev = byCompany.get(name);
    if (!prev || t.length < prev.ticker.length) {
      byCompany.set(name, { ticker: t, name, date: iso(r.startdatetime), ts: r.startdatetime, when: r.startdatetimetype || "" });
    }
  }
  return [...byCompany.values()];
}

// Decisão walk-forward PEAD: combina a SURPRESA de EPS do evento (motor do drift: beat → drift up)
// com o histórico de drift do ticker. A surpresa é legítima aqui (entra-se em T+1, já conhecida).
function walkForwardDecision(priors, surprisePct) {
  const hasHist = priors.length >= 2;
  if (!hasHist && surprisePct == null) return { verdict: "—", ev: null };
  const up = priors.filter((r) => r > 0), dn = priors.filter((r) => r < 0);
  const histProb = priors.length ? up.length / priors.length : 0.5;        // persistência do drift
  const surpProb = surprisePct != null ? clamp(0.5 + surprisePct / 40, 0.15, 0.85) : 0.5; // beat → >0.5
  const pUp = surprisePct != null ? 0.6 * surpProb + 0.4 * histProb : histProb; // surpresa domina
  const avgUp = up.length ? mean(up) : 3, avgDown = dn.length ? mean(dn) : -3;   // magnitudes do drift
  const ev = pUp * avgUp + (1 - pUp) * avgDown;
  return { verdict: ev > 0.5 ? "COMPRAR" : "NÃO", ev: r2(ev), buy: ev > 0.5, pUp: Math.round(pUp * 100) };
}

// Verifica a previsão de UM resultado passado (PEAD).
// Reação = drift T+1→T+20 (só conta se o drift já completou); decisão = walk-forward sobre drifts anteriores.
async function verifyPast(item) {
  const [qs, series] = await Promise.all([
    yf.quoteSummary(item.ticker, { modules: ["earnings", "assetProfile"] }, NV),
    dailyCloses(item.ticker),
  ]);
  const quarterly = (qs.earnings?.earningsChart?.quarterly || []).filter((q) => q.reportedDate);
  if (!quarterly.length) return null;
  const sorted = [...quarterly].sort((a, b) => new Date(a.reportedDate) - new Date(b.reportedDate));
  const exch = exchOf(item.ticker);
  // alvo = trimestre que casa com a data do feed; senão o mais recente
  let k = item.date ? sorted.findIndex((q) => iso(q.reportedDate) === item.date) : -1;
  if (k < 0) k = sorted.length - 1;
  const target = sorted[k];
  const pd = peadDriftPartial(series, target.reportedDate, exch); // drift em curso (parcial) ou completo
  if (!pd) return null;

  const priors = sorted.slice(0, k).map((q) => driftReturn(series, q.reportedDate, exch)).filter((x) => x != null);
  const surprise = target.surprisePct != null ? Number(target.surprisePct) : null;
  const wf = walkForwardDecision(priors, surprise);
  const correct = wf.verdict === "—" ? null : (wf.buy ? pd.drift > 0 : pd.drift <= 0);
  return {
    ticker: item.ticker, name: item.name, sector: SECTOR_MAP[qs.assetProfile?.sector] || null,
    date: iso(target.reportedDate), past: true, reaction: pd.drift, driftDays: pd.days, driftComplete: pd.complete,
    when: classifyWhen(target.reportedDate, exch), surprise: surprise != null ? r1(surprise) : null,
    verdict: wf.verdict, ev: wf.ev, correct,
  };
}

// quote() em lote de todo o universo (uma vez): dá próxima data (ou última se ainda não agendada).
async function universeQuotes() {
  const syms = Object.keys(UNIVERSE);
  const chunks = [];
  for (let i = 0; i < syms.length; i += 50) chunks.push(syms.slice(i, i + 50));
  const results = await Promise.all(chunks.map((c) => yf.quote(c, undefined, NV).catch(() => []))); // chunks em paralelo
  return results.flat();
}


async function _realCalendar(fromISO, toISO) {
  const quotes = await universeQuotes().catch(() => []);

  // ---- próximos: universo (quote) + feed market-wide ----
  let upcoming = [];
  try {
    const now = Date.now();
    const uni = quotes.map((q) => {
      const ts = q.earningsTimestampStart || q.earningsTimestamp;
      if (!ts) return null;
      const ms = new Date(ts).getTime();
      const d = iso(ts);
      if (ms <= now || d > toISO) return null; // só anúncios AINDA por acontecer
      const bb = buyByInfo(ts, exchOf(q.symbol));
      return { ticker: q.symbol, date: d, name: q.shortName || q.longName || q.symbol, sector: UNIVERSE[q.symbol] || null, past: false, when: bb.when, buyBy: bb.buyBy, entryISO: bb.entryISO };
    }).filter(Boolean);
    let feed = [];
    try {
      feed = cleanFeed(await earningsFeed(fromISO, shiftDays(toISO, 1)))
        .filter((x) => x.ts && new Date(x.ts).getTime() > now && x.date <= toISO)
        .map((x) => { const bb = buyByInfo(x.ts, exchOf(x.ticker)); return { ticker: x.ticker, date: x.date, name: x.name, sector: null, past: false, when: bb.when, buyBy: bb.buyBy, entryISO: bb.entryISO }; });
    } catch { /* feed indisponível */ }
    const map = new Map();
    for (const it of [...uni, ...feed]) if (!map.has(it.ticker)) map.set(it.ticker, it);
    // ordenar pela ENTRADA (dia de compra), não pela data do anúncio
    upcoming = [...map.values()].sort((a, b) => (a.entryISO || a.date).localeCompare(b.entryISO || b.date) || a.date.localeCompare(b.date));
    // recomendação NÃO é calculada aqui (load rápido) — vem da análise completa via "analisar próximos".
  } catch { /* sem próximos */ }

  // ---- passados (PEAD): resultados dos ÚLTIMOS 7 DIAS, com drift PARCIAL (em curso) ----
  let past = [];
  try {
    const past7 = shiftDays(fromISO, -7);
    // universo: quem reportou nos últimos 7 dias (earningsTimestamp = último, se próximo não agendado)
    const uniPast = quotes.map((q) => {
      const ts = q.earningsTimestamp; if (!ts) return null;
      const d = iso(ts); if (d < past7 || d >= fromISO) return null;
      return { ticker: q.symbol, name: q.shortName || q.longName || q.symbol, date: d };
    }).filter(Boolean);
    let feedPast = [];
    try { feedPast = cleanFeed(await earningsFeed(past7, fromISO)).filter((x) => x.date < fromISO); } catch {}
    const pmap = new Map();
    for (const c of [...uniPast, ...feedPast]) if (!pmap.has(c.ticker)) pmap.set(c.ticker, c);
    const cands = [...pmap.values()].slice(0, 40);
    const verified = await pool(cands, 5, (c) => verifyPast(c).catch(() => null));
    past = verified.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)); // frontend reordena
  } catch { /* sem passados */ }

  // passados primeiro (mais recente → mais antigo), depois próximos (crescente); o frontend separa.
  return [...past, ...upcoming.sort((a, b) => a.date.localeCompare(b.date))];
}

// exports cacheados: quote 2 min, calendário 5 min (dedupe + poupa chamadas Yahoo)
export const realQuote = (sym, opts = {}) => cached("q:" + String(sym).toUpperCase() + (opts.llm ? ":llm" : ""), 120e3, () => _realQuote(sym, opts));
export const realCalendar = async (fromISO, toISO) => {
  const key = `cal:${fromISO}:${toISO}`;
  const v = await cached(key, 300e3, () => _realCalendar(fromISO, toISO));
  if (!Array.isArray(v) || v.length === 0) _cache.delete(key); // não cachear vazio (falha transitória → repete)
  return v;
};

// Extração híbrida de um documento (imagem/PDF) via visão do Claude.
// Devolve linhas de rascunho para o admin CONFIRMAR/CORRIGIR antes de publicar. O doc bruto NUNCA é guardado/publicado.
export async function extractDoc(dataUrl, mime) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { records: [], note: "Sem ANTHROPIC_API_KEY no servidor — preenche os dados à mão." };
  const b64 = String(dataUrl || "").replace(/^data:[^,]+,/, "");
  if (!b64) return { records: [], note: "Documento vazio." };
  const isPdf = /pdf/i.test(mime || "");
  const source = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: (mime || "image/png"), data: b64 } };
  const instr = `Extrai deste documento (extrato/visão geral de corretora ou resultados de ações): (1) linhas de trades/reações; (2) se for a visão geral da conta, o SALDO DA CONTA e o TOTAL L/P.
Responde SÓ com JSON (sem markdown):
{"records":[{"type":"trade"|"reaction","ticker":"XXX","name":"","date":"YYYY-MM-DD","buyPrice":<num|null>,"sellPrice":<num|null>,"pnl":<num €|null>,"pct":<num %|null>}],"account":{"saldo":<num €|null>,"totalPL":<num €|null>}}
Regras: "trade" = compra+venda reais (preenche buyPrice/sellPrice/pnl/pct se visíveis). "reaction" = só reação % (preenche pct). "account.saldo" = "Saldo da conta"; "account.totalPL" = "Total L/P" (mantém sinal). Usa ponto decimal (2776.88). Não inventes; null o que não vês. Datas ISO.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: LLM_MODEL, max_tokens: 1500, messages: [{ role: "user", content: [source, { type: "text", text: instr }] }] }),
    });
    if (!res.ok) return { records: [], note: "Extração falhou (" + res.status + "). Preenche à mão." };
    const j = await res.json();
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e < 0) return { records: [], note: "Sem dados legíveis. Preenche à mão." };
    const o = JSON.parse(text.slice(s, e + 1));
    const records = (Array.isArray(o.records) ? o.records : []).map((r) => ({
      type: r.type === "reaction" ? "reaction" : "trade",
      ticker: String(r.ticker || "").toUpperCase().trim(),
      name: String(r.name || "").trim(),
      date: String(r.date || "").trim(),
      buyPrice: r.buyPrice != null ? Number(r.buyPrice) : null,
      sellPrice: r.sellPrice != null ? Number(r.sellPrice) : null,
      pnl: r.pnl != null ? Number(r.pnl) : null,
      pct: r.pct != null ? Number(r.pct) : null,
    })).filter((r) => r.ticker);
    const account = o.account && typeof o.account === "object"
      ? { saldo: o.account.saldo != null ? Number(o.account.saldo) : null, totalPL: o.account.totalPL != null ? Number(o.account.totalPL) : null }
      : null;
    return { records, account, note: (records.length || (account && (account.saldo != null || account.totalPL != null))) ? "" : "Nada detetado. Preenche à mão." };
  } catch (e) { return { records: [], note: "Erro: " + String(e.message || e) }; }
}

// barra de cotações (ticker tape): preço + variação % + nome curto, em lote. Cache 60s.
async function _realTape(symbolsCsv) {
  const syms = String(symbolsCsv || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!syms.length) return [];
  try {
    const qs = await yf.quote(syms, undefined, NV);
    const arr = Array.isArray(qs) ? qs : [qs];
    const bySym = new Map(arr.filter((q) => q && q.symbol).map((q) => [q.symbol.toUpperCase(), q]));
    return syms.map((s) => {
      const q = bySym.get(s.toUpperCase());
      if (!q) return null;
      return {
        symbol: s, name: q.shortName || q.longName || s,
        price: numOf(q.regularMarketPrice), change: q.regularMarketChangePercent != null ? r2(q.regularMarketChangePercent) : null,
        currency: q.currency || "",
      };
    }).filter(Boolean);
  } catch { return []; }
}
export const realTape = (csv) => cached("tape:" + String(csv || ""), 60e3, () => _realTape(csv));

// preços atuais em lote (leve) — para o contador de posições
export async function realPrices(symbolsCsv) {
  const syms = String(symbolsCsv || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!syms.length) return {};
  const out = {};
  try {
    const qs = await yf.quote(syms, undefined, NV);
    for (const q of (Array.isArray(qs) ? qs : [qs])) if (q && q.symbol) out[q.symbol] = q.regularMarketPrice ?? null;
  } catch {}
  return out;
}

export async function realResearch(sym, type) {
  sym = String(sym).toUpperCase();
  try {
    const qs = await yf.quoteSummary(sym, { modules: ["price", "summaryDetail", "financialData", "assetProfile", "earnings", "calendarEvents", "defaultKeyStatistics"] }, NV);
    const fd = qs.financialData || {}, sd = qs.summaryDetail || {}, ap = qs.assetProfile || {};
    const name = qs.price?.longName || sym, price = numOf(qs.price?.regularMarketPrice);
    const pct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
    const n1 = (x) => (x == null ? "—" : x.toFixed(1));
    const money = (x) => (x == null ? "—" : Math.abs(x) >= 1e9 ? "$" + (x / 1e9).toFixed(1) + "B" : Math.abs(x) >= 1e6 ? "$" + (x / 1e6).toFixed(0) + "M" : "$" + x);

    if (type === "financial") {
      return { text: `${name} — Análise financeira (dados Yahoo):
• Crescimento: receita ${pct(numOf(fd.revenueGrowth))} · lucros ${pct(numOf(fd.earningsGrowth))}
• Margens: bruta ${pct(numOf(fd.grossMargins))} · operacional ${pct(numOf(fd.operatingMargins))} · líquida ${pct(numOf(fd.profitMargins))}
• Free cash flow: ${money(numOf(fd.freeCashflow))} · ROE ${pct(numOf(fd.returnOnEquity))}
• Dívida/capital: ${n1(numOf(fd.debtToEquity))} · caixa: ${money(numOf(fd.totalCash))}
• Valuation: P/E ${n1(numOf(sd.trailingPE))} (fwd ${n1(numOf(sd.forwardPE))}) · P/S ${n1(numOf(sd.priceToSalesTrailing12Months))}` };
    }
    if (type === "equity") {
      const tgt = numOf(fd.targetMeanPrice), up = tgt && price ? ((tgt - price) / price * 100).toFixed(1) + "%" : "—";
      return { text: `${name} — Análise de ações (dados Yahoo):
• Recomendação analistas: ${fd.recommendationKey || "—"} (${numOf(fd.numberOfAnalystOpinions) ?? "?"} opiniões)
• Preço-alvo médio ${tgt ? "$" + tgt : "—"} · atual ${price ? "$" + price : "—"} · potencial ${up}
• Intervalo de alvos: ${numOf(fd.targetLowPrice) ? "$" + numOf(fd.targetLowPrice) : "—"} a ${numOf(fd.targetHighPrice) ? "$" + numOf(fd.targetHighPrice) : "—"}
• P/E fwd ${n1(numOf(sd.forwardPE))} · beta ${n1(numOf(sd.beta))}` };
    }
    if (type === "earnings") {
      const q = qs.earnings?.earningsChart?.quarterly || [];
      const lines = q.map((x) => `  ${x.date}: EPS ${x.actual} vs est ${x.estimate} (${x.surprisePct >= 0 ? "+" : ""}${x.surprisePct}%)`).join("\n");
      const next = qs.calendarEvents?.earnings?.earningsDate?.[0];
      return { text: `${name} — Revisão de resultados (dados Yahoo):
Surpresas de EPS recentes:
${lines || "  —"}
Próximos resultados: ${next ? iso(next) : "—"}` };
    }
    if (type === "market") {
      return { text: `${name} — Análise de mercado (dados Yahoo):
• Setor: ${ap.sector || "—"} · indústria: ${ap.industry || "—"}
• Market cap: ${money(numOf(sd.marketCap))} · dividend yield ${pct(numOf(sd.dividendYield))}
• Funcionários: ${numOf(ap.fullTimeEmployees) ?? "—"} · sede: ${[ap.city, ap.country].filter(Boolean).join(", ") || "—"}
${ap.longBusinessSummary ? "\n" + ap.longBusinessSummary.slice(0, 420) + "…" : ""}` };
    }
    return { text: `${name} — "Contratos & governo": exige fontes públicas específicas (USAspending, SAM.gov, 8-K). Não disponível a partir do Yahoo neste backend.` };
  } catch (e) {
    return { text: `Não consegui obter dados para ${sym} (${e.message}).` };
  }
}
