// What the game needs from wherever it runs: when to say it is loaded, where to keep saves, when to pause, which
// language to speak, and ads. Three builds share one game: local (a plain web page), Yandex Games, YouTube Playables.

import type { SaveData } from "../game/save";

/** The boards: the best runs ever, today's daily trial, this week's weekly trial. */
export type BoardName = "score" | "daily" | "weekly";
export interface BoardEntry {
  rank: number;
  name: string;
  score: number;
  me: boolean;
}
export interface Board {
  entries: BoardEntry[];
  /** The player's place (0: not on the board, or not signed in). */
  myRank: number;
}
/** The day the daily trial belongs to (days since 1970, UTC): everyone plays the same floors that day. */
export const dayNumber = (now = Date.now()): number => Math.floor(now / 86400000);
/** The week the weekly trial belongs to (weeks from Monday, UTC). */
export const weekNumber = (now = Date.now()): number => Math.floor((dayNumber(now) + 3) / 7);

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
  /** A run's score: the best ever goes to the "score" board (YouTube shows it to the player), a daily try to "daily". */
  submitScore(score: number, board?: BoardName): void;
  /** A leaderboard to show, or null where the platform has none (the game then shows the player's own records). */
  leaderboard(board: BoardName): Promise<Board | null>;
  /** Whether the player could sign in to get on the boards (a guest on Yandex), and doing it. */
  canSignIn(): boolean;
  signIn(): Promise<boolean>;
}

/** Shared by all builds: pause on a hidden tab, mobile detection, and browser storage as a fallback. */
export abstract class BasePlatform implements Platform {
  abstract readonly name: "local" | "yandex" | "youtube";
  protected pauseCbs: (() => void)[] = [];
  protected resumeCbs: (() => void)[] = [];
  protected audioCbs: ((on: boolean) => void)[] = [];

  private watching = false;
  /**
   * Pause when the page is hidden or the window loses focus, resume when it comes back (Yandex: "sound stops when
   * the game loses focus"). Not for YouTube Playables, which forbids the Page Visibility API: there only the SDK's
   * onPause and onResume pause the game.
   */
  protected watchFocus(): void {
    if (this.watching) return;
    this.watching = true;
    let paused = false;
    const pause = () => {
      if (paused) return;
      paused = true;
      this.pauseCbs.forEach((f) => f());
    };
    const resume = () => {
      if (!paused || document.hidden || !document.hasFocus()) return;
      paused = false;
      this.resumeCbs.forEach((f) => f());
    };
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
  }
  async init(): Promise<void> {
    this.watchFocus();
  }
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
  submitScore(_score: number, _board?: BoardName): void {}
  async leaderboard(_board: BoardName): Promise<Board | null> {
    return null;
  }
  canSignIn(): boolean {
    return false;
  }
  async signIn(): Promise<boolean> {
    return false;
  }
}
