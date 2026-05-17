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
`);

module.exports = db;
