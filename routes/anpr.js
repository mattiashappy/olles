/**
 * /api/anpr
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

function nowTime() {
  return new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function processPlate(regNr, direction, locationId, cameraId, confidence, broadcast) {
  const today = todayStr();
  const t = nowTime();
  regNr = regNr.toUpperCase().replace(/\s/g, '');

  const bookingResult = await query(
    `SELECT * FROM bookings
     WHERE location_id = $1 AND reg_nr = $2 AND booking_date = $3
     ORDER BY booking_time LIMIT 1`,
    [locationId, regNr, today]
  );
  const booking = bookingResult.rows[0] || null;

  let matchedId = null;
  let action = 'no_match';

  if (direction === 'in') {
    if (booking && booking.status === 'bokad') {
      const upd = await query("UPDATE bookings SET status='inkort', arrived_at=$1 WHERE id=$2 RETURNING id", [t, booking.id]);
      matchedId = upd.rows[0]?.id || booking.id;
      action = 'checked_in';
    } else if (!booking) {
      const existing = await query(
        `SELECT id FROM bookings
         WHERE location_id = $1 AND reg_nr = $2 AND booking_date = $3 AND unbooked = TRUE`,
        [locationId, regNr, today]
      );

      if (!existing.rows[0]) {
        const ins = await query(
          `INSERT INTO bookings (location_id, reg_nr, booking_date, booking_time, status, arrived_at, notes, unbooked)
           VALUES ($1, $2, $3, $4, 'ejbokad', $5, 'Detekterad av ANPR – ej bokad', TRUE)
           RETURNING id`,
          [locationId, regNr, today, t, t]
        );
        matchedId = ins.rows[0].id;
        action = 'unbooked_created';
      } else {
        action = 'already_unbooked';
      }
    } else {
      action = 'already_in';
    }
  } else if (direction === 'out') {
    if (booking && booking.status === 'inkort') {
      action = 'ready_for_attestation';
      matchedId = booking.id;
    }
  }

  await query(
    `INSERT INTO anpr_events (location_id, reg_nr, direction, confidence, camera_id, matched_booking_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [locationId, regNr, direction, confidence || null, cameraId || null, matchedId]
  );

  let updatedBooking = null;
  if (matchedId) {
    const rowRes = await query('SELECT * FROM bookings WHERE id = $1', [matchedId]);
    const row = rowRes.rows[0];
    if (row) {
      updatedBooking = {
        id: row.id,
        locationId: row.location_id,
        regNr: row.reg_nr,
        name: row.customer_name || '',
        phone: row.phone || '',
        service: row.service || '',
        price: row.price || 0,
        date: row.booking_date,
        time: row.booking_time || '',
        status: row.status,
        arrivedAt: row.arrived_at,
        completedAt: row.completed_at,
        notes: row.notes || '',
        unbooked: !!row.unbooked,
      };
    }
  }

  const event = {
    type: 'anpr_event',
    regNr,
    direction,
    time: t,
    locationId,
    cameraId: cameraId || null,
    confidence: confidence || null,
    action,
    matched: !!booking,
    booking: updatedBooking,
  };

  broadcast(event);
  return event;
}

router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const data = body.data || body;
    const cameraId = data.camera_id || 'unknown';
    const results = data.results || [];

    if (!results.length) return res.json({ ok: true, skipped: 'no_results' });

    let locationId = 'falun';
    let direction = 'in';

    if (cameraId.endsWith('_out')) {
      direction = 'out';
      locationId = cameraId.slice(0, -4);
    } else if (cameraId.endsWith('_in')) {
      direction = 'in';
      locationId = cameraId.slice(0, -3);
    } else {
      locationId = cameraId;
    }

    const best = results.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const event = await processPlate(best.plate, direction, locationId, cameraId, best.score, req.app.get('broadcast'));

    res.json({ ok: true, event });
  } catch (err) {
    console.error('[ANPR webhook error]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/simulate', async (req, res) => {
  const { regNr, direction, locationId, cameraId } = req.body;
  if (!regNr || !direction || !locationId) {
    return res.status(400).json({ error: 'regNr, direction och locationId krävs' });
  }

  const event = await processPlate(regNr, direction, locationId, cameraId || `${locationId}_${direction}`, null, req.app.get('broadcast'));
  res.json({ ok: true, event });
});

router.get('/events', async (req, res) => {
  const { location_id, date } = req.query;
  let sql = 'SELECT * FROM anpr_events WHERE 1=1';
  const args = [];
  let idx = 1;

  if (location_id) {
    sql += ` AND location_id = $${idx++}`;
    args.push(location_id);
  }
  if (date) {
    sql += ` AND DATE(event_time) = $${idx++}`;
    args.push(date);
  }
  sql += ' ORDER BY event_time DESC LIMIT 100';

  const { rows } = await query(sql, args);
  res.json(rows);
});

module.exports = router;
