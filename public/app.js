const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');

// Modallar
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

const urlRoomId = window.location.pathname.split('/')[1];
if (urlRoomId && urlRoomId !== "") {
    roomInput.value = urlRoomId;
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

// Uchrashuvga kirishni so'rash
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const room = roomInput.value.trim();

    if (!username || !room) {
        alert("Iltimos, ism va xona ID sini kiriting!");
        return;
    }

    currentUsername = username;
    currentRoomId = room;
    joinBtn.innerText = "So'ralmoqda...";
    joinBtn.disabled = true;

    setupApprovalLogic();
    socket.emit('request-to-join', currentRoomId, currentUsername);
});

function setupApprovalLogic() {
    socket.off('join-approved');
    socket.off('user-awaiting-status');
    socket.off('join-rejected');
    socket.off('user-awaiting');

    socket.on('join-approved', async (data) => {
        if (data && data.isAdmin) iAmAdmin = true;

        guestModal.style.display = 'none';
        adminModal.style.display = 'none';
        window.history.pushState({}, '', `/${currentRoomId}`);
        lobby.style.display = 'none';
        meetContainer.style.display = 'flex';

        try {
            // Kamerani ishga tushirish (Optima rezolyutsiya)
            myStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, frameRate: 24 },
                audio: true
            });

            // DIQQAT: PeerJS Rasmiy Global Bulutli serveriga ulanamiz! (Render muammolaridan qutulamiz)
            myPeer = new Peer(undefined, {
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' }
                    ]
                }
            });

            myPeer.on('open', peerId => {
                myVideo = document.createElement('video');
                myVideo.muted = true;
                myVideo.setAttribute('playsinline', 'true');

                const myLabel = iAmAdmin ? `${currentUsername} (Admin) (Siz)` : `${currentUsername} (Siz)`;
                userNames[peerId] = myLabel;
                
                addVideoStream(myVideo, myStream, myLabel, peerId);
                socket.emit('join-room', currentRoomId, peerId, currentUsername, iAmAdmin);
                startMeetingLogics();
            });

            myPeer.on('error', err => {
                console.error("PeerJS Cloud Error:", err);
                resetMeetingState();
            });

        } catch (err) {
            console.error(err);
            alert("Kamera yoki mikrofonga ruxsat berilmadi!");
            resetMeetingState();
        }
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

    // Chaqiriqlarga javob berish
    myPeer.on('call', call => {
        call.answer(isScreenSharing ? screenStream : myStream);
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');

        call.on('stream', userVideoStream => {
            const nameToShow = userNames[call.peer] || "Suhbatdosh";
            addVideoStream(video, userVideoStream, nameToShow, call.peer);
            peers[call.peer] = call;
        });
    });

    // Yangi ulanish
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
                
                peers[userData.userId] = call;
            }
        }, 1500); 
    });

    socket.on('user-disconnected', userId => {
        if (peers[userId]) peers[userId].close();
        const element = document.getElementById(userId);
        if (element) element.remove();
        delete userNames[userId];
    });

    sendChatBtn.onclick = sendChatMessageAction;
    chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendChatMessageAction(); };

    socket.on('receive-chat-message', (data) => {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message');
        msgDiv.innerHTML = `<b>${data.username}</b>${data.message}`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    micBtn.onclick = toggleMic;
    camBtn.onclick = toggleCam;
    screenBtn.onclick = toggleScreenShare;
    chatBtn.onclick = () => {
        chatPanel.style.display = chatPanel.style.display === 'flex' ? 'none' : 'flex';
    };
    
    leaveBtn.onclick = () => {
        if (confirm("Xonani rostdan ham tark etmoqchimisiz?")) resetMeetingState();
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
            if(myVideo) myVideo.srcObject = stream;
            screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
        }).catch(err => console.error(err));
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

function resetMeetingState() {
    if (socket) {
        socket.emit('leave-room-signal');
        socket.disconnect(); 
        socket.connect(); 
    }

    if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
        myStream = null;
    }
    if (isScreenSharing && screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    isScreenSharing = false;
    screenBtn.classList.remove('active-off');

    Object.keys(peers).forEach(userId => {
        if (peers[userId]) peers[userId].close();
        delete peers[userId];
    });

    if (myPeer) {
        myPeer.destroy();
        myPeer = null;
    }

    videoGrid.innerHTML = '';
    chatMessages.innerHTML = '';
    userNames = {};
    iAmAdmin = false;
    pendingGuestSocketId = null;

    meetContainer.style.display = 'none';
    lobby.style.display = 'block';
    
    joinBtn.innerText = "Uchrashuvga qo'shilish";
    joinBtn.disabled = false;
    
    window.history.pushState({}, '', '/');
}
