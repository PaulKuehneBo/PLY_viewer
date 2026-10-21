import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { parseGaussianSplatPly } from "../plyParser.js";
import { parsePlyTopology } from "./plyTopology.js";

export class PLYModel extends THREE.Group {
  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly opacityGamma: { value: number } | undefined = undefined,
    readonly opacityInverted: { value: boolean } | undefined = undefined,
  ) {
    super();
  }
}

export function createPlyModel(data: ArrayBuffer): PLYModel | undefined {
  const gaussianSplat = parseGaussianSplatPly(data);
  if (gaussianSplat) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(gaussianSplat.positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(gaussianSplat.colors, 3),
    );
    geometry.setAttribute(
      "gaussianOpacity",
      new THREE.BufferAttribute(gaussianSplat.opacities, 1),
    );
    geometry.setAttribute(
      "gaussianPointSize",
      new THREE.BufferAttribute(gaussianSplat.pointSizes, 1),
    );
    geometry.computeBoundingSphere();

    const opacityGamma = { value: 1 };
    const opacityInverted = { value: false };
    const model = new PLYModel(geometry, opacityGamma, opacityInverted);
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nattribute float gaussianPointSize;\nattribute float gaussianOpacity;\nvarying float vGaussianOpacity;",
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <color_vertex>",
        "#include <color_vertex>\nvGaussianOpacity = gaussianOpacity;",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nuniform float gaussianOpacityGamma;\nuniform bool gaussianOpacityInverted;\nvarying float vGaussianOpacity;",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 gaussianPointCoord = gl_PointCoord * 2.0 - 1.0;
float gaussianRadiusSquared = dot(gaussianPointCoord, gaussianPointCoord);
if (gaussianRadiusSquared > 1.0) discard;
float sourceOpacity = gaussianOpacityInverted ? 1.0 - vGaussianOpacity : vGaussianOpacity;
float adjustedOpacity = pow(max(sourceOpacity, 0.000001), gaussianOpacityGamma);
diffuseColor.a *= adjustedOpacity * exp(-4.5 * gaussianRadiusSquared);`,
      );
      shader.uniforms.gaussianOpacityGamma = opacityGamma;
      shader.uniforms.gaussianOpacityInverted = opacityInverted;
      shader.vertexShader = shader.vertexShader.replace(
        "gl_PointSize = size;",
        "gl_PointSize = size * gaussianPointSize;",
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <logdepthbuf_vertex>",
        "#include <logdepthbuf_vertex>\ngl_PointSize = min(gl_PointSize, 128.0);",
      );
    };
    material.customProgramCacheKey = () => "gaussian-splat-point-size-opacity-gamma";
    model.add(new THREE.Points(geometry, material));
    return model;
  }

  const topology = parsePlyTopology(data);
  const hasFaces = topology.faceCount > 0;
  const geometry = new PLYLoader().parse(data);
  convertFloat64AttributesForWebGL(geometry);
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) {
    geometry.dispose();
    return undefined;
  }

  if (position.count !== topology.vertexCount) {
    geometry.dispose();
    throw new Error("PLY vertex count does not match the parsed header.");
  }

  const model = new PLYModel(geometry);
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
    model.add(new THREE.Mesh(geometry, material));
  } else {
    const material = new THREE.PointsMaterial({
      color: hasVertexColors ? 0xffffff : 0xa7d8cc,
      size: 2,
      sizeAttenuation: false,
      vertexColors: hasVertexColors,
    });
    model.add(new THREE.Points(geometry, material));
  }

  if (topology.edges.length > 0) {
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    const edgeColor = new THREE.Color();
    for (const edge of topology.edges) {
      edgeColor.setRGB(...edge.color, THREE.SRGBColorSpace);
      for (const vertexIndex of [edge.firstVertex, edge.secondVertex]) {
        linePositions.push(
          position.getX(vertexIndex),
          position.getY(vertexIndex),
          position.getZ(vertexIndex),
        );
        lineColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3),
    );
    lineGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(lineColors, 3),
    );
    lineGeometry.computeBoundingSphere();
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.name = "edges";
    lines.renderOrder = 1;
    model.add(lines);
  }

  return model;
}

function convertFloat64AttributesForWebGL(
  geometry: THREE.BufferGeometry,
): void {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (!(attribute.array instanceof Float64Array)) {
      continue;
    }

    const converted = new THREE.Float32BufferAttribute(
      attribute.array,
      attribute.itemSize,
      attribute.normalized,
    );
    converted.name = attribute.name;
    geometry.setAttribute(name, converted);
  }
}

export function disposePlyModel(model: PLYModel): void {
  const geometries = new Set<THREE.BufferGeometry>([model.geometry]);
  const materials = new Set<THREE.Material>();
  model.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Points ||
      object instanceof THREE.LineSegments
    ) {
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
