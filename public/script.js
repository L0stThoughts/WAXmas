// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    checkCurrentUser();
  });
  
  function checkCurrentUser() {
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not logged in');
      })
      .then(data => {
        document.getElementById('currentUser').textContent = data.username;
        connectSocket();
      })
      .catch(() => {
        document.getElementById('currentUser').textContent = 'Not logged in';
      });
  }
  
  async function registerUser() {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    document.getElementById('regStatus').innerText = data.message || (res.ok ? 'Registered!' : 'Error');
  }
  
  async function loginUser() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    document.getElementById('loginStatus').innerText = data.message || (res.ok ? 'Logged in!' : 'Error');
  
    if (res.ok && data.username) {
      document.getElementById('currentUser').textContent = data.username;
      connectSocket();
    }
  }
  
  async function logout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json();
    alert(data.message);
    if (window.socket) {
      window.socket.disconnect();
      window.socket = null;
    }
    document.getElementById('currentUser').textContent = 'Not logged in';
  }
  
  // Socket.io connect after we have a valid cookie
  function connectSocket() {
    if (window.socket) {
      // already connected
      return;
    }
    window.socket = io();
  
    socket.on('connect', () => {
      console.log('WS connected');
    });
  
    socket.on('disconnect', () => {
      console.log('WS disconnected');
    });
  
    socket.on('error', (msg) => {
      alert('Socket error: ' + msg);
    });
  
    // When we get old room history
    socket.on('roomHistory', (data) => {
      document.getElementById('messages').innerHTML = '';
      data.messages.forEach(m => {
        addMessage(`[${m.userId}] ${m.text} (at ${m.createdAt})`);
      });
    });
  
    // New real-time message
    socket.on('message', (data) => {
      addMessage(`${data.user}: ${data.text} (at ${data.createdAt})`);
    });
  
    socket.on('joinedRoom', (data) => {
      document.getElementById('joinStatus').innerText = 'Joined room: ' + data.roomId;
    });
  
    socket.on('leftRoom', (data) => {
      document.getElementById('joinStatus').innerText = 'Left room: ' + data.roomId;
      document.getElementById('messages').innerHTML = '';
    });
  
    // Owner sees profanity alerts
    socket.on('profanityAlert', (alertData) => {
      alert(`Profanity alert! Offender: ${alertData.offenderId}, text: ${alertData.originalText}`);
    });
  
    // Owner sees ban success
    socket.on('banSuccess', (data) => {
      alert(`User ${data.userId} was banned.`);
    });
  
    // The banned user sees this
    socket.on('banned', (data) => {
      alert(`You were banned from room ${data.roomId}. Reason: ${data.message}`);
    });
  }
  
  function createRoom() {
    const name = document.getElementById('roomName').value;
    const isPublic = document.getElementById('publicCheck').checked;
    const profanityFilterOn = document.getElementById('filterCheck').checked;
  
    fetch('/api/chat/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isPublic, profanityFilterOn })
    })
      .then(r => r.json())
      .then(data => {
        document.getElementById('createRoomStatus').innerText = data.roomId
          ? `Room created with ID ${data.roomId}`
          : (data.message || 'Error creating room');
      });
  }
  
  function joinRoom() {
    const roomId = document.getElementById('joinRoomId').value;
    if (!window.socket) return alert('Socket not connected. Please login first.');
    socket.emit('joinRoom', { roomId });
  }
  
  function leaveRoom() {
    const roomId = document.getElementById('joinRoomId').value;
    if (!window.socket) return alert('Socket not connected. Please login first.');
    socket.emit('leaveRoom', { roomId });
  }
  
  function sendMessage() {
    const text = document.getElementById('chatMsg').value;
    const roomId = document.getElementById('joinRoomId').value;
    if (!window.socket) return alert('Socket not connected.');
    socket.emit('chatMessage', { roomId, text });
    document.getElementById('chatMsg').value = '';
  }
  
  function banUser() {
    const banUserId = document.getElementById('banUserId').value;
    const roomId = document.getElementById('joinRoomId').value;
    if (!window.socket) return alert('Socket not connected.');
    socket.emit('banUser', { roomId, userId: banUserId });
  }
  
  function addMessage(msg) {
    const li = document.createElement('li');
    li.textContent = msg;
    document.getElementById('messages').appendChild(li);
  }
  