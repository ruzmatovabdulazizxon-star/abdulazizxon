const socket = io('/');
const CURRENT_ROOM_ID = window.location.pathname.split('/')[1] || 'main-room';

// Tasodifiy 6 xonali Peer ID yaratish (671222 kabi)
const myCustomPeerId = Math.floor(100000 + Math.random() * 900000).toString();

const peer = new Peer(myCustomPeerId, {
    path: '/peerjs',
    host: '/',
    port: '443',
    secure: true
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
let myStream;

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    localVideo.srcObject = stream;

    peer.on('call', call => {
        call.answer(stream);
        call.on('stream', userRemoteStream => {
            remoteVideo.srcObject = userRemoteStream;
        });
    });
}).catch(err => {
    console.error("Kameraga ruxsat berilmadi:", err);
});

peer.on('open', id => {
    document.getElementById('my-peer-id').innerHTML = `Sizning Xona ID: <span style="color: #ccff00; font-size: 22px;">${id}</span><br><small style="color: #aaa;">(Shu qisqa raqamni sherigingizga bering)</small>`;
    socket.emit('join-room', CURRENT_ROOM_ID, id);
});

function connectToPeer() {
    const remotePeerId = document.getElementById('room-input').value.trim();
    if (!remotePeerId) return alert("Iltimos, sherigingizning Xona ID raqamini kiriting!");
    
    const call = peer.call(remotePeerId, myStream);
    call.on('stream', userRemoteStream => {
        remoteVideo.srcObject = userRemoteStream;
    });
}

socket.on('createMessage', (message, userId) => {
    const chat = document.getElementById('chat');
    chat.innerHTML += `<div><b>Suhbatdosh (${userId}):</b> ${message}</div>`;
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
