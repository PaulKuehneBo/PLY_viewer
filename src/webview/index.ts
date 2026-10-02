import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

type Vector3Tuple = [number, number, number];

const canvas = document.querySelector<HTMLCanvasElement>("#viewer");
const plyUrlNode = document.querySelector<HTMLScriptElement>("#ply-url");
const statusNode = document.querySelector<HTMLDivElement>("#viewer-status");

function setStatus(message: string): void {
  if (statusNode) {
    statusNode.textContent = message;
    statusNode.hidden = message.length === 0;
  }
}

if (canvas && plyUrlNode) {
  const viewerCanvas = canvas;
  const plyUrlElement = plyUrlNode;
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
    let cameraPosition: Vector3Tuple = [1, 1, 1];
    let cameraUp: Vector3Tuple = [0, 0, 1];
    let renderScheduled = false;
    let activePointer: number | undefined;
    let previousPointerX = 0;
    let previousPointerY = 0;

    function syncCamera(): void {
      camera.position.set(...cameraPosition);
      camera.up.set(...cameraUp);
      camera.lookAt(0, 0, 0);
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
      cameraPosition = rotateAroundAxis(cameraPosition, axis, angle);
      cameraUp = rotateAroundAxis(cameraUp, axis, angle);
      syncCamera();
    }

    async function loadPly(): Promise<void> {
      let plyUrl: string;
      try {
        plyUrl = JSON.parse(plyUrlElement.textContent ?? "") as string;
      } catch {
        setStatus("Invalid PLY resource URL.");
        return;
      }

      setStatus("Loading PLY…");
      try {
        const response = await fetch(plyUrl);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}.`);
        }
        const data = await response.arrayBuffer();
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

        let radiusFromOrigin = 0;
        for (let index = 0; index < position.count; index += 1) {
          radiusFromOrigin = Math.max(
            radiusFromOrigin,
            Math.hypot(
              position.getX(index),
              position.getY(index),
              position.getZ(index),
            ),
          );
        }
        radiusFromOrigin = Math.max(radiusFromOrigin, 0.01);

        const aspect = window.innerWidth / window.innerHeight;
        const verticalHalfFov = THREE.MathUtils.degToRad(fieldOfView / 2);
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
        const fitHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
        const cameraDistance = (radiusFromOrigin / Math.sin(fitHalfFov)) * 1.15;
        const initialDirection = normalize([1, 1, 1], [1, 0, 0]);
        cameraPosition = [
          initialDirection[0] * cameraDistance,
          initialDirection[1] * cameraDistance,
          initialDirection[2] * cameraDistance,
        ];
        camera.near = Math.max(0.001, cameraDistance - radiusFromOrigin * 1.5);
        camera.far = cameraDistance + radiusFromOrigin * 1.5;
        camera.updateProjectionMatrix();
        syncCamera();

        const hasVertexColors = geometry.getAttribute("color") !== undefined;
        if (hasFaces) {
          const material = new THREE.MeshStandardMaterial({
            color: hasVertexColors ? 0xffffff : 0x5eb8aa,
            vertexColors: hasVertexColors,
            roughness: 0.82,
            metalness: 0,
            side: THREE.DoubleSide,
          });
          scene.add(new THREE.Mesh(geometry, material));
        } else {
          const material = new THREE.PointsMaterial({
            color: hasVertexColors ? 0xffffff : 0xa7d8cc,
            size: 2,
            sizeAttenuation: false,
            vertexColors: hasVertexColors,
          });
          scene.add(new THREE.Points(geometry, material));
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
        default:
          return;
      }

      event.preventDefault();
      scheduleRender();
    });

    viewerCanvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || activePointer !== undefined) {
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
    void loadPly();
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
