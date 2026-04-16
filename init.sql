CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  location_id TEXT NOT NULL,
  reg_nr TEXT NOT NULL,
  customer_name TEXT,
  phone TEXT,
  service TEXT,
  price INTEGER DEFAULT 0,
  booking_date DATE NOT NULL,
  booking_time TEXT,
  status TEXT DEFAULT 'bokad',
  arrived_at TEXT,
  completed_at TEXT,
  notes TEXT,
  unbooked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS anpr_events (
  id SERIAL PRIMARY KEY,
  location_id TEXT,
  reg_nr TEXT NOT NULL,
  direction TEXT,
  confidence REAL,
  camera_id TEXT,
  matched_booking_id INTEGER,
  event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Curated marts + BI metadata
CREATE SCHEMA IF NOT EXISTS bi;

CREATE OR REPLACE VIEW bi.mart_bookings AS
SELECT
  b.id,
  b.location_id,
  l.name AS location_name,
  l.city AS location_city,
  b.reg_nr,
  b.service,
  b.price,
  b.booking_date,
  b.booking_time,
  b.status,
  b.unbooked,
  b.created_at
FROM bookings b
LEFT JOIN locations l ON l.id = b.location_id;

CREATE OR REPLACE VIEW bi.mart_anpr_events AS
SELECT
  e.id,
  e.location_id,
  l.name AS location_name,
  l.city AS location_city,
  e.reg_nr,
  e.direction,
  e.confidence,
  e.camera_id,
  e.matched_booking_id,
  e.event_time,
  (e.matched_booking_id IS NOT NULL) AS is_matched
FROM anpr_events e
LEFT JOIN locations l ON l.id = e.location_id;

CREATE OR REPLACE VIEW bi.mart_daily_location_kpis AS
SELECT
  b.location_id,
  b.location_name,
  b.location_city,
  b.booking_date,
  COUNT(*) AS bookings_total,
  COUNT(*) FILTER (WHERE b.status = 'inkort') AS checkins_total,
  COUNT(*) FILTER (WHERE b.status = 'klar') AS completed_total,
  COUNT(*) FILTER (WHERE b.unbooked = TRUE) AS unbooked_total,
  COALESCE(SUM(b.price), 0) AS revenue_total
FROM bi.mart_bookings b
GROUP BY b.location_id, b.location_name, b.location_city, b.booking_date;

CREATE OR REPLACE VIEW bi.mart_anpr_match_rate_daily AS
SELECT
  DATE(event_time) AS event_date,
  location_id,
  COUNT(*) AS events_total,
  COUNT(*) FILTER (WHERE matched_booking_id IS NOT NULL) AS matched_total,
  ROUND(
    COUNT(*) FILTER (WHERE matched_booking_id IS NOT NULL)::NUMERIC
    / NULLIF(COUNT(*), 0),
    4
  ) AS match_rate
FROM anpr_events
GROUP BY DATE(event_time), location_id;

CREATE OR REPLACE VIEW bi.data_map_inventory AS
WITH row_stats AS (
  SELECT 'locations'::TEXT AS entity, COUNT(*)::BIGINT AS row_count, MAX(created_at) AS latest_ts FROM locations
  UNION ALL
  SELECT 'bookings', COUNT(*)::BIGINT, MAX(created_at) FROM bookings
  UNION ALL
  SELECT 'anpr_events', COUNT(*)::BIGINT, MAX(event_time) FROM anpr_events
),
freshness AS (
  SELECT
    entity,
    row_count,
    latest_ts,
    EXTRACT(EPOCH FROM (NOW() - latest_ts)) / 3600.0 AS hours_since_latest
  FROM row_stats
),
anomaly AS (
  SELECT
    COALESCE(AVG(match_rate), 1.0) AS avg_match_rate_7d
  FROM bi.mart_anpr_match_rate_daily
  WHERE event_date >= CURRENT_DATE - INTERVAL '7 day'
)
SELECT
  f.entity,
  CASE f.entity
    WHEN 'locations' THEN 'Dimension: workshop locations'
    WHEN 'bookings' THEN 'Fact: customer bookings'
    WHEN 'anpr_events' THEN 'Fact: plate detections'
  END AS entity_description,
  CASE f.entity
    WHEN 'bookings' THEN 'bookings.location_id -> locations.id'
    WHEN 'anpr_events' THEN 'anpr_events.location_id -> locations.id; anpr_events.matched_booking_id -> bookings.id'
    ELSE 'primary entity'
  END AS key_relationships,
  f.row_count,
  f.latest_ts,
  ROUND(f.hours_since_latest::NUMERIC, 2) AS hours_since_latest,
  CASE
    WHEN f.hours_since_latest > 24 THEN 'stale_data'
    WHEN f.entity = 'anpr_events' AND (SELECT avg_match_rate_7d FROM anomaly) < 0.70 THEN 'low_match_rate'
    WHEN f.row_count = 0 THEN 'empty_table'
    ELSE 'ok'
  END AS anomaly_flag
FROM freshness f;

CREATE OR REPLACE VIEW bi.v_ops_team_metrics AS
SELECT
  booking_date,
  location_id,
  location_name,
  bookings_total,
  checkins_total,
  completed_total,
  unbooked_total,
  revenue_total
FROM bi.mart_daily_location_kpis;

CREATE OR REPLACE VIEW bi.v_finance_team_metrics AS
SELECT
  booking_date,
  location_id,
  location_name,
  bookings_total,
  completed_total,
  revenue_total,
  ROUND(revenue_total::NUMERIC / NULLIF(bookings_total, 0), 2) AS avg_revenue_per_booking
FROM bi.mart_daily_location_kpis;

CREATE OR REPLACE VIEW bi.v_support_team_metrics AS
SELECT
  m.event_date,
  m.location_id,
  m.events_total,
  m.matched_total,
  m.match_rate,
  CASE WHEN m.match_rate < 0.70 THEN TRUE ELSE FALSE END AS needs_investigation
FROM bi.mart_anpr_match_rate_daily m;

CREATE TABLE IF NOT EXISTS bi.metrics_dictionary (
  metric_name TEXT PRIMARY KEY,
  definition TEXT NOT NULL,
  formula_sql TEXT NOT NULL,
  owner_team TEXT NOT NULL,
  source_view TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bi.metrics_dictionary (metric_name, definition, formula_sql, owner_team, source_view)
VALUES
  (
    'bookings_total',
    'Total number of bookings created for a location on a given booking date.',
    'COUNT(*) grouped by location_id and booking_date from bi.mart_bookings',
    'Operations',
    'bi.mart_daily_location_kpis'
  ),
  (
    'completed_total',
    'Bookings with status klar (completed work).',
    'COUNT(*) FILTER (WHERE status = ''klar'') from bi.mart_bookings',
    'Operations',
    'bi.mart_daily_location_kpis'
  ),
  (
    'revenue_total',
    'Total booked revenue for the date and location.',
    'SUM(price) from bi.mart_bookings',
    'Finance',
    'bi.mart_daily_location_kpis'
  ),
  (
    'match_rate',
    'Share of ANPR events that can be mapped to a booking.',
    'COUNT(matched_booking_id IS NOT NULL) / COUNT(*) from anpr_events by date and location',
    'Support',
    'bi.mart_anpr_match_rate_daily'
  )
ON CONFLICT (metric_name) DO UPDATE
SET
  definition = EXCLUDED.definition,
  formula_sql = EXCLUDED.formula_sql,
  owner_team = EXCLUDED.owner_team,
  source_view = EXCLUDED.source_view,
  updated_at = CURRENT_TIMESTAMP;
