const socket = io();

// HTML elementlari
const lobby = document.getElementById('lobby');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const roleSelect = document.getElementById('role');
const joinBtn = document.getElementById('join-btn');

const meetContainer = document.getElementById('meet-container');
const leaveBtn = document.getElementById('leave-btn');
const videoGrid = document.getElementById('video-grid');

// Boshqaruv paneli elementlari
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const shareScreenBtn = document.getElementById('share-screen-btn');

const adminModal = document.getElementById('admin-modal');
const requestingUserSpan = document.getElementById('requesting-user');
const acceptBtn = document.getElementById('accept-btn');
const rejectBtn = document.getElementById('reject-btn');

const guestModal = document.getElementById('guest-modal');

let roomInstance = null;
let currentPendingUser = null;

// Holatlarni saqlash
let isMicEnabled = true;
let isCamEnabled = true;
let isScreenSharing = false;

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

// ADMIN EVENTLARI
socket.on('join-request-received', ({ socketId, username }) => {
    currentPendingUser = socketId;
    requestingUserSpan.innerText = username;
    adminModal.classList.remove('hidden');
});

acceptBtn.addEventListener('click', () => {
    if (currentPendingUser) {
        socket.emit('admin-decision', { socketId: currentPendingUser, decision: 'accept' });
        adminModal.classList.add('hidden');
        currentPendingUser = null;
    }
});

rejectBtn.addEventListener('click', () => {
    if (currentPendingUser) {
        socket.emit('admin-decision', { socketId: currentPendingUser, decision: 'reject' });
        adminModal.classList.add('hidden');
        currentPendingUser = null;
    }
});

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

// LIVEKITGA ULANISH VA ASOSIY MANTIQ
socket.on('token-ready', async ({ token, roomId, livekitUrl }) => {
    lobby.classList.add('hidden');
    meetContainer.classList.remove('hidden');
    document.getElementById('active-room-title').innerText = roomId;

    try {
        // Global LiveKit obyektini aniqlash (Har ikkala CDN varianti uchun kafolatlangan uslub)
        const LK = window.LiveKit || (window.LiveKitClient ? window.LiveKitClient : null);
        if (!LK) {
            throw new Error("LiveKit kutubxonasi brauzerda topilmadi! Sahifani Ctrl+F5 qiling.");
        }

        roomInstance = new LK.Room();
        
        // Boshqa foydalanuvchilar kamerasi ulanganda
        roomInstance.on(LK.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                const element = track.attach();
                element.className = "w-full h-full object-cover rounded-lg border-2 border-gray-700 bg-black";
                element.id = `video-${participant.identity}`;
                videoGrid.appendChild(element);
            }
        });

        // Boshqalar kamerani o'chirishganda yoki chiqishganda
        roomInstance.on(LK.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                track.detach();
                const element = document.getElementById(`video-${participant.identity}`);
                if (element) element.remove();
            }
        });

        // Serverga ulanish
        await roomInstance.connect(livekitUrl, token);

        // Kamera va mikrofonni dastlabki faollashtirish
        await roomInstance.localParticipant.enableCameraAndMicrophone();

        // O'z kameramiz oqimini ekranda joylashtirish
        const localVideoTrack = roomInstance.localParticipant.getTrack(LK.Track.Source.Camera);
        if (localVideoTrack && localVideoTrack.videoTrack) {
            const localElement = localVideoTrack.videoTrack.attach();
            localElement.className = "w-full h-full object-cover rounded-lg border-2 border-blue-500 bg-black";
            localElement.id = "my-local-video";
            localElement.muted = true; // O'z ovozimiz o'zimizga eshitilmasligi uchun
            videoGrid.appendChild(localElement);
        }

        // --- TUGMALARNI BOSHQARISH FUNKSIYALARI ---

        // MIKROFONNI YOQISH / O'CHIRISH
        toggleMicBtn.onclick = async () => {
            isMicEnabled = !isMicEnabled;
            await roomInstance.localParticipant.setMicrophoneEnabled(isMicEnabled);
            toggleMicBtn.innerHTML = isMicEnabled ? "🎤 Mik: Yoqilgan" : "🔇 Mik: O'chirilgan";
            toggleMicBtn.className = isMicEnabled ? "px-5 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition duration-200 shadow-md" : "px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition duration-200 shadow-md";
        };

        // KAMERANI YOQISH / O'CHIRISH
        toggleCamBtn.onclick = async () => {
            isCamEnabled = !isCamEnabled;
            await roomInstance.localParticipant.setCameraEnabled(isCamEnabled);
            toggleCamBtn.innerHTML = isCamEnabled ? "📷 Kam: Yoqilgan" : "📸 Kam: O'chirilgan";
            toggleCamBtn.className = isCamEnabled ? "px-5 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition duration-200 shadow-md" : "px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition duration-200 shadow-md";
            
            const myVideo = document.getElementById("my-local-video");
            if (!isCamEnabled && myVideo) {
                myVideo.style.opacity = "0.2"; // Kamera o'chganda xiralashtirish
            } else if (myVideo) {
                myVideo.style.opacity = "1";
            }
        };

        // EKRAN ULASHISH (SCREEN SHARE)
        shareScreenBtn.onclick = async () => {
            try {
                isScreenSharing = !isScreenSharing;
                await roomInstance.localParticipant.setScreenShareEnabled(isScreenSharing);
                shareScreenBtn.innerHTML = isScreenSharing ? "🛑 Ulashishni to'xtatish" : "🖥️ Ekran ulashish";
                shareScreenBtn.className = isScreenSharing ? "px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition duration-200 shadow-md" : "px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition duration-200 shadow-md";
            } catch (err) {
                console.error("Ekran ulashishda xato:", err);
                isScreenSharing = false;
                shareScreenBtn.innerHTML = "🖥️ Ekran ulashish";
            }
        };

    } catch (error) {
        console.error("Ulanish xatosi:", error);
        alert("Video xonaga ulanib bo'lmadi: " + error.message);
    }
});

// CHIQISH TUGMASI
leaveBtn.addEventListener('click', async () => {
    if (roomInstance) {
        await roomInstance.disconnect();
    }
    window.location.reload();
});
