import type { Platform } from "./platform";

/**
 * The platform this build was made for (vite --mode yandex | youtube | vk | pikabu; anything else is a plain web
 * page, for the game's own site). Each is loaded on its own, so a build carries only its platform and its SDK.
 */
export async function createPlatform(): Promise<Platform> {
  if (__PLATFORM__ === "yandex") return new (await import("./yandex")).YandexPlatform();
  if (__PLATFORM__ === "youtube") return new (await import("./youtube")).YouTubePlatform();
  if (__PLATFORM__ === "vk") return new (await import("./vk")).VKPlatform();
  if (__PLATFORM__ === "pikabu") return new (await import("./pikabu")).PikabuPlatform();
  if (__PLATFORM__ === "crazygames") return new (await import("./crazygames")).CrazyGamesPlatform();
  return new (await import("./local")).LocalPlatform();
}
export type { Platform };
