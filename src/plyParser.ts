import * as fs from 'fs';

export interface PlyVertex {
    x: number;
    y: number;
    z: number;
    r?: number;
    g?: number;
    b?: number;
}

export interface PlyFace {
    indices: number[];
}

export interface ParsedPly {
    vertices: PlyVertex[];
    faces: PlyFace[];
}

export function parsePlyFile(filePath: string): ParsedPly {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    let vertexCount = 0;
    let faceCount = 0;
    let currentIndex = 0;
    let headerDone = false;

    while (currentIndex < lines.length && !headerDone) {
        const line = lines[currentIndex].trim();
        if (!line) {
            currentIndex += 1;
            continue;
        }

        if (line === 'end_header') {
            headerDone = true;
            currentIndex += 1;
            break;
        }

        const parts = line.split(/\s+/);
        if (parts[0] === 'element' && parts[1] === 'vertex') {
            vertexCount = Number.parseInt(parts[2], 10);
        }
        if (parts[0] === 'element' && parts[1] === 'face') {
            faceCount = Number.parseInt(parts[2], 10);
        }

        currentIndex += 1;
    }

    if (!headerDone) {
        return { vertices: [], faces: [] };
    }

    const vertices: PlyVertex[] = [];
    for (let i = 0; i < vertexCount && currentIndex < lines.length; i += 1, currentIndex += 1) {
        const line = lines[currentIndex]?.trim();
        if (!line) {
            i -= 1;
            continue;
        }

        const values = line.split(/\s+/).map((value) => Number.parseFloat(value));
        if (values.length < 3) {
            continue;
        }

        const vertex: PlyVertex = {
            x: values[0],
            y: values[1],
            z: values[2],
        };

        if (values.length >= 6) {
            vertex.r = values[3];
            vertex.g = values[4];
            vertex.b = values[5];
        }

        vertices.push(vertex);
    }

    const faces: PlyFace[] = [];
    for (let i = 0; i < faceCount && currentIndex < lines.length; i += 1, currentIndex += 1) {
        const line = lines[currentIndex]?.trim();
        if (!line) {
            i -= 1;
            continue;
        }

        const values = line.split(/\s+/).map((value) => Number.parseInt(value, 10));
        if (values.length < 4) {
            continue;
        }

        const count = values[0];
        const indices = values.slice(1, 1 + count);
        faces.push({ indices });
    }

    return { vertices, faces };
}
