import * as THREE from "three";

const INITIAL_DIRECTION = new THREE.Vector3(1, 1, 1).normalize();
const WORLD_UP = new THREE.Vector3(0, 0, 1);

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
    camera.lookAt(cameraTarget);
    targetAxes.position.copy(cameraTarget);
  }

  function basis(): { right: THREE.Vector3; up: THREE.Vector3 } {
    const viewDirection = cameraTarget.clone().sub(cameraPosition).normalize();
    const right = new THREE.Vector3().crossVectors(viewDirection, cameraUp);
    if (right.lengthSq() < 1e-16) {
      right.set(0, 1, 0);
    } else {
      right.normalize();
    }
    const up = new THREE.Vector3()
      .crossVectors(right, viewDirection)
      .normalize();
    return { right, up };
  }

  function rotate(axis: THREE.Vector3, angle: number): void {
    const relativePosition = cameraPosition.clone().sub(cameraTarget);
    relativePosition.applyAxisAngle(axis.clone().normalize(), angle);
    cameraPosition.copy(cameraTarget).add(relativePosition);
    cameraUp.applyAxisAngle(axis.clone().normalize(), angle).normalize();
    syncCamera();
  }

  function setTarget(target: THREE.Vector3): void {
    cameraTarget.copy(target);
    syncCamera();
  }

  function centerTargetOnGeometry(geometry: THREE.BufferGeometry): void {
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) {
      return;
    }
    setTarget(geometry.boundingBox.getCenter(new THREE.Vector3()));
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
  }

  syncCamera();
  return {
    syncCamera,
    basis,
    rotate,
    setTarget,
    centerTargetOnGeometry,
    frameGeometry,
  };
}
