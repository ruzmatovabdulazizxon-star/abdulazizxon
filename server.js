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
const socketToPeerMap = {}; // Socket ID -> Peer ID xaritasi

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

    // Xonaga kirish so'ralganda
    socket.on('join-room', (roomId, username, peerId) => {
        socket.roomId = roomId;
        socket.peerId = peerId;
        socketToPeerMap[socket.id] = peerId;

        // Birinchi foydalanuvchi - Admin
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            socket.join(roomId);
            socket.emit('join-decision', 'approved'); 
            console.log(`Xona yaratildi: ${roomId}. Admin: ${username} (Peer: ${peerId})`);
        } else {
            // Keyingi foydalanuvchilar uchun admindan ruxsat so'rash
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
                targetSocket.join(roomId);
                
                io.to(targetSocketId).emit('join-decision', 'approved');
                // Xonadagi boshqa ishtirokchilarga yangi foydalanuvchini e'lon qilish
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

    // Tarmoqdan uzilish holati (Oyna yopilganda yoki aloqa uzilganda)
    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        const peerId = socket.peerId || socketToPeerMap[socket.id];

        console.log(`Foydalanuvchi uzildi. Socket: ${socket.id}, Peer: ${peerId}`);

        if (roomId && peerId) {
            // Xonadagilarga aynan qaysi PeerId chiqib ketganini bildirish
            socket.to(roomId).emit('user-disconnected', peerId);
        }

        // Agar admin chiqib ketgan bo'lsa, xonani yopish
        for (const rId in roomAdmins) {
            if (roomAdmins[rId] === socket.id) {
                delete roomAdmins[rId];
                socket.to(rId).emit('meeting-ended');
            }
        }

        delete socketToPeerMap[socket.id];
    });
});

server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda muvaffaqiyatli ishga tushdi.`);
});
const axios = require('axios'); // Agar axios o'rnatilmagan bo'lsa: npm install axios


app.get('/ice-servers', async (req, res) => {
    try {
        // Xirsys API ga so'rov yuborish
        const response = await axios.put('https://global.xirsys.net/_turn/MyFirstApp', {}, {
            headers: {
                // "ident:secret" ko'rinishidagi ma'lumotni Base64 formatga o'tkazamiz
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });

        // Kelgan ICE serverlar ro'yxatini front-endga uzatamiz
        if (response.data && response.data.v && response.data.v.iceServers) {
            res.json(response.data.v.iceServers);
        } else {
            res.status(500).json({ error: "ICE serverlarni olib bo'lmadi" });
        }
    } catch (error) {
        console.error("Xirsys ulanish xatosi:", error.message);
        // Agar xatolik bo'lsa, zaxira sifatida bepul STUN serverni qaytaramiz
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});
const axios = require('axios');
