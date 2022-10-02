import * as THREE from "three";

const N_TEXTURES = 20;

const baseMap = new THREE.TextureLoader().load("sprites.png");
baseMap.minFilter = THREE.NearestFilter;
baseMap.magFilter = THREE.NearestFilter;

function spriteTexture(index: number): THREE.Texture {
  const map = baseMap.clone();
  map.offset = new THREE.Vector2(index * 1/N_TEXTURES, 0);
  map.repeat = new THREE.Vector2(1/N_TEXTURES, 1);
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