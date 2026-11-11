// A plain web page: browser storage for saves, no ads. The rewarded "ad" is granted for free so the flow can be
// tested; set ?noads to see the game without the offer. In development (or with ?ads) every ad shows a stand-in
// screen instead, so where the ads fall can be seen and played through: a few seconds, then it closes; a rewarded one
// can be closed early (no reward), as a player might.

import { BasePlatform, type Product, type Purchase } from "./platform";

/** With ?shop in the address the local build has a stand-in shop (buying is free), to try the shop's screens. */
const SHOP = typeof location !== "undefined" && new URLSearchParams(location.search).has("shop");
/** Stand-in ads: in development, or with ?ads in the address. */
const STAND_IN = typeof location !== "undefined" && (import.meta.env.DEV || new URLSearchParams(location.search).has("ads"));

export class LocalPlatform extends BasePlatform {
  readonly name = "local" as const;
  private bought: Purchase[] = [];
  override shopAvailable(): boolean {
    return SHOP;
  }
  override async catalog(): Promise<Product[]> {
    const p = (id: string, v: number): Product => ({ id, title: id, price: `${v} ЯН`, priceValue: v, currencyImage: "" });
    return [p("embers_500", 29), p("embers_1500", 79), p("embers_4000", 179), p("embers_double", 149), p("heroes_all", 199), p("no_ads", 99)];
  }
  override async buy(id: string): Promise<Purchase | null> {
    const p = { id, token: `local-${Date.now()}` };
    this.bought.push(p);
    return p;
  }
  override async purchases(): Promise<Purchase[]> {
    return [];
  }
  override async consume(token: string): Promise<boolean> {
    this.bought = this.bought.filter((p) => p.token !== token);
    return true;
  }
  override canShowRewarded(): boolean {
    return !new URLSearchParams(location.search).has("noads");
  }
  override async showRewarded(): Promise<boolean> {
    return STAND_IN ? this.standIn("rewarded") : true;
  }
  override async showInterstitial(): Promise<void> {
    if (STAND_IN) await this.standIn("interstitial");
  }
  protected override held(): boolean {
    return this.adOpen;
  }

  private adOpen = false;
  /**
   * A stand-in for an ad: a dark screen over the game saying which kind and counting down, the game and its sound
   * paused meanwhile, as a real one would. Resolves true if it ran to the end (a rewarded one earns its reward).
   */
  private standIn(kind: "interstitial" | "rewarded"): Promise<boolean> {
    this.adOpen = true;
    this.pauseCbs.forEach((f) => f());
    return new Promise((done) => {
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(8,6,14,.94);color:#ffe8b0;font:16px monospace;text-align:center";
      const title = document.createElement("div"), count = document.createElement("div"), close = document.createElement("button");
      title.textContent = kind === "rewarded" ? "РЕКЛАМА ЗА НАГРАДУ (ЗАГЛУШКА)" : "МЕЖСТРАНИЧНАЯ РЕКЛАМА (ЗАГЛУШКА)";
      close.textContent = kind === "rewarded" ? "закрыть без награды" : "закрыть";
      close.style.cssText = "font:14px monospace;padding:6px 14px;background:#2a2436;color:#e8dcff;border:1px solid #5a5068;cursor:pointer";
      box.append(title, count, close);
      document.body.append(box);
      let left = kind === "rewarded" ? 5 : 3;
      const end = (watched: boolean) => {
        clearInterval(tick);
        box.remove();
        this.adOpen = false;
        this.focusPaused = false;
        this.resumeCbs.forEach((f) => f());
        done(watched);
      };
      const show = () => (count.textContent = left > 0 ? `${left}` : "");
      show();
      const tick = window.setInterval(() => {
        left--;
        show();
        if (left <= 0) end(true);
      }, 1000);
      close.onclick = () => end(kind === "interstitial");
    });
  }
}
