// Yandex Games: the SDK at /sdk.js (index.html loads it in this build), cloud saves on the player, ads, the
// LoadingAPI and GameplayAPI markup the moderators check. https://yandex.ru/dev/games/doc/ru/sdk/sdk-about

import type { SaveData } from "../game/save";
import { BasePlatform } from "./platform";

/* eslint-disable @typescript-eslint/no-explicit-any */
type YSDK = any;
declare const YaGames: { init(): Promise<YSDK> } | undefined;

export class YandexPlatform extends BasePlatform {
  readonly name = "yandex" as const;
  private sdk: YSDK = null;
  private player: any = null;
  private adOpen = false;

  override async init(): Promise<void> {
    try {
      if (typeof YaGames === "undefined") return;
      this.sdk = await YaGames.init();
      // the platform pauses the game for its own overlays and ads
      this.sdk.on?.("game_api_pause", () => this.pauseCbs.forEach((f) => f()));
      this.sdk.on?.("game_api_resume", () => this.resumeCbs.forEach((f) => f()));
      try {
        this.player = await this.sdk.getPlayer({ scopes: false });
      } catch {
        this.player = null;
      }
    } catch (e) {
      console.warn("Yandex SDK unavailable, running without it", e);
    }
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
    const local = await super.load();
    if (!this.player) return local;
    try {
      const data = (await this.player.getData(["save"]))?.save as SaveData | undefined;
      // keep whichever has seen more play: a fresh device should not wipe the cloud, nor the cloud a newer device
      if (data && (!local || (data.runs ?? 0) >= (local.runs ?? 0))) return data;
    } catch {
      /* fall back to the local copy */
    }
    return local;
  }
  override async save(data: SaveData): Promise<void> {
    await super.save(data);
    try {
      await this.player?.setData({ save: data }, false);
    } catch {
      /* saved locally; the cloud catches up next time */
    }
  }
  override canShowRewarded(): boolean {
    return !!this.sdk;
  }
  override showInterstitial(): Promise<void> {
    if (!this.sdk || this.adOpen) return Promise.resolve();
    return new Promise((done) => {
      this.adOpen = true;
      this.sdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => this.pauseCbs.forEach((f) => f()),
          onClose: () => {
            this.adOpen = false;
            this.resumeCbs.forEach((f) => f());
            done();
          },
          onError: () => {
            this.adOpen = false;
            done();
          },
        },
      });
    });
  }
  override showRewarded(): Promise<boolean> {
    if (!this.sdk || this.adOpen) return Promise.resolve(false);
    return new Promise((done) => {
      let rewarded = false;
      this.adOpen = true;
      this.sdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => this.pauseCbs.forEach((f) => f()),
          onRewarded: () => (rewarded = true),
          onClose: () => {
            this.adOpen = false;
            this.resumeCbs.forEach((f) => f());
            done(rewarded);
          },
          onError: () => {
            this.adOpen = false;
            done(false);
          },
        },
      });
    });
  }
}
