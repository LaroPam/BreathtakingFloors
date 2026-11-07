// The canvases the bake draws into, shared with tools/check/clip.mjs (which makes sure nothing falls off them).

/** A pose of the hero: room for the longest blade at full stretch, the anchor at the feet. */
export const RIG_CANVAS = { W: 160, H: 128, OX: 80, OY: 96 };
/** Room added on every side of an effect's own canvas, so trails and sparks that overshoot it are kept. */
export const FX_PAD = 16;
