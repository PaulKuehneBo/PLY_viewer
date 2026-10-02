import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { buildPlyViewerHtml } from "./buildViewerHtml";

interface ViewerMessage {
  messageType: string;
  msg: string;
}

function logViewerMessage(
  level: "verbose" | "warning" | "error",
  message: ViewerMessage,
): void {
  const prefix = `[Webview:${level.toUpperCase()}]`;
  if (level === "warning") {
    console.warn(prefix, message.messageType, message.msg);
    return;
  }
  if (level === "error") {
    console.error(prefix, message.messageType, message.msg);
    return;
  }
  console.log(prefix, message.messageType, message.msg);
}

let activePlyPanel: vscode.WebviewPanel | undefined;
let activePlyFileUri: vscode.Uri | undefined;
let activePlyExtensionUri: vscode.Uri | undefined;
let webviewReloadTimer: NodeJS.Timeout | undefined;

function refreshActivePlyWebview(): void {
  if (!activePlyPanel || !activePlyFileUri || !activePlyExtensionUri) {
    return;
  }

  activePlyPanel.webview.html = buildPlyViewerHtml(
    activePlyPanel.webview,
    activePlyFileUri,
    activePlyExtensionUri,
  );
}

function openPlyViewer(fileUri: vscode.Uri, extensionUri: vscode.Uri): void {
  console.log("[EXT] openPlyViewer start:", fileUri.fsPath);
  activePlyFileUri = fileUri;
  activePlyExtensionUri = extensionUri;

  if (activePlyPanel) {
    activePlyPanel.dispose();
    activePlyPanel = undefined;
  }

  const panel = vscode.window.createWebviewPanel(
    "posedCameraPlyViewer",
    "Posed Camera PLY Viewer",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        extensionUri,
        vscode.Uri.joinPath(extensionUri, "node_modules"),
        vscode.Uri.joinPath(extensionUri, "out"),
        vscode.Uri.file(path.dirname(fileUri.fsPath)),
      ],
    },
  );

  activePlyPanel = panel;
  panel.onDidDispose(() => {
    if (activePlyPanel === panel) {
      activePlyPanel = undefined;
    }
  });

  panel.webview.html = buildPlyViewerHtml(panel.webview, fileUri, extensionUri);
  panel.webview.onDidReceiveMessage((message: unknown) => {
    const viewerMessage = message as ViewerMessage | undefined;
    if (
      !viewerMessage ||
      typeof viewerMessage.messageType !== "string" ||
      typeof viewerMessage.msg !== "string"
    ) {
      return;
    }

    switch (viewerMessage.messageType) {
      case "verbose":
        logViewerMessage("verbose", viewerMessage);
        break;
      case "warning":
        logViewerMessage("warning", viewerMessage);
        break;
      case "error":
        logViewerMessage("error", viewerMessage);
        break;
      default:
        logViewerMessage("verbose", {
          messageType: viewerMessage.messageType,
          msg: viewerMessage.msg,
        });
        break;
    }
  });
}

export function activate(context: vscode.ExtensionContext): void {
  console.log("[EXT] activate() start");
  console.log("[EXT] extensionUri:", context.extensionUri.fsPath);

  const webviewWatchPath = path.join(
    context.extensionUri.fsPath,
    "out",
    "webview",
  );
  try {
    if (fs.existsSync(webviewWatchPath)) {
      const watcher = fs.watch(webviewWatchPath, { persistent: false }, () => {
        if (webviewReloadTimer) {
          clearTimeout(webviewReloadTimer);
        }

        webviewReloadTimer = setTimeout(() => {
          refreshActivePlyWebview();
        }, 250);
      });
      context.subscriptions.push({ dispose: () => watcher.close() });
    }
  } catch (err) {
    console.error("[EXT] Error setting up webview watcher:", err);
  }

  const command = vscode.commands.registerCommand(
    "posed-camera.openWebview",
    async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        filters: { "PLY Files": ["ply"] },
        openLabel: "Open PLY",
      });

      if (!fileUri || fileUri.length === 0) {
        return;
      }

      try {
        openPlyViewer(fileUri[0], context.extensionUri);
      } catch (err) {
        console.error("[EXT] Error opening PLY viewer:", err);
      }
    },
  );

  context.subscriptions.push(command);

  const fileOpenListener = vscode.workspace.onDidOpenTextDocument(
    (document) => {
      const fileName = document.fileName.toLowerCase();
      if (!fileName.endsWith(".ply") || document.uri.scheme !== "file") {
        return;
      }

      console.log("[EXT] PLY file found:", document.fileName);
      try {
        openPlyViewer(document.uri, context.extensionUri);
      } catch (err) {
        console.error("[EXT] Error opening PLY viewer:", err);
      }
    },
  );

  context.subscriptions.push(fileOpenListener);
}

export function deactivate(): void {
  // no-op
}
