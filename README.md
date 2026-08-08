# AIearnings

Site de análise/educação sobre apresentação de resultados (earnings) de ações — agenda semanal, posições, histórico e newsletter, com painel de administração.

> ⚠️ **Conteúdo informativo/educacional e de opinião. Não é aconselhamento financeiro.** Parte das análises é assistida por IA. Investir tem risco de perda total.

---

## O que tem

**Site público** (`/`):
- **Método** — a estratégia de gestão de capital (com avisos de risco).
- **Previsões desta semana** — próximos 4 dias, só ações EUA (dados reais Yahoo).
- **Posições** — posições abertas com contador de dias "à espera de recuperar".
- **Histórico das posições anteriores** — últimos 3 dias (posições fechadas + upload).
- **Newsletter** — subscrição por email (com consentimento).
- **Galeria**, **Blog**, **Premium** (placeholder), **páginas legais**.

**Admin** (`/#admin`, protegido por password):
- **Curadoria** — escolher ações a mostrar + recomendação (COMPRAR / VENDER / MANTER / AGUARDAR / NÃO / NEUTRO) + nota.
- **Posições** — adicionar/fechar posições (fechar → vai para o histórico).
- **Renda** — depósitos/retiradas (evolução do capital).
- **Trades** — track record.
- **Histórico (upload)** — carregar imagem/PDF → extração por IA → confirmar → publicar.
- **Painel de análise** — a ferramenta EarningsEdge completa.

---

## Correr localmente

```bash
npm install
npm run dev
```
Abre `http://localhost:5199`. Admin em `http://localhost:5199/#admin`.

Password de dev: **`admin`** (define `ADMIN_PASSWORD` para mudar).

---

## Build + produção

```bash
npm run build     # gera dist/
npm start         # node server.mjs (serve dist/ + API)
```
Servidor de produção: `server.mjs` (porta `PORT`, por omissão 8080).

### Variáveis de ambiente
| Variável | Obrigatória | Para quê |
|---|---|---|
| `ADMIN_PASSWORD` | **sim** (produção) | password do admin. Sem ela usa `admin` (dev). |
| `DATA_DIR` | recomendada | pasta dos dados (disco persistente). Ex. `/data`. |
| `ANTHROPIC_API_KEY` | não | extração por IA no upload (senão, preenche à mão). |
| `PORT` | não | porta do servidor. |

---

## Deploy

### 1. Push para o GitHub
```bash
git remote add origin https://github.com/O-TEU-USER/aiearnings.git
git branch -M main
git push -u origin main
```

### 2. Alojar no Render (recomendado)
1. [render.com](https://render.com) → **New → Blueprint** → liga o repositório (o `render.yaml` configura o serviço + disco).
2. Define as variáveis no painel: **`ADMIN_PASSWORD`** (forte) e `ANTHROPIC_API_KEY` (opcional).
3. Deploy → URL público.

### Alternativa: Docker (Railway / Fly / VPS)
```bash
docker build -t aiearnings .
docker run -p 8080:8080 -e ADMIN_PASSWORD='...' -v aiearnings-data:/data aiearnings
```

---

## Dados (persistência)
Ficheiros JSON em `DATA_DIR` (por omissão `./data`), fora do repo:
`picks.json` · `positions.json` · `ledger.json` · `emails.json` · `history.json` · `trades.json`.

Em produção, monta um **disco persistente** nessa pasta — senão os dados repõem a cada deploy.

---

## Antes de ir público (checklist)
- [ ] Definir `ADMIN_PASSWORD` forte.
- [ ] Disco persistente (`DATA_DIR=/data`).
- [ ] Preencher `INFO` em `src/Legal.jsx` (nome, NIF, email, morada) e **rever com advogado**.
- [ ] Abrir atividade nas Finanças antes de cobrar.
- [ ] **Não cobrar** recomendações personalizadas sem enquadramento legal (CMVM).

---

## Estrutura
```
server.mjs        # servidor de produção (build + API)
apiHandler.mjs    # API (partilhada dev/prod)
store.mjs         # persistência em ficheiro + auth
yahooReal.mjs     # dados reais Yahoo + extração IA
vite.config.js    # dev (usa apiHandler)
EarningsEdge.jsx  # ferramenta de análise (no admin)
src/              # TraderSite, Admin, Legal, main, picks, shared, trades
```

*Não é aconselhamento financeiro. Sem garantias. Faz a tua própria análise.*
