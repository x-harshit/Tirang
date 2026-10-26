'use strict';
/**
 * server.js - HTTP + WebSocket setup. Start with:  npm start
 *
 * One HTTP server handles both:
 *   - REST under /api            (routes.js)
 *   - WebSockets /ws/field       (phones,    auth: ?key=DEVICE_KEY)
 *                /ws/dashboard   (browsers,  auth: ?token=JWT)
 * WebSocket clients are authenticated during the HTTP "upgrade", so an
 * unauthenticated client never gets a socket at all.
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const auth = require('./auth');
const hub = require('./hub');
const db = require('./db');
const routes = require('./routes');

auth.assertConfig(); // fail fast if JWT_SECRET is missing

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = reachable from other devices on the network
const HEARTBEAT_MS = 20 * 1000;
const MAX_WS_PAYLOAD = 2 * 1024 * 1024;     // a batch with photo thumbnails can be a few hundred KB

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true'); // needed for correct client IPs behind nginx/Caddy
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));  // open for local development
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));
app.use('/api', routes);

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { // JSON parse errors, oversized bodies, unexpected bugs
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
});

// ---------------------------------------------------------------------------
// HTTP(S) server
// ---------------------------------------------------------------------------
const useTls = process.env.TLS_KEY_PATH && process.env.TLS_CERT_PATH;
const server = useTls
  ? https.createServer({ key: fs.readFileSync(process.env.TLS_KEY_PATH), cert: fs.readFileSync(process.env.TLS_CERT_PATH) }, app)
  : http.createServer(app);

// ---------------------------------------------------------------------------
// WebSockets
// ---------------------------------------------------------------------------
const fieldWss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });
const dashWss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });

function rejectUpgrade(socket, code, reason) {
  socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const ip = req.socket.remoteAddress;

  if (url.pathname === '/ws/field') {
    // Phones pass ?key=... (browsers can't set headers on WebSockets); native clients may use X-Device-Key.
    const r = auth.verifyDeviceKey(url.searchParams.get('key') || req.headers['x-device-key']);
    if (!r.device) {
      hub.log('CONN', `field socket refused from ${ip}: ${r.error}`);
      return rejectUpgrade(socket, r.status, r.error === 'device revoked' ? 'Forbidden' : 'Unauthorized');
    }
    fieldWss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      hub.addFieldSocket(ws, r.device, ip);
    });
  } else if (url.pathname === '/ws/dashboard') {
    const user = auth.verifyToken(url.searchParams.get('token'));
    if (!user) {
      hub.log('CONN', `dashboard socket refused from ${ip}: bad token`);
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }
    dashWss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      hub.addDashboardSocket(ws, user, ip);
    });
  } else {
    rejectUpgrade(socket, 404, 'Not Found');
  }
});

// Heartbeat: every 20 s ping every client. A client that did not answer the
// previous ping is dead (phone lost signal, battery died...) and gets dropped,
// which also flips that unit to offline on the dashboard.
for (const wss of [fieldWss, dashWss]) {
  wss.on('connection', (ws) => ws.on('pong', () => { ws.isAlive = true; }));
}
const heartbeat = setInterval(() => {
  for (const wss of [fieldWss, dashWss]) {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }
}, HEARTBEAT_MS);

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------
server.listen(PORT, HOST, () => {
  hub.startBackgroundJobs();
  const scheme = useTls ? 'https' : 'http';
  const wsScheme = useTls ? 'wss' : 'ws';
  console.log(`\nsignal-hub listening on ${HOST}:${PORT}  (db: ${process.env.DB_PATH || './data/signal-hub.db'})`);
  console.log(`  This machine:   ${scheme}://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  From phones:    ${scheme}://${i.address}:${PORT}   (${wsScheme}://${i.address}:${PORT}/ws/field?key=...)`);
    }
  }
  console.log('');
});

function shutdown() {
  console.log('\nshutting down...');
  clearInterval(heartbeat);
  hub.stopBackgroundJobs();
  for (const wss of [fieldWss, dashWss]) for (const ws of wss.clients) ws.close(1001, 'server shutting down');
  server.close(() => { db.db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref(); // don't hang on stubborn sockets
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
