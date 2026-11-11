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

/** A product of the platform's shop, as its catalog gives it: the price is the platform's own, in its currency. */
export interface Product {
  id: string;
  title: string;
  /** The price as the platform writes it (e.g. "29 YAN"), its number, and the currency's icon (a URL), if any. */
  price: string;
  priceValue: number;
  currencyImage: string;
}
/** A purchase made: what was bought, and the token that marks a consumable as delivered. */
export interface Purchase {
  id: string;
  token: string;
}

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
  /**
   * Keep the save. `now`: it must reach the platform's storage at once (a purchase was just delivered). Resolves
   * true once it is safely kept (with `now`, in the platform's own storage), false if that failed.
   */
  save(data: SaveData, now?: boolean): Promise<boolean>;
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
  /** In-game purchases: whether there is a shop here, its catalog, buying, and consuming a delivered consumable. */
  shopAvailable(): boolean;
  catalog(): Promise<Product[]>;
  /** Buy a product; resolves with the purchase, or null if it was cancelled or failed. */
  buy(id: string): Promise<Purchase | null>;
  /** Purchases not yet delivered (a consumable whose delivery was cut short) and every lasting one. */
  purchases(): Promise<Purchase[]>;
  /** Mark a delivered consumable as done; true if the platform took it. */
  consume(token: string): Promise<boolean>;
}

/** Shared by all builds: pause on a hidden tab, mobile detection, and browser storage as a fallback. */
export abstract class BasePlatform implements Platform {
  abstract readonly name: "local" | "yandex" | "youtube";
  protected pauseCbs: (() => void)[] = [];
  protected resumeCbs: (() => void)[] = [];
  protected audioCbs: ((on: boolean) => void)[] = [];

  private watching = false;
  /** Paused for a hidden page or a lost focus (cleared when the platform resumes the game by itself). */
  protected focusPaused = false;
  /**
   * Pause when the page is hidden or the window loses focus, resume when it comes back (Yandex: "sound stops when
   * the game loses focus"). Not for YouTube Playables, which forbids the Page Visibility API: there only the SDK's
   * onPause and onResume pause the game.
   */
  protected watchFocus(): void {
    if (this.watching) return;
    this.watching = true;
    const pause = () => {
      if (this.focusPaused) return;
      this.focusPaused = true;
      this.pauseCbs.forEach((f) => f());
    };
    const resume = () => {
      if (!this.focusPaused || document.hidden || !document.hasFocus() || this.held()) return;
      this.focusPaused = false;
      this.resumeCbs.forEach((f) => f());
    };
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
  }
  /** The platform itself still holds the game paused (an ad, its purchase window): focus coming back does not resume it. */
  protected held(): boolean {
    return false;
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
  async save(data: SaveData, _now = false): Promise<boolean> {
    try {
      localStorage.setItem("bf-save", JSON.stringify(data));
      return true;
    } catch {
      /* private mode or storage full: the run still counts this session */
      return false;
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
  shopAvailable(): boolean {
    return false;
  }
  async catalog(): Promise<Product[]> {
    return [];
  }
  async buy(_id: string): Promise<Purchase | null> {
    return null;
  }
  async purchases(): Promise<Purchase[]> {
    return [];
  }
  async consume(_token: string): Promise<boolean> {
    return true;
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
