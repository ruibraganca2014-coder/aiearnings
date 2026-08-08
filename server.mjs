// Servidor de produção: serve o build (dist/) + a API (mesmo handler do dev).
import http from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, dirname, normalize } from "path";
import { fileURLToPath } from "url";
import { handleApi } from "./apiHandler.mjs";
import { usingDefaultPw } from "./store.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST = join(DIR, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json", ".webp": "image/webp",
};

const server = http.createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return; // API
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })); return;
  }
  // estáticos (SPA)
  let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (p === "/") p = "/index.html";
  let file = normalize(join(DIST, p));
  if (!file.startsWith(DIST)) { res.statusCode = 403; res.end("Forbidden"); return; } // anti path-traversal
  if (!existsSync(file) || !statSync(file).isFile()) file = join(DIST, "index.html"); // fallback SPA
  try {
    const data = readFileSync(file);
    res.setHeader("Content-Type", MIME[extname(file)] || "application/octet-stream");
    if (/\.(js|css|woff2?|png|jpe?g|svg|webp|ico)$/.test(file)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(data);
  } catch { res.statusCode = 404; res.end("Not found"); }
});

const PORT = Number(process.env.PORT) || 8080;
if (usingDefaultPw()) console.warn("[admin] ⚠ ADMIN_PASSWORD não definido — a usar password DEV 'admin'. DEFINE antes de expor publicamente.");
if (!existsSync(DIST)) console.warn("[server] ⚠ pasta dist/ não existe. Corre 'npm run build' primeiro.");
server.listen(PORT, () => console.log(`AIearnings a correr em http://localhost:${PORT}`));
