const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const peerServer = ExpressPeerServer(server, { debug: true });

app.use('/peerjs', peerServer);
app.use(express.static('public'));

// Bosh sahifaga kirganda 6 xonali tasodifiy raqam generatsiya qilib yo'naltirish
app.get('/', (req, res) => {
    const randomRoomId = Math.floor(100000 + Math.random() * 900000).toString();
    res.redirect(`/${randomRoomId}`);
});

app.get('/:room', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);

        socket.on('message', (message) => {
            io.to(roomId).emit('createMessage', message, userId);
        });

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
