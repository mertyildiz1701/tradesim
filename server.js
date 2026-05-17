require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/trades',     require('./routes/trades'));
app.use('/api/friends',    require('./routes/friends'));
app.use('/api/challenges', require('./routes/challenges'));
app.use('/api/admin',      require('./routes/admin'));

// Admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 TradeSim running → http://localhost:${PORT}\n`);
});
