const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

function computeGrade(trades) {
  if (!trades.length) return null;
  const wins   = trades.filter(t => t.won).length;
  const wr     = wins / trades.length * 100;
  const withRR = trades.filter(t => t.tp && t.sl && t.entry && t.tp > 0 && t.sl > 0);
  const avgRR  = withRR.length
    ? withRR.reduce((s, t) => s + Math.abs(t.tp - t.entry) / Math.abs(t.sl - t.entry), 0) / withRR.length
    : null;
  const noSL   = trades.filter(t => !t.sl || t.sl <= 0).length;
  let sc = 0;
  if (wr >= 50) sc += 2; if (wr >= 60) sc++;
  if (avgRR && avgRR >= 1.5) sc += 2; if (avgRR && avgRR >= 2.2) sc++;
  if (noSL === 0) sc += 2;
  return sc >= 9 ? 'A' : sc >= 7 ? 'B' : sc >= 5 ? 'C' : sc >= 3 ? 'D' : 'F';
}

async function tradeStats(userId) {
  const result = await db.query(
    `SELECT won, pct, tp, sl, entry FROM trades WHERE user_id = $1 AND direction != 'skip'`,
    [userId]
  );
  const trades = result.rows.map(t => ({
    won: t.won,
    pct: parseFloat(t.pct),
    tp:  t.tp != null ? parseFloat(t.tp) : null,
    sl:  t.sl != null ? parseFloat(t.sl) : null,
    entry: parseFloat(t.entry),
  }));
  const wins   = trades.filter(t => t.won).length;
  const total  = trades.length;
  const wr     = total > 0 ? Math.round(wins / total * 100) : null;
  const withRR = trades.filter(t => t.tp && t.sl && t.tp > 0 && t.sl > 0);
  const avgRR  = withRR.length
    ? Math.round(withRR.reduce((s, t) => s + Math.abs(t.tp - t.entry) / Math.abs(t.sl - t.entry), 0) / withRR.length * 100) / 100
    : null;
  return { trades, total, wins, losses: total - wins, winRate: wr, avgRR, grade: total > 0 ? computeGrade(trades) : null };
}

// GET /api/friends
router.get('/', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const rows = await db.query(`
      SELECT f.id AS friendship_id,
             CASE WHEN f.requester_id = $1 THEN u2.id       ELSE u1.id       END AS friend_id,
             CASE WHEN f.requester_id = $1 THEN u2.username  ELSE u1.username  END AS username
      FROM friends f
      JOIN users u1 ON u1.id = f.requester_id
      JOIN users u2 ON u2.id = f.addressee_id
      WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
    `, [uid]);

    const result = await Promise.all(rows.rows.map(async f => {
      const stats = await tradeStats(f.friend_id);
      return { friendshipId: f.friendship_id, userId: f.friend_id, username: f.username, ...stats };
    }));

    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/friends/leaderboard
router.get('/leaderboard', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const friendRows = await db.query(`
      SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
      FROM friends WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'accepted'
    `, [uid]);

    const ids = [uid, ...friendRows.rows.map(r => r.friend_id)];
    const board = await Promise.all(ids.map(async id => {
      const user  = await db.query('SELECT username FROM users WHERE id = $1', [id]);
      const stats = await tradeStats(id);
      return { userId: id, username: user.rows[0]?.username, ...stats, isYou: id === uid };
    }));

    board.sort((a, b) => {
      if (a.winRate === null && b.winRate === null) return 0;
      if (a.winRate === null) return 1;
      if (b.winRate === null) return -1;
      return b.winRate - a.winRate;
    });

    res.json(board);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/friends/requests
router.get('/requests', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const incoming = await db.query(`
      SELECT f.id, u.username, f.created_at FROM friends f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = $1 AND f.status = 'pending' ORDER BY f.created_at DESC
    `, [uid]);
    const outgoing = await db.query(`
      SELECT f.id, u.username, f.created_at FROM friends f
      JOIN users u ON u.id = f.addressee_id
      WHERE f.requester_id = $1 AND f.status = 'pending' ORDER BY f.created_at DESC
    `, [uid]);
    res.json({ incoming: incoming.rows, outgoing: outgoing.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/friends/notifications
router.get('/notifications', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const r1 = await db.query(`SELECT COUNT(*) AS n FROM friends    WHERE addressee_id = $1 AND status = 'pending'`,    [uid]);
    const r2 = await db.query(`SELECT COUNT(*) AS n FROM challenges WHERE receiver_id  = $1 AND status = 'pending'`,    [uid]);
    const pr = parseInt(r1.rows[0].n, 10);
    const pc = parseInt(r2.rows[0].n, 10);
    res.json({ pendingRequests: pr, pendingChallenges: pc, total: pr + pc });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/friends/request
router.post('/request', requireAuth, async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username required.' });
  try {
    const target = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found.' });
    const tId = target.rows[0].id;
    if (tId === req.user.userId) return res.status(400).json({ error: "You can't add yourself." });

    const existing = await db.query(`
      SELECT status FROM friends
      WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)
    `, [req.user.userId, tId]);

    if (existing.rows.length) {
      const s = existing.rows[0].status;
      if (s === 'accepted') return res.status(409).json({ error: 'Already friends.' });
      if (s === 'pending')  return res.status(409).json({ error: 'Request already pending.' });
      await db.query(`UPDATE friends SET status='pending', requester_id=$1, addressee_id=$2
                      WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
                     [req.user.userId, tId]);
      return res.json({ ok: true });
    }

    await db.query('INSERT INTO friends (requester_id, addressee_id) VALUES ($1, $2)', [req.user.userId, tId]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/friends/accept/:id
router.post('/accept/:id', requireAuth, async (req, res) => {
  try {
    const row = await db.query(
      `SELECT id FROM friends WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [req.params.id, req.user.userId]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Request not found.' });
    await db.query(`UPDATE friends SET status = 'accepted' WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/friends/decline/:id
router.post('/decline/:id', requireAuth, async (req, res) => {
  try {
    const row = await db.query(
      `SELECT id FROM friends WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [req.params.id, req.user.userId]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Request not found.' });
    await db.query(`UPDATE friends SET status = 'declined' WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/friends/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM friends WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)`,
      [req.params.id, req.user.userId]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
