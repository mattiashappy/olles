# olles

## Köra appen lokalt

1. Sätt `DATABASE_URL` till din Postgres-instans (ex. via `.env` + export).
2. Installera beroenden och starta:

```bash
npm install
npm run dev
```

Öppna sedan `http://localhost:3000`.

## Databas

Appen använder Postgres via `pg`.

- Databasanslutning läses från `DATABASE_URL`.
- Vid start körs `init.sql` för att skapa tabeller vid behov.
- Monitoring-tabeller för connector-runs, dead-letter, data quality, SLA-alerts och lineage skapas automatiskt.

## Monitoring & datakvalitet

Nya API-endpoints under `/api/monitoring`:

- `GET /api/monitoring/connectors` – senaste sync, row delta och error-rate per connector.
- `GET /api/monitoring/runs` – senaste körningar inklusive retries/fel.
- `GET /api/monitoring/dead-letter` – poster som hamnat i dead-letter.
- `POST /api/monitoring/dead-letter/:id/retry` – försök reprocessa dead-letter-post.
- `POST /api/monitoring/data-quality/run` – kör null-spike, duplicate-key och referential-integrity checks.
- `GET /api/monitoring/data-quality/latest` – senaste check-resultat.
- `POST /api/monitoring/sla/evaluate` – utvärdera SLA-brott (inga lyckade syncar inom N timmar).
- `GET /api/monitoring/alerts` – senaste alert-events.

## Deploy till Heroku

```bash
heroku addons:create heroku-postgresql:essential-standard
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_PRODUCTION=false

git push heroku main
```

Heroku sätter `DATABASE_URL` automatiskt när Postgres add-on är aktiverad.
