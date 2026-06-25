const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// Eski app.listen(3000, ...) o'rniga mana buni qo'ying:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portida muvaffaqiyatli yoqildi!`);
});