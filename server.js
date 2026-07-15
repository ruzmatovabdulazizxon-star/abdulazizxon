const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');
const axios = require('axios');
const path = require('path');

const peerServer = ExpressPeerServer(server, {
    debug: true
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/peerjs', peerServer);

// Xonalardagi foydalanuvchilar va adminlarni boshqarish ob'ektlari
const roomsAdmin = {}; // { roomId: adminSocketId }
const roomsUsers = {}; // { roomId: [ { userId, socketId, userName } ] }

// Barcha sahifa so'rovlarini bitta index.html ga yo'naltiramiz
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// XIRSYS orqali TURN/STUN serverlarni olish
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.net/_turn/MyFirstApp', {}, {
            headers: {
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        if (response.data && response.data.v && response.data.v.iceServers) {
            res.json(response.data.v.iceServers);
        } else {
            res.status(500).json({ error: "Xirsys serverlari topilmadi" });
        }
    } catch (error) {
        console.error("Xirsys ulanish xatosi:", error.message);
        res.json([{ urls: "stun:stun.l.google.com:19302" }]); // Muqobil zaxira serveri
    }
});

// Socket.io ulanishlari boshqaruvi
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        
        // 1. Adminlik maqomini tekshirish
        if (!roomsAdmin[roomId]) {
            roomsAdmin[roomId] = socket.id;
            socket.emit('admin-status', true);
        } else {
            socket.emit('admin-status', false);
        }

        socket.join(roomId);

        // 2. Kutish xonasidan kirishga ruxsat so'rash
        socket.on('request-join', () => {
            const adminSocketId = roomsAdmin[roomId];
            if (adminSocketId) {
                io.to(adminSocketId).emit('join-request-received', {
                    guestSocketId: socket.id,
                    guestPeerId: userId,
                    guestName: userName
                });
            } else {
                // Agar admin tasodifan chiqib ketgan bo'lsa, to'g'ridan-to'g'ri ruxsat beriladi
                socket.emit('join-approved');
                registerUserAndNotify(roomId, userId, socket.id, userName);
            }
        });

        // 3. Admin ruxsat berganida foydalanuvchini xonaga qo'shish
        socket.on('approve-guest', (guestSocketId, guestPeerId, guestName) => {
            io.to(guestSocketId).emit('join-approved');
            registerUserAndNotify(roomId, guestPeerId, guestSocketId, guestName);
        });

        // 4. Admin rad etganida
        socket.on('reject-guest', (guestSocketId) => {
            io.to(guestSocketId).emit('join-rejected');
        });

        // Chat xabarlarini uzatish
        socket.on('send-chat-message', (message, senderName) => {
            io.to(roomId).emit('receive-chat-message', message, senderName);
        });

        // Foydalanuvchi ulanishni uzganda (chiqib ketganda)
        socket.on('disconnect', () => {
            if (roomsUsers[roomId]) {
                roomsUsers[roomId] = roomsUsers[roomId].filter(user => user.socketId !== socket.id);
                socket.to(roomId).emit('user-disconnected', userId);
            }
            if (roomsAdmin[roomId] === socket.id) {
                delete roomsAdmin[roomId];
            }
        });
    });
});

// Foydalanuvchini ro'yxatga olish va ulanish signallarini tarqatish funksiyasi
function registerUserAndNotify(roomId, userId, socketId, userName) {
    if (!roomsUsers[roomId]) {
        roomsUsers[roomId] = [];
    }
    
    // Foydalanuvchi takroran qo'shilmasligini tekshiramiz
    if (!roomsUsers[roomId].some(u => u.userId === userId)) {
        roomsUsers[roomId].push({ userId, socketId, userName });
    }

    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
        // Yangi kirgan foydalanuvchiga xonada mavjud bo'lgan boshqa barcha ishtirokchilar ro'yxatini yuboramiz
        const otherUsers = roomsUsers[roomId].filter(u => u.userId !== userId);
        socket.emit('all-users', otherUsers);

        // Eski foydalanuvchilarga yangi odam kelgani haqida xabar beramiz
        socket.to(roomId).emit('user-connected', userId, userName);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
