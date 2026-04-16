/**
 * Olles Bilrekond – CRM Backend
 * Express-server med Postgres, WebSocket och Plate Recognizer-webhook.
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const { initDb } = require('./db');
const bookingsRouter = require('./routes/bookings');
const locationsRouter = require('./routes/locations');
const anprRouter = require('./routes/anpr');
const fortnoxRouter = require('./routes/fortnox');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.set('wss', wss);

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}
app.set('broadcast', broadcast);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/locations', locationsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/anpr', anprRouter);
app.use('/api/fortnox', fortnoxRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

wss.on('connection', (ws) => {
  console.log('[WS] Ny klient ansluten');
  ws.send(JSON.stringify({ type: 'connected', message: 'CRM WebSocket aktiv' }));
  ws.on('close', () => console.log('[WS] Klient frånkopplad'));
});

async function start() {
  await initDb();
  server.listen(PORT, () => {
    console.log('\n🚗  Olles Bilrekond CRM startat');
    console.log(`    Öppna: http://localhost:${PORT}`);
    console.log(`    ANPR webhook: POST http://localhost:${PORT}/api/anpr/webhook\n`);
  });
}

start().catch((err) => {
  console.error('Kunde inte starta servern:', err);
  process.exit(1);
});
