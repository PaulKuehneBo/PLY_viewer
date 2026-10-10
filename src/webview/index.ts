import * as THREE from "three";
import { createCameraController } from "./cameraController.js";
import { createPlyModel } from "./plyModel.js";
import { resolvePointerTarget } from "./pointTargeting.js";
import { createViewerScene } from "./viewerScene.js";

const canvas = document.querySelector<HTMLCanvasElement>("#viewer");
const plyUrlNode = document.querySelector<HTMLScriptElement>("#ply-url");
const statusNode = document.querySelector<HTMLDivElement>("#viewer-status");
const filePicker = document.querySelector<HTMLInputElement>("#ply-file-picker");
const openFileButton = document.querySelector<HTMLButtonElement>("#open-ply");
const selectedFileNode =
  document.querySelector<HTMLSpanElement>("#selected-file");
const modelListPanel = document.querySelector<HTMLElement>("#model-list-panel");
const modelListToggle =
  document.querySelector<HTMLButtonElement>("#toggle-model-list");
const modelListNode = document.querySelector<HTMLUListElement>("#model-list");
const modelInfoPanel = document.querySelector<HTMLElement>("#model-info");
const modelInfoToggle =
  document.querySelector<HTMLButtonElement>("#toggle-model-info");
const pointCountNode = document.querySelector<HTMLElement>("#point-count");
const dimensionXNode = document.querySelector<HTMLElement>("#dimension-x");
const dimensionYNode = document.querySelector<HTMLElement>("#dimension-y");
const dimensionZNode = document.querySelector<HTMLElement>("#dimension-z");

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
    let activePointerMode: "orbit" | "pan" = "orbit";
    let previousPointerX = 0;
    let previousPointerY = 0;
    const models: Array<{
      model: THREE.Mesh | THREE.Points;
    }> = [];

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
        models.push({ model });
        addModelEntry(fileName, model);
        updateModelInfo(model.geometry);
        if (isFirstModel) {
          cameraController.frameGeometry(
            [model.geometry],
            window.innerWidth,
            window.innerHeight,
            fieldOfView,
          );
        }
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

    function addModelEntry(
      name: string,
      model: THREE.Mesh | THREE.Points,
    ): void {
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
      item.append(label);
      modelListNode?.append(item);
    }

    function getVisibleModels(): (THREE.Mesh | THREE.Points)[] {
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
      activePointerMode = event.button === 1 ? "pan" : "orbit";
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

      if (activePointerMode === "pan") {
        cameraController.panView(deltaX, deltaY, viewerCanvas.clientHeight);
        scheduleRender();
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
      viewerCanvas.classList.remove("dragging");
      if (viewerCanvas.hasPointerCapture(event.pointerId)) {
        viewerCanvas.releasePointerCapture(event.pointerId);
      }
    }

    viewerCanvas.addEventListener("pointerup", endPointer);
    viewerCanvas.addEventListener("pointercancel", endPointer);
    plyOpenFileButton?.addEventListener("click", () => plyFilePicker?.click());
    plyFilePicker?.addEventListener("change", async () => {
      const files = Array.from(plyFilePicker.files ?? []);
      for (const file of files) {
        await loadPly(await file.arrayBuffer(), file.name);
      }
      plyFilePicker.value = "";
    });
    void loadEmbeddedPly();
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
