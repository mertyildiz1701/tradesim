const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'tradesim.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction   TEXT    NOT NULL,
    entry       REAL    NOT NULL,
    exit_price  REAL    NOT NULL,
    hit         TEXT    NOT NULL,
    pct         REAL    NOT NULL,
    tp          REAL,
    sl          REAL,
    interval_tf TEXT,
    won         INTEGER,
    style       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS friends (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT    NOT NULL DEFAULT 'pending',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    style          TEXT    NOT NULL,
    hist_candles   TEXT    NOT NULL,
    fut_candles    TEXT    NOT NULL,
    fut_len        INTEGER NOT NULL DEFAULT 100,
    sender_trade   TEXT    NOT NULL,
    receiver_trade TEXT,
    status         TEXT    NOT NULL DEFAULT 'pending',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
