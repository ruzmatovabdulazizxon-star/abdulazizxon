const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const waitingScreen = document.getElementById('waiting-screen');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

// Admin bildirishnomalari elementlari
const adminNotification = document.getElementById('admin-notification');
const notificationText = document.getElementById('notification-text');
const approveBtn = document.getElementById('approve-btn');
const rejectBtn = document.getElementById('reject-btn');

const peers = {};
let myVideoStream;
const myVideo = document.createElement('video');
myVideo.muted = true;

let isAdmin = false;
let currentPendingGuest = null; // Navbatdagi mehmon ma'lumotlari

joinBtn.addEventListener('click', () => {
    const userName = usernameInput.value.trim();
    const roomId = roomInput.value.trim();

    if (!userName) {
        alert("Iltimos, ismingizni kiriting!");
        return;
    }
    if (!roomId) {
        alert("Iltimos, xona nomini kiriting!");
        return;
    }

    lobby.style.display = 'none';

    // Xirsys TURN/STUN serverlarini yuklash
    fetch('/ice-servers')
        .then(res => res.json())
        .then(iceServers => {
            const peer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs',
                config: { iceServers: iceServers }
            });

            setupPeerAndSocket(peer, roomId, userName);
        })
        .catch(err => {
            console.error("Xirsys serverlarini yuklashda xato, muqobil ulanish ishga tushdi:", err);
            const peer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs'
            });
            setupPeerAndSocket(peer, roomId, userName);
        });
});

function setupPeerAndSocket(peer, roomId, userName) {
    peer.on('open', id => {
        // Birinchi navbatda xonaga ulanamiz va admin yoki mehmonligimizni aniqlaymiz
        socket.emit('join-room', roomId, id, userName);
    });

    // Serverdan Admin yoki oddiy foydalanuvchi ekanligimiz haqidagi javob
    socket.on('admin-status', (status) => {
        isAdmin = status;
        
        if (isAdmin) {
            // Agar Admin bo'lsa, to'g'ridan-to'g'ri ekranni ochib, kamerani yoqamiz
            meetContainer.style.display = 'flex';
            startMediaStream(peer, userName);
        } else {
            // Agar Mehmon bo'lsa, kutish ekranini ko'rsatamiz va ruxsat so'raymiz
            waitingScreen.style.display = 'block';
            socket.emit('request-join');
        }
    });

    // Mehmon ruxsat so'raganda faqat Adminga bildirishnoma chiqadi
    socket.on('join-request-received', (data) => {
        if (isAdmin) {
            currentPendingGuest = data;
            notificationText.innerText = `${data.guestName} uchrashuvga kirishga ruxsat so'ramoqda.`;
            adminNotification.style.display = 'block';
        }
    });

    // Agar mehmon ruxsat olsa
    socket.on('join-approved', () => {
        waitingScreen.style.display = 'none';
        meetContainer.style.display = 'flex';
        startMediaStream(peer, userName);
    });

    // Agar mehmon rad etilsa
    socket.on('join-rejected', () => {
        waitingScreen.style.display = 'none';
        lobby.style.display = 'block';
        alert("Kechirasiz, administrator sizning kirishingizni rad etdi.");
    });
}

// Admin tugmalari hodisalari
approveBtn.addEventListener('click', () => {
    if (currentPendingGuest) {
        socket.emit('approve-guest', currentPendingGuest.guestSocketId, currentPendingGuest.guestPeerId, currentPendingGuest.guestName);
        adminNotification.style.display = 'none';
        currentPendingGuest = null;
    }
});

rejectBtn.addEventListener('click', () => {
    if (currentPendingGuest) {
        socket.emit('reject-guest', currentPendingGuest.guestSocketId);
        adminNotification.style.display = 'none';
        currentPendingGuest = null;
    }
});

function startMediaStream(peer, userName) {
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream, peer.id, userName);

        // Kiruvchi qo'ng'iroqlarga javob berish
        peer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream, call.peer, "Suhbatdosh");
            });
            call.on('close', () => {
                video.remove();
            });
            peers[call.peer] = call;
        });

        // Yangi ulanuvchilar bilan bog'lanish
        socket.on('user-connected', (userId, connectedUserName) => {
            setTimeout(() => {
                connectToNewUser(peer, userId, stream, connectedUserName);
            }, 1000);
        });
    }).catch(err => {
        console.error("Kamerani yoqib bo'lmadi:", err);
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) {
            peers[userId].close();
        }
        const extraVideo = document.getElementById(userId);
        if (extraVideo) extraVideo.remove();
    });
}

function connectToNewUser(peer, userId, stream, userName) {
    if (peers[userId]) return;

    const call = peer.call(userId, stream);
    const video = document.createElement('video');

    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, userId, userName);
    });

    call.on('close', () => {
        video.remove();
    });

    peers[userId] = call;
}

function addVideoStream(video, stream, userId, userName) {
    if (userId && document.getElementById(userId)) return;

    const container = document.createElement('div');
    container.className = 'video-box';
    if (userId) container.id = userId;

    const nameLabel = document.createElement('div');
    nameLabel.className = 'name-label';
    nameLabel.innerText = userName || "Foydalanuvchi";

    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
        video.play().catch(err => console.error("Video play error:", err));
    });

    container.append(video);
    container.append(nameLabel);
    videoGrid.append(container);
}
