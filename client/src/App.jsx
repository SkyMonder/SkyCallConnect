import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const API = "https://skycall-server.onrender.com"; // твой сервер Render
const TOKEN = "01206090"; // твой JWT токен

function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [calls, setCalls] = useState([]);

  // --- Получение текущего пользователя ---
  const getMe = async () => {
    try {
      const res = await fetch(API + "/api/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        credentials: "include"
      });
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error("Ошибка /api/me:", err);
    }
  };

  // --- Подключение Socket.IO ---
  const connectSocket = () => {
    const s = io(API, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      extraHeaders: { Authorization: `Bearer ${TOKEN}` }
    });

    s.on("connect", () => console.log("Socket connected", s.id));
    s.on("incoming-call", (data) => {
      console.log("Incoming call from", data.from);
      setCalls((prev) => [...prev, { from: data.from, status: "incoming" }]);
    });
    s.on("call-accepted", (data) => {
      console.log("Call accepted by", data.from);
    });
    s.on("call-rejected", (data) => {
      console.log("Call rejected by", data.from);
    });

    setSocket(s);
  };

  useEffect(() => {
    getMe();
    connectSocket();
  }, []);

  // --- Звонок другому пользователю ---
  const callUser = (id) => {
    if (socket) socket.emit("call-user", { to: id });
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>SkyCall Connect</h1>
      {user ? (
        <div>
          <p>Привет, {user.username} (id: {user.id})</p>
          <button onClick={() => callUser(prompt("ID пользователя для звонка:"))}>
            Позвонить
          </button>
          <h3>Входящие звонки:</h3>
          <ul>
            {calls.map((c, idx) => (
              <li key={idx}>{c.from} — {c.status}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Загрузка пользователя...</p>
      )}
    </div>
  );
}

export default App;
