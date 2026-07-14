const socket = io('/');
const videoGrid = document.getElementById('video-grid');

let myName = prompt("Ismingizni kiriting:") || "Mehmon_" + Math.floor(Math.random() * 1000);
document.getElementById('welcome-user').innerText = `Hush kelibsiz, ${myName}!`;

const myZoomId = Math.floor(100000 + Math.random() * 900000).toString();
document.getElementById('room-display').innerHTML = `Sizning Xona ID: <span style="color: #ccff00; font-size: 20px;">${myZoomId}</span>`;

// YANGI VA BARQAROR BULUTLI PEERJS SOZLAMALARI (Render-dan butunlay mustaqil)
const peer = new Peer(myZoomId, {
    host: '0.peerjs.com', // Global Bulutli PeerJS Signaling Serverdan foydalanamiz
    port: 443,
    secure: true,
    config: {
        'iceServers': [
            // Google ochiq STUN serverlari
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            
            // Metered Global TURN serverlar (Mobil operatorlar NAT/Firewall to'siqlarini yorib o'tish uchun)
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelay',
                credential: 'openrelay'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelay',
                credential: 'openrelay'
            },
            {
                urls: 'turns:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelay',
                credential: 'openrelay'
            }
        ],
        // Mobil aloqada (UDP cheklangan bo'lsa) ulanishni majburiy TCP orqali ulash
        'iceTransportPolicy': 'all', 
        'iceCandidatePoolSize': 10
    }
});

let myStream = null;
let screenStream = null;
const connectedPeers = {};
let currentActiveRoomId = myZoomId; 

// Mobil brauzerlarda kamera muammolarini chetlab o'tish uchun o'lchamni optimallashtiramiz
const mediaConstraints = {
    video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 },
        facingMode: "user" // Old kamera
    },
    audio: true
};

navigator.mediaDevices.getUserMedia(mediaConstraints)
    .then(stream => {
        myStream = stream;
        addVideoStyle(myStream, `${myName} (Siz)`, myZoomId);

        // Kiruvchi video qo'ng'iroqlarga javob berish
        peer.on('call', call => {
            call.answer(screenStream ? screenStream : myStream);
            
            call.on('stream', userRemoteStream => {
                const callerName = call.options.metadata ? call.options.metadata.username : "Suhbatdosh";
                addVideoStyle(userRemoteStream, callerName, call.peer);
            });
            
            connectedPeers[call.peer] = call;
        });
    })
    .catch(err => {
        console.error("Kameraga ulanishda xatolik:", err);
        alert("Xatolik: Iltimos brauzeringizda kamera va mikrofonga ruxsat bering!");
    });

peer.on('open', id => {
    socket.emit('register-me', id, myName);
});

peer.on('error', err => {
    console.error("PeerJS Xatoligi yuz berdi:", err.type);
    if(err.type === 'peer-unavailable') {
        console.log("Ulanmoqchi bo'lgan foydalanuvchi tarmoqdan uzilgan yoki topilmadi.");
    }
});

// 1. MEHMON: Kirish so'rovini yuborish
function askToJoin() {
    const targetId = document.getElementById('target-room-input').value.trim();
    if (!targetId) return alert("ID kiriting!");
    if (targetId === myZoomId) return alert("O'zingizni xonaga ulanolmaysiz!");

    document.getElementById('waiting-screen').style.display = 'flex';
    document.getElementById('waiting-text').innerText = `Xona egasidan ruxsat so'ralmoqda...`;

    socket.emit('request-join', targetId, myZoomId, myName);
}

// 2. FAQAT HAQIQIY ADMIN: So'rov faqat adminda ko'rinadi
socket.on('join-request-received', (guestPeerId, guestName) => {
    const modal = document.getElementById('lobby-modal');
    document.getElementById('lobby-msg').innerText = `"${guestName}" xonangizga kirishga ruxsat so'rayapti.`;
    modal.style.display = 'block';

    document.getElementById('btn-admit').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'accepted', myName);
        modal.style.display = 'none';
    };

    document.getElementById('btn-reject').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'rejected', myName);
        modal.style.display = 'none';
    };
});

// 3. MEHMON: Admin ruxsat berganidan keyin ishga tushadi
socket.on('join-accepted', (targetRoomId, hostName) => {
    document.getElementById('waiting-screen').style.display = 'none';
    currentActiveRoomId = targetRoomId; 
    
    socket.emit('join-room-flow', targetRoomId, myZoomId);
    connectToNewUser(targetRoomId, hostName);
});

// 4. XONADAGI MEHMONLAR: Yangi mehmon kirganida u bilan ulanish
socket.on('user-joined-room', (newUserId) => {
    connectToNewUser(newUserId, "Suhbatdosh");
});

function connectToNewUser(userId, userName) {
    if (!myStream) {
        console.warn("Mahalliy kamera oqimi tayyor emas.");
        return;
    }
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
    alert("Xona egasi sizga kirishga ruxsat bermadi!");
});

// MIKROFON boshqaruvi
function toggleMute() {
    if (!myStream) return alert("Mikrofon yuklanmagan!");
    const audioTrack = myStream.getAudioTracks()[0];
    if (!audioTrack) return alert("Mikrofon topilmadi!");

    const enabled = audioTrack.enabled;
    audioTrack.enabled = !enabled;

    Object.values(connectedPeers).forEach(call => {
        if (call.peerConnection) {
            const audioSender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
            if (audioSender) audioSender.track.enabled = !enabled;
        }
    });

    const btn = document.getElementById('mute-btn');
    if (enabled) {
        btn.innerText = "🎙️ Mikrofon: OFF";
        btn.classList.add('off');
    } else {
        btn.innerText = "🎙️ Mikrofon: ON";
        btn.classList.remove('off');
    }
}

// KAMERA boshqaruvi
function toggleCamera() {
    if (!myStream) return alert("Kamera yuklanmagan!");
    const videoTrack = myStream.getVideoTracks()[0];
    if (!videoTrack) return alert("Kamera topilmadi!");

    const enabled = videoTrack.enabled;
    videoTrack.enabled = !enabled;

    Object.values(connectedPeers).forEach(call => {
        if (call.peerConnection) {
            const videoSender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) videoSender.track.enabled = !enabled;
        }
    });

    const btn = document.getElementById('camera-btn');
    if (enabled) {
        btn.innerText = "📹 Kamera: OFF";
        btn.classList.add('off');
    } else {
        btn.innerText = "📹 Kamera: ON";
        btn.classList.remove('off');
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

                const myVideoElement = document.getElementById(`div-${myZoomId}`).querySelector('video');
                myVideoElement.srcObject = screenStream;

                Object.values(connectedPeers).forEach(call => {
                    if (call.peerConnection) {
                        const senders = call.peerConnection.getSenders();
                        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                        if (videoSender) {
                            videoSender.replaceTrack(videoTrack);
                        }
                    }
                });

                shareBtn.innerText = "🛑 Ekran: OFF";
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

    const myVideoElement = document.getElementById(`div-${myZoomId}`).querySelector('video');
    myVideoElement.srcObject = myStream;

    const cameraTrack = myStream.getVideoTracks()[0];
    Object.values(connectedPeers).forEach(call => {
        if (call.peerConnection) {
            const senders = call.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
                videoSender.replaceTrack(cameraTrack);
            }
        }
    });

    shareBtn.innerText = "🖥️ Ekran";
    shareBtn.classList.remove('off');
}

function leaveRoom() {
    if (confirm("Xonadan chiqmoqchimisiz?")) {
        window.location.reload();
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
    const chat = document.getElementById('chat');
    const isMe = userName === myName;
    chat.innerHTML += `<div><b style="color: ${isMe ? '#ccff00' : '#8ab4f8'}">${isMe ? 'Siz' : userName}:</b> ${message}</div>`;
    chat.scrollTop = chat.scrollHeight;
});

function addVideoStyle(stream, titleText, peerId) {
    let box = document.getElementById(`div-${peerId}`);
    
    if (!box) {
        box = document.createElement('div');
        box.id = `div-${peerId}`;
        box.className = 'video-box';

        const title = document.createElement('h4');
        title.innerText = titleText;

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        if (peerId === myZoomId) {
            video.muted = true; // O'z ovozi aks-sado bermasligi uchun
        }

        box.appendChild(title);
        box.appendChild(video);
        videoGrid.appendChild(box);
    }
    
    const videoElement = box.querySelector('video');
    if (videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
    }
}

socket.on('user-disconnected', userId => {
    if (connectedPeers[userId]) connectedPeers[userId].close();
    removeVideo(userId);
});

function removeVideo(userId) {
    const videoDiv = document.getElementById(`div-${userId}`);
    if (videoDiv) videoDiv.remove();
}
