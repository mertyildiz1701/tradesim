const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

// GET /api/achievements
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT code, unlocked_at FROM achievements WHERE user_id = $1 ORDER BY unlocked_at ASC',
      [req.user.userId]
    );
    res.json(result.rows.map(r => ({ code: r.code, unlockedAt: r.unlocked_at })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/achievements — unlock (idempotent)
router.post('/', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code required.' });
  try {
    const r = await db.query(
      `INSERT INTO achievements (user_id, code) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING id`,
      [req.user.userId, code]
    );
    res.json({ ok: true, new: r.rows.length > 0 });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
