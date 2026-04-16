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
