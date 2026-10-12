# Posed Camera

VS-Code-Erweiterung zum Anzeigen von PLY-Punktwolken und Meshes in einem Webview mit Three.js und WebGL.

## Implementierter Stand

- Beim Öffnen einer `.ply`-Datei wird die Erweiterung über die Sprache `ply` aktiviert und öffnet den Viewer automatisch.
- Der Befehl **Open Posed Camera PLY Viewer** öffnet alternativ einen Dateiauswahldialog.
- Three.js rendert mit `WebGLRenderer`, PerspectiveCamera, GPU-Tiefenpuffer und auf zwei begrenzter Display-Pixel-Dichte.
- `PLYLoader` lädt die Originaldatei im Webview; der Extension Host serialisiert nicht mehr alle Vertices und Faces als JSON.
- Punktwolken werden als `Points`, Meshes als `MeshStandardMaterial` gerendert. Vertex- und Face-RGB-Farben werden als Three.js-Farbattribute übernommen; vorhandene Normalen werden genutzt, andernfalls für Meshes berechnet.
- Die Kamerasteuerung bleibt eigene sourcemap-fähige TypeScript-Logik und verwendet kein `OrbitControls`. Die Kamera rotiert um den Ursprung und blickt weiterhin auf ihn.
- `4`/`6` drehen um die aktuelle lokale Up-Achse, `8`/`2` um die aktuelle lokale Rechtsachse. Die Nummernblock-Tasten funktionieren ebenfalls; pro Tastenschritt sind es 5 Grad.
- Ziehen mit der linken Maustaste dreht die Kamera ebenfalls. Das WebGL-Canvas erhält den Fokus für Tastatureingaben.

## Aufbau

- `src/extension.ts` aktiviert die Erweiterung, registriert den Dateiauswahlbefehl und öffnet den Webview.
- Der Extension Host übergibt die PLY-URI; der Webview lädt die Datei direkt mit `PLYLoader`.
- `src/plyParser.ts` ist der frühere zeilenbasierte ASCII-Parser und wird vom aktuellen Viewer nicht mehr verwendet.
- `src/buildViewerHtml.ts` erstellt das Webview-HTML, setzt die Content Security Policy und Import Map für Three.js sowie die PLY-Datei-URL.
- `src/webview/index.ts` enthält `PLYLoader`, WebGL-Szene, PerspectiveCamera sowie die eigene Tastatur- und Pointer-Steuerung.
- `out/` enthält die von TypeScript erzeugten Dateien. `out/webview/` enthält das Webview-JavaScript und die Sourcemaps.
- `src/generate_ply_point_cloud.py` erzeugt Beispieldaten; die Datei enthält derzeit keine Kamerasteuerung oder Rotationsmatrix.

## PLY-Unterstützung und Grenzen

Der aktive `PLYLoader` unterstützt ASCII- und binäre PLY-Geometrie sowie gängige Position-, Normalen-, UV- und RGB-Properties. Standardmäßige Vertex- und Face-Farben werden dargestellt. Zusätzliche, nicht standardisierte Properties müssen gegebenenfalls über `setPropertyNameMapping` abgebildet werden.

PLY definiert kein breit unterstütztes Materialsystem wie glTF. Three.js-`PLYLoader` übernimmt Geometrie, Farben, Normalen und UVs, aber keine portablen PBR-Materialien, Texturdateien oder allgemeinen `material_index`-Zuordnungen. Der Viewer verwendet deshalb ein `MeshStandardMaterial` mit Vertexfarben, wenn Farbattribute existieren, sonst ein türkisfarbenes Standardmaterial. Texturen oder materialspezifische Parameter aus proprietären PLY-Properties sind nicht automatisch umgesetzt.

Pro Erweiterungsinstanz wird nur ein Viewer-Panel verwaltet; beim Öffnen einer weiteren PLY-Datei wird das vorherige Panel ersetzt. Die PLY-Daten werden im Webview auf dem Hauptthread geparst. Sehr große Dateien können deshalb noch eine Ladepause verursachen; ein Web Worker wäre eine mögliche spätere Optimierung.

## Paket und Befehle

Die zentralen Angaben in `package.json`:

- Erweiterungs-ID: `local.posed-camera`, Version `0.0.1`; benötigt VS Code `^1.90.0` oder neuer.
- Einstiegspunkt: `out/extension.js`.
- Die Sprache `ply` ist `.ply`-Dateien zugeordnet; `onLanguage:ply` aktiviert die Erweiterung beim Öffnen solcher Dokumente.
- Der registrierte Befehl `posed-camera.openWebview` zeigt den Dateiauswahldialog.
- `npm run compile` kompiliert Extension Host und Webview. `npm run watch` und `npm run watch:webview` starten die jeweiligen Watcher; `npm run watch:all` startet beide.
- Sourcemaps sind in beiden TypeScript-Konfigurationen eingeschaltet. `lint` ist derzeit nur ein Platzhalter und führt keinen Linter aus.
- Three.js ist eine Laufzeitabhängigkeit; `@types/three`, TypeScript, `@types/vscode`, `@types/node` und `concurrently` sind Entwicklungsabhängigkeiten.

## Start und Entwicklung

1. Abhängigkeiten installieren: `npm install`.
2. Bauen: `npm run compile`.
3. In VS Code **Run Extension** mit F5 starten. Die Launch-Konfiguration kompiliert vorab über `npm: compile`.
4. Im Extension Development Host eine `.ply`-Datei öffnen. Alternativ den Befehl **Open Posed Camera PLY Viewer** aus der Befehlspalette aufrufen.

Die Debug-Konfiguration in `.vscode/launch.json` verwendet `--new-window`, `--disable-extensions` sowie separate `--user-data-dir`- und `--extensions-dir`-Pfade unter `.vscode-test/`. Der Entwicklungspfad dieser Erweiterung wird weiterhin über `--extensionDevelopmentPath` geladen.

## Standalone in Edge

Der Harness `webgl-harness.html` kann unabhängig vom Extension Host im Browser laufen. Wegen der ES-Module und Import Map sollte die HTML-Datei nicht direkt über `file://` geöffnet werden.

1. Im Extension-Projekt `npm run compile` ausführen.
2. Im Projektordner einen lokalen Server starten: `python -m http.server 4179 --bind 127.0.0.1`.
3. In Edge `http://127.0.0.1:4179/webgl-harness.html` öffnen.
4. **PLY-Datei öffnen** wählen und eine lokale `.ply`-Datei auswählen. Die Datei wird nur lokal im Browser gelesen und nicht hochgeladen.

Der Harness startet ohne fest ausgewählte Datei. Die Extension-Webview kann weiterhin eine beim Öffnen übergebene PLY-Datei direkt laden; beide Varianten teilen sich denselben WebGL-Renderer und dieselben Kamera-Controls.

## Besprochene Probleme und aktueller Workaround

- **Extension Host schließt sofort:** Der Host wurde trotz deaktivierter installierter Erweiterungen als sofort endend beobachtet. Die genaue Ursache ist noch nicht nachgewiesen. Der aktuelle Workaround isoliert User-Daten und Erweiterungsverzeichnis, fordert ein neues Fenster an und deaktiviert regulär installierte Erweiterungen. Das ist eine Debug-Isolation, keine bestätigte Behebung eines möglichen Host-Absturzes. Bei erneutem Auftreten sind **Log (Extension Host)** und **Debug Console** die nächsten Diagnosequellen.

## Installation der extension

code --install-extension .\posed-camera.vsix