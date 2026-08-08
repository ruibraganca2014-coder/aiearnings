import YF from "yahoo-finance2";
const yf = new YF({ suppressNotices: ["yahooSurvey"] });
const NV = { validateResult: false };
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const U = "AAPL,MSFT,GOOGL,AMZN,META,NVDA,AVGO,AMD,TSLA,ORCL,CRM,ADBE,NFLX,INTC,QCOM,TXN,MU,AMAT,LRCX,KLAC,ARM,PLTR,SNOW,NOW,PANW,CRWD,ZS,FTNT,DDOG,NET,SMCI,DELL,ANET,CSCO,IBM,MRVL,ON,MCHP,WDC,STX,HPE,JPM,BAC,WFC,C,GS,MS,USB,PNC,TFC,COF,SCHW,BLK,AXP,V,MA,PYPL,COIN,HOOD,BX,KKR,SPGI,ICE,CB,MET,MTB,CFG,FITB,HBAN,KEY,CMA,RF,ALLY,UNH,JNJ,LLY,PFE,MRK,ABBV,TMO,ABT,DHR,BMY,AMGN,GILD,VRTX,REGN,MRNA,ISRG,CVS,CI,HUM,MDT,BSX,SYK,WMT,COST,HD,LOW,TGT,NKE,MCD,SBUX,KO,PEP,PG,CL,MDLZ,PM,MO,DIS,CMCSA,ABNB,BKNG,MAR,CMG,LULU,XOM,CVX,COP,SLB,EOG,OXY,CAT,DE,HON,GE,BA,LMT,RTX,NOC,GD,UNP,UPS,FDX,MMM,EMR,ETN,NEE,DUK,SO,LIN,FCX,NUE,ENPH,FSLR,PLD,AMT,SPG,O,BRX,SPCX,SPCE,RKLB,LUNR".split(",");

async function one(t) {
  const [qs, ch] = await Promise.all([
    yf.quoteSummary(t, { modules: ["earnings", "summaryDetail", "price"] }, NV),
    yf.chart(t, { period1: new Date(Date.now() - 760 * 864e5), interval: "1d" }, NV),
  ]);
  const S = (ch.quotes || []).filter((q) => q.close != null).map((q) => ({ d: iso(q.date), c: q.close, o: q.open })).sort((a, b) => a.d.localeCompare(b.d));
  const ti = (rd) => { let x = -1; for (let i = 0; i < S.length; i++) { if (S[i].d <= rd) x = i; else break; } return x; };
  let vUp = 0, gUp = 0, n = 0, gSum = 0;
  for (const q of (qs.earnings?.earningsChart?.quarterly || [])) {
    if (!q.reportedDate) continue;
    const amc = new Date(q.reportedDate).getUTCHours() >= 20;
    const i = ti(iso(q.reportedDate)); const vRef = amc ? i : i - 1, gE = amc ? i : i - 1, gX = amc ? i + 1 : i;
    if (vRef < 1 || gE < 0 || gX >= S.length) continue;
    const vesp = (S[vRef].c - S[vRef - 1].c) / S[vRef - 1].c * 100;
    const gap = (S[gX].o - S[gE].c) / S[gE].c * 100;
    if (vesp > 0) vUp++; if (gap > 0) gUp++; gSum += gap; n++;
  }
  if (n < 3) return null;
  const price = qs.price?.regularMarketPrice, hi = qs.summaryDetail?.fiftyTwoWeekHigh;
  const below = price && hi ? Math.round((hi - price) / hi * 100) : null;
  return { t, name: (qs.price?.shortName || t).slice(0, 20), vUp: Math.round(vUp / n * 100), gUp: Math.round(gUp / n * 100), gAvg: +(gSum / n).toFixed(1), below, n };
}

const out = [];
let i = 0;
const worker = async () => { while (i < U.length) { const t = U[i++]; try { const r = await one(t); if (r) out.push(r); } catch {} } };
await Promise.all(Array.from({ length: 8 }, worker));
// filtro: véspera desce na maioria (vUp<=50) · gap sobe na maioria (gUp>=50) · não no máximo (below>=10)
const cand = out.filter((r) => r.vUp <= 50 && r.gUp >= 50 && r.below != null && r.below >= 2 && r.below <= 15)
  .sort((a, b) => b.gUp - a.gUp || a.vUp - b.vUp || b.gAvg - a.gAvg);
console.log("=== CANDIDATOS (véspera desce + gap sobe + PRÓXIMO do máximo: 2-15% abaixo) ===");
console.log("TICKER  NOME                 vésp↑  gap↑   gapMéd  abaixoMáx  n");
cand.forEach((r) => console.log(r.t.padEnd(7), r.name.padEnd(20), String(r.vUp + "%").padStart(5), String(r.gUp + "%").padStart(6), String((r.gAvg >= 0 ? "+" : "") + r.gAvg + "%").padStart(7), String(r.below + "%").padStart(9), "  " + r.n));
console.log("\ntotal analisados:", out.length, "| candidatos:", cand.length);
