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

const roomAdmins = {}; 

// XIRSYS TURN/STUN formatini PeerJS ga moslab tozalash
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
            // PeerJS formatiga moslash: massiv elementlarini to'g'ri formatga o'tkazamiz
            let formattedServers = [];
            if (Array.isArray(rawServers)) {
                formattedServers = rawServers.map(srv => {
                    let config = { urls: srv.url || srv.urls };
                    if (srv.username) config.username = srv.username;
                    if (srv.credential) config.credential = srv.credential;
                    return config;
                });
            } else if (rawServers.iceServers) {
                formattedServers = rawServers.iceServers;
            }
            res.json(formattedServers);
        } else {
            res.json([{ urls: "stun:stun.l.google.com:19302" }]);
        }
    } catch (error) {
        console.error("Xirsys API ulanish xatosi:", error.message);
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', socket => {
    // Ruxsat so'rash tizimi
    socket.on('request-to-join', (roomId, username, peerId) => {
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            socket.join(roomId);
            socket.emit('join-approved', { isAdmin: true });
        } else {
            const adminSocketId = roomAdmins[roomId];
            socket.emit('user-awaiting-status');
            io.to(adminSocketId).emit('user-awaiting', {
                socketId: socket.id,
                username: username,
                peerId: peerId
            });
        }
    });

    socket.on('accept-user', (guestSocketId, roomId) => {
        io.to(guestSocketId).emit('join-approved', { isAdmin: false });
    });

    socket.on('reject-user', (guestSocketId) => {
        io.to(guestSocketId).emit('join-rejected');
    });

    // Xonaga kirish
    socket.on('join-room', (roomId, userId, username, isAdmin) => {
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

        socket.on('disconnect', () => {
            if (roomAdmins[roomId] === socket.id) {
                delete roomAdmins[roomId];
            }
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ${PORT}-portda faol`));
