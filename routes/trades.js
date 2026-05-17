const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM trades WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.userId]
    );
    res.json(result.rows.map(t => ({
      direction: t.direction,
      entry:     parseFloat(t.entry),
      exit:      parseFloat(t.exit_price),
      hit:       t.hit,
      pct:       parseFloat(t.pct),
      tp:        t.tp != null ? parseFloat(t.tp) : null,
      sl:        t.sl != null ? parseFloat(t.sl) : null,
      interval:  t.interval_tf,
      won:       t.won,
      style:     t.style,
      note:      t.note,
      isDaily:   t.is_daily,
      ts:        new Date(t.created_at).getTime(),
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { direction, entry, exit, hit, pct, tp, sl, interval, won, style, note, isDaily } = req.body || {};
  if (!direction || entry == null || !hit)
    return res.status(400).json({ error: 'Missing required fields.' });

  try {
    await db.query(
      `INSERT INTO trades (user_id, direction, entry, exit_price, hit, pct, tp, sl, interval_tf, won, style, note, is_daily)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [req.user.userId, direction, entry, exit ?? 0, hit, pct ?? 0,
       tp ?? null, sl ?? null, interval ?? null, won ?? false, style ?? null,
       note ?? null, isDaily ?? false]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
