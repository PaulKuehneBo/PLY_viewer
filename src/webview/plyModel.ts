import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

export type PLYModel = THREE.Mesh | THREE.Points;

export function createPlyModel(data: ArrayBuffer): PLYModel | undefined {
  const hasFaces = readFaceCount(data) > 0;
  const geometry = new PLYLoader().parse(data);
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) {
    geometry.dispose();
    return undefined;
  }

  if (!geometry.getAttribute("normal") && hasFaces) {
    geometry.computeVertexNormals();
  }

  const hasVertexColors = geometry.getAttribute("color") !== undefined;
  if (hasFaces) {
    const material = new THREE.MeshStandardMaterial({
      color: hasVertexColors ? 0xffffff : 0x5eb8aa,
      vertexColors: hasVertexColors,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }

  const material = new THREE.PointsMaterial({
    color: hasVertexColors ? 0xffffff : 0xa7d8cc,
    size: 2,
    sizeAttenuation: false,
    vertexColors: hasVertexColors,
  });
  return new THREE.Points(geometry, material);
}

export function disposePlyModel(model: PLYModel): void {
  model.geometry.dispose();
  if (Array.isArray(model.material)) {
    model.material.forEach((material) => material.dispose());
  } else {
    model.material.dispose();
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
