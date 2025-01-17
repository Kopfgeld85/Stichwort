const pdfFiles = [];
const pdfTexts = [];
let searchResults = [];
let db;
let errorLogs = [];

// Konfigurieren Sie den Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.15.349/pdf.worker.min.js';

// Konfiguration
const config = {
    tempDir: 'C:\\temp\\Stichwortsuche',  // Temporäres Verzeichnis für Dateien
    maxFileSize: 100 * 1024 * 1024,       // Maximale Dateigröße (100 MB)
    supportedFileTypes: {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'text/plain': '.txt'
    }
};

// Funktion zum Erstellen des Temp-Verzeichnisses
async function ensureTempDir() {
    try {
        // Prüfe, ob das Verzeichnis existiert
        await new Promise((resolve, reject) => {
            const fs = window.require('fs');
            if (!fs.existsSync(config.tempDir)) {
                fs.mkdirSync(config.tempDir, { recursive: true });
            }
            resolve();
        });
    } catch (error) {
        console.warn('Temp-Verzeichnis konnte nicht erstellt werden:', error);
        // Fallback: Verwende einen relativen Pfad im Projektverzeichnis
        config.tempDir = './temp';
        try {
            if (!fs.existsSync(config.tempDir)) {
                fs.mkdirSync(config.tempDir, { recursive: true });
            }
        } catch (error) {
            console.error('Konnte kein Temp-Verzeichnis erstellen:', error);
        }
    }
}

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

// Initialisiere die Anwendung
window.onload = async function() {
    await ensureTempDir();
    initDB();
    loadErrorLogs();
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
            openButton.onclick = async () => {
                const transaction = db.transaction(['pdfFiles'], 'readonly');
                const objectStore = transaction.objectStore('pdfFiles');
                const request = objectStore.index('name').get(fileData.name);
                
                request.onsuccess = function(event) {
                    const fileData = event.target.result;
                    if (fileData) {
                        // Bestimme den MIME-Type basierend auf der Dateiendung
                        const fileExtension = fileData.name.split('.').pop().toLowerCase();
                        let mimeType;
                        switch (fileExtension) {
                            case 'pdf':
                                mimeType = 'application/pdf';
                                break;
                            case 'docx':
                                mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                                break;
                            case 'xlsx':
                                mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                                break;
                            case 'txt':
                                mimeType = 'text/plain';
                                break;
                            default:
                                mimeType = 'application/octet-stream';
                        }

                        const blob = new Blob([fileData.content], { type: mimeType });
                        const url = URL.createObjectURL(blob);
                        
                        // Für PDF-Dateien öffnen wir sie direkt im Browser
                        if (fileExtension === 'pdf') {
                            window.open(url, '_blank');
                        } else {
                            // Für andere Dateitypen erstellen wir einen Download-Link
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = fileData.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url); // Bereinige den URL-Objekt
                        }
                    }
                };
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.xlsx,.txt';
    input.multiple = true;

    input.onchange = async (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            await processFiles(Array.from(files));
        }
    };

    input.click();
}

// Text aus der PDF extrahieren und speichern
async function extractTextFromFile(file) {
    const fileType = file.name.split('.').pop().toLowerCase();
    let text = [];

    try {
        switch (fileType) {
            case 'pdf':
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map(item => item.str).join(' ');
                    text.push({ pageNumber: i, text: pageText });
                }
                break;

            case 'docx':
                const docArrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer: docArrayBuffer });
                // Teile den Text in "Seiten" von je 3000 Zeichen
                const wordText = result.value;
                const pageSize = 3000;
                for (let i = 0; i < wordText.length; i += pageSize) {
                    const pageText = wordText.slice(i, i + pageSize);
                    text.push({ 
                        pageNumber: Math.floor(i / pageSize) + 1, 
                        text: pageText 
                    });
                }
                break;

            case 'xlsx':
            case 'xls':
            case 'xlsm':
                const excelArrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(excelArrayBuffer, { type: 'array' });
                
                workbook.SheetNames.forEach((sheetName, index) => {
                    const worksheet = workbook.Sheets[sheetName];
                    // Konvertiere das Worksheet in ein Array von Arrays
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    // Konvertiere die Daten in lesbaren Text
                    const sheetText = jsonData.map(row => {
                        // Filtere leere Zellen und konvertiere zu String
                        return row
                            .filter(cell => cell !== undefined && cell !== null)
                            .map(cell => cell.toString().trim())
                            .join(' ');
                    }).filter(line => line.length > 0).join('\n');

                    if (sheetText.trim()) {
                        text.push({ 
                            pageNumber: index + 1, 
                            text: `Tabellenblatt ${sheetName}:\n${sheetText}` 
                        });
                    }
                });
                break;

            case 'txt':
                const textContent = await file.text();
                // Teile den Text in "Seiten" von je 3000 Zeichen
                const txtPageSize = 3000;
                for (let i = 0; i < textContent.length; i += txtPageSize) {
                    const pageText = textContent.slice(i, i + txtPageSize);
                    text.push({ 
                        pageNumber: Math.floor(i / txtPageSize) + 1, 
                        text: pageText 
                    });
                }
                break;

            default:
                throw new Error('Nicht unterstütztes Dateiformat');
        }

        console.log('Extrahierter Text für Datei:', file.name, text);
        pdfTexts.push({ fileName: file.name, text: text });
        
    } catch (error) {
        console.error('Fehler beim Extrahieren des Texts:', error);
        alert(`Fehler beim Verarbeiten der Datei ${file.name}: ${error.message}`);
    }
}

// Event-Listener für Datei-Uploads
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', async (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            await processFiles(Array.from(files));
        }
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
        extractTextFromFile(file); // Extrahiere den Text aus der Datei
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
    console.log('Inhalt von pdfTexts:', pdfTexts);
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

    pdfTexts.forEach(({ fileName, text }) => {
        const occurrences = [];
        text.forEach((page, pageIndex) => {
            const pageText = page.text;
            keywords.forEach(keyword => {
                if (pageText.toLowerCase().includes(keyword)) {
                    // Find the sentence or context containing the keyword
                    const sentences = pageText.split(/[.!?]+/);
                    const matchingSentences = sentences.filter(sentence => 
                        sentence.toLowerCase().includes(keyword)
                    ).map(sentence => sentence.trim());

                    if (matchingSentences.length > 0) {
                        occurrences.push({
                            pageNumber: pageIndex + 1,
                            matchedKeywords: [keyword],
                            context: matchingSentences
                        });
                    }
                }
            });
        });
        
        if (occurrences.length > 0) {
            searchResults.push({ fileName, occurrences });
        }
    });

    console.log('Suchergebnisse:', searchResults);
    displayResults(searchResults);
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    results.forEach(({ fileName, occurrences }) => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result';

        // Dateiname anzeigen
        const fileNameHeader = document.createElement('h3');
        fileNameHeader.textContent = `Datei: ${fileName}`;
        resultDiv.appendChild(fileNameHeader);

        // Button zum Öffnen der Datei
        const openButton = document.createElement('button');
        openButton.textContent = 'Datei öffnen';
        openButton.onclick = () => openFileInExplorer(fileName);
        resultDiv.appendChild(openButton);

        // Ergebnisse für jede Seite anzeigen
        occurrences.forEach(({ pageNumber, matchedKeywords, context }) => {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page-result';
            
            const pageHeader = document.createElement('h4');
            pageHeader.textContent = `Seite ${pageNumber}:`;
            pageDiv.appendChild(pageHeader);

            context.forEach(sentence => {
                const p = document.createElement('p');
                // Highlight keywords in the context
                let highlightedText = sentence;
                matchedKeywords.forEach(keyword => {
                    const regex = new RegExp(keyword, 'gi');
                    highlightedText = highlightedText.replace(regex, match => 
                        `<span class="highlight">${match}</span>`
                    );
                });
                p.innerHTML = highlightedText;
                pageDiv.appendChild(p);
            });

            resultDiv.appendChild(pageDiv);
        });

        resultsDiv.appendChild(resultDiv);
    });

    if (results.length === 0) {
        resultsDiv.textContent = 'Keine Ergebnisse gefunden.';
    }
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

// Funktion zum Öffnen des Explorers mit der Datei
async function openFileInExplorer(fileName) {
    const transaction = db.transaction(['pdfFiles'], 'readonly');
    const objectStore = transaction.objectStore('pdfFiles');
    const request = objectStore.index('name').get(fileName);
    
    request.onsuccess = async function(event) {
        const fileData = event.target.result;
        if (fileData) {
            const fileExtension = fileName.split('.').pop().toLowerCase();
            
            // Temporäres Verzeichnis für die Datei erstellen
            const tempDir = config.tempDir;
            const filePath = `${tempDir}\\${fileName}`;
            
            // Blob mit korrektem MIME-Type erstellen
            let mimeType;
            switch (fileExtension) {
                case 'pdf':
                    mimeType = 'application/pdf';
                    break;
                case 'docx':
                case 'doc':
                    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                    break;
                case 'xlsx':
                case 'xls':
                    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    break;
                case 'txt':
                    mimeType = 'text/plain';
                    break;
                default:
                    mimeType = 'application/octet-stream';
            }
            
            const blob = new Blob([fileData.content], { type: mimeType });
            
            // Wenn es eine PDF ist, im Browser öffnen
            if (fileExtension === 'pdf') {
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                return;
            }

            // Für andere Dateitypen: Explorer öffnen
            try {
                // PowerShell-Befehle zum Erstellen des Verzeichnisses und Öffnen des Explorers
                const commands = [
                    `if (-not (Test-Path '${tempDir}')) { New-Item -ItemType Directory -Path '${tempDir}' -Force }`,
                    `$bytes = [System.Convert]::FromBase64String('${await blobToBase64(blob)}')`,
                    `[System.IO.File]::WriteAllBytes('${filePath}', $bytes)`,
                    `explorer.exe /select,"${filePath}"`
                ];
                
                const psScript = commands.join('; ');
                const encodedCommand = btoa(psScript);
                
                // PowerShell-Befehl ausführen
                await runCommand('powershell.exe', ['-EncodedCommand', encodedCommand]);
                
            } catch (error) {
                console.error('Fehler beim Öffnen des Explorers:', error);
                alert('Fehler beim Öffnen der Datei im Explorer. Die Datei wird stattdessen heruntergeladen.');
                
                // Fallback: Datei herunterladen
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        }
    };
}

// Hilfsfunktion zum Konvertieren eines Blobs in Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Funktion zum Filtern nach Dateityp
function filterByFileType() {
    const fileType = document.getElementById('fileTypeFilter').value;
    const resultsDiv = document.getElementById('results');
    const resultDivs = resultsDiv.getElementsByClassName('result');
    
    Array.from(resultDivs).forEach(div => {
        const fileName = div.querySelector('h3').textContent.split(': ')[1];
        const extension = fileName.split('.').pop().toLowerCase();
        
        let show = false;
        switch (fileType) {
            case 'all':
                show = true;
                break;
            case 'pdf':
                show = extension === 'pdf';
                break;
            case 'word':
                show = ['doc', 'docx'].includes(extension);
                break;
            case 'excel':
                show = ['xls', 'xlsx', 'xlsm'].includes(extension);
                break;
            case 'text':
                show = ['txt', 'rtf'].includes(extension);
                break;
        }
        
        div.style.display = show ? 'block' : 'none';
    });
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
    URL.revokeObjectURL(url);
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

// Update file input to accept new file types
document.getElementById('fileInput').accept = '.pdf,.docx,.xlsx,.txt';

// Dateiverarbeitung mit Fortschrittsanzeige
async function processFiles(files) {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const currentFileName = document.getElementById('currentFileName');
    const progressStatus = document.getElementById('progressStatus');
    const timeEstimate = document.getElementById('timeEstimate');
    
    progressContainer.style.display = 'block';
    const totalFiles = files.length;
    let processedFiles = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        currentFileName.textContent = `Verarbeite: ${file.name}`;
        progressStatus.textContent = `${i + 1}/${totalFiles} Dateien`;
        
        // Berechne geschätzte Restzeit
        if (i > 0) {
            const elapsed = Date.now() - startTime;
            const averageTimePerFile = elapsed / i;
            const remainingFiles = totalFiles - i;
            const estimatedRemaining = Math.round((averageTimePerFile * remainingFiles) / 1000);
            timeEstimate.textContent = `Geschätzte Restzeit: ${estimatedRemaining} Sekunden`;
        }
        
        // Aktualisiere Fortschrittsbalken
        const progress = ((i + 1) / totalFiles) * 100;
        progressBar.style.width = `${progress}%`;
        
        try {
            await saveFileToDB(file);
            processedFiles++;
        } catch (error) {
            console.error(`Fehler beim Verarbeiten von ${file.name}:`, error);
            logError(file.name, error);
        }
    }
    
    // Verstecke Fortschrittsbalken und aktualisiere die Anzeige
    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        loadFileList();
    }, 1000);
}

// Error Logging System
function logError(filename, error) {
    const errorLog = {
        filename: filename,
        timestamp: new Date().toISOString(),
        message: error.toString(),
        stack: error.stack || '',
        additionalInfo: error.additionalInfo || ''
    };
    errorLogs.push(errorLog);
    updateErrorLogsList();
    saveErrorLogs();
}

function updateErrorLogsList() {
    const errorLogsList = document.getElementById('errorLogsList');
    errorLogsList.innerHTML = '';
    
    errorLogs.forEach((log, index) => {
        const logElement = document.createElement('div');
        logElement.className = 'error-log-item';
        
        const date = new Date(log.timestamp);
        const formattedDate = date.toLocaleString('de-DE');
        
        logElement.innerHTML = `
            <div class="error-log-header">
                <span class="error-log-filename">${log.filename}</span>
                <span class="error-log-timestamp">${formattedDate}</span>
            </div>
            <div class="error-log-message">${log.message}${log.stack ? '\n\nStack Trace:\n' + log.stack : ''}</div>
        `;
        
        errorLogsList.appendChild(logElement);
    });
}

function saveErrorLogs() {
    localStorage.setItem('errorLogs', JSON.stringify(errorLogs));
}

function loadErrorLogs() {
    const savedLogs = localStorage.getItem('errorLogs');
    if (savedLogs) {
        errorLogs = JSON.parse(savedLogs);
        updateErrorLogsList();
    }
}

function clearErrorLogs() {
    if (confirm('Möchten Sie wirklich alle Fehler-Logs löschen?')) {
        errorLogs = [];
        localStorage.removeItem('errorLogs');
        updateErrorLogsList();
    }
}

function downloadErrorLogs() {
    const logsText = errorLogs.map(log => {
        return `Datei: ${log.filename}\nZeitpunkt: ${new Date(log.timestamp).toLocaleString('de-DE')}\nFehler: ${log.message}\n${log.stack ? 'Stack Trace:\n' + log.stack : ''}\n${'-'.repeat(80)}`;
    }).join('\n\n');
    
    const blob = new Blob([logsText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fehler-logs_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Aktualisiere die showSection Funktion
function showSection(sectionId) {
    // Verstecke alle Sections
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Zeige die gewählte Section
    document.getElementById(sectionId).style.display = 'block';
}

// Lade die Error-Logs beim Start
document.addEventListener('DOMContentLoaded', () => {
    loadErrorLogs();
    // ... andere DOMContentLoaded Event Listener ...
});