const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const db     = require('../db');

const secret = () => process.env.JWT_SECRET || 'tradesim-dev-secret-change-in-production';

function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    const payload = jwt.verify(header.replace('Bearer ', ''), secret());
    if (payload.role !== 'admin') throw new Error('Not admin.');
    next();
  } catch {
    res.status(401).json({ error: 'Admin access required.' });
  }
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!adminPass)
    return res.status(503).json({ error: 'Admin panel not configured — set ADMIN_PASSWORD env var on Railway.' });
  if (username !== adminUser || password !== adminPass)
    return res.status(401).json({ error: 'Invalid admin credentials.' });

  const token = jwt.sign({ role: 'admin', username }, secret(), { expiresIn: '8h' });
  res.json({ token });
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [users, trades, challenges, newToday, activeToday, topTraders] = await Promise.all([
      db.query('SELECT COUNT(*) AS n FROM users'),
      db.query(`SELECT COUNT(*) AS n FROM trades WHERE direction != 'skip'`),
      db.query('SELECT COUNT(*) AS n FROM challenges'),
      db.query(`SELECT COUNT(*) AS n FROM users    WHERE created_at > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(DISTINCT user_id) AS n FROM trades WHERE created_at > NOW() - INTERVAL '24 hours'`),
      db.query(`
        SELECT u.username,
               COUNT(t.id) FILTER (WHERE t.direction != 'skip') AS tc,
               COUNT(t.id) FILTER (WHERE t.won = true) AS wins
        FROM users u LEFT JOIN trades t ON t.user_id = u.id
        GROUP BY u.id, u.username ORDER BY tc DESC LIMIT 5
      `),
    ]);
    res.json({
      totalUsers:       parseInt(users.rows[0].n),
      totalTrades:      parseInt(trades.rows[0].n),
      totalChallenges:  parseInt(challenges.rows[0].n),
      newUsersToday:    parseInt(newToday.rows[0].n),
      activeUsersToday: parseInt(activeToday.rows[0].n),
      topTraders:       topTraders.rows.map(r => ({
        username: r.username,
        trades:   parseInt(r.tc) || 0,
        wins:     parseInt(r.wins) || 0,
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.username, u.created_at,
             COUNT(t.id) FILTER (WHERE t.direction != 'skip') AS trade_count,
             COUNT(t.id) FILTER (WHERE t.won = true)          AS wins,
             MAX(t.created_at) AS last_active
      FROM users u
      LEFT JOIN trades t ON t.user_id = u.id
      GROUP BY u.id, u.username, u.created_at
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows.map(r => ({
      id:          r.id,
      username:    r.username,
      createdAt:   r.created_at,
      tradeCount:  parseInt(r.trade_count) || 0,
      wins:        parseInt(r.wins) || 0,
      winRate:     parseInt(r.trade_count) > 0 ? Math.round(r.wins / r.trade_count * 100) : null,
      lastActive:  r.last_active,
    })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const u = await db.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
    if (!u.rows.length) return res.status(404).json({ error: 'User not found.' });
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ ok: true, username: u.rows[0].username });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/activity
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const [trades, regs] = await Promise.all([
      db.query(`
        SELECT u.username, t.direction, t.pct, t.hit, t.style, t.won, t.created_at
        FROM trades t JOIN users u ON u.id = t.user_id
        WHERE t.direction != 'skip'
        ORDER BY t.created_at DESC LIMIT 40
      `),
      db.query(`SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 15`),
    ]);
    res.json({ recentTrades: trades.rows, recentRegistrations: regs.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
