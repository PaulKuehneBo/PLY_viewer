import * as THREE from "three";

const INITIAL_DIRECTION = new THREE.Vector3(1, 1, 1).normalize();
const WORLD_UP = new THREE.Vector3(0, 0, 1);
const MODEL_VIEWPORT_FILL = 0.9;

export function createCameraController(
  camera: THREE.PerspectiveCamera,
  targetAxes: THREE.AxesHelper,
  scheduleRender: () => void,
) {
  let cameraTarget = new THREE.Vector3(0, 0, 0);
  let cameraPosition = new THREE.Vector3(1, 1, 1);
  let cameraUp = WORLD_UP.clone();

  function syncCamera(): void {
    camera.position.copy(cameraPosition);
    camera.up.copy(cameraUp);
    targetAxes.position.copy(cameraTarget);
  }

  function basis(): { right: THREE.Vector3; up: THREE.Vector3 } {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    return { right, up };
  }

  function rotate(axis: THREE.Vector3, angle: number): void {
    const normalizedAxis = axis.clone().normalize();
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      normalizedAxis,
      angle,
    );
    const relativePosition = cameraPosition.clone().sub(cameraTarget);
    relativePosition.applyQuaternion(rotation);
    cameraPosition.copy(cameraTarget).add(relativePosition);
    cameraUp.applyQuaternion(rotation).normalize();
    camera.quaternion.premultiply(rotation).normalize();
    syncCamera();
  }

  function setTarget(target: THREE.Vector3): void {
    cameraTarget.copy(target);
    syncCamera();
  }

  function panView(
    deltaX: number,
    deltaY: number,
    viewportHeight: number,
  ): void {
    if (viewportHeight <= 0) {
      return;
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.quaternion,
    );
    const depth = cameraTarget.clone().sub(cameraPosition).dot(forward);
    if (depth <= 0) {
      return;
    }

    const worldUnitsPerPixel =
      (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
      viewportHeight;
    const { right, up } = basis();
    const panOffset = new THREE.Vector3()
      .addScaledVector(right, -deltaX * worldUnitsPerPixel)
      .addScaledVector(up, deltaY * worldUnitsPerPixel);
    cameraPosition.add(panOffset);
    syncCamera();
  }

  function fitGeometryAroundTarget(
    geometry: THREE.BufferGeometry,
    width: number,
    height: number,
    fieldOfView: number,
  ): void {
    const position = geometry.getAttribute("position");
    if (!position || position.count === 0 || width <= 0 || height <= 0) {
      return;
    }

    geometry.computeBoundingBox();
    if (!geometry.boundingBox) {
      return;
    }

    const viewingDirection = cameraPosition
      .clone()
      .sub(cameraTarget)
      .normalize();
    if (viewingDirection.lengthSq() === 0) {
      viewingDirection.copy(INITIAL_DIRECTION);
    }

    let radius = 0;
    for (let index = 0; index < position.count; index += 1) {
      radius = Math.max(
        radius,
        Math.hypot(
          position.getX(index) - cameraTarget.x,
          position.getY(index) - cameraTarget.y,
          position.getZ(index) - cameraTarget.z,
        ),
      );
    }
    radius = Math.max(radius, 0.01);

    const aspect = width / height;
    const verticalHalfFov = THREE.MathUtils.degToRad(fieldOfView / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    const fitHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
    const cameraDistance =
      radius / (Math.sin(fitHalfFov) * MODEL_VIEWPORT_FILL);
    cameraPosition
      .copy(cameraTarget)
      .addScaledVector(viewingDirection, cameraDistance);
    camera.near = Math.max(0.001, cameraDistance - radius * 1.5);
    camera.far = cameraDistance + radius * 1.5;
    camera.updateProjectionMatrix();
    syncCamera();
    camera.lookAt(cameraTarget);
    cameraUp.copy(camera.up);
    scheduleRender();
  }

  function frameGeometry(
    geometry: THREE.BufferGeometry,
    width: number,
    height: number,
    fieldOfView: number,
  ): void {
    const position = geometry.getAttribute("position");
    if (!position || position.count === 0) {
      return;
    }

    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) {
      return;
    }

    cameraTarget.copy(bounds.getCenter(new THREE.Vector3()));
    let radius = 0;
    for (let index = 0; index < position.count; index += 1) {
      radius = Math.max(
        radius,
        Math.hypot(
          position.getX(index) - cameraTarget.x,
          position.getY(index) - cameraTarget.y,
          position.getZ(index) - cameraTarget.z,
        ),
      );
    }
    radius = Math.max(radius, 0.01);
    const aspect = width / height;
    const verticalHalfFov = THREE.MathUtils.degToRad(fieldOfView / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    const fitHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
    const cameraDistance = (radius / Math.sin(fitHalfFov)) * 1.15;
    cameraPosition
      .copy(cameraTarget)
      .addScaledVector(INITIAL_DIRECTION, cameraDistance);
    camera.near = Math.max(0.001, cameraDistance - radius * 1.5);
    camera.far = cameraDistance + radius * 1.5;
    camera.updateProjectionMatrix();
    cameraUp.copy(WORLD_UP);
    syncCamera();
    camera.lookAt(cameraTarget);
    cameraUp.copy(camera.up);
  }

  syncCamera();
  camera.lookAt(cameraTarget);
  cameraUp.copy(camera.up);
  return {
    syncCamera,
    basis,
    rotate,
    setTarget,
    panView,
    fitGeometryAroundTarget,
    frameGeometry,
  };
}
