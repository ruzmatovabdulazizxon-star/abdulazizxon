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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;

// Render'dagi LiveKit URL'ini tozalab olamiz
let LIVEKIT_URL = process.env.LIVEKIT_URL ? process.env.LIVEKIT_URL.trim() : '';
LIVEKIT_URL = LIVEKIT_URL.replace('wss://', '').replace('https://', '');

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ? process.env.LIVEKIT_API_KEY.trim() : '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ? process.env.LIVEKIT_API_SECRET.trim() : '';

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
        io.to(socketId).emit('join-decision', { 
            decision, 
            message: decision === 'accept' ? null : 'Admin ruxsat bermadi.' 
        });
    });

    socket.on('join-room', async ({ roomId, username, role }) => {
        if (role === 'admin') {
            activeRooms[roomId] = socket.id;
        }

        try {
            const uniqueIdentity = `${username}_${Math.random().toString(36).substring(2, 7)}`;

            const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
                identity: uniqueIdentity,
                name: username
            });
            
            at.addGrant({ 
                roomJoin: true, 
                room: roomId.toString(), 
                canPublish: true, 
                canSubscribe: true 
            });
            
            // XATO SHU YERDA EDI: await olib tashlandi, chunki toJwt() sinxron funksiya
            const token = at.toJwt(); 

            socket.emit('token-ready', {
                token,
                roomId,
                livekitUrl: `wss://${LIVEKIT_URL}` // Toza manzilda wss sxemasi
            });
        } catch (error) {
            console.error("Token yaratishda xato:", error);
        }
    });

    socket.on('disconnect', () => {
        for (const [roomId, socketId] of Object.entries(activeRooms)) {
            if (socketId === socket.id) {
                delete activeRooms[roomId];
            }
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server port ${PORT} da ishlamoqda`);
});
