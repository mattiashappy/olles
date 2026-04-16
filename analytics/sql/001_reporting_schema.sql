CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS clean;
CREATE SCHEMA IF NOT EXISTS mart;
CREATE SCHEMA IF NOT EXISTS metadata;

CREATE TABLE IF NOT EXISTS raw.crm_locations (
  source_pk TEXT PRIMARY KEY,
  name TEXT,
  city TEXT,
  source_created_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw.crm_bookings (
  source_pk BIGINT PRIMARY KEY,
  location_id TEXT,
  reg_nr TEXT,
  customer_name TEXT,
  phone TEXT,
  service TEXT,
  price INTEGER,
  booking_date DATE,
  booking_time TEXT,
  status TEXT,
  arrived_at TEXT,
  completed_at TEXT,
  notes TEXT,
  unbooked BOOLEAN,
  source_created_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw.anpr_events (
  source_pk BIGINT PRIMARY KEY,
  location_id TEXT,
  reg_nr TEXT,
  direction TEXT,
  confidence REAL,
  camera_id TEXT,
  matched_booking_id BIGINT,
  event_time TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw.fortnox_exports (
  source_pk BIGINT PRIMARY KEY,
  booking_id BIGINT,
  location_id TEXT,
  export_date DATE,
  exported_at TIMESTAMP,
  price INTEGER,
  service TEXT,
  reg_nr TEXT,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clean.dim_location (
  location_key TEXT PRIMARY KEY,
  location_name TEXT,
  city TEXT,
  source_created_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clean.dim_vehicle (
  vehicle_key TEXT PRIMARY KEY,
  reg_nr TEXT UNIQUE,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clean.fct_booking (
  booking_key BIGINT PRIMARY KEY,
  location_key TEXT,
  vehicle_key TEXT,
  booking_date DATE,
  booking_time TEXT,
  status TEXT,
  service TEXT,
  price INTEGER,
  unbooked BOOLEAN,
  arrived_at TEXT,
  completed_at TEXT,
  source_created_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clean.fct_anpr_event (
  anpr_event_key BIGINT PRIMARY KEY,
  location_key TEXT,
  vehicle_key TEXT,
  direction TEXT,
  confidence REAL,
  camera_id TEXT,
  matched_booking_key BIGINT,
  event_time TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mart.daily_location_performance (
  metric_date DATE,
  location_key TEXT,
  total_bookings INTEGER,
  completed_bookings INTEGER,
  unbooked_visits INTEGER,
  anpr_entries INTEGER,
  anpr_exits INTEGER,
  gross_revenue INTEGER,
  refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (metric_date, location_key)
);

CREATE TABLE IF NOT EXISTS metadata.table_sla (
  table_name TEXT PRIMARY KEY,
  owner_team TEXT NOT NULL,
  owner_slack TEXT NOT NULL,
  freshness_sla TEXT NOT NULL,
  notes TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
