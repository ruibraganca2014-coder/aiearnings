import { useState, useEffect, useMemo, useRef } from "react";
import EarningsEdge from "../EarningsEdge.jsx";
import { getToken, setToken, clearToken, fetchAll, savePicks, login, fetchPositions, savePositions, fetchPrices, daysBetween, fetchHistory, saveHistory, extractDoc, fetchEmails, fetchSettings, saveSettings, uploadLedger } from "./picks.js";
import { TRADES } from "./trades.js";
import { WD, exchOf, fmtDay } from "./shared.js";

const emptyRec = () => ({ type: "reaction", ticker: "", name: "", date: new Date().toISOString().slice(0, 10), pct: "", pnl: "", predicted: "SUBIR", probUp: "", nota: "" });

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

function HistoricoAdmin({ token, onAuthFail }) {
  const [hist, setHist] = useState([]);
  const [img, setImg] = useState(null); // {data, mime, name}
  const [draft, setDraft] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [acct, setAcct] = useState({ saldo: "", totalPL: "", capitalBase: "2500" });
  const [acctSaved, setAcctSaved] = useState(true);
  const [led, setLed] = useState(null); // resultado do parse do extrato DEGIRO
  const [ledBusy, setLedBusy] = useState(false);
  const inp = useRef(null);
  const ledInp = useRef(null);

  useEffect(() => {
    fetchHistory().then(setHist);
    fetchSettings().then((s) => setAcct({ saldo: s.saldo != null ? String(s.saldo) : "", totalPL: s.totalPL != null ? String(s.totalPL) : "", capitalBase: s.capitalBase != null ? String(s.capitalBase) : "2500" }));
  }, []);

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
      if (res.account) setAcct((a) => ({ saldo: res.account.saldo != null ? String(res.account.saldo) : a.saldo, totalPL: res.account.totalPL != null ? String(res.account.totalPL) : a.totalPL }));
      setNote(res.note || (res.account && (res.account.saldo != null || res.account.totalPL != null) ? "Conta detetada — confirma e guarda." : ""));
    } catch (e) { if (String(e.message) === "401") return onAuthFail(); setNote("Erro na extração."); }
    setBusy(false);
  };
  const saveAcct = () => {
    setAcctSaved(false);
    saveSettings(token, { saldo: acct.saldo === "" ? null : Number(acct.saldo), totalPL: acct.totalPL === "" ? null : Number(acct.totalPL), capitalBase: acct.capitalBase === "" ? null : Number(acct.capitalBase) })
      .then(() => setAcctSaved(true)).catch((e) => { if (String(e.message) === "401") onAuthFail(); });
  };
  // upload do extrato "Conta Corrente" DEGIRO (.xls/.xlsx): parse no servidor → trades, equity, stats
  const onLedgerFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setLedBusy(true); setNote("A processar extrato DEGIRO…");
    const r = new FileReader();
    r.onload = async () => {
      try {
        const base = acct.capitalBase === "" ? 2500 : Number(acct.capitalBase);
        const res = await uploadLedger(token, r.result, base);
        setLed(res);
        setNote(`Extrato processado ✓ — ${res.stats?.n || 0} trades · acerto ${res.stats?.winRate ?? "—"}% · L/P ${res.stats?.totalPL >= 0 ? "+" : ""}${res.stats?.totalPL ?? "—"}€`);
      } catch (e2) { if (String(e2.message) === "401") return onAuthFail(); setNote("Falha no extrato: " + e2.message); }
      setLedBusy(false);
      e.target.value = "";
    };
    r.readAsDataURL(f);
  };
  // importa os round-trips do extrato para o rascunho (para confirmar → publicar no histórico)
  const importLedgerToDraft = () => {
    if (!led?.trades?.length) return;
    setDraft(led.trades.map((t) => ({ ...emptyRec(), type: "trade", ticker: t.ticker || "", name: t.name || "", date: t.sellDate || "", pct: t.pct ?? "", pnl: t.pl ?? "" })));
    setNote("Trades do extrato no rascunho — revê e publica.");
  };
  const editRow = (i, k, v) => setDraft((d) => d.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const addRow = () => setDraft((d) => [...d, emptyRec()]);
  const delRow = (i) => setDraft((d) => d.filter((_, j) => j !== i));

  const publicar = () => {
    const clean = draft.filter((r) => r.ticker && r.date).map((r) => ({
      type: r.type, ticker: String(r.ticker).toUpperCase().trim(), name: r.name || r.ticker, date: r.date,
      pct: r.pct === "" ? null : Number(r.pct), pnl: r.pnl === "" ? null : Number(r.pnl),
      predicted: r.type === "trade" ? (r.predicted || null) : null, probUp: r.probUp === "" || r.probUp == null ? null : Number(r.probUp), nota: r.nota || null,
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

      <div className="ad-form" style={{ alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>Conta (do documento) —</b>
        <b style={{ fontSize: 13 }}>Saldo €:</b>
        <input className="ad-note" style={{ maxWidth: 120 }} type="number" step="0.01" placeholder="ex. 2776.88" value={acct.saldo} onChange={(e) => setAcct({ ...acct, saldo: e.target.value })} />
        <b style={{ fontSize: 13 }}>Total L/P €:</b>
        <input className="ad-note" style={{ maxWidth: 120 }} type="number" step="0.01" placeholder="ex. 1153.15" value={acct.totalPL} onChange={(e) => setAcct({ ...acct, totalPL: e.target.value })} />
        <b style={{ fontSize: 13 }}>Capital base €:</b>
        <input className="ad-note" style={{ maxWidth: 100 }} type="number" step="0.01" placeholder="2500" value={acct.capitalBase} onChange={(e) => setAcct({ ...acct, capitalBase: e.target.value })} />
        <button className="ad-btn sm" onClick={saveAcct}>Guardar conta</button>
        <span style={{ color: acctSaved ? "#2FA37A" : "#D6A445", fontSize: 12 }}>{acctSaved ? "✓" : "…"}</span>
        <span className="ad-muted" style={{ fontSize: 12 }}>a IA preenche do upload; confirma.</span>
      </div>

      <div className="ad-form" style={{ alignItems: "center", background: "rgba(214,164,69,.06)" }}>
        <b style={{ fontSize: 13 }}>Extrato DEGIRO (.xls) —</b>
        <button className="ad-btn sm" disabled={ledBusy} onClick={() => ledInp.current?.click()}>{ledBusy ? "…" : "＋ Carregar Conta Corrente"}</button>
        <input ref={ledInp} type="file" accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onLedgerFile} />
        {led && <span className="ad-muted" style={{ fontSize: 12 }}>{led.stats?.n} trades · acerto {led.stats?.winRate}% · L/P {led.stats?.totalPL >= 0 ? "+" : ""}{led.stats?.totalPL}€ · hold {led.stats?.avgHold}d</span>}
        {led && <button className="ad-btn sm" onClick={importLedgerToDraft} style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--gold)" }}>Importar trades → rascunho</button>}
      </div>
      <div className="ad-muted" style={{ fontSize: 12, marginBottom: 10 }}>O extrato alimenta a <b>curva de capital</b>, os balões (melhor/pior/hold/câmbio) e as páginas por ação — automaticamente. As linhas de <i>Cash Sweep / Depósitos / Levantamentos</i> são plumbing interno e são ignoradas.</div>

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
            <thead><tr><th>Tipo</th><th>Ticker</th><th>Nome</th><th>Data</th><th>%</th><th>€ (trade)</th><th>Previsão</th><th>Prob ↑%</th><th>Motivo</th><th></th></tr></thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i}>
                  <td><select className="ad-sel" value={r.type} onChange={(e) => editRow(i, "type", e.target.value)}><option value="reaction">Reação</option><option value="trade">Trade</option></select></td>
                  <td><input className="ad-note" style={{ width: 80 }} value={r.ticker} onChange={(e) => editRow(i, "ticker", e.target.value)} /></td>
                  <td><input className="ad-note" value={r.name} onChange={(e) => editRow(i, "name", e.target.value)} /></td>
                  <td><input className="ad-note" style={{ width: 130 }} type="date" value={r.date} onChange={(e) => editRow(i, "date", e.target.value)} /></td>
                  <td><input className="ad-note" style={{ width: 70 }} type="number" step="0.1" value={r.pct} onChange={(e) => editRow(i, "pct", e.target.value)} /></td>
                  <td><input className="ad-note" style={{ width: 80 }} type="number" value={r.pnl} onChange={(e) => editRow(i, "pnl", e.target.value)} /></td>
                  <td><select className="ad-sel" value={r.predicted || ""} disabled={r.type !== "trade"} onChange={(e) => editRow(i, "predicted", e.target.value)}><option value="">—</option><option value="SUBIR">Subir ↑</option><option value="DESCER">Descer ↓</option><option value="NEUTRO">Neutro</option></select></td>
                  <td><input className="ad-note" style={{ width: 60 }} type="number" min="0" max="100" placeholder="61" value={r.probUp ?? ""} onChange={(e) => editRow(i, "probUp", e.target.value)} /></td>
                  <td><input className="ad-note" style={{ width: 160 }} placeholder="ex: beat histórico + momentum" value={r.nota ?? ""} onChange={(e) => editRow(i, "nota", e.target.value)} /></td>
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

// Escolha do trader: marca UMA pick publicada como destaque (★) + nota do porquê.
function DestaqueAdmin({ token, onAuthFail }) {
  const [picks, setPicks] = useState(null);
  const [saved, setSaved] = useState(true);
  const [busyTicker, setBusyTicker] = useState(null);
  useEffect(() => { fetchAll(token).then(setPicks).catch((e) => { if (String(e.message) === "401") onAuthFail(); }); }, []);
  if (!picks) return <div className="ad-muted">A carregar picks…</div>;
  const entries = Object.entries(picks).filter(([, v]) => v.show)
    .sort((a, b) => (a[1].entryISO || a[1].date || "").localeCompare(b[1].entryISO || b[1].date || ""));
  const persist = (next) => { setPicks(next); setSaved(false); savePicks(token, next).then(() => setSaved(true)).catch((e) => { if (String(e.message) === "401") onAuthFail(); }); };
  // marcar ★ → também corre a análise + as 5 pesquisas aprofundadas e guarda-as no card
  const setFeatured = async (key) => {
    const turningOn = !picks[key].featured;
    const next = {}; for (const [k, v] of Object.entries(picks)) next[k] = { ...v, featured: k === key ? turningOn : false };
    persist(next);
    if (!turningOn) return;
    const ticker = picks[key].ticker;
    setBusyTicker(ticker);
    try {
      const q = await (await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(ticker)}&llm=1`, { cache: "no-store" })).json();
      const reac = q.reactions || [], mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      const pUp = (q.llm?.probUp ?? q.lean?.probUp ?? 50) / 100;
      const ev = reac.length >= 4 ? pUp * mean(reac.filter((r) => r > 0)) + (1 - pUp) * mean(reac.filter((r) => r < 0)) : null;
      const types = ["financial", "equity", "earnings", "market"], research = {};
      await Promise.all(types.map(async (ty) => { try { const rr = await (await fetch(`/api/yahoo/research?symbol=${encodeURIComponent(ticker)}&type=${ty}`, { cache: "no-store" })).json(); if (rr && rr.text) research[ty] = rr.text; } catch {} }));
      let isin = null; try { const led = await (await fetch("/api/ledger", { cache: "no-store" })).json(); isin = (led.trades || []).find((t) => t.ticker === ticker)?.isin || null; } catch {}
      const all = await fetchAll(token);
      all[key] = {
        ...all[key], featured: true, show: true, name: q.name || all[key].name,
        probUp: q.lean?.probUp ?? q.llm?.probUp ?? all[key].probUp ?? null, confidence: q.lean?.confidence ?? q.llm?.confidence ?? null,
        ev: ev != null ? Math.round(ev * 100) / 100 : (all[key].ev ?? null),
        impliedMove: q.impliedMove ?? null, gapAvg: q.gapAvg ?? null, gapPctUp: q.gapPctUp ?? null, momentum: q.momentum ?? null,
        rsi: q.rsi ?? null, analyst: q.analyst || "", beatRate: q.beatRate ?? null, targetUpside: q.targetUpside ?? null, price: q.price ?? null,
        history: q.history || null, earningsMarks: q.earningsMarks || null, sector: q.sector || all[key].sector || "", research,
        signals: q.lean?.signals || null, reactions: Array.isArray(q.reactions) ? q.reactions : null,
        reactionStd: q.reactionStd ?? null, reactionLow: q.reactionLow ?? null, reactionHigh: q.reactionHigh ?? null,
        reactionMin: q.reactionMin ?? null, reactionMax: q.reactionMax ?? null, reactionN: q.reactionN ?? null, shortPct: q.shortPct ?? null,
        website: q.website || all[key].website || "", isin: isin || all[key].isin || null,
      };
      await savePicks(token, all);
      setPicks(all); setSaved(true);
    } catch (e) { if (String(e.message) === "401") onAuthFail(); }
    setBusyTicker(null);
  };
  const setNota = (key, val) => setPicks((p) => ({ ...p, [key]: { ...p[key], nota: val } }));
  const saveNotas = () => persist(picks);
  const featuredKey = entries.find(([, v]) => v.featured)?.[0];
  return (
    <div>
      <div className="ad-bar">Escolha do trader · marca <b>UMA</b> ação publicada com <b>★</b> — aparece em destaque no topo do site. {featuredKey ? <>Atual: <b>{picks[featuredKey].ticker}</b></> : <span style={{ color: "#D6A445" }}>nenhuma escolhida</span>} · <span style={{ color: saved ? "#2FA37A" : "#D6A445" }}>{saved ? "guardado ✓" : "a guardar…"}</span></div>
      {!entries.length ? <div className="ad-muted">Sem picks publicadas. Publica no Painel de análise primeiro.</div> : (
        <>
          <div className="ad-muted" style={{ marginBottom: 8 }}>Escreve o motivo (nota) e clica <b>Guardar notas</b>. O <b>★</b> grava logo e <b>corre as 5 pesquisas aprofundadas</b> da ação (aparecem no card do site). {busyTicker && <span style={{ color: "#D6A445" }}>⏳ a analisar {busyTicker}…</span>}</div>
          <table className="ad-tbl">
            <thead><tr><th>★</th><th>Ticker</th><th>Nome</th><th>Prob ↑</th><th>Entrada</th><th>Motivo / nota do trader</th></tr></thead>
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k} style={v.featured ? { background: "rgba(214,164,69,.10)" } : undefined}>
                  <td><button className="ad-btn sm" disabled={busyTicker != null} style={{ padding: "2px 8px", background: v.featured ? "var(--gold)" : "transparent", color: v.featured ? "#1a1206" : "var(--gold)", border: "1px solid var(--gold)" }} onClick={() => setFeatured(k)}>{busyTicker === v.ticker ? "…" : "★"}</button></td>
                  <td className="ad-tk">{v.ticker}</td>
                  <td className="ad-nm">{v.name}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono',monospace", color: v.probUp >= 55 ? "#2FA37A" : v.probUp <= 45 ? "#C8553D" : "#D6A445" }}>{v.probUp != null ? v.probUp + "%" : "—"}</td>
                  <td className="ad-muted">{v.entryISO || v.date || "—"}</td>
                  <td><input className="ad-note" style={{ width: 260 }} placeholder="ex: beat histórico + momentum forte" value={v.nota || ""} onChange={(e) => setNota(k, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="ad-btn" style={{ marginTop: 12 }} onClick={saveNotas}>Guardar notas</button>
        </>
      )}
    </div>
  );
}

function SubscritoresAdmin({ token, onAuthFail }) {
  const [emails, setEmails] = useState(null);
  useEffect(() => { fetchEmails(token).then(setEmails).catch((e) => { if (String(e.message) === "401") onAuthFail(); }); }, [token]);
  if (!emails) return <div className="ad-muted">A carregar…</div>;
  return (
    <div>
      <div className="ad-bar">Subscritores da newsletter · <b>{emails.length}</b></div>
      {!emails.length ? <div className="ad-muted">Sem subscritores ainda. Aparecem aqui quando alguém subscreve no site.</div> : (
        <table className="ad-tbl">
          <thead><tr><th>Email</th><th>Data</th></tr></thead>
          <tbody>{emails.map((e, i) => <tr key={e.email + i}><td>{e.email}</td><td className="ad-muted">{e.date}</td></tr>)}</tbody>
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
  const [tab, setTab] = useState("pos");
  const [token, setTok] = useState(getToken());
  const logout = () => { clearToken(); setTok(null); };
  if (!token) return <Login onLogin={setTok} />;
  return (
    <div className="ad-root">
      <style>{CSS}</style>
      <header className="ad-nav">
        <div className="ad-brand"><span>AI</span>earnings <em>admin</em></div>
        <div className="ad-tabs">
          <button className={tab === "pos" ? "on" : ""} onClick={() => setTab("pos")}>Posições (espera)</button>
          <button className={tab === "hist" ? "on" : ""} onClick={() => setTab("hist")}>Histórico (upload)</button>
          <button className={tab === "destaque" ? "on" : ""} onClick={() => setTab("destaque")}>★ Destaque</button>
          <button className={tab === "subs" ? "on" : ""} onClick={() => setTab("subs")}>Subscritores</button>
          <button className={tab === "ana" ? "on" : ""} onClick={() => setTab("ana")}>Painel de análise</button>
        </div>
        <div className="ad-links">
          <a href="#site" target="_blank">Ver site ↗</a>
          <button className="ad-logout" onClick={logout}>Sair</button>
        </div>
      </header>
      {tab === "pos" ? (
        <div className="ad-wrap"><PositionsAdmin token={token} onAuthFail={logout} /></div>
      ) : tab === "hist" ? (
        <div className="ad-wrap"><HistoricoAdmin token={token} onAuthFail={logout} /></div>
      ) : tab === "destaque" ? (
        <div className="ad-wrap"><DestaqueAdmin token={token} onAuthFail={logout} /></div>
      ) : tab === "subs" ? (
        <div className="ad-wrap"><SubscritoresAdmin token={token} onAuthFail={logout} /></div>
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
.ad-sect{display:inline-block;margin-top:3px;font-size:10px;color:var(--mut);border:1px solid var(--line);border-radius:5px;padding:1px 6px;text-transform:capitalize;}
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
