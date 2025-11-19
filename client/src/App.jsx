
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API = import.meta.env.VITE_API || 'http://localhost:4000';

function useLocalToken(){
  const [token, setToken] = useState(localStorage.getItem('skycall_token'));
  useEffect(()=>{ if(token) localStorage.setItem('skycall_token', token); else localStorage.removeItem('skycall_token'); }, [token]);
  return [token, setToken];
}

export default function App(){
  const [token, setToken] = useLocalToken();
  const [user, setUser] = useState(null);

  useEffect(()=>{
    if(!token) { setUser(null); return; }
    fetch(API + '/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(r=>r.json()).then(j=>{ if(j.user) setUser(j.user); else { setToken(null); }})
      .catch(()=> setToken(null));
  }, [token]);

  if(!token) return <Auth onAuth={(tok)=>setToken(tok)} />;

  return <Dashboard token={token} user={user} onLogout={()=> setToken(null)} api={API} />;
}

function Auth({onAuth}){
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  async function submit(e){
    e.preventDefault();
    const url = mode === 'login' ? '/api/login' : '/api/register';
    const res = await fetch('http://localhost:4000' + url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, password, displayName })
    });
    const j = await res.json();
    if(j.token){ onAuth(j.token); }
    else setError(j.error || 'Unknown error');
  }

  return (
    <div className="center-screen">
      <div className="card">
        <h1 className="logo">SkyCall</h1>
        <p className="muted">Красивый дизайн. Звони друзьям в один клик.</p>
        <form onSubmit={submit}>
          <input placeholder="Логин" value={username} onChange={e=>setUsername(e.target.value)} required />
          <input placeholder="Пароль" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          {mode==='register' && <input placeholder="Отображаемое имя" value={displayName} onChange={e=>setDisplayName(e.target.value)} />}
          <div style={{display:'flex',gap:8}}>
            <button type="submit" className="btn">{mode==='login' ? 'Войти' : 'Зарегистрироваться'}</button>
            <button type="button" className="btn ghost" onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Создать аккаунт':'Уже есть?'}</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}

function Dashboard({token, user, onLogout, api}){
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [callState, setCallState] = useState(null); // null | 'calling' | 'incoming' | 'in-call'
  const [peerId, setPeerId] = useState(null);
  const [incomingMeta, setIncomingMeta] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  useEffect(()=>{
    if(!token) return;
    const socket = io(api, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', ()=> console.log('socket connected'));
    socket.on('call:incoming', async ({ from, fromName, offer, meta })=>{
      console.log('incoming', from, fromName);
      setPeerId(from);
      setIncomingMeta({ fromName, meta });
      setCallState('incoming');
      // save offer for answering
      socketRef.current._lastOffer = offer;
    });
    socket.on('call:answered', async ({ from, answer })=>{
      // remote answered our offer
      if(pcRef.current){
        await pcRef.current.setRemoteDescription(answer);
        setCallState('in-call');
      }
    });
    socket.on('call:rejected', ({ from, reason })=>{
      alert('Call rejected: ' + (reason || 'Отказ'));
      cleanupCall();
    });
    socket.on('call:failed', ({ reason })=>{
      alert('Call failed: ' + reason);
      cleanupCall();
    });
    socket.on('signal', async ({ from, data })=>{
      // forwarded ICE candidates
      if(data && data.candidate && pcRef.current){
        try { await pcRef.current.addIceCandidate(data); } catch(e){ console.warn(e); }
      }
    });

    return ()=> { socket.disconnect(); socketRef.current = null; };
  }, [token]);

  async function search(e){
    e.preventDefault();
    const res = await fetch(api + '/api/users?q=' + encodeURIComponent(query), { headers: { Authorization: 'Bearer ' + token }});
    const j = await res.json();
    setResults(j.users || []);
  }

  async function startCall(toId){
    setCallState('calling');
    setPeerId(toId);
    await setupLocalStream();
    // create RTCPeerConnection
    const pc = createPeerConnection();
    pcRef.current = pc;
    for(const track of localStreamRef.current.getTracks()) pc.addTrack(track, localStreamRef.current);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current.emit('call:offer', { to: toId, offer: pc.localDescription, meta: { by: 'caller' } });
  }

  function createPeerConnection(){
    const pc = new RTCPeerConnection();
    pc.onicecandidate = (e) => {
      if(e.candidate) socketRef.current.emit('signal', { to: peerId, data: e.candidate });
    };
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };
    return pc;
  }

  async function setupLocalStream(){
    if(localStreamRef.current) return;
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = s;
  }

  async function acceptCall(){
    setCallState('connecting');
    await setupLocalStream();
    const pc = createPeerConnection();
    pcRef.current = pc;
    for(const track of localStreamRef.current.getTracks()) pc.addTrack(track, localStreamRef.current);
    // set remote description from saved offer
    const offer = socketRef.current._lastOffer;
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current.emit('call:answer', { to: peerId, answer: pc.localDescription });
    setCallState('in-call');
  }

  function rejectCall(){
    socketRef.current.emit('call:reject', { to: peerId, reason: 'Rejected' });
    cleanupCall();
  }

  function toggleMic(){
    if(!localStreamRef.current) return;
    for(const t of localStreamRef.current.getAudioTracks()) t.enabled = !t.enabled;
  }
  function toggleCam(){
    if(!localStreamRef.current) return;
    for(const t of localStreamRef.current.getVideoTracks()) t.enabled = !t.enabled;
  }
  function endCall(){
    socketRef.current.emit('call:reject', { to: peerId, reason: 'Ended' });
    cleanupCall();
  }
  function cleanupCall(){
    setCallState(null);
    setPeerId(null);
    setIncomingMeta(null);
    setRemoteStream(null);
    if(pcRef.current){ pcRef.current.close(); pcRef.current = null; }
    if(localStreamRef.current){
      for(const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">SkyCall</div>
        <div className="user-area">
          <div>{user ? user.displayName : '...'}</div>
          <button className="btn ghost" onClick={onLogout}>Выйти</button>
        </div>
      </header>
      <main className="container">
        <section className="search-panel card">
          <h2>Найти пользователя</h2>
          <form onSubmit={search} className="row">
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="введите логин или имя" />
            <button className="btn">Поиск</button>
          </form>
          <ul className="results">
            {results.map(u=>(
              <li key={u.id} className="result">
                <div>
                  <div className="name">{u.displayName}</div>
                  <div className="muted">@{u.username}</div>
                </div>
                <div>
                  <button className="btn" onClick={()=>startCall(u.id)}>Позвонить</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="call-panel card">
          <h2>Текущий звонок</h2>
          {!callState && <p className="muted">Нет активного вызова</p>}
          {callState==='calling' && <p>Звонок... Ожидание ответа</p>}
          {callState==='incoming' && incomingMeta && (
            <div className="incoming">
              <p><strong>{incomingMeta.fromName}</strong> звонит вам</p>
              <div style={{display:'flex',gap:8}}>
                <button className="btn" onClick={acceptCall}>Принять</button>
                <button className="btn ghost" onClick={rejectCall}>Отклонить</button>
              </div>
            </div>
          )}
          {callState==='in-call' && (
            <div className="incall">
              <div className="videos">
                <video autoPlay playsInline ref={el=>{ if(el && remoteStream) el.srcObject = remoteStream; }} className="remote" />
                <video autoPlay muted playsInline ref={el=>{ if(el && localStreamRef.current) el.srcObject = localStreamRef.current; }} className="local" />
              </div>
              <div className="controls">
                <button className="btn" onClick={toggleMic}>Микрофон</button>
                <button className="btn" onClick={toggleCam}>Камера</button>
                <button className="btn danger" onClick={endCall}>Завершить</button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
