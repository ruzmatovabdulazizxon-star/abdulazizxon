const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const PORT = process.env.PORT || 3000;

// PeerJS serverini integratsiya qilish
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/'
});

app.use('/peerjs', peerServer);
app.use(express.static('public'));

// Xonalar va ulardagi adminlarni saqlash uchun ob'ekt
// { roomId: adminSocketId }
const roomAdmins = {};

io.on('connection', (socket) => {
    console.log('Yangi foydalanuvchi ulandi:', socket.id);

    // Foydalanuvchi xonaga kirishni so'raganda
    socket.on('join-room', (roomId, username, peerId) => {
        // Agar ushbu xonaga hali hech kim kirmagan bo'lsa, birinchi foydalanuvchi - ADMIN
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            
            // Admin avtomatik xonaga qo'shiladi va tasdiqlanadi
            socket.join(roomId);
            socket.to(roomId).emit('user-connected', peerId, username, socket.id);
            socket.emit('join-decision', 'approved'); 
            console.log(`Xona yaratildi: ${roomId}. Admin: ${username} (${socket.id})`);
        } else {
            // Agar xonaning admini allaqachon mavjud bo'lsa, mehmon kutiladi va adminga so'rov boradi
            const adminSocketId = roomAdmins[roomId];
            
            // Adminga so'rov jo'natish (so'rayotgan foydalanuvchining ma'lumotlari bilan)
            io.to(adminSocketId).emit('request-join', {
                socketId: socket.id,
                username: username,
                peerId: peerId,
                roomId: roomId
            });
            console.log(`Mehmon ${username} (${socket.id}) xonaga (${roomId}) kirish ruxsatini so'ramoqda.`);
        }
    });

    // Admin qaror qabul qilganda (ruxsat berish yoki rad etish)
    socket.on('admin-decision', ({ targetSocketId, decision, roomId, peerId, username }) => {
        if (decision === 'approved') {
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                // Mehmonni xonaga ulash
                targetSocket.join(roomId);
                // Mehmonga ruxsat berilgani haqida xabar jo'natish
                io.to(targetSocketId).emit('join-decision', 'approved');
                // Xonadagi boshqa foydalanuvchilarga yangi mehmon ulanganini e'lon qilish
                targetSocket.to(roomId).emit('user-connected', peerId, username, targetSocketId);
                console.log(`Admin ${targetSocketId} idli foydalanuvchiga ruxsat berdi.`);
            }
        } else {
            // Agar rad etilgan bo'lsa
            io.to(targetSocketId).emit('join-decision', 'rejected');
            console.log(`Admin ${targetSocketId} idli foydalanuvchini rad etdi.`);
        }
    });

    // Chat xabarlarini ulashish
    socket.on('send-chat-message', (roomId, messageData) => {
        socket.to(roomId).emit('chat-message', messageData);
    });

    // Foydalanuvchi aloqadan uzilganda
    socket.on('disconnect', () => {
        console.log('Foydalanuvchi uzildi:', socket.id);
        
        // Agar xonadan chiqqan odam admin bo'lsa, xona adminligini tozalash yoki boshqaga o'tkazish
        for (const roomId in roomAdmins) {
            if (roomAdmins[roomId] === socket.id) {
                delete roomAdmins[roomId];
                console.log(`Xona admini uzildi. Xona ${roomId} admini o'chirildi.`);
                // Xonadagi barcha foydalanuvchilarga admin chiqqanini va uchrashuv tugaganini bildirish
                socket.to(roomId).emit('meeting-ended');
            }
        }
        
        // Barcha foydalanuvchilarga ushbu socket uzilganini e'lon qilish
        io.emit('user-disconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda muvaffaqiyatli ishga tushdi.`);
});
