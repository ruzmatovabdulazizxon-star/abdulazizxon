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

// 1. Statik fayllarni birinchi bo'lib ro'yxatdan o'tkazamiz (Juda muhim!)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/peerjs', peerServer);

// 2. XIRSYS TURN/STUN server sozlamalarini olish api-liniyasi
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.com/_turn/MyFirstApp', {}, {
            headers: {
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        res.json(response.data.v);
    } catch (error) {
        console.error("Xirsys API xatoligi:", error.message);
        // Agar Xirsys ishlamay qolsa, zaxira sifatida Google STUN serverini qaytaramiz
        res.json({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    }
});

// 3. Har qanday dinamik URL (masalan: /2 yoki /room-abc) kelganda index.html ni qaytarish
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Socket.io Uchrashuv Logikasi ---
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId) => {
        // Foydalanuvchini ko'rsatilgan xona kanaliga kirgizish
        socket.join(roomId);
        
        // U bergan xonadagi boshqa barcha foydalanuvchilarga xabar berish
        socket.to(roomId).emit('user-connected', userId);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

// Render uchun dinamik port sozlamasi
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda muvaffaqiyatli ishga tushdi.`);
});
