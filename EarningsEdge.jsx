import { useState, useMemo, useEffect, useRef } from "react";

// ---------- helpers ----------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const isoOf = (d) => d.toISOString().slice(0, 10);
function fmtDay(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}

function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 50;
}

const MOM_TABLE = [[-20, 18], [-10, 32], [-5, 46], [0, 60], [5, 78], [10, 72], [18, 52], [30, 36]];
const IM_TABLE = [[0, 92], [3, 76], [6, 58], [9, 44], [12, 32], [18, 18], [25, 9]];
const RSI_TABLE = [[15, 55], [30, 70], [45, 75], [55, 72], [65, 60], [72, 45], [82, 30]];
const ANALYST_SUB = { bullish: 80, positive: 80, neutral: 50, mixed: 50, bearish: 22, negative: 22 };
const TREND_SUB = { bullish: 80, up: 80, neutral: 50, sideways: 50, bearish: 25, down: 25 };
const REV_SUB = { up: 80, rising: 80, flat: 50, neutral: 50, down: 25, falling: 25 };
const WHISPER_SUB = { below: 75, low: 75, inline: 50, neutral: 50, above: 28, high: 28 };
const BEATRAISE_SUB = { strong: 80, mixed: 50, weak: 25 };
const SKEW_SUB = { bullish: 78, positive: 78, neutral: 50, bearish: 25, negative: 25 };
const QUALITY_SUB = { high: 75, medium: 50, low: 30 };
const NEWS_SUB = { positive: 78, neutral: 50, negative: 25 };
const PEER_SUB = { positive: 72, neutral: 50, negative: 30 };
// pctStrategyWin entra só no score combinado (não duplicado no setup).
const DEFAULT_WEIGHTS = {
  whisper: 12, beatRaise: 10, estRevision: 10, optionsSkew: 8, newsSentiment: 8,
  beatRate: 8, earningsQuality: 7, peerReaction: 6, trend: 8, momentum: 7, impliedRisk: 9,
  analyst: 6, rsi: 5, userPositivo: 6,
};
const STRATEGY_HIST_WEIGHT = 0.55;
const STRATEGY_SETUP_WEIGHT = 0.45;

const THEME_META = {
  ai:         { label: "IA & Software",            color: "#7C9CF0" },
  semis:      { label: "Semicondutores",           color: "#2FB6A0" },
  defense:    { label: "Defesa & Espaço",          color: "#C77B4A" },
  nuclear:    { label: "Nuclear & Energia",        color: "#A6C04A" },
  robotics:   { label: "Robótica & Drones",        color: "#A98AE6" },
  crypto:     { label: "Cripto & Fintech",         color: "#E0B341" },
  health:     { label: "Saúde & Biotech",          color: "#E0708F" },
  minerals:   { label: "Minerais & Terras raras",  color: "#B58A5E" },
  cyber:      { label: "Cibersegurança",           color: "#4FB0D4" },
  cloud:      { label: "Cloud & SaaS",             color: "#6E7BC0" },
  datacenter: { label: "Data centers & Servidores", color: "#5C8FB8" },
  cooling:    { label: "Arrefecimento & Térmica",  color: "#45C0C9" },
  networking: { label: "Redes & Networking",       color: "#9E7AD0" },
  memory:     { label: "Memória (DRAM/Flash)",     color: "#D2A05A" },
  optics:     { label: "Ótica & Fotónica",         color: "#5AB89A" },
  powergrid:  { label: "Rede elétrica & Utilities", color: "#E08A4A" },
  storage:    { label: "Armazenamento & Storage",  color: "#8FA0D0" },
  ev:         { label: "Veículos elétricos & Mobilidade", color: "#4FC987" },
  solar:      { label: "Energia renovável & Solar", color: "#F0A93A" },
  finance:    { label: "Banca & Financeiras",      color: "#8FA8B8" },
  industrial: { label: "Industrial & Reshoring",   color: "#9DAE5E" },
  consumer:   { label: "Consumo & Retalho",        color: "#D98AC0" },
  gaming:     { label: "Gaming & Entretenimento",  color: "#C77FD8" },
};
const themeOf = (s) => (s && THEME_META[String(s).toLowerCase()]) || null;

// bolsa a partir do sufixo do ticker (ex. GALP.LS → Lisboa; sem sufixo → EUA)
const EXCH_LABEL = { LS: "Lisboa", L: "Londres", PA: "Paris", AS: "Amsterdão", DE: "Xetra", MI: "Milão", MC: "Madrid", TO: "Toronto", SA: "Brasil", T: "Tóquio", HK: "Hong Kong", NS: "Índia", KS: "Coreia", AX: "Austrália" };
const exchLabel = (t) => { const m = String(t || "").match(/\.([A-Z]+)$/); return (m && EXCH_LABEL[m[1]]) || "EUA"; };

const FACTOR_META = {
  pctStrategyWin: { label: "Taxa de sucesso PEAD (drift ~1 mês)", unit: "%", hint: "% de trimestres com drift positivo T+1→T+20" },
  pctUp:          { label: "Subida só no dia da reação (T→T+1)", unit: "%", hint: "fecho do dia dos resultados → fecho seguinte" },
  whisper:        { label: "Whisper vs consenso",               unit: "",  hint: "fasquia real abaixo = mais fácil bater" },
  beatRaise:      { label: "Histórico beat-and-raise",          unit: "",  hint: "costuma bater e subir guidance" },
  estRevision:    { label: "Revisões de estimativas (EPS)",      unit: "",  hint: "analistas a rever em alta/baixa" },
  optionsSkew:    { label: "Posicionamento em opções (skew)",    unit: "",  hint: "para onde o mercado se inclina" },
  newsSentiment:  { label: "Sentimento das notícias",           unit: "",  hint: "tom das notícias pré-resultados" },
  peerReaction:   { label: "Reação do setor / peers",           unit: "",  hint: "como reagiram concorrentes recentes" },
  beatRate:       { label: "Taxa de superação de estimativas",   unit: "%", hint: "quantas vezes bateu as estimativas" },
  earningsQuality:{ label: "Qualidade do resultado",            unit: "",  hint: "receita/cash-flow vale mais que cortes" },
  analyst:        { label: "Sentimento dos analistas",            unit: "",  hint: "consenso atual" },
  trend:          { label: "Tendência (médias 50/200)",          unit: "",  hint: "acima das médias = alta" },
  rsi:            { label: "RSI (14)",                           unit: "",  hint: "sobrecompra penaliza" },
  momentum:       { label: "Variação recente (1 mês)",            unit: "%", hint: "subida exagerada penaliza" },
  impliedRisk:    { label: "Risco do movimento implícito",        unit: "%", hint: "movimento implícito alto = mais risco" },
  userPositivo:   { label: "O teu indicador % positivo",          unit: "%", hint: "introduzido por ti" },
};

function computeScore(d, weights) {
  const subs = {};
  if (d.pctStrategyWin != null) subs.pctStrategyWin = clamp(d.pctStrategyWin, 0, 100);
  if (d.pctUp != null) subs.pctUp = clamp(d.pctUp, 0, 100);
  if (d.whisper) subs.whisper = WHISPER_SUB[String(d.whisper).toLowerCase()] ?? 50;
  if (d.beatRaise) subs.beatRaise = BEATRAISE_SUB[String(d.beatRaise).toLowerCase()] ?? 50;
  if (d.estRevision) subs.estRevision = REV_SUB[String(d.estRevision).toLowerCase()] ?? 50;
  if (d.optionsSkew) subs.optionsSkew = SKEW_SUB[String(d.optionsSkew).toLowerCase()] ?? 50;
  if (d.newsSentiment) subs.newsSentiment = NEWS_SUB[String(d.newsSentiment).toLowerCase()] ?? 50;
  if (d.peerReaction) subs.peerReaction = PEER_SUB[String(d.peerReaction).toLowerCase()] ?? 50;
  if (d.beatRate != null) subs.beatRate = clamp(d.beatRate, 0, 100);
  if (d.earningsQuality) subs.earningsQuality = QUALITY_SUB[String(d.earningsQuality).toLowerCase()] ?? 50;
  if (d.analyst) subs.analyst = ANALYST_SUB[String(d.analyst).toLowerCase()] ?? 50;
  if (d.trend) subs.trend = TREND_SUB[String(d.trend).toLowerCase()] ?? 50;
  if (d.rsi != null) subs.rsi = interp(RSI_TABLE, d.rsi);
  if (d.momentum != null) subs.momentum = interp(MOM_TABLE, d.momentum);
  if (d.impliedMove != null) subs.impliedRisk = interp(IM_TABLE, d.impliedMove);
  if (d.userPositivo != null && d.userPositivo !== "") subs.userPositivo = clamp(Number(d.userPositivo), 0, 100);

  let wsum = 0, acc = 0;
  const factors = [];
  for (const key of Object.keys(FACTOR_META)) {
    if (subs[key] == null) continue;
    // pctStrategyWin/pctUp entram via histFactors em computeStrategyScore — evitar duplicar.
    if (key === "pctStrategyWin" || key === "pctUp") continue;
    const w = weights[key] ?? 0;
    wsum += w;
    acc += subs[key] * w;
    factors.push({ key, sub: subs[key], weight: w, raw: rawFor(key, d) });
  }
  const score = wsum > 0 ? acc / wsum : null;
  return { score, factors };
}

function rawFor(key, d) {
  switch (key) {
    case "pctStrategyWin": return d.pctStrategyWin != null ? `${Math.round(d.pctStrategyWin)}%` : "—";
    case "pctUp": return d.pctUp != null ? `${Math.round(d.pctUp)}%` : "—";
    case "whisper": return d.whisper ? ptVal(d.whisper) : "—";
    case "beatRaise": return d.beatRaise ? ptVal(d.beatRaise) : "—";
    case "optionsSkew": return d.optionsSkew ? ptVal(d.optionsSkew) : "—";
    case "newsSentiment": return d.newsSentiment ? ptVal(d.newsSentiment) : "—";
    case "peerReaction": return d.peerReaction ? ptVal(d.peerReaction) : "—";
    case "earningsQuality": return d.earningsQuality ? ptVal(d.earningsQuality) : "—";
    case "trend": return d.trend ? ptTerm(d.trend) : "—";
    case "rsi": return d.rsi != null ? `${Math.round(d.rsi)}` : "—";
    case "estRevision": return d.estRevision ? ptTerm(d.estRevision) : "—";
    case "beatRate": return d.beatRate != null ? `${Math.round(d.beatRate)}%` : "—";
    case "analyst": return d.analyst ? ptTerm(d.analyst) : "—";
    case "momentum": return d.momentum != null ? `${d.momentum > 0 ? "+" : ""}${d.momentum.toFixed(1)}%` : "—";
    case "impliedRisk": return d.impliedMove != null ? `±${d.impliedMove.toFixed(1)}%` : "—";
    case "userPositivo": return d.userPositivo ? `${d.userPositivo}%` : "—";
    default: return "—";
  }
}
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const PT_TERM = {
  bullish: "Alta", positive: "Alta", neutral: "Neutro", mixed: "Misto", bearish: "Baixa", negative: "Baixa",
  up: "Em alta", rising: "Em alta", flat: "Estável", down: "Em baixa", falling: "Em baixa", sideways: "Lateral",
};
const ptTerm = (s) => PT_TERM[String(s).toLowerCase()] || cap(s);
const PT_VAL = {
  below: "Abaixo", inline: "Em linha", above: "Acima",
  strong: "Forte", mixed: "Misto", weak: "Fraco",
  high: "Alta", medium: "Média", low: "Baixa",
  positive: "Positivo", negative: "Negativo",
  bullish: "Alta", neutral: "Neutro", bearish: "Baixa",
};
const ptVal = (s) => PT_VAL[String(s).toLowerCase()] || cap(s);

// Limiar único de decisão: COMPRAR se valor esperado > +0.5%/trade. Usado em todo o lado.
const BUY_EV = 0.5;
// tabela de decisão: teto de tickers analisados + concorrência (evita centenas de chamadas Yahoo sequenciais)
const TABLE_CAP = 40;
const TABLE_CONC = 4;
const TABLE_LLM_CAP = 15; // P(beat) do LLM só nas N mais próximas (custo controlado)

// Veredicto único — o valor esperado (EV) é a fonte de verdade.
// COMPRAR se EV > +0.5%, EVITAR se EV < -0.5%, NEUTRO na zona sem edge.
function verdictOf(ev) {
  if (ev == null) return { label: "SEM DADOS", tone: "muted" };
  if (ev > BUY_EV) return { label: "COMPRAR", tone: "buy" };
  if (ev < -BUY_EV) return { label: "EVITAR", tone: "avoid" };
  return { label: "NEUTRO", tone: "neutral" };
}

// Setup = fatores qualitativos pré-resultados (sem histórico T-1→T+1).
function computeSetupScore(d, weights) {
  return computeScore(d, weights);
}

// Score final da estratégia: comprar fecho T-1, vender fecho T+1 (resultados after-market).
function computeStrategyScore(d, weights) {
  const { score: setupScore, factors } = computeSetupScore(d, weights);
  const hist = d.pctStrategyWin ?? d.pctUp;
  const avgRet = d.avgStrategyReturn ?? d.avgDayAfter;

  if (hist == null && setupScore == null) {
    return { score: null, setupScore, hist: null, avgRet: null, factors };
  }

  const h = hist ?? 50;
  const s = setupScore ?? 50;
  let combined = h * STRATEGY_HIST_WEIGHT + s * STRATEGY_SETUP_WEIGHT;

  // Guardrails: histórico fraco não pode dar COMPRAR; histórico forte reforça.
  if (hist != null) {
    if (hist <= 40) combined = Math.min(combined, 48);
    else if (hist <= 48) combined = Math.min(combined, 54);
    else if (hist >= 62 && s >= 52) combined = Math.max(combined, 60);
  }

  const histFactors = [];
  if (d.pctStrategyWin != null) {
    histFactors.push({ key: "pctStrategyWin", sub: clamp(d.pctStrategyWin, 0, 100), weight: 0, raw: rawFor("pctStrategyWin", d) });
  }
  if (d.pctUp != null) {
    histFactors.push({ key: "pctUp", sub: clamp(d.pctUp, 0, 100), weight: 0, raw: rawFor("pctUp", d) });
  }

  return { score: combined, setupScore, hist, avgRet, factors: [...histFactors, ...factors] };
}

function preEarningsRead(d, strategy) {
  const { score, hist, avgRet, setupScore } = strategy;
  if (score == null && hist == null) return null;
  return { hist, setupScore, avgRet, move: d.impliedMove ?? d.avgHist };
}
const toneColor = { avoid: "#C8553D", neutral: "#E0A33E", buy: "#2FA37A", muted: "#8FA6B5" };

function subColor(v) {
  if (v == null) return "#8FA6B5";
  if (v < 45) return "#C8553D";
  if (v < 60) return "#E0A33E";
  return "#2FA37A";
}

// agrupa por mês da ENTRADA (entryISO) quando existe, senão pela data do anúncio
function groupByMonth(items) {
  const gkey = (it) => it.entryISO || it.date;
  const sorted = [...items].sort((a, b) => (gkey(a) < gkey(b) ? -1 : 1));
  const g = {};
  for (const it of sorted) {
    const d = new Date(gkey(it) + "T00:00:00");
    if (isNaN(d)) continue;
    const key = d.getFullYear() + "-" + String(d.getMonth()).padStart(2, "0");
    if (!g[key]) g[key] = { label: `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()} · por entrada`, items: [] };
    g[key].items.push(it);
  }
  return Object.keys(g).sort().map((k) => g[k]);
}

// ---------- API ----------
function toItem(d, id, posVal, estimated) {
  return {
    id,
    ticker: d.ticker,
    name: d.name || "",
    price: d.price ?? null,
    earningsDate: d.earningsDate || "",
    impliedMove: num(d.impliedMove),
    straddleMove: num(d.straddleMove),
    iv1: num(d.iv1),
    iv0: num(d.iv0),
    daysToExpiry: num(d.daysToExpiry),
    impliedSource: d.impliedSource || "",
    avgHist: num(d.avgHist),
    pctUp: num(d.pctUp),
    pctStrategyWin: num(d.pctStrategyWin),
    avgStrategyReturn: num(d.avgStrategyReturn),
    avgDayAfter: num(d.avgDayAfter),
    beatRate: num(d.beatRate),
    history: Array.isArray(d.history) ? d.history : null,
    earningsMarks: Array.isArray(d.earningsMarks) ? d.earningsMarks : null,
    gaps: Array.isArray(d.gaps) ? d.gaps : null,
    gapDates: Array.isArray(d.gapDates) ? d.gapDates : null,
    gapN: num(d.gapN),
    gapPctUp: num(d.gapPctUp),
    gapAvg: num(d.gapAvg),
    reactions: Array.isArray(d.reactions) ? d.reactions : null,
    reactionDates: Array.isArray(d.reactionDates) ? d.reactionDates : null,
    reactionWhen: Array.isArray(d.reactionWhen) ? d.reactionWhen : null,
    reactionIntraday: Array.isArray(d.reactionIntraday) ? d.reactionIntraday : null,
    reactionN: num(d.reactionN),
    reactionStd: num(d.reactionStd),
    reactionLow: num(d.reactionLow),
    reactionHigh: num(d.reactionHigh),
    reactionSkew: num(d.reactionSkew),
    reactionMin: num(d.reactionMin),
    reactionMax: num(d.reactionMax),
    momentum: num(d.momentum),
    analyst: d.analyst || "",
    trend: d.trend || "",
    rsi: num(d.rsi),
    estRevision: d.estRevision || "",
    whisper: d.whisper || "",
    beatRaise: d.beatRaise || "",
    optionsSkew: d.optionsSkew || "",
    earningsQuality: d.earningsQuality || "",
    newsSentiment: d.newsSentiment || "",
    peerReaction: d.peerReaction || "",
    sector: d.sector || "",
    website: d.website || "",
    lean: d.lean || null,
    llm: d.llm || null,
    news: Array.isArray(d.news) ? d.news : null,
    newsTally: d.newsTally || null,
    newsMethod: d.newsMethod || "",
    market: d.market || null,
    sectorTrend: d.sectorTrend || null,
    shortPct: num(d.shortPct),
    targetUpside: num(d.targetUpside),
    note: d.note || "",
    userPositivo: posVal,
    _estimated: estimated,
  };
}

async function fetchTicker(ticker, opts = {}) {
  // Dados REAIS via backend Yahoo Finance. opts.llm=true → também corre a análise LLM (P(beat)+raciocínio).
  const res = await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(ticker)}${opts.llm ? "&llm=1" : ""}`);
  const obj = await res.json();
  if (!res.ok || obj.error) throw new Error(obj.error || `erro ${res.status}`);
  obj._estimated = false;
  return obj;
}

async function fetchCalendar(fromISO, toISO) {
  // Datas REAIS via backend Yahoo Finance (watchlist de grandes empresas).
  const res = await fetch(`/api/yahoo/calendar?from=${fromISO}&to=${toISO}`);
  const arr = await res.json();
  if (!res.ok || arr.error) throw new Error(arr.error || `erro ${res.status}`);
  if (!Array.isArray(arr)) throw new Error("resposta inválida");
  // todos os mercados (EUA + Europa DEGIRO) + próximos na janela / passados verificados
  return arr.filter((x) => x.past || (x.date >= fromISO && x.date <= toISO));
}

const RESEARCH_META = {
  financial: { label: "Análise financeira", ask: "a concise financial analysis: revenue growth, gross/operating/net margins, profitability and cash flow, balance sheet and debt levels, and valuation (P/E, P/S, vs sector). End with 2-3 key strengths and 2-3 key risks." },
  equity:    { label: "Análise de ações",   ask: "an equity research summary: current analyst consensus rating, the average 12-month price target and implied upside/downside, a short valuation view, and a brief bull case and bear case." },
  earnings:  { label: "Revisão de resultados", ask: "a review of the most recent quarterly earnings: EPS and revenue vs estimates, guidance given, the main takeaways, and how the stock reacted. Then note 2-3 things to watch in the upcoming report." },
  market:    { label: "Análise de mercado", ask: "market and sector research: the company's sector and main competitors/peers, recent sector trends, and the current macro factors (rates, demand, regulation) affecting it." },
};

async function fetchResearch(ticker, type) {
  const res = await fetch(`/api/yahoo/research?symbol=${encodeURIComponent(ticker)}&type=${encodeURIComponent(type)}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || `erro ${res.status}`);
  return (j.text || "").trim();
}

// ---------- UI ----------
export default function EarningsEdge() {
  const [ticker, setTicker] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [weights] = useState(DEFAULT_WEIGHTS);
  const [showLegend, setShowLegend] = useState(false);
  const [openDot, setOpenDot] = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  // publica/despublica a ação no site (previsões) — só quando dentro do admin (token presente)
  const publishToSite = async (it, on) => {
    const token = localStorage.getItem("ee_admin_token");
    if (!token) return;
    try {
      const all = await (await fetch("/api/picks/all", { cache: "no-store", headers: { Authorization: "Bearer " + token } })).json();
      const cur = all[it.ticker] || {};
      all[it.ticker] = { ...cur, ticker: it.ticker, name: it.name || cur.name || it.ticker, exch: exchLabel(it.ticker), date: it.date, entryISO: it.entryISO || it.date, when: it.when, show: on };
      await fetch("/api/picks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ picks: all }) });
    } catch {}
  };
  const toggleSelect = (it) => {
    const ticker = typeof it === "string" ? it : it.ticker;
    const on = !selected.has(ticker);
    setSelected((prev) => { const n = new Set(prev); on ? n.add(ticker) : n.delete(ticker); return n; });
    if (typeof it === "object") publishToSite(it, on); // selecionar = mostrar no site; desselecionar = tirar
  };

  const [calendar, setCalendar] = useState([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calErr, setCalErr] = useState("");

  const window15d = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    return { from: isoOf(from), to: isoOf(to) };
  }, []);

  const loadCalendar = async () => {
    setCalLoading(true);
    setCalErr("");
    try {
      const arr = await fetchCalendar(window15d.from, window15d.to);
      setCalendar(arr);
      return arr;
    } catch (e) {
      setCalErr(`Não consegui carregar o calendário (${e.message}).`);
      return [];
    } finally {
      setCalLoading(false);
    }
  };

  useEffect(() => { loadCalendar(); }, []); // eslint-disable-line

  // ---- AUTO (Fast Run 1-clique): analisa próximos 7 dias → publica em Previsões (com balões) → 5 pesquisas ----
  const [autoMsg, setAutoMsg] = useState("");
  const [autoRunning, setAutoRunning] = useState(false);
  const pickFromItem = (item, cal, cur = {}) => {
    const ev = evVerdict(item).ev;
    return {
      ...cur,
      ticker: item.ticker, name: item.name || cur.name || item.ticker,
      exch: exchLabel(item.ticker), date: cal?.date || cur.date, entryISO: cal?.entryISO || cal?.date || cur.entryISO, when: cal?.when || cur.when,
      show: true,
      probUp: item.llm?.probUp ?? item.lean?.probUp ?? null,
      confidence: item.llm?.confidence ?? item.lean?.confidence ?? null,
      ev: ev != null ? Math.round(ev * 100) / 100 : null,
      impliedMove: item.impliedMove ?? null, gapAvg: item.gapAvg ?? null, gapPctUp: item.gapPctUp ?? null, gapUp: item.gapPctUp ?? null,
      momentum: item.momentum ?? null, rsi: item.rsi ?? null, analyst: item.analyst || "", beatRate: item.beatRate ?? null,
      targetUpside: item.targetUpside ?? null, price: item.price ?? null,
      history: item.history || null, earningsMarks: item.earningsMarks || null,
      sector: item.sector || cur.sector || "",
      signals: item.lean?.signals || cur.signals || null,   // sinais fundamentais (beat, revisões, valuation, qualidade)
      reactions: Array.isArray(item.reactions) ? item.reactions : (cur.reactions || null), // drifts passados (PEAD)
      reactionStd: item.reactionStd ?? null, reactionLow: item.reactionLow ?? null, reactionHigh: item.reactionHigh ?? null,
      reactionMin: item.reactionMin ?? null, reactionMax: item.reactionMax ?? null, reactionN: item.reactionN ?? null,
      shortPct: item.shortPct ?? null, buyBy: cal?.buyBy || cur.buyBy || null,
      website: item.website || cur.website || "", // p/ logo (Clearbit)
      currency: item.currency || cur.currency || "USD",
      nota: cur.nota || item.llm?.reasoning || "",
      // pesquisa aprofundada (texto das 5 análises) — só o texto, para mostrar no site
      research: (() => {
        const merged = { ...(cur.research || {}) };
        for (const [k, v] of Object.entries(item.research || {})) if (v && v.text) merged[k] = v.text;
        return Object.keys(merged).length ? merged : (cur.research || null);
      })(),
    };
  };
  const autoWeek = async (arr) => {
    const token = localStorage.getItem("ee_admin_token");
    if (!token) { setAutoMsg("Faz login primeiro."); return; }
    // mesmas próximas ações que o site mostra (Featured/Previsões usam slice(0,8))
    const seen = new Set(), up7 = [];
    for (const x of (arr || []).filter((x) => !x.past).sort((a, b) => (a.entryISO || a.date || "").localeCompare(b.entryISO || b.date || ""))) {
      if (!seen.has(x.ticker)) { seen.add(x.ticker); up7.push(x); }
      if (up7.length >= 8) break;
    }
    if (!up7.length) { setAutoMsg("Sem próximos resultados."); return; }
    setAutoRunning(true);
    setSelected(new Set(up7.map((x) => x.ticker)));
    // 1) analisar (pool de 4) — enche prob/EV/gap/gráfico
    const items = []; let i = 0;
    setAutoMsg(`a analisar 0/${up7.length}…`);
    const aworker = async () => {
      while (i < up7.length) {
        const cal = up7[i++];
        try {
          const dd = await fetchTicker(cal.ticker, { llm: true });
          const it = toItem(dd, Date.now() + Math.random(), null, false); it._cal = cal;
          items.push(it);
          setResults((r) => [it, ...r.filter((x) => x.ticker !== it.ticker)]);
        } catch (_) {}
        setAutoMsg(`a analisar ${items.length}/${up7.length}…`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, aworker));
    // 2) publicar em Previsões desta semana (refresh: só os desta semana ficam show)
    try {
      const all = await (await fetch("/api/picks/all", { cache: "no-store", headers: { Authorization: "Bearer " + token } })).json();
      for (const k in all) all[k] = { ...all[k], show: false };
      for (const it of items) all[it.ticker] = pickFromItem(it, it._cal, all[it.ticker] || {});
      await fetch("/api/picks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ picks: all }) });
      setAutoMsg(`publicado ${items.length} em Previsões · a correr pesquisa aprofundada…`);
    } catch (_) { setAutoMsg("falha ao publicar picks."); }
    // 3) pesquisa aprofundada: 5 análises por ação (pool de 4)
    const types = ["financial", "equity", "earnings", "market"];
    const jobs = []; for (const it of items) for (const ty of types) jobs.push({ it, ty });
    let j = 0;
    const rworker = async () => { while (j < jobs.length) { const { it, ty } = jobs[j++]; try { await runResearch(it, ty); } catch (_) {} } };
    await Promise.all(Array.from({ length: 4 }, rworker));
    setAutoMsg(`✓ ${items.length} ações: analisadas, publicadas em Previsões e pesquisadas. (Histórico mostra os últimos 7 dias automaticamente.)`);
    setAutoRunning(false);
  };
  const atualizarTudo = async () => { const arr = await loadCalendar(); await autoWeek(arr); };
  // seleção rápida por janela de 7 dias
  const selectNext7 = () => {
    const in7 = isoOf(new Date(Date.now() + 7 * 864e5)), today = isoOf(new Date());
    const s = new Set(calendar.filter((x) => !x.past && (x.entryISO || x.date) >= today && (x.entryISO || x.date) <= in7).map((x) => x.ticker));
    setSelected(s);
  };
  const selectLast7 = () => {
    const ago7 = isoOf(new Date(Date.now() - 7 * 864e5));
    const s = new Set(calendar.filter((x) => x.past && x.date >= ago7).map((x) => x.ticker));
    setSelected(s);
  };

  // passados: bloco próprio, mais recente primeiro. próximos: agrupados por mês.
  const pastRows = useMemo(
    () => calendar.filter((x) => x.past).sort((a, b) => (a.date < b.date ? -1 : 1)), // antiga → recente
    [calendar]
  );
  const calGroups = useMemo(() => groupByMonth(calendar.filter((x) => !x.past)), [calendar]);

  // Ranking pelo valor esperado (EV) — mesma fonte de verdade que o veredicto.
  const scored = useMemo(
    () => results.map((it) => ({ it, ...evVerdict(it) })),
    [results]
  );
  const rankMap = useMemo(() => {
    const order = [...scored].sort((a, b) => (b.ev ?? -99) - (a.ev ?? -99));
    const m = {};
    order.forEach((s, i) => { if (s.ev != null) m[s.it.id] = i + 1; });
    return m;
  }, [scored]);
  const rankedStrip = useMemo(
    () => [...scored].filter((s) => s.ev != null).sort((a, b) => b.ev - a.ev),
    [scored]
  );

  const analyze = async (sym) => {
    const t = (sym || ticker).trim().toUpperCase();
    if (!t) return;
    const pendId = Date.now() + Math.random();
    setErr("");
    setResults((r) => [{ id: pendId, ticker: t, pending: true }, ...r]);
    setTicker("");
    setLoading(true);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}
    try {
      const d = await fetchTicker(t, { llm: true });
      const item = toItem(d, pendId, null, d._estimated);
      setResults((r) => r.map((x) => (x.id === pendId ? item : x)));
    } catch (e) {
      setResults((r) => r.map((x) => (x.id === pendId ? { id: pendId, ticker: t, errored: true, errMsg: e.message } : x)));
    } finally {
      setLoading(false);
    }
  };

  const remove = (id) => setResults((r) => r.filter((x) => x.id !== id));
  const retry = (item) => { remove(item.id); analyze(item.ticker); };
  const refreshLive = async (item) => {
    setResults((r) => r.map((x) => (x.id === item.id ? { ...x, _refreshing: true, _refreshErr: "" } : x)));
    try {
      const d = await fetchTicker(item.ticker, { llm: true });
      const upd = toItem(d, item.id, item.userPositivo, false);
      setResults((r) => r.map((x) => (x.id === item.id ? upd : x)));
    } catch (e) {
      setResults((r) => r.map((x) => (x.id === item.id ? { ...x, _refreshing: false, _refreshErr: e.message } : x)));
    }
  };
  const runResearch = async (item, type) => {
    setResults((r) => r.map((x) => (x.id === item.id
      ? { ...x, research: { ...(x.research || {}), [type]: { loading: true } } } : x)));
    try {
      const text = await fetchResearch(item.ticker, type);
      setResults((r) => r.map((x) => (x.id === item.id
        ? { ...x, research: { ...(x.research || {}), [type]: { text } } } : x)));
      // clique individual numa pesquisa → busca dados frescos e atualiza os balões do gráfico no site.
      // durante o batch (analyzeSelectedDeep) não publica aqui — o batch já publica (evita corrida de escrita).
      if (!batchRunning) {
        const token = localStorage.getItem("ee_admin_token");
        if (token) {
          const cal = calendar.find((c) => c.ticker === item.ticker && !c.past);
          const itemWithResearch = { ...item, research: { ...(item.research || {}), [type]: { text } } };
          const all = await (await fetch("/api/picks/all", { cache: "no-store", headers: { Authorization: "Bearer " + token } })).json();
          all[item.ticker] = pickFromItem(itemWithResearch, cal, all[item.ticker] || {});
          await fetch("/api/picks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ picks: all }) });
        }
      }
    } catch (e) {
      setResults((r) => r.map((x) => (x.id === item.id
        ? { ...x, research: { ...(x.research || {}), [type]: { err: e.message } } } : x)));
    }
  };
  const analyzedTickers = useMemo(
    () => new Set(results.filter((r) => !r.pending && !r.errored).map((r) => r.ticker)),
    [results]
  );

  const analyzeSelected = async () => {
    const done = new Set(results.filter((r) => !r.errored).map((r) => r.ticker));
    const tickers = [...selected].filter((t) => !done.has(t));
    if (tickers.length === 0) { setSelected(new Set()); return; }
    setBatchRunning(true);
    const pend = tickers.map((t) => ({ id: Date.now() + Math.random(), ticker: t, pending: true }));
    setResults((r) => [...pend, ...r]);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}
    for (const p of pend) {
      try {
        const d = await fetchTicker(p.ticker, { llm: true });
        const item = toItem(d, p.id, null, d._estimated);
        setResults((r) => r.map((x) => (x.id === p.id ? item : x)));
      } catch (e) {
        setResults((r) => r.map((x) => (x.id === p.id ? { id: p.id, ticker: p.ticker, errored: true, errMsg: e.message } : x)));
      }
    }
    setSelected(new Set());
    setBatchRunning(false);
  };

  // Analisar selecionadas + correr as 5 pesquisas aprofundadas em cada uma
  const analyzeSelectedDeep = async () => {
    const tickers = [...selected];
    if (!tickers.length) return;
    setBatchRunning(true);
    const pend = tickers.map((t) => ({ id: Date.now() + Math.random(), ticker: t, pending: true }));
    setResults((r) => [...pend, ...r]);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}
    const items = [];
    for (const p of pend) {
      try {
        const d = await fetchTicker(p.ticker, { llm: true });
        const item = toItem(d, p.id, null, d._estimated);
        setResults((r) => r.map((x) => (x.id === p.id ? item : x)));
        items.push(item);
      } catch (e) {
        setResults((r) => r.map((x) => (x.id === p.id ? { id: p.id, ticker: p.ticker, errored: true, errMsg: e.message } : x)));
      }
    }
    // publicar métricas completas nos cards (Previsões) — atualiza todos os campos do balão
    try {
      const token = localStorage.getItem("ee_admin_token");
      if (token && items.length) {
        const all = await (await fetch("/api/picks/all", { cache: "no-store", headers: { Authorization: "Bearer " + token } })).json();
        for (const it of items) { const cal = calendar.find((c) => c.ticker === it.ticker && !c.past); all[it.ticker] = pickFromItem(it, cal, all[it.ticker] || {}); }
        await fetch("/api/picks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ picks: all }) });
      }
    } catch (_) {}
    // pesquisa aprofundada: 5 análises por ação (pool de 4) — acumula o texto p/ persistir
    const types = ["financial", "equity", "earnings", "market"];
    const acc = {}; // ticker -> { type: {text} }
    const jobs = []; for (const it of items) for (const ty of types) jobs.push({ it, ty });
    let j = 0;
    const worker = async () => {
      while (j < jobs.length) {
        const { it, ty } = jobs[j++];
        setResults((r) => r.map((x) => (x.id === it.id ? { ...x, research: { ...(x.research || {}), [ty]: { loading: true } } } : x)));
        try {
          const text = await fetchResearch(it.ticker, ty);
          (acc[it.ticker] = acc[it.ticker] || {})[ty] = { text };
          setResults((r) => r.map((x) => (x.id === it.id ? { ...x, research: { ...(x.research || {}), [ty]: { text } } } : x)));
        } catch (_) {}
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    // re-publicar com a pesquisa aprofundada incluída (para aparecer no card)
    try {
      const token = localStorage.getItem("ee_admin_token");
      if (token && items.length) {
        const all = await (await fetch("/api/picks/all", { cache: "no-store", headers: { Authorization: "Bearer " + token } })).json();
        for (const it of items) { const cal = calendar.find((c) => c.ticker === it.ticker && !c.past); all[it.ticker] = pickFromItem({ ...it, research: acc[it.ticker] || {} }, cal, all[it.ticker] || {}); }
        await fetch("/api/picks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ picks: all }) });
      }
    } catch (_) {}
    setSelected(new Set());
    setBatchRunning(false);
  };

  // tabela de decisão: analisa os PRÓXIMOS resultados (não os passados), com limite e concorrência
  const [tableRows, setTableRows] = useState([]);
  const [tableRunning, setTableRunning] = useState(false);
  // candidatos = próximos únicos, ordenados por data, limitados (evita centenas de chamadas Yahoo)
  const tableTickers = useMemo(() => {
    const seen = new Set(), out = [];
    for (const c of [...calendar].filter((x) => !x.past).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))) {
      if (seen.has(c.ticker)) continue;
      seen.add(c.ticker);
      out.push({ ticker: c.ticker, date: c.date });
      if (out.length >= TABLE_CAP) break;
    }
    return out;
  }, [calendar]);
  // recomendação por ticker vinda da análise COMPLETA da tabela de decisão (fetchTicker + evVerdict)
  const tableVerdict = useMemo(() => {
    const m = {};
    for (const r of tableRows) if (!r.err && r.ev != null) m[r.ticker] = r.buy;
    return m;
  }, [tableRows]);
  const runTable = async () => {
    const cands = tableTickers;
    if (!cands.length) return;
    setTableRunning(true);
    setTableRows([]);
    const rows = [];
    const flush = () => setTableRows([...rows].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")));
    // pool de concorrência: TABLE_CONC em paralelo em vez de um-a-um
    let idx = 0;
    const worker = async () => {
      while (idx < cands.length) {
        const myIdx = idx++;
        const { ticker: t, date } = cands[myIdx];
        try {
          const d = await fetchTicker(t, { llm: myIdx < TABLE_LLM_CAP }); // P(beat) só nas mais próximas
          const item = toItem(d, t, null, false);
          rows.push({ ticker: t, date: date || "", ...evVerdict(item), gapPctUp: item.gapPctUp, gapAvg: item.gapAvg });
        } catch (_) {
          rows.push({ ticker: t, date: date || "", ev: null, conf: 0, buy: false, probBeat: null, err: true });
        }
        flush();
      }
    };
    await Promise.all(Array.from({ length: TABLE_CONC }, worker));
    setTableRunning(false);
  };

  return (
    <div className="ee-root">
      <style>{CSS}</style>

      <header className="ee-head">
        <div className="ee-eyebrow">Resultados trimestrais · grandes empresas dos EUA</div>
        <h1 className="ee-title">Earnings<span>Edge</span></h1>
        <p className="ee-sub">Estratégia: comprar ANTES do anúncio (após fecho → fecho do próprio dia; pré-abertura → fecho da véspera) e manter ~1 mês (20 dias), apanhando a reação + drift. Decisão = valor esperado (COMPRAR se &gt; +0,5%).</p>
      </header>

      <section className="ee-panel">
        <div className="ee-inputrow">
          <input
            className="ee-input ee-input--tic"
            placeholder="Ticker (ex: NVDA)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && !loading && analyze()}
          />
          <button className="ee-btn" onClick={() => analyze()} disabled={loading || !ticker.trim()}>
            {loading ? "a analisar…" : "Analisar"}
          </button>
        </div>
      </section>

      {/* CALENDAR */}
      <section className="ee-cal">
        <div className="ee-cal-head">
          <h2 className="ee-cal-title">Próximos resultados · 30 dias</h2>
          <button className="ee-cal-refresh" onClick={atualizarTudo} disabled={calLoading || autoRunning}>
            {calLoading ? "a carregar…" : autoRunning ? "a processar…" : "↻ atualizar tudo"}
          </button>
        </div>
        {autoMsg && <div className="ee-auto-msg">{autoRunning ? "⏳ " : ""}{autoMsg}</div>}

        <div className="ee-quicksel">
          <span>Selecionar:</span>
          <button onClick={selectNext7}>próximos 7 dias</button>
        </div>

        <button className="ee-legend-toggle" onClick={() => setShowLegend((s) => !s)}>
          {showLegend ? "▾ esconder áreas" : "▸ ver áreas"}
        </button>
        {showLegend && (
          <div className="ee-legend">
            {Object.entries(THEME_META).map(([k, t]) => (
              <span key={k} className="ee-legend-item">
                <span className="ee-legend-dot" style={{ background: t.color }} />
                {t.label}
              </span>
            ))}
          </div>
        )}

        {calendar.length > 0 && (
          <div className="ee-sel-bar">
            {selected.size > 0 ? (
              <>
                <button className="ee-analyze-all" onClick={analyzeSelected} disabled={batchRunning || loading}>
                  {batchRunning ? "a analisar em tempo real…" : `⚡ Analisar selecionadas (${selected.size})`}
                </button>
                <button className="ee-analyze-all" style={{ background: "transparent", border: "1px solid var(--gold)", color: "var(--gold)" }} onClick={analyzeSelectedDeep} disabled={batchRunning || loading}>
                  {batchRunning ? "…" : `🔬 Analisar + pesquisa aprofundada (${selected.size})`}
                </button>
                <button className="ee-sel-clear" onClick={() => setSelected(new Set())} disabled={batchRunning}>limpar</button>
              </>
            ) : (
              <div className="ee-sel-hint">Toca nas ações p/ analisar em detalhe. A recomendação COMPRAR/NÃO nas linhas aparece depois de correres "analisar próximos" (análise completa).</div>
            )}
          </div>
        )}
        {calLoading && <div className="ee-loading"><span className="ee-dot" /><span className="ee-dot" /><span className="ee-dot" /> a procurar datas reais… (pode demorar até 1 min)</div>}
        {calErr && <div className="ee-error">{calErr} <button className="ee-inline-retry" onClick={loadCalendar}>tentar de novo</button></div>}
        {!calLoading && !calErr && calendar.length === 0 && (
          <div className="ee-cal-empty">Sem datas para mostrar — ou a fonte (Yahoo) não respondeu. <button className="ee-inline-retry" onClick={loadCalendar}>tentar de novo</button></div>
        )}
        {!calLoading && (pastRows.length > 0 || calGroups.length > 0) && (
          <div className="ee-cal-scroll">
            {calGroups.map((grp) => (
              <div className="ee-cal-month" key={grp.label}>
                <div className="ee-cal-mlabel">{grp.label}</div>
                {grp.items.map((it, i) => {
                  const rowId = it.ticker + it.date + i;
                  const th = themeOf(it.sector);
                  const isSel = selected.has(it.ticker);
                  return (
                  <div
                    key={rowId}
                    className={"ee-cal-row" + (isSel ? " ee-cal-row--sel" : "") + (batchRunning ? " ee-cal-row--off" : "")}
                    onClick={() => { if (!batchRunning) toggleSelect(it); }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className={"ee-cal-check" + (isSel ? " ee-cal-check--on" : "")}>{isSel ? "✓" : ""}</span>
                    <span className="ee-cal-date">{fmtDay(it.date)}</span>
                    {th ? (
                      <button
                        type="button"
                        className="ee-cal-dotbtn"
                        title={th.label}
                        aria-label={`Área: ${th.label}`}
                        onClick={(e) => { e.stopPropagation(); setOpenDot(openDot === rowId ? null : rowId); }}
                      >
                        <span className="ee-cal-dot" style={{ background: th.color }} />
                      </button>
                    ) : (
                      <span className="ee-cal-dot ee-cal-dot--off" />
                    )}
                    <span className="ee-cal-tic">{it.ticker}</span>
                    <span className="ee-cal-exch" title="Bolsa">{exchLabel(it.ticker)}</span>
                    {it.when && <span className="ee-cal-when" title="Momento do anúncio">{it.when === "BMO" ? "pré-abertura" : it.when === "AMC" ? "após fecho" : "intradia"}</span>}
                    {openDot === rowId && th ? (
                      <span className="ee-cal-area" style={{ color: th.color }}>{th.label}</span>
                    ) : (
                      <span className="ee-cal-name">{it.name}</span>
                    )}
                    {analyzedTickers.has(it.ticker) && <span className="ee-cal-done">✓</span>}
                    {tableVerdict[it.ticker] !== undefined && (
                      <span className="ee-cal-rec" style={{ color: tableVerdict[it.ticker] ? "#2FA37A" : "#C8553D" }}>
                        {tableVerdict[it.ticker] ? "✓ COMPRAR" : "✕ NÃO"}
                      </span>
                    )}
                    {it.buyBy
                      ? <span className="ee-cal-buyby" title="PEAD: comprar ao fecho do dia de entrada (hora de Portugal) e manter ~1 mês">🕒 entrar até {it.buyBy}</span>
                      : <span className="ee-cal-go">{isSel ? "selecionada" : "selecionar"}</span>}
                  </div>
                  );
                })}
              </div>
            ))}
            {pastRows.length > 0 && (
              <div className="ee-cal-pastwrap">
                <div className="ee-cal-mlabel ee-cal-past-sum">Resultados recentes · últimos 7 dias ({pastRows.length}) — já apresentados</div>
                {groupByMonth(pastRows).map((grp) => (
                  <div className="ee-cal-month" key={"past-" + grp.label}>
                    <div className="ee-cal-mlabel">{grp.label.replace(/ · por entrada$/i, "")}</div>
                    {grp.items.map((it, i) => <CalPastRow key={it.ticker + it.date + i} it={it} />)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="ee-cal-foot">"entrar até" = comprar ANTES do anúncio, ao fecho do dia indicado (hora de Portugal; fecho US ≈ 21:00 no verão). Após fecho (AMC) → fecho do PRÓPRIO dia; pré-abertura (BMO) → fecho da VÉSPERA. Mantém-se ~1 mês (20 dias). Confirma sempre na tua corretora.</div>
      </section>

      {/* TABELA DE DECISÃO */}
      <section className="ee-dtable">
        <div className="ee-cal-head">
          <h2 className="ee-cal-title">Tabela de decisão</h2>
          <button className="ee-cal-refresh" onClick={runTable} disabled={tableRunning || tableTickers.length === 0}>
            {tableRunning ? `a analisar… (${tableRows.length}/${tableTickers.length})` : `⚡ analisar próximos (${tableTickers.length})`}
          </button>
        </div>
        {tableRows.length === 0 && !tableRunning ? (
          <div className="ee-cal-empty">Analisa os próximos {tableTickers.length} resultados (máx. {TABLE_CAP}, {TABLE_CONC} em paralelo) e ordena por data. P(beat) do LLM nas {TABLE_LLM_CAP} mais próximas (requer ANTHROPIC_API_KEY). Dados reais Yahoo — pode demorar.</div>
        ) : (
          <div className="ee-dt-scroll">
            <table className="ee-dt">
              <thead>
                <tr><th>Ticker</th><th>Bolsa</th><th>Decisão</th><th>EV/trade</th><th>Gap ON</th><th>P(beat)</th><th>Conf.</th></tr>
              </thead>
              <tbody>
                {(() => {
                  let lastDay = null; const out = [];
                  [...tableRows].sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach((r) => {
                    if (r.date !== lastDay) { lastDay = r.date; out.push(<tr key={"day-" + r.date} className="ee-dt-dayhdr"><td colSpan={7}>{fmtDay(r.date)}</td></tr>); }
                    out.push(
                      <tr key={r.ticker}>
                        <td className="ee-dt-tic">{r.ticker}</td>
                        <td style={{ color: "var(--muted)", fontSize: "11px" }}>{exchLabel(r.ticker)}</td>
                        <td style={{ color: r.err ? "#8FA6B5" : r.buy ? "#2FA37A" : "#C8553D", fontWeight: 600 }}>
                          {r.err ? "erro" : r.buy ? "✓ COMPRAR" : "✕ NÃO"}
                        </td>
                        <td className="ee-dt-num">{r.ev == null ? "—" : `${r.ev >= 0 ? "+" : ""}${r.ev.toFixed(2)}%`}</td>
                        <td className="ee-dt-num" style={{ color: r.gapAvg == null ? "#8FA6B5" : r.gapAvg >= 0 ? "#2FA37A" : "#C8553D" }} title="Gap overnight: fecho pré-anúncio → abertura pós-anúncio (média · % positivos)">
                          {r.gapAvg == null ? "—" : `${r.gapAvg >= 0 ? "+" : ""}${r.gapAvg}% (${r.gapPctUp}%)`}
                        </td>
                        <td className="ee-dt-num">{r.probBeat == null ? "—" : `${r.probBeat}%`}</td>
                        <td className="ee-dt-num">{r.conf ? `${Math.round(r.conf)}%` : "—"}</td>
                      </tr>
                    );
                  });
                  return out;
                })()}
              </tbody>
            </table>
          </div>
        )}
        <div className="ee-cal-foot">COMPRAR se valor esperado &gt; +0.5%/trade (PEAD ~1 mês). "Gap ON" = média do salto overnight (fecho pré-anúncio → abertura pós) e % de vezes positivo — a tua ideia de comprar-antes/vender-na-abertura; ~moeda ao ar, sem edge. Apoio à decisão, não garantia.</div>
      </section>

      {err && <div className="ee-error">{err}</div>}

      {rankedStrip.length >= 2 && (
        <div className="ee-rank-strip">
          <span className="ee-rank-label">CLASSIFICAÇÃO</span>
          {rankedStrip.map((s, i) => {
            const v = verdictOf(s.ev);
            return (
              <div key={s.it.id} className="ee-rank-pill" style={{ borderLeftColor: toneColor[v.tone] }}>
                <span className="ee-rank-n">{i + 1}</span>
                <span className="ee-rank-t">{s.it.ticker}</span>
                <span className="ee-rank-s" style={{ color: toneColor[v.tone] }}>{s.ev >= 0 ? "+" : ""}{s.ev.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}

      <section className="ee-results">
        {results.map((item) => {
          if (item.pending) return <PendingCard key={item.id} ticker={item.ticker} />;
          if (item.errored) return (
            <ErrorCard key={item.id} ticker={item.ticker} msg={item.errMsg}
              onRetry={() => retry(item)} onRemove={() => remove(item.id)} />
          );
          return (
            <ResultCard
              key={item.id}
              item={item}
              weights={weights}
              rank={rankMap[item.id]}
              onRefresh={() => refreshLive(item)}
              onResearch={(type) => runResearch(item, type)}
              onRemove={() => remove(item.id)}
            />
          );
        })}
      </section>

      <footer className="ee-foot">
        Ferramenta de apoio à decisão, não é recomendação de investimento. Estratégia modelada (PEAD): entrar no fecho do dia de trading seguinte ao anúncio (T+1) e manter ~1 mês (20 dias de trading), apanhando o drift pós-resultados. Dados reais do Yahoo Finance — confirma sempre na tua corretora. O drift pode não se materializar; risco real de perda.
      </footer>
    </div>
  );
}

// Linha de resultado JÁ passado: verificação da previsão (não selecionável).
function CalPastRow({ it }) {
  const th = themeOf(it.sector);
  const vc = it.verdict === "COMPRAR" ? "#2FA37A" : it.verdict === "NÃO" ? "#C8553D" : "#8FA6B5";
  return (
    <div className="ee-cal-row ee-cal-row--past">
      <span className="ee-cal-past-badge" title="Resultado já saído">◷</span>
      <span className="ee-cal-date">{fmtDay(it.date)}</span>
      {th ? <span className="ee-cal-dot" style={{ background: th.color }} />
          : <span className="ee-cal-dot ee-cal-dot--off" />}
      <span className="ee-cal-tic">{it.ticker}</span>
      <span className="ee-cal-exch" title="Bolsa">{exchLabel(it.ticker)}</span>
      <span className="ee-cal-name">{it.name}</span>
      <span className="ee-cal-verif">
        <span className="ee-cal-verd" style={{ color: vc }}>{it.verdict}</span>
        {it.reaction != null && (
          <span className="ee-cal-reac" style={{ color: it.reaction >= 0 ? "#2FA37A" : "#C8553D" }}>
            {it.reaction >= 0 ? "↑ +" : "↓ "}{it.reaction.toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  );
}

function PendingCard({ ticker }) {
  return (
    <article className="ee-card ee-card--pending">
      <div className="ee-pending">
        <span className="ee-dot" /><span className="ee-dot" /><span className="ee-dot" />
        <span className="ee-pending-t">A analisar <b>{ticker}</b>…</span>
      </div>
      <div className="ee-pending-sub">A obter dados em tempo real por pesquisa web — pode demorar até 1 min.</div>
    </article>
  );
}

function ErrorCard({ ticker, msg, onRetry, onRemove }) {
  return (
    <article className="ee-card ee-card--err">
      <button className="ee-card-x" onClick={onRemove} aria-label="Remover">×</button>
      <div className="ee-err-t">Não consegui analisar <b>{ticker}</b></div>
      <div className="ee-err-m">{msg}</div>
      <button className="ee-err-retry" onClick={onRetry}>↻ tentar de novo</button>
    </article>
  );
}

// Histograma das reações passadas: barra por evento, verde sobe / vermelho desce,
// linha zero ao centro, mais recente à direita.
function ReactionChart({ values, dates }) {
  if (!values || !values.length) return null;
  const W = 280, H = 54, pad = 4, mid = H / 2;
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const bw = (W - pad * 2) / values.length;
  return (
    <svg className="ee-rchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Reações passadas">
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="#2C4456" strokeWidth="1" />
      {values.map((v, i) => {
        const h = Math.max((Math.abs(v) / maxAbs) * (mid - pad), 1);
        const x = pad + i * bw + bw * 0.18;
        const w = bw * 0.64;
        const y = v >= 0 ? mid - h : mid;
        const tip = `${dates?.[i] ? dates[i] + ": " : ""}${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
        return (
          <rect key={i} x={x} y={y} width={w} height={h} rx="1" fill={v >= 0 ? "#2FA37A" : "#C8553D"}>
            <title>{tip}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ---- infográfico: AI illustration (fundo) + dados reais por cima (canvas) ----
function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
const domainOf = (w) => { try { return String(w).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; } catch { return ""; } };

async function composeInfographic(item, bgB64) {
  const W = 1080, H = 1080;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  // fundo: ilustração IA (cover) ou gradiente
  const { ev, conf, buy } = evVerdict(item);
  const dir = directionLean(item);
  const accent = buy ? "#2FA37A" : "#C8553D";
  const txt = "#0F1A24", mut = "#5B7184", gold = "#B8862E", line = "#E2E8EC", pill = "#F2F5F7";

  // fundo branco + acentos geométricos na cor do veredicto
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 12);
  ctx.globalAlpha = 0.07; ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W, 380); ctx.lineTo(W - 380, 0); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;

  // acento IA: thumbnail arredondado no canto superior direito
  const bg = bgB64 ? await loadImg(`data:image/png;base64,${bgB64}`) : null;
  if (bg) {
    const tsx = W - 224, tsy = 52, ts = 170;
    ctx.save(); ctx.beginPath(); ctx.roundRect(tsx, tsy, ts, ts, 20); ctx.clip();
    const s = Math.max(ts / bg.width, ts / bg.height), w = bg.width * s, h = bg.height * s;
    ctx.drawImage(bg, tsx + (ts - w) / 2, tsy + (ts - h) / 2, w, h); ctx.restore();
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(tsx, tsy, ts, ts, 20); ctx.stroke();
  }

  // logo (proxy same-origin → sem taint): FMP por ticker, fallback favicon por domínio
  const dom = domainOf(item.website);
  const logo = await loadImg(`/api/yahoo/logo?ticker=${encodeURIComponent(item.ticker || "")}&domain=${encodeURIComponent(dom)}`);
  let tx = 64;
  if (logo) {
    // detetar brilho médio do logo (pixels não-transparentes) → escolher cor da caixa
    let boxDark = false;
    try {
      const oc = document.createElement("canvas"); oc.width = 32; oc.height = 32;
      const octx = oc.getContext("2d"); octx.drawImage(logo, 0, 0, 32, 32);
      const d = octx.getImageData(0, 0, 32, 32).data;
      let lum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 20) continue; lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
      boxDark = n > 0 && lum / n > 165; // logo claro → caixa escura
    } catch { /* taint improvável (proxy same-origin) */ }
    const lx = 64, ly = 56, ls = 140, pad = 16;
    ctx.fillStyle = boxDark ? "#172A38" : "#fff";
    ctx.strokeStyle = line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(lx, ly, ls, ls, 22); ctx.fill(); ctx.stroke();
    const fit = Math.min((ls - pad * 2) / logo.width, (ls - pad * 2) / logo.height), dw = logo.width * fit, dh = logo.height * fit;
    ctx.drawImage(logo, lx + (ls - dw) / 2, ly + (ls - dh) / 2, dw, dh);
    tx = lx + ls + 28;
  }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = txt; ctx.font = "bold 84px Arial, sans-serif"; ctx.fillText(item.ticker || "", tx, 150);
  ctx.fillStyle = mut; ctx.font = "28px Arial, sans-serif"; ctx.fillText((item.name || "").slice(0, 26), tx, 192);

  // eyebrow + veredicto + seta grande (espaçados p/ não sobrepor)
  ctx.fillStyle = gold; ctx.font = "600 24px Arial, sans-serif";
  ctx.fillText("COMPRAR VÉSPERA · VENDER DIA SEGUINTE", 64, 272);
  ctx.fillStyle = accent; ctx.font = "bold 92px Arial, sans-serif";
  ctx.fillText(buy ? "COMPRAR" : "NÃO COMPRAR", 60, 380);
  ctx.font = "bold 110px Arial, sans-serif"; ctx.fillStyle = dir.up ? "#2FA37A" : "#C8553D";
  ctx.textAlign = "right"; ctx.fillText(dir.up ? "↑" : "↓", W - 60, 384); ctx.textAlign = "left";

  // mini-gráfico das reações históricas
  const reac = item.reactions || [];
  if (reac.length) {
    const cx = 64, cy = 470, cw = W - 128, ch = 140, mid = cy + ch / 2;
    ctx.fillStyle = mut; ctx.font = "22px Arial, sans-serif"; ctx.fillText("Reações passadas (T-1 -> T+1)", cx, cy - 10);
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, mid); ctx.lineTo(cx + cw, mid); ctx.stroke();
    const maxAbs = Math.max(...reac.map((x) => Math.abs(x)), 1), bw = cw / reac.length;
    reac.forEach((v, i) => {
      const h = Math.max(Math.abs(v) / maxAbs * (ch / 2 - 8), 3), x = cx + i * bw + bw * 0.2, w = bw * 0.6, yy = v >= 0 ? mid - h : mid;
      ctx.fillStyle = v >= 0 ? "#2FA37A" : "#C8553D"; ctx.beginPath(); ctx.roundRect(x, yy, w, h, 3); ctx.fill();
    });
  }

  // stats em pills (2 colunas)
  const rows = [
    ["Valor esperado", ev == null ? "-" : `${ev >= 0 ? "+" : ""}${ev.toFixed(2)}%`],
    ["Prob. bater EPS", item.llm?.probBeat != null ? `${item.llm.probBeat}%` : "-"],
    ["Confianca", `${Math.round(conf)}%`],
    ["Mov. implicito", item.impliedMove != null ? `±${item.impliedMove.toFixed(1)}%` : "-"],
    ["Preco", item.price != null ? `$${item.price}` : "-"],
    ["Resultados", item.earningsDate || "-"],
  ];
  const y0 = 700, colW = (W - 128) / 2;
  rows.forEach((rw, i) => {
    const px = 64 + (i % 2) * colW, py = y0 + Math.floor(i / 2) * 86;
    ctx.fillStyle = pill; ctx.beginPath(); ctx.roundRect(px, py, colW - 16, 72, 12); ctx.fill();
    ctx.fillStyle = mut; ctx.font = "22px Arial, sans-serif"; ctx.fillText(rw[0], px + 18, py + 30);
    ctx.fillStyle = txt; ctx.font = "bold 30px Arial, sans-serif"; ctx.fillText(rw[1], px + 18, py + 62);
  });
  // rodapé
  ctx.fillStyle = gold; ctx.font = "bold 30px Arial, sans-serif"; ctx.fillText("EarningsEdge", 64, 1024);
  ctx.fillStyle = mut; ctx.font = "22px Arial, sans-serif";
  ctx.fillText("Não é conselho de investimento · earnings é imprevisível · risco de perda", 64, 1056);
  return cv.toDataURL("image/png");
}

// valor esperado + veredicto binário. COMPRAR se EV > +0.5%/trade (confiança = rótulo).
function evVerdict(item) {
  const reac = item.reactions || [];
  const probBeat = item.llm?.probBeat ?? null;
  if (reac.length < 4) return { ev: null, conf: 0, buy: false, probBeat, avgUp: 0, avgDown: 0, pUp: 0.5, n: reac.length };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const avgUp = mean(reac.filter((r) => r > 0)), avgDown = mean(reac.filter((r) => r < 0));
  const pUp = (item.llm?.probUp ?? item.lean?.probUp ?? 50) / 100;
  const conf = item.llm?.confidence ?? item.lean?.confidence ?? 0;
  const ev = pUp * avgUp + (1 - pUp) * avgDown;
  // EV é a fonte de verdade da decisão: COMPRAR se > +0.5%/trade. Confiança é só rótulo.
  return { ev, conf, buy: ev > BUY_EV, probBeat, avgUp, avgDown, pUp, n: reac.length };
}

// Lean direcional SEMPRE (nunca INCERTO): EV decide; em empate (|EV|<0.3%) os
// índices (regime SPY/QQQ/VIX) desempatam, sem dominar. Força = magnitude do EV.
function directionLean(item) {
  const { ev } = evVerdict(item);
  const regime = item.market?.regime ?? 0; // -1..1
  let score = ev ?? 0;
  if (Math.abs(score) < 0.3) score += regime * 0.4; // empate → índices inclinam
  const up = score >= 0;
  const mag = Math.abs(ev ?? 0);
  const strength = mag >= 1.2 ? "forte" : mag >= 0.5 ? "médio" : "fraco";
  return { up, word: up ? "↑ SOBE" : "↓ DESCE", strength, color: up ? "#2FA37A" : "#C8553D" };
}

// Veredicto binário no topo: COMPRAR se valor esperado > +0.5%/trade.
function BuyVerdict({ item }) {
  const { ev, conf, buy } = evVerdict(item);
  const meta = buy ? { w: "✓ COMPRAR", c: "#2FA37A", bg: "rgba(47,163,122,.12)" } : { w: "✕ NÃO COMPRAR", c: "#C8553D", bg: "rgba(200,85,61,.08)" };
  return (
    <div className="ee-buy" style={{ borderColor: meta.c, background: meta.bg }}>
      <div className="ee-buy-word" style={{ color: meta.c }}>{meta.w}</div>
      <div className="ee-buy-sub">
        {ev == null ? "Amostra histórica fraca — sem base." : `Valor esperado ${ev >= 0 ? "+" : ""}${ev.toFixed(2)}%/trade · confiança ${Math.round(conf)}%`}
      </div>
      <div className="ee-buy-risk">⚠ Edge fraco — backtest da estratégia ~48% (perto de moeda ao ar). Arrisca só o que podes perder.</div>
    </div>
  );
}

// LLM-analista: previsão principal (beat EPS + direção + raciocínio).
function AnalysisBlock({ item }) {
  const llm = item.llm;
  if (!llm) return null;
  const d = directionLean(item); // sempre SOBE/DESCE (índices desempatam)
  return (
    <div className="ee-llm" style={{ borderColor: d.color }}>
      <div className="ee-llm-cap">Análise LLM (Claude) · previsão principal</div>
      <div className="ee-llm-grid">
        <div className="ee-llm-cell">
          <span className="ee-llm-lbl">Reação do preço</span>
          <span className="ee-llm-word" style={{ color: d.color }}>{d.word}</span>
          <span className="ee-llm-sub">lean {d.strength} · subir {llm.probUp}% · conf {llm.confidence}%</span>
        </div>
        <div className="ee-llm-cell">
          <span className="ee-llm-lbl">Bater estimativa EPS</span>
          <span className="ee-llm-word" style={{ color: llm.probBeat >= 55 ? "#2FA37A" : llm.probBeat <= 45 ? "#C8553D" : "#E0A33E" }}>{llm.probBeat}%</span>
          <span className="ee-llm-sub">probabilidade de beat</span>
        </div>
      </div>
      {llm.probBeat >= 55 && !d.up && (
        <div className="ee-llm-flag">⚠ Provável bater EPS ({llm.probBeat}%), mas o lean é de <b>descida</b> — bater ≠ subir (sell-the-news, valuation, guidance).</div>
      )}
      {llm.reasoning && <div className="ee-llm-reason">{llm.reasoning}</div>}
      <div className="ee-llm-warn">Lean tipado por EV + índices. NÃO é garantia — direção pós-earnings é incerta; força "fraco" = pouca convicção.</div>
    </div>
  );
}

// Gráfico de cotações (linha do fecho) com períodos Ano/Mês/Semana e marcas nas datas de resultados.
function PriceChart({ item }) {
  const hist = item.history || [];
  const [per, setPer] = useState("ano");
  if (hist.length < 2) return null;
  const n = per === "semana" ? 6 : per === "mes" ? 22 : 260;
  const data = hist.slice(-n);
  if (data.length < 2) return null;
  const W = 640, H = 170, padL = 6, padR = 6, padT = 8, padB = 8;
  const cs = data.map((x) => x.c);
  const min = Math.min(...cs), max = Math.max(...cs), rng = max - min || 1;
  const X = (i) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const Y = (c) => padT + (1 - (c - min) / rng) * (H - padT - padB);
  const path = data.map((x, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(x.c).toFixed(1)).join(" ");
  const first = data[0], last = data[data.length - 1];
  const chg = ((last.c - first.c) / first.c) * 100;
  const col = chg >= 0 ? "#2FA37A" : "#C8553D";
  const idxByDate = (d) => { let b = -1; for (let i = 0; i < data.length; i++) { if (data[i].d <= d) b = i; else break; } return b; };
  const marks = (item.earningsMarks || []).filter((d) => d >= first.d && d <= last.d).map(idxByDate).filter((i) => i >= 0);
  return (
    <div className="ee-pchart">
      <div className="ee-pchart-head">
        <span className="ee-pchart-title">Cotação {chg >= 0 ? "▲" : "▼"} <b style={{ color: col }}>{chg >= 0 ? "+" : ""}{chg.toFixed(1)}%</b> · {min.toFixed(1)}–{max.toFixed(1)}</span>
        <span className="ee-pchart-btns">
          {[["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"]].map(([k, l]) => (
            <button key={k} className={"ee-pchart-b" + (per === k ? " on" : "")} onClick={() => setPer(k)}>{l}</button>
          ))}
        </span>
      </div>
      <svg className="ee-pchart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Cotação">
        {marks.map((i, k) => <line key={k} x1={X(i)} y1={padT} x2={X(i)} y2={H - padB} stroke="#E0A33E" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />)}
        <path d={path} fill="none" stroke={col} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <circle cx={X(data.length - 1)} cy={Y(last.c)} r="3.5" fill={col} />
      </svg>
      <div className="ee-pchart-foot">{fmtDay(first.d)} → {fmtDay(last.d)} · linhas ⃒ tracejadas = datas de resultados</div>
    </div>
  );
}

// Gap overnight: comprar no fecho ANTES do anúncio → vender na abertura logo a seguir.
// Mostra o histórico desse salto (quantas vezes positivo, média, por evento).
function GapOvernight({ item }) {
  const gaps = item.gaps || [];
  if (!gaps.length) return null;
  const dates = item.gapDates || [];
  const rows = [];
  for (let i = gaps.length - 1; i >= Math.max(0, gaps.length - 8); i--) rows.push({ date: (dates[i] || "").slice(5), g: gaps[i] });
  const rateColor = item.gapPctUp >= 55 ? "#2FA37A" : item.gapPctUp <= 45 ? "#C8553D" : "#E0A33E";
  return (
    <div className="ee-gap">
      <div className="ee-gap-h">
        Gap overnight · comprar antes do fecho → vender na abertura
        <span className="ee-gap-rate" style={{ color: rateColor }}>{item.gapPctUp}% positivos</span>
      </div>
      <div className="ee-gap-sub">
        Média <b style={{ color: item.gapAvg >= 0 ? "#2FA37A" : "#C8553D" }}>{item.gapAvg >= 0 ? "+" : ""}{item.gapAvg}%</b> · n={item.gapN}. Só o salto imediato ao anúncio (fecho pré-anúncio → abertura pós-anúncio).
      </div>
      <div className="ee-gap-list">
        {rows.map((x, i) => (
          <span key={i} className="ee-gap-chip" style={{ color: x.g >= 0 ? "#2FA37A" : "#C8553D", borderColor: x.g >= 0 ? "#2FA37A55" : "#C8553D55" }}>
            {x.date} {x.g >= 0 ? "+" : ""}{x.g}%
          </span>
        ))}
      </div>
      <div className="ee-gap-warn">⚠ Aposta na direção do salto — histórico ~moeda ao ar, sem edge fiável. O movimento implícito das opções já precifica este gap.</div>
    </div>
  );
}

// Backtest de verificação: aplica o veredicto ATUAL aos últimos 5 resultados reais
// e diz se teria acertado. Correta: COMPRAR se reação>0; NÃO COMPRAR se reação<=0.
function Backtest5({ item }) {
  const reac = item.reactions || [];
  if (!reac.length) return null;
  const dates = item.reactionDates || [];
  const whenArr = item.reactionWhen || [];
  const intraArr = item.reactionIntraday || [];
  const { buy } = evVerdict(item);
  const whenLabel = (w) => (w === "BMO" ? "pré-abertura" : w === "AMC" ? "após fecho" : w === "intraday" ? "intradia" : "—");
  const n = Math.min(5, reac.length);
  const rows = [];
  for (let i = reac.length - 1; i >= reac.length - n; i--) { // mais recente à direita
    const r = reac[i];
    rows.push({ date: dates[i] || `#${i + 1}`, reaction: r, when: whenLabel(whenArr[i]), intra: !!intraArr[i], correct: buy ? r > 0 : r <= 0 });
  }
  const hits = rows.filter((x) => x.correct).length;
  const rateColor = hits / n >= 0.6 ? "#2FA37A" : hits / n <= 0.4 ? "#C8553D" : "#E0A33E";
  return (
    <div className="ee-bt">
      <div className="ee-bt-h">
        Verificação PEAD · últimos {n} resultados (drift ~1 mês)
        <span className="ee-bt-rate" style={{ color: rateColor }}>{hits}/{n} certas</span>
      </div>
      <div className="ee-bt-sub">
        Veredicto atual (<b style={{ color: buy ? "#2FA37A" : "#C8553D" }}>{buy ? "COMPRAR" : "NÃO COMPRAR"}</b>) aplicado a cada drift T+1→T+20 passado — certo se {buy ? "o drift foi positivo" : "o drift não foi positivo"}.
      </div>
      <table className="ee-bt-table">
        <thead><tr><th>Data</th><th>Momento</th><th>Decisão</th><th>Drift 1 mês</th><th>Resultado</th></tr></thead>
        <tbody>
          {rows.map((x, i) => (
            <tr key={i}>
              <td>{x.date}</td>
              <td>{x.when}</td>
              <td style={{ color: buy ? "#2FA37A" : "#C8553D" }}>{buy ? "COMPRAR" : "NÃO"}</td>
              <td style={{ color: x.reaction >= 0 ? "#2FA37A" : "#C8553D" }}>{x.reaction >= 0 ? "+" : ""}{x.reaction.toFixed(1)}%</td>
              <td style={{ color: x.correct ? "#2FA37A" : "#C8553D", fontWeight: 600 }}>{x.correct ? "✓ certa" : "✗ errada"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ee-bt-warn">Drift PEAD = fecho(T+1) → fecho(T+20 dias de trading). In-sample — indicativo, não prova edge futuro.</div>
    </div>
  );
}

// Decisão p/ a estratégia comprar T-1 / vender T+1: valor esperado honesto.
// EV = P(subir)·média das subidas + P(descer)·média das quedas (das reações reais).
function TradeDecision({ item }) {
  const { ev, conf, avgUp, avgDown, pUp, n } = evVerdict(item); // mesma fonte que o veredicto
  if (ev == null) {
    return (
      <div className="ee-trade-dec" style={{ borderColor: "#8FA6B5" }}>
        <div className="ee-td-h">Estratégia: comprar antes do anúncio · manter ~1 mês</div>
        <div className="ee-td-call" style={{ color: "#8FA6B5" }}>⏸ ESPERAR</div>
        <div className="ee-td-d">Amostra histórica fraca ({n} reações) — sem base para decidir.</div>
      </div>
    );
  }
  const meta = ev > BUY_EV
    ? { call: "↑ LEAN LONG (entrar)", color: "#2FA37A" }
    : ev < -BUY_EV
    ? { call: "↓ LEAN QUEDA (não entrar)", color: "#C8553D" }
    : { call: "↔ SEM EDGE (evitar)", color: "#E0A33E" };
  return (
    <div className="ee-trade-dec" style={{ borderColor: meta.color }}>
      <div className="ee-td-h">Estratégia: comprar antes do anúncio · manter ~1 mês</div>
      <div className="ee-td-call" style={{ color: meta.color }}>{meta.call}</div>
      <div className="ee-td-ev">Retorno esperado: <b style={{ color: meta.color }}>{ev >= 0 ? "+" : ""}{ev.toFixed(2)}%</b> por trade</div>
      <div className="ee-td-d">
        P(subir) {Math.round(pUp * 100)}% · subida média <b>+{avgUp.toFixed(1)}%</b> · queda média <b>{avgDown.toFixed(1)}%</b> · confiança {Math.round(conf)}%.
        {Math.abs(ev) <= BUY_EV && " Edge demasiado pequeno para cobrir custos/risco."}
      </div>
      <div className="ee-td-warn">Valor esperado de dados históricos — não garante este resultado. Backtest da estratégia: ~48% (sem edge fiável).</div>
    </div>
  );
}

// Direção provável: lean probabilístico de vários sinais (NÃO previsão).
function LeanBlock({ lean }) {
  if (!lean) return null;
  const meta =
    lean.direction === "up" ? { word: "SOBE", color: "#2FA37A", arrow: "↑" }
    : lean.direction === "down" ? { word: "DESCE", color: "#C8553D", arrow: "↓" }
    : { word: "INCERTO", color: "#E0A33E", arrow: "↔" };
  return (
    <div className="ee-lean" style={{ borderColor: meta.color }}>
      <div className="ee-lean-cap">Contexto &amp; odds · <b>sem edge comprovado</b> (backtest: 47.7% vs 48.4% base)</div>
      <div className="ee-lean-head">
        <div className="ee-lean-word" style={{ color: meta.color }}>{meta.arrow} {meta.word}</div>
        <div className="ee-lean-nums">prob. subir <b>{lean.probUp}%</b> · confiança <b>{lean.confidence}%</b></div>
      </div>
      <div className="ee-lean-bar"><div className="ee-lean-fill" style={{ width: `${lean.probUp}%`, background: meta.color }} /></div>
      <div className="ee-lean-sigs">
        {lean.signals.map((s) => (
          <div key={s.key} className="ee-lean-sig">
            <span className="ee-lean-sl">{s.label}</span>
            <span className="ee-lean-sbar"><i style={{ left: `${50 + s.v * 50}%`, background: s.v > 0 ? "#2FA37A" : s.v < 0 ? "#C8553D" : "#8FA6B5" }} /></span>
            <span className="ee-lean-sr">{s.raw}</span>
          </div>
        ))}
      </div>
      <div className="ee-lean-warn">
        Contexto de {lean.signals.length} sinais — <b>NÃO prevê direção</b>. Backtest de 275 resultados: estes sinais acertam 47.7% (moeda ao ar). Usa como leitura de incerteza, não para apostar.
        {lean.reactionLogic != null ? ` Reage aos fundamentais ${lean.reactionLogic}% das vezes.` : ""}
        {lean.sellNews ? " ⚠ Histórico de \"sell-the-news\" (move-se contra os resultados)." : ""}
      </div>
    </div>
  );
}

// Notícias recentes + sentimento por léxico (cru). Só contexto, NÃO entra no lean.
function NewsBlock({ news, tally, method }) {
  if (!news || !news.length) return null;
  const col = { positive: "#2FA37A", negative: "#C8553D", neutral: "#8FA6B5" };
  return (
    <div className="ee-news">
      <div className="ee-news-h">
        Notícias recentes
        {tally && <span className="ee-news-tally"><b style={{ color: col.positive }}>{tally.positive}+</b> · {tally.neutral}~ · <b style={{ color: col.negative }}>{tally.negative}−</b></span>}
      </div>
      {news.map((n, i) => (
        <a key={i} className="ee-news-item" href={n.link || "#"} target="_blank" rel="noopener noreferrer">
          <span className="ee-news-dot" style={{ background: col[n.sentiment] }} />
          <span className="ee-news-t">{n.title}</span>
          {n.publisher && <span className="ee-news-pub">{n.publisher}</span>}
        </a>
      ))}
      <div className="ee-news-warn">Sentimento via {method || "léxico"} — só contexto, não entra na direção.</div>
    </div>
  );
}

function ResultCard({ item, weights, rank, onRefresh, onResearch, onRemove }) {
  // computeStrategyScore só alimenta a análise de fatores (contexto) — a decisão vem do EV.
  const strategy = useMemo(() => computeStrategyScore(item, weights), [item, weights]);
  const { factors } = strategy;
  const per = useMemo(() => preEarningsRead(item, strategy), [item, strategy]);
  const [tab, setTab] = useState(null);

  const openTab = (type) => {
    const next = tab === type ? null : type;
    setTab(next);
    if (next && !(item.research && item.research[type])) onResearch(type);
  };
  const research = item.research || {};
  const current = tab ? research[tab] : null;

  // gerador de post p/ redes sociais (LLM)
  const [post, setPost] = useState(null);
  const [postLoading, setPostLoading] = useState(false);
  const [postErr, setPostErr] = useState("");
  const [copied, setCopied] = useState("");
  const postRef = useRef(null);
  useEffect(() => {
    if (post && postRef.current) postRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [post]);
  const genPost = async () => {
    setPostLoading(true); setPostErr(""); setPost(null);
    const { ev, conf, buy } = evVerdict(item);
    const dir = directionLean(item);
    try {
      const res = await fetch("/api/yahoo/post", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: item.ticker, name: item.name, date: item.earningsDate,
          verdict: buy ? "COMPRAR" : "NÃO COMPRAR",
          ev: ev != null ? ev.toFixed(2) : "n/d", direction: dir.word + " (" + dir.strength + ")",
          probBeat: item.llm?.probBeat ?? "n/d", price: item.price ?? "n/d",
          impliedMove: item.impliedMove != null ? item.impliedMove.toFixed(1) : "n/d",
        }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `erro ${res.status}`);
      setPost(j);
    } catch (e) { setPostErr(e.message); }
    finally { setPostLoading(false); }
  };
  const copy = (which, text) => {
    try { navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(""), 1500); } catch (_) {}
  };
  // imagem IA (OpenAI/DALL-E)
  const [img, setImg] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const genImage = async () => {
    setImgLoading(true); setImgErr(""); setImg(null);
    const { buy } = evVerdict(item);
    const dir = directionLean(item);
    try {
      const res = await fetch("/api/yahoo/image", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: item.ticker, sectorLabel: themeOf(item.sector)?.label || "",
          verdict: buy ? "COMPRAR" : "NÃO COMPRAR", direction: dir.word,
        }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `erro ${res.status}`);
      const composed = await composeInfographic(item, j.image); // AI fundo + dados por cima
      setImg(composed);
    } catch (e) { setImgErr(e.message); }
    finally { setImgLoading(false); }
  };
  // publicar (Meta) — semi-auto: tu aprovas e carregas
  const [pubFb, setPubFb] = useState(true);
  const [pubIg, setPubIg] = useState(true);
  const [pubRes, setPubRes] = useState(null);
  const [pubLoading, setPubLoading] = useState(false);
  const publishNow = async () => {
    setPubLoading(true); setPubRes(null);
    const platforms = [pubFb && "fb", pubIg && "ig"].filter(Boolean);
    try {
      const res = await fetch("/api/yahoo/publish", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ platforms, text: post?.long || post?.short || "", image: img || "", imageUrl: "" }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `erro ${res.status}`);
      setPubRes(j);
    } catch (e) { setPubRes({ _err: e.message }); }
    finally { setPubLoading(false); }
  };

  return (
    <article className="ee-card">
      <button className="ee-card-x" onClick={onRemove} aria-label="Remover">×</button>
      <div className="ee-card-head">
        <div className="ee-card-id">
          {rank && <span className="ee-rankbadge">#{rank}</span>}
          <div>
            <div className="ee-ticker">{item.ticker}</div>
            <div className="ee-name">{item.name}{item.price != null ? ` · $${item.price}` : ""} · <span style={{ color: "var(--gold)" }}>{exchLabel(item.ticker)}</span></div>
          </div>
        </div>
        <div className="ee-meta">
          {item.earningsDate && <div>Resultados: <b>{item.earningsDate}</b></div>}
          {item.impliedMove != null && <div>Mov. implícito: <b>±{item.impliedMove.toFixed(1)}%</b></div>}
        </div>
      </div>

      <div className="ee-srcline">
        {themeOf(item.sector) && (
          <span className="ee-theme" style={{ color: themeOf(item.sector).color, borderColor: themeOf(item.sector).color }}>
            {themeOf(item.sector).label}
          </span>
        )}
        <span className="ee-badge ee-badge--live">● dados em tempo real</span>
        <button className="ee-refresh-live" onClick={onRefresh} disabled={item._refreshing}>
          {item._refreshing ? "a buscar dados…" : "↻ atualizar"}
        </button>
        {item._refreshErr && <span className="ee-refresh-err">falhou ({item._refreshErr})</span>}
      </div>

      <PriceChart item={item} />

      {per && (
        <div className="ee-pe">
          <div className="ee-pe-q">Histórico (comprar antes do anúncio · manter ~1 mês)</div>
          <div className="ee-pe-d">
            {per.hist != null && (
              <>Taxa de sucesso T-1→T+1: <b>{Math.round(per.hist)}%</b> dos últimos ~8 resultados. </>
            )}
            {per.avgRet != null && (
              <>Retorno médio nessa janela: <b>{per.avgRet >= 0 ? "+" : ""}{per.avgRet.toFixed(1)}%</b>. </>
            )}
            {item.pctUp != null && item.pctStrategyWin != null && (
              <>Reação T→T+1: <b>{Math.round(item.pctUp)}%</b>. </>
            )}
            {per.move != null && <>Movimento implícito ±{per.move.toFixed(1)}%{item.impliedSource ? ` (${item.impliedSource})` : ""}{item.straddleMove != null && item.impliedSource && item.impliedSource.includes("isolado") ? ` · straddle bruto ±${item.straddleMove.toFixed(1)}%` : ""}. </>}
            <span className="ee-pe-warn">Probabilidade histórica — não é previsão deste resultado.</span>
          </div>
          {item.reactionStd != null && (
            <div className="ee-pe-stats">
              <div>Dispersão da reação: <b>±{item.reactionStd.toFixed(1)}%</b> (1σ){item.reactionN != null && <> · n={item.reactionN}</>}</div>
              {item.reactionLow != null && item.reactionHigh != null && (
                <div>Intervalo típico (~68%): <b>{item.reactionLow >= 0 ? "+" : ""}{item.reactionLow.toFixed(1)}%</b> a <b>{item.reactionHigh >= 0 ? "+" : ""}{item.reactionHigh.toFixed(1)}%</b></div>
              )}
              {item.reactionMin != null && item.reactionMax != null && (
                <div>Extremos passados: <b>{item.reactionMin.toFixed(1)}%</b> … <b>+{item.reactionMax.toFixed(1)}%</b></div>
              )}
              {item.reactionSkew != null && (
                <div>Enviesamento: <b>{item.reactionSkew > 0.5 ? "positivo (cauda p/ cima)" : item.reactionSkew < -0.5 ? "negativo (cauda p/ baixo)" : "~simétrico"}</b></div>
              )}
              {item.iv1 != null && (
                <div>IV term structure: <b>{(item.iv1 * 100).toFixed(0)}%</b> (pós-resultados){item.iv0 != null && <> vs <b>{(item.iv0 * 100).toFixed(0)}%</b> (baseline pré)</>}{item.daysToExpiry != null && <> · {item.daysToExpiry}d até exp</>}</div>
              )}
              {item.reactions && item.reactions.length > 0 && (
                <div className="ee-rchart-wrap">
                  <div className="ee-rchart-cap">Reações passadas · mais recente à direita · passa o rato p/ data</div>
                  <ReactionChart values={item.reactions} dates={item.reactionDates} />
                </div>
              )}
              <div className="ee-pe-warn">σ alto = resultado muito incerto. Amostra pequena (n&lt;8) = pouco fiável.</div>
            </div>
          )}
        </div>
      )}

      <GapOvernight item={item} />

      <BuyVerdict item={item} />

      {item.llm ? (
        <>
          <AnalysisBlock item={item} />
          {item.lean && (
            <details className="ee-lean-details">
              <summary>Lean heurístico (15 sinais) — 2ª opinião</summary>
              <LeanBlock lean={item.lean} />
            </details>
          )}
        </>
      ) : (
        item.lean && <LeanBlock lean={item.lean} />
      )}

      <TradeDecision item={item} />

      <Backtest5 item={item} />

      <div className="ee-factors">
        {factors.map((f) => (
          <div key={f.key} className="ee-factor">
            <div className="ee-factor-l">
              <span className="ee-factor-label">{FACTOR_META[f.key].label}</span>
              <span className="ee-factor-hint">{FACTOR_META[f.key].hint}</span>
            </div>
            <div className="ee-factor-bar">
              <div className="ee-factor-fill" style={{ width: `${f.sub}%`, background: subColor(f.sub) }} />
            </div>
            <div className="ee-factor-raw">{f.raw}</div>
          </div>
        ))}
        {factors.length === 0 && <div className="ee-factor-none">Dados insuficientes para pontuar.</div>}
      </div>

      <NewsBlock news={item.news} tally={item.newsTally} method={item.newsMethod} />

      <div className="ee-post" ref={postRef}>
        <button className="ee-post-btn" onClick={genPost} disabled={postLoading}>
          {postLoading ? "a gerar post…" : "📢 Gerar post p/ redes sociais"}
        </button>
        {postLoading && (
          <div className="ee-loading" style={{ marginTop: 10 }}>
            <span className="ee-dot" /><span className="ee-dot" /><span className="ee-dot" /> a escrever o post com IA… (~10s)
          </div>
        )}
        <button className="ee-post-btn" style={{ marginTop: 8, background: "var(--surface2)", color: "var(--gold)" }} onClick={genImage} disabled={imgLoading}>
          {imgLoading ? "a gerar imagem…" : "🖼 Gerar imagem (IA)"}
        </button>
        {imgLoading && (
          <div className="ee-loading" style={{ marginTop: 10 }}>
            <span className="ee-dot" /><span className="ee-dot" /><span className="ee-dot" /> a criar a ilustração com IA… (~15s)
          </div>
        )}
        {imgErr && <div className="ee-research-err">Imagem falhou ({imgErr}). <button className="ee-inline-retry" onClick={genImage}>tentar de novo</button></div>}
        {img && (
          <div className="ee-post-img">
            <img src={img} alt={`Post ${item.ticker}`} />
            <a className="ee-post-copy" href={img} download={`${item.ticker}-post.png`}>descarregar imagem</a>
          </div>
        )}
        {postErr && <div className="ee-research-err">Falhou ({postErr}). <button className="ee-inline-retry" onClick={genPost}>tentar de novo</button></div>}
        {post && (
          <div className="ee-post-out">
            {["short", "long"].map((k) => (
              <div className="ee-post-card" key={k}>
                <div className="ee-post-h">
                  <span>{k === "short" ? "Curto (X/Twitter)" : "Longo (LinkedIn/Insta)"}</span>
                  <button className="ee-post-copy" onClick={() => copy(k, post[k])}>{copied === k ? "✓ copiado" : "copiar"}</button>
                </div>
                <div className="ee-post-text">{post[k]}</div>
              </div>
            ))}
          </div>
        )}
        {post && (
          <div className="ee-pub">
            <div className="ee-pub-h">Publicar (aprovação manual)</div>
            <label className="ee-pub-chk"><input type="checkbox" checked={pubFb} onChange={(e) => setPubFb(e.target.checked)} /> Facebook</label>
            <label className="ee-pub-chk"><input type="checkbox" checked={pubIg} onChange={(e) => setPubIg(e.target.checked)} /> Instagram</label>
            <button className="ee-post-copy" onClick={publishNow} disabled={pubLoading || (!pubFb && !pubIg)}>
              {pubLoading ? "a publicar…" : "📤 publicar agora"}
            </button>
            {pubRes && (
              <div className="ee-pub-res">
                {pubRes._err ? <span style={{ color: "#C8553D" }}>Falhou: {pubRes._err}</span> : (
                  ["fb", "ig"].filter((p) => pubRes[p]).map((p) => (
                    <div key={p} style={{ color: pubRes[p].ok ? "#2FA37A" : "#C8553D" }}>
                      {p === "fb" ? "Facebook" : "Instagram"}: {pubRes[p].ok ? "✓ publicado (" + pubRes[p].id + ")" : "✕ " + pubRes[p].error}
                    </div>
                  ))
                )}
              </div>
            )}
            <div className="ee-news-warn">Instagram exige imagem com URL público — não publica de localhost (só FB local). Configura tokens em server/.meta-config.json.</div>
          </div>
        )}
      </div>

      <div className="ee-research">
        <div className="ee-research-h">Pesquisa aprofundada</div>
        <div className="ee-research-tabs">
          {Object.keys(RESEARCH_META).map((type) => (
            <button
              key={type}
              className={"ee-rtab" + (tab === type ? " ee-rtab--on" : "")}
              onClick={() => openTab(type)}
            >
              {RESEARCH_META[type].label}
            </button>
          ))}
        </div>
        {tab && (
          <div className="ee-research-body">
            {current && current.loading && (
              <div className="ee-loading"><span className="ee-dot" /><span className="ee-dot" /><span className="ee-dot" /> a pesquisar {RESEARCH_META[tab].label.toLowerCase()}…</div>
            )}
            {current && current.err && (
              <div className="ee-research-err">Falhou ({current.err}). <button className="ee-inline-retry" onClick={() => onResearch(tab)}>tentar de novo</button></div>
            )}
            {current && current.text && <div className="ee-research-text">{current.text}</div>}
          </div>
        )}
      </div>

      {item.note && <div className="ee-note">⚐ {item.note}</div>}
    </article>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
.ee-root *, .ee-root *::before, .ee-root *::after{box-sizing:border-box;}
.ee-root{--ink:#0F1A24;--surface:#172A38;--surface2:#21384A;--line:#2C4456;--text:#E8EEF2;--muted:#8FA6B5;--gold:#D6A445;
  font-family:'Inter',system-ui,sans-serif;background:var(--ink);color:var(--text);min-height:100%;padding:24px 18px 40px;max-width:760px;margin:0 auto;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
.ee-head{margin-bottom:22px;}
.ee-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;}
.ee-title{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:38px;line-height:1;margin:0;letter-spacing:-.02em;}
.ee-title span{color:var(--gold);}
.ee-sub{color:var(--muted);font-size:14px;margin:10px 0 0;max-width:50ch;line-height:1.5;}
.ee-panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:18px;}
.ee-inputrow{display:flex;gap:8px;flex-wrap:wrap;}
.ee-input{background:var(--ink);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:12px 13px;font-size:15px;font-family:'IBM Plex Mono',monospace;outline:none;}
.ee-input:focus{border-color:var(--gold);box-shadow:0 0 0 2px rgba(214,164,69,.22);}
.ee-input--tic{flex:1;min-width:120px;text-transform:uppercase;}
.ee-input--pos{width:150px;flex:1;min-width:120px;}
.ee-btn{background:var(--gold);color:#1a1206;border:none;border-radius:9px;padding:12px 20px;font-weight:600;font-size:15px;cursor:pointer;font-family:'Space Grotesk',sans-serif;transition:filter .15s,transform .05s;}
.ee-btn:hover:not(:disabled){filter:brightness(1.08);}
.ee-btn:active:not(:disabled){transform:translateY(1px);}
.ee-btn:disabled{opacity:.5;cursor:wait;}
.ee-risk-row{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--line);padding-top:14px;}
.ee-risk-field{flex:1;min-width:150px;}
.ee-risk-field label{display:block;font-size:12px;color:var(--muted);margin-bottom:7px;}
.ee-risk-field label b{color:var(--gold);font-family:'IBM Plex Mono',monospace;}
.ee-input--risk{width:100%;box-sizing:border-box;}
.ee-risk-field input[type=range]{width:100%;accent-color:var(--gold);margin-top:6px;}
.ee-weights-toggle{background:none;border:none;color:var(--muted);font-size:12.5px;cursor:pointer;margin-top:14px;padding:4px 0;font-family:'IBM Plex Mono',monospace;}
.ee-weights-toggle:hover{color:var(--text);}
.ee-weights{margin-top:10px;border-top:1px solid var(--line);padding-top:14px;display:grid;gap:13px;}
.ee-weight-top{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:5px;}
.ee-weight-val{font-family:'IBM Plex Mono',monospace;color:var(--gold);}
.ee-weight input[type=range]{width:100%;accent-color:var(--gold);}
.ee-reset{justify-self:start;background:none;border:1px solid var(--line);color:var(--muted);border-radius:7px;padding:6px 12px;font-size:12px;cursor:pointer;}
.ee-reset:hover{color:var(--text);border-color:var(--muted);}
.ee-cal{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:18px;}
.ee-cal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.ee-cal-title{font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:700;margin:0;}
.ee-cal-refresh{background:none;border:1px solid var(--line);color:var(--muted);border-radius:7px;padding:6px 11px;font-size:12px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ee-cal-refresh:hover:not(:disabled){color:var(--text);border-color:var(--gold);}
.ee-cal-refresh:disabled{opacity:.5;}
.ee-cal-scroll{overflow-x:hidden;margin-top:8px;}
.ee-cal-month{margin-bottom:10px;}
.ee-cal-mlabel{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);padding:8px 0 6px;position:sticky;top:0;background:var(--surface);}
.ee-cal-row{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:9px 11px;margin-bottom:6px;cursor:pointer;color:var(--text);transition:border-color .14s,background .14s;}
.ee-cal-row:hover:not(:disabled){border-color:var(--gold);background:var(--surface2);}
.ee-cal-row:disabled{opacity:.55;cursor:wait;}
.ee-cal-row--off{opacity:.55;cursor:wait;pointer-events:none;}
.ee-cal-dotbtn{background:none;border:none;padding:6px 5px;margin:-6px -2px;cursor:pointer;display:flex;align-items:center;flex-shrink:0;border-radius:50%;}
.ee-cal-dotbtn:hover{background:var(--surface2);}
.ee-cal-area{font-family:'IBM Plex Mono',monospace;font-size:11.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ee-cal-date{font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:var(--muted);width:46px;flex-shrink:0;}
.ee-cal-tic{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;width:62px;flex-shrink:0;}
.ee-cal-name{font-size:12.5px;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ee-cal-est{font-size:10px;color:#E0A33E;border:1px solid #E0A33E;border-radius:5px;padding:1px 5px;flex-shrink:0;}
.ee-cal-done{color:#2FA37A;font-size:13px;flex-shrink:0;}
.ee-cal-go{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--gold);flex-shrink:0;opacity:0;transition:opacity .14s;}
.ee-cal-row:hover:not(:disabled) .ee-cal-go{opacity:1;}
.ee-cal-row--past{cursor:default;opacity:.92;background:#132230;border-style:dashed;}
.ee-cal-row--past:hover{border-color:var(--line);background:#132230;}
.ee-cal-past-badge{font-size:12px;color:var(--muted);width:14px;flex-shrink:0;text-align:center;}
.ee-cal-when{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:1px 5px;flex-shrink:0;}
.ee-cal-exch{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--gold);border:1px solid var(--line);border-radius:5px;padding:1px 5px;flex-shrink:0;}
.ee-cal-rec{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;flex-shrink:0;margin-left:auto;white-space:nowrap;}
.ee-cal-rec + .ee-cal-buyby{margin-left:12px;}
.ee-cal-buyby{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--gold);flex-shrink:0;margin-left:auto;white-space:nowrap;}
.ee-cal-verif{display:flex;align-items:center;gap:10px;margin-left:auto;flex-shrink:0;font-family:'IBM Plex Mono',monospace;font-size:11.5px;}
.ee-cal-verd{font-weight:600;}
.ee-cal-surp{font-variant-numeric:tabular-nums;opacity:.9;}
.ee-cal-prog{font-size:10px;color:var(--gold);border:1px solid var(--line);border-radius:5px;padding:1px 5px;}
.ee-cal-past-wrap{margin-top:14px;border-top:1px dashed var(--line);padding-top:8px;}
.ee-cal-past-sum{cursor:pointer;list-style:none;user-select:none;}
.ee-cal-past-sum::-webkit-details-marker{display:none;}
.ee-cal-reac{font-variant-numeric:tabular-nums;}
.ee-cal-hit{font-weight:600;}
.ee-cal-empty{color:var(--muted);font-size:13px;padding:12px 0;}
.ee-auto-msg{background:rgba(214,164,69,.10);border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-size:12.5px;color:#f0d9a8;margin:8px 0;}
.ee-quicksel{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:12.5px;color:var(--muted);flex-wrap:wrap;}
.ee-quicksel button{background:transparent;border:1px solid var(--gold);color:var(--gold);border-radius:7px;padding:4px 12px;font-size:12.5px;cursor:pointer;}
.ee-quicksel button:hover{background:var(--gold);color:#1a1206;}
.ee-cal-foot{font-size:11px;color:var(--muted);line-height:1.5;margin-top:10px;border-top:1px solid var(--line);padding-top:10px;}
.ee-inline-retry{background:none;border:none;color:var(--gold);text-decoration:underline;cursor:pointer;font-size:inherit;}
.ee-error{background:rgba(200,85,61,.12);border:1px solid #C8553D;color:#f0b8ab;border-radius:10px;padding:12px 14px;font-size:13.5px;margin-bottom:14px;line-height:1.5;}
.ee-loading{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px;font-family:'IBM Plex Mono',monospace;margin:8px 0 6px;}
.ee-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);display:inline-block;animation:ee-pulse 1.2s infinite ease-in-out;}
.ee-dot:nth-child(2){animation-delay:.2s;}
.ee-dot:nth-child(3){animation-delay:.4s;margin-right:6px;}
@keyframes ee-pulse{0%,80%,100%{opacity:.25;}40%{opacity:1;}}
.ee-dtable{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:18px;}
.ee-dt-scroll{overflow-x:auto;margin-top:8px;}
.ee-dt{width:100%;border-collapse:collapse;font-size:13px;}
.ee-dt th{text-align:left;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--line);}
.ee-dt td{padding:8px;border-bottom:1px solid var(--line);white-space:nowrap;}
.ee-dt-tic{font-family:'Space Grotesk',sans-serif;font-weight:700;}
.ee-dt-num{font-family:'IBM Plex Mono',monospace;text-align:right;font-variant-numeric:tabular-nums;}
.ee-dt tbody tr:hover{background:var(--surface2);}
.ee-dt-dayhdr td{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:12px;color:var(--gold,#D6A445);background:var(--surface2);padding:6px 8px;}
.ee-dt-dayhdr:hover td{background:var(--surface2);}
.ee-rank-strip{display:flex;align-items:center;gap:8px;overflow-x:auto;padding:4px 0 12px;margin-bottom:6px;}
.ee-rank-label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.18em;color:var(--muted);flex-shrink:0;}
.ee-rank-pill{display:flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line);border-left-width:3px;border-radius:8px;padding:7px 11px;flex-shrink:0;}
.ee-rank-n{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);}
.ee-rank-t{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;}
.ee-rank-s{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:15px;font-variant-numeric:tabular-nums;}
.ee-results{display:grid;gap:16px;grid-template-columns:minmax(0,1fr);}
.ee-card{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;min-width:0;}
.ee-card-x{position:absolute;top:12px;right:12px;background:none;border:none;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;width:26px;height:26px;}
.ee-card-x:hover{color:var(--text);}
.ee-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px;padding-right:24px;}
.ee-card-id{display:flex;align-items:flex-start;gap:11px;}
.ee-rankbadge{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold);background:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 7px;margin-top:3px;}
.ee-ticker{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:26px;letter-spacing:-.01em;}
.ee-name{color:var(--muted);font-size:13px;margin-top:2px;}
.ee-meta{text-align:right;font-size:12px;color:var(--muted);font-family:'IBM Plex Mono',monospace;line-height:1.7;}
.ee-meta b{color:var(--text);}
.ee-gauge{margin-bottom:16px;}
.ee-gauge-track{position:relative;display:flex;height:11px;border-radius:6px;overflow:visible;}
.ee-zone{height:100%;}
.ee-zone:first-child{border-radius:6px 0 0 6px;}
.ee-zone:last-child{border-radius:0 6px 6px 0;}
.ee-marker{position:absolute;top:50%;width:3px;height:26px;background:#fff;border-radius:2px;transform:translate(-50%,-50%);box-shadow:0 0 0 2px var(--ink),0 2px 6px rgba(0,0,0,.5);transition:left .6s cubic-bezier(.22,1,.36,1);}
.ee-gauge-labels{display:flex;justify-content:space-between;margin-top:8px;font-size:10.5px;letter-spacing:.12em;color:var(--muted);font-family:'IBM Plex Mono',monospace;}
.ee-verdict{display:flex;align-items:baseline;gap:14px;margin-bottom:18px;}
.ee-score{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:46px;line-height:1;font-variant-numeric:tabular-nums;}
.ee-verdict-word{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;letter-spacing:.04em;}
.ee-pe{margin-bottom:18px;border:1px solid;border-radius:10px;padding:12px 14px;background:var(--ink);}
.ee-pe-q{font-size:12px;color:var(--muted);margin-bottom:5px;}
.ee-pe-a{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:18px;letter-spacing:.03em;text-transform:uppercase;margin-bottom:7px;}
.ee-pe-d{font-size:12px;color:var(--muted);line-height:1.55;}
.ee-pe-d b{color:var(--text);font-family:'IBM Plex Mono',monospace;}
.ee-pe-warn{color:#E0A33E;}
.ee-pe-stats{margin-top:10px;border-top:1px solid var(--line);padding-top:9px;display:grid;gap:4px;font-size:12px;color:var(--muted);line-height:1.5;}
.ee-pe-stats b{color:var(--text);font-family:'IBM Plex Mono',monospace;}
.ee-rchart-wrap{margin-top:6px;}
.ee-rchart-cap{font-size:10.5px;color:var(--muted);margin-bottom:4px;font-family:'IBM Plex Mono',monospace;}
.ee-rchart{width:100%;height:54px;display:block;background:var(--ink);border:1px solid var(--line);border-radius:7px;}
.ee-buy{margin-bottom:16px;border:2px solid;border-radius:12px;padding:16px;text-align:center;}
.ee-buy-word{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:30px;letter-spacing:.02em;}
.ee-buy-sub{margin-top:6px;font-size:13px;color:var(--text);font-family:'IBM Plex Mono',monospace;}
.ee-buy-risk{margin-top:9px;font-size:11px;color:#E0A33E;line-height:1.4;}
.ee-trade-dec{margin-bottom:18px;border:1px solid;border-radius:10px;padding:14px;background:var(--surface2);}
.ee-td-h{font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace;letter-spacing:.06em;margin-bottom:8px;}
.ee-td-call{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;letter-spacing:.03em;}
.ee-td-ev{margin-top:6px;font-size:14px;}
.ee-td-ev b{font-family:'IBM Plex Mono',monospace;}
.ee-td-d{margin-top:7px;font-size:12px;color:var(--muted);line-height:1.5;}
.ee-td-d b{color:var(--text);font-family:'IBM Plex Mono',monospace;}
.ee-td-warn{margin-top:8px;font-size:11px;color:#E0A33E;line-height:1.4;}
.ee-bt{margin-bottom:14px;border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--ink);}
.ee-bt-h{display:flex;justify-content:space-between;align-items:baseline;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;margin-bottom:4px;}
.ee-bt-rate{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;}
.ee-bt-sub{font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:10px;}
.ee-bt-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.ee-bt-table th{text-align:left;color:var(--muted);font-weight:500;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;padding:5px 8px;border-bottom:1px solid var(--line);}
.ee-bt-table td{padding:6px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;}
.ee-bt-table tr:last-child td{border-bottom:none;}
.ee-bt-warn{margin-top:9px;font-size:11px;color:var(--muted);line-height:1.4;}
.ee-pchart{margin-bottom:14px;border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--ink);}
.ee-pchart-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;}
.ee-pchart-title{font-size:12.5px;color:var(--muted);}
.ee-pchart-btns{display:flex;gap:4px;}
.ee-pchart-b{background:none;border:1px solid var(--line);color:var(--muted);border-radius:6px;padding:2px 9px;font-size:11px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ee-pchart-b:hover{color:var(--text);}
.ee-pchart-b.on{color:var(--gold);border-color:var(--gold);}
.ee-pchart-svg{width:100%;height:170px;display:block;}
.ee-pchart-foot{font-size:10.5px;color:var(--muted);margin-top:6px;}
.ee-gap{margin-bottom:14px;border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--ink);}
.ee-gap-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:13.5px;margin-bottom:4px;flex-wrap:wrap;}
.ee-gap-rate{font-family:'IBM Plex Mono',monospace;font-size:13px;}
.ee-gap-sub{font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:10px;}
.ee-gap-list{display:flex;flex-wrap:wrap;gap:6px;}
.ee-gap-chip{font-family:'IBM Plex Mono',monospace;font-size:11px;border:1px solid;border-radius:6px;padding:2px 7px;}
.ee-gap-warn{margin-top:9px;font-size:11px;color:#E0A33E;line-height:1.4;}
.ee-bt-5m{display:inline-block;margin-left:5px;font-size:9px;font-weight:600;color:var(--gold);border:1px solid var(--gold);border-radius:4px;padding:0 4px;vertical-align:middle;}
.ee-llm{margin-bottom:14px;border:1px solid;border-radius:10px;padding:14px;background:var(--ink);}
.ee-llm-cap{font-size:10.5px;color:var(--gold);margin-bottom:11px;font-family:'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase;}
.ee-llm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.ee-llm-cell{display:flex;flex-direction:column;gap:3px;border:1px solid var(--line);border-radius:8px;padding:11px;}
.ee-llm-lbl{font-size:11px;color:var(--muted);}
.ee-llm-word{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:21px;letter-spacing:.03em;}
.ee-llm-sub{font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace;}
.ee-llm-flag{margin-top:11px;font-size:12px;line-height:1.5;color:#E0A33E;background:rgba(224,163,62,.08);border:1px solid rgba(224,163,62,.35);border-radius:7px;padding:8px 10px;}
.ee-llm-flag b{color:#E0A33E;}
.ee-llm-reason{margin-top:11px;font-size:13px;line-height:1.55;color:var(--text);}
.ee-llm-warn{margin-top:9px;font-size:11px;color:#E0A33E;line-height:1.4;}
.ee-lean-details{margin-bottom:18px;}
.ee-lean-details>summary{cursor:pointer;font-size:12px;color:var(--muted);font-family:'IBM Plex Mono',monospace;padding:6px 0;}
.ee-lean-details>summary:hover{color:var(--text);}
.ee-lean-details .ee-lean{margin-top:8px;}
.ee-lean{margin-bottom:18px;border:1px solid;border-radius:10px;padding:14px;background:var(--ink);}
.ee-lean-cap{font-size:10.5px;color:var(--muted);margin-bottom:8px;font-family:'IBM Plex Mono',monospace;letter-spacing:.02em;}
.ee-lean-cap b{color:#E0A33E;}
.ee-news{margin-top:16px;border-top:1px solid var(--line);padding-top:14px;}
.ee-news-h{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:11px;display:flex;justify-content:space-between;align-items:center;}
.ee-news-tally{font-size:11px;letter-spacing:.04em;color:var(--muted);}
.ee-news-item{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--text);font-size:12.5px;line-height:1.4;}
.ee-news-item:last-of-type{border-bottom:none;}
.ee-news-item:hover .ee-news-t{color:var(--gold);}
.ee-news-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.ee-news-t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ee-news-pub{font-size:10.5px;color:var(--muted);flex-shrink:0;font-family:'IBM Plex Mono',monospace;}
.ee-news-warn{margin-top:9px;font-size:11px;color:var(--muted);line-height:1.4;}
.ee-post{margin-top:16px;border-top:1px solid var(--line);padding-top:14px;}
.ee-post-btn{width:100%;background:var(--gold);color:#1a1206;border:none;border-radius:9px;padding:11px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Space Grotesk',sans-serif;transition:filter .15s;}
.ee-post-btn:hover:not(:disabled){filter:brightness(1.08);}
.ee-post-btn:disabled{opacity:.6;cursor:wait;}
.ee-post-out{display:grid;gap:10px;margin-top:12px;}
.ee-post-card{background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:11px;}
.ee-post-h{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.ee-post-copy{background:none;border:1px solid var(--line);color:var(--gold);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ee-post-copy:hover{border-color:var(--gold);}
.ee-post-text{font-size:13px;line-height:1.55;color:var(--text);white-space:pre-wrap;}
.ee-post-img{margin-top:12px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;}
.ee-post-img img{width:100%;max-width:360px;border-radius:10px;border:1px solid var(--line);}
.ee-pub{margin-top:14px;border-top:1px solid var(--line);padding-top:12px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;}
.ee-pub-h{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);width:100%;}
.ee-pub-chk{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);cursor:pointer;}
.ee-pub-res{width:100%;font-size:12px;font-family:'IBM Plex Mono',monospace;line-height:1.6;}
.ee-lean-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;}
.ee-lean-word{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;letter-spacing:.04em;}
.ee-lean-nums{font-size:12px;color:var(--muted);}
.ee-lean-nums b{color:var(--text);font-family:'IBM Plex Mono',monospace;}
.ee-lean-bar{height:8px;background:var(--surface2);border-radius:5px;overflow:hidden;margin:10px 0 12px;}
.ee-lean-fill{height:100%;border-radius:5px;transition:width .5s ease;}
.ee-lean-sigs{display:grid;gap:6px;}
.ee-lean-sig{display:grid;grid-template-columns:1fr 84px 58px;align-items:center;gap:10px;font-size:12px;}
.ee-lean-sl{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ee-lean-sbar{position:relative;height:6px;background:var(--surface2);border-radius:4px;}
.ee-lean-sbar::before{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line);}
.ee-lean-sbar i{position:absolute;top:50%;width:8px;height:8px;border-radius:50%;transform:translate(-50%,-50%);}
.ee-lean-sr{text-align:right;font-family:'IBM Plex Mono',monospace;font-size:11.5px;}
.ee-lean-warn{margin-top:10px;font-size:11px;color:#E0A33E;line-height:1.45;}
.ee-factors{display:grid;gap:11px;}
.ee-factor{display:grid;grid-template-columns:1fr 90px 56px;align-items:center;gap:12px;}
.ee-factor-l{display:flex;flex-direction:column;}
.ee-factor-label{font-size:13px;}
.ee-factor-hint{font-size:11px;color:var(--muted);margin-top:1px;}
.ee-factor-bar{height:7px;background:var(--ink);border-radius:4px;overflow:hidden;}
.ee-factor-fill{height:100%;border-radius:4px;transition:width .5s ease;}
.ee-factor-raw{font-family:'IBM Plex Mono',monospace;font-size:13px;text-align:right;font-variant-numeric:tabular-nums;}
.ee-factor-none{color:var(--muted);font-size:13px;}
.ee-risk{margin-top:16px;border-top:1px solid var(--line);padding-top:14px;}
.ee-risk-h{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:11px;}
.ee-risk-inputs{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:13px;}
.ee-risk-acc{background:var(--ink);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:9px 11px;font-size:14px;font-family:'IBM Plex Mono',monospace;width:120px;outline:none;}
.ee-risk-acc:focus{border-color:var(--gold);box-shadow:0 0 0 2px rgba(214,164,69,.2);}
.ee-risk-rk{flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);}
.ee-risk-rk b{color:var(--gold);font-family:'IBM Plex Mono',monospace;}
.ee-risk-rk input[type=range]{width:100%;accent-color:var(--gold);}
.ee-risk-empty{font-size:12.5px;color:var(--muted);line-height:1.5;}
.ee-risk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.ee-risk-grid>div{display:flex;flex-direction:column;gap:3px;}
.ee-risk-grid span{font-size:11px;color:var(--muted);}
.ee-risk-grid b{font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;}
.ee-risk-note{margin-top:10px;font-size:11.5px;color:var(--muted);}
.ee-risk-warn{color:#e0a33e;}
.ee-note{margin-top:14px;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:11px;line-height:1.5;}
.ee-research{margin-top:16px;border-top:1px solid var(--line);padding-top:14px;}
.ee-research-h{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:11px;}
.ee-research-tabs{display:flex;flex-wrap:wrap;gap:7px;}
.ee-rtab{background:var(--ink);border:1px solid var(--line);color:var(--text);border-radius:7px;padding:7px 11px;font-size:12px;cursor:pointer;transition:border-color .14s,background .14s;font-family:'Inter',sans-serif;}
.ee-rtab:hover{border-color:var(--gold);}
.ee-rtab--on{border-color:var(--gold);background:var(--surface2);color:var(--gold);}
.ee-research-body{margin-top:12px;}
.ee-research-text{font-size:13.5px;line-height:1.6;color:var(--text);white-space:pre-wrap;}
.ee-research-err{font-size:12.5px;color:#C8553D;}
.ee-foot{margin-top:26px;font-size:11.5px;color:var(--muted);line-height:1.6;border-top:1px solid var(--line);padding-top:16px;}
.ee-logbtn{width:100%;background:none;border:1px dashed var(--line);color:var(--gold);border-radius:9px;padding:10px;font-size:13px;cursor:pointer;margin-bottom:16px;font-family:'IBM Plex Mono',monospace;transition:border-color .14s;}
.ee-logbtn:hover{border-color:var(--gold);}
.ee-journal{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:18px;}
.ee-jr-head{display:flex;justify-content:space-between;align-items:center;}
.ee-jr-title{font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:700;margin:0;}
.ee-jr-toggle{background:none;border:none;color:var(--muted);font-size:12.5px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ee-jr-toggle:hover{color:var(--text);}
.ee-jr-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0;}
.ee-jr-stats>div{display:flex;flex-direction:column;gap:3px;}
.ee-jr-stats span{font-size:10.5px;color:var(--muted);}
.ee-jr-stats b{font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;}
.ee-jr-empty{font-size:13px;color:var(--muted);line-height:1.5;margin:12px 0;}
.ee-jr-list{display:grid;gap:9px;margin-top:6px;}
.ee-trade{position:relative;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:11px 12px;padding-right:28px;}
.ee-trade--closed{opacity:.92;}
.ee-trade-x{position:absolute;top:8px;right:9px;background:none;border:none;color:var(--muted);font-size:18px;line-height:1;cursor:pointer;}
.ee-trade-x:hover{color:var(--text);}
.ee-trade-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px;}
.ee-trade-tic{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;}
.ee-trade-date{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);}
.ee-trade-pred{font-family:'IBM Plex Mono',monospace;font-size:11px;}
.ee-trade-close{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.ee-trade-close label{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:5px;}
.ee-trade-in{background:var(--surface);border:1px solid var(--line);color:var(--text);border-radius:6px;padding:6px 8px;font-size:13px;font-family:'IBM Plex Mono',monospace;width:74px;outline:none;}
.ee-trade-in:focus{border-color:var(--gold);}
.ee-trade-fechar{background:var(--gold);color:#1a1206;border:none;border-radius:7px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Space Grotesk',sans-serif;}
.ee-trade-result{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--muted);}
.ee-trade-result b{font-size:15px;}
.ee-trade-hit{font-size:11px;padding:2px 7px;border:1px solid var(--line);border-radius:5px;}
.ee-jr-warn{font-size:11px;color:#E0A33E;margin-top:11px;}
.ee-journal{order:4;}
@media (max-width:520px){
  .ee-title{font-size:32px;}
  .ee-factor{grid-template-columns:1fr 60px 50px;gap:8px;}
  .ee-factor-hint{display:none;}
  .ee-score{font-size:40px;}
  .ee-risk-grid{grid-template-columns:repeat(2,1fr);}
  .ee-cal-go{display:none;}
  .ee-jr-stats{grid-template-columns:repeat(2,1fr);}
}
.ee-cal{order:5;}
.ee-foot{order:6;}
.ee-card--pending{display:flex;flex-direction:column;gap:8px;}
.ee-pending{display:flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:15px;color:var(--text);}
.ee-pending-t b{color:var(--gold);}
.ee-pending-sub{font-size:12.5px;color:var(--muted);line-height:1.5;}
.ee-card--err{}
.ee-err-t{font-size:15px;margin-bottom:6px;padding-right:24px;}
.ee-err-t b{color:#C8553D;}
.ee-err-m{font-size:12px;color:var(--muted);margin-bottom:13px;font-family:'IBM Plex Mono',monospace;line-height:1.5;}
.ee-err-retry{background:none;border:1px solid var(--line);color:var(--gold);border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ee-err-retry:hover{border-color:var(--gold);}
.ee-srcline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
.ee-badge{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.06em;border-radius:6px;padding:3px 8px;}
.ee-theme{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.04em;border:1px solid;border-radius:6px;padding:3px 8px;}
.ee-cal-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block;}
.ee-cal-dot--off{background:transparent;border:1px solid var(--line);}
.ee-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:8px 0 2px;padding-bottom:10px;border-bottom:1px solid var(--line);}
.ee-legend-toggle{background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;font-family:'IBM Plex Mono',monospace;padding:8px 0 4px;}
.ee-legend-toggle:hover{color:var(--text);}
.ee-legend-item{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);}
.ee-legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.ee-analyze-all{flex:1;background:var(--gold);color:#1a1206;border:none;border-radius:9px;padding:11px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Space Grotesk',sans-serif;transition:filter .15s;}
.ee-analyze-all:hover:not(:disabled){filter:brightness(1.08);}
.ee-analyze-all:disabled{opacity:.55;cursor:wait;}
.ee-sel-bar{display:flex;align-items:center;gap:8px;margin:10px 0 4px;}
.ee-sel-clear{background:none;border:1px solid var(--line);color:var(--text-dim);border-radius:9px;padding:11px 13px;font-size:13px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ee-sel-clear:disabled{opacity:.5;cursor:wait;}
.ee-sel-hint{font-size:12.5px;color:var(--text-dim);line-height:1.4;padding:2px 2px 0;}
.ee-cal-check{width:18px;height:18px;border:1.5px solid var(--line);border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--ink);font-weight:700;transition:background .12s,border-color .12s;}
.ee-cal-check--on{background:var(--gold);border-color:var(--gold);}
.ee-cal-row--sel{border-color:var(--gold);background:rgba(224,163,62,.08);}
.ee-badge--est{color:#E0A33E;border:1px solid #E0A33E;}
.ee-badge--live{color:#2FA37A;border:1px solid #2FA37A;}
.ee-refresh-live{background:none;border:1px solid var(--line);color:var(--gold);border-radius:7px;padding:5px 11px;font-size:11.5px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ee-refresh-live:hover:not(:disabled){border-color:var(--gold);}
.ee-refresh-live:disabled{opacity:.6;cursor:wait;}
.ee-refresh-err{font-size:11px;color:#C8553D;}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
`;
