/**
 * SkyCall - simple signaling server with REST auth
 * Run: npm install && npm start
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Simple SQLite DB
const dbPath = path.join(__dirname, 'db.sqlite');
const db = new Database(dbPath);
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT,
  displayName TEXT
)`).run();

// helper
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'No token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch(e){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// REST API
app.post('/api/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'username & password required' });
  const id = uuidv4();
  const hashed = await bcrypt.hash(password, 10);
  try {
    db.prepare('INSERT INTO users (id, username, password, displayName) VALUES (?, ?, ?, ?)').run(id, username, hashed, displayName || username);
    const user = { id, username, displayName: displayName || username };
    const token = generateToken(user);
    return res.json({ user, token });
  } catch(e){
    return res.status(400).json({ error: 'Username already taken' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'username & password required' });
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if(!row) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, row.password);
  if(!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const user = { id: row.id, username: row.username, displayName: row.displayName };
  const token = generateToken(user);
  return res.json({ user, token });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, username, displayName FROM users WHERE id = ?').get(req.user.id);
  if(!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: row });
});

app.get('/api/users', authMiddleware, (req, res) => {
  const q = (req.query.q || '').trim();
  if(!q) return res.json({ users: [] });
  const rows = db.prepare("SELECT id, username, displayName FROM users WHERE username LIKE ? OR displayName LIKE ? LIMIT 20")
    .all(`%${q}%`, `%${q}%`);
  res.json({ users: rows });
});

// Serve static client if present
app.use(express.static(path.join(__dirname, '../client/dist')));

// Socket.io signaling
const socketsByUser = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if(!token) return next(new Error('Unauthorized'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    next();
  } catch(e){
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log('socket connect', socket.user.username);
  socketsByUser.set(socket.user.id, socket);

  socket.on('call:offer', ({ to, offer, meta }) => {
    const toSock = socketsByUser.get(to);
    if(!toSock) {
      socket.emit('call:failed', { reason: 'User offline' });
      return;
    }
    // send incoming call to callee with from info and metadata
    toSock.emit('call:incoming', { from: socket.user.id, fromName: socket.user.username, offer, meta });
  });

  socket.on('call:answer', ({ to, answer }) => {
    const toSock = socketsByUser.get(to);
    if(toSock) toSock.emit('call:answered', { from: socket.user.id, answer });
  });

  socket.on('call:reject', ({ to, reason }) => {
    const toSock = socketsByUser.get(to);
    if(toSock) toSock.emit('call:rejected', { from: socket.user.id, reason });
  });

  socket.on('signal', ({ to, data }) => {
    const toSock = socketsByUser.get(to);
    if(toSock) toSock.emit('signal', { from: socket.user.id, data });
  });

  socket.on('disconnect', () => {
    socketsByUser.delete(socket.user.id);
    console.log('socket disconnect', socket.user.username);
  });
});

server.listen(PORT, () => {
  console.log(`SkyCall signaling server listening on ${PORT}`);
});