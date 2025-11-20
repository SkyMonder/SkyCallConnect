import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const API = "https://skycall-server.onrender.com"; // твой сервер Render

function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [calls, setCalls] = useState([]);
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  // --- Получение текущего пользователя ---
  const getMe = async (jwtToken) => {
    try {
      const res = await fetch(API + "/api/me", {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json"
        },
        credentials: "include"
      });
      const data = await res.json();
      if (!data.error) setUser(data);
    } catch (err) {
      console.error("Ошибка /api/me:", err);
    }
  };

  // --- Socket.IO ---
  const connectSocket = (jwtToken) => {
    const s = io(API, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      extraHeaders: { Authorization: `Bearer ${jwtToken}` }
    });

    s.on("connect", () => console.log("Socket connected", s.id));
    s.on("incoming-call", (data) => {
      console.log("Incoming call from", data.from);
      setCalls((prev) => [...prev, { from: data.from, status: "incoming" }]);
    });
    s.on("call-accepted", (data) => console.log("Call accepted by", data.from));
    s.on("call-rejected", (data) => console.log("Call rejected by", data.from));

    setSocket(s);
  };

  useEffect(() => {
    if (token) {
      getMe(token);
      connectSocket(token);
    }
  }, [token]);

  // --- Регистрация ---
  const handleRegister = async (username, password) => {
    const res = await fetch(API + "/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
      await getMe(data.token);
    } else {
      alert(data.error);
    }
  };

  // --- Логин ---
  const handleLogin = async (username, password) => {
    const res = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
      await getMe(data.token);
    } else {
      alert(data.error);
    }
  };

  // --- Поиск пользователей ---
  const searchUsers = async () => {
    if (!search.trim()) return;
    const res = await fetch(API + "/api/search-users?query=" + encodeURIComponent(search), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setSearchResults(data);
  };

  // --- Звонок пользователю ---
  const callUser = (id) => {
    if (socket) socket.emit("call-user", { to: id });
  };

  // --- UI ---
  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>SkyCall Connect</h1>

      {!user ? (
        <div>
          <h2>Регистрация / Логин</h2>
          <input id="username" placeholder="Имя пользователя" />
          <input id="password" type="password" placeholder="Пароль" />
          <button
            onClick={() =>
              handleRegister(
                document.getElementById("username").value,
                document.getElementById("password").value
              )
            }
          >
            Зарегистрироваться
          </button>
          <button
            onClick={() =>
              handleLogin(
                document.getElementById("username").value,
                document.getElementById("password").value
              )
            }
          >
            Войти
          </button>
        </div>
      ) : (
        <div>
          <p>Привет, {user.username} (id: {user.id})</p>

          <h3>Поиск пользователей:</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Введите имя"
          />
          <button onClick={searchUsers}>Найти</button>

          <ul>
            {searchResults.map((u) => (
              <li key={u.id}>
                {u.username} (id: {u.id}){" "}
                <button onClick={() => callUser(u.id)}>Позвонить</button>
              </li>
            ))}
          </ul>

          <h3>Входящие звонки:</h3>
          <ul>
            {calls.map((c, idx) => (
              <li key={idx}>
                {c.from} — {c.status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
