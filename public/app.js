const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

// Xirsys STUN/TURN serverlar konfiguratsiyasi
const peerConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:global.xirsys.com:3478?transport=udp',
            username: 'abdulaziz', 
            credential: 'c0a65ce0-8033-11f1-8a6c-f2f74e209366'
        },
        {
            urls: 'turn:global.xirsys.com:3478?transport=tcp',
            username: 'abdulaziz',
            credential: 'c0a65ce0-8033-11f1-8a6c-f2f74e209366'
        }
    ]
};

const myPeer = new Peer(undefined, {
    host: '/',
    port: '443',
    secure: true,
    config: peerConfiguration
});

const myVideo = document.createElement('video');
myVideo.muted = true;
myVideo.setAttribute('playsinline', 'true');

const peers = {};
let myStream = null;
let currentRoomId = '';
let currentUsername = '';

// --- URL'dan Xona ID'sini avtomatik o'qib olish logikasi ---
// Agar foydalanuvchi havola orqali kirsa (masalan: /2), xona inputiga avtomatik '2' yoziladi
const urlRoomId = window.location.pathname.split('/')[1];
if (urlRoomId && urlRoomId !== "") {
    roomInput.value = urlRoomId;
}

// Kamera va mikrofonni oldindan tayyorlash
navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 24 },
    audio: true
}).then(stream => {
    myStream = stream;

    myPeer.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');
        call.on('stream', userVideoStream => {
            if (!peers[call.peer]) {
                addVideoStream(video, userVideoStream, 'Suhbatdosh');
                peers[call.peer] = call;
            }
        });
    });

    socket.on('user-connected', userId => {
        setTimeout(() => {
            connectToNewUser(userId, stream);
        }, 1000);
    });
}).catch(err => {
    console.error("Media qurilmalarga ulanishda xatolik:", err);
});

// "Uchrashuvga qo'shilish" tugmasi bosilganda
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const room = roomInput.value.trim();

    if (!username || !room) {
        alert("Iltimos, ismingizni va xona ID raqamini kiriting!");
        return;
    }

    currentUsername = username;
    currentRoomId = room;

    // --- Havolani (URL) dinamik o'zgartirish ---
    // Brauzer satrini "abdulazizxon.onrender.com/2" ko'rinishiga o'tkazadi
    window.history.pushState({}, '', `/${currentRoomId}`);

    // Lobby oynasini yashirib, video maydonni ko'rsatish
    lobby.style.display = 'none';
    meetContainer.style.display = 'flex';

    // O'z videomizni ekranga chiqarish
    if (myStream) {
        addVideoStream(myVideo, myStream, `${currentUsername} (Siz)`);
    }

    // Serverga ulanish signalini yuborish
    socket.emit('join-room', currentRoomId, myPeer.id);
});

socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
    const element = document.getElementById(userId);
    if (element) element.remove();
});

function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, 'Mehmon', userId);
    });
    peers[userId] = call;
}

function addVideoStream(video, stream, name, userId = null) {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        video.play().catch(e => console.log(e));
    };

    if (userId && document.getElementById(userId)) return;

    const videoBox = document.createElement('div');
    videoBox.classList.add('video-box');
    if (userId) videoBox.id = userId;

    const nameLabel = document.createElement('div');
    nameLabel.classList.add('name-label');
    nameLabel.innerText = name;

    videoBox.appendChild(video);
    videoBox.appendChild(nameLabel);
    videoGrid.appendChild(videoBox);
}

// Chat paneli boshqaruvi
const chatBtn = document.getElementById('chat-btn');
const chatPanel = document.getElementById('chat-panel');
if (chatBtn && chatPanel) {
    chatBtn.addEventListener('click', () => {
        chatPanel.style.display = chatPanel.style.display === 'flex' ? 'none' : 'flex';
    });
}
