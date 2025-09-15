// server.js
// Simple Express + SQLite license-key admin backend.
//
// Master/admin key (exact):
// S}!?K5:'K?F(K-??Ry!K0M45s7x50MV-;k*

const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { customAlphabet } = require('nanoid');
const path = require('path');
const cors = require('cors');
const util = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===
const MASTER_KEY = "S}!?K5:'K?F(K-??Ry!K0M45s7x50MV-;k*";
// max keys to generate per request
const MAX_GENERATE = 200;

// alphabet for key suffix
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const nano = customAlphabet(ALPHABET, 5);

// === DB ===
const db = new sqlite3.Database(path.join(__dirname, 'keys.db'));
const dbRun = util.promisify(db.run.bind(db));
const dbGet = util.promisify(db.get.bind(db));
const dbAll = util.promisify(db.all.bind(db));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_text TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    lifetime INTEGER DEFAULT 0,
    device_id TEXT,
    used INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER,
    event TEXT,
    device_id TEXT,
    ts INTEGER
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_key_text ON keys(key_text)`);
});

// === Middleware ===
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === Helpers ===
function parseExpiration(input) {
  if (!input) return null;
  const v = String(input).trim().toUpperCase();
  if (v === 'LT' || v === 'L' || v === 'LIFETIME') return null;
  // Support forms like "1H", "12H", "1D"
  const num = parseInt(v.slice(0, -1), 10);
  const unit = v.slice(-1);
  if (isNaN(num)) return null;
  const now = Date.now();
  if (unit === 'H') return now + num * 60 * 60 * 1000;
  if (unit === 'D') return now + num * 24 * 60 * 60 * 1000;
  return null;
}

function generateOneKey() {
  return 'KA-' + nano();
}

// === Routes ===

// Admin login check (master key)
app.post('/api/login', (req, res) => {
  const { master } = req.body || {};
  if (master === MASTER_KEY) return res.json({ ok: true });
  return res.status(401).json({ ok: false, message: 'Wrong master key' });
});

// Generate keys
// body: { master, count, expiration }
app.post('/api/generate', async (req, res) => {
  try {
    const { master, count, expiration } = req.body || {};
    if (master !== MASTER_KEY) return res.status(401).json({ ok: false, message: 'Unauthorized' });

    let n = parseInt(count, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > MAX_GENERATE) n = MAX_GENERATE;

    const expires_at = parseExpiration(expiration); // null => lifetime
    const lifetime = (String(expiration || '').toUpperCase().startsWith('LT')) ? 1 : 0;
    const createdAt = Date.now();

    const created = [];
    for (let i = 0; i < n; i++) {
      let attempts = 0;
      while (attempts < 12) {
        attempts++;
        const k = generateOneKey();
        try {
          await dbRun(
            `INSERT INTO keys (key_text, created_at, expires_at, lifetime) VALUES (?, ?, ?, ?)`,
            [k, createdAt, expires_at, lifetime]
          );
          created.push({
            key: k,
            expires_at: expires_at,
            lifetime: !!lifetime
          });
          break;
        } catch (err) {
          // collision or other constraint; try again
          if (err && err.code === 'SQLITE_CONSTRAINT') {
            continue;
          } else {
            console.error('DB insert error', err);
            return res.status(500).json({ ok: false, message: 'DB error during insert', err: String(err) });
          }
        }
      }
    }

    return res.json({ ok: true, created });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error', err: String(err) });
  }
});

// List keys (admin)
app.post('/api/list', async (req, res) => {
  try {
    const { master } = req.body || {};
    if (master !== MASTER_KEY) return res.status(401).json({ ok: false, message: 'Unauthorized' });
    const rows = await dbAll(`SELECT id, key_text, created_at, expires_at, lifetime, device_id, used FROM keys ORDER BY id DESC`);
    return res.json({ ok: true, rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'DB error', err: String(err) });
  }
});

// Delete key by id (admin)
app.post('/api/delete', async (r
