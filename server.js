const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const axios = require('axios');
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const roomAdmins = {}; 

// Xirsys yoki bepul STUN xizmati
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.net/_turn/MyFirstApp', {}, {
            headers: {
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        
        if (response.data && response.data.v && response.data.v.iceServers) {
            let rawServers = response.data.v.iceServers;
            let formattedServers = rawServers.map(srv => ({
                urls: srv.url || srv.urls,
                username: srv.username || "",
                credential: srv.credential || ""
            }));
            formattedServers.push({ urls: "stun:stun.l.google.com:19302" });
            res.json(formattedServers);
        } else {
            res.json([{ urls: "stun:stun.l.google.com:19302" }]);
        }
    } catch (error) {
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', socket => {
    let currentRoom = null;
    let currentUserId = null;

    socket.on('request-to-join', (roomId, username) => {
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
        currentRoom = roomId;
        currentUserId = userId;
        socket.join(roomId);
        
        socket.to(roomId).emit('user-connected', { 
            userId: userId, 
            username: username, 
            isAdmin: isAdmin 
        });

        socket.on('send-chat-message', (messageText) => {
            io.to(roomId).emit('receive-chat-message', {
                username: username,
                message: messageText
            });
        });
    });

    socket.on('leave-room-signal', () => {
        if (currentRoom && currentUserId) {
            socket.to(currentRoom).emit('user-disconnected', currentUserId);
            if (roomAdmins[currentRoom] === socket.id) delete roomAdmins[currentRoom];
            socket.leave(currentRoom);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && currentUserId) {
            socket.to(currentRoom).emit('user-disconnected', currentUserId);
            if (roomAdmins[currentRoom] === socket.id) delete roomAdmins[currentRoom];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
