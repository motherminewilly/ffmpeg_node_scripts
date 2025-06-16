#!/bin/bash

INPUT="/d/obs/FOR_TESTING.mkv"
OUTPUT="/d/obs/FOR_TESTING_RESULT.mkv"
FFMPEG="/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe"

VOICE_BOOST=1.0  # e.g. 1.0 = no boost, 1.3 = 30% louder

# Optional: JSON mute ranges
MUTE_VOICE_RANGES='[
  { "from": "00:00:15.100", "to": "00:00:20.100" },
  { "from": "00:00:25.100", "to": "00:00:31.100" }
]'
MUTE_GAME_RANGES='[
  { "from": "00:00:10.100", "to": "00:00:15.100" },
  { "from": "00:00:40.100", "to": "00:00:45.100" }
]'

# Function to convert hh:mm:ss.xxx to seconds (float)
time_to_sec() {
  local t=$1
  IFS=: read h m s <<< "$t"
  echo "scale=3; $h*3600 + $m*60 + $s" | bc
}

# Generate mute volume filter expressions for a label and input
generate_mute_filter() {
  local json="$1"
  local label="$2"  # voice or game
  local input_label="$3" # voice_boosted or game_ducked

  if [[ -z "$json" ]]; then
    # no mute ranges, just return input label
    echo "$input_label"
    return
  fi

  local expr=""
  local len
  len=$(echo "$json" | jq 'length')

  for ((i=0; i<len; i++)); do
    start=$(echo "$json" | jq -r ".[$i].from")
    end=$(echo "$json" | jq -r ".[$i].to")
    start_sec=$(time_to_sec "$start")
    end_sec=$(time_to_sec "$end")

    if [[ -z "$expr" ]]; then
      expr="between(t\,${start_sec}\,${end_sec})"
    else
      expr="${expr}+between(t\,${start_sec}\,${end_sec})"
    fi
  done

  echo "[$input_label]volume=enable='${expr}':volume=0[${label}_muted]"
}

voice_mute_filter=$(generate_mute_filter "$MUTE_VOICE_RANGES" "voice" "voice_boosted")
game_mute_filter=$(generate_mute_filter "$MUTE_GAME_RANGES" "game" "game_ducked")

# Compose filter_complex parts

filter_complex="
[0:a:2][0:a:1]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=500[game_ducked];
[0:a:1]volume=$VOICE_BOOST[voice_boosted];
"

if [[ "$voice_mute_filter" == "voice_boosted" ]]; then
  filter_complex+="[voice_boosted]anull[voice_muted];"
else
  filter_complex+="${voice_mute_filter};"
fi

if [[ "$game_mute_filter" == "game_ducked" ]]; then
  filter_complex+="[game_ducked]anull[game_muted];"
else
  filter_complex+="${game_mute_filter};"
fi

filter_complex+="
[voice_muted][game_muted]amix=inputs=2:duration=first:dropout_transition=0[a1mix]
"

"$FFMPEG" -i "$INPUT" \
-filter_complex "$filter_complex" \
-map 0:v \
-map "[a1mix]" \
-map 0:a:1 \
-map 0:a:2 \
-c:v copy \
-c:a:0 aac -b:a:0 192k -ar:a:0 48000 \
-c:a:1 copy \
-c:a:2 copy \
"$OUTPUT"