const socket = io();

let room = null;
let username = null;
let activeRoom = null; 
let isScreenSharing = false;

const lobby = document.getElementById('lobby');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const meetContainer = document.getElementById('meet-container');
const videoGrid = document.getElementById('video-grid');

const adminModal = document.getElementById('admin-modal');
const modalMessage = document.getElementById('modal-message');
const btnAccept = document.getElementById('btn-accept');
const btnReject = document.getElementById('btn-reject');

const guestModal = document.getElementById('guest-modal');
const guestModalTitle = document.getElementById('guest-modal-title');
const guestModalMessage = document.getElementById('guest-modal-message');
const btnGuestClose = document.getElementById('btn-guest-close');

const micBtn = document.getElementById('mic-btn');
const camBtn = document.getElementById('cam-btn');
const screenBtn = document.getElementById('screen-btn');
const chatBtn = document.getElementById('chat-btn');
const leaveBtn = document.getElementById('leave-btn');
const chatPanel = document.getElementById('chat-panel');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessages = document.getElementById('chat-messages');

let pendingUserSocketId = null; 

joinBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    room = roomInput.value.trim();

    if (!username || !room) {
        alert("Iltimos, ismingizni va xona ID raqamini kiriting!");
        return;
    }
    socket.emit('request-to-join', room, username);
});

socket.on('user-awaiting-status', () => {
    guestModalTitle.innerText = "Kutish zali";
    guestModalMessage.innerText = "Siz kutish zalidasiz. Admin tasdiqlashi kutilmoqda...";
    btnGuestClose.style.display = "none";
    guestModal.style.display = "flex";
});

socket.on('user-awaiting', (data) => {
    pendingUserSocketId = data.socketId;
    modalMessage.innerHTML = `<b>${data.username}</b> xonaga kirish uchun ruxsat so'ramoqda.`;
    adminModal.style.display = "flex";
});

btnAccept.addEventListener('click', () => {
    if (pendingUserSocketId) {
        socket.emit('accept-user', pendingUserSocketId, room);
        adminModal.style.display = "none";
        pendingUserSocketId = null;
    }
});

btnReject.addEventListener('click', () => {
    if (pendingUserSocketId) {
        socket.emit('reject-user', pendingUserSocketId);
        adminModal.style.display = "none";
        pendingUserSocketId = null;
    }
});

socket.on('join-rejected', () => {
    guestModalTitle.innerText = "Rad etildi";
    guestModalMessage.innerText = "Admin sizning kirish so'rovingizni rad etdi.";
    btnGuestClose.style.display = "block";
});

btnGuestClose.addEventListener('click', () => {
    guestModal.style.display = "none";
});

socket.on('join-approved', async (userData) => {
    guestModal.style.display = "none";
    lobby.style.display = "none";
    meetContainer.style.display = "flex";
    await connectToLiveKit(room, username, userData.isAdmin);
});

async function connectToLiveKit(roomName, participantName, isAdmin) {
    try {
        const response = await fetch('/get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName, participantName, isAdmin })
        });

        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }

        const { token, serverUrl } = data;

        activeRoom = new LiveKit.Room({
            adaptiveStream: true,
            dynacast: true,
        });

        await activeRoom.connect(serverUrl, token);

        await activeRoom.localParticipant.enableCameraAndMicrophone();
        
        const localVideoTrackPublication = activeRoom.localParticipant.getTrackPublication(LiveKit.Track.Source.Camera);
        if (localVideoTrackPublication && localVideoTrackPublication.videoTrack) {
            renderVideo(localVideoTrackPublication.videoTrack, activeRoom.localParticipant.identity, true);
        }

        activeRoom.on(LiveKit.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === LiveKit.Track.Kind.Video) {
                renderVideo(track, participant.identity, false);
            } else if (track.kind === LiveKit.Track.Kind.Audio) {
                const audioElement = track.attach();
                document.body.appendChild(audioElement);
            }
        });

        activeRoom.on(LiveKit.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === LiveKit.Track.Kind.Video) {
                const element = document.getElementById(`video-${participant.identity}`);
                if (element) element.remove();
            }
        });

        socket.emit('join-room', roomName, socket.id, participantName, isAdmin);
        startChatLogics();

    } catch (err) {
        console.error("LiveKit-ga ulanishda xatolik:", err);
    }
}

function renderVideo(track, identity, isLocal = false) {
    let videoBox = document.getElementById(`video-${identity}`);
    if (!videoBox) {
        videoBox = document.createElement('div');
        videoBox.id = `video-${identity}`;
        videoBox.className = 'video-box';

        const nameLabel = document.createElement('div');
        nameLabel.className = 'name-label';
        nameLabel.innerText = isLocal ? `${identity} (Siz)` : identity;
        videoBox.appendChild(nameLabel);
        videoGrid.appendChild(videoBox);
    }

    const videoElement = track.attach();
    videoElement.style.width = "100%";
    videoElement.style.height = "100%";
    videoElement.style.objectFit = "cover";
    
    if (isLocal) {
        videoElement.style.transform = "scaleX(-1)";
    }
    videoBox.appendChild(videoElement);
}

function startChatLogics() {
    socket.off('receive-chat-message');
    
    sendChatBtn.onclick = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        socket.emit('send-chat-message', text);
        chatInput.value = '';
    };

    chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendChatBtn.click(); };

    socket.on('receive-chat-message', (data) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';
        msgDiv.innerHTML = `<b>${data.username}</b> <span>${data.message}</span>`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    micBtn.onclick = async () => {
        const isMuted = activeRoom.localParticipant.isMicrophoneEnabled;
        await activeRoom.localParticipant.setMicrophoneEnabled(!isMuted);
        micBtn.classList.toggle('active-off', isMuted);
        micBtn.innerHTML = isMuted ? '<i class="fa fa-microphone-slash"></i>' : '<i class="fa fa-microphone"></i>';
    };

    camBtn.onclick = async () => {
        const isCamOn = activeRoom.localParticipant.isCameraEnabled;
        await activeRoom.localParticipant.setCameraEnabled(!isCamOn);
        camBtn.classList.toggle('active-off', isCamOn);
        camBtn.innerHTML = isCamOn ? '<i class="fa fa-video-slash"></i>' : '<i class="fa fa-video"></i>';
    };

    screenBtn.onclick = async () => {
        try {
            await activeRoom.localParticipant.setScreenShareEnabled(!isScreenSharing);
            isScreenSharing = !isScreenSharing;
            screenBtn.classList.toggle('active-off', isScreenSharing);
        } catch (e) {
            console.error(e);
        }
    };

    chatBtn.onclick = () => {
        chatPanel.style.display = chatPanel.style.display === "flex" ? "none" : "flex";
    };

    leaveBtn.onclick = () => {
        if (confirm("Uchrashuvdan chiqmoqchimisiz?")) {
            socket.emit('leave-room-signal');
            if (activeRoom) activeRoom.disconnect();
            window.location.reload();
        }
    };
}
