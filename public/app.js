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

// LiveKit o'zgaruvchilari
let currentRoom = null;
let currentRoomId = '';
let currentUsername = '';
let iAmAdmin = false;
let pendingGuestSocketId = null;

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
            // Serverdan LiveKit tokenini olamiz
            const response = await fetch('/get-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: currentRoomId,
                    participantName: currentUsername,
                    isAdmin: iAmAdmin
                })
            });

            const tokenData = await response.json();
            if (tokenData.error) {
                alert("Token olishda xatolik: " + tokenData.error);
                resetMeetingState();
                return;
            }

            // LiveKit xonasini yaratish va unga ulanish
            const LiveKitJS = window.LiveKit || window.LiveKitClient;
            if (!LiveKitJS) {
                alert("Xatolik: LiveKit kutubxonasi yuklanmagan!");
                resetMeetingState();
                return;
            }

            currentRoom = new LiveKitJS.Room({
                adaptiveStream: true,
                dynacast: true,
            });

            // Yangi ishtirokchilar ulangandagi sozlamalar
            currentRoom
                .on(LiveKitJS.RoomEvent.TrackSubscribed, (track, publication, participant) => {
                    if (track.kind === LiveKitJS.Track.Kind.Video) {
                        const videoElement = track.attach();
                        const labelName = participant.identity;
                        addVideoStream(videoElement, labelName, participant.sid);
                    } else if (track.kind === LiveKitJS.Track.Kind.Audio) {
                        track.attach(); // Ovozni ijro etish uchun
                    }
                })
                .on(LiveKitJS.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                    track.detach();
                    if (track.kind === LiveKitJS.Track.Kind.Video) {
                        const existingBox = document.getElementById(participant.sid);
                        if (existingBox) existingBox.remove();
                    }
                })
                .on(LiveKitJS.RoomEvent.ParticipantDisconnected, (participant) => {
                    const existingBox = document.getElementById(participant.sid);
                    if (existingBox) existingBox.remove();
                });

            // LiveKit serverga ulanamiz
            await currentRoom.connect(tokenData.serverUrl, tokenData.token);

            // Kameramiz va mikrofonimizni yoqamiz (Lokal oqimlar)
            await currentRoom.localParticipant.enableCameraAndMicrophone();

            // O'zimizning videomizni ekranga chiqaramiz
            const localVideoTrack = currentRoom.localParticipant.getTrackPublication(LiveKitJS.Track.Source.Camera);
            if (localVideoTrack && localVideoTrack.track) {
                const myVideoElement = localVideoTrack.track.attach();
                myVideoElement.muted = true;
                const myLabel = iAmAdmin ? `${currentUsername} (Admin) (Siz)` : `${currentUsername} (Siz)`;
                addVideoStream(myVideoElement, myLabel, currentRoom.localParticipant.sid);
            }

            // Soket xonasiga ham chat uchun ulanib qo'yamiz
            socket.emit('join-room', currentRoomId, currentRoom.localParticipant.sid, currentUsername, iAmAdmin);
            startMeetingLogics();

        } catch (err) {
            console.error("LiveKit-ga ulanishda xato:", err);
            alert("Xonaga ulanishda xatolik yuz berdi.");
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
    socket.off('receive-chat-message');

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

async function toggleMic() {
    if (!currentRoom) return;
    const isEnabled = currentRoom.localParticipant.isMicrophoneEnabled;
    await currentRoom.localParticipant.setMicrophoneEnabled(!isEnabled);
    micBtn.classList.toggle('active-off', isEnabled);
    micBtn.innerHTML = !isEnabled ? '<i class="fa fa-microphone"></i>' : '<i class="fa fa-microphone-slash"></i>';
}

async function toggleCam() {
    if (!currentRoom) return;
    const isEnabled = currentRoom.localParticipant.isCameraEnabled;
    await currentRoom.localParticipant.setCameraEnabled(!isEnabled);
    camBtn.classList.toggle('active-off', isEnabled);
    camBtn.innerHTML = !isEnabled ? '<i class="fa fa-video"></i>' : '<i class="fa fa-video-slash"></i>';
}

async function toggleScreenShare() {
    if (!currentRoom) return;
    const isScreenShared = currentRoom.localParticipant.isScreenShareEnabled;
    try {
        await currentRoom.localParticipant.setScreenShareEnabled(!isScreenShared);
        screenBtn.classList.toggle('active-off', !isScreenShared);
    } catch (e) {
        console.error("Ekran ulashishda xatolik:", e);
    }
}

function addVideoStream(videoElement, name, userId) {
    // Agar bu foydalanuvchining video qutisi allaqachon mavjud bo'lsa, uni almashtiramiz
    const existingBox = document.getElementById(userId);
    if (existingBox) {
        const oldVid = existingBox.querySelector('video');
        if (oldVid) oldVid.replaceWith(videoElement);
        return;
    }

    videoElement.autoplay = true;
    videoElement.setAttribute('playsinline', 'true');

    const videoBox = document.createElement('div');
    videoBox.classList.add('video-box');
    videoBox.id = userId;

    const nameLabel = document.createElement('div');
    nameLabel.classList.add('name-label');
    nameLabel.innerText = name;

    videoBox.appendChild(videoElement);
    videoBox.appendChild(nameLabel);
    videoGrid.appendChild(videoBox);
}

function resetMeetingState() {
    if (socket) {
        socket.emit('leave-room-signal');
        socket.disconnect(); 
        socket.connect(); 
    }

    if (currentRoom) {
        currentRoom.disconnect();
        currentRoom = null;
    }

    screenBtn.classList.remove('active-off');
    micBtn.classList.remove('active-off');
    camBtn.classList.remove('active-off');

    videoGrid.innerHTML = '';
    chatMessages.innerHTML = '';
    iAmAdmin = false;
    pendingGuestSocketId = null;

    meetContainer.style.display = 'none';
    lobby.style.display = 'block';
    
    joinBtn.innerText = "Uchrashuvga qo'shilish";
    joinBtn.disabled = false;
    
    window.history.pushState({}, '', '/');
}
