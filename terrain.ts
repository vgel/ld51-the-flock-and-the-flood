import alea from "alea";
import { createNoise3D, NoiseFunction3D } from "simplex-noise";
import * as THREE from "three";

export class TerrainGen {
  private readonly noise: NoiseFunction3D;
  private readonly maxValue: number;

  constructor(
    public readonly heightStretch: number,
    public readonly baseLayer: (x: number, y: number) => number,
    public readonly octaves: number,
    public readonly scale: number,
    public readonly lacunarity: number,
    public readonly persistence: number,
    public readonly seed: string
  ) {
    this.noise = createNoise3D(alea(seed));

    // calculate the max possible value so we can rescale samples back to [-1, 1]
    this.maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      this.maxValue += Math.pow(persistence, i);
    }
  }

  public sample(x: number, y: number): number {
    let r = this.baseLayer(x, y) * this.maxValue;
    for (let i = 0; i < this.octaves; i++) {
      r += this.sampleOctave(i, x, y);
    }
    return (r / this.maxValue) * this.heightStretch;
  }

  private sampleOctave(octave: number, x: number, y: number): number {
    const lac = this.scale * Math.pow(this.lacunarity, octave);
    const per = Math.pow(this.persistence, octave);
    return this.noise(x * lac, y * lac, octave / this.octaves) * per;
  }

  public fertility(x: number, y: number): number {
    // Z offset to avoid correlation with terrain
    const raw = (this.noise(x * 5, y * 5, 1000) + 1) / 2;

    const distFromCenter = Math.sqrt(x**2 + y**2);

    const f = Math.max(0, Math.min(1, raw * 1.5 * distFromCenter + 0.1));
    return f > 0.5 ? f + 2 : f;
  }
}

export class TerrainGeometry extends THREE.BufferGeometry {
  // A jagged-edge mesh of equilateral triangles:
  //       C---D---E---F
  //      / \ / \ / \ /
  //     8---9---A---B
  //      \ / \ / \ / \
  //       4---5---6---7
  //      / \ / \ / \ /
  //     0---1---2---3

  public readonly positions: THREE.BufferAttribute;
  public readonly colors: THREE.BufferAttribute;
  public readonly heightmap: Float32Array;

  public faces: number[];
  public vertexToFaces: Record<number, number[]>;
  public faceToVertices: Record<number, number[]>;
  public faceGrass: Record<number, number>;

  public vertexWaterDepth: Float32Array;
  scratchVertexWaterDepth: Float32Array;

  highlightedFace: number | null = null;

  public readonly highestFace: number;
  public readonly highestVertex: number;

  constructor(
    public readonly width: number,
    public readonly resolution: number, // quads per side
    public readonly colorMap: (z: number, grassAmount: number, waterDepth: number) => THREE.Color,
    generator: TerrainGen
  ) {
    super();

    const bufferSize = (this.numUniqueVertices() * 2 + 1) * 9;

    this.positions = new THREE.BufferAttribute(new Float32Array(bufferSize), 3);
    this.setAttribute("position", this.positions);

    this.colors = new THREE.BufferAttribute(new Float32Array(bufferSize), 3);
    this.setAttribute("color", this.colors);

    const sideLen = this.width / this.resolution;
    const heightStep = Math.sqrt(sideLen ** 2 + (sideLen / 2) ** 2); // solve the height of equilateral triangle
    const height = heightStep * this.resolution;

    this.heightmap = new Float32Array(this.numUniqueVertices());
    for (let i = 0; i < this.numUniqueVertices(); i++) {
      const { x, y } = this.xyAtPointIndex(i);
      this.heightmap[i] = generator.sample(x / this.width - 0.5, y / height - 0.5);
    }

    this.vertexWaterDepth = new Float32Array(this.numUniqueVertices());
    this.vertexWaterDepth.fill(0);
    this.scratchVertexWaterDepth = new Float32Array(this.vertexWaterDepth.length);
    this.scratchVertexWaterDepth.fill(0);

    this.faces = [];
    this.faceToVertices = {};
    this.vertexToFaces = {};
    this.faceGrass = {};

    const initFace = (faceIdx: number, a: number, b: number, c: number) => {
      this.faces.push(faceIdx);
      this.faceToVertices[faceIdx] = [a, b, c];
      this.vertexToFaces[a] ??= [];
      this.vertexToFaces[a].push(faceIdx);
      this.vertexToFaces[b] ??= [];
      this.vertexToFaces[b].push(faceIdx);
      this.vertexToFaces[c] ??= [];
      this.vertexToFaces[c].push(faceIdx);

      const { x, y } = this.xyFaceCenter(faceIdx);
      this.faceGrass[faceIdx] = generator.fertility(x / this.width - 0.5, y / height - 0.5);
    };

    const r = this.resolution;
    for (let n = 0; n < this.numUniqueVertices(); n++) {
      const row = Math.floor(n / (r + 1));
      const col = n % (r + 1);

      if (row !== r && col !== r) {
        const rowIsEven = row % 2 === 0;
        if (!rowIsEven) {
          initFace(n * 2 + 0, n, n + 1, n + r + 1);
          initFace(n * 2 + 1, n + 1, n + r + 2, n + r + 1);
        } else {
          initFace(n * 2 + 0, n, n + r + 2, n + r + 1);
          initFace(n * 2 + 1, n, n + 1, n + r + 2);
        }
      }
    }

    let highestFace = this.faces[0];
    let highestFaceHeight = -Infinity;
    for (let faceIdx of this.faces) {
      const height = this.xyzFaceCenter(faceIdx).z;
      if (height > highestFaceHeight) {
        highestFace = faceIdx;
        highestFaceHeight = height;
      }
    }
    this.highestFace = highestFace;

    let highestVertex = 0;
    let highestVertexHeight = -Infinity;
    for (let i = 0; i < this.numUniqueVertices(); i++) {
      if (this.heightmap[i] > highestVertexHeight) {
        highestVertex = i;
        highestVertexHeight = this.heightmap[i];
      }
    }
    this.highestVertex = highestVertex;
  }

  // n quads per row,, n rows
  public numQuads(): number {
    return this.resolution ** 2;
  }

  // for a (e.g.) triangles = 4 mesh, we want *5* points per row/col
  public numUniqueVertices(): number {
    return (this.resolution + 1) ** 2;
  }

  public setHighlightedFace(newHighlightedFace: number) {
    const oldHighlightedFace = this.highlightedFace;
    this.highlightedFace = newHighlightedFace;
    if (oldHighlightedFace != null) {
      this.setFaceColor(this.getFaceColor(oldHighlightedFace), oldHighlightedFace);
    }
    this.setFaceColor(this.getFaceColor(this.highlightedFace), this.highlightedFace);
  }

  // To form the triangles for a mesh, it's easier to think in
  // quads (pairs of triangles). We can think of each vertex that's
  // not in the last row or column as "owning" the quad with it
  // at the quad's bottom-left corner:
  //        C---D---E---F
  //       /8\8/9\9/A\A/
  //      8---9---A---B
  //       \4/4\5/5\6/6\
  //        4---5---6---7
  //       /0\0/1\1/2\2/
  //      0---1---2---3
  // that gives us resolution ^ 2 * 2 triangles. The quads are:
  //     owned by 0, even row: 0, 1, 4; 1, 5, 4;
  //     owned by 1, even row: 1, 2, 5; 2, 6, 5;
  //     owned by 2, even row: 2, 3, 6; 3, 7, 6;
  //     skip 3
  //     owned by 4,  odd row: 4, 9, 8; 4, 5, 9;
  //     owned by 5,  odd row: 5, A, 9; 5, 6, A;
  //     ...
  // or, more generally:
  //     odd rows:  n,     n + 1, n + r + 1 ; n + 1, n + r + 2, n + r + 1
  //     even rows: n, n + r + 2, n + r + 1 ;     n,     n + 1, n + r + 2

  public xyAtPointIndex(index: number): { x: number; y: number } {
    const sideLen = this.width / this.resolution;
    const heightStep = Math.sqrt(sideLen ** 2 + (sideLen / 2) ** 2); // solve the height of equilateral triangle

    const row = Math.floor(index / (this.resolution + 1));
    const col = index % (this.resolution + 1);

    const x = col * sideLen + (row % 2 === 0 ? sideLen / 2 : 0); // jagged edge;
    const y = row * heightStep;
    return {
      x,
      y,
    };
  }

  public xyzAtPointIndex(index: number): { x: number; y: number; z: number } {
    const { x, y } = this.xyAtPointIndex(index);
    const z = this.heightmap[index];
    return { x, y, z };
  }

  public xyFaceCenter(faceIndex: number): { x: number; y: number } {
    const [a, b, c] = this.faceToVertices[faceIndex];
    const { x: ax, y: ay } = this.xyAtPointIndex(a);
    const { x: bx, y: by } = this.xyAtPointIndex(b);
    const { x: cx, y: cy } = this.xyAtPointIndex(c);
    return {
      x: (ax + bx + cx) / 3,
      y: (ay + by + cy) / 3,
    };
  }

  public xyzFaceCenter(faceIndex: number): { x: number, y: number, z: number } {
    const { x, y } = this.xyFaceCenter(faceIndex);
    let z = 0;
    for (let v of this.faceToVertices[faceIndex]) {
      z += this.heightmap[v];
    }
    z /= 3;
    return { x, y, z };
  }

  public flood(edgeWaterLevel: number): boolean {
    this.scratchVertexWaterDepth.set(this.vertexWaterDepth);

    for (let i = 0; i < this.numUniqueVertices(); i++) {
      const row = Math.floor(i / (this.resolution + 1));
      const col = i % (this.resolution + 1);
      const isEdge = row == 0 || col == 0 || row == this.resolution || col == this.resolution;
      if (isEdge) {
        this.scratchVertexWaterDepth[i] = edgeWaterLevel - this.heightmap[i];
      } else {
        // spread to adj vertices
        for (let face of this.vertexToFaces[i]) {
          for (let j of this.faceToVertices[face]) {
            if (i !== j) {
              if (
                this.vertexWaterDepth[j] > 0 &&
                this.heightmap[j] + this.vertexWaterDepth[j] > this.heightmap[i] + this.scratchVertexWaterDepth[i]
              ) {
                this.scratchVertexWaterDepth[i] = Math.max(
                  this.scratchVertexWaterDepth[i],
                  this.heightmap[j] + this.vertexWaterDepth[j] - this.heightmap[i]
                );
              }
            }
          }
        }
      }
    }

    let changed = false;
    for (let i = 0; i < this.scratchVertexWaterDepth.length; i++) {
      if (Math.abs(this.scratchVertexWaterDepth[i] - this.vertexWaterDepth[i]) > 0.01) {
        changed = true;
        this.vertexWaterDepth.set(this.scratchVertexWaterDepth);
        break;
      }
    }
    return changed;
  }

  private getFaceColor(faceIdx: number): THREE.Color {
    const [a, b, c] = this.faceToVertices[faceIdx];
    const pA = this.xyzAtPointIndex(a);
    const pB = this.xyzAtPointIndex(b);
    const pC = this.xyzAtPointIndex(c);

    // switch face coloring modes: partially above water, pick the highest total point so the water doesn't
    // appear to flow uphill, but when all are below water, pick the highest water depth to prevent flickering
    let faceWaterDepth: number;
    if (this.vertexWaterDepth[a] > 0 && this.vertexWaterDepth[b] > 0 && this.vertexWaterDepth[c] > 0) {
      faceWaterDepth = Math.max(this.vertexWaterDepth[a], this.vertexWaterDepth[b], this.vertexWaterDepth[c]);
    } else {
      const pATotalHeight = pA.z + this.vertexWaterDepth[a];
      const pBTotalHeight = pB.z + this.vertexWaterDepth[b];
      const pCTotalHeight = pC.z + this.vertexWaterDepth[c];
      const maxTotalHeight = Math.max(pATotalHeight, pBTotalHeight, pCTotalHeight);
      faceWaterDepth =
        this.vertexWaterDepth[maxTotalHeight == pATotalHeight ? a : maxTotalHeight == pBTotalHeight ? b : c];
    }

    const color = this.colorMap(Math.max(pA.z, pB.z, pC.z), this.faceGrass[faceIdx], faceWaterDepth);
    if (faceIdx === this.highlightedFace) {
      color.multiplyScalar(1.5);
    }
    return color;
  }

  private setFaceColor(color: THREE.Color, faceIdx: number) {
    for (let i = 0; i < 3; i++) {
      this.colors.setXYZ(faceIdx * 3 + i, color.r, color.g, color.b);
    }
    // cheap to set (bumps internal version number)
    (this.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * NOTE: a, b, and c are NOT indexes into the position buffer, they are semi-arbitrary
   * numbers that we generate in setupVertices that uniquely identify vertices.
   */
  private setFace(faceIdx: number, a: number, b: number, c: number) {
    this.setFaceColor(this.getFaceColor(faceIdx), faceIdx);

    const pA = this.xyzAtPointIndex(a);
    const pB = this.xyzAtPointIndex(b);
    const pC = this.xyzAtPointIndex(c);

    this.positions.setXYZ(faceIdx * 3 + 0, pA.x, pA.y, pA.z + this.vertexWaterDepth[a]);
    this.positions.setXYZ(faceIdx * 3 + 1, pB.x, pB.y, pB.z + this.vertexWaterDepth[b]);
    this.positions.setXYZ(faceIdx * 3 + 2, pC.x, pC.y, pC.z + this.vertexWaterDepth[c]);
  }

  public setupVertices() {
    const r = this.resolution;

    for (let n = 0; n < this.numUniqueVertices(); n++) {
      const row = Math.floor(n / (r + 1));
      const col = n % (r + 1);

      if (row !== r && col !== r) {
        const rowIsEven = row % 2 === 0;
        if (!rowIsEven) {
          this.setFace(n * 2 + 0, n, n + 1, n + r + 1);
          this.setFace(n * 2 + 1, n + 1, n + r + 2, n + r + 1);
        } else {
          this.setFace(n * 2 + 0, n, n + r + 2, n + r + 1);
          this.setFace(n * 2 + 1, n, n + 1, n + r + 2);
        }
      }
    }

    (this.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.computeBoundingSphere();
    this.computeVertexNormals();
  }

  /** Returns faces with two shared vertices with the given face. Will not return the given face. */
  public adjacentFaces(faceIdx: number): number[] {
    const adj = new Map<number, number>();
    for (let vertex of this.faceToVertices[faceIdx]) {
      for (let otherFace of this.vertexToFaces[vertex]) {
        if (otherFace !== faceIdx) {
          if (adj.has(otherFace)) {
            adj.set(otherFace, 2);
          } else {
            adj.set(otherFace, 1);
          }
        }
      }
    }
    return [...adj.entries()].filter(([_, v]) => v == 2).map(([k, v]) => k);
  }

  public adjacentPoints(pointIndex: number): number[] {
    const adj = new Set<number>();
    for (let face of this.vertexToFaces[pointIndex]) {
      for (let point of this.faceToVertices[face]) {
        if (point != pointIndex) {
          adj.add(point);
        }
      }
    }
    return [...adj];
  }

  public faceVerticesAllWater(faceIdx: number): boolean {
    for (let v of this.faceToVertices[faceIdx]) {
      if (this.vertexWaterDepth[v] === 0) {
        return false;
      }
    }
    return true;
  }
}
