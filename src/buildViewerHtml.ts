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
				#viewer-toolbar {
					position: fixed;
					z-index: 2;
					top: 12px;
					left: 12px;
					display: flex;
					align-items: center;
					gap: 10px;
					max-width: calc(100vw - 24px);
					color: #e2e8f0;
					font-size: 13px;
				}
				#model-list-panel {
					position: fixed;
					z-index: 2;
					top: 86px;
					bottom: 12px;
					left: 12px;
					width: min(250px, calc(100vw - 24px));
					box-sizing: border-box;
					border: 1px solid #48656a;
					border-radius: 5px;
					background: rgba(12, 22, 30, 0.94);
					color: #e2e8f0;
					font-size: 12px;
					box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
				}
				#model-list-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					min-height: 36px;
					padding: 0 8px 0 10px;
					border-bottom: 1px solid #30464a;
					font-weight: 600;
				}
				#toggle-model-list {
					width: 26px;
					height: 26px;
					border: 1px solid #527c7c;
					border-radius: 3px;
					background: #183437;
					color: #effafa;
					font: 18px/1 sans-serif;
					cursor: pointer;
				}
				#toggle-model-list:hover { background: #24494b; }
				#model-list {
					max-height: calc(100% - 38px);
					margin: 0;
					padding: 4px 0;
					list-style: none;
					overflow: auto;
				}
				.model-entry label {
					display: flex;
					align-items: center;
					gap: 8px;
					min-height: 32px;
					padding: 0 10px;
					cursor: pointer;
				}
				.model-entry label:hover { background: #1b3035; }
				.model-entry input { accent-color: #60b6a5; }
				.model-entry span {
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				#model-list-panel.collapsed { bottom: auto; }
				#model-list-panel.collapsed #model-list { display: none; }
				#open-ply {
					border: 1px solid #527c7c;
					border-radius: 4px;
					padding: 7px 11px;
					background: #183437;
					color: #effafa;
					font: inherit;
					cursor: pointer;
				}
				#open-ply:hover { background: #24494b; }
				#selected-file {
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				#viewer-status {
					position: fixed;
					z-index: 1;
					top: 56px;
					left: 12px;
					color: #e2e8f0;
					font-size: 13px;
				}
				#model-info {
					position: fixed;
					z-index: 2;
					top: 12px;
					right: 12px;
					width: min(220px, calc(100vw - 24px));
					box-sizing: border-box;
					border: 1px solid #48656a;
					border-radius: 5px;
					background: rgba(12, 22, 30, 0.94);
					color: #e2e8f0;
					font-size: 12px;
					box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
				}
				#model-info-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					min-height: 34px;
					padding: 0 8px 0 10px;
					font-weight: 600;
				}
				#toggle-model-info {
					width: 26px;
					height: 26px;
					border: 1px solid #527c7c;
					border-radius: 3px;
					background: #183437;
					color: #effafa;
					font: 18px/1 sans-serif;
					cursor: pointer;
				}
				#toggle-model-info:hover { background: #24494b; }
				#model-info-content {
					margin: 0;
					padding: 0 10px 9px;
				}
				#model-info-content > div {
					display: flex;
					justify-content: space-between;
					gap: 12px;
					padding-top: 5px;
				}
				#model-info-content dt { color: #a9c0c2; }
				#model-info-content dd { margin: 0; font-variant-numeric: tabular-nums; }
				#model-info.collapsed #model-info-content { display: none; }
				canvas.dragging {
					cursor: grabbing;
				}
			</style>
		</head>
		<body>
			<canvas id="viewer" tabindex="0"></canvas>
			<div id="viewer-toolbar">
				<button id="open-ply" type="button">Open PLY</button>
				<input id="ply-file-picker" type="file" accept=".ply" multiple hidden />
				<span id="selected-file"></span>
			</div>
			<div id="viewer-status" role="status">Loading PLY…</div>
			<aside id="model-list-panel" aria-label="Loaded PLY models">
				<header id="model-list-header">
					<span>Models</span>
					<button id="toggle-model-list" type="button" aria-label="Minimize model list" aria-expanded="true" title="Minimize">−</button>
				</header>
				<ul id="model-list"></ul>
			</aside>
			<section id="model-info" aria-label="PLY model information">
				<header id="model-info-header">
					<span>Model</span>
					<button id="toggle-model-info" type="button" aria-label="Minimize model information" aria-expanded="true" title="Minimize">−</button>
				</header>
				<dl id="model-info-content">
					<div><dt>Points</dt><dd id="point-count">—</dd></div>
					<div><dt>Size X</dt><dd id="dimension-x">—</dd></div>
					<div><dt>Size Y</dt><dd id="dimension-y">—</dd></div>
					<div><dt>Size Z</dt><dd id="dimension-z">—</dd></div>
				</dl>
			</section>
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
