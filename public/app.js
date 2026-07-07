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
let screenStream = null; 
const connectedPeers = {}; 

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, `${myName} (Siz)`, myCustomPeerId);

    peer.on('call', call => {
        const callerName = call.options.metadata ? call.options.metadata.username : `Suhbatdosh (${call.peer})`;
        const streamToSend = screenStream ? screenStream : myStream;
        call.answer(streamToSend);
        
        call.on('stream', userRemoteStream => {
            addVideoStyle(userRemoteStream, callerName, call.peer);
        });
    });

    socket.on('user-connected', (userId, remoteUserName) => {
        console.log(`${remoteUserName} xonaga qo'shildi.`);
        setTimeout(() => {
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

function toggleMute() {
    const enabled = myStream.getAudioTracks()[0].enabled;
    const btn = document.getElementById('mute-btn');
    if (enabled) {
        myStream.getAudioTracks()[0].enabled = false;
        btn.innerText = "🎙️ Mikrofon: OFF";
        btn.classList.add('unmuted');
    } else {
        myStream.getAudioTracks()[0].enabled = true;
        btn.innerText = "🎙️ Mikrofon: ON";
        btn.classList.remove('unmuted');
    }
}

function toggleCamera() {
    const enabled = myStream.getVideoTracks()[0].enabled;
    const btn = document.getElementById('camera-btn');
    if (enabled) {
        myStream.getVideoTracks()[0].enabled = false;
        btn.innerText = "📹 Kamera: OFF";
        btn.classList.add('unmuted');
    } else {
        myStream.getVideoTracks()[0].enabled = true;
        btn.innerText = "📹 Kamera: ON";
        btn.classList.remove('unmuted');
    }
}

function toggleScreenShare() {
    const shareBtn = document.getElementById('share-btn');

    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                const videoTrack = screenStream.getVideoTracks()[0];

                const myVideoElement = document.getElementById(`div-${myCustomPeerId}`).querySelector('video');
                myVideoElement.srcObject = screenStream;

                Object.values(connectedPeers).forEach(call => {
                    const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                });

                shareBtn.innerText = "🛑 Ekran: To'xtatish";
                shareBtn.classList.add('sharing');

                videoTrack.onended = () => { stopScreenShare(); };
            }).catch(err => console.error("Ekran ulashishda xato:", err));
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    const shareBtn = document.getElementById('share-btn');
    if (!screenStream) return;

    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    const myVideoElement = document.getElementById(`div-${myCustomPeerId}`).querySelector('video');
    myVideoElement.srcObject = myStream;

    const cameraTrack = myStream.getVideoTracks()[0];
    Object.values(connectedPeers).forEach(call => {
        const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(cameraTrack);
    });

    shareBtn.innerText = "🖥️ Ekran";
    shareBtn.remove('sharing');
}

// 👋 XONADAN ChIQISh FUNKSIYASI
function leaveRoom() {
    const confirmLeave = confirm("Xonani tark etishni xohlaysizmi?");
    if (!confirmLeave) return;

    // 1. Ekran yoki kamera oqimlarini butunlay o'chirish (Kamera chirog'ini o'chirish)
    if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }

    // 2. PeerJS va barcha faol qo'ng'iroqlarni yopish
    Object.values(connectedPeers).forEach(call => call.close());
    peer.destroy();

    // 3. Soket aloqasini uzish
    socket.disconnect();

    // 4. Foydalanuvchini platformadan chiqib ketganligi haqida xabar oynasiga yo'naltirish
    document.body.innerHTML = `
        <div style="margin-top: 100px; text-align: center;">
            <h1 style="color: #8ab4f8;">Konferensiya yakunlandi</h1>
            <p style="color: #aaa; font-size: 18px;">Siz xonadan chiroyli tarzda chiqdingiz.</p>
            <button onclick="window.location.reload()" style="padding: 12px 25px; font-size: 16px; margin-top: 20px;">Qayta kirish</button>
        </div>
    `;
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
