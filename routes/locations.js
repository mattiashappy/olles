/**
 * /api/locations
 * GET    /          – lista alla anläggningar
 * POST   /          – skapa ny anläggning
 * DELETE /:id       – ta bort anläggning
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

// GET /api/locations
router.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM locations ORDER BY name');
  res.json(rows);
});

// POST /api/locations
router.post('/', async (req, res) => {
  const { name, city } = req.body;
  if (!name) return res.status(400).json({ error: 'name krävs' });

  const id =
    name
      .toLowerCase()
      .replace(/å/g, 'a')
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]/g, '_') +
    '_' +
    Date.now();

  await query('INSERT INTO locations (id, name, city) VALUES ($1, $2, $3)', [id, name, city || name]);
  const { rows } = await query('SELECT * FROM locations WHERE id = $1', [id]);
  res.status(201).json(rows[0]);
});

// DELETE /api/locations/:id
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM locations WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
