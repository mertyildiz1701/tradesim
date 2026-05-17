const jwt = require('jsonwebtoken');
const secret = () => process.env.JWT_SECRET || 'tradesim-dev-secret-change-in-production';

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), secret());
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};
