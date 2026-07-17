import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { AccessToken } from 'livekit-server-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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

// Statik fayllarni ulash (app.js va style.css kabi fayllarni topish uchun)
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'src')));

// Bosh sahifaga kirganda index.html faylini kafolatlangan usulda qidirib topish
app.get('/', (req, res) => {
    // 1-urinish: index.js bilan bir xil papkada (root)
    let indexPath = path.join(__dirname, 'index.html');

    // 2-urinish: Agar u yerda bo'lmasa, src papkasi ichidan qidirish
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(__dirname, 'src', 'index.html');
    }

    // 3-urinish: Agar baribir topilmasa, loyihaning umumiy ishchi katalogidan (process.cwd) qidirish
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(process.cwd(), 'index.html');
    }
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(process.cwd(), 'src', 'index.html');
    }

    // Topilgan to'g'ri faylni brauzerga jo'natish
    res.sendFile(indexPath);
});

const PORT = process.env.PORT || 10000;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const activeRooms = {};

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

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

    socket.on('admin-decision', ({ socketId, decision }) => {
        io.to(socketId).emit('join-decision', { decision });
    });

    socket.on('join-room', async ({ roomId, username, role }) => {
        try {
            if (role === 'admin') {
                activeRooms[roomId] = socket.id;
            }

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
