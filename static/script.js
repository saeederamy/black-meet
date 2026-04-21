let ws;
let localStream;
let peerConnections = {};
const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
const clientId = Math.random().toString(36).substring(7);
let myRole = 'user';
let myUsername = 'User'; 
let peerNames = {}; 

let isAudioMuted = false;
let isVideoMuted = false;
let isMeetingActive = true;
let isScreenSharing = false;

const SVGs = {
    micOn: '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
    micOff: '<svg viewBox="0 0 24 24"><path d="M19 11h-2c0 .91-.26 1.75-.69 2.48l1.46 1.46A6.921 6.921 0 0019 11zM14.93 14.93l-2.43-2.43c.03-.16.05-.33.05-.5V5c0-1.66-1.34-3-3-3S6.5 3.34 6.5 5v1.07l-2 2V5c0-2.76 2.24-5 5-5s5 2.24 5 5v7c0 .5-.1 1-.26 1.47l1.69 1.69c.56-.84.95-1.8.99-2.85h2c-.04 1.57-.49 3.01-1.23 4.21l1.45 1.45c.95-1.39 1.55-3.05 1.61-4.85zM12 14c-1.66 0-3-1.34-3-3V5.59L15.41 15C14.48 15.65 13.3 16 12 16c-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c1.66-.24 3.16-.99 4.31-2.04l-1.39-1.39C14.83 15.54 13.48 16 12 16v-2z"/></svg>',
    camOn: '<svg viewBox="0 0 24 24"><path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z"/></svg>',
    camOff: '<svg viewBox="0 0 24 24"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/></svg>',
    endCall: '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.52-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>',
    startCall: '<svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>'
};

document.getElementById('btn-mic').innerHTML = SVGs.micOn;
document.getElementById('btn-cam').innerHTML = SVGs.camOn;

async function login() {
    const userRaw = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!userRaw || !pass) return;

    myUsername = userRaw;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userRaw.toLowerCase(), password: pass })
        });
        const result = await response.json();
        
        if (result.success) {
            myRole = result.role;
            document.getElementById('role-display').innerText = myUsername;
            
            if (myRole === 'admin') {
                document.getElementById('admin-controls').style.display = 'inline';
                document.getElementById('btn-meeting-state').innerHTML = SVGs.endCall;
            }

            document.getElementById('login-wrapper').style.display = 'none';
            document.getElementById('meet-screen').style.display = 'flex';

            await initMedia();
            connectWebSocket();
            setupDoubleClickHandler(document.getElementById('local-container'));
        } else {
            alert("Authentication Failed!");
        }
    } catch (error) {
        alert("Server Error.");
    }
}

function toggleChat() {
    document.getElementById('chat-sidebar').classList.toggle('show');
}

// دکمه پین (Pin) روی ویدیوها
function togglePin(peerId) {
    const containerId = peerId === 'local' ? 'local-container' : `container-${peerId}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    const isPinned = container.classList.contains('pinned');
    
    document.querySelectorAll('.video-container').forEach(c => {
        c.classList.remove('pinned');
        const btn = c.querySelector('.pin-btn');
        if(btn) btn.classList.remove('active');
    });

    if (!isPinned) {
        container.classList.add('pinned');
        const btn = container.querySelector('.pin-btn');
        if(btn) btn.classList.add('active');
    }
}

// حالت فول اسکرین CSS و باز شدن پاپ آپ (PiP) برای تصویر خودمان
function setupDoubleClickHandler(containerElement) {
    containerElement.ondblclick = () => {
        const isFS = containerElement.classList.contains('fullscreen');
        const localCont = document.getElementById('local-container');
        
        // خروج همه از فول اسکرین
        document.querySelectorAll('.video-container').forEach(c => c.classList.remove('fullscreen'));
        
        if (!isFS) {
            containerElement.classList.add('fullscreen');
            
            // اگر ویدیوی شخص دیگری را فول اسکرین کردیم و دوربین خودمان روشن است -> باز شدن PiP
            if (containerElement.id !== 'local-container' && !isVideoMuted) {
                localCont.classList.add('pip');
            } else {
                localCont.classList.remove('pip');
            }
        } else {
            localCont.classList.remove('pip');
        }
    };
}

async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;
        localStream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
        localStream.getVideoTracks().forEach(t => t.enabled = !isVideoMuted);
    } catch(e) {
        console.error("Camera access denied.");
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${clientId}/${myRole}`);

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        switch (message.type) {
            case 'user-joined':
                if (isMeetingActive) createPeerConnection(message.client_id, true);
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
                break;
            case 'chat':
                appendChat(message);
                break;
            case 'meeting-paused':
                if (myRole !== 'admin') {
                    isMeetingActive = false;
                    stopAllMediaAndConnections();
                    document.getElementById('main-workspace').style.display = 'none';
                    document.getElementById('waiting-room').style.display = 'flex';
                }
                break;
            case 'meeting-resumed':
                if (myRole !== 'admin') {
                    isMeetingActive = true;
                    document.getElementById('waiting-room').style.display = 'none';
                    document.getElementById('main-workspace').style.display = 'flex';
                    await initMedia();
                    ws.send(JSON.stringify({ type: 'user-joined', client_id: clientId, role: myRole }));
                }
                break;
            case 'force-action':
                if (message.action === 'mute-mic') toggleAudio(true);
                if (message.action === 'mute-cam') toggleVideo(true);
                break;
        }
    };
}

function stopAllMediaAndConnections() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    for (let id in peerConnections) {
        peerConnections[id].close();
    }
    peerConnections = {};
    document.querySelectorAll('.remote-video').forEach(e => e.remove());
}

function toggleMeetingState() {
    const btn = document.getElementById('btn-meeting-state');
    if (isMeetingActive) {
        ws.send(JSON.stringify({ type: 'admin-action', action: 'pause-meeting' }));
        isMeetingActive = false;
        btn.innerHTML = SVGs.startCall;
        btn.classList.replace('active-red', 'active-green');
    } else {
        ws.send(JSON.stringify({ type: 'admin-action', action: 'resume-meeting' }));
        isMeetingActive = true;
        btn.innerHTML = SVGs.endCall;
        btn.classList.replace('active-green', 'active-red');
    }
}

function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(configuration);
    peerConnections[peerId] = pc;
    
    if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'ice-candidate', target: peerId, candidate: event.candidate, senderId: clientId }));
        }
    };

    pc.ontrack = event => {
        if (event.streams && event.streams[0]) {
            addRemoteVideo(peerId, event.streams[0]);
        }
    };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', target: peerId, offer: offer, senderId: clientId, senderName: myUsername }));
        });
    }
    return pc;
}

function updateVideoLabel(peerId, name) {
    const labelSpan = document.getElementById(`name-${peerId}`);
    if (labelSpan && name) labelSpan.innerText = name;
}

async function handleOffer(message) {
    const peerId = message.senderId;
    if (message.senderName) {
        peerNames[peerId] = message.senderName;
        updateVideoLabel(peerId, message.senderName);
    }
    
    const pc = createPeerConnection(peerId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    ws.send(JSON.stringify({ type: 'answer', target: peerId, answer: answer, senderId: clientId, senderName: myUsername }));
}

async function handleAnswer(message) {
    const pc = peerConnections[message.senderId];
    if (message.senderName) {
        peerNames[message.senderId] = message.senderName;
        updateVideoLabel(message.senderId, message.senderName);
    }
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
}

async function handleIceCandidate(message) {
    const pc = peerConnections[message.senderId];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
}

function addRemoteVideo(peerId, stream) {
    if (document.getElementById(`container-${peerId}`)) return;
    
    const container = document.createElement('div');
    container.className = 'video-container remote-video';
    container.id = `container-${peerId}`;
    container.title = "Double click to fullscreen";

    // دکمه‌های ادمین روی ویدیو
    if (myRole === 'admin') {
        const adminActions = document.createElement('div');
        adminActions.className = 'admin-actions';
        adminActions.innerHTML = `
            <button onclick="ws.send(JSON.stringify({ type: 'admin-action', action: 'mute-mic', target_id: '${peerId}' }))">Mute</button>
            <button onclick="ws.send(JSON.stringify({ type: 'admin-action', action: 'mute-cam', target_id: '${peerId}' }))">Stop Cam</button>
        `;
        container.appendChild(adminActions);
    }

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>';
    pinBtn.onclick = () => togglePin(peerId);
    container.appendChild(pinBtn);

    const video = document.createElement('video');
    video.id = `video-${peerId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    container.appendChild(video);

    const label = document.createElement('div');
    label.className = 'label';
    const displayName = peerNames[peerId] || `User ${peerId.substring(0,4)}`;
    label.innerHTML = `<span id="name-${peerId}">${displayName}</span>`;
    container.appendChild(label);

    setupDoubleClickHandler(container);
    document.getElementById('video-grid').appendChild(container);
}

function removeUserVideo(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    const container = document.getElementById(`container-${peerId}`);
    if (container) container.remove();
}

function toggleAudio(forceMute = false) {
    if (!localStream) return;
    isAudioMuted = forceMute ? true : !isAudioMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
    
    const btn = document.getElementById('btn-mic');
    if (isAudioMuted) {
        btn.classList.replace('active-green', 'active-red');
        btn.innerHTML = SVGs.micOff;
    } else {
        btn.classList.replace('active-red', 'active-green');
        btn.innerHTML = SVGs.micOn;
    }
}

function toggleVideo(forceMute = false) {
    if (!localStream) return;
    isVideoMuted = forceMute ? true : !isVideoMuted;
    localStream.getVideoTracks().forEach(t => t.enabled = !isVideoMuted);
    
    const btn = document.getElementById('btn-cam');
    if (isVideoMuted) {
        btn.classList.replace('active-blue', 'active-red');
        btn.innerHTML = SVGs.camOff;
        document.getElementById('local-container').classList.remove('pip'); // در صورت خاموش شدن دوربین، PiP هم بسته شود
    } else {
        btn.classList.replace('active-red', 'active-blue');
        btn.innerHTML = SVGs.camOn;
    }
}

async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            for (let id in peerConnections) {
                const sender = peerConnections[id].getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            }
            document.getElementById('local-video').srcObject = screenStream;
            isScreenSharing = true;
            document.getElementById('btn-share').classList.add('active-blue');

            screenTrack.onended = () => {
                const videoTrack = localStream.getVideoTracks()[0];
                for (let id in peerConnections) {
                    const sender = peerConnections[id].getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                }
                document.getElementById('local-video').srcObject = localStream;
                isScreenSharing = false;
                document.getElementById('btn-share').classList.remove('active-blue');
            };
        } catch (error) { console.error("Screen share error", error); }
    }
}

function sendChat() {
    const input = document.getElementById('chat-input');
    if (input.value.trim() !== '') {
        ws.send(JSON.stringify({ type: 'chat', text: input.value, senderName: myUsername }));
        input.value = '';
    }
}

document.getElementById('chat-input')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') sendChat();
});

function appendChat(msg) {
    const chatBox = document.getElementById('chat-messages');
    let senderName = msg.senderName || (msg.role === 'admin' ? 'Host' : `User ${msg.sender.substring(0,4)}`);
    if (msg.sender === clientId) senderName = 'You';
    
    chatBox.innerHTML += `<div class="chat-msg"><b>${senderName}</b> <br> ${msg.text}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
    
    if(!document.getElementById('chat-sidebar').classList.contains('show')) {
        document.getElementById('btn-share').nextElementSibling.style.transform = "scale(1.2)";
        setTimeout(() => document.getElementById('btn-share').nextElementSibling.style.transform = "scale(1)", 500);
    }
}
