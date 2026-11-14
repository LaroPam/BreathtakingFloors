// CrazyGames: their HTML5 SDK v3 (docs.crazygames.com/sdk/intro), loaded by index.html before the game's code in this
// build, then `await CrazyGames.SDK.init()`. What their requirements ask of a full implementation, and how it is done:
//   - gameplayStart / gameplayStop around play (the first start marks the initial download), loadingStart / Stop
//     around the loading (docs.crazygames.com/sdk/game);
//   - the game's sound follows the platform's muteAudio setting, which outranks the game's own switch;
//   - progress in the data module, for guests and signed-in players alike, never in the browser's own storage when the
//     SDK is there (docs.crazygames.com/sdk/data; the submission's "Progress Save" must be on);
//   - video ads only through requestAd("midgame" | "rewarded"): the game and its sound stop when the ad starts, go on
//     when it finishes or fails; no reward on adError; reward buttons gone with an ad blocker or when ads are off
//     (docs.crazygames.com/sdk/video-ads, docs.crazygames.com/requirements/ads);
//   - the player's language from systemInfo.locale, English otherwise; the device type from systemInfo, not from
//     touch detection (docs.crazygames.com/sdk/user, docs.crazygames.com/requirements/technical);
//   - happytime() for the great moments, reportGameCompletedPercentage() for how far down the tower.
// Off CrazyGames (the SDK's "disabled" environment, or no SDK at all) every call is skipped and the game runs as a
// plain web page.

import type { SaveData } from "../game/save";
import { BasePlatform } from "./platform";

/* The SDK's surface, as its documentation describes it. */
interface CGSettings {
  disableChat: boolean;
  muteAudio: boolean;
}
interface CGSystemInfo {
  countryCode: string;
  locale: string;
  device: { type: "desktop" | "tablet" | "mobile" };
  os: { name: string; version: string };
  browser: { name: string; version: string };
  applicationType: "google_play_store" | "apple_store" | "pwa" | "web";
}
interface CGAdError {
  code: "adsDisabled" | "unfilled" | "adblock" | "adCooldown" | "other";
  message: string;
}
interface CGAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: CGAdError) => void;
}
interface CGSDK {
  init(): Promise<void>;
  environment: "local" | "crazygames" | "disabled";
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    reportGameCompletedPercentage(percent: number): void;
    settings: CGSettings;
    addSettingsChangeListener(listener: (settings: CGSettings) => void): void;
  };
  ad: {
    requestAd(type: "midgame" | "rewarded", callbacks: CGAdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  user: { systemInfo: CGSystemInfo };
}
declare global {
  interface Window {
    CrazyGames?: { SDK: CGSDK };
  }
}

const KEY = "bf-save";
/** How long to wait for init (it preloads the player's data) before the game goes on without the SDK (ms). */
const INIT_WAIT = 15_000;
/** A promise, or null if it has not settled within `ms`. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((done) => setTimeout(() => done(null), ms))]);
}

export class CrazyGamesPlatform extends BasePlatform {
  readonly name = "crazygames" as const;
  /** A map change is a fit moment for a midgame ad (the portal between places; the SDK keeps the pace itself). */
  override readonly adsBetweenPlaces = true;
  /** A revive for an ad: never on every death (their rule), at most once in ten minutes. */
  override readonly reviveGap = 600;
  private sdk: CGSDK | null = null;
  private muted = false;
  /** An ad blocker, or ads switched off for this session (a basic launch, kids mode): no rewarded buttons then. */
  private noAds = false;
  /** An ad is on screen: focus coming back does not resume the game. */
  private adOn = false;

  override async init(): Promise<void> {
    this.watchFocus();
    try {
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) return;
      if ((await within(sdk.init().then(() => true), INIT_WAIT)) === null) return console.warn("CrazyGames SDK did not answer, running without it");
      // elsewhere (the game's own site) every call would throw: the game runs on its own there
      if (sdk.environment === "disabled") return;
      this.sdk = sdk;
      sdk.game.loadingStart();
      this.muted = !!sdk.game.settings?.muteAudio;
      sdk.game.addSettingsChangeListener((s) => {
        this.muted = !!s.muteAudio;
        this.audioCbs.forEach((f) => f(!this.muted));
      });
      this.noAds = !!(await within(sdk.ad.hasAdblock().catch(() => false), 3000));
    } catch (e) {
      console.warn("CrazyGames SDK unavailable, running without it", e);
      this.sdk = null;
    }
  }
  protected override held(): boolean {
    return this.adOn;
  }
  /** The player's language from the platform, English when it gives none (their rule). */
  override language(): string {
    const locale = this.sdk?.user.systemInfo?.locale;
    return locale ? locale.slice(0, 2).toLowerCase() : this.sdk ? "en" : super.language();
  }
  /** Phones and tablets by the platform's own device detection (a touch screen does not make a laptop a phone). */
  override isMobile(): boolean {
    const type = this.sdk?.user.systemInfo?.device?.type;
    return type ? type !== "desktop" : super.isMobile();
  }
  override ready(): void {
    this.sdk?.game.loadingStop();
  }
  override gameplayStart(): void {
    this.sdk?.game.gameplayStart();
  }
  override gameplayStop(): void {
    this.sdk?.game.gameplayStop();
  }
  override happyTime(): void {
    this.sdk?.game.happytime();
  }
  override progress(percent: number): void {
    this.sdk?.game.reportGameCompletedPercentage(Math.max(0, Math.min(100, Math.round(percent))));
  }

  // ---- sound: the platform's mute outranks the game's own switch
  override audioAllowed(): boolean {
    return !this.muted;
  }

  // ---- saves: the data module (it keeps a guest's progress too and moves it to the account on sign-in)
  override async load(): Promise<SaveData | null> {
    if (!this.sdk) return super.load();
    try {
      const s = this.sdk.data.getItem(KEY);
      if (s) return JSON.parse(s) as SaveData;
    } catch (e) {
      console.warn("CrazyGames data module:", e);
    }
    // (a player from before this build kept their progress in the browser: it moves over on the next save)
    return super.load();
  }
  override async save(data: SaveData, _now = false): Promise<boolean> {
    if (!this.sdk) return super.save(data);
    try {
      // (the SDK sends it a second later, gathering the saves made meanwhile)
      this.sdk.data.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // the data module off (the submission's progress save not chosen) or over its 1 MB: the browser keeps it
      console.warn("CrazyGames data module:", e);
      return super.save(data);
    }
  }

  // ---- video ads: the game stops when the ad starts (not on the request: often none comes), goes on after
  private ad(type: "midgame" | "rewarded"): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(false);
    return new Promise((done) => {
      let started = false;
      const end = (shown: boolean) => {
        if (started) {
          this.adOn = false;
          this.focusPaused = false;
          this.resumeCbs.forEach((f) => f());
        }
        done(shown);
      };
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            this.adOn = true;
            this.pauseCbs.forEach((f) => f());
          },
          adFinished: () => end(true),
          adError: (e) => {
            // an ad blocker, or no ads this session: the reward buttons go (none that do nothing)
            if (e?.code === "adblock" || e?.code === "adsDisabled") this.noAds = true;
            end(false);
          },
        });
      } catch (e) {
        console.warn("CrazyGames ad:", e);
        end(false);
      }
    });
  }
  override canShowRewarded(): boolean {
    return !!this.sdk && !this.noAds;
  }
  override async showInterstitial(): Promise<void> {
    await this.ad("midgame");
  }
  override async showRewarded(): Promise<boolean> {
    return this.canShowRewarded() ? this.ad("rewarded") : false;
  }
}
