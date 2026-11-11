// Yandex Games: the SDK at /sdk.js (index.html loads it in this build), cloud saves on the player, ads, the
// LoadingAPI and GameplayAPI markup the moderators check. https://yandex.ru/dev/games/doc/ru/sdk/sdk-about

import type { SaveData } from "../game/save";
import { BasePlatform, dayNumber, weekNumber, type Board, type BoardName, type Product, type Purchase } from "./platform";

/**
 * Yandex keeps one best score per player and never resets a board, so a trial's board stores period * DAY + score
 * (the day for "daily", the week for "weekly"): the current period's results rank above older ones and among
 * themselves by score, and a player's best rolls over to the new period by itself. All three boards (score, daily,
 * weekly) must exist in the console under these technical names.
 */
const DAY = 1_000_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
type YSDK = any;
declare const YaGames: { init(): Promise<YSDK> } | undefined;

/** Cloud writes: at most one every few seconds (player.setData allows 100 requests in 5 minutes). */
const CLOUD_EVERY = 4000;
/** After a failed cloud write, the next try comes this much later (unless a newer save comes first). */
const CLOUD_RETRY = 15_000;
/** A leaderboard is asked again only after this long (getEntries allows 20 requests in 5 minutes). */
const BOARD_TTL = 60_000;

/** The save as kept in the cloud and on the device: when it was written, to tell the newer copy. */
interface Stored {
  at: number;
  save: SaveData;
}

export class YandexPlatform extends BasePlatform {
  readonly name = "yandex" as const;
  private sdk: YSDK = null;
  private player: any = null;
  private adOpen = false;
  /** The payments object (ysdk.getPayments: the catalog is loaded before the shop first opens). */
  private pay: any = null;
  /** The platform has paused the game (game_api_pause) and not yet resumed it: also its own ad at the start. */
  private sdkPaused = false;
  /** The latest save waiting for its cloud write, the timer that will send it, and when the last one went. */
  private cloudNext: Stored | null = null;
  private cloudTimer = 0;
  private cloudLast = 0;
  /** The cloud writes, one after another in order (a slow old write never lands after a newer one). */
  private cloudChain: Promise<boolean> = Promise.resolve(true);
  /** A write waiting in the chain must go out at once (a purchase): the SDK's flush flag. */
  private cloudFlush = false;
  private boardCache = new Map<BoardName, { at: number; board: Board }>();

  override async init(): Promise<void> {
    this.watchFocus();
    try {
      if (typeof YaGames === "undefined") return;
      this.sdk = await YaGames.init();
      // the platform pauses the game for its ads (the one it shows at the start too), purchases and hidden tabs
      this.sdk.on("game_api_pause", () => {
        this.sdkPaused = true;
        void this.flushCloud();
        this.pauseCbs.forEach((f) => f());
      });
      this.sdk.on("game_api_resume", () => {
        this.sdkPaused = false;
        this.focusPaused = false;
        this.resumeCbs.forEach((f) => f());
      });
      try {
        this.player = await this.sdk.getPlayer();
      } catch {
        this.player = null;
      }
      // a player who signs in after playing as a guest chooses which progress to keep: start again with that one
      const closed = this.sdk.EVENTS?.ACCOUNT_SELECTION_DIALOG_CLOSED;
      if (closed) this.sdk.on(closed, () => location.reload());
      // purchases (signed: false, the default: the game delivers them itself)
      try {
        this.pay = await this.sdk.getPayments();
      } catch {
        this.pay = null;
      }
    } catch (e) {
      console.warn("Yandex SDK unavailable, running without it", e);
    }
    // the cloud write still waiting goes out before the page is left
    addEventListener("pagehide", () => void this.flushCloud());
  }
  /** A pause that came before the game was listening (the ad at the start) still reaches it. */
  override onPause(cb: () => void): void {
    super.onPause(cb);
    if (this.sdkPaused) cb();
  }
  protected override held(): boolean {
    return this.sdkPaused || this.adOpen;
  }
  private authorized(): boolean {
    return !!this.player && this.player.isAuthorized() === true;
  }
  /** The device's copy of the save, kept apart for each player on this device (a guest and an account differ). */
  private get localKey(): string {
    return this.player ? `bf-save-y-${this.player.getUniqueID()}` : "bf-save";
  }
  override language(): string {
    return this.sdk?.environment?.i18n?.lang ?? super.language();
  }
  override isMobile(): boolean {
    const d = this.sdk?.deviceInfo;
    return d ? d.isMobile() || d.isTablet() : super.isMobile();
  }
  override ready(): void {
    this.sdk?.features?.LoadingAPI?.ready();
  }
  override gameplayStart(): void {
    this.sdk?.features?.GameplayAPI?.start();
  }
  override gameplayStop(): void {
    this.sdk?.features?.GameplayAPI?.stop();
  }
  override async load(): Promise<SaveData | null> {
    let local: Stored | null = null;
    try {
      const raw = localStorage.getItem(this.localKey);
      if (raw) local = JSON.parse(raw) as Stored;
    } catch {
      local = null;
    }
    if (!this.player) return local?.save ?? (await super.load());
    try {
      const cloud = (await this.player.getData(["save", "at"])) as Partial<Stored> | undefined;
      // the newer of the two: the cloud unless this device saved later and the write did not get through
      if (cloud?.save && (!local || (cloud.at ?? 0) >= local.at)) return cloud.save;
    } catch {
      /* offline: the device's copy */
    }
    // the first time on Yandex with this version: the old device save, if any
    return local?.save ?? (await super.load());
  }
  override async save(data: SaveData, now = false): Promise<boolean> {
    // a copy that changes no more (the game keeps changing its own save object)
    const stored: Stored = { at: Date.now(), save: JSON.parse(JSON.stringify(data)) as SaveData };
    let local = true;
    try {
      localStorage.setItem(this.localKey, JSON.stringify(stored));
    } catch {
      /* private mode: the cloud copy is the only one */
      local = false;
    }
    if (!this.player) return local;
    this.cloudNext = stored;
    if (now) return this.flushCloud(true);
    if (!this.cloudTimer) this.cloudTimer = window.setTimeout(() => void this.flushCloud(), Math.max(0, this.cloudLast + CLOUD_EVERY - Date.now()));
    return local;
  }
  /**
   * Send the waiting save to the cloud (flush: at once, not queued by the SDK). Writes go one at a time, in order;
   * a failed one is tried again a little later unless a newer save has taken its place. Resolves true once the
   * latest save is in the cloud.
   */
  private flushCloud(flush = false): Promise<boolean> {
    clearTimeout(this.cloudTimer);
    this.cloudTimer = 0;
    this.cloudFlush = this.cloudFlush || flush;
    const run = async (): Promise<boolean> => {
      const next = this.cloudNext, fl = this.cloudFlush;
      if (!next || !this.player) return true;
      this.cloudNext = null;
      this.cloudFlush = false;
      this.cloudLast = Date.now();
      try {
        await this.player.setData({ save: next.save, at: next.at }, fl);
        return true;
      } catch {
        // kept on the device; the cloud gets it on the retry, or with the next save
        if (!this.cloudNext) this.cloudNext = next;
        this.cloudFlush = this.cloudFlush || fl;
        if (!this.cloudTimer) this.cloudTimer = window.setTimeout(() => void this.flushCloud(), CLOUD_RETRY);
        return false;
      }
    };
    this.cloudChain = this.cloudChain.then(run, run);
    return this.cloudChain;
  }
  override submitScore(score: number, board: BoardName = "score"): void {
    if (!this.sdk || !this.authorized()) return; // only signed-in players have a place on the boards
    // a trial's board leads with its day or week, so the current one ranks first (see DAY)
    const period = board === "daily" ? dayNumber() : board === "weekly" ? weekNumber() : 0;
    const value = period ? period * DAY + Math.min(DAY - 1, Math.floor(score)) : Math.floor(score);
    void (async () => {
      try {
        if (!(await this.sdk.isAvailableMethod("leaderboards.setScore"))) return;
        await this.sdk.leaderboards.setScore(board, value);
        this.boardCache.delete(board);
      } catch {
        /* offline or too soon (one write a second): the result stays in the save */
      }
    })();
  }
  override async leaderboard(board: BoardName): Promise<Board | null> {
    if (!this.sdk) return null;
    const cached = this.boardCache.get(board);
    if (cached && Date.now() - cached.at < BOARD_TTL) return cached.board;
    try {
      const res = await this.sdk.leaderboards.getEntries(board, { quantityTop: 10, includeUser: this.authorized(), quantityAround: 2 });
      const period = board === "daily" ? dayNumber() : board === "weekly" ? weekNumber() : 0, me = this.player?.getUniqueID();
      const entries = (res.entries as any[])
        .filter((e) => !period || Math.floor(e.score / DAY) === period)
        .map((e) => ({ rank: e.rank, name: e.player?.publicName || "?", score: period ? e.score % DAY : e.score, me: !!me && e.player?.uniqueID === me }));
      const mine = entries.find((e) => e.me), out = { entries, myRank: mine ? mine.rank : 0 };
      this.boardCache.set(board, { at: Date.now(), board: out });
      return out;
    } catch {
      return cached?.board ?? null;
    }
  }
  override canSignIn(): boolean {
    return !!this.sdk && !this.authorized();
  }
  /** Yandex ID sign-in, only from a button the player pressed (moderation 1.2.1). */
  override async signIn(): Promise<boolean> {
    try {
      await this.sdk.auth.openAuthDialog();
      this.player = await this.sdk.getPlayer();
      this.boardCache.clear();
      return this.authorized();
    } catch {
      return false;
    }
  }
  override shopAvailable(): boolean {
    return !!this.pay;
  }
  override async catalog(): Promise<Product[]> {
    if (!this.pay) return [];
    try {
      const list = (await this.pay.getCatalog()) as any[];
      return list.map((p) => ({
        id: p.id,
        title: p.title ?? p.id,
        price: p.price ?? `${p.priceValue ?? ""}`,
        priceValue: Number(p.priceValue ?? 0),
        currencyImage: typeof p.getPriceCurrencyImage === "function" ? p.getPriceCurrencyImage("medium") : "",
      }));
    } catch {
      return [];
    }
  }
  override async buy(id: string): Promise<Purchase | null> {
    if (!this.pay) return null;
    try {
      const p = await this.pay.purchase({ id });
      return p ? { id: p.productID ?? id, token: p.purchaseToken } : null;
    } catch {
      return null;
    }
  }
  override async purchases(): Promise<Purchase[]> {
    if (!this.pay) return [];
    try {
      const list = (await this.pay.getPurchases()) as any[];
      return list.map((p) => ({ id: p.productID, token: p.purchaseToken }));
    } catch {
      return [];
    }
  }
  override async consume(token: string): Promise<boolean> {
    try {
      await this.pay?.consumePurchase(token);
      return !!this.pay;
    } catch {
      /* consumed next time the game starts (see Game.deliverPending: it is not given twice) */
      return false;
    }
  }
  override canShowRewarded(): boolean {
    return !!this.sdk;
  }
  /**
   * A fullscreen ad. The game and its sound stop while it shows (moderation 4.7): by onOpen and onClose here, and
   * by game_api_pause and game_api_resume as well. onClose comes even when the platform did not show the ad
   * (called too soon after the last one); then the game was never paused and goes on.
   */
  override showInterstitial(): Promise<void> {
    if (!this.sdk || this.adOpen) return Promise.resolve();
    return new Promise((done) => {
      let opened = false, finished = false;
      const end = () => {
        if (finished) return;
        finished = true;
        this.adOpen = false;
        if (opened) (this.focusPaused = false), this.resumeCbs.forEach((f) => f());
        done();
      };
      this.adOpen = true;
      this.sdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => {
            opened = true;
            this.pauseCbs.forEach((f) => f());
          },
          onClose: end,
          onError: end,
        },
      });
    });
  }
  /** A rewarded video, only from a button that says so (4.5); true once onRewarded has come. */
  override showRewarded(): Promise<boolean> {
    if (!this.sdk || this.adOpen) return Promise.resolve(false);
    return new Promise((done) => {
      let rewarded = false, opened = false, finished = false;
      const end = () => {
        if (finished) return;
        finished = true;
        this.adOpen = false;
        if (opened) (this.focusPaused = false), this.resumeCbs.forEach((f) => f());
        done(rewarded);
      };
      this.adOpen = true;
      this.sdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => {
            opened = true;
            this.pauseCbs.forEach((f) => f());
          },
          onRewarded: () => (rewarded = true),
          onClose: end,
          onError: end,
        },
      });
    });
  }
}
