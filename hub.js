'use strict';
/**
 * hub.js - the real-time core shared by the REST routes and the WebSockets.
 *
 * It keeps track of who is connected, and owns the business rules:
 *   - validating and storing incoming signals (idempotent)
 *   - broadcasting to dashboards, ACKing back to the sender
 *   - orders: create, push, delivery/read tracking
 *   - unit status (ACTIVE / SOS / NO_CONTACT), computed on the fly
 *
 * (Not in the original file list, but routes.js and server.js both need this
 *  logic, and a shared module keeps them thin.)
 */
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');

const WS_OPEN = 1; // ws.readyState value for an open socket
const NO_CONTACT_MS = (Number(process.env.NO_CONTACT_MINUTES) || 10) * 60 * 1000;
const MAX_PHOTO_BYTES = 100 * 1024;
const MAX_BATCH = 100;

const SIGNAL_TYPES = new Set(['SOS', 'STATUS', 'HAZARD', 'CONTACT', 'CASUALTY', 'SUPPLY', 'BEACON',
  'ACK']); // ACK = the field app confirming it read an order (not in the spec list, but the app sends it)
const PRIORITY_ALIASES = { critical: 'critical', high: 'high', urgent: 'high', normal: 'normal' };
const ORDER_PRIORITIES = new Set(['NORMAL', 'URGENT']);

// ---------------------------------------------------------------------------
// Logging: one readable line per event
// ---------------------------------------------------------------------------
function log(tag, message) {
  console.log(`${new Date().toISOString()} [${String(tag).padEnd(6)}] ${message}`);
}

// ---------------------------------------------------------------------------
// Connection registries
// ---------------------------------------------------------------------------
const fieldSockets = new Map(); // callsign -> Set<ws>   (a phone may briefly have 2 sockets on reconnect)
const dashSockets = new Set();  // every connected dashboard
const unitCache = new Map();    // callsign -> "STATUS|online"  (to detect changes)

const send = (ws, obj) => { if (ws.readyState === WS_OPEN) ws.send(JSON.stringify(obj)); };
const broadcastDash = (obj) => { const data = JSON.stringify(obj); for (const ws of dashSockets) if (ws.readyState === WS_OPEN) ws.send(data); };
const isOnline = (callsign) => (fieldSockets.get(callsign)?.size || 0) > 0;
const sendToUnit = (callsign, obj) => { for (const ws of fieldSockets.get(callsign) || []) send(ws, obj); };

// ---------------------------------------------------------------------------
// Wire formats (what clients see)
// ---------------------------------------------------------------------------
function signalToWire(row) {
  return {
    id: row.id, unit: row.unit, type: row.type, subType: row.sub_type ?? undefined,
    priority: row.priority, lat: row.lat, lon: row.lon, note: row.note ?? '',
    photo_thumb: row.photo_thumb ?? undefined,
    timestamp: row.timestamp, status: row.status, received_at: row.received_at,
  };
}

/** Orders include both our canonical names and the field app's (title/message/sender/timestamp). */
function orderToWire(o) {
  return {
    id: o.id, sender: o.sender, title: o.title, message: o.text, text: o.text,
    priority: o.priority, target_unit: o.target_unit, status: o.status,
    timestamp: o.created_at, created_at: o.created_at, acknowledged: false,
  };
}

function unitToWire(r, now = Date.now()) {
  const contactLost = !r.last_seen || now - r.last_seen > NO_CONTACT_MS;
  let status = 'ACTIVE';
  if (r.open_sos > 0) status = 'SOS';           // an unacknowledged SOS outranks everything
  else if (contactLost) status = 'NO_CONTACT';  // computed from last_seen, nothing stored
  return {
    id: r.device_id, callsign: r.callsign, team_code: r.team_code,
    status, online: isOnline(r.callsign), no_contact: contactLost,
    last_seen: r.last_seen, battery: r.battery,
    last_position: r.pos_time == null ? null : { lat: r.pos_lat, lon: r.pos_lon, timestamp: r.pos_time },
  };
}

const getUnits = () => db.listUnits().map((r) => unitToWire(r));

// ---------------------------------------------------------------------------
// Unit status tracking
// ---------------------------------------------------------------------------
/** Recompute one unit and broadcast if its status or online flag changed. */
function refreshUnit(callsign) {
  const row = db.getUnit(callsign);
  if (row) publishIfChanged(unitToWire(row));
}

/** Recompute all units (runs on a timer so silent units flip to NO_CONTACT). */
function sweepUnits() {
  const now = Date.now();
  for (const row of db.listUnits()) publishIfChanged(unitToWire(row, now));
}

function publishIfChanged(unit) {
  const key = `${unit.status}|${unit.online}`;
  const prev = unitCache.get(unit.callsign);
  if (prev === key) return;
  unitCache.set(unit.callsign, key);
  if (prev) log('UNIT', `${unit.callsign} ${prev.replace('|', ' online=')} -> ${unit.status} online=${unit.online}`);
  broadcastDash({ type: 'unit_status', unit });
}

let sweepTimer = null;
function startBackgroundJobs() {
  sweepUnits(); // fill the cache so the first real change is detected
  sweepTimer = setInterval(sweepUnits, 10 * 1000);
}
function stopBackgroundJobs() { clearInterval(sweepTimer); }

// ---------------------------------------------------------------------------
// Signal validation
// ---------------------------------------------------------------------------
const isStr = (v, max) => typeof v === 'string' && v.length <= max;

/** Decoded size in bytes of a base64 string (accepts an optional data: URL prefix); -1 if not base64. */
function base64Bytes(str) {
  const i = str.indexOf('base64,');
  const b64 = i >= 0 ? str.slice(i + 7) : str;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return -1;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** Returns { value } with a cleaned-up signal, or { error } explaining what is wrong. */
function validateSignal(raw, device) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'signal must be an object' };

  if (typeof raw.id !== 'string' || !/^[\w.:-]{1,100}$/.test(raw.id)) {
    return { error: 'id must be 1-100 characters (letters, digits, _ . : -)' };
  }
  if (typeof raw.unit !== 'string' || raw.unit.trim().toUpperCase() !== device.callsign) {
    return { error: `unit must match this device's callsign (${device.callsign})` };
  }
  const type = typeof raw.type === 'string' ? raw.type.toUpperCase() : '';
  if (!SIGNAL_TYPES.has(type)) return { error: `type must be one of ${[...SIGNAL_TYPES].join(', ')}` };

  let priority = PRIORITY_ALIASES[String(raw.priority ?? 'normal').toLowerCase()];
  if (!priority) return { error: 'priority must be critical, high or normal' };
  if (type === 'SOS') priority = 'critical'; // SOS is always critical, whatever the phone says

  const { lat, lon } = raw;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat must be a number between -90 and 90' };
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'lon must be a number between -180 and 180' };

  // Timestamp: epoch ms (number) or ISO string. Old values are fine (offline queue); far-future ones are not.
  let timestamp = typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : raw.timestamp;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return { error: 'timestamp must be epoch milliseconds or an ISO date' };
  if (timestamp > Date.now() + 24 * 3600 * 1000) return { error: 'timestamp is too far in the future' };
  timestamp = Math.round(timestamp);

  if (raw.note != null && !isStr(raw.note, 1000)) return { error: 'note must be a string up to 1000 characters' };
  if (raw.subType != null && !isStr(raw.subType, 64)) return { error: 'subType must be a string up to 64 characters' };

  let battery = null;
  if (raw.battery != null) {
    if (typeof raw.battery !== 'number' || raw.battery < 0 || raw.battery > 100) return { error: 'battery must be a number 0-100' };
    battery = Math.round(raw.battery);
  }

  let photoThumb = null;
  if (raw.photo_thumb != null) {
    if (typeof raw.photo_thumb !== 'string') return { error: 'photo_thumb must be a base64 string' };
    if (raw.photo_thumb.length > (MAX_PHOTO_BYTES * 4) / 3 + 200) return { error: 'photo_thumb too large (max 100 KB)' };
    const bytes = base64Bytes(raw.photo_thumb);
    if (bytes < 0) return { error: 'photo_thumb is not valid base64' };
    if (bytes > MAX_PHOTO_BYTES) return { error: 'photo_thumb too large (max 100 KB)' };
    photoThumb = raw.photo_thumb;
  }

  return {
    value: {
      id: raw.id, unit: device.callsign, type, priority,
      subType: raw.subType ?? null, lat, lon, note: raw.note ?? null,
      photoThumb, timestamp, battery,
    },
  };
}

// ---------------------------------------------------------------------------
// Signal ingest (used by POST /api/signals and the /ws/field socket)
// ---------------------------------------------------------------------------
/**
 * Validate, store and broadcast a batch of signals from one device.
 * Returns one result per input signal, in the same order:
 *   { id, status: 'RECEIVED' | 'ACKNOWLEDGED', duplicate? }  or  { id, status: 'REJECTED', error }
 */
function ingestSignals(device, rawList, via) {
  const results = new Array(rawList.length);
  const accepted = [];

  rawList.forEach((raw, index) => {
    const v = validateSignal(raw, device);
    if (v.error) {
      results[index] = { id: typeof raw?.id === 'string' ? raw.id : null, status: 'REJECTED', error: v.error };
      log('REJECT', `${device.callsign} id=${results[index].id} ${v.error} (${via})`);
    } else {
      accepted.push({ index, sig: v.value });
    }
  });

  // SOS goes first, both for storage and for the broadcast to dashboards.
  accepted.sort((a, b) => (b.sig.type === 'SOS') - (a.sig.type === 'SOS'));

  const now = Date.now();
  const fresh = []; // signals that were really inserted (not duplicates)

  db.transaction(() => { // all-or-nothing, and much faster than one commit per signal
    for (const { index, sig } of accepted) {
      const r = db.insertSignal({
        id: sig.id, unit: sig.unit, type: sig.type, priority: sig.priority, subType: sig.subType,
        lat: sig.lat, lon: sig.lon, note: sig.note, photoThumb: sig.photoThumb,
        timestamp: sig.timestamp, receivedAt: now,
      });
      if (r.changes === 1) {
        db.insertPosition({ unit: sig.unit, lat: sig.lat, lon: sig.lon, timestamp: sig.timestamp });
        fresh.push(sig);
        results[index] = { id: sig.id, status: 'RECEIVED' };
        continue;
      }
      // Already stored: idempotent. Never insert twice, just report where it stands.
      const existing = db.getSignal(sig.id);
      if (existing.unit !== sig.unit) {
        results[index] = { id: sig.id, status: 'REJECTED', error: 'id already used by another unit' };
      } else {
        results[index] = { id: sig.id, status: existing.status, duplicate: true };
      }
    }
    // Any valid signal proves the device is alive; use the batch's newest battery reading.
    if (accepted.length) {
      const battery = [...accepted].reverse().map((a) => a.sig.battery).find((b) => b != null);
      db.touchDevice(device.id, now, battery);
    }
  });

  // Broadcast after the commit. Signals first (SOS leading), then position updates.
  for (const sig of fresh) {
    const row = db.getSignal(sig.id);
    broadcastDash({ type: 'signal', signal: signalToWire(row) });
    log('SIGNAL', `${sig.unit} ${sig.type}${sig.subType ? '/' + sig.subType : ''} ${sig.priority} `
      + `(${sig.lat.toFixed(5)},${sig.lon.toFixed(5)}) id=${sig.id} via=${via}`);
  }
  for (const sig of fresh) {
    broadcastDash({ type: 'position', unit: sig.unit, lat: sig.lat, lon: sig.lon, timestamp: sig.timestamp });
  }
  for (const sig of fresh) {
    if (sig.type === 'ACK') markOrderReadFromAck(device.callsign, sig.note);
  }
  const dupes = results.filter((r) => r?.duplicate).length;
  if (dupes) log('DUPE', `${device.callsign} ${dupes} duplicate signal(s) ignored (${via})`);

  if (accepted.length) refreshUnit(device.callsign);
  return results;
}

// ---------------------------------------------------------------------------
// Acknowledging signals (dashboard -> field)
// ---------------------------------------------------------------------------
/** Returns { notFound: true } or { id, status, already? }. */
function acknowledgeSignal(id, username) {
  const sig = db.getSignal(id);
  if (!sig) return { notFound: true };
  if (!db.ackSignal(id)) return { id, status: sig.status, already: true };

  log('ACK', `${sig.unit} signal ${id} acknowledged by ${username}`);
  broadcastDash({ type: 'signal_status', id, unit: sig.unit, status: 'ACKNOWLEDGED' });
  sendToUnit(sig.unit, { type: 'signal_status', id, status: 'ACKNOWLEDGED' });
  refreshUnit(sig.unit); // an acknowledged SOS stops counting as "open"
  return { id, status: 'ACKNOWLEDGED' };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const cleanStr = (v) => (typeof v === 'string' ? v.trim() : '');

/** Create an order and push it live. Returns { order } or { error }. */
function createOrder(body, username) {
  const targetUnit = cleanStr(body.target_unit ?? body.targetUnit ?? body.unit).toUpperCase();
  const text = cleanStr(body.text ?? body.message);
  const title = cleanStr(body.title).slice(0, 80) || 'DIRECTIVE';
  const priority = cleanStr(body.priority || 'NORMAL').toUpperCase();
  const sender = cleanStr(body.sender).slice(0, 40) || 'COMMAND HQ';

  if (!targetUnit) return { error: 'target_unit is required (a callsign or "ALL")' };
  if (!text || text.length > 1000) return { error: 'text is required (max 1000 characters)' };
  if (!ORDER_PRIORITIES.has(priority)) return { error: 'priority must be NORMAL or URGENT' };
  if (targetUnit !== 'ALL' && !db.getActiveDeviceByCallsign(targetUnit)) return { error: `unknown unit: ${targetUnit}` };

  const row = { id: 'ord-' + crypto.randomUUID(), targetUnit, title, text, priority, sender, createdAt: Date.now() };
  db.insertOrder(row);
  const order = orderToWire(db.getOrder(row.id));

  // Push to whoever is online. Offline units get it on reconnect (see addFieldSocket).
  let pushed = 0;
  const targets = targetUnit === 'ALL' ? [...fieldSockets.keys()] : [targetUnit];
  for (const cs of targets) {
    if (isOnline(cs)) { sendToUnit(cs, { type: 'order', order }); pushed++; }
  }
  log('ORDER', `${row.id} -> ${targetUnit} ${priority} by ${username} (pushed live to ${pushed} unit(s)) "${title}"`);
  broadcastDash({ type: 'order_status', orderId: row.id, unit: targetUnit, status: 'SENT', orderStatus: 'SENT', order });
  return { order };
}

/** A unit reports DELIVERED or READ for an order. Returns { ok } or { error }. */
function markOrder(callsign, orderId, status, via) {
  const order = typeof orderId === 'string' ? db.getOrder(orderId) : null;
  if (!order || (order.target_unit !== 'ALL' && order.target_unit !== callsign)) {
    return { error: 'order not found for this unit' };
  }
  const r = db.setReceipt(orderId, callsign, status);
  if (r.changed) {
    log('ORDER', `${orderId} ${status} by ${callsign} (${via})`);
    broadcastDash({ type: 'order_status', orderId, unit: callsign, status, orderStatus: r.orderStatus });
  }
  return { ok: true };
}

/** The field app confirms an order by sending an ACK signal whose note ends in "#ABC123" (last 6 chars of the id). */
function markOrderReadFromAck(callsign, note) {
  const m = /#([A-Za-z0-9]{6})\b/.exec(note || '');
  if (!m) return;
  const order = db.findOrderBySuffix(callsign, m[1]);
  if (order) markOrder(callsign, order.id, 'READ', 'ack-signal');
}

/** Orders the unit has not confirmed yet, marked DELIVERED (used by polling). */
function deliverPendingOrders(callsign) {
  const pending = db.pendingOrders(callsign);
  for (const o of pending) markOrder(callsign, o.id, 'DELIVERED', 'poll');
  return pending.map(orderToWire);
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------
function revokeDevice(id, username) {
  const device = db.getDevice(id);
  if (!device) return { notFound: true };
  if (!db.revokeDevice(id)) return { id, status: 'revoked', already: true };

  // Kick the phone off immediately; its key is already rejected by every request.
  for (const ws of fieldSockets.get(device.callsign) || []) ws.close(4001, 'device revoked');
  unitCache.delete(device.callsign);
  log('REVOKE', `${device.callsign} (${id}) revoked by ${username}`);
  broadcastDash({ type: 'device_revoked', unit: device.callsign, id });
  return { id, status: 'revoked' };
}

// ---------------------------------------------------------------------------
// WebSocket lifecycle
// ---------------------------------------------------------------------------
function addFieldSocket(ws, device, ip) {
  const cs = device.callsign;
  ws.deviceId = device.id;
  ws.callsign = cs;
  if (!fieldSockets.has(cs)) fieldSockets.set(cs, new Set());
  fieldSockets.get(cs).add(ws);
  log('CONN', `field ${cs} connected from ${ip} (${fieldSockets.get(cs).size} socket)`);

  send(ws, { type: 'hello', unit: cs, serverTime: Date.now() });
  // Re-deliver orders the phone has not confirmed, and tell it about acknowledged signals.
  for (const o of db.pendingOrders(cs)) send(ws, { type: 'order', order: orderToWire(o) });
  for (const s of db.recentAcknowledged(cs)) send(ws, { type: 'signal_status', id: s.id, status: 'ACKNOWLEDGED' });

  ws.on('message', (data) => handleFieldMessage(ws, data.toString()));
  ws.on('error', () => {}); // 'close' follows; this just stops an unhandled-error crash
  ws.on('close', () => {
    const set = fieldSockets.get(cs);
    set?.delete(ws);
    if (set && set.size === 0) fieldSockets.delete(cs);
    log('CONN', `field ${cs} disconnected`);
    refreshUnit(cs);
  });
  refreshUnit(cs);
}

function addDashboardSocket(ws, user, ip) {
  dashSockets.add(ws);
  log('CONN', `dashboard ${user.sub} connected from ${ip} (${dashSockets.size} open)`);
  send(ws, { type: 'snapshot', units: getUnits(), serverTime: Date.now(), noContactMs: NO_CONTACT_MS });
  ws.on('error', () => {});
  ws.on('close', () => {
    dashSockets.delete(ws);
    log('CONN', `dashboard ${user.sub} disconnected (${dashSockets.size} open)`);
  });
}

/**
 * Messages a phone can send over /ws/field (all JSON):
 *   { type: "signal",  signal: {...} }
 *   { type: "signals", signals: [{...}, ...] }       (queue flush)
 *   { type: "order_delivered", orderId }
 *   { type: "order_read",      orderId }
 */
function handleFieldMessage(ws, text) {
  let msg;
  try { msg = JSON.parse(text); } catch { return send(ws, { type: 'error', error: 'invalid JSON' }); }

  // Re-check the device on every message so revocation takes effect at once.
  const device = db.getDevice(ws.deviceId);
  if (!device || device.status !== 'active') { ws.close(4001, 'device revoked'); return; }

  switch (msg?.type) {
    case 'signal':
    case 'signals': {
      const list = msg.type === 'signal' ? [msg.signal] : msg.signals;
      if (!Array.isArray(list) || list.length === 0 || list.length > MAX_BATCH) {
        return send(ws, { type: 'error', error: `send 1-${MAX_BATCH} signals` });
      }
      if (!auth.deviceLimiter.take(device.id, list.length)) {
        log('LIMIT', `${device.callsign} rate limited (ws)`);
        return send(ws, { type: 'error', error: 'rate_limited', ids: list.map((s) => s?.id) });
      }
      for (const r of ingestSignals(device, list, 'ws')) {
        // One ACK per signal id, as the field app expects.
        if (r.status === 'REJECTED') send(ws, { type: 'error', id: r.id, error: r.error });
        else send(ws, { type: 'ack', id: r.id, status: r.status, duplicate: r.duplicate || undefined });
      }
      return;
    }
    case 'order_delivered':
    case 'order_read': {
      const status = msg.type === 'order_read' ? 'READ' : 'DELIVERED';
      const r = markOrder(device.callsign, msg.orderId, status, 'ws');
      return send(ws, r.error ? { type: 'error', error: r.error } : { type: 'order_ack', orderId: msg.orderId, status });
    }
    default:
      return send(ws, { type: 'error', error: 'unknown message type' });
  }
}

module.exports = {
  MAX_BATCH,
  log,
  getUnits,
  orderToWire,
  ingestSignals,
  acknowledgeSignal,
  createOrder,
  markOrder,
  deliverPendingOrders,
  revokeDevice,
  isOnline,
  addFieldSocket,
  addDashboardSocket,
  startBackgroundJobs,
  stopBackgroundJobs,
};
