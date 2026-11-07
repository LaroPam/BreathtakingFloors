// A plain web page: browser storage for saves, no ads. The rewarded "ad" is granted for free so the flow can be
// tested; set ?noads to see the game without the offer.

import { BasePlatform } from "./platform";

export class LocalPlatform extends BasePlatform {
  readonly name = "local" as const;
  override canShowRewarded(): boolean {
    return !new URLSearchParams(location.search).has("noads");
  }
  override async showRewarded(): Promise<boolean> {
    return true;
  }
}
