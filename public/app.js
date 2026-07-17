const socket = io();

// HTML elementlarini yangi ID lar bo'yicha bog'laymiz
const lobby = document.getElementById('lobby');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const roleSelect = document.getElementById('role');
const joinBtn = document.getElementById('join-btn');

const meetContainer = document.getElementById('meet-container');
const leaveBtn = document.getElementById('leave-btn');
const videoGrid = document.getElementById('video-grid');

const adminModal = document.getElementById('admin-modal');
const requestingUserSpan = document.getElementById('requesting-user');
const acceptBtn = document.getElementById('accept-btn');
const rejectBtn = document.getElementById('reject-btn');

const guestModal = document.getElementById('guest-modal');

let roomInstance = null;
let currentPendingUser = null;

// KIRISH TUGMASI BOSILGANDA
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    const role = roleSelect.value;

    if (!username || !roomId) {
        alert("Iltimos, ism va xona ID-sini kiriting!");
        return;
    }

    if (role === 'admin') {
        // Admin to'g'ridan-to'g'ri xonaga kirish so'rovini yuboradi
        socket.emit('join-room', { roomId, username, role });
    } else {
        // Mehmon avval ruxsat so'raydi va kutish oynasi ochiladi
        guestModal.classList.remove('hidden');
        socket.emit('request-join', { roomId, username });
    }
});

// ADMIN UCHUN: Yangi foydalanuvchi kirish so'rovi kelganda
socket.on('join-request-received', ({ socketId, username }) => {
    currentPendingUser = socketId;
    requestingUserSpan.innerText = username;
    adminModal.classList.remove('hidden');
});

// ADMIN QABUL QILGANDA
acceptBtn.addEventListener('click', () => {
    if (currentPendingUser) {
        socket.emit('admin-decision', { socketId: currentPendingUser, decision: 'accept' });
        adminModal.classList.add('hidden');
        currentPendingUser = null;
    }
});

// ADMIN RAD ETGANDA
rejectBtn.addEventListener('click', () => {
    if (currentPendingUser) {
        socket.emit('admin-decision', { socketId: currentPendingUser, decision: 'reject' });
        adminModal.classList.add('hidden');
        currentPendingUser = null;
    }
});

// MEHMON UCHUN: Admin qarori kelganda
socket.on('join-decision', ({ decision, message }) => {
    guestModal.classList.add('hidden'); // Kutish oynasini yopamiz

    if (decision === 'accept') {
        const username = usernameInput.value.trim();
        const roomId = roomIdInput.value.trim();
        socket.emit('join-room', { roomId, username, role: 'guest' });
    } else {
        alert(message || "Admin xonaga kirishingizni rad etdi.");
    }
});

// SERVERDAN TOKEN TAYYOR BO'LGANDA (LiveKit ulanishi)
socket.on('token-ready', async ({ token, roomId, livekitUrl }) => {
    lobby.classList.add('hidden');
    meetContainer.classList.remove('hidden');
    document.getElementById('active-room-title').innerText = roomId;

    try {
        const LK = window.LiveKitClient || window.LiveKit;
        if (!LK) {
            throw new Error("LiveKit kutubxonasi topilmadi!");
        }

        roomInstance = new LK.Room();
        
        // Boshqa qatnashchilar kamerasi ulanganda ekranga chiqarish
        roomInstance.on(LK.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                const element = track.attach();
                element.className = "w-full h-full object-cover rounded-lg border-2 border-gray-700";
                element.id = `video-${participant.identity}`;
                videoGrid.appendChild(element);
            }
        });

        // Qatnashchi chiqib ketganda kamerasini o'chirish
        roomInstance.on(LK.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                track.detach();
                const element = document.getElementById(`video-${participant.identity}`);
                if (element) element.remove();
            }
        });

        // Serverga ulanish
        await roomInstance.connect(livekitUrl, token);

        // Kamera va mikrofonni yoqish
        await roomInstance.localParticipant.enableCameraAndMicrophone();

        // O'zimizning kameramizni ekranga chiqarish
        const localVideo = document.createElement('video');
        localVideo.muted = true;
        localVideo.className = "w-full h-full object-cover rounded-lg border-2 border-blue-500";
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        
        videoGrid.appendChild(localVideo);
        
        const trackPublication = roomInstance.localParticipant.getTrack(LK.Track.Source.Camera);
        if (trackPublication && trackPublication.videoTrack) {
            trackPublication.videoTrack.attach(localVideo);
        }

    } catch (error) {
        console.error("LiveKit-ga ulanishda xato:", error);
        alert("Video xonaga ulanib bo'lmadi: " + error.message);
    }
});

// XONADAN CHIQISH TUGMASI
leaveBtn.addEventListener('click', async () => {
    if (roomInstance) {
        await roomInstance.disconnect();
    }
    window.location.reload();
});
