#!/bin/bash

# Exit on any error
set -e

# Step 1: Remux files to normalize audio/video stream structure
echo "Remuxing input files..."

/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe -i star_wars_jedi_survivor_CONCATENATE_2025-05-11_01-06-17.mkv -map 0 -c copy -fflags +genpts fixed_01.mkv
/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe -i star_wars_jedi_survivor_CONCATENATE_2025-05-11_01-16-08.mkv -map 0 -c copy -fflags +genpts fixed_02.mkv
/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe -i star_wars_jedi_survivor_CONCATENATE_2025-05-14_23-32-12.mkv -map 0 -c copy -fflags +genpts fixed_03.mkv

# Step 2: Create concat list file
echo "Creating concat_list.txt..."

cat > concat_list.txt << EOF
file 'fixed_01.mkv'
file 'fixed_02.mkv'
file 'fixed_03.mkv'
EOF

# Step 3: Concatenate the normalized files with all audio tracks
echo "Concatenating files..."

/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe -f concat -safe 0 -i concat_list.txt -map 0 -c copy star_wars_jedi_survivor_2025-05-11_01-06-17_FINAL_CONCATENATED.mkv

echo "Done! Output: star_wars_jedi_survivor_2025-05-11_01-06-17_FINAL_CONCATENATED.mkv"