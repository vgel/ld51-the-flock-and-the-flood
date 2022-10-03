import { Howl } from "howler";
import { weightedChoose } from "./utils";

export type SoundId = "sheepBaa" | "bell" | "waves";

interface WeightedSound {
  sound: Howl;
  weight: number;
}

function makeSound(sources: Array<{ path: string; weight: number, volume: number }>): WeightedSound[] {
  return sources.map((src) => ({
    sound: new Howl({
      src: [src.path],
      preload: true,
      volume: src.volume,
    }),
    weight: src.weight,
  }));
}

const SOUNDS: Record<SoundId, WeightedSound[]> = {
  sheepBaa: makeSound([
    { path: "SheepLow.mp3", weight: 1, volume: 1 },
    { path: "SheepMid.mp3", weight: 1, volume: 1 },
    { path: "SheepHigh.mp3", weight: 1, volume: 1 },
  ]),
  // sheepEat: makeSound([{ path: "GrassEating.mp3", weight: 1 }]),
  bell: makeSound([{ path: "bell.mp3", weight: 1, volume: 2 }]),
  waves: makeSound([{ path: "waves.mp3", weight: 1, volume: 0.1 }]),
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
      console.log("didn't play", this.soundId, "too soon: ", this.cooldownTimer);
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

function makeBgTrack(path: string, initialVolume: number): Howl {
  return new Howl({
    src: [path],
    volume: initialVolume,
    loop: true,
  });
}

const tracks = {
  rain: makeBgTrack("rain.mp3", 0.1),
  music: makeBgTrack("music.mp3", 0.2),
};
(window as any).tracks = tracks;

export function startBgTracks() {
  Object.values(tracks).forEach((track) => {
    if (!track.playing()) {
      track.play();
    }
  });
}

export function stopBgTracks() {
  Object.values(tracks).forEach((track) => track.stop());
}
