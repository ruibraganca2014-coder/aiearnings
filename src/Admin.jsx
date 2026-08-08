import { useState, useEffect, useMemo, useRef } from "react";
import EarningsEdge from "../EarningsEdge.jsx";
import { getToken, setToken, clearToken, fetchAll, savePicks, login, fetchPositions, savePositions, fetchPrices, daysBetween, fetchLedger, saveLedger, fetchEmails, fetchHistory, saveHistory, extractDoc, fetchTrades, saveTrades, fetchSettings, saveSettings } from "./picks.js";
import { TRADES } from "./trades.js";
import { WD, exchOf, fmtDay } from "./shared.js";

const emptyRec = () => ({ type: "reaction", ticker: "", name: "", date: new Date().toISOString().slice(0, 10), pct: "", pnl: "" });

const RECOS = ["", "SUBIR", "DESCER", "NEUTRO"];

function Curadoria({ token, onAuthFail }) {
  const [rows, setRows] = useState(null);
  const [past, setPast] = useState([]);
  const [pastPred, setPastPred] = useState({}); // ticker -> previsão
  const [pubMsg, setPubMsg] = useState({}); // ticker -> mensagem
  const [err, setErr] = useState("");
  const [picks, setPicks] = useState({});
  const [saved, setSaved] = useState(true);
  const [ana, setAna] = useState({}); // ticker -> {loading|data|error}

  useEffect(() => {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
    fetch(`/api/yahoo/calendar?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((a) => {
        setRows((a || []).filter((x) => !x.past));
        setPast((a || []).filter((x) => x.past && x.reaction != null).sort((a, b) => b.date.localeCompare(a.date)));
      })
      .catch((e) => setErr(String(e.message || e)));
    fetchAll(token).then(setPicks).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  }, [token]);

  // publicar um resultado passado no histórico (com a previsão → alimenta a taxa de acerto)
  const publishPast = async (it) => {
    const predicted = pastPred[it.ticker] || (it.reaction >= 0 ? "SUBIR" : "DESCER");
    const rec = { type: "reaction", ticker: it.ticker, name: it.name, date: it.date, pct: Math.round(it.reaction * 10) / 10, pnl: null, predicted, exch: exchOf(it.ticker), src: "calendar" };
    try {
      const h = await fetchHistory();
      if (h.some((x) => x.ticker === it.ticker && x.date === it.date)) { setPubMsg((m) => ({ ...m, [it.ticker]: "já existe" })); return; }
      await saveHistory(token, [...h, rec]);
      setPubMsg((m) => ({ ...m, [it.ticker]: "✓ no histórico" }));
    } catch (e) { if (String(e.message) === "401") return onAuthFail(); setPubMsg((m) => ({ ...m, [it.ticker]: "erro" })); }
  };

  const set = (tk, patch, meta) => {
    const cur = picks[tk] || {};
    let next = { ...picks, [tk]: { ...meta, ...cur, ...patch, ticker: tk } };
    // regra: só 1 SUBIR por dia — ao marcar SUBIR, limpa o SUBIR de outra ação do mesmo dia
    if (patch.reco === "SUBIR") {
      const day = next[tk].entryISO || next[tk].date;
      for (const k of Object.keys(next)) {
        if (k !== tk && next[k].reco === "SUBIR" && (next[k].entryISO || next[k].date) === day) {
          next = { ...next, [k]: { ...next[k], reco: "" } };
        }
      }
    }
    setPicks(next);
    setSaved(false);
    savePicks(token, next).then(() => setSaved(true)).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  };

  const analyze = async (tk) => {
    setAna((a) => ({ ...a, [tk]: { loading: true } }));
    try {
      const d = await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(tk)}`).then((r) => r.json());
      const m = { probUp: d.lean?.probUp ?? null, gapUp: d.gapPctUp ?? null, gapAvg: d.gapAvg ?? null, impliedMove: d.impliedMove ?? null, pctUp: d.pctUp ?? null };
      setAna((a) => ({ ...a, [tk]: { data: m } }));
      set(tk, m); // guarda métricas no pick
    } catch (e) {
      setAna((a) => ({ ...a, [tk]: { error: String(e.message || e) } }));
    }
  };

  const groups = useMemo(() => {
    if (!rows) return [];
    const g = {};
    for (const it of rows) { const k = it.entryISO || it.date; (g[k] = g[k] || []).push(it); }
    return Object.keys(g).sort().map((k) => ({ day: k, items: g[k] }));
  }, [rows]);

  const pastGroups = useMemo(() => {
    const g = {};
    for (const it of past) { (g[it.date] = g[it.date] || []).push(it); }
    return Object.keys(g).sort((a, b) => b.localeCompare(a)).slice(0, 4).map((k) => ({ day: k, items: g[k] }));
  }, [past]);

  const published = Object.values(picks).filter((p) => p.show).length;

  if (err) return <div className="ad-muted">Erro ao carregar calendário: {err}</div>;
  if (!rows) return <div className="ad-muted">A carregar próximos resultados…</div>;

  return (
    <div>
      <div className="ad-bar">
        <b>{rows.length}</b> próximos · <b>{published}</b> publicados no site
        <span className="ad-muted"> · escolhe ★ para mostrar e define a previsão · <b>só 1 SUBIR por dia</b> · </span>
        <span style={{ color: saved ? "#2FA37A" : "#D6A445" }}>{saved ? "✓ guardado" : "a guardar…"}</span>
      </div>
      {groups.map((grp) => (
        <div className="ad-day" key={grp.day}>
          <div className="ad-dayhdr">{WD[new Date(grp.day + "T00:00:00").getDay()]} · {fmtDay(grp.day)}</div>
          <table className="ad-tbl">
            <thead><tr><th></th><th>Ticker</th><th>Bolsa</th><th>Quando</th><th>Análise</th><th>Previsão (subir/descer)</th><th>Nota (aparece no site)</th></tr></thead>
            <tbody>
              {grp.items.map((it) => {
                const p = picks[it.ticker] || {};
                const meta = { name: it.name, exch: exchOf(it.ticker), date: it.date, entryISO: it.entryISO, when: it.when };
                const a = ana[it.ticker];
                return (
                  <tr key={it.ticker} className={p.show ? "ad-on" : ""}>
                    <td><button className={"ad-star" + (p.show ? " on" : "")} title="Mostrar no site" onClick={() => set(it.ticker, { show: !p.show }, meta)}>★</button></td>
                    <td className="ad-tk">{it.ticker}<div className="ad-nm">{it.name}</div></td>
                    <td><span className="ad-ex">{exchOf(it.ticker)}</span></td>
                    <td className="ad-when">{it.when === "BMO" ? "pré-abert." : it.when === "AMC" ? "após fecho" : "—"}</td>
                    <td className="ad-ana">
                      {!a && <button className="ad-btn sm" onClick={() => analyze(it.ticker)}>Analisar</button>}
                      {a?.loading && <span className="ad-muted">…</span>}
                      {a?.error && <span className="ad-red">erro</span>}
                      {a?.data && (
                        <span className="ad-metrics">
                          {a.data.probUp != null && <b style={{ color: a.data.probUp >= 55 ? "#2FA37A" : a.data.probUp <= 45 ? "#C8553D" : "#D6A445" }}>P↑ {a.data.probUp}%</b>}
                          {a.data.gapUp != null && <>{" · "}gap↑ {a.data.gapUp}%</>}
                          {a.data.gapAvg != null && <>{" · "}méd {a.data.gapAvg > 0 ? "+" : ""}{a.data.gapAvg}%</>}
                          {a.data.impliedMove != null && <>{" · "}imp ±{a.data.impliedMove}%</>}
                        </span>
                      )}
                    </td>
                    <td>
                      <select className="ad-sel" value={p.reco || ""} onChange={(e) => set(it.ticker, { reco: e.target.value }, meta)}>
                        {RECOS.map((r) => <option key={r} value={r}>{r || "—"}</option>)}
                      </select>
                    </td>
                    <td><input className="ad-note" placeholder="opinião curta…" value={p.nota || ""} onChange={(e) => set(it.ticker, { nota: e.target.value }, meta)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {pastGroups.length > 0 && (
        <>
          <div className="ad-dayhdr" style={{ marginTop: 22, color: "var(--tx)" }}>Resultados dos últimos 4 dias — publicar no histórico (com previsão → conta para o acerto)</div>
          {pastGroups.map((grp) => (
            <div className="ad-day" key={"p" + grp.day}>
              <div className="ad-dayhdr">{WD[new Date(grp.day + "T00:00:00").getDay()]} · {fmtDay(grp.day)}</div>
              <table className="ad-tbl">
                <thead><tr><th>Ticker</th><th>Bolsa</th><th>Reação real</th><th>Previsão</th><th></th></tr></thead>
                <tbody>
                  {grp.items.map((it) => {
                    const up = it.reaction >= 0;
                    return (
                      <tr key={it.ticker + it.date}>
                        <td className="ad-tk">{it.ticker}<div className="ad-nm">{it.name}</div></td>
                        <td><span className="ad-ex">{exchOf(it.ticker)}</span></td>
                        <td style={{ color: up ? "#2FA37A" : "#C8553D", fontFamily: "'IBM Plex Mono',monospace" }}>{up ? "▲ subiu" : "▼ desceu"} {Math.abs(it.reaction).toFixed(1)}%</td>
                        <td>
                          <select className="ad-sel" value={pastPred[it.ticker] ?? (up ? "SUBIR" : "DESCER")} onChange={(e) => setPastPred((m) => ({ ...m, [it.ticker]: e.target.value }))}>
                            {["SUBIR", "DESCER", "NEUTRO"].map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td>
                          <button className="ad-btn sm" onClick={() => publishPast(it)}>+ histórico</button>
                          {pubMsg[it.ticker] && <span className="ad-muted" style={{ marginLeft: 8 }}>{pubMsg[it.ticker]}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PositionsAdmin({ token, onAuthFail }) {
  const today = new Date().toISOString().slice(0, 10);
  const [pos, setPos] = useState([]);
  const [prices, setPrices] = useState({});
  const [f, setF] = useState({ ticker: "", name: "", buyPrice: "", buyDate: today, note: "" });
  const [sell, setSell] = useState({});
  const [saved, setSaved] = useState(true);

  const loadPrices = (arr) => fetchPrices(arr.map((x) => x.ticker)).then(setPrices);
  useEffect(() => {
    fetchPositions().then((p) => { setPos(p); loadPrices(p); });
    const id = setInterval(() => fetchPositions().then((p) => { setPos(p); loadPrices(p); }), 60000);
    return () => clearInterval(id);
  }, []);

  const persist = (next) => {
    setPos(next); setSaved(false);
    savePositions(token, next).then(() => setSaved(true)).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  };
  const add = () => {
    const ticker = f.ticker.trim().toUpperCase();
    const buyPrice = parseFloat(f.buyPrice);
    if (!ticker || !buyPrice || !f.buyDate) return;
    const next = [...pos, { ticker, name: f.name.trim() || ticker, exch: exchOf(ticker), buyPrice, buyDate: f.buyDate, note: f.note.trim() }];
    persist(next); loadPrices(next);
    setF({ ticker: "", name: "", buyPrice: "", buyDate: today, note: "" });
  };
  const remove = (i) => persist(pos.filter((_, j) => j !== i));
  const imp = (tr) => setF({ ticker: tr.t, name: tr.name, buyPrice: String(tr.buy), buyDate: today, note: "" });
  // fechar posição → vai para o histórico (posições anteriores)
  const close = async (i, p, cur) => {
    const sp = parseFloat(sell[i] != null && sell[i] !== "" ? sell[i] : (cur ?? ""));
    if (!sp) return;
    const pct = +(((sp - p.buyPrice) / p.buyPrice) * 100).toFixed(1);
    const rec = { type: "trade", ticker: p.ticker, name: p.name, date: today, buyPrice: p.buyPrice, sellPrice: sp, pct, pnl: null, exch: p.exch || exchOf(p.ticker), src: "position" };
    try { const h = await fetchHistory(); await saveHistory(token, [...h, rec]); }
    catch (e) { if (String(e.message) === "401") return onAuthFail(); }
    persist(pos.filter((_, j) => j !== i));
    setSell((s) => { const n = { ...s }; delete n[i]; return n; });
  };

  return (
    <div>
      <div className="ad-bar">Método "aguardar recuperação" · <b>{pos.length}</b> posições · <span style={{ color: saved ? "#2FA37A" : "#D6A445" }}>{saved ? "✓ guardado" : "a guardar…"}</span></div>

      <div className="ad-imp">Importar dos trades reais: {TRADES.map((tr) => <button key={tr.t} className="ad-chip" onClick={() => imp(tr)}>{tr.t}</button>)}</div>

      <div className="ad-form">
        <input className="ad-note" style={{ maxWidth: 90 }} placeholder="TICKER" value={f.ticker} onChange={(e) => setF({ ...f, ticker: e.target.value })} />
        <input className="ad-note" placeholder="nome (opcional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="ad-note" style={{ maxWidth: 120 }} type="number" step="0.01" placeholder="preço compra" value={f.buyPrice} onChange={(e) => setF({ ...f, buyPrice: e.target.value })} />
        <input className="ad-note" style={{ maxWidth: 150 }} type="date" value={f.buyDate} onChange={(e) => setF({ ...f, buyDate: e.target.value })} />
        <input className="ad-note" placeholder="nota (aparece no site)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="ad-btn sm" onClick={add}>＋ Adicionar</button>
      </div>

      {!pos.length ? <div className="ad-muted">Sem posições. Adiciona uma acima (ou importa de um trade real).</div> : (
        <table className="ad-tbl">
          <thead><tr><th>Ticker</th><th>Compra</th><th>Atual</th><th>P&L</th><th>Contador</th><th>Nota</th><th>Fechar (venda)</th><th></th></tr></thead>
          <tbody>
            {pos.map((p, i) => {
              const cur = prices[p.ticker] ?? null;
              const under = cur != null && cur < p.buyPrice;
              const rec = cur != null && cur >= p.buyPrice;
              const pnl = cur != null ? ((cur - p.buyPrice) / p.buyPrice * 100) : null;
              const days = under ? daysBetween(p.buyDate) : 0;
              return (
                <tr key={p.ticker + p.buyDate}>
                  <td className="ad-tk">{p.ticker}<div className="ad-nm">{p.name}</div></td>
                  <td>${p.buyPrice} <span className="ad-muted">{p.buyDate}</span></td>
                  <td>{cur != null ? "$" + cur.toFixed(2) : "…"}</td>
                  <td style={{ color: pnl == null ? "var(--mut)" : pnl < 0 ? "#C8553D" : "#2FA37A" }}>{pnl != null ? (pnl >= 0 ? "+" : "") + pnl.toFixed(1) + "%" : "—"}</td>
                  <td style={{ color: under ? "#C8553D" : "#2FA37A", fontFamily: "'IBM Plex Mono',monospace" }}>{under ? `⏳ ${days} d` : rec ? "✓ pode vender" : "—"}</td>
                  <td className="ad-muted">{p.note}</td>
                  <td>
                    <input className="ad-note" style={{ width: 84 }} type="number" step="0.01" placeholder={cur != null ? cur.toFixed(2) : "venda $"} value={sell[i] ?? ""} onChange={(e) => setSell((s) => ({ ...s, [i]: e.target.value }))} />
                    <button className="ad-btn sm" style={{ marginLeft: 6 }} onClick={() => close(i, p, cur)}>Fechar</button>
                  </td>
                  <td><button className="ad-logout" onClick={() => remove(i)} title="Apagar sem guardar">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RendaAdmin({ token, onAuthFail }) {
  const today = new Date().toISOString().slice(0, 10);
  const [led, setLed] = useState([]);
  const [emails, setEmails] = useState([]);
  const [f, setF] = useState({ type: "deposit", amount: "", date: today, note: "" });
  const [saved, setSaved] = useState(true);
  const [totalPL, setTotalPL] = useState("");
  const [saldo, setSaldo] = useState("");
  const [plSaved, setPlSaved] = useState(true);

  useEffect(() => {
    fetchLedger().then(setLed);
    fetchSettings().then((s) => { setTotalPL(s.totalPL != null ? String(s.totalPL) : ""); setSaldo(s.saldo != null ? String(s.saldo) : ""); });
    fetchEmails(token).then(setEmails).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  }, [token]);

  const savePL = () => {
    setPlSaved(false);
    saveSettings(token, { totalPL: totalPL === "" ? null : Number(totalPL), saldo: saldo === "" ? null : Number(saldo) }).then(() => setPlSaved(true)).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  };

  const persist = (next) => {
    setLed(next); setSaved(false);
    saveLedger(token, next).then(() => setSaved(true)).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  };
  const add = () => {
    const amount = parseFloat(f.amount);
    if (!amount || !f.date) return;
    persist([...led, { type: f.type, amount, date: f.date, note: f.note.trim() }]);
    setF({ type: "deposit", amount: "", date: today, note: "" });
  };
  const remove = (i) => persist(led.filter((_, j) => j !== i));

  const sorted = [...led].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let bal = 0; const withRun = sorted.map((e) => { bal += (e.type === "withdraw" ? -1 : 1) * (+e.amount || 0); return { ...e, bal }; });
  const dep = led.filter((e) => e.type !== "withdraw").reduce((a, e) => a + (+e.amount || 0), 0);
  const wit = led.filter((e) => e.type === "withdraw").reduce((a, e) => a + (+e.amount || 0), 0);

  return (
    <div>
      <div className="ad-form" style={{ alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>Total L/P €:</b>
        <input className="ad-note" style={{ maxWidth: 120 }} type="number" step="0.01" placeholder="ex. 1153.15" value={totalPL} onChange={(e) => setTotalPL(e.target.value)} />
        <b style={{ fontSize: 13 }}>Saldo €:</b>
        <input className="ad-note" style={{ maxWidth: 120 }} type="number" step="0.01" placeholder="ex. 2776.88" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
        <button className="ad-btn sm" onClick={savePL}>Guardar</button>
        <span style={{ color: plSaved ? "#2FA37A" : "#D6A445", fontSize: 12 }}>{plSaved ? "✓" : "…"}</span>
        <span className="ad-muted" style={{ fontSize: 12 }}>aparece no site como "resultado total". Copia do teu DEGIRO.</span>
      </div>
      <div className="ad-bar">Plano de capital · depositado <b>€{Math.round(dep)}</b> · retirado <b>€{Math.round(wit)}</b> · saldo <b>€{Math.round(bal)}</b> · <span style={{ color: saved ? "#2FA37A" : "#D6A445" }}>{saved ? "✓ guardado" : "a guardar…"}</span></div>

      <div className="ad-form">
        <select className="ad-note" style={{ maxWidth: 130 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="deposit">Depósito</option>
          <option value="withdraw">Retirada (renda)</option>
        </select>
        <input className="ad-note" style={{ maxWidth: 120 }} type="number" step="0.01" placeholder="€ montante" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <input className="ad-note" style={{ maxWidth: 150 }} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input className="ad-note" placeholder="nota" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="ad-btn sm" onClick={add}>＋ Registar</button>
      </div>

      {!led.length ? <div className="ad-muted">Sem movimentos. Regista depósitos e retiradas.</div> : (
        <table className="ad-tbl">
          <thead><tr><th>Data</th><th>Tipo</th><th>Montante</th><th>Saldo</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            {withRun.slice().reverse().map((e, ri) => {
              const idx = led.findIndex((x) => x.date === e.date && x.type === e.type && x.amount === e.amount && (x.note || "") === (e.note || ""));
              return (
                <tr key={e.date + e.type + e.amount + ri}>
                  <td>{e.date}</td>
                  <td style={{ color: e.type === "withdraw" ? "#2FA37A" : "var(--tx)" }}>{e.type === "withdraw" ? "Retirada" : "Depósito"}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{e.type === "withdraw" ? "−" : "+"}€{Math.round(e.amount)}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono',monospace" }}>€{Math.round(e.bal)}</td>
                  <td className="ad-muted">{e.note}</td>
                  <td><button className="ad-logout" onClick={() => remove(idx)}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 24, fontFamily: "'Space Grotesk',sans-serif" }}>Subscritores ({emails.length})</h3>
      {!emails.length ? <div className="ad-muted">Sem subscritores ainda.</div> : (
        <table className="ad-tbl"><thead><tr><th>Email</th><th>Data</th></tr></thead>
          <tbody>{emails.map((e, i) => <tr key={e.email + i}><td>{e.email}</td><td className="ad-muted">{e.date}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

function TradesAdmin({ token, onAuthFail }) {
  const [trades, setTrades] = useState(null);
  const [f, setF] = useState({ t: "", name: "", buy: "", sell: "", pnl: "" });
  const [saved, setSaved] = useState(true);

  useEffect(() => { fetchTrades().then((a) => setTrades(Array.isArray(a) ? a : TRADES)); }, []); // [] = ficheiro limpo; null = ainda sem ficheiro → mostra os default para editares

  const persist = (next) => {
    setTrades(next); setSaved(false);
    saveTrades(token, next).then(() => setSaved(true)).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  };
  const add = () => {
    const buy = parseFloat(f.buy), sell = parseFloat(f.sell);
    if (!f.t || !buy || !sell) return;
    const pct = +(((sell - buy) / buy) * 100).toFixed(1);
    persist([...(trades || []), { t: f.t.toUpperCase().trim(), name: f.name.trim() || f.t.toUpperCase(), buy, sell, pct, pnl: f.pnl === "" ? 0 : Number(f.pnl) }]);
    setF({ t: "", name: "", buy: "", sell: "", pnl: "" });
  };
  const remove = (i) => persist(trades.filter((_, j) => j !== i));

  if (!trades) return <div className="ad-muted">A carregar…</div>;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const total = Math.round(trades.reduce((a, t) => a + (t.pnl || 0), 0));

  return (
    <div>
      <div className="ad-bar">Track record real · <b>{trades.length}</b> trades · {wins} positivos · total <b style={{ color: total >= 0 ? "#2FA37A" : "#C8553D" }}>{total >= 0 ? "+$" : "-$"}{Math.abs(total)}</b> · <span style={{ color: saved ? "#2FA37A" : "#D6A445" }}>{saved ? "✓ guardado" : "a guardar…"}</span></div>

      <div className="ad-form">
        <input className="ad-note" style={{ maxWidth: 80 }} placeholder="TICKER" value={f.t} onChange={(e) => setF({ ...f, t: e.target.value })} />
        <input className="ad-note" placeholder="nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="ad-note" style={{ maxWidth: 100 }} type="number" step="0.01" placeholder="compra $" value={f.buy} onChange={(e) => setF({ ...f, buy: e.target.value })} />
        <input className="ad-note" style={{ maxWidth: 100 }} type="number" step="0.01" placeholder="venda $" value={f.sell} onChange={(e) => setF({ ...f, sell: e.target.value })} />
        <input className="ad-note" style={{ maxWidth: 100 }} type="number" placeholder="lucro $" value={f.pnl} onChange={(e) => setF({ ...f, pnl: e.target.value })} />
        <button className="ad-btn sm" onClick={add}>＋ Adicionar</button>
      </div>

      <table className="ad-tbl">
        <thead><tr><th>Ticker</th><th>Compra→Venda</th><th>%</th><th>Lucro €/$</th><th></th></tr></thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={t.t + i}>
              <td className="ad-tk">{t.t}<div className="ad-nm">{t.name}</div></td>
              <td style={{ fontFamily: "'IBM Plex Mono',monospace" }}>${t.buy} → ${t.sell}</td>
              <td style={{ color: t.pct >= 0 ? "#2FA37A" : "#C8553D", fontFamily: "'IBM Plex Mono',monospace" }}>{t.pct >= 0 ? "+" : ""}{t.pct}%</td>
              <td style={{ color: t.pnl >= 0 ? "#2FA37A" : "#C8553D", fontFamily: "'IBM Plex Mono',monospace" }}>{t.pnl >= 0 ? "+" : ""}{t.pnl}</td>
              <td><button className="ad-logout" onClick={() => remove(i)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ad-muted" style={{ marginTop: 10, fontSize: 12 }}>Estes trades aparecem no site em "Track record real".</div>
    </div>
  );
}

function HistoricoAdmin({ token, onAuthFail }) {
  const [hist, setHist] = useState([]);
  const [img, setImg] = useState(null); // {data, mime, name}
  const [draft, setDraft] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const inp = useRef(null);

  useEffect(() => { fetchHistory().then(setHist); }, []);

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { setImg({ data: r.result, mime: f.type, name: f.name }); setDraft([]); setNote(""); };
    r.readAsDataURL(f);
  };
  const extrair = async () => {
    if (!img) return;
    setBusy(true); setNote("A extrair…");
    try {
      const res = await extractDoc(token, img.data, img.mime);
      setDraft((res.records || []).map((r) => ({ ...emptyRec(), ...r, pct: r.pct ?? "", pnl: r.pnl ?? "" })));
      setNote(res.note || "");
    } catch (e) { if (String(e.message) === "401") return onAuthFail(); setNote("Erro na extração."); }
    setBusy(false);
  };
  const editRow = (i, k, v) => setDraft((d) => d.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const addRow = () => setDraft((d) => [...d, emptyRec()]);
  const delRow = (i) => setDraft((d) => d.filter((_, j) => j !== i));

  const publicar = () => {
    const clean = draft.filter((r) => r.ticker && r.date).map((r) => ({
      type: r.type, ticker: String(r.ticker).toUpperCase().trim(), name: r.name || r.ticker, date: r.date,
      pct: r.pct === "" ? null : Number(r.pct), pnl: r.pnl === "" ? null : Number(r.pnl),
      exch: exchOf(r.ticker), src: "upload",
    }));
    if (!clean.length) { setNote("Nada válido para publicar."); return; }
    const next = [...hist, ...clean];
    setHist(next);
    saveHistory(token, next).then(() => { setNote("Publicado ✓"); setDraft([]); setImg(null); }).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  };
  const removeHist = (i) => { const next = hist.filter((_, j) => j !== i); setHist(next); saveHistory(token, next).catch((e) => { if (String(e.message) === "401") onAuthFail(); }); };

  return (
    <div>
      <div className="ad-bar">Histórico via documento · <b>{hist.length}</b> publicados · a extração é <b>assistida por IA</b> — confirma sempre antes de publicar.</div>

      <div className="ad-form" style={{ alignItems: "flex-start" }}>
        <button className="ad-btn sm" onClick={() => inp.current?.click()}>＋ Escolher imagem/PDF</button>
        <input ref={inp} type="file" accept="image/*,application/pdf" hidden onChange={onFile} />
        {img && <span className="ad-muted">{img.name}</span>}
        {img && <button className="ad-btn sm" disabled={busy} onClick={extrair}>{busy ? "…" : "Extrair (IA)"}</button>}
        <button className="ad-btn sm" onClick={addRow} style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--gold)" }}>+ linha manual</button>
      </div>
      {note && <div className="ad-muted" style={{ marginBottom: 10 }}>{note}</div>}

      {draft.length > 0 && (
        <>
          <div className="ad-muted" style={{ marginBottom: 6 }}>Rascunho — revê/corrige e publica:</div>
          <table className="ad-tbl">
            <thead><tr><th>Tipo</th><th>Ticker</th><th>Nome</th><th>Data</th><th>%</th><th>€ (trade)</th><th></th></tr></thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i}>
                  <td><select className="ad-sel" value={r.type} onChange={(e) => editRow(i, "type", e.target.value)}><option value="reaction">Reação</option><option value="trade">Trade</option></select></td>
                  <td><input className="ad-note" style={{ width: 80 }} value={r.ticker} onChange={(e) => editRow(i, "ticker", e.target.value)} /></td>
                  <td><input className="ad-note" value={r.name} onChange={(e) => editRow(i, "name", e.target.value)} /></td>
                  <td><input className="ad-note" style={{ width: 130 }} type="date" value={r.date} onChange={(e) => editRow(i, "date", e.target.value)} /></td>
                  <td><input className="ad-note" style={{ width: 70 }} type="number" step="0.1" value={r.pct} onChange={(e) => editRow(i, "pct", e.target.value)} /></td>
                  <td><input className="ad-note" style={{ width: 80 }} type="number" value={r.pnl} onChange={(e) => editRow(i, "pnl", e.target.value)} /></td>
                  <td><button className="ad-logout" onClick={() => delRow(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="ad-btn" style={{ marginTop: 12 }} onClick={publicar}>Publicar no histórico</button>
        </>
      )}

      <h3 style={{ marginTop: 24, fontFamily: "'Space Grotesk',sans-serif" }}>Publicado ({hist.length})</h3>
      {!hist.length ? <div className="ad-muted">Sem histórico. Carrega um documento e extrai.</div> : (
        <table className="ad-tbl">
          <thead><tr><th>Data</th><th>Ticker</th><th>Tipo</th><th>%</th><th>€</th><th></th></tr></thead>
          <tbody>
            {hist.slice().reverse().map((r, ri) => {
              const idx = hist.length - 1 - ri;
              return (
                <tr key={r.ticker + r.date + ri}>
                  <td>{r.date}</td>
                  <td className="ad-tk">{r.ticker}<div className="ad-nm">{r.name}</div></td>
                  <td className="ad-muted">{r.type === "trade" ? "Trade" : "Reação"}</td>
                  <td style={{ color: r.pct == null ? "var(--mut)" : r.pct < 0 ? "#C8553D" : "#2FA37A", fontFamily: "'IBM Plex Mono',monospace" }}>{r.pct == null ? "—" : (r.pct >= 0 ? "+" : "") + r.pct + "%"}</td>
                  <td style={{ color: r.pnl == null ? "var(--mut)" : r.pnl < 0 ? "#C8553D" : "#2FA37A", fontFamily: "'IBM Plex Mono',monospace" }}>{r.pnl == null ? "—" : (r.pnl >= 0 ? "+" : "") + "€" + r.pnl}</td>
                  <td><button className="ad-logout" onClick={() => removeHist(idx)}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Login({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await login(pw.trim()); // tolera espaços acidentais (colar/teclado)
      if (r.ok) { try { setToken(r.token); } catch {} onLogin(r.token); } // localStorage pode falhar; segue com token em memória
      else setErr(r.error || "falhou");
    } catch { setErr("erro de rede — servidor a correr?"); }
    setBusy(false);
  };
  return (
    <div className="ad-root">
      <style>{CSS}</style>
      <div className="ad-login">
        <form onSubmit={submit} className="ad-loginbox">
          <div className="ad-brand" style={{ fontSize: 24 }}><span>AI</span>earnings <em>admin</em></div>
          <p className="ad-muted">Área privada. Introduz a password de administrador.</p>
          <input className="ad-note" type="password" placeholder="password" value={pw} autoFocus autoComplete="off" name="ee-admin-pw" onChange={(e) => setPw(e.target.value)} />
          {err && <div className="ad-red">{err}</div>}
          <button className="ad-btn" disabled={busy} type="submit">{busy ? "…" : "Entrar"}</button>
          <div className="ad-muted" style={{ fontSize: 11 }}>Dev: password por omissão <code>admin</code> (define <code>ADMIN_PASSWORD</code> no servidor para produção).</div>
        </form>
      </div>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("cur");
  const [token, setTok] = useState(getToken());
  const logout = () => { clearToken(); setTok(null); };
  if (!token) return <Login onLogin={setTok} />;
  return (
    <div className="ad-root">
      <style>{CSS}</style>
      <header className="ad-nav">
        <div className="ad-brand"><span>AI</span>earnings <em>admin</em></div>
        <div className="ad-tabs">
          <button className={tab === "cur" ? "on" : ""} onClick={() => setTab("cur")}>Curadoria</button>
          <button className={tab === "pos" ? "on" : ""} onClick={() => setTab("pos")}>Posições (espera)</button>
          <button className={tab === "renda" ? "on" : ""} onClick={() => setTab("renda")}>Renda</button>
          <button className={tab === "trades" ? "on" : ""} onClick={() => setTab("trades")}>Trades</button>
          <button className={tab === "hist" ? "on" : ""} onClick={() => setTab("hist")}>Histórico (upload)</button>
          <button className={tab === "ana" ? "on" : ""} onClick={() => setTab("ana")}>Painel de análise</button>
        </div>
        <div className="ad-links">
          <a href="#site" target="_blank">Ver site ↗</a>
          <button className="ad-logout" onClick={logout}>Sair</button>
        </div>
      </header>
      {tab === "cur" ? (
        <div className="ad-wrap"><Curadoria token={token} onAuthFail={logout} /></div>
      ) : tab === "pos" ? (
        <div className="ad-wrap"><PositionsAdmin token={token} onAuthFail={logout} /></div>
      ) : tab === "renda" ? (
        <div className="ad-wrap"><RendaAdmin token={token} onAuthFail={logout} /></div>
      ) : tab === "trades" ? (
        <div className="ad-wrap"><TradesAdmin token={token} onAuthFail={logout} /></div>
      ) : tab === "hist" ? (
        <div className="ad-wrap"><HistoricoAdmin token={token} onAuthFail={logout} /></div>
      ) : (
        <div className="ad-embed"><EarningsEdge /></div>
      )}
    </div>
  );
}

const CSS = `
.ad-root{--ink:#0E1620;--s1:#16232F;--line:#2A3E4E;--tx:#E8EEF2;--mut:#8CA3B3;--gold:#D6A445;--grn:#2FA37A;--red:#C8553D;
  font-family:'Inter',system-ui,sans-serif;background:var(--ink);color:var(--tx);min-height:100vh;}
.ad-root *{box-sizing:border-box;}
.ad-nav{display:flex;align-items:center;gap:18px;padding:12px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--ink);z-index:5;flex-wrap:wrap;}
.ad-brand{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;}.ad-brand span{color:var(--gold);}.ad-brand em{font-style:normal;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.15em;}
.ad-tabs{display:flex;gap:6px;}.ad-tabs button{background:transparent;border:1px solid var(--line);color:var(--mut);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:14px;}
.ad-tabs button.on{background:var(--gold);color:#1a1206;border-color:var(--gold);font-weight:600;}
.ad-links{margin-left:auto;}.ad-links a{color:var(--gold);text-decoration:none;font-size:13px;}
.ad-wrap{padding:18px 20px;max-width:1100px;margin:0 auto;}
.ad-bar{font-size:13px;color:var(--tx);margin-bottom:14px;}.ad-bar b{color:var(--gold);}
.ad-muted{color:var(--mut);font-size:13px;}.ad-red{color:var(--red);font-size:12px;}
.ad-day{margin-bottom:20px;}
.ad-dayhdr{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;margin-bottom:6px;text-transform:capitalize;color:var(--gold);}
.ad-tbl{width:100%;border-collapse:collapse;font-size:13px;background:var(--s1);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
.ad-tbl th{text-align:left;padding:8px 10px;color:var(--mut);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line);}
.ad-tbl td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle;}
.ad-tbl tr:last-child td{border-bottom:none;}
.ad-tbl tr.ad-on{background:rgba(214,164,69,.07);}
.ad-star{background:none;border:none;color:var(--line);font-size:20px;cursor:pointer;line-height:1;}.ad-star.on{color:var(--gold);}
.ad-tk{font-family:'Space Grotesk',sans-serif;font-weight:700;}.ad-nm{font-weight:400;font-size:11px;color:var(--mut);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ad-ex{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--gold);border:1px solid var(--line);border-radius:5px;padding:1px 5px;}
.ad-when{font-size:12px;color:var(--mut);}
.ad-metrics{font-family:'IBM Plex Mono',monospace;font-size:11.5px;}
.ad-btn{background:var(--gold);color:#1a1206;border:none;border-radius:7px;padding:8px 14px;font-weight:600;cursor:pointer;}
.ad-btn.sm{padding:4px 10px;font-size:12px;}
.ad-sel{background:var(--ink);color:var(--tx);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:13px;}
.ad-note{background:var(--ink);color:var(--tx);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:13px;width:100%;min-width:160px;}
.ad-links{margin-left:auto;display:flex;gap:14px;align-items:center;}
.ad-logout{background:transparent;border:1px solid var(--line);color:var(--mut);border-radius:7px;padding:5px 12px;cursor:pointer;font-size:13px;}
.ad-imp{font-size:12px;color:var(--mut);margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.ad-chip{background:transparent;border:1px solid var(--line);color:var(--gold);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}
.ad-chip:hover{border-color:var(--gold);}
.ad-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:18px;background:var(--s1);border:1px solid var(--line);border-radius:10px;padding:12px;}
.ad-form .ad-note{width:auto;flex:1;min-width:120px;}
.ad-login{min-height:100vh;display:flex;align-items:center;justify-content:center;}
.ad-loginbox{background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:28px;width:340px;max-width:90vw;display:flex;flex-direction:column;gap:12px;}
.ad-loginbox .ad-btn{width:100%;}
.ad-loginbox code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px;}
`;
