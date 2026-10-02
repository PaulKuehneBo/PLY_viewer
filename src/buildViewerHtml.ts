import * as vscode from "vscode";

export function buildPlyViewerHtml(
  webview: vscode.Webview,
  plyFileUri: vscode.Uri,
  extensionUri: vscode.Uri,
): string {
  const nonce = createNonce();
  const bundleUri = webview
    .asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "out", "webview", "index.js"),
    )
    .toString();
  const threeModuleUri = webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        "node_modules",
        "three",
        "build",
        "three.module.js",
      ),
    )
    .toString();
  const threeAddonsUri = webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        "node_modules",
        "three",
        "examples",
        "jsm",
      ),
    )
    .toString();
  const plyFileUrl = webview.asWebviewUri(plyFileUri).toString();

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
			<div id="viewer-status" role="status">Loading PLY…</div>
			<script id="ply-url" type="application/json">${JSON.stringify(plyFileUrl)}</script>
			<script nonce="${nonce}" type="importmap">
				{
					"imports": {
						"three": "${threeModuleUri}",
						"three/addons/": "${threeAddonsUri}/"
					}
				}
			</script>
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
