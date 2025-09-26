#!/bin/bash

INPUT="/d/obs/star_wars_jedi_survivor_2025-05-22 22-52-35.mkv"
OUTPUT="/d/obs/star_wars_jedi_survivor_2025-05-22 22-52-35_DUCKING_GAME.mkv"
FFMPEG="/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe"

VOICE_BOOST=1.0  # e.g. 1.0 = no boost, 1.3 = 30% louder

"$FFMPEG" -i "$INPUT" \
-filter_complex "\
[0:a:2][0:a:1]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=500[game_ducked]; \
[0:a:1]volume=$VOICE_BOOST[voice_boosted]; \
[voice_boosted][game_ducked]amix=inputs=2:duration=first:dropout_transition=0[a1mix]" \
-map 0:v \
-map "[a1mix]" \
-map 0:a:1 \
-map 0:a:2 \
-c:v copy \
-c:a:0 aac -b:a:0 192k -ar:a:0 48000 \
-c:a:1 copy \
-c:a:2 copy \
"$OUTPUT"