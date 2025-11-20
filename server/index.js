// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();

// ---------- CORS ----------
const CLIENT_URL = "https://skycallconnect.onrender.com";

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));

app.use(express.json());

// ---------- HTTP + SOCKET.IO ----------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["authorization"],
    credentials: true
  },
  transportOptions: {
    polling: {
      extraHeaders: {
        "Access-Control-Allow-Origin": CLIENT_URL
      }
    }
  }
});

// ---------- DATABASE ----------
const db = new sqlite3.Database("data.db", (err) => {
  if (err) console.error("Ошибка открытия БД:", err.message);
  else console.log("База данных открыта!");
});

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

// ---------- AUTH HELPERS ----------
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Нет токена" });

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || "SECRET");
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Неверный токен" });
  }
}

// ---------- ROUTES ----------

// Регистрация
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;

  db.run("INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    function (err) {
      if (err) return res.status(400).json({ error: "Пользователь уже существует" });

      const token = jwt.sign({ id: this.lastID }, process.env.JWT_SECRET || "SECRET");
      res.json({ token });
    }
  );
});

// Логин
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(400).json({ error: "Неверные данные" });

      const token = jwt.sign({ id: row.id }, process.env.JWT_SECRET || "SECRET");
      res.json({ token });
    }
  );
});

// Проверка токена для клиента
app.get("/api/me", authMiddleware, (req, res) => {
  db.get("SELECT id, username FROM users WHERE id = ?", [req.user.id], (err, row) => {
    if (!row) return res.status(404).json({ error: "Пользователь не найден" });
    res.json(row);
  });
});

// ---------- SOCKET.IO ----------
io.on("connection", (socket) => {
  console.log("Пользователь подключился:", socket.id);

  socket.on("call-user", (data) => {
    io.to(data.to).emit("incoming-call", { from: socket.id });
  });

  socket.on("accept-call", (data) => {
    io.to(data.to).emit("call-accepted", { from: socket.id });
  });

  socket.on("reject-call", (data) => {
    io.to(data.to).emit("call-rejected", { from: socket.id });
  });

  socket.on("disconnect", () => {
    console.log("Пользователь отключился:", socket.id);
  });
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log("Сервер запущен на порту", PORT);
});
