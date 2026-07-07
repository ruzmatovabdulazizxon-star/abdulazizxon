const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('localVideo');
const myPeerIdText = document.getElementById('my-peer-id');
const roomInput = document.getElementById('room-input');
const chatDiv = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');

// URL'dan 6 xonali xona kodini olamiz
const ROOM_ID = window.location.pathname.substring(1);

let localStream;
const peers = {}; // Ulangan har bir sherikni nazorat qilish uchun

// Xona kodini ekranga chiqarish
myPeerIdText.innerHTML = `Xona Kodu: <b style="color: #ccff00; font-size: 24px; letter-spacing: 2px;">${ROOM_ID}</b><br><span style="font-size:12px; color:#aaa;">Sheriklaringizga shu sahifa linkini yuboring!</span>`;

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;

        // Xavfsiz portlar bilan Peer serverga ulanamiz
        const peer = new Peer(undefined, {
            host: '/',
            port: 443,
            path: '/peerjs',
            secure: true
        });

        peer.on('open', (userId) => {
            // Serverga aynan shu xonaga kirganimizni bildiramiz
            socket.emit('join-room', ROOM_ID, userId);
        });

        // Xonadagi eski foydalanuvchilar bizga qo'ng'iroq qilganda
        peer.on('call', (call) => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', (userVideoStream) => {
                addVideoStream(video, userVideoStream);
            });
        });

        // Xonaga yangi foydalanuvchi qo'shilsa, unga srazu qo'ng'iroq qilamiz
        socket.on('user-connected', (userId) => {
            connectToNewUser(userId, stream, peer);
        });
    })
    .catch(err => console.error("Kamera ulanishida xato:", err));

// Kimdir chiqib ketsa, videosini tozalaymiz
socket.on('user-disconnected', (userId) => {
    if (peers[userId]) peers[userId].close();
});

function connectToNewUser(userId, stream, peer) {
    const call = peer.call(userId, stream);
    const video = document.createElement('video');
    
    call.on('stream', (userVideoStream) => {
        addVideoStream(video, userVideoStream);
    });
    
    call.on('close', () => {
        video.remove();
    });

    peers[userId] = call;
}

// Videolarni dinamik ravishda guruh gridiga qo'shish
function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });
    
    const videoContainer = document.createElement('div');
    const title = document.createElement('h3');
    title.style.textAlign = "center";
    title.style.margin = "5px";
    title.innerText = "Suhbatdosh";
    
    videoContainer.appendChild(title);
    videoContainer.appendChild(video);
    videoGrid.appendChild(videoContainer);
}

// Boshqa xona kodini yozib kirganda
function connectToPeer() {
    const targetRoom = roomInput.value.trim();
    if (!targetRoom) return alert("Xona kodini kiriting!");
    window.location.href = `/${targetRoom}`;
}

// CHAT FUNKSIYASI (Socket.io orqali guruhdagi hammaga tarqaladi)
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    socket.emit('message', message);
    messageInput.value = "";
}

socket.on('createMessage', (message, userId) => {
    const msgElement = document.createElement('div');
    msgElement.innerHTML = `<b style="color:#8ab4f8;">ID ${userId.substring(0, 4)}:</b> ${message}`;
    msgElement.style.padding = "5px 0";
    msgElement.style.borderBottom = "1px solid #333";
    chatDiv.appendChild(msgElement);
    chatDiv.scrollTop = chatDiv.scrollHeight;
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === messageInput) {
        sendMessage();
    }
});
