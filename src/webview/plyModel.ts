import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { parseGaussianSplatPly } from "../plyParser.js";
import { parsePlyTopology } from "./plyTopology.js";

interface GaussianSplatRenderModes {
  opaque: THREE.Points;
  transparent: THREE.Points;
}

interface GaussianOpacityFilter {
  enabled: { value: boolean };
  min: { value: number };
  max: { value: number };
}

export class PLYModel extends THREE.Group {
  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly opacityGamma: { value: number } | undefined = undefined,
    readonly opacityInverted: { value: boolean } | undefined = undefined,
    readonly opacityFilter: GaussianOpacityFilter | undefined = undefined,
    readonly pointSizeScale: { value: number } | undefined = undefined,
    private readonly gaussianSplatRenderModes:
      | GaussianSplatRenderModes
      | undefined = undefined,
  ) {
    super();
  }

  setGaussianSplatTransparency(enabled: boolean): void {
    if (!this.gaussianSplatRenderModes) {
      return;
    }
    this.gaussianSplatRenderModes.transparent.visible = enabled;
    this.gaussianSplatRenderModes.opaque.visible = !enabled;
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
    const opacityFilter: GaussianOpacityFilter = {
      enabled: { value: false },
      min: { value: 0.48 },
      max: { value: 0.52 },
    };
    const pointSizeScale = { value: 1 };
    const opaquePoints = new THREE.Points(
      geometry,
      createGaussianSplatMaterial(
        false,
        opacityGamma,
        opacityInverted,
        opacityFilter,
        pointSizeScale,
      ),
    );
    opaquePoints.visible = false;
    const transparentPoints = new THREE.Points(
      geometry,
      createGaussianSplatMaterial(
        true,
        opacityGamma,
        opacityInverted,
        opacityFilter,
        pointSizeScale,
      ),
    );
    const model = new PLYModel(
      geometry,
      opacityGamma,
      opacityInverted,
      opacityFilter,
      pointSizeScale,
      {
        opaque: opaquePoints,
        transparent: transparentPoints,
      },
    );
    model.add(opaquePoints, transparentPoints);
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

function createGaussianSplatMaterial(
  transparent: boolean,
  opacityGamma: { value: number },
  opacityInverted: { value: boolean },
  opacityFilter: GaussianOpacityFilter,
  pointSizeScale: { value: number },
): THREE.PointsMaterial {
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1,
    sizeAttenuation: true,
    vertexColors: true,
    transparent,
    depthTest: true,
    depthWrite: !transparent,
  });
  material.onBeforeCompile = (shader) => {
    const vertexDeclarations = transparent
      ? "uniform float gaussianPointSizeScale;\nattribute float gaussianPointSize;\nattribute float gaussianOpacity;\nvarying float vGaussianOpacity;"
      : "attribute float gaussianPointSize;\nattribute float gaussianOpacity;\nvarying float vGaussianOpacity;";
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\n${vertexDeclarations}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <color_vertex>",
      "#include <color_vertex>\nvGaussianOpacity = gaussianOpacity;",
    );
    if (transparent) {
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
      shader.uniforms.gaussianPointSizeScale = pointSizeScale;
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nuniform bool gaussianOpacityFilterEnabled;\nuniform float gaussianOpacityMin;\nuniform float gaussianOpacityMax;\nvarying float vGaussianOpacity;",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
if (gaussianOpacityFilterEnabled && (vGaussianOpacity < gaussianOpacityMin || vGaussianOpacity > gaussianOpacityMax)) discard;`,
      );
      shader.uniforms.gaussianOpacityFilterEnabled = opacityFilter.enabled;
      shader.uniforms.gaussianOpacityMin = opacityFilter.min;
      shader.uniforms.gaussianOpacityMax = opacityFilter.max;
    }
    shader.vertexShader = shader.vertexShader.replace(
      "gl_PointSize = size;",
      transparent
        ? "gl_PointSize = size * gaussianPointSize * gaussianPointSizeScale;"
        : "gl_PointSize = size * gaussianPointSize;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <logdepthbuf_vertex>",
      "#include <logdepthbuf_vertex>\ngl_PointSize = min(gl_PointSize, 128.0);",
    );
  };
  material.customProgramCacheKey = () =>
    `gaussian-splat-point-size-${transparent ? "transparent" : "opaque"}`;
  return material;
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
