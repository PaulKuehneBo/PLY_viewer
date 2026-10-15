import * as THREE from "three";

const FIELD_OF_VIEW = 45;

export function createViewerScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
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

  const camera = new THREE.PerspectiveCamera(
    FIELD_OF_VIEW,
    window.innerWidth / window.innerHeight,
    0.01,
    1000,
  );
  const worldOriginAxes = new THREE.AxesHelper(1.5);
  scene.add(worldOriginAxes);

  const targetAxes = new THREE.AxesHelper(0.5);
  scene.add(targetAxes);

  let renderScheduled = false;
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

  function resize(): void {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    scheduleRender();
  }

  return {
    renderer,
    scene,
    camera,
    worldOriginAxes,
    targetAxes,
    fieldOfView: FIELD_OF_VIEW,
    render,
    scheduleRender,
    resize,
  };
}
