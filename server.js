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

// Xonalar ma'lumotlar bazasi
// { roomId: { hostSocketId: 'socket_id_professional', users: ['peer_id1', 'peer_id2'] } }
const liveRooms = {};

io.on('connection', (socket) => {

    // 1. Foydalanuvchi tizimga kirganda uning xonasini ro'yxatga olamiz
    socket.on('register-me', (myPeerId, myName) => {
        socket.join(myPeerId); 
        socket.userId = myPeerId;
        socket.userName = myName;

        // Agar bu xona hali yaratilmagan bo'lsa, uni yaratamiz va aynan shu ulanishni HOST deb belgilaymiz
        if (!liveRooms[myPeerId]) {
            liveRooms[myPeerId] = {
                hostSocketId: socket.id, // Faqat xona egasining SOCKET ID raqami
                users: [myPeerId]
            };
        }
    });

    // 🚪 MEHMON: Xonaga ulanish so'rovi (Faqat haqiqiy Admin brauzeriga boradi)
    socket.on('request-join', (targetRoomId, guestPeerId, guestName) => {
        const room = liveRooms[targetRoomId];
        
        if (room && room.hostSocketId) {
            // Xabarni xona nomi bilan emas, faqat adminning unikal socket.id raqamiga yuboramiz!
            io.to(room.hostSocketId).emit('join-request-received', guestPeerId, guestName);
        } else {
            // Agar bunday xona o'chib ketgan bo'lsa
            socket.emit('join-rejected');
        }
    });

    // 👑 ADMIN: Ruxsat berish yoki Rad etish qarori
    socket.on('join-response', (guestPeerId, targetRoomId, status, hostName) => {
        if (status === 'accepted') {
            if (liveRooms[targetRoomId]) {
                if (!liveRooms[targetRoomId].users.includes(guestPeerId)) {
                    liveRooms[targetRoomId].users.push(guestPeerId);
                }
            }
            // Mehmonga ruxsat berilgani haqida uning shaxsiy PeerId kanaliga xabar yuboramiz
            io.to(guestPeerId).emit('join-accepted', targetRoomId, hostName);
        } else {
            io.to(guestPeerId).emit('join-rejected');
        }
    });

    // ⚡ XONAGA QO'SHILISH: Mehmon xona ichkarisiga kirganda
    socket.on('join-room-flow', (roomId, userId) => {
        socket.join(roomId);
        socket.currentRoom = roomId;

        // Xonadagi boshqa mehmonlarga bildirishnoma (Admin bundan mustasno bo'lishi uchun to(roomId))
        socket.to(roomId).emit('user-joined-room', userId);
    });

    // CHAT XABARLARI
    socket.on('room-message', (roomId, message, userName) => {
        io.to(roomId).emit('createMessage', message, userName);
    });

    // FOYDALANUVCHI CHIQIB KETGANDA
    socket.on('disconnect', () => {
        const roomId = socket.currentRoom || socket.userId;
        if (roomId && liveRooms[roomId]) {
            liveRooms[roomId].users = liveRooms[roomId].users.filter(id => id !== socket.userId);
            // Agar admin chiqib ketsa, xonani tozalaymiz
            if (liveRooms[roomId].hostSocketId === socket.id) {
                delete liveRooms[roomId];
            }
        }
        if (socket.userId) {
            io.emit('user-disconnected', socket.userId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
