/**
 * /api/fortnox
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { executeWithRetry } = require('../lib/retry');
const {
  startConnectorRun,
  markConnectorSuccess,
  markConnectorFailure,
  logLineage,
} = require('../lib/monitoring');

router.get('/export', async (req, res) => {
  const runId = await startConnectorRun('fortnox_export');
  try {
    const { location_id, date } = req.query;
    if (!location_id || !date) {
      return res.status(400).json({ error: 'location_id och date krävs' });
    }

    const { rows } = await executeWithRetry(
      async () =>
        (
          await query(
            `SELECT b.*, l.name as location_name
             FROM bookings b
             JOIN locations l ON b.location_id = l.id
             WHERE b.location_id = $1 AND b.booking_date = $2 AND b.status = 'klar'
             ORDER BY b.completed_at`,
            [location_id, date]
          )
        ).rows,
      { retries: 3, baseDelayMs: 250 }
    );

    if (!rows.length) {
      await markConnectorSuccess(runId, 'fortnox_export', 0);
      return res.status(404).json({ error: 'Inga slutförda arbeten för detta datum och anläggning' });
    }

    const header = 'RegNr;Kund;Telefon;Tjänst;Pris;Datum;Klar;Anläggning';
    const csvRows = rows.map((r) =>
      [r.reg_nr, r.customer_name || 'Okänd', r.phone || '', r.service || '', r.price || 0, r.booking_date, r.completed_at || '', r.location_name].join(';')
    );

    const csv = [header, ...csvRows].join('\n');
    const locName = rows[0].location_name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Olles_Bilrekond_${locName}_${date}_Fortnox.csv`;

    await logLineage({
      connectorName: 'fortnox_export',
      entityKey: `${location_id}:${date}`,
      sourceStage: 'mart',
      sourceIdentifier: 'bookings',
      targetStage: 'dashboard',
      targetIdentifier: 'fortnox_csv_export',
      metadata: { row_count: rows.length, filename },
    });

    await markConnectorSuccess(runId, 'fortnox_export', rows.length);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csv);
  } catch (error) {
    await markConnectorFailure(runId, 'fortnox_export', error, 3, req.query);
    res.status(500).json({ error: error.message });
  }
});

router.get('/preview', async (req, res) => {
  const runId = await startConnectorRun('fortnox_preview');
  try {
    const { location_id, date } = req.query;
    if (!location_id || !date) {
      return res.status(400).json({ error: 'location_id och date krävs' });
    }

    const { rows } = await executeWithRetry(
      async () =>
        (
          await query(
            `SELECT reg_nr, customer_name, phone, service, price, booking_date, completed_at
             FROM bookings
             WHERE location_id = $1 AND booking_date = $2 AND status = 'klar'
             ORDER BY completed_at`,
            [location_id, date]
          )
        ).rows,
      { retries: 2, baseDelayMs: 150 }
    );

    const total = rows.reduce((s, r) => s + (r.price || 0), 0);

    await logLineage({
      connectorName: 'fortnox_preview',
      entityKey: `${location_id}:${date}`,
      sourceStage: 'mart',
      sourceIdentifier: 'bookings',
      targetStage: 'dashboard',
      targetIdentifier: 'fortnox_preview',
      metadata: { row_count: rows.length, total },
    });

    await markConnectorSuccess(runId, 'fortnox_preview', rows.length);
    res.json({ rows, total, count: rows.length });
  } catch (error) {
    await markConnectorFailure(runId, 'fortnox_preview', error, 2, req.query);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
