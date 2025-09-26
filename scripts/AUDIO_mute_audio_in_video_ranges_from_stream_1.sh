#!/bin/bash

JSON_FILE="AUDIO_mute_audio_in_video_ranges_from_stream_1_CONFIG.json"

# Extract file paths from JSON
INPUT_FILE=$(jq -r '.fileOptions.pathFileInput' "$JSON_FILE")
OUTPUT_FILE=$(jq -r '.fileOptions.pathFileOutput' "$JSON_FILE")
CONFIG_SAVE_DIR=$(jq -r '.fileOptions.pathToSaveConfig' "$JSON_FILE")

# Detect output file extension (lowercase)
EXT="${OUTPUT_FILE##*.}"
EXT="${EXT,,}"

# Select audio codec based on output extension
case "$EXT" in
  mp4|mov|m4a)
    AUDIO_CODEC="aac"
    ;;
  webm)
    AUDIO_CODEC="libopus"
    ;;
  mkv)
    AUDIO_CODEC="aac"  # or libopus/vorbis depending on preference
    ;;
  *)
    AUDIO_CODEC="aac"  # default codec
    ;;
esac

# Build mute filter from timestamps
FILTER=""
mapfile -t TIME_RANGES < <(jq -r '.timestamps[] | "\(.from)\t\(.to)"' "$JSON_FILE")

for (( i=0; i<${#TIME_RANGES[@]}; i++ )); do
    IFS=$'\t' read -r FROM TO <<< "${TIME_RANGES[$i]}"
    FROM_SEC=$(echo "$FROM" | awk -F: '{ printf "%.3f", ($1 * 3600 + $2 * 60 + $3) }')
    TO_SEC=$(echo "$TO" | awk -F: '{ printf "%.3f", ($1 * 3600 + $2 * 60 + $3) }')

    [[ $i -gt 0 ]] && FILTER+="+"
    FILTER+="between(t,$FROM_SEC,$TO_SEC)"
done

# Print the full ffmpeg command as a single line string
FFMPEG_CMD="ffmpeg -i \"$INPUT_FILE\" -filter_complex \"[0:a:0]volume=enable='${FILTER}':volume=0[a0muted]\" -map 0:v -map \"[a0muted]\" -map 0:a:1? -c:v copy -c:a $AUDIO_CODEC \"$OUTPUT_FILE\""
echo "Executing FFmpeg command:"
echo "$FFMPEG_CMD"

# Run the command
eval "$FFMPEG_CMD"

# Copy and modify config.json with history info if pathToSaveConfig is set
if [ -n "$CONFIG_SAVE_DIR" ]; then
    mkdir -p "$CONFIG_SAVE_DIR"

    # Extract base name of input video without extension
    VIDEO_BASENAME=$(basename "$INPUT_FILE")
    VIDEO_NAME_NO_EXT="${VIDEO_BASENAME%.*}"
    CONFIG_FILENAME="${VIDEO_NAME_NO_EXT}--CONFIG.json"
    CONFIG_FULLPATH="${CONFIG_SAVE_DIR%/}/$CONFIG_FILENAME"

    # Get current date/time ISO string
    EXEC_DATE=$(date --iso-8601=seconds)
    ORIGINAL_CONFIG_FILENAME=$(basename "$JSON_FILE")

    # Try to get git commit id if in a git repo
    if command -v git &> /dev/null && git rev-parse --is-inside-work-tree &> /dev/null; then
        COMMIT_ID=$(git rev-parse HEAD 2>/dev/null)
    else
        COMMIT_ID=""
    fi

    # Inject history into JSON and save new config copy
    jq --arg executed_at "$EXEC_DATE" \
       --arg commit_id "$COMMIT_ID" \
       --arg original_config "$ORIGINAL_CONFIG_FILENAME" \
       '
       . + {
         history: {
           executedAt: $executed_at,
           originalConfigFileName: $original_config
         }
       } 
       | if $commit_id != "" then .history.commitId = $commit_id else . end
       ' "$JSON_FILE" > "$CONFIG_FULLPATH"

    echo "Config copied and saved to: $CONFIG_FULLPATH"
fi