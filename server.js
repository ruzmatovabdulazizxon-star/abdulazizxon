const users = {}; // Xonadagi foydalanuvchilarni saqlash uchun: { roomId: [ {userId, socketId} ] }

io.on('connection', (socket) => {
    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);
        
        // Xonaga foydalanuvchini qo'shish
        if (!users[roomId]) {
            users[roomId] = [];
        }
        
        // Avvalroq shu userId bor-yo'qligini tekshirib keyin qo'shamiz
        if (!users[roomId].some(u => u.userId === userId)) {
            users[roomId].push({ userId, socketId: socket.id, userName });
        }

        // 1. Yangi kirgan foydalanuvchiga xonadagi boshqa barcha foydalanuvchilar ro'yxatini yuboramiz
        const otherUsers = users[roomId].filter(u => u.userId !== userId);
        socket.emit('all-users', otherUsers);

        // 2. Xonadagi mavjud foydalanuvchilarga yangi foydalanuvchi qo'shilganini xabar qilamiz
        socket.to(roomId).emit('user-connected', userId, userName);

        // Foydalanuvchi chiqib ketganda
        socket.on('disconnect', () => {
            if (users[roomId]) {
                users[roomId] = users[roomId].filter(u => u.socketId !== socket.id);
                socket.to(roomId).emit('user-disconnected', userId);
            }
        });
    });
});
