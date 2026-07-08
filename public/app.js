const socket = io('/');
const videoGrid = document.getElementById('video-grid');

let myName = prompt("Ismingizni kiriting:") || "Mehmon_" + Math.floor(Math.random() * 1000);
document.getElementById('welcome-user').innerText = `Hush kelibsiz, ${myName}!`;

// Har bir foydalanuvchining o'z o'zgarmas tasodifiy Zoom ID raqami
const myZoomId = Math.floor(100000 + Math.random() * 900000).toString();
document.getElementById('room-display').innerHTML = `Sizning Xona ID: <span style="color: #ccff00; font-size: 20px;">${myZoomId}</span>`;

const peer = new Peer(myZoomId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true
});

let myStream;
let screenStream = null;
const connectedPeers = {};
let currentActiveRoomId = myZoomId; // Standart holatda guruh ID si o'zimizniki

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, `${myName} (Siz)`, myZoomId);

    // Xona egasi bo'lganimizda: Kimdir ruxsat olib bizga qo'ng'iroq qilsa javob beramiz
    peer.on('call', call => {
        call.answer(screenStream ? screenStream : myStream);
        call.on('stream', userRemoteStream => {
            const callerName = call.options.metadata ? call.options.metadata.username : "Suhbatdosh";
            addVideoStyle(userRemoteStream, callerName, call.peer);
        });
        connectedPeers[call.peer] = call;
    });
});

// Soketda ro'yxatdan o'tish
peer.on('open', id => {
    socket.emit('register-me', id, myName);
});

// 1. MEHMON: Xonaga kirish uchun so'rov tashlash
function askToJoin() {
    const targetId = document.getElementById('target-room-input').value.trim();
    if (!targetId) return alert("ID kiriting!");
    if (targetId === myZoomId) return alert("O'zingizni xonaga ulanolmaysiz!");

    document.getElementById('waiting-screen').style.display = 'flex';
    document.getElementById('waiting-text').innerText = `Xona egasidan ruxsat so'ralmoqda...`;

    socket.emit('request-join', targetId, myZoomId, myName);
}

// 2. XONA EGASI: Mehmondan so'rov kelganda modal oynani ochish
socket.on('join-request-received', (guestPeerId, guestName) => {
    const modal = document.getElementById('lobby-modal');
    document.getElementById('lobby-msg').innerText = `"${guestName}" xonangizga kirishga ruxsat so'rayapti.`;
    modal.style.display = 'block';

    // Ruxsat berish tugmasi
    document.getElementById('btn-admit').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'accepted', myName);
        modal.style.display = 'none';
        
        // Xona egasi sifatida guruh chatiga o'zimizni ham qo'shib qo'yamiz
        socket.emit('register-me', myZoomId, myName); 
    };

    // Rad etish tugmasi
    document.getElementById('btn-reject').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'rejected', myName);
        modal.style.display = 'none';
    };
});

// 3. MEHMON: Ruxsat berilganda chaqiriladigan qism
socket.on('join-accepted', (targetRoomId, hostName) => {
    document.getElementById('waiting-screen').style.display = 'none';
    currentActiveRoomId = targetRoomId; // Endi chat shu xonaga ketadi
    
    // Mehmon xona egasining virtual xonasiga chat uchun ulanadi
    socket.emit('register-me', targetRoomId, myName);

    // Xona egasiga to'g'ridan-to'g'ri WebRTC orqali qo'ng'iroq qilish
    const call = peer.call(targetRoomId, screenStream ? screenStream : myStream, {
        metadata: { username: myName }
    });

    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, hostName, targetRoomId);
    });

    call.on('close', () => { removeVideo(targetRoomId); });
    connectedPeers[targetRoomId] = call;
});

// 4. MEHMON: Rad etilganda chaqiriladigan qism
socket.on('join-rejected', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    alert("Xona egasi sizga kirishga ruxsat bermadi!");
});

// Chat tizimi (Faqat joriy faol xona uchun)
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

// Mikrofon / Kamera / Ekran boshqaruvlari
function toggleMute() {
    const enabled = myStream.getAudioTracks()[0].enabled;
    myStream.getAudioTracks()[0].enabled = !enabled;
    document.getElementById('mute-btn').innerText = !enabled ? "🎙️ Mikrofon: ON" : "🎙️ Mikrofon: OFF";
    document.getElementById('mute-btn').classList.toggle('off', enabled);
}

function toggleCamera() {
    const enabled = myStream.getVideoTracks()[0].enabled;
    myStream.getVideoTracks()[0].enabled = !enabled;
    document.getElementById('camera-btn').innerText = !enabled ? "📹 Kamera: ON" : "📹 Kamera: OFF";
    document.getElementById('camera-btn').classList.toggle('off', enabled);
}

function toggleScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                const videoTrack = screenStream.getVideoTracks()[0];
                document.getElementById(`div-${myZoomId}`).querySelector('video').srcObject = screenStream;

                Object.values(connectedPeers).forEach(call => {
                    const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                });
                shareBtn.innerText = "🛑 Ekran: OFF";
                shareBtn.classList.add('off');
                videoTrack.onended = () => { stopScreenShare(); };
            }).catch(err => console.log(err));
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    if (!screenStream) return;
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    document.getElementById(`div-${myZoomId}`).querySelector('video').srcObject = myStream;
    const cameraTrack = myStream.getVideoTracks()[0];
    Object.values(connectedPeers).forEach(call => {
        const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(cameraTrack);
    });
    shareBtn.innerText = "🖥️ Ekran";
    shareBtn.classList.remove('off');
}

function leaveRoom() {
    if (confirm("Xonadan chiqmoqchimisiz?")) {
        window.location.reload();
    }
}

function addVideoStyle(stream, titleText, peerId) {
    if (document.getElementById(`div-${peerId}`)) return;

    const box = document.createElement('div');
    box.id = `div-${peerId}`;
    box.className = 'video-box';

    const title = document.createElement('h4');
    title.innerText = titleText;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (peerId === myZoomId) video.muted = true;

    box.appendChild(title);
    box.appendChild(video);
    videoGrid.appendChild(box);
}

socket.on('user-disconnected', userId => {
    if (connectedPeers[userId]) connectedPeers[userId].close();
    removeVideo(userId);
});

function removeVideo(userId) {
    const videoDiv = document.getElementById(`div-${userId}`);
    if (videoDiv) videoDiv.remove();
}
