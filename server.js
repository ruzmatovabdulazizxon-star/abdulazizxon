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

// Xonaga kiruvchi so'rovlarni bitta index.html ga xavfsiz yo'naltiramiz
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// XIRSYS orqali STUN/TURN serverlarni olish API'si
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
        res.json([{ urls: "stun:stun.l.google.com:19302" }]); // Zaxira variant
    }
});

// Soketlar ulanishi
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId, userName);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda muvaffaqiyatli ishlamoqda`);
});
