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

function makeBgTrack(path: string, initialVolume: number): Howl {
  return new Howl({
    src: [path],
    volume: initialVolume,
    loop: true,
  });
}

const tracks = {
  rain: makeBgTrack("rain.mp3", 0.03),
  music: makeBgTrack("music.mp3", 0.2),
};
(window as any).tracks = tracks;

export function startBgTracks() {
  Object.values(tracks).forEach(track => {
    if (!track.playing()) {
      track.play();
    }
});
}

export function stopBgTracks() {
  Object.values(tracks).forEach(track => track.stop());
}
