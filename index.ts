import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import dat from "dat.gui";

import { TerrainGen, TerrainGeometry } from "./terrain";

interface TerrainOptions {
  seed: string;
  heightStretch: number;
  octaves: number;
  scale: number;
  lacunarity: number;
  persistence: number;
  waterLevel: number;
}

class App {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;
  public readonly scene: THREE.Scene;

  public mesh?: THREE.Mesh;

  constructor({
    backgroundColor = 0x000000,
    camera: { fov = 70, nearPlane = 0.01, farPlane = 1e5, position: cameraPosition = [450, 650, 250] } = {},
    lights = [
      { light: new THREE.HemisphereLight(0x000000, 0xffffff, 0.95), position: [0, -50, -100] },
      { light: new THREE.AmbientLight(0xaaccff, 0.35), position: [-200, -100, 200] },
    ],
  } = {}) {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setClearColor(backgroundColor, 1);
    document.querySelector("main").appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(fov, 0, nearPlane, farPlane); // aspect = 0 for now
    this.camera.position.fromArray(cameraPosition);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

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

  public generate(opts: TerrainOptions) {
    const meshSize = 1000;

    const colorMap = (height: number) => {
      if (height > opts.waterLevel) {
        if (height > 120) {
          return new THREE.Color(0xffffff); // white
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

    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    } as any);

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
    const geometry = new TerrainGeometry(generator, meshSize, 25, colorMap, opts.waterLevel);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -100, -150);
    mesh.frustumCulled = false;

    if (this.mesh === undefined) {
      // first run, set up camera
      const meshCenter = mesh.position.clone().add(new THREE.Vector3(meshSize / 2, 0, -meshSize / 2));
      this.controls.target.copy(meshCenter);
    } else {
      // delete the old mesh
      this.scene.remove(this.mesh);
    }

    this.mesh = mesh;
    this.scene.add(mesh);
  }

  public render = () => {
    this.renderer.render(this.scene, this.camera);
    this.controls.update();
    requestAnimationFrame(this.render);
  };
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
  scale: 2,
  lacunarity: 2,
  persistence: 0.5,

  heightStretch: 150,

  waterLevel: 0,
};

window.onload = () => {
  const app = new App();
  window["app"] = app;

  // TODO ttesings
  const caster = new THREE.Raycaster();
  function onClick(event) {
    event.preventDefault();

    if (!app.mesh) {
      return;
    }

    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / app.renderer.domElement.offsetWidth) * 2 - 1;
    mouse.y = -(event.clientY / app.renderer.domElement.offsetHeight) * 2 + 1;

    caster.setFromCamera(mouse, app.camera);

    const intersects = caster.intersectObjects([app.mesh]);

    if (intersects.length > 0) {
      const intersection = intersects[0];

      const colorAttribute = (intersection.object as THREE.Mesh).geometry.getAttribute("color");
      const face = intersection.face;

      // TODO:
      // face.a, b, c are indexes into object.geometry.vertices, which are point objects
      // so we can find the closest vertex by testing each against intersection.point, i think
      // i think the objects should be on vertices, not face centers, since a face can be
      // partially underwater and that's confusing. if you can only place on an above-water
      // vertex, that has less edge cases
      // also, we don't have to care about normals l0l

      const color = new THREE.Color(Math.random() * 0xff0000);

      colorAttribute.setXYZ(face.a, color.r, color.g, color.b);
      colorAttribute.setXYZ(face.b, color.r, color.g, color.b);
      colorAttribute.setXYZ(face.c, color.r, color.g, color.b);

      colorAttribute.needsUpdate = true;
    }
  }

  document.querySelector("main").addEventListener("click", onClick);

  const gui = new dat.GUI();

  const generate = () => {
    app.generate(options);
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
  onActualChange(gui.add(options, "waterLevel", 0, 150).step(1), generate);
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
