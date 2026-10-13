import * as THREE from "three";
import { createCameraController } from "./cameraController.js";
import { createPlyModel, disposePlyModel, type PLYModel } from "./plyModel.js";
import { resolvePointerTarget } from "./pointTargeting.js";
import { createViewerScene } from "./viewerScene.js";

const canvas = document.querySelector<HTMLCanvasElement>("#viewer");
const plyUrlNode = document.querySelector<HTMLScriptElement>("#ply-url");
const statusNode = document.querySelector<HTMLDivElement>("#viewer-status");
const filePicker = document.querySelector<HTMLInputElement>("#ply-file-picker");
const openFileButton = document.querySelector<HTMLButtonElement>("#open-ply");
const modelListPanel = document.querySelector<HTMLElement>("#model-list-panel");
const modelListToggle =
  document.querySelector<HTMLButtonElement>("#toggle-model-list");
const modelListNode = document.querySelector<HTMLUListElement>("#model-list");
const removeModelDialog = document.querySelector<HTMLDialogElement>(
  "#remove-model-dialog",
);
const removeModelNameNode =
  document.querySelector<HTMLElement>("#remove-model-name");
const confirmRemoveModelButton = document.querySelector<HTMLButtonElement>(
  "#confirm-remove-model",
);
const cancelRemoveModelButton = document.querySelector<HTMLButtonElement>(
  "#cancel-remove-model",
);
const modelInfoPanel = document.querySelector<HTMLElement>("#model-info");
const modelInfoToggle =
  document.querySelector<HTMLButtonElement>("#toggle-model-info");
const pointCountNode = document.querySelector<HTMLElement>("#point-count");
const dimensionXNode = document.querySelector<HTMLElement>("#dimension-x");
const dimensionYNode = document.querySelector<HTMLElement>("#dimension-y");
const dimensionZNode = document.querySelector<HTMLElement>("#dimension-z");
const vscodeApi = (
  window as Window & {
    acquireVsCodeApi?: () => {
      postMessage: (message: { command: string }) => void;
    };
  }
).acquireVsCodeApi?.();

modelInfoToggle?.addEventListener("click", () => {
  const collapsed = modelInfoPanel?.classList.toggle("collapsed") ?? false;
  modelInfoToggle.setAttribute("aria-expanded", String(!collapsed));
  modelInfoToggle.setAttribute(
    "aria-label",
    collapsed ? "Expand model information" : "Minimize model information",
  );
  modelInfoToggle.title = collapsed ? "Expand" : "Minimize";
  modelInfoToggle.textContent = collapsed ? "+" : "−";
});

modelListToggle?.addEventListener("click", () => {
  const collapsed = modelListPanel?.classList.toggle("collapsed") ?? false;
  modelListToggle.setAttribute("aria-expanded", String(!collapsed));
  modelListToggle.textContent = collapsed ? "+" : "−";
  modelListToggle.title = collapsed
    ? "Expand model list"
    : "Minimize model list";
});

function setStatus(message: string): void {
  if (statusNode) {
    statusNode.textContent = message;
    statusNode.hidden = message.length === 0;
  }
}

if (canvas && plyUrlNode) {
  const viewerCanvas = canvas;
  const plyUrlElement = plyUrlNode;
  const plyFilePicker = filePicker;
  const plyOpenFileButton = openFileButton;
  try {
    const viewer = createViewerScene(viewerCanvas);
    const { scene, camera, targetAxes, fieldOfView, render, scheduleRender } =
      viewer;
    const cameraController = createCameraController(
      camera,
      targetAxes,
      scheduleRender,
    );
    const rotationStep = Math.PI / 36;
    let activePointer: number | undefined;
    let activePointerMode: "orbit" | "pan" | "roll-z" = "orbit";
    let previousPointerX = 0;
    let previousPointerY = 0;
    let previousRollAngle: number | undefined;
    const models: Array<{
      name: string;
      model: PLYModel;
      element: HTMLLIElement;
    }> = [];
    let pendingRemoval: (typeof models)[number] | undefined;

    async function loadPly(data: ArrayBuffer, fileName: string): Promise<void> {
      setStatus(`Loading ${fileName}…`);
      try {
        const model = createPlyModel(data);
        if (!model) {
          setStatus("PLY file contains no renderable vertices.");
          return;
        }

        const isFirstModel = models.length === 0;
        model.name = fileName;
        scene.add(model);
        models.push({
          name: fileName,
          model,
          element: addModelEntry(fileName, model),
        });
        updateModelInfo(model.geometry);
        if (isFirstModel) {
          cameraController.frameGeometry(
            [model.geometry],
            window.innerWidth,
            window.innerHeight,
            fieldOfView,
          );
        }
        setStatus("");
        render();
        viewerCanvas.focus();
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        setStatus(`Could not load PLY file.${detail}`);
        console.error("[PLY Viewer] PLYLoader failed:", error);
      }
    }

    window.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "object" || event.data === null) {
        return;
      }
      const message = event.data as {
        command?: unknown;
        fileName?: unknown;
        data?: unknown;
        error?: unknown;
      };
      if (
        message.command === "loadPlyFile" &&
        typeof message.fileName === "string" &&
        message.data instanceof ArrayBuffer
      ) {
        void loadPly(message.data, message.fileName);
      } else if (
        message.command === "openPlyError" &&
        typeof message.error === "string"
      ) {
        setStatus(`Could not open PLY file. ${message.error}`);
      }
    });

    function addModelEntry(name: string, model: PLYModel): HTMLLIElement {
      const item = document.createElement("li");
      item.className = "model-entry";
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", `Show ${name}`);
      checkbox.addEventListener("change", () => {
        model.visible = checkbox.checked;
        scheduleRender();
      });
      const nameNode = document.createElement("span");
      nameNode.textContent = name;
      nameNode.title = name;
      label.append(checkbox, nameNode);
      const removeButton = document.createElement("button");
      removeButton.className = "remove-model";
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.title = `Remove ${name}`;
      removeButton.setAttribute("aria-label", `Remove ${name}`);
      removeButton.addEventListener("click", () => {
        pendingRemoval = models.find((entry) => entry.model === model);
        if (!pendingRemoval || !removeModelDialog) {
          return;
        }
        if (removeModelNameNode) {
          removeModelNameNode.textContent = pendingRemoval.name;
        }
        removeModelDialog.showModal();
      });
      item.append(label, removeButton);
      modelListNode?.append(item);
      return item;
    }

    confirmRemoveModelButton?.addEventListener("click", () => {
      if (!pendingRemoval) {
        return;
      }
      const { model, element } = pendingRemoval;
      scene.remove(model);
      disposePlyModel(model);
      element.remove();
      const modelIndex = models.findIndex((entry) => entry.model === model);
      if (modelIndex >= 0) {
        models.splice(modelIndex, 1);
      }
      pendingRemoval = undefined;
      removeModelDialog?.close();

      const visibleModels = getVisibleModels();
      if (visibleModels.length > 0) {
        updateModelInfo(visibleModels[0].geometry);
      } else {
        clearModelInfo();
      }
      scheduleRender();
    });

    cancelRemoveModelButton?.addEventListener("click", () => {
      pendingRemoval = undefined;
      removeModelDialog?.close();
    });
    removeModelDialog?.addEventListener("close", () => {
      pendingRemoval = undefined;
    });

    function getVisibleModels(): PLYModel[] {
      return models
        .filter(({ model }) => model.visible)
        .map(({ model }) => model);
    }

    function getVisibleGeometries(): THREE.BufferGeometry[] {
      return getVisibleModels().map((model) => model.geometry);
    }

    async function loadEmbeddedPly(): Promise<void> {
      let plyUrl: string;
      try {
        plyUrl = JSON.parse(plyUrlElement.textContent ?? "") as string;
      } catch {
        setStatus("Invalid PLY resource URL.");
        return;
      }
      if (!plyUrl) {
        setStatus("Choose a PLY file to display.");
        return;
      }

      try {
        const response = await fetch(plyUrl);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}.`);
        }
        await loadPly(
          await response.arrayBuffer(),
          plyUrl.split("/").pop() ?? "PLY file",
        );
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        setStatus(`Could not load PLY file.${detail}`);
        console.error("[PLY Viewer] PLY request failed:", error);
      }
    }

    viewerCanvas.focus();
    window.addEventListener("resize", viewer.resize);
    viewerCanvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        cameraController.zoom(event.deltaY);
        scheduleRender();
      },
      { passive: false },
    );

    window.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const key =
        event.code.startsWith("Numpad") || event.code === "KeyZ"
          ? event.code
          : event.key;
      const { right, up } = cameraController.basis();
      switch (key) {
        case "4":
        case "Numpad4":
          cameraController.rotate(up, -rotationStep);
          break;
        case "6":
        case "Numpad6":
          cameraController.rotate(up, rotationStep);
          break;
        case "8":
        case "Numpad8":
          cameraController.rotate(right, rotationStep);
          break;
        case "2":
        case "Numpad2":
          cameraController.rotate(right, -rotationStep);
          break;
        case ".":
        case "Period": {
          const visibleGeometries = getVisibleGeometries();
          if (visibleGeometries.length > 0) {
            cameraController.fitGeometryAroundTarget(
              visibleGeometries,
              window.innerWidth,
              window.innerHeight,
              fieldOfView,
            );
          }
          break;
        }
        case "0":
        case "Numpad0":
          {
            const visibleGeometries = getVisibleGeometries();
            if (visibleGeometries.length > 0) {
              cameraController.frameGeometry(
                visibleGeometries,
                window.innerWidth,
                window.innerHeight,
                fieldOfView,
              );
            }
          }
          break;
        case "z":
        case "Z":
        case "KeyZ":
          cameraController.centerTargetInView();
          break;
        default:
          return;
      }

      event.preventDefault();
      scheduleRender();
    });

    viewerCanvas.addEventListener("pointerdown", (event) => {
      if (event.button === 0 && event.ctrlKey) {
        const targetFromPointer = resolvePointerTarget(
          viewerCanvas,
          camera,
          getVisibleModels(),
          event.clientX,
          event.clientY,
        );
        if (!targetFromPointer) {
          return;
        }

        cameraController.setTarget(targetFromPointer);
        scheduleRender();
        event.preventDefault();
        return;
      }

      if (
        (event.button !== 0 && event.button !== 1) ||
        activePointer !== undefined
      ) {
        return;
      }

      activePointer = event.pointerId;
      activePointerMode =
        event.button === 1 ? "pan" : event.shiftKey ? "roll-z" : "orbit";
      previousPointerX = event.clientX;
      previousPointerY = event.clientY;
      previousRollAngle =
        activePointerMode === "roll-z"
          ? pointerAngleAroundViewportCenter(event)
          : undefined;
      viewerCanvas.setPointerCapture(event.pointerId);
      viewerCanvas.classList.add("dragging");
      viewerCanvas.focus();
      event.preventDefault();
    });

    viewerCanvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointer) {
        return;
      }

      const deltaX = event.clientX - previousPointerX;
      const deltaY = event.clientY - previousPointerY;
      previousPointerX = event.clientX;
      previousPointerY = event.clientY;

      if (activePointerMode === "pan") {
        cameraController.panView(deltaX, deltaY, viewerCanvas.clientHeight);
        scheduleRender();
        return;
      }

      if (activePointerMode === "roll-z") {
        const currentRollAngle = pointerAngleAroundViewportCenter(event);
        if (currentRollAngle === undefined) {
          previousRollAngle = undefined;
          return;
        }
        if (previousRollAngle !== undefined) {
          const rawAngleDelta = currentRollAngle - previousRollAngle;
          const angleDelta = Math.atan2(
            Math.sin(rawAngleDelta),
            Math.cos(rawAngleDelta),
          );
          const { z } = cameraController.basis();
          cameraController.rotate(z, -angleDelta);
          scheduleRender();
        }
        previousRollAngle = currentRollAngle;
        return;
      }

      const sensitivity = 0.005;
      const { right, up } = cameraController.basis();

      if (deltaX !== 0) {
        cameraController.rotate(up, -deltaX * sensitivity);
      }
      if (deltaY !== 0) {
        cameraController.rotate(right, -deltaY * sensitivity);
      }
      scheduleRender();
    });

    function endPointer(event: PointerEvent): void {
      if (event.pointerId !== activePointer) {
        return;
      }
      activePointer = undefined;
      previousRollAngle = undefined;
      viewerCanvas.classList.remove("dragging");
      if (viewerCanvas.hasPointerCapture(event.pointerId)) {
        viewerCanvas.releasePointerCapture(event.pointerId);
      }
    }

    viewerCanvas.addEventListener("pointerup", endPointer);
    viewerCanvas.addEventListener("pointercancel", endPointer);
    plyOpenFileButton?.addEventListener("click", () => {
      if (vscodeApi) {
        vscodeApi.postMessage({ command: "openPlyFiles" });
      } else {
        plyFilePicker?.click();
      }
    });
    plyFilePicker?.addEventListener("change", async () => {
      const files = Array.from(plyFilePicker.files ?? []);
      for (const file of files) {
        await loadPly(await file.arrayBuffer(), file.name);
      }
      plyFilePicker.value = "";
    });
    void loadEmbeddedPly();

    function pointerAngleAroundViewportCenter(
      event: PointerEvent,
    ): number | undefined {
      const bounds = viewerCanvas.getBoundingClientRect();
      const offsetX = event.clientX - (bounds.left + bounds.width / 2);
      const offsetY = bounds.top + bounds.height / 2 - event.clientY;
      if (Math.hypot(offsetX, offsetY) < 2) {
        return undefined;
      }
      return Math.atan2(offsetY, offsetX);
    }
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    setStatus(`WebGL renderer could not start.${detail}`);
    console.error("[PLY Viewer] WebGL initialization failed:", error);
  }
}

function updateModelInfo(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const size = geometry.boundingBox?.getSize(new THREE.Vector3());
  if (!position || !size) {
    return;
  }

  const formatNumber = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  });
  if (pointCountNode) {
    pointCountNode.textContent = new Intl.NumberFormat().format(position.count);
  }
  if (dimensionXNode) {
    dimensionXNode.textContent = formatNumber.format(size.x);
  }
  if (dimensionYNode) {
    dimensionYNode.textContent = formatNumber.format(size.y);
  }
  if (dimensionZNode) {
    dimensionZNode.textContent = formatNumber.format(size.z);
  }
}

function clearModelInfo(): void {
  if (pointCountNode) {
    pointCountNode.textContent = "—";
  }
  if (dimensionXNode) {
    dimensionXNode.textContent = "—";
  }
  if (dimensionYNode) {
    dimensionYNode.textContent = "—";
  }
  if (dimensionZNode) {
    dimensionZNode.textContent = "—";
  }
}
