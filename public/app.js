const socket = io('/');
const videoGrid = document.getElementById('video-grid');

let myName = prompt("Iltimos, ismingizni kiriting:") || "Mehmon_" + Math.floor(Math.random() * 1000);
document.getElementById('welcome-user').innerText = `Hush kelibsiz, ${myName}!`;

const myCustomPeerId = Math.floor(100000 + Math.random() * 900000).toString();

const peer = new Peer(myCustomPeerId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true
});

let myStream;
let screenStream = null; // Ekran oqimi uchun o'zgaruvchi
const connectedPeers = {}; 

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, `${myName} (Siz)`, myCustomPeerId);

    peer.on('call', call => {
        const callerName = call.options.metadata ? call.options.metadata.username : `Suhbatdosh (${call.peer})`;
        
        // Agar hozir ekranni ulashayotgan bo'lsak, yangi ulanayotgan odamga kamerani emas, ekranni beramiz
        const streamToSend = screenStream ? screenStream : myStream;
        call.answer(streamToSend);
        
        call.on('stream', userRemoteStream => {
            addVideoStyle(userRemoteStream, callerName, call.peer);
        });
    });

    socket.on('user-connected', (userId, remoteUserName) => {
        console.log(`${remoteUserName} xonaga qo'shildi.`);
        setTimeout(() => {
            // Agar ekranni ulashayotgan bo'lsak, unga ham ekran oqimini yuboramiz
            const streamToSend = screenStream ? screenStream : myStream;
            connectToUser(userId, streamToSend, remoteUserName);
        }, 1000);
    });

}).catch(err => {
    console.error("Kamera ruxsatnomasi xatosi:", err);
});

peer.on('open', id => {
    document.getElementById('my-peer-id').innerHTML = `Sizning ID: <span style="color: #ccff00; font-size: 22px;">${id}</span>`;
    socket.emit('join-room', 'main-room', id, myName);
});

// Mikrofon boshqaruvi
function toggleMute() {
    const enabled = myStream.getAudioTracks()[0].enabled;
    const btn = document.getElementById('mute-btn');
    if (enabled) {
        myStream.getAudioTracks()[0].enabled = false;
        btn.innerText = "🎙️ Mikrofonni Yoqish";
        btn.classList.add('unmuted');
    } else {
        myStream.getAudioTracks()[0].enabled = true;
        btn.innerText = "🎙️ Mikrofonni O'chirish";
        btn.classList.remove('unmuted');
    }
}

// Kamera boshqaruvi
function toggleCamera() {
    const enabled = myStream.getVideoTracks()[0].enabled;
    const btn = document.getElementById('camera-btn');
    if (enabled) {
        myStream.getVideoTracks()[0].enabled = false;
        btn.innerText = "📹 Kamerani Yoqish";
        btn.classList.add('unmuted');
    } else {
        myStream.getVideoTracks()[0].enabled = true;
        btn.innerText = "📹 Kamerani O'chirish";
        btn.classList.remove('unmuted');
    }
}

// 🖥️ EKYaN ULAShISh FUNKSIYASI
function toggleScreenShare() {
    const shareBtn = document.getElementById('share-btn');

    // Agar ekran ulashish hali yoqilmagan bo'lsa (Yoqish bosilganda)
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                const videoTrack = screenStream.getVideoTracks()[0];

                // O'zimizning ekranimizdagi videoni o'zgartiramiz
                const myVideoElement = document.getElementById(`div-${myCustomPeerId}`).querySelector('video');
                myVideoElement.srcObject = screenStream;

                // Xonadagi barcha suhbatdoshlarga video oqimni almashtirib yuboramiz (Replace Track)
                Object.values(connectedPeers).forEach(call => {
                    const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                });

                shareBtn.innerText = "🛑 Ulashishni To'xtatish";
                shareBtn.classList.add('sharing');

                // Agar foydalanuvchi brauzerning o'zidan "Dostup zakrit" (Stop sharing) tugmasini bossa
                videoTrack.onended = () => {
                    stopScreenShare();
                };
            }).catch(err => console.error("Ekran ulashishda xato:", err));
    } else {
        // Agar allaqachon ulashilayotgan bo'lsa (To'xtatish bosilganda)
        stopScreenShare();
    }
}

// Ekranni ulashishni to'xtatish va kameraga qaytish logikasi
function stopScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    if (!screenStream) return;

    // Ekran oqimini to'xtatamiz
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    // O'zimizning oynamizga kamerani qaytaramiz
    const myVideoElement = document.getElementById(`div-${myCustomPeerId}`).querySelector('video');
    myVideoElement.srcObject = myStream;

    // Barcha suhbatdoshlarga kamera oqimini qaytarib yuboramiz
    const cameraTrack = myStream.getVideoTracks()[0];
    Object.values(connectedPeers).forEach(call => {
        const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(cameraTrack);
    });

    shareBtn.innerText = "🖥️ Ekranni Ulashish";
    shareBtn.classList.remove('sharing');
}

function connectToUser(userId, stream, remoteUserName) {
    if (connectedPeers[userId]) return;

    const call = peer.call(userId, stream, {
        metadata: { username: myName }
    });

    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, remoteUserName || `Suhbatdosh (${userId})`, userId);
    });

    call.on('close', () => {
        removeVideo(userId);
    });

    connectedPeers[userId] = call;
}

function connectToPeer() {
    const remotePeerId = document.getElementById('room-input').value.trim();
    if (!remotePeerId) return alert("ID raqamini kiriting!");
    if (remotePeerId === myCustomPeerId) return alert("O'zingizga ulanolmaysiz!");
    
    const streamToSend = screenStream ? screenStream : myStream;
    connectToUser(remotePeerId, streamToSend, `Suhbatdosh (${remotePeerId})`);
}

function addVideoStyle(stream, titleText, peerId) {
    if (document.getElementById(`div-${peerId}`)) {
        document.getElementById(`title-${peerId}`).innerText = titleText;
        return;
    }

    const box = document.createElement('div');
    box.id = `div-${peerId}`;
    box.className = 'video-box';

    const title = document.createElement('h4');
    title.id = `title-${peerId}`;
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
    chat.innerHTML += `<div><b style="color: #8ab4f8;">${userName}:</b> ${message}</div>`;
    chat.scrollTop = chat.scrollHeight;
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input.value.trim() !== "") {
        socket.emit('message', input.value, myName);
        const chat = document.getElementById('chat');
        chat.innerHTML += `<div><b style="color: #ccff00;">Siz:</b> ${input.value}</div>`;
        chat.scrollTop = chat.scrollHeight;
        input.value = "";
    }
}
