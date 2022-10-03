import * as THREE from "three";
import { BufferAttribute } from "three";

export class Rain {
  public material: THREE.PointsMaterial;
  public positions: THREE.BufferAttribute;
  public geometry: THREE.BufferGeometry;
  public points: THREE.Points;
  public velocities: Float32Array;

  constructor(rainColor: THREE.Color, dropSize: number, public rainCount: number, public spread: number) {
    this.material = new THREE.PointsMaterial({
      color: rainColor,
      size: dropSize,
      transparent: true,
    });

    this.geometry = new THREE.BufferGeometry();
    this.positions = new BufferAttribute(new Float32Array(rainCount * 3), 3);
    this.geometry.setAttribute("position", this.positions);
    this.positions.needsUpdate = true;

    for (let i = 0; i < rainCount; i++) {
      this.positions.setXYZ(
        i,
        Math.random() * spread - spread / 2,
        Math.random() * spread - spread / 2,
        Math.random() * spread * 2 - spread / 2
      );
    }

    this.points = new THREE.Points(this.geometry, this.material);

    this.velocities = new Float32Array(rainCount);
    for (let i = 0; i < this.rainCount; i++) {
      this.velocities[i] = -Math.random() * 5 - 15;
    }
  }

  public tick() {
    for (let i = 0; i < this.rainCount; i++) {
      this.velocities[i] -= 0.1 + Math.random() * 0.1;
      const z = this.positions.getZ(i) + this.velocities[i];
      if (z < -this.spread / 4) {
        this.velocities[i] = -Math.random() * 5 - 15;
        this.positions.setXYZ(
          i,
          Math.random() * this.spread - this.spread / 2,
          Math.random() * this.spread - this.spread / 2,
          Math.random() * this.spread - this.spread / 2
        );
      } else {
        this.positions.setZ(i, z);
      }
    }
    this.positions.needsUpdate = true;
  }
}
