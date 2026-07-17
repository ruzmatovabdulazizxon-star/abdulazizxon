// Serverga ulanamiz (hech qanday localhost yoki qattiq manzilsiz, avtomatik hozirgi domenga ulanadi)
const socket = io();

let currentRoom = null;
let currentRole = null;
let roomInstance = null;
let pendingUserSocketId = null;

const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const videoGrid = document.getElementById('video-grid');
const adminModal = document.getElementById('admin-modal');
const guestModal = document.getElementById('guest-modal');

// "Kirish" tugmasi bosilganda
document.getElementById('join-btn').addEventListener('click', () => {
    const username = document.getElementById('username').value.trim();
    const roomId = document.getElementById('room-id').value.trim();
    const role = document.getElementById('role').value;

    if (!username || !roomId) {
        alert("Iltimos, ism va xona ID-sini to'liq kiriting!");
        return;
    }

    currentRoom = roomId;
    currentRole = role;

    if (role === 'admin') {
        // Admin to'g'ridan-to'g'ri xonaga kirish uchun token so'raydi
        socket.emit('join-room', { roomId, username, role });
    } else {
        // Mehmon avval admindan ruxsat so'raydi
        guestModal.classList.remove('hidden');
        socket.emit('request-join', { roomId, username });
    }
});

// Adminga mehmon qo'shilish so'rovi kelganda
socket.on('join-request-received', ({ socketId, username }) => {
    pendingUserSocketId = socketId;
    document.getElementById('requesting-user').innerText = username;
    adminModal.classList.remove('hidden');
});

// Admin qarori (Ruxsat berish)
document.getElementById('accept-btn').addEventListener('click', () => {
    if (pendingUserSocketId) {
        socket.emit('admin-decision', { socketId: pendingUserSocketId, decision: 'accept' });
        adminModal.classList.add('hidden');
        pendingUserSocketId = null;
    }
});

// Admin qarori (Rad etish)
document.getElementById('reject-btn').addEventListener('click', () => {
    if (pendingUserSocketId) {
        socket.emit('admin-decision', { socketId: pendingUserSocketId, decision: 'reject' });
        adminModal.classList.add('hidden');
        pendingUserSocketId = null;
    }
});

// Mehmon ruxsat javobini olganda
socket.on('join-decision', ({ decision, message }) => {
    guestModal.classList.add('hidden');
    if (decision === 'accept') {
        const username = document.getElementById('username').value.trim();
        socket.emit('join-room', { roomId: currentRoom, username, role: currentRole });
    } else {
        alert(message || "Admin sizga xonaga kirishga ruxsat bermadi!");
    }
});

// Token tayyor bo'lganda, Livekit xonasiga ulanamiz
socket.on('token-ready', async ({ token, roomId, livekitUrl }) => {
    lobby.classList.add('hidden');
    meetContainer.classList.remove('hidden');
    document.getElementById('active-room-title').innerText = roomId;

    try {
        roomInstance = new LivekitClient.Room();
        
        // Video va audio kelganda ekranga chiqarish
        roomInstance.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                const element = track.attach();
                element.className = "w-full h-full object-cover rounded-lg border-2 border-gray-700";
                element.id = `video-${participant.identity}`;
                videoGrid.appendChild(element);
            }
        });

        // Foydalanuvchi uchrashuvdan chiqqanda uning videosini o'chirish
        roomInstance.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                track.detach();
                const element = document.getElementById(`video-${participant.identity}`);
                if (element) element.remove();
            }
        });

        // Xonaga ulanish
        await roomInstance.connect(livekitUrl, token);

        // O'z kameramiz va mikrofoni yoqamiz
        await roomInstance.localParticipant.enableCameraAndMicrophone();

        // O'z videomizni ham ekranga chiqarish
        const localVideo = document.createElement('video');
        localVideo.muted = true;
        localVideo.className = "w-full h-full object-cover rounded-lg border-2 border-blue-500";
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        
        const localVideoTrack = roomInstance.localParticipant.videoTracks.values().next().value;
        if (localVideoTrack && localVideoTrack.track) {
            localVideoTrack.track.attach(localVideo);
            videoGrid.appendChild(localVideo);
        }

    } catch (error) {
        console.error("LiveKit-ga ulanishda xatolik:", error);
        alert("Video xonaga ulanib bo'lmadi!");
    }
});

// Chiqish tugmasi
document.getElementById('leave-btn').addEventListener('click', () => {
    if (roomInstance) {
        roomInstance.disconnect();
    }
    location.reload();
});
