# Reporting Layer Blueprint

This folder defines a first production-ready reporting layer in PostgreSQL.

## 1) Canonical database

**Canonical reporting layer: PostgreSQL** (same managed Postgres runtime as the app, isolated by schemas `raw`, `clean`, `mart`, `metadata`).

## 2) Initial source scope (highest-value first)

1. `bookings` (core revenue + operational pipeline)
2. `anpr_events` (arrival/departure and throughput)
3. `fortnox_exports` (finance hand-off and reconciliation)
4. `locations` (location dimension)

## 3) Ingestion jobs

Run in order:

```bash
npm run reporting:ingest
npm run reporting:transform
```

- `reporting:ingest` upserts source tables into `raw.*` staging tables.
- `reporting:transform` rebuilds `clean.*` and `mart.*` models.

## 4) Standardized transform models

- `clean.dim_location`
- `clean.dim_vehicle`
- `clean.fct_booking`
- `clean.fct_anpr_event`
- `mart.daily_location_performance`

Conventions:

- Surrogate keys: `vehicle_key = md5(reg_nr)`.
- Foreign keys: `location_key`, `vehicle_key`, `matched_booking_key`.
- Time fields: source timestamps preserved (`event_time`, `source_created_at`) and model refresh timestamps (`updated_at`, `refreshed_at`).

## 5) Ownership + freshness SLA

`metadata.table_sla` is the source of truth for production readiness.

Use this check query:

```sql
SELECT table_name, owner_team, owner_slack, freshness_sla, updated_at
FROM metadata.table_sla
ORDER BY table_name;
```
