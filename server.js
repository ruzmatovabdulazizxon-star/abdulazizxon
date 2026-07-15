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

// Xonalardagi foydalanuvchilar va adminlarni boshqarish
const roomsAdmin = {}; // { roomId: adminSocketId }
const roomsUsers = {}; // { roomId: [ { userId, socketId, userName } ] }

// Barcha sahifa so'rovlarini bitta index.html ga yo'naltirish
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// XIRSYS dan TURN/STUN serverlarni olish (Sizning profilingiz bo'yicha)
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.net/_turn/MyFirstApp', {}, {
            headers: {
                // "ident:secret" -> Base64 kodlash
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        
        if (response.data && response.data.v && response.data.v.iceServers) {
            console.log("Xirsys TURN serverlari muvaffaqiyatli olindi!");
            res.json(response.data.v.iceServers);
        } else {
            console.warn("Xirsys javobi noto'g'ri formatda, zaxiraga o'tiladi.");
            res.json([{ urls: "stun:stun.l.google.com:19302" }]);
        }
    } catch (error) {
        console.error("Xirsys ulanish xatosi:", error.message);
        res.json([{ urls: "stun:stun.l.google.com:19302" }]); // Muqobil zaxira serveri
    }
});

// Socket.io ulanishlari boshqaruvi
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        
        // Adminlik maqomini tekshirish
        if (!roomsAdmin[roomId]) {
            roomsAdmin[roomId] = socket.id;
            socket.emit('admin-status', true);
        } else {
            socket.emit('admin-status', false);
        }

        socket.join(roomId);

        // Kutish xonasidan kirishga ruxsat so'rash
        socket.on('request-join', () => {
            const adminSocketId = roomsAdmin[roomId];
            if (adminSocketId) {
                io.to(adminSocketId).emit('join-request-received', {
                    guestSocketId: socket.id,
                    guestPeerId: userId,
                    guestName: userName
                });
            } else {
                socket.emit('join-approved');
                registerUserAndNotify(roomId, userId, socket.id, userName);
            }
        });

        // Admin ruxsat berganida
        socket.on('approve-guest', (guestSocketId, guestPeerId, guestName) => {
            io.to(guestSocketId).emit('join-approved');
            registerUserAndNotify(roomId, guestPeerId, guestSocketId, guestName);
        });

        // Admin rad etganida
        socket.on('reject-guest', (guestSocketId) => {
            io.to(guestSocketId).emit('join-rejected');
        });

        // Chat xabarlarini uzatish
        socket.on('send-chat-message', (message, senderName) => {
            io.to(roomId).emit('receive-chat-message', message, senderName);
        });

        // Chiqib ketish logikasi
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

function registerUserAndNotify(roomId, userId, socketId, userName) {
    if (!roomsUsers[roomId]) {
        roomsUsers[roomId] = [];
    }
    
    if (!roomsUsers[roomId].some(u => u.userId === userId)) {
        roomsUsers[roomId].push({ userId, socketId, userName });
    }

    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
        // Yangi odamga xonadagi hamma eski foydalanuvchilar ro'yxati beriladi
        const otherUsers = roomsUsers[roomId].filter(u => u.userId !== userId);
        socket.emit('all-users', otherUsers);

        // Eskilarga esa yangi foydalanuvchi ulangani bildiriladi
        socket.to(roomId).emit('user-connected', userId, userName);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda.`));
