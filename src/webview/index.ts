import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

type Vector3Tuple = [number, number, number];

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
    const renderer = new THREE.WebGLRenderer({
      canvas: viewerCanvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020817");
    scene.add(new THREE.HemisphereLight(0xe5f3ff, 0x354052, 2));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(4, 7, 9);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc4e5ff, 0.8);
    fillLight.position.set(-6, -3, 4);
    scene.add(fillLight);

    const fieldOfView = 45;
    const camera = new THREE.PerspectiveCamera(
      fieldOfView,
      window.innerWidth / window.innerHeight,
      0.01,
      1000,
    );
    const rotationStep = Math.PI / 36;
    const targetAxes = new THREE.AxesHelper(1.5);
    const raycaster = new THREE.Raycaster();
    const mousePosition = new THREE.Vector2();
    scene.add(targetAxes);
    let cameraTarget: Vector3Tuple = [0, 0, 0];
    let cameraPosition: Vector3Tuple = [1, 1, 1];
    let cameraUp: Vector3Tuple = [0, 0, 1];
    let renderScheduled = false;
    let activePointer: number | undefined;
    let previousPointerX = 0;
    let previousPointerY = 0;
    let currentModel: THREE.Mesh | THREE.Points | undefined;
    let currentModelCenter: Vector3Tuple = [0, 0, 0];

    function syncCamera(): void {
      camera.position.set(...cameraPosition);
      camera.up.set(...cameraUp);
      camera.lookAt(...cameraTarget);
      targetAxes.position.set(...cameraTarget);
    }

    function render(): void {
      renderer.render(scene, camera);
    }

    function scheduleRender(): void {
      if (renderScheduled) {
        return;
      }
      renderScheduled = true;
      requestAnimationFrame(() => {
        renderScheduled = false;
        render();
      });
    }

    function cameraBasis(): { right: Vector3Tuple; up: Vector3Tuple } {
      const viewDirection = normalize(
        [-cameraPosition[0], -cameraPosition[1], -cameraPosition[2]],
        [-1, 0, 0],
      );
      const right = normalize(cross(viewDirection, cameraUp), [0, 1, 0]);
      const up = normalize(cross(right, viewDirection), cameraUp);
      return { right, up };
    }

    function rotateCamera(axis: Vector3Tuple, angle: number): void {
      const relativePosition: Vector3Tuple = [
        cameraPosition[0] - cameraTarget[0],
        cameraPosition[1] - cameraTarget[1],
        cameraPosition[2] - cameraTarget[2],
      ];
      const rotatedRelative = rotateAroundAxis(relativePosition, axis, angle);
      cameraPosition = [
        cameraTarget[0] + rotatedRelative[0],
        cameraTarget[1] + rotatedRelative[1],
        cameraTarget[2] + rotatedRelative[2],
      ];
      cameraUp = rotateAroundAxis(cameraUp, axis, angle);
      syncCamera();
    }

    function centerCameraTargetOnModel(): void {
      if (!currentModel) {
        return;
      }
      const geometry = currentModel.geometry;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) {
        return;
      }
      const center = box.getCenter(new THREE.Vector3());
      currentModelCenter = [center.x, center.y, center.z];
      cameraTarget = currentModelCenter;
      syncCamera();
      scheduleRender();
    }

    function resolvePointerTargetFromRay(): Vector3Tuple | undefined {
      if (!currentModel) {
        return undefined;
      }

      raycaster.setFromCamera(mousePosition, camera);
      if (currentModel instanceof THREE.Points) {
        const geometry = currentModel.geometry;
        const position = geometry.getAttribute("position");
        if (!position) {
          return undefined;
        }

        const direction = raycaster.ray.direction.clone().normalize();
        let bestPoint: THREE.Vector3 | undefined;
        let bestRayLength = Number.POSITIVE_INFINITY;
        const maxPerpendicularDistance = 0.35;

        for (let index = 0; index < position.count; index += 1) {
          const localPoint = new THREE.Vector3(
            position.getX(index),
            position.getY(index),
            position.getZ(index),
          );
          const worldPoint = localPoint.applyMatrix4(currentModel.matrixWorld);
          const toPoint = worldPoint.clone().sub(raycaster.ray.origin);
          const rayLength = toPoint.dot(direction);
          if (rayLength < 0) {
            continue;
          }

          const closestPoint = raycaster.ray.origin
            .clone()
            .add(direction.clone().multiplyScalar(rayLength));
          const perpendicularDistance = worldPoint.distanceTo(closestPoint);
          if (
            perpendicularDistance <= maxPerpendicularDistance &&
            rayLength < bestRayLength
          ) {
            bestRayLength = rayLength;
            bestPoint = worldPoint;
          }
        }

        if (!bestPoint) {
          return undefined;
        }
        return [bestPoint.x, bestPoint.y, bestPoint.z];
      }

      const hit = raycaster.intersectObject(currentModel, true)[0];
      if (!hit || distancePointToRay(hit.point, raycaster.ray) > 0.35) {
        return undefined;
      }
      return [hit.point.x, hit.point.y, hit.point.z];
    }

    async function loadPly(data: ArrayBuffer, fileName: string): Promise<void> {
      setStatus(`Loading ${fileName}…`);
      try {
        const hasFaces = readFaceCount(data) > 0;
        const geometry = new PLYLoader().parse(data);
        const position = geometry.getAttribute("position");
        if (!position || position.count === 0) {
          geometry.dispose();
          setStatus("PLY file contains no renderable vertices.");
          return;
        }

        if (!geometry.getAttribute("normal") && hasFaces) {
          geometry.computeVertexNormals();
        }

        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (box) {
          const center = box.getCenter(new THREE.Vector3());
          currentModelCenter = [center.x, center.y, center.z];
          cameraTarget = currentModelCenter;
        }

        let radiusFromOrigin = 0;
        for (let index = 0; index < position.count; index += 1) {
          const x = position.getX(index) - cameraTarget[0];
          const y = position.getY(index) - cameraTarget[1];
          const z = position.getZ(index) - cameraTarget[2];
          radiusFromOrigin = Math.max(radiusFromOrigin, Math.hypot(x, y, z));
        }
        radiusFromOrigin = Math.max(radiusFromOrigin, 0.01);

        const aspect = window.innerWidth / window.innerHeight;
        const verticalHalfFov = THREE.MathUtils.degToRad(fieldOfView / 2);
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
        const fitHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
        const cameraDistance = (radiusFromOrigin / Math.sin(fitHalfFov)) * 1.15;
        const initialDirection = normalize([1, 1, 1], [1, 0, 0]);
        cameraPosition = [
          cameraTarget[0] + initialDirection[0] * cameraDistance,
          cameraTarget[1] + initialDirection[1] * cameraDistance,
          cameraTarget[2] + initialDirection[2] * cameraDistance,
        ];
        camera.near = Math.max(0.001, cameraDistance - radiusFromOrigin * 1.5);
        camera.far = cameraDistance + radiusFromOrigin * 1.5;
        camera.updateProjectionMatrix();
        syncCamera();

        const hasVertexColors = geometry.getAttribute("color") !== undefined;
        let model: THREE.Mesh | THREE.Points;
        if (hasFaces) {
          const material = new THREE.MeshStandardMaterial({
            color: hasVertexColors ? 0xffffff : 0x5eb8aa,
            vertexColors: hasVertexColors,
            roughness: 0.82,
            metalness: 0,
            side: THREE.DoubleSide,
          });
          model = new THREE.Mesh(geometry, material);
        } else {
          const material = new THREE.PointsMaterial({
            color: hasVertexColors ? 0xffffff : 0xa7d8cc,
            size: 2,
            sizeAttenuation: false,
            vertexColors: hasVertexColors,
          });
          model = new THREE.Points(geometry, material);
        }

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
      currentModel.geometry.dispose();
      if (Array.isArray(currentModel.material)) {
        currentModel.material.forEach((material) => material.dispose());
      } else {
        currentModel.material.dispose();
      }
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
    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      scheduleRender();
    });

    window.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const key = event.code.startsWith("Numpad") ? event.code : event.key;
      const { right, up } = cameraBasis();
      switch (key) {
        case "4":
        case "Numpad4":
          rotateCamera(up, -rotationStep);
          break;
        case "6":
        case "Numpad6":
          rotateCamera(up, rotationStep);
          break;
        case "8":
        case "Numpad8":
          rotateCamera(right, rotationStep);
          break;
        case "2":
        case "Numpad2":
          rotateCamera(right, -rotationStep);
          break;
        case ".":
        case "Period":
          centerCameraTargetOnModel();
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
        const bounds = viewerCanvas.getBoundingClientRect();
        mousePosition.x =
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        mousePosition.y =
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

        const targetFromPointer = resolvePointerTargetFromRay();
        if (!targetFromPointer) {
          return;
        }

        cameraTarget = targetFromPointer;
        syncCamera();
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

      if (deltaX !== 0) {
        rotateCamera(cameraBasis().up, -deltaX * sensitivity);
      }
      if (deltaY !== 0) {
        rotateCamera(cameraBasis().right, -deltaY * sensitivity);
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

function readFaceCount(data: ArrayBuffer): number {
  const bytes = new Uint8Array(data);
  const decoder = new TextDecoder("ascii");
  const headerLines: string[] = [];
  let lineStart = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 10) {
      continue;
    }
    const line = decoder.decode(bytes.subarray(lineStart, index)).trim();
    headerLines.push(line);
    lineStart = index + 1;
    if (line === "end_header") {
      break;
    }
  }

  const faceElement = headerLines.find((line) =>
    /^element\s+face\s+\d+$/.test(line),
  );
  return faceElement ? Number.parseInt(faceElement.split(/\s+/)[2], 10) : 0;
}

function rotateAroundAxis(
  vector: Vector3Tuple,
  axis: Vector3Tuple,
  angle: number,
): Vector3Tuple {
  const normalizedAxis = normalize(axis, [0, 0, 1]);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const crossProduct = cross(normalizedAxis, vector);
  const projection = dot(normalizedAxis, vector) * (1 - cosine);
  return [
    vector[0] * cosine +
      crossProduct[0] * sine +
      normalizedAxis[0] * projection,
    vector[1] * cosine +
      crossProduct[1] * sine +
      normalizedAxis[1] * projection,
    vector[2] * cosine +
      crossProduct[2] * sine +
      normalizedAxis[2] * projection,
  ];
}

function distancePointToRay(point: THREE.Vector3, ray: THREE.Ray): number {
  const direction = ray.direction.clone().normalize();
  const toPoint = point.clone().sub(ray.origin);
  const projection = toPoint.dot(direction);
  const closestPoint = ray.origin
    .clone()
    .add(direction.clone().multiplyScalar(projection));
  return point.distanceTo(closestPoint);
}

function dot(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vector3Tuple, fallback: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...vector);
  if (length < 1e-8) {
    return fallback;
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
