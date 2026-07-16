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

// Statik fayllarni ulash
app.use(express.static(path.join(__dirname, 'public')));
app.use('/peerjs', peerServer);

// Xirsys TURN serverlarini olish uchun API
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.com/_turn/MyFirstApp', {}, {
            headers: {
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        
        if (response.data && response.data.v && response.data.v.iceServers) {
            res.json(response.data.v.iceServers); // Aniq faqat massivni qaytaramiz
        } else {
            res.json([{ urls: "stun:stun.l.google.com:19302" }]);
        }
    } catch (error) {
        console.error("Xirsys API xatosi:", error.message);
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

// Istalgan dinamik URL uchun index.html ni yuborish (/2 yoki /room123)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io xonalar logikasi
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
