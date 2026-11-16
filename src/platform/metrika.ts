// Yandex Metrica, for the builds that live on the game's own site (Pikabu, the plain web build): the first session's
// funnel as goals, so we can see where new players leave. Off unless the build is given a counter:
// VITE_METRIKA=<counter id> in .env.pikabu (or .env for the web build); without one this code is cut out of the build.
//
// The tag and its calls are as Metrica's help gives them:
//   https://yandex.ru/support/metrica/ru/code/counter-initialize   the loader (tag.js) and ym(id, "init", {...})
//   https://yandex.ru/support/metrica/ru/objects/reachgoal          ym(id, "reachGoal", target[, params])
// Each goal is made in the counter's settings as a "JavaScript event" with the same identifier (docs/RELEASE.md lists
// them). A blocked tag (an ad blocker) only means no numbers: the game never waits on it.

type Ym = ((...args: unknown[]) => void) & { a?: IArguments[]; l?: number };

let ready = false;
function counter(): Ym | null {
  if (!__METRIKA__) return null;
  const w = window as unknown as { ym?: Ym };
  if (!ready) {
    ready = true;
    try {
      // the loader: calls wait in a queue until tag.js comes and takes them (Metrica's own snippet)
      const q = w.ym ?? (function () {
        // eslint-disable-next-line prefer-rest-params
        (q.a = q.a || []).push(arguments);
      } as Ym);
      q.l = Date.now();
      w.ym = q;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://mc.yandex.ru/metrika/tag.js";
      document.head.appendChild(s);
      // only what the funnel needs: no click map, no session recording, no link tracking
      q(Number(__METRIKA__), "init", { clickmap: false, trackLinks: false, accurateTrackBounce: true, webvisor: false });
    } catch {
      return null;
    }
  }
  return w.ym ?? null;
}

/** A goal reached (a step of the funnel), with its parameters. */
export function metrikaGoal(goal: string, params?: Record<string, string | number>): void {
  if (!__METRIKA__) return;
  try {
    counter()?.(Number(__METRIKA__), "reachGoal", goal, params);
  } catch {
    // (the numbers are not worth a broken game)
  }
}
