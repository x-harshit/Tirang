'use strict';
/**
 * routes.js - every REST endpoint. Mounted at /api by server.js.
 *
 *   Field app  (X-Device-Key header):  register, POST signals, GET orders, POST orders/:id/read
 *   Dashboard  (Bearer JWT):           login, signals, units, ack, orders, export, devices
 *
 * The routes only parse and validate HTTP input; the real work is in hub.js.
 */
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const hub = require('./hub');

const router = express.Router();
const dashboard = auth.dashboardAuth();

const TEAM_CODES = (process.env.TEAM_CODES || '').split(',').map((s) => s.trim()).filter(Boolean);

// ===========================================================================
// FIELD APP
// ===========================================================================

/** POST /api/register  { callsign, team_code }  ->  { device_key, ... }  (key is shown only once) */
router.post('/register', (req, res) => {
  if (!auth.registerLimiter.take(req.ip)) return res.status(429).json({ error: 'too many registrations, slow down' });

  const callsign = typeof req.body?.callsign === 'string' ? req.body.callsign.trim().toUpperCase() : '';
  const teamCode = typeof req.body?.team_code === 'string' ? req.body.team_code.trim() : '';
  if (!/^[A-Z0-9][A-Z0-9 _-]{1,31}$/.test(callsign)) {
    return res.status(400).json({ error: 'callsign must be 2-32 characters: letters, digits, space, - or _' });
  }
  if (!teamCode || teamCode.length > 64) return res.status(400).json({ error: 'team_code is required' });
  if (TEAM_CODES.length && !TEAM_CODES.includes(teamCode)) {
    hub.log('REG', `rejected ${callsign}: wrong team code from ${req.ip}`);
    return res.status(403).json({ error: 'invalid team code' });
  }
  if (db.getActiveDeviceByCallsign(callsign)) {
    return res.status(409).json({ error: 'callsign already registered (an admin must revoke it first)' });
  }

  const creds = auth.generateDeviceCredentials();
  try {
    db.insertDevice({ id: creds.id, callsign, keyHash: creds.hash, teamCode, createdAt: Date.now() });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'callsign already registered' });
    throw e;
  }
  hub.log('REG', `${callsign} registered as ${creds.id} (team ${teamCode}) from ${req.ip}`);
  res.status(201).json({ device_id: creds.id, callsign, team_code: teamCode, device_key: creds.key });
});

/**
 * POST /api/signals   (X-Device-Key)
 * Body: one signal object, or an array of up to 100 (queue flush).
 * Idempotent: a repeated signal id is never inserted twice.
 * Response: { results: [{ id, status, duplicate?, error? }] }
 */
router.post('/signals', auth.deviceAuth, (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [req.body];
  if (list.length === 0 || list.length > hub.MAX_BATCH) {
    return res.status(400).json({ error: `send between 1 and ${hub.MAX_BATCH} signals per request` });
  }
  if (!auth.deviceLimiter.take(req.device.id, list.length)) {
    hub.log('LIMIT', `${req.device.callsign} rate limited (rest)`);
    return res.status(429).json({ error: 'rate limit exceeded, retry shortly' });
  }
  const results = hub.ingestSignals(req.device, list, 'rest');
  const anyOk = results.some((r) => r.status !== 'REJECTED');
  res.status(anyOk ? 200 : 400).json({ results });
});

/**
 * GET /api/orders?unit=CALLSIGN
 *   - with X-Device-Key: pending orders for that unit (the unit must be the key's owner).
 *     Returned orders are marked DELIVERED, so the next poll won't repeat them.
 *   - with a dashboard Bearer token: order history (optionally filtered by ?unit=).
 */
router.get('/orders', (req, res) => {
  if (req.get('x-device-key')) {
    const r = auth.verifyDeviceKey(req.get('x-device-key'));
    if (!r.device) return res.status(r.status).json({ error: r.error });
    const unit = String(req.query.unit || r.device.callsign).toUpperCase();
    if (unit !== r.device.callsign) return res.status(403).json({ error: 'a device can only read its own orders' });
    return res.json(hub.deliverPendingOrders(unit));
  }
  return dashboard(req, res, () => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const rows = req.query.unit ? db.listOrdersForUnit(String(req.query.unit).toUpperCase(), limit) : db.listOrders(limit);
    res.json(rows.map(hub.orderToWire));
  });
});

/** POST /api/orders/:id/read  (X-Device-Key) - REST fallback for "the operator read this order". */
router.post('/orders/:id/read', auth.deviceAuth, (req, res) => {
  const r = hub.markOrder(req.device.callsign, req.params.id, 'READ', 'rest');
  if (r.error) return res.status(404).json({ error: r.error });
  res.json({ id: req.params.id, status: 'READ' });
});

// ===========================================================================
// DASHBOARD
// ===========================================================================

/** POST /api/dashboard/login  { username, password }  ->  { token } */
router.post('/dashboard/login', async (req, res) => {
  if (!auth.loginLimiter.take(req.ip)) return res.status(429).json({ error: 'too many login attempts, wait a minute' });
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = db.getUser(username);
  const ok = await auth.verifyPassword(password, user?.password_hash);
  if (!user || !ok) {
    hub.log('LOGIN', `failed login for "${username.slice(0, 40)}" from ${req.ip}`);
    return res.status(401).json({ error: 'invalid username or password' });
  }
  hub.log('LOGIN', `${username} logged in from ${req.ip}`);
  res.json({ token: auth.signToken(username), token_type: 'Bearer', expires_in: auth.TOKEN_TTL_SECONDS, username });
});

/** Turns "1700000000000" or "2025-01-31T10:00:00Z" into epoch ms. Returns undefined if absent, NaN if bad. */
function parseTime(v) {
  if (v == null || v === '') return undefined;
  return /^\d+$/.test(String(v)) ? Number(v) : Date.parse(String(v));
}

/** GET /api/signals?unit=&type=&from=&to=&limit=&offset=&photos=1  (newest first) */
router.get('/signals', dashboard, (req, res) => {
  const from = parseTime(req.query.from);
  const to = parseTime(req.query.to);
  if (Number.isNaN(from) || Number.isNaN(to)) return res.status(400).json({ error: 'from/to must be epoch ms or an ISO date' });
  res.json(db.querySignals({
    unit: req.query.unit, type: req.query.type, from, to,
    limit: Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000),
    offset: Math.max(Number(req.query.offset) || 0, 0),
    photos: req.query.photos === '1',
  }));
});

/** GET /api/units - every unit with status, last position, last seen, battery. */
router.get('/units', dashboard, (req, res) => res.json(hub.getUnits()));

/** GET /api/positions?unit=ALPHA-1&from=&to=&limit=  - GPS trail points, newest first. */
router.get('/positions', dashboard, (req, res) => {
  if (!req.query.unit) return res.status(400).json({ error: 'unit is required' });
  const from = parseTime(req.query.from) ?? 0;
  const to = parseTime(req.query.to) ?? Date.now() + 86400000;
  if (Number.isNaN(from) || Number.isNaN(to)) return res.status(400).json({ error: 'from/to must be epoch ms or an ISO date' });
  res.json(db.getTrail(String(req.query.unit).toUpperCase(), from, to, Math.min(Number(req.query.limit) || 500, 5000)));
});

/** POST /api/signals/:id/ack - acknowledge a signal; the sending phone is told immediately. */
router.post('/signals/:id/ack', dashboard, (req, res) => {
  const r = hub.acknowledgeSignal(req.params.id, req.user.sub);
  if (r.notFound) return res.status(404).json({ error: 'signal not found' });
  res.json(r);
});

/** POST /api/orders  { target_unit: "ALPHA-1" | "ALL", text, title?, priority?: NORMAL|URGENT } */
router.post('/orders', dashboard, (req, res) => {
  const r = hub.createOrder(req.body || {}, req.user.sub);
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(r.order);
});

/** GET /api/export.csv - the full signal log (the token may be passed as ?token= for a plain download link). */
router.get('/export.csv', auth.dashboardAuth({ allowQuery: true }), (req, res) => {
  // Spreadsheet apps run cells starting with = + - @ as formulas. Prefix them so a
  // malicious note like "=HYPERLINK(...)" is shown as text instead.
  const cell = (v) => {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="signals-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write('id,unit,type,sub_type,priority,lat,lon,note,timestamp,time_iso,status,received_at\n');
  for (const s of db.iterateSignalsForExport()) { // MVP: fine for tens of thousands of rows
    res.write([s.id, s.unit, s.type, s.sub_type, s.priority, s.lat, s.lon, s.note, s.timestamp,
      new Date(s.timestamp).toISOString(), s.status, s.received_at].map(cell).join(',') + '\n');
  }
  res.end();
});

// ---- Admin -----------------------------------------------------------------

/** GET /api/devices - all registered devices (never includes key hashes). */
router.get('/devices', dashboard, (req, res) => {
  res.json(db.listDevices().map((d) => ({ ...d, online: hub.isOnline(d.callsign) })));
});

/** POST /api/devices/:id/revoke - key rejected immediately, live sockets closed. */
router.post('/devices/:id/revoke', dashboard, (req, res) => {
  const r = hub.revokeDevice(req.params.id, req.user.sub);
  if (r.notFound) return res.status(404).json({ error: 'device not found' });
  res.json(r);
});

module.exports = router;
