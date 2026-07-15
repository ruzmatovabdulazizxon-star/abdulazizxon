const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');
const axios = require('axios'); // Faqat bir marta e'lon qilindi!
const path = require('path');

const peerServer = ExpressPeerServer(server, {
    debug: true
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/peerjs', peerServer);

const roomsAdmin = {}; 
const roomsUsers = {}; 

app.get('*', (req, res, next) => {
    // API so'rovlarini o'tkazib yuborish
    if (req.path === '/ice-servers' || req.path.startsWith('/peerjs')) {
        return next();
    }
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
            console.log("Xirsys TURN serverlari muvaffaqiyatli olindi!");
            res.json(response.data.v.iceServers);
        } else {
            res.json([{ urls: "stun:stun.l.google.com:19302" }]);
        }
    } catch (error) {
        console.error("Xirsys ulanish xatosi:", error.message);
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        if (!roomsAdmin[roomId]) {
            roomsAdmin[roomId] = socket.id;
            socket.emit('admin-status', true);
        } else {
            socket.emit('admin-status', false);
        }

        socket.join(roomId);

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

        socket.on('approve-guest', (guestSocketId, guestPeerId, guestName) => {
            io.to(guestSocketId).emit('join-approved');
            registerUserAndNotify(roomId, guestPeerId, guestSocketId, guestName);
        });

        socket.on('reject-guest', (guestSocketId) => {
            io.to(guestSocketId).emit('join-rejected');
        });

        socket.on('send-chat-message', (message, senderName) => {
            io.to(roomId).emit('receive-chat-message', message, senderName);
        });

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
        const otherUsers = roomsUsers[roomId].filter(u => u.userId !== userId);
        socket.emit('all-users', otherUsers);
        socket.to(roomId).emit('user-connected', userId, userName);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
