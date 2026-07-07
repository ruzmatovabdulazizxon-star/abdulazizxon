const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// Saytga kirganda foydalanuvchidan ismini so'raymiz
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
const connectedPeers = {}; 

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    // O'zimizning ismimiz bilan ekranga chiqaramiz
    addVideoStyle(myStream, `${myName} (Siz)`, myCustomPeerId);

    // Kimdir bizga qo'ng'iroq qilsa
    peer.on('call', call => {
        // Qo'ng'iroq qilgan odamning ismini uning yuborgan metadata ma'lumotidan olamiz
        const callerName = call.options.metadata ? call.options.metadata.username : `Suhbatdosh (${call.peer})`;
        
        call.answer(stream);
        call.on('stream', userRemoteStream => {
            addVideoStyle(userRemoteStream, callerName, call.peer);
        });
    });

    // SOKET: Yangi odam qo'shilsa uning ID va ismini qabul qilamiz
    socket.on('user-connected', (userId, remoteUserName) => {
        console.log(`${remoteUserName} xonaga qo'shildi.`);
        setTimeout(() => {
            connectToUser(userId, stream, remoteUserName);
        }, 1000);
    });

}).catch(err => {
    console.error("Kamera ruxsatnomasi xatosi:", err);
});

peer.on('open', id => {
    document.getElementById('my-peer-id').innerHTML = `Sizning ID: <span style="color: #ccff00; font-size: 22px;">${id}</span>`;
    // Soketga o'z ID va ismimizni yuboramiz
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

// Boshqalarga ulanish funksiyasi (ismni ham birga jo'natadi)
function connectToUser(userId, stream, remoteUserName) {
    if (connectedPeers[userId]) return;

    // Qo'ng'iroq qilayotganda metadata ichida o'z ismimizni berib yuboramiz
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
    
    // Qo'lda ulanishda ism noma'lum bo'lsa ID yoziladi
    connectToUser(remotePeerId, myStream, `Suhbatdosh (${remotePeerId})`);
}

function addVideoStyle(stream, titleText, peerId) {
    if (document.getElementById(`div-${peerId}`)) {
        // Agar ekran allaqachon bo'lsa, ismini yangilab qo'yamiz
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

// Chat xabarlari (ism bilan)
socket.on('createMessage', (message, userId, userName) => {
    const chat = document.getElementById('chat');
    chat.innerHTML += `<div><b style="color: #8ab4f8;">${userName}:</b> ${message}</div>`;
    chat.scrollTop = chat.scrollHeight;
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input.value.trim() !== "") {
        // Xabar uzatayotganda o'z ismimizni ham qo'shib yuboramiz
        socket.emit('message', input.value, myName);
        const chat = document.getElementById('chat');
        chat.innerHTML += `<div><b style="color: #ccff00;">Siz:</b> ${input.value}</div>`;
        chat.scrollTop = chat.scrollHeight;
        input.value = "";
    }
}
