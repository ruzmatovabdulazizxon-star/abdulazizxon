const socket = io('/');
const videoGrid = document.getElementById('video-grid');

const myCustomPeerId = Math.floor(100000 + Math.random() * 900000).toString();

const peer = new Peer(myCustomPeerId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true
});

let myStream;
const connectedPeers = {}; 

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, "Siz (Kamera)", myCustomPeerId);

    peer.on('call', call => {
        call.answer(stream);
        call.on('stream', userRemoteStream => {
            addVideoStyle(userRemoteStream, `Suhbatdosh (${call.peer})`, call.peer);
        });
    });

    socket.on('user-connected', (userId) => {
        console.log('Yangi foydalanuvchi qo\'shildi: ' + userId);
        setTimeout(() => {
            connectToUser(userId, stream);
        }, 1000);
    });

}).catch(err => {
    console.error("Kamera ruxsatnomasi xatosi:", err);
});

peer.on('open', id => {
    document.getElementById('my-peer-id').innerHTML = `Sizning Xona ID: <span style="color: #ccff00; font-size: 22px;">${id}</span>`;
    socket.emit('join-room', 'main-room', id);
});

// Mikrofonni yoqish/o'chirish funksiyasi
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

// Kamerani yoqish/o'chirish funksiyasi
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

function connectToUser(userId, stream) {
    if (connectedPeers[userId]) return;

    const call = peer.call(userId, stream);
    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, `Suhbatdosh (${userId})`, userId);
    });

    call.on('close', () => {
        removeVideo(userId);
    });

    connectedPeers[userId] = call;
}

function connectToPeer() {
    const remotePeerId = document.getElementById('room-input').value.trim();
    if (!remotePeerId) return alert("Xona ID raqamini kiriting!");
    if (remotePeerId === myCustomPeerId) return alert("O'zingizga ulanolmaysiz!");
    
    connectToUser(remotePeerId, myStream);
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

socket.on('createMessage', (message, userId) => {
    const chat = document.getElementById('chat');
    chat.innerHTML += `<div><b>ID (${userId.substring(0,4)}):</b> ${message}</div>`;
    chat.scrollTop = chat.scrollHeight;
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input.value.trim() !== "") {
        socket.emit('message', input.value);
        const chat = document.getElementById('chat');
        chat.innerHTML += `<div><b>Siz:</b> ${input.value}</div>`;
        chat.scrollTop = chat.scrollHeight;
        input.value = "";
    }
}
