// What the game needs from wherever it runs: when to say it is loaded, where to keep saves, when to pause, which
// language to speak, and ads. Three builds share one game: local (a plain web page), Yandex Games, YouTube Playables.

import type { SaveData } from "../game/save";

export interface Platform {
  readonly name: "local" | "yandex" | "youtube";
  /** Connect to the platform's SDK. Never throws: a missing SDK degrades to local behaviour. */
  init(): Promise<void>;
  /** The player's language as a two-letter code. */
  language(): string;
  isMobile(): boolean;
  /** The first frame is on screen (a loading screen that says it is loading). */
  firstFrame(): void;
  /** Everything is loaded and the player can act. */
  ready(): void;
  /** Gameplay started or resumed / paused or ended (Yandex's GameplayAPI). */
  gameplayStart(): void;
  gameplayStop(): void;
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  /** The platform pauses and resumes the game (ads, a hidden tab, the YouTube app going to the background). */
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  /** Whether the platform allows sound right now, and when that changes. */
  audioAllowed(): boolean;
  onAudioChange(cb: (on: boolean) => void): void;
  /** Ads: an interstitial between runs, and a rewarded one that resolves true when the reward was earned. */
  canShowRewarded(): boolean;
  showInterstitial(): Promise<void>;
  showRewarded(): Promise<boolean>;
  /** A new best score (YouTube shows it to the player). */
  submitScore(score: number): void;
}

/** Shared by all builds: pause on a hidden tab, mobile detection, and browser storage as a fallback. */
export abstract class BasePlatform implements Platform {
  abstract readonly name: "local" | "yandex" | "youtube";
  protected pauseCbs: (() => void)[] = [];
  protected resumeCbs: (() => void)[] = [];
  protected audioCbs: ((on: boolean) => void)[] = [];

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pauseCbs.forEach((f) => f());
      else this.resumeCbs.forEach((f) => f());
    });
  }
  async init(): Promise<void> {}
  language(): string {
    return (navigator.language || "en").slice(0, 2).toLowerCase();
  }
  isMobile(): boolean {
    return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  }
  firstFrame(): void {}
  ready(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  async load(): Promise<SaveData | null> {
    try {
      const s = localStorage.getItem("bf-save");
      return s ? (JSON.parse(s) as SaveData) : null;
    } catch {
      return null;
    }
  }
  async save(data: SaveData): Promise<void> {
    try {
      localStorage.setItem("bf-save", JSON.stringify(data));
    } catch {
      /* private mode or storage full: the run still counts this session */
    }
  }
  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }
  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }
  audioAllowed(): boolean {
    return true;
  }
  onAudioChange(cb: (on: boolean) => void): void {
    this.audioCbs.push(cb);
  }
  canShowRewarded(): boolean {
    return false;
  }
  async showInterstitial(): Promise<void> {}
  async showRewarded(): Promise<boolean> {
    return false;
  }
  submitScore(_score: number): void {}
}
