const socket = io('/');
const videoGrid = document.getElementById('video-grid'); // Videolar joylashadigan konteyner
const myPeer = new Peer(undefined, {
    host: '/',
    port: '443', // Agar render.com da bo'lsa (https uchun 443)
    secure: true
    // Agar Xirsys TURN/STUN serverlarini qo'shayotgan bo'lsangiz:
    // config: { iceServers: [...] } 
});

const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {}; // Barcha faol qo'ng'iroqlarni saqlab turish uchun

let myStream;
navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myStream = stream;
    addVideoStream(myVideo, stream, 'Siz');

    // PeerJS orqali kiruvchi qo'ng'iroqlarga javob berish
    myPeer.on('call', call => {
        call.answer(stream); // O'z oqimimizni yuboramiz
        const video = document.createElement('video');
        
        call.on('stream', userVideoStream => {
            // Qo'ng'iroq qilgan odamning videosini ko'rsatish
            addVideoStream(video, userVideoStream, call.metadata?.userName || 'Suhbatdosh');
        });
    });

    // Yangi foydalanuvchi ulanganda (Socket orqali keladi)
    socket.on('user-connected', (userId, userName) => {
        // Bir oz kutish bilan qo'ng'iroq qilish PeerJS ulanishni barqaror o'rnatishi uchun yordam beradi
        setTimeout(() => {
            connectToNewUser(userId, stream, userName);
        }, 1000);
    });

    // Serverdan xonadagi barcha foydalanuvchilar ro'yxati kelganda (faqat yangi kirgan odamga keladi)
    socket.on('all-users', usersInRoom => {
        usersInRoom.forEach(user => {
            connectToNewUser(user.userId, stream, user.userName);
        });
    });
});

// Foydalanuvchi chiqib ketganda videoni o'chirish
socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
});

myPeer.on('open', id => {
    // Xonaga kirish parametrlarini yuborish (Xona ID, O'z Peer ID, Ism)
    socket.emit('join-room', ROOM_ID, id, USER_NAME);
});

// Yangi foydalanuvchiga qo'ng'iroq qilish funksiyasi
function connectToNewUser(userId, stream, userName) {
    // metadata orqali ismni uzatish mumkin
    const call = myPeer.call(userId, stream, { metadata: { userName: USER_NAME } });
    const video = document.createElement('video');

    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, userName);
    });

    call.on('close', () => {
        video.remove();
    });

    peers[userId] = call;
}

function addVideoStream(video, stream, userName) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });
    
    // Video va ism yorlig'ini bitta konteynerga solib gridga qo'shish
    const videoWrapper = document.createElement('div');
    videoWrapper.classList.add('video-wrapper');
    
    const nameLabel = document.createElement('span');
    nameLabel.innerText = userName;
    
    videoWrapper.append(video);
    videoWrapper.append(nameLabel);
    videoGrid.append(videoWrapper);
}
