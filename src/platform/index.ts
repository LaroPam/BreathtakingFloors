import { LocalPlatform } from "./local";
import type { Platform } from "./platform";
import { YandexPlatform } from "./yandex";
import { YouTubePlatform } from "./youtube";

/** The platform this build was made for (vite --mode yandex | youtube; anything else is a plain web page). */
export function createPlatform(): Platform {
  if (__PLATFORM__ === "yandex") return new YandexPlatform();
  if (__PLATFORM__ === "youtube") return new YouTubePlatform();
  return new LocalPlatform();
}
export type { Platform };
