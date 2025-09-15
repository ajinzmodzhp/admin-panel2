// Simple key management server
require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const Database = require('better-sqlite3')
const { v4: uuidv4 } = require('uuid')
const path = require('path')

const PORT = process.env.PORT || 3000
const MASTER_KEY = process.env.MASTER_KEY || "S}!?K5:'K?F(K-??Ry!K0M45s7x50MV-;k*"

const db = new Database(path.join(__dirname, 'keys.db'))

// initialize DB
db.prepare(`CREATE TABLE IF NOT EXISTS keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  device_id TEXT,
  used_at INTEGER
)`).run()

const app = express()
app.use(cors())
app.use(bodyParser.json())

// helpers
function makeKey() {
  // format: KA-xxxxx where x are upper letters+numbers
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i=0;i<5;i++) s += chars[Math.floor(Math.random()*chars.length)]
  return `KA-${s}`
}

function parseExpiryToken(tok) {
  if (!tok) return null
  tok = tok.toUpperCase().trim()
  if (tok === 'LT') return null
  const m = tok.match(/^(\d+)([DH])$/)
  if (!m) return null
  const n = parseInt(m[1],10)
  const unit = m[2]
  const now = Math.floor(Date.now()/1000)
  if (unit === 'H') return now + n*3600
  if (unit === 'D') return now + n*86400
  return null
}

// Admin login (master key check)
app.post('/api/admin/login', (req,res)=>{
  const {master} = req.body
  if (master === MASTER_KEY) return res.json({ok:true})
  return res.status(401).json({ok:false,err:'Wrong master key'})
})

// List keys
app.get('/api/keys', (req,res)=>{
  const rows = db.prepare('SELECT id,key,expires_at,created_at,device_id,used_at FROM keys ORDER BY created_at DESC').all()
  res.json(rows)
})

// Generate keys
app.post('/api/keys', (req,res)=>{
  const {count, expiryToken, master} = req.body
  if (master !== MASTER_KEY) return res.status(401).json({ok:false,err:'Unauthorized'})
  const n = Math.max(1,Math.min(100, parseInt(count)||1))
  const expires_at = parseExpiryToken(expiryToken) // null for LT
  const insert = db.prepare('INSERT INTO keys(key,expires_at,created_at) VALUES(?,?,?)')
  const now = Math.floor(Date.now()/1000)
  const created = []
  for (let i=0;i<n;i++){
    let k
    do { k = makeKey() } while (db.prepare('SELECT 1 FROM keys WHERE key = ?').get(k))
    insert.run(k, expires_at, now)
    created.push({key:k,expires_at})
  }
  res.json({ok:true,created})
})

// Delete a key
app.delete('/api/keys/:key', (req,res)=>{
  const {master} = req.body
  if (master !== MASTER_KEY) return res.status(401).json({ok:false,err:'Unauthorized'})
  const key = req.params.key
  const info = db.prepare('SELECT id FROM keys WHERE key = ?').get(key)
  if (!info) return res.status(404).json({ok:false,err:'Not found'})
  db.prepare('DELETE FROM keys WHERE key = ?').run(key)
  res.json({ok:true})
})

// Validate key (client calls this). Also enforces single-device usage.
app.post('/api/validate', (req,res)=>{
  const {key, device_id} = req.body
  if (!key) return res.status(400).json({ok:false,err:'No key'})
  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(key)
  if (!row) return res.status(404).json({ok:false,err:'Key not found'})
  const now = Math.floor(Date.now()/1000)
  if (row.expires_at && now > row.expires_at) return res.status(403).json({ok:false,err:'Expired'})
  if (!row.device_id) {
    // claim key for this device
    db.prepare('UPDATE keys SET device_id = ?, used_at = ? WHERE key = ?').run(device_id, now, key)
    return res.json({ok:true,claimed:true})
  }
  if (row.device_id === device_id) {
    // allowed
    return res.json({ok:true,claimed:false})
  }
  // already claimed by another device
  return res.status(403).json({ok:false,err:'Key already used on another device'})
})

// Basic statistics
app.get('/api/stats', (req,res)=>{
  const total = db.prepare('SELECT COUNT(*) AS c FROM keys').get().c
  const active = db.prepare('SELECT COUNT(*) AS c FROM keys WHERE (expires_at IS NULL OR expires_at > ?)').get(Math.floor(Date.now()/1000)).c
  const used = db.prepare('SELECT COUNT(*) AS c FROM keys WHERE device_id IS NOT NULL').get().c
  res.json({total,active,used})
})

app.listen(PORT, ()=>{
  console.log('Key server running on port', PORT)
})
