import * as THREE from "three";
import { createCameraController } from "./cameraController.js";
import { createPlyModel, disposePlyModel } from "./plyModel.js";
import { resolvePointerTarget } from "./pointTargeting.js";
import { createViewerScene } from "./viewerScene.js";

const canvas = document.querySelector<HTMLCanvasElement>("#viewer");
const plyUrlNode = document.querySelector<HTMLScriptElement>("#ply-url");
const statusNode = document.querySelector<HTMLDivElement>("#viewer-status");
const filePicker = document.querySelector<HTMLInputElement>("#ply-file-picker");
const openFileButton = document.querySelector<HTMLButtonElement>("#open-ply");
const selectedFileNode =
  document.querySelector<HTMLSpanElement>("#selected-file");

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
  const selectedPlyFileNode = selectedFileNode;
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
    let previousPointerX = 0;
    let previousPointerY = 0;
    let currentModel: THREE.Mesh | THREE.Points | undefined;

    async function loadPly(data: ArrayBuffer, fileName: string): Promise<void> {
      setStatus(`Loading ${fileName}…`);
      try {
        const model = createPlyModel(data);
        if (!model) {
          setStatus("PLY file contains no renderable vertices.");
          return;
        }

        cameraController.frameGeometry(
          model.geometry,
          window.innerWidth,
          window.innerHeight,
          fieldOfView,
        );
        disposeCurrentModel();
        currentModel = model;
        scene.add(model);
        if (selectedPlyFileNode) {
          selectedPlyFileNode.textContent = fileName;
          selectedPlyFileNode.title = fileName;
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

    function disposeCurrentModel(): void {
      if (!currentModel) {
        return;
      }
      scene.remove(currentModel);
      disposePlyModel(currentModel);
      currentModel = undefined;
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

    window.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const key = event.code.startsWith("Numpad") ? event.code : event.key;
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
        case "Period":
          if (currentModel) {
            cameraController.centerTargetOnGeometry(currentModel.geometry);
          }
          break;
        default:
          return;
      }

      event.preventDefault();
      scheduleRender();
    });

    viewerCanvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      if (event.ctrlKey) {
        const targetFromPointer = resolvePointerTarget(
          viewerCanvas,
          camera,
          currentModel,
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

      if (activePointer !== undefined) {
        return;
      }
      activePointer = event.pointerId;
      previousPointerX = event.clientX;
      previousPointerY = event.clientY;
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
      viewerCanvas.classList.remove("dragging");
      if (viewerCanvas.hasPointerCapture(event.pointerId)) {
        viewerCanvas.releasePointerCapture(event.pointerId);
      }
    }

    viewerCanvas.addEventListener("pointerup", endPointer);
    viewerCanvas.addEventListener("pointercancel", endPointer);
    plyOpenFileButton?.addEventListener("click", () => plyFilePicker?.click());
    plyFilePicker?.addEventListener("change", async () => {
      const file = plyFilePicker.files?.[0];
      if (!file) {
        return;
      }
      await loadPly(await file.arrayBuffer(), file.name);
      plyFilePicker.value = "";
    });
    void loadEmbeddedPly();
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    setStatus(`WebGL renderer could not start.${detail}`);
    console.error("[PLY Viewer] WebGL initialization failed:", error);
  }
}
