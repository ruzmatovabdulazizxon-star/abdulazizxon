const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// PeerJS sozlamalari (Render yoki lokal xost uchun moslashuvchan)
const peer = new Peer(undefined, {
    host: location.hostname,
    port: location.port || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs'
});

let myStream;
let myPeerId;
let myUsername = "Foydalanuvchi";
let currentRoomId = "";
const peers = {};

// HTML elementlar bilan ishlash
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

let pendingUser = null; // Kutayotgan foydalanuvchi ob'ekti (Admin uchun)

// Kamera va mikrofon holatlari
let audioMuted = false;
let videoOff = false;
let screenSharing = false;
let screenStream = null;

// Peer ID olinganda ishga tushadi
peer.on('open', (id) => {
    myPeerId = id;
});

// Uchrashuvga kirishni boshlash funksiyasi
function startMeeting() {
    const inputName = usernameInput.value.trim();
    if (!inputName) {
        alert("Iltimos, ismingizni kiriting!");
        return;
    }
    myUsername = inputName;
    
    const targetRoom = targetRoomInput.value.trim();
    // Agar xona ID yozilmagan bo'lsa, yangi xona (tasodifiy ID) yaratiladi
    currentRoomId = targetRoom || Math.floor(100000 + Math.random() * 900000).toString();
    roomDisplay.innerText = currentRoomId;

    // Kirish oynasini yopish
    joinPanel.style.display = 'none';

    // Kamerani yoqish va xonaga ulanish jarayonini boshlash
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myStream = stream;
        
        // O'z videomizni ekranga chiqarish
        addVideoStream(createVideoElement(myUsername + " (Siz)", true), stream, socket.id);

        // Birinchi bo'lib xona ruxsatini tekshirish uchun so'rov jo'natamiz
        waitingScreen.style.display = 'flex'; // Vaqtincha kutish rejimini ko'rsatamiz
        socket.emit('join-room', currentRoomId, myUsername, myPeerId);
    }).catch(err => {
        console.error("Kamera yoki mikrofonga ruxsat berilmadi:", err);
        alert("Kamera va mikrofonga ruxsat berishingiz shart!");
    });
}

// Admin qarori natijasi kelganda
socket.on('join-decision', (decision) => {
    if (decision === 'approved') {
        // Tasdiqlansa: kutish ekranini yopamiz
        waitingScreen.style.display = 'none';
        console.log("Xonaga ulanish muvaffaqiyatli tasdiqlandi!");
        
        // Qo'ng'iroqlarni qabul qilish (PeerJS)
        peer.on('call', (call) => {
            call.answer(myStream);
            const video = createVideoElement("Suhbatdosh", false);
            call.on('stream', (userVideoStream) => {
                addVideoStream(video, userVideoStream, call.peer);
            });
        });
    } else if (decision === 'rejected') {
        waitingScreen.style.display = 'none';
        alert("Ruxsat berilmadi: Xona egasi sizning kirishingizni rad etdi.");
        window.location.reload();
    }
});

// Admin uchun: yangi foydalanuvchi kirishni so'raganda ruxsat paneli chiqishi
socket.on('request-join', (data) => {
    pendingUser = data; // so'rayotgan foydalanuvchi (socketId, username, peerId, roomId)
    lobbyMsg.innerText = `"${data.username}" uchrashuvga kirishni so'rayapti.`;
    lobbyModal.style.display = 'flex'; // Modalni ko'rsatish
});

// Admin ruxsat berish tugmasini bosganda
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

// Admin rad etish tugmasini bosganda
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

// Xonaga yangi foydalanuvchi ulanganda (WebRTC PeerJS aloqasi)
socket.on('user-connected', (peerId, username, socketId) => {
    console.log('Yangi foydalanuvchi ulandi:', peerId);
    
    // Yangi foydalanuvchiga video oqimini yuborish (Call)
    const call = peer.call(peerId, myStream);
    const video = createVideoElement(username, false);
    
    call.on('stream', (userVideoStream) => {
        addVideoStream(video, userVideoStream, socketId);
    });

    call.on('close', () => {
        video.remove();
    });

    peers[socketId] = call;
});

// Kimdir xonadan chiqqanda videoni o'chirish
socket.on('user-disconnected', (socketId) => {
    if (peers[socketId]) peers[socketId].close();
    const videoEl = document.getElementById(socketId);
    if (videoEl) videoEl.remove();
    updateVideoLayout();
});

// Admin chiqib ketgan taqdirda uchrashuvni yakunlash
socket.on('meeting-ended', () => {
    alert("Xona egasi uchrashuvni yakunladi.");
    window.location.reload();
});

// ==========================================
// VIZUAL VA CHAT FUNKSIYALARI
// ==========================================

function createVideoElement(labelName, isMe) {
    const box = document.createElement('div');
    box.classList.add('video-box');
    
    const video = document.createElement('video');
    if (isMe) video.muted = true; // O'z ovozimiz aks-sado bermasligi uchun
    
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

// Videolar soniga qarab ekran kataklarini (Grid) avtomatik moslashtirish
function updateVideoLayout() {
    const videoCount = videoGrid.children.length;
    let columns = 1;
    if (videoCount > 1 && videoCount <= 4) columns = 2;
    if (videoCount > 4) columns = 3;
    videoGrid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
}

// Boshqaruv tugmalari funksiyalari
function toggleMute() {
    audioMuted = !audioMuted;
    myStream.getAudioTracks()[0].enabled = !audioMuted;
    
    const btn = document.getElementById('mute-btn');
    const icon = btn.querySelector('i');
    const span = btn.querySelector('span');

    if (audioMuted) {
        btn.classList.add('off');
        icon.className = 'fa-solid fa-microphone-slash';
        span.innerText = "Ovozni yoqish";
    } else {
        btn.classList.remove('off');
        icon.className = 'fa-solid fa-microphone';
        span.innerText = "Ovozni o'chirish";
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
        span.innerText = "Kamerani yoqish";
    } else {
        btn.classList.remove('off');
        icon.className = 'fa-solid fa-video';
        span.innerText = "Kamerani o'chirish";
    }
}

// Ekran ulashish funksiyasi
function toggleScreenShare() {
    if (!screenSharing) {
        navigator.mediaDevices.getDisplayMedia({ video: true }).then(stream => {
            screenStream = stream;
            const videoTrack = screenStream.getVideoTracks()[0];
            
            // O'z oqimimizdagi video datchikni ekran datchigiga almashtirish
            const myVideoBox = document.getElementById(socket.id);
            if (myVideoBox) {
                myVideoBox.querySelector('video').srcObject = screenStream;
            }

            // Boshqa ulangan foydalanuvchilarga almashtirilgan video datchikni yuborish
            for (const socketId in peers) {
                const peerConnection = peers[socketId].peerConnection;
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(sender => sender.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(videoTrack);
                }
            }

            screenSharing = true;
            document.getElementById('share-btn').classList.add('off');

            // Agar ekran ulashish to'xtatilsa, kamerani qaytarish
            videoTrack.onended = () => {
                stopScreenShare();
            };
        }).catch(err => {
            console.error("Ekran ulashib bo'lmadi:", err);
        });
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    const cameraTrack = myStream.getVideoTracks()[0];
    
    const myVideoBox = document.getElementById(socket.id);
    if (myVideoBox) {
        myVideoBox.querySelector('video').srcObject = myStream;
    }

    for (const socketId in peers) {
        const peerConnection = peers[socketId].peerConnection;
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track.kind === 'video');
        if (videoSender) {
            videoSender.replaceTrack(cameraTrack);
        }
    }

    screenSharing = false;
    document.getElementById('share-btn').classList.remove('off');
}

// Chat boshqaruvi
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

    // Chat xabarini serverga (va boshqalarga) jo'natish
    socket.emit('send-chat-message', currentRoomId, messageData);

    // O'zimizga xabarni chiroyli qilib qo'shish
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
    chatMessages.scrollTop = chatMessages.scrollHeight; // Avtomatik pastga tushish
}

// Xonadan chiqib ketish
function leaveRoom() {
    if (confirm("Uchrashuvdan chiqishni xohlaysizmi?")) {
        window.location.reload();
    }
}
