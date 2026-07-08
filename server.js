const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const peerServer = ExpressPeerServer(server, { debug: true });

app.use('/peerjs', peerServer);
app.use(express.static('public'));

// 1. Bosh sahifaga kirganda avtomatik ravishda tasodifiy 6 xonali xona ochib, unga yo'naltirish
app.get('/', (req, res) => {
    const randomRoomId = Math.floor(100000 + Math.random() * 900000).toString();
    res.redirect(`/${randomRoomId}`);
});

// 2. Dinamik xona manzili (Masalan: /352 yoki /680507)
app.get('/:room', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    // Foydalanuvchi xonaga qo'shilganda
    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId); // Aynan o'sha URL dagi xonaga ulanish

        // Ushbu xonadagi boshqa foydalanuvchilarga yangi odam kelganini bildirish
        socket.to(roomId).emit('user-connected', userId, userName);

        // Chat xabarlarini faqat shu xonaga yuborish
        socket.on('message', (message) => {
            io.to(roomId).emit('createMessage', message, userId, userName);
        });

        // Chiqib ketganda faqat shu xonadagilarga xabar berish
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
