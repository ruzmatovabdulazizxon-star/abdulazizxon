const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const peerServer = ExpressPeerServer(server, {
    debug: true
});

app.use('/peerjs', peerServer);
app.use(express.static('public'));

// 1. Bosh sahifaga kirganda avtomatik yangi 6 xonali ID yaratib, o'sha xonaga yo'naltiramiz
app.get('/', (req, res) => {
    const randomRoomId = Math.floor(100000 + Math.random() * 900000).toString();
    res.redirect(`/${randomRoomId}`);
});

// 2. Muayyan xona havolasi ochilganda index.html faylini yuboramiz
app.get('/:room', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// 3. Socket.io orqali xonadagilarni boshqarish
io.on('connection', (socket) => {
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        
        // Xonadagi boshqa foydalanuvchilarga yangi odam kelganini xabar qilish
        socket.to(roomId).emit('user-connected', userId);

        // Chat xabarlarini butun xonaga tarqatish (hamma ko'rishi uchun)
        socket.on('message', (message) => {
            io.to(roomId).emit('createMessage', message, userId);
        });

        // Foydalanuvchi chiqib ketganda
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda`);
});
