import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const API = "https://skycall-server.onrender.com";

function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);

  // --- Логин и сохранение токена ---
  const login = async (username, password) => {
    const res = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) localStorage.setItem("token", data.token);
    return data;
  };

  // --- Получение текущего пользователя ---
  const getMe = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(API + "/api/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      credentials: "include"
    });
    const data = await res.json();
    setUser(data);
  };

  // --- Подключение Socket.IO ---
  const connectSocket = () => {
    const token = localStorage.getItem("token");
    const s = io(API, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      extraHeaders: { Authorization: `Bearer ${token}` }
    });

    s.on("connect", () => console.log("Socket connected", s.id));
    s.on("incoming-call", data => console.log("Incoming call from", data.from));
    setSocket(s);
  };

  useEffect(() => {
    getMe();
    connectSocket();
  }, []);

  return (
    <div>
      <h1>SkyCall Connect</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}

export default App;
