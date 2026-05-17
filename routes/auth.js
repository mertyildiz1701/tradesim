const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../db');

const secret = () => process.env.JWT_SECRET || 'tradesim-dev-secret-change-in-production';
const sign   = payload => jwt.sign(payload, secret(), { expiresIn: '30d' });

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || username.trim().length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  if (!password || password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });

  const clean = username.trim();
  try {
    const exists = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [clean]);
    if (exists.rows.length) return res.status(409).json({ error: 'Username already taken — try signing in.' });

    const hash   = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [clean, hash]
    );
    const token = sign({ userId: result.rows[0].id, username: clean });
    res.json({ token, username: clean });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error — try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Enter username and password.' });

  try {
    const result = await db.query(
      'SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1)',
      [username.trim()]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'No account found with that username.' });

    const user = result.rows[0];
    const ok   = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong password.' });

    const token = sign({ userId: user.id, username: user.username });
    res.json({ token, username: user.username });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error — try again.' });
  }
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token.' });
  try {
    const payload = jwt.verify(header.replace('Bearer ', ''), secret());
    res.json({ username: payload.username });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
