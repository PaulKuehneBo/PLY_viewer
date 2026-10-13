type PlyFormat = "ascii" | "binary_little_endian" | "binary_big_endian";
type PlyScalarType =
  | "char"
  | "int8"
  | "uchar"
  | "uint8"
  | "short"
  | "int16"
  | "ushort"
  | "uint16"
  | "int"
  | "int32"
  | "uint"
  | "uint32"
  | "float"
  | "float32"
  | "double"
  | "float64";

type PlyProperty =
  | { name: string; type: PlyScalarType }
  | {
      name: string;
      countType: PlyScalarType;
      itemType: PlyScalarType;
      list: true;
    };

interface PlyElement {
  name: string;
  count: number;
  properties: PlyProperty[];
}

interface PlyHeader {
  format: PlyFormat;
  bodyOffset: number;
  elements: PlyElement[];
  vertexCount: number;
  faceCount: number;
}

export interface PLYEdge {
  firstVertex: number;
  secondVertex: number;
  color: [number, number, number];
}

export interface PLYTopology {
  vertexCount: number;
  faceCount: number;
  edges: PLYEdge[];
}

const INTEGER_TYPES = new Set<PlyScalarType>([
  "char",
  "int8",
  "uchar",
  "uint8",
  "short",
  "int16",
  "ushort",
  "uint16",
  "int",
  "int32",
  "uint",
  "uint32",
]);

export function parsePlyTopology(data: ArrayBuffer): PLYTopology {
  const bytes = new Uint8Array(data);
  const header = parseHeader(bytes);
  const topology: PLYTopology = {
    vertexCount: header.vertexCount,
    faceCount: header.faceCount,
    edges: [],
  };
  if (
    !header.elements.some(
      (element) => element.name === "edge" && element.count > 0,
    )
  ) {
    return topology;
  }

  if (header.format === "ascii") {
    parseAsciiEdges(bytes, header, topology);
  } else {
    parseBinaryEdges(data, header, topology);
  }
  return topology;
}

function parseHeader(bytes: Uint8Array): PlyHeader {
  const decoder = new TextDecoder("ascii");
  const elements: PlyElement[] = [];
  let currentElement: PlyElement | undefined;
  let format: PlyFormat | undefined;
  let bodyOffset = -1;
  let lineStart = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 10) {
      continue;
    }
    const line = decoder.decode(bytes.subarray(lineStart, index)).trim();
    lineStart = index + 1;
    if (line === "end_header") {
      if (currentElement) {
        elements.push(currentElement);
      }
      bodyOffset = lineStart;
      break;
    }

    const parts = line.split(/\s+/);
    if (parts[0] === "format") {
      const candidate = parts[1];
      if (
        candidate !== "ascii" &&
        candidate !== "binary_little_endian" &&
        candidate !== "binary_big_endian"
      ) {
        throw new Error(`Unsupported PLY format: ${candidate ?? "missing"}.`);
      }
      format = candidate;
    } else if (parts[0] === "element") {
      if (currentElement) {
        elements.push(currentElement);
      }
      const count = Number(parts[2]);
      if (!Number.isSafeInteger(count) || count < 0 || count > bytes.length) {
        throw new Error(
          `Invalid PLY element count for ${parts[1] ?? "element"}.`,
        );
      }
      currentElement = {
        name: parts[1] ?? "",
        count,
        properties: [],
      };
    } else if (parts[0] === "property") {
      if (!currentElement) {
        throw new Error("PLY property appears before an element declaration.");
      }
      if (parts[1] === "list") {
        const countType = parseScalarType(parts[2]);
        const itemType = parseScalarType(parts[3]);
        const name = parts[4];
        if (!name || !INTEGER_TYPES.has(countType)) {
          throw new Error("Invalid PLY list property declaration.");
        }
        currentElement.properties.push({
          name,
          countType,
          itemType,
          list: true,
        });
      } else {
        const type = parseScalarType(parts[1]);
        const name = parts[2];
        if (!name) {
          throw new Error("Invalid PLY scalar property declaration.");
        }
        currentElement.properties.push({ name, type });
      }
    }
  }

  if (bodyOffset < 0 || !format) {
    throw new Error(
      "PLY header is incomplete or has no supported format declaration.",
    );
  }
  if (decoder.decode(bytes.subarray(0, 3)) !== "ply") {
    throw new Error("Invalid PLY file signature.");
  }

  return {
    format,
    bodyOffset,
    elements,
    vertexCount:
      elements.find((element) => element.name === "vertex")?.count ?? 0,
    faceCount: elements.find((element) => element.name === "face")?.count ?? 0,
  };
}

function parseScalarType(value: string | undefined): PlyScalarType {
  const supported: readonly string[] = [
    "char",
    "int8",
    "uchar",
    "uint8",
    "short",
    "int16",
    "ushort",
    "uint16",
    "int",
    "int32",
    "uint",
    "uint32",
    "float",
    "float32",
    "double",
    "float64",
  ];
  if (!value || !supported.includes(value)) {
    throw new Error(`Unsupported PLY scalar type: ${value ?? "missing"}.`);
  }
  return value as PlyScalarType;
}

function parseAsciiEdges(
  bytes: Uint8Array,
  header: PlyHeader,
  topology: PLYTopology,
): void {
  const tokens = new AsciiTokenReader(bytes, header.bodyOffset);
  for (const element of header.elements) {
    for (let recordIndex = 0; recordIndex < element.count; recordIndex += 1) {
      const values: Record<string, number | [number, number]> = {};
      for (const property of element.properties) {
        if ("list" in property) {
          const count = tokens.readCount(property.countType);
          let firstIndex: number | undefined;
          let secondIndex: number | undefined;
          for (let valueIndex = 0; valueIndex < count; valueIndex += 1) {
            const value = tokens.readNumber(property.itemType);
            if (element.name === "edge" && property.name === "vertex_indices") {
              if (valueIndex === 0) firstIndex = value;
              if (valueIndex === 1) secondIndex = value;
            }
          }
          if (
            element.name === "edge" &&
            property.name === "vertex_indices" &&
            firstIndex !== undefined &&
            secondIndex !== undefined
          ) {
            values.vertex_indices = [firstIndex, secondIndex];
          }
        } else {
          const value = tokens.readNumber(property.type);
          if (element.name === "edge") {
            values[property.name] = value;
            if (
              property.name === "red" ||
              property.name === "green" ||
              property.name === "blue"
            ) {
              values[`${property.name}_scale`] = getColorScale(property.type);
            }
          }
        }
      }
      if (element.name === "edge") {
        appendEdge(values, topology);
      }
    }
  }
}

function parseBinaryEdges(
  data: ArrayBuffer,
  header: PlyHeader,
  topology: PLYTopology,
): void {
  const view = new DataView(data);
  const cursor = { offset: header.bodyOffset };
  const littleEndian = header.format === "binary_little_endian";

  for (const element of header.elements) {
    for (let recordIndex = 0; recordIndex < element.count; recordIndex += 1) {
      const values: Record<string, number | [number, number]> = {};
      for (const property of element.properties) {
        if ("list" in property) {
          const count = readBinaryCount(
            view,
            cursor,
            property.countType,
            littleEndian,
          );
          if (count > data.byteLength - cursor.offset) {
            throw new Error(
              "PLY list length exceeds the remaining binary data.",
            );
          }
          let firstIndex: number | undefined;
          let secondIndex: number | undefined;
          for (let valueIndex = 0; valueIndex < count; valueIndex += 1) {
            const value = readBinaryNumber(
              view,
              cursor,
              property.itemType,
              littleEndian,
            );
            if (element.name === "edge" && property.name === "vertex_indices") {
              if (valueIndex === 0) firstIndex = value;
              if (valueIndex === 1) secondIndex = value;
            }
          }
          if (
            element.name === "edge" &&
            property.name === "vertex_indices" &&
            firstIndex !== undefined &&
            secondIndex !== undefined
          ) {
            values.vertex_indices = [firstIndex, secondIndex];
          }
        } else {
          const value = readBinaryNumber(
            view,
            cursor,
            property.type,
            littleEndian,
          );
          if (element.name === "edge") {
            values[property.name] = value;
            if (
              property.name === "red" ||
              property.name === "green" ||
              property.name === "blue"
            ) {
              values[`${property.name}_scale`] = getColorScale(property.type);
            }
          }
        }
      }
      if (element.name === "edge") {
        appendEdge(values, topology);
      }
    }
  }
}

function appendEdge(
  values: Record<string, number | [number, number]>,
  topology: PLYTopology,
): void {
  const indices = values.vertex_indices;
  const firstVertex =
    typeof values.vertex1 === "number"
      ? values.vertex1
      : Array.isArray(indices)
        ? indices[0]
        : undefined;
  const secondVertex =
    typeof values.vertex2 === "number"
      ? values.vertex2
      : Array.isArray(indices)
        ? indices[1]
        : undefined;

  if (
    firstVertex === undefined ||
    secondVertex === undefined ||
    !Number.isInteger(firstVertex) ||
    !Number.isInteger(secondVertex)
  ) {
    throw new Error(
      "PLY edge must define vertex1/vertex2 or a vertex_indices list.",
    );
  }
  if (
    firstVertex < 0 ||
    secondVertex < 0 ||
    firstVertex >= topology.vertexCount ||
    secondVertex >= topology.vertexCount
  ) {
    throw new Error(
      `PLY edge references an invalid vertex index (${firstVertex}, ${secondVertex}).`,
    );
  }

  const red = typeof values.red === "number" ? values.red : 255;
  const green = typeof values.green === "number" ? values.green : 255;
  const blue = typeof values.blue === "number" ? values.blue : 255;
  const redScale =
    typeof values.red_scale === "number" ? values.red_scale : 255;
  const greenScale =
    typeof values.green_scale === "number" ? values.green_scale : 255;
  const blueScale =
    typeof values.blue_scale === "number" ? values.blue_scale : 255;

  topology.edges.push({
    firstVertex,
    secondVertex,
    color: [
      clampColor(red / redScale),
      clampColor(green / greenScale),
      clampColor(blue / blueScale),
    ],
  });
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getColorScale(type: PlyScalarType): number {
  if (
    type === "float" ||
    type === "float32" ||
    type === "double" ||
    type === "float64"
  ) {
    return 1;
  }
  if (
    type === "ushort" ||
    type === "uint16" ||
    type === "short" ||
    type === "int16"
  ) {
    return 65535;
  }
  if (
    type === "uint" ||
    type === "uint32" ||
    type === "int" ||
    type === "int32"
  ) {
    return 4294967295;
  }
  return 255;
}

class AsciiTokenReader {
  private offset: number;
  private readonly decoder = new TextDecoder("ascii");

  constructor(
    private readonly bytes: Uint8Array,
    offset: number,
  ) {
    this.offset = offset;
  }

  readCount(type: PlyScalarType): number {
    const count = this.readNumber(type);
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > this.bytes.length - this.offset
    ) {
      throw new Error("Invalid or oversized PLY list length.");
    }
    return count;
  }

  readNumber(type: PlyScalarType): number {
    const tokenStart = this.nextTokenStart();
    let tokenEnd = tokenStart;
    while (tokenEnd < this.bytes.length && this.bytes[tokenEnd] > 32) {
      tokenEnd += 1;
    }
    if (tokenEnd === tokenStart) {
      throw new Error("Unexpected end of ASCII PLY data.");
    }
    this.offset = tokenEnd;
    const token = this.decoder.decode(
      this.bytes.subarray(tokenStart, tokenEnd),
    );
    const value = INTEGER_TYPES.has(type)
      ? Number.parseInt(token, 10)
      : Number(token);
    if (
      !Number.isFinite(value) ||
      (INTEGER_TYPES.has(type) && !Number.isInteger(value))
    ) {
      throw new Error(`Invalid numeric value in ASCII PLY data: ${token}.`);
    }
    return value;
  }

  private nextTokenStart(): number {
    while (this.offset < this.bytes.length && this.bytes[this.offset] <= 32) {
      this.offset += 1;
    }
    return this.offset;
  }
}

function readBinaryCount(
  view: DataView,
  cursor: { offset: number },
  type: PlyScalarType,
  littleEndian: boolean,
): number {
  const count = readBinaryNumber(view, cursor, type, littleEndian);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid or oversized PLY list length.");
  }
  return count;
}

function readBinaryNumber(
  view: DataView,
  cursor: { offset: number },
  type: PlyScalarType,
  littleEndian: boolean,
): number {
  const sizes: Record<PlyScalarType, number> = {
    char: 1,
    int8: 1,
    uchar: 1,
    uint8: 1,
    short: 2,
    int16: 2,
    ushort: 2,
    uint16: 2,
    int: 4,
    int32: 4,
    uint: 4,
    uint32: 4,
    float: 4,
    float32: 4,
    double: 8,
    float64: 8,
  };
  const size = sizes[type];
  if (cursor.offset + size > view.byteLength) {
    throw new Error("Unexpected end of binary PLY data.");
  }

  const offset = cursor.offset;
  cursor.offset += size;
  switch (type) {
    case "char":
    case "int8":
      return view.getInt8(offset);
    case "uchar":
    case "uint8":
      return view.getUint8(offset);
    case "short":
    case "int16":
      return view.getInt16(offset, littleEndian);
    case "ushort":
    case "uint16":
      return view.getUint16(offset, littleEndian);
    case "int":
    case "int32":
      return view.getInt32(offset, littleEndian);
    case "uint":
    case "uint32":
      return view.getUint32(offset, littleEndian);
    case "float":
    case "float32":
      return view.getFloat32(offset, littleEndian);
    case "double":
    case "float64":
      return view.getFloat64(offset, littleEndian);
  }
}
