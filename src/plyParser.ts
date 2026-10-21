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

interface GaussianSplatPly {
  format: PlyFormat;
  bodyOffset: number;
  elements: PlyElement[];
  vertexElement: PlyElement;
}

export interface ParsedGaussianSplat {
  positions: Float32Array;
  colors: Float32Array;
  opacities: Float32Array;
  pointSizes: Float32Array;
  vertexCount: number;
}

const SH_C0 = 0.28209479177387814;
const REQUIRED_GAUSSIAN_PROPERTIES = [
  "x",
  "y",
  "z",
  "f_dc_0",
  "f_dc_1",
  "f_dc_2",
  "opacity",
  "scale_0",
  "scale_1",
  "scale_2",
  "rot_0",
] as const;
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
const SCALAR_TYPES = new Set<string>([
  ...INTEGER_TYPES,
  "float",
  "float32",
  "double",
  "float64",
]);

export function parseGaussianSplatPly(
  data: ArrayBuffer,
): ParsedGaussianSplat | undefined {
  const bytes = new Uint8Array(data);
  const header = parseHeader(bytes);
  const propertyNames = new Set(
    header.vertexElement.properties.map((property) => property.name),
  );
  if (!REQUIRED_GAUSSIAN_PROPERTIES.every((name) => propertyNames.has(name))) {
    return undefined;
  }

  const vertexCount = header.vertexElement.count;
  if (vertexCount === 0) {
    return undefined;
  }
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const opacities = new Float32Array(vertexCount);
  const pointSizes = new Float32Array(vertexCount);
  const reader =
    header.format === "ascii"
      ? new AsciiReader(bytes, header.bodyOffset)
      : new BinaryReader(data, header.bodyOffset, header.format);

  for (const element of header.elements) {
    for (let recordIndex = 0; recordIndex < element.count; recordIndex += 1) {
      let x: number | undefined;
      let y: number | undefined;
      let z: number | undefined;
      let red: number | undefined;
      let green: number | undefined;
      let blue: number | undefined;
      let opacity: number | undefined;
      let scaleX: number | undefined;
      let scaleY: number | undefined;
      let scaleZ: number | undefined;
      for (const property of element.properties) {
        if ("list" in property) {
          const count = reader.read(property.countType);
          if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error("Invalid PLY list length.");
          }
          for (let valueIndex = 0; valueIndex < count; valueIndex += 1) {
            reader.read(property.itemType);
          }
        } else {
          const value = reader.read(property.type);
          if (element === header.vertexElement) {
            switch (property.name) {
              case "x":
                x = value;
                break;
              case "y":
                y = value;
                break;
              case "z":
                z = value;
                break;
              case "f_dc_0":
                red = value;
                break;
              case "f_dc_1":
                green = value;
                break;
              case "f_dc_2":
                blue = value;
                break;
              case "opacity":
                opacity = value;
                break;
              case "scale_0":
                scaleX = value;
                break;
              case "scale_1":
                scaleY = value;
                break;
              case "scale_2":
                scaleZ = value;
                break;
            }
          }
        }
      }

      if (element !== header.vertexElement) {
        continue;
      }

      const offset = recordIndex * 3;
      positions[offset] = requireFinite(x, "x");
      positions[offset + 1] = requireFinite(y, "y");
      positions[offset + 2] = requireFinite(z, "z");
      colors[offset] = toColor(red);
      colors[offset + 1] = toColor(green);
      colors[offset + 2] = toColor(blue);
      opacities[recordIndex] = toOpacity(opacity);
      pointSizes[recordIndex] = toPointSize(scaleX, scaleY, scaleZ);
    }
    if (element === header.vertexElement) {
      break;
    }
  }

  return {
    positions,
    colors,
    opacities,
    pointSizes,
    vertexCount: header.vertexElement.count,
  };
}

function parseHeader(bytes: Uint8Array): GaussianSplatPly {
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

  const vertexElement = elements.find((element) => element.name === "vertex");
  if (!vertexElement) {
    throw new Error("PLY file does not contain a vertex element.");
  }
  return { format, bodyOffset, elements, vertexElement };
}

function parseScalarType(value: string | undefined): PlyScalarType {
  if (!value || !SCALAR_TYPES.has(value)) {
    throw new Error(`Unsupported PLY scalar type: ${value ?? "missing"}.`);
  }
  return value as PlyScalarType;
}

interface PlyReader {
  read(type: PlyScalarType): number;
}

class AsciiReader implements PlyReader {
  private offset: number;
  private readonly decoder = new TextDecoder("ascii");

  constructor(
    private readonly bytes: Uint8Array,
    offset: number,
  ) {
    this.offset = offset;
  }

  read(type: PlyScalarType): number {
    while (this.offset < this.bytes.length && this.bytes[this.offset] <= 32) {
      this.offset += 1;
    }
    const start = this.offset;
    while (this.offset < this.bytes.length && this.bytes[this.offset] > 32) {
      this.offset += 1;
    }
    if (start === this.offset) {
      throw new Error("PLY data ended before all declared values were read.");
    }
    const token = this.decoder.decode(this.bytes.subarray(start, this.offset));
    const value = INTEGER_TYPES.has(type)
      ? Number.parseInt(token, 10)
      : Number(token);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid PLY numeric value: ${token}.`);
    }
    return value;
  }
}

class BinaryReader implements PlyReader {
  private offset: number;
  private readonly view: DataView;
  private readonly littleEndian: boolean;

  constructor(
    data: ArrayBuffer,
    offset: number,
    format: Exclude<PlyFormat, "ascii">,
  ) {
    this.offset = offset;
    this.view = new DataView(data);
    this.littleEndian = format === "binary_little_endian";
  }

  read(type: PlyScalarType): number {
    const offset = this.offset;
    const view = this.view;
    let value: number;
    switch (type) {
      case "char":
      case "int8":
        value = view.getInt8(offset);
        this.offset += 1;
        break;
      case "uchar":
      case "uint8":
        value = view.getUint8(offset);
        this.offset += 1;
        break;
      case "short":
      case "int16":
        value = view.getInt16(offset, this.littleEndian);
        this.offset += 2;
        break;
      case "ushort":
      case "uint16":
        value = view.getUint16(offset, this.littleEndian);
        this.offset += 2;
        break;
      case "int":
      case "int32":
        value = view.getInt32(offset, this.littleEndian);
        this.offset += 4;
        break;
      case "uint":
      case "uint32":
        value = view.getUint32(offset, this.littleEndian);
        this.offset += 4;
        break;
      case "float":
      case "float32":
        value = view.getFloat32(offset, this.littleEndian);
        this.offset += 4;
        break;
      case "double":
      case "float64":
        value = view.getFloat64(offset, this.littleEndian);
        this.offset += 8;
        break;
    }
    return value;
  }
}

function requireFinite(value: number | undefined, property: string): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Gaussian PLY vertex has an invalid ${property} value.`);
  }
  return value;
}

function toColor(value: number | undefined): number {
  const channel = requireFinite(value, "f_dc");
  return Math.max(0, Math.min(1, 0.5 + SH_C0 * channel));
}

function toOpacity(value: number | undefined): number {
  const logit = requireFinite(value, "opacity");
  if (logit >= 0) {
    return 1 / (1 + Math.exp(-logit));
  }
  const exponential = Math.exp(logit);
  return exponential / (1 + exponential);
}

function toPointSize(
  scaleX: number | undefined,
  scaleY: number | undefined,
  scaleZ: number | undefined,
): number {
  const x = Math.exp(requireFinite(scaleX, "scale_0"));
  const y = Math.exp(requireFinite(scaleY, "scale_1"));
  const z = Math.exp(requireFinite(scaleZ, "scale_2"));
  const diameter = (2 * (x + y + z)) / 3;
  if (!Number.isFinite(diameter)) {
    throw new Error("Gaussian PLY vertex has an invalid scale.");
  }
  return diameter;
}
