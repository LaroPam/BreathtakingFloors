/// <reference types="vite/client" />

/** Which build this is: set by vite.config.ts from the build mode. */
declare const __PLATFORM__: "local" | "yandex" | "youtube" | "vk" | "pikabu" | "crazygames";
/** Yandex Metrica's counter id for this build ("" when it has none: then no counter is loaded). */
declare const __METRIKA__: string;
