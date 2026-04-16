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

CREATE TABLE IF NOT EXISTS connector_metrics (
  connector_name TEXT PRIMARY KEY,
  last_successful_sync TIMESTAMP,
  last_row_delta INTEGER DEFAULT 0,
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  error_rate REAL DEFAULT 0,
  last_run_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS connector_runs (
  id SERIAL PRIMARY KEY,
  connector_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  row_delta INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dead_letter_loads (
  id SERIAL PRIMARY KEY,
  connector_name TEXT NOT NULL,
  run_id INTEGER REFERENCES connector_runs(id),
  payload JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dq_check_results (
  id SERIAL PRIMARY KEY,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sla_policies (
  connector_name TEXT PRIMARY KEY,
  max_delay_hours INTEGER NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_events (
  id SERIAL PRIMARY KEY,
  connector_name TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lineage_events (
  id SERIAL PRIMARY KEY,
  connector_name TEXT NOT NULL,
  entity_key TEXT,
  source_stage TEXT NOT NULL,
  source_identifier TEXT,
  target_stage TEXT NOT NULL,
  target_identifier TEXT,
  status TEXT DEFAULT 'processed',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sla_policies (connector_name, max_delay_hours)
VALUES
  ('anpr', 2),
  ('anpr_simulation', 24),
  ('fortnox_export', 24),
  ('fortnox_preview', 24)
ON CONFLICT (connector_name) DO NOTHING;
