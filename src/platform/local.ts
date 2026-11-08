// A plain web page: browser storage for saves, no ads. The rewarded "ad" is granted for free so the flow can be
// tested; set ?noads to see the game without the offer.

import { BasePlatform, type Product, type Purchase } from "./platform";

/** With ?shop in the address the local build has a stand-in shop (buying is free), to try the shop's screens. */
const SHOP = typeof location !== "undefined" && new URLSearchParams(location.search).has("shop");

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
  override async consume(token: string): Promise<void> {
    this.bought = this.bought.filter((p) => p.token !== token);
  }
  override canShowRewarded(): boolean {
    return !new URLSearchParams(location.search).has("noads");
  }
  override async showRewarded(): Promise<boolean> {
    return true;
  }
}
