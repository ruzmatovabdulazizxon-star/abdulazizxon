let currentRoom = null;
const LIVEKIT_URL = 'wss://zoom-a9ec8wf5.livekit.cloud';

async function joinRoom() {
  const username = document.getElementById('username').value;
  const roomName = document.getElementById('room-name').value;

  if (!username || !roomName) {
    alert("Ism va xona nomini kiriting!");
    return;
  }

  try {
    const response = await fetch('/api/get-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, participantName: username })
    });

    const data = await response.json();
    if (!data.token) {
      alert("Token olinmadi!");
      return;
    }

    document.getElementById('join-card').style.display = 'none';
    document.getElementById('room').style.display = 'flex';

    const room = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
    });

    currentRoom = room;

    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const element = track.attach();
      element.id = `track-${publication.trackSid}`;
      document.getElementById('video-grid').appendChild(element);
    });

    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach(el => el.remove());
    });

    await room.connect(LIVEKIT_URL, data.token);
    await room.localParticipant.enableCameraAndMicrophone();

    room.localParticipant.videoTrackPublications.forEach((publication) => {
      if (publication.track) {
        const element = publication.track.attach();
        element.style.width = '100%';
        element.style.height = '100%';
        element.style.objectFit = 'cover';
        document.getElementById('video-grid').appendChild(element);
      }
    });

  } catch (error) {
    console.error("Xatolik:", error);
    alert("Xonaga ulanishda xatolik: " + error.message);
  }
}

async function toggleAudio() {
  if (!currentRoom) return;
  const enabled = currentRoom.localParticipant.isMicrophoneEnabled;
  await currentRoom.localParticipant.setMicrophoneEnabled(!enabled);
}

async function toggleVideo() {
  if (!currentRoom) return;
  const enabled = currentRoom.localParticipant.isCameraEnabled;
  await currentRoom.localParticipant.setCameraEnabled(!enabled);
}

async function shareScreen() {
  if (!currentRoom) return;
  const enabled = currentRoom.localParticipant.isScreenShareEnabled;
  await currentRoom.localParticipant.setScreenShareEnabled(!enabled);
}

function leaveRoom() {
  if (currentRoom) {
    currentRoom.disconnect();
  }
  location.reload();
}
