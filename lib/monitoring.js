const { query } = require('../db');

async function startConnectorRun(connectorName) {
  const { rows } = await query(
    `INSERT INTO connector_runs (connector_name, status, started_at)
     VALUES ($1, 'running', NOW())
     RETURNING id`,
    [connectorName]
  );

  await query(
    `INSERT INTO connector_metrics (connector_name, last_run_at, total_runs)
     VALUES ($1, NOW(), 1)
     ON CONFLICT (connector_name) DO UPDATE
     SET last_run_at = NOW(),
         total_runs = connector_metrics.total_runs + 1`,
    [connectorName]
  );

  return rows[0].id;
}

async function markConnectorSuccess(runId, connectorName, rowDelta) {
  await query(
    `UPDATE connector_runs
     SET status='success', row_delta=$1, finished_at=NOW()
     WHERE id=$2`,
    [rowDelta ?? 0, runId]
  );

  await query(
    `INSERT INTO connector_metrics
      (connector_name, last_run_at, last_successful_sync, last_row_delta, total_runs, successful_runs, failed_runs, error_rate)
     VALUES ($1, NOW(), NOW(), $2, 1, 1, 0, 0)
     ON CONFLICT (connector_name) DO UPDATE
     SET last_run_at = NOW(),
         last_successful_sync = NOW(),
         last_row_delta = EXCLUDED.last_row_delta,
         successful_runs = connector_metrics.successful_runs + 1,
         error_rate = CASE
           WHEN (connector_metrics.successful_runs + connector_metrics.failed_runs + 1) = 0 THEN 0
           ELSE connector_metrics.failed_runs::float / (connector_metrics.successful_runs + connector_metrics.failed_runs + 1)
         END`,
    [connectorName, rowDelta ?? 0]
  );
}

async function markConnectorFailure(runId, connectorName, error, retryCount, payload) {
  await query(
    `UPDATE connector_runs
     SET status='failed', error_message=$1, retry_count=$2, finished_at=NOW()
     WHERE id=$3`,
    [error.message, retryCount ?? 0, runId]
  );

  await query(
    `INSERT INTO connector_metrics
      (connector_name, last_run_at, total_runs, successful_runs, failed_runs, error_rate)
     VALUES ($1, NOW(), 1, 0, 1, 1)
     ON CONFLICT (connector_name) DO UPDATE
     SET last_run_at = NOW(),
         failed_runs = connector_metrics.failed_runs + 1,
         error_rate = (connector_metrics.failed_runs + 1)::float /
           NULLIF(connector_metrics.successful_runs + connector_metrics.failed_runs + 1, 0)`,
    [connectorName]
  );

  if (payload) {
    await query(
      `INSERT INTO dead_letter_loads (connector_name, run_id, payload, error_message)
       VALUES ($1, $2, $3, $4)`,
      [connectorName, runId, payload, error.message]
    );
  }
}

async function runDataQualityChecks() {
  const checks = [];

  const nullSpikeSql = `
    WITH current_period AS (
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE reg_nr IS NULL OR reg_nr = '' OR location_id IS NULL) AS nullish
      FROM bookings
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    ),
    previous_period AS (
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE reg_nr IS NULL OR reg_nr = '' OR location_id IS NULL) AS nullish
      FROM bookings
      WHERE created_at >= NOW() - INTERVAL '48 hours'
        AND created_at < NOW() - INTERVAL '24 hours'
    )
    SELECT
      CASE WHEN c.total = 0 THEN 0 ELSE c.nullish::float / c.total END AS current_ratio,
      CASE WHEN p.total = 0 THEN 0 ELSE p.nullish::float / p.total END AS previous_ratio,
      c.total,
      c.nullish
    FROM current_period c, previous_period p;
  `;
  const nullSpike = (await query(nullSpikeSql)).rows[0];
  const spike = Number(nullSpike.current_ratio) - Number(nullSpike.previous_ratio);
  checks.push({
    check_type: 'null_spike',
    status: spike > 0.2 ? 'failed' : 'passed',
    details: {
      current_ratio: Number(nullSpike.current_ratio),
      previous_ratio: Number(nullSpike.previous_ratio),
      delta: spike,
      rows_evaluated: Number(nullSpike.total),
      null_rows: Number(nullSpike.nullish),
    },
  });

  const duplicateRows = await query(
    `SELECT location_id, reg_nr, booking_date, booking_time, COUNT(*) AS duplicate_count
     FROM bookings
     GROUP BY location_id, reg_nr, booking_date, booking_time
     HAVING COUNT(*) > 1
     ORDER BY duplicate_count DESC
     LIMIT 20`
  );

  checks.push({
    check_type: 'duplicate_keys',
    status: duplicateRows.rows.length ? 'failed' : 'passed',
    details: {
      duplicate_groups: duplicateRows.rows.length,
      samples: duplicateRows.rows,
    },
  });

  const riRows = await query(
    `SELECT ae.id, ae.matched_booking_id
     FROM anpr_events ae
     LEFT JOIN bookings b ON b.id = ae.matched_booking_id
     WHERE ae.matched_booking_id IS NOT NULL AND b.id IS NULL
     ORDER BY ae.event_time DESC
     LIMIT 50`
  );

  checks.push({
    check_type: 'referential_integrity',
    status: riRows.rows.length ? 'failed' : 'passed',
    details: {
      violations: riRows.rows.length,
      samples: riRows.rows,
    },
  });

  for (const check of checks) {
    await query(
      `INSERT INTO dq_check_results (check_type, status, details)
       VALUES ($1, $2, $3)`,
      [check.check_type, check.status, check.details]
    );
  }

  return checks;
}

async function evaluateSlaBreaches() {
  const { rows } = await query(
    `SELECT sp.connector_name,
            sp.max_delay_hours,
            cm.last_successful_sync,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(cm.last_successful_sync, TO_TIMESTAMP(0)))) / 3600 AS hours_since_success
     FROM sla_policies sp
     LEFT JOIN connector_metrics cm ON cm.connector_name = sp.connector_name
     WHERE sp.enabled = TRUE`
  );

  const breaches = rows.filter((r) => Number(r.hours_since_success) > Number(r.max_delay_hours));

  for (const breach of breaches) {
    await query(
      `INSERT INTO alert_events (connector_name, alert_type, severity, message, details)
       VALUES ($1, 'sla_breach', 'high', $2, $3)`,
      [
        breach.connector_name,
        `No successful sync for ${Math.round(Number(breach.hours_since_success) * 100) / 100} hours`,
        {
          connector_name: breach.connector_name,
          max_delay_hours: Number(breach.max_delay_hours),
          hours_since_success: Number(breach.hours_since_success),
          last_successful_sync: breach.last_successful_sync,
        },
      ]
    );
  }

  return breaches;
}

async function logLineage({ connectorName, entityKey, sourceStage, sourceIdentifier, targetStage, targetIdentifier, status, metadata }) {
  await query(
    `INSERT INTO lineage_events
      (connector_name, entity_key, source_stage, source_identifier, target_stage, target_identifier, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      connectorName,
      entityKey || null,
      sourceStage,
      sourceIdentifier || null,
      targetStage,
      targetIdentifier || null,
      status || 'processed',
      metadata || {},
    ]
  );
}

module.exports = {
  startConnectorRun,
  markConnectorSuccess,
  markConnectorFailure,
  runDataQualityChecks,
  evaluateSlaBreaches,
  logLineage,
};
