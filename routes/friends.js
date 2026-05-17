const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../lib/requireAuth');

// Helper: compute grade from trades array
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

// GET /api/friends — accepted friends + their stats
router.get('/', requireAuth, (req, res) => {
  const uid = req.user.userId;
  const rows = db.prepare(`
    SELECT f.id AS friendship_id,
           CASE WHEN f.requester_id = ? THEN u2.id   ELSE u1.id       END AS friend_id,
           CASE WHEN f.requester_id = ? THEN u2.username ELSE u1.username END AS username
    FROM friends f
    JOIN users u1 ON u1.id = f.requester_id
    JOIN users u2 ON u2.id = f.addressee_id
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
  `).all(uid, uid, uid, uid);

  const result = rows.map(f => {
    const trades = db.prepare(
      `SELECT won, pct, tp, sl, entry FROM trades WHERE user_id = ? AND direction != 'skip'`
    ).all(f.friend_id);
    const wins   = trades.filter(t => t.won).length;
    const total  = trades.length;
    const wr     = total > 0 ? Math.round(wins / total * 100) : null;
    const withRR = trades.filter(t => t.tp && t.sl && t.tp > 0 && t.sl > 0);
    const avgRR  = withRR.length
      ? Math.round(withRR.reduce((s, t) => s + Math.abs(t.tp - t.entry) / Math.abs(t.sl - t.entry), 0) / withRR.length * 100) / 100
      : null;
    return {
      friendshipId: f.friendship_id,
      userId:       f.friend_id,
      username:     f.username,
      totalTrades:  total,
      wins, losses: total - wins,
      winRate:      wr,
      avgRR,
      grade:        total > 0 ? computeGrade(trades) : null,
    };
  });

  res.json(result);
});

// GET /api/friends/leaderboard — you + all friends ranked
router.get('/leaderboard', requireAuth, (req, res) => {
  const uid = req.user.userId;

  // Collect IDs: self + friends
  const friendRows = db.prepare(`
    SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS friend_id
    FROM friends WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
  `).all(uid, uid, uid);
  const ids = [uid, ...friendRows.map(r => r.friend_id)];

  const board = ids.map(id => {
    const user   = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
    const trades = db.prepare(
      `SELECT won, pct, tp, sl, entry FROM trades WHERE user_id = ? AND direction != 'skip'`
    ).all(id);
    const wins   = trades.filter(t => t.won).length;
    const total  = trades.length;
    const wr     = total >= 5 ? Math.round(wins / total * 100) : null;
    const withRR = trades.filter(t => t.tp && t.sl && t.tp > 0 && t.sl > 0);
    const avgRR  = withRR.length
      ? Math.round(withRR.reduce((s, t) => s + Math.abs(t.tp - t.entry) / Math.abs(t.sl - t.entry), 0) / withRR.length * 100) / 100
      : null;
    return {
      userId: id, username: user.username,
      totalTrades: total, wins, losses: total - wins,
      winRate: wr, avgRR,
      grade: total >= 5 ? computeGrade(trades) : null,
      isYou: id === uid,
    };
  });

  // Sort: ranked users first (by win rate), then unranked
  board.sort((a, b) => {
    if (a.winRate === null && b.winRate === null) return 0;
    if (a.winRate === null) return 1;
    if (b.winRate === null) return -1;
    return b.winRate - a.winRate;
  });

  res.json(board);
});

// GET /api/friends/requests — pending incoming + outgoing
router.get('/requests', requireAuth, (req, res) => {
  const uid = req.user.userId;
  const incoming = db.prepare(`
    SELECT f.id, u.username, f.created_at FROM friends f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC
  `).all(uid);
  const outgoing = db.prepare(`
    SELECT f.id, u.username, f.created_at FROM friends f
    JOIN users u ON u.id = f.addressee_id
    WHERE f.requester_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC
  `).all(uid);
  res.json({ incoming, outgoing });
});

// GET /api/friends/notifications — badge counts
router.get('/notifications', requireAuth, (req, res) => {
  const uid = req.user.userId;
  const pendingRequests   = db.prepare(
    `SELECT COUNT(*) AS n FROM friends WHERE addressee_id = ? AND status = 'pending'`
  ).get(uid).n;
  const pendingChallenges = db.prepare(
    `SELECT COUNT(*) AS n FROM challenges WHERE receiver_id = ? AND status = 'pending'`
  ).get(uid).n;
  res.json({ pendingRequests, pendingChallenges, total: pendingRequests + pendingChallenges });
});

// POST /api/friends/request — send request by username
router.post('/request', requireAuth, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username required.' });
  const target = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.userId) return res.status(400).json({ error: "You can't add yourself." });
  const existing = db.prepare(`
    SELECT status FROM friends
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(req.user.userId, target.id, target.id, req.user.userId);
  if (existing) {
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends.' });
    if (existing.status === 'pending')  return res.status(409).json({ error: 'Request already sent or pending.' });
    // declined → allow re-request by updating
    db.prepare(`UPDATE friends SET status='pending', requester_id=?, addressee_id=?
                WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`)
      .run(req.user.userId, target.id, req.user.userId, target.id, target.id, req.user.userId);
    return res.json({ ok: true });
  }
  db.prepare('INSERT INTO friends (requester_id, addressee_id) VALUES (?, ?)').run(req.user.userId, target.id);
  res.json({ ok: true });
});

// POST /api/friends/accept/:id
router.post('/accept/:id', requireAuth, (req, res) => {
  const row = db.prepare(
    `SELECT id FROM friends WHERE id = ? AND addressee_id = ? AND status = 'pending'`
  ).get(req.params.id, req.user.userId);
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  db.prepare(`UPDATE friends SET status = 'accepted' WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// POST /api/friends/decline/:id
router.post('/decline/:id', requireAuth, (req, res) => {
  const row = db.prepare(
    `SELECT id FROM friends WHERE id = ? AND addressee_id = ? AND status = 'pending'`
  ).get(req.params.id, req.user.userId);
  if (!row) return res.status(404).json({ error: 'Request not found.' });
  db.prepare(`UPDATE friends SET status = 'declined' WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/friends/:id — remove friendship
router.delete('/:id', requireAuth, (req, res) => {
  db.prepare(
    `DELETE FROM friends WHERE id = ? AND (requester_id = ? OR addressee_id = ?)`
  ).run(req.params.id, req.user.userId, req.user.userId);
  res.json({ ok: true });
});

module.exports = router;
