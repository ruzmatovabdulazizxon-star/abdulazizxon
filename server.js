io.on('connection', (socket) => {
    
    // Mehmon xonaga ulanishni so'raganda
    socket.on('join-room', (roomId, username, peerId) => {
        socket.join(roomId);
        
        // Xonadagi boshqa foydalanuvchilar (ayniqsa admin) ro'yxatini olish
        const clients = io.sockets.adapter.rooms.get(roomId);
        
        // Agar xonada allaqachon kimdir bo'lsa (ya'ni admin bor), ruxsat so'rash yuboriladi
        if (clients && clients.size > 1) {
            // Xonadagi birinchi foydalanuvchini admin deb hisoblaymiz va unga so'rov yuboramiz
            const clientsArray = Array.from(clients);
            const adminSocketId = clientsArray[0]; // birinchi kirgan odam (admin)
            
            io.to(adminSocketId).emit('request-join', {
                socketId: socket.id,
                username: username
            });
        } else {
            // Agar birinchi foydalanuvchi bo'lsa, u avtomatik admin va ulanadi
            socket.emit('join-decision', 'approved');
        }
    });

    // Admin qaror qabul qilganda
    socket.on('admin-decision', ({ targetSocketId, decision }) => {
        io.to(targetSocketId).emit('join-decision', decision);
    });
});
