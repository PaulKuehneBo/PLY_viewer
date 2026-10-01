interface PlyVertex {
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
}

interface PlyFace {
  indices: number[];
}

interface ParsedPly {
  vertices: PlyVertex[];
  faces: PlyFace[];
}

type Vector3 = [number, number, number];
interface Triangle {
  first: number;
  second: number;
  third: number;
  depth: number;
}

const canvas = document.querySelector<HTMLCanvasElement>("#viewer");
const dataNode = document.querySelector<HTMLScriptElement>("#ply-data");
const context = canvas?.getContext("2d");

if (canvas && context && dataNode) {
  const model = JSON.parse(dataNode.textContent ?? "{}") as ParsedPly;
  const rotationStep = Math.PI / 36;
  let cameraPosition: Vector3 = [1, 1, 1];
  let cameraUp: Vector3 = [0, 0, 1];
  let renderScheduled = false;
  let pointImage: ImageData | undefined;
  let pointImageWidth = 0;
  let pointImageHeight = 0;
  const vertexCount = model.vertices.length;
  const relativeVertices = new Float32Array(vertexCount * 3);
  const vertexColors = new Uint8Array(vertexCount * 3);
  const projectedX = new Float32Array(vertexCount);
  const projectedY = new Float32Array(vertexCount);
  const projectedDepth = new Float32Array(vertexCount);
  const triangles = buildTriangles(model.faces, vertexCount);

  model.vertices.forEach((vertex, index) => {
    const offset = index * 3;
    relativeVertices[offset] = vertex.x;
    relativeVertices[offset + 1] = vertex.y;
    relativeVertices[offset + 2] = vertex.z;
    vertexColors[offset] = colorChannel(vertex.r, 167);
    vertexColors[offset + 1] = colorChannel(vertex.g, 216);
    vertexColors[offset + 2] = colorChannel(vertex.b, 204);
  });

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

  function render(): void {
    if (!canvas || !context || vertexCount === 0) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const backingWidth = Math.round(width * pixelRatio);
    const backingHeight = Math.round(height * pixelRatio);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      pointImage = undefined;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const viewDirection = normalize(
      [-cameraPosition[0], -cameraPosition[1], -cameraPosition[2]],
      [-1, 0, 0],
    );
    const right = normalize(cross(viewDirection, cameraUp), [0, 1, 0]);
    const up = normalize(cross(right, viewDirection), cameraUp);
    const cameraBackward = normalize(cameraPosition, [1, 0, 0]);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < vertexCount; index += 1) {
      const offset = index * 3;
      const x = relativeVertices[offset];
      const y = relativeVertices[offset + 1];
      const z = relativeVertices[offset + 2];
      const viewX = x * right[0] + y * right[1] + z * right[2];
      const viewY = x * up[0] + y * up[1] + z * up[2];
      projectedX[index] = viewX;
      projectedY[index] = viewY;
      projectedDepth[index] =
        x * cameraBackward[0] + y * cameraBackward[1] + z * cameraBackward[2];
      minX = Math.min(minX, viewX);
      maxX = Math.max(maxX, viewX);
      minY = Math.min(minY, viewY);
      maxY = Math.max(maxY, viewY);
    }

    const spanX = Math.max(Math.abs(minX), Math.abs(maxX)) * 2 || 1;
    const spanY = Math.max(Math.abs(minY), Math.abs(maxY)) * 2 || 1;
    const scale = Math.min((width * 0.86) / spanX, (height * 0.86) / spanY);
    for (let index = 0; index < vertexCount; index += 1) {
      projectedX[index] = width / 2 + projectedX[index] * scale;
      projectedY[index] = height / 2 - projectedY[index] * scale;
    }

    if (triangles.length === 0) {
      renderPointCloud(pixelRatio);
      return;
    }

    for (const triangle of triangles) {
      triangle.depth =
        (projectedDepth[triangle.first] +
          projectedDepth[triangle.second] +
          projectedDepth[triangle.third]) /
        3;
    }
    triangles.sort((left, right) => left.depth - right.depth);
    context.fillStyle = "#5eb8aa";
    context.strokeStyle = "rgba(190, 235, 224, 0.2)";
    context.lineWidth = 0.6;
    for (const triangle of triangles) {
      context.beginPath();
      context.moveTo(projectedX[triangle.first], projectedY[triangle.first]);
      context.lineTo(projectedX[triangle.second], projectedY[triangle.second]);
      context.lineTo(projectedX[triangle.third], projectedY[triangle.third]);
      context.closePath();
      context.fill();
      context.stroke();
    }
  }

  function renderPointCloud(pixelRatio: number): void {
    if (!canvas || !context) {
      return;
    }
    if (
      !pointImage ||
      pointImageWidth !== canvas.width ||
      pointImageHeight !== canvas.height
    ) {
      pointImage = context.createImageData(canvas.width, canvas.height);
      pointImageWidth = canvas.width;
      pointImageHeight = canvas.height;
    }
    pointImage.data.fill(0);

    const halfSize = Math.max(
      1,
      Math.min(2, Math.round((350 / Math.sqrt(vertexCount)) * pixelRatio)),
    );
    for (let index = 0; index < vertexCount; index += 1) {
      const centerX = Math.round(projectedX[index] * pixelRatio);
      const centerY = Math.round(projectedY[index] * pixelRatio);
      const colorOffset = index * 3;
      for (let y = centerY - halfSize; y <= centerY + halfSize; y += 1) {
        if (y < 0 || y >= canvas.height) {
          continue;
        }
        for (let x = centerX - halfSize; x <= centerX + halfSize; x += 1) {
          if (x < 0 || x >= canvas.width) {
            continue;
          }
          const pixelOffset = (y * canvas.width + x) * 4;
          pointImage.data[pixelOffset] = vertexColors[colorOffset];
          pointImage.data[pixelOffset + 1] = vertexColors[colorOffset + 1];
          pointImage.data[pixelOffset + 2] = vertexColors[colorOffset + 2];
          pointImage.data[pixelOffset + 3] = 255;
        }
      }
    }
    context.putImageData(pointImage, 0, 0);
  }

  canvas.focus();
  window.addEventListener("resize", scheduleRender);
  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.code.startsWith("Numpad") ? event.code : event.key;
    const viewDirection = normalize(
      [-cameraPosition[0], -cameraPosition[1], -cameraPosition[2]],
      [-1, 0, 0],
    );
    const right = normalize(cross(viewDirection, cameraUp), [0, 1, 0]);
    const up = normalize(cross(right, viewDirection), cameraUp);
    switch (key) {
      case "4":
      case "Numpad4":
        cameraPosition = rotateAroundAxis(cameraPosition, up, -rotationStep);
        cameraUp = rotateAroundAxis(cameraUp, up, -rotationStep);
        break;
      case "6":
      case "Numpad6":
        cameraPosition = rotateAroundAxis(cameraPosition, up, rotationStep);
        cameraUp = rotateAroundAxis(cameraUp, up, rotationStep);
        break;
      case "8":
      case "Numpad8":
        cameraPosition = rotateAroundAxis(cameraPosition, right, rotationStep);
        cameraUp = rotateAroundAxis(cameraUp, right, rotationStep);
        break;
      case "2":
      case "Numpad2":
        cameraPosition = rotateAroundAxis(cameraPosition, right, -rotationStep);
        cameraUp = rotateAroundAxis(cameraUp, right, -rotationStep);
        break;
      default:
        return;
    }

    event.preventDefault();
    scheduleRender();
  });
  render();
}

function rotateAroundAxis(
  vector: Vector3,
  axis: Vector3,
  angle: number,
): Vector3 {
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

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vector3, fallback: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  if (length < 1e-8) {
    return fallback;
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function colorChannel(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  return Math.round(Math.max(0, Math.min(255, value)));
}

function buildTriangles(faces: PlyFace[], vertexCount: number): Triangle[] {
  const triangles: Triangle[] = [];
  for (const face of faces) {
    for (let index = 1; index < face.indices.length - 1; index += 1) {
      const first = face.indices[0];
      const second = face.indices[index];
      const third = face.indices[index + 1];
      if (
        Number.isInteger(first) &&
        first >= 0 &&
        first < vertexCount &&
        Number.isInteger(second) &&
        second >= 0 &&
        second < vertexCount &&
        Number.isInteger(third) &&
        third >= 0 &&
        third < vertexCount
      ) {
        triangles.push({ first, second, third, depth: 0 });
      }
    }
  }
  return triangles;
}
