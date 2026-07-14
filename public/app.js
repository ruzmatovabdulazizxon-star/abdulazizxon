const socket = io('/');
const videoGrid = document.getElementById('video-grid');

let myName = prompt("Ismingizni kiriting:") || "Mehmon_" + Math.floor(Math.random() * 1000);
document.getElementById('welcome-user').innerText = `Hush kelibsiz, ${myName}!`;

const myZoomId = Math.floor(100000 + Math.random() * 900000).toString();
document.getElementById('room-display').innerHTML = `Sizning Xona ID: <span style="color: #ccff00; font-size: 20px;">${myZoomId}</span>`;

// YANGILANGAN PEERJS SOZLAMALARI (Mobil tarmoqlar va turli internet provayderlar uchun STUN/TURN serverlari bilan)
const peer = new Peer(myZoomId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true,
    config: {
        'iceServers': [
            // Google bepul STUN serverlari (IP manzillarni to'g'ri aniqlash uchun)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            
            // Metered bepul umumiy TURN serverlari (Mobil internet (NAT/Firewall) to'siqlarini aylanib o'tish uchun)
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
        ]
    }
});

let myStream;
let screenStream = null;
const connectedPeers = {};
let currentActiveRoomId = myZoomId; 

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, `${myName} (Siz)`, myZoomId);

    // Kiruvchi qo'ng'iroqlarni qabul qilish (Xona egasi yoki xonadagi boshqa mehmonlardan)
    peer.on('call', call => {
        call.answer(screenStream ? screenStream : myStream);
        
        call.on('stream', userRemoteStream => {
            const callerName = call.options.metadata ? call.options.metadata.username : "Suhbatdosh";
            addVideoStyle(userRemoteStream, callerName, call.peer);
        });
        
        connectedPeers[call.peer] = call;
    });
});

peer.on('open', id => {
    socket.emit('register-me', id, myName);
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

// 2. FAQAT HAQIQIY ADMIN (HOST): So'rov faqat adminda ko'rinadi, mehmonlarda chiqmaydi
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

    // To'g'ridan to'g'ri Admin bilan video aloqa ulanishini hosil qilamiz
    connectToNewUser(targetRoomId, hostName);
});

// 4. XONADAGI MEHMONLAR: Yangi mehmon kirganida u bilan avtomatik ulanish
socket.on('user-joined-room', (newUserId) => {
    // Yangi kelgan foydalanuvchi bilan ulanishni yaratamiz
    connectToNewUser(newUserId, "Suhbatdosh");
});

// PeerJS ulanish funksiyasi
function connectToNewUser(userId, userName) {
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

// SINXRON EKRAN ULASHISH (F5-siz ishlaydi)
function toggleScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                const videoTrack = screenStream.getVideoTracks()[0];

                const myVideoElement = document.getElementById(`div-${myZoomId}`).querySelector('video');
                myVideoElement.srcObject = screenStream;

                // Barcha ulangan suhbatdoshlarga video oqimni yangilaymiz
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
            .catch(err => console.log("Ekran ulashishda xatolik: ", err));
    } else {
        stopScreenShare();
    }
}

// EKRAN ULASHISHNI TO'XTATISH
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

// LEAVE ROOM
function leaveRoom() {
    if (confirm("Xonadan chiqmoqchimisiz?")) {
        window.location.reload();
    }
}

// CHAT TIZIMI
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

// HTML-GA VIDEO ELEMENTLARINI QO'SHISH
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
        if (peerId === myZoomId) video.muted = true; // O'zimizning ovozimiz qaytib eshitilmasligi uchun

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
