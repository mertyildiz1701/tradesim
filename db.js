const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trades (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction   TEXT    NOT NULL,
      entry       REAL    NOT NULL,
      exit_price  REAL    NOT NULL,
      hit         TEXT    NOT NULL,
      pct         REAL    NOT NULL,
      tp          REAL,
      sl          REAL,
      interval_tf TEXT,
      won         BOOLEAN,
      style       TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS friends (
      id           SERIAL PRIMARY KEY,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT    NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE(requester_id, addressee_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id             SERIAL PRIMARY KEY,
      sender_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      style          TEXT    NOT NULL,
      hist_candles   TEXT    NOT NULL,
      fut_candles    TEXT    NOT NULL,
      fut_len        INTEGER NOT NULL DEFAULT 100,
      sender_trade   TEXT    NOT NULL,
      receiver_trade TEXT,
      status         TEXT    NOT NULL DEFAULT 'pending',
      created_at     TIMESTAMP DEFAULT NOW()
    );
  `);
}

initDB().catch(err => console.error('DB init error:', err));

module.exports = pool;
