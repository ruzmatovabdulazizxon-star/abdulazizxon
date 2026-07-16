const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

// Modallar elementlari
const adminModal = document.getElementById('admin-modal');
const guestModal = document.getElementById('guest-modal');
const modalMessage = document.getElementById('modal-message');
const guestModalTitle = document.getElementById('guest-modal-title');
const guestModalMessage = document.getElementById('guest-modal-message');
const btnAccept = document.getElementById('btn-accept');
const btnReject = document.getElementById('btn-reject');
const btnGuestClose = document.getElementById('btn-guest-close');

// Boshqaruv elementlari
const micBtn = document.getElementById('mic-btn');
const camBtn = document.getElementById('cam-btn');
const screenBtn = document.getElementById('screen-btn');
const chatBtn = document.getElementById('chat-btn');
const leaveBtn = document.getElementById('leave-btn');
const chatPanel = document.getElementById('chat-panel');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessages = document.getElementById('chat-messages');

let myPeer = null;
let myVideo = null;
const peers = {};
let userNames = {}; 
let myStream = null;
let screenStream = null;
let currentRoomId = '';
let currentUsername = '';
let iAmAdmin = false;
let pendingGuestSocketId = null;
let isScreenSharing = false;

// URL manzilidan avtomatik Xona ID sini olish
const urlRoomId = window.location.pathname.split('/')[1];
if (urlRoomId && urlRoomId !== "") {
    roomInput.value = urlRoomId;
}

// Kamerani faqat bir marta yuklash funksiyasi
function initLocalStream() {
    return new Promise((resolve, reject) => {
        if (myStream) return resolve(myStream);
        
        navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, frameRate: 24 },
            audio: true
        }).then(stream => {
            myStream = stream;
            resolve(stream);
        }).catch(err => {
            console.error("Media qurilmalarga ulanib bo'lmadi:", err);
            reject(err);
        });
    });
}

btnAccept.addEventListener('click', () => {
    if (pendingGuestSocketId) {
        socket.emit('accept-user', pendingGuestSocketId, currentRoomId);
        adminModal.style.display = 'none';
        pendingGuestSocketId = null;
    }
});

btnReject.addEventListener('click', () => {
    if (pendingGuestSocketId) {
        socket.emit('reject-user', pendingGuestSocketId);
        adminModal.style.display = 'none';
        pendingGuestSocketId = null;
    }
});

btnGuestClose.addEventListener('click', () => {
    guestModal.style.display = 'none';
    resetMeetingState();
});

joinBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const room = roomInput.value.trim();

    if (!username || !room) {
        alert("Iltimos, ism va xona ID sini kiriting!");
        return;
    }

    currentUsername = username;
    currentRoomId = room;
    joinBtn.innerText = "Ulanmoqda...";
    joinBtn.disabled = true;

    try {
        // Avval kamera va mikrofondan oqim olamiz
        await initLocalStream();

        // Serverdan yangi TURN/STUN sozlamalarini olamiz
        const res = await fetch('/ice-servers');
        const iceServers = await res.json();

        // Har safar kirganda eski peer ulanishini yo'q qilib, tozasini ochamiz
        if (myPeer) {
            myPeer.destroy();
        }

        myPeer = new Peer(undefined, {
            host: '/', 
            port: '443', 
            secure: true, 
            path: '/peerjs',
            config: { 
                iceServers: iceServers, 
                sdpSemantics: 'unified-plan',
                iceTransportPolicy: 'all'
            }
        });

        myPeer.on('open', peerId => {
            // Soket orqali xonaga qo'shilish so'rovi yuboriladi
            socket.emit('request-to-join', currentRoomId, currentUsername, peerId);
        });

        myPeer.on('error', err => {
            console.error("PeerJS Xatolik yuz berdi:", err);
            resetMeetingState();
        });

        setupApprovalLogic();

    } catch (err) {
        console.error("Ulanish jarayonida xato:", err);
        alert("Kamera/Mikrofon yoki tarmoq xatosi tufayli ulanib bo'lmadi.");
        resetMeetingState();
    }
});

function setupApprovalLogic() {
    // Eski soket tinglovchilarini tozalaymiz
    socket.off('join-approved');
    socket.off('user-awaiting-status');
    socket.off('join-rejected');
    socket.off('user-awaiting');

    socket.on('join-approved', (data) => {
        if (data && data.isAdmin) iAmAdmin = true;

        guestModal.style.display = 'none';
        adminModal.style.display = 'none';
        window.history.pushState({}, '', `/${currentRoomId}`);
        lobby.style.display = 'none';
        meetContainer.style.display = 'flex';

        // O'zimiz uchun toza video element yaratamiz
        myVideo = document.createElement('video');
        myVideo.muted = true;
        myVideo.setAttribute('playsinline', 'true');

        const myLabel = iAmAdmin ? `${currentUsername} (Admin) (Siz)` : `${currentUsername} (Siz)`;
        userNames[myPeer.id] = myLabel;
        
        if (myStream) {
            addVideoStream(myVideo, myStream, myLabel, myPeer.id);
        }

        socket.emit('join-room', currentRoomId, myPeer.id, currentUsername, iAmAdmin);
        startMeetingLogics();
    });

    socket.on('user-awaiting-status', () => {
        guestModalTitle.innerText = "Kutish zali";
        guestModalMessage.innerText = "Admin uchrashuvga ruxsat berishi kutilmoqda...";
        btnGuestClose.style.display = 'none';
        guestModal.style.display = 'flex';
    });

    socket.on('join-rejected', () => {
        guestModalTitle.innerText = "Rad etildi";
        guestModalMessage.innerText = "Xona egasi kirishingizga ruxsat bermadi.";
        btnGuestClose.style.display = 'block';
        guestModal.style.display = 'flex';
    });

    socket.on('user-awaiting', (data) => {
        if (!iAmAdmin) return;
        pendingGuestSocketId = data.socketId;
        modalMessage.innerText = `"${data.username}" uchrashuvga kirishni so'ramoqda.`;
        adminModal.style.display = 'flex';
    });
}

function startMeetingLogics() {
    socket.off('user-connected');
    socket.off('user-disconnected');
    socket.off('receive-chat-message');

    // Kiruvchi RTC chaqiriqlariga javob berish
    myPeer.on('call', call => {
        call.answer(isScreenSharing ? screenStream : myStream);
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');

        call.on('stream', userVideoStream => {
            const nameToShow = userNames[call.peer] || "Suhbatdosh";
            addVideoStream(video, userVideoStream, nameToShow, call.peer);
            peers[call.peer] = call;
        });
        
        call.on('close', () => {
            video.remove();
        });
    });

    // Yangi foydalanuvchi ulanganda unga qo'ng'iroq qilish
    socket.on('user-connected', (userData) => {
        const guestLabel = userData.isAdmin ? `${userData.username} (Admin)` : userData.username;
        userNames[userData.userId] = guestLabel;

        setTimeout(() => {
            if (myStream && myPeer && !myPeer.destroyed) {
                const call = myPeer.call(userData.userId, isScreenSharing ? screenStream : myStream);
                const video = document.createElement('video');
                video.setAttribute('playsinline', 'true');

                call.on('stream', userVideoStream => {
                    addVideoStream(video, userVideoStream, guestLabel, userData.userId);
                });
                
                call.on('close', () => {
                    video.remove();
                });
                
                peers[userData.userId] = call;
            }
        }, 1500); 
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }
        const element = document.getElementById(userId);
        if (element) element.remove();
        delete userNames[userId];
    });

    // Chat logikasi
    sendChatBtn.onclick = sendChatMessageAction;
    chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendChatMessageAction(); };

    socket.on('receive-chat-message', (data) => {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message');
        msgDiv.innerHTML = `<b>${data.username}</b>${data.message}`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // Tugmalar hodisalari
    micBtn.onclick = toggleMic;
    camBtn.onclick = toggleCam;
    screenBtn.onclick = toggleScreenShare;
    chatBtn.onclick = () => {
        chatPanel.style.display = chatPanel.style.display === 'flex' ? 'none' : 'flex';
    };
    
    // Chiqish tugmasi hodisasi
    leaveBtn.onclick = () => {
        resetMeetingState();
    };
}

function sendChatMessageAction() {
    const txt = chatInput.value.trim();
    if (txt === "") return;
    socket.emit('send-chat-message', txt);
    chatInput.value = "";
}

function toggleMic() {
    if (!myStream) return;
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        micBtn.classList.toggle('active-off', !audioTrack.enabled);
        micBtn.innerHTML = audioTrack.enabled ? '<i class="fa fa-microphone"></i>' : '<i class="fa fa-microphone-slash"></i>';
    }
}

function toggleCam() {
    if (!myStream) return;
    const videoTrack = myStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        camBtn.classList.toggle('active-off', !videoTrack.enabled);
        camBtn.innerHTML = videoTrack.enabled ? '<i class="fa fa-video"></i>' : '<i class="fa fa-video-slash"></i>';
    }
}

function toggleScreenShare() {
    if (!isScreenSharing) {
        navigator.mediaDevices.getDisplayMedia({ video: true }).then(stream => {
            screenStream = stream;
            isScreenSharing = true;
            screenBtn.classList.add('active-off');
            
            replaceVideoTrack(screenStream.getVideoTracks()[0]);
            if(myVideo) myVideo.srcObject = screenStream;

            screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
        }).catch(err => console.error("Ekran uzatib bo'lmadi:", err));
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (!isScreenSharing) return;
    isScreenSharing = false;
    screenBtn.classList.remove('active-off');
    
    screenStream.getTracks().forEach(track => track.stop());
    replaceVideoTrack(myStream.getVideoTracks()[0]);
    if(myVideo) myVideo.srcObject = myStream;
}

function replaceVideoTrack(newTrack) {
    Object.values(peers).forEach(call => {
        if(call.peerConnection) {
            const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(newTrack);
        }
    });
}

function addVideoStream(video, stream, name, userId) {
    video.srcObject = stream;
    video.onloadedmetadata = () => { video.play().catch(e => console.log(e)); };

    const existingBox = document.getElementById(userId);
    if (existingBox) {
        const label = existingBox.querySelector('.name-label');
        if (label) label.innerText = name;
        const oldVid = existingBox.querySelector('video');
        if (oldVid && oldVid.srcObject !== stream) oldVid.srcObject = stream;
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

// Chiqish va tozalash funksiyasi (Eng asosiysi)
function resetMeetingState() {
    // 1. Soket aloqasini majburiy uzish va tozalash
    if (socket) {
        socket.disconnect(); 
        socket.connect(); 
    }

    // 2. Ekran ulash jarayoni faol bo'lsa to'xtatish
    if (isScreenSharing && screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    isScreenSharing = false;
    screenBtn.classList.remove('active-off');

    // 3. Peer qo'ng'iroqlarini to'liq yopish
    Object.keys(peers).forEach(userId => {
        if (peers[userId]) {
            peers[userId].close();
        }
        delete peers[userId];
    });

    // 4. PeerJS obyektini xotiradan butunlay o'chirish
    if (myPeer) {
        myPeer.destroy();
        myPeer = null;
    }

    // 5. Grid konteyner va xotirani tozalash
    videoGrid.innerHTML = '';
    chatMessages.innerHTML = '';
    userNames = {};
    iAmAdmin = false;
    pendingGuestSocketId = null;

    // 6. Interfeys holatini qaytarish
    meetContainer.style.display = 'none';
    lobby.style.display = 'block';
    
    joinBtn.innerText = "Uchrashuvga qo'shilish";
    joinBtn.disabled = false;
    
    // URL manzilini boshlang'ich holatga qaytarish
    window.history.pushState({}, '', '/');
}
