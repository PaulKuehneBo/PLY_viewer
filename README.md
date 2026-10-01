# Posed Camera

VS-Code-Erweiterung zum Anzeigen von ASCII-PLY-Punktwolken und einfachen Meshes in einem Webview.

## Implementierter Stand

- Beim Öffnen einer `.ply`-Datei wird die Erweiterung über die Sprache `ply` aktiviert und öffnet den Viewer automatisch.
- Der Befehl **Open Posed Camera PLY Viewer** öffnet alternativ einen Dateiauswahldialog.
- Der Viewer zeichnet direkt auf einen 2D-Canvas. Punktwolken werden in einem gepufferten Pixelbild gerendert; Flächen werden als Dreiecke gezeichnet und nach Tiefe sortiert.
- Die Geometrie wird in der aktuellen Projektion auf den Weltursprung ausgerichtet. Die Kameraposition rotiert um den Ursprung und schaut weiterhin auf ihn.
- `4`/`6` drehen um die momentane lokale Up-Achse, `8`/`2` um die momentane lokale Rechtsachse. Die Tasten des Nummernblocks werden ebenfalls erkannt. Ein Tastenschritt entspricht derzeit 5 Grad.
- Eingabe, Kameravektoren, Rotationsmathematik und Rendering liegen im sourcemap-fähigen Webview-TypeScript.
- Es gibt derzeit keine Interaktion mit Maus, Zoom oder Perspektivprojektion.

## Aufbau

- `src/extension.ts` aktiviert die Erweiterung, registriert den Dateiauswahlbefehl und öffnet den Webview.
- `src/plyParser.ts` liest Vertices und optionale RGB-Farben sowie Face-Indizes aus einer PLY-Datei.
- `src/buildViewerHtml.ts` erstellt das Webview-HTML, setzt die Content Security Policy und übergibt die PLY-Daten an den Browser-Code.
- `src/webview/index.ts` enthält die Canvas-Darstellung, die Kamerasteuerung und die Projektion.
- `out/` enthält die von TypeScript erzeugten Dateien. `out/webview/` enthält das Webview-JavaScript und die Sourcemaps.
- `src/generate_ply_point_cloud.py` erzeugt Beispieldaten; die Datei enthält derzeit keine Kamerasteuerung oder Rotationsmatrix.

## PLY-Unterstützung und Grenzen

Der Parser ist auf zeilenbasiertes ASCII-PLY im aktuell erwarteten Layout ausgelegt: zuerst Vertex-Zeilen mit `x y z` und optional drei darauf folgende Farbwerte, danach Face-Zeilen mit Anzahl und Vertex-Indizes. Die `property`-Deklarationen werden nicht ausgewertet. Binäre PLY-Dateien, abweichende Property-Reihenfolgen und zusätzliche Datenelemente zwischen Vertices und Faces werden nicht zuverlässig unterstützt.

Faces mit mehr als drei Punkten werden im Viewer als Dreiecksfächer zerlegt. Die Tiefensortierung ist ein einfacher Painter-Algorithmus, kein Z-Buffer; komplexe oder sich überschneidende Meshes können deshalb Darstellungsartefakte zeigen. Pro Erweiterungsinstanz wird nur ein Viewer-Panel verwaltet; beim Öffnen einer weiteren PLY-Datei wird das vorherige Panel ersetzt.

## Paket und Befehle

Die zentralen Angaben in `package.json`:

- Erweiterungs-ID: `local.posed-camera`, Version `0.0.1`; benötigt VS Code `^1.90.0` oder neuer.
- Einstiegspunkt: `out/extension.js`.
- Die Sprache `ply` ist `.ply`-Dateien zugeordnet; `onLanguage:ply` aktiviert die Erweiterung beim Öffnen solcher Dokumente.
- Der registrierte Befehl `posed-camera.openWebview` zeigt den Dateiauswahldialog.
- `npm run compile` kompiliert Extension Host und Webview. `npm run watch` und `npm run watch:webview` starten die jeweiligen Watcher; `npm run watch:all` startet beide.
- Sourcemaps sind in beiden TypeScript-Konfigurationen eingeschaltet. `lint` ist derzeit nur ein Platzhalter und führt keinen Linter aus.
- TypeScript, `@types/vscode`, `@types/node` und `concurrently` sind Entwicklungsabhängigkeiten; es gibt keine Laufzeitabhängigkeit wie Three.js.

## Start und Entwicklung

1. Abhängigkeiten installieren: `npm install`.
2. Bauen: `npm run compile`.
3. In VS Code **Run Extension** mit F5 starten. Die Launch-Konfiguration kompiliert vorab über `npm: compile`.
4. Im Extension Development Host eine `.ply`-Datei öffnen. Alternativ den Befehl **Open Posed Camera PLY Viewer** aus der Befehlspalette aufrufen.

Die Debug-Konfiguration in `.vscode/launch.json` verwendet `--new-window`, `--disable-extensions` sowie separate `--user-data-dir`- und `--extensions-dir`-Pfade unter `.vscode-test/`. Der Entwicklungspfad dieser Erweiterung wird weiterhin über `--extensionDevelopmentPath` geladen.

## Besprochene Probleme und aktueller Workaround

- **Extension Host schließt sofort:** Der Host wurde trotz deaktivierter installierter Erweiterungen als sofort endend beobachtet. Die genaue Ursache ist noch nicht nachgewiesen. Der aktuelle Workaround isoliert User-Daten und Erweiterungsverzeichnis, fordert ein neues Fenster an und deaktiviert regulär installierte Erweiterungen. Das ist eine Debug-Isolation, keine bestätigte Behebung eines möglichen Host-Absturzes. Bei erneutem Auftreten sind **Log (Extension Host)** und **Debug Console** die nächsten Diagnosequellen.
- **Langsame Tastenreaktion:** Viele einzelne Canvas-Kreisoperationen wurden für Punktwolken durch vorberechnete Vertex-Puffer und `ImageData` ersetzt. Tastendrücke lösen ein `requestAnimationFrame` aus; es gibt keine zusätzliche Timer-Totzeit. Große Meshes können durch die erneute Dreiecks-Tiefensortierung weiterhin langsamer reagieren.
- **Rotation um falsche Achsen:** Die Steuerung verwendet jetzt den fortgeschriebenen Kamerastand. Die lokale Rechts- und Up-Achse werden aus der aktuellen Blickrichtung berechnet, sodass folgende Drehungen relativ zur bereits gedrehten Kamera erfolgen.
