import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import dat from "dat.gui";

import { TerrainGen, TerrainGeometry } from "./terrain";
import { makeSheepSprite } from "./sprites";

interface TerrainOptions {
  seed: string;
  heightStretch: number;
  octaves: number;
  scale: number;
  lacunarity: number;
  persistence: number;
  waterLevel: number;
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

  constructor({
    backgroundColor = 0x000000,
    camera: { fov = 70, nearPlane = 0.01, farPlane = 1e5, position: cameraPosition = [450, 650, 250] } = {},
    lights = [
      { light: new THREE.HemisphereLight(0x000000, 0xffffff, 0.95), position: [0, -50, -100] },
      { light: new THREE.AmbientLight(0xaaccff, 0.35), position: [-200, -100, 200] },
    ],
    meshSize = 1000,
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

    this.terrain = new TerrainGeometry(meshSize, 25);
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
  }

  public setSize() {
    const x = window.innerWidth;
    const y = window.innerHeight;
    this.renderer.setSize(x, y);
    this.camera.aspect = x / y;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  public updateTerrain(opts: TerrainOptions) {
    const colorMap = (height: number) => {
      if (height > opts.waterLevel) {
        if (height > 120) {
          return new THREE.Color(0xcccccc); // white
        } else if (height > 30) {
          return new THREE.Color(0x6e5f3f); // brown
        } else {
          return new THREE.Color(0x5e9c48); // green
        }
      }

      let waterDepth = opts.waterLevel - height;

      if (waterDepth < 20) {
        return new THREE.Color(0x475d9e); // light blue
      } else if (waterDepth < 60) {
        return new THREE.Color(0x384a80); // lightish blue
      } else if (waterDepth < 80) {
        return new THREE.Color(0x273459); // darkish blue
      } else {
        return new THREE.Color(0x151c30); // dark blue
      }
    };

    const generator = new TerrainGen(
      opts.heightStretch,
      (x, y) => {
        return 0.6 - 2 * Math.sqrt(x ** 2 + y ** 2);
      },
      opts.octaves,
      opts.scale,
      opts.lacunarity,
      opts.persistence,
      opts.seed
    );

    this.terrain.setupVertices(generator, colorMap, opts.waterLevel);
  }

  public render() {
    this.renderer.render(this.scene, this.camera);
    this.controls.update();
    requestAnimationFrame(() => this.render());
  }

  public raycast(intersection: THREE.Intersection<THREE.Object3D>) {
    let faceSheepCount = 0;
    for (let sheep of this.sheep) {
      if (intersection.faceIndex == sheep.faceIndex) {
        faceSheepCount++;
      }
    }

    const face = intersection.face;
    const tPos = this.terrain.positions;

    let vertex: number;
    if (faceSheepCount >= 3) {
      return;
    } else if (faceSheepCount == 2) {
      vertex = face.a;
    } else if (faceSheepCount == 1) {
      vertex = face.b;
    } else {
      vertex = face.c;
    }

    const faceCenterX = (tPos.getX(face.a) + tPos.getX(face.b) + tPos.getX(face.c)) / 3;
    const faceCenterY = (tPos.getY(face.a) + tPos.getY(face.b) + tPos.getY(face.c)) / 3;
    const faceCenterZ = (tPos.getZ(face.a) + tPos.getZ(face.b) + tPos.getZ(face.c)) / 3;

    const sprite = makeSheepSprite();
    const wander = Math.random() + 1;
    const tx = (tPos.getX(vertex) + faceCenterX * wander) / (1 + wander);
    const ty = (tPos.getY(vertex) + faceCenterY * wander) / (1 + wander);
    const tz = (tPos.getZ(vertex) + faceCenterZ * wander) / (1 + wander);
    sprite.position.set(tx, ty, tz + 5);

    this.terrainMesh.add(sprite);
    this.sheep.push(new Sheep(sprite, intersection.faceIndex));

    // TODO:
    // face.a, b, c are indexes into object.geometry.vertices, which are point objects
    // so we can find the closest vertex by testing each against intersection.point, i think
    // i think the objects should be on vertices, not face centers, since a face can be
    // partially underwater and that's confusing. if you can only place on an above-water
    // vertex, that has less edge cases
    // also, we don't have to care about normals l0l

    // const color = new THREE.Color(Math.random() * 0xff0000);

    // colorAttribute.setXYZ(face.a, color.r, color.g, color.b);
    // colorAttribute.setXYZ(face.b, color.r, color.g, color.b);
    // colorAttribute.setXYZ(face.c, color.r, color.g, color.b);

    // colorAttribute.needsUpdate = true;
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

const options: TerrainOptions = {
  seed: "nauthiel",
  octaves: 5,
  scale: 3,
  lacunarity: 1.8,
  persistence: 0.5,

  heightStretch: 150,

  waterLevel: -70,
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

  const gui = new dat.GUI();

  const generate = () => {
    app.updateTerrain(options);
  };

  // simple filter to only react when the value actually changes, instead of on all focus lost events
  const onActualChange = <T>(controller: dat.GUIController, callback: (oldV: T, newV: T) => void) => {
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

  onActualChange(gui.add(options, "seed").listen(), generate);
  gui.add(
    {
      randomSeed: () => {
        options.seed = Math.random().toString(36).substring(2);
        generate();
      },
    },
    "randomSeed"
  );

  onActualChange(gui.add(options, "octaves", 1, 50).step(1), generate);
  onActualChange(gui.add(options, "scale", 0.01, 25), generate);
  onActualChange(gui.add(options, "lacunarity", 0.01, 10), generate);
  onActualChange(gui.add(options, "persistence", 0.01, 1), generate);
  onActualChange(gui.add(options, "heightStretch", 1, 200), generate);
  onActualChange(gui.add(options, "waterLevel", -150, 150).step(1), generate);
  gui.add(
    {
      raiseWaterLevel: () => {
        options.waterLevel++;
        generate();
      },
    },
    "raiseWaterLevel"
  );

  app.render();

  generate();
};
