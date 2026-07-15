const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');
const axios = require('axios'); // Bir marta to'g'ri e'lon qilindi

const peerServer = ExpressPeerServer(server, {
    debug: true
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/peerjs', peerServer);

// Xonalarni boshqarish marshrutlari
app.get('/', (req, res) => {
    res.redirect(`/${require('uuid').v4()}`);
});

app.get('/:room', (req, res) => {
    res.render('room', { roomId: req.params.room });
});

// XIRSYS dynamic TURN/STUN serverlarini olish API
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.net/_turn/MyFirstApp', {}, {
            headers: {
                // "ident:secret" -> Base64 formatga o'tkazish
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        
        if (response.data && response.data.v && response.data.v.iceServers) {
            res.json(response.data.v.iceServers);
        } else {
            res.status(500).json({ error: "ICE serverlarni yuklab bo'lmadi" });
        }
    } catch (error) {
        console.error("Xirsys ulanish xatosi:", error.message);
        // Zaxira sifatida bepul Google STUN serverini qaytaramiz
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

// Socket.io ulanishi va xonaga qo'shilish logikasi
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);
        // Yangi foydalanuvchi ulandingi haqida xabar yuborish
        socket.to(roomId).emit('user-connected', userId, userName);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
});
