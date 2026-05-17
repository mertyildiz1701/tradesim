const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

// GET /api/challenges — all challenges for current user
router.get('/', requireAuth, (req, res) => {
  const uid = req.user.userId;
  const rows = db.prepare(`
    SELECT c.*, u1.username AS sender_username, u2.username AS receiver_username
    FROM challenges c
    JOIN users u1 ON u1.id = c.sender_id
    JOIN users u2 ON u2.id = c.receiver_id
    WHERE c.sender_id = ? OR c.receiver_id = ?
    ORDER BY c.created_at DESC LIMIT 50
  `).all(uid, uid);

  res.json(rows.map(c => {
    const isSender = c.sender_id === uid;
    return {
      id:               c.id,
      senderUsername:   c.sender_username,
      receiverUsername: c.receiver_username,
      style:            c.style,
      status:           c.status,
      isSender,
      // Only reveal sender's trade to receiver after they've completed, or always to sender
      senderTrade:      (isSender || c.status === 'completed') ? JSON.parse(c.sender_trade) : null,
      receiverTrade:    c.receiver_trade ? JSON.parse(c.receiver_trade) : null,
      // Chart data for receiver to trade (only when pending)
      histCandles:      (!isSender && c.status === 'pending') ? JSON.parse(c.hist_candles) : null,
      futCandles:       (!isSender && c.status === 'pending') ? JSON.parse(c.fut_candles)  : null,
      futLen:           c.fut_len,
      createdAt:        c.created_at,
    };
  }));
});

// POST /api/challenges/send/:friendId — send a challenge
router.post('/send/:friendId', requireAuth, (req, res) => {
  const { style, histCandles, futCandles, futLen, senderTrade } = req.body || {};
  if (!style || !histCandles || !futCandles || !senderTrade)
    return res.status(400).json({ error: 'Missing challenge data.' });

  const friendId = parseInt(req.params.friendId, 10);
  if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid friend ID.' });

  const friendship = db.prepare(`
    SELECT id FROM friends
    WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    AND status = 'accepted'
  `).get(req.user.userId, friendId, friendId, req.user.userId);
  if (!friendship) return res.status(403).json({ error: 'You are not friends with this user.' });

  db.prepare(`
    INSERT INTO challenges (sender_id, receiver_id, style, hist_candles, fut_candles, fut_len, sender_trade, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    req.user.userId, friendId, style,
    JSON.stringify(histCandles), JSON.stringify(futCandles),
    futLen ?? 100, JSON.stringify(senderTrade)
  );

  res.json({ ok: true });
});

// POST /api/challenges/:id/respond — receiver submits their trade
router.post('/:id/respond', requireAuth, (req, res) => {
  const { trade } = req.body || {};
  if (!trade) return res.status(400).json({ error: 'Trade data required.' });

  const ch = db.prepare(
    `SELECT * FROM challenges WHERE id = ? AND receiver_id = ? AND status = 'pending'`
  ).get(req.params.id, req.user.userId);
  if (!ch) return res.status(404).json({ error: 'Challenge not found or already completed.' });

  db.prepare(`UPDATE challenges SET receiver_trade = ?, status = 'completed' WHERE id = ?`)
    .run(JSON.stringify(trade), req.params.id);

  const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(ch.sender_id);

  res.json({
    ok: true,
    senderTrade:    JSON.parse(ch.sender_trade),
    senderUsername: sender.username,
  });
});

module.exports = router;
