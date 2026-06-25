const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('localVideo');
const myPeerIdText = document.getElementById('my-peer-id');
const roomInput = document.getElementById('room-input');

let localStream;
// PeerJS ob'ektini yaratamiz (u bepul bulutli serverga ulanadi)
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

// 3. Kimgadir ulanish (Chaqiruv qilish)
function connectToPeer() {
    const remotePeerId = roomInput.value.trim();
    if (!remotePeerId) return alert("Iltimos, sherigingizning ID raqamini kiriting!");

    console.log("Chaqirilmoqda: " + remotePeerId);
    
    // Sherigimizga video oqimimizni uzatamiz
    const call = peer.call(remotePeerId, localStream);
    
    // Sherigimiz javob berib o'z videosini yuborsa, ekranga qo'shamiz
    call.on('stream', userVideoStream => {
        addVideoStream(userVideoStream, remotePeerId);
    });
}

// 4. Kimdir bizga qo'ng'iroq qilsa (Chaqiruvni qabul qilish)
peer.on('call', call => {
    // Chaqiruvga o'z videomiz bilan javob beramiz
    call.answer(localStream);
    
    // Uning videosini qabul qilib ekranga chiqaramiz
    call.on('stream', userVideoStream => {
        addVideoStream(userVideoStream, call.peer);
    });
});

// Videoni ekranga chiroyli qilib qo'shish funksiyasi
const connectedPeers = {};
function addVideoStream(stream, peerId) {
    if (connectedPeers[peerId]) return; // Agar video allaqachon bo'lsa, qayta qo'shma
    
    const videoDiv = document.createElement('div');
    videoDiv.id = peerId;
    
    const title = document.createElement('h3');
    title.innerText = `Suhbatdosh (${peerId.substring(0, 5)}...)`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    videoDiv.append(title, video);
    videoGrid.append(videoDiv);
    
    connectedPeers[peerId] = stream;
}