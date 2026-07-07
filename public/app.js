<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zoom Mini-Platforma (WebRTC)</title>
    <script src="/socket.io/socket.io.js"></script>
    <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; background: #141414; color: white; margin: 0; padding: 20px; text-align: center; }
        h1 { color: #8ab4f8; }
        .main-container { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 20px; }
        .video-box { background: #202124; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
        .video-container { display: flex; gap: 20px; }
        video { width: 350px; height: 260px; background: black; border-radius: 8px; object-fit: cover; }
        .chat-box { background: #202124; padding: 20px; border-radius: 12px; width: 300px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
        #chat { height: 200px; overflow-y: auto; border: 1px solid #3c4043; background: #1a1a1a; padding: 10px; border-radius: 6px; text-align: left; margin-bottom: 10px; }
        input { padding: 10px; border-radius: 6px; border: none; width: 70%; }
        button { padding: 10px 15px; border-radius: 6px; border: none; background: #1a73e8; color: white; cursor: pointer; font-weight: bold; }
        #room-input { width: 60%; margin-bottom: 10px; text-align: center; }
        .info-panel { background: #202124; padding: 15px; border-radius: 12px; margin-bottom: 20px; display: inline-block; }
    </style>
</head>
<body>

    <h1>Zoom Mini-Platforma (WebRTC)</h1>

    <div class="info-panel">
        <div id="my-peer-id" style="font-weight: bold; font-size: 18px;">Xona ID yuklanmoqda...</div>
        <div style="margin-top: 10px;">
            <input type="text" id="room-input" placeholder="Sherigingizning Xona ID raqamini kiriting">
            <button onclick="connectToPeer()">Xonaga ulanish</button>
        </div>
    </div>

    <div class="main-container">
        <div class="video-box">
            <div class="video-container">
                <div>
                    <h3>Siz (Kamera)</h3>
                    <video id="localVideo" autoplay playsinline muted></video>
                </div>
                <div>
                    <h3>Suhbatdosh</h3>
                    <video id="remoteVideo" autoplay playsinline></video>
                </div>
            </div>
        </div>

        <div class="chat-box">
            <h3>Jonli Chat</h3>
            <div id="chat"></div>
            <input type="text" id="messageInput" placeholder="Xabar yozing...">
            <button onclick="sendMessage()">Yuborish</button>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
