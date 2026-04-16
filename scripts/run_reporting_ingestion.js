const fs = require('fs');
const path = require('path');
const { query } = require('../db');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'analytics', 'sql', '001_reporting_schema.sql'), 'utf8');

async function run() {
  await query('BEGIN');
  try {
    await query(schemaSql);

    await query(`
      INSERT INTO raw.crm_locations (source_pk, name, city, source_created_at)
      SELECT l.id, l.name, l.city, l.created_at
      FROM locations l
      ON CONFLICT (source_pk) DO UPDATE SET
        name = EXCLUDED.name,
        city = EXCLUDED.city,
        source_created_at = EXCLUDED.source_created_at,
        ingested_at = CURRENT_TIMESTAMP
    `);

    await query(`
      INSERT INTO raw.crm_bookings (
        source_pk, location_id, reg_nr, customer_name, phone, service, price,
        booking_date, booking_time, status, arrived_at, completed_at, notes,
        unbooked, source_created_at
      )
      SELECT
        b.id, b.location_id, b.reg_nr, b.customer_name, b.phone, b.service,
        b.price, b.booking_date, b.booking_time, b.status, b.arrived_at,
        b.completed_at, b.notes, b.unbooked, b.created_at
      FROM bookings b
      ON CONFLICT (source_pk) DO UPDATE SET
        location_id = EXCLUDED.location_id,
        reg_nr = EXCLUDED.reg_nr,
        customer_name = EXCLUDED.customer_name,
        phone = EXCLUDED.phone,
        service = EXCLUDED.service,
        price = EXCLUDED.price,
        booking_date = EXCLUDED.booking_date,
        booking_time = EXCLUDED.booking_time,
        status = EXCLUDED.status,
        arrived_at = EXCLUDED.arrived_at,
        completed_at = EXCLUDED.completed_at,
        notes = EXCLUDED.notes,
        unbooked = EXCLUDED.unbooked,
        source_created_at = EXCLUDED.source_created_at,
        ingested_at = CURRENT_TIMESTAMP
    `);

    await query(`
      INSERT INTO raw.anpr_events (
        source_pk, location_id, reg_nr, direction, confidence,
        camera_id, matched_booking_id, event_time
      )
      SELECT
        a.id, a.location_id, a.reg_nr, a.direction, a.confidence,
        a.camera_id, a.matched_booking_id, a.event_time
      FROM anpr_events a
      ON CONFLICT (source_pk) DO UPDATE SET
        location_id = EXCLUDED.location_id,
        reg_nr = EXCLUDED.reg_nr,
        direction = EXCLUDED.direction,
        confidence = EXCLUDED.confidence,
        camera_id = EXCLUDED.camera_id,
        matched_booking_id = EXCLUDED.matched_booking_id,
        event_time = EXCLUDED.event_time,
        ingested_at = CURRENT_TIMESTAMP
    `);

    await query(`
      INSERT INTO raw.fortnox_exports (
        source_pk, booking_id, location_id, export_date,
        exported_at, price, service, reg_nr
      )
      SELECT
        f.id, f.booking_id, f.location_id, f.export_date,
        f.exported_at, f.price, f.service, f.reg_nr
      FROM fortnox_exports f
      ON CONFLICT (source_pk) DO UPDATE SET
        booking_id = EXCLUDED.booking_id,
        location_id = EXCLUDED.location_id,
        export_date = EXCLUDED.export_date,
        exported_at = EXCLUDED.exported_at,
        price = EXCLUDED.price,
        service = EXCLUDED.service,
        reg_nr = EXCLUDED.reg_nr,
        ingested_at = CURRENT_TIMESTAMP
    `);

    await query('COMMIT');
    console.log('Reporting ingestion finished successfully.');
  } catch (error) {
    await query('ROLLBACK');
    console.error('Reporting ingestion failed:', error);
    process.exitCode = 1;
  }
}

run();
