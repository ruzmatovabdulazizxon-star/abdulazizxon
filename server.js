const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const PORT = process.env.PORT || 3000;

const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/'
});

app.use('/peerjs', peerServer);
app.use(express.static('public'));

// Xonadagi barcha foydalanuvchilar ma'lumotlarini saqlash
const rooms = {}; 
const roomAdmins = {};

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

    // Xonaga kirish so'ralganda
    socket.on('join-room', (roomId, username, peerId) => {
        socket.roomId = roomId;
        socket.peerId = peerId;

        // Xona ob'ektini yaratish
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        // Birinchi foydalanuvchi - Admin
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            rooms[roomId].push({ socketId: socket.id, peerId: peerId, username: username });
            
            socket.join(roomId);
            socket.emit('join-decision', 'approved'); 
            console.log(`Xona yaratildi: ${roomId}. Admin: ${username} (Peer: ${peerId})`);
        } else {
            // Keyingi foydalanuvchilar uchun ruxsat so'rash
            const adminSocketId = roomAdmins[roomId];
            io.to(adminSocketId).emit('request-join', {
                socketId: socket.id,
                username: username,
                peerId: peerId,
                roomId: roomId
            });
        }
    });

    // Admin qarori
    socket.on('admin-decision', ({ targetSocketId, decision, roomId, peerId, username }) => {
        if (decision === 'approved') {
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.roomId = roomId;
                targetSocket.peerId = peerId;
                
                if (!rooms[roomId]) rooms[roomId] = [];
                rooms[roomId].push({ socketId: targetSocketId, peerId: peerId, username: username });

                targetSocket.join(roomId);
                io.to(targetSocketId).emit('join-decision', 'approved');
                
                // Xonadagi boshqalarga xabar yuborish (aynan peerId bilan)
                targetSocket.to(roomId).emit('user-connected', peerId, username);
            }
        } else {
            io.to(targetSocketId).emit('join-decision', 'rejected');
        }
    });

    // Chat tizimi
    socket.on('send-chat-message', (roomId, messageData) => {
        socket.to(roomId).emit('chat-message', messageData);
    });

    // Foydalanuvchi o'z xohishi yoki brauzer yopilishi sabab uzilganda
    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        const peerId = socket.peerId;

        console.log(`Foydalanuvchi uzildi: Socket: ${socket.id}, Peer: ${peerId}`);

        if (roomId && peerId) {
            // Xonadagi foydalanuvchilar ro'yxatidan o'chirish
            if (rooms[roomId]) {
                rooms[roomId] = rooms[roomId].filter(user => user.peerId !== peerId);
            }

            // Xonadagi barcha qolgan foydalanuvchilarga aynan PeerId bo'yicha o'chirish buyrug'ini yuboramiz
            socket.to(roomId).emit('user-disconnected', peerId);
        }

        // Agar admin chiqib ketgan bo'lsa, xonani tozalash va uchrashuvni tugatish
        for (const rId in roomAdmins) {
            if (roomAdmins[rId] === socket.id) {
                delete roomAdmins[rId];
                delete rooms[rId];
                socket.to(rId).emit('meeting-ended');
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda.`);
});
