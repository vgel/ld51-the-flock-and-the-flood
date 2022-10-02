import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// @ts-expect-error
import dat from "dat.gui";

import { TerrainGen, TerrainGeometry } from "./terrain";
import { makeSheepSprite } from "./sprites";
import { assert, shuffle } from "./utils";

function colorMap(height: number, waterDepth: number) {
  if (waterDepth <= 0) {
    if (height > 120) {
      return new THREE.Color(0xcccccc); // white
    } else if (height > 30) {
      return new THREE.Color(0x6e5f3f); // brown
    } else {
      return new THREE.Color(0x5e9c48); // green
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
  movement: null | {
    progress: number;
    startPosition: THREE.Vector3;
    endPosition: THREE.Vector3;
  } = null;

  constructor(public sprite: THREE.Sprite, public faceIndex: number) {}

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

  public startMovement(towardsFaceIndex: number, endPosition: THREE.Vector3) {
    this.faceIndex = towardsFaceIndex;
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

  public terrain: TerrainGeometry;
  public terrainMesh: THREE.Mesh;
  public sheep: Sheep[] = [];
  public flockingPoint: number | null = null;
  public waterLevel: number;
  public frame = 0;

  constructor({
    backgroundColor = 0x000000,
    camera: { fov = 70, nearPlane = 0.01, farPlane = 1e5, position: cameraPosition = [450, 650, 250] } = {},
    lights = [
      { light: new THREE.HemisphereLight(0x000000, 0xffffff, 0.95), position: [0, -50, -100] },
      { light: new THREE.AmbientLight(0xaaccff, 0.35), position: [-200, -100, 200] },
    ],
    meshSize = 1000,
    seed = "nauthiel",
    initialWaterLevel = -70,
  } = {}) {
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
    this.controls.maxPolarAngle = Math.PI / 2;

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

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

    const meshCenter = this.terrainMesh.position.clone().add(new THREE.Vector3(meshSize / 2, 0, -meshSize / 2));
    this.controls.target.copy(meshCenter);

    for (const { light, position } of lights) {
      this.scene.add(light);
      light.position.fromArray(position);
    }

    window.onresize = () => this.setSize();
    this.setSize();

    this.waterLevel = initialWaterLevel;
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
    this.tick();
    this.renderer.render(this.scene, this.camera);
    this.controls.update();
    this.frame++;
    requestAnimationFrame(() => this.render());
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
    let waterCount = 0;
    for (let v of this.terrain.faceToVertices[faceIndex]) {
      if (this.terrain.vertexWaterDepth[v] > 0) {
        waterCount++;
      }
    }
    if (waterCount == 3) {
      return false;
    }

    const faceSheepCount = this.countSheepOnFace(faceIndex);
    if (faceSheepCount >= 3) {
      return false;
    }

    return true;
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

    const vertex = faceIndex * 3 + this.countSheepOnFace(faceIndex);
    const wander = Math.random() + 1;
    const tx = (tPos.getX(vertex) + faceCenterX * wander) / (1 + wander);
    const ty = (tPos.getY(vertex) + faceCenterY * wander) / (1 + wander);
    const tz = (tPos.getZ(vertex) + faceCenterZ * wander) / (1 + wander);

    sheep.startMovement(faceIndex, new THREE.Vector3(tx, ty, tz + 7));

    // sheep.sprite.position.set(tx, ty, tz + 7);
    // sheep.faceIndex = faceIndex;
  }

  public slowTick() {
    if (this.terrain.flood(this.waterLevel)) {
      console.log("flood", this.waterLevel);
      this.terrain.setupVertices();
    }

    for (let sheep of this.sheep) {
      let adj = this.terrain.adjacentFaces(sheep.faceIndex);
      if (Math.random() < 0.02) {
        // try to move the sheep randomly
        shuffle(adj);
        for (let adjFaceIndex of adj) {
          if (this.canSetSheepOnFace(adjFaceIndex)) {
            this.setSheepOnFace(sheep, adjFaceIndex);
            break;
          }
        }
      } else if (sheep.movement == null) {
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
    }
  }

  public tick() {
    for (let sheep of this.sheep) {
      sheep.tick();
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
        const sheep = new Sheep(makeSheepSprite(), faceIndex);

        for (let tile of tiles) {
          console.log(tile);
          if (this.canSetSheepOnFace(tile)) {
            console.log("setting sheep on", tile);
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
  }

  public raycastHover(intersection: THREE.Intersection<THREE.Object3D>) {
    let { faceIndex } = intersection;
    if (faceIndex == null) {
      return;
    }
    this.terrain.setHighlightedFace(faceIndex);
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

    const intersects = caster.intersectObjects([app.terrainMesh]);

    if (intersects.length > 0) {
      for (let m of intersects) {
        if (m.object === app.terrainMesh) {
          app.raycast(m);
        }
      }
    }
  }
  function onMove(event: MouseEvent) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / app.renderer.domElement.offsetWidth) * 2 - 1;
    mouse.y = -(event.clientY / app.renderer.domElement.offsetHeight) * 2 + 1;

    caster.setFromCamera(mouse, app.camera);

    const intersects = caster.intersectObjects([app.terrainMesh]);

    if (intersects.length > 0) {
      for (let m of intersects) {
        if (m.object === app.terrainMesh) {
          app.raycastHover(m);
        }
      }
    }
  }
  main.addEventListener("click", onClick);
  main.addEventListener("mousemove", onMove);

  const gui: any = new dat.GUI();

  // onActualChange(gui.add(options, "seed").listen(), generate);
  // gui.add(
  //   {
  //     randomSeed: () => {
  //       options.seed = Math.random().toString(36).substring(2);
  //       generate();
  //     },
  //   },
  //   "randomSeed"
  // );

  gui.add(
    {
      raiseWaterLevel: () => {
        app.waterLevel++;
      },
    },
    "raiseWaterLevel"
  );

  app.render();
};
