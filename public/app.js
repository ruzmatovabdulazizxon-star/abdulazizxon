const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// O'zimizga tasodifiy 6 xonali ID yaratish
const myCustomPeerId = Math.floor(100000 + Math.random() * 900000).toString();

const peer = new Peer(myCustomPeerId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true
});

let myStream;
const connectedPeers = {}; // Ulangan odamlarni eslab qolish uchun

// Kamera va mikrofonni yoqish hamda o'z videomizni grid-ga qo'shish
navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStyle(myStream, "Siz (Kamera)", myCustomPeerId);

    // Boshqa birov bizga qo'ng'iroq qilib ID orqali ulansa, unga javob berish
    peer.on('call', call => {
        call.answer(stream);
        call.on('stream', userRemoteStream => {
            addVideoStyle(userRemoteStream, `Suhbatdosh (${call.peer})`, call.peer);
        });
    });
}).catch(err => {
    console.error("Kameraga ruxsat berilmadi:", err);
});

peer.on('open', id => {
    document.getElementById('my-peer-id').innerHTML = `Sizning Xona ID: <span style="color: #ccff00; font-size: 22px;">${id}</span>`;
    socket.emit('join-room', 'main-room', id);
});

// ID kiritib ulanish funksiyasi
function connectToPeer() {
    const remotePeerId = document.getElementById('room-input').value.trim();
    if (!remotePeerId) return alert("Iltimos, Xona ID raqamini kiriting!");
    if (remotePeerId === myCustomPeerId) return alert("O'zingizning ID raqamingizga ulanolmaysiz!");
    if (connectedPeers[remotePeerId]) return alert("Bu foydalanuvchiga allaqachon ulangansiz!");

    console.log("Qo'ng'iroq qilinmoqda: " + remotePeerId);
    const call = peer.call(remotePeerId, myStream);
    
    call.on('stream', userRemoteStream => {
        addVideoStyle(userRemoteStream, `Suhbatdosh (${remotePeerId})`, remotePeerId);
    });

    connectedPeers[remotePeerId] = call;
}

// Grid ichiga chiroyli qilib video va uning sarlavhasini dinamik qo'shish funksiyasi
function addVideoStyle(stream, titleText, peerId) {
    // Agar bu odamning videosi ekranda allaqachon bo'lsa, qayta yaratmaymiz
    if (document.getElementById(`div-${peerId}`)) return;

    const box = document.createElement('div');
    box.id = `div-${peerId}`;
    box.className = 'video-box';

    const title = document.createElement('h4');
    title.innerText = titleText;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (peerId === myCustomPeerId) video.muted = true; // O'z ovozimiz o'zimizga qayta eshitilmasligi uchun

    box.appendChild(title);
    box.appendChild(video);
    videoGrid.appendChild(box);
}

// Chat xabarlarini qabul qilish
socket.on('createMessage', (message, userId) => {
    const chat = document.getElementById('chat');
    chat.innerHTML += `<div><b>Foydalanuvchi (${userId.substring(0,4)}):</b> ${message}</div>`;
    chat.scrollTop = chat.scrollHeight;
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input.value.trim() !== "") {
        socket.emit('message', input.value);
        const chat = document.getElementById('chat');
        chat.innerHTML += `<div><b>Siz:</b> ${input.value}</div>`;
        chat.scrollTop = chat.scrollHeight;
        input.value = "";
    }
}
