#!/usr/bin/env bash
# The weapon artifacts as one video for the owner, from the frames tools/promo/arts.cjs wrote: each artifact (then each
# evolution) for three seconds, the sword on the left and the bow on the right. Written to records/promo/arts/.
set -euo pipefail
cd "$(dirname "$0")/../.."
A=records/promo/arts
list=$(mktemp)
for d in "$A"/a*-sword "$A"/e*-sword; do
  [ -d "$d" ] || continue
  base=${d%-sword}
  out="$base.mp4"
  ffmpeg -y -loglevel error -framerate 30 -i "$d/f%04d.jpg" -framerate 30 -i "$base-bow/f%04d.jpg" \
    -filter_complex "[0][1]hstack,scale=1440:-2,format=yuv420p[v]" -map "[v]" -c:v libx264 -preset medium -crf 22 "$out"
  echo "file '$(realpath "$out")'" >> "$list"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -c copy -movflags +faststart "$A/artifacts.mp4"
rm -f "$list"
ls -la "$A"/artifacts.mp4
