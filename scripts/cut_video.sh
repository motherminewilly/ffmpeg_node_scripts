#!/bin/bash

# === INPUT FILE ===
INPUT="/d/obs/star_wars_jedi_survivor_2025-05-22 22-52-35.mkv"
OUTPUT="/d/obs/FOR_TESTING.mkv"

# FFmpeg path (adjust if needed)
FFMPEG="/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe"

START_TIME="00:05:00"  # Start extracting at 5 minutes (change as needed)
DURATION="00:01:00"    # 1 minute duration

"$FFMPEG" -ss $START_TIME -i "$INPUT" -t $DURATION -map 0 -c copy "$OUTPUT"
