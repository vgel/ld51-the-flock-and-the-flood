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

  public vertexToFaces: Record<number, number[]>;
  public faceToVertices: Record<number, number[]>;


  constructor(
    public readonly width: number,
    public readonly resolution: number, // quads per side
    generator: TerrainGen
  ) {
    super();

    const bufferSize = (this.numUniqueVertices * 2 + 1) * 9;

    this.positions = new THREE.BufferAttribute(new Float32Array(bufferSize), 3);
    this.setAttribute("position", this.positions);

    this.colors = new THREE.BufferAttribute(new Float32Array(bufferSize), 3);
    this.setAttribute("color", this.colors);

    this.heightmap = new Float32Array(this.numUniqueVertices);
    for (let i = 0; i < this.numUniqueVertices; i++) {
      const { x, y } = this.xyAtPointIndex(i);
      const sideLen = this.width / this.resolution;
      const heightStep = Math.sqrt(sideLen ** 2 + (sideLen / 2) ** 2); // solve the height of equilateral triangle
      const height = heightStep * this.resolution;
      this.heightmap[i] = generator.sample(x / this.width - 0.5, y / height - 0.5);
    }
  }

  // n quads per row,, n rows
  public get numQuads(): number {
    return this.resolution ** 2;
  }

  // for a (e.g.) triangles = 4 mesh, we want *5* points per row/col
  public get numUniqueVertices(): number {
    return (this.resolution + 1) ** 2;
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

  private xyAtPointIndex(index: number): { x: number; y: number } {
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

  private xyzAtPointIndex(index: number): { x: number; y: number; z: number } {
    const { x, y } = this.xyAtPointIndex(index);
    const z = this.heightmap[index];
    return { x, y, z };
  }

  // public flood(edgeWaterLevel: number) {
  //   this.faceWaterDepthScratch.set(this.faceWaterDepth);

  //   // set edges
  //   for (let i = 0; i < this.numUniqueVertices; i++) {
  //     const row = Math.floor(i / (this.resolution + 1));
  //     const col = i % (this.resolution + 1);
  //     const isEdge = row == 0 || col == 0 || row == this.resolution || col == this.resolution;
  //     if (isEdge) {
  //       for (let face of this.vertexToFaces[i]) {
  //         this.faceWaterDepthScratch[face] = edgeWaterLevel - this.faceMinHeight(face);
  //       }
  //     }
  //   }

  //   // spread to adj faces
  //   for (let face = 0; face < this.numQuads * 2; face++) {
  //     if (this.faceWaterDepth[face] > 0) {
  //       let totalHeight = this.faceMinHeight(face) + this.faceWaterDepth[face];
  //       for (let adjFace of this.adjacentFaces(face)) {
  //         let adjMinHeight = this.faceMinHeight(adjFace);
  //         if (adjMinHeight + this.faceWaterDepth[adjFace] < totalHeight) {
  //           this.faceWaterDepthScratch[adjFace] = totalHeight - adjMinHeight;
  //         }
  //       }
  //     }
  //   }

  //   this.faceWaterDepth.set(this.faceWaterDepthScratch);
  // }

  // calcVertexHeight(faceIdx: number, vertexIdx: number, minFaceHeight: number): number {
  //   let minWaterDepth = Infinity;
  //   for (let face of this.vertexToFaces[vertexIdx]) {
  //     minWaterDepth = Math.min(minWaterDepth, this.faceWaterDepth[face]);
  //     if (isNaN(minWaterDepth)) {
  //       console.log("nan!!", face, this.faceWaterDepth[face]);
  //     }
  //   }


  //   // if (minFaceHeight + minWaterDepth > this.heightmap[vertexIdx]) {
  //     return this.heightmap[vertexIdx] + minWaterDepth;
  //   // } else {
  //   //   return this.heightmap[vertexIdx];
  //   // }
  // }

  /**
   * NOTE: a, b, and c are NOT indexes into the position buffer, they are arbitrary
   * numbers that we generate in setupVertices.
   */
  private setFace(
    colorMap: (z: number, waterDepth: number) => THREE.Color,
    faceIdx: number,
    a: number,
    b: number,
    c: number
  ) {
    // set positions / adjacency
    // TODO: kinda wasteful to set this each time it's modified instead of checking if dirty
    this.faceToVertices[faceIdx] = [a, b, c];
    this.vertexToFaces[a] ??= [];
    this.vertexToFaces[a].push(faceIdx);
    this.vertexToFaces[b] ??= [];
    this.vertexToFaces[b].push(faceIdx);
    this.vertexToFaces[c] ??= [];
    this.vertexToFaces[c].push(faceIdx);

    const pA = this.xyzAtPointIndex(a);
    const pB = this.xyzAtPointIndex(b);
    const pC = this.xyzAtPointIndex(c);

    const minZ = Math.min(pA.z, pB.z, pC.z);
    const maxZ = Math.max(pA.z, pB.z, pC.z);
    const color = colorMap(
      maxZ,
      // don't color the face as water unless it's entirely underwater
      0,//maxZ - minZ > this.faceWaterDepth[faceIdx] ? 0 : this.faceWaterDepth[faceIdx]
    );

    // set vertex colors
    for (let i = 0; i < 3; i++) {
      this.colors.setXYZ(faceIdx * 3 + i, color.r, color.g, color.b);
    }

    // const minFaceHeight = this.faceMinHeight(faceIdx);

    this.positions.setXYZ(faceIdx * 3 + 0, pA.x, pA.y, pA.z);
    this.positions.setXYZ(faceIdx * 3 + 1, pB.x, pB.y, pB.z);
    this.positions.setXYZ(faceIdx * 3 + 2, pC.x, pC.y, pC.z);
  }

  public setupVertices(colorMap: (z: number, waterDepth: number) => THREE.Color) {
    const r = this.resolution;

    this.faceToVertices = {};
    this.vertexToFaces = {};

    for (let n = 0; n < this.numUniqueVertices; n++) {
      const row = Math.floor(n / (r + 1));
      const col = n % (r + 1);

      if (row !== r && col !== r) {
        const rowIsEven = row % 2 === 0;
        if (!rowIsEven) {
          this.setFace(colorMap, n * 2 + 0, n, n + 1, n + r + 1);
          this.setFace(colorMap, n * 2 + 1, n + 1, n + r + 2, n + r + 1);
        } else {
          this.setFace(colorMap, n * 2 + 0, n, n + r + 2, n + r + 1);
          this.setFace(colorMap, n * 2 + 1, n, n + 1, n + r + 2);
        }
      }

      (this.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

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
}
