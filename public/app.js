const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('localVideo');
const myPeerIdText = document.getElementById('my-peer-id');
const roomInput = document.getElementById('room-input');
const chatDiv = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');

let localStream;
let currentCall = null;
let dataConnection = null; // Chat xabarlarini uzatish uchun

// PeerJS ob'ektini yaratamiz
const peer = new Peer();

// 1. Kamerani srazu yoqish
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
    })
    .catch(err => console.error("Kamerani yoqib bo'lmadi:", err));

// 2. PeerJS serverga ulanganda sizga noyob ID beradi
peer.on('open', (id) => {
    myPeerIdText.innerHTML = `Sizning Xona ID: <b style="color: #ccff00; font-size: 18px;">${id}</b> <br> <span style="font-size:12px; color:#aaa;">(Shu IDni sherigingizga bering)</span>`;
});

// 3. Xonaga ulanish tugmasi bosilganda (Chaqiruv qilish)
function connectToPeer() {
    const remotePeerId = roomInput.value.trim();
    if (!remotePeerId) return alert("Iltimos, sherigingizning ID raqamini kiriting!");

    console.log("Chaqirilmoqda: " + remotePeerId);

    // Video aloqani o'rnatish
    const call = peer.call(remotePeerId, localStream);
    handleCall(call);

    // Chat aloqasini (Data Connection) o'rnatish
    const conn = peer.connect(remotePeerId);
    handleConnection(conn);
}

// 4. Kimdir bizga qo'ng'iroq qilganda (Chaqiruvni qabul qilish)
peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
});

// 5. Kimdir bizga chat uchun ulanmoqchi bo'lganida
peer.on('connection', (conn) => {
    handleConnection(conn);
});

// Video oqimni boshqarish funksiyasi
function handleCall(call) {
    currentCall = call;
    call.on('stream', (userVideoStream) => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = userVideoStream;
        }
    });
}

// Chat ulanishini boshqarish funksiyasi
function handleConnection(conn) {
    dataConnection = conn;
    
    dataConnection.on('data', (data) => {
        appendMessage("Suhbatdosh: " + data);
    });
}

// 6. Xabar yuborish funksiyasi
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Ekranga o'zimiz yozgan xabarni chiqarish
    appendMessage("Siz: " + message);

    // Agar sherigimizga ulangan bo'lsak, unga ham xabarni yuboramiz
    if (dataConnection && dataConnection.open) {
        dataConnection.send(message);
    }

    messageInput.value = ""; // Inputni tozalash
}

// Ekran chat oynasiga matn qo'shish funksiyasi
function appendMessage(text) {
    const msgElement = document.createElement('div');
    msgElement.innerText = text;
    msgElement.style.padding = "5px 10px";
    msgElement.style.borderBottom = "1px solid #333";
    chatDiv.appendChild(msgElement);
    chatDiv.scrollTop = chatDiv.scrollHeight; // Avtomatik pastga tushirish
}

// Enter tugmasi bosilganda ham xabar ketsin
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === messageInput) {
        sendMessage();
    }
});
