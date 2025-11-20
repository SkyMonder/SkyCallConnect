import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const API = "https://skycall-server.onrender.com"; // твой сервер Render

function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [calls, setCalls] = useState([]);
  const [currentCall, setCurrentCall] = useState(null);

  const localStream = useRef(null);
  const remoteVideoRef = useRef(null);

  // --- Получение текущего пользователя ---
  const getMe = async (jwtToken) => {
    try {
      const res = await fetch(API + "/api/me", {
        headers: { Authorization: `Bearer ${jwtToken}` },
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
      extraHeaders: { Authorization: `Bearer ${jwtToken}` },
    });

    s.on("connect", () => console.log("Socket connected", s.id));

    s.on("incoming-call", (data) => {
      console.log("Входящий звонок от", data.from);
      setCalls((prev) => [...prev, { from: data.from, status: "incoming" }]);
      alert(`Входящий звонок от ${data.from}`);
    });

    s.on("call-accepted", (data) => {
      console.log("Звонок принят", data.from);
      setCurrentCall({ id: data.from });
    });

    s.on("call-rejected", (data) => {
      console.log("Звонок отклонён", data.from);
      setCurrentCall(null);
    });

    s.on("disconnect", () => console.log("Socket disconnected"));

    setSocket(s);
  };

  useEffect(() => {
    if (token) {
      getMe(token);
      connectSocket(token);
    }
  }, [token]);

  // --- Регистрация ---
  const handleRegister = async () => {
    const res = await fetch(API + "/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: formUsername, password: formPassword }),
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
  const handleLogin = async () => {
    const res = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: formUsername, password: formPassword }),
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
    const res = await fetch(
      API + "/api/search-users?query=" + encodeURIComponent(search),
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    setSearchResults(data);
  };

  // --- Звонок пользователю ---
  const callUser = (id) => {
    if (!socket) return;
    socket.emit("call-user", { to: id });
    setCurrentCall({ id });
  };

  // --- Принять звонок ---
  const acceptCall = (from) => {
    socket.emit("accept-call", { to: from });
    setCurrentCall({ id: from });
    setCalls((prev) => prev.filter((c) => c.from !== from));
  };

  // --- Отклонить звонок ---
  const rejectCall = (from) => {
    socket.emit("reject-call", { to: from });
    setCalls((prev) => prev.filter((c) => c.from !== from));
  };

  // --- Завершить звонок ---
  const endCall = () => {
    setCurrentCall(null);
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  // --- Вкл/Выкл микрофона и камеры ---
  const toggleMic = () => {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
  };

  const toggleCam = () => {
    if (!localStream.current) return;
    localStream.current.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
  };

  // --- UI ---
  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>SkyCall Connect</h1>

      {!user ? (
        <div>
          <h2>Регистрация / Логин</h2>
          <input
            placeholder="Имя пользователя"
            value={formUsername}
            onChange={(e) => setFormUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
          />
          <button onClick={handleRegister}>Зарегистрироваться</button>
          <button onClick={handleLogin}>Войти</button>
        </div>
      ) : (
        <div>
          <p>
            Привет, {user.username} (id: {user.id})
          </p>

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
                {c.from} — {c.status}{" "}
                <button onClick={() => acceptCall(c.from)}>Принять</button>
                <button onClick={() => rejectCall(c.from)}>Отклонить</button>
              </li>
            ))}
          </ul>

          {currentCall && (
            <div>
              <h3>Текущий звонок с {currentCall.id}</h3>
              <button onClick={toggleMic}>Вкл/Выкл микрофон</button>
              <button onClick={toggleCam}>Вкл/Выкл камеру</button>
              <button onClick={endCall}>Завершить звонок</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
