import * as vscode from "vscode";

import type { ParsedPly } from "./plyParser";

export function buildPlyViewerHtml(
  webview: vscode.Webview,
  parsed: ParsedPly,
  extensionUri: vscode.Uri,
): string {
  console.log(
    "[Posed Camera] Building PLY viewer HTML for",
    parsed.vertices.length,
    "vertices and",
    parsed.faces.length,
    "faces",
  );
  const nonce = createNonce();
  const bundleUri = webview
    .asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "out", "webview", "index.js"),
    )
    .toString();
  const modelData = JSON.stringify({
    vertices: parsed.vertices,
    faces: parsed.faces,
  });

  if (!parsed.vertices.length) {
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Posed Camera PLY Viewer</title>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource};">
				<style>body { margin:0; background:#020817; color:#e2e8f0; font-family:sans-serif; display:grid; place-items:center; }</style>
			</head>
			<body>
				<div>No valid PLY data found.</div>
			</body>
			</html>`;
  }

  return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>Posed Camera PLY Viewer</title>
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource};">
			<style>
				html, body {
					margin: 0;
					height: 100%;
					background: #020817;
					font-family: sans-serif;
					overflow: hidden;
				}
				body {
					display: flex;
					align-items: stretch;
					justify-content: stretch;
				}
				canvas {
					display: block;
					width: 100vw;
					height: 100vh;
					background: radial-gradient(circle at center, #111827 0%, #020817 100%);
					cursor: grab;
				}
				canvas.dragging {
					cursor: grabbing;
				}
			</style>
		</head>
		<body>
			<canvas id="viewer" tabindex="0"></canvas>
			<script id="ply-data" type="application/json">${modelData}</script>
			<script nonce="${nonce}" type="module" src="${bundleUri}"></script>
		</body>
		</html>
	`;
}

function createNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
