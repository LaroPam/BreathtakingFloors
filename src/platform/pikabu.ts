// Pikabu Games: their own SDK (games.pikabu.ru/sdk/docs), loaded from https://games.pikabu.ru/sdk/sdk.js, then
// PkbSDK.init() once and sdk.gameStarted() when the first screen is ready. Saves in sdk.storage (200 KB, flush() at
// most 100 times in 5 minutes), fullscreen and rewarded ads, purchases in roubles through sdk.store, sign-in only
// from a button. The platform has no pause events of its own: the game pauses itself on a hidden tab (BasePlatform)
// and around every window it opens (an ad, sign-in, payment). Russian on launch, as the platform asks.

import type { SaveData } from "../game/save";
import { BasePlatform, type Product, type Purchase } from "./platform";

/* The SDK's types, as its documentation describes them. */
type AdError = "NOT_SUPPORTED" | "IN_PROGRESS" | "UI_BUSY" | "COOLDOWN_ACTIVE" | "INVALID_GAME_STATE" | "UNKNOWN";
type AdResult = { rendered: true } | { rendered: false; reason: AdError };
interface AdApi {
  isSupported: boolean;
  canShow(): Promise<boolean>;
  show(): Promise<AdResult>;
}
interface RewardedAdApi {
  isSupported: boolean;
  canShow(): Promise<boolean>;
  show(): Promise<AdResult & { reward: boolean }>;
}
interface PkbProduct {
  id: string;
  name: string;
  price: number;
  currencyCode: "RUB";
  formattedPrice: string;
}
interface PkbPurchase {
  productId: string;
  developerPayload?: string;
  purchaseId: string;
  isConsumable: boolean;
}
type StorageSaveFailureReason = "QUOTA_EXCEEDED" | "RATE_LIMIT" | "REVISION_CONFLICT" | "NETWORK_ERROR" | "UNKNOWN";
interface PkbSDKInstance {
  gameStarted(): void;
  player: { id: string; name: string; avatar: string; isAuthorized: boolean };
  auth: { openAuthDialog(): Promise<void> };
  ads: { fullscreen: AdApi; preloader: AdApi; rewarded: RewardedAdApi };
  store: {
    purchase(o: { productId: string; developerPayload?: string }): Promise<{ success: true; purchase: PkbPurchase } | { success: false; reason: string }>;
    consumePurchase(purchaseId: string): Promise<{ success: boolean }>;
    getProducts(): Promise<PkbProduct[]>;
    getPurchases(): Promise<PkbPurchase[]>;
  };
  storage: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    flush(): Promise<{ success: true } | { success: false; reason: StorageSaveFailureReason }>;
  };
  on(event: "userAuthorized" | "storageSaveError", listener: (...args: never[]) => void): () => void;
}
declare const PkbSDK: { init(): Promise<PkbSDKInstance> } | undefined;

const SDK_URL = "https://games.pikabu.ru/sdk/sdk.js";
/** Explicit flushes: at most 100 in 5 minutes; the SDK also saves by itself shortly after each change. */
const FLUSH_EVERY = 4000;

/** How long to wait for the SDK's script, and for PkbSDK.init(), before the game goes on without them (ms). */
const SCRIPT_WAIT = 10_000;
const INIT_WAIT = 15_000;

/** Load the SDK's script (its documented dynamic way); resolves false if it does not come (an ad blocker, no network). */
function loadScript(): Promise<boolean> {
  return new Promise((done) => {
    const s = document.createElement("script");
    const timer = setTimeout(() => done(false), SCRIPT_WAIT);
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => (clearTimeout(timer), done(true));
    s.onerror = () => (clearTimeout(timer), done(false));
    document.head.append(s);
  });
}
/** A promise, or null if it has not settled within `ms`. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((done) => setTimeout(() => done(null), ms))]);
}

export class PikabuPlatform extends BasePlatform {
  readonly name = "pikabu" as const;
  private sdk: PkbSDKInstance | null = null;
  /** A window of the platform's own is open (an ad, sign-in, payment): focus coming back does not resume the game. */
  private busy = false;
  private flushTimer = 0;
  private lastFlush = 0;

  override async init(): Promise<void> {
    this.watchFocus();
    try {
      // the SDK works only inside the platform's page (or its Studio test page), always in a frame: opened on its
      // own, from the site that hosts it, the game runs as a plain web page rather than wait for an answer
      if (window.top === window.self) return;
      if (!(await loadScript()) || typeof PkbSDK === "undefined") return;
      this.sdk = await within(PkbSDK.init(), INIT_WAIT);
      if (!this.sdk) {
        console.warn("Pikabu SDK did not answer, running without it");
        return;
      }
      this.sdk.on("storageSaveError", ((reason: StorageSaveFailureReason) => {
        // another device or tab changed the save: saving stops until a reload, which brings the newer progress
        if (reason === "REVISION_CONFLICT") location.reload();
        else console.warn("Pikabu storage save failed:", reason);
      }) as (...args: never[]) => void);
    } catch (e) {
      console.warn("Pikabu SDK unavailable, running without it", e);
      this.sdk = null;
    }
  }
  protected override held(): boolean {
    return this.busy;
  }
  /** Russian on launch (the platform's rule); the player can switch in the settings. */
  override language(): string {
    return "ru";
  }
  override ready(): void {
    this.sdk?.gameStarted();
  }
  /** Run one of the platform's windows with the game and its sound paused, and resume after. */
  private async modal<T>(open: () => Promise<T>): Promise<T> {
    this.busy = true;
    this.pauseCbs.forEach((f) => f());
    try {
      return await open();
    } finally {
      this.busy = false;
      this.focusPaused = false;
      this.resumeCbs.forEach((f) => f());
    }
  }

  // ---- saves: sdk.storage for guests and signed-in players alike, with the device's copy as a fallback
  override async load(): Promise<SaveData | null> {
    const cloud = this.sdk?.storage.get("save");
    if (cloud && typeof cloud === "object") return cloud as SaveData;
    return super.load();
  }
  override async save(data: SaveData, now = false): Promise<boolean> {
    const local = await super.save(data);
    if (!this.sdk) return local;
    this.sdk.storage.set("save", data);
    if (now) return this.flush();
    // the SDK sends changes by itself; an explicit flush now and then, within its limit
    if (!this.flushTimer) this.flushTimer = window.setTimeout(() => void this.flush(), Math.max(0, this.lastFlush + FLUSH_EVERY - Date.now()));
    return true;
  }
  private async flush(): Promise<boolean> {
    clearTimeout(this.flushTimer);
    this.flushTimer = 0;
    if (!this.sdk) return false;
    this.lastFlush = Date.now();
    try {
      return (await this.sdk.storage.flush()).success;
    } catch {
      return false;
    }
  }

  // ---- sign-in: only from the player's button; purchases need it (the platform asks for it at payment anyway)
  override canSignIn(): boolean {
    return !!this.sdk && !this.sdk.player.isAuthorized;
  }
  override async signIn(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return false;
    await this.modal(() => sdk.auth.openAuthDialog());
    return sdk.player.isAuthorized;
  }

  // ---- ads
  override canShowRewarded(): boolean {
    return !!this.sdk && this.sdk.ads.rewarded.isSupported;
  }
  override async showInterstitial(): Promise<void> {
    const ads = this.sdk?.ads.fullscreen;
    if (!ads || !ads.isSupported || !(await ads.canShow())) return;
    const res = await this.modal(() => ads.show());
    if (!res.rendered) console.warn("Pikabu ad not shown:", res.reason);
  }
  override async showRewarded(): Promise<boolean> {
    const ads = this.sdk?.ads.rewarded;
    if (!ads || !ads.isSupported || !(await ads.canShow())) return false;
    const res = await this.modal(() => ads.show());
    return res.rendered && res.reward;
  }

  // ---- purchases in roubles (the catalog lives in the Studio, with the same ids as the game's shop)
  override shopAvailable(): boolean {
    return !!this.sdk;
  }
  override async catalog(): Promise<Product[]> {
    if (!this.sdk) return [];
    try {
      return (await this.sdk.store.getProducts()).map((p) => ({ id: p.id, title: p.name, price: p.formattedPrice, priceValue: p.price / 100, currencyImage: "" }));
    } catch {
      return [];
    }
  }
  override async buy(id: string): Promise<Purchase | null> {
    const sdk = this.sdk;
    if (!sdk) return null;
    try {
      const res = await this.modal(() => sdk.store.purchase({ productId: id }));
      return res.success ? { id: res.purchase.productId, token: res.purchase.purchaseId } : null;
    } catch {
      return null;
    }
  }
  override async purchases(): Promise<Purchase[]> {
    if (!this.sdk) return [];
    try {
      return (await this.sdk.store.getPurchases()).map((p) => ({ id: p.productId, token: p.purchaseId }));
    } catch {
      return [];
    }
  }
  override async consume(token: string): Promise<boolean> {
    try {
      return !!this.sdk && (await this.sdk.store.consumePurchase(token)).success;
    } catch {
      return false;
    }
  }
}
