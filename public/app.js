const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

// Modal oynalar elementlari
const adminModal = document.getElementById('admin-modal');
const guestModal = document.getElementById('guest-modal');
const modalMessage = document.getElementById('modal-message');
const guestModalTitle = document.getElementById('guest-modal-title');
const guestModalMessage = document.getElementById('guest-modal-message');
const btnAccept = document.getElementById('btn-accept');
const btnReject = document.getElementById('btn-reject');
const btnGuestClose = document.getElementById('btn-guest-close');

let myPeer = null;
const myVideo = document.createElement('video');
myVideo.muted = true;
myVideo.setAttribute('playsinline', 'true');

const peers = {};
let myStream = null;
let currentRoomId = '';
let currentUsername = '';
let iAmAdmin = false;
let pendingGuestSocketId = null;

// URL'dan xona ID raqamini avtomatik o'qib olish
const urlRoomId = window.location.pathname.split('/')[1];
if (urlRoomId && urlRoomId !== "") {
    roomInput.value = urlRoomId;
}

// Kamerani boshlang'ich sozlash
navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 24 },
    audio: true
}).then(stream => {
    myStream = stream;
}).catch(err => console.error("Media xatosi:", err));

// Admin modalida ruxsat berish tugmasi
btnAccept.addEventListener('click', () => {
    if (pendingGuestSocketId) {
        socket.emit('accept-user', pendingGuestSocketId, currentRoomId);
        adminModal.style.display = 'none';
        pendingGuestSocketId = null;
    }
});

// Admin modalida taqiqlash tugmasi
btnReject.addEventListener('click', () => {
    if (pendingGuestSocketId) {
        socket.emit('reject-user', pendingGuestSocketId);
        adminModal.style.display = 'none';
        pendingGuestSocketId = null;
    }
});

// Rad etilgan mehmon oynani yopganda
btnGuestClose.addEventListener('click', () => {
    guestModal.style.display = 'none';
    joinBtn.innerText = "Uchrashuvga qo'shilish";
    joinBtn.disabled = false;
});

// "Uchrashuvga qo'shilish" bosilganda
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const room = roomInput.value.trim();

    if (!username || !room) {
        alert("Iltimos, ismingizni va xona ID raqamini kiriting!");
        return;
    }

    currentUsername = username;
    currentRoomId = room;

    joinBtn.innerText = "Tekshirilmoqda...";
    joinBtn.disabled = true;

    // ICE/TURN serverlarni yuklab keyin ulanamiz
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
                socket.emit('request-to-join', currentRoomId, currentUsername, peerId);
            });

            setupApprovalLogic();
        });
});

function setupApprovalLogic() {
    // Admin yoki ruxsat berilgan mehmonda xonani ochish
    socket.on('join-approved', (data) => {
        if (data && data.isAdmin) {
            iAmAdmin = true;
        }

        guestModal.style.display = 'none';
        adminModal.style.display = 'none';

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

    // Mehmonga ruxsat so'ralayotganda kutish modalini ko'rsatish
    socket.on('user-awaiting-status', () => {
        guestModalTitle.innerText = "Kutish zali";
        guestModalMessage.innerText = "Xona egasi (Admin) tomonidan uchrashuvga ruxsat berilishi kutilmoqda...";
        btnGuestClose.style.display = 'none';
        guestModal.style.display = 'flex';
    });

    // Admin kirishni taqiqlasa
    socket.on('join-rejected', () => {
        guestModalTitle.innerText = "Ruxsat berilmadi";
        guestModalMessage.innerText = "Afsuski, xona egasi (Admin) sizning kirish so'rovingizni rad etdi.";
        btnGuestClose.style.display = 'block';
        guestModal.style.display = 'flex';
    });

    // FAQAT ADMIN uchun: Yangi mehmon ruxsat so'raganda modal chiqarish
    socket.on('user-awaiting', (data) => {
        if (!iAmAdmin) return;

        pendingGuestSocketId = data.socketId;
        modalMessage.innerText = `"${data.username}" uchrashuv xonasiga kirish uchun ruxsat so'ramoqda.`;
        adminModal.style.display = 'flex';
    });
}

function startMeetingLogics() {
    // Kiruvchi qo'ng'iroqlarni qabul qilish
    myPeer.on('call', call => {
        call.answer(myStream);
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');

        call.on('stream', userVideoStream => {
            if (!peers[call.peer]) {
                addVideoStream(video, userVideoStream, 'Yuklanmoqda...', call.peer);
                peers[call.peer] = call;
            }
        });
    });

    // Yangi mehmon qo'shilib, uning ma'lumotlari kelganda
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

// Chat paneli boshqaruvi
const chatBtn = document.getElementById('chat-btn');
const chatPanel = document.getElementById('chat-panel');
if (chatBtn && chatPanel) {
    chatBtn.addEventListener('click', () => {
        chatPanel.style.display = chatPanel.style.display === 'flex' ? 'none' : 'flex';
    });
}
