const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

let myPeer = null;
const myVideo = document.createElement('video');
myVideo.muted = true;
myVideo.setAttribute('playsinline', 'true');

const peers = {};
let myStream = null;
let currentRoomId = '';
let currentUsername = '';

// URL satridan xona ID raqamini avtomatik o'qib olish
const urlRoomId = window.location.pathname.split('/')[1];
if (urlRoomId && urlRoomId !== "") {
    roomInput.value = urlRoomId;
}

// Kamerani oldindan ishga tushirish
navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 24 },
    audio: true
}).then(stream => {
    myStream = stream;
}).catch(err => {
    console.error("Kameraga ruxsat berilmadi:", err);
});

// Tugma bosilganda uchrashuvni boshlash
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const room = roomInput.value.trim();

    if (!username || !room) {
        alert("Iltimos, ismingizni va xona ID raqamini kiriting!");
        return;
    }

    currentUsername = username;
    currentRoomId = room;

    // 1. Birinchi navbatda ICE/TURN serverlarni yuklab olamiz
    fetch('/ice-servers')
        .then(res => res.json())
        .then(iceServers => {
            console.log("Yuklangan ICE serverlar:", iceServers);
            
            // 2. TURN serverlar bilan PeerJS obyektini yaratish
            myPeer = new Peer(undefined, {
                host: '/',
                port: '443',
                secure: true,
                path: '/peerjs',
                config: { 
                    iceServers: iceServers,
                    sdpSemantics: 'unified-plan'
                }
            });

            setupPeerAndSocketLogic();
        })
        .catch(err => {
            console.error("ICE server yuklashda xato, STUN ishlatiladi:", err);
            myPeer = new Peer(undefined, {
                host: '/',
                port: '443',
                secure: true,
                path: '/peerjs',
                config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
            });
            setupPeerAndSocketLogic();
        });
});

function setupPeerAndSocketLogic() {
    myPeer.on('open', id => {
        // URL manzilini dinamik o'zgartirish (/2 holatiga)
        window.history.pushState({}, '', `/${currentRoomId}`);

        // Interfeysni almashtirish
        lobby.style.display = 'none';
        meetContainer.style.display = 'flex';

        if (myStream) {
            addVideoStream(myVideo, myStream, `${currentUsername} (Siz)`);
        }

        // Serverga kirish signalini berish
        socket.emit('join-room', currentRoomId, id);
    });

    // Kirib kelayotgan qo'ng'iroqlarga javob berish
    myPeer.on('call', call => {
        call.answer(myStream);
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');
        
        call.on('stream', userVideoStream => {
            if (!peers[call.peer]) {
                addVideoStream(video, userVideoStream, 'Suhbatdosh', call.peer);
                peers[call.peer] = call;
            }
        });
    });

    // Yangi mehmon qo'shilganda ulanish
    socket.on('user-connected', userId => {
        setTimeout(() => {
            if (myStream) {
                const call = myPeer.call(userId, myStream);
                const video = document.createElement('video');
                video.setAttribute('playsinline', 'true');
                
                call.on('stream', userVideoStream => {
                    addVideoStream(video, userVideoStream, 'Mehmon', userId);
                });
                
                peers[userId] = call;
            }
        }, 1200); // Tarmoq yuklanishini oldini olish uchun 1.2 soniya kutish
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) peers[userId].close();
        const element = document.getElementById(userId);
        if (element) element.remove();
    });
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
