# Stichwortsuche

Eine Webanwendung zur Durchsuchung von PDF-, Word-, Excel- und Text-Dokumenten nach Stichworten.

## Installation

1. Kopieren Sie den gesamten `Stichwortsuche`-Ordner auf Ihren Computer
2. Stellen Sie sicher, dass Sie einen modernen Webbrowser installiert haben (Chrome, Firefox, Edge)

## Erste Schritte

1. Öffnen Sie die `index.html` Datei in Ihrem Browser
2. Klicken Sie auf "Dateien auswählen" um Dokumente zu importieren
3. Nutzen Sie die Suchfunktion um nach Stichworten zu suchen

## Systemanforderungen

- Moderner Webbrowser (Chrome, Firefox, Edge)
- Mindestens 4GB RAM für große Dokumente
- Etwa 100MB freier Speicherplatz für temporäre Dateien

## Funktionen

- Durchsuchen von PDF, Word (.docx), Excel (.xlsx) und Text (.txt) Dateien
- Anzeige des Kontexts um gefundene Suchbegriffe
- Filterung nach Dateitypen
- Fehler-Logs für die Problemanalyse
- Export von Suchergebnissen

## Temporäre Dateien

Die Anwendung verwendet standardmäßig das Verzeichnis `C:\temp\Stichwortsuche` für temporäre Dateien. 
Wenn dieses Verzeichnis nicht verfügbar ist, wird automatisch ein `temp`-Ordner im Programmverzeichnis erstellt.

## Bekannte Einschränkungen

- Maximale Dateigröße: 100 MB
- PDF-Dateien müssen Text enthalten (keine gescannten Dokumente ohne OCR)
- Verschlüsselte Dokumente werden nicht unterstützt

## Fehlerbehebung

1. Wenn Dateien nicht geöffnet werden können:
   - Prüfen Sie, ob Sie Schreibrechte im Temp-Verzeichnis haben
   - Stellen Sie sicher, dass die Datei nicht beschädigt ist
   - Überprüfen Sie die Fehler-Logs unter dem Menüpunkt "Fehler-Logs"

2. Bei Problemen mit Excel-Dateien:
   - Stellen Sie sicher, dass die Datei nicht passwortgeschützt ist
   - Speichern Sie die Datei im .xlsx-Format

## Support

Bei Problemen können Sie:
1. Die Fehler-Logs überprüfen
2. Die Logs herunterladen und zur Analyse bereitstellen
3. Sicherstellen, dass alle Dateien korrekt kopiert wurden
