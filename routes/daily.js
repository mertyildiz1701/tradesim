const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

const ASSETS  = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','ADAUSDT','XRPUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT'];
const STYLES  = ['scalp','swing','longterm'];
const INTERVALS = { scalp:['15m','1h'], swing:['4h','1d'], longterm:['1d','1w'] };

function seededRand(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 0x100000000;
  };
}

function todaySeed() {
  const d = new Date();
  return (d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()) >>> 0;
}

// GET /api/daily — today's config + played status
router.get('/', requireAuth, async (req, res) => {
  try {
    const seed  = todaySeed();
    const rand  = seededRand(seed);

    const assetIdx    = Math.floor(rand() * ASSETS.length);
    const styleIdx    = Math.floor(rand() * STYLES.length);
    const intervalIdx = Math.floor(rand() * 2);
    const histOffset  = 50  + Math.floor(rand() * 150); // 50–199 candles from end → always valid with 500-candle API response

    const style    = STYLES[styleIdx];
    const asset    = ASSETS[assetIdx];
    const interval = INTERVALS[style][intervalIdx];

    const played = await db.query(
      `SELECT id FROM trades WHERE user_id = $1 AND is_daily = true
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [req.user.userId]
    );

    res.json({ seed, asset, style, interval, histOffset, histLen: 100, futLen: 100, alreadyPlayed: played.rows.length > 0 });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/daily/leaderboard — today's results across all users
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.username, t.pct, t.won, t.direction, t.hit,
             (u.id = $1) AS is_you
      FROM trades t JOIN users u ON u.id = t.user_id
      WHERE t.is_daily = true
        AND t.direction != 'skip'
        AND t.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY t.pct DESC LIMIT 25
    `, [req.user.userId]);

    res.json(result.rows.map(r => ({
      username:  r.username,
      pct:       parseFloat(r.pct),
      won:       r.won,
      direction: r.direction,
      hit:       r.hit,
      isYou:     r.is_you,
    })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
