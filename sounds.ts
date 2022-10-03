import { Howl } from "howler";
import { weightedChoose } from "./utils";

export type SoundId = "sheepBaa" | "sheepEat";

interface WeightedSound {
  sound: Howl;
  weight: number;
}

function makeSound(sources: Array<{ path: string; weight: number }>): WeightedSound[] {
  return sources.map((src) => ({
    sound: new Howl({
      src: [src.path],
      preload: true,
    }),
    weight: src.weight,
  }));
}

const SOUNDS: Record<SoundId, WeightedSound[]> = {
  sheepBaa: makeSound([
    { path: "SheepLow.mp3", weight: 1 },
    { path: "SheepMid.mp3", weight: 1 },
    { path: "SheepHigh.mp3", weight: 1 },
  ]),
  sheepEat: makeSound([{ path: "GrassEating.mp3", weight: 1 }]),
};

export function playSound(sound: SoundId) {
  weightedChoose(SOUNDS[sound], (s) => s.weight).sound.play();
}

export function setSoundMuted(muted: boolean) {
  Object.values(SOUNDS).forEach((ws) => {
    for (let sound of ws) {
      sound.sound.mute(muted);
    }
  });
}

export class SoundEffect {
  public cooldownTimer = 0;

  constructor(public soundId: SoundId, public baseCooldownTime: number, public randomExtraCooldownTime: number) {}

  public canPlay(): boolean {
    return this.cooldownTimer <= 0;
  }

  public play(): boolean {
    if (!this.canPlay()) {
      return false;
    }
    this.cooldownTimer = this.baseCooldownTime + Math.random() * this.randomExtraCooldownTime;
    playSound(this.soundId);
    return true;
  }

  public update() {
    this.cooldownTimer = Math.max(0, this.cooldownTimer - 1);
  }
}

// function makeBgTrack(path: string, initialVolume: number): Howl {
//   return new Howl({
//     src: [path],
//     volume: initialVolume,
//     loop: true,
//   });
// }

// const CHANT_BASE_VOLUME = 0.15;
// // start volume at 0.01 so we ramp up (0 causes it to never play for some reason)
// const CHANT = makeBgTrack("sounds/chant.mp3", 0.01);
// const WIND_BASE_VOUME = 0.15;
// const WIND = makeBgTrack("sounds/wind.mp3", 0.01);
// const RAIN_BASE_VOLUME = 0.15;
// const RAIN = makeBgTrack("sounds/rain.mp3", 0.01);

// export function startBgMusic() {
//   CHANT.play();
//   WIND.play();
//   RAIN.play();
// }

// export function setBgBalance(chant: number, wind: number, rain: number) {
//   CHANT.fade(CHANT.volume(), CHANT_BASE_VOLUME * chant, 3000);
//   WIND.fade(WIND.volume(), WIND_BASE_VOUME * wind, 3000);
//   RAIN.fade(RAIN.volume(), RAIN_BASE_VOLUME * rain, 3000);
// }

// export function setBgMuted(muted: boolean) {
//   CHANT.mute(muted);
//   WIND.mute(muted);
//   RAIN.mute(muted);
// }
