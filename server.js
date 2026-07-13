const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const peerServer = ExpressPeerServer(server, { debug: true });

app.use('/peerjs', peerServer);
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    // 1. Foydalanuvchi o'z ID-si bilan tizimda ro'yxatdan o'tadi
    socket.on('register-me', (myId, myName) => {
        socket.join(myId); 
        socket.userId = myId;
        socket.userName = myName;
    });

    // 2. Mehmon xona egasiga kirish so'rovini yuboradi
    socket.on('request-join', (targetRoomId, guestPeerId, guestName) => {
        io.to(targetRoomId).emit('join-request-received', guestPeerId, guestName);
    });

    // 3. Xona egasining qarori (Ruxsat yoki Rad)
    socket.on('join-response', (guestPeerId, targetRoomId, status, hostName) => {
        if (status === 'accepted') {
            io.to(guestPeerId).emit('join-accepted', targetRoomId, hostName);
        } else {
            io.to(guestPeerId).emit('join-rejected');
        }
    });

    // Chat xabarlari (Faqat bitta xonadagilarga ketadi)
    socket.on('room-message', (roomId, message, userName) => {
        io.to(roomId).emit('createMessage', message, userName);
    });

    // Suhbatdosh chiqib ketganda
    socket.on('disconnect', () => {
        if (socket.userId) {
            socket.broadcast.emit('user-disconnected', socket.userId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
