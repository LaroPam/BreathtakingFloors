#!/usr/bin/env bash
# The weapon artifacts' prototype as videos for the owner, from the frames tools/promo/arts.cjs wrote: per artifact a
# 2 x 2 grid (the sword above, the bow below; level 1 on the left, level 5 on the right), the evolution side by side,
# and the panel's still. Written to records/promo/arts/.
set -euo pipefail
cd "$(dirname "$0")/../.."
A=records/promo/arts
for art in fire ricochet storm frost; do
  ffmpeg -y -loglevel error \
    -framerate 30 -i "$A/$art-melee-1/f%04d.jpg" -framerate 30 -i "$A/$art-melee-5/f%04d.jpg" \
    -framerate 30 -i "$A/$art-ranged-1/f%04d.jpg" -framerate 30 -i "$A/$art-ranged-5/f%04d.jpg" \
    -filter_complex "[0][1]hstack[t];[2][3]hstack[b];[t][b]vstack,format=yuv420p[v]" -map "[v]" \
    -c:v libx264 -preset slow -crf 20 -movflags +faststart "$A/$art.mp4"
done
ffmpeg -y -loglevel error -framerate 30 -i "$A/evo-melee/f%04d.jpg" -framerate 30 -i "$A/evo-ranged/f%04d.jpg" \
  -filter_complex "[0][1]hstack,format=yuv420p[v]" -map "[v]" -c:v libx264 -preset slow -crf 20 -movflags +faststart "$A/evolution.mp4"
ls -la "$A"/*.mp4 "$A"/panel.png
