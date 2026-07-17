// Serverga ulanamiz (avtomatik hozirgi domenga ulanadi)
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
        socket.emit('join-room', { roomId, username, role });
    } else {
        guestModal.classList.remove('hidden');
        socket.emit('request-join', { roomId, username });
    }
});

// Admin so'rovni qabul qilganda
socket.on('join-request-received', ({ socketId, username }) => {
    pendingUserSocketId = socketId;
    document.getElementById('requesting-user').innerText = username;
    adminModal.classList.remove('hidden');
});

// Admin qarori (Ruxsat)
document.getElementById('accept-btn').addEventListener('click', () => {
    if (pendingUserSocketId) {
        socket.emit('admin-decision', { socketId: pendingUserSocketId, decision: 'accept' });
        adminModal.classList.add('hidden');
        pendingUserSocketId = null;
    }
});

// Admin qarori (Rad)
document.getElementById('reject-btn').addEventListener('click', () => {
    if (pendingUserSocketId) {
        socket.emit('admin-decision', { socketId: pendingUserSocketId, decision: 'reject' });
        adminModal.classList.add('hidden');
        pendingUserSocketId = null;
    }
});

// Mehmon javob olganda
socket.on('join-decision', ({ decision, message }) => {
    guestModal.classList.add('hidden');
    if (decision === 'accept') {
        const username = document.getElementById('username').value.trim();
        socket.emit('join-room', { roomId: currentRoom, username, role: currentRole });
    } else {
        alert(message || "Admin sizga xonaga kirishga ruxsat bermadi!");
    }
});

// LiveKit xonasiga ulanish (To'g'rilangan versiya)
socket.on('token-ready', async ({ token, roomId, livekitUrl }) => {
    lobby.classList.add('hidden');
    meetContainer.classList.remove('hidden');
    document.getElementById('active-room-title').innerText = roomId;

    try {
        // CDN global obyekti aynan LiveKitClient deb nomlanadi
        roomInstance = new LiveKitClient.Room();
        
        // Video oqimlarni eshitish
        roomInstance.on(LiveKitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                const element = track.attach();
                element.className = "w-full h-full object-cover rounded-lg border-2 border-gray-700";
                element.id = `video-${participant.identity}`;
                videoGrid.appendChild(element);
            }
        });

        // Foydalanuvchi chiqib ketganda videoni tozalash
        roomInstance.on(LiveKitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                track.detach();
                const element = document.getElementById(`video-${participant.identity}`);
                if (element) element.remove();
            }
        });

        // Livekit serveriga ulanish
        await roomInstance.connect(livekitUrl, token);

        // Kamera va mikrofonni ishga tushirish
        await roomInstance.localParticipant.enableCameraAndMicrophone();

        // O'z kameramizni ekranga joylash
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

// Chiqish tugmasi mantiqi
document.getElementById('leave-btn').addEventListener('click', () => {
    if (roomInstance) {
        roomInstance.disconnect();
    }
    location.reload();
});
