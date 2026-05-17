const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.user.userId);

  res.json(rows.map(t => ({
    direction: t.direction,
    entry:     t.entry,
    exit:      t.exit_price,
    hit:       t.hit,
    pct:       t.pct,
    tp:        t.tp,
    sl:        t.sl,
    interval:  t.interval_tf,
    won:       t.won === 1,
    style:     t.style,
    ts:        new Date(t.created_at).getTime(),
  })));
});

router.post('/', requireAuth, (req, res) => {
  const { direction, entry, exit, hit, pct, tp, sl, interval, won, style } = req.body || {};
  if (!direction || entry == null || !hit)
    return res.status(400).json({ error: 'Missing required fields.' });

  db.prepare(`
    INSERT INTO trades (user_id, direction, entry, exit_price, hit, pct, tp, sl, interval_tf, won, style)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.userId, direction, entry, exit ?? 0, hit, pct ?? 0,
         tp ?? null, sl ?? null, interval ?? null, won ? 1 : 0, style ?? null);

  res.json({ ok: true });
});

module.exports = router;
