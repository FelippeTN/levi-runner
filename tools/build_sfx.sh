#!/bin/sh
# Efeitos sonoros CC0 da Kenney (baixados por tools/fetch_assets.sh) -> assets/sfx/<nome>.wav, mono 22 kHz,
# com o pico em -1 dB. A música e o "swipe" continuam os gerados por tools/make_sfx.py (rode esse antes, se for).
set -e
cd "$(dirname "$0")/.."
K=.cache/assets/kenney

conv() { # origem nome [filtro extra]
  extra=${3:+,$3}
  peak=$(ffmpeg -hide_banner -nostats -i "$1" -af "volumedetect" -f null - 2>&1 | sed -n 's/.*max_volume: \(-\?[0-9.]*\) dB/\1/p')
  gain=$(echo "-1 - ($peak)" | bc -l)
  ffmpeg -hide_banner -loglevel error -y -i "$1" -ac 1 -ar 22050 -af "volume=${gain}dB$extra" -c:a pcm_s16le "assets/sfx/$2.wav"
  echo "$2 <- $1"
}

conv $K/platformer/jump.ogg jump
conv $K/platformer/land.ogg land
conv $K/platformer/coin.ogg coin
conv $K/platformer/fall.ogg stumble
conv $K/racing/impact.ogg crash
# derrapagem cortada num deslize curto
conv $K/racing/skid.ogg roll "atrim=0:0.4,afade=t=in:d=0.03,afade=t=out:st=0.25:d=0.15"
conv $K/interface/click_002.wav click
conv $K/interface/confirmation_001.wav powerup
