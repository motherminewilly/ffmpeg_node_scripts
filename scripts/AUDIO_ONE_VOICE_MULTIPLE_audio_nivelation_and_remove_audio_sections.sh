#!/bin/bash
FFMPEG="/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe"
# VOICE_BOOST=1.3 # Red dead
VOICE_BOOST=1.2 #Star wars
# FINAL_BOOST=1.7 # Red dead
FINAL_BOOST=1.4 # Star Wars

CONFIG_FILE="AUDIO_ONE_VOICE_CONFIG_MULTIPLE_audio_nivelation_and_remove_audio_sections.json"
CONFIG=$(<"$CONFIG_FILE")

# Convert hh:mm:ss.xxx to seconds (float)
time_to_sec() {
  local t=$1
  IFS=: read h m s <<< "$t"
  echo "scale=3; $h*3600 + $m*60 + $s" | bc
}

# Generate mute volume filter string for given JSON array and labels
generate_mute_filter() {
  local json="$1"
  local label="$2"      # output label, e.g. voice or game
  local input_label="$3" # input label before mute filter, e.g. voice_boosted or game_ducked

  # If empty or null, return input label as passthrough
  if [[ -z "$json" || "$json" == "null" ]]; then
    echo "$input_label"
    return
  fi

  local expr=""
  local len
  len=$(echo "$json" | jq 'length')

  if (( len == 0 )); then
    echo "$input_label"
    return
  fi

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

  # The filter turns volume to 0 in these ranges
  echo "[$input_label]volume=enable='${expr}':volume=0[${label}_muted]"
}

# Parse CONFIG array length
num_files=$(echo "$CONFIG" | jq 'length')

for (( idx=0; idx<num_files; idx++ )); do
  fileToProcess=$(echo "$CONFIG" | jq -r ".[$idx].fileToProcess")
  outputFile=$(echo "$CONFIG" | jq -r ".[$idx].outputFile")
  mute_voice_ranges=$(echo "$CONFIG" | jq -c ".[$idx].MUTE_VOICE_RANGES // empty")
  mute_game_ranges=$(echo "$CONFIG" | jq -c ".[$idx].MUTE_GAME_RANGES // empty")

  if [[ "$fileToProcess" == "null" || "$outputFile" == "null" ]]; then
    echo "Skipping entry $idx due to missing fileToProcess or outputFile"
    continue
  fi

  echo ""
  echo ""
  echo ""
  echo "Processing file $fileToProcess -> $outputFile"

  voice_mute_filter=$(generate_mute_filter "$mute_voice_ranges" "voice" "voice_boosted")
  game_mute_filter=$(generate_mute_filter "$mute_game_ranges" "game" "game_ducked")

  filter_complex="
  [0:a:2][0:a:1]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=500[game_ducked];
  [0:a:1]volume=$VOICE_BOOST[voice_boosted];
  "

  # Handle voice mute filter
  if [[ "$voice_mute_filter" == "voice_boosted" ]]; then
    filter_complex+="[voice_boosted]anull[voice_muted];"
  else
    filter_complex+="${voice_mute_filter};"
  fi

  # Handle game mute filter
  if [[ "$game_mute_filter" == "game_ducked" ]]; then
    filter_complex+="[game_ducked]anull[game_muted];"
  else
    filter_complex+="${game_mute_filter};"
  fi

  filter_complex+="
  [voice_muted][game_muted]amix=inputs=2:duration=first:dropout_transition=0[a1mix];
  [a1mix]volume=${FINAL_BOOST}[a1final]
  "

  "$FFMPEG" -i "$fileToProcess" \
    -filter_complex "$filter_complex" \
    -map 0:v \
    -map "[a1final]" \
    -map 0:a:1 \
    -map 0:a:2 \
    -c:v copy \
    -c:a:0 aac -b:a:0 192k -ar:a:0 48000 \
    -c:a:1 copy \
    -c:a:2 copy \
    "$outputFile"

  # Save config file alongside video input
  input_no_ext="${outputFile%.*}"
  jq ".[$idx]" "$CONFIG_FILE" > "$input_no_ext--CONFIG.json"

  # Second output: only modified 1st stream
  ext="${fileToProcess##*.}"
  outputFileOnlyFirstStream="${input_no_ext}--TO-UPLOAD-ONLY-ONE-AUDIO.${ext}"
  echo ""
  echo ""
  echo ""
  echo "Processing second video file WITH ONLY 1 MODIFIED AUDIO STREAM: $fileToProcess -> $outputFileOnlyFirstStream"
  # Reuse already generated outputFile, keeping only first audio stream
  "$FFMPEG" -i "$outputFile" \
    -map 0:v \
    -map 0:a:0 \
    -c copy \
    "$outputFileOnlyFirstStream"

  # Generate video audio files
  ./GENERATE_VIDEO_FILES_FOR_AUDIOS.sh "$outputFile"



 

done