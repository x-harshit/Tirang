'use strict';
/**
 * seed.js - creates demo data:
 *   - 5 field devices (ALPHA-1 ... ECHO-5, team BRAVO-TASKFORCE)
 *   - 1 dashboard user  admin / change-me
 *
 * Run:   npm run seed            (adds what is missing, keeps existing data)
 *        npm run seed -- --reset (wipes the database first, new keys)
 *
 * A device key is only shown once (we store just a hash), so the keys are
 * printed here AND saved to data/demo-device-keys.json for convenience.
 * That file is git-ignored. Delete it when you are done with the demo.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./auth');

const TEAM = 'BRAVO-TASKFORCE';
const CALLSIGNS = ['ALPHA-1', 'BRAVO-2', 'CHARLIE-3', 'DELTA-4', 'ECHO-5'];
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'change-me';

const reset = process.argv.includes('--reset');
if (reset) {
  db.wipeAll();
  console.log('Database wiped.');
}

// Dashboard login (always (re)sets the demo password)
db.upsertUser(ADMIN_USER, auth.hashPassword(ADMIN_PASSWORD));
console.log(`Dashboard user:  ${ADMIN_USER} / ${ADMIN_PASSWORD}   <- change this before real use`);

// Devices
const keysFile = path.join(path.dirname(path.resolve(process.env.DB_PATH || './data/signal-hub.db')), 'demo-device-keys.json');
const keys = reset || !fs.existsSync(keysFile) ? {} : JSON.parse(fs.readFileSync(keysFile, 'utf8'));

console.log('\nDemo devices:');
for (const callsign of CALLSIGNS) {
  if (db.getActiveDeviceByCallsign(callsign)) {
    console.log(`  ${callsign.padEnd(10)} already exists${keys[callsign] ? '  key: ' + keys[callsign] : ' (key not shown again, use --reset for new keys)'}`);
    continue;
  }
  const c = auth.generateDeviceCredentials();
  db.insertDevice({ id: c.id, callsign, keyHash: c.hash, teamCode: TEAM, createdAt: Date.now() });
  keys[callsign] = c.key;
  console.log(`  ${callsign.padEnd(10)} key: ${c.key}`);
}

fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
console.log(`\nKeys saved to ${keysFile}`);
console.log(`Team code for /api/register: ${TEAM}`);
