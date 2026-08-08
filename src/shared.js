// Helpers partilhados entre TraderSite e Admin (evita duplicação).
export const WD = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const EXCH = { LS: "Lisboa", L: "Londres", PA: "Paris", AS: "Amsterdão", DE: "Xetra", MI: "Milão", MC: "Madrid" };
export const exchOf = (t) => { const m = String(t || "").match(/\.([A-Z]+)$/); return (m && EXCH[m[1]]) || "EUA"; };
export const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
