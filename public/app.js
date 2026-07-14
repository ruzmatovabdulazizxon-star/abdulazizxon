const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// PeerJS sozlamalari
const peer = new Peer(undefined, {
    host: location.hostname,
    port: location.port || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs'
});

let myStream;
let myPeerId;
let myUsername = "Foydalanuvchi";
let currentRoomId = "";

// Ulangan foydalanuvchilar oqimlarini saqlash
const peers = {};

// Ekran ulashish o'zgaruvchilari
let screenSharing = false;
let screenStream = null;
let screenPeer = null;

// HTML Elementlar
const joinPanel = document.getElementById('join-panel');
const usernameInput = document.getElementById('username-input');
const targetRoomInput = document.getElementById('target-room-input');
const roomDisplay = document.getElementById('room-display');
const waitingScreen = document.getElementById('waiting-screen');
const lobbyModal = document.getElementById('lobby-modal');
const lobbyMsg = document.getElementById('lobby-msg');
const btnAdmit = document.getElementById('btn-admit');
const btnReject = document.getElementById('btn-reject');
const chatSidebar = document.getElementById('chat-sidebar');
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chat-messages');

let pendingUser = null;
let audioMuted = false;
let videoOff = false;

// O'z Peer IDimizni olish
peer.on('open', (id) => {
    myPeerId = id;
});

// Uchrashuvga kirish
function startMeeting() {
    const inputName = usernameInput.value.trim();
    if (!inputName) {
        alert("Iltimos, ismingizni kiriting!");
        return;
    }
    myUsername = inputName;
    
    const targetRoom = targetRoomInput.value.trim();
    currentRoomId = targetRoom || Math.floor(100000 + Math.random() * 900000).toString();
    roomDisplay.innerText = currentRoomId;

    joinPanel.style.display = 'none';

    // Kamera va mikrofonga ruxsat olish
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myStream = stream;
        
        // O'z videomizni ekranga qo'shish
        addVideoStream(createVideoElement(myUsername + " (Siz)", true), stream, socket.id);

        // Lobby (Kutish ekrani)ni yoqish va serverga so'rov yuborish
        waitingScreen.style.display = 'flex';
        socket.emit('join-room', currentRoomId, myUsername, myPeerId);
    }).catch(err => {
        console.error(err);
        alert("Kamera va mikrofonga ruxsat berishingiz zarur!");
    });
}

// Admin javobi kelganda
socket.on('join-decision', (decision) => {
    if (decision === 'approved') {
        waitingScreen.style.display = 'none';
        
        // Boshqalardan kelayotgan qo'ng'iroqlarni qabul qilish (PeerJS)
        peer.on('call', (call) => {
            call.answer(myStream);
            
            // Kim qo'ng'iroq qilayotganini aniqlash (Ekran yoki Oddiy foydalanuvchi)
            const isCallScreen = call.metadata && call.metadata.isScreen;
            const label = isCallScreen ? "Ekran" : "Suhbatdosh";
            
            const video = createVideoElement(label, false);
            call.on('stream', (userVideoStream) => {
                addVideoStream(video, userVideoStream, call.peer);
            });
        });
    } else if (decision === 'rejected') {
        waitingScreen.style.display = 'none';
        alert("Ruxsat berilmadi: Admin kirishingizni rad etdi.");
        window.location.reload();
    }
});

// Admin uchun: Mehmon kelganda modalni ochish
socket.on('request-join', (data) => {
    pendingUser = data;
    lobbyMsg.innerText = `"${data.username}" kirishni so'rayapti.`;
    lobbyModal.style.display = 'flex';
});

btnAdmit.addEventListener('click', () => {
    if (pendingUser) {
        socket.emit('admin-decision', {
            targetSocketId: pendingUser.socketId,
            decision: 'approved',
            roomId: pendingUser.roomId,
            peerId: pendingUser.peerId,
            username: pendingUser.username
        });
        lobbyModal.style.display = 'none';
        pendingUser = null;
    }
});

btnReject.addEventListener('click', () => {
    if (pendingUser) {
        socket.emit('admin-decision', {
            targetSocketId: pendingUser.socketId,
            decision: 'rejected'
        });
        lobbyModal.style.display = 'none';
        pendingUser = null;
    }
});

// Xonaga yangi foydalanuvchi yoki ekran ulanganda
socket.on('user-connected', (peerId, username, socketId, isScreen) => {
    console.log('Ulanish aniqlandi:', username);
    
    // Yangi ulanishga avtomatik qo'ng'iroq qilish (Call)
    // metadata orqali ekran yoki kamera oqimi ekanini uzatamiz
    const call = peer.call(peerId, myStream, { metadata: { isScreen: isScreen } });
    
    const video = createVideoElement(username, false);
    call.on('stream', (userVideoStream) => {
        addVideoStream(video, userVideoStream, socketId);
    });

    call.on('close', () => {
        video.remove();
    });

    peers[socketId] = call;
});

// Kimdir chiqqanda videoni o'chirish
socket.on('user-disconnected', (socketId) => {
    if (peers[socketId]) peers[socketId].close();
    const videoEl = document.getElementById(socketId);
    if (videoEl) videoEl.remove();
    updateVideoLayout();
});

socket.on('meeting-ended', () => {
    alert("Admin uchrashuvni yakunladi.");
    window.location.reload();
});


// ==========================================
// MUKAMMAL EKRAN ULASHISH SCRIPTlari
// ==========================================

function toggleScreenShare() {
    const btn = document.getElementById('share-btn');
    
    if (!screenSharing) {
        navigator.mediaDevices.getDisplayMedia({ video: true }).then(stream => {
            screenStream = stream;
            screenSharing = true;
            btn.classList.add('off');
            btn.querySelector('span').innerText = "To'xtatish";

            // Ekran uchun alohida Peer ulanishini ochish
            screenPeer = new Peer(undefined, {
                host: location.hostname,
                port: location.port || (location.protocol === 'https:' ? 443 : 80),
                path: '/peerjs'
            });

            screenPeer.on('open', (screenId) => {
                // DIQQAT: Serverga ismida '(Ekran)' belgisi bilan yuboramiz. 
                // Server buni ko'rib Lobby modalini chetlab o'tadi!
                socket.emit('join-room', currentRoomId, `${myUsername} (Ekran)`, screenId);

                // O'zimizda ham ekranni alohida oyna sifatida pastda chiroyli ko'rsatish
                const screenBox = createVideoElement("Sizning ekraningiz", true);
                screenBox.id = "my-screen-share";
                addVideoStream(screenBox, screenStream, null);

                // Ekran Peer ulanishi orqali xonadagilarga oqimni tarqatish
                screenPeer.on('call', (call) => {
                    call.answer(screenStream);
                });
            });

            // Brauzerning o'zidan "Dostupni yopish" bosilsa
            screenStream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };

        }).catch(err => {
            console.error(err);
            alert("Ekran ulashish rad etildi.");
        });
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (!screenSharing) return;

    const btn = document.getElementById('share-btn');
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }

    const myScreenBox = document.getElementById("my-screen-share");
    if (myScreenBox) myScreenBox.remove();

    if (screenPeer) {
        screenPeer.destroy();
    }

    socket.emit('leave-screen', currentRoomId);

    screenSharing = false;
    screenStream = null;
    btn.classList.remove('off');
    btn.querySelector('span').innerText = "Ekran";
    
    updateVideoLayout();
}

// Boshqalarda ekran o'chganda uni ekrandan yo'q qilish
socket.on('screen-disconnected', (screenId) => {
    const remoteScreenBox = document.getElementById(screenId);
    if (remoteScreenBox) {
        remoteScreenBox.remove();
    }
    updateVideoLayout();
});


// ==========================================
// VIZUAL VA CHAT FUNKSIYALARI
// ==========================================

function createVideoElement(labelName, isMe) {
    const box = document.createElement('div');
    box.classList.add('video-box');
    
    const video = document.createElement('video');
    if (isMe) video.muted = true; // O'z ovozimiz qaytmasligi uchun
    
    const overlay = document.createElement('div');
    overlay.classList.add('video-overlay');
    overlay.innerHTML = `<i class="fa-solid fa-microphone status-icon" id="mic-icon-${isMe ? 'me' : 'user'}"></i> <span>${labelName}</span>`;
    
    box.appendChild(video);
    box.appendChild(overlay);
    return box;
}

function addVideoStream(videoBox, stream, socketId) {
    const video = videoBox.querySelector('video');
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });
    
    if (socketId) {
        videoBox.id = socketId;
    }
    
    videoGrid.appendChild(videoBox);
    updateVideoLayout();
}

function updateVideoLayout() {
    const videoCount = videoGrid.children.length;
    let columns = 1;
    if (videoCount > 1 && videoCount <= 4) columns = 2;
    if (videoCount > 4) columns = 3;
    videoGrid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
}

function toggleMute() {
    audioMuted = !audioMuted;
    myStream.getAudioTracks()[0].enabled = !audioMuted;
    
    const btn = document.getElementById('mute-btn');
    const icon = btn.querySelector('i');
    const span = btn.querySelector('span');

    if (audioMuted) {
        btn.classList.add('off');
        icon.className = 'fa-solid fa-microphone-slash';
        span.innerText = "Mikrofon: OFF";
    } else {
        btn.classList.remove('off');
        icon.className = 'fa-solid fa-microphone';
        span.innerText = "Mikrofon: ON";
    }
}

function toggleCamera() {
    videoOff = !videoOff;
    myStream.getVideoTracks()[0].enabled = !videoOff;
    
    const btn = document.getElementById('camera-btn');
    const icon = btn.querySelector('i');
    const span = btn.querySelector('span');

    if (videoOff) {
        btn.classList.add('off');
        icon.className = 'fa-solid fa-video-slash';
        span.innerText = "Kamera: OFF";
    } else {
        btn.classList.remove('off');
        icon.className = 'fa-solid fa-video';
        span.innerText = "Kamera: ON";
    }
}

function toggleChat() {
    chatSidebar.classList.toggle('closed');
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const messageData = {
        sender: myUsername,
        text: text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.emit('send-chat-message', currentRoomId, messageData);
    appendMessage(messageData, true);
    messageInput.value = "";
}

function handleKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

socket.on('chat-message', (messageData) => {
    appendMessage(messageData, false);
});

function appendMessage(data, isMe) {
    const msgEl = document.createElement('div');
    msgEl.classList.add('chat-msg');
    if (isMe) msgEl.classList.add('me');

    msgEl.innerHTML = `
        <div class="msg-meta">${isMe ? "Siz" : data.sender} • ${data.time}</div>
        <div>${data.text}</div>
    `;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function leaveRoom() {
    if (confirm("Uchrashuvdan chiqishni xohlaysizmi?")) {
        window.location.reload();
    }
}
