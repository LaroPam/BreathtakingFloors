// A small heart that heals: plump, lit top-left, beating. Smaller than pixelfx's heart pickup so it sits with the
// soul shards on a crowded floor.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Small heart",
  desc: "A 9 px glossy red heart that beats lub-dub with a little squash and a pink glint.",
  tags: ["pickup", "heart", "heal", "loop"],
  size: [16, 16],
  origin: [8, 13],
  duration: 1,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { palette: ["#3a0a14", "#a0142c", "#e8304a", "#ff8a9a", "#ffffff"] },
};

const A = [".kk.kk.", "kbBkbbk", "kbbbbbk", "kbbbbck", ".kbbck.", "..kck..", "...k..."];
const B = [".kk.kk.", "kBBkbbk", "kbbbbbk", ".kbbck.", "..kck..", "...k..."];

export function draw(p, t, o) {
  const C = fit(o.palette, 5), u = t / meta.duration, beat = u < 0.12 || (u > 0.24 && u < 0.34);
  const rows = beat ? B : A;
  p.sprite(rows, { k: C[0], b: C[2], B: C[3], c: C[1] }, -3, beat ? -7 : -8);
  p.px(-2, beat ? -6 : -7, C[4]);
  p.glow(0, -4, 7, C[2], beat ? 0.4 : 0.22);
}
