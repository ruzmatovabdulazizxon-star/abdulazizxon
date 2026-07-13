const socket = io('/');
const videoGrid = document.getElementById('video-grid');

let myName = prompt("Ismingizni kiriting:") || "Mehmon_" + Math.floor(Math.random() * 1000);
document.getElementById('welcome-user').innerText = `Hush kelibsiz, ${myName}!`;

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
let currentActiveRoomId = myZoomId; 

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, `${myName} (Siz)`, myZoomId);

    peer.on('call', call => {
        // Agar ekran ulashilgan bo'lsa ekran oqimini, yo'qsa kamera oqimini yuboramiz
        call.answer(screenStream ? screenStream : myStream);
        
        // Narigi tomondan oqim kelsa uni ekranga chiqaramiz
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

// 1. MEHMON: Xonaga ulanish so'rovi
function askToJoin() {
    const targetId = document.getElementById('target-room-input').value.trim();
    if (!targetId) return alert("ID kiriting!");
    if (targetId === myZoomId) return alert("O'zingizni xonaga ulanolmaysiz!");

    document.getElementById('waiting-screen').style.display = 'flex';
    document.getElementById('waiting-text').innerText = `Xona egasidan ruxsat so'ralmoqda...`;

    socket.emit('request-join', targetId, myZoomId, myName);
}

// 2. XONA EGASI: So'rov kelganda modalni ko'rsatish
socket.on('join-request-received', (guestPeerId, guestName) => {
    const modal = document.getElementById('lobby-modal');
    document.getElementById('lobby-msg').innerText = `"${guestName}" xonangizga kirishga ruxsat so'rayapti.`;
    modal.style.display = 'block';

    document.getElementById('btn-admit').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'accepted', myName);
        modal.style.display = 'none';
        socket.emit('register-me', myZoomId, myName); 
    };

    document.getElementById('btn-reject').onclick = () => {
        socket.emit('join-response', guestPeerId, myZoomId, 'rejected', myName);
        modal.style.display = 'none';
    };
});

// 3. MEHMON: Ruxsat berilganda ulanish
socket.on('join-accepted', (targetRoomId, hostName) => {
    document.getElementById('waiting-screen').style.display = 'none';
    currentActiveRoomId = targetRoomId; 
    
    socket.emit('register-me', targetRoomId, myName);

    const call = peer.call(targetRoomId, screenStream ? screenStream : myStream, {
        metadata: { username: myName }
    });

    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, hostName, targetRoomId);
    });

    call.on('close', () => { removeVideo(targetRoomId); });
    connectedPeers[targetRoomId] = call;
});

socket.on('join-rejected', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    alert("Xona egasi sizga kirishga ruxsat bermadi!");
});

// MIKROFONNI O'CHIRISH FUNKSIYASI
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

// KAMERANI O'CHIRISH FUNKSIYASI
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

// 🖥️ AKTIIV VA SINXRON EKRAN ULASHISH FUNKSIYASI (F5-SIZ ISHLAYDI)
function toggleScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                const videoTrack = screenStream.getVideoTracks()[0];

                // 1. O'zimizning ekrandagi videoni kamera oqimidan ekran oqimiga almashtiramiz
                const myVideoElement = document.getElementById(`div-${myZoomId}`).querySelector('video');
                myVideoElement.srcObject = screenStream;

                // 2. Hozir ulangan barcha foydalanuvchilarga yangi ekran trekini srazu yuboramiz
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

                // Agar foydalanuvchi "Ekran ulashishni to'xtatish" brauzer tugmasini bossa
                videoTrack.onended = () => { stopScreenShare(); };
            })
            .catch(err => console.log("Ekran ulashishda xatolik: ", err));
    } else {
        stopScreenShare();
    }
}

// EKRAN ULASHISHNI TO'XTATISH VA KAMERAGA QAYTISH
function stopScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    if (!screenStream) return;

    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    // 1. O'zimizning videoni kameraga qaytaramiz
    const myVideoElement = document.getElementById(`div-${myZoomId}`).querySelector('video');
    myVideoElement.srcObject = myStream;

    // 2. Kamera trekini qaytadan barcha suhbatdoshlarga srazu uzatamiz
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

// XONADAN CHIQISH
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
        if (peerId === myZoomId) video.muted = true;

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
