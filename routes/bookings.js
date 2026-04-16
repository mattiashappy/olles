/**
 * /api/bookings
 * GET    /              – lista (filter: location_id, date, status)
 * POST   /              – skapa bokning
 * PUT    /:id           – uppdatera bokning
 * DELETE /:id           – ta bort bokning
 * POST   /:id/checkin   – manuell incheckning
 * POST   /:id/complete  – attestera klar
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

function toFrontend(row) {
  if (!row) return null;
  return {
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
    createdAt: row.created_at,
  };
}

// GET /api/bookings
router.get('/', async (req, res) => {
  const { location_id, date, status } = req.query;
  let idx = 1;
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const args = [];

  if (location_id) {
    sql += ` AND location_id = $${idx++}`;
    args.push(location_id);
  }
  if (date) {
    sql += ` AND booking_date = $${idx++}`;
    args.push(date);
  }
  if (status) {
    sql += ` AND status = $${idx++}`;
    args.push(status);
  }

  sql += ' ORDER BY booking_date, booking_time';
  const { rows } = await query(sql, args);
  res.json(rows.map(toFrontend));
});

// POST /api/bookings
router.post('/', async (req, res) => {
  const { locationId, regNr, name, phone, service, price, date, time, notes } = req.body;
  if (!locationId || !regNr || !date) {
    return res.status(400).json({ error: 'locationId, regNr och date krävs' });
  }

  const { rows } = await query(
    `INSERT INTO bookings (location_id, reg_nr, customer_name, phone, service, price, booking_date, booking_time, notes, status, unbooked)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'bokad', FALSE)
     RETURNING *`,
    [locationId, regNr.toUpperCase(), name || '', phone || '', service || '', price || 0, date, time || '09:00', notes || '']
  );

  const result = toFrontend(rows[0]);
  req.app.get('broadcast')({ type: 'booking_created', booking: result });
  res.status(201).json(result);
});

// PUT /api/bookings/:id
router.put('/:id', async (req, res) => {
  const { regNr, name, phone, service, price, date, time, notes, status, arrivedAt, completedAt } = req.body;

  const check = await query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
  if (!check.rows[0]) return res.status(404).json({ error: 'Bokning saknas' });

  const { rows } = await query(
    `UPDATE bookings SET
      reg_nr        = COALESCE($1, reg_nr),
      customer_name = COALESCE($2, customer_name),
      phone         = COALESCE($3, phone),
      service       = COALESCE($4, service),
      price         = COALESCE($5, price),
      booking_date  = COALESCE($6, booking_date),
      booking_time  = COALESCE($7, booking_time),
      notes         = COALESCE($8, notes),
      status        = COALESCE($9, status),
      arrived_at    = COALESCE($10, arrived_at),
      completed_at  = COALESCE($11, completed_at)
    WHERE id = $12
    RETURNING *`,
    [
      regNr ? regNr.toUpperCase() : null,
      name ?? null,
      phone ?? null,
      service ?? null,
      price ?? null,
      date ?? null,
      time ?? null,
      notes ?? null,
      status ?? null,
      arrivedAt ?? null,
      completedAt ?? null,
      req.params.id,
    ]
  );

  const result = toFrontend(rows[0]);
  req.app.get('broadcast')({ type: 'booking_updated', booking: result });
  res.json(result);
});

// DELETE /api/bookings/:id
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM bookings WHERE id = $1', [req.params.id]);
  req.app.get('broadcast')({ type: 'booking_deleted', id: parseInt(req.params.id, 10) });
  res.json({ ok: true });
});

// POST /api/bookings/:id/checkin
router.post('/:id/checkin', async (req, res) => {
  const now = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const { rows } = await query("UPDATE bookings SET status='inkort', arrived_at=$1 WHERE id=$2 RETURNING *", [now, req.params.id]);
  const result = toFrontend(rows[0]);
  req.app.get('broadcast')({ type: 'booking_updated', booking: result });
  res.json(result);
});

// POST /api/bookings/:id/complete
router.post('/:id/complete', async (req, res) => {
  const { note } = req.body;
  const now = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  let rows;
  if (note) {
    const old = await query('SELECT notes FROM bookings WHERE id=$1', [req.params.id]);
    const newNotes = old.rows[0]?.notes ? `${old.rows[0].notes} | ${note}` : note;
    ({ rows } = await query("UPDATE bookings SET status='klar', completed_at=$1, notes=$2 WHERE id=$3 RETURNING *", [now, newNotes, req.params.id]));
  } else {
    ({ rows } = await query("UPDATE bookings SET status='klar', completed_at=$1 WHERE id=$2 RETURNING *", [now, req.params.id]));
  }

  const result = toFrontend(rows[0]);
  req.app.get('broadcast')({ type: 'booking_updated', booking: result });
  res.json(result);
});

module.exports = router;
