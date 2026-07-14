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

const roomAdmins = {};

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

    // Xonaga kirish so'ralganda
    socket.on('join-room', (roomId, username, peerId) => {
        // Birinchi foydalanuvchi - Admin
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            socket.join(roomId);
            socket.emit('join-decision', 'approved'); 
            console.log(`Xona yaratildi: ${roomId}. Admin: ${username}`);
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
                targetSocket.join(roomId);
                io.to(targetSocketId).emit('join-decision', 'approved');
                // Xonadagi barchaga yangi a'zo qo'shilganini e'lon qilish
                targetSocket.to(roomId).emit('user-connected', peerId, username, targetSocketId);
            }
        } else {
            io.to(targetSocketId).emit('join-decision', 'rejected');
        }
    });

    // Chat tizimi
    socket.on('send-chat-message', (roomId, messageData) => {
        socket.to(roomId).emit('chat-message', messageData);
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
    });
});

server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda.`);
});
