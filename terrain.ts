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

  constructor(
    public readonly width: number,
    public readonly resolution: number // quads per side
  ) {
    super();

    const bufferSize = (this.numUniqueVertices * 2 + 1) * 9;

    this.positions = new THREE.BufferAttribute(new Float32Array(bufferSize), 3);
    this.setAttribute("position", this.positions);

    this.colors = new THREE.BufferAttribute(new Float32Array(bufferSize), 3);
    this.setAttribute("color", this.colors);
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

  private vertexAtIndex(generator: TerrainGen, index: number) {
    const sideLen = this.width / this.resolution;
    const heightStep = Math.sqrt(sideLen ** 2 + (sideLen / 2) ** 2); // solve the height of equilateral triangle
    const height = heightStep * this.resolution;

    const row = Math.floor(index / (this.resolution + 1));
    const col = index % (this.resolution + 1);

    const x = col * sideLen + (row % 2 === 0 ? sideLen / 2 : 0); // jagged edge;
    const y = row * heightStep;
    return {
      x,
      y,
      z: generator.sample(x / this.width - 0.5, y / height - 0.5),
    };
  }

  private setTriangle(
    generator: TerrainGen,
    colorMap: (z: number) => THREE.Color,
    waterLevel: number,
    indexes: number[],
    triangleOffset: number
  ) {
    const points = indexes.map((i) => this.vertexAtIndex(generator, i));
    const maxZ = points.reduce((l, r) => (l.z > r.z ? l : r)).z;
    const color = colorMap(maxZ);

    for (let i = 0; i < points.length; i++) {
      const { x, y, z } = points[i];
      const offset = triangleOffset + i * 3;

      this.positions.set([x, y, Math.max(waterLevel, z)], offset);
      this.colors.set(color.toArray(), offset);
    }
  }

  public setupVertices(generator: TerrainGen, colorMap: (z: number) => THREE.Color, waterLevel: number) {
    const r = this.resolution;

    for (let n = 0; n < this.numUniqueVertices; n++) {
      const row = Math.floor(n / (r + 1));
      const col = n % (r + 1);

      if (row !== r && col !== r) {
        const rowIsEven = row % 2 === 0;
        if (!rowIsEven) {
          this.setTriangle(generator, colorMap, waterLevel, [n, n + 1, n + r + 1], n * 18 + 0);
          this.setTriangle(generator, colorMap, waterLevel, [n + 1, n + r + 2, n + r + 1], n * 18 + 9);
        } else {
          this.setTriangle(generator, colorMap, waterLevel, [n, n + r + 2, n + r + 1], n * 18 + 0);
          this.setTriangle(generator, colorMap, waterLevel, [n, n + 1, n + r + 2], n * 18 + 9);
        }
      }

      (this.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    this.computeBoundingSphere();
    this.computeVertexNormals();
  }
}
