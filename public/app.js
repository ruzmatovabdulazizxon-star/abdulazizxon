const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const peers = {};

let myVideoStream;
const myVideo = document.createElement('video');
myVideo.muted = true;

// Serverimizdan shaxsiy Xirsys ICE serverlarini so'rab olamiz
fetch('/ice-servers')
    .then(res => res.json())
    .then(iceServers => {
        // PeerJS ulanishini olingan ICE serverlar bilan yaratamiz
        const peer = new Peer(undefined, {
            host: location.hostname,
            port: location.port || (location.protocol === 'https:' ? 443 : 80),
            path: '/peerjs',
            config: {
                iceServers: iceServers // Dynamic olingan TURN/STUN serverlar
            }
        });

        startApplication(peer);
    })
    .catch(err => {
        console.error("ICE serverlarni olishda xatolik:", err);
    });

// Asosiy dastur logikasi
function startApplication(peer) {
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream, peer.id);

        peer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream, call.peer);
            });

            call.on('close', () => {
                video.remove();
            });

            peers[call.peer] = call;
        });

        socket.on('user-connected', userId => {
            setTimeout(() => {
                connectToNewUser(peer, userId, stream);
            }, 1000);
        });
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) {
            peers[userId].close();
        }
        const extraVideo = document.getElementById(userId);
        if (extraVideo) extraVideo.remove();
    });

    peer.on('open', id => {
        socket.emit('join-room', ROOM_ID, id);
    });
}

function connectToNewUser(peer, userId, stream) {
    if (peers[userId]) return;

    const call = peer.call(userId, stream);
    const video = document.createElement('video');

    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, userId);
    });

    call.on('close', () => {
        video.remove();
    });

    peers[userId] = call;
}

function addVideoStream(video, stream, userId) {
    if (userId && document.getElementById(userId)) return;

    video.srcObject = stream;
    if (userId) video.id = userId;
    
    video.addEventListener('loadedmetadata', () => {
        video.play().catch(err => console.error("Video ijrosida xato:", err));
    });

    videoGrid.append(video);
}
