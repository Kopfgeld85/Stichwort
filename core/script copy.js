// const pdfFiles = [];
const pdfTexts = [];
let searchResults = [];
let db;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.js'; // Ersetze den Pfad entsprechend

// Datenbank initialisieren
function initDB() {

    const request = indexedDB.open('PDFDatabase', 1);

    request.onupgradeneeded = function(event) {
        db = event.target.result;
        const objectStore = db.createObjectStore('pdfFiles', { keyPath: 'id', autoIncrement: true });
        objectStore.createIndex('name', 'name', { unique: true });
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        console.log('Datenbank erfolgreich initialisiert', db);
        loadFileList(); // Lade die Datei-Liste nach dem DB-Setup
        loadFilesFromArchive(); // Lade die Dateien aus dem Archiv
        // Aktivieren Sie den Button, nachdem die Datenbank initialisiert wurde
        document.getElementById('showDatabaseButton').disabled = false;
    };

    request.onerror = function(event) {
        console.error('Datenbankfehler:', event.target.errorCode);
    };
}
// Initialisiere die Datenbank beim Laden der Seite
window.onload = function() {
    initDB();
};

// Lade die Datei-Liste aus der Datenbank
function loadFileList() {
    const transaction = db.transaction(['pdfFiles'], 'readonly');
    const objectStore = transaction.objectStore('pdfFiles');
    const request = objectStore.getAll();

    request.onsuccess = function(event) {
        const savedFiles = event.target.result;
        pdfFiles.length = 0; // Leeren Sie das Array
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        savedFiles.forEach((fileData, index) => {
            const li = document.createElement('li');
            li.textContent = fileData.name;

            const openButton = document.createElement('button');
            openButton.textContent = 'Öffnen';
            openButton.style.marginLeft = '10px';
            openButton.onclick = () => {
                const fileBlob = new Blob([fileData.content], { type: 'application/pdf' });
                const fileURL = URL.createObjectURL(fileBlob);
                window.open(fileURL, '_blank');
            };

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Löschen';
            deleteButton.style.marginLeft = '10px';
            deleteButton.onclick = () => {
                deleteFile(index);
            };

            li.appendChild(openButton);
            li.appendChild(deleteButton);
            fileList.appendChild(li);
        });
    };

    request.onerror = function(event) {
        console.error('Fehler beim Laden der Dateien:', event.target.errorCode);
    };
}

// Lade die Dateien aus dem Archivordner
function loadFilesFromArchive() {
    alert('Bitte wählen Sie die PDF-Dateien aus dem Ordner "C:\\Archivierte Dokumente" aus.');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.multiple = true; // Erlauben Sie die Auswahl mehrerer Dateien

    input.onchange = async (event) => {
        const files = event.target.files;
        const progressBar = document.getElementById('progressBar');
        const progressContainer = document.getElementById('progressContainer');
        progressContainer.style.display = 'block'; // Zeige den Fortschrittsbalken an

        for (let i = 0; i < files.length; i++) {
            await saveFileToDB(files[i]); // Speichern Sie jede Datei in der Datenbank
            progressBar.value = ((i + 1) / files.length) * 100; // Aktualisiere den Fortschritt
        }

        progressContainer.style.display = 'none'; // Verstecke den Fortschrittsbalken
        loadFileList(); // Laden Sie die Datei-Liste nach dem Hochladen neu
    };

    input.click(); // Öffnen Sie den Datei-Dialog
}



// Text aus der PDF extrahieren und speichern
async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const pagesText = [];

    console.log(`PDF hat ${pdf.numPages} Seiten.`); // Anzahl der Seiten protokollieren

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        pagesText.push({ pageNumber: i, text: pageText });
        console.log(`Seite ${i}: ${pageText}`); // Text jeder Seite protokollieren
    }

    console.log('Extrahierter Text:', pagesText); // Debugging hinzufügen
    return pagesText;
}

// Event-Listener für Datei-Uploads
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', async (event) => {
        const files = event.target.files;
        
        for (let i = 0; i < files.length; i++) {
            await saveFileToDB(files[i]); // Speichern Sie jede Datei in der Datenbank
        }

        loadFileList(); // Laden Sie die Datei-Liste nach dem Hochladen neu
    });
});

// Datei in die Datenbank speichern
async function saveFileToDB(file) {
    const arrayBuffer = await file.arrayBuffer();
    const transaction = db.transaction(['pdfFiles'], 'readwrite');
    const objectStore = transaction.objectStore('pdfFiles');

    const pdfData = {
        name: file.name,
        content: arrayBuffer // Stellen Sie sicher, dass dies ein ArrayBuffer ist
    };

    const request = objectStore.add(pdfData);

    request.onsuccess = function() {
        console.log('Datei erfolgreich gespeichert:', file.name);
        extractTextFromPDF(file); // Extrahiere den Text aus der PDF
    };

    request.onerror = function(event) {
        console.error('Fehler beim Speichern der Datei:', event.target.errorCode);
    };
} 


// Datei aus der Datenbank löschen  
function deleteFile(index) {
    const transaction = db.transaction(['pdfFiles'], 'readwrite');
    const objectStore = transaction.objectStore('pdfFiles');

    const request = objectStore.getAll();

    request.onsuccess = function(event) {
        const savedFiles = event.target.result;
        const fileToDelete = savedFiles[index];

        if (fileToDelete) {
            const deleteRequest = objectStore.delete(fileToDelete.id);

            deleteRequest.onsuccess = function() {
                console.log('Datei erfolgreich gelöscht');
                loadFileList(); // Aktualisiere die Datei-Liste
            };

            deleteRequest.onerror = function(event) {
                console.error('Fehler beim Löschen der Datei:', event.target.errorCode);
            };
        }
    };

    request.onerror = function(event) {
        console.error('Fehler beim Abrufen der Dateien:', event.target.errorCode);
    };
}

// Stichwortsuche
function searchKeyword() {
    const input = document.getElementById('searchInput').value.trim().toLowerCase();
    const keywords = input.split(',').map(kw => kw.trim()).filter(kw => kw);
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    console.log('Eingegebene Schlüsselwörter:', keywords);
    console.log('Aktueller Inhalt von pdfTexts:', pdfTexts);

    if (keywords.length === 0) {
        alert('Bitte mindestens ein Stichwort eingeben.');
        return;
    }

    searchResults = [];

    pdfTexts.forEach(({ fileName, text }, fileIndex) => {
        const fullText = text.map(page => page.text).join(' '); // Gesamten Text der Datei erstellen
        const matchedKeywords = keywords.filter(keyword => fullText.toLowerCase().includes(keyword));
        if (matchedKeywords.length > 0) {
            searchResults.push({ fileName, fileIndex, matchedKeywords });
        }
    });

    console.log('Suchergebnisse:', searchResults);
    displayResults(searchResults);
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    results.forEach(({ fileName, fileIndex, matchedKeywords }) => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result';

        const fileNameHeader = document.createElement('h3');
        fileNameHeader.textContent = `Datei: ${fileName}`;
        resultDiv.appendChild(fileNameHeader);

        const openLink = document.createElement('a');
        const fileBlob = new Blob([pdfFiles[fileIndex]], { type: 'application/pdf' }); // Erstellen Sie den Blob
        openLink.href = URL.createObjectURL(fileBlob); // Erstellen Sie die URL
        openLink.target = '_blank';
        openLink.textContent = 'PDF öffnen';
        openLink.style.display = 'block';
        resultDiv.appendChild(openLink);

        matchedKeywords.forEach(keyword => {
            const p = document.createElement('p');
            p.textContent = `Das Stichwort "${keyword}" wurde gefunden.`;
            resultDiv.appendChild(p);
        });

        resultsDiv.appendChild(resultDiv);
    });
}

function showDatabase() {
    console.log('Überprüfen der Datenbank...', db); // Debugging-Ausgabe
    if (!db) {
        console.error('Datenbank ist nicht initialisiert');
        return;
    }
    document.getElementById('searchSection').style.display = 'none';
    document.getElementById('databaseSection').style.display = 'block';
    loadFileList();
}

function showSearch() {
    document.getElementById('searchSection').style.display = 'block';
    document.getElementById('databaseSection').style.display = 'none';
}

// Übersetzungsfunktion



async function translateText(text, targetLang) {
    const apiKey = '37fde0e1-5172-45d8-83a4-9f2759f9791a:fx'; // Ersetze dies durch deinen tatsächlichen API-Schlüssel
    const url = 'https://api-free.deepl.com/v2/translate';

    const params = new URLSearchParams();
    params.append('auth_key', apiKey);
    params.append('text', text);
    params.append('target_lang', targetLang);

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: params
        });

        if (!response.ok) {
            throw new Error('Fehler bei der Übersetzung: ' + response.statusText);
        }

        const data = await response.json();
        return data.translations[0].text;
    } catch (error) {
        console.error('Übersetzungsfehler:', error);
        return null;
    }
}






 // Filterfunktion für die Stichwortsuche
 function filterResults() {
    const filterValues = document.getElementById('filterInput').value.toLowerCase().split(',').map(value => value.trim());
    const resultsDiv = document.getElementById('results');
    const paragraphs = resultsDiv.getElementsByTagName('p');

    for (const paragraph of paragraphs) {
        const matches = filterValues.some(filterValue => paragraph.innerText.toLowerCase().includes(filterValue));
        paragraph.style.display = matches ? '' : 'none'; // Sichtbar oder ausblenden
    }
}

function highlightText(paragraph) {
    paragraph.style.backgroundColor = 'yellow'; // Markierung
}

// Historie der Stichworte speichern
function saveSearchHistory(keyword) {
    let history = JSON.parse(localStorage.getItem('searchHistory')) || [];
    history.push(keyword);
    localStorage.setItem('searchHistory', JSON.stringify(history));
}

// Ergebnisse exportieren
function exportResults() {
    const resultsDiv = document.getElementById('results');
    const data = resultsDiv.innerText; // Text der Ergebnisse

    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateString = `${now.getDate().toString().padStart(2, '0')}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear()}`;
    const timeString = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const fileName = `Analyse - ${dateString} - ${timeString}.txt`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName; // Dynamischer Dateiname
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

 // Datenbank zurücksetzen
 function resetDatabase() {
     const transaction = db.transaction(['pdfFiles'], 'readwrite');
     const objectStore = transaction.objectStore('pdfFiles');
 
     const request = objectStore.clear(); // Löscht alle Einträge in der Datenbank
 
     request.onsuccess = function() {
         console.log('Alle Dokumente wurden gelöscht.');
         // Öffnen Sie den Datei-Dialog, um neue Dateien hochzuladen
         document.getElementById('fileInput').click(); 
     };
 
     request.onerror = function(event) {
         console.error('Fehler beim Löschen der Dokumente:', event.target.errorCode);
     };
 }