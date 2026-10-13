import * as THREE from "three";
import type { PLYModel } from "./plyModel.js";

const CONE_HALF_ANGLE = THREE.MathUtils.degToRad(1.5);
const MAX_RAY_LENGTH = 50;

export function resolvePointerTarget(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  models: readonly PLYModel[],
  clientX: number,
  clientY: number,
): THREE.Vector3 | undefined {
  if (models.length === 0) {
    return undefined;
  }

  const bounds = canvas.getBoundingClientRect();
  const mousePosition = new THREE.Vector2(
    ((clientX - bounds.left) / bounds.width) * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mousePosition, camera);

  const direction = raycaster.ray.direction.clone().normalize();
  const minimumDot = Math.cos(CONE_HALF_ANGLE);
  let bestPoint: THREE.Vector3 | undefined;
  let bestRayLength = Number.POSITIVE_INFINITY;

  for (const model of models) {
    if (!model.visible) {
      continue;
    }
    model.updateWorldMatrix(true, true);

    const points = model.children.find(
      (child): child is THREE.Points => child instanceof THREE.Points,
    );
    if (points) {
      const position = points.geometry.getAttribute("position");
      if (!position) {
        continue;
      }

      for (let index = 0; index < position.count; index += 1) {
        const point = new THREE.Vector3(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        ).applyMatrix4(points.matrixWorld);
        const offset = point.clone().sub(raycaster.ray.origin);
        const rayLength = offset.dot(direction);
        if (rayLength <= 0 || rayLength > MAX_RAY_LENGTH) {
          continue;
        }

        const offsetLength = offset.length();
        if (offsetLength === 0 || rayLength / offsetLength < minimumDot) {
          continue;
        }

        if (rayLength < bestRayLength) {
          bestRayLength = rayLength;
          bestPoint = point;
        }
      }
      continue;
    }

    const hit = raycaster.intersectObject(model, true)[0];
    if (!hit) {
      continue;
    }
    const rayLength = hit.point
      .clone()
      .sub(raycaster.ray.origin)
      .dot(direction);
    if (rayLength > 0 && rayLength < bestRayLength) {
      bestRayLength = rayLength;
      bestPoint = hit.point;
    }
  }
  if (!bestPoint) {
    return undefined;
  }
  return bestPoint;
}
