// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// ----------------- База данных -----------------
const db = new sqlite3.Database('data.db', (err) => {
  if (err) console.error("Ошибка открытия БД:", err.message);
  else console.log("База данных открыта!");
});

// Создаём таблицу пользователей, если не существует
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

// ----------------- Регистрация / Логин -----------------
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function(err) {
    if (err) return res.status(400).json({ error: "Пользователь уже существует" });
    const token = jwt.sign({ id: this.lastID }, process.env.JWT_SECRET);
    res.json({ token });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ error: "Неверные данные" });
    const token = jwt.sign({ id: row.id }, process.env.JWT_SECRET);
    res.json({ token });
  });
});

// ----------------- Socket.IO звонки -----------------
io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.id);

  socket.on('call-user', (data) => {
    io.to(data.to).emit('incoming-call', { from: socket.id });
  });

  socket.on('accept-call', (data) => {
    io.to(data.to).emit('call-accepted', { from: socket.id });
  });

  socket.on('reject-call', (data) => {
    io.to(data.to).emit('call-rejected', { from: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
  });
});

// ----------------- Запуск сервера -----------------
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
