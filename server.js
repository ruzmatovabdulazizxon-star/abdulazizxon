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
        socket.join(myId); // Har kim o'z ID-si nomli virtual xonaga kiradi
        socket.userId = myId;
        socket.userName = myName;
    });

    // 2. Mehmon xona egasiga kirish so'rovini yuboradi
    socket.on('request-join', (targetRoomId, guestPeerId, guestName) => {
        // So'rovni faqat o'sha xona egasiga yuborish
        io.to(targetRoomId).emit('join-request-received', guestPeerId, guestName);
    });

    // 3. Xona egasining qarori (Ruxsat yoki Rad)
    socket.on('join-response', (guestPeerId, targetRoomId, status, hostName) => {
        if (status === 'accepted') {
            // Mehmonga ruxsat berilganini aytamiz va ulanishni boshlaymiz
            io.to(guestPeerId).emit('join-accepted', targetRoomId, hostName);
        } else {
            io.to(guestPeerId).emit('join-rejected');
        }
    });

    // Chat xabarlari (Faqat bir-biriga ulanganlar guruhiga yuboriladi)
    socket.on('room-message', (roomId, message, userName) => {
        io.to(roomId).emit('createMessage', message, userName);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
