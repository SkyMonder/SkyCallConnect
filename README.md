
# SkyCall

Minimal video-call web app (signaling server + React client).

Features:
- Register / Login (JWT)
- Search users by username
- Start call (WebRTC) via socket.io signaling
- Incoming call notification with Accept / Reject
- Mic / Camera toggle, End call
- Nice UI

## Setup

Server:
```
cd server
npm install
cp .env.example .env
# change JWT_SECRET in .env
npm start
```

Client:
```
cd client
npm install
npm run dev
# open http://localhost:5173
```

Notes:
- The server serves static files from `../client/dist` if you build the client.
- This is a minimal example intended to be deployed on a trusted network. Replace JWT secret, add HTTPS, TURN servers for production, and better user persistence for scale.
