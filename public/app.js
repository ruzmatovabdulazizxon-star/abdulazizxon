const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// 1. XIRSYS YOKI METERED TURN SERVER CONFIGURATION
// Skrinshotingizdagi ident va secret ma'lumotlari asosida to'g'ri sozlangan
const peerConfiguration = {
    iceServers: [
        { urls: 'urls: "stun:stun.l.google.com:19302"' }, // Bepul Google STUN
        {
            // O'zingizning TURN server ma'lumotlaringizni shu yerga aniq yozing:
            urls: 'turn:global.xirsys.com:3478?transport=udp',
            username: 'abdulaziz', // Xirsys ident qismi
            credential: 'c0a65ce0-8033-11f1-8a6c-f2f74e209366' // Xirsys secret qismi
        },
        {
            urls: 'turn:global.xirsys.com:3478?transport=tcp',
            username: 'abdulaziz',
            credential: 'c0a65ce0-8033-11f1-8a6c-f2f74e209366'
        }
    ],
    iceCandidatePoolSize: 10 // Tarmoq ulanishini tezlashtirish uchun
};

// Peer obyektini konfiguratsiya bilan yaratish
const myPeer = new Peer(undefined, {
    host: '/',
    port: '443', // Render platformasi HTTPS (443) portida ishlaydi
    secure: true,
    config: peerConfiguration
});

const myVideo = document.createElement('video');
myVideo.muted = true; // O'z ovozimiz o'zimizga qaytib eshitilmasligi uchun
myVideo.setAttribute('playsinline', 'true');

const peers = {};
let myStream = null;

// Kamerani olish va oqimni boshlash
navigator.mediaDevices.getUserMedia({
    video: {
        width: { ideal: 640 },  // Mobil internetda qotmasligi uchun sifatni biroz pasaytiramiz
        height: { ideal: 480 },
        frameRate: { max: 24 }  // Tarmoq yukini kamaytirish uchun max 24fps
    },
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStream(myVideo, stream, 'Siz');

    // Kimgadir qo'ng'iroq bo'lganda (Boshqa foydalanuvchi bizga ulanmoqchi bo'lsa)
    myPeer.on('call', call => {
        // Biz ham o'z oqimimizni yuboramiz
        call.answer(stream);
        
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');

        // MUHIM TUXATISH: Stream kelganda kutib olib, qotib qolishini oldini olish
        call.on('stream', userVideoStream => {
            // Agar video allaqachon yaratilgan bo'lsa, qayta-qayta yaratmaslik
            if (!peers[call.peer]) {
                addVideoStream(video, userVideoStream, 'Suhbatdosh');
                peers[call.peer] = call;
            }
        });
    });

    // Yangi foydalanuvchi xonaga qo'shilganda Socket orqali xabar olamiz
    socket.on('user-connected', userId => {
        // 3-mehmon qo'shilganda ulanish asinxron tarzda biroz kutib amalga oshiriladi
        // Bu tarmoqdagi "Race Condition" (ekran qotishi) muammosini hal qiladi
        setTimeout(() => {
            connectToNewUser(userId, stream);
        }, 1000); 
    });
}).catch(err => {
    console.error("Kamera yoki mikrofon topilmadi:", err);
});

// Foydalanuvchi chiqib ketganda videoni o'chirish
socket.on('user-disconnected', userId => {
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
    const element = document.getElementById(userId);
    if (element) element.remove();
});

// Yangi foydalanuvchiga ulanish funksiyasi
function connectToNewUser(userId, stream) {
    // Unga qo'ng'iroq qilamiz va o'z oqimimizni beramiz
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');

    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, 'Mehmon', userId);
    });

    call.on('close', () => {
        video.parentElement.remove();
    });

    peers[userId] = call;
}

// Videoni DOM-ga qo'shish funksiyasi
function addVideoStream(video, stream, name, userId = null) {
    video.srcObject = stream;
    
    // Video yuklangach ijro etilishini ta'minlash (Qotib qolishga qarshi)
    video.onloadedmetadata = () => {
        video.play().catch(e => console.log("Video avtopley xatosi:", e));
    };

    // Agar ushbu foydalanuvchi uchun element bo'lsa, eskisini yangilaymiz
    const existBox = userId ? document.getElementById(userId) : null;
    if (existBox) {
        const oldVideo = existBox.querySelector('video');
        if (oldVideo) oldVideo.srcObject = stream;
        return;
    }

    const videoBox = document.createElement('div');
    videoBox.classList.add('video-box');
    if (userId) videoBox.id = userId;

    const nameLabel = document.createElement('div');
    nameLabel.classList.add('name-label');
    nameLabel.innerText = name;

    videoBox.appendChild(video);
    videoBox.appendChild(nameLabel);
    videoGrid.appendChild(videoBox);
}

// Xonaga kirish logikasi (Sizning mavjud xonaga ulanish kodingizga moslang)
myPeer.on('open', id => {
    const roomId = document.getElementById('room-input')?.value || 'default-room';
    socket.emit('join-room', roomId, id);
});
