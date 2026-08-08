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
const NAME_KEEP = new Set(["AG", "SE", "NV", "PLC", "SA", "AB", "ASA", "OYJ", "SPA", "BV", "AS", "LLC", "LP", "REIT", "FPO", "USA", "UK", "US", "EU", "AI", "N", "I", "II", "III", "IV", "V", "DR", "ADR", "HK"]);
// Sufixos/palavras que devem ficar Capitalizados mesmo sendo curtos (senão a regra de siglas mantinha-os em CAPS).
const NAME_TITLE = new Set(["INC", "LTD", "CO", "CORP", "AND", "THE", "OF"]);
// Nomes vêm às vezes TODOS EM MAIÚSCULAS ("BROOKFIELD CORPORATION"). Se não tiver minúsculas, Capitaliza.
export function fmtName(s) {
  const str = String(s || "").trim().replace(/\s+/g, " ");
  if (!str || /[a-z]/.test(str)) return str; // já tem minúsculas → deixa como está
  return str.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok)) return tok;                         // espaços
    if (/^\[.*\]$/.test(tok)) return tok;                      // ticker entre parêntesis rectos
    if (/\d/.test(tok)) return tok;                            // tem dígitos (ex.: "0700.HK", "I")
    const bare = tok.replace(/[.,/&-]/g, "");
    if (NAME_KEEP.has(bare)) return tok;                       // siglas/sufixos legais mantidos em CAPS
    if (/^[A-Z]{2,3}$/.test(tok) && !NAME_TITLE.has(bare)) return tok; // sigla curta (ex.: RWE, EON), exceto Inc/Ltd/Co
    return tok.toLowerCase().replace(/(^|[\s\-/.])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }).join("");
}
// Escolha(s) do trader: picks marcadas ★ (featured) e publicadas (show), ordenadas por entrada, no máx. `max`.
export const FEATURED_MAX = 3;
// Pode alternar o ★? Desligar é sempre permitido; ligar só se ainda houver espaço (< max).
export const canFeature = (isOn, count, max = FEATURED_MAX) => isOn || count < max;
export const featuredList = (picks, max = FEATURED_MAX) =>
  Object.values(picks || {})
    .filter((p) => p && p.featured && p.show)
    .sort((a, b) => (a.entryISO || a.date || "").localeCompare(b.entryISO || b.date || ""))
    .slice(0, max);
// Áreas/temas: rótulo + cor (as cores batem certo com a legenda do painel de análise).
export const THEME_LABELS = { ai: "IA & Software", cloud: "Cloud", cyber: "Cibersegurança", semis: "Semicondutores", memory: "Memória", datacenter: "Data centers", networking: "Redes", storage: "Armazenamento", finance: "Finanças", crypto: "Cripto", health: "Saúde", consumer: "Consumo", powergrid: "Energia", industrial: "Industrial", defense: "Defesa & Espaço", ev: "Veículos elétricos", solar: "Solar", minerals: "Minerais", gaming: "Media & Gaming" };
export const THEME_COLORS = { ai: "#7C9CF0", cloud: "#6E7BC0", cyber: "#4FB0D4", semis: "#2FB6A0", memory: "#D2A05A", datacenter: "#5C8FB8", networking: "#9E7AD0", storage: "#8FA0D0", finance: "#8FA8B8", crypto: "#E0B341", health: "#E0708F", consumer: "#D98AC0", powergrid: "#E08A4A", industrial: "#9DAE5E", defense: "#C77B4A", ev: "#4FC987", solar: "#F0A93A", minerals: "#B58A5E", gaming: "#C77FD8" };
export const themeColor = (s) => THEME_COLORS[s] || "#8CA3B3";
export const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
