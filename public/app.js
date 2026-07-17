const socket = io('/');
const lobby = document.getElementById('lobby');
const meetContainer = document.getElementById('meet-container');
const videoGrid = document.getElementById('video-grid');

const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const roleSelect = document.getElementById('role');

const adminModal = document.getElementById('admin-modal');
const guestModal = document.getElementById('guest-modal');
const modalText = document.getElementById('modal-text');

let currentRoom = null;
let localTracks = [];
let currentRequestSocketId = null;

// Tugmalar hodisalari
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    const role = roleSelect.value;

    if (!username || !roomId) {
        alert('Iltimos barcha maydonlarni to\'ldiring!');
        return;
    }

    if (role === 'admin') {
        // Admin to'g'ridan-to'g'ri xonaga kiradi
        socket.emit('join-room', { roomId, username, role });
    } else {
        // Mehmon avval ruxsat so'raydi
        guestModal.style.display = 'flex';
        socket.emit('request-join', { roomId, username });
    }
});

// Admin so'rovni qabul qilganda yoki rad etganda
socket.on('join-request-received', ({ socketId, username }) => {
    currentRequestSocketId = socketId;
    modalText.innerText = `${username} uchrashuvga kirmoqchi. Ruxsat berasizmi?`;
    adminModal.style.display = 'flex';
});

document.getElementById('btn-accept').addEventListener('click', () => {
    if (currentRequestSocketId) {
        socket.emit('admin-decision', { socketId: currentRequestSocketId, decision: 'accept' });
        adminModal.style.display = 'none';
        currentRequestSocketId = null;
    }
});

document.getElementById('btn-reject').addEventListener('click', () => {
    if (currentRequestSocketId) {
        socket.emit('admin-decision', { socketId: currentRequestSocketId, decision: 'reject' });
        adminModal.style.display = 'none';
        currentRequestSocketId = null;
    }
});

// Mehmon javobni olganda
socket.on('join-decision', ({ decision, roomId, username }) => {
    guestModal.style.display = 'none';
    if (decision === 'accept') {
        socket.emit('join-room', { roomId, username, role: 'guest' });
    } else {
        alert('Admin xonaga kirishingizni rad etdi!');
    }
});

// Token olinganda LiveKit serverga ulanish
socket.on('token-ready', async ({ token, roomId }) => {
    lobby.style.display = 'none';
    meetContainer.style.display = 'flex';
    await connectToLiveKit(token);
});

// LiveKit ulanish funksiyasi
async function connectToLiveKit(token) {
    try {
        // CDN orqali yuklanganda LiveKit obyekti LivekitClient ichida bo'ladi
        const LK = window.LivekitClient || window.LiveKit;
        if (!LK) {
            throw new Error("LiveKit Client SDK yuklanmadi!");
        }

        currentRoom = new LK.Room({
            adaptiveStream: true,
            dynacast: true,
        });

        // Masofaviy foydalanuvchilar ulanganda
        currentRoom.on(LK.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === LK.Track.Kind.Video || track.kind === LK.Track.Kind.Audio) {
                const element = track.attach();
                videoGrid.appendChild(element);
            }
        });

        // Kimdir kamerani o'chirsa yoki chiqib ketsa
        currentRoom.on(LK.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            track.detach();
            const elements = videoGrid.querySelectorAll('video, audio');
            elements.forEach(el => {
                if (!el.srcObject || el.srcObject.getTracks().length === 0) {
                    el.remove();
                }
            });
        });

        // Loyihamiz o'rnatilgan Render manziliga ulanamiz (Environment'dan kelgan URL bilan server ulaydi)
        // Klient faqat token ichidagi server manziliga ulanadi
        await currentRoom.connect(window.location.origin.replace('http', 'ws'), token);

        // O'zimizning kamera va mikronimizni yoqamiz
        localTracks = await LK.createLocalTracks({ audio: true, video: true });
        for (const track of localTracks) {
            await currentRoom.localParticipant.publishTrack(track);
            if (track.kind === LK.Track.Kind.Video) {
                const element = track.attach();
                videoGrid.appendChild(element);
            }
        }

    } catch (error) {
        console.error('LiveKit-ga ulanishda xatolik:', error);
        alert('Video xonaga ulanib bo\'lmadi: ' + error.message);
    }
}

// Mikrofonni yoqish/o'chirish
document.getElementById('toggle-mic').addEventListener('click', async () => {
    if (!currentRoom) return;
    const audioTrack = localTracks.find(t => t.kind === 'audio');
    if (audioTrack) {
        if (audioTrack.isMuted) {
            await audioTrack.unmute();
            document.getElementById('toggle-mic').innerText = '🎙️';
        } else {
            await audioTrack.mute();
            document.getElementById('toggle-mic').innerText = '🔇';
        }
    }
});

// Kamerani yoqish/o'chirish
document.getElementById('toggle-cam').addEventListener('click', async () => {
    if (!currentRoom) return;
    const videoTrack = localTracks.find(t => t.kind === 'video');
    if (videoTrack) {
        if (videoTrack.isMuted) {
            await videoTrack.unmute();
            document.getElementById('toggle-cam').innerText = 'ca📹';
        } else {
            await videoTrack.mute();
            document.getElementById('toggle-cam').innerText = '🚫';
        }
    }
});

// Chiqish tugmasi
document.getElementById('leave-btn').addEventListener('click', () => {
    if (currentRoom) {
        currentRoom.disconnect();
    }
    window.location.reload();
});
