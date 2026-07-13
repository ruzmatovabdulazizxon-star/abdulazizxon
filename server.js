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

// Xonalarda kimlar o'tirganini va xona egasini saqlash uchun obyekt
// { roomId: { hostId: 'xyz', users: ['id1', 'id2'] } }
const roomsData = {};

io.on('connection', (socket) => {

    // Foydalanuvchi tizimga kirganda o'z xonasini yaratadi (u o'z xonasining egasi)
    socket.on('register-me', (myId, myName) => {
        socket.join(myId); 
        socket.userId = myId;
        socket.userName = myName;

        if (!roomsData[myId]) {
            roomsData[myId] = {
                hostId: myId,
                users: [myId]
            };
        }
    });

    // 🚪 MEHMON: Faqat Xona Egasiga so'rov yuborish
    socket.on('request-join', (targetRoomId, guestPeerId, guestName) => {
        const room = roomsData[targetRoomId];
        if (room && room.hostId) {
            // So'rovni faqat xona egasining shaxsiy ID-siga yuboramiz (Hammaga emas!)
            io.to(room.hostId).emit('join-request-received', guestPeerId, guestName);
        } else {
            // Agar xona topilmasa, to'g'ridan-to'g'ri ulanishga ruxsat (yoki xatolik)
            socket.emit('join-rejected');
        }
    });

    // 👑 XONA EGASI: Ruxsat berish yoki Rad etish
    socket.on('join-response', (guestPeerId, targetRoomId, status, hostName) => {
        if (status === 'accepted') {
            // Yangi mehmonni xona ro'yxatiga qo'shamiz
            if (roomsData[targetRoomId]) {
                if (!roomsData[targetRoomId].users.includes(guestPeerId)) {
                    roomsData[targetRoomId].users.push(guestPeerId);
                }
            }
            // Mehmonga ruxsat berilganini bildiramiz
            io.to(guestPeerId).emit('join-accepted', targetRoomId, hostName);
        } else {
            io.to(guestPeerId).emit('join-rejected');
        }
    });

    // ⚡ XONAGA KIRISh: Ruxsat olgan mehmon xona oqimiga qo'shiladi
    socket.on('join-room-flow', (roomId, userId) => {
        socket.join(roomId);
        socket.currentRoom = roomId;

        // Xonadagi boshqa barcha eshitib turgan mehmonlarga yangi odam kelganini aytamiz
        // Ular brauzerni yangilamasdan srazu o'zaro PeerJS ulanish hosil qiladi
        socket.to(roomId).emit('user-joined-room', userId);
    });

    // CHAT TIZIMI
    socket.on('room-message', (roomId, message, userName) => {
        io.to(roomId).emit('createMessage', message, userName);
    });

    // FOYDALANUVChI CHIQIB KETGANDA
    socket.on('disconnect', () => {
        const roomId = socket.currentRoom || socket.userId;
        if (roomId && roomsData[roomId]) {
            roomsData[roomId].users = roomsData[roomId].users.filter(id => id !== socket.userId);
        }
        if (socket.userId) {
            io.emit('user-disconnected', socket.userId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
