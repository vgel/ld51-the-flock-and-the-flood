import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { TerrainGen, TerrainGeometry } from "./terrain";
import {
  makeFlagSprite,
  makeMonolith1Sprite,
  makeMonolith2Sprite,
  makeMonolithPillarSprite,
  makeSheepSprite,
} from "./sprites";
import { assert, shuffle } from "./utils";
import { Rain } from "./rain";
import { SoundEffect } from "./sounds";

function colorMap(height: number, grassAmount: number, waterDepth: number) {
  if (waterDepth <= 0) {
    if (height > 120) {
      return new THREE.Color(0xcccccc); // white
    } else if (height > 30) {
      return new THREE.Color(0x6e5f3f); // brown
    } else if (grassAmount <= 0.05) {
      return new THREE.Color(0xc1cc8f); // sage / yellow
    } else if (grassAmount < 0.5) {
      return new THREE.Color(0x5e9c48); // green
    } else {
      return new THREE.Color(0x3c622d);
    }
  }

  if (waterDepth < 40) {
    return new THREE.Color(0x3e538e); // light blue
  } else if (waterDepth < 90) {
    return new THREE.Color(0x324371); // lightish blue
  } else {
    return new THREE.Color(0x273459); // darkish blue
  }
}

class Sheep {
  public faceIndex: number = -1;
  public slot: number = 0;
  public sprite: THREE.Sprite;
  public isDead = false;

  movement: null | {
    progress: number;
    startPosition: THREE.Vector3;
    endPosition: THREE.Vector3;
  } = null;

  constructor() {
    this.sprite = makeSheepSprite();
    this.sprite.position.set(0, 0, 1000);
  }

  public tick() {
    if (this.movement !== null) {
      this.movement.progress += 1 / 10;
      this.sprite.position.copy(this.movement.startPosition);
      this.sprite.position.lerp(this.movement.endPosition, this.movement.progress);
      if (this.movement.progress >= 1) {
        this.sprite.position.copy(this.movement.endPosition);
        this.movement = null;
      }
    }
  }

  public die() {
    this.isDead = true;
    this.sprite.removeFromParent();
  }

  public startMovement(towardsFaceIndex: number, slot: number, endPosition: THREE.Vector3) {
    this.faceIndex = towardsFaceIndex;
    this.slot = slot;
    this.movement = {
      progress: 0,
      startPosition: this.sprite.position.clone(),
      endPosition,
    };
  }
}

class App {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;
  public readonly scene: THREE.Scene;

  public readonly terrain: TerrainGeometry;
  public readonly terrainMesh: THREE.Mesh;
  public readonly oceanPlane: THREE.Mesh;
  public readonly rain: Rain;
  public readonly flagSprite: THREE.Sprite;
  public readonly meshSize: number;
  public readonly monolith1Sprite: THREE.Object3D;
  public readonly monolith2Sprite: THREE.Object3D;
  public readonly monolithPillarSprites: THREE.Object3D[];

  public readonly sheepBaaSound = new SoundEffect("sheepBaa", 60, 60);
  public readonly sheepEatSound = new SoundEffect("sheepEat", 60, 60);

  public sheep: Sheep[] = [];
  public faceSheepSlotFree: Record<number, [boolean, boolean, boolean]> = {};
  public flockingPoint: number | null = null;
  public waterLevel: number;
  public waterCounter = 0;
  public frame = 0;
  public sheepStoredFood = 0;
  public templeLevel = 1;

  constructor({
    backgroundColor = 0x4f4f4f,
    camera: { fov = 70, nearPlane = 0.01, farPlane = 1e5, position: cameraPosition = [450, 650, 250] } = {},
    lights = [
      { light: new THREE.HemisphereLight(0x000000, 0xffffff, 0.95), position: [0, -50, -100] },
      { light: new THREE.AmbientLight(0xaaccff, 0.35), position: [-200, -100, 200] },
    ],
    meshSize = 1000,
    seed = "nauthiel",
    initialWaterLevel = -70,
  } = {}) {
    this.waterLevel = initialWaterLevel;
    this.meshSize = meshSize;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(backgroundColor, 1);
    document.querySelector("main")!.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(fov, 0, nearPlane, farPlane); // aspect = 0 for now
    this.camera.position.fromArray(cameraPosition);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2.5;

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    this.scene.fog = new THREE.FogExp2(backgroundColor, 0.0005);

    const generator = new TerrainGen(
      150,
      (x, y) => {
        return 0.6 - 2.25 * Math.sqrt(x ** 2 + y ** 2);
      },
      5,
      3,
      1.8,
      0.5,
      seed
    );
    this.terrain = new TerrainGeometry(meshSize, 35, colorMap, generator);
    this.terrain.setupVertices();
    const terrainMaterial = new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.terrainMesh = new THREE.Mesh(this.terrain, terrainMaterial);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.position.set(0, -100, -150);
    this.terrainMesh.frustumCulled = false;
    this.scene.add(this.terrainMesh);

    this.rain = new Rain(new THREE.Color(0x8888ff), 5, 400, meshSize * 2);
    this.rain.points.position.set(meshSize / 2, meshSize / 2, 0);
    this.terrainMesh.add(this.rain.points);

    const planeGeometry = new THREE.PlaneGeometry(100000, 100000, 100, 100);
    this.oceanPlane = new THREE.Mesh(
      planeGeometry,
      new THREE.MeshPhongMaterial({
        flatShading: true,
        color: 0x273459,
      })
    );
    this.terrainMesh.add(this.oceanPlane);

    this.flagSprite = makeFlagSprite();
    this.terrainMesh.add(this.flagSprite);

    this.monolith1Sprite = makeMonolith1Sprite();
    this.monolith2Sprite = makeMonolith2Sprite();
    this.monolithPillarSprites = [
      makeMonolithPillarSprite(),
      makeMonolithPillarSprite(),
      makeMonolithPillarSprite(),
      makeMonolithPillarSprite(),
      makeMonolithPillarSprite(),
      makeMonolithPillarSprite(),
    ];

    {
      const { x, y, z } = this.terrain.xyzAtPointIndex(this.terrain.highestVertex);
      this.monolith1Sprite.position.set(x, y, z + 12);
      this.monolith2Sprite.position.set(x, y, z + 30);

      const neighbors = this.terrain.adjacentPoints(this.terrain.highestVertex);
      for (let i = 0; i < neighbors.length; i++) {
        const { x, y, z } = this.terrain.xyzAtPointIndex(neighbors[i]);
        this.monolithPillarSprites[i].position.set(x, y, z + 30);
      }
    }
    this.terrainMesh.add(this.monolith1Sprite);

    for (const { light, position } of lights) {
      this.scene.add(light);
      light.position.fromArray(position);
    }

    window.onresize = () => this.setSize();
    this.setSize();
  }

  public setSize() {
    const x = window.innerWidth;
    const y = window.innerHeight;
    this.renderer.setSize(x, y);
    this.camera.aspect = x / y;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  public render() {
    // it doesn't move equal with the water level, but it only looks a little wonky
    this.oceanPlane.position.set(0, 0, this.waterLevel - 30);

    this.controls.target.copy(this.terrainMesh.position);
    this.controls.target.x += this.meshSize / 2;
    this.controls.target.y += Math.max(0, this.waterLevel);
    this.controls.target.z += -this.meshSize / 2;

    this.tick();
    this.renderer.render(this.scene, this.camera);
    this.controls.update();
    this.frame++;
  }

  countSheepOnFace(faceIndex: number): number {
    let faceSheepCount = 0;
    for (let sheep of this.sheep) {
      if (faceIndex == sheep.faceIndex) {
        faceSheepCount++;
      }
    }
    return faceSheepCount;
  }

  canSetSheepOnFace(faceIndex: number): boolean {
    if (this.terrain.faceVerticesAllWater(faceIndex)) {
      return false;
    }

    const slots = this.faceSheepSlotFree[faceIndex];
    if (!slots) {
      return true;
    } else {
      return slots[0] || slots[1] || slots[2];
    }
  }

  setSheepOnFace(sheep: Sheep, faceIndex: number) {
    // for (let i = 0; i < 3; i++) {
    //   this.terrain.colors.setXYZ(faceIndex * 3 + i, 1, 0, 0);
    // }
    // for (let adj of this.terrain.adjacentFaces(faceIndex)) {
    //   for (let i = 0; i < 3; i++) {
    //     this.terrain.colors.setXYZ(adj * 3 + i, 0, 1, 0);
    //   }
    // }
    // this.terrain.colors.needsUpdate = true;

    const tPos = this.terrain.positions;

    const faceCenterX = (tPos.getX(faceIndex * 3) + tPos.getX(faceIndex * 3 + 1) + tPos.getX(faceIndex * 3 + 2)) / 3;
    const faceCenterY = (tPos.getY(faceIndex * 3) + tPos.getY(faceIndex * 3 + 1) + tPos.getY(faceIndex * 3 + 2)) / 3;
    const faceCenterZ = (tPos.getZ(faceIndex * 3) + tPos.getZ(faceIndex * 3 + 1) + tPos.getZ(faceIndex * 3 + 2)) / 3;

    this.faceSheepSlotFree[faceIndex] ??= [true, true, true];
    const slots = [0, 1, 2];
    shuffle(slots);
    let slot;
    for (let i of slots) {
      if (this.faceSheepSlotFree[faceIndex][i]) {
        slot = i;
        break;
      }
    }
    if (slot === undefined) {
      console.error("caller failed to check face was available");
      return;
    }
    if (this.faceSheepSlotFree[sheep.faceIndex]) {
      this.faceSheepSlotFree[sheep.faceIndex][sheep.slot] = true;
    }
    this.faceSheepSlotFree[faceIndex][slot] = false;

    const vertex = faceIndex * 3 + slot;
    const wander = Math.random() + 1;
    const tx = (tPos.getX(vertex) + faceCenterX * wander) / (1 + wander);
    const ty = (tPos.getY(vertex) + faceCenterY * wander) / (1 + wander);
    const tz = (tPos.getZ(vertex) + faceCenterZ * wander) / (1 + wander);

    sheep.startMovement(faceIndex, slot, new THREE.Vector3(tx, ty, tz + 7));
  }

  trySpawnSheep(): boolean {
    let seen = new Set<number>();
    let faces = [this.flockingPoint!];

    while (faces.length > 0) {
      let face = faces.shift()!;
      if (seen.has(face)) {
        continue;
      }
      if (this.canSetSheepOnFace(face)) {
        const sheep = new Sheep();
        this.setSheepOnFace(sheep, face);
        this.terrainMesh.add(sheep.sprite);
        this.sheep.push(sheep);
        return true;
      }
      seen.add(face);
      for (const adj of this.terrain.adjacentFaces(face)) {
        if (!seen.has(adj)) {
          faces.push(adj);
        }
      }
    }

    return false;
  }

  public slowTick() {
    if (this.terrain.flood(this.waterLevel)) {
      console.log("flood", this.waterLevel);
      this.terrain.setupVertices();
    }

    for (let sheep of this.sheep) {
      if (sheep.movement !== null) {
        continue;
      }

      let adj = this.terrain.adjacentFaces(sheep.faceIndex);
      if (Math.random() < 0.005) {
        // try to move the sheep randomly
        shuffle(adj);
        for (let adjFaceIndex of adj) {
          if (this.canSetSheepOnFace(adjFaceIndex)) {
            this.setSheepOnFace(sheep, adjFaceIndex);
            break;
          }
        }
      } else {
        // try to move the sheep back towards the flocking point
        assert(this.flockingPoint != null, "flocking point unexpectedly null!");
        let target = this.terrain.xyFaceCenter(this.flockingPoint);
        let best = sheep.faceIndex;
        let bestXY = this.terrain.xyFaceCenter(best);
        let bestDistSq = (bestXY.x - target.x) ** 2 + (bestXY.y - target.y) ** 2;
        for (let adjFaceIndex of adj) {
          if (!this.canSetSheepOnFace(adjFaceIndex)) {
            continue;
          }
          const adjFaceXY = this.terrain.xyFaceCenter(adjFaceIndex);
          const adjFaceDistSq = (adjFaceXY.x - target.x) ** 2 + (adjFaceXY.y - target.y) ** 2;
          if (adjFaceDistSq < bestDistSq) {
            best = adjFaceIndex;
            bestXY = adjFaceXY;
            bestDistSq = adjFaceDistSq;
          }
        }
        if (best != sheep.faceIndex) {
          this.setSheepOnFace(sheep, best);
        }
      }

      const currentGrass = this.terrain.faceGrass[sheep.faceIndex];
      const eaten = Math.min(currentGrass, 0.005);
      this.sheepStoredFood += eaten;
      this.terrain.faceGrass[sheep.faceIndex] -= eaten;
    }

    if (this.sheepStoredFood > 5) {
      if (this.trySpawnSheep()) {
        console.log("spawned sheep");
        this.sheepStoredFood -= 5;
        this.sheepBaaSound.play();
      }
    }

    if (this.templeLevel == 1 && this.sheep.length >= 30) {
      this.templeLevel = 2;
      this.monolith1Sprite.removeFromParent();
      this.terrainMesh.add(this.monolith2Sprite);
    } else if (this.templeLevel == 2 && this.sheep.length >= 40) {
      this.templeLevel = 3;
      this.terrainMesh.add(this.monolithPillarSprites[0]);
    } else if (this.templeLevel == 3 && this.sheep.length >= 50) {
      this.templeLevel = 4;
      this.terrainMesh.add(this.monolithPillarSprites[3]);
    } else if (this.templeLevel == 4 && this.sheep.length >= 60) {
      this.templeLevel = 5;
      this.terrainMesh.add(this.monolithPillarSprites[1]);
    } else if (this.templeLevel == 5 && this.sheep.length >= 70) {
      this.templeLevel = 6;
      this.terrainMesh.add(this.monolithPillarSprites[4]);
    } else if (this.templeLevel == 6 && this.sheep.length >= 80) {
      this.templeLevel = 7;
      this.terrainMesh.add(this.monolithPillarSprites[2]);
    } else if (this.templeLevel == 7 && this.sheep.length >= 90) {
      this.templeLevel = 8;
      this.terrainMesh.add(this.monolithPillarSprites[5]);
    }
  
    if (this.flockingPoint != null && this.terrain.faceVerticesAllWater(this.flockingPoint)) {
      this.flagSprite.position.set(10000, 10000, 10000);
    }

    this.terrain.setupVertices();
  }

  public tick() {
    this.rain.tick();
    this.sheepBaaSound.update();
    this.sheepEatSound.update();

    for (let sheep of this.sheep) {
      if (this.terrain.faceVerticesAllWater(sheep.faceIndex)) {
        sheep.die();
      } else {
        sheep.tick();
      }
    }

    this.sheep = this.sheep.filter((sheep) => !sheep.isDead);

    if (this.flockingPoint !== null) {
      // player placed sheep
      const highestWaterLevel = this.terrain.heightmap[this.terrain.highestVertex] + 1;
      if (this.waterCounter == 600 && this.waterLevel < highestWaterLevel) {
        if (this.waterLevel < -35) {
          this.waterLevel += 3;
        } else if (this.waterLevel < 20) {
          this.waterLevel += 5;
        } else if (this.waterLevel < 40) {
          this.waterLevel += 10;
        } else if (this.waterLevel < 90) {
          this.waterLevel += 20;
        } else {
          this.waterLevel += 35;
        }
        this.waterLevel = Math.min(highestWaterLevel, this.waterLevel);
        this.waterCounter = 0;
      } else {
        this.waterCounter++;
      }
    }
    if (this.frame % 4 == 0) {
      this.slowTick();
    }
  }

  public raycast(intersection: THREE.Intersection<THREE.Object3D>) {
    let { faceIndex } = intersection;
    if (faceIndex == null) {
      return;
    }
    if (this.terrain.faceVerticesAllWater(faceIndex)) {
      return;
    }

    if (this.flockingPoint === null) {
      console.log("spawn flock");
      this.flockingPoint = faceIndex;

      // spawn initial flock
      const tilesSet = new Set<number>();
      tilesSet.add(this.flockingPoint);
      for (let t of this.terrain.adjacentFaces(this.flockingPoint)) {
        tilesSet.add(t);
        for (let tt of this.terrain.adjacentFaces(t)) {
          tilesSet.add(tt);
        }
      }
      const tiles = [...tilesSet];

      for (let i = 0; i < 20; i++) {
        shuffle(tiles);

        for (let tile of tiles) {
          if (this.canSetSheepOnFace(tile)) {
            const sheep = new Sheep();
            this.setSheepOnFace(sheep, tile);
            this.terrainMesh.add(sheep.sprite);
            this.sheep.push(sheep);
            break;
          }
        }
      }
    } else {
      this.flockingPoint = faceIndex;
    }

    const { x, y, z } = this.terrain.xyzFaceCenter(this.flockingPoint);
    this.flagSprite.position.set(x, y, z + 10);
  }

  public raycastHover(intersection: THREE.Intersection<THREE.Object3D>) {
    let { faceIndex } = intersection;
    if (faceIndex == null) {
      return;
    }
    this.terrain.setHighlightedFace(faceIndex);
    if (this.flockingPoint == null) {
      const { x, y, z } = this.terrain.xyzFaceCenter(faceIndex);
      this.flagSprite.position.set(x, y, z + 10);
    }
  }
}

window.onload = () => {
  const app = new App();
  (window as any)["app"] = app;
  const main = document.querySelector("main");
  assert(main !== null, "missing main element!");

  const caster = new THREE.Raycaster();
  function onClick(event: MouseEvent) {
    event.preventDefault();

    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / app.renderer.domElement.offsetWidth) * 2 - 1;
    mouse.y = -(event.clientY / app.renderer.domElement.offsetHeight) * 2 + 1;

    caster.setFromCamera(mouse, app.camera);

    const intersects = caster.intersectObject(app.terrainMesh);

    if (intersects.length > 0) {
      for (let m of intersects) {
        if (m.object === app.terrainMesh) {
          app.raycast(m);
          break;
        }
      }
    }
  }
  function onMove(event: MouseEvent) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / app.renderer.domElement.offsetWidth) * 2 - 1;
    mouse.y = -(event.clientY / app.renderer.domElement.offsetHeight) * 2 + 1;

    caster.setFromCamera(mouse, app.camera);

    const intersects = caster.intersectObject(app.terrainMesh);

    if (intersects.length > 0) {
      for (let m of intersects) {
        if (m.object === app.terrainMesh) {
          app.raycastHover(m);
          break;
        }
      }
    }
  }
  main.addEventListener("mousedown", onClick);
  main.addEventListener("mousemove", onMove);

  // seed = Math.random().toString(36).substring(2);

  const sheepCountElem = document.querySelector("#sheep-count")! as HTMLSpanElement;
  const sheepFoodElem = document.querySelector("#sheep-food")! as HTMLProgressElement;
  const waterLevelElem = document.querySelector("#water-level")! as HTMLProgressElement;

  let lastSheepCount: number | null = null;
  function frame() {
    app.render();

    if (app.sheep.length != lastSheepCount) {
      sheepCountElem.innerHTML = `${app.sheep.length}`;
      lastSheepCount = app.sheep.length;
    }

    sheepFoodElem.value = app.sheepStoredFood / 5;
    waterLevelElem.value = app.waterCounter / 600;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
