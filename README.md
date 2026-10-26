# signal-hub

A small Node.js backend that connects a **Field App** (many phones) to a **Command Dashboard** (one or a few browsers).

- **Express** for REST, **ws** for WebSockets, **better-sqlite3** for storage
- Signals are stored once, even if a phone retries (idempotent by signal ID)
- Orders are pushed live and re-delivered on reconnect until the phone confirms them
- Dashboards get every signal, position, online/offline change and order status live

```
 Phones (Field App)                      signal-hub                       Browsers (Dashboard)
 ──────────────────                      ──────────                       ────────────────────
 POST /api/signals  ───────────────►  validate → save → ACK  ──────────►  ws: signal, position,
 ws /ws/field  ◄────── orders, ACKs ─  update unit status                    unit_status, order_status
                                       ◄──── POST /api/orders, /signals/:id/ack, ws /ws/dashboard
```

## Files

| File | Purpose |
|---|---|
| `server.js` | HTTP + WebSocket setup, heartbeat, startup banner |
| `db.js` | SQLite schema and every query |
| `auth.js` | Device keys, dashboard login (bcrypt + JWT), rate limiting |
| `routes.js` | All REST endpoints |
| `hub.js` | Shared real-time logic: validation, ingest, broadcast, orders, unit status *(extra file used by both `server.js` and `routes.js`)* |
| `seed.js` | Creates 5 demo devices and the `admin` login |
| `test-client.js` | End-to-end test that proves duplicates are not stored |

## Install and run

Requires **Node.js 18 or newer** (a C++ toolchain is only needed if `better-sqlite3` has no prebuilt binary for your platform).

```bash
npm install
cp .env.example .env          # then edit .env and set JWT_SECRET
npm run seed                  # 5 demo devices + login  admin / change-me
npm start
```

Generate a good secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

On start the server prints the addresses phones should use:

```
signal-hub listening on 0.0.0.0:3000
  This machine:   http://localhost:3000
  From phones:    http://192.168.1.20:3000   (ws://192.168.1.20:3000/ws/field?key=...)
```

### Run the test

With the server running (and `npm run seed` done once):

```bash
npm test
# or against another machine:  BASE_URL=http://192.168.1.20:3000 npm test
```

It registers a new device, sends 3 signals where the 3rd is a duplicate of the 1st, sends an SOS over the WebSocket, then asks the API what is stored. Expected: `All checks passed - no duplicates.`

### Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Listening port |
| `HOST` | `0.0.0.0` | Bind address. `0.0.0.0` = reachable by phones |
| `JWT_SECRET` | *(required)* | Signs dashboard tokens |
| `DB_PATH` | `./data/signal-hub.db` | SQLite file |
| `TEAM_CODES` | *(empty)* | Comma-separated codes allowed to `/api/register`. Empty = accept any |
| `NO_CONTACT_MINUTES` | `10` | Silence before a unit is `NO_CONTACT` |
| `RATE_LIMIT_PER_MIN` | `120` | Signals per device per minute (bursts allowed) |
| `CORS_ORIGIN` | `*` | Allowed browser origin(s) |
| `TRUST_PROXY` | `false` | Set `true` behind nginx/Caddy so client IPs are right |
| `TLS_KEY_PATH`, `TLS_CERT_PATH` | *(empty)* | Enable built-in HTTPS/WSS |

## Finding the server's local IP (so phones can connect)

The phones and the server must be on the **same network** (Wi-Fi, or a phone hotspot / travel router). The startup banner lists the addresses; or look it up:

| System | Command |
|---|---|
| Windows | `ipconfig` → "IPv4 Address" of your Wi-Fi adapter |
| macOS | `ipconfig getifaddr en0` (Wi-Fi is usually `en0`) |
| Linux | `hostname -I` or `ip -4 addr` |
| Raspberry Pi / Termux | `hostname -I` / `ifconfig` |

Typical results look like `192.168.x.x`, `10.x.x.x` or `172.16-31.x.x` (a phone hotspot often gives `192.168.43.x` or `172.20.10.x`). Then:

1. From a phone's browser, open `http://<that-ip>:3000/health`. You should see `{"ok":true,...}`.
2. If it does not load: the server's **firewall** is probably blocking port 3000 (allow it, e.g. Windows "Allow an app through firewall", `sudo ufw allow 3000`), or the Wi-Fi has "client/AP isolation" on (turn it off, or use a hotspot).
3. Use that IP as the server address in the Field App and the Dashboard. Never use `localhost` on a phone: that means the phone itself.

## HTTPS / TLS (important for phones)

The server speaks plain HTTP by default, which is fine for a quick test. For real use over a local network you want TLS, and for a **PWA on phones it is usually required**: browsers only allow GPS (`geolocation`), service workers and "install to home screen" on **secure origins** (HTTPS, or `localhost`). Plain `http://192.168.x.x` will not get GPS in most mobile browsers.

When the app is served over HTTPS it must call the API over `https://` and sockets over `wss://` (browsers block mixed content).

**Option A: reverse proxy (recommended).** Caddy gets you HTTPS with one file. `Caddyfile`:

```
signal-hub.local {
    tls internal            # Caddy's own local CA; install its root cert on the phones
    reverse_proxy localhost:3000
}
```

Set `TRUST_PROXY=true` in `.env`. WebSockets are proxied automatically. With nginx, add `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` to the location block.

**Option B: self-signed certificate directly in Node.**

```bash
mkdir certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=signal-hub" -addext "subjectAltName=IP:192.168.1.20"   # your server IP
```

Then set `TLS_KEY_PATH=./certs/key.pem` and `TLS_CERT_PATH=./certs/cert.pem`. Each phone must trust the certificate (install `cert.pem` as a trusted CA, or open the URL once and accept the warning), otherwise `wss://` connections fail silently.

Note: WebSocket `?key=` and `?token=` appear in the URL, so on a non-TLS network they travel in clear text. Another reason to use TLS.

## Security notes (MVP level)

- **Device keys** are random, shown **once** at registration, and stored only as `salt:sha256(salt+key)`. Checked against the database on every request, so revocation is immediate.
- **Dashboard passwords** are bcrypt hashes; login returns a 12-hour JWT. Login and registration are rate limited per IP.
- **Signals** must come from the device that owns the `unit` callsign (no spoofing other units), photos are capped at 100 KB, and each device is rate limited.
- All dashboard users are admins in this MVP. Change `admin / change-me` before real use.
- Notes and callsigns are user input. Escape them when rendering in the dashboard (the CSV export already neutralises spreadsheet formulas).

---

## API reference

All bodies are JSON. Timestamps are epoch milliseconds. Errors look like `{ "error": "message" }`.

### Signal format

```json
{ "id": "sig-1730000000-ab12", "unit": "ALPHA-1", "type": "STATUS", "priority": "normal",
  "lat": 34.0522, "lon": -118.2437, "note": "In position", "timestamp": 1730000000000,
  "status": "QUEUED", "subType": "IN POSITION", "photo_thumb": "<optional base64 <=100KB>", "battery": 78 }
```

| Field | Rules |
|---|---|
| `id` | Required, client-generated, unique, 1-100 chars `[A-Za-z0-9_.:-]` |
| `unit` | Required, must equal the device's callsign |
| `type` | `SOS` `STATUS` `HAZARD` `CONTACT` `CASUALTY` `SUPPLY` `BEACON` (also `ACK`, see below) |
| `priority` | `critical` `high` `normal` (`urgent` is accepted as `high`). **`SOS` is always stored as `critical`** |
| `lat`, `lon` | Numbers in range |
| `timestamp` | Epoch ms (or ISO string); not more than 24 h in the future |
| `note` | Optional, max 1000 chars |
| `photo_thumb` | Optional base64 (a `data:...;base64,` prefix is fine), max 100 KB decoded |
| `subType`, `battery` | Optional extras the Field App uses (`"MOVING"`, 0-100) |
| `status` | Sent by the phone but ignored; the server sets `RECEIVED`, later `ACKNOWLEDGED` |

`ACK` signals: the Field App confirms an order by sending `type: "ACK"` with `#XXXXXX` (last 6 characters of the order id) in the note. The server uses that to mark the order `READ`.

### Field App endpoints

Authenticate with the header `X-Device-Key: <device_key>`.

| Method & path | Description |
|---|---|
| `POST /api/register` | Body `{ "callsign", "team_code" }`. Returns `201 { device_id, callsign, team_code, device_key }`. **Save the key, it is not shown again.** `403` wrong team code, `409` callsign already active. |
| `POST /api/signals` | Body: one signal **or an array** (max 100, for queue flush). Idempotent. Returns `{ "results": [ { "id", "status", "duplicate?", "error?" } ] }`, status is `RECEIVED`, `ACKNOWLEDGED` (a retry of an already-acknowledged signal) or `REJECTED`. `200` if any accepted, `400` if all rejected, `401` bad key, `403` revoked, `429` rate limited. |
| `GET /api/orders?unit=CALLSIGN` | Pending orders for the unit (must be the key's own callsign). Returned orders are marked `DELIVERED`. Polling fallback. |
| `POST /api/orders/:id/read` | Mark an order `READ` (REST alternative to the ACK signal / WebSocket message). |
| `WS /ws/field?key=DEVICE_KEY` | Live channel, see below. |

### Dashboard endpoints

Authenticate with `Authorization: Bearer <token>`.

| Method & path | Description |
|---|---|
| `POST /api/dashboard/login` | `{ username, password }` → `{ token, expires_in, username }` |
| `GET /api/signals?unit=&type=&from=&to=&limit=&offset=&photos=1` | History, newest first. `from`/`to` accept epoch ms or ISO dates. Default limit 500 (max 5000). Photos only included with `photos=1`. |
| `GET /api/units` | All units: `callsign, status (ACTIVE / SOS / NO_CONTACT), online, no_contact, last_seen, battery, last_position {lat, lon, timestamp}` |
| `GET /api/positions?unit=&from=&to=&limit=` | GPS trail points for a unit, newest first |
| `POST /api/signals/:id/ack` | Acknowledge a signal; the sending phone gets `ACKNOWLEDGED` live |
| `POST /api/orders` | `{ "target_unit": "ALPHA-1" or "ALL", "text", "title?", "priority?": "NORMAL"/"URGENT" }` → `201` order, pushed live |
| `GET /api/orders?unit=` | Order history |
| `GET /api/export.csv` | Full signal log as CSV. A browser link can pass `?token=<jwt>` |
| `GET /api/devices` | Admin: all devices (never includes key hashes) |
| `POST /api/devices/:id/revoke` | Admin: key rejected immediately, live sockets closed (`4001`) |
| `WS /ws/dashboard?token=JWT` | Live feed, see below |
| `GET /health` | Open health check |

### WebSocket protocol

All messages are JSON with a `type`. The server pings every 20 s; clients that miss a ping are dropped (browsers and `ws` answer pings automatically).

**`/ws/field`** (phone ⇄ server)

| Direction | Message |
|---|---|
| server → phone | `{ type: "hello", unit, serverTime }` on connect |
| phone → server | `{ type: "signal", signal: {...} }` or `{ type: "signals", signals: [...] }` |
| server → phone | `{ type: "ack", id, status: "RECEIVED", duplicate? }` one per signal id, or `{ type: "error", id, error }` for a rejected one |
| server → phone | `{ type: "signal_status", id, status: "ACKNOWLEDGED" }` when a dashboard acknowledges (also re-sent on reconnect for recent ones) |
| server → phone | `{ type: "order", order: { id, sender, title, message, priority, timestamp, ... } }` live, and again on reconnect until confirmed |
| phone → server | `{ type: "order_delivered", orderId }` then later `{ type: "order_read", orderId }` |

**`/ws/dashboard`** (server → browser)

| Message | Meaning |
|---|---|
| `snapshot { units }` | Sent once on connect: current state of every unit |
| `signal { signal }` | New signal (SOS signals are sent first within a batch) |
| `position { unit, lat, lon, timestamp }` | New position for trails |
| `unit_status { unit }` | A unit changed status (`ACTIVE`/`SOS`/`NO_CONTACT`) or went online/offline |
| `signal_status { id, unit, status }` | A signal was acknowledged |
| `order_status { orderId, unit, status, orderStatus, order? }` | `SENT` → `DELIVERED` → `READ` (per unit; `orderStatus` is the highest reached by any recipient) |
| `device_revoked { unit, id }` | A device was revoked |

### Behaviour summary

- **Idempotency:** a signal id that already exists is never inserted again (and not re-broadcast); the response marks it `duplicate: true` with its current status. If a different unit already used that id it is rejected.
- **Unit status** is computed from `last_seen` and open SOS signals, checked every 10 s and broadcast only when it changes. `NO_CONTACT` = nothing received for 10 minutes. An unacknowledged SOS shows as `SOS` until acknowledged.
- **Orders to `ALL`** are delivered to every unit; each unit has its own `DELIVERED`/`READ` state. Orders older than 24 h are not re-sent to reconnecting phones.
- **Logs:** one line per connection, signal, order, login and rejection.

## Connecting the two apps in this project

The Field App (`transport.ts`) currently simulates the server with timers and a `BroadcastChannel`. To use signal-hub, `sendSignal()` should `POST /api/signals` (or send over `/ws/field`) and set the status from the response, and the order listener should be fed from the WebSocket `order` messages. A few things to align:

- The Field App's signal types are `SOS`, `STATUS`, `BEACON` and `ACK`. The spec's `HAZARD`, `CONTACT`, `CASUALTY`, `SUPPLY` are accepted by the server and need adding to the app's `SignalType`.
- The mock Command Dashboard uses different type names (`SOS_ALERT`, `MOVING`, `POSITION_REPORT`, ...) and `ACK` as a signal status. The server follows the spec's types; use `subType` for things like `MOVING`, and map `SOS_ALERT` → `SOS` in the dashboard.
- Device keys come from `/api/register`, so the Field App's settings screen (callsign + team code) is where registration should happen; store the returned key on the phone.

## Housekeeping and limits

- Every signal adds a row to `positions` (the trail). For long deployments, prune old rows periodically.
- The rate limiter and unit-status cache live in memory, so run a single server process.
- `GET /api/export.csv` streams the whole table; fine for tens of thousands of rows.
- `data/demo-device-keys.json` (written by `seed.js`) contains real keys. It is git-ignored; delete it when done.
