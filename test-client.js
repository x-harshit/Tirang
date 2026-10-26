'use strict';
/**
 * test-client.js - end-to-end check against a RUNNING server (npm start).
 *
 *   npm test                          (uses http://localhost:3000)
 *   BASE_URL=http://192.168.1.20:3000 npm test
 *
 * It registers a fresh device, sends 3 signals where the 3rd is a duplicate
 * of the 1st, then tries the WebSocket, and finally asks the dashboard API
 * how many signals are stored. Duplicates must not be stored twice.
 */
const WebSocket = require('ws');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const WS_BASE = BASE.replace(/^http/, 'ws');
const TEAM_CODE = process.env.TEAM_CODE || 'BRAVO-TASKFORCE';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';

let failures = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

async function api(method, path, { body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const makeSignal = (id, unit, extra = {}) => ({
  id, unit, type: 'STATUS', priority: 'normal', lat: 34.0522, lon: -118.2437,
  note: 'test', timestamp: Date.now(), status: 'QUEUED', ...extra,
});

(async () => {
  const run = Date.now().toString(36);
  const callsign = `TEST-${run}`.toUpperCase();

  console.log(`\n1. Register ${callsign}`);
  const reg = await api('POST', '/api/register', { body: { callsign, team_code: TEAM_CODE } });
  check('registered (201) and got a device key', reg.status === 201 && !!reg.data.device_key);
  const key = reg.data.device_key;
  const H = { 'X-Device-Key': key };

  console.log('\n2. Send 3 signals over REST (3rd repeats the 1st)');
  const s1 = makeSignal(`t-${run}-1`, callsign);
  const s2 = makeSignal(`t-${run}-2`, callsign, { type: 'HAZARD', priority: 'high' });
  const r1 = await api('POST', '/api/signals', { headers: H, body: s1 });
  const r2 = await api('POST', '/api/signals', { headers: H, body: s2 });
  const r3 = await api('POST', '/api/signals', { headers: H, body: s1 }); // duplicate!
  console.log('   signal 1  ->', JSON.stringify(r1.data.results[0]));
  console.log('   signal 2  ->', JSON.stringify(r2.data.results[0]));
  console.log('   duplicate ->', JSON.stringify(r3.data.results[0]));
  check('signal 1 RECEIVED', r1.data.results[0].status === 'RECEIVED');
  check('signal 2 RECEIVED', r2.data.results[0].status === 'RECEIVED');
  check('duplicate flagged and not re-inserted', r3.data.results[0].duplicate === true);

  console.log('\n3. Bad requests are rejected');
  const bad = await api('POST', '/api/signals', { headers: { 'X-Device-Key': 'dev_x.wrong' }, body: s1 });
  check('bad device key -> 401', bad.status === 401);
  const invalid = await api('POST', '/api/signals', { headers: H, body: makeSignal(`t-${run}-bad`, callsign, { lat: 999 }) });
  check('invalid latitude -> rejected', invalid.data.results[0].status === 'REJECTED');
  const big = await api('POST', '/api/signals', { headers: H, body: makeSignal(`t-${run}-big`, callsign, { photo_thumb: 'A'.repeat(150 * 1024) }) });
  check('oversized photo -> rejected', big.data.results[0].status === 'REJECTED');

  console.log('\n4. WebSocket /ws/field: send a signal, expect an ACK');
  const ack = await new Promise((resolve) => {
    const ws = new WebSocket(`${WS_BASE}/ws/field?key=${encodeURIComponent(key)}`);
    const timer = setTimeout(() => { ws.terminate(); resolve(null); }, 5000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'signal', signal: makeSignal(`t-${run}-3`, callsign, { type: 'SOS' }) })));
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      console.log('   server says ->', JSON.stringify(msg));
      if (msg.type === 'ack') { clearTimeout(timer); ws.close(); resolve(msg); }
    });
    ws.on('error', () => resolve(null));
  });
  check('ACK received for the SOS sent over WebSocket', ack?.id === `t-${run}-3` && ack.status === 'RECEIVED');

  console.log('\n5. Count what the database really holds (dashboard API)');
  const login = await api('POST', '/api/dashboard/login', { body: { username: ADMIN_USER, password: ADMIN_PASSWORD } });
  check('dashboard login works (run `npm run seed` first)', login.status === 200);
  if (login.status === 200) {
    const list = await api('GET', `/api/signals?unit=${callsign}`, { headers: { Authorization: `Bearer ${login.data.token}` } });
    const ids = list.data.map((s) => s.id);
    console.log('   stored ids ->', ids.join(', '));
    check('exactly 3 signals stored (2 REST + 1 WS, duplicate ignored)', ids.length === 3 && new Set(ids).size === 3);
    const sos = list.data.find((s) => s.type === 'SOS');
    check('SOS stored with priority critical', sos?.priority === 'critical');
  }

  console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed - no duplicates.\n');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('\nTest crashed - is the server running?', e.message, '\n'); process.exit(1); });
