const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myVideo = document.createElement('video');
myVideo.muted = true;

const peer = new Peer(undefined, {
    host: '/',
    port: '443'
});

let myVideoStream;
const peers = {};

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myVideoStream = stream;
    addVideoStream(myVideo, stream);

    peer.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        call.on('stream', userVideoStream => {
            addVideoStream(video, userVideoStream);
        });
    });

    socket.on('user-connected', userId => {
        connectToNewUser(userId, stream);
    });

    let text = document.getElementById('chat_message');
    let msgButton = document.getElementById('send_message');

    msgButton.addEventListener('click', () => {
        if (text.value.length !== 0) {
            socket.emit('message', text.value);
            text.value = '';
        }
    });

    text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && text.value.length !== 0) {
            socket.emit('message', text.value);
            text.value = '';
        }
    });

    socket.on('createMessage', message => {
        let ul = document.getElementById('messages');
        let li = document.createElement('li');
        li.appendChild(document.createTextNode(message));
        ul.appendChild(li);
        scrollToBottom();
    });
});

peer.on('open', id => {
    document.getElementById('room-id').innerText = id;
    
    document.getElementById('join-room').addEventListener('click', () => {
        const peerId = document.getElementById('peer-id').value;
        if(peerId) {
            connectToNewUser(peerId, myVideoStream);
        }
    });
});

function connectToNewUser(userId, stream) {
    const call = peer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream);
    });
    call.on('close', () => {
        video.remove();
    });
    peers[userId] = call;
}

function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });
    videoGrid.append(video);
}

function scrollToBottom() {
    let d = document.querySelector('.main__chat_window');
    d.scrollTop = d.scrollHeight;
}
