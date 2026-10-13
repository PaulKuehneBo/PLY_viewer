import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { parsePlyTopology } from "./plyTopology.js";

export class PLYModel extends THREE.Group {
  constructor(readonly geometry: THREE.BufferGeometry) {
    super();
  }
}

export function createPlyModel(data: ArrayBuffer): PLYModel | undefined {
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
