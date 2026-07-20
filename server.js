const express = require('express');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Environment Variables yoki to'g'ridan-to'g'ri kalitlar
const apiKey = process.env.LIVEKIT_API_KEY || 'APIUtixpKkmDo25';
const apiSecret = process.env.LIVEKIT_API_SECRET || 'PL2oghVY4HyeffCihl3t18sxMMIfjgaRRV14eHEUYVTB';

app.post('/api/get-token', async (req, res) => {
  const { roomName, participantName } = req.body;

  if (!roomName || !participantName) {
    return res.status(400).json({ error: 'Xona nomi va ism kiritilishi shart' });
  }

  try {
    // LiveKit SDK v1.x uchun to'g'ri konstruktor sintaksisi:
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
      ttl: '10h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    res.json({ token });
  } catch (err) {
    console.error('Token yaratishda xatolik:', err);
    res.status(500).json({ error: 'Token yaratib bo\'lmadi' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server ishga tushdi: http://localhost:${PORT}`);
});
