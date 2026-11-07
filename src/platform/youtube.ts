// YouTube Playables: the ytgame SDK (index.html loads it before the game in this build). The rules that matter
// here: say firstFrameReady and gameReady at the right moments, keep saves under 3 MiB and load before saving,
// follow the platform's pause and audio switches, and send scores.
// https://developers.google.com/youtube/gaming/playables/reference/sdk

import type { SaveData } from "../game/save";
import { BasePlatform, type BoardName } from "./platform";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const ytgame: any;

export class YouTubePlatform extends BasePlatform {
  readonly name = "youtube" as const;
  private yt: any = null;
  private loaded = false;

  override async init(): Promise<void> {
    // outside YouTube (a test page) behave like the web build; inside, only the SDK pauses the game
    if (typeof ytgame === "undefined" || !ytgame?.IN_PLAYABLES_ENV) return this.watchFocus();
    this.yt = ytgame;
    this.yt.system.onPause(() => this.pauseCbs.forEach((f) => f()));
    this.yt.system.onResume(() => this.resumeCbs.forEach((f) => f()));
    this.yt.system.onAudioEnabledChange((on: boolean) => this.audioCbs.forEach((f) => f(on)));
  }
  override language(): string {
    // getLanguage() resolves a BCP-47 tag; until then use the browser's
    return this.lang ?? super.language();
  }
  private lang: string | null = null;
  override firstFrame(): void {
    this.yt?.game.firstFrameReady();
    // ask for the language early; the game picks it up on its next text change
    Promise.resolve(this.yt?.system.getLanguage?.()).then((l: string | undefined) => {
      if (l) this.lang = l.slice(0, 2).toLowerCase();
    }).catch(() => {});
  }
  override ready(): void {
    this.yt?.game.gameReady();
  }
  override audioAllowed(): boolean {
    return this.yt ? !!this.yt.system.isAudioEnabled() : true;
  }
  override async load(): Promise<SaveData | null> {
    if (!this.yt) return super.load();
    try {
      const s: string = await this.yt.game.loadData();
      this.loaded = true;
      return s ? (JSON.parse(s) as SaveData) : null;
    } catch {
      return null;
    }
  }
  override async save(data: SaveData): Promise<void> {
    if (!this.yt) return super.save(data);
    if (!this.loaded) return; // saving before a successful load is rejected by the platform
    try {
      await this.yt.game.saveData(JSON.stringify(data));
    } catch (e) {
      this.yt.health?.logWarning?.();
      console.warn("saveData failed", e);
    }
  }
  override canShowRewarded(): boolean {
    return false;
  }
  override submitScore(score: number, board: BoardName = "score"): void {
    if (board !== "score") return;
    try {
      this.yt?.engagement.sendScore({ value: Math.floor(score) });
    } catch {
      /* not fatal */
    }
  }
}
