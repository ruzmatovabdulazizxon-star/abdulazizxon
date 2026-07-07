const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('localVideo');
const myPeerIdText = document.getElementById('my-peer-id');
const roomInput = document.getElementById('room-input');
const chatDiv = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');

// URL dan xona ID sini aniqlab olamiz (masalan: /671222 -> 671222)
const ROOM_ID = window.location.pathname.substring(1);

let localStream;
const peers = {}; // Barcha ulangan foydalanuvchilarni saqlash uchun

// Sahifada xona ID sini chiroyli ko'rsatish
myPeerIdText.innerHTML = `Xona Kodu: <b style="color: #ccff00; font-size: 24px; letter-spacing: 2px;">${ROOM_ID}</b><br><span style="font-size:12px; color:#aaa;">Sheriklaringizga shu sahifa linkini yuboring!</span>`;

// Kamerani yoqamiz
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;

        // PeerJS ob'ektini tasodifiy yaratamiz (u avtomatik ishlaydi)
        const peer = new Peer(undefined, {
            host: '/',
            port: 443,
            path: '/peerjs',
            secure: true
        });

        peer.on('open', (userId) => {
            // Serverga xonaga kirganimizni va Peer ID-mizni aytamiz
            socket.emit('join-room', ROOM_ID, userId);
        });

        // Kimdir bizga qo'ng'iroq qilsa (xonadagi eski foydalanuvchilar)
        peer.on('call', (call) => {
            call.answer(stream);
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            
            call.on('stream', (userVideoStream) => {
                addVideoStream(video, userVideoStream);
            });
        });

        // Xonaga yangi foydalanuvchi qo'shilganda srazu unga qo'ng'iroq qilamiz
        socket.on('user-connected', (userId) => {
            connectToNewUser(userId, stream, peer);
        });
    })
    .catch(err => console.error("Kamera xatoligi:", err));

// Kimdir xonadan chiqib ketganda uning videosini o'chirish
socket.on('user-disconnected', (userId) => {
    if (peers[userId]) peers[userId].close();
});

// Yangi foydalanuvchiga ulanish funksiyasi
function connectToNewUser(userId, stream, peer) {
    const call = peer.call(userId, stream);
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;

    call.on('stream', (userVideoStream) => {
        addVideoStream(video, userVideoStream);
    });

    call.on('close', () => {
        video.remove();
    });

    peers[userId] = call;
}

// Videoni ekranga qo'shish funksiyasi (Zoom-grid kabi dinamik qo'shiladi)
function addVideoStream(video, stream) {
    video.srcObject = stream;
    // Agarda remoteVideo elementi bo'lsa, o'shani o'rniga yoki yoniga qo'shamiz
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo && !remoteVideo.srcObject) {
        remoteVideo.srcObject = stream;
    } else {
        // Agar 3- yoki 4-sherik bo'lsa, yangi video blok yaratib gridga qo'shiladi
        video.style.width = "300px";
        video.style.borderRadius = "10px";
        video.style.margin = "10px";
        document.getElementById('video-grid').appendChild(video);
    }
}

// Boshqa xonaga o'tish tugmasi (Inputga kod yozib kirganda)
function connectToPeer() {
    const targetRoom = roomInput.value.trim();
    if (!targetRoom) return alert("Xona kodini kiriting!");
    window.location.href = `/${targetRoom}`; // O'sha xonaga yo'naltirish
}

// CHAT TIZIMI (Hamma sheriklar ko'rishi uchun socket orqali)
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    socket.emit('message', message);
    messageInput.value = "";
}

socket.on('createMessage', (message, userId) => {
    const msgElement = document.createElement('div');
    msgElement.innerText = `${userId.substring(0, 4)}...: ${message}`;
    msgElement.style.padding = "5px 10px";
    msgElement.style.borderBottom = "1px solid #333";
    chatDiv.appendChild(msgElement);
    chatDiv.scrollTop = chatDiv.scrollHeight;
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === messageInput) {
        sendMessage();
    }
});
