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

## Deploy till Heroku

```bash
heroku addons:create heroku-postgresql:essential-standard
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_PRODUCTION=false

git push heroku main
```

Heroku sätter `DATABASE_URL` automatiskt när Postgres add-on är aktiverad.
