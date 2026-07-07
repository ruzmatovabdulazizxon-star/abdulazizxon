const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// Tasodifiy 6 xonali ID (Masalan: 688230)
const myCustomPeerId = Math.floor(100000 + Math.random() * 900000).toString();

const peer = new Peer(myCustomPeerId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true
});

let myStream;
const connectedPeers = {}; // Faol qo'ng'iroqlarni saqlash uchun

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, "Siz (Kamera)", myCustomPeerId);

    // Kimdir bizga qo'ng'iroq qilsa (eski mehmon yoki yangi mehmon) javob beramiz
    peer.on('call', call => {
        call.answer(stream);
        call.on('stream', userRemoteStream => {
            addVideoStyle(userRemoteStream, `Suhbatdosh (${call.peer})`, call.peer);
        });
    });

    // SOKET LOGIKASI: Xonaga yangi odam kirdi degan xabar kelsa, unga AVTOMATIK qo'ng'iroq qilamiz!
    socket.on('user-connected', (userId) => {
        console.log('Yangi foydalanuvchi qo\'shildi: ' + userId);
        // Biroz kutish (Peer ulanishga ulgurishi uchun)
        setTimeout(() => {
            connectToUser(userId, stream);
        }, 1000);
    });

}).catch(err => {
    console.error("Kamera ruxsatnomasi xatosi:", err);
});

peer.on('open', id => {
    document.getElementById('my-peer-id').innerHTML = `Sizning Xona ID: <span style="color: #ccff00; font-size: 22px;">${id}</span>`;
    // Biz 'main-room' degan bitta umumiy guruh xonasiga ulanamiz
    socket.emit('join-room', 'main-room', id);
});

// Avtomatik o'zaro bog'lanish funksiyasi
function connectToUser(userId, stream) {
    if (connectedPeers[userId]) return; // Agar allaqachon ulanish bo'lsa qayta ulamaymiz

    const call = peer.call(userId, stream);
    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, `Suhbatdosh (${userId})`, userId);
    });

    call.on('close', () => {
        removeVideo(userId);
    });

    connectedPeers[userId] = call;
}

// Qo'lda ulanish tugmasi uchun (agar kerak bo'lib qolsa)
function connectToPeer() {
    const remotePeerId = document.getElementById('room-input').value.trim();
    if (!remotePeerId) return alert("Xona ID raqamini kiriting!");
    if (remotePeerId === myCustomPeerId) return alert("O'zingizga ulanolmaysiz!");
    
    connectToUser(remotePeerId, myStream);
}

// Dinamik ravishda ekranga video qutisini qo'shish
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

// Kimdir chiqib ketsa, uning videosini o'chirish
socket.on('user-disconnected', userId => {
    if (connectedPeers[userId]) connectedPeers[userId].close();
    removeVideo(userId);
});

function removeVideo(userId) {
    const videoDiv = document.getElementById(`div-${userId}`);
    if (videoDiv) videoDiv.remove();
}

// Chat logikasi
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
