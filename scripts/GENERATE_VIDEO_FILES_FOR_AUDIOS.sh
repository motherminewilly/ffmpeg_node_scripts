#!/bin/bash

FFMPEG="/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe"
FFPROBE="/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffprobe.exe"
input="/d/obs/testing/FOR_TESTING_ON_VOICE.mkv"

input="$1"

if [ -z "$input" ]; then
  echo ''
  echo "-------> Need to receive an input file! for \"$0\" <-------"
  echo ''
  exit 1
fi

# Full path without extension:
input_no_ext="${input%.*}"

# Get input duration (seconds, decimal)
duration=$("$FFPROBE" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$input")

# Count audio streams in the input
audio_stream_count=$("$FFPROBE" -v error -select_streams a \
  -show_entries stream=index -of csv=p=0 "$input" | wc -l)

echo ''
echo ''
echo -e "Audio streams found: $audio_stream_count"
echo ''
echo ''

# Function to create video with black background + audio stream $2, output filename $3
create_video() {
  local stream_index=$1
  local output_file=$2

  echo ''
  echo ''
  echo "Creating video for audio stream $stream_index -> $output_file "
  echo ''
  echo ''
    
  "$FFMPEG" -y -i "$input" \
    -f lavfi -t "$duration" -i color=c=black:s=1280x720:r=30 \
    -map 1:v -map 0:a:$stream_index \
    -c:v libx264 -preset veryfast -crf 23 \
    -c:a aac -b:a 192k \
    -shortest "$output_file"
}

if [ "$audio_stream_count" -eq 4 ]; then
  echo ''
  echo ''
  echo "4 audio streams detected, creating videos..."

  jobs=(
    "0 \"$input_no_ext--AUDIO-MIXED.mp4\""
    "1 \"$input_no_ext--AUDIO-VOICE1.mp4\""
    "2 \"$input_no_ext--AUDIO-VOICE2.mp4\""
    "3 \"$input_no_ext--AUDIO-GAME.mp4\""
  )

  MAX_PARALLEL=4
  running_jobs=0

  for job in "${jobs[@]}"; do
    eval create_video $job &
    ((running_jobs++))

    if (( running_jobs >= MAX_PARALLEL )); then
      wait -n
      ((running_jobs--))
    fi
  done
  wait

elif [ "$audio_stream_count" -eq 3 ]; then
  echo ''
  echo ''
  echo "3 audio streams detected, creating videos..."
  echo ''
  echo ''

  jobs=(
    "0 \"$input_no_ext--AUDIO-MIXED.mp4\""
    "1 \"$input_no_ext--AUDIO-VOICE1.mp4\""
    "2 \"$input_no_ext--AUDIO-GAME.mp4\""
  )

  MAX_PARALLEL=4
  running_jobs=0

  for job in "${jobs[@]}"; do
    eval create_video $job &
    ((running_jobs++))

    if (( running_jobs >= MAX_PARALLEL )); then
      wait -n
      ((running_jobs--))
    fi
  done
  wait

else
  echo "Unexpected number of audio streams: $audio_stream_count"
  echo "No extraction performed."
fi
