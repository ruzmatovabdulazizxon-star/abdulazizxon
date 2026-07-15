const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const waitingScreen = document.getElementById('waiting-screen');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

// Boshqaruv tugmalari
const micBtn = document.getElementById('mic-btn');
const camBtn = document.getElementById('cam-btn');
const shareBtn = document.getElementById('share-btn');
const chatBtn = document.getElementById('chat-btn');
const leaveBtn = document.getElementById('leave-btn');
const chatPanel = document.getElementById('chat-panel');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessages = document.getElementById('chat-messages');

// Admin bildirishnomalari paneli
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
let myName = "Foydalanuvchi";
const peers = {}; // Faol peer ulanishlari ro'yxati

joinBtn.addEventListener('click', () => {
    myName = usernameInput.value.trim();
    const roomId = roomInput.value.trim();

    if (!myName || !roomId) {
        alert("Iltimos, ismingizni va xona ID sini kiriting!");
        return;
    }

    lobby.style.display = 'none';

    // Xirsys TURN/STUN serverlari bilan ulanishni sozlash
    fetch('/ice-servers')
        .then(res => res.json())
        .then(iceServers => {
            currentPeer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs',
                config: { iceServers: iceServers }
            });
            startMeetingSetup(currentPeer, roomId, myName);
        })
        .catch(() => {
            currentPeer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs'
            });
            startMeetingSetup(currentPeer, roomId, myName);
        });
});

function startMeetingSetup(peer, roomId, userName) {
    peer.on('open', id => {
        myPeerId = id;
        socket.emit('join-room', roomId, id, userName);
    });

    // Admin yoki mehmonga ajratish
    socket.on('admin-status', (status) => {
        isAdmin = status;
        if (isAdmin) {
            meetContainer.style.display = 'flex';
            initMediaAndConnections(peer, userName);
        } else {
            waitingScreen.style.display = 'block';
            socket.emit('request-join');
        }
    });

    // Admin uchun kirish so'rovini qabul qilish
    socket.on('join-request-received', (data) => {
        if (isAdmin) {
            currentPendingGuest = data;
            notificationText.innerText = `${data.guestName} kirishga ruxsat so'ramoqda.`;
            adminNotification.style.display = 'block';
        }
    });

    // Mehmonga kirish ruxsati berilganda
    socket.on('join-approved', () => {
        waitingScreen.style.display = 'none';
        meetContainer.style.display = 'flex';
        initMediaAndConnections(peer, userName);
    });

    // Mehmon rad etilganda
    socket.on('join-rejected', () => {
        alert("Kechirasiz, administrator xonaga kirishingizni rad etdi.");
        location.reload();
    });
}

function initMediaAndConnections(peer, userName) {
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myVideoStream = stream;
        addVideoStream('local-user-box', stream, `${userName} (Siz)`, true);

        // Kiruvchi qo'ng'iroqlarga javob berish
        peer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(call.peer, userVideoStream, call.metadata?.callerName || "Suhbatdosh", false);
            });
            call.on('close', () => video.remove());
            peers[call.peer] = call;
        });

        // Bizdan avval xonaga kirgan barcha foydalanuvchilarga qo'ng'iroq qilish (Mesh ulanish)
        socket.on('all-users', otherUsers => {
            otherUsers.forEach(user => {
                if (user.userId !== myPeerId) {
                    connectToNewUser(peer, user.userId, stream, user.userName);
                }
            });
        });

        // Bizdan keyin qo'shilgan yangi foydalanuvchini ulanishini kutish
        socket.on('user-connected', (userId, connectedUserName) => {
            if (userId !== myPeerId) {
                setTimeout(() => {
                    connectToNewUser(peer, userId, stream, connectedUserName);
                }, 1000); // 1 soniyalik kechikish ulanish barqarorligini ta'minlaydi
            }
        });

    }).catch(err => {
        alert("Kamera yoki mikrofondan foydalanishda xatolik yuz berdi: " + err);
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) peers[userId].close();
        const guestVideoBox = document.getElementById(userId);
        if (guestVideoBox) guestVideoBox.remove();
    });
}

function connectToNewUser(peer, userId, stream, userName) {
    if (peers[userId]) return;

    // Qo'ng'iroq qilayotganimizda o'z ismimizni metadata ko'rinishida yuboramiz
    const call = peer.call(userId, stream, { metadata: { callerName: myName } });
    
    call.on('stream', userVideoStream => {
        addVideoStream(userId, userVideoStream, userName, false);
    });

    call.on('close', () => {
        const videoBox = document.getElementById(userId);
        if (videoBox) videoBox.remove();
    });

    peers[userId] = call;
}

// Videoni gridga qo'shish va dublikat bo'lishini tekshirish
function addVideoStream(boxId, stream, labelText, isLocal) {
    if (document.getElementById(boxId)) return;

    const container = document.createElement('div');
    container.className = 'video-box';
    container.id = boxId;

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

// ================= Interfeys va Boshqaruv elementlari hodisalari =================

// 1. Mikrofonni yoqish/o'chirish
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

// 2. Kamerani yoqish/o'chirish
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

                // Barcha faol bog'lanishlarga ekran oqimini almashtirib uzatamiz
                for (let peerId in peers) {
                    const sender = peers[peerId].peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                }

                const myLocalVideo = document.querySelector('#local-user-box video');
                if (myLocalVideo) myLocalVideo.srcObject = screenStream;

                shareBtn.classList.add('active');

                // Ekran ulashish to'xtatilgan holat monitoringi
                videoTrack.onended = () => stopScreenShare();
            })
            .catch(err => console.error("Ekran ulashib bo'lmadi: " + err));
    } else {
        stopScreenShare();
    }
});

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    const myLocalVideo = document.querySelector('#local-user-box video');
    if (myLocalVideo) myLocalVideo.srcObject = myVideoStream;

    const camTrack = myVideoStream.getVideoTracks()[0];
    for (let peerId in peers) {
        const sender = peers[peerId].peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(camTrack);
    }
    shareBtn.classList.remove('active');
}

// 4. Chat oynasini ochish va yopish
chatBtn.addEventListener('click', () => {
    if (chatPanel.style.display === 'none' || chatPanel.style.display === '') {
        chatPanel.style.display = 'flex';
        chatBtn.classList.add('active');
    } else {
        chatPanel.style.display = 'none';
        chatBtn.classList.remove('active');
    }
});

// 5. Chat xabarini yuborish logikasi
sendChatBtn.addEventListener('click', sendMsg);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMsg();
});

function sendMsg() {
    const text = chatInput.value.trim();
    if (text) {
        socket.emit('send-chat-message', text, myName);
        chatInput.value = '';
    }
}

socket.on('receive-chat-message', (message, senderName) => {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<div class="sender">${senderName}</div><div>${message}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Avtomatik pastga tushirish
});

// 6. Admin qarori tugmalari
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
    if (confirm("Haqiqatan ham uchrashuvdan chiqmoqchimisiz?")) {
        location.reload();
    }
});
