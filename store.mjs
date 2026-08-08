// Persistência simples (ficheiro JSON) + autenticação de admin por token em memória.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { randomUUID, timingSafeEqual } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || join(DIR, "data"); // disco persistente em produção via DATA_DIR
const FILE = join(DATA, "picks.json");
const POS_FILE = join(DATA, "positions.json");
const HIST_FILE = join(DATA, "history.json");
const LEDGER_FILE = join(DATA, "ledger.json");
const EMAILS_FILE = join(DATA, "emails.json");
const TRADES_FILE = join(DATA, "trades.json");

// ---- picks (curadoria) ----
export function readPicks() {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; }
}
export function writePicks(obj) {
  const d = dirname(FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(FILE, JSON.stringify(obj || {}, null, 2));
  return obj;
}
// só os publicados (★ + recomendação), para o site público
export function publishedPicks() {
  const all = readPicks();
  const out = {};
  for (const [k, v] of Object.entries(all)) if (v && v.show && v.reco) out[k] = v;
  return out;
}

// ---- posições abertas (método "aguardar recuperação") ----
export function readPositions() {
  try { return JSON.parse(readFileSync(POS_FILE, "utf8")); } catch { return []; }
}
export function writePositions(arr) {
  const d = dirname(POS_FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(POS_FILE, JSON.stringify(Array.isArray(arr) ? arr : [], null, 2));
  return arr;
}

// ---- histórico (publicado a partir de documentos) ----
export function readHistory() {
  try { return JSON.parse(readFileSync(HIST_FILE, "utf8")); } catch { return []; }
}
export function writeHistory(arr) {
  const d = dirname(HIST_FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(HIST_FILE, JSON.stringify(Array.isArray(arr) ? arr : [], null, 2));
  return arr;
}

// ---- ledger (depósitos/retiradas — plano de capital) ----
export function readLedger() {
  try { return JSON.parse(readFileSync(LEDGER_FILE, "utf8")); } catch { return []; }
}
export function writeLedger(arr) {
  const d = dirname(LEDGER_FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(LEDGER_FILE, JSON.stringify(Array.isArray(arr) ? arr : [], null, 2));
  return arr;
}

// ---- emails (newsletter/alertas) ----
export function readEmails() {
  try { return JSON.parse(readFileSync(EMAILS_FILE, "utf8")); } catch { return []; }
}
export function addEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: "email inválido" };
  const list = readEmails();
  if (list.some((x) => x.email === e)) return { ok: true, already: true };
  list.push({ email: e, date: new Date().toISOString().slice(0, 10) });
  const d = dirname(EMAILS_FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(EMAILS_FILE, JSON.stringify(list, null, 2));
  return { ok: true };
}

// ---- track record (trades reais) ----
export function readTrades() {
  try { return JSON.parse(readFileSync(TRADES_FILE, "utf8")); } catch { return null; } // null → frontend usa o default (trades.js)
}
export function writeTrades(arr) {
  const d = dirname(TRADES_FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(TRADES_FILE, JSON.stringify(Array.isArray(arr) ? arr : [], null, 2));
  return arr;
}

// ---- auth ----
const DEFAULT_PW = "admin";
const PW = process.env.ADMIN_PASSWORD || DEFAULT_PW;
export const usingDefaultPw = () => !process.env.ADMIN_PASSWORD;
const tokens = new Set();

export function login(pw) {
  const a = Buffer.from(String(pw ?? ""));
  const b = Buffer.from(PW);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return { ok: false, error: "password errada" };
  const token = randomUUID();
  tokens.add(token);
  return { ok: true, token };
}
export function validToken(t) { return !!t && tokens.has(t); }
