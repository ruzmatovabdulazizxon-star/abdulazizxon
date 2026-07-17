const socket = io();

// HTML elementlarini bog'lash
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

// KIRISH TUGMASI
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    const role = roleSelect.value;

    if (!username || !roomId) {
        alert("Iltimos, ism va xona ID-sini kiriting!");
        return;
    }

    if (role === 'admin') {
        socket.emit('join-room', { roomId, username, role });
    } else {
        guestModal.classList.remove('hidden');
        socket.emit('request-join', { roomId, username });
    }
});

// ADMIN UCHUN: So'rov kelganda
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

// MEHMON UCHUN: Qaror kelganda
socket.on('join-decision', ({ decision, message }) => {
    guestModal.classList.add('hidden');
    if (decision === 'accept') {
        const username = usernameInput.value.trim();
        const roomId = roomIdInput.value.trim();
        socket.emit('join-room', { roomId, username, role: 'guest' });
    } else {
        alert(message || "Admin xonaga kirishingizni rad etdi.");
    }
});

// LIVEKITGA ULANISH VA KAMERANI CHIQARISH
socket.on('token-ready', async ({ token, roomId, livekitUrl }) => {
    lobby.classList.add('hidden');
    meetContainer.classList.remove('hidden');
    document.getElementById('active-room-title').innerText = roomId;

    try {
        const LK = window.LiveKitClient || window.LiveKit;
        if (!LK) {
            throw new Error("LiveKit topilmadi!");
        }

        roomInstance = new LK.Room();
        
        // BOSHQALARNING KAMERASI ULANGANDA TIFLASH
        roomInstance.on(LK.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                const element = track.attach();
                element.className = "w-full h-[300px] md:h-full object-cover rounded-lg border-2 border-gray-700 bg-black";
                element.id = `video-${participant.identity}`;
                videoGrid.appendChild(element);
            }
        });

        // BOSHQALAR CHIQIB KETGANDA O'CHIRISH
        roomInstance.on(LK.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                track.detach();
                const element = document.getElementById(`video-${participant.identity}`);
                if (element) element.remove();
            }
        });

        // SERVERGA ULANISH
        await roomInstance.connect(livekitUrl, token);
        console.log("LiveKit-ga muvaffaqiyatli ulandi!");

        // KAMERA VA MIKROFONNI YOQISH
        await roomInstance.localParticipant.enableCameraAndMicrophone();

        // O'ZIMIZNING KAMERAMIZNI EKRANGA CHIQARISH (TO'G'RILANGAN VARIANT)
        const localVideoTrack = roomInstance.localParticipant.getTrack(LK.Track.Source.Camera);
        if (localVideoTrack && localVideoTrack.videoTrack) {
            const localElement = localVideoTrack.videoTrack.attach();
            localElement.className = "w-full h-[300px] md:h-full object-cover rounded-lg border-2 border-blue-500 bg-black";
            // O'z ovozimiz o'zimizga qayta eshitilmasligi uchun muted qilamiz
            localElement.muted = true; 
            videoGrid.appendChild(localElement);
        }

    } catch (error) {
        console.error("LiveKit xatoligi:", error);
        alert("Video ulanishda xato: " + error.message);
    }
});

// CHIQUV TUGMASI
leaveBtn.addEventListener('click', async () => {
    if (roomInstance) {
        await roomInstance.disconnect();
    }
    window.location.reload();
});
