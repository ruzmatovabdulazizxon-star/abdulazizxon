const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

const peers = {};
let myVideoStream;
const myVideo = document.createElement('video');
myVideo.muted = true;

joinBtn.addEventListener('click', () => {
    const userName = usernameInput.value.trim();
    const roomId = roomInput.value.trim();

    if (!userName) {
        alert("Iltimos, ismingizni kiriting!");
        return;
    }
    if (!roomId) {
        alert("Iltimos, xona nomini yoki ID raqamini kiriting!");
        return;
    }

    // Ekranlarni almashtiramiz
    lobby.style.display = 'none';
    meetContainer.style.display = 'flex';

    // Xirsys TURN/STUN serverlarini olish
    fetch('/ice-servers')
        .then(res => res.json())
        .then(iceServers => {
            const peer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs',
                config: {
                    iceServers: iceServers
                }
            });

            startApplication(peer, roomId, userName);
        })
        .catch(err => {
            console.error("ICE serverlarni olishda xatolik, standart ulanishga o'tilmoqda:", err);
            const peer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs'
            });
            startApplication(peer, roomId, userName);
        });
});

function startApplication(peer, roomId, userName) {
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream, peer.id, userName);

        // Qo'ng'iroqlarga javob berish
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
        console.error("Kamera xatosi:", err);
        alert("Kamera yoki mikrofonga ruxsat bering!");
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) {
            peers[userId].close();
        }
        const extraVideo = document.getElementById(userId);
        if (extraVideo) extraVideo.remove();
    });

    peer.on('open', id => {
        socket.emit('join-room', roomId, id, userName);
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
        video.play().catch(err => console.error("Ijroda xatolik:", err));
    });

    container.append(video);
    container.append(nameLabel);
    videoGrid.append(container);
}
