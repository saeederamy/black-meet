let ws;
let localStream;
let peerConnections = {};
const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
const clientId = Math.random().toString(36).substring(7);
let myRole = 'user';
let isScreenSharing = false;

async function login() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    
    if (!user || !pass) return;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        const result = await response.json();
        
        if (result.success) {
            myRole = result.role;
            document.getElementById('role-display').innerText = myRole.toUpperCase();
            
            if (myRole === 'admin') {
                document.getElementById('admin-controls').style.display = 'inline';
            }

            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('meet-screen').style.display = 'flex';

            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('local-video').srcObject = localStream;

            connectWebSocket();
        } else {
            alert("Authentication Failed!");
        }
    } catch (error) {
        alert("Server Connection Error.");
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${clientId}/${myRole}`);

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        switch (message.type) {
            case 'user-joined':
                createPeerConnection(message.client_id, true);
                break;
            case 'offer':
                handleOffer(message);
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
            case 'call-ended':
                alert('Admin has terminated the session.');
                window.location.reload();
                break;
            case 'force-action':
                if (message.action === 'mute-mic') toggleAudio(true);
                if (message.action === 'mute-cam') toggleVideo(true);
                break;
        }
    };
}

function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(configuration);
    peerConnections[peerId] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'ice-candidate', target: peerId, candidate: event.candidate, senderId: clientId }));
        }
    };

    pc.ontrack = event => { addRemoteVideo(peerId, event.streams[0]); };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', target: peerId, offer: offer, senderId: clientId }));
        });
    }
    return pc;
}

async function handleOffer(message) {
    const peerId = message.senderId;
    const pc = createPeerConnection(peerId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', target: peerId, answer: answer, senderId: clientId }));
}

async function handleAnswer(message) {
    const pc = peerConnections[message.senderId];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
}

async function handleIceCandidate(message) {
    const pc = peerConnections[message.senderId];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
}

function addRemoteVideo(peerId, stream) {
    if (document.getElementById(`video-${peerId}`)) return;
    
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = `container-${peerId}`;
    
    const video = document.createElement('video');
    video.id = `video-${peerId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    container.appendChild(video);

    const label = document.createElement('div');
    label.className = 'label';
    label.innerText = `User ${peerId.substring(0,4)}`;
    container.appendChild(label);

    if (myRole === 'admin') {
        const controls = document.createElement('div');
        controls.className = 'admin-video-controls';
        
        const muteMicBtn = document.createElement('button');
        muteMicBtn.innerText = 'Mute Mic';
        muteMicBtn.onclick = () => ws.send(JSON.stringify({ type: 'admin-action', action: 'mute-mic', target_id: peerId }));
        
        const muteCamBtn = document.createElement('button');
        muteCamBtn.innerText = 'Block Cam';
        muteCamBtn.onclick = () => ws.send(JSON.stringify({ type: 'admin-action', action: 'mute-cam', target_id: peerId }));

        controls.appendChild(muteMicBtn);
        controls.appendChild(muteCamBtn);
        container.appendChild(controls);
    }

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
    const track = localStream.getAudioTracks()[0];
    if (track) {
        track.enabled = forceMute ? false : !track.enabled;
        if (forceMute) alert("Admin muted your microphone.");
    }
}

function toggleVideo(forceMute = false) {
    const track = localStream.getVideoTracks()[0];
    if (track) {
        track.enabled = forceMute ? false : !track.enabled;
        if (forceMute) alert("Admin disabled your camera.");
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

            screenTrack.onended = () => {
                const videoTrack = localStream.getVideoTracks()[0];
                for (let id in peerConnections) {
                    const sender = peerConnections[id].getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                }
                document.getElementById('local-video').srcObject = localStream;
                isScreenSharing = false;
            };
        } catch (error) {}
    }
}

function sendChat() {
    const input = document.getElementById('chat-input');
    if (input.value.trim() !== '') {
        ws.send(JSON.stringify({ type: 'chat', text: input.value }));
        appendChat({ sender: 'You', role: myRole, text: input.value });
        input.value = '';
    }
}

document.getElementById('chat-input')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') sendChat();
});

function appendChat(msg) {
    const chatBox = document.getElementById('chat-messages');
    let senderName = msg.sender === 'You' ? 'You' : (msg.role === 'admin' ? 'Admin' : `User ${msg.sender.substring(0,4)}`);
    chatBox.innerHTML += `<div class="chat-msg"><b>${senderName}:</b> ${msg.text}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
}

function endCall() {
    if (confirm("End meeting for everyone?")) {
        ws.send(JSON.stringify({ type: 'admin-action', action: 'end-call' }));
    }
}
