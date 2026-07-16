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
let iAmAdmin = false;

const urlRoomId = window.location.pathname.split('/')[1];
if (urlRoomId && urlRoomId !== "") {
    roomInput.value = urlRoomId;
}

navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 24 },
    audio: true
}).then(stream => {
    myStream = stream;
}).catch(err => console.error("Kamera xatosi:", err));

joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const room = roomInput.value.trim();

    if (!username || !room) {
        alert("Iltimos, ismingizni va xona ID raqamini kiriting!");
        return;
    }

    currentUsername = username;
    currentRoomId = room;

    joinBtn.innerText = "Ruxsat kutilmoqda...";
    joinBtn.disabled = true;

    fetch('/ice-servers')
        .then(res => res.json())
        .then(iceServers => {
            myPeer = new Peer(undefined, {
                host: '/',
                port: '443',
                secure: true,
                path: '/peerjs',
                config: { iceServers: iceServers, sdpSemantics: 'unified-plan' }
            });

            myPeer.on('open', peerId => {
                // Serverdan xonaga kirish uchun ruxsat so'rash
                socket.emit('request-to-join', currentRoomId, currentUsername, peerId);
            });

            setupApprovalLogic();
        });
});

function setupApprovalLogic() {
    // Admin mehmonni qabul qilganda yoki foydalanuvchi admin bo'lganda
    socket.on('join-approved', (data) => {
        if (data && data.isAdmin) {
            iAmAdmin = true;
        }

        window.history.pushState({}, '', `/${currentRoomId}`);
        lobby.style.display = 'none';
        meetContainer.style.display = 'flex';

        const myLabel = iAmAdmin ? `${currentUsername} (Admin) (Siz)` : `${currentUsername} (Siz)`;
        if (myStream) {
            addVideoStream(myVideo, myStream, myLabel, myPeer.id);
        }

        socket.emit('join-room', currentRoomId, myPeer.id, currentUsername, iAmAdmin);
        startMeetingLogics();
    });

    // Admin kirishni taqiqlasa
    socket.on('join-rejected', () => {
        alert("Xona egasi (Admin) uchrashuvga kirishingizni rad etdi.");
        joinBtn.innerText = "Uchrashuvga qo'shilish";
        joinBtn.disabled = false;
    });

    // FAQAT ADMIN uchun: Mehmon ruxsat so'rab kutib turganda modal oynasi
    socket.on('user-awaiting', (data) => {
        if (!iAmAdmin) return;

        const accept = confirm(`${data.username} xonaga kirishga ruxsat so'ramoqda.\nRuxsat berasizmi?`);
        if (accept) {
            socket.emit('accept-user', data.socketId, currentRoomId);
        } else {
            socket.emit('reject-user', data.socketId);
        }
    });
}

function startMeetingLogics() {
    // Kiruvchi qo'ng'iroqlarni qabul qilish
    myPeer.on('call', call => {
        call.answer(myStream);
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');

        call.on('stream', userVideoStream => {
            // Qo'ng'iroq qilayotgan foydalanuvchining ismini aniqlash uchun metadata ishlatish mumkin, 
            // yoki birozdan so'ng socket orqali ism yangilanadi.
            if (!peers[call.peer]) {
                addVideoStream(video, userVideoStream, 'Yuklanmoqda...', call.peer);
                peers[call.peer] = call;
            }
        });
    });

    // Yangi foydalanuvchi ulanib ismi kelganda
    socket.on('user-connected', (userData) => {
        setTimeout(() => {
            if (myStream) {
                const call = myPeer.call(userData.userId, myStream);
                const video = document.createElement('video');
                video.setAttribute('playsinline', 'true');

                call.on('stream', userVideoStream => {
                    const guestLabel = userData.isAdmin ? `${userData.username} (Admin)` : userData.username;
                    addVideoStream(video, userVideoStream, guestLabel, userData.userId);
                });

                peers[userData.userId] = call;
            }
        }, 1200);
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) peers[userId].close();
        const element = document.getElementById(userId);
        if (element) element.remove();
    });
}

function addVideoStream(video, stream, name, userId) {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        video.play().catch(e => console.log(e));
    };

    // Agar o'sha foydalanuvchining video-boxi allaqachon bo'lsa, shunchaki ismini yangilaymiz
    const existingBox = document.getElementById(userId);
    if (existingBox) {
        const label = existingBox.querySelector('.name-label');
        if (label) label.innerText = name;
        return;
    }

    const videoBox = document.createElement('div');
    videoBox.classList.add('video-box');
    videoBox.id = userId;

    const nameLabel = document.createElement('div');
    nameLabel.classList.add('name-label');
    nameLabel.innerText = name;

    videoBox.appendChild(video);
    videoBox.appendChild(nameLabel);
    videoGrid.appendChild(videoBox);
}
