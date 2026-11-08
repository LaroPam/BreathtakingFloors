// The hero seen from behind and a little to the side, climbing: a step cycle for the stairs between floors (game.ts,
// the climb). The run's legs, turned three quarters away from the eye (back and cloak to us), the body leaning
// into the slope and each stride lifted onto the next tread.

const DEG = Math.PI / 180;
/** The climb's frames, from a weapon's run poses. */
export function climbPoses(run) {
  return run.map((p, k) => {
    const u = (k / run.length) * Math.PI * 2;
    return {
      ...p,
      turn: -54 * DEG,
      lean: (p.lean ?? 0) * 0.5 + 2.5,
      // the stride shorter and the leading foot higher: steps, not flat ground
      ffy: (p.ffy ?? -4) - Math.max(0, Math.sin(u)) * 3,
      fby: (p.fby ?? -4) - Math.max(0, -Math.sin(u)) * 3,
    };
  });
}
