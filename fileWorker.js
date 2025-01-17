// Bibliotheken importieren
importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.15.349/pdf.min.js',
    'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js',
    'https://unpkg.com/xlsx/dist/xlsx.full.min.js'
);

// PDF.js Worker konfigurieren
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.15.349/pdf.worker.min.js';

// Dateityp ermitteln
function getFileType(filename) {
    const extension = filename.toLowerCase().split('.').pop();
    const excelExtensions = ['xlsx', 'xls', 'xlsm', 'xlsb'];
    const wordExtensions = ['docx', 'doc'];
    
    if (excelExtensions.includes(extension)) return 'excel';
    if (wordExtensions.includes(extension)) return 'word';
    if (extension === 'pdf') return 'pdf';
    return 'text';
}

// MIME-Typ ermitteln
function getMimeType(filename) {
    const extension = filename.toLowerCase().split('.').pop();
    const mimeTypes = {
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
        'xlsb': 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc': 'application/msword',
        'pdf': 'application/pdf',
        'txt': 'text/plain'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

// PDF-Datei verarbeiten
async function processPdfFile(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let text = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        text += textContent.items.map(item => item.str).join(' ') + '\n';
        
        // Fortschritt melden
        self.postMessage({ 
            progress: Math.round((i / pdf.numPages) * 100),
            currentPage: i,
            totalPages: pdf.numPages
        });
    }
    
    return {
        text: text,
        originalBuffer: arrayBuffer // Speichere den Original-Buffer für späteres Herunterladen
    };
}

// Text-Datei verarbeiten
async function processTextFile(file) {
    const text = await file.text();
    return text;
}

// Word-Datei verarbeiten
async function processWordFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return {
        text: result.value,
        originalBuffer: arrayBuffer // Speichere den Original-Buffer für späteres Herunterladen
    };
}

// Excel-Datei verarbeiten
async function processExcelFile(arrayBuffer) {
    try {
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        let text = '';
        
        workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            // Konvertiere das Sheet in eine lesbare Form
            const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
            
            if (sheetData && sheetData.length > 0) {
                text += `[Sheet: ${sheetName}]\n`;
                // Verarbeite jede Zeile
                sheetData.forEach(row => {
                    if (row && row.length > 0) {
                        // Filtere leere Zellen und füge die Zeile hinzu
                        const cleanRow = row.map(cell => cell || '').join('\t');
                        if (cleanRow.trim()) {
                            text += cleanRow + '\n';
                        }
                    }
                });
                text += '\n';
            }
        });
        
        return {
            text: text,
            originalBuffer: arrayBuffer // Speichere den Original-Buffer für späteres Herunterladen
        };
    } catch (error) {
        console.error('Fehler bei der Excel-Verarbeitung:', error);
        throw error;
    }
}

// Datei verarbeiten
async function processFile(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileType = getFileType(file.name);
        let content = null;
        let searchableContent = '';

        switch (fileType) {
            case 'pdf':
                const pdfResult = await processPdfFile(arrayBuffer);
                searchableContent = pdfResult.text;
                content = pdfResult.originalBuffer; // Original PDF-Buffer behalten
                break;
            case 'excel':
                const excelResult = await processExcelFile(arrayBuffer);
                searchableContent = excelResult.text;
                content = excelResult.originalBuffer;
                break;
            case 'word':
                const wordResult = await processWordFile(file);
                searchableContent = wordResult.text;
                content = wordResult.originalBuffer;
                break;
            case 'text':
                searchableContent = await processTextFile(file);
                content = arrayBuffer;
                break;
            default:
                throw new Error('Nicht unterstütztes Dateiformat');
        }

        return {
            id: Date.now(),
            name: file.name,
            type: fileType,
            mimeType: getMimeType(file.name),
            content: content, // Original-Dateiinhalt für Download
            searchableContent: searchableContent, // Text für die Suche
            size: file.size,
            lastModified: file.lastModified
        };
    } catch (error) {
        console.error('Fehler bei der Dateiverarbeitung:', error);
        throw error;
    }
}

// Datei zum Download vorbereiten
function prepareFileForDownload(fileData) {
    try {
        const blob = new Blob([fileData.content], { type: fileData.mimeType });
        return {
            blob: blob,
            filename: fileData.name
        };
    } catch (error) {
        console.error('Fehler beim Vorbereiten der Datei zum Download:', error);
        throw error;
    }
}

// Hauptnachrichtenverarbeitung
self.onmessage = async function(e) {
    const { file } = e.data;
    
    try {
        const result = await processFile(file);
        self.postMessage({ success: true, result });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
