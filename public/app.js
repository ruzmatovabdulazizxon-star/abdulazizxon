const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const peers = {};

let myVideoStream;
const myVideo = document.createElement('video');
myVideo.muted = true;

// Ismni olish (agar sizda kirish oynasidan olinadigan bo'lsa, o'shani oling, aks holda prompt orqali so'raymiz)
const myName = typeof USER_NAME !== 'undefined' ? USER_NAME : prompt("Ismingizni kiriting:") || "Mehmon";

// Serverimizdan shaxsiy Xirsys TURN/STUN serverlarimizni olamiz
fetch('/ice-servers')
    .then(res => res.json())
    .then(iceServers => {
        // PeerJS dynamic olingan serverlar ro'yxati bilan ishga tushadi
        const peer = new Peer(undefined, {
            host: location.hostname,
            port: location.port || (location.protocol === 'https:' ? 443 : 80),
            path: '/peerjs',
            config: {
                iceServers: iceServers // Dynamic olingan serverlar
            }
        });

        startApplication(peer);
    })
    .catch(err => {
        console.error("Xirsys ICE serverlarini yuklashda xato:", err);
    });

// Asosiy dastur logikasi
function startApplication(peer) {
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream, peer.id, myName);

        // Kiruvchi qo'ng'iroqlarga javob berish
        peer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            
            call.on('stream', userVideoStream => {
                // Ikkinchi odamning ismini server orqali aniqlab olish mumkin
                addVideoStream(video, userVideoStream, call.peer, "Ulanuvchi");
            });

            call.on('close', () => {
                video.remove();
            });

            peers[call.peer] = call;
        });

        // Yangi foydalanuvchi ulanganda
        socket.on('user-connected', (userId, userName) => {
            setTimeout(() => {
                connectToNewUser(peer, userId, stream, userName);
            }, 1000);
        });
    }).catch(err => {
        console.error("Kamera va mikrofonga ruxsat berilmadi:", err);
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) {
            peers[userId].close();
        }
        const extraVideo = document.getElementById(userId);
        if (extraVideo) {
            extraVideo.parentElement.remove(); // Video konteynerini o'chirish
        }
    });

    peer.on('open', id => {
        socket.emit('join-room', ROOM_ID, id, myName);
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

// Videoni ekranga chiqarish va tagiga ismini yozish funksiyasi
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
        video.play().catch(err => console.error("Video ijro xatosi:", err));
    });

    container.append(video);
    container.append(nameLabel);
    videoGrid.append(container);
}
