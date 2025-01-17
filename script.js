// Globale Variablen
let db;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Initialisiere die Anwendung
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        setupEventListeners();
        showSection('homeSection');
        await loadFileList();
    } catch (error) {
        logError('Anwendungsstart', error);
    }
});

// Datenbank-Funktionen
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('DocumentDB', 1);

        request.onerror = (event) => {
            const error = new Error('Datenbankfehler: ' + event.target.error);
            logError('Datenbankinitialisierung', error);
            reject(error);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('documents')) {
                const store = db.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
                store.createIndex('filename', 'filename', { unique: true });
                store.createIndex('type', 'type', { unique: false });
                store.createIndex('content', 'content', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Datenbank erfolgreich initialisiert');
            resolve(db);
        };
    });
}

// Event Listener Setup
function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');

    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startSearch();
            }
        });
    }
}

// Datei-Upload-Funktionen
async function handleFileUpload(event) {
    const files = event.target.files;
    const progressContainer = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBarFill');
    const currentFileSpan = document.getElementById('currentFile');
    const progressStatus = document.getElementById('progressStatus');

    progressContainer.style.display = 'block';
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            currentFileSpan.textContent = `Verarbeite: ${file.name}`;
            progressBar.style.width = `${(i / files.length) * 100}%`;
            progressStatus.textContent = `${i + 1} von ${files.length} Dateien`;

            const content = await extractTextFromFile(file);
            await saveToDatabase({
                filename: file.name,
                type: getFileType(file),
                content: content,
                size: file.size,
                lastModified: file.lastModified
            });

            console.log(`Datei erfolgreich verarbeitet: ${file.name}`);
        } catch (error) {
            logError('Dateiupload', error, file.name);
        }
    }

    progressBar.style.width = '100%';
    progressStatus.textContent = 'Upload abgeschlossen';
    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0';
    }, 2000);

    await loadFileList();
    event.target.value = '';
}

// Textextraktion aus verschiedenen Dateitypen
async function extractTextFromFile(file) {
    const type = getFileType(file);
    let text = [];

    try {
        const arrayBuffer = await readFileAsArrayBuffer(file);

        switch (type) {
            case 'pdf':
                try {
                    // PDF Extraktion mit korrekter Worker-Konfiguration
                    const pdfData = new Uint8Array(arrayBuffer);
                    const loadingTask = pdfjsLib.getDocument({
                        data: pdfData,
                        useWorkerFetch: false,
                        isEvalSupported: true,
                        useSystemFonts: true
                    });
                    
                    const pdf = await loadingTask.promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent({
                            normalizeWhitespace: true,
                            disableCombineTextItems: false
                        });
                        const pageText = content.items.map(item => item.str).join(' ');
                        text.push({ 
                            pageNumber: i, 
                            text: pageText.trim() 
                        });
                    }
                } catch (pdfError) {
                    console.error('Detaillierter PDF Fehler:', pdfError);
                    throw new Error(`PDF-Extraktion fehlgeschlagen: ${pdfError.message}`);
                }
                break;

            case 'docx':
                try {
                    // Word Extraktion mit JSZip
                    const zip = new JSZip();
                    await zip.loadAsync(arrayBuffer);
                    
                    // Überprüfe ob es sich um ein gültiges DOCX handelt
                    const contentTypes = await zip.file('[Content_Types].xml');
                    if (!contentTypes) {
                        throw new Error('Ungültiges DOCX Format');
                    }
                    
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    const wordText = result.value;
                    const pageSize = 3000;
                    
                    // Teile den Text in "Seiten"
                    for (let i = 0; i < wordText.length; i += pageSize) {
                        const pageText = wordText.slice(i, i + pageSize);
                        text.push({ 
                            pageNumber: Math.floor(i / pageSize) + 1, 
                            text: pageText.trim() 
                        });
                    }
                } catch (docxError) {
                    console.error('Detaillierter DOCX Fehler:', docxError);
                    throw new Error(`DOCX-Extraktion fehlgeschlagen: ${docxError.message}`);
                }
                break;

            case 'xlsx':
            case 'xls':
            case 'xlsm':
                // Excel Extraktion
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                workbook.SheetNames.forEach((sheetName, index) => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    const sheetText = jsonData
                        .filter(row => row && row.length > 0)
                        .map(row => {
                            return row
                                .filter(cell => cell !== undefined && cell !== null)
                                .map(cell => cell.toString().trim())
                                .join('\t');
                        })
                        .join('\n');

                    if (sheetText.trim()) {
                        text.push({ 
                            pageNumber: index + 1, 
                            text: `Tabellenblatt ${sheetName}:\n${sheetText}`.trim()
                        });
                    }
                });
                break;

            case 'txt':
                const textContent = await readFileAsText(file);
                const txtPageSize = 3000;
                for (let i = 0; i < textContent.length; i += txtPageSize) {
                    const pageText = textContent.slice(i, i + txtPageSize);
                    text.push({ 
                        pageNumber: Math.floor(i / txtPageSize) + 1, 
                        text: pageText.trim() 
                    });
                }
                break;

            default:
                throw new Error('Nicht unterstütztes Dateiformat');
        }

        return text;
    } catch (error) {
        console.error(`Fehler bei ${type.toUpperCase()} Extraktion:`, error);
        throw error;
    }
}

// Hilfsfunktionen für Datei-Operationen
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'));
        reader.readAsArrayBuffer(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'));
        reader.readAsText(file);
    });
}

// Datenbank-Operationen
async function saveToDatabase(document) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');

        const request = store.add(document);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Fehler beim Speichern in der Datenbank'));
    });
}

async function loadFileList() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.getAll();

        request.onsuccess = () => {
            const files = request.result;
            displayFileList(files);
            resolve(files);
        };

        request.onerror = () => reject(new Error('Fehler beim Laden der Dateiliste'));
    });
}

// Datei aus der Datenbank löschen
async function deleteFile(index) {
    try {
        const transaction = db.transaction(['documents'], 'readwrite');
        const objectStore = transaction.objectStore('documents');
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
                    console.error('Fehler beim Löschen der Datei:', event.target.error);
                    logError(fileToDelete.filename, new Error('Fehler beim Löschen der Datei: ' + event.target.error));
                };
            }
        };

        request.onerror = function(event) {
            console.error('Fehler beim Abrufen der Dateien:', event.target.error);
            throw new Error('Fehler beim Abrufen der Dateien: ' + event.target.error);
        };
    } catch (error) {
        console.error('Fehler beim Löschen der Datei:', error);
        logError('Unbekannte Datei', error);
    }
}

// UI-Funktionen
function displayFileList(files) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;

    fileList.innerHTML = '';
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-name';
        fileInfo.textContent = `${file.filename} (${formatFileSize(file.size)})`;
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'danger-button';
        deleteButton.innerHTML = '<span class="icon">🗑️</span>';
        deleteButton.onclick = () => deleteFile(file.id);

        fileItem.appendChild(fileInfo);
        fileItem.appendChild(deleteButton);
        fileList.appendChild(fileItem);
    });
}

// Suchfunktionen
async function startSearch() {
    const searchInput = document.getElementById('searchInput');
    const fileTypeFilter = document.getElementById('fileTypeFilter');
    const searchResults = document.getElementById('searchResults');

    if (!searchInput || !searchResults) return;

    const searchTerms = searchInput.value.toLowerCase().split(',').map(term => term.trim());
    const fileType = fileTypeFilter ? fileTypeFilter.value : 'all';

    if (searchTerms.length === 0 || searchTerms[0] === '') {
        searchResults.innerHTML = '<p>Bitte geben Sie einen Suchbegriff ein.</p>';
        return;
    }

    try {
        const results = await searchInDatabase(searchTerms, fileType);
        displaySearchResults(results, searchTerms);
    } catch (error) {
        logError('Suche', error);
        searchResults.innerHTML = '<p>Ein Fehler ist bei der Suche aufgetreten.</p>';
    }
}

async function searchInDatabase(searchTerms, fileType) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.getAll();

        request.onsuccess = () => {
            const files = request.result;
            const results = files
                .filter(file => fileType === 'all' || file.type === fileType)
                .map(file => {
                    const matches = findMatches(file.content, searchTerms);
                    return matches.length > 0 ? { ...file, matches } : null;
                })
                .filter(result => result !== null);
            resolve(results);
        };

        request.onerror = () => reject(new Error('Fehler bei der Datenbankabfrage'));
    });
}

function findMatches(content, searchTerms) {
    const matches = [];
    const lines = content.split('\n');
    
    lines.forEach((line, lineNumber) => {
        const lowerLine = line.toLowerCase();
        searchTerms.forEach(term => {
            if (lowerLine.includes(term)) {
                matches.push({
                    line: line.trim(),
                    lineNumber: lineNumber + 1,
                    term: term
                });
            }
        });
    });

    return matches;
}

function displaySearchResults(results, searchTerms) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    if (results.length === 0) {
        searchResults.innerHTML = '<p>Keine Ergebnisse gefunden.</p>';
        return;
    }

    let html = '';
    results.forEach(file => {
        html += `
            <div class="result-item">
                <h3>${file.filename}</h3>
                <div class="matches">
                    ${file.matches.map(match => `
                        <div class="match">
                            <span class="line-number">Zeile ${match.lineNumber}:</span>
                            <span class="line-content">${highlightSearchTerm(match.line, match.term)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    searchResults.innerHTML = html;
}

// Hilfsfunktionen
function getFileType(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const supportedTypes = {
        'pdf': 'pdf',
        'docx': 'docx',
        'xlsx': 'xlsx',
        'txt': 'txt'
    };
    return supportedTypes[extension] || 'unknown';
}

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function highlightSearchTerm(text, term) {
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function showSection(sectionId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });

    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
        selectedSection.style.display = 'block';
        selectedSection.classList.add('active');
    }

    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick')?.includes(sectionId)) {
            item.classList.add('active');
        }
    });
}

// Fehlerbehandlung
function logError(context, error, filename = '') {
    const errorMessage = `[${new Date().toISOString()}] ${context}: ${error.message} ${filename ? `(Datei: ${filename})` : ''}`;
    console.error(errorMessage);
    
    const logEntries = document.getElementById('logEntries');
    if (logEntries) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'log-entry error';
        errorDiv.textContent = errorMessage;
        logEntries.insertBefore(errorDiv, logEntries.firstChild);
    }
}

// Export-Funktionen
function exportResults() {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults || !searchResults.innerHTML.trim()) {
        alert('Keine Ergebnisse zum Exportieren vorhanden.');
        return;
    }

    const results = Array.from(searchResults.querySelectorAll('.result-item')).map(item => {
        const filename = item.querySelector('h3').textContent;
        const matches = Array.from(item.querySelectorAll('.match')).map(match => {
            const lineNumber = match.querySelector('.line-number').textContent;
            const content = match.querySelector('.line-content').textContent;
            return `${lineNumber}\n${content}`;
        }).join('\n\n');
        return `Datei: ${filename}\n\n${matches}`;
    }).join('\n\n---\n\n');

    const blob = new Blob([results], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suchergebnisse_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Datenbank-Reset
async function resetDatabase() {
    if (!confirm('Möchten Sie wirklich alle Dateien aus der Datenbank löschen?')) {
        return;
    }

    try {
        const transaction = db.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        await store.clear();
        console.log('Datenbank erfolgreich zurückgesetzt');
        await loadFileList();
    } catch (error) {
        logError('Datenbank-Reset', error);
    }
}

// Protokoll-Funktionen
function clearLogs() {
    const logEntries = document.getElementById('logEntries');
    if (logEntries) {
        logEntries.innerHTML = '';
    }
}

function downloadLogs() {
    const logEntries = document.getElementById('logEntries');
    if (!logEntries || !logEntries.innerHTML.trim()) {
        alert('Keine Protokolleinträge vorhanden.');
        return;
    }

    const logs = Array.from(logEntries.querySelectorAll('.log-entry'))
        .map(entry => entry.textContent)
        .join('\n');

    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protokoll_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}