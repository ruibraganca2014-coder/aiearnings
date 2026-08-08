import { useState, useEffect } from "react";
import { fetchLedger } from "./picks.js";
import { CSS, Spark, Mono, CompanyLogo, eur, probColor, goStock } from "./TraderSite.jsx";
import { fmtDay } from "./shared.js";

// Página de detalhe de uma ação: cotação + gráfico, próximos resultados, probabilidade IA,
// métricas de mercado e o histórico das MINHAS operações nessa ação (do extrato DEGIRO).
export default function StockPage({ ticker }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState("");
  const [led, setLed] = useState({});
  useEffect(() => {
    setQ(null); setErr("");
    fetch("/api/yahoo/quote?symbol=" + encodeURIComponent(ticker), { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("http " + r.status)))
      .then((j) => j.error ? setErr(j.error) : setQ(j)).catch((e) => setErr(String(e.message || e)));
    fetchLedger().then((l) => setLed(l || {}));
  }, [ticker]);

  const myTrades = (led.trades || []).filter((t) => t.ticker === ticker);
  const isin = myTrades[0]?.isin;
  const myWins = myTrades.filter((t) => t.pl > 0).length;
  const myPL = myTrades.reduce((s, t) => s + t.pl, 0);
  const back = () => { window.location.hash = "#site"; };

  return (
    <div className="ts-root sp-root">
      <style>{CSS}</style>
      <div className="ts-disc">⚠ Conteúdo educacional e de opinião · <b>análises assistidas por IA</b> · <b>não é aconselhamento financeiro</b>. Investir tem risco de perda total.</div>
      <header className="ts-nav">
        <a href="#site" className="ts-brand" onClick={back} title="Início"><span>AI</span>earnings <em>trader</em></a>
        <nav><a href="#site" onClick={back}>← Voltar</a></nav>
      </header>

      <section className="ts-sec" style={{ borderTop: "none" }}>
        {err && <div className="sp-err">Não foi possível carregar {ticker}: {err}</div>}
        {!q && !err && <div className="ts-muted">A carregar {ticker}…</div>}
        {q && (
          <>
            <div className="sp-head">
              <CompanyLogo ticker={q.ticker} sector={q.sector} website={q.website} />
              <div className="sp-title">
                <h1>{q.ticker} <span className="ts-aitag">IA</span></h1>
                <div className="sp-name">{q.name}{q.sector && q.sector !== "other" && <span className="ts-ftsect">{q.sector}</span>}</div>
                <div className="sp-sub">{isin ? "ISIN " + isin + " · " : ""}{q.earningsDate ? "próximos resultados " + fmtDay(q.earningsDate) : "sem data de resultados"}</div>
              </div>
              <div className="sp-price">
                <b>{q.price != null ? "$" + q.price : "—"}</b>
                {q.lean?.probUp != null && <span className="sp-prob" style={{ color: probColor(q.lean.probUp) }}>↑ {q.lean.probUp}% probabilidade de subir</span>}
              </div>
            </div>

            {q.history && q.history.length > 1 && (
              <div className="sp-chart"><Spark hist={q.history} marks={q.earningsMarks} /></div>
            )}

            <div className="sp-metrics">
              {q.lean?.probUp != null && <Metric l="Probabilidade de subir" v={q.lean.probUp + "%"} c={probColor(q.lean.probUp)} />}
              {q.avgStrategyReturn != null && <Metric l="Reação média (drift ~1 mês)" v={(q.avgStrategyReturn >= 0 ? "+" : "") + q.avgStrategyReturn + "%"} c={q.avgStrategyReturn >= 0 ? "#2FA37A" : "#C8553D"} />}
              {q.impliedMove != null && <Metric l="Movimento implícito" v={"±" + q.impliedMove + "%"} />}
              {q.gapAvg != null && <Metric l="Gap overnight médio" v={(q.gapAvg >= 0 ? "+" : "") + q.gapAvg + "%"} sub={q.gapPctUp != null ? q.gapPctUp + "% sobem" : ""} />}
              {q.beatRate != null && <Metric l="Histórico de beat (EPS)" v={q.beatRate + "%"} />}
              {q.momentum != null && <Metric l="Momentum (1 mês)" v={(q.momentum >= 0 ? "+" : "") + q.momentum + "%"} c={q.momentum >= 0 ? "#2FA37A" : "#C8553D"} />}
              {q.rsi != null && <Metric l="RSI (14)" v={q.rsi} />}
              {q.trend && <Metric l="Tendência" v={q.trend === "bullish" ? "alta" : q.trend === "bearish" ? "baixa" : "neutra"} />}
              {q.analyst && <Metric l="Analistas" v={q.analyst === "bullish" ? "otimistas" : q.analyst === "bearish" ? "pessimistas" : "neutros"} />}
              {q.targetUpside != null && <Metric l="Potencial vs preço-alvo" v={(q.targetUpside >= 0 ? "+" : "") + q.targetUpside + "%"} c={q.targetUpside >= 0 ? "#2FA37A" : "#C8553D"} />}
              {q.shortPct != null && <Metric l="Short interest" v={q.shortPct + "%"} />}
            </div>

            {q.lean?.probUp != null && (
              <div className="sp-lean">
                Probabilidade IA de subir: <b style={{ color: probColor(q.lean.probUp) }}>{q.lean.probUp}%</b> · confiança {q.lean.confidence}%.
                <span className="sp-note"> Probabilidade, não garantia. Não é recomendação.</span>
              </div>
            )}

            {q.note && <div className="sp-src">{q.note}</div>}
          </>
        )}

        {myTrades.length > 0 && (
          <div className="sp-mine" style={{ marginTop: 26 }}>
            <h2>As minhas operações em {ticker}</h2>
            <div className="sp-minesum">
              <span><b>{myTrades.length}</b> operações</span>
              <span>acerto <b style={{ color: myWins / myTrades.length >= 0.5 ? "#2FA37A" : "#C8553D" }}>{Math.round(myWins / myTrades.length * 100)}%</b> ({myWins}/{myTrades.length})</span>
              <span>L/P <b style={{ color: myPL >= 0 ? "#2FA37A" : "#C8553D" }}>{myPL >= 0 ? "+" : ""}{eur(myPL)}</b></span>
            </div>
            <div className="sp-tablewrap">
              <table className="sp-table">
                <thead><tr><th>compra</th><th>venda</th><th>qtd</th><th>preço C→V</th><th>dias</th><th>P/L</th><th>%</th></tr></thead>
                <tbody>
                  {myTrades.map((t, i) => (
                    <tr key={i}>
                      <td>{fmtDay(t.buyDate)}</td><td>{fmtDay(t.sellDate)}</td><td>{t.qty}</td>
                      <td>${t.buyPx} → ${t.sellPx}</td><td>{t.holdDays}</td>
                      <td style={{ color: t.pl >= 0 ? "#2FA37A" : "#C8553D" }}>{t.pl >= 0 ? "+" : ""}{eur(t.pl)}</td>
                      <td style={{ color: t.pct >= 0 ? "#2FA37A" : "#C8553D" }}>{t.pct >= 0 ? "+" : ""}{t.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <style>{SP_CSS}</style>
    </div>
  );
}

function Metric({ l, v, c, sub }) {
  return (
    <div className="sp-metric">
      <span>{l}</span>
      <b style={c ? { color: c } : undefined}>{v}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

const SP_CSS = `
.sp-root{padding-bottom:40px;}
.sp-head{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:22px;}
.sp-head .ts-mono{width:52px;height:52px;font-size:16px;border-radius:12px;}
.sp-title{flex:1;min-width:200px;}
.sp-title h1{font-family:'Space Grotesk',sans-serif;font-size:30px;margin:0 0 4px;}
.sp-name{color:var(--tx);font-size:15px;}
.sp-sub{color:var(--mut);font-size:12.5px;margin-top:4px;font-family:'IBM Plex Mono',monospace;}
.sp-price{text-align:right;}
.sp-price b{font-family:'IBM Plex Mono',monospace;font-size:26px;display:block;}
.sp-prob{font-size:12.5px;}
.sp-chart{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:20px;}
.sp-metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:20px;}
.sp-metric{background:var(--s1);border:1px solid var(--line);border-radius:10px;padding:12px 14px;}
.sp-metric span{display:block;font-size:11.5px;color:var(--mut);margin-bottom:4px;}
.sp-metric b{font-family:'IBM Plex Mono',monospace;font-size:19px;}
.sp-metric small{display:block;color:var(--mut);font-size:10.5px;margin-top:2px;}
.sp-lean{background:rgba(214,164,69,.08);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:13.5px;margin-bottom:22px;}
.sp-note{color:var(--mut);}
.sp-mine h2{font-family:'Space Grotesk',sans-serif;font-size:20px;margin:0 0 12px;}
.sp-minesum{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px;font-size:13.5px;color:var(--mut);}
.sp-minesum b{font-family:'IBM Plex Mono',monospace;color:var(--tx);}
.sp-tablewrap{overflow-x:auto;}
.sp-table{width:100%;border-collapse:collapse;font-size:13px;}
.sp-table th{text-align:left;color:var(--mut);font-weight:500;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;border-bottom:1px solid var(--line);}
.sp-table td{padding:9px 10px;border-bottom:1px solid var(--line);font-family:'IBM Plex Mono',monospace;}
.sp-src{color:var(--mut);font-size:11.5px;margin-top:18px;line-height:1.5;}
.sp-err{background:rgba(200,85,61,.12);border:1px solid var(--red);border-radius:10px;padding:14px 16px;color:#f0c0b5;}
`;
