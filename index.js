const express = require('express');
const cors = require('cors');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');
require('dotenv').config();

const app = express();

// Express va Socket.io bitta HTTP server ustida ishlashi shart!
const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5000;

// Middleware sozlamalari
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Xonadagi adminlar ro'yxati
const roomAdmins = {}; 

// LiveKit Token yaratish API
app.post('/get-token', async (req, res) => {
    const { roomName, participantName, isAdmin } = req.body;

    if (!roomName || !participantName) {
        return res.status(400).json({ error: "Xona nomi va ism kiritilishi shart!" });
    }

    try {
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";

        if (!apiKey || !apiSecret) {
            return res.status(500).json({ error: "Serverda LiveKit API_KEY yoki SECRET sozlanmagan!" });
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            roomAdmin: isAdmin === true, 
        });

        const token = await at.toJwt();

        res.json({
            token: token,
            serverUrl: livekitUrl
        });

    } catch (error) {
        console.error("LiveKit token yaratishda xatolik:", error);
        res.status(500).json({ error: "Ichki server xatoligi yuz berdi." });
    }
});

// Asosiy sahifa yo'nalishi
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Kutish zali mantiqi (Socket.io)
io.on('connection', socket => {
    let currentRoom = null;
    let currentUsername = null;

    socket.on('request-to-join', (roomId, username) => {
        currentRoom = roomId;
        currentUsername = username;

        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            socket.join(roomId);
            socket.emit('join-approved', { isAdmin: true });
        } else {
            socket.emit('user-awaiting-status');
            io.to(roomAdmins[roomId]).emit('user-awaiting', {
                socketId: socket.id,
                username: username
            });
        }
    });

    socket.on('accept-user', (guestSocketId, roomId) => {
        io.to(guestSocketId).emit('join-approved', { isAdmin: false });
    });

    socket.on('reject-user', (guestSocketId) => {
        io.to(guestSocketId).emit('join-rejected');
    });

    socket.on('join-room', (roomId, userId, username, isAdmin) => {
        socket.join(roomId);
        
        socket.on('send-chat-message', (messageText) => {
            io.to(roomId).emit('receive-chat-message', {
                username: username,
                message: messageText
            });
        });
    });

    socket.on('leave-room-signal', () => {
        if (currentRoom && roomAdmins[currentRoom] === socket.id) {
            delete roomAdmins[currentRoom];
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && roomAdmins[currentRoom] === socket.id) {
            delete roomAdmins[currentRoom];
        }
    });
});

// Serverni ishga tushirish
server.listen(PORT, () => {
    console.log(`> Server http://localhost:${PORT} manzilida muvaffaqiyatli ishlamoqda.`);
});
