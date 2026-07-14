const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const PORT = process.env.PORT || 3000;

// PeerJS serveri
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/'
});

app.use('/peerjs', peerServer);
app.use(express.static('public'));

// Xonalar va ulardagi adminlar ro'yxati
const roomAdmins = {};

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

    // Xonaga kirish so'ralganda
    socket.on('join-room', (roomId, username, peerId) => {
        // FILTR: Agar bu kirayotgan oqim EKRAN ULASHISH bo'lsa, hech qanday ruxsatsiz srazu ulaymiz!
        if (username.includes('(Ekran)')) {
            socket.join(roomId);
            // Xonadagilarga ekran ulanganini xabar qilish (Ruxsat so'ramasdan)
            socket.to(roomId).emit('user-connected', peerId, username, socket.id, true); // true = isScreen
            console.log(`Ekran muvaffaqiyatli ulandi: ${username} (${peerId})`);
            return; 
        }

        // Oddiy foydalanuvchilar uchun Lobby (Kutish xonasi) mantig'i
        if (!roomAdmins[roomId]) {
            // Birinchi kirgan odam - Admin
            roomAdmins[roomId] = socket.id;
            socket.join(roomId);
            socket.to(roomId).emit('user-connected', peerId, username, socket.id, false);
            socket.emit('join-decision', 'approved'); 
            console.log(`Xona yaratildi: ${roomId}. Admin: ${username}`);
        } else {
            // Mehmon ulanmoqchi bo'lsa, adminga so'rov yuborish
            const adminSocketId = roomAdmins[roomId];
            io.to(adminSocketId).emit('request-join', {
                socketId: socket.id,
                username: username,
                peerId: peerId,
                roomId: roomId
            });
            console.log(`Mehmon ${username} kutish xonasida.`);
        }
    });

    // Admin qarori (Faqat oddiy foydalanuvchilar uchun)
    socket.on('admin-decision', ({ targetSocketId, decision, roomId, peerId, username }) => {
        if (decision === 'approved') {
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.join(roomId);
                io.to(targetSocketId).emit('join-decision', 'approved');
                targetSocket.to(roomId).emit('user-connected', peerId, username, targetSocketId, false);
            }
        } else {
            io.to(targetSocketId).emit('join-decision', 'rejected');
        }
    });

    // Chat tizimi
    socket.on('send-chat-message', (roomId, messageData) => {
        socket.to(roomId).emit('chat-message', messageData);
    });

    // Ekran o'chirilganda
    socket.on('leave-screen', (roomId) => {
        socket.to(roomId).emit('screen-disconnected', socket.id);
    });

    // Foydalanuvchi uzilganda
    socket.on('disconnect', () => {
        for (const roomId in roomAdmins) {
            if (roomAdmins[roomId] === socket.id) {
                delete roomAdmins[roomId];
                socket.to(roomId).emit('meeting-ended');
            }
        }
        io.emit('user-disconnected', socket.id);
        io.emit('screen-disconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda.`);
});
