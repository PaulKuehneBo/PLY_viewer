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

const PLY_VIEW_TYPE = "posedCamera.plyViewer";

interface PlyCustomDocument extends vscode.CustomDocument {
  readonly uri: vscode.Uri;
}

class PlyCustomEditorProvider implements vscode.CustomReadonlyEditorProvider<PlyCustomDocument> {
  private sharedPanel: vscode.WebviewPanel | undefined;
  private webviewReady = false;
  private isLoadingQueue = false;
  private readonly pendingFiles: vscode.Uri[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): PlyCustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(
    document: PlyCustomDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    if (this.sharedPanel && this.sharedPanel !== panel) {
      this.sharedPanel.reveal(panel.viewColumn);
      this.pendingFiles.push(document.uri);
      void this.flushPendingFiles();
      panel.dispose();
      return;
    }

    this.sharedPanel = panel;
    this.webviewReady = false;
    panel.onDidDispose(() => {
      if (this.sharedPanel === panel) {
        this.sharedPanel = undefined;
        this.webviewReady = false;
        this.pendingFiles.length = 0;
      }
    });

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        vscode.Uri.joinPath(this.extensionUri, "node_modules"),
        vscode.Uri.joinPath(this.extensionUri, "out"),
        document.uri.with({ path: path.dirname(document.uri.path) }),
      ],
    };
    panel.webview.html = buildPlyViewerHtml(
      panel.webview,
      document.uri,
      this.extensionUri,
    );
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "command" in message &&
        message.command === "webviewReady"
      ) {
        this.webviewReady = true;
        await this.flushPendingFiles();
        return;
      }

      if (
        typeof message === "object" &&
        message !== null &&
        "command" in message &&
        message.command === "openPlyFiles"
      ) {
        await this.openPlyFilesInPanel(panel);
        return;
      }

      if (
        typeof message === "object" &&
        message !== null &&
        "command" in message &&
        message.command === "saveScreenshot"
      ) {
        const screenshotData = "data" in message ? message.data : undefined;
        const requestedFileName =
          "fileName" in message ? message.fileName : undefined;
        if (
          !(screenshotData instanceof ArrayBuffer) &&
          !(screenshotData instanceof Uint8Array)
        ) {
          await panel.webview.postMessage({
            command: "screenshotSaveError",
            error: "Invalid screenshot image data.",
          });
          return;
        }
        await this.saveScreenshotInPanel(
          panel,
          screenshotData,
          typeof requestedFileName === "string"
            ? requestedFileName
            : "posed-camera-screenshot.png",
        );
        return;
      }

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

  private async openPlyFilesInPanel(panel: vscode.WebviewPanel): Promise<void> {
    const fileUris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      filters: { "PLY Files": ["ply"] },
      openLabel: "Add PLY models",
    });
    if (!fileUris?.length || this.sharedPanel !== panel) {
      return;
    }

    this.pendingFiles.push(...fileUris);
    await this.flushPendingFiles();
  }

  private async saveScreenshotInPanel(
    panel: vscode.WebviewPanel,
    imageData: ArrayBuffer | Uint8Array,
    requestedFileName: string,
  ): Promise<void> {
    const imageBytes =
      imageData instanceof Uint8Array ? imageData : new Uint8Array(imageData);
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      imageBytes.byteLength < pngSignature.length ||
      pngSignature.some((byte, index) => imageBytes[index] !== byte)
    ) {
      await panel.webview.postMessage({
        command: "screenshotSaveError",
        error: "Screenshot data is not a valid PNG image.",
      });
      return;
    }

    const requestedBaseName = path
      .basename(requestedFileName)
      .replace(/[^\w.-]/g, "_");
    const safeFileName =
      requestedBaseName.length > 0
        ? requestedBaseName
        : "posed-camera-screenshot";
    const defaultFileName = safeFileName.toLowerCase().endsWith(".png")
      ? safeFileName
      : `${safeFileName}.png`;
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const destination = await vscode.window.showSaveDialog({
        defaultUri: workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, defaultFileName)
          : undefined,
        filters: { "PNG Images": ["png"] },
        saveLabel: "Save Screenshot",
      });
      if (!destination) {
        await panel.webview.postMessage({
          command: "screenshotSaveCancelled",
        });
        return;
      }
      await vscode.workspace.fs.writeFile(destination, imageBytes);
      await panel.webview.postMessage({
        command: "screenshotSaved",
        fileName: path.basename(destination.path),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[EXT] Error saving viewer screenshot:", error);
      await vscode.window.showErrorMessage(
        `Could not save screenshot: ${detail}`,
      );
      await panel.webview.postMessage({
        command: "screenshotSaveError",
        error: detail,
      });
    }
  }

  private async flushPendingFiles(): Promise<void> {
    const panel = this.sharedPanel;
    if (!panel || !this.webviewReady || this.isLoadingQueue) {
      return;
    }

    this.isLoadingQueue = true;
    try {
      while (this.pendingFiles.length > 0 && this.sharedPanel === panel) {
        const fileUri = this.pendingFiles.shift();
        if (!fileUri) {
          continue;
        }
        try {
          const fileContents = await vscode.workspace.fs.readFile(fileUri);
          const data = Uint8Array.from(fileContents).buffer;
          await panel.webview.postMessage({
            command: "loadPlyFile",
            fileName: path.basename(fileUri.path),
            data,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await panel.webview.postMessage({
            command: "openPlyError",
            error: `${path.basename(fileUri.path)}: ${detail}`,
          });
        }
      }
    } finally {
      this.isLoadingQueue = false;
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  console.log("[EXT] activate() start");
  console.log("[EXT] extensionUri:", context.extensionUri.fsPath);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PLY_VIEW_TYPE,
      new PlyCustomEditorProvider(context.extensionUri),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

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
        await vscode.commands.executeCommand(
          "vscode.openWith",
          fileUri[0],
          PLY_VIEW_TYPE,
        );
      } catch (err) {
        console.error("[EXT] Error opening PLY viewer:", err);
      }
    },
  );

  context.subscriptions.push(command);
}

export function deactivate(): void {
  // no-op
}
