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

// 1. Statik fayllarni va PeerJS serverni ulash
app.use(express.static(path.join(__dirname, 'public')));
app.use('/peerjs', peerServer);

// Xonalardagi adminlarni socket ID bo'yicha saqlash obyekti
const roomAdmins = {}; 

// 2. XIRSYS TURN/STUN serverlarini olish API-liniyasi
app.get('/ice-servers', async (req, res) => {
    try {
        const response = await axios.put('https://global.xirsys.com/_turn/MyFirstApp', {}, {
            headers: {
                "Authorization": "Basic " + Buffer.from("abdulaziz:c0a65ce0-8033-11f1-8a6c-f2f74e209366").toString("base64"),
                "Content-Type": "application/json"
            }
        });
        
        if (response.data && response.data.v && response.data.v.iceServers) {
            res.json(response.data.v.iceServers);
        } else {
            res.json([{ urls: "stun:stun.l.google.com:19302" }]);
        }
    } catch (error) {
        console.error("Xirsys API xatosi:", error.message);
        res.json([{ urls: "stun:stun.l.google.com:19302" }]);
    }
});

// 3. Istalgan dinamik URL kelganda index.html faylini yuborish (/2 yoki /xona123)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 4. Socket.io - Uchrashuv xonalari va Ruxsat berish tizimi logikasi
io.on('connection', socket => {
    
    // Mehmon xonaga kirishga ruxsat so'raganda
    socket.on('request-to-join', (roomId, username, peerId) => {
        // Agar ushbu xonada hali hech kim (admin) bo'lmasa, birinchi kirgan foydalanuvchi - ADMIN bo'ladi
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id; // Adminning socket ID-sini saqlab qo'yamiz
            socket.join(roomId);
            // Adminga darhol kirishga ruxsat beramiz va unga admin ekanligini bildiramiz
            socket.emit('join-approved', { isAdmin: true, adminPeerId: peerId });
            console.log(`Xona yaratildi: ${roomId}. Admin: ${username} (${socket.id})`);
        } else {
            // Agar xonada allaqachon admin bo'lsa, mehmonga kutish rejimini beramiz va adminga so'rov yuboramiz
            const adminSocketId = roomAdmins[roomId];
            
            // Adminga ruxsat so'rovi oynasini chiqarish uchun signal yuboramiz
            io.to(adminSocketId).emit('user-awaiting', {
                socketId: socket.id,
                username: username,
                peerId: peerId
            });
            console.log(`Mehmon ${username} (${socket.id}) ${roomId} xonasiga kirish uchun admindan ruxsat kutmoqda.`);
        }
    });

    // Admin mehmonni QABUL qilganda (Ruxsat berganda)
    socket.on('accept-user', (guestSocketId, roomId) => {
        io.to(guestSocketId).emit('join-approved', { isAdmin: false });
        console.log(`Admin mehmonni (${guestSocketId}) xonaga kiritishga ruxsat berdi.`);
    });

    // Admin mehmonni RAD etganda (Taqiqlaganda)
    socket.on('reject-user', (guestSocketId) => {
        io.to(guestSocketId).emit('join-rejected');
        console.log(`Admin mehmonning (${guestSocketId}) kirish so'rovini rad etdi.`);
    });

    // Ruxsat berilgan foydalanuvchi xonaga rasman ulanganda
    socket.on('join-room', (roomId, userId, username, isAdmin) => {
        socket.join(roomId);
        
        // Xonadagi boshqa barcha foydalanuvchilarga yangi a'zoning peerId, ismi va adminlik holatini yuboramiz
        socket.to(roomId).emit('user-connected', { 
            userId: userId, 
            username: username, 
            isAdmin: isAdmin 
        });

        // Foydalanuvchi uchrashuvdan chiqib ketganda
        socket.on('disconnect', () => {
            // Agar chiqib ketgan odam xonaning admini bo'lsa, ro'yxatdan o'chiramiz
            if (roomAdmins[roomId] === socket.id) {
                delete roomAdmins[roomId];
                console.log(`Admin xonani tark etdi: ${roomId}`);
            }
            
            // Xonadagilarga ushbu foydalanuvchi chiqib ketganini bildiramiz
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

// Render platformasi va lokal port sozlamasi
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda muvaffaqiyatli ishga tushdi.`);
});
