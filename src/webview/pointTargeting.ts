import * as THREE from "three";

const CONE_HALF_ANGLE = THREE.MathUtils.degToRad(1.5);
const MAX_RAY_LENGTH = 50;
const MAX_MESH_HIT_DISTANCE = 0.35;

export function resolvePointerTarget(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  model: THREE.Mesh | THREE.Points | undefined,
  clientX: number,
  clientY: number,
): THREE.Vector3 | undefined {
  if (!model) {
    return undefined;
  }

  const bounds = canvas.getBoundingClientRect();
  const mousePosition = new THREE.Vector2(
    ((clientX - bounds.left) / bounds.width) * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mousePosition, camera);

  if (model instanceof THREE.Points) {
    const position = model.geometry.getAttribute("position");
    if (!position) {
      return undefined;
    }

    const direction = raycaster.ray.direction.clone().normalize();
    const minimumDot = Math.cos(CONE_HALF_ANGLE);
    let bestPoint: THREE.Vector3 | undefined;
    let bestRayLength = Number.POSITIVE_INFINITY;

    for (let index = 0; index < position.count; index += 1) {
      const point = new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ).applyMatrix4(model.matrixWorld);
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
    return bestPoint;
  }

  const hit = raycaster.intersectObject(model, true)[0];
  if (
    !hit ||
    distancePointToRay(hit.point, raycaster.ray) > MAX_MESH_HIT_DISTANCE
  ) {
    return undefined;
  }
  return hit.point;
}

function distancePointToRay(point: THREE.Vector3, ray: THREE.Ray): number {
  const direction = ray.direction.clone().normalize();
  const offset = point.clone().sub(ray.origin);
  const projection = offset.dot(direction);
  const closestPoint = ray.origin
    .clone()
    .addScaledVector(direction, projection);
  return point.distanceTo(closestPoint);
}
