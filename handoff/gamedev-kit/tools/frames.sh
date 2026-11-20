#!/usr/bin/env bash
# 見本の動画をコマに切る（ffmpeg が要る）
#   ./frames.sh 見本.mp4 出力フォルダ [1 秒に何枚 = 1]
# 一部を原寸で切り抜くなら：
#   ffmpeg -ss 2.5 -i 見本.mov -frames:v 1 -vf "crop=幅:高さ:左:上" crop.png
set -euo pipefail
in="$1"; out="$2"; fps="${3:-1}"
mkdir -p "$out"
ffprobe -v error -show_entries format=duration:stream=width,height -of compact "$in"
ffmpeg -v error -y -i "$in" -vf "fps=${fps},scale=590:-1" "$out/f%03d.png"
ls "$out" | head
