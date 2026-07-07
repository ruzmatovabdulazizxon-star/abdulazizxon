const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');

const peerServer = ExpressPeerServer(server, {
    debug: true
});

app.use('/peerjs', peerServer);
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    
    // Foydalanuvchi kiritganda unga tasodifiy 6 xonali ID generatsiya qilib beramiz
    socket.on('get-short-id', () => {
        const shortId = Math.floor(100000 + Math.random() * 900000).toString(); // Masalan: 584932
        socket.emit('created-short-id', shortId);
    });

    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);

        socket.on('message', (message) => {
            io.to(roomId).emit('createMessage', message);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda`);
});
