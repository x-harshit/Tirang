'use strict';
/**
 * auth.js - authentication for both kinds of clients, plus rate limiting.
 *
 * FIELD DEVICES
 *   A device key looks like  "<deviceId>.<secret>"  (e.g. dev_1a2b3c4d5e6f.Zk3...).
 *   The server stores only  "salt:sha256(salt + key)".  The id prefix lets us
 *   find the one row to check instead of scanning every device. A key is
 *   long random data (not a human password), so a salted SHA-256 is enough.
 *
 * DASHBOARD USERS
 *   Username + password (bcrypt-hashed) -> JWT bearer token.
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const TOKEN_TTL = '12h';
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
  return s;
}

/** Called once at startup so a missing secret fails loudly, not on first login. */
function assertConfig() {
  const s = getSecret();
  if (s === 'replace-me-with-a-long-random-string' || s.length < 16) {
    console.warn('WARNING: JWT_SECRET looks like a placeholder or is very short. Set a long random value in .env.');
  }
}

// ---------------------------------------------------------------------------
// Device keys
// ---------------------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Create a brand-new device id + key. Returns { id, key, hash } - show `key` once, store `hash`. */
function generateDeviceCredentials() {
  const id = 'dev_' + crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `${id}.${secret}`;
  return { id, key, hash: hashKey(key) };
}

function hashKey(key) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${sha256(salt + key)}`;
}

function keyMatches(key, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(sha256(salt + key));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b); // constant-time compare
}

/**
 * Check a device key against the database (every call, so revocation is immediate).
 * Returns { device } on success, or { status, error } describing the failure.
 */
function verifyDeviceKey(key) {
  if (typeof key !== 'string' || key.length > 200 || !key.includes('.')) {
    return { status: 401, error: 'missing or malformed device key' };
  }
  const id = key.slice(0, key.indexOf('.'));
  const device = db.getDevice(id);
  if (!device || !keyMatches(key, device.device_key_hash)) {
    return { status: 401, error: 'invalid device key' };
  }
  if (device.status !== 'active') {
    return { status: 403, error: 'device revoked' };
  }
  return { device };
}

/** Express middleware: requires a valid X-Device-Key header, sets req.device. */
function deviceAuth(req, res, next) {
  const r = verifyDeviceKey(req.get('x-device-key'));
  if (!r.device) return res.status(r.status).json({ error: r.error });
  req.device = r.device;
  next();
}

// ---------------------------------------------------------------------------
// Dashboard users + JWT
// ---------------------------------------------------------------------------
const hashPassword = (plain) => bcrypt.hashSync(plain, 10);

// A throwaway hash so unknown usernames cost the same time as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function verifyPassword(plain, hash) {
  const ok = await bcrypt.compare(plain, hash || DUMMY_HASH);
  return Boolean(hash) && ok;
}

function signToken(username) {
  return jwt.sign({ sub: username, role: 'admin' }, getSecret(), { algorithm: 'HS256', expiresIn: TOKEN_TTL });
}

/** Returns the token payload, or null if invalid/expired. */
function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/**
 * Express middleware factory. Reads "Authorization: Bearer <jwt>".
 * Pass { allowQuery: true } to also accept ?token=... (used for the CSV
 * download link, where a browser cannot set headers).
 */
function dashboardAuth({ allowQuery = false } = {}) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token && allowQuery && typeof req.query.token === 'string') token = req.query.token;
    const payload = token && verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'missing or invalid token' });
    req.user = payload;
    next();
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (token bucket, in memory)
// ---------------------------------------------------------------------------
/**
 * Each key (device id or IP) owns a bucket of `capacity` tokens that refills
 * at `refillPerSec`. take(key, n) spends n tokens or returns false.
 * Bursts up to `capacity` are allowed, so a phone flushing a queue of
 * offline signals is fine, but sustained spam is not.
 */
function createLimiter({ capacity, refillPerSec }) {
  const buckets = new Map();
  setInterval(() => { // forget idle buckets so the map can't grow forever
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, b] of buckets) if (b.t < cutoff) buckets.delete(k);
  }, 60 * 1000).unref();

  return {
    take(key, cost = 1) {
      const now = Date.now();
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, t: now }; buckets.set(key, b); }
      b.tokens = Math.min(capacity, b.tokens + ((now - b.t) / 1000) * refillPerSec);
      b.t = now;
      const need = Math.min(cost, capacity);
      if (b.tokens < need) return false;
      b.tokens -= need;
      return true;
    },
  };
}

const perMinute = Number(process.env.RATE_LIMIT_PER_MIN) || 120;
const deviceLimiter = createLimiter({ capacity: perMinute, refillPerSec: perMinute / 60 }); // signals per device
const registerLimiter = createLimiter({ capacity: 10, refillPerSec: 10 / 60 });             // /register per IP
const loginLimiter = createLimiter({ capacity: 10, refillPerSec: 10 / 60 });                // /login per IP

module.exports = {
  TOKEN_TTL_SECONDS,
  assertConfig,
  generateDeviceCredentials,
  hashKey,
  verifyDeviceKey,
  deviceAuth,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  dashboardAuth,
  deviceLimiter,
  registerLimiter,
  loginLimiter,
};
