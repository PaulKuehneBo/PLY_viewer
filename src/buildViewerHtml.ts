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
					top: 12px;
					left: 160px;
					width: min(250px, calc(100vw - 24px));
					height: min(320px, calc(100vh - 24px));
					box-sizing: border-box;
					display: flex;
					flex-direction: column;
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
					flex: 1;
					min-height: 0;
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
				.model-entry {
					display: flex;
					align-items: center;
					gap: 6px;
					padding-right: 6px;
				}
				.model-entry label { flex: 1; min-width: 0; }
				.model-entry span {
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				.remove-model {
					flex: 0 0 28px;
					width: 28px;
					height: 28px;
					border: 1px solid transparent;
					border-radius: 3px;
					background: transparent;
					color: #f0a49a;
					font: 20px/1 sans-serif;
					cursor: pointer;
				}
				.remove-model:hover { border-color: #854c49; background: #482d30; }
				#remove-model-dialog {
					width: min(360px, calc(100vw - 48px));
					box-sizing: border-box;
					border: 1px solid #48656a;
					border-radius: 6px;
					padding: 18px;
					background: #101c24;
					color: #e2e8f0;
					box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
				}
				#remove-model-dialog::backdrop { background: rgba(0, 0, 0, 0.62); }
				#remove-model-dialog h2 { margin: 0 0 10px; font-size: 16px; }
				#remove-model-dialog p { margin: 0; color: #b8c9cc; overflow-wrap: anywhere; }
				#remove-model-dialog .dialog-shortcuts { margin-top: 10px; font-size: 12px; }
				#remove-model-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
				#remove-model-dialog-actions button {
					border: 1px solid #527c7c;
					border-radius: 4px;
					padding: 7px 10px;
					background: #183437;
					color: #effafa;
					font: inherit;
					cursor: pointer;
				}
				#confirm-remove-model { border-color: #99534d !important; background: #512f32 !important; }
				#model-list-panel.collapsed { height: auto; }
				#model-list-panel.collapsed #model-list { display: none; }
				@media (max-width: 620px) {
					#model-list-panel {
						top: 56px;
						left: 12px;
						width: min(250px, calc(100vw - 24px));
						height: min(240px, calc(100vh - 68px));
					}
				}
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
				#model-info-content > .opacity-gamma-control {
					display: block;
					margin-top: 10px;
					border-top: 1px solid #30464a;
					padding-top: 9px;
				}
				.opacity-gamma-value {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				.opacity-invert-control {
					display: flex;
					align-items: center;
					gap: 7px;
					margin-top: 8px;
					color: #a9c0c2;
				}
				#opacity-invert {
					margin: 0;
					accent-color: #60b6a5;
				}
				.splat-transparency-control {
					display: flex;
					align-items: center;
					gap: 7px;
					margin-top: 8px;
					color: #a9c0c2;
				}
				#splat-transparency {
					margin: 0;
					accent-color: #60b6a5;
				}
				#opacity-gamma {
					width: 100%;
					margin: 8px 0 0;
					accent-color: #60b6a5;
				}
				.splat-size-control {
					margin-top: 9px;
					border-top: 1px solid #30464a;
					padding-top: 9px;
				}
				.splat-size-label {
					display: flex;
					justify-content: space-between;
					align-items: center;
					color: #a9c0c2;
				}
				#splat-size-scale {
					width: 100%;
					margin: 7px 0 0;
					accent-color: #60b6a5;
				}
				.splat-size-control[hidden] {
					display: none;
				}
				.opacity-range-filter {
					display: block;
					margin-top: 10px;
					border-top: 1px solid #30464a;
					padding-top: 9px;
				}
				.opacity-range-filter-toggle {
					display: flex;
					align-items: center;
					gap: 7px;
					color: #a9c0c2;
				}
				#opacity-filter-enabled,
				#opacity-filter-value {
					margin: 0;
					accent-color: #60b6a5;
				}
				.opacity-filter-slider {
					margin-top: 9px;
				}
				.opacity-filter-slider[hidden] {
					display: none;
				}
				.opacity-filter-value-label {
					display: flex;
					justify-content: space-between;
					gap: 8px;
					color: #a9c0c2;
				}
				#opacity-filter-value {
					width: 100%;
					margin-top: 7px;
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
			</div>
			<div id="viewer-status" role="status">Loading PLY…</div>
			<aside id="model-list-panel" aria-label="Loaded PLY models">
				<header id="model-list-header">
					<span>Models</span>
					<button id="toggle-model-list" type="button" aria-label="Minimize model list" aria-expanded="true" title="Minimize">−</button>
				</header>
				<ul id="model-list"></ul>
			</aside>
			<dialog id="remove-model-dialog" aria-labelledby="remove-model-title">
				<h2 id="remove-model-title">Remove model?</h2>
				<p>Remove <strong id="remove-model-name"></strong> from the viewer?</p>
				<p class="dialog-shortcuts">Press Y to remove or N to cancel.</p>
				<div id="remove-model-dialog-actions">
					<button id="cancel-remove-model" type="button">No (N)</button>
					<button id="confirm-remove-model" type="button">Yes, remove (Y)</button>
				</div>
			</dialog>
			<section id="model-info" aria-label="PLY model information">
				<header id="model-info-header">
					<span>Model</span>
					<button id="toggle-model-info" type="button" aria-label="Minimize model information" aria-expanded="true" title="Minimize">−</button>
				</header>
				<dl id="model-info-content">
					<div><dt>Points</dt><dd id="point-count">—</dd></div>
					<div><dt>Target X</dt><dd id="target-x">—</dd></div>
					<div><dt>Target Y</dt><dd id="target-y">—</dd></div>
					<div><dt>Target Z</dt><dd id="target-z">—</dd></div>
					<div class="opacity-gamma-control">
						<div class="opacity-gamma-value">
							<label for="opacity-gamma">Opacity gamma</label>
							<output id="opacity-gamma-value" for="opacity-gamma">1.00</output>
						</div>
						<input id="opacity-gamma" type="range" min="0" max="2" step="0.01" value="1" aria-label="Gaussian opacity gamma" />
						<label class="opacity-invert-control">
							<input id="opacity-invert" type="checkbox" />
							Invert opacity
						</label>
						<label class="splat-transparency-control">
							<input id="splat-transparency" type="checkbox" checked />
							Transparent splats
						</label>
						<div id="splat-size-control" class="splat-size-control">
							<div class="splat-size-label">
								<label for="splat-size-scale">Point radius scale</label>
								<output id="splat-size-value" for="splat-size-scale">1.0×</output>
							</div>
							<input id="splat-size-scale" type="range" min="1" max="10" step="0.1" value="1" aria-label="Transparent splat point radius scale" />
						</div>
					</div>
					<div class="opacity-range-filter">
						<label class="opacity-range-filter-toggle">
							<input id="opacity-filter-enabled" type="checkbox" />
							Filter by opacity
						</label>
						<div id="opacity-filter-slider" class="opacity-filter-slider" hidden>
							<div class="opacity-filter-value-label">
								<label for="opacity-filter-value">Opacity range</label>
								<output id="opacity-filter-range" for="opacity-filter-value">48–52 %</output>
							</div>
							<input id="opacity-filter-value" type="range" min="0" max="100" step="1" value="50" aria-label="Opacity filter center percentage" />
						</div>
					</div>
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
