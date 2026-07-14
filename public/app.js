const socket = io('/');
const videoGrid = document.getElementById('video-grid');

let myName = "Mehmon";
let myZoomId = Math.floor(100000 + Math.random() * 900000).toString();
let peer;
let myStream = null;
let screenStream = null;
const connectedPeers = {};
let currentActiveRoomId = myZoomId;

// 1. Uchrashuvni boshlash (Foydalanuvchi ism kiritganidan keyin)
function startMeeting() {
    const inputName = document.getElementById('username-input').value.trim();
    if (!inputName) return alert("Iltimos ismingizni kiriting!");
    myName = inputName;

    // Kirish oynasini yashirish
    document.getElementById('join-panel').style.display = 'none';
    
    // Xona ID ma'lumotlarini o'rnatish
    document.getElementById('room-display').innerHTML = `<span style="color: #24d85f; font-weight: bold;">${myZoomId}</span>`;

    // Peer ulanishini yaratish
    initPeerConnection();
}

function initPeerConnection() {
    peer = new Peer(myZoomId, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelay',
                    credential: 'openrelay'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelay',
                    credential: 'openrelay'
                }
            ],
            'iceTransportPolicy': 'all',
            'iceCandidatePoolSize': 10
        }
    });

    const mediaConstraints = {
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
        },
        audio: true
    };

    navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then(stream => {
            myStream = stream;
            addVideoStyle(myStream, `${myName} (Siz)`, myZoomId);

            peer.on('call', call => {
                call.answer(screenStream ? screenStream : myStream);
                
                call.on('stream', userRemoteStream => {
                    const callerName = call.options.metadata ? call.options.metadata.username : "Suhbatdosh";
                    addVideoStyle(userRemoteStream, callerName, call.peer);
                });
                
                connectedPeers[call.peer] = call;
            });

            // Agar kirishda foydalanuvchi ID kiritgan bo'lsa, avtomatik ulanish so'rovini yuborish
            const targetId = document.getElementById('target-room-input').value.trim();
            if (targetId && targetId !== myZoomId) {
                askToJoin(targetId);
            }
        })
        .catch(err => {
            console.error(err);
            alert("Kameraga ulanib bo'lmadi. Kamera va mikrofonga ruxsat bering!");
        });

    peer.on('open', id => {
        socket.emit('register-me', id, myName);
    });
}

function askToJoin(targetId) {
    document.getElementById('waiting-screen').style.display = 'flex';
    document.getElementById('waiting-text').innerText = `Xona egasidan ruxsat so'ralmoqda...`;
    socket.emit('request-join', targetId, myZoomId, myName);
}

socket.on('join-request-received', (guestPeerId, guestName) => {
    const modal = document.getElementById('lobby-modal');
    document.getElementById('lobby-msg').innerText = `"${guestName}" xonangizga ulanishga ruxsat so'rayapti.`;
    modal.style.display = 'flex';

    document.getElementById('btn-admit').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'accepted', myName);
        modal.style.display = 'none';
    };

    document.getElementById('btn-reject').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'rejected', myName);
        modal.style.display = 'none';
    };
});

socket.on('join-accepted', (targetRoomId, hostName) => {
    document.getElementById('waiting-screen').style.display = 'none';
    currentActiveRoomId = targetRoomId;
    socket.emit('join-room-flow', targetRoomId, myZoomId);
    connectToNewUser(targetRoomId, hostName);
});

socket.on('user-joined-room', (newUserId) => {
    connectToNewUser(newUserId, "Suhbatdosh");
});

function connectToNewUser(userId, userName) {
    if (!myStream) return;
    const call = peer.call(userId, screenStream ? screenStream : myStream, {
        metadata: { username: myName }
    });

    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, userName, userId);
    });

    call.on('close', () => { removeVideo(userId); });
    connectedPeers[userId] = call;
}

socket.on('join-rejected', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    alert("Xonaga kirish ruxsati rad etildi!");
});

// DINAMIK VIDEOLAR GRIDI SOZLAMASI (Zoom shaklida)
function updateGridLayout() {
    const videoCount = videoGrid.childElementCount;
    if (videoCount === 0) return;

    let columns = 1;
    let rows = 1;

    if (videoCount === 2) {
        columns = 2; rows = 1;
    } else if (videoCount <= 4) {
        columns = 2; rows = 2;
    } else if (videoCount <= 6) {
        columns = 3; rows = 2;
    } else {
        columns = 3; rows = 3;
    }

    videoGrid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    videoGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
}

function addVideoStyle(stream, titleText, peerId) {
    let box = document.getElementById(`div-${peerId}`);
    
    if (!box) {
        box = document.createElement('div');
        box.id = `div-${peerId}`;
        box.className = 'video-box';

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        if (peerId === myZoomId) video.muted = true;

        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `<i class="fa-solid fa-microphone status-icon" id="mic-icon-${peerId}"></i> <span>${titleText}</span>`;

        box.appendChild(video);
        box.appendChild(overlay);
        videoGrid.appendChild(box);
    }
    
    const videoElement = box.querySelector('video');
    if (videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
    }

    updateGridLayout();
}

function removeVideo(userId) {
    const videoDiv = document.getElementById(`div-${userId}`);
    if (videoDiv) videoDiv.remove();
    updateGridLayout();
}

// CHAT FUNKSIYALARI
function toggleChat() {
    const sidebar = document.getElementById('chat-sidebar');
    sidebar.classList.toggle('closed');
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input.value.trim() !== "") {
        socket.emit('room-message', currentActiveRoomId, input.value, myName);
        input.value = "";
    }
}

socket.on('createMessage', (message, userName) => {
    const chatContainer = document.getElementById('chat-messages');
    const isMe = userName === myName;
    
    const msgElement = document.createElement('div');
    msgElement.className = `chat-msg ${isMe ? 'me' : ''}`;
    msgElement.innerHTML = `
        <div class="msg-meta">${isMe ? 'Siz' : userName}</div>
        <div>${message}</div>
    `;
    
    chatContainer.appendChild(msgElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
});

// OVOZ / KAMERA tugmalari holatlari
function toggleMute() {
    if (!myStream) return;
    const audioTrack = myStream.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    const btn = document.getElementById('mute-btn');
    const myMicIcon = document.getElementById(`mic-icon-${myZoomId}`);

    if (audioTrack.enabled) {
        btn.innerHTML = `<i class="fa-solid fa-microphone"></i><span>Ovozni o'chirish</span>`;
        btn.classList.remove('off');
        if (myMicIcon) myMicIcon.className = "fa-solid fa-microphone status-icon";
    } else {
        btn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i><span>Ovozni yoqish</span>`;
        btn.classList.add('off');
        if (myMicIcon) myMicIcon.className = "fa-solid fa-microphone-slash status-icon muted";
    }
}

function toggleCamera() {
    if (!myStream) return;
    const videoTrack = myStream.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    const btn = document.getElementById('camera-btn');

    if (videoTrack.enabled) {
        btn.innerHTML = `<i class="fa-solid fa-video"></i><span>Kamerani o'chirish</span>`;
        btn.classList.remove('off');
    } else {
        btn.innerHTML = `<i class="fa-solid fa-video-slash"></i><span>Kamerani yoqish</span>`;
        btn.classList.add('off');
    }
}

// EKRAN ULASHISH
function toggleScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                const videoTrack = screenStream.getVideoTracks()[0];

                const myVideoBox = document.getElementById(`div-${myZoomId}`);
                if (myVideoBox) {
                    myVideoBox.querySelector('video').srcObject = screenStream;
                }

                Object.values(connectedPeers).forEach(call => {
                    if (call.peerConnection) {
                        const senders = call.peerConnection.getSenders();
                        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                        if (videoSender) videoSender.replaceTrack(videoTrack);
                    }
                });

                shareBtn.innerHTML = `<i class="fa-solid fa-stop"></i><span>Ulashishni to'xtatish</span>`;
                shareBtn.classList.add('off');

                videoTrack.onended = () => { stopScreenShare(); };
            })
            .catch(err => console.log(err));
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    if (!screenStream) return;

    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    const myVideoBox = document.getElementById(`div-${myZoomId}`);
    if (myVideoBox) {
        myVideoBox.querySelector('video').srcObject = myStream;
    }

    const cameraTrack = myStream.getVideoTracks()[0];
    Object.values(connectedPeers).forEach(call => {
        if (call.peerConnection) {
            const senders = call.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) videoSender.replaceTrack(cameraTrack);
        }
    });

    shareBtn.innerHTML = `<i class="fa-solid fa-desktop"></i><span>Ekran ulashish</span>`;
    shareBtn.classList.remove('off');
}

function leaveRoom() {
    if (confirm("Uchrashuvdan chiqmoqchimisiz?")) {
        window.location.reload();
    }
}

socket.on('user-disconnected', userId => {
    if (connectedPeers[userId]) connectedPeers[userId].close();
    removeVideo(userId);
});
