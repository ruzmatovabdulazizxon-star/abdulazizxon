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

// XIRSYS INTEGRATSIYASI - TO'G'RI FORMATLASH
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.net/_turn/MyFirstApp', {}, {
            headers: {
                // Xirsys Dashboard'dagi ma'lumotlaringiz asosida yaratilgan Base64 avtorizatsiya
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        
        if (response.data && response.data.v && response.data.v.iceServers) {
            let rawServers = response.data.v.iceServers;
            
            // PeerJS formatiga moslash: 'urls' va 'url' kalitlarini sinxronlash
            let formattedServers = rawServers.map(srv => {
                const urlList = srv.url || srv.urls;
                return {
                    urls: Array.isArray(urlList) ? urlList : [urlList],
                    username: srv.username || "",
                    credential: srv.credential || ""
                };
            });

            // Google bepul STUN serverini ham zaxira sifatida qo'shamiz
            formattedServers.push({ urls: ["stun:stun.l.google.com:19302"] });
            
            res.json(formattedServers);
        } else {
            // Agar Xirsys ishlamay qolsa, zaxira bepul serverlar
            res.json([
                { urls: ["stun:stun.l.google.com:19302"] },
                { urls: ["stun:stun1.l.google.com:19302"] }
            ]);
        }
    } catch (error) {
        console.error("Xirsys API Error, Google STUN serverlariga qaytildi:", error.message);
        res.json([
            { urls: ["stun:stun.l.google.com:19302"] },
            { urls: ["stun:stun1.l.google.com:19302"] }
        ]);
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
