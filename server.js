const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const roomAdmins = {}; 

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
