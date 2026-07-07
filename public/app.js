const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('localVideo');
const myPeerIdText = document.getElementById('my-peer-id');
const roomInput = document.getElementById('room-input');
const chatDiv = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');

let localStream;
let currentCall = null;
let dataConnection = null;
let peer;

// 1. Kamerani srazu yoqish
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
        
        // Kamera yoqqanidan keyin serverdan qisqa ID so'raymiz
        socket.emit('get-short-id');
    })
    .catch(err => console.error("Kamerani yoqib bo'lmadi:", err));

// 2. Serverdan qisqa 6 xonali ID kelganida PeerJS ob'ektini yaratamiz
socket.on('created-short-id', (shortId) => {
    myPeerIdText.innerHTML = `Sizning Xona ID: <b style="color: #ccff00; font-size: 22px; letter-spacing: 2px;">${shortId}</b> <br> <span style="font-size:12px; color:#aaa;">(Shu qisqa raqamni sherigingizga bering)</span>`;
    
    // PeerJS'ni aynan shu 6 xonali raqam bilan ro'yxatdan o'tkazamiz
    peer = new Peer(shortId, {
        host: '/',
        port: 443,
        path: '/peerjs',
        secure: true
    });

    peer.on('open', (id) => {
        console.log('PeerJS muvaffaqiyatli ochildi, ID:', id);
    });

    // Kimdir bizga qo'ng'iroq qilganda
    peer.on('call', (call) => {
        call.answer(localStream);
        handleCall(call);
    });

    // Kimdir chatga ulanmoqchi bo'lganida
    peer.on('connection', (conn) => {
        handleConnection(conn);
    });
});

// Xonaga ulanish tugmasi bosilganda
function connectToPeer() {
    const remotePeerId = roomInput.value.trim();
    if (!remotePeerId) return alert("Iltimos, sherigingizning 6 xonali ID raqamini kiriting!");

    console.log("Chaqirilmoqda: " + remotePeerId);

    const call = peer.call(remotePeerId, localStream);
    handleCall(call);

    const conn = peer.connect(remotePeerId);
    handleConnection(conn);
}

function handleCall(call) {
    currentCall = call;
    call.on('stream', (userVideoStream) => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = userVideoStream;
        }
    });
}

function handleConnection(conn) {
    dataConnection = conn;
    dataConnection.on('data', (data) => {
        appendMessage("Suhbatdosh: " + data);
    });
}

// Xabar yuborish
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    appendMessage("Siz: " + message);

    if (dataConnection && dataConnection.open) {
        dataConnection.send(message);
    }

    messageInput.value = "";
}

function appendMessage(text) {
    const msgElement = document.createElement('div');
    msgElement.innerText = text;
    msgElement.style.padding = "5px 10px";
    msgElement.style.borderBottom = "1px solid #333";
    chatDiv.appendChild(msgElement);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === messageInput) {
        sendMessage();
    }
});
