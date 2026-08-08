import { useState, useEffect, useMemo, useRef } from "react";
import { fetchPublished, fetchPositions, fetchPrices, daysBetween, subscribeEmail, fetchHistory, fetchSettings, fetchLedger, fetchTape } from "./picks.js";
import { WD, exchOf, fmtDay, fmtName, featuredList, FEATURED_MAX } from "./shared.js";

export const eur = (n) => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("pt-PT");
const CUR_SYM = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF ", CAD: "C$", AUD: "A$", HKD: "HK$", SGD: "S$", NOK: "kr ", DKK: "kr ", SEK: "kr ", PLN: "zł " };
export const fmtPrice = (v, cur = "USD") => v == null ? "—" : (CUR_SYM[cur] || cur + " ") + Number(v).toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const recoColor = (r) => r === "SUBIR" ? "#2FA37A" : r === "DESCER" ? "#C8553D" : "#D6A445"; // SUBIR verde · DESCER vermelho · NEUTRO dourado
export const probColor = (v) => v == null ? "#8CA3B3" : v >= 55 ? "#2FA37A" : v <= 45 ? "#C8553D" : "#D6A445"; // cor pela probabilidade de subir

const PALETTE = ["#2FA37A", "#D6A445", "#4F86C6", "#C8553D", "#8E7CC3", "#5BA3A0", "#C77DAB", "#B5843A"];
const colorFor = (s) => PALETTE[[...String(s || "x")].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
export function Mono({ ticker, sector }) {
  const init = String(ticker || "").replace(/\..*/, "").slice(0, 3);
  return <span className="ts-mono" style={{ background: colorFor(sector || ticker) }}>{init}</span>;
}
// Logo real da empresa (por ticker, via FMP; fallback favicon do site; senão iniciais).
export function CompanyLogo({ ticker, sector, website }) {
  const [step, setStep] = useState(0); // 0=FMP · 1=favicon · 2=iniciais
  const t = String(ticker || "").replace(/\..*/, "");
  const domain = website ? String(website).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*/, "").trim() : "";
  if (t && step === 0) return <img className="ts-mono ts-logoimg" src={`https://financialmodelingprep.com/image-stock/${t}.png`} alt={ticker} loading="lazy" onError={() => setStep(domain ? 1 : 2)} />;
  if (domain && step === 1) return <img className="ts-mono ts-logoimg" src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={ticker} loading="lazy" onError={() => setStep(2)} />;
  return <Mono ticker={ticker} sector={sector} />;
}
const SPARK_PER = [["semana", "Sem"], ["mes", "Mês"], ["3m", "3M"], ["6m", "6M"], ["ano", "Ano"]];
const SPARK_N = { semana: 5, mes: 22, "3m": 63, "6m": 126, ano: 260 };
export function Spark({ hist, marks }) {
  const [per, setPer] = useState("ano");
  if (!hist || hist.length < 2) return null;
  const data = hist.slice(-SPARK_N[per]);
  if (data.length < 2) return null;
  const cs = data.map((x) => x.c), min = Math.min(...cs), max = Math.max(...cs), W = 300, H = 70;
  const px = (i) => (i * W / (data.length - 1));
  const py = (c) => H - (c - min) / (max - min || 1) * H;
  const path = data.map((x, i) => (i ? "L" : "M") + px(i).toFixed(1) + " " + py(x.c).toFixed(1)).join(" ");
  const up = cs[cs.length - 1] >= cs[0];
  const markSet = new Set(marks || []);
  return (
    <div className="ts-sparkwrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="ts-spark" preserveAspectRatio="none">
        {data.map((x, i) => markSet.has(x.d) ? <line key={i} x1={px(i)} y1="0" x2={px(i)} y2={H} stroke="#D6A445" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" /> : null)}
        <path d={path} fill="none" stroke={up ? "#2FA37A" : "#C8553D"} strokeWidth="1.6" />
      </svg>
      <div className="ts-sparkbtns">
        {SPARK_PER.map(([k, l]) => <button key={k} className={per === k ? "on" : ""} onClick={(e) => { e.stopPropagation(); setPer(k); }}>{l}</button>)}
      </div>
    </div>
  );
}

// navegação para a página de uma ação
export const goStock = (t) => { if (t) window.location.hash = "#stock/" + String(t).toUpperCase(); };

// curva de equity do método (capital base + P/L acumulado)
function EquityChart({ equity }) {
  if (!equity || equity.length < 2) return null;
  const vs = equity.map((x) => x.saldo), min = Math.min(...vs), max = Math.max(...vs), W = 600, H = 130;
  const px = (i) => (i * W / (equity.length - 1));
  const py = (v) => H - (v - min) / (max - min || 1) * H;
  const path = equity.map((x, i) => (i ? "L" : "M") + px(i).toFixed(1) + " " + py(x.saldo).toFixed(1)).join(" ");
  const area = path + ` L ${W} ${H} L 0 ${H} Z`;
  const up = vs[vs.length - 1] >= vs[0];
  const col = up ? "#2FA37A" : "#C8553D";
  return (
    <div className="ts-equity">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ts-equitysvg">
        <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.28" /><stop offset="100%" stopColor={col} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#eqg)" stroke="none" />
        <path d={path} fill="none" stroke={col} strokeWidth="2" />
      </svg>
      <div className="ts-equityax"><span>{eur(min)}</span><span>{eur(max)}</span></div>
    </div>
  );
}

// barra inferior de cotações (índices + ações) a rolar
function TickerTape({ items }) {
  if (!items || !items.length) return null;
  const NAMES = { "^GSPC": "S&P 500", "^IXIC": "Nasdaq", "^DJI": "Dow Jones", "EURUSD=X": "EUR/USD" };
  const row = items.map((q) => {
    const up = (q.change ?? 0) >= 0;
    const label = NAMES[q.symbol] || q.symbol;
    const isIdx = q.symbol.startsWith("^") || q.symbol.includes("=");
    return (
      <span className={"ts-tapeitem" + (isIdx ? " idx" : "")} key={q.symbol} onClick={() => !isIdx && goStock(q.symbol)}>
        <b>{label}</b>
        <span>{q.price != null ? q.price.toLocaleString("pt-PT", { maximumFractionDigits: 2 }) : "—"}</span>
        {q.change != null && <em style={{ color: up ? "#2FA37A" : "#C8553D" }}>{up ? "▲" : "▼"} {Math.abs(q.change).toFixed(2)}%</em>}
      </span>
    );
  });
  return (
    <div className="ts-tape">
      <div className="ts-tapetrack">{row}{row}</div>
    </div>
  );
}

const RESEARCH_LABELS = { financial: "Análise financeira", equity: "Análise de ações", earnings: "Revisão de resultados", market: "Análise de mercado" };
const THEME_LABELS = { ai: "IA & Software", cloud: "Cloud", cyber: "Cibersegurança", semis: "Semicondutores", memory: "Memória", datacenter: "Data centers", networking: "Redes", storage: "Armazenamento", finance: "Finanças", crypto: "Cripto", health: "Saúde", consumer: "Consumo", powergrid: "Energia", industrial: "Industrial", defense: "Defesa & Espaço", ev: "Veículos elétricos", solar: "Solar", minerals: "Minerais", gaming: "Media & Gaming" };
// mini-barra -1..+1 (sinais) ou centrada em 0 (reações %)
function SigBar({ v, max = 1 }) {
  const pct = Math.max(-1, Math.min(1, v / max));
  const w = Math.abs(pct) * 100; // enche da esquerda para a direita; magnitude = comprimento, sinal = cor
  const col = pct >= 0 ? "#2FA37A" : "#C8553D";
  return <span className="ts-sigbar"><span className="ts-sigfill" style={{ width: w + "%", left: 0, background: col }} /></span>;
}
// célula compacta de métrica no card das Previsões (valor + barra opcional)
function FtCell({ l, v, c, sub, fill, fillc, sig, sigmax }) {
  return (
    <div className="ts-ftcell">
      <span className="ts-ftcl">{l}</span>
      <b style={c ? { color: c } : undefined}>{v}</b>
      {sub && <small>{sub}</small>}
      {fill != null && <span className="ts-fill"><span style={{ width: Math.max(0, Math.min(100, fill)) + "%", background: fillc || "#8CA3B3" }} /></span>}
      {sig != null && <SigBar v={sig} max={sigmax || 1} />}
    </div>
  );
}

// Modal de detalhe (abre ao clicar 2× numa ação). Mostra métricas + gráfico + pesquisa aprofundada.
export function StockModal({ pick, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!pick) return null;
  const p = pick;
  const M = ({ l, v, c }) => v == null || v === "" ? null : <div className="ts-mmetric"><span>{l}</span><b style={c ? { color: c } : undefined}>{v}</b></div>;
  return (
    <div className="ts-modal" onClick={onClose}>
      <div className="ts-modalbox" onClick={(e) => e.stopPropagation()}>
        <button className="ts-modalx" onClick={onClose}>✕</button>
        <div className="ts-modalhd"><CompanyLogo ticker={p.ticker} sector={p.sector} website={p.website} /><div><div className="ts-tptic">{p.ticker} <span className="ts-aitag">IA</span></div><div className="ts-tpname">{fmtName(p.name)}{p.isin && <span className="ts-isin"> · ISIN {p.isin}</span>}</div></div>{p.probUp != null && <span className="ts-ftbadge" style={{ background: probColor(p.probUp), marginLeft: "auto" }}>↑ {p.probUp}%</span>}</div>
        {p.history && p.history.length > 1 && <div className="ts-tpchart" style={{ width: "100%", margin: "12px 0" }}><Spark hist={p.history} marks={p.earningsMarks} /></div>}
        <div className="ts-mmetrics">
          <M l="Probabilidade de subir" v={p.probUp != null ? p.probUp + "%" : null} c={probColor(p.probUp)} />
          <M l="Valor esperado" v={p.ev != null ? (p.ev >= 0 ? "+" : "") + p.ev + "%" : null} c={p.ev >= 0 ? "#2FA37A" : "#C8553D"} />
          <M l="Preço" v={p.price != null ? fmtPrice(p.price, p.currency) : null} />
          <M l={p.earningsDate ? "Resultados" : "Entrar"} v={(p.earningsDate || p.entryISO) ? fmtDay(p.earningsDate || p.entryISO) : null} />
          <M l="Gap médio" v={p.gapAvg != null ? (p.gapAvg >= 0 ? "+" : "") + p.gapAvg + "%" + (p.gapPctUp != null ? ` · ${p.gapPctUp}%↑` : "") : null} c={p.gapAvg >= 0 ? "#2FA37A" : "#C8553D"} />
          <M l="Movimento implícito" v={p.impliedMove != null ? "±" + p.impliedMove + "%" : null} />
          <M l="Momentum (1 mês)" v={p.momentum != null ? (p.momentum >= 0 ? "+" : "") + p.momentum + "%" : null} c={p.momentum >= 0 ? "#2FA37A" : "#C8553D"} />
          <M l="RSI (14)" v={p.rsi != null ? String(p.rsi) : null} />
          <M l="Tendência" v={p.trend === "bullish" ? "alta" : p.trend === "bearish" ? "baixa" : p.trend ? "neutra" : null} />
          <M l="Analistas" v={p.analyst === "bullish" ? "otimistas" : p.analyst === "bearish" ? "pessimistas" : p.analyst ? "neutros" : null} />
          <M l="Potencial vs alvo" v={p.targetUpside != null ? (p.targetUpside >= 0 ? "+" : "") + p.targetUpside + "%" : null} c={p.targetUpside >= 0 ? "#2FA37A" : "#C8553D"} />
          <M l="Beat (EPS)" v={p.beatRate != null ? p.beatRate + "%" : null} />
        </div>
        <div className="ts-modalfoot"><span className="ts-tpnote">Probabilidade/opinião, não recomendação.</span></div>
      </div>
    </div>
  );
}
// Escolha do trader — a pick que o admin marcou com ★. Card grande no topo, clicável.
function TraderPick({ pick, onDetail }) {
  if (!pick) return null;
  const p = pick;
  const conv = p.confidence == null ? null : p.confidence >= 60 ? "alta" : p.confidence >= 40 ? "média" : "baixa";
  const convC = conv === "alta" ? "#2FA37A" : conv === "média" ? "#D6A445" : "#C8553D";
  const target = (p.targetUpside != null && p.price != null) ? { px: (p.price * (1 + p.targetUpside / 100)).toFixed(0), up: p.targetUpside } : null;
  const stopPx = p.price != null ? (p.price * 0.9).toFixed(0) : null;
  const entryTxt = (p.when === "BMO" ? "pré-abertura" : p.when === "AMC" ? "após fecho" : "") + (p.buyBy ? " · " + p.buyBy : p.entryISO ? " · " + fmtDay(p.entryISO) : "");
  return (
      <div className="ts-tpcard" style={{ borderColor: probColor(p.probUp) }} onClick={() => onDetail && onDetail(p)}>
        <div className="ts-tphead">
          <span className="ts-tplabel">★ Escolha do trader</span>
          <span className="ts-tpbadges">
            {conv && <span className="ts-convchip" style={{ borderColor: convC, color: convC }}>convicção {conv}</span>}
            {p.probUp != null && <span className="ts-ftbadge" style={{ background: probColor(p.probUp) }}>↑ {p.probUp}% subir</span>}
          </span>
        </div>

        <div className="ts-tpbody">
          <div className="ts-tpleft">
            <div className="ts-tptop"><CompanyLogo ticker={p.ticker} sector={p.sector} website={p.website} /><div><div className="ts-tptic">{p.ticker} <span className="ts-aitag">IA</span>{p.sector && THEME_LABELS[p.sector] && <span className="ts-themetag">{THEME_LABELS[p.sector]}</span>}</div><div className="ts-tpname">{fmtName(p.name)}{p.isin && <span className="ts-isin"> · ISIN {p.isin}</span>}</div></div></div>
            {p.nota && <div className="ts-tpnota">“{p.nota}”</div>}
          </div>
          {p.history && p.history.length > 1 && <div className="ts-tpchart"><Spark hist={p.history} marks={p.earningsMarks} /></div>}
        </div>

        {/* Plano de trade: entrada → alvo → stop */}
        <div className="ts-tpplan">
          <div className="ts-tpplanstep"><span>1 · Entrada</span><b>{entryTxt || (p.entryISO ? fmtDay(p.entryISO) : "—")}</b></div>
          <span className="ts-tpplanarr">→</span>
          <div className="ts-tpplanstep"><span>2 · Alvo</span><b style={{ color: "#2FA37A" }}>{target ? `${fmtPrice(target.px, p.currency)} (${target.up >= 0 ? "+" : ""}${target.up}%)` : "—"}</b></div>
          <span className="ts-tpplanarr">→</span>
          <div className="ts-tpplanstep ts-tpplanstop"><span>3 · Stop</span><b style={{ color: "#C8553D" }}>−10%{stopPx ? ` · ${fmtPrice(stopPx, p.currency)}` : ""}</b></div>
        </div>

        {/* Decisão */}
        <div className="ts-tpgroup">
          <h4>Decisão</h4>
          <div className="ts-ftgrid">
            {p.probUp != null && <FtCell l="Prob. subir" v={p.probUp + "%"} c={probColor(p.probUp)} fill={p.probUp} fillc={probColor(p.probUp)} />}
            {p.ev != null && <FtCell l="Valor esperado" v={(p.ev >= 0 ? "+" : "") + p.ev + "%/trade"} c={p.ev >= 0 ? "#2FA37A" : "#C8553D"} sig={p.ev} sigmax={12} />}
          </div>
        </div>

        {/* Mercado */}
        <div className="ts-tpgroup">
          <h4>Mercado</h4>
          <div className="ts-ftgrid">
            {p.price != null && <FtCell l="Preço" v={fmtPrice(p.price, p.currency)} />}
            {p.gapAvg != null && <FtCell l="Gap médio" v={(p.gapAvg >= 0 ? "+" : "") + p.gapAvg + "%"} c={p.gapAvg >= 0 ? "#2FA37A" : "#C8553D"} sub={p.gapPctUp != null ? p.gapPctUp + "% sobem" : ""} sig={p.gapAvg} sigmax={10} />}
            {p.impliedMove != null && <FtCell l="Mov. implícito" v={"±" + p.impliedMove + "%"} fill={Math.min(100, p.impliedMove * 5)} fillc="#8CA3B3" />}
            {p.momentum != null && <FtCell l="Momentum 1m" v={(p.momentum >= 0 ? "+" : "") + p.momentum + "%"} c={p.momentum >= 0 ? "#2FA37A" : "#C8553D"} sig={p.momentum} sigmax={15} />}
            {p.rsi != null && <FtCell l={"RSI" + (p.trend ? " · " + (p.trend === "bullish" ? "alta" : p.trend === "bearish" ? "baixa" : "neutra") : "")} v={String(p.rsi)} fill={p.rsi} fillc={p.rsi >= 70 ? "#C8553D" : p.rsi <= 30 ? "#2FA37A" : "#8CA3B3"} />}
            {p.analyst && <FtCell l="Analistas" v={p.analyst === "bullish" ? "otimistas" : p.analyst === "bearish" ? "pessimistas" : "neutros"} c={p.analyst === "bullish" ? "#2FA37A" : p.analyst === "bearish" ? "#C8553D" : "var(--tx)"} sub={p.targetUpside != null ? "alvo " + (p.targetUpside >= 0 ? "+" : "") + p.targetUpside + "%" : ""} />}
            {p.beatRate != null && <FtCell l="Beat (EPS)" v={p.beatRate + "%"} fill={p.beatRate} fillc="#8CA3B3" />}
          </div>
        </div>

        {/* Contexto & incerteza */}
        {(p.signals?.length || p.reactions?.length || p.shortPct != null || p.reactionN) && (
          <div className="ts-tpgroup" onClick={(e) => e.stopPropagation()}>
            <h4>Contexto & incerteza</h4>
            <div className="ts-tpsighint">⚠ Sinais = leitura de incerteza, não previsão. A direção nos resultados é quase <b>moeda ao ar</b> — sem edge provado (backtest ~48%).</div>
            {p.signals?.length > 0 && (
              <div className="ts-tpsiggrid">
                {p.signals.map((s) => <div key={s.key} className="ts-tpsigrow"><span className="ts-tpsigl">{s.label}</span><SigBar v={s.v} /><em>{s.raw}</em></div>)}
              </div>
            )}
            {p.reactions?.length > 0 && (
              <div className="ts-tpreac">
                <span className="ts-tpsiglbl">Reações passadas nos resultados (drift ~1 mês):</span>
                <div className="ts-tpreacbars">{p.reactions.map((r, i) => <span key={i} className="ts-tpreacbar" title={(r >= 0 ? "+" : "") + r + "%"}><span style={{ height: Math.min(100, Math.abs(r) * 3) + "%", background: r >= 0 ? "#2FA37A" : "#C8553D" }} /></span>)}</div>
              </div>
            )}
            <div className="ts-tpextra">
              {p.reactionLow != null && p.reactionHigh != null && <span><b>Reação típica:</b> {p.reactionLow}%…{p.reactionHigh}% (±1σ){p.reactionMin != null ? ` · extremos ${p.reactionMin}%…${p.reactionMax}%` : ""}{p.reactionN ? ` · ${p.reactionN} amostras` : ""}</span>}
              {p.shortPct != null && <span><b>Short interest:</b> {p.shortPct}% do float</span>}
              {p.confidence != null && <span><b>Confiança IA:</b> {p.confidence}%{p.signals?.length ? ` · ${p.signals.length} sinais` : ""}{p.reactionN ? ` · ${p.reactionN} reações` : ""}</span>}
            </div>
          </div>
        )}
        <div className="ts-tpfoot"><span className="ts-tpnote">Probabilidade/opinião, não recomendação.</span></div>
      </div>
  );
}

const POSTS = [
  { tag: "Educação", title: "O que é o gap de earnings", body: "A reação imediata de uma ação aos resultados (fecho antes → abertura depois). É das jogadas mais imprevisíveis — bater estimativas não garante subir (sell-the-news)." },
  { tag: "Risco", title: "Porque o tamanho da posição manda", body: "Um único gap de −10% pode apagar 4-5 pequenos ganhos. Arriscar só uma fração pequena da conta por trade é o que te mantém no jogo. Nunca com alavancagem em overnight de earnings." },
  { tag: "Método", title: "Comprar antes vs entrar depois (PEAD)", body: "Comprar antes = apostas na direção do gap (≈ moeda ao ar). O drift pós-resultados (~1 mês) tem base académica mais sólida, mas continua incerto. Nada é garantido." },
];

function Logo() {
  return (
    <svg className="ts-logo" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#16232F" stroke="#2A3E4E" />
      <rect x="8" y="17" width="3.4" height="8" rx="1" fill="#8CA3B3" />
      <rect x="14.3" y="12" width="3.4" height="13" rx="1" fill="#D6A445" />
      <rect x="20.6" y="8" width="3.4" height="17" rx="1" fill="#2FA37A" />
      <path d="M7 15 L14 12 L22 7" fill="none" stroke="#D6A445" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem("ee_cookie_consent")) setShow(true); } catch {} }, []);
  const choose = (v) => { try { localStorage.setItem("ee_cookie_consent", v); } catch {} setShow(false); };
  if (!show) return null;
  return (
    <div className="ts-cookie">
      <div className="ts-cookietxt">Usamos cookies <b>essenciais</b> para o site funcionar. Cookies opcionais (análise) só com o teu consentimento. <a href="#legal-cookies">Política de cookies</a>.</div>
      <div className="ts-cookiebtns">
        <button className="ts-btn ts-btnghost" onClick={() => choose("essential")}>Só essenciais</button>
        <button className="ts-btn" onClick={() => choose("all")}>Aceitar todos</button>
      </div>
    </div>
  );
}

export function Featured({ picks, suspenso, onDetail }) {
  const list = Object.values(picks || {}).filter((p) => p.show)
    .sort((a, b) => (a.entryISO || a.date || "").localeCompare(b.entryISO || b.date || ""))
    .slice(0, 8); // as próximas 8 publicadas (EUA, por data)
  if (!list.length) return null;
  return (
    <div className="ts-featwrap">
      {list.map((p) => {
        const hasA = p.probUp != null || p.confidence != null || p.impliedMove != null || p.ev != null || p.gapUp != null || p.momentum != null || p.rsi != null || p.analyst || p.beatRate != null || p.history;
        return (
          <div className="ts-feat ts-feat--clk" key={p.ticker} style={{ borderTopColor: probColor(p.probUp) }}
            onClick={() => onDetail && onDetail(p)}
            title={"Clica para ver o detalhe de " + p.ticker}>
            <div className="ts-feathd"><span className="ts-fttic"><CompanyLogo ticker={p.ticker} sector={p.sector} website={p.website} /> {p.ticker} <span className="ts-aitag" title="Análise assistida por IA">IA</span></span>{suspenso ? <span className="ts-ftbadge" style={{ background: "#8CA3B3" }}>SUSPENSO</span> : p.probUp != null ? <span className="ts-ftbadge" style={{ background: probColor(p.probUp) }}>↑ {p.probUp}%</span> : null}</div>
            <div className="ts-ftname">{fmtName(p.name)}{p.sector && THEME_LABELS[p.sector] && <span className="ts-themetag">{THEME_LABELS[p.sector]}</span>}</div>
            <div className="ts-ftmeta">{p.exch || "EUA"}{p.entryISO ? " · entrar " + fmtDay(p.entryISO) : ""}</div>
            {hasA && !suspenso && (
              <>
                {p.history && <div className="ts-ftspark"><Spark hist={p.history} marks={p.earningsMarks} /></div>}
                <div className="ts-ftgrid">
                  {p.probUp != null && <FtCell l="Prob. subir" v={p.probUp + "%"} c={probColor(p.probUp)} fill={p.probUp} fillc={probColor(p.probUp)} />}
                  {p.ev != null && <FtCell l="Valor esperado" v={(p.ev >= 0 ? "+" : "") + p.ev + "%"} c={p.ev >= 0 ? "#2FA37A" : "#C8553D"} sig={p.ev} sigmax={12} />}
                  {p.gapAvg != null && <FtCell l="Gap médio" v={(p.gapAvg >= 0 ? "+" : "") + p.gapAvg + "%"} c={p.gapAvg >= 0 ? "#2FA37A" : "#C8553D"} sub={p.gapPctUp != null ? p.gapPctUp + "% sobem" : ""} sig={p.gapAvg} sigmax={10} />}
                  {p.impliedMove != null && <FtCell l="Mov. implícito" v={"±" + p.impliedMove + "%"} fill={Math.min(100, p.impliedMove * 5)} fillc="#8CA3B3" />}
                  {p.momentum != null && <FtCell l="Momentum 1m" v={(p.momentum >= 0 ? "+" : "") + p.momentum + "%"} c={p.momentum >= 0 ? "#2FA37A" : "#C8553D"} sig={p.momentum} sigmax={15} />}
                  {p.rsi != null && <FtCell l={"RSI" + (p.trend ? " · " + (p.trend === "bullish" ? "alta" : p.trend === "bearish" ? "baixa" : "neutra") : "")} v={String(p.rsi)} fill={p.rsi} fillc={p.rsi >= 70 ? "#C8553D" : p.rsi <= 30 ? "#2FA37A" : "#8CA3B3"} />}
                  {p.analyst && <FtCell l="Analistas" v={p.analyst === "bullish" ? "otimistas" : p.analyst === "bearish" ? "pessimistas" : "neutros"} c={p.analyst === "bullish" ? "#2FA37A" : p.analyst === "bearish" ? "#C8553D" : "var(--tx)"} sub={p.targetUpside != null ? "alvo " + (p.targetUpside >= 0 ? "+" : "") + p.targetUpside + "%" : ""} />}
                  {p.beatRate != null && <FtCell l="Beat (EPS)" v={p.beatRate + "%"} fill={p.beatRate} fillc="#8CA3B3" />}
                  {p.ev == null && p.impliedMove == null && p.targetUpside != null && <FtCell l="Potencial alvo" v={(p.targetUpside >= 0 ? "+" : "") + p.targetUpside + "%"} c={p.targetUpside >= 0 ? "#2FA37A" : "#C8553D"} sig={p.targetUpside} sigmax={30} />}
                  {p.ev == null && p.impliedMove == null && p.shortPct != null && <FtCell l="Short interest" v={p.shortPct + "%"} fill={Math.min(100, p.shortPct * 4)} fillc="#8CA3B3" />}
                </div>
                {p.ev == null && p.impliedMove == null && <div className="ts-ftlimited">Sem dados de reação a resultados (mercado fora dos EUA). Mostramos as métricas disponíveis.</div>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Aviso "Análise por IA" — mostrado no fundo da secção de Previsões.
function AnaliseInfo() {
  return (
    <div className="ts-feat ts-feat--info ts-feat--infobottom">
      <div className="ts-ftinfotitle">⚠ Análise por IA</div>
      <p>Probabilidades e valor esperado por análise de IA sobre dados de mercado. <b>Não é recomendação</b> de compra/venda. A direção nos resultados é quase moeda ao ar — risco de perda. Faz a tua própria análise.</p>
    </div>
  );
}

function Predictions({ picks, suspenso, onDetail }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10); // janela larga; corta-se por nº de dias abaixo
    fetch(`/api/yahoo/calendar?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((a) => setRows((a || []).filter((x) => !x.past)))
      .catch((e) => setErr(String(e.message || e)));
  }, []);
  const DAYS_SHOWN = 5; // 1 semana útil (Seg–Sex) a partir do 1º dia com resultados
  const groups = useMemo(() => {
    if (!rows) return [];
    const g = {};
    for (const it of rows) { const k = it.entryISO || it.date; (g[k] = g[k] || []).push(it); }
    const keys = Object.keys(g).sort();
    if (!keys.length) return [];
    const out = [];
    let d = new Date(keys[0] + "T00:00:00Z"); // UTC para evitar desvio de fuso
    while (out.length < DAYS_SHOWN) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) { const k = d.toISOString().slice(0, 10); out.push({ day: k, items: g[k] || [] }); }
      d = new Date(d.getTime() + 864e5);
    }
    return out;
  }, [rows]);
  if (err) return <div className="ts-muted">Não foi possível carregar a agenda ({err}).</div>;
  if (!rows) return <div className="ts-muted">A carregar a agenda da semana…</div>;
  if (!groups.length) return <div className="ts-muted">Sem resultados agendados nos próximos dias.</div>;
  return (
    <div className="ts-week">
      {groups.map((grp) => {
        const wd = WD[new Date(grp.day + "T00:00:00Z").getUTCDay()];
        return (
          <div className="ts-daycard" key={grp.day}>
            <div className="ts-dayhdr">{wd} · {fmtDay(grp.day)} <span>entrar até ~fecho</span></div>
            {!grp.items.length && <div className="ts-muted" style={{ padding: "8px 0", fontSize: 13 }}>Sem resultados agendados neste dia.</div>}
            {grp.items.map((it) => (
              <div className="ts-prow ts-prow--exp" key={(it.entryISO || it.date) + it.ticker + it.when}
                onClick={() => onDetail && onDetail(picks[it.ticker] || { ticker: it.ticker, name: it.name, exch: exchOf(it.ticker), entryISO: it.entryISO, date: it.date })}
                title={"Clica para ver o detalhe de " + it.ticker}>
                <span className="ts-ptic">{it.ticker}</span>
                <span className="ts-pex">{exchOf(it.ticker)}</span>
                <span className="ts-pnamewrap"><span className="ts-pname">{fmtName(it.name)}</span>{it.sector && THEME_LABELS[it.sector] && <span className="ts-themetag">{THEME_LABELS[it.sector]}</span>}</span>
                <span className="ts-pwhen">{it.when === "BMO" ? "pré-abertura" : it.when === "AMC" ? "após fecho" : ""}</span>
                {!suspenso && picks[it.ticker]?.show && (() => {
                  const p2 = picks[it.ticker];
                  const parts = [];
                  if (p2.confidence != null) parts.push("conf " + p2.confidence + "%");
                  if (p2.ev != null) parts.push("EV " + (p2.ev >= 0 ? "+" : "") + p2.ev + "%");
                  if (p2.gapUp != null) parts.push("gap↑ " + p2.gapUp + "%");
                  if (p2.impliedMove != null) parts.push("±" + p2.impliedMove + "%");
                  // mercados sem dados de reação (fora dos EUA): preenche com o que existe, para a linha não ficar vazia
                  if (parts.length <= 1) {
                    if (p2.momentum != null) parts.push("mom " + (p2.momentum >= 0 ? "+" : "") + p2.momentum + "%");
                    if (p2.rsi != null) parts.push("RSI " + p2.rsi);
                    if (p2.analyst) parts.push(p2.analyst === "bullish" ? "analistas otimistas" : p2.analyst === "bearish" ? "analistas pessimistas" : "analistas neutros");
                    if (parts.length <= 1) parts.push("análise de reação limitada");
                  }
                  return parts.length ? <span className="ts-pmetrics">{parts.join(" · ")}</span> : null;
                })()}
                {suspenso
                  ? <span className="ts-pbadge" style={{ background: "#8CA3B3" }}>SUSPENSO</span>
                  : picks[it.ticker]?.show && picks[it.ticker]?.probUp != null
                    ? <span className="ts-pbadge" style={{ background: probColor(picks[it.ticker].probUp) }}>↑ {picks[it.ticker].probUp}%</span>
                    : picks[it.ticker]?.show
                      ? <span className="ts-pex">publicado</span>
                      : <span className="ts-plock" title="Probabilidade na área premium">🔒 premium</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Gallery() {
  const [imgs, setImgs] = useState([]);
  const inp = useRef(null);
  const add = (e) => {
    const files = [...(e.target.files || [])];
    files.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setImgs((x) => [{ src: r.result, name: f.name }, ...x]);
      r.readAsDataURL(f);
    });
  };
  return (
    <div>
      <div className="ts-galbar">
        <button className="ts-btn" onClick={() => inp.current?.click()}>＋ Carregar foto de earnings</button>
        <input ref={inp} type="file" accept="image/*" multiple hidden onChange={add} />
        <span className="ts-muted" style={{ fontSize: 12 }}>Demo local — as imagens ficam só no teu browser.</span>
      </div>
      {imgs.length === 0 ? (
        <div className="ts-muted">Ainda sem imagens. Carrega prints dos resultados ou gera no programa de análise.</div>
      ) : (
        <div className="ts-grid">
          {imgs.map((im) => (
            <figure className="ts-fig" key={im.src}><img src={im.src} alt={im.name} /><figcaption>{im.name}</figcaption></figure>
          ))}
        </div>
      )}
    </div>
  );
}

function Positions() {
  const [pos, setPos] = useState(null);
  const [prices, setPrices] = useState({});
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const p = await fetchPositions();
      if (stop) return;
      setPos(p);
      const pr = await fetchPrices(p.map((x) => x.ticker));
      if (!stop) setPrices(pr);
    };
    load();
    const id = setInterval(load, 60000); // atualiza preço + contador a cada 60s
    return () => { stop = true; clearInterval(id); };
  }, []);
  if (!pos) return <section id="site-pos" className="ts-sec"><h2>Posições a aguardar recuperação</h2><div className="ts-muted">A carregar…</div></section>;
  if (!pos.length) return (
    <section id="site-pos" className="ts-sec">
      <h2>Posições a aguardar recuperação</h2>
      <p className="ts-lead">Sem posições abertas de momento. Quando comprar e a ação ficar abaixo do preço, aparece aqui o contador de dias até recuperar.</p>
    </section>
  );
  return (
    <section id="site-pos" className="ts-sec">
      <h2>Posições a aguardar recuperação</h2>
      <p className="ts-lead">O meu método: se cai, não vendo — espero recuperar ao preço de compra. O contador conta os dias submerso. <b>Aviso:</b> segurar perdedores prende capital e nem toda a ação recupera. Não é recomendação.</p>
      <div className="ts-posgrid">
        {pos.map((p) => {
          const cur = prices[p.ticker] ?? null;
          const under = cur != null && cur < p.buyPrice;
          const recovered = cur != null && cur >= p.buyPrice;
          const pnl = cur != null ? ((cur - p.buyPrice) / p.buyPrice * 100) : null;
          const days = under ? daysBetween(p.buyDate) : 0;
          return (
            <div className={"ts-pos" + (under ? " under" : recovered ? " rec" : "")} key={p.ticker + p.buyDate}>
              <div className="ts-poshd"><span className="ts-postic">{p.ticker}</span><span className="ts-posex">{p.exch || "EUA"}</span></div>
              <div className="ts-posname">{fmtName(p.name)}</div>
              <div className="ts-poscount" style={{ color: under ? "#C8553D" : "#2FA37A" }}>
                {under ? `⏳ ${days} ${days === 1 ? "dia" : "dias"} à espera` : recovered ? "✓ recuperou — pode vender" : "—"}
              </div>
              <div className="ts-posrow">
                <span>compra ${p.buyPrice}</span>
                <span>{cur != null ? "atual $" + cur.toFixed(2) : "…"}</span>
                {pnl != null && <span style={{ color: pnl < 0 ? "#C8553D" : "#2FA37A" }}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%</span>}
              </div>
              {p.note && <div className="ts-posnote">“{p.note}”</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metodo({ ledger }) {
  const led = ledger?.stats || null;
  // Fast Run: fluxo único — varrer → recolher → pontuar → escolher → entrar → gerir
  const flow = [
    { n: "1", fase: "Análise", t: "Varrer os resultados do dia", d: "Todos os dias, o Fast Run lista as empresas que apresentam resultados (EUA + Europa)." },
    { n: "2", fase: "Análise", t: "Recolher informação multi-fonte", d: "Para cada uma, junta analistas e preço-alvo, dados de mercado e histórico, opções (movimento implícito) e fundamentais (beat, valuation, revisões de EPS)." },
    { n: "3", fase: "Análise", t: "Pontuar com IA", d: "A IA combina tudo numa probabilidade de subir ou descer + valor esperado. É probabilidade, não garantia." },
    { n: "4", fase: "Decisão", t: "O gestor escolhe a recomendação", d: "Entre as candidatas, escolho a que recomendaria — a “Escolha do trader”. Decisão humana, não automática." },
    { n: "5", fase: "Execução", t: "Entrar antes dos resultados", d: "Compro segundos antes do fecho da bolsa, no dia do anúncio: capital base €2.500, uma posição de cada vez, com margem DEGIRO (amplifica ganhos e perdas)." },
    { n: "6", fase: "Execução", t: "Gerir e sair", d: "Sobe → vendo o ganho. Cai → espero recuperar o preço, mas corto no stop de −10%. Ao fim do mês retiro o lucro e reponho a base." },
  ];
  return (
    <section id="site-metodo" className="ts-sec">
      <h2>O método — <span style={{ color: "var(--gold)" }}>Fast Run</span></h2>
      <p className="ts-lead"><b>Fast Run</b> é o modelo que uso: varre diariamente as ações com resultados, recolhe informação de várias fontes financeiras + IA, e no fim <b>eu (gestor) escolho</b> a que recomendaria. <b>Alto risco</b> — uso margem e concentro numa ação. Isto é opinião/educação, <b>não recomendação nem aconselhamento financeiro</b>.</p>

      <div className="ts-flow">
        {flow.map((s, i) => (
          <div className="ts-flowstep" key={s.n} data-fase={s.fase}>
            <div className="ts-flowtop"><span className="ts-flown">{s.n}</span><span className="ts-flowfase">{s.fase}</span></div>
            <b>{s.t}</b>
            <p>{s.d}</p>
          </div>
        ))}
      </div>

      <div className="ts-metwarn">
        <b>⚠ Risco elevado e assumido.</b> Uso <b>margem</b> (posso perder mais do que o capital investido) e <b>concentro tudo numa única ação</b>. A direção de uma ação nos resultados é quase uma <b>moeda ao ar</b> — não há edge provado e a variância é alta. Um único mau trade apaga vários bons. Podes perder todo o capital. Isto é <b>opinião/educação</b>, não recomendação nem aconselhamento financeiro. Faz a tua própria análise.
      </div>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!consent) { setMsg({ err: true, t: "Aceita o consentimento primeiro." }); return; }
    const r = await subscribeEmail(email);
    setMsg(r.ok ? { t: r.already ? "Já estavas subscrito." : "Subscrito! Obrigado." } : { err: true, t: r.error || "Falhou." });
    if (r.ok) setEmail("");
  };
  return (
    <section id="site-news" className="ts-sec">
      <h2>Newsletter — resumo semanal por email</h2>
      <p className="ts-lead">Recebe as apresentações da semana e as minhas notas. Informativo, sem spam, sais quando quiseres. Não são sinais de compra/venda.</p>
      <form className="ts-news" onSubmit={submit}>
        <input type="email" required placeholder="o-teu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="ts-btn" type="submit">Subscrever</button>
      </form>
      <label className="ts-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Autorizo receber emails e li que isto não é aconselhamento financeiro.</label>
      {msg && <div className={msg.err ? "ts-red" : "ts-ok"}>{msg.t}</div>}
    </section>
  );
}

function HistoricoCalendario({ ledger }) {
  const [rows, setRows] = useState(null); // apostados (posições fechadas / upload)
  const [mkt, setMkt] = useState([]); // mercado (não apostados) — motor
  const [open, setOpen] = useState(null); // linha apostada expandida (accordion)
  // trades do extrato indexados por ticker (para enriquecer a linha apostada)
  const ledByTicker = useMemo(() => {
    const m = {};
    (ledger?.trades || []).forEach((t) => { if (t.ticker) (m[t.ticker] = m[t.ticker] || []).push(t); });
    return m;
  }, [ledger]);
  const ledFor = (ticker, date) => { const l = ledByTicker[ticker]; if (!l) return null; return l.find((t) => t.sellDate === date) || l[0]; };
  useEffect(() => {
    const load = () => {
      fetchHistory().then(setRows);
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      fetch(`/api/yahoo/calendar?from=${from}&to=${to}`).then((r) => r.json()).then((a) => setMkt((a || []).filter((x) => x.past && x.reaction != null))).catch(() => {});
    };
    load();
    const onVis = () => { if (!document.hidden) load(); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(load, 30000);
    return () => { window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, []);
  const days = useMemo(() => {
    const sectorMap = {}; for (const x of mkt) { if (x.ticker && x.sector) sectorMap[x.ticker] = x.sector; } // área/tema por ticker (do calendário)
    const apostados = (rows || []).map((r) => ({ ...r, aposta: true, sector: r.sector || sectorMap[r.ticker] }));
    const apSet = new Set(apostados.map((r) => r.ticker));
    const naoAp = mkt.filter((x) => !apSet.has(x.ticker)).map((x) => ({ ticker: x.ticker, name: x.name, date: x.date, pct: Math.round(x.reaction * 10) / 10, exch: exchOf(x.ticker), aposta: false, sector: x.sector }));
    const g = {};
    [...apostados, ...naoAp].filter((r) => r.date && daysBetween(r.date) <= 7).forEach((r) => { (g[r.date] = g[r.date] || []).push(r); }); // só últimos 7 dias
    return Object.keys(g).sort((a, b) => b.localeCompare(a)).map((d) => ({ day: d, items: g[d].sort((a, b) => (b.aposta ? 1 : 0) - (a.aposta ? 1 : 0)) }));
  }, [rows, mkt]);
  if (rows === null) return null; // ainda a carregar
  if (!days.length) return (
    <section id="site-hist" className="ts-sec">
      <h2>Histórico das posições anteriores</h2>
      <p className="ts-lead">Sem histórico ainda. Aparece aqui quando fecho posições ou há resultados recentes. Não é recomendação.</p>
    </section>
  );
  return (
    <section id="site-hist" className="ts-sec">
      <h2>Histórico das posições anteriores</h2>
      <p className="ts-lead">Posições fechadas/documentos <b>e resultados do mercado não apostados</b>. <b>Análise assistida por IA</b> — informativo, não é recomendação.</p>
      <div className="ts-week">
        {days.slice(0, 7).map((grp) => (
          <div className="ts-daycard" key={grp.day}>
            <div className="ts-dayhdr">{WD[new Date(grp.day + "T00:00:00").getDay()]} · {fmtDay(grp.day)}</div>
            {grp.items.map((r, i) => {
              const key = grp.day + r.ticker + i;
              const t = r.aposta ? ledFor(r.ticker, r.date) : null;
              const canExpand = r.aposta;
              const isOpen = open === key;
              return (
                <div key={key}>
                  <div className={"ts-prow" + (r.aposta ? "" : " ts-prow--info") + (canExpand ? " ts-prow--exp" : "")} onClick={canExpand ? () => setOpen(isOpen ? null : key) : undefined}>
                    {canExpand && <span className={"ts-caret" + (isOpen ? " open" : "")}>▸</span>}
                    <span className="ts-ptic">{r.ticker}</span>
                    <span className="ts-pex">{r.exch || "EUA"}</span>
                    <span className="ts-pnamewrap"><span className="ts-pname">{fmtName(r.name)}</span>{r.sector && THEME_LABELS[r.sector] && <span className="ts-themetag">{THEME_LABELS[r.sector]}</span>}</span>
                    {r.pct != null && <span style={{ color: r.pct < 0 ? "#C8553D" : "#2FA37A", fontFamily: "'IBM Plex Mono',monospace" }}>{r.pct >= 0 ? "▲ +" : "▼ "}{r.pct}%</span>}
                    {r.pnl != null && <span style={{ color: r.pnl < 0 ? "#C8553D" : "#2FA37A", fontFamily: "'IBM Plex Mono',monospace" }}>{r.pnl >= 0 ? "+€" : "−€"}{Math.abs(r.pnl)}</span>}
                    {r.aposta && r.predicted && r.predicted !== "NEUTRO" && (() => { const hit = (r.predicted === "SUBIR" && r.pct > 0) || (r.predicted === "DESCER" && r.pct < 0); return <span className="ts-predtag" title="Previsão dada nas previsões vs resultado real" style={{ color: hit ? "#2FA37A" : "#C8553D" }}>previu {r.predicted === "SUBIR" ? "↑" : "↓"} {hit ? "✓" : "✕"}</span>; })()}
                    {r.aposta ? <span className="ts-aitag" title="Análise assistida por IA">IA</span> : <span className="ts-naotag" title="Resultado do mercado — não apostado">não apostado</span>}
                  </div>
                  {canExpand && isOpen && (
                    <div className="ts-pexp">
                      {t ? (
                        <div className="ts-pexpgrid">
                          <div><span>Compra → Venda</span><b>${t.buyPx} → ${t.sellPx}</b></div>
                          <div><span>Quantidade</span><b>{t.qty} ações</b></div>
                          <div><span>Dias em posição</span><b>{t.holdDays}</b></div>
                          <div><span>Investido</span><b>{eur(t.cost)}</b></div>
                          <div><span>Resultado</span><b style={{ color: t.pl >= 0 ? "#2FA37A" : "#C8553D" }}>{t.pl >= 0 ? "+" : ""}{eur(t.pl)} ({t.pct >= 0 ? "+" : ""}{t.pct}%)</b></div>
                          {(t.fxBuy || t.fxSell) && <div><span>Câmbio EUR/USD C→V</span><b>{t.fxBuy || "—"} → {t.fxSell || "—"}</b></div>}
                          <div><span>Comissão</span><b>€2 compra + €2 venda</b></div>
                        </div>
                      ) : <div className="ts-muted" style={{ fontSize: 12.5 }}>Detalhe do trade não disponível no extrato.</div>}
                      {(r.probUp != null || r.predicted) && <div className="ts-pexpline"><span>Previsão dada:</span> {r.predicted ? (r.predicted === "SUBIR" ? "subir ↑" : r.predicted === "DESCER" ? "descer ↓" : "neutro") : ""}{r.probUp != null ? ` · probabilidade ${r.probUp}%` : ""}</div>}
                      {r.nota && <div className="ts-pexpline"><span>Motivo:</span> “{r.nota}”</div>}
                      <div className="ts-pexpline"><a href={"#stock/" + r.ticker} onClick={(e) => e.stopPropagation()}>Ver página completa da ação →</a></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TraderSite() {
  const [picks, setPicks] = useState({});
  const [hist, setHist] = useState([]);
  const [openPos, setOpenPos] = useState([]);
  const [posPrices, setPosPrices] = useState({});
  const [settings, setSettings] = useState({});
  const [ledger, setLedger] = useState({});
  const [tape, setTape] = useState([]);
  useEffect(() => {
    const load = () => {
      fetchPublished().then(setPicks); fetchHistory().then((h) => setHist(Array.isArray(h) ? h : [])); fetchSettings().then(setSettings);
      fetchLedger().then((l) => setLedger(l || {}));
      fetchPositions().then((p) => { const a = Array.isArray(p) ? p : []; setOpenPos(a); fetchPrices(a.map((x) => x.ticker)).then(setPosPrices); });
    };
    load();
    const onVis = () => { if (!document.hidden) load(); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(load, 30000); // atualiza sem recarregar
    return () => { window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, []);
  // símbolos da barra de cotações: índices + ações do método (ledger + picks + histórico)
  const tapeSyms = useMemo(() => {
    const idx = ["^GSPC", "^IXIC", "^DJI", "EURUSD=X"];
    const mine = new Set();
    (ledger.trades || []).forEach((t) => t.ticker && mine.add(t.ticker));
    Object.values(picks || {}).forEach((p) => p.ticker && p.show && mine.add(p.ticker));
    hist.forEach((r) => r.ticker && mine.add(r.ticker));
    return [...idx, ...[...mine].slice(0, 16)];
  }, [ledger, picks, hist]);
  useEffect(() => {
    if (tapeSyms.length <= 4) return; // ainda sem ações → não mostra tape
    const load = () => fetchTape(tapeSyms).then((t) => setTape(Array.isArray(t) ? t : []));
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [tapeSyms.join(",")]);
  const led = ledger.stats || null;
  const featPicks = useMemo(() => featuredList(picks), [picks]);
  const [modalPick, setModalPick] = useState(null);
  const histSum = hist.reduce((a, r) => a + (Number(r.pnl) || 0), 0);
  const totalPL = settings.totalPL != null ? Number(settings.totalPL) : histSum; // Total L/P: da conta DEGIRO (upload) ou soma do histórico
  const saldo = settings.saldo != null ? Number(settings.saldo) : null; // saldo da conta (DEGIRO, via upload)
  const capitalBase = settings.capitalBase != null ? Number(settings.capitalBase) : 2500; // capital fixo do método
  const lucroMes = saldo != null ? saldo - capitalBase : null; // lucro do mês = acima do capital base (retira no início do mês)
  // suspenso: há posição aberta submersa (abaixo do preço) → capital preso → previsões suspensas
  const submersas = useMemo(() => openPos.filter((p) => { const c = posPrices[p.ticker]; return c != null && c < p.buyPrice; }), [openPos, posPrices]);
  const suspenso = submersas.length > 0;
  const heldTickers = submersas.map((p) => p.ticker).join(", ");
  return (
    <div className="ts-root">
      <style>{CSS}</style>
      <CookieBanner />

      <div className="ts-disc">⚠ Conteúdo educacional e de opinião · <b>análises assistidas por IA</b> · <b>não é aconselhamento financeiro</b>. Investir em ações tem risco de perda total. Resultados passados não garantem futuros. Faz a tua própria análise.</div>

      <header className="ts-nav">
        <a href="#site" className="ts-brand" onClick={() => window.scrollTo({ top: 0 })} title="Início"><Logo /> <span>AI</span>earnings <em>trader</em></a>
        <nav>
          <a href="#site" onClick={() => window.scrollTo({ top: 0 })}>Início</a>
          <a href="#site-metodo">Método</a>
          <a href="#site-prev">Previsões</a>
          <a href="#site-pos">Posições</a>
          <a href="#site-hist">Histórico</a>
          <a href="#site-news">Newsletter</a>
          <a href="#site-premium" className="ts-navcta">Premium</a>
          <a href="#admin" className="ts-navtool" title="Administração (curadoria + análise)">⚙ Admin</a>
        </nav>
      </header>

      <section className="ts-hero">
        <h1>Resultados trimestrais, descodificados semana a semana</h1>
        <p>Probabilidade de uma ação <b>subir ou descer</b> nos resultados trimestrais, por análise de IA sobre dados de mercado (EUA + Europa). Não é aconselhamento financeiro — é leitura de probabilidades.</p>
        <div className="ts-herocta">
          <a href="#site-metodo" className="ts-btn">Ver o método</a>
          <a href="#site-news" className="ts-btn ts-btnghost">Receber alertas</a>
        </div>
        <div className="ts-herowarn">Conteúdo informativo — indicativo, não prova de edge. Alta variância. Não é aconselhamento financeiro.</div>
      </section>

      {featPicks.length > 0 && (
        <section className={"ts-sec ts-tpsec" + (featPicks.length > 1 ? " ts-tpsec--multi" : "")}>
          <div className={"ts-tpwrap ts-tpwrap--" + featPicks.length}>
            {featPicks.map((p) => <TraderPick key={p.ticker} pick={p} onDetail={setModalPick} />)}
          </div>
        </section>
      )}

      <section className="ts-sec ts-topstats">
        <div className="ts-statwrap">
          {/* Conta DEGIRO (definições / documento) */}
          {(saldo != null || settings.totalPL != null || lucroMes != null) && (
            <div className="ts-statgroup">
              <h3 className="ts-statlbl">Conta DEGIRO</h3>
              <div className="ts-statgrid">
                {saldo != null && <div className="ts-stat"><b>{eur(saldo)}</b><span>saldo da conta</span><small>capital atual</small></div>}
                {settings.totalPL != null && <div className="ts-stat"><b style={{ color: totalPL >= 0 ? "#2FA37A" : "#C8553D" }}>{totalPL >= 0 ? "+" : ""}{eur(totalPL)}</b><span>Total L/P</span><small>desde o início da conta</small></div>}
                {lucroMes != null && <div className="ts-stat"><b style={{ color: lucroMes >= 0 ? "#2FA37A" : "#C8553D" }}>{lucroMes >= 0 ? "+" : ""}{eur(lucroMes)}</b><span>lucro do mês</span><small>≈ {lucroMes >= 0 ? "+" : ""}{Math.round(lucroMes / capitalBase * 100)}% sobre {eur(capitalBase)} · retira no início</small></div>}
              </div>
            </div>
          )}

          {/* Trades reais — do extrato DEGIRO (ledger) */}
          {led && led.n > 0 && (
            <div className="ts-statgroup">
              <h3 className="ts-statlbl">Trades reais · extrato ({led.n})</h3>
              <div className="ts-statgrid">
                {led.netPL != null && <div className="ts-stat"><b style={{ color: led.netPL >= 0 ? "#2FA37A" : "#C8553D" }}>{led.netPL >= 0 ? "+" : ""}{eur(led.netPL)}</b><span>L/P líquido</span><small>após comissões · {led.n} trades</small></div>}
                {led.netPL != null && <div className="ts-stat"><b style={{ color: led.netPL >= 0 ? "#2FA37A" : "#C8553D" }}>{led.netPL >= 0 ? "+" : ""}{(led.netPL / capitalBase * 100).toFixed(1)}%</b><span>rentabilidade</span><small>líquido sobre {eur(capitalBase)}</small></div>}
                {led.totalPL != null && <div className="ts-stat"><b style={{ color: led.totalPL >= 0 ? "#2FA37A" : "#C8553D" }}>{led.totalPL >= 0 ? "+" : ""}{eur(led.totalPL)}</b><span>L/P bruto</span><small>antes de custos</small></div>}
                {led.winRate != null && <div className="ts-stat"><b style={{ color: "#2FA37A" }}>{led.winRate}%</b><span>trades com lucro</span><small>{led.wins}/{led.n} ganharam</small></div>}
                {led.lossCount != null && <div className="ts-stat"><b style={{ color: "#C8553D" }}>{led.lossCount}</b><span>trades com perda</span><small>{led.lossCount}/{led.n} perderam</small></div>}
                {led.avgPct != null && <div className="ts-stat"><b style={{ color: led.avgPct >= 0 ? "#2FA37A" : "#C8553D" }}>{led.avgPct >= 0 ? "+" : ""}{led.avgPct}%</b><span>média por trade</span><small>retorno médio</small></div>}
                {led.avgHold != null && <div className="ts-stat"><b>{led.avgHold}<small style={{ fontSize: "0.5em" }}> dias</small></b><span>tempo médio</span><small>entrada → saída</small></div>}
                {led.stopCount != null && <div className="ts-stat"><b style={{ color: led.stopCount > 0 ? "#C8553D" : "var(--tx)" }}>{led.stopCount}</b><span>stops −10%</span><small>saídas no limite de risco</small></div>}
                {led.best && <div className="ts-stat" onClick={() => goStock(led.best.ticker)} style={{ cursor: led.best.ticker ? "pointer" : "default" }}><b style={{ color: "#2FA37A" }}>+{led.best.pct}%</b><span>melhor trade</span><small>{led.best.ticker || led.best.name}</small></div>}
                {led.worst && <div className="ts-stat" onClick={() => goStock(led.worst.ticker)} style={{ cursor: led.worst.ticker ? "pointer" : "default" }}><b style={{ color: "#C8553D" }}>{led.worst.pct}%</b><span>pior trade</span><small>{led.worst.ticker || led.worst.name}</small></div>}
                {led.totalCost != null && <div className="ts-stat"><b style={{ color: "#C8553D" }}>−{eur(led.totalCost)}</b><span>custos totais</span><small>{led.costPerTrade != null ? "≈ €" + led.costPerTrade + "/trade" : "comissões + taxas"}</small></div>}
                {led.pctStd != null && <div className="ts-stat"><b>±{led.pctStd}%</b><span>consistência</span><small>desvio por trade</small></div>}
                {led.avgFx != null && <div className="ts-stat"><b>{led.avgFx}</b><span>câmbio EUR/USD</span><small>média nas operações</small></div>}
                {led.costPerTrade != null && <div className="ts-stat"><b style={{ color: "#C8553D" }}>−€{led.costPerTrade}</b><span>custo por trade</span><small>comissões + taxas</small></div>}
                {led.totalCost != null && <div className="ts-stat"><b style={{ color: "#C8553D" }}>{(led.totalCost / capitalBase * 100).toFixed(1)}%</b><span>custos % da conta</span><small>sobre {eur(capitalBase)}</small></div>}
              </div>
            </div>
          )}
        </div>
        {ledger.equity && ledger.equity.length > 1 && (
          <div className="ts-equitybox">
            <div className="ts-equityhd"><span>Curva de capital <small>(base + P/L dos trades fechados)</small></span>{led && <b style={{ color: led.totalPL >= 0 ? "#2FA37A" : "#C8553D" }}>{led.totalPL >= 0 ? "+" : ""}{eur(led.totalPL)}</b>}</div>
            <EquityChart equity={ledger.equity} />
          </div>
        )}
        <div className="ts-note">Resultados passados não garantem futuros. Não é aconselhamento financeiro; é análise probabilística assistida por IA.</div>
      </section>

      <Positions />

      <Metodo ledger={ledger} />

      <section id="site-prev" className="ts-sec">
        <h2>Previsões desta semana</h2>
        <p className="ts-lead">Quem reporta e quando (hora de Portugal). As destacadas mostram a <b>probabilidade de subir ou descer</b> nos resultados, por análise de IA. Não é recomendação de compra/venda.</p>
        {suspenso && <div className="ts-suspban">⏸ Previsões <b>suspensas</b> — capital em <b>{heldTickers}</b> (a recuperar). Não é possível entrar em novas até fechar a posição.</div>}
        <Featured picks={picks} suspenso={suspenso} onDetail={setModalPick} />
        <Predictions picks={picks} suspenso={suspenso} onDetail={setModalPick} />
        <AnaliseInfo />
      </section>

      <HistoricoCalendario ledger={ledger} />

      <section id="site-gal" className="ts-sec">
        <h2>Galeria de earnings</h2>
        <p className="ts-lead">Prints e imagens dos resultados. Carrega os teus ou gera no programa.</p>
        <Gallery />
      </section>

      <section id="site-blog" className="ts-sec">
        <h2>Blog & conselhos</h2>
        <p className="ts-lead">Opinião e educação — sempre com aviso de risco.</p>
        <div className="ts-posts">
          {POSTS.map((p) => (
            <article className="ts-post" key={p.title}>
              <span className="ts-ptag">{p.tag}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <Newsletter />

      <section id="site-premium" className="ts-sec ts-prem">
        <h2>Área premium</h2>
        <p className="ts-lead">Acesso à probabilidade (subir/descer) por ação, valor esperado, gap histórico e alertas de entrada. Não é recomendação.</p>
        <div className="ts-premcard">
          <div className="ts-premprice">Em breve</div>
          <ul>
            <li>✓ Probabilidade (subir/descer) detalhada</li>
            <li>✓ Valor esperado + gap overnight por ação</li>
            <li>✓ Alertas da hora de entrada</li>
            <li>✓ Track record atualizado</li>
          </ul>
          <button className="ts-btn ts-btnp" onClick={() => alert("Lista de espera — a implementar (login + pagamentos).")}>Entrar na lista de espera</button>
        </div>
      </section>

      <footer className="ts-foot">
        <div className="ts-footlinks">
          <a href="#legal-termos">Termos & Condições</a>
          <a href="#legal-privacidade">Privacidade</a>
          <a href="#legal-risco">Aviso de Risco</a>
          <a href="#legal-cookies">Cookies</a>
        </div>
        <b>Aviso legal:</b> Este site é informativo/educacional e reflete opiniões pessoais. Parte das análises é <b>assistida por inteligência artificial</b> e pode conter erros; a divulgação de IA não retira a responsabilidade editorial. <b>Não constitui aconselhamento financeiro, de investimento ou fiscal</b>, nem recomendação personalizada. Investir em instrumentos financeiros envolve risco, incluindo a perda total do capital. Resultados passados não são garantia de resultados futuros. Não sou consultor financeiro registado. Faz a tua própria análise e/ou procura aconselhamento profissional. Dados de mercado via Yahoo Finance, podem ter atrasos ou erros.
      </footer>

      <TickerTape items={tape} />
      {modalPick && <StockModal pick={modalPick} onClose={() => setModalPick(null)} />}
    </div>
  );
}

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
.ts-root *{box-sizing:border-box;}
.ts-root{--ink:#0E1620;--s1:#16232F;--s2:#1E2E3C;--line:#2A3E4E;--tx:#E8EEF2;--mut:#8CA3B3;--gold:#D6A445;--grn:#2FA37A;--red:#C8553D;
  font-family:'Inter',system-ui,sans-serif;background:var(--ink);color:var(--tx);min-height:100%;-webkit-font-smoothing:antialiased;}
.ts-disc{background:rgba(214,164,69,.12);border-bottom:1px solid var(--gold);color:#f0d9a8;font-size:12.5px;line-height:1.5;padding:8px 16px;text-align:center;}
.ts-nav{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:10px;position:sticky;top:0;background:var(--ink);z-index:5;}
.ts-brand{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--tx);cursor:pointer;}.ts-brand span{color:var(--gold);}.ts-brand em{font-style:normal;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.15em;}
.ts-logo{flex:0 0 auto;display:block;}
.ts-cookie{position:fixed;left:16px;right:16px;bottom:16px;z-index:50;max-width:820px;margin:0 auto;background:var(--s1);border:1px solid var(--gold);border-radius:12px;padding:14px 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;box-shadow:0 8px 30px rgba(0,0,0,.4);}
.ts-cookietxt{font-size:13px;color:var(--tx);line-height:1.5;flex:1;min-width:220px;}
.ts-cookietxt a{color:var(--gold);}
.ts-cookiebtns{display:flex;gap:10px;flex-wrap:wrap;}
.ts-cookiebtns .ts-btn{padding:8px 14px;font-size:13px;}
.ts-nav nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap;}
.ts-nav a{color:var(--mut);text-decoration:none;font-size:14px;}.ts-nav a:hover{color:var(--tx);}
.ts-navcta{color:var(--gold)!important;border:1px solid var(--gold);border-radius:8px;padding:5px 12px;}
.ts-navtool{font-size:12px!important;}
.ts-hero{max-width:900px;margin:0 auto;padding:56px 22px 36px;text-align:center;}
.ts-hero h1{font-family:'Space Grotesk',sans-serif;font-size:38px;line-height:1.1;margin:0 0 14px;letter-spacing:-.02em;}
.ts-hero p{color:var(--mut);font-size:16px;line-height:1.6;max-width:60ch;margin:0 auto 24px;}
.ts-herostats{display:flex;gap:32px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;}
.ts-herostats div{display:flex;flex-direction:column;}.ts-herostats b{font-family:'IBM Plex Mono',monospace;font-size:30px;}.ts-herostats span{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.1em;}
.ts-herowarn{font-size:12px;color:var(--gold);}
.ts-sec{max-width:1000px;margin:0 auto;padding:36px 22px;border-top:1px solid var(--line);scroll-margin-top:72px;}
.ts-sec h2{font-family:'Space Grotesk',sans-serif;font-size:26px;margin:0 0 6px;}
.ts-lead{color:var(--mut);font-size:14.5px;line-height:1.6;margin:0 0 20px;max-width:70ch;}
.ts-muted{color:var(--mut);font-size:14px;}
.ts-week{display:grid;gap:14px;}
.ts-daycard{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
.ts-dayhdr{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;margin-bottom:10px;text-transform:capitalize;}.ts-dayhdr span{float:right;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--mut);font-weight:400;text-transform:none;}
.ts-prow{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:13.5px;flex-wrap:wrap;}
.ts-ptic{font-family:'Space Grotesk',sans-serif;font-weight:700;min-width:66px;}
.ts-pex{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--gold);border:1px solid var(--line);border-radius:5px;padding:1px 5px;}
.ts-pname{color:var(--mut);flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ts-pnamewrap{flex:1;min-width:120px;display:flex;align-items:center;gap:8px;overflow:hidden;}
.ts-pnamewrap .ts-pname{flex:none;min-width:0;}
.ts-pnamewrap .ts-themetag{flex-shrink:0;margin-left:0;}
.ts-pwhen{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--mut);}
.ts-plock{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--gold);}
.ts-topstats{border-top:none;padding-top:4px;margin-top:-8px;}
.ts-statgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;}
.ts-stat{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center;}
.ts-stat b{font-family:'IBM Plex Mono',monospace;font-size:30px;display:block;}
.ts-stat span{display:block;font-size:12.5px;color:var(--tx);margin-top:4px;}
.ts-stat small{display:block;font-size:11px;color:var(--mut);margin-top:3px;}
.ts-suspban{background:rgba(140,163,179,.14);border:1px solid var(--mut);border-radius:10px;padding:11px 14px;font-size:13.5px;color:var(--tx);margin-bottom:18px;}
.ts-featwrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:22px;align-items:start;}
.ts-ftlimited{margin-top:10px;font-size:10.5px;color:var(--mut);border-top:1px dashed var(--line);padding-top:8px;line-height:1.45;}
.ts-feat{background:var(--s1);border:1px solid var(--line);border-top:3px solid;border-radius:12px;padding:14px;}
.ts-feathd{display:flex;justify-content:space-between;align-items:center;}
.ts-fttic{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:18px;}
.ts-ftbadge{color:#0E1620;font-weight:700;font-size:11px;padding:2px 8px;border-radius:6px;font-family:'IBM Plex Mono',monospace;}
.ts-ftname{color:var(--mut);font-size:12px;margin-top:2px;}
.ts-ftnote{font-size:13px;margin-top:8px;font-style:italic;color:var(--tx);}
.ts-ftmeta{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--mut);margin-top:8px;}
.ts-feat.clik{cursor:pointer;}
.ts-mono{display:inline-flex;align-items:center;justify-content:center;width:26px;height:20px;border-radius:5px;color:#0E1620;font-size:9.5px;font-weight:700;font-family:'IBM Plex Mono',monospace;vertical-align:middle;letter-spacing:-.02em;}
.ts-logoimg{object-fit:contain;background:#fff;padding:2px;}
.ts-isin{color:var(--mut);font-size:11px;font-family:'IBM Plex Mono',monospace;}
.ts-ftsect{margin-left:8px;font-size:10px;color:var(--mut);border:1px solid var(--line);border-radius:5px;padding:1px 6px;text-transform:capitalize;}
.ts-spark{width:100%;height:70px;background:var(--ink);border:1px solid var(--line);border-radius:8px;}
.ts-ftdet>.ts-sparkwrap{display:block;margin-bottom:8px;}
.ts-sparkbtns{display:flex;gap:4px;margin-top:5px;}
.ts-sparkbtns button{flex:1;background:transparent;border:1px solid var(--line);color:var(--mut);border-radius:5px;padding:3px 0;font-size:10px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ts-sparkbtns button.on{background:var(--gold);color:#1a1206;border-color:var(--gold);font-weight:600;}
.ts-ftana{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--mut);}
.ts-ftana b{color:var(--tx);}
.ts-ftdet{margin-top:10px;border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:6px;}
.ts-ftdet>div{display:flex;justify-content:space-between;font-size:12.5px;color:var(--mut);}
.ts-ftdet>div b{color:var(--tx);font-family:'IBM Plex Mono',monospace;}
/* grelha compacta dos cards das Previsões */
.ts-ftspark{margin:8px 0;}
.ts-ftgrid{margin-top:10px;border-top:1px solid var(--line);padding-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:9px 12px;}
.ts-feat .ts-ftgrid{border-top:none;padding-top:0;grid-template-columns:1fr 22px 1fr;}
.ts-feat .ts-ftgrid .ts-ftcell:nth-child(odd){grid-column:1;}
.ts-feat .ts-ftgrid .ts-ftcell:nth-child(even){grid-column:3;text-align:right;align-items:flex-end;}
.ts-feat .ts-ftgrid .ts-ftcell:nth-child(even) .ts-fill{width:100%;}
.ts-ftgrid .ts-sigbar{width:100%;}
.ts-ftcell{display:flex;flex-direction:column;gap:2px;min-width:0;}
.ts-ftcl{font-size:10.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ts-ftcell b{font-family:'IBM Plex Mono',monospace;font-size:14px;color:var(--tx);}
.ts-ftcell small{font-size:9.5px;color:var(--mut);}
.ts-fill{display:block;height:4px;background:var(--s2);border-radius:2px;overflow:hidden;margin-top:1px;}
.ts-fill>span{display:block;height:100%;border-radius:2px;}
.ts-ftwarn{display:block!important;color:#f0d9a8;font-size:11px;line-height:1.4;background:rgba(214,164,69,.1);border-radius:6px;padding:8px;margin-top:4px;}
.ts-pmetrics{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--mut);white-space:nowrap;}
.ts-pbadge{color:#0E1620;font-weight:700;font-size:10.5px;padding:1px 7px;border-radius:5px;font-family:'IBM Plex Mono',monospace;}
.ts-naotag{font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--mut);border:1px solid var(--line);border-radius:4px;padding:0 5px;}
.ts-predtag{font-family:'IBM Plex Mono',monospace;font-size:10.5px;}
.ts-prow--info{opacity:.72;}
.ts-aitag{font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--gold);border:1px solid var(--gold);border-radius:4px;padding:0 4px;vertical-align:middle;letter-spacing:.05em;}
.ts-note{margin-top:16px;background:rgba(47,163,122,.1);border:1px solid rgba(47,163,122,.35);border-radius:10px;padding:12px 14px;font-size:12.5px;color:#8fe0bf;line-height:1.5;}
.ts-herocta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;}
.ts-btnghost{background:transparent!important;color:var(--gold)!important;border:1px solid var(--gold);}
.ts-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;}
.ts-step{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;gap:12px;}
.ts-stepn{flex:0 0 34px;height:34px;border-radius:50%;background:var(--gold);color:#1a1206;font-family:'Space Grotesk',sans-serif;font-weight:700;display:flex;align-items:center;justify-content:center;}
.ts-step b{font-family:'Space Grotesk',sans-serif;}.ts-step p{color:var(--mut);font-size:13px;line-height:1.5;margin:4px 0 0;}
.ts-news{display:flex;gap:10px;flex-wrap:wrap;max-width:460px;}
.ts-news input{flex:1;min-width:200px;background:var(--s1);color:var(--tx);border:1px solid var(--line);border-radius:9px;padding:11px 14px;font-size:15px;}
.ts-consent{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--mut);margin-top:10px;max-width:520px;line-height:1.4;}
.ts-ok{color:var(--grn);margin-top:10px;font-size:14px;}.ts-red{color:var(--red);margin-top:10px;font-size:14px;}
.ts-posgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
.ts-pos{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:16px;}
.ts-pos.under{border-color:var(--red);box-shadow:0 0 0 1px rgba(200,85,61,.25) inset;}
.ts-pos.rec{border-color:var(--grn);}
.ts-poshd{display:flex;justify-content:space-between;align-items:center;}
.ts-postic{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:19px;}
.ts-posex{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--gold);border:1px solid var(--line);border-radius:5px;padding:1px 5px;}
.ts-posname{color:var(--mut);font-size:12px;margin-top:2px;}
.ts-poscount{font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600;margin:12px 0;}
.ts-posrow{display:flex;gap:12px;flex-wrap:wrap;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--mut);}
.ts-posnote{font-style:italic;font-size:12.5px;color:var(--tx);margin-top:8px;}
.ts-galbar{display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
.ts-btn{background:var(--gold);color:#1a1206;border:none;border-radius:9px;padding:10px 16px;font-weight:600;font-size:14px;cursor:pointer;font-family:'Space Grotesk',sans-serif;}
.ts-btn:hover{filter:brightness(1.08);}
.ts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;}
.ts-fig{margin:0;background:var(--s1);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
.ts-fig img{width:100%;height:120px;object-fit:cover;display:block;}
.ts-fig figcaption{font-size:11px;color:var(--mut);padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ts-posts{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;}
.ts-post{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:16px;}
.ts-ptag{font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.12em;font-family:'IBM Plex Mono',monospace;}
.ts-post h3{font-family:'Space Grotesk',sans-serif;font-size:17px;margin:6px 0 8px;}
.ts-post p{color:var(--mut);font-size:13.5px;line-height:1.6;margin:0;}
.ts-prem .ts-premcard{background:var(--s1);border:1px solid var(--gold);border-radius:14px;padding:22px;max-width:420px;}
.ts-premprice{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:var(--gold);margin-bottom:12px;}
.ts-prem ul{list-style:none;padding:0;margin:0 0 18px;}.ts-prem li{color:var(--tx);font-size:14px;padding:5px 0;}
.ts-btnp{width:100%;}
.ts-foot{max-width:1000px;margin:0 auto;padding:28px 22px 48px;border-top:1px solid var(--line);color:var(--mut);font-size:11.5px;line-height:1.6;}
.ts-footlinks{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
.ts-footlinks a{color:var(--gold);text-decoration:none;font-size:13px;}
.ts-footlinks a:hover{text-decoration:underline;}
@media(max-width:560px){.ts-hero h1{font-size:28px;}}
/* curva de equity */
.ts-equitybox{margin-top:22px;background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:16px 18px;}
.ts-equityhd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;font-size:14px;color:var(--tx);}
.ts-equityhd small{color:var(--mut);font-size:11.5px;}
.ts-equityhd b{font-family:'IBM Plex Mono',monospace;font-size:18px;}
.ts-equity{position:relative;}
.ts-equitysvg{width:100%;height:130px;display:block;}
.ts-equityax{display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--mut);margin-top:4px;}
/* barra de cotações (ticker tape) */
.ts-root{padding-bottom:40px;}
.ts-tape{position:fixed;left:0;right:0;bottom:0;z-index:40;height:34px;background:#0A121B;border-top:1px solid var(--line);overflow:hidden;display:flex;align-items:center;}
.ts-tapetrack{display:inline-flex;white-space:nowrap;will-change:transform;animation:ts-marquee 60s linear infinite;}
.ts-tape:hover .ts-tapetrack{animation-play-state:paused;}
@keyframes ts-marquee{from{transform:translateX(0);}to{transform:translateX(-50%);}}
.ts-tapeitem{display:inline-flex;align-items:baseline;gap:7px;padding:0 18px;font-size:12.5px;border-right:1px solid var(--line);font-family:'IBM Plex Mono',monospace;}
.ts-tapeitem:not(.idx){cursor:pointer;}
.ts-tapeitem:not(.idx):hover b{color:var(--gold);}
.ts-tapeitem b{color:var(--tx);font-weight:600;}
.ts-tapeitem span{color:var(--mut);}
.ts-tapeitem em{font-style:normal;font-weight:600;}
.ts-tapeitem.idx b{color:var(--gold);}
/* accordion do histórico (linha apostada) */
.ts-prow--exp{cursor:pointer;}
.ts-prow--exp:hover{background:rgba(214,164,69,.06);}
.ts-caret{display:inline-block;color:var(--gold);font-size:10px;transition:transform .15s;margin-right:2px;}
.ts-caret.open{transform:rotate(90deg);}
.ts-pexp{background:var(--s1);border:1px solid var(--line);border-top:none;border-radius:0 0 8px 8px;padding:14px 16px;margin:-4px 0 8px;}
.ts-pexpgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:8px;}
.ts-pexpgrid div{display:flex;flex-direction:column;}
.ts-pexpgrid span{font-size:11px;color:var(--mut);margin-bottom:2px;}
.ts-pexpgrid b{font-family:'IBM Plex Mono',monospace;font-size:14px;}
.ts-pexpline{font-size:12.5px;color:var(--tx);padding:5px 0 0;border-top:1px solid var(--line);margin-top:6px;}
.ts-pexpline span{color:var(--mut);}
.ts-pexpline a{color:var(--gold);text-decoration:none;}
.ts-pexpline a:hover{text-decoration:underline;}
/* escolha do trader (destaque) */
.ts-tpsec{padding-top:8px;padding-bottom:8px;border-top:none;}
.ts-tpwrap{display:grid;gap:16px;align-items:start;}
.ts-tpwrap--1{grid-template-columns:1fr;}
.ts-tpwrap--2{grid-template-columns:repeat(2,minmax(0,1fr));}
.ts-tpwrap--3{grid-template-columns:repeat(3,minmax(0,1fr));}
.ts-tpsec--multi .ts-tpcard{padding:14px 15px;}
.ts-tpsec--multi .ts-tpplan{flex-wrap:wrap;}
@media(max-width:1000px){.ts-tpwrap--3{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:720px){.ts-tpwrap--2,.ts-tpwrap--3{grid-template-columns:1fr;}}
.ts-tpcard{background:linear-gradient(180deg,rgba(214,164,69,.07),var(--s1));border:1.5px solid var(--gold);border-radius:16px;padding:18px 20px;cursor:pointer;transition:transform .12s,box-shadow .12s;}
.ts-tpcard:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(0,0,0,.35);}
.ts-tphead{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.ts-tplabel{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--gold);letter-spacing:.03em;font-size:14px;}
.ts-tpbody{display:flex;gap:22px;align-items:center;flex-wrap:wrap;}
.ts-tpleft{flex:1;min-width:240px;}
.ts-tptop{display:flex;gap:12px;align-items:center;margin-bottom:8px;}
.ts-tptop .ts-mono{width:44px;height:44px;font-size:15px;border-radius:11px;}
.ts-tptic{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;}
.ts-tpname{font-size:13px;color:var(--mut);}
.ts-tpnota{font-style:italic;color:var(--tx);font-size:14px;margin:8px 0 12px;border-left:2px solid var(--gold);padding-left:10px;}
.ts-tpmetrics{display:flex;gap:22px;flex-wrap:wrap;}
.ts-tpmetrics div{display:flex;flex-direction:column;}
.ts-tpmetrics span{font-size:11px;color:var(--mut);}
.ts-tpmetrics b{font-family:'IBM Plex Mono',monospace;font-size:18px;}
.ts-tpchart{width:300px;max-width:100%;}
.ts-tpfoot{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);color:var(--gold);font-size:13px;font-weight:600;}
.ts-tpnote{color:var(--mut);font-weight:400;font-size:11.5px;}
.ts-tpresearch{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);}
.ts-tprtabs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.ts-tprlabel{font-size:12px;color:var(--gold);margin-right:4px;}
.ts-tprtabs button{background:transparent;border:1px solid var(--line);color:var(--mut);border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;}
.ts-tprtabs button:hover{color:var(--tx);}
.ts-tprtabs button.on{background:var(--gold);color:#1a1206;border-color:var(--gold);font-weight:600;}
.ts-tprtext{margin-top:10px;background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.6;color:var(--tx);white-space:pre-wrap;}
/* modal detalhe (duplo-clique) */
.ts-modal{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;}
.ts-modalbox{background:var(--s1);border:1px solid var(--gold);border-radius:16px;padding:22px 24px;max-width:640px;width:100%;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.5);}
.ts-modalx{position:absolute;top:12px;right:14px;background:transparent;border:none;color:var(--mut);font-size:18px;cursor:pointer;}
.ts-modalx:hover{color:var(--tx);}
.ts-modalhd{display:flex;align-items:center;gap:12px;margin-bottom:6px;}
.ts-modalhd .ts-mono{width:44px;height:44px;font-size:15px;border-radius:11px;}
.ts-mmetrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:6px 0 4px;}
.ts-mmetric{background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:9px 11px;}
.ts-mmetric span{display:block;font-size:11px;color:var(--mut);margin-bottom:3px;}
.ts-mmetric b{font-family:'IBM Plex Mono',monospace;font-size:16px;}
.ts-modalfoot{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;}
.ts-modalfoot a{color:var(--gold);text-decoration:none;font-weight:600;}
/* card: tema + sinais + reações */
.ts-themetag{font-size:10.5px;background:var(--s2);border:1px solid var(--line);border-radius:20px;padding:2px 9px;color:var(--mut);margin-left:8px;vertical-align:middle;}
.ts-tpsig{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);}
.ts-tpsighint{font-size:12px;color:#f0d9a8;background:rgba(214,164,69,.08);border:1px solid var(--line);border-radius:8px;padding:8px 11px;margin-bottom:10px;line-height:1.5;}
.ts-tpsiggrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 22px;}
@media(max-width:640px){.ts-tpsiggrid{grid-template-columns:1fr;}}
.ts-tpsigrow{display:grid;grid-template-columns:1fr 70px auto;align-items:center;gap:8px;font-size:12px;}
.ts-tpsigl{color:var(--mut);}
.ts-tpsigrow em{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--tx);white-space:nowrap;}
.ts-sigbar{position:relative;display:inline-block;width:70px;height:6px;background:var(--s2);border-radius:3px;overflow:hidden;}
.ts-sigfill{position:absolute;top:0;height:100%;border-radius:3px;}
.ts-tpreac{margin-top:12px;}
.ts-tpsiglbl{display:block;font-size:11.5px;color:var(--mut);margin-bottom:6px;}
.ts-tpreacbars{display:flex;align-items:flex-end;gap:3px;height:44px;}
.ts-tpreacbar{flex:1;max-width:22px;height:100%;display:flex;align-items:flex-end;background:var(--s2);border-radius:3px;overflow:hidden;}
.ts-tpreacbar>span{display:block;width:100%;border-radius:3px;}
.ts-tpextra{margin-top:12px;padding-top:10px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--mut);}
.ts-tpextra b{color:var(--tx);font-weight:600;}
.ts-tpbadges{display:flex;gap:8px;align-items:center;}
.ts-convchip{font-size:11px;border:1px solid;border-radius:20px;padding:2px 10px;font-weight:600;}
.ts-tpplan{display:flex;align-items:stretch;gap:8px;margin:14px 0;flex-wrap:wrap;}
.ts-tpplanstep{flex:1;min-width:120px;background:var(--s2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;}
.ts-tpplanstep span{font-size:11px;color:var(--mut);}
.ts-tpplanstep b{font-family:'IBM Plex Mono',monospace;font-size:14px;}
.ts-tpplanstop{border-color:rgba(200,85,61,.4);}
.ts-tpplanarr{display:flex;align-items:center;color:var(--gold);font-size:18px;}
@media(max-width:600px){.ts-tpplanarr{display:none;}}
.ts-tpgroup{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);}
.ts-tpgroup h4{font-family:'Space Grotesk',sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--gold);margin:0 0 10px;}
@media(max-width:620px){.ts-tpchart{width:100%;}}
/* método: timeline + regras + exemplo + stats + aviso */
.ts-tl{display:flex;align-items:stretch;gap:8px;margin:22px 0;flex-wrap:wrap;}
.ts-tlstep{flex:1;min-width:130px;background:var(--s1);border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:3px;}
.ts-tlstep b{font-size:14px;}.ts-tlstep small{color:var(--mut);font-size:11.5px;line-height:1.4;}
.ts-tlnum{width:22px;height:22px;border-radius:50%;background:var(--gold);color:#1a1206;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;margin-bottom:2px;}
.ts-tlarr{display:flex;align-items:center;color:var(--gold);font-size:20px;}
.ts-tlsplit{gap:8px;padding:8px;}
.ts-tlup,.ts-tldown{border-radius:8px;padding:7px 9px;}
.ts-tlup{background:rgba(47,163,122,.12);border:1px solid rgba(47,163,122,.4);}
.ts-tldown{background:rgba(200,85,61,.12);border:1px solid rgba(200,85,61,.4);}
.ts-tlup b,.ts-tldown b{font-size:12.5px;}.ts-tlup small,.ts-tldown small{font-size:10.5px;}
.ts-metgrid{display:grid;grid-template-columns:1fr 1.3fr;gap:16px;margin:6px 0 18px;}
@media(max-width:640px){.ts-metgrid{grid-template-columns:1fr;}.ts-tlarr{display:none;}}
.ts-regras,.ts-exemplo{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:16px 18px;}
.ts-regras h3,.ts-exemplo h3{font-family:'Space Grotesk',sans-serif;font-size:16px;margin:0 0 10px;}
.ts-regras table{width:100%;border-collapse:collapse;font-size:13px;}
.ts-regras td{padding:6px 0;border-bottom:1px solid var(--line);}
.ts-regras td:first-child{color:var(--mut);}
.ts-regras td:last-child{text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--tx);}
.ts-extic{display:flex;align-items:center;gap:8px;font-size:13.5px;margin-bottom:10px;}
.ts-exemplo ul{list-style:none;padding:0;margin:0 0 10px;}
.ts-exemplo li{font-size:13.5px;padding:4px 0;border-bottom:1px solid var(--line);color:var(--tx);}
.ts-exnote{font-size:11.5px;color:var(--mut);line-height:1.5;}.ts-exnote a{color:var(--gold);}
.ts-metwarn{background:rgba(47,163,122,.10);border:1px solid var(--grn);border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:#cdeadd;}
.ts-metwarn b{color:#fff;}
/* grupos de balões */
.ts-statwrap{display:flex;flex-direction:column;gap:18px;}
.ts-statlbl{font-family:'Space Grotesk',sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--gold);margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line);}
.ts-feat--info{grid-column:1/-1;border-top-color:#2FA37A!important;display:flex;flex-direction:column;justify-content:center;background:rgba(47,163,122,.08);}
.ts-feat--infobottom{margin-top:18px;}
.ts-ftinfotitle{font-family:'Space Grotesk',sans-serif;font-weight:700;color:#2FA37A;font-size:14px;margin-bottom:8px;}
.ts-feat--info p{color:var(--mut);font-size:12.5px;line-height:1.55;margin:0;}
.ts-feat--info b{color:var(--tx);}
.ts-feat--clk{cursor:pointer;transition:transform .12s,box-shadow .12s;}
.ts-feat--clk:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3);}
/* método Fast Run: fluxo + fontes */
.ts-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:20px 0;}
@media(max-width:820px){.ts-flow{grid-template-columns:1fr;}}
.ts-flowstep{background:var(--s1);border:1px solid var(--line);border-left:3px solid var(--mut);border-radius:10px;padding:14px 16px;}
.ts-flowstep[data-fase="Análise"]{border-left-color:#4F86C6;}
.ts-flowstep[data-fase="Decisão"]{border-left-color:var(--gold);}
.ts-flowstep[data-fase="Execução"]{border-left-color:var(--grn);}
.ts-flowtop{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.ts-flown{width:24px;height:24px;border-radius:50%;background:var(--s2);border:1px solid var(--line);color:var(--tx);font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;}
.ts-flowfase{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);}
.ts-flowstep b{font-family:'Space Grotesk',sans-serif;font-size:15px;display:block;margin-bottom:5px;}
.ts-flowstep p{color:var(--mut);font-size:13px;line-height:1.55;margin:0;}
.ts-fontes{margin:6px 0 18px;}
.ts-fontes h3{font-family:'Space Grotesk',sans-serif;font-size:16px;margin:0 0 10px;}
.ts-fontesgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
@media(max-width:720px){.ts-fontesgrid{grid-template-columns:1fr 1fr;}}
.ts-fonte{background:var(--s1);border:1px solid var(--line);border-radius:9px;padding:11px 13px;}
.ts-fonte b{font-size:13px;display:block;margin-bottom:3px;}
.ts-fonte span{color:var(--mut);font-size:11.5px;line-height:1.4;}
`;
