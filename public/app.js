const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// URL dan Xona ID sini ajratib olish (Masalan: /352 -> 352)
const ROOM_ID = window.location.pathname.split('/')[1];
document.getElementById('room-display').innerText = `Xona Kodi: ${ROOM_ID}`;

let myName = prompt("Ismingizni kiriting:") || "Mehmon_" + Math.floor(Math.random() * 1000);
document.getElementById('welcome-user').innerText = `Hush kelibsiz, ${myName}!`;

// Har bir foydalanuvchi uchun unikal Peer ID
const myCustomPeerId = Math.floor(100000 + Math.random() * 900000).toString();

const peer = new Peer(myCustomPeerId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true
});

let myStream;
let screenStream = null;
const connectedPeers = {};

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, `${myName} (Siz)`, myCustomPeerId);

    // Qo'ng'iroqlarga javob berish
    peer.on('call', call => {
        const callerName = call.options.metadata ? call.options.metadata.username : "Suhbatdosh";
        call.answer(screenStream ? screenStream : myStream);
        
        call.on('stream', userRemoteStream => {
            addVideoStyle(userRemoteStream, callerName, call.peer);
        });
        connectedPeers[call.peer] = call;
    });

    // Yangi foydalanuvchi ulanganda unga avtomatik qo'ng'iroq qilish
    socket.on('user-connected', (userId, remoteUserName) => {
        console.log(`${remoteUserName} ulandi.`);
        setTimeout(() => {
            connectToUser(userId, screenStream ? screenStream : myStream, remoteUserName);
        }, 1000);
    });

}).catch(err => {
    alert("Kamera yoki mikrofonga ruxsat berilmadi!");
});

// Peer ulangach, soket orqali aynan shu XONAGA qo'shilish
peer.on('open', id => {
    socket.emit('join-room', ROOM_ID, id, myName);
});

function connectToUser(userId, stream, remoteUserName) {
    if (connectedPeers[userId]) return;

    const call = peer.call(userId, stream, {
        metadata: { username: myName }
    });

    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, remoteUserName, userId);
    });

    call.on('close', () => {
        removeVideo(userId);
    });

    connectedPeers[userId] = call;
}

// Mikrofon boshqaruvi
function toggleMute() {
    const enabled = myStream.getAudioTracks()[0].enabled;
    const btn = document.getElementById('mute-btn');
    myStream.getAudioTracks()[0].enabled = !enabled;
    btn.innerText = !enabled ? "🎙️ Mikrofon: ON" : "🎙️ Mikrofon: OFF";
    btn.classList.toggle('off', enabled);
}

// Kamera boshqaruvi
function toggleCamera() {
    const enabled = myStream.getVideoTracks()[0].enabled;
    const btn = document.getElementById('camera-btn');
    myStream.getVideoTracks()[0].enabled = !enabled;
    btn.innerText = !enabled ? "📹 Kamera: ON" : "📹 Kamera: OFF";
    btn.classList.toggle('off', enabled);
}

// Ekran ulashish
function toggleScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                const videoTrack = screenStream.getVideoTracks()[0];
                document.getElementById(`div-${myCustomPeerId}`).querySelector('video').srcObject = screenStream;

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

    document.getElementById(`div-${myCustomPeerId}`).querySelector('video').srcObject = myStream;
    const cameraTrack = myStream.getVideoTracks()[0];
    Object.values(connectedPeers).forEach(call => {
        const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(cameraTrack);
    });
    shareBtn.innerText = "🖥️ Ekran ulashish";
    shareBtn.classList.remove('off');
}

// Xonadan chiqish
function leaveRoom() {
    if (confirm("Xonadan chiqmoqchimisiz?")) {
        if (myStream) myStream.getTracks().forEach(track => track.stop());
        if (screenStream) screenStream.getTracks().forEach(track => track.stop());
        peer.destroy();
        socket.disconnect();
        document.body.innerHTML = `<h1 style='margin-top:100px;'>Xonadan chiqdingiz.</h1><button onclick='window.location.href="/"'>Yangi xona ochish</button>`;
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
    if (peerId === myCustomPeerId) video.muted = true;

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

socket.on('createMessage', (message, userId, userName) => {
    const chat = document.getElementById('chat');
    const isMe = userId === myCustomPeerId;
    chat.innerHTML += `<div><b style="color: ${isMe ? '#ccff00' : '#8ab4f8'}">${userName}:</b> ${message}</div>`;
    chat.scrollTop = chat.scrollHeight;
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input.value.trim() !== "") {
        socket.emit('message', input.value);
        input.value = "";
    }
}
