#!/usr/bin/env bash
# Turns the source renders in design/art (gitignored, ~90 MB) into the small WebP files the app ships in public/art.
# Props: crop to one object, cut it out with rembg (local model, nothing uploaded), trim, fit 512 px.
# Needs ImageMagick 7 and rembg (pip install "rembg[cpu,cli]"); set REMBG to its path if not on PATH.
set -euo pipefail
REMBG=${REMBG:-rembg}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cd "$(dirname "$0")/.."
SRC=design/art OUT=public/art
mkdir -p "$OUT/props" "$OUT/site"

# prop <out-name> <source file> [crop WxH+X+Y as fractions of the source, e.g. 0.33x1+0.67+0]
prop() {
  local name=$1 file="$SRC/$2" crop=${3:-}
  local args=()
  if [[ -n $crop ]]; then
    read -r w h x y < <(magick identify -format '%w %h' "$file" | awk -v c="$crop" '{split(c,a,/[x+]/); printf "%d %d %d %d\n", a[1]*$1, a[2]*$2, a[3]*$1, a[4]*$2}')
    args+=(-crop "${w}x${h}+${x}+${y}" +repage)
  fi
  # Several renders sit on a dark backdrop glow; flatten onto black so the model sees one background.
  magick "$file" "${args[@]}" -background black -flatten "$TMP/$name.png"
  "$REMBG" i -m isnet-general-use "$TMP/$name.png" "$TMP/$name-cut.png" 2>/dev/null
  magick "$TMP/$name-cut.png" -channel A -level 3%,100% +channel -background none -alpha background -trim +repage -resize 512x512 -quality 82 -define webp:alpha-quality=90 "$OUT/props/$name.webp"
}

prop cat-orange 'Chibi Cats in Forest-Green Scarves.png' 0.333x1+0+0
prop cat-black  'Chibi Cats in Forest-Green Scarves.png' 0.333x1+0.333+0
prop cat-white  'Chibi Cats in Forest-Green Scarves.png' 0.334x1+0.666+0
prop dog        'Happy Dog in Green Cape.png'
prop bird       'Singing Bluebird with Vines and Flowers.png'
prop book       'Ornate Green and Gold Book Stack.png'
prop umbrella   'Decorative Red Sakura Umbrella with Tassels.png'
prop house      'Charming Moss-Covered Fantasy Cottage.png'
prop mountain   'Snow-Capped Mountain Diorama.png'
prop tree       'Enchanted Tree with Glowing Foliage.png'
prop drop       'Water and Honey Jewel Droplets.png' 0.5x1+0+0
prop drop-honey 'Water and Honey Jewel Droplets.png' 0.5x1+0.5+0
prop cloud      'Enchanted Cloud with Vines and Stars.png'
prop fountain   'Enchanted Tree and Tiered Fountain.png' 0.5x1+0.5+0
prop glasses    'Premium Gold and Green Leaf Glasses.png'
prop hat        'Cute Woven Straw Hat with Floral Trim.png'
prop ball       'Ornate Red Sakura Ball.png'
prop star       'Golden Star and Ornate Coin Collection.png' 0.5x0.68+0.05+0.05
prop shoe       'Enchanted Cream and Forest Green Boots.png'
prop sun        'Decorative Golden Sun Icon.png'
prop lantern    'Ornate Ivy-Wrapped Glowing Lantern.png'
# Whole-scene paintings for the starter deck.
prop cat-hug    'Chibi Boy with Shoulder-Hugging Cat.png'
prop summit     'Snow-Capped Mountain with Cherry Blossoms.png'

# Website art: opaque scenes as wide WebP; characters cut out like the props.
site() { magick "$SRC/$2" -resize "$3" -quality 80 "$OUT/site/$1.webp"; }
site_cut() { # <name> <file> <size> [crop geometry in source pixels]
  magick "$SRC/$2" ${4:+-crop "$4" +repage} -background black -flatten "$TMP/site-$1.png"
  "$REMBG" i -m isnet-general-use "$TMP/site-$1.png" "$TMP/site-$1-cut.png" 2>/dev/null
  magick "$TMP/site-$1-cut.png" -channel A -level 3%,100% +channel -background none -alpha background -trim +repage \
    -resize "$3" -quality 82 -define webp:alpha-quality=90 "$OUT/site/$1.webp"
}
rm -f "$OUT"/site/*.webp
site hero      'Enchanted Garden Rotunda Dioramas.png' 1920x
site rotunda   'Enchanted Rotunda of Golden Pedestals.png' 1600x
site library   'Sunlit Fantasy Atrium Library.png' 1600x
site_cut cards   'Enchanted Fantasy UI Asset Sheet.png' 1000x 1120x530+208+395
site_cut boy-cat 'Chibi Boy with Shoulder-Hugging Cat.png' 640x
site_cut lotus   'Glowing Golden Recall Lotus.png' 560x
site_cut lantern 'Enchanted Golden Lantern with Glowing Ribbons.png' 480x
site_cut fern    'Fern Bush with White Flowers and Mossy Rocks.png' 720x
# Palace textures, cut from the pedestal paintings: a seamless green-marble tile (mirrored 2×2) and the gold
# leaf emblem with its green ground keyed out (gold is red-dominant, the marble green-dominant).
mkdir -p "$OUT/palace"
magick "$SRC/Green Marble Pedestal with Vines.png" -crop 190x260+300+740 +repage \
  \( +clone -flop \) +append \( +clone -flip \) -append -resize 512x512! -quality 80 "$OUT/palace/marble.webp"
magick "$SRC/Stone and Green Panel Pedestal.png" -crop 170x150+430+320 +repage -alpha set \
  -channel A -fx 'clamp((u.r-u.g)*7+0.05)' +channel -trim +repage -resize 256x256 -quality 85 -define webp:alpha-quality=95 "$OUT/palace/emblem.webp"
du -sh "$OUT"/*
