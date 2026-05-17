const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

// GET /api/challenges
router.get('/', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const result = await db.query(`
      SELECT c.*, u1.username AS sender_username, u2.username AS receiver_username
      FROM challenges c
      JOIN users u1 ON u1.id = c.sender_id
      JOIN users u2 ON u2.id = c.receiver_id
      WHERE c.sender_id = $1 OR c.receiver_id = $1
      ORDER BY c.created_at DESC LIMIT 50
    `, [uid]);

    res.json(result.rows.map(c => {
      const isSender = c.sender_id === uid;
      return {
        id:               c.id,
        senderUsername:   c.sender_username,
        receiverUsername: c.receiver_username,
        style:            c.style,
        status:           c.status,
        isSender,
        senderTrade:   (isSender || c.status === 'completed') ? JSON.parse(c.sender_trade) : null,
        receiverTrade: c.receiver_trade ? JSON.parse(c.receiver_trade) : null,
        histCandles:   (!isSender && c.status === 'pending') ? JSON.parse(c.hist_candles) : null,
        futCandles:    (!isSender && c.status === 'pending') ? JSON.parse(c.fut_candles)  : null,
        futLen:        c.fut_len,
        createdAt:     c.created_at,
      };
    }));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/challenges/send/:friendId
router.post('/send/:friendId', requireAuth, async (req, res) => {
  const { style, histCandles, futCandles, futLen, senderTrade } = req.body || {};
  if (!style || !histCandles || !futCandles || !senderTrade)
    return res.status(400).json({ error: 'Missing challenge data.' });

  const friendId = parseInt(req.params.friendId, 10);
  if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid friend ID.' });

  try {
    const friendship = await db.query(`
      SELECT id FROM friends
      WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
      AND status = 'accepted'
    `, [req.user.userId, friendId]);
    if (!friendship.rows.length) return res.status(403).json({ error: 'You are not friends with this user.' });

    await db.query(`
      INSERT INTO challenges (sender_id, receiver_id, style, hist_candles, fut_candles, fut_len, sender_trade, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    `, [
      req.user.userId, friendId, style,
      JSON.stringify(histCandles), JSON.stringify(futCandles),
      futLen ?? 100, JSON.stringify(senderTrade),
    ]);

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/challenges/:id/respond
router.post('/:id/respond', requireAuth, async (req, res) => {
  const { trade } = req.body || {};
  if (!trade) return res.status(400).json({ error: 'Trade data required.' });

  try {
    const ch = await db.query(
      `SELECT * FROM challenges WHERE id = $1 AND receiver_id = $2 AND status = 'pending'`,
      [req.params.id, req.user.userId]
    );
    if (!ch.rows.length) return res.status(404).json({ error: 'Challenge not found or already completed.' });

    await db.query(
      `UPDATE challenges SET receiver_trade = $1, status = 'completed' WHERE id = $2`,
      [JSON.stringify(trade), req.params.id]
    );

    const sender = await db.query('SELECT username FROM users WHERE id = $1', [ch.rows[0].sender_id]);
    res.json({
      ok: true,
      senderTrade:    JSON.parse(ch.rows[0].sender_trade),
      senderUsername: sender.rows[0]?.username,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
