import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import dat from "dat.gui";

import { TerrainGen, TerrainGeometry } from "./terrain";
import { makeSheepSprite } from "./sprites";
import { shuffle } from "./utils";

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
    return new THREE.Color(0x3E538E); // light blue
  } else if (waterDepth < 90) {
    return new THREE.Color(0x324371); // lightish blue
  } else {
    return new THREE.Color(0x273459); // darkish blue
  }
}

class Sheep {
  constructor(public sprite: THREE.Sprite, public faceIndex: number) {}
}

class App {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;
  public readonly scene: THREE.Scene;

  public terrain: TerrainGeometry;
  public terrainMesh: THREE.Mesh;
  public sheep: Sheep[];
  public waterLevel: number;
  public frame: number;

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
    document.querySelector("main").appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(fov, 0, nearPlane, farPlane); // aspect = 0 for now
    this.camera.position.fromArray(cameraPosition);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    const generator = new TerrainGen(
      150,
      (x, y) => {
        return 0.6 - 2 * Math.sqrt(x ** 2 + y ** 2);
      },
      5,
      3,
      1.8,
      0.5,
      seed
    );
    this.terrain = new TerrainGeometry(meshSize, 35, generator);
    this.terrain.setupVertices(colorMap);
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

    this.sheep = [];
    this.waterLevel = initialWaterLevel;
    this.frame = 0;
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
    if (this.frame % 4 == 0) {
      this.tick();
    }
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

  trySetSheepOnFace(sheep: Sheep, faceIndex: number): boolean {
    // for (let i = 0; i < 3; i++) {
    //   this.terrain.colors.setXYZ(faceIndex * 3 + i, 1, 0, 0);
    // }
    // for (let adj of this.terrain.adjacentFaces(faceIndex)) {
    //   for (let i = 0; i < 3; i++) {
    //     this.terrain.colors.setXYZ(adj * 3 + i, 0, 1, 0);
    //   }
    // }
    // this.terrain.colors.needsUpdate = true;

    for (let v of this.terrain.faceToVertices[faceIndex]) {
      if (this.terrain.vertexWaterDepth[v] > 0) {
        return false;
      }
    }

    const faceSheepCount = this.countSheepOnFace(faceIndex);
    if (faceSheepCount >= 3) {
      return false;
    }

    const tPos = this.terrain.positions;

    const faceCenterX = (tPos.getX(faceIndex * 3) + tPos.getX(faceIndex * 3 + 1) + tPos.getX(faceIndex * 3 + 2)) / 3;
    const faceCenterY = (tPos.getY(faceIndex * 3) + tPos.getY(faceIndex * 3 + 1) + tPos.getY(faceIndex * 3 + 2)) / 3;
    const faceCenterZ = (tPos.getZ(faceIndex * 3) + tPos.getZ(faceIndex * 3 + 1) + tPos.getZ(faceIndex * 3 + 2)) / 3;

    const vertex = faceIndex * 3 + faceSheepCount;
    const wander = Math.random() + 1;
    const tx = (tPos.getX(vertex) + faceCenterX * wander) / (1 + wander);
    const ty = (tPos.getY(vertex) + faceCenterY * wander) / (1 + wander);
    const tz = (tPos.getZ(vertex) + faceCenterZ * wander) / (1 + wander);

    sheep.sprite.position.set(tx, ty, tz + 7);
    sheep.faceIndex = faceIndex;

    return true;
  }

  public tick() {
    if (this.terrain.flood(this.waterLevel)) {
      console.log("flood", this.waterLevel);
      this.terrain.setupVertices(colorMap);
    }

    for (let sheep of this.sheep) {
      if (Math.random() < 0.1) {
        // try to move the sheep
        let adj = this.terrain.adjacentFaces(sheep.faceIndex);
        shuffle(adj);
        for (let adjFaceIndex of adj) {
          if (this.trySetSheepOnFace(sheep, adjFaceIndex)) {
            break;
          }
        }
      }
    }
  }

  public raycast(intersection: THREE.Intersection<THREE.Object3D>) {
    const sheep = new Sheep(makeSheepSprite(), intersection.faceIndex);

    if (this.trySetSheepOnFace(sheep, intersection.faceIndex)) {
      this.terrainMesh.add(sheep.sprite);
      this.sheep.push(sheep);
    }
  }
}

const debounce = (fn: (...a: any) => void, time: number) => {
  let timeout: number;

  return function (...args: any[]) {
    const functionCall = () => fn.apply(this, args);

    clearTimeout(timeout);
    timeout = setTimeout(functionCall, time);
  };
};

window.onload = () => {
  const app = new App();
  window["app"] = app;

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

  document.querySelector("main").addEventListener("click", onClick);

  const gui: any = new dat.GUI();

  // simple filter to only react when the value actually changes, instead of on all focus lost events
  const onActualChange = <T>(controller: any, callback: (oldV: T, newV: T) => void) => {
    let currentValue: T = controller.getValue();
    controller.onChange(
      debounce((newValue) => {
        if (newValue !== currentValue) {
          callback(currentValue, newValue);
          currentValue = newValue;
        }
      }, 10)
    );
  };

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
        // options.waterLevel++;
        // generate();
        app.waterLevel++;
      },
    },
    "raiseWaterLevel"
  );

  app.render();
};
