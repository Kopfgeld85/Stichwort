const express = require('express');
const path = require('path');
const app = express();

// Statische Dateien servieren
app.use(express.static(__dirname));

// Hauptroute
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Server starten
const port = 3000;
app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
});
