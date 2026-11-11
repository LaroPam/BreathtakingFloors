// VK Games (a VK mini app): VK Bridge, the official package @vkontakte/vk-bridge (its typings are the reference for
// every method used here). VKWebAppInit, the view hidden and restored, the launch language, saves in VK's per-user
// storage, native interstitial and rewarded ads. In-app purchases (VKWebAppShowOrderBox, paid in votes) need the
// game's own server to answer VK's payment callbacks, so the shop is off on VK until there is one.

import bridge from "@vkontakte/vk-bridge";
import type { SaveData } from "../game/save";
import { BasePlatform } from "./platform";

/**
 * VK's storage: keys of up to 100 characters [a-zA-Z_-0-9], values kept only up to 4096 bytes, 1000 variables a
 * user, 1000 calls an hour a user. The save goes as ASCII-only JSON cut into parts under that size; a write is a few
 * calls (the changed parts and the header), at most one every CLOUD_EVERY, well inside the hourly limit.
 */
const PART = 3800;
const KEY = "bf_save";
const CLOUD_EVERY = 20_000;

/** JSON with everything outside ASCII escaped, so its length in characters is its length in bytes. */
const asciiJson = (v: unknown): string => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

interface Stored {
  at: number;
  save: SaveData;
}

export class VKPlatform extends BasePlatform {
  readonly name = "vk" as const;
  private ok = false;
  private lang = "ru";
  private mobile: boolean | null = null;
  private adOpen = false;
  /** VK hid the mini app (the user left it): the game waits for it to come back. */
  private hidden = false;
  private cloudNext: Stored | null = null;
  private cloudTimer = 0;
  private cloudLast = 0;
  private cloudChain: Promise<boolean> = Promise.resolve(true);
  /** The parts last written, to send only those that changed. */
  private sentParts: string[] = [];

  override async init(): Promise<void> {
    this.watchFocus();
    try {
      // only inside VK (an iframe or VK's app): opened on its own the page has no VK to answer, and runs without it
      if (!bridge.isEmbedded()) throw new Error("not inside VK");
      const silent = new Promise<never>((_, no) => setTimeout(() => no(new Error("VKWebAppInit: no answer")), 5000));
      await Promise.race([bridge.send("VKWebAppInit"), silent]);
      this.ok = true;
      // the launch parameters: the language of VK's interface, the platform (mobile apps and mobile web)
      try {
        const p = await bridge.send("VKWebAppGetLaunchParams");
        if (p.vk_language) this.lang = String(p.vk_language);
        const pl = String(p.vk_platform ?? "");
        this.mobile = pl.startsWith("mobile") ? true : pl.startsWith("desktop") ? false : null;
      } catch {
        /* the defaults: Russian, the browser's own idea of the device */
      }
      bridge.subscribe((e) => {
        const type = e.detail?.type;
        if (type === "VKWebAppViewHide") {
          this.hidden = true;
          void this.flushCloud();
          this.pauseCbs.forEach((f) => f());
        } else if (type === "VKWebAppViewRestore") {
          this.hidden = false;
          this.focusPaused = false;
          this.resumeCbs.forEach((f) => f());
        }
      });
    } catch (e) {
      console.warn("VK Bridge unavailable, running without it", e);
    }
    addEventListener("pagehide", () => void this.flushCloud());
  }
  protected override held(): boolean {
    return this.hidden || this.adOpen;
  }
  override language(): string {
    return this.lang;
  }
  override isMobile(): boolean {
    return this.mobile ?? super.isMobile();
  }

  // ---- saves: VK's storage, with a copy on the device; the newer of the two wins
  override async load(): Promise<SaveData | null> {
    let local: Stored | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) local = JSON.parse(raw) as Stored;
    } catch {
      local = null;
    }
    if (!this.ok) return local?.save ?? (await super.load());
    try {
      const head = (await bridge.send("VKWebAppStorageGet", { keys: [KEY] })).keys[0]?.value;
      if (head) {
        const { n, at } = JSON.parse(head) as { n: number; at: number };
        const keys = Array.from({ length: n }, (_, k) => `${KEY}_${k}`);
        const got = new Map((await bridge.send("VKWebAppStorageGet", { keys })).keys.map((q) => [q.key, q.value] as const));
        const parts = keys.map((k) => got.get(k) ?? "");
        if (parts.every((q) => q)) {
          this.sentParts = parts;
          const cloud = JSON.parse(parts.join("")) as SaveData;
          if (!local || at >= local.at) return cloud;
        }
      }
    } catch {
      /* offline or a broken copy in the cloud: the device's */
    }
    return local?.save ?? (await super.load());
  }
  override async save(data: SaveData, now = false): Promise<boolean> {
    const stored: Stored = { at: Date.now(), save: JSON.parse(JSON.stringify(data)) as SaveData };
    let local = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      local = false;
    }
    if (!this.ok) return local;
    this.cloudNext = stored;
    if (now) return this.flushCloud();
    if (!this.cloudTimer) this.cloudTimer = window.setTimeout(() => void this.flushCloud(), Math.max(0, this.cloudLast + CLOUD_EVERY - Date.now()));
    return local;
  }
  /** Send the waiting save: the parts that changed, then the header that names them. One write at a time, in order. */
  private flushCloud(): Promise<boolean> {
    clearTimeout(this.cloudTimer);
    this.cloudTimer = 0;
    const run = async (): Promise<boolean> => {
      const next = this.cloudNext;
      if (!next || !this.ok) return true;
      this.cloudNext = null;
      this.cloudLast = Date.now();
      const json = asciiJson(next.save), parts: string[] = [];
      for (let k = 0; k < json.length; k += PART) parts.push(json.slice(k, k + PART));
      try {
        for (let k = 0; k < parts.length; k++)
          if (parts[k] !== this.sentParts[k]) await bridge.send("VKWebAppStorageSet", { key: `${KEY}_${k}`, value: parts[k] });
        await bridge.send("VKWebAppStorageSet", { key: KEY, value: JSON.stringify({ n: parts.length, at: next.at }) });
        this.sentParts = parts;
        return true;
      } catch {
        // kept on the device; tried again a little later unless a newer save comes first
        if (!this.cloudNext) this.cloudNext = next;
        this.sentParts = [];
        if (!this.cloudTimer) this.cloudTimer = window.setTimeout(() => void this.flushCloud(), CLOUD_EVERY);
        return false;
      }
    };
    this.cloudChain = this.cloudChain.then(run, run);
    return this.cloudChain;
  }

  // ---- ads: native interstitial between runs, rewarded by the player's own choice; the game stands still meanwhile
  override canShowRewarded(): boolean {
    return this.ok;
  }
  /** Check that VK has an ad of this format, then show it with the game and its sound paused; true if it was shown. */
  private async showAd(format: "interstitial" | "reward"): Promise<boolean> {
    if (!this.ok || this.adOpen) return false;
    try {
      const check = await bridge.send("VKWebAppCheckNativeAds", { ad_format: format });
      if (!check.result) return false;
    } catch {
      return false;
    }
    this.adOpen = true;
    this.pauseCbs.forEach((f) => f());
    try {
      const res = await bridge.send("VKWebAppShowNativeAds", { ad_format: format });
      return !!res.result;
    } catch {
      return false;
    } finally {
      this.adOpen = false;
      this.focusPaused = false;
      if (!this.hidden) this.resumeCbs.forEach((f) => f());
    }
  }
  override async showInterstitial(): Promise<void> {
    await this.showAd("interstitial");
  }
  override showRewarded(): Promise<boolean> {
    return this.showAd("reward");
  }
}
