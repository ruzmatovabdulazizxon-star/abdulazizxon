import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { AccessToken } from 'livekit-server-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// Xonalar va ularning adminlari ro'yxati
const activeRooms = {};

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

    // Mehmon uchrashuvga kirishni so'raganda
    socket.on('request-join', ({ roomId, username }) => {
        const adminSocketId = activeRooms[roomId];
        if (adminSocketId) {
            // Admin bor bo'lsa, adminga so'rov yuboriladi
            io.to(adminSocketId).emit('join-request-received', {
                socketId: socket.id,
                username: username
            });
        } else {
            // Agar xonada hali admin bo'lmasa
            socket.emit('join-decision', { decision: 'reject', message: 'Uchrashuv admini hali xonaga kirmagan!' });
        }
    });

    // Admin qaror qabul qilganda
    socket.on('admin-decision', ({ socketId, decision }) => {
        io.to(socketId).emit('join-decision', { decision });
    });

    // Haqiqiy ulanish (Ruxsat berilgandan keyin yoki Admin uchun)
    socket.on('join-room', async ({ roomId, username, role }) => {
        try {
            if (role === 'admin') {
                activeRooms[roomId] = socket.id;
            }

            // LiveKit tokenini yaratish
            const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
                identity: username,
            });

            at.addGrant({
                roomJoin: true,
                room: roomId,
                canPublish: true,
                canSubscribe: true,
            });

            const token = await at.toJwt();

            // Klientga tayyor token va ulanishi kerak bo'lgan LiveKit URL yuboriladi
            socket.emit('token-ready', { 
                token, 
                roomId, 
                livekitUrl: LIVEKIT_URL 
            });

        } catch (error) {
            console.error('Token yaratishda xatolik:', error);
        }
    });

    socket.on('disconnect', () => {
        // Agar admin chiqib ketsa, xonadan o'chiramiz
        for (const rId in activeRooms) {
            if (activeRooms[rId] === socket.id) {
                delete activeRooms[rId];
                console.log(`Admin chiqib ketdi, xona o'chirildi: ${rId}`);
            }
        }
        console.log('Foydalanuvchi uzildi:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server port ${PORT} da ishlamoqda`);
});
