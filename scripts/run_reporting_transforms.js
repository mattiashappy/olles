const { query } = require('../db');

async function run() {
  await query('BEGIN');
  try {
    await query('TRUNCATE clean.dim_location');
    await query(`
      INSERT INTO clean.dim_location (location_key, location_name, city, source_created_at, updated_at)
      SELECT source_pk, name, city, source_created_at, CURRENT_TIMESTAMP
      FROM raw.crm_locations
    `);

    await query('TRUNCATE clean.dim_vehicle');
    await query(`
      INSERT INTO clean.dim_vehicle (vehicle_key, reg_nr, first_seen_at, last_seen_at, updated_at)
      SELECT
        md5(reg_nr) AS vehicle_key,
        reg_nr,
        MIN(event_time) AS first_seen_at,
        MAX(event_time) AS last_seen_at,
        CURRENT_TIMESTAMP
      FROM raw.anpr_events
      GROUP BY reg_nr
    `);

    await query('TRUNCATE clean.fct_booking');
    await query(`
      INSERT INTO clean.fct_booking (
        booking_key, location_key, vehicle_key, booking_date, booking_time,
        status, service, price, unbooked, arrived_at, completed_at,
        source_created_at, updated_at
      )
      SELECT
        b.source_pk,
        b.location_id,
        md5(b.reg_nr),
        b.booking_date,
        b.booking_time,
        b.status,
        b.service,
        b.price,
        b.unbooked,
        b.arrived_at,
        b.completed_at,
        b.source_created_at,
        CURRENT_TIMESTAMP
      FROM raw.crm_bookings b
    `);

    await query('TRUNCATE clean.fct_anpr_event');
    await query(`
      INSERT INTO clean.fct_anpr_event (
        anpr_event_key, location_key, vehicle_key, direction, confidence,
        camera_id, matched_booking_key, event_time, updated_at
      )
      SELECT
        source_pk,
        location_id,
        md5(reg_nr),
        direction,
        confidence,
        camera_id,
        matched_booking_id,
        event_time,
        CURRENT_TIMESTAMP
      FROM raw.anpr_events
    `);

    await query('TRUNCATE mart.daily_location_performance');
    await query(`
      INSERT INTO mart.daily_location_performance (
        metric_date, location_key, total_bookings, completed_bookings,
        unbooked_visits, anpr_entries, anpr_exits, gross_revenue, refreshed_at
      )
      SELECT
        b.booking_date AS metric_date,
        b.location_key,
        COUNT(*) AS total_bookings,
        COUNT(*) FILTER (WHERE b.status = 'klar') AS completed_bookings,
        COUNT(*) FILTER (WHERE b.unbooked = TRUE) AS unbooked_visits,
        COUNT(a.*) FILTER (WHERE a.direction = 'in') AS anpr_entries,
        COUNT(a.*) FILTER (WHERE a.direction = 'out') AS anpr_exits,
        COALESCE(SUM(b.price), 0)::INTEGER AS gross_revenue,
        CURRENT_TIMESTAMP
      FROM clean.fct_booking b
      LEFT JOIN clean.fct_anpr_event a
        ON a.location_key = b.location_key
       AND DATE(a.event_time) = b.booking_date
      GROUP BY b.booking_date, b.location_key
    `);

    await query(`
      INSERT INTO metadata.table_sla (table_name, owner_team, owner_slack, freshness_sla, notes, updated_at)
      VALUES
        ('raw.crm_bookings', 'Data Platform', '#data-platform', 'Updated hourly', 'Primary raw booking feed from operational CRM.', CURRENT_TIMESTAMP),
        ('raw.anpr_events', 'Data Platform', '#data-platform', 'Updated every 15 minutes', 'Raw ANPR webhook event capture.', CURRENT_TIMESTAMP),
        ('raw.fortnox_exports', 'Finance Ops', '#finance-ops', 'Updated daily by 07:00 UTC', 'Finance export records used for invoice reconciliation.', CURRENT_TIMESTAMP),
        ('clean.fct_booking', 'Analytics Engineering', '#analytics-eng', 'Updated hourly', 'Canonical cleaned booking fact table.', CURRENT_TIMESTAMP),
        ('mart.daily_location_performance', 'BI', '#bi-team', 'Updated daily by 08:00 UTC', 'Executive KPI mart used in dashboards.', CURRENT_TIMESTAMP)
      ON CONFLICT (table_name) DO UPDATE SET
        owner_team = EXCLUDED.owner_team,
        owner_slack = EXCLUDED.owner_slack,
        freshness_sla = EXCLUDED.freshness_sla,
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
    `);

    await query('COMMIT');
    console.log('Reporting transforms finished successfully.');
  } catch (error) {
    await query('ROLLBACK');
    console.error('Reporting transforms failed:', error);
    process.exitCode = 1;
  }
}

run();
