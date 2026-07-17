import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { AccessToken } from 'livekit-server-sdk';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// __dirname ni ES Modules muhitida olish
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Statik fayllarni 'public' papkasidan xizmat qildirish
app.use(express.static(path.join(__dirname, 'public')));

// Bosh sahifa uchun public/index.html ni yuboramiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const activeRooms = {};

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

    // Mehmon ulanishni so'raganda
    socket.on('request-join', ({ roomId, username }) => {
        const adminSocketId = activeRooms[roomId];
        if (adminSocketId) {
            io.to(adminSocketId).emit('join-request-received', {
                socketId: socket.id,
                username: username
            });
        } else {
            socket.emit('join-decision', { decision: 'reject', message: 'Uchrashuv admini hali xonaga kirmagan!' });
        }
    });

    // Admin mehmon bo'yicha qaror berganda
    socket.on('admin-decision', ({ socketId, decision }) => {
        io.to(socketId).emit('join-decision', { 
            decision, 
            message: decision === 'accept' ? null : 'Admin ruxsat bermadi.' 
        });
    });

    // Xonaga kirish mantiqi va LiveKit token generatsiyasi
    socket.on('join-room', async ({ roomId, username, role }) => {
        if (role === 'admin') {
            activeRooms[roomId] = socket.id;
        }

        try {
            // LiveKit Token tayyorlash
            const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
                identity: username,
            });
            at.addGrant({ roomJoin: true, room: roomId, canPublish: true, canSubscribe: true });
            const token = await at.toJwt(); // ES Module formatida asinxron ishlashi ishonchliroq

            socket.emit('token-ready', {
                token,
                roomId,
                livekitUrl: LIVEKIT_URL
            });
        } catch (error) {
            console.error("Token yaratishda xato:", error);
        }
    });

    socket.on('disconnect', () => {
        // Agar xonani ochgan admin chiqib ketsa, uni activeRooms ro'yxatidan o'chiramiz
        for (const [roomId, socketId] of Object.entries(activeRooms)) {
            if (socketId === socket.id) {
                delete activeRooms[roomId];
                console.log(`Xona yopildi (Admin chiqdi): ${roomId}`);
            }
        }
        console.log('Foydalanuvchi uzildi:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server port ${PORT} da ishlamoqda`);
});
