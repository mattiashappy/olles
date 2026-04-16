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

## BI-upplägg (rekommenderat arbetssätt)

Det här repot innehåller nu ett tydligt BI-lager i `bi`-schemat för att stödja uppföljning utan att ge BI-verktyget direktåtkomst till råa tabeller.

### 1) Välj BI-verktyg utifrån budget och teamets kompetens

**Rekommendation för detta projekt: Metabase**

- Låg kostnad att starta med (snabb time-to-value).
- Lätt för både teknik- och verksamhetsteam att bygga dashboards.
- Fungerar bra med Postgres och SQL-vyerna i `bi`-schemat.
- Kan senare bytas/kompletteras med Looker/Power BI/Tableau om governance-behov ökar.

### 2) Anslut BI-verktyget endast till kuraterade mart-vyer

Ge BI-verktyget läsbehörighet till följande vyer i stället för råa tabeller:

- `bi.mart_bookings`
- `bi.mart_anpr_events`
- `bi.mart_daily_location_kpis`
- `bi.mart_anpr_match_rate_daily`
- `bi.data_map_inventory`
- `bi.v_ops_team_metrics`
- `bi.v_finance_team_metrics`
- `bi.v_support_team_metrics`
- `bi.metrics_dictionary`

### 3) Bygg en data map-dashboard

Använd `bi.data_map_inventory` som källa för en dashboard med:

- Entities (tabeller/fakta/dimensioner)
- Nyckelrelationer
- Row counts
- Freshness (`latest_ts`, `hours_since_latest`)
- Anomaly flags (`ok`, `stale_data`, `low_match_rate`, `empty_table`)

### 4) Skapa rollbaserade vyer

Färdiga vyer finns för team med olika fokus:

- **Operations:** `bi.v_ops_team_metrics`
- **Finance:** `bi.v_finance_team_metrics`
- **Support:** `bi.v_support_team_metrics`

Detta ger konsekventa definitioner över team och minskar risk för olika KPI-logik i olika dashboards.

### 5) Publicera metrics dictionary i BI-verktyget

`bi.metrics_dictionary` innehåller KPI-definitioner, SQL-formler, ägarteam och källvy.

Publicera tabellen i BI-verktyget som en egen sida/dashboard så att användare kan slå upp:

- KPI-namn
- Definition
- Formel
- Ägarteam
- Datakälla

## Deploy till Heroku

```bash
heroku addons:create heroku-postgresql:essential-standard
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_PRODUCTION=false

git push heroku main
```

Heroku sätter `DATABASE_URL` automatiskt när Postgres add-on är aktiverad.
