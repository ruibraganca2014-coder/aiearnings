// Helpers partilhados entre TraderSite e Admin (evita duplicação).
export const WD = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const EXCH = {
  LS: "Lisboa", L: "Londres", PA: "Paris", AS: "Amsterdão", DE: "Xetra", MI: "Milão", MC: "Madrid",
  SW: "Zurique", BR: "Bruxelas", IR: "Dublin", ST: "Estocolmo", VI: "Viena", HE: "Helsínquia",
  AT: "Atenas", OL: "Oslo", CO: "Copenhaga", SI: "Singapura", TO: "Toronto", T: "Tóquio",
  HK: "Hong Kong", AX: "Austrália", SA: "Brasil", NS: "Índia", KS: "Coreia",
};
export const exchOf = (t) => { const m = String(t || "").match(/\.([A-Z]+)$/); return (m && EXCH[m[1]]) || "EUA"; };
// Siglas/sufixos legais que ficam em maiúsculas ao capitalizar nomes vindos em CAPS (bolsas fora dos EUA).
const NAME_KEEP = new Set(["AG", "SE", "NV", "PLC", "SA", "AB", "ASA", "OYJ", "SPA", "BV", "AS", "LLC", "LP", "REIT", "FPO", "USA", "UK", "US", "EU", "AI", "N", "I", "II", "III", "IV", "V", "CO", "DR", "ADR", "PLC.", "INC", "LTD", "HK"]);
// Nomes vêm às vezes TODOS EM MAIÚSCULAS ("BROOKFIELD CORPORATION"). Se não tiver minúsculas, Capitaliza.
export function fmtName(s) {
  const str = String(s || "").trim().replace(/\s+/g, " ");
  if (!str || /[a-z]/.test(str)) return str; // já tem minúsculas → deixa como está
  return str.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok)) return tok;                         // espaços
    if (/^\[.*\]$/.test(tok)) return tok;                      // ticker entre parêntesis rectos
    if (/\d/.test(tok)) return tok;                            // tem dígitos (ex.: "0700.HK", "I")
    if (NAME_KEEP.has(tok.replace(/[.,/&-]/g, ""))) return tok; // siglas/sufixos legais
    if (/^[A-Z]{2,3}$/.test(tok)) return tok;                  // sigla curta 2-3 letras (ex.: RWE, EON)
    return tok.toLowerCase().replace(/(^|[\s\-/.])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }).join("");
}
export const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
