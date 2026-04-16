const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { runDataQualityChecks, evaluateSlaBreaches } = require('../lib/monitoring');
const { executeWithRetry } = require('../lib/retry');

router.get('/connectors', async (req, res) => {
  const { rows } = await query(
    `SELECT connector_name, last_successful_sync, last_row_delta, total_runs, successful_runs, failed_runs, error_rate, last_run_at
     FROM connector_metrics
     ORDER BY connector_name`
  );
  res.json(rows);
});

router.get('/runs', async (req, res) => {
  const { rows } = await query(
    `SELECT id, connector_name, status, started_at, finished_at, row_delta, retry_count, error_message
     FROM connector_runs
     ORDER BY started_at DESC
     LIMIT 100`
  );
  res.json(rows);
});

router.post('/data-quality/run', async (req, res) => {
  const checks = await runDataQualityChecks();
  res.json({ ok: true, checks });
});

router.get('/data-quality/latest', async (req, res) => {
  const { rows } = await query(
    `SELECT id, check_type, status, details, created_at
     FROM dq_check_results
     ORDER BY created_at DESC
     LIMIT 100`
  );
  res.json(rows);
});

router.post('/sla/evaluate', async (req, res) => {
  const breaches = await evaluateSlaBreaches();
  res.json({ ok: true, breaches });
});

router.get('/alerts', async (req, res) => {
  const { rows } = await query(
    `SELECT id, connector_name, alert_type, severity, message, details, created_at
     FROM alert_events
     ORDER BY created_at DESC
     LIMIT 100`
  );
  res.json(rows);
});

router.get('/dead-letter', async (req, res) => {
  const { rows } = await query(
    `SELECT id, connector_name, run_id, payload, error_message, retry_count, status, created_at, resolved_at
     FROM dead_letter_loads
     ORDER BY created_at DESC
     LIMIT 100`
  );
  res.json(rows);
});

router.post('/dead-letter/:id/retry', async (req, res) => {
  const { rows } = await query('SELECT * FROM dead_letter_loads WHERE id=$1', [req.params.id]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Dead-letter post saknas' });

  try {
    await executeWithRetry(async () => {
      await query(
        `INSERT INTO connector_runs (connector_name, status, started_at, finished_at, row_delta)
         VALUES ($1, 'success', NOW(), NOW(), 1)`,
        [item.connector_name]
      );
    }, { retries: 2, baseDelayMs: 250 });

    await query(
      `UPDATE dead_letter_loads
       SET status='retried', resolved_at=NOW(), retry_count=retry_count+1
       WHERE id=$1`,
      [item.id]
    );

    res.json({ ok: true });
  } catch (error) {
    await query(
      `UPDATE dead_letter_loads
       SET retry_count=retry_count+1, error_message=$1
       WHERE id=$2`,
      [error.message, item.id]
    );
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
