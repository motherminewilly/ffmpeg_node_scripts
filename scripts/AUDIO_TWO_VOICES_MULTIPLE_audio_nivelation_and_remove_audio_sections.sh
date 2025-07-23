#!/bin/bash
FFMPEG="/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe"
VOICE_BOOST=1.0  # adjust as needed
FINAL_BOOST=1.7  # boost final mixed audio (e.g., 1.2 = +1.6 dB approx)

CONFIG_FILE="AUDIO_TWO_VOICES_CONFIG_MULTIPLE_audio_nivelation_and_remove_audio_sections.json"
CONFIG=$(<"$CONFIG_FILE")

time_to_sec() {
  local t=$1
  IFS=: read h m s <<< "$t"
  echo "scale=3; $h*3600 + $m*60 + $s" | bc
}

generate_mute_filter() {
  local json="$1"
  local label="$2"
  local input_label="$3"

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

  echo "[$input_label]volume=enable='${expr}':volume=0[${label}_muted]"
}

num_files=$(echo "$CONFIG" | jq 'length')

for (( idx=0; idx<num_files; idx++ )); do
  fileToProcess=$(echo "$CONFIG" | jq -r ".[$idx].fileToProcess")
  outputFile=$(echo "$CONFIG" | jq -r ".[$idx].outputFile")

  mute_voice1_ranges=$(echo "$CONFIG" | jq -c ".[$idx].MUTE_VOICE1_RANGES // empty")
  mute_voice2_ranges=$(echo "$CONFIG" | jq -c ".[$idx].MUTE_VOICE2_RANGES // empty")
  mute_game_ranges=$(echo "$CONFIG" | jq -c ".[$idx].MUTE_GAME_RANGES // empty")

  if [[ "$fileToProcess" == "null" || "$outputFile" == "null" ]]; then
    echo "Skipping entry $idx due to missing fileToProcess or outputFile"
    continue
  fi

  echo ""
  echo ""
  echo ""
  echo ""
  echo "Processing file $fileToProcess -> $outputFile"

  voice1_mute_filter=$(generate_mute_filter "$mute_voice1_ranges" "voice1" "voice1_boosted")
  voice2_mute_filter=$(generate_mute_filter "$mute_voice2_ranges" "voice2" "voice2_boosted")
  game_mute_filter=$(generate_mute_filter "$mute_game_ranges" "game" "game_ducked")

  # Boost voices for sidechain mixing
  # Duck game audio using boosted voices mix
  # Boost voices again for output + muting

  filter_complex="
    [0:a:1]volume=$VOICE_BOOST[voice1_boosted_for_mix];
    [0:a:2]volume=$VOICE_BOOST[voice2_boosted_for_mix];

    [voice1_boosted_for_mix][voice2_boosted_for_mix]amix=inputs=2:duration=first:dropout_transition=0[voices_mix];

    [0:a:3][voices_mix]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=500[game_ducked];

    [0:a:1]volume=$VOICE_BOOST[voice1_boosted];
    [0:a:2]volume=$VOICE_BOOST[voice2_boosted];
  "

  # Voice1 mute filter or passthrough
  if [[ "$voice1_mute_filter" == "voice1_boosted" ]]; then
    filter_complex+="[voice1_boosted]anull[voice1_muted];"
  else
    filter_complex+="${voice1_mute_filter};"
  fi

  # Voice2 mute filter or passthrough
  if [[ "$voice2_mute_filter" == "voice2_boosted" ]]; then
    filter_complex+="[voice2_boosted]anull[voice2_muted];"
  else
    filter_complex+="${voice2_mute_filter};"
  fi

  # Game mute filter or passthrough
  if [[ "$game_mute_filter" == "game_ducked" ]]; then
    filter_complex+="[game_ducked]anull[game_muted];"
  else
    filter_complex+="${game_mute_filter};"
  fi

  # Final mix of muted streams: voice1 + voice2 + game, then Add final mix and volume boost
  filter_complex+="
    [voice1_muted][voice2_muted][game_muted]amix=inputs=3:duration=first:dropout_transition=0[a1mix];
    [a1mix]volume=volume=$FINAL_BOOST[a1boosted]
  "

read -r -d '' COMMAND << 'EOF'
  "$FFMPEG" -i "$fileToProcess" \
    -filter_complex "$filter_complex" \
    -map 0:v \
    -map "[a1boosted]" \
    -map 0:a:1 \
    -map 0:a:2 \
    -map 0:a:3 \
    -c:v copy \
    -c:a:0 aac -b:a:0 192k -ar:a:0 48000 \
    -c:a:1 copy \
    -c:a:2 copy \
    -c:a:3 copy \
    "$outputFile"
EOF

  # Log the resolved command (variables expanded)
  echo "Resolved command:"
  eval "echo \"$COMMAND\"" | sed 's/\\//g' | tr '\n' ' ' | awk '{$1=$1; print}'

  echo ""
  echo ""
  echo ""
  echo ""

  # Run the actual command
  echo "Running command..."
  echo ""
  eval "$COMMAND"

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