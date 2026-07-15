const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const waitingScreen = document.getElementById('waiting-screen');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

// Boshqaruv elementlari
const micBtn = document.getElementById('mic-btn');
const camBtn = document.getElementById('cam-btn');
const shareBtn = document.getElementById('share-btn');
const chatBtn = document.getElementById('chat-btn');
const leaveBtn = document.getElementById('leave-btn');
const chatPanel = document.getElementById('chat-panel');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessages = document.getElementById('chat-messages');

// Admin bildirishnomalari
const adminNotification = document.getElementById('admin-notification');
const notificationText = document.getElementById('notification-text');
const approveBtn = document.getElementById('approve-btn');
const rejectBtn = document.getElementById('reject-btn');

let myVideoStream;
let screenStream;
let myPeerId = null;
let currentPeer = null;
let isAdmin = false;
let currentPendingGuest = null;
const peers = {};

joinBtn.addEventListener('click', () => {
    const userName = usernameInput.value.trim();
    const roomId = roomInput.value.trim();

    if (!userName || !roomId) {
        alert("Iltimos, ism va xona ID sini kiriting!");
        return;
    }

    lobby.style.display = 'none';

    fetch('/ice-servers')
        .then(res => res.json())
        .then(iceServers => {
            currentPeer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs',
                config: { iceServers: iceServers }
            });
            setupCoreApp(currentPeer, roomId, userName);
        })
        .catch(() => {
            currentPeer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs'
            });
            setupCoreApp(currentPeer, roomId, userName);
        });
});

function setupCoreApp(peer, roomId, userName) {
    peer.on('open', id => {
        myPeerId = id;
        socket.emit('join-room', roomId, id, userName);
    });

    socket.on('admin-status', (status) => {
        isAdmin = status;
        if (isAdmin) {
            meetContainer.style.display = 'flex';
            initMyMedia(peer, userName);
        } else {
            waitingScreen.style.display = 'block';
            socket.emit('request-join');
        }
    });

    socket.on('join-request-received', (data) => {
        if (isAdmin) {
            currentPendingGuest = data;
            notificationText.innerText = `${data.guestName} xonaga qo'shilishga ruxsat so'ramoqda.`;
            adminNotification.style.display = 'block';
        }
    });

    socket.on('join-approved', () => {
        waitingScreen.style.display = 'none';
        meetContainer.style.display = 'flex';
        initMyMedia(peer, userName);
    });

    socket.on('join-rejected', () => {
        alert("Kechirasiz, administrator ruxsat bermadi.");
        location.reload();
    });
}

function initMyMedia(peer, userName) {
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myVideoStream = stream;
        addVideoStream(null, stream, userName, true); // O'zimizning video (local)

        // Kiruvchi qo'ng'iroqlarni qabul qilish
        peer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userStream => {
                addVideoStream(call.peer, userStream, "Suhbatdosh", false);
            });
            call.on('close', () => video.remove());
            peers[call.peer] = call;
        });

        // Yangi foydalanuvchi ulanishini kutish
        socket.on('user-connected', (userId, connectedName) => {
            if (userId !== myPeerId) {
                setTimeout(() => {
                    connectToNewUser(peer, userId, stream, connectedName);
                }, 1000);
            }
        });

    }).catch(err => alert("Kamera va mikrofonga ruxsat berilmadi: " + err));

    socket.on('user-disconnected', userId => {
        if (peers[userId]) peers[userId].close();
        const guestVideo = document.getElementById(userId);
        if (guestVideo) guestVideo.remove();
    });
}

function connectToNewUser(peer, userId, stream, connectedName) {
    if (peers[userId]) return;

    const call = peer.call(userId, stream);
    const video = document.createElement('video');

    call.on('stream', userStream => {
        addVideoStream(userId, userStream, connectedName, false);
    });

    call.on('close', () => video.remove());
    peers[userId] = call;
}

// Videoni tarmoqqa to'g'ri va dublikatlarsiz qo'shish funksiyasi
function addVideoStream(userId, stream, labelText, isLocal) {
    const idToCheck = isLocal ? 'local-user-box' : userId;
    if (document.getElementById(idToCheck)) return;

    const container = document.createElement('div');
    container.className = 'video-box';
    container.id = idToCheck;

    const video = document.createElement('video');
    if (isLocal) video.classList.add('local-video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;

    const label = document.createElement('div');
    label.className = 'name-label';
    label.innerText = labelText;

    container.append(video);
    container.append(label);
    videoGrid.append(container);
}

// ================= Boshqaruv Tugmalari Logikasi =================

// 1. Mikrofon o'chirish/yoqish
micBtn.addEventListener('click', () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        micBtn.classList.add('active');
        micBtn.innerHTML = '<i class="fa fa-microphone-slash"></i>';
    } else {
        myVideoStream.getAudioTracks()[0].enabled = true;
        micBtn.classList.remove('active');
        micBtn.innerHTML = '<i class="fa fa-microphone"></i>';
    }
});

// 2. Kamera o'chirish/yoqish
camBtn.addEventListener('click', () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getVideoTracks()[0].enabled = false;
        camBtn.classList.add('active');
        camBtn.innerHTML = '<i class="fa fa-video-slash"></i>';
    } else {
        myVideoStream.getVideoTracks()[0].enabled = true;
        camBtn.classList.remove('active');
        camBtn.innerHTML = '<i class="fa fa-video"></i>';
    }
});

// 3. Ekran ulashish (Screen Share)
shareBtn.addEventListener('click', () => {
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                screenStream = stream;
                let videoTrack = screenStream.getVideoTracks()[0];

                // Barcha bog'langan foydalanuvchilarga video oqimini almashtirib yuboramiz
                for (let peerId in peers) {
                    const sender = peers[peerId].peerConnection.getSenders().find(s => s.track.kind === 'video');
                    sender.replaceTrack(videoTrack);
                }

                // O'zimizning videoni ekran ulashishga almashtiramiz
                const localVideoElement = document.querySelector('#local-user-box video');
                if (localVideoElement) localVideoElement.srcObject = screenStream;

                shareBtn.classList.add('active');

                // Ekran ulashishni to'xtatganda
                videoTrack.onended = () => {
                    stopScreenShare();
                };
            })
            .catch(err => console.log("Ekran ulashib bo'lmadi: " + err));
    } else {
        stopScreenShare();
    }
});

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    const localVideoElement = document.querySelector('#local-user-box video');
    if (localVideoElement) localVideoElement.srcObject = myVideoStream;

    // Barcha peers uchun qayta kamerani yoqamiz
    const camTrack = myVideoStream.getVideoTracks()[0];
    for (let peerId in peers) {
        const sender = peers[peerId].peerConnection.getSenders().find(s => s.track.kind === 'video');
        sender.replaceTrack(camTrack);
    }
    shareBtn.classList.remove('active');
}

// 4. Chatni ochish/yopish
chatBtn.addEventListener('click', () => {
    if (chatPanel.style.display === 'none' || chatPanel.style.display === '') {
        chatPanel.style.display = 'flex';
        chatBtn.classList.add('active');
    } else {
        chatPanel.style.display = 'none';
        chatBtn.classList.remove('active');
    }
});

// 5. Chat xabar yuborish
sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
    const text = chatInput.value.trim();
    const userName = usernameInput.value.trim();
    if (text) {
        socket.emit('send-chat-message', text, userName);
        chatInput.value = '';
    }
}

socket.on('receive-chat-message', (message, senderName) => {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<div class="sender">${senderName}</div><div>${message}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// 6. Admin tugmalari ruxsatnomasi uchun
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

// 7. Xonadan chiqish
leaveBtn.addEventListener('click', () => {
    if (confirm("Uchrashuvni tark etishni xohlaysizmi?")) {
        location.reload();
    }
});
