socket.on('token-ready', async ({ token, roomId, livekitUrl }) => {
    lobby.classList.add('hidden');
    meetContainer.classList.remove('hidden');
    document.getElementById('active-room-title').innerText = roomId;

    try {
        const LK = window.LiveKitClient || window.LiveKit;
        if (!LK) {
            throw new Error("LiveKit kutubxonasi topilmadi!");
        }

        roomInstance = new LK.Room();

        roomInstance.on(LK.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                const element = track.attach();
                element.className = "w-full h-full object-cover rounded-lg border-2 border-gray-700";
                element.id = `video-${participant.identity}`;
                videoGrid.appendChild(element);
            }
        });

        roomInstance.on(LK.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === 'video') {
                track.detach();
                const element = document.getElementById(`video-${participant.identity}`);
                if (element) element.remove();
            }
        });

        // LiveKit serverga ulanish
        await roomInstance.connect(livekitUrl, token);

        // Kamera va Mikrofonni yoqish
        await roomInstance.localParticipant.enableCameraAndMicrophone();

        // O'zimizning kameramizni ekranga chiqarish
        const localVideo = document.createElement('video');
        localVideo.muted = true;
        localVideo.className = "w-full h-full object-cover rounded-lg border-2 border-blue-500";
        localVideo.autoplay = true;
        localVideo.playsInline = true;

        videoGrid.appendChild(localVideo);

        const trackPublication = roomInstance.localParticipant.getTrack(LK.Track.Source.Camera);
        if (trackPublication && trackPublication.videoTrack) {
            trackPublication.videoTrack.attach(localVideo);
        }

    } catch (error) {
        console.error("Ulanishda xato:", error);
        alert("Video xonaga ulanib bo'lmadi: " + error.message);
    }
});
