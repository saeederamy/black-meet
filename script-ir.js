// =========================================================
// ⚙️ MAIN CONFIGURATION (Edit ONLY this section)
// =========================================================
const SERVER_CONFIG = {
    turnDomain: "turn.yourdomian.ir",   // 🌐 Your TURN Domain or IP
    turnPort: "3478",                 // 🔌 Standard Port
    turnUser: "<YOUR_USERNAME>",            // 👤 TURN Username
    turnPass: "<YOUR_SECURE_PASSWORD>"         // 🔑 TURN Password
};
// =========================================================

// ==========================================
// Black Meet - Frontend WebRTC Logic
// ==========================================

let isPolling = false;
let localStream;
let peerConnections = {};

// 🌐 TURN/STUN Server Dynamic Configuration
const configuration = { 
    'iceServers': [
        {
            // Step 1: Fast direct connection via STUN
            'urls': `stun:${SERVER_CONFIG.turnDomain}:${SERVER_CONFIG.turnPort}`
        },
        { 
            // Step 2: Fallback to TURN relay if NAT is strict
            'urls': `turn:${SERVER_CONFIG.turnDomain}:${SERVER_CONFIG.turnPort}`,
            'username': SERVER_CONFIG.turnUser,
            'credential': SERVER_CONFIG.turnPass
        }
    ],
    // Let the browser negotiate the best path automatically
    'iceTransportPolicy': 'all'
};

const clientId = Math.random().toString(36).substring(7);
let myRole = 'user';
let myUsername = 'User'; 
let currentRoomId = null;
let peerNames = {}; 

// Media States
let isAudioMuted = false;
let isVideoMuted = false;
let isMeetingActive = true;
let isScreenSharing = false;
let myScreenStream = null;

// Recording
let mediaRecorder;
let recordedChunks = [];
let audioContext;

// SVG Icons for UI
const SVGs = {
    micOn: '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
    micOff: '<svg viewBox="0 0 24 24"><path d="M19 11h-2c0 .91-.26 1.75-.69 2.48l1.46 1.46A6.921 6.921 0 0019 11zM14.93 14.93l-2.43-2.43c.03-.16.05-.33.05-.5V5c0-1.66-1.34-3-3-3S6.5 3.34 6.5 5v1.07l-2 2V5c0-2.76 2.24-5 5-5s5 2.24 5 5v7c0 .5-.1 1-.26 1.47l1.69 1.69c.56-.84.95-1.8.99-2.85h2c-.04 1.57-.49 3.01-1.23 4.21l1.45 1.45c.95-1.39 1.55-3.05 1.61-4.85zM12 14c-1.66 0-3-1.34-3-3V5.59L15.41 15C14.48 15.65 13.3 16 12 16c-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c1.66-.24 3.16-.99 4.31-2.04l-1.39-1.39C14.83 15.54 13.48 16 12 16v-2z"/></svg>',
    camOn: '<svg viewBox="0 0 24 24"><path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z"/></svg>',
    camOff: '<svg viewBox="0 0 24 24"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/></svg>',
    endCall: '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.52-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>'
};

// Set initial icons
document.getElementById('btn-mic').innerHTML = SVGs.micOn;
document.getElementById('btn-cam').innerHTML = SVGs.camOn;

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.three-dots-btn') && !e.target.closest('.r-menu-btn')) {
        document.querySelectorAll('.dropdown-menu, .r-dropdown').forEach(m => m.classList.remove('show'));
    }
});

// Handle exiting fullscreen mode
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.querySelectorAll('.video-container').forEach(c => c.classList.remove('fullscreen'));
        document.getElementById('local-container').classList.remove('pip');
    }
});

function getInitials(name) { return name ? name.substring(0, 2).toUpperCase() : 'U'; }

function updateGridLayout() {
    const grid = document.getElementById('video-grid');
    const visibleCount = Array.from(grid.children).filter(c => c.style.display !== 'none').length;
    grid.className = '';
    if (visibleCount <= 6) grid.classList.add(`grid-${visibleCount}`);
    else grid.classList.add('grid-many');
}

// 🎤 Audio Volume Meter
function getAudioContext() {
    if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    return audioContext;
}

function attachVolumeMeter(stream, iconId) {
    const audioTracks = stream.getAudioTracks();
    if(audioTracks.length === 0) return;
    const ctx = getAudioContext();
    const mediaStream = new MediaStream([audioTracks[0]]);
    try {
        const source = ctx.createMediaStreamSource(mediaStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function check() {
            const icon = document.getElementById(iconId);
            if(!icon) return; 
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
            if((sum / dataArray.length) > 10) icon.classList.add('speaking');
            else icon.classList.remove('speaking');
            requestAnimationFrame(check);
        }
        check();
    } catch(err) {}
}

// 🔐 Authentication & Dashboard
async function login() {
    const userRaw = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!userRaw || !pass) return;

    try {
        const response = await fetch(`/api/login?nocache=${Date.now()}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userRaw.toLowerCase(), password: pass }), cache: 'no-store'
        });
        const result = await response.json();
        
        if (result.success) {
            myRole = result.role; myUsername = result.username;
            if (myRole === 'admin') {
                document.getElementById('admin-controls').style.display = 'inline-flex';
                document.getElementById('btn-meeting-state').innerHTML = SVGs.endCall;
                document.getElementById('admin-tab-btn').style.display = 'block';
                document.getElementById('btn-create-room').style.display = 'block';
                document.body.classList.add('is-admin');
            }
            document.getElementById('login-wrapper').style.display = 'none';
            document.getElementById('rooms-wrapper').style.display = 'flex';
            fetchRooms();
        } else alert("Authorization Denied!");
    } catch (error) { alert("Server Offline or Network Blocked."); }
}

async function checkUpdate() {
    const btn = document.getElementById('btn-sys-update');
    btn.innerText = "⏳ Checking..."; btn.disabled = true;
    try {
        const response = await fetch(`/api/system/update?nocache=${Date.now()}`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), cache: 'no-store'
        });
        const result = await response.json();
        if (result.success) {
            alert(result.message);
            if (result.updated) setTimeout(() => { window.location.reload(); }, 3000);
        } else alert("Update failed: " + result.message);
    } catch (err) { alert("Network error during update."); }
    btn.innerText = "🔄 Check & Update System"; btn.disabled = false;
}

// 🚪 Room Management
async function fetchRooms() {
    try {
        const response = await fetch(`/api/rooms/list?nocache=${Date.now()}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myUsername, role: myRole }), cache: 'no-store'
        });
        const data = await response.json();
        const list = document.getElementById('rooms-list'); list.innerHTML = '';
        
        if(!data.success) return;
        if(Object.keys(data.rooms).length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);">No assigned rooms found.</p>'; return;
        }

        for (let r_id in data.rooms) {
            const room = data.rooms[r_id];
            const card = document.createElement('div');
            card.className = 'room-card';
            card.innerHTML = `<h3>${room.name}</h3><p style="font-size:13px; color:var(--text-muted);">Members: ${room.members.length === 0 ? 'Admin only' : room.members.length}</p><button class="join-btn" onclick="joinRoom('${r_id}', '${room.name}')">Join Session</button>`;
            
            if (myRole === 'admin') {
                card.innerHTML += `
                    <div class="room-admin-tools">
                        <button class="r-menu-btn" onclick="toggleMenu('rmenu-${r_id}')">⚙️</button>
                        <div class="r-dropdown" id="rmenu-${r_id}">
                            <button onclick="openEditRoom('${r_id}', '${room.name}')">✏️ Rename Room</button>
                            <button onclick="openManageMembers('${r_id}')">👥 Manage Users</button>
                            <button style="color:var(--c-red);" onclick="deleteRoom('${r_id}')">🗑️ Delete Room</button>
                        </div>
                    </div>`;
            }
            list.appendChild(card);
        }
    } catch (err) { console.error("Fetch Error:", err); }
}

function openCreateRoom() {
    document.getElementById('modal-title').innerText = 'Create New Room';
    document.getElementById('room-name-input').value = '';
    document.getElementById('edit-room-id').value = '';
    document.getElementById('room-modal').style.display = 'flex';
}

function openEditRoom(id, name) {
    document.getElementById('modal-title').innerText = 'Rename Room';
    document.getElementById('room-name-input').value = name;
    document.getElementById('edit-room-id').value = id;
    document.getElementById('room-modal').style.display = 'flex';
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function saveRoom() {
    const name = document.getElementById('room-name-input').value.trim();
    const editId = document.getElementById('edit-room-id').value;
    if(!name) return;
    const btn = document.querySelector('#room-modal .btn-primary');
    btn.innerText = "Saving..."; btn.disabled = true;

    try {
        const payload = editId ? { action: "rename", room_id: editId, name: name } : { action: "create", name: name };
        const res = await fetch(`/api/room_action?nocache=${Date.now()}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), cache: 'no-store'
        });
        const result = await res.json();
        if(result.success) { closeModal('room-modal'); await fetchRooms(); }
    } catch(e) {}
    btn.innerText = "Save"; btn.disabled = false;
}

async function deleteRoom(id) {
    if(confirm("Delete this room forever?")) {
        await fetch(`/api/room_action?nocache=${Date.now()}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: "delete", room_id: id }), cache: 'no-store'
        });
        fetchRooms();
    }
}

async function openManageMembers(roomId) {
    document.getElementById('members-room-id').value = roomId;
    try {
        const resRooms = await fetch(`/api/rooms/list?nocache=${Date.now()}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: myUsername, role: myRole }), cache: 'no-store'
        });
        const currentMembers = (await resRooms.json()).rooms[roomId].members || [];
        const resUsers = await fetch(`/api/users/list?nocache=${Date.now()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), cache: 'no-store' });
        const dataUsers = await resUsers.json();
        
        const list = document.getElementById('users-checkboxes'); list.innerHTML = '';
        if (dataUsers.users.length <= 1) {
            list.innerHTML = '<p style="color:#888; font-size:13px;">No other users found.</p>';
        } else {
            dataUsers.users.forEach(u => {
                if(u !== 'admin') {
                    const checked = currentMembers.includes(u) ? 'checked' : '';
                    list.innerHTML += `<label><input type="checkbox" value="${u}" ${checked}> ${u}</label>`;
                }
            });
        }
        document.getElementById('members-modal').style.display = 'flex';
    } catch(e) {}
}

async function saveMembers() {
    const roomId = document.getElementById('members-room-id').value;
    const members = Array.from(document.querySelectorAll('#users-checkboxes input:checked')).map(c => c.value);
    const btn = document.querySelector('#members-modal .btn-primary');
    btn.innerText = "Saving..."; btn.disabled = true;

    try {
        await fetch(`/api/room_action?nocache=${Date.now()}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: "update_members", room_id: roomId, members: members }), cache: 'no-store'
        });
        closeModal('members-modal'); await fetchRooms(); 
    } catch(e) {}
    btn.innerText = "Save Users"; btn.disabled = false;
}

// ================= HTTP POLLING SIGNALING =================
async function sendSignaling(msgObj) {
    try {
        await fetch(`/api/signaling/send?nocache=${Date.now()}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({room_id: currentRoomId, client_id: clientId, message: msgObj}), cache: 'no-store'
        });
    } catch(e) {}
}

async function connectSignaling() {
    isPolling = true;
    try {
        await fetch(`/api/signaling/join?nocache=${Date.now()}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({room_id: currentRoomId, client_id: clientId, role: myRole}), cache: 'no-store'
        });
        pollServer();
        sendSignaling({ type: 'cam-state', state: isVideoMuted, target: 'all', senderId: clientId });
    } catch(e) { console.error("Signaling Join Error", e); }
}

async function pollServer() {
    while(isPolling) {
        try {
            const res = await fetch(`/api/signaling/poll?room_id=${currentRoomId}&client_id=${clientId}&t=${Date.now()}`);
            if (!res.ok) { await new Promise(r => setTimeout(r, 2000)); continue; }
            const messages = await res.json();
            for(let msg of messages) {
                if(msg.type === 'ping') continue;
                handleSignalingMessage(msg);
            }
        } catch(e) {
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

function handleSignalingMessage(message) {
    switch (message.type) {
        case 'chat-history':
            document.getElementById('chat-messages').innerHTML = ''; 
            message.history.forEach(msg => appendChat(msg, true)); 
            break;
        case 'user-joined':
            if (isMeetingActive) {
                // Send local camera stream to the newly joined user
                createPeerConnection(message.client_id, 'camera', true, localStream);
                // Send screen stream if we are currently sharing our screen
                if (isScreenSharing && myScreenStream) {
                    createPeerConnection(message.client_id, 'screen', true, myScreenStream);
                }
                sendSignaling({ type: 'cam-state', state: isVideoMuted, target: message.client_id, senderId: clientId });
            }
            break;
        case 'offer': 
            if (isMeetingActive) handleOffer(message); 
            break;
        case 'answer': 
            handleAnswer(message); 
            break;
        case 'ice-candidate': 
            handleIceCandidate(message); 
            break;
        case 'user-left':
            removeUserVideo(message.client_id); 
            delete peerNames[message.client_id]; 
            refreshUserList(); 
            break;
        case 'chat': 
            appendChat(message); 
            break;
        case 'chat-cleared': 
            document.getElementById('chat-messages').innerHTML = '<div style="text-align:center; color:#888; font-size:12px; margin-top:20px;">Admin cleared chat.</div>'; 
            break;
        case 'cam-state':
            const container = document.getElementById(`container-${message.senderId}-camera`);
            if (container) { message.state === true ? container.classList.add('cam-off') : container.classList.remove('cam-off'); } 
            break;
        case 'stop-screen':
            const sCont = document.getElementById(`container-${message.senderId}-screen`);
            if (sCont) sCont.remove();
            if (peerConnections[`${message.senderId}-screen`]) { 
                peerConnections[`${message.senderId}-screen`].close(); 
                delete peerConnections[`${message.senderId}-screen`]; 
            }
            updateGridLayout(); 
            break;
        case 'meeting-paused':
            if (myRole !== 'admin') {
                isMeetingActive = false; 
                document.getElementById('meeting-overlay').style.display = 'flex';
                document.getElementById('main-workspace').style.display = 'none'; 
                document.getElementById('view-tabs').style.display = 'none'; 
                document.querySelector('.bottom-bar').style.display = 'none';
                stopAllMediaAndConnections();
            } 
            break;
        case 'meeting-resumed':
            if (myRole !== 'admin') {
                isMeetingActive = true; 
                document.getElementById('meeting-overlay').style.display = 'none';
                document.getElementById('main-workspace').style.display = 'flex'; 
                document.getElementById('view-tabs').style.display = 'flex'; 
                document.querySelector('.bottom-bar').style.display = 'flex';
                initMedia().then(() => { sendSignaling({ type: 'user-joined', client_id: clientId, role: myRole }); });
            } 
            break;
        case 'force-action':
            if (message.action === 'mute-mic') toggleAudio(true);
            if (message.action === 'mute-cam') toggleVideo(true); 
            break;
    }
}

// 🎥 Media & WebRTC Logic
async function joinRoom(roomId, roomName) {
    currentRoomId = roomId;
    document.getElementById('rooms-wrapper').style.display = 'none'; 
    document.getElementById('meet-screen').style.display = 'flex';
    document.getElementById('current-room-name').innerText = roomName; 
    document.getElementById('role-display').innerText = myUsername; 
    document.getElementById('local-avatar').innerText = getInitials(myUsername);
    await initMedia(); 
    connectSignaling(); 
    updateGridLayout(); 
    refreshUserList();
}

function leaveRoom() {
    stopAllMediaAndConnections();
    isPolling = false;
    fetch(`/api/signaling/leave?nocache=${Date.now()}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({room_id: currentRoomId, client_id: clientId}) });
    document.getElementById('meet-screen').style.display = 'none'; 
    document.getElementById('rooms-wrapper').style.display = 'flex';
    fetchRooms();
}

function toggleSidebar() { document.getElementById('main-sidebar').classList.toggle('show'); }
function switchSidebarTab(tabName) {
    document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sb-panel').forEach(p => p.classList.remove('active'));
    event.target.classList.add('active'); 
    document.getElementById(`panel-${tabName}`).classList.add('active');
}

function refreshUserList() {
    const list = document.getElementById('users-list');
    list.innerHTML = `<div class="user-row"><div class="avatar">${getInitials(myUsername)}</div><div class="name">${myUsername} (You)</div></div>`;
    for(let id in peerNames) list.innerHTML += `<div class="user-row"><div class="avatar">${getInitials(peerNames[id])}</div><div class="name">${peerNames[id]}</div></div>`;
}

function toggleMenu(menuId) {
    const menu = document.getElementById(menuId); 
    const isShowing = menu.classList.contains('show');
    document.querySelectorAll('.dropdown-menu, .r-dropdown').forEach(m => m.classList.remove('show'));
    if (!isShowing) menu.classList.add('show');
}

function filterView(type, btnObj) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btnObj.classList.add('active');
    document.querySelectorAll('.video-container').forEach(c => {
        if (type === 'all') c.style.display = 'flex';
        else { c.getAttribute('data-type') === type ? c.style.display = 'flex' : c.style.display = 'none'; }
    });
    updateGridLayout();
}

function togglePin(containerId) {
    const container = document.getElementById(containerId); if (!container) return;
    const isPinned = container.classList.contains('pinned');
    document.querySelectorAll('.video-container').forEach(c => c.classList.remove('pinned'));
    if (!isPinned) container.classList.add('pinned');
}

function makeFullscreen(containerId) {
    const container = document.getElementById(containerId); if (!container) return;
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            container.classList.add('fullscreen');
            if (container.id !== 'local-container' && !isVideoMuted) document.getElementById('local-container').classList.add('pip');
        }).catch(err => console.log(err));
    } else document.exitFullscreen();
}

function setupDoubleClickHandler(containerElement) { containerElement.ondblclick = () => { makeFullscreen(containerElement.id); }; }

async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;
        localStream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted); 
        localStream.getVideoTracks().forEach(t => t.enabled = !isVideoMuted);
        attachVolumeMeter(localStream, 'mic-local'); 
    } catch(e) {}
}

function createPeerConnection(peerId, streamType, isInitiator, stream) {
    const pcKey = `${peerId}-${streamType}`; 
    if (peerConnections[pcKey]) return peerConnections[pcKey];
    
    const pc = new RTCPeerConnection(configuration); 
    peerConnections[pcKey] = pc;
    
    if (stream) stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = e => { 
        if (e.candidate) sendSignaling({ type: 'ice-candidate', target: peerId, streamType: streamType, candidate: e.candidate, senderId: clientId }); 
    };
    pc.ontrack = e => { 
        if (e.streams && e.streams[0]) addRemoteVideo(peerId, e.streams[0], streamType); 
    };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            sendSignaling({ type: 'offer', target: peerId, streamType: streamType, offer: offer, senderId: clientId, senderName: myUsername });
        });
    }
    return pc;
}

async function handleOffer(message) {
    const peerId = message.senderId; const streamType = message.streamType;
    if (message.senderName) { peerNames[peerId] = message.senderName; refreshUserList(); }
    const streamToShare = streamType === 'camera' ? localStream : null; 
    const pc = peerConnections[`${peerId}-${streamType}`] || createPeerConnection(peerId, streamType, false, streamToShare);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignaling({ type: 'answer', target: peerId, streamType: streamType, answer: pc.localDescription, senderId: clientId, senderName: myUsername });
    } catch(err) {}
}

async function handleAnswer(message) {
    const pcKey = `${message.senderId}-${message.streamType}`; const pc = peerConnections[pcKey];
    if (message.senderName) {
        peerNames[message.senderId] = message.senderName;
        document.querySelectorAll(`.name-${message.senderId}`).forEach(el => el.innerText = message.senderName);
        document.querySelectorAll(`.init-${message.senderId}`).forEach(el => el.innerText = getInitials(message.senderName)); refreshUserList();
    }
    if (pc) { try { await pc.setRemoteDescription(new RTCSessionDescription(message.answer)); } catch(err) {} }
}

async function handleIceCandidate(message) {
    const pcKey = `${message.senderId}-${message.streamType}`; const pc = peerConnections[pcKey];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
}

function addRemoteVideo(peerId, stream, streamType) {
    const containerId = `container-${peerId}-${streamType}`; if (document.getElementById(containerId)) return;
    const displayName = peerNames[peerId] || `User`; const isScreen = streamType === 'screen';
    const labelText = isScreen ? `${displayName}'s Screen` : displayName;
    
    const container = document.createElement('div'); container.className = 'video-container remote-video'; container.id = containerId; container.setAttribute('data-type', streamType);

    if (!isScreen) container.innerHTML += `<div class="avatar-bubble"><div class="avatar-circle init-${peerId}">${getInitials(displayName)}</div><div class="avatar-name name-${peerId}">${displayName}</div></div>`;

    let adminMenu = myRole === 'admin' ? `<button class="dropdown-item" onclick="sendSignaling({ type: 'admin-action', action: 'mute-mic', target_id: '${peerId}' })">🎙️ Mute Mic</button><button class="dropdown-item danger" onclick="sendSignaling({ type: 'admin-action', action: 'mute-cam', target_id: '${peerId}' })">🚫 Block Camera</button>` : '';

    const menuId = `menu-${peerId}-${streamType}`;
    container.innerHTML += `<div class="menu-wrapper"><button class="three-dots-btn" onclick="toggleMenu('${menuId}')">⋮</button><div class="dropdown-menu" id="${menuId}"><button class="dropdown-item" onclick="togglePin('${containerId}'); toggleMenu('${menuId}')">📌 Pin Feed</button><button class="dropdown-item" onclick="makeFullscreen('${containerId}'); toggleMenu('${menuId}')">🔲 Fullscreen</button>${adminMenu}</div></div>`;

    const video = document.createElement('video'); 
    video.srcObject = stream; 
    video.autoplay = true; 
    video.playsInline = true; 
    // Fix for autoplay black screen issue in Safari/Chrome
    if (isScreen) video.muted = true; 
    
    container.appendChild(video);
    const label = document.createElement('div'); label.className = `label ${isScreen ? 'screen-lbl' : ''}`;
    let micHtml = isScreen ? '' : `<span class="mic-indicator" id="mic-${peerId}"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg></span>`;
    label.innerHTML = `${micHtml} <span class="name-${peerId}">${labelText}</span>`; container.appendChild(label);

    setupDoubleClickHandler(container);
    const activeTab = document.querySelector('.tab-btn.active')?.innerText?.toLowerCase() || '';
    if (activeTab.includes('screen') && !isScreen) container.style.display = 'none';
    if (activeTab.includes('camera') && isScreen) container.style.display = 'none';

    document.getElementById('video-grid').appendChild(container);
    if(!isScreen) attachVolumeMeter(stream, `mic-${peerId}`); updateGridLayout();
}

function removeUserVideo(peerId) {
    ['camera', 'screen'].forEach(type => {
        const pcKey = `${peerId}-${type}`;
        if (peerConnections[pcKey]) { peerConnections[pcKey].close(); delete peerConnections[pcKey]; }
        const cont = document.getElementById(`container-${peerId}-${type}`); if(cont) cont.remove();
    }); updateGridLayout();
}

// 🎛️ Controls & Actions
function toggleAudio(forceMute = false) {
    if (!localStream) return; isAudioMuted = forceMute ? true : !isAudioMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
    const btn = document.getElementById('btn-mic');
    if (isAudioMuted) { btn.classList.replace('active-blue', 'active-red'); btn.innerHTML = SVGs.micOff; document.getElementById('mic-local').style.display = 'none'; } 
    else { btn.classList.replace('active-red', 'active-blue'); btn.innerHTML = SVGs.micOn; document.getElementById('mic-local').style.display = 'flex'; }
}

function toggleVideo(forceMute = false) {
    if (!localStream) return; isVideoMuted = forceMute ? true : !isVideoMuted;
    localStream.getVideoTracks().forEach(t => t.enabled = !isVideoMuted);
    sendSignaling({ type: 'cam-state', state: isVideoMuted, target: 'all', senderId: clientId });
    const btn = document.getElementById('btn-cam'); const localCont = document.getElementById('local-container');
    if (isVideoMuted) { btn.classList.replace('active-blue', 'active-red'); btn.innerHTML = SVGs.camOff; localCont.classList.add('cam-off'); localCont.classList.remove('pip'); } 
    else { btn.classList.replace('active-red', 'active-blue'); btn.innerHTML = SVGs.camOn; localCont.classList.remove('cam-off'); }
}

function toggleMeetingState() {
    const btn = document.getElementById('btn-meeting-state');
    if (isMeetingActive) { sendSignaling({ type: 'admin-action', action: 'pause-meeting' }); isMeetingActive = false; btn.innerHTML = SVGs.startCall; btn.classList.replace('active-red', 'active-blue'); } 
    else { sendSignaling({ type: 'admin-action', action: 'resume-meeting' }); isMeetingActive = true; btn.innerHTML = SVGs.endCall; btn.classList.replace('active-blue', 'active-red'); }
}

function stopAllMediaAndConnections() {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (myScreenStream) stopScreenShare();
    if (mediaRecorder && mediaRecorder.state === 'recording') toggleRecording();
    for (let id in peerConnections) peerConnections[id].close(); peerConnections = {};
    document.querySelectorAll('.remote-video').forEach(e => e.remove());
}

// ⏺️ Screen Recording
async function toggleRecording() {
    const btn = document.getElementById('btn-record');
    if (mediaRecorder && mediaRecorder.state === 'recording') { mediaRecorder.stop(); btn.classList.remove('record-pulse'); return; }
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop()); const blob = new Blob(recordedChunks, { type: 'video/webm' }); recordedChunks = [];
            const url = URL.createObjectURL(blob); const dateStr = new Date().toLocaleString(); const list = document.getElementById('recordings-list');
            if (list.innerText.includes('No recordings')) list.innerHTML = ''; const recId = 'rec_' + Date.now();
            list.innerHTML += `<div class="rec-item" id="${recId}"><div class="rec-title">Session - ${dateStr}</div><div class="rec-actions"><button class="rec-btn btn-dl" onclick="downloadRecording('${url}', '${dateStr}')">Save MP4</button><button class="rec-btn btn-del" onclick="document.getElementById('${recId}').remove()">Trash</button></div></div>`;
            if(!document.getElementById('main-sidebar').classList.contains('show')) toggleSidebar(); switchSidebarTab('admin');
        };
        mediaRecorder.start(); btn.classList.add('record-pulse');
    } catch (err) {}
}

function downloadRecording(url, date) {
    const a = document.createElement('a'); a.style.display = 'none'; a.href = url; a.download = `BlackMeet_Record_${date.replace(/[/, :]/g, '_')}.mp4`; document.body.appendChild(a); a.click();
}

// 🖥️ Screen Sharing
async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            myScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            Object.keys(peerConnections).forEach(pcKey => {
                if (pcKey.endsWith('-camera')) { const peerId = pcKey.split('-')[0]; createPeerConnection(peerId, 'screen', true, myScreenStream); }
            });
            addLocalScreenShare(myScreenStream); isScreenSharing = true; document.getElementById('btn-share').classList.add('active-orange');
            myScreenStream.getVideoTracks()[0].onended = stopScreenShare;
        } catch (error) {}
    } else stopScreenShare();
}

function stopScreenShare() {
    if (!isScreenSharing) return;
    if (myScreenStream) myScreenStream.getTracks().forEach(t => t.stop());
    sendSignaling({ type: 'stop-screen', senderId: clientId });
    Object.keys(peerConnections).forEach(pcKey => { if (pcKey.endsWith('-screen')) { peerConnections[pcKey].close(); delete peerConnections[pcKey]; } });
    myScreenStream = null; const localScreenCont = document.getElementById('local-screen-container'); if (localScreenCont) localScreenCont.remove();
    isScreenSharing = false; document.getElementById('btn-share').classList.remove('active-orange'); updateGridLayout();
}

function addLocalScreenShare(stream) {
    const container = document.createElement('div'); container.className = 'video-container'; container.id = 'local-screen-container'; container.setAttribute('data-type', 'screen');
    const menuId = 'menu-local-screen';
    container.innerHTML = `<div class="menu-wrapper"><button class="three-dots-btn" onclick="toggleMenu('${menuId}')">⋮</button><div class="dropdown-menu" id="${menuId}"><button class="dropdown-item" onclick="togglePin('local-screen-container'); toggleMenu('${menuId}')">📌 Pin Feed</button><button class="dropdown-item" onclick="makeFullscreen('local-screen-container'); toggleMenu('${menuId}')">🔲 Fullscreen</button><button class="dropdown-item danger" onclick="stopScreenShare(); toggleMenu('${menuId}')">🛑 Stop Sharing</button></div></div><video autoplay playsinline muted></video><div class="label screen-lbl"><span>Your Screen</span></div>`;
    container.querySelector('video').srcObject = stream; setupDoubleClickHandler(container); document.getElementById('video-grid').appendChild(container); updateGridLayout();
}

// 💬 Chat System
function clearChat() { if(confirm("Clear room chat history?")) sendSignaling({ type: 'admin-action', action: 'clear-chat' }); }

function downloadChat() {
    let text = "=== Black Meet Chat History ===\n\n";
    document.querySelectorAll('.chat-msg').forEach(msg => { const name = msg.querySelector('b').innerText; const content = msg.innerText.replace(name, '').trim(); text += `[${name}] ${content}\n`; });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain'})); a.download = 'Chat_History.txt'; a.click();
}

function sendChat() {
    const input = document.getElementById('chat-input');
    if (input.value.trim() !== '') { sendSignaling({ type: 'chat', text: input.value, senderName: myUsername }); input.value = ''; }
}
document.getElementById('chat-input')?.addEventListener('keypress', function (e) { if (e.key === 'Enter') sendChat(); });

function appendChat(msg, isHistory = false) {
    const chatBox = document.getElementById('chat-messages');
    let senderName = msg.senderName || (msg.role === 'admin' ? 'Admin' : `User`); const isMe = msg.sender === clientId; if (isMe) senderName = 'You';
    chatBox.innerHTML += `<div class="chat-msg ${isMe ? 'me' : ''}"><b>${senderName}</b> ${msg.text}</div>`;
    if (!isHistory) {
        chatBox.scrollTop = chatBox.scrollHeight;
        if(!document.getElementById('main-sidebar').classList.contains('show')) {
            const chatBtn = document.querySelector('[title="Sidebar"]');
            if(chatBtn) { chatBtn.style.transform = "scale(1.2)"; chatBtn.style.background = "var(--c-blue)"; setTimeout(() => { chatBtn.style.transform = "scale(1)"; chatBtn.style.background = "rgba(255,255,255,0.05)";}, 1000); }
        }
    } else chatBox.scrollTop = chatBox.scrollHeight;
}
