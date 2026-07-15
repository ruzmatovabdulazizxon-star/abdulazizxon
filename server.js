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

// Xonalardagi adminlarni saqlash uchun ob'ekt
const roomsAdmin = {}; 

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
            res.status(500).json({ error: "Xirsys serverlari topilmadi" });
        }
    } catch (error) {
        console.error("Xirsys ulanish xatosi:", error.message);
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

// Soketlar ulanishi
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        // Agar bu xonada hali admin bo'lmasa, birinchi kirgan odam admin bo'ladi
        if (!roomsAdmin[roomId]) {
            roomsAdmin[roomId] = socket.id;
            socket.emit('admin-status', true); // Adminga signal yuboramiz
        } else {
            socket.emit('admin-status', false); // Oddiy mehmonga signal
        }

        socket.join(roomId);

        // Yangi kelgan mehmon admindan ruxsat so'raydi
        socket.on('request-join', () => {
            const adminSocketId = roomsAdmin[roomId];
            if (adminSocketId) {
                // Faqat adminga "falonchi kirmoqchi" deb xabar yuboramiz
                io.to(adminSocketId).emit('join-request-received', {
                    guestSocketId: socket.id,
                    guestPeerId: userId,
                    guestName: userName
                });
            } else {
                // Agar tasodifan admin chiqib ketgan bo'lsa, to'g'ridan-to'g'ri kiritamiz
                socket.emit('join-approved');
                socket.to(roomId).emit('user-connected', userId, userName);
            }
        });

        // Admin ruxsat berganda
        socket.on('approve-guest', (guestSocketId, guestPeerId, guestName) => {
            io.to(guestSocketId).emit('join-approved');
            // Xonadagi barcha foydalanuvchilarga yangi mehmon qo'shilganini bildiramiz
            socket.to(roomId).emit('user-connected', guestPeerId, guestName);
        });

        // Admin rad etganda
        socket.on('reject-guest', (guestSocketId) => {
            io.to(guestSocketId).emit('join-rejected');
        });

        // Foydalanuvchi chiqib ketganda
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
            // Agar admin chiqib ketgan bo'lsa, adminlikni tozalaymiz
            if (roomsAdmin[roomId] === socket.id) {
                delete roomsAdmin[roomId];
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
});
