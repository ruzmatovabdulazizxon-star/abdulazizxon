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

// Har qanday URL'ni bitta index.html ga xavfsiz yo'naltiramiz
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const roomsAdmin = {}; // Xonadagi adminlar: { roomId: socketId }

// XIRSYS dan TURN/STUN serverlarni olish
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
            res.status(500).json({ error: "No ICE servers" });
        }
    } catch (error) {
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        // Birinchi kirgan foydalanuvchini admin qilamiz
        if (!roomsAdmin[roomId]) {
            roomsAdmin[roomId] = socket.id;
            socket.emit('admin-status', true);
        } else {
            socket.emit('admin-status', false);
        }

        socket.join(roomId);

        // Yangi kirgan foydalanuvchi admindan ruxsat so'raydi
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
                socket.to(roomId).emit('user-connected', userId, userName);
            }
        });

        // Admin mehmonni qabul qilganda
        socket.on('approve-guest', (guestSocketId, guestPeerId, guestName) => {
            io.to(guestSocketId).emit('join-approved');
            socket.to(roomId).emit('user-connected', guestPeerId, guestName);
        });

        // Admin mehmonni rad etganda
        socket.on('reject-guest', (guestSocketId) => {
            io.to(guestSocketId).emit('join-rejected');
        });

        // Chat xabarlarini yuborish
        socket.on('send-chat-message', (message, senderName) => {
            io.to(roomId).emit('receive-chat-message', message, senderName);
        });

        // Foydalanuvchi chiqib ketganda
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
            if (roomsAdmin[roomId] === socket.id) {
                delete roomsAdmin[roomId];
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
