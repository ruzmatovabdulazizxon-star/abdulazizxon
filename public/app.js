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

// Uchrashuvni boshlash tugmasi bosilganda ishlaydi
joinBtn.addEventListener('click', () => {
    const userName = usernameInput.value.trim();
    if (!userName) {
        alert("Iltimos, avval ismingizni kiriting!");
        return;
    }

    // Agar foydalanuvchi boshqa xona ID kiritgan bo'lsa, o'sha xonaga yo'naltiramiz
    const targetRoom = roomInput.value.trim();
    if (targetRoom && targetRoom !== ROOM_ID) {
        window.location.href = `/${targetRoom}`;
        return;
    }

    // Kirish oynasini yashiramiz va video ekranni ko'rsatamiz
    lobby.style.display = 'none';
    meetContainer.style.display = 'flex';

    // Xirsys'dan dynamic ICE serverlarni so'raymiz
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

            startApplication(peer, userName);
        })
        .catch(err => {
            console.error("TURN serverlarni olishda xatolik:", err);
            // Muammo bo'lsa zaxira varianti bilan ishga tushuramiz
            const peer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs'
            });
            startApplication(peer, userName);
        });
});

// Asosiy dastur logikasi
function startApplication(peer, userName) {
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

        // Yangi foydalanuvchi ulanganda unga qo'ng'iroq qilish
        socket.on('user-connected', (userId, connectedUserName) => {
            setTimeout(() => {
                connectToNewUser(peer, userId, stream, connectedUserName);
            }, 1000);
        });
    }).catch(err => {
        console.error("Kamera yoki mikrofondan foydalanish ruxsat etilmadi:", err);
        alert("Kamera va mikrofonga ruxsat berishingiz zarur!");
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) {
            peers[userId].close();
        }
        const extraVideo = document.getElementById(userId);
        if (extraVideo) extraVideo.remove();
    });

    peer.on('open', id => {
        socket.emit('join-room', ROOM_ID, id, userName);
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
        video.play().catch(err => console.error("Video ijrosida xato:", err));
    });

    container.append(video);
    container.append(nameLabel);
    videoGrid.append(container);
}
