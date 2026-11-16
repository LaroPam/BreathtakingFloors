#!/usr/bin/env bash
# The store trailer from the frames tools/promo/trailer.cjs wrote: the cover first (a still, as CrazyGames asks, so the
# hover preview starts from the thumbnail), then the game, every pixel scaled up by nearest neighbour. Two of each:
# silent (what CrazyGames takes: their previews play muted, and a file with sound is refused) and with the music.
#   node tools/promo/covers.cjs && node tools/promo/trailer.cjs land && node tools/promo/trailer.cjs tall
#   bash tools/promo/trailer.sh [music.mp3]   (writes records/promo/trailer/*.mp4)
set -euo pipefail
cd "$(dirname "$0")/../.."
MUSIC="${1:-}"
OUT=records/promo/trailer
mkdir -p "$OUT"
# the music from its first downbeat on (the cuts in trailer.cjs fall on its bars)
MUSIC_AT=14.22

encode() { # view width height cover-art name
  local view=$1 w=$2 h=$3 cover=$4 name=$5
  local dir="records/promo/trailer-$view"
  local covern total
  covern=$(node -e "console.log(require('./$dir/cuts.json').cover)")
  total=$(node -e "console.log(require('./$dir/cuts.json').total)")
  local secs
  secs=$(node -e "console.log(($total/30).toFixed(3))")
  local fade
  fade=$(node -e "console.log(($total/30-0.8).toFixed(3))")
  local vf="[0]scale=$w:$h:flags=neighbor,trim=end_frame=$covern,setpts=PTS-STARTPTS,setsar=1,format=yuv420p[c];[1]scale=$w:$h:flags=neighbor,setsar=1,format=yuv420p[g];[c][g]concat=n=2:v=1:a=0[v]"
  ffmpeg -y -loglevel error -loop 1 -framerate 30 -i "$cover" -framerate 30 -start_number 0 -i "$dir/frames/f%04d.jpg" \
    -filter_complex "$vf" -map "[v]" -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r 30 \
    -t "$secs" -movflags +faststart -an "$OUT/$name.mp4"
  if [ -n "$MUSIC" ]; then
    ffmpeg -y -loglevel error -i "$OUT/$name.mp4" -ss "$MUSIC_AT" -i "$MUSIC" -map 0:v -map 1:a -c:v copy \
      -af "afade=t=in:st=0:d=0.05,afade=t=out:st=$fade:d=0.8" -c:a aac -b:a 192k -t "$secs" -movflags +faststart "$OUT/$name-music.mp4"
  fi
}

encode land 1920 1080 records/promo/covers/cover-landscape-art.png breathtaking-floors-1920x1080
encode tall 1080 1620 records/promo/covers/cover-portrait-art.png breathtaking-floors-1080x1620
ls -la "$OUT"
