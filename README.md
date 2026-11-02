# Lexicis – E-Court Case Tracker

Full-stack legal case tracker: an Express API with a React (Vite + Tailwind) front-end, served from one process.

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your keys (see [Configuration](#configuration))
3. Development (hot reload): `npm run dev` → http://localhost:3000
4. Production build: `npm run build`, then `npm start` → http://localhost:3000

Type check: `npm run lint`. Stop the server with Ctrl+C (it shuts down gracefully and flushes pending database syncs).

## Deploying

- Set `SESSION_SECRET` (the server refuses to start in production without it) and the API keys in the host's environment.
- Behind nginx or a load balancer, set `TRUST_PROXY=1` so rate limiting sees real client IPs, and terminate HTTPS at the proxy.
- `data/db.json` is the local state file; mount it on persistent storage or configure `MONGODB_URL`.
- Rate limiting and sessions are in-memory: run a single instance.
- PDF downloads need a Chromium browser. Puppeteer downloads one on install; set `PDF_BROWSER_PATH` to use an installed Chrome/Edge instead.

## Security

- Every `/api` route except `/api/health` and `/api/auth/login` requires a signed session token (12 hours by default).
- Passwords are stored as scrypt hashes; plaintext passwords from older databases are migrated on startup. Changing the password signs out all other sessions.
- Sign-in is limited to 10 attempts per 15 minutes per IP; the API overall to 600 requests per minute per IP.
- User-entered text is HTML-escaped in notification emails, which the Outbox renders.

## Build tool versions

`package.json` pins Tailwind 4.1.14, tsx 4.21.0 (esbuild 0.27.0) and, via `overrides`, Rollup 4.40.0. Windows Smart App Control blocks the native binaries of newer releases until they build up reputation, which breaks `npm run dev`/`npm run build` on machines with it enabled. Raise these pins once the newer binaries load.

## Project structure

```
server.ts                  Entry point: builds the app, serves the front-end, starts the scheduler
server/
  config.ts                Loads .env and exposes every setting (imported first)
  app.ts                   Express app with all /api routers mounted
  scheduler.ts             Background hearing-reminder scan (every 60s)
  routes/                  HTTP layer, one router per area
    authRoutes.ts            /api/auth/*, /api/user/*
    caseRoutes.ts            /api/cases/*
    kanoonRoutes.ts          /api/indiankanoon/*
    legalRoutes.ts           /api/legal/*, /api/translate/*
    systemRoutes.ts          health, Supabase status, hearings, email log, scheduler
  services/
    ecourtService.ts         eCourts partner API client
    indianKanoonService.ts   Indian Kanoon API client
    caseEnrichment.ts        Fetch / enrich registry cases on demand
    caseUpdateService.ts     Hearing reminders and simulated registry updates
    notificationService.ts   Who gets case emails, plus the email detail templates
    emailService.ts          Email delivery (SMTP) and outbox logging
    pdfService.ts            Court-order PDF rendering (Puppeteer)
    ai/                      Gemini client, case insights, coach chat, precedents,
                             strategy predictor, notice translation
  db/
    database.ts              In-memory state, persisted to data/db.json, MongoDB and Supabase
    remoteStores.ts          MongoDB / Postgres / Supabase connections
    seedData.ts, realCasesData.ts
src/
  App.tsx                  Wires hooks to views
  api/client.ts            Typed wrappers for every API call
  hooks/                   useSession, usePortfolio, useSupabaseStatus
  lib/storage.ts           localStorage / sessionStorage access
  components/
    auth/ layout/ workspace/ search/ case-detail/ strategy/ outbox/ common/
  types.ts, constants/, assets/
```

## Configuration

All settings are read in `server/config.ts`:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | AI insights, coach, predictor, translation (falls back to built-in responses when unset) |
| `ECOURT_API_KEY`, `ECOURT_API_BASE_URL` | eCourts partner API |
| `INDIAN_KANOON_API_TOKEN`, `INDIAN_KANOON_BASE_URL` | Indian Kanoon API |
| `MONGODB_URL` | MongoDB Atlas state mirror |
| `DATABASE_URL` / `SUPABASE_URL` + `SUPABASE_KEY` | Optional Supabase state mirror |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Real email delivery (otherwise emails are only logged to the outbox) |
| `ALERT_EMAIL_RECIPIENT` | Recipient for notices on cases nobody tracks |
| `PORT` (or `--port`, `--host`) | Server address |

Also: `SESSION_SECRET`, `SESSION_TTL_HOURS`, `TRUST_PROXY`, `HOST`, `MONGODB_DB_NAME`, `ADMIN_INITIAL_PASSWORD` (only used for a brand-new database) and `PDF_BROWSER_PATH`. Secrets are read only from the environment; none are in the source code.
