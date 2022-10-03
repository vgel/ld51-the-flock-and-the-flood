import * as THREE from "three";

const N_TEXTURES = 10;

const baseMap = new THREE.TextureLoader().load("sprites.png");
baseMap.minFilter = THREE.NearestFilter;
baseMap.magFilter = THREE.NearestFilter;

function spriteTexture(index: number): THREE.Texture {
  const map = baseMap.clone();
  map.offset = new THREE.Vector2(index / N_TEXTURES, 0);
  map.repeat = new THREE.Vector2(1 / N_TEXTURES - 0.0001, 1);
  return map;
}

function tallSpriteTexture(index: number): THREE.Texture {
  const map = baseMap.clone();
  map.offset = new THREE.Vector2(index / N_TEXTURES, 0);
  map.repeat = new THREE.Vector2(2 / N_TEXTURES - 0.0001, 1);
  return map;
}

const sheepTexture = spriteTexture(0);
const sheepMaterial = new THREE.SpriteMaterial({ map: sheepTexture });
export function makeSheepSprite(): THREE.Sprite {
  const sprite = new THREE.Sprite(sheepMaterial);
  sprite.scale.set(15, 15, 15);
  return sprite;
}

const flagTexture = spriteTexture(2);
const flagMaterial = new THREE.SpriteMaterial({ map: flagTexture });
export function makeFlagSprite(): THREE.Sprite {
  const sprite = new THREE.Sprite(flagMaterial);
  sprite.scale.set(30, 30, 30);
  return sprite;
}

function monolithMaterialHelper(texture: THREE.Texture): THREE.Material {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false, // fix for weird transparent-on-transparent behavior
  });
}

function monolithObjectHelper(material: THREE.Material, width: number, height: number, tall?: boolean): THREE.Object3D {
  const plane = new THREE.PlaneGeometry(tall ? height : width, tall ? width : height, 1, 1);

  const mesh1 = new THREE.Mesh(plane, material);
  const mesh2 = mesh1.clone();
  mesh1.rotateY(Math.PI / 2);

  if (tall) {
    mesh1.rotateZ(Math.PI / 2);
    mesh2.rotateZ(Math.PI / 2);
  }


  const object = new THREE.Object3D();
  object.add(mesh1, mesh2);
  object.rotateX(Math.PI / 2);
  return object;
}

const monolith1Texture = spriteTexture(3);
const monolith1Material = monolithMaterialHelper(monolith1Texture);
export function makeMonolith1Sprite(): THREE.Object3D {
  return monolithObjectHelper(monolith1Material, 40, 40);
}

const monolith2Texture = tallSpriteTexture(4);
const monolith2Material = monolithMaterialHelper(monolith2Texture);
export function makeMonolith2Sprite(): THREE.Object3D {
  return monolithObjectHelper(monolith2Material, 40, 80, true);
}

const monolithPillarTexture = tallSpriteTexture(6);
const monolithPillarMaterial = monolithMaterialHelper(monolithPillarTexture);
export function makeMonolithPillarSprite(): THREE.Object3D {
  return monolithObjectHelper(monolithPillarMaterial, 40, 80, true);
}
